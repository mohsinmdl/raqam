// Pure data-store actions: every function takes the current data store (and a payload)
// and returns a NEW store. The reducer in StoreProvider applies them immutably.
// Ported from the prototype's submit handlers; the month-rollover logic is new (real-date layer).
import { accountBalance, cardOutstanding } from '../lib/calc.js';
import { addMonths, clampDay, currentMonth } from '../lib/dates.js';
import { makeDemoStore, freshStore } from './seed.js';

export const loadDemo = () => makeDemoStore(currentMonth());
export const resetAll = () => freshStore();

/**
 * Month rollover — runs at startup (and when the date changes while the app is open).
 * Ensures the current real month has an opening snapshot row for every active account and
 * an opening-outstanding figure for every credit card, carrying forward the previous
 * month's computed closing position. Also rolls recurring reminders into the new month.
 *
 * ── USER CONTRIBUTION CHECKPOINT (learning mode) ─────────────────────────────
 * Decision: what happens to PENDING (never-confirmed) snapshots from the previous
 * month when a new month starts?
 *   Option A (current provisional default): supersede silently — the new month's
 *     pending snapshot is computed from the previous month's closing balance even if
 *     that month's opening was never confirmed. Frictionless, but "change this month"
 *     may rest on an unconfirmed chain.
 *   Option B: keep prompting — leave the old pending rows in place and surface a
 *     stronger banner ("2 months awaiting confirmation") until the user confirms
 *     each month in order. Trustworthy, but nags.
 * To change the policy, edit the marked block below (~5-10 lines).
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function rolloverMonth(data) {
  const month = currentMonth();
  const prev = addMonths(month, -1);
  const active = data.accounts.filter(a => a.status === 'active');
  if (active.length === 0) return data;
  const missing = active.filter(a => !data.snapshots.some(s => s.accountId === a.id && s.month === month));
  const cardsMissing = data.cards.filter(c => c.type === 'credit' && (!c.openingOutstanding || c.openingOutstanding[month] == null));
  const recurringStale = data.recurring.some(r => r.status === 'active' && r.nextDate && r.nextDate.slice(0, 7) < month);
  if (missing.length === 0 && cardsMissing.length === 0 && !recurringStale) return data;

  const next = { ...data };

  // ── contribution block: pending-snapshot carry-forward policy (Option A default) ──
  if (missing.length > 0) {
    next.snapshots = [
      ...next.snapshots,
      ...missing.map(a => ({
        month,
        accountId: a.id,
        amount: accountBalance(a, data, prev), // previous month's computed closing balance
        status: 'pending',
      })),
    ];
  }
  // ── end contribution block ──

  if (cardsMissing.length > 0) {
    next.cards = next.cards.map(c => {
      if (c.type !== 'credit' || (c.openingOutstanding && c.openingOutstanding[month] != null)) return c;
      return { ...c, openingOutstanding: { ...(c.openingOutstanding || {}), [month]: cardOutstanding(c, data, prev) } };
    });
  }

  if (recurringStale) {
    next.recurring = next.recurring.map(r => {
      if (r.status !== 'active' || !r.nextDate || r.nextDate.slice(0, 7) >= month) return r;
      // Keep the reminder's day-of-month, moved into the current month (clamped for short months).
      const day = clampDay(month, Number(r.nextDate.slice(8, 10)));
      return { ...r, nextDate: `${month}-${String(day).padStart(2, '0')}`, doneThisMonth: false };
    });
  }

  return next;
}
