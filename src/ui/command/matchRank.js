// Pure fuzzy match + rank for the command palette. No React, no DOM, no store —
// so it is unit- AND property-testable in isolation (see matchRank.test.js).
//
// Tiered scoring, higher = better:
//   exact (1000) > prefix (~800) > word-boundary (~600) > subsequence (≤300).
// A non-match is -Infinity. An empty query is neutral (0) so the palette can
// open showing everything. rankItems() adds per-item priority and a recents
// boost, drops non-matches, and returns a stable, total order.

const norm = s => (s == null ? '' : String(s).toLowerCase().trim());

// True word starts: index 0, or preceded by a separator. Used to reward
// "net" matching "Net Worth" more than a mid-word hit.
function wordBoundaryIndex(text, query) {
  let i = text.indexOf(query);
  while (i > 0) {
    const prev = text[i - 1];
    if (prev === ' ' || prev === '-' || prev === '/' || prev === '·' || prev === ':') return i;
    i = text.indexOf(query, i + 1);
  }
  return -1; // i===0 is handled by the prefix tier
}

// Greedy in-order subsequence. Returns a small (≤0) bonus rewarding compact,
// early matches in short text, or -Infinity when not all query chars appear.
function subsequenceScore(text, query) {
  let qi = 0, first = -1, last = -1;
  for (let ti = 0; ti < text.length && qi < query.length; ti++) {
    if (text[ti] === query[qi]) {
      if (first === -1) first = ti;
      last = ti;
      qi++;
    }
  }
  if (qi < query.length) return -Infinity;
  const span = last - first + 1;
  const gaps = span - query.length;      // 0 == contiguous
  return -(gaps) - first * 0.1 - text.length * 0.01;
}

export function fuzzyScore(query, text) {
  const q = norm(query);
  if (q === '') return 0;                 // neutral: empty query matches all
  const t = norm(text);
  if (t === '') return -Infinity;
  if (t === q) return 1000;               // exact
  if (t.startsWith(q)) return 800 - (t.length - q.length); // prefix
  const wb = wordBoundaryIndex(t, q);
  if (wb >= 0) return 600 - wb - (t.length - q.length) * 0.1; // word-boundary
  const sub = subsequenceScore(t, q);
  if (sub === -Infinity) return -Infinity;
  return 300 + sub;                        // subsequence (sub ≤ 0)
}

export const RECENT_BOOST = 500;
// Sublabel/keyword hits count, but at a discount so a label match wins ties.
const SUBLABEL_PENALTY = 50;
const KEYWORD_PENALTY = 30;

// Total score for one item against a query. Single source of truth for both
// filtering and ordering (the tests recompute ordering through this).
export function scoreItem(query, item, opts = {}) {
  if (!item) return -Infinity;
  let best = fuzzyScore(query, item.label);
  if (item.sublabel) {
    const s = fuzzyScore(query, item.sublabel);
    if (s !== -Infinity) best = Math.max(best, s - SUBLABEL_PENALTY);
  }
  if (Array.isArray(item.keywords)) {
    for (const k of item.keywords) {
      const s = fuzzyScore(query, k);
      if (s !== -Infinity) best = Math.max(best, s - KEYWORD_PENALTY);
    }
  }
  if (best === -Infinity) return -Infinity;
  let total = best + (item.priority || 0);
  const rec = opts.recentIds instanceof Set
    ? opts.recentIds
    : (opts.recentIds ? new Set(opts.recentIds) : null);
  if (rec && item.id != null && rec.has(item.id)) total += RECENT_BOOST;
  return total;
}

// rankItems(query, items, { recentIds }) -> ordered subset of `items`.
// - Non-matches dropped. Empty query keeps everything.
// - Sorted by total score desc; stable tie-break on priority then input order,
//   giving a deterministic total order (see property tests P1–P6).
export function rankItems(query, items, opts = {}) {
  if (!Array.isArray(items)) return [];
  const o = { recentIds: opts.recentIds ? new Set(opts.recentIds) : null };
  const scored = [];
  for (let i = 0; i < items.length; i++) {
    const total = scoreItem(query, items[i], o);
    if (total === -Infinity) continue;
    scored.push({ it: items[i], total, i });
  }
  scored.sort((a, b) => b.total - a.total
    || (b.it.priority || 0) - (a.it.priority || 0)
    || a.i - b.i);
  return scored.map(s => s.it);
}
