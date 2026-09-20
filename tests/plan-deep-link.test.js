import { describe, it, expect, afterEach } from 'vitest';
import {
  planHref, planIdFromSearch, stripPlanParam, tabPlanKey, loadTabPlan, writeTabPlan, isNewTabClick,
} from '../src/lib/planDeepLink.js';

// A minimal in-memory Storage stub; `fail` makes getItem/setItem throw (quota /
// partly-disabled storage).
const makeStorage = (fail = false) => {
  const map = new Map();
  return {
    map,
    getItem: k => { if (fail) throw new DOMException('access denied', 'SecurityError'); return map.has(k) ? map.get(k) : null; },
    setItem: (k, v) => { if (fail) throw new DOMException('access denied', 'SecurityError'); map.set(k, v); },
  };
};

describe('planHref', () => {
  it('puts the plan id in a pre-hash query and keeps the current path + route', () => {
    expect(planHref('p2', { pathname: '/', search: '', hash: '#/budget' })).toBe('/?plan=p2#/budget');
    expect(planHref('p2', { pathname: '/app/index.html', search: '', hash: '#/transactions/acc1?sel=t9' }))
      .toBe('/app/index.html?plan=p2#/transactions/acc1?sel=t9');
  });

  it('encodes the id and falls back to / for an empty pathname', () => {
    expect(planHref('a b&c', { pathname: '', search: '', hash: '' })).toBe('/?plan=a%20b%26c');
  });

  // All route state lives in the hash, so the pre-hash query only ever needs
  // `plan`. Anything else there (Supabase's one-time ?code=) must NOT be copied
  // into another tab, where it would be redeemed a second time.
  it('carries nothing from the current query but the plan', () => {
    expect(planHref('p2', { pathname: '/', search: '?plan=p1&code=abc', hash: '#/reflect' })).toBe('/?plan=p2#/reflect');
  });

  it.each(['a+b', 'plän/✓', 'a#b', 'a b&c=d'])('round-trips the id %s through planIdFromSearch', id => {
    const href = planHref(id, { pathname: '/', search: '', hash: '#/budget' });
    const [beforeHash, hash] = [href.slice(0, href.indexOf('#/budget')), href.slice(href.indexOf('#/budget'))];
    expect(hash).toBe('#/budget');
    expect(planIdFromSearch(beforeHash.slice(beforeHash.indexOf('?')))).toBe(id);
  });
});

describe('planIdFromSearch', () => {
  it('reads the plan param, null when absent or empty', () => {
    expect(planIdFromSearch('?plan=p2')).toBe('p2');
    expect(planIdFromSearch('?code=abc&plan=a%20b')).toBe('a b');
    expect(planIdFromSearch('')).toBe(null);
    expect(planIdFromSearch('?plan=')).toBe(null);
    expect(planIdFromSearch('?code=abc')).toBe(null);
    expect(planIdFromSearch(undefined)).toBe(null);
  });

  it('takes the first of duplicate params and ignores look-alike keys', () => {
    expect(planIdFromSearch('?plan=a&plan=b')).toBe('a');
    expect(planIdFromSearch('?PLAN=a&planx=b')).toBe(null);
  });

  // This runs in the boot path, before anything renders — it must never throw.
  it('does not throw on malformed percent-encoding', () => {
    expect(() => planIdFromSearch('?plan=%E0%A4%A')).not.toThrow();
  });
});

describe('stripPlanParam', () => {
  it('removes only the plan param', () => {
    expect(stripPlanParam('?plan=p2')).toBe('');
    expect(stripPlanParam('?code=x&plan=p2')).toBe('?code=x');
    expect(stripPlanParam('?plan=p2&code=x')).toBe('?code=x');
    expect(stripPlanParam('?code=x')).toBe('?code=x');
    expect(stripPlanParam('')).toBe('');
  });

  it('removes every copy, and re-serialises what it keeps only when it had to strip', () => {
    expect(stripPlanParam('?plan=a&x=1&plan=b')).toBe('?x=1');
    expect(stripPlanParam('?q=a%20b&plan=p')).toBe('?q=a+b'); // same value, URLSearchParams spelling
    expect(stripPlanParam('?q=a%20b')).toBe('?q=a%20b'); // no plan param → returned untouched
  });
});

describe('tab pin', () => {
  it('keys the pin per user', () => {
    expect(tabPlanKey('u1')).toBe('raqam.tabPlan.u.u1');
  });

  it('round-trips through the given storage', () => {
    const s = makeStorage();
    expect(loadTabPlan('u1', s)).toBe(null);
    expect(writeTabPlan('u1', 'p2', s)).toBe(true);
    expect(loadTabPlan('u1', s)).toBe('p2');
    expect(loadTabPlan('u2', s)).toBe(null); // another user's pin is invisible
  });

  it('never throws when storage is unavailable', () => {
    const s = makeStorage(true);
    expect(writeTabPlan('u1', 'p2', s)).toBe(false);
    expect(loadTabPlan('u1', s)).toBe(null);
  });

  it('refuses to pin a missing id', () => {
    const s = makeStorage();
    expect(writeTabPlan('u1', undefined, s)).toBe(false);
    expect(writeTabPlan('u1', '', s)).toBe(false);
    expect(loadTabPlan('u1', s)).toBe(null);
  });

  // With site data blocked, merely READING window.sessionStorage throws — the
  // default storage must be resolved inside the guard, not as a default argument.
  describe('when the sessionStorage getter itself throws', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    afterEach(() => {
      if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
      else delete globalThis.sessionStorage;
    });

    it('degrades instead of throwing', () => {
      Object.defineProperty(globalThis, 'sessionStorage', {
        configurable: true,
        get() { throw new DOMException('access denied', 'SecurityError'); },
      });
      expect(loadTabPlan('u1')).toBe(null);
      expect(writeTabPlan('u1', 'p2')).toBe(false);
    });
  });
});

describe('isNewTabClick', () => {
  it('is true for the browser open-elsewhere gestures', () => {
    expect(isNewTabClick({ isTrusted: true, metaKey: true }, true)).toBe(true);
    expect(isNewTabClick({ isTrusted: true, ctrlKey: true }, false)).toBe(true);
    expect(isNewTabClick({ isTrusted: true, shiftKey: true }, true)).toBe(true);
    expect(isNewTabClick({ isTrusted: true, shiftKey: true }, false)).toBe(true);
  });

  // Only the platform's OWN modifier opens a new tab. The other one is a trusted
  // click the browser follows in THIS tab (Ctrl+Enter on a focused link on a
  // Mac) — leaving it alone would cross the plan boundary without switchPlan.
  it('is false for the other platform’s modifier', () => {
    expect(isNewTabClick({ isTrusted: true, ctrlKey: true }, true)).toBe(false);
    expect(isNewTabClick({ isTrusted: true, metaKey: true }, false)).toBe(false);
  });

  it('is false for a plain primary click', () => {
    expect(isNewTabClick({ isTrusted: true, button: 0 })).toBe(false);
    expect(isNewTabClick({ isTrusted: true, altKey: true })).toBe(false);
    expect(isNewTabClick({})).toBe(false);
    expect(isNewTabClick(null)).toBe(false);
  });

  // Base UI re-dispatches SYNTHETIC clicks (Space on a focused row, drag-release
  // over one) that copy the modifier flags. A browser ignores modifiers on an
  // untrusted click and navigates THIS tab — so those must not be left to it.
  it('is false for an untrusted click, whatever its modifiers', () => {
    expect(isNewTabClick({ isTrusted: false, shiftKey: true })).toBe(false);
    expect(isNewTabClick({ ctrlKey: true })).toBe(false);
    expect(isNewTabClick({ metaKey: true })).toBe(false);
  });
});
