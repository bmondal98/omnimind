// Backend integration points. Everything here is a stub for now:
// swap the bodies for real fetch() calls once the backend exists.
import { PLACEHOLDER_REPLY_DELAY_MS } from './config.js';

const toKB = (blob) => (blob ? Number((blob.size / 1024).toFixed(1)) : 0);

/**
 * Send one captured camera frame to the backend for memorising.
 * @param {Blob} blob       JPEG image
 * @param {string} timestamp ISO-8601 capture time
 */
export async function sendFrame(blob, timestamp) {
  // TODO: e.g. POST multipart/form-data { frame: blob, timestamp } to /api/frames
  console.log('[api] sendFrame (stub)', { timestamp, sizeKB: toKB(blob) });
}

/**
 * Ask the assistant a question about what it has seen.
 * @param {string} text            transcript or typed text (may be empty for voice-only)
 * @param {Blob|null} audioBlob    raw recording, if the question was spoken
 * @returns {Promise<{ text: string }>} the assistant's answer
 */
export async function askQuestion(text, audioBlob = null) {
  // TODO: e.g. POST { text, audio } to /api/ask and return the answer
  console.log('[api] askQuestion (stub)', { text, audioBlob, audioSizeKB: toKB(audioBlob) });
  await new Promise((resolve) => setTimeout(resolve, PLACEHOLDER_REPLY_DELAY_MS));
  return { text: 'Backend not connected yet' };
}
