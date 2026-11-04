// Backend integration points. The contract is specified in docs/API.md.
// The rest of the app imports only from this file, real or mock alike.
import { API_URL, REQUEST_TIMEOUT_MS, STATE_REQUEST_TIMEOUT_MS } from './config.js';
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

const demoApi = {
  sendFrame: mock.sendFrame,
  getState: mock.getState,
  ack: mock.ack,
  askQuestion: mock.askQuestion,
  saveProfile: mock.saveProfile,
  // Demo capability: start a simulated hazard. Null when the backend has no such thing.
  simulateHazard: mock.simulateHazard,
};

const liveApi = { ...real, simulateHazard: null };

/**
 * The API for a mode ('demo' | 'live'). Always the same object per mode, so it is safe
 * as a hook dependency.
 */
export function getApi(mode) {
  return mode === 'live' ? liveApi : demoApi;
}

// Stop any running mock escalation and clear its history, so a mode switch starts clean.
export const resetDemo = mock.reset;
