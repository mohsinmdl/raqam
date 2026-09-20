import { describe, it, expect } from 'vitest';
import {
  planHref, planIdFromSearch, stripPlanParam, tabPlanKey, loadTabPlan, writeTabPlan, isNewTabClick,
} from '../src/lib/planDeepLink.js';

// A minimal in-memory Storage stub; `fail` makes every access throw like
// Safari private mode / disabled storage.
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

  it('encodes the id, replaces a lingering plan param, and keeps unrelated params', () => {
    expect(planHref('a b&c', { pathname: '/', search: '', hash: '' })).toBe('/?plan=a%20b%26c');
    expect(planHref('p2', { pathname: '/', search: '?plan=p1&x=1', hash: '#/reflect' })).toBe('/?x=1&plan=p2#/reflect');
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
});

describe('stripPlanParam', () => {
  it('removes only the plan param', () => {
    expect(stripPlanParam('?plan=p2')).toBe('');
    expect(stripPlanParam('?code=x&plan=p2')).toBe('?code=x');
    expect(stripPlanParam('?plan=p2&code=x')).toBe('?code=x');
    expect(stripPlanParam('?code=x')).toBe('?code=x');
    expect(stripPlanParam('')).toBe('');
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
});

describe('isNewTabClick', () => {
  it('is true for the browser open-elsewhere gestures', () => {
    expect(isNewTabClick({ metaKey: true })).toBe(true);
    expect(isNewTabClick({ ctrlKey: true })).toBe(true);
    expect(isNewTabClick({ shiftKey: true })).toBe(true);
    expect(isNewTabClick({ button: 1 })).toBe(true);
  });

  it('is false for a plain primary click', () => {
    expect(isNewTabClick({ button: 0 })).toBe(false);
    expect(isNewTabClick({})).toBe(false);
    expect(isNewTabClick(null)).toBe(false);
  });
});
