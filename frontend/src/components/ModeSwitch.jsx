import { HAS_BACKEND } from '../mode.js';

const OPTIONS = [
  { id: 'demo', label: 'Demo', hint: 'In-browser demo backend' },
  { id: 'live', label: 'Live', hint: 'Real OmniMind backend' },
];

// Demo | Live segmented toggle. Live is unavailable when no backend URL was built in.
export default function ModeSwitch({ mode, onChange }) {
  return (
    <div className="mode-switch" role="radiogroup" aria-label="Backend mode">
      {OPTIONS.map(({ id, label, hint }) => {
        const unavailable = id === 'live' && !HAS_BACKEND;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={mode === id}
            // aria-disabled (not disabled) so the tooltip still shows on hover.
            aria-disabled={unavailable || undefined}
            title={unavailable ? 'Backend not configured' : hint}
            className={`mode-switch__option ${mode === id ? 'is-active' : ''}`}
            onClick={() => !unavailable && onChange(id)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
