// Runtime choice between the in-browser mock ("demo") and the real backend ("live").
// Priority: ?mode= URL param, then the last choice in localStorage, then VITE_USE_MOCK.
import { HAS_BACKEND } from './config.js';

export const MODES = ['demo', 'live'];
const STORAGE_KEY = 'omnimind.mode';

const isMode = (value) => MODES.includes(value);
const allowed = (mode) => (mode === 'live' && !HAS_BACKEND ? 'demo' : mode);

// VITE_USE_MOCK=false makes Live the default; anything else (or unset) means Demo.
const DEFAULT_MODE = allowed(import.meta.env.VITE_USE_MOCK === 'false' ? 'live' : 'demo');

function readUrlMode() {
  try {
    const value = new URLSearchParams(window.location.search).get('mode');
    return isMode(value) ? value : null;
  } catch {
    return null;
  }
}

function readStoredMode() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isMode(value) ? value : null;
  } catch {
    return null;
  }
}

export function getInitialMode() {
  return allowed(readUrlMode() ?? readStoredMode() ?? DEFAULT_MODE);
}

// Remember the choice, and keep an existing ?mode= param in step so a reload agrees.
export function persistMode(mode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Storage blocked (private mode etc.): the choice just won't survive a reload.
  }
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('mode')) {
      url.searchParams.set('mode', mode);
      window.history.replaceState(null, '', url);
    }
  } catch {
    // Ignore: the URL is only a convenience.
  }
}

export { HAS_BACKEND };
