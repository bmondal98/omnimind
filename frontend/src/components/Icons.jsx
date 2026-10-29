// Small inline icon set (stroke icons, inherit currentColor).
const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const MicIcon = (props) => (
  <svg {...base} {...props}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);

export const StopIcon = (props) => (
  <svg {...base} {...props}>
    <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" stroke="none" />
  </svg>
);

export const SendIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

export const CameraIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M4 8a2 2 0 0 1 2-2h1.5l1.6-2h5.8l1.6 2H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    <circle cx="12" cy="12.5" r="3.5" />
  </svg>
);

export const CameraOffIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M3 3l18 18M9.1 4h5.8l1.6 2H18a2 2 0 0 1 2 2v8.5M17 19H6a2 2 0 0 1-2-2V8a2 2 0 0 1 1.5-1.94" />
    <path d="M9.9 10.1a3.5 3.5 0 0 0 4.9 4.9" />
  </svg>
);

export const AlertIcon = (props) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5M12 16.2v.3" />
  </svg>
);
