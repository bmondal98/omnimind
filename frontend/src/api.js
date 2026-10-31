// Backend integration points. The contract is specified in docs/API.md.
// The rest of the app imports only from this file, real or mock alike.
import { API_URL, REQUEST_TIMEOUT_MS, STATE_REQUEST_TIMEOUT_MS, USE_MOCK } from './config.js';
import * as mock from './mockApi.js';

async function request(path, { timeoutMs = REQUEST_TIMEOUT_MS, ...init } = {}) {
  const res = await fetch(`${API_URL}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} failed with ${res.status}`);
  return res.json();
}

const audioFilename = (blob) => `question.${(blob.type.split('/')[1] || 'webm').split(';')[0]}`;

const real = {
  /**
   * Send one camera frame for hazard analysis.
   * @param {Blob} blob        JPEG image
   * @param {string} timestamp ISO-8601 capture time
   * @returns {Promise<object>} detection
   */
  sendFrame(blob, timestamp) {
    const body = new FormData();
    body.append('image', blob, 'frame.jpg');
    body.append('timestamp', timestamp);
    return request('/frame', { method: 'POST', body });
  },

  /** @returns {Promise<object>} the agent state */
  getState() {
    return request('/state', { timeoutMs: STATE_REQUEST_TIMEOUT_MS });
  },

  /**
   * The owner confirmed they are safe: stop any active escalation.
   * @returns {Promise<object>} the agent state after stopping
   */
  ack() {
    return request('/ack', { method: 'POST' });
  },

  /**
   * Ask the agent a question.
   * @param {string} text         transcript or typed text (may be empty for voice-only)
   * @param {Blob|null} audioBlob raw recording, if the question was spoken
   * @returns {Promise<{ text: string }>} the agent's answer
   */
  askQuestion(text, audioBlob = null) {
    const body = new FormData();
    body.append('text', text);
    if (audioBlob) body.append('audio', audioBlob, audioFilename(audioBlob));
    return request('/ask', { method: 'POST', body });
  },

  /**
   * Store the home profile.
   * @param {object} profile
   * @returns {Promise<{ ok: boolean }>}
   */
  saveProfile(profile) {
    return request('/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
  },
};

const impl = USE_MOCK ? mock : real;

export const { sendFrame, getState, ack, askQuestion, saveProfile } = impl;

// Demo capability: start a simulated hazard. Null when the backend has no such thing.
export const simulateHazard = USE_MOCK ? mock.simulateHazard : null;
