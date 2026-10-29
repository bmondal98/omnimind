import { useEffect, useRef, useState } from 'react';
import { MicIcon } from './Icons.jsx';

// Plays back a recorded question; owns (and revokes) its object URL.
function VoiceClip({ blob }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  return url ? <audio className="voice-clip" src={url} controls preload="metadata" /> : null;
}

function Message({ message }) {
  const isUser = message.role === 'user';
  return (
    <li className={`message message--${message.role} ${message.isError ? 'message--error' : ''}`}>
      <div className="message__bubble">
        {message.text ? (
          <p>{message.text}</p>
        ) : (
          <p className="message__voice-label">
            <MicIcon width={16} height={16} /> Voice question
          </p>
        )}
        {isUser && message.audioBlob && <VoiceClip blob={message.audioBlob} />}
      </div>
    </li>
  );
}

/**
 * liveTranscript: string while the user is speaking, otherwise null.
 */
export default function MessageList({ messages, isThinking, liveTranscript }) {
  const scrollRef = useRef(null);

  // Keep the newest content in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, isThinking, liveTranscript]);

  const isEmpty = messages.length === 0 && liveTranscript === null && !isThinking;

  return (
    <div className="message-list" ref={scrollRef}>
      {isEmpty ? (
        <div className="empty-state">
          <p className="empty-state__title">Ask about anything you've seen</p>
          <p className="empty-state__hint">
            Try asking <span>“Where did I leave my keys?”</span>
          </p>
        </div>
      ) : (
        <ul className="messages" aria-live="polite">
          {messages.map((m) => (
            <Message key={m.id} message={m} />
          ))}

          {liveTranscript !== null && (
            <li className="message message--user message--live">
              <div className="message__bubble">
                <p>{liveTranscript || 'Listening…'}</p>
              </div>
            </li>
          )}

          {isThinking && (
            <li className="message message--assistant">
              <div className="message__bubble typing" aria-label="Assistant is thinking">
                <span />
                <span />
                <span />
              </div>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
