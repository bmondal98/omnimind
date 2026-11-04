import { useCallback, useEffect, useRef, useState } from 'react';
import { BACKEND_RETRY_MS, STATE_POLL_INTERVAL_MS } from '../config.js';

const INITIAL_STATE = { status: 'idle', server_time: null, latest_detection: null, escalation: null };

/**
 * Tracks the agent state from GET /state on `api` (see getApi), polling while the camera
 * is live or an escalation is active, and retrying every BACKEND_RETRY_MS while the backend
 * is unreachable. A new `api` (mode switch) resets everything. `refresh` fetches right away.
 */
export function useAgentState(api, isCameraLive) {
  const [state, setState] = useState(INITIAL_STATE);
  const [clockOffsetMs, setClockOffsetMs] = useState(0); // server clock minus local clock
  const [isUnreachable, setIsUnreachable] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [stopError, setStopError] = useState('');
  const latestRequestRef = useRef(0); // lets a newer response win over a slower older one
  const inFlightRef = useRef(0);
  const generationRef = useRef(0); // bumped on mode switch; older calls can't touch state

  // Mode switch: drop the old state right away (no mixed mock/real timeline).
  const [prevApi, setPrevApi] = useState(api);
  if (prevApi !== api) {
    setPrevApi(api);
    setState(INITIAL_STATE);
    setClockOffsetMs(0);
    setIsUnreachable(false);
    setIsStopping(false);
    setStopError('');
  }

  // ...and make in-flight responses from the old API stale. Must run before the fetch effects.
  useEffect(() => {
    generationRef.current += 1;
    latestRequestRef.current += 1;
    inFlightRef.current = 0;
  }, [api]);

  const applyState = useCallback((next) => {
    setState(next);
    setIsUnreachable(false);
    const serverTime = Date.parse(next.server_time);
    if (!Number.isNaN(serverTime)) setClockOffsetMs(serverTime - Date.now());
  }, []);

  const refresh = useCallback(async () => {
    const requestId = ++latestRequestRef.current;
    const generation = generationRef.current;
    inFlightRef.current += 1;
    try {
      const next = await api.getState();
      if (requestId === latestRequestRef.current) applyState(next);
    } catch (err) {
      console.error('[agent] getState failed', err);
      if (requestId === latestRequestRef.current) setIsUnreachable(true);
    } finally {
      if (generation === generationRef.current) inFlightRef.current -= 1;
    }
  }, [api, applyState]);

  const isEscalationActive = state.status === 'hazard_detected' || state.status === 'escalating';
  const pollMs = isUnreachable ? BACKEND_RETRY_MS : isCameraLive || isEscalationActive ? STATE_POLL_INTERVAL_MS : null;

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!pollMs) return undefined;
    const intervalId = setInterval(() => {
      if (inFlightRef.current === 0) refresh();
    }, pollMs);
    return () => clearInterval(intervalId);
  }, [pollMs, refresh]);

  const stop = useCallback(async () => {
    setIsStopping(true);
    setStopError('');
    const requestId = ++latestRequestRef.current;
    const generation = generationRef.current;
    try {
      const next = await api.ack();
      if (requestId === latestRequestRef.current) applyState(next);
    } catch (err) {
      console.error('[agent] ack failed', err);
      if (requestId === latestRequestRef.current) {
        setStopError("Couldn't reach OmniMind, so the escalation is still running. Try again.");
      }
    } finally {
      if (generation === generationRef.current) setIsStopping(false);
    }
  }, [api, applyState]);

  const simulate = useCallback(
    async (hazardType) => {
      const requestId = ++latestRequestRef.current;
      const next = await api.simulateHazard(hazardType);
      if (requestId === latestRequestRef.current) applyState(next);
    },
    [api, applyState]
  );

  // Whether the camera is on is known here first, so it decides idle versus monitoring.
  const status =
    state.status === 'idle' || state.status === 'monitoring' ? (isCameraLive ? 'monitoring' : 'idle') : state.status;

  const detection = state.latest_detection?.hazard_detected ? state.latest_detection : null;

  return {
    status,
    detection,
    escalation: state.escalation,
    isEscalationActive,
    clockOffsetMs,
    isUnreachable,
    isStopping,
    stopError,
    refresh,
    stop,
    simulate: api.simulateHazard ? simulate : null,
  };
}
