// Legacy localStorage layer. App data now lives in Supabase (src/store/sync.js);
// this module only reads the PRE-MIGRATION store (key raqam.v1) so it can be
// offered for import after first login, and renames it to a backup afterwards.
// Device prefs live in PrefsProvider (raqam.prefs.v1); per-user prefs in
// StoreProvider (raqam.prefs.u.<uid>).
const LEGACY_KEY = 'raqam.v1';
const LEGACY_VERSION = 1;

// Returns { kind: 'none' } | { kind: 'loaded', data } | { kind: 'corrupt' }.
export function loadLegacy() {
  let raw;
  try { raw = localStorage.getItem(LEGACY_KEY); } catch { return { kind: 'none' }; }
  if (raw == null) return { kind: 'none' };
  try {
    const p = JSON.parse(raw);
    if (p.version !== LEGACY_VERSION || !p.data || !Array.isArray(p.data.accounts)) throw new Error('bad shape');
    return { kind: 'loaded', data: p.data };
  } catch (e) {
    console.error('Raqam: unreadable legacy data', e);
    // Preserve the unreadable payload, exactly like the old corrupt path did.
    try {
      localStorage.setItem(`${LEGACY_KEY}.corrupt-${Date.now()}`, raw);
      localStorage.removeItem(LEGACY_KEY);
    } catch {}
    return { kind: 'corrupt' };
  }
}

// After a fully confirmed import: keep a timestamped backup forever, then remove
// the live legacy key so the import is never offered again. Never a plain delete.
export function markLegacyMigrated() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw == null) return;
    localStorage.setItem(`${LEGACY_KEY}.migrated-${Date.now()}`, raw);
    localStorage.removeItem(LEGACY_KEY);
  } catch (e) {
    console.error('Raqam: could not archive legacy data', e);
  }
}
