// Opening-snapshot drift: where a month's stored opening no longer equals the
// previous month's computed closing. Three ways it happens — a rollover pending
// froze before the previous month was finished (rolloverMonth seeds by
// presence; refreshPendingOpenings re-derives pendings on later passes, but a
// row confirmed while stale is locked in), a confirmed figure was typed against
// a bank balance that later entries changed, or the previous month was edited
// after this one was confirmed. Only CARRY-FORWARD rows are judged: the row
// for the immediately previous month must exist. A snapshot with no earlier
// snapshot is the typed opening of a brand-new account, and a chain with a
// GAP (no row for the month before) would read that month's opening as 0
// (calc.js openingOf) and "compute" a closing that is only that month's
// deltas — a fabricated figure, never something to warn about or write back.
// Pure, so the register banner, the actions and their tests share one
// definition of "the live opening".
import { accountBalance, MN } from './calc.js';
import { addMonths } from './dates.js';

// True when `month` can be re-derived for this account: the previous month has
// a snapshot row (any status) to seed the walk from.
export function hasPreviousOpening(snapshots, accountId, month) {
  const prev = addMonths(month, -1);
  return (snapshots || []).some(s => s.accountId === accountId && s.month === prev);
}

// The previous month's computed closing — what a carry-forward opening for
// `month` SHOULD be. Deliberately unguarded (no `now`): a snapshot means the
// complete previous month, never the month as it looked at some instant, and
// this is the same reading rolloverMonth seeds from. Returns null when the
// chain has no previous row (see the header), so callers never see a 0-seeded
// figure by accident.
export function liveOpening(store, acc, month) {
  if (!acc || !hasPreviousOpening(store.snapshots, acc.id, month)) return null;
  return accountBalance(acc, store, addMonths(month, -1));
}

// [{ accountId, month, stored, computed, delta, status }] for every carried
// snapshot (any status) whose stored amount differs from the recomputed one,
// sorted by month then account. `delta` is computed − stored: positive means
// the opening is short. Accounts missing from `store.accounts` are skipped,
// whatever their status.
export function openingDrift(store, { accountId } = {}) {
  const snaps = store.snapshots || [];
  const accounts = store.accounts || [];
  const out = [];
  snaps.forEach(s => {
    if (accountId && s.accountId !== accountId) return;
    const acc = accounts.find(a => a.id === s.accountId);
    if (!acc) return;
    const computed = liveOpening(store, acc, s.month);
    if (computed == null || computed === s.amount) return;
    out.push({ accountId: s.accountId, month: s.month, stored: s.amount, computed, delta: computed - s.amount, status: s.status });
  });
  return out.sort((a, b) => a.month.localeCompare(b.month) || a.accountId.localeCompare(b.accountId));
}

const shortMY = ym => MN[Number(ym.slice(5, 7)) - 1].slice(0, 3) + ' ' + ym.slice(0, 4); // 'Sep 2026', as the register header
const fullM = ym => MN[Number(ym.slice(5, 7)) - 1];

// "Meezan’s Sep 2026 opening is Rs 98,350 below August’s closing". `money`
// formats the magnitude (the useMoney hook, or fmtPKR); `nick` is the account's
// display name. Curly apostrophe to match openingPendingSubtitle.
export function openingDriftLabel(entry, money, nick) {
  const side = entry.delta > 0 ? 'below' : 'above';
  return nick + '’s ' + shortMY(entry.month) + ' opening is ' + money(Math.abs(entry.delta)) + ' ' + side + ' ' + fullM(addMonths(entry.month, -1)) + '’s closing';
}
