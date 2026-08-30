// Device-local "recently selected" list for the palette. Every storage access is
// wrapped in try/catch: private mode, disabled storage, or quota must degrade to
// "no recents", never throw (BR-9 / SECURITY-15 / NFR-4).

export const RECENTS_KEY = 'raqam.cmdk.recents';
const CAP = 8;

export function getRecents() {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

// Prepend id (dedup), cap the list, persist. Returns the new list even when the
// write fails, so the in-memory UI can still reflect the selection this session.
export function pushRecent(id) {
  if (!id || typeof id !== 'string') return getRecents();
  const next = [id, ...getRecents().filter(x => x !== id)].slice(0, CAP);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — keep the session list, drop persistence */
  }
  return next;
}
