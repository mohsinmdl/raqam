import { describe, it, expect } from 'vitest';
import { byOrderThenName, sortGroups, sortCats } from '../src/lib/categoryOrder.js';

describe('byOrderThenName', () => {
  it('sorts by sortOrder ascending', () => {
    expect([{ name: 'b', sortOrder: 2 }, { name: 'a', sortOrder: 1 }].sort(byOrderThenName).map(x => x.name)).toEqual(['a', 'b']);
  });
  it('breaks sortOrder ties by name (localeCompare)', () => {
    expect([{ name: 'Zed', sortOrder: 1 }, { name: 'Alpha', sortOrder: 1 }].sort(byOrderThenName).map(x => x.name)).toEqual(['Alpha', 'Zed']);
  });
  it('treats missing and 0 sortOrder as equal (0 default)', () => {
    expect([{ name: 'b', sortOrder: 0 }, { name: 'a' }].sort(byOrderThenName).map(x => x.name)).toEqual(['a', 'b']);
  });
});

describe('sortGroups / sortCats', () => {
  const input = [{ name: 'z', sortOrder: 5 }, { name: 'a', sortOrder: 1 }];
  it('returns a sorted copy without mutating the input', () => {
    const out = sortGroups(input);
    expect(out.map(x => x.name)).toEqual(['a', 'z']);
    expect(input.map(x => x.name)).toEqual(['z', 'a']);
  });
  it('sortCats behaves identically and both tolerate null', () => {
    expect(sortCats(input).map(x => x.name)).toEqual(['a', 'z']);
    expect(sortGroups(null)).toEqual([]);
    expect(sortCats(undefined)).toEqual([]);
  });
});
