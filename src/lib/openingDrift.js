// Opening-snapshot drift: where a month's stored opening no longer equals the
// previous month's computed closing. Two ways it happens — a rollover pending
// froze before the previous month was finished (rolloverMonth seeds by
// presence; refreshPendingOpenings now re-derives pendings, but a row that was
// confirmed while stale is locked in), or a confirmed figure was typed against
// a bank balance that later entries changed. Only carry-forward rows are
// judged: a snapshot with no earlier snapshot for its account is the typed
// opening of a brand-new account, and "previous month's closing" would read 0
// for it. Pure, so the register banner and its tests share one definition.
import { accountBalance, MN } from './calc.js';
import { addMonths } from './dates.js';

// [{ accountId, month, stored, computed, delta, status }] for every snapshot
// (any status) whose stored amount differs from the recomputed one, sorted by
// month. `delta` is computed − stored: positive means the opening is short.
// Accounts missing from `store.accounts` are skipped, whatever their status.
export function openingDrift(store, now, { accountId } = {}) {
  const snaps = store.snapshots || [];
  const accounts = store.accounts || [];
  const out = [];
  snaps.forEach(s => {
    if (accountId && s.accountId !== accountId) return;
    const acc = accounts.find(a => a.id === s.accountId);
    if (!acc) return;
    if (!snaps.some(x => x.accountId === s.accountId && x.month < s.month)) return;
    const computed = accountBalance(acc, store, addMonths(s.month, -1), now);
    if (computed === s.amount) return;
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
