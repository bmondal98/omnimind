import { useCallback, useEffect, useState } from 'react';
import { DEMO_PROFILE, PROFILE_STORAGE_KEY } from '../config.js';
import { saveProfile } from '../api.js';

function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY));
    if (!saved) return DEMO_PROFILE;
    return { ...DEMO_PROFILE, ...saved, contacts: Array.isArray(saved.contacts) ? saved.contacts : DEMO_PROFILE.contacts };
  } catch (err) {
    console.warn('[profile] could not read saved profile', err);
    return DEMO_PROFILE;
  }
}

/**
 * The home profile ("Active Memory"), kept in localStorage and sent to the backend.
 * `save` rejects if the backend couldn't be reached; the local copy is kept regardless.
 */
export function useProfile() {
  const [profile, setProfile] = useState(loadProfile);

  // The backend may have restarted since the last visit, so sync once on load.
  useEffect(() => {
    saveProfile(profile).catch((err) => console.error('[profile] initial sync failed', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async (next) => {
    setProfile(next);
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
    } catch (err) {
      console.warn('[profile] could not store profile', err);
    }
    await saveProfile(next);
  }, []);

  return { profile, save };
}
