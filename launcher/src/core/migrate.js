// One-time import of progress saved by the old standalone apps (the uhr-lesen/ and
// einmaleins/ folders next to the launcher). They ran on the same site, so their
// localStorage entries are visible here. Each entry is copied into the app's launcher
// store as "data" unless the child already has launcher progress there, and the old
// entry is then moved under lernwelt._launcher.legacy.* as a backup, so that resetting
// an app in the parent area does not bring the old progress back.

import { ROOT, createStore } from './storage.js';

// Sound and speech are launcher-wide switches now, so those settings are dropped.
function withoutKeys(data, keys) {
  const settings = { ...(data.settings || {}) };
  for (const k of keys) delete settings[k];
  return { ...data, settings };
}

export const LEGACY_APPS = Object.freeze([
  { key: 'uhr-lesen-v1', appId: 'uhr-lesen', convert: (d) => withoutKeys(d, ['speech', 'sound']) },
  { key: 'einmaleins.v1', appId: 'einmaleins', convert: (d) => withoutKeys(d, ['sound', 'voice']) },
]);

/** Returns the ids of the apps whose old progress was imported. */
export function migrateLegacy(backend, profileId) {
  const imported = [];
  for (const { key, appId, convert } of LEGACY_APPS) {
    let raw;
    try {
      raw = backend.getItem(key);
    } catch {
      continue;
    }
    if (raw == null) continue;
    const store = createStore(backend, `${appId}.${profileId}`);
    if (store.get('data') == null) {
      try {
        const data = JSON.parse(raw);
        if (data && typeof data === 'object' && store.set('data', convert(data))) imported.push(appId);
      } catch {
        /* unreadable: keep only the backup */
      }
    }
    try {
      backend.setItem(`${ROOT}._launcher.legacy.${key}`, raw);
      backend.removeItem(key);
    } catch {
      /* storage full or blocked: try again next start */
    }
  }
  return imported;
}
