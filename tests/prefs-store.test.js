import { describe, it, expect } from 'vitest';
import { userPrefsKey, loadUserPrefs, writeUserPrefs, readJson, writeJson, mergePrefsForWrite } from '../src/lib/prefsStore.js';

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
    expect(loadUserPrefs('u1', s)).toEqual({ skippedSetup: false, plans: {}, planViewId: 'available' });
    s.map.set('raqam.prefs.u.u2', 'not json');
    expect(loadUserPrefs('u2', s)).toEqual({ skippedSetup: false, plans: {} });
  });

  it('loadUserPrefs migrates pre-plans flat view keys into the default namespace', () => {
    const s = makeStorage();
    s.setItem('raqam.prefs.u.u1', '{"planViews":[{"id":"v1"}],"builtinViews":[{"id":"overspent","hidden":true}]}');
    expect(loadUserPrefs('u1', s)).toEqual({
      skippedSetup: false,
      plans: { default: { customViews: [{ id: 'v1' }], builtinViews: [{ id: 'overspent', hidden: true }] } },
    });
  });

  it('loadUserPrefs returns defaults (no throw) when getItem itself throws', () => {
    const s = makeThrowingReadStorage();
    expect(loadUserPrefs('u1', s)).toEqual({ skippedSetup: false, plans: {} });
  });

  it('loadUserPrefs returns defaults when the key was never set', () => {
    const s = makeStorage();
    expect(loadUserPrefs('nobody-yet', s)).toEqual({ skippedSetup: false, plans: {} });
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
    expect(loadUserPrefs('u1', s)).toEqual({ skippedSetup: false, plans: {} });
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

// Two tabs on different plans share one prefs blob. A tab writes from its own
// in-memory snapshot, so the keys it does not own must come from storage or
// it silently erases what the other tab saved.
describe('mergePrefsForWrite', () => {
  const stored = {
    skippedSetup: false, openPlanId: 'pB', pendingSeed: 'pC',
    plans: { pA: { customViews: ['old-a'] }, pB: { customViews: ['b-saved-in-other-tab'] } },
  };
  const mine = {
    skippedSetup: true, colWidths: { payee: 2 }, openPlanId: 'pA',
    plans: { pA: { customViews: ['new-a'] }, pB: { customViews: [] } },
  };

  it('keeps this tab\'s own plan namespace and user keys', () => {
    const out = mergePrefsForWrite(stored, mine, 'pA');
    expect(out.plans.pA).toEqual({ customViews: ['new-a'] });
    expect(out.skippedSetup).toBe(true);
    expect(out.colWidths).toEqual({ payee: 2 });
  });

  it('takes other plans\' namespaces and the device-wide openPlanId from storage', () => {
    const out = mergePrefsForWrite(stored, mine, 'pA');
    expect(out.plans.pB).toEqual({ customViews: ['b-saved-in-other-tab'] });
    expect(out.openPlanId).toBe('pB');
  });

  it('drops a stale in-memory openPlanId when storage has none', () => {
    const out = mergePrefsForWrite({ plans: {} }, mine, 'pA');
    expect('openPlanId' in out).toBe(false);
  });

  // NewPlanModal queues the one-shot seed through setPrefs right before it
  // switches — that write is this tab's own and must reach storage.
  it('lets this tab write pendingSeed', () => {
    const out = mergePrefsForWrite(stored, { ...mine, pendingSeed: 'pNew' }, 'pA');
    expect(out.pendingSeed).toBe('pNew');
  });

  it('leaves the stored namespace alone when this tab has none for its plan, and mutates nothing', () => {
    const a = JSON.stringify(stored), b = JSON.stringify(mine);
    const out = mergePrefsForWrite(stored, { skippedSetup: false }, 'pA');
    expect(out.plans).toEqual(stored.plans);
    expect(JSON.stringify(stored)).toBe(a);
    expect(JSON.stringify(mine)).toBe(b);
  });
});
