// Raqam shared calculation + formatting utilities. All money in integer PKR.
// Ported from the Hisaab design prototype's calc.js — the financial correctness core.
//
// The fmt* names below are the app-wide formatting API; since multi-Plan
// (U3) their bodies delegate to the open plan's formatter (planFormat.js
// singleton — bound by PlanProvider at boot). Signatures unchanged, and the
// pre-bind default reproduces the historical hardcoded rendering byte-for-
// byte ('Rs ' prefix with its trailing space, U+2212 minus, en-PK compact
// M/B tail, Math.round for 0-dp / two fixed fraction digits otherwise) — so
// every call site, and every test written against the old output, is
// untouched. No component imports planFormat directly; these wrappers are
// the only doorway (BR-U3-2).
import { activeFormat } from './planFormat.js';

// Digit-preserving mask (digits → '•', symbol/separators/sign survive);
// canonical definition moved to planFormat.js so money() can mask without an
// import cycle — the historical export name stays here.
export { maskDigits } from './planFormat.js';

export function fmtNum(n, decimals) { return activeFormat().num(n, decimals); }
export function fmtPKR(n, masked, decimals) { return activeFormat().money(n, masked, decimals); }
export function fmtSigned(n, masked, decimals) { return activeFormat().moneySigned(n, masked, decimals); }
// Compact for the large tail (Rs 1M, Rs 1.25M): callers apply this only above
// a magnitude threshold; below it, full grouped formatting reads fine and
// stays exact. Masking is left to callers, which fall back to fmtPKR first.
export function fmtPKRCompact(n) { return activeFormat().moneyCompact(n); }
// NUMERIC date rendering (dd/mm/yyyy-shaped surfaces: register date cell,
// Moves history, CSV export) per the plan's date format. Friendly labels
// (monthLabel/shortDate/dayLabel/timeLabel/relTime below) deliberately stay
// format-independent (BR-U3-5).
export function fmtDate(iso) { return activeFormat().date(iso); }
export function fmtPct(x) { return x == null ? '—' : Math.round(x * 100) + '%'; }
export const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function monthLabel(ym) { const [y, m] = ym.split('-'); return MN[+m - 1] + ' ' + y; }
export function shortDate(iso) {
  const d = new Date(iso); const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  return wd + ', ' + d.getDate() + ' ' + MN[d.getMonth()].slice(0, 3);
}
export function dayLabel(iso) { const d = new Date(iso); return d.getDate() + ' ' + MN[d.getMonth()].slice(0, 3); }
export function timeLabel(iso) { const d = new Date(iso); let h = d.getHours(); const am = h < 12 ? 'am' : 'pm'; h = h % 12 || 12; return h + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + am; }
export function inMonth(t, m) { return t.date.slice(0, 7) === m; }
export function daysInMonth(ym) { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); }
export function daysAgo(iso, nowIso) { return Math.floor((new Date(nowIso) - new Date(iso)) / 86400000); }
export function daysUntil(iso, nowIso) { return Math.ceil((new Date(iso.slice(0, 10)) - new Date(nowIso.slice(0, 10))) / 86400000); }

// Has this transaction actually happened yet?
//
// `now` is optional throughout the money math, and omitting it counts every
// transaction in the month — deliberately the old behaviour, because the one
// caller that MUST NOT be time-guarded is the month rollover: ensureMonth
// freezes a month's closing balance into the next month's opening snapshot, and
// a guard there would drop anything still dated ahead at that moment, losing
// the money permanently once the snapshot is written. Forgetting to pass `now`
// therefore degrades to a cosmetic bug, never to a wrong balance.
// Day-granular on purpose. The clock time on a transaction is an ordering hint
// within its day, not a claim about the minute money moved — adjustments, card
// adjustments and card payments are all stamped at a flat T12:00 by the actions
// that create them (actions.js). Comparing full timestamps meant an adjustment
// made at 02:00 was dated "noon today", read as the future, and silently left
// out of every balance until midday. A transaction dated today has happened
// today; only a later DATE is still to come.
export function hasOccurred(t, now) { return !now || t.date.slice(0, 10) <= now.slice(0, 10); }

// Effect of a cleared transaction on a bank account balance.
export function accountDelta(t, accId, now) {
  if (t.status === 'pending') return 0;
  if (!hasOccurred(t, now)) return 0;
  if (t.type === 'transfer') {
    let d = 0;
    if (t.accountId === accId) d -= t.amount + (t.fee || 0);
    if (t.toAccountId === accId) d += t.amount;
    return d;
  }
  if (t.accountId !== accId) return 0;
  if (t.type === 'expense') return -t.amount;
  if (t.type === 'income' || t.type === 'refund') return t.amount;
  if (t.type === 'adjustment') return t.amount; // signed
  return 0;
}
// Effect on a credit card's outstanding liability.
export function cardDelta(t, cardId, now) {
  if (t.status === 'pending') return 0;
  if (!hasOccurred(t, now)) return 0;
  if (t.type === 'expense' && t.cardId === cardId) return t.amount;
  if (t.type === 'refund' && t.cardId === cardId) return -t.amount;
  if (t.type === 'transfer' && t.toCardId === cardId) return -t.amount; // card payment
  if (t.type === 'cardAdjustment' && t.cardId === cardId) return t.amount; // signed correction
  return 0;
}
export function openingOf(acc, snapshots, month) {
  const s = snapshots.find(x => x.accountId === acc.id && x.month === month);
  return s ? s.amount : 0;
}
// Opening snapshots whose confirmation would actually move money into Ready to
// Assign for `month`. Openings are seeded `status:'pending'` two ways — by the
// monthly rollover for every active account (actions.js rolloverMonth, the
// common case) and by addAccount for a brand-new account. Working Balance
// counts a pending opening immediately (openingOf ignores status), but RTA
// seeds from each account's EARLIEST CONFIRMED snapshot (envelope.js
// earliestOpeningSnapshots), so the two disagree only until that earliest one
// is confirmed. A later pending opening (e.g. this month's rollover for an
// account already confirmed in an earlier month) restates money RTA already
// holds — confirming it moves RTA by zero. So we surface a pending snapshot
// ONLY when the account has no confirmed snapshot in this month or earlier;
// otherwise the nudge would claim (and toast) money that is already counted.
// The Plan tab's RTA nudge reads this to name the real gap and offer a
// one-click confirmSnapshots. Pure — total, the raw snaps, and account nicks.
export function pendingOpening(store, month) {
  const all = store.snapshots || [];
  const seededEarlier = accountId =>
    all.some(s => s.accountId === accountId && s.status === 'confirmed' && s.month <= month);
  const snaps = all.filter(s => s.month === month && s.status === 'pending' && !seededEarlier(s.accountId));
  const accounts = snaps.map(s => {
    const a = (store.accounts || []).find(x => x.id === s.accountId);
    return { id: s.accountId, nick: a ? a.nickname : s.accountId, amount: s.amount };
  });
  return { total: snaps.reduce((t, s) => t + s.amount, 0), snaps, accounts };
}
// Subtitle copy for the pending-opening nudge, kept pure (and out of the
// component) so its grammar branches are unit-testable. Possessive and number
// agree with the subject: "A’s opening balance is pending.", "A and B’s opening
// balances are pending.", "A and N others’ opening balances are pending." — no
// apostrophe-s on "others", which is already plural.
export function openingPendingSubtitle(names) {
  const who = names.length === 1 ? names[0]
    : names.length === 2 ? names[0] + ' and ' + names[1]
    : names[0] + ' and ' + (names.length - 1) + ' others';
  const possessive = names.length >= 3 ? '’' : '’s';
  const phrase = names.length === 1 ? ' opening balance is pending.' : ' opening balances are pending.';
  return who + possessive + phrase;
}
export function accountBalance(acc, store, month, now) {
  const open = openingOf(acc, store.snapshots, month);
  return open + store.transactions.filter(t => inMonth(t, month)).reduce((s, t) => s + accountDelta(t, acc.id, now), 0);
}
export function cardOutstanding(card, store, month, now) {
  if (card.type !== 'credit') return 0;
  const open = (card.openingOutstanding && card.openingOutstanding[month] != null) ? card.openingOutstanding[month] : (card.openingOutstanding ? Object.values(card.openingOutstanding).slice(-1)[0] || 0 : 0);
  return open + store.transactions.filter(t => inMonth(t, month)).reduce((s, t) => s + cardDelta(t, card.id, now), 0);
}
export function lastActivity(acc, store) {
  const tx = store.transactions.filter(t => t.accountId === acc.id || t.toAccountId === acc.id).sort((a, b) => b.date.localeCompare(a.date));
  return tx.length ? tx[0].date : acc.createdAt;
}

// Income = income tx. Expenses = expense tx (bank + card) + transfer fees − refunds. Transfers & card payments excluded.
// Portfolio metrics for a month. Pass `accountId` to scope the balance figures
// (opening / totalBank / uncleared / working) to a single account — the
// per-account register strip's fallback when it has no vetted range (it reads
// rangeBalances otherwise). Omit it for the whole-portfolio numbers the
// Dashboard and All-Accounts view use. Flow metrics (income/expenses/net)
// stay portfolio-wide; the scoped consumer (compact PositionStrip) reads only
// the balance figures.
export function monthMetrics(store, month, now, accountId) {
  const mtx = store.transactions.filter(t => inMonth(t, month) && t.status !== 'pending' && hasOccurred(t, now));
  const income = mtx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const refunds = mtx.filter(t => t.type === 'refund').reduce((s, t) => s + t.amount, 0);
  const gross = mtx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    + mtx.filter(t => t.type === 'transfer').reduce((s, t) => s + (t.fee || 0), 0);
  const expenses = gross - refunds;
  const net = income - expenses;
  // Recoverable = advances (excluded-from-budget categories) that left the
  // account net of repayments this month. It is real cash out (so it stays in
  // `expenses`/`net`), but it is not "spending", so the dashboard shows it
  // separately: `spending` is the budget-spending figure, and by construction
  // spending + recoverable === expenses, so income − spending − recoverable === net.
  const recExpense = mtx.filter(t => t.type === 'expense' && isExcludedCat(store, t.category)).reduce((s, t) => s + t.amount, 0);
  const recRefund = mtx.filter(t => t.type === 'refund' && isExcludedCat(store, t.category)).reduce((s, t) => s + t.amount, 0);
  const recoverable = recExpense - recRefund;
  const spending = expenses - recoverable;
  // The four balance figures come from rangeBalances over the single month, so
  // the month strip and the register's range strip can never disagree on how a
  // balance is walked — there is one implementation, not two.
  const { opening, totalBank, uncleared, working } = rangeBalances(store, month, month, now, accountId);
  const cardLiability = store.cards.filter(c => c.type === 'credit' && c.status !== 'closed').reduce((s, c) => s + cardOutstanding(c, store, month, now), 0);
  const pend = store.transactions.filter(t => inMonth(t, month) && t.status === 'pending' && hasOccurred(t, now));
  return {
    income, expenses, net, spending, recoverable, savings: Math.max(net, 0), rate: income > 0 ? net / income : null,
    opening, totalBank, change: totalBank - opening, cardLiability, netWorth: totalBank - cardLiability,
    pendingCount: pend.length, pendingTotal: pend.reduce((s, t) => s + t.amount, 0),
    uncleared, working,
  };
}
// Balance figures over an inclusive date range instead of a single month:
// { opening, totalBank, uncleared, working }. `from`/`to` are bounds in the
// dateRange.js sense — a 'YYYY-MM' month or a 'YYYY-MM-DD' day, either null for
// unbounded — but the OPENING is only meaningful when `from` is a month with a
// snapshot: it seeds from openingOf(from) and walks every delta from there to
// `to` as one continuous run. Intermediate months' snapshots are deliberately
// NOT re-seeded, so a snapshot that drifted from the walked figure shows up as
// a seam the user can see rather than being silently papered over. Callers
// that need the seed to be honest gate on balanceRange.js first.
//
// Pass `accountId` to scope to one account (the per-account register's strip
// and BALANCE column); omit it for every active account (monthMetrics).
export function rangeBalances(store, from, to, now, accountId) {
  const active = accountId
    ? store.accounts.filter(a => a.id === accountId)
    : store.accounts.filter(a => a.status === 'active');
  const activeIds = new Set(active.map(a => a.id));
  const opening = active.reduce((s, a) => s + openingOf(a, store.snapshots, from), 0);
  const rtx = store.transactions.filter(t => inBounds(t, from, to));
  const totalBank = rtx.reduce((s, t) => s + active.reduce((s2, a) => s2 + accountDelta(t, a.id, now), 0), opening);
  const pend = rtx.filter(t => t.status === 'pending' && hasOccurred(t, now));
  // Signed effect the pending rows would have on the active-account total once
  // cleared — the "uncleared" balance. accountDelta zeroes pending on purpose
  // (they must never touch cleared balances), so this mirrors its money rules
  // for active accounts without that guard. totalBank + uncleared = working.
  const uncleared = pend.reduce((s, t) => {
    if (t.type === 'transfer') {
      let d = 0;
      if (activeIds.has(t.accountId)) d -= t.amount + (t.fee || 0);
      if (t.toAccountId && activeIds.has(t.toAccountId)) d += t.amount;
      return s + d;
    }
    if (!activeIds.has(t.accountId)) return s;
    if (t.type === 'expense') return s - t.amount;
    if (t.type === 'income' || t.type === 'refund') return s + t.amount;
    if (t.type === 'adjustment') return s + t.amount; // already signed
    return s;
  }, 0);
  return { opening, totalBank, uncleared, working: totalBank + uncleared };
}
// Inclusive bound test, same contract as dateRange.js inRange(): each bound is
// compared against the same-length prefix of the date, so a month bound filters
// by month and a day bound by day; null is unbounded. Duplicated locally on
// purpose — dateRange.js imports MN from this file, so importing it back would
// be a cycle.
function inBounds(t, from, to) {
  const d = String(t.date || '');
  if (!d) return false;
  if (from && d.slice(0, from.length) < from) return false;
  if (to && d.slice(0, to.length) > to) return false;
  return true;
}
// Spending charts hide excluded (recoverable) categories unless the caller
// opts in — advances are not "spending by category", they are money on loan.
export function categorySpending(store, month, opts, now) {
  const map = {};
  store.transactions.filter(t => inMonth(t, month) && t.status !== 'pending' && hasOccurred(t, now)).forEach(t => {
    if (t.type === 'expense') map[t.category] = (map[t.category] || 0) + t.amount;
    if (t.type === 'refund') map[t.category] = (map[t.category] || 0) - t.amount;
  });
  const skip = !(opts && opts.includeExcluded);
  return Object.entries(map).map(([id, amt]) => ({ id, amt, cat: store.categories.find(c => c.id === id) }))
    .filter(x => x.amt > 0 && !(skip && isExcludedCat(store, x.id))).sort((a, b) => b.amt - a.amt);
}
export function dailySpending(store, month, opts, now) {
  const n = daysInMonth(month); const out = [];
  const skip = !(opts && opts.includeExcluded);
  for (let d = 1; d <= n; d++) {
    const key = month + '-' + String(d).padStart(2, '0');
    const amt = store.transactions.filter(t => t.date.slice(0, 10) === key && t.status !== 'pending' && hasOccurred(t, now) && !(skip && (t.type === 'expense' || t.type === 'refund') && isExcludedCat(store, t.category)))
      .reduce((s, t) => s + (t.type === 'expense' ? t.amount : t.type === 'refund' ? -t.amount : 0), 0);
    // `amt` is floored for the bar (a bar can't render negative); `net` keeps the
    // true signed daily value so the chart TOTAL can net refunds that land on a
    // net-negative day — summing the floored bars would drop those refunds and
    // over-state spending (matters most with recoverable advances toggled on).
    out.push({ day: d, amt: Math.max(amt, 0), net: amt });
  }
  return out;
}
export function largestExpenses(store, month, n, now) {
  return store.transactions.filter(t => inMonth(t, month) && t.type === 'expense' && t.status !== 'pending' && hasOccurred(t, now))
    .sort((a, b) => b.amount - a.amount).slice(0, n || 5);
}
export function budgetState(pct, spent) {
  if (spent <= 0) return { label: 'No spending yet', tone: 'muted' };
  if (pct > 100) return { label: 'Over budget', tone: 'neg' };
  if (pct >= 90) return { label: 'At limit', tone: 'warn' };
  if (pct >= 70) return { label: 'Approaching limit', tone: 'warn' };
  return { label: 'On track', tone: 'pos' };
}
export function findDuplicate(store, { amount, merchant, date }) {
  const day = (date || '').slice(0, 10);
  return store.transactions.find(t => t.amount === +amount && (t.merchant || '').trim().toLowerCase() === (merchant || '').trim().toLowerCase() && t.date.slice(0, 10) === day);
}

// ---------------------------------------------------------------------------
// Categories — flat list helpers, reference counting (design v2)
// ---------------------------------------------------------------------------
export function catById(store, id) { return store.categories.find(c => c.id === id) || null; }
export function isArchivedCat(c) { return !!c && c.status === 'archived'; }
// Categories of a type. Archived excluded unless asked for.
export function listCats(store, type, includeArchived) {
  return store.categories
    .filter(c => (!type || c.type === type) && (includeArchived || c.status !== 'archived'))
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name));
}
export function normalizeName(s) { return String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase(); }
// The ungrouped ("Other") bucket key: null and undefined groupId collapse to the
// SAME bucket, mirroring the DB index's `nulls not distinct` — so two ungrouped
// "Travelling" still collide, but "Travelling" under two real groups does not.
export function groupKey(groupId) { return groupId ?? null; }
// Duplicate check scoped to type AND group, case-insensitive. Names are unique
// per (type, group), not per plan (0018): the same name may repeat across
// groups. Pass the group the category will live in; omit for the "Other" bucket.
export function duplicateCat(store, { name, type, groupId, excludeId }) {
  const n = normalizeName(name);
  const g = groupKey(groupId);
  return store.categories.find(c =>
    c.id !== excludeId && c.type === type
    && groupKey(c.groupId) === g && normalizeName(c.name) === n) || null;
}
// Would moving `ids` into `groupId` break per-group name uniqueness (0018)?
// Returns the first offending category — a mover colliding with an existing
// member of the target group, or with another mover landing there — else null.
// Shared by the moveCategories reducer (refuse) and the Plan
// drag-drop (toast) so the two never disagree on what counts as a collision.
export function moveCollision(store, { ids, groupId }) {
  const moving = new Set(ids);
  const g = groupKey(groupId);
  const keyOf = c => c.type + ' ' + normalizeName(c.name);
  const taken = new Set();
  for (const c of store.categories) {
    if (moving.has(c.id) || groupKey(c.groupId) !== g) continue;
    taken.add(keyOf(c));
  }
  const landing = new Set();
  for (const id of ids) {
    const c = store.categories.find(x => x.id === id);
    if (!c) continue;
    const k = keyOf(c);
    if (taken.has(k) || landing.has(k)) return c;
    landing.add(k);
  }
  return null;
}
// Everything that points at a category, so deletion can be explained precisely.
// Includes envelope assignments (I3): a category with money assigned to it in
// some month is just as "in use" as one with a transaction or a budget — the
// server has an FK from assignments to categories, and offering a hard delete
// while assignment rows still point at the category silently orphans them.
export function catRefs(store, id) {
  const transactions = store.transactions.filter(t => t.category === id).length;
  const budgets = store.budgets.filter(b => b.category === id).length;
  const recurring = store.recurring.filter(r => r.category === id).length;
  const assignments = (store.assignments || []).filter(a => a.category === id).length;
  // Payee auto-categorize rules point at a category by id with no FK behind
  // them, so they count as references too — otherwise deletePolicy calls a
  // rule-referenced category "unused" and the rule keeps a dead id.
  const payees = (store.payees || []).filter(p => p.autoCategoryId === id).length;
  return { transactions, budgets, recurring, assignments, payees, total: transactions + budgets + recurring + assignments + payees };
}
export function catMonthTotal(store, id, month, now) {
  return store.transactions
    .filter(t => inMonth(t, month) && t.status !== 'pending' && t.category === id && hasOccurred(t, now))
    .reduce((s, t) => s + (t.type === 'expense' || t.type === 'income' ? t.amount : t.type === 'refund' ? -t.amount : 0), 0);
}

// ---------------------------------------------------------------------------
// Cards — available credit and its edge cases. `fmt` receives the caller's
// (mask-aware) money formatter.
// ---------------------------------------------------------------------------
export function availableCredit(card, outstanding, fmt) {
  const money = fmt || (n => fmtPKR(n, false));
  const limit = card.limit;
  if (limit == null || limit === '') return { value: null, label: 'No limit recorded', tone: 'muted', pct: 0, note: 'Add a credit limit to track available credit.' };
  if (limit === 0) return { value: 0, label: money(0), tone: 'muted', pct: 0, note: 'Credit limit is zero.' };
  const value = limit - outstanding;
  const pct = Math.min(Math.round(outstanding / limit * 100), 100);
  if (outstanding < 0) return { value, label: money(value), tone: 'pos', pct: 0, note: 'Credit balance of ' + money(-outstanding) + ' — overpaid or refunded.' };
  if (value < 0) return { value, label: money(0), tone: 'neg', pct: 100, note: 'Over limit by ' + money(-value) + '.' };
  return { value, label: money(value), tone: pct >= 90 ? 'neg' : pct >= 70 ? 'warn' : 'pos', pct, note: '' };
}

// ---------------------------------------------------------------------------
// Accounts & cards — what would break if this were archived/closed
// ---------------------------------------------------------------------------
export function accountRefs(store, id, month, now) {
  const acc = store.accounts.find(a => a.id === id);
  return {
    balance: acc ? accountBalance(acc, store, month, now) : 0,
    cards: store.cards.filter(c => c.linkedAccountId === id && c.status !== 'closed').length,
    recurring: store.recurring.filter(r => r.accountId === id && r.status === 'active').length,
    pending: store.transactions.filter(t => t.status === 'pending' && (t.accountId === id || t.toAccountId === id)).length,
    transactions: store.transactions.filter(t => t.accountId === id || t.toAccountId === id).length,
  };
}
// What blocks deleting an account for good. Deliberately UNFILTERED by status,
// unlike accountRefs: the database's foreign keys don't care whether a card is
// closed or a rule is paused — they still point here. Only snapshots are absent,
// because those cascade with the account (0001_init.sql:81).
export function accountDeletePolicy(store, id) {
  const refs = {
    transactions: store.transactions.filter(t => t.accountId === id || t.toAccountId === id).length,
    cards: store.cards.filter(c => c.linkedAccountId === id).length,
    recurring: store.recurring.filter(r => r.accountId === id).length,
  };
  const blockers = [
    refs.transactions ? refs.transactions + ' transaction' + (refs.transactions === 1 ? '' : 's') : null,
    refs.cards ? refs.cards + ' linked card' + (refs.cards === 1 ? '' : 's') : null,
    refs.recurring ? refs.recurring + ' recurring rule' + (refs.recurring === 1 ? '' : 's') : null,
  ].filter(Boolean);
  return { mode: blockers.length ? 'blocked' : 'delete', refs, blockers };
}

export function cardRefs(store, id, month, now) {
  const card = store.cards.find(c => c.id === id);
  return {
    outstanding: card ? cardOutstanding(card, store, month, now) : 0,
    recurring: store.recurring.filter(r => r.cardId === id && r.status === 'active').length,
    pending: store.transactions.filter(t => t.status === 'pending' && (t.cardId === id || t.toCardId === id)).length,
    transactions: store.transactions.filter(t => t.cardId === id || t.toCardId === id).length,
  };
}

// ---------------------------------------------------------------------------
// Institutions — the global catalogue plus the user's own banks. `kind` groups
// the pickers; 'Custom' is the catch-all ("Other") for anything that isn't a
// bank. Own rows are editable (name + kind); catalogue rows never are.
// ---------------------------------------------------------------------------
export const INST_KINDS = ['Conventional', 'Islamic', 'Foreign', 'Microfinance', 'Digital', 'Custom'];
// 'Custom' is stored for historical reasons; it reads as "Other" everywhere.
export function kindLabel(kind) { return kind === 'Custom' ? 'Other' : kind; }
export function instById(store, id) { return store.institutions.find(i => i.id === id) || null; }
// What points at this bank — a bank may only be removed when nothing does.
export function instRefs(store, id) {
  const accounts = store.accounts.filter(a => a.instId === id).length;
  const cards = store.cards.filter(c => c.instId === id).length;
  return { accounts, cards, total: accounts + cards };
}

// A transaction's full financial effect, as a plain list — proves an edit
// reverses the old effect and applies the new one.
export function effectsOf(t) {
  const out = [];
  if (t.status === 'pending') return out;
  if (t.type === 'transfer') {
    if (t.accountId) out.push({ kind: 'account', id: t.accountId, delta: -(t.amount + (t.fee || 0)) });
    if (t.toAccountId) out.push({ kind: 'account', id: t.toAccountId, delta: t.amount });
    if (t.toCardId) out.push({ kind: 'card', id: t.toCardId, delta: -t.amount });
    return out;
  }
  if (t.type === 'expense') {
    if (t.cardId) out.push({ kind: 'card', id: t.cardId, delta: t.amount });
    else if (t.accountId) out.push({ kind: 'account', id: t.accountId, delta: -t.amount });
  } else if (t.type === 'refund') {
    if (t.cardId) out.push({ kind: 'card', id: t.cardId, delta: -t.amount });
    else if (t.accountId) out.push({ kind: 'account', id: t.accountId, delta: t.amount });
  } else if (t.type === 'cardAdjustment' && t.cardId) out.push({ kind: 'card', id: t.cardId, delta: t.amount });
  else if (t.type === 'income' && t.accountId) out.push({ kind: 'account', id: t.accountId, delta: t.amount });
  else if (t.type === 'adjustment' && t.accountId) out.push({ kind: 'account', id: t.accountId, delta: t.amount });
  return out;
}

// Relative time for "Edited" labels.
export function relTime(iso, now) {
  const then = new Date(iso), ref = now ? new Date(now) : new Date();
  const mins = Math.round((ref - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + ' min ago';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + (hrs === 1 ? ' hour' : ' hours') + ' ago';
  return 'on ' + shortDate(iso);
}

// ---------------------------------------------------------------------------
// Budgets — a budget is ONE standing monthly amount applied to every month.
// Rollover and month-on-month comparison are derived from transaction history,
// never from stored per-month budget rows. (Design iteration 002.)
// ---------------------------------------------------------------------------
export function prevMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
// A category marked excludeFromBudget holds advances/recoverable money: full cash
// impact, zero budget impact (feature 2026-08-04).
export function isExcludedCat(store, id) {
  const c = catById(store, id);
  return !!(c && c.excludeFromBudget);
}
// Signed contribution of ONE transaction to budget spending — the single place
// budget-impact rules live, so transaction-level reimbursables can slot in later.
// opts.includeExcluded flips the Budgets screen into its gross "cash outflow" view.
export function txBudgetImpact(store, t, opts) {
  if (t.status === 'pending') return 0;
  const skip = !(opts && opts.includeExcluded);
  if (t.type === 'expense') return skip && isExcludedCat(store, t.category) ? 0 : t.amount;
  if (t.type === 'refund') return skip && isExcludedCat(store, t.category) ? 0 : -t.amount;
  if (t.type === 'transfer') return t.fee || 0; // fees count as spending; transfers have no category
  return 0; // income, adjustment, cardAdjustment, card payments
}
// The overall budget's basis — deliberately NOT monthMetrics().expenses, which
// stays cash-based for the dashboard and includes excluded categories.
export function monthBudgetSpending(store, month, opts, now) {
  return store.transactions.filter(t => inMonth(t, month) && hasOccurred(t, now)).reduce((s, t) => s + txBudgetImpact(store, t, opts), 0);
}
// What a budget is measured against: one category, or every expense for the overall budget.
export function budgetSpent(store, budget, month, opts, now) {
  if (!budget.category) return monthBudgetSpending(store, month, opts, now);
  const net = store.transactions
    .filter(t => inMonth(t, month) && t.category === budget.category && hasOccurred(t, now))
    .reduce((s, t) => s + txBudgetImpact(store, t, opts), 0);
  return Math.max(net, 0);
}
// Last month's unspent amount, carried forward only when the budget opts in.
// Never negative — an overspend does not become this month's debt.
export function budgetRollover(store, budget, month, opts, now) {
  if (!budget.rollover) return 0;
  return Math.max(0, budget.amount - budgetSpent(store, budget, prevMonth(month), opts, now));
}
export function effectiveBudget(store, budget, month, opts, now) {
  return budget.amount + budgetRollover(store, budget, month, opts, now);
}
// Straight-line pace projection. Only meaningful for a month still in progress,
// and only once enough of it has elapsed for the pace to mean anything.
export function budgetProjection(month, spent, nowIso) {
  if (String(nowIso).slice(0, 7) !== month) return null;
  const day = new Date(nowIso).getDate(), total = daysInMonth(month);
  if (day < 3 || spent <= 0) return null;
  return { projected: Math.round(spent / day * total), dayOf: day, total };
}
// Expense categories with spending this month and no budget attached. Excluded
// categories never appear here — in the gross view they get their own
// "Recoverable spending" section instead.
export function unbudgetedSpend(store, month, now) {
  const budgeted = store.budgets.filter(b => b.category).map(b => b.category);
  return categorySpending(store, month, null, now)
    .filter(x => x.cat && x.cat.type === 'expense' && budgeted.indexOf(x.id) < 0 && !x.cat.excludeFromBudget)
    .map(x => ({ id: x.id, name: x.cat.name, amt: x.amt, cat: x.cat }));
}

/**
 * Recoverable spending — per excluded category, cleared money paid out vs
 * returned in the viewed month. `outstanding` never shows below zero (a
 * refund larger than the month's advances is not a debt owed to you twice);
 * `net` (Σpaid − Σreturned, floored at 0) feeds the hero's
 * "Includes Rs X of recoverable spending" note. Month-scoped on purpose:
 * a September repayment of an August advance belongs to September's view.
 *
 * ── USER CONTRIBUTION CHECKPOINT (learning mode) ─────────────────────────────
 * Decision: WHICH excluded categories appear as rows?
 *   Option A (current provisional default): only categories with activity
 *     (paid or returned > 0) in the viewed month — quiet months stay clean,
 *     but an advance still outstanding from July disappears from August's list.
 *   Option B: any category with nonzero outstanding this month OR earlier
 *     (cumulative) — tracks open advances across months, closer to a
 *     receivables ledger, at the cost of the month-scoped simplicity above.
 *   Option C: every excluded category, always — most predictable, most noise.
 * To change the policy, edit the `.filter` below (~5 lines).
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function recoverableSpending(store, month, now) {
  const rows = store.categories
    .filter(c => c.type === 'expense' && c.excludeFromBudget && c.status !== 'archived')
    .map(c => {
      const mtx = store.transactions.filter(t => inMonth(t, month) && t.status !== 'pending' && t.category === c.id && hasOccurred(t, now));
      const paid = mtx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      const returned = mtx.filter(t => t.type === 'refund').reduce((s, t) => s + t.amount, 0);
      return { id: c.id, name: c.name, cat: c, paid, returned, outstanding: Math.max(paid - returned, 0) };
    })
    .filter(r => r.paid > 0 || r.returned > 0) // contribution checkpoint: Option A
    .sort((a, b) => b.outstanding - a.outstanding || b.paid - a.paid);
  const paid = rows.reduce((s, r) => s + r.paid, 0);
  const returned = rows.reduce((s, r) => s + r.returned, 0);
  return { rows, paid, returned, net: Math.max(paid - returned, 0) };
}
