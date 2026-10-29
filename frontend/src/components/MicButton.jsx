import { MicIcon, StopIcon } from './Icons.jsx';

// Push-to-talk: click to start, click again to stop.
export default function MicButton({ status, onToggle, disabled }) {
  const isRecording = status === 'recording';
  const isBusy = status === 'starting' || status === 'processing';

  const label = isRecording ? 'Stop recording' : isBusy ? 'Please wait' : 'Start voice question';

  return (
    <button
      type="button"
      className={`mic-button ${isRecording ? 'is-recording' : ''} ${isBusy ? 'is-busy' : ''}`}
      onClick={onToggle}
      disabled={disabled || isBusy}
      aria-pressed={isRecording}
      aria-label={label}
      title={label}
    >
      {isRecording ? <StopIcon width={26} height={26} /> : <MicIcon width={28} height={28} />}
    </button>
  );
}
