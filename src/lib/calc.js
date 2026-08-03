// Raqam shared calculation + formatting utilities. All money in integer PKR.
// Ported verbatim from the Hisaab design prototype's calc.js — the financial correctness core.
const nf = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 });
export function fmtNum(n) { return nf.format(Math.round(Math.abs(n))); }
export function fmtPKR(n, masked) {
  if (masked) return 'Rs ••••••';
  return (n < 0 ? '−' : '') + 'Rs ' + fmtNum(n);
}
export function fmtSigned(n, masked) {
  if (masked) return 'Rs ••••••';
  return (n > 0 ? '+' : n < 0 ? '−' : '') + 'Rs ' + fmtNum(n);
}
export function fmtPct(x) { return x == null ? '—' : Math.round(x * 100) + '%'; }
const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
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

// Effect of a cleared transaction on a bank account balance.
export function accountDelta(t, accId) {
  if (t.status === 'pending') return 0;
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
export function cardDelta(t, cardId) {
  if (t.status === 'pending') return 0;
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
export function accountBalance(acc, store, month) {
  const open = openingOf(acc, store.snapshots, month);
  return open + store.transactions.filter(t => inMonth(t, month)).reduce((s, t) => s + accountDelta(t, acc.id), 0);
}
export function cardOutstanding(card, store, month) {
  if (card.type !== 'credit') return 0;
  const open = (card.openingOutstanding && card.openingOutstanding[month] != null) ? card.openingOutstanding[month] : (card.openingOutstanding ? Object.values(card.openingOutstanding).slice(-1)[0] || 0 : 0);
  return open + store.transactions.filter(t => inMonth(t, month)).reduce((s, t) => s + cardDelta(t, card.id), 0);
}
export function lastActivity(acc, store) {
  const tx = store.transactions.filter(t => t.accountId === acc.id || t.toAccountId === acc.id).sort((a, b) => b.date.localeCompare(a.date));
  return tx.length ? tx[0].date : acc.createdAt;
}

// Income = income tx. Expenses = expense tx (bank + card) + transfer fees − refunds. Transfers & card payments excluded.
export function monthMetrics(store, month) {
  const mtx = store.transactions.filter(t => inMonth(t, month) && t.status !== 'pending');
  const income = mtx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const refunds = mtx.filter(t => t.type === 'refund').reduce((s, t) => s + t.amount, 0);
  const gross = mtx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    + mtx.filter(t => t.type === 'transfer').reduce((s, t) => s + (t.fee || 0), 0);
  const expenses = gross - refunds;
  const net = income - expenses;
  const active = store.accounts.filter(a => a.status === 'active');
  const opening = active.reduce((s, a) => s + openingOf(a, store.snapshots, month), 0);
  const totalBank = active.reduce((s, a) => s + accountBalance(a, store, month), 0);
  const cardLiability = store.cards.filter(c => c.type === 'credit' && c.status !== 'closed').reduce((s, c) => s + cardOutstanding(c, store, month), 0);
  const pend = store.transactions.filter(t => inMonth(t, month) && t.status === 'pending');
  return {
    income, expenses, net, savings: Math.max(net, 0), rate: income > 0 ? net / income : null,
    opening, totalBank, change: totalBank - opening, cardLiability, netWorth: totalBank - cardLiability,
    pendingCount: pend.length, pendingTotal: pend.reduce((s, t) => s + t.amount, 0),
  };
}
export function categorySpending(store, month) {
  const map = {};
  store.transactions.filter(t => inMonth(t, month) && t.status !== 'pending').forEach(t => {
    if (t.type === 'expense') map[t.category] = (map[t.category] || 0) + t.amount;
    if (t.type === 'refund') map[t.category] = (map[t.category] || 0) - t.amount;
  });
  return Object.entries(map).map(([id, amt]) => ({ id, amt, cat: store.categories.find(c => c.id === id) }))
    .filter(x => x.amt > 0).sort((a, b) => b.amt - a.amt);
}
export function dailySpending(store, month) {
  const n = daysInMonth(month); const out = [];
  for (let d = 1; d <= n; d++) {
    const key = month + '-' + String(d).padStart(2, '0');
    const amt = store.transactions.filter(t => t.date.slice(0, 10) === key && t.status !== 'pending')
      .reduce((s, t) => s + (t.type === 'expense' ? t.amount : t.type === 'refund' ? -t.amount : 0), 0);
    out.push({ day: d, amt: Math.max(amt, 0) });
  }
  return out;
}
export function largestExpenses(store, month, n) {
  return store.transactions.filter(t => inMonth(t, month) && t.type === 'expense' && t.status !== 'pending')
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
// Duplicate check scoped to type, case-insensitive.
export function duplicateCat(store, { name, type, excludeId }) {
  const n = normalizeName(name);
  return store.categories.find(c => c.id !== excludeId && normalizeName(c.name) === n && c.type === type) || null;
}
// Everything that points at a category, so deletion can be explained precisely.
export function catRefs(store, id) {
  const transactions = store.transactions.filter(t => t.category === id).length;
  const budgets = store.budgets.filter(b => b.category === id).length;
  const recurring = store.recurring.filter(r => r.category === id).length;
  return { transactions, budgets, recurring, total: transactions + budgets + recurring };
}
export function catMonthTotal(store, id, month) {
  return store.transactions
    .filter(t => inMonth(t, month) && t.status !== 'pending' && t.category === id)
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
export function accountRefs(store, id, month) {
  const acc = store.accounts.find(a => a.id === id);
  return {
    balance: acc ? accountBalance(acc, store, month) : 0,
    cards: store.cards.filter(c => c.linkedAccountId === id && c.status !== 'closed').length,
    recurring: store.recurring.filter(r => r.accountId === id && r.status === 'active').length,
    pending: store.transactions.filter(t => t.status === 'pending' && (t.accountId === id || t.toAccountId === id)).length,
    transactions: store.transactions.filter(t => t.accountId === id || t.toAccountId === id).length,
  };
}
export function cardRefs(store, id, month) {
  const card = store.cards.find(c => c.id === id);
  return {
    outstanding: card ? cardOutstanding(card, store, month) : 0,
    recurring: store.recurring.filter(r => r.cardId === id && r.status === 'active').length,
    pending: store.transactions.filter(t => t.status === 'pending' && (t.cardId === id || t.toCardId === id)).length,
    transactions: store.transactions.filter(t => t.cardId === id || t.toCardId === id).length,
  };
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
