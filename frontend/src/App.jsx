import { useCallback, useRef, useState } from 'react';
import CameraView from './components/CameraView.jsx';
import Sidebar from './components/Sidebar.jsx';
import { useAgentState } from './hooks/useAgentState.js';
import { useCamera } from './hooks/useCamera.js';
import { useFrameCapture } from './hooks/useFrameCapture.js';
import { useProfile } from './hooks/useProfile.js';
import { getApi, resetDemo } from './api.js';
import { getInitialMode, persistMode } from './mode.js';

let nextId = 0;
const makeId = () => `m${Date.now()}-${nextId++}`;

export default function App() {
  const [mode, setMode] = useState(getInitialMode);
  const api = getApi(mode);
  const modeGenerationRef = useRef(0); // replies that arrive after a mode switch are dropped

  const camera = useCamera();
  const isLive = camera.status === 'live';
  const agent = useAgentState(api, isLive);
  const { capturedCount, sentCount, lastFrame } = useFrameCapture(camera.videoRef, isLive, api.sendFrame, agent.refresh);
  const { profile, save: saveProfile } = useProfile(api, !agent.isUnreachable);

  // Demo mode only: "Simulate hazard" starts the camera first, like the Start camera button.
  // start() handles denial/errors itself, so the simulation runs either way.
  const { simulate } = agent;
  const { status: cameraStatus, start: startCamera } = camera;
  const simulateWithCamera = useCallback(
    async (type) => {
      if (cameraStatus !== 'live') await startCamera();
      await simulate(type);
    },
    [cameraStatus, startCamera, simulate]
  );
  const sidebarAgent = simulate ? { ...agent, simulate: simulateWithCamera } : agent;

  const [messages, setMessages] = useState([]);
  const [pendingReplies, setPendingReplies] = useState(0);

  // Switching mode starts from a clean slate: fresh mock, empty timeline and chat.
  // The camera keeps running; useAgentState resets itself when `api` changes.
  const handleModeChange = useCallback(
    (next) => {
      if (next === mode) return;
      persistMode(next);
      resetDemo();
      modeGenerationRef.current += 1;
      setMessages([]);
      setPendingReplies(0);
      setMode(next);
    },
    [mode]
  );

  // Add the user's message, then ask the backend for a reply.
  const handleSend = useCallback(
    async (text, audioBlob = null) => {
      const trimmed = (text || '').trim();
      if (!trimmed && !audioBlob) return;

      const generation = modeGenerationRef.current;
      const isCurrent = () => generation === modeGenerationRef.current;
      setMessages((prev) => [...prev, { id: makeId(), role: 'user', text: trimmed, audioBlob }]);
      setPendingReplies((n) => n + 1);
      try {
        const reply = await api.askQuestion(trimmed, audioBlob);
        if (isCurrent()) setMessages((prev) => [...prev, { id: makeId(), role: 'assistant', text: reply.text }]);
      } catch (err) {
        console.error('[app] askQuestion failed', err);
        if (isCurrent()) {
          setMessages((prev) => [
            ...prev,
            { id: makeId(), role: 'assistant', text: 'Sorry, something went wrong. Please try again.', isError: true },
          ]);
        }
      } finally {
        if (isCurrent()) setPendingReplies((n) => n - 1);
      }
    },
    [api]
  );

  return (
    <div className="app">
      <CameraView
        camera={camera}
        capturedCount={capturedCount}
        sentCount={sentCount}
        lastFrame={lastFrame}
        detection={agent.detection}
      />
      <Sidebar
        mode={mode}
        onModeChange={handleModeChange}
        agent={sidebarAgent}
        profile={profile}
        onSaveProfile={saveProfile}
        messages={messages}
        isThinking={pendingReplies > 0}
        onSend={handleSend}
      />
    </div>
  );
}
