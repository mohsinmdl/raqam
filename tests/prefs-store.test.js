import { describe, it, expect } from 'vitest';
import { userPrefsKey, loadUserPrefs, writeUserPrefs } from '../src/lib/prefsStore.js';

// A minimal in-memory Storage stub; `fail` makes setItem throw like a full/disabled store.
const makeStorage = (fail = false) => {
  const map = new Map();
  return {
    map,
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { if (fail) throw new DOMException('QuotaExceededError'); map.set(k, v); },
  };
};

describe('prefsStore', () => {
  it('keys prefs per user', () => {
    expect(userPrefsKey('abc')).toBe('raqam.prefs.u.abc');
  });

  it('writeUserPrefs returns true and stores JSON on success', () => {
    const s = makeStorage();
    expect(writeUserPrefs('u1', { planViewId: 'overspent' }, s)).toBe(true);
    expect(JSON.parse(s.getItem('raqam.prefs.u.u1'))).toEqual({ planViewId: 'overspent' });
  });

  it('writeUserPrefs returns false (never throws) when storage rejects the write', () => {
    const s = makeStorage(true);
    expect(writeUserPrefs('u1', { planViewId: 'all' }, s)).toBe(false);
    expect(s.getItem('raqam.prefs.u.u1')).toBe(null); // nothing persisted
  });

  it('loadUserPrefs merges stored prefs over the default and survives malformed JSON', () => {
    const s = makeStorage();
    s.setItem('raqam.prefs.u.u1', '{"planViewId":"available"}');
    expect(loadUserPrefs('u1', s)).toEqual({ skippedSetup: false, planViewId: 'available' });
    s.map.set('raqam.prefs.u.u2', 'not json');
    expect(loadUserPrefs('u2', s)).toEqual({ skippedSetup: false });
  });
});
