// Drill-down from a transaction clicked in the Activity modal into the register.
import { inRange } from './dateRange.js';

// Where the click navigates.
//
// A bank-account txn opens that account's register (/transactions/:accountId),
// which pre-selects the account exactly like YNAB. A card-funded txn has no
// accountId and never appears in a per-account register, so it opens the
// all-accounts view (/transactions) — the only place card txns are listed.
// (A bank txn with a missing accountId would take the card branch too; today's
// only caller, categoryActivityRows, never yields such a row.)
//
// The txn id travels as a one-shot ?sel= query param that the Transactions
// screen consumes (see selectionForSel) to check the row, scroll to it, then
// clear. Returns a react-router `To` object so callers can navigate() directly.
export function activityDrillTarget(t) {
  const pathname = t.accountId ? '/transactions/' + t.accountId : '/transactions';
  return { pathname, search: '?sel=' + encodeURIComponent(t.id) };
}

// A trustworthy YYYY-MM month, or null when the date can't be parsed — guards a
// stale/hand-crafted ?sel= target from widening the register to a garbage range.
function monthOf(date) {
  const m = typeof date === 'string' ? date.slice(0, 7) : '';
  return /^\d{4}-\d{2}$/.test(m) ? m : null;
}
// Range bounds treat a falsy value as unbounded (see inRange). Extend the window
// to include month m rather than replacing it, so a deliberate multi-month range
// is never silently collapsed to one month. An unbounded side stays unbounded.
function minBound(from, m) { return from ? (m < from ? m : from) : from; }
function maxBound(to, m) { return to ? (m > to ? m : to) : to; }

// What the register's ?sel= effect should do for a target id and the register's
// current date range. Pure, so the branch logic is unit-tested without a DOM.
// Returns:
//   null                        — no target to consume (empty/absent param)
//   { found: false }            — id not in the store (deleted or stale link)
//   { found: true, id, range }  — select this id; `range` is a new {from,to} to
//                                 apply, or null to leave the current range as-is.
export function selectionForSel(transactions, sel, range) {
  if (!sel) return null;
  const t = (transactions || []).find(x => x.id === sel);
  if (!t) return { found: false };
  let next = null;
  // A target outside the current range would not render, so widen to include it.
  if (!inRange(t, range.from, range.to)) {
    const m = monthOf(t.date);
    if (m) next = { from: minBound(range.from, m), to: maxBound(range.to, m) };
  }
  return { found: true, id: t.id, range: next };
}
