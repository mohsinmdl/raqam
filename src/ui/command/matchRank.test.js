import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { fuzzyScore, scoreItem, rankItems, RECENT_BOOST } from './matchRank.js';

// ---- Example-based: pin the tier ordering (PBT-10 complement) ----
describe('fuzzyScore tiers', () => {
  it('ranks exact > prefix > word-boundary > subsequence > no-match', () => {
    const exact = fuzzyScore('reflect', 'Reflect');
    const prefix = fuzzyScore('refl', 'Reflect');
    const boundary = fuzzyScore('worth', 'Net Worth');
    const subseq = fuzzyScore('nw', 'Net Worth');
    const none = fuzzyScore('zzz', 'Net Worth');
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(boundary);
    expect(boundary).toBeGreaterThan(subseq);
    expect(subseq).toBeGreaterThan(none);
    expect(none).toBe(-Infinity);
  });

  it('empty query is neutral (matches everything)', () => {
    expect(fuzzyScore('', 'anything')).toBe(0);
    expect(fuzzyScore('   ', 'anything')).toBe(0);
  });

  it('is case-insensitive and trims', () => {
    expect(fuzzyScore('  REFL ', 'Reflect')).toBe(fuzzyScore('refl', 'Reflect'));
  });
});

const items = [
  { id: 'page:reflect', label: 'Reflect', sublabel: 'Overview', keywords: ['reports'], priority: 40 },
  { id: 'page:spending', label: 'Spending', sublabel: 'Reflect', priority: 40 },
  { id: 'account:hbl', label: 'HBL Current', sublabel: 'Current', priority: 20 },
  { id: 'category:dining', label: 'Dining', sublabel: 'Food', priority: 10 },
  { id: 'action:addTx', label: 'Add transaction', keywords: ['new expense', 'spend'], priority: 30 },
];

describe('rankItems examples', () => {
  it('prefix beats subsequence for the same query', () => {
    const out = rankItems('sp', items);
    expect(out[0].id).toBe('page:spending'); // prefix "Sp..." beats "add transaction"/keyword
  });

  it('matches via keyword', () => {
    const out = rankItems('new expense', items);
    expect(out.map(i => i.id)).toContain('action:addTx');
  });

  it('matches via sublabel', () => {
    const out = rankItems('overview', items);
    expect(out.map(i => i.id)).toContain('page:reflect');
  });

  it('empty query returns everything (count preserved)', () => {
    expect(rankItems('', items)).toHaveLength(items.length);
    expect(rankItems('   ', items)).toHaveLength(items.length);
  });

  it('recents boost lifts an otherwise-lower item', () => {
    const boosted = rankItems('', items, { recentIds: ['category:dining'] });
    expect(boosted[0].id).toBe('category:dining');
  });

  it('drops non-matches', () => {
    expect(rankItems('zzzqqq', items)).toHaveLength(0);
  });
});

// ---- Property-based (P1–P6) ----
// Generators: realistic-ish labels/queries incl. unicode, spaces, hyphens, empties.
const labelArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 24 }),
  fc.constantFrom('Net Worth', 'Age of Money', 'Add transaction', 'HBL Current', 'Dining', 'Reflect', 'رقم', '日本語', 'a-b/c'),
);
const itemArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 8 }),
  label: labelArb,
  sublabel: fc.option(labelArb, { nil: undefined }),
  keywords: fc.option(fc.array(labelArb, { maxLength: 3 }), { nil: undefined }),
  priority: fc.option(fc.integer({ min: 0, max: 50 }), { nil: undefined }),
});
// Distinct ids so "subset / no dup" checks are unambiguous.
const itemsArb = fc.uniqueArray(itemArb, { selector: it => it.id, maxLength: 30 });
const queryArb = fc.oneof(fc.string({ maxLength: 6 }), fc.constantFrom('', ' ', 'net', 'a', 'money'));

describe('rankItems properties', () => {
  it('P1: results are a subset of input with no duplicates', () => {
    fc.assert(fc.property(queryArb, itemsArb, (q, its) => {
      const out = rankItems(q, its);
      const inSet = new Set(its);
      expect(out.every(o => inSet.has(o))).toBe(true);       // same references
      expect(new Set(out).size).toBe(out.length);            // no dupes
      expect(out.length).toBeLessThanOrEqual(its.length);
    }));
  });

  it('P2: empty/whitespace query keeps every item', () => {
    fc.assert(fc.property(fc.constantFrom('', ' ', '   '), itemsArb, (q, its) => {
      expect(rankItems(q, its).length).toBe(its.length);
    }));
  });

  it('P3: a query that is a substring of a label is never filtered out', () => {
    fc.assert(fc.property(
      itemsArb.filter(a => a.length > 0),
      fc.nat(),
      (its, pick) => {
        const target = its[pick % its.length];
        const lbl = String(target.label);
        fc.pre(lbl.trim().length > 0);
        // take a real substring of the (normalized) label
        const t = lbl.toLowerCase();
        const start = pick % t.length;
        const q = t.slice(start, start + 3).trim();
        fc.pre(q.length > 0);
        const out = rankItems(q, its);
        expect(out.includes(target)).toBe(true);
      },
    ));
  });

  it('P4: results are ordered by non-increasing total score', () => {
    fc.assert(fc.property(queryArb, itemsArb, (q, its) => {
      const out = rankItems(q, its);
      for (let i = 1; i < out.length; i++) {
        expect(scoreItem(q, out[i - 1])).toBeGreaterThanOrEqual(scoreItem(q, out[i]));
      }
    }));
  });

  it('P5: recents boost never lowers an item below its non-recent twin', () => {
    fc.assert(fc.property(queryArb, itemArb, (q, base) => {
      const withRecent = scoreItem(q, base, { recentIds: [base.id] });
      const without = scoreItem(q, base);
      if (without === -Infinity) {
        // boost only applies once it already matches; a non-match stays a non-match
        expect(withRecent === -Infinity || withRecent >= without).toBe(true);
      } else {
        expect(withRecent).toBe(without + RECENT_BOOST);
      }
    }));
  });

  it('P6: never throws and is deterministic for any input', () => {
    fc.assert(fc.property(fc.string(), itemsArb, (q, its) => {
      const a = rankItems(q, its, { recentIds: its.slice(0, 2).map(i => i.id) });
      const b = rankItems(q, its, { recentIds: its.slice(0, 2).map(i => i.id) });
      expect(a.map(i => i.id)).toEqual(b.map(i => i.id)); // deterministic
    }));
  });
});
