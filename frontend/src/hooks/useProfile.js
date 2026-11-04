import { useCallback, useEffect, useState } from 'react';
import { DEMO_PROFILE, PROFILE_STORAGE_KEY } from '../config.js';

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
 * The home profile ("Active Memory"), kept in localStorage and sent to the backend (`api`).
 * `save` rejects if the backend couldn't be reached; the local copy is kept regardless.
 */
export function useProfile(api, isReachable) {
  const [profile, setProfile] = useState(loadProfile);

  // Sync on load, on a mode switch, and when a sleeping backend comes back: it may have
  // restarted without the profile.
  useEffect(() => {
    if (!isReachable) return;
    api.saveProfile(profile).catch((err) => console.error('[profile] sync failed', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, isReachable]);

  const save = useCallback(
    async (next) => {
      setProfile(next);
      try {
        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
      } catch (err) {
        console.warn('[profile] could not store profile', err);
      }
      await api.saveProfile(next);
    },
    [api]
  );

  return { profile, save };
}
