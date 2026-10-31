import { useEffect, useRef, useState } from 'react';
import { HAZARD_LABELS } from '../hazards.js';

// "Simulate hazard" menu. Only rendered when the backend offers simulation.
export default function DemoControls({ onSimulate, disabled }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setIsOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  const handlePick = (type) => {
    setIsOpen(false);
    onSimulate(type);
  };

  return (
    <div className="demo" ref={rootRef}>
      <button
        type="button"
        className="demo__toggle"
        onClick={() => setIsOpen((open) => !open)}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        Simulate hazard
      </button>
      {isOpen && (
        <ul className="demo__menu" role="menu">
          {Object.entries(HAZARD_LABELS).map(([type, label]) => (
            <li key={type} role="none">
              <button type="button" role="menuitem" onClick={() => handlePick(type)}>
                {label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
