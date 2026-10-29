import { useCallback, useState } from 'react';
import CameraView from './components/CameraView.jsx';
import ChatSidebar from './components/ChatSidebar.jsx';
import { useCamera } from './hooks/useCamera.js';
import { useFrameCapture } from './hooks/useFrameCapture.js';
import { askQuestion } from './api.js';

let nextId = 0;
const makeId = () => `m${Date.now()}-${nextId++}`;

export default function App() {
  const camera = useCamera();
  const { frameCount, lastFrame } = useFrameCapture(camera.videoRef, camera.status === 'live');

  const [messages, setMessages] = useState([]);
  const [pendingReplies, setPendingReplies] = useState(0);

  // Add the user's message, then ask the (stubbed) backend for a reply.
  const handleSend = useCallback(async (text, audioBlob = null) => {
    const trimmed = (text || '').trim();
    if (!trimmed && !audioBlob) return;

    setMessages((prev) => [...prev, { id: makeId(), role: 'user', text: trimmed, audioBlob }]);
    setPendingReplies((n) => n + 1);
    try {
      const reply = await askQuestion(trimmed, audioBlob);
      setMessages((prev) => [...prev, { id: makeId(), role: 'assistant', text: reply.text }]);
    } catch (err) {
      console.error('[app] askQuestion failed', err);
      setMessages((prev) => [
        ...prev,
        { id: makeId(), role: 'assistant', text: 'Sorry, something went wrong. Please try again.', isError: true },
      ]);
    } finally {
      setPendingReplies((n) => n - 1);
    }
  }, []);

  return (
    <div className="app">
      <CameraView camera={camera} frameCount={frameCount} lastFrame={lastFrame} />
      <ChatSidebar messages={messages} isThinking={pendingReplies > 0} onSend={handleSend} />
    </div>
  );
}
