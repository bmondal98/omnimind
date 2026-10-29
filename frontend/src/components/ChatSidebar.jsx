import { useCallback, useState } from 'react';
import MessageList from './MessageList.jsx';
import MicButton from './MicButton.jsx';
import { SendIcon } from './Icons.jsx';
import { useVoiceInput } from '../hooks/useVoiceInput.js';

export default function ChatSidebar({ messages, isThinking, onSend }) {
  const [draft, setDraft] = useState('');

  const handleVoiceResult = useCallback(
    ({ transcript, audioBlob }) => onSend(transcript, audioBlob),
    [onSend]
  );
  const voice = useVoiceInput({ onResult: handleVoiceResult });

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!draft.trim()) return;
    onSend(draft);
    setDraft('');
  };

  const showLive = voice.status === 'recording' || voice.status === 'processing';
  // Without speech recognition, show a neutral "Recording…" bubble instead of a transcript.
  const liveTranscript = showLive ? (voice.hasLiveTranscript ? voice.transcript : 'Recording…') : null;

  const micHint =
    voice.status === 'recording'
      ? 'Listening — tap to finish'
      : voice.status === 'starting'
        ? 'Starting microphone…'
        : voice.status === 'processing'
          ? 'Processing…'
          : 'Tap to ask';

  return (
    <aside className="sidebar" aria-label="Chat">
      <div className="sheet-handle" aria-hidden="true" />
      <header className="sidebar__header">
        <h1>Ask OmniMind</h1>
        <p>Your visual memory assistant</p>
      </header>

      <MessageList messages={messages} isThinking={isThinking} liveTranscript={liveTranscript} />

      <div className="composer">
        {voice.error && (
          <p className="composer__error" role="alert">
            {voice.error}
          </p>
        )}

        <div className="composer__row">
          <div className="composer__mic">
            <MicButton status={voice.status} onToggle={voice.toggle} disabled={!voice.isSupported} />
            <span className="composer__mic-hint">
              {voice.isSupported ? micHint : 'Voice not supported'}
            </span>
          </div>

          <form className="composer__form" onSubmit={handleSubmit}>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a question…"
              aria-label="Type a question"
              enterKeyHint="send"
              autoComplete="off"
            />
            <button type="submit" className="send-button" disabled={!draft.trim()} aria-label="Send">
              <SendIcon />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
