import { describe, expect, it } from 'vitest';
import { needsCategoryBannerCount } from './needsCategoryBanner.js';

describe('needsCategoryBannerCount', () => {
  it('is 0 when nothing needs a category', () => {
    expect(needsCategoryBannerCount(new Set(), new Set())).toBe(0);
    expect(needsCategoryBannerCount(new Set(), new Set(['a']))).toBe(0);
  });
  it('returns the full count when nothing is in its saved-state', () => {
    expect(needsCategoryBannerCount(new Set(['a', 'b', 'c']), new Set())).toBe(3);
  });
  it('excludes ids currently held in lastSaved', () => {
    expect(needsCategoryBannerCount(new Set(['a', 'b', 'c']), new Set(['b']))).toBe(2);
  });
  it('drops to 0 when the only uncategorized row is the just-saved one', () => {
    expect(needsCategoryBannerCount(new Set(['a']), new Set(['a']))).toBe(0);
  });
  it('ignores lastSaved ids that are not in needsCat (already categorized, or a different row)', () => {
    expect(needsCategoryBannerCount(new Set(['a', 'b']), new Set(['z']))).toBe(2);
  });
  it('tolerates missing/undefined sets', () => {
    expect(needsCategoryBannerCount(undefined, new Set(['a']))).toBe(0);
    expect(needsCategoryBannerCount(new Set(['a']), undefined)).toBe(1);
  });
});
