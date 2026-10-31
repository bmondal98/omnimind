import { useCallback, useEffect, useRef, useState } from 'react';
import { STATE_POLL_INTERVAL_MS } from '../config.js';
import { ack, getState, simulateHazard } from '../api.js';

const INITIAL_STATE = { status: 'idle', server_time: null, latest_detection: null, escalation: null };

/**
 * Tracks the agent state from GET /state, polling while the camera is live or an
 * escalation is active. `refresh` fetches right away.
 */
export function useAgentState(isCameraLive) {
  const [state, setState] = useState(INITIAL_STATE);
  const [clockOffsetMs, setClockOffsetMs] = useState(0); // server clock minus local clock
  const [isUnreachable, setIsUnreachable] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [stopError, setStopError] = useState('');
  const latestRequestRef = useRef(0); // lets a newer response win over a slower older one
  const inFlightRef = useRef(0);

  const applyState = useCallback((next) => {
    setState(next);
    setIsUnreachable(false);
    const serverTime = Date.parse(next.server_time);
    if (!Number.isNaN(serverTime)) setClockOffsetMs(serverTime - Date.now());
  }, []);

  const refresh = useCallback(async () => {
    const requestId = ++latestRequestRef.current;
    inFlightRef.current += 1;
    try {
      const next = await getState();
      if (requestId === latestRequestRef.current) applyState(next);
    } catch (err) {
      console.error('[agent] getState failed', err);
      if (requestId === latestRequestRef.current) setIsUnreachable(true);
    } finally {
      inFlightRef.current -= 1;
    }
  }, [applyState]);

  const isEscalationActive = state.status === 'hazard_detected' || state.status === 'escalating';
  const shouldPoll = isCameraLive || isEscalationActive;

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!shouldPoll) return undefined;
    const intervalId = setInterval(() => {
      if (inFlightRef.current === 0) refresh();
    }, STATE_POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [shouldPoll, refresh]);

  const stop = useCallback(async () => {
    setIsStopping(true);
    setStopError('');
    const requestId = ++latestRequestRef.current;
    try {
      const next = await ack();
      if (requestId === latestRequestRef.current) applyState(next);
    } catch (err) {
      console.error('[agent] ack failed', err);
      setStopError("Couldn't reach OmniMind, so the escalation is still running. Try again.");
    } finally {
      setIsStopping(false);
    }
  }, [applyState]);

  const simulate = useCallback(
    async (hazardType) => {
      const requestId = ++latestRequestRef.current;
      const next = await simulateHazard(hazardType);
      if (requestId === latestRequestRef.current) applyState(next);
    },
    [applyState]
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
    simulate: simulateHazard ? simulate : null,
  };
}
