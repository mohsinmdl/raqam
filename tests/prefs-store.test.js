import { describe, it, expect, afterEach } from 'vitest';
import { userPrefsKey, loadUserPrefs, loadStoredUserPrefs, writeUserPrefs, readJson, writeJson, mergePrefsForWrite, consumePendingSeed } from '../src/lib/prefsStore.js';

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

// Tabs share one prefs blob, so a write is a read-modify-write: STORAGE is the
// base and only what this write changes is laid over it. A tab's in-memory
// snapshot is never the base — it is stale the moment another tab writes.
describe('mergePrefsForWrite', () => {
  const freeze = o => { Object.values(o).forEach(v => v && typeof v === 'object' && freeze(v)); return Object.freeze(o); };
  const stored = freeze({
    skippedSetup: true, openPlanId: 'pB', pendingSeed: 'pC', colWidths: { payee: 3 },
    plans: { pA: { customViews: ['a1'], builtinViews: ['x'] }, pB: { customViews: ['b-saved-in-other-tab'] } },
  });

  it('lays the user-level patch over storage and keeps every key it does not name', () => {
    const out = mergePrefsForWrite(stored, freeze({ colWidths: { payee: 2 } }), 'pA');
    expect(out.colWidths).toEqual({ payee: 2 });
    expect(out.skippedSetup).toBe(true); // another tab dismissed first-use — still dismissed
    expect(out.openPlanId).toBe('pB');
    expect(out.pendingSeed).toBe('pC'); // another tab's queued seed survives this tab's write
    expect(out.plans).toEqual(stored.plans);
  });

  it('merges the plan patch into THIS plan\'s stored namespace and leaves the others alone', () => {
    const out = mergePrefsForWrite(stored, {}, 'pA', freeze({ customViews: ['a2'] }));
    expect(out.plans.pA).toEqual({ customViews: ['a2'], builtinViews: ['x'] });
    expect(out.plans.pB).toEqual({ customViews: ['b-saved-in-other-tab'] });
  });

  it('starts a namespace for a plan that has none yet', () => {
    expect(mergePrefsForWrite(stored, {}, 'pNew', { builtinViews: ['y'] }).plans.pNew).toEqual({ builtinViews: ['y'] });
  });

  // NewPlanModal queues the one-shot seed through setPrefs right before it
  // switches — that write is this tab's own and must reach storage.
  it('lets this tab set and clear pendingSeed', () => {
    expect(mergePrefsForWrite(stored, { pendingSeed: 'pNew' }, 'pA').pendingSeed).toBe('pNew');
    const cleared = mergePrefsForWrite(stored, { pendingSeed: undefined }, 'pA');
    expect(JSON.parse(JSON.stringify(cleared))).not.toHaveProperty('pendingSeed');
  });

  it('tolerates a missing or malformed stored blob', () => {
    expect(mergePrefsForWrite(null, { skippedSetup: true }, 'pA')).toEqual({ skippedSetup: true, plans: {} });
    expect(mergePrefsForWrite({ plans: 'garbage' }, {}, 'pA', { customViews: [] }).plans).toEqual({ pA: { customViews: [] } });
    expect(mergePrefsForWrite({ plans: ['x'] }, {}, 'pA').plans).toEqual({});
  });
});

// The hydrate-time consume of NewPlanModal's one-shot seed flag. Only the plan
// it NAMES may consume it: with a tab per plan, some other plan's tab hydrating
// in between must neither seed itself nor eat the flag.
describe('consumePendingSeed', () => {
  it('seeds and clears when the flag names this plan', () => {
    expect(consumePendingSeed({ pendingSeed: 'pA' }, 'pA')).toEqual({ seed: true, clear: true });
  });

  it('leaves the flag alone when it names another plan, or is absent', () => {
    expect(consumePendingSeed({ pendingSeed: 'pB' }, 'pA')).toEqual({ seed: false, clear: false });
    expect(consumePendingSeed({}, 'pA')).toEqual({ seed: false, clear: false });
    expect(consumePendingSeed(null, 'pA')).toEqual({ seed: false, clear: false });
  });
});

describe('loadStoredUserPrefs', () => {
  it('returns null when nothing usable is stored, so a caller can tell "empty" from "defaults"', () => {
    const s = makeStorage();
    expect(loadStoredUserPrefs('u1', s)).toBe(null);
    s.map.set('raqam.prefs.u.u1', 'not json');
    expect(loadStoredUserPrefs('u1', s)).toBe(null);
    s.map.set('raqam.prefs.u.u1', '[1]');
    expect(loadStoredUserPrefs('u1', s)).toBe(null);
    expect(loadStoredUserPrefs('u1', makeThrowingReadStorage())).toBe(null);
  });

  it('returns the stored prefs over the defaults, like loadUserPrefs', () => {
    const s = makeStorage();
    writeUserPrefs('u1', { openPlanId: 'pA' }, s);
    expect(loadStoredUserPrefs('u1', s)).toEqual(loadUserPrefs('u1', s));
    expect(loadStoredUserPrefs('u1', s).openPlanId).toBe('pA');
  });
});

// With site data blocked, merely READING window.localStorage throws — the
// default storage must be resolved inside the guard, not as a default argument.
describe('when the localStorage getter itself throws', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  });

  it('reads fall back to defaults and writes report false, never a throw', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('access denied', 'SecurityError'); },
    });
    expect(loadUserPrefs('u1')).toEqual({ skippedSetup: false, plans: {} });
    expect(loadStoredUserPrefs('u1')).toBe(null);
    expect(writeUserPrefs('u1', { a: 1 })).toBe(false);
  });
});
