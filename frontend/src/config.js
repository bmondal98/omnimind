// Central tuning knobs for the frontend.

// How often a frame is captured from the live camera.
export const FRAME_INTERVAL_MS = 2000;

// Captured frames are downscaled to at most this width (aspect ratio kept).
export const FRAME_MAX_WIDTH = 960;

// JPEG quality for captured frames (0–1).
export const FRAME_JPEG_QUALITY = 0.7;

// Simulated latency of the stubbed assistant reply.
export const PLACEHOLDER_REPLY_DELAY_MS = 700;
