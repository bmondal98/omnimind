// Central tuning knobs for the frontend.

// Backend connection (see docs/API.md). The mock runs unless VITE_USE_MOCK=false.
export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

// Request timeouts, so a hung backend can't stall frame sending or polling.
export const REQUEST_TIMEOUT_MS = 30000;
export const STATE_REQUEST_TIMEOUT_MS = 5000;

// How often a frame is captured from the live camera.
export const FRAME_INTERVAL_MS = 2000;

// Captured frames are downscaled to at most this width (aspect ratio kept).
export const FRAME_MAX_WIDTH = 960;

// JPEG quality for captured frames (0–1).
export const FRAME_JPEG_QUALITY = 0.7;

// A frame is sent when it differs from the last sent frame by more than the threshold:
// mean absolute difference (0–255) between downscaled grayscale versions.
export const SCENE_DIFF_WIDTH = 32;
export const SCENE_DIFF_HEIGHT = 24;
export const SCENE_CHANGE_THRESHOLD = 5;

// A frame is sent at least this often, even if nothing changed.
export const FRAME_HEARTBEAT_MS = 10000;

// How often GET /state is polled while the camera is live or an escalation is active.
export const STATE_POLL_INTERVAL_MS = 1000;

// Mock backend only: escalation pacing. Short by default so a demo stays watchable.
export const ESCALATION_TIMINGS = {
  detectionGraceMs: 4000, // hazard detected -> first step starts
  stepGapMs: 8000, // one step finished -> next step starts
  alertDurationMs: 2000, // sending the SMS and push alert
  callDurationMs: 5000, // a call ringing and connecting
  dispatchDurationMs: 4000, // the emergency dispatch call
  resolvedHoldMs: 30000, // "Resolved" stays up this long before returning to monitoring
};

// Mock backend only: simulated latency.
export const MOCK_REPLY_DELAY_MS = 700;
export const MOCK_REQUEST_DELAY_MS = 120;

// Home profile ("Active Memory").
export const PROFILE_STORAGE_KEY = 'omnimind.profile';
export const DEMO_PROFILE = {
  owner_name: 'Ahmad',
  owner_phone: '+1 555 0100',
  address: '12 Maple Street, Springfield',
  gate_code: '4821',
  contacts: [
    { name: 'Sarah', relation: 'neighbor', phone: '+1 555 0142' },
    { name: 'Omar', relation: 'brother', phone: '+1 555 0177' },
  ],
};
