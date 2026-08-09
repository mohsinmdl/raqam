import { describe, it, expect } from 'vitest';
import { userPrefsKey, loadUserPrefs, writeUserPrefs, readJson, writeJson } from '../src/lib/prefsStore.js';

// A minimal in-memory Storage stub; `fail` makes setItem throw like a full/disabled store.
const makeStorage = (fail = false) => {
  const map = new Map();
  return {
    map,
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { if (fail) throw new DOMException('quota exceeded', 'QuotaExceededError'); map.set(k, v); },
  };
};

// A storage stub whose getItem throws — Safari private mode throws on ACCESS,
// not just write, once storage is disabled.
const makeThrowingReadStorage = () => ({
  getItem: () => { throw new DOMException('access denied', 'SecurityError'); },
  setItem: () => { throw new DOMException('access denied', 'SecurityError'); },
});

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

  it('loadUserPrefs returns defaults (no throw) when getItem itself throws', () => {
    const s = makeThrowingReadStorage();
    expect(loadUserPrefs('u1', s)).toEqual({ skippedSetup: false });
  });

  it('loadUserPrefs returns defaults when the key was never set', () => {
    const s = makeStorage();
    expect(loadUserPrefs('nobody-yet', s)).toEqual({ skippedSetup: false });
  });

  it('writeUserPrefs returns false and persists nothing for an unserializable (circular) object', () => {
    const s = makeStorage();
    const o = {}; o.self = o;
    expect(writeUserPrefs('u1', o, s)).toBe(false);
    expect(s.getItem('raqam.prefs.u.u1')).toBe(null);
  });

  it.each(['[1,2,3]', '5', 'null'])('loadUserPrefs ignores a stored JSON array/primitive (%s) and returns exactly the defaults', raw => {
    const s = makeStorage();
    s.map.set('raqam.prefs.u.u1', raw);
    expect(loadUserPrefs('u1', s)).toEqual({ skippedSetup: false });
  });

  describe('readJson / writeJson (generalized helpers)', () => {
    it('writeJson returns true and stores JSON on success', () => {
      const s = makeStorage();
      expect(writeJson('k', { a: 1 }, s)).toBe(true);
      expect(JSON.parse(s.getItem('k'))).toEqual({ a: 1 });
    });

    it('writeJson returns false (never throws) when storage rejects the write', () => {
      const s = makeStorage(true);
      expect(writeJson('k', { a: 1 }, s)).toBe(false);
      expect(s.getItem('k')).toBe(null);
    });

    it('writeJson returns false for a circular object', () => {
      const s = makeStorage();
      const o = {}; o.self = o;
      expect(writeJson('k', o, s)).toBe(false);
      expect(s.getItem('k')).toBe(null);
    });

    it('readJson merges stored object over the fallback', () => {
      const s = makeStorage();
      s.map.set('k', '{"theme":"dark"}');
      expect(readJson('k', { theme: 'light', masked: true }, s)).toEqual({ theme: 'dark', masked: true });
    });

    it('readJson returns the fallback (no throw) when getItem throws', () => {
      const s = makeThrowingReadStorage();
      expect(readJson('k', { theme: 'light' }, s)).toEqual({ theme: 'light' });
    });

    it('readJson returns the fallback when the key was never set', () => {
      const s = makeStorage();
      expect(readJson('missing', { theme: 'light' }, s)).toEqual({ theme: 'light' });
    });

    it.each(['[1,2,3]', '5', 'null'])('readJson ignores a stored JSON array/primitive (%s) and returns exactly the fallback', raw => {
      const s = makeStorage();
      s.map.set('k', raw);
      expect(readJson('k', { theme: 'light' }, s)).toEqual({ theme: 'light' });
    });

    it('readJson survives malformed JSON', () => {
      const s = makeStorage();
      s.map.set('k', 'not json');
      expect(readJson('k', { theme: 'light' }, s)).toEqual({ theme: 'light' });
    });
  });
});
