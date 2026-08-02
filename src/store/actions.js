// Pure data-store actions: every function takes the current data store (and a payload)
// and returns a NEW store. The reducer in StoreProvider applies them immutably.
// Ported from the prototype's submit handlers; the month-rollover logic is new (real-date layer).
import { accountBalance, cardOutstanding } from '../lib/calc.js';
import { addMonths, clampDay, currentMonth, nowIso, todayStr } from '../lib/dates.js';
import { uid } from '../lib/util.js';
import { freshStore } from './seed.js';

export const resetAll = () => freshStore();

// ---- Submit mutations, ported from the prototype's submit* handlers (script 1250-1367).
// Validation happens in each drawer's useSubmit; these receive already-validated input
// and return a new store. All are pure (data, payload) => newData.

// payload: validated addTx form + { amt, fee } parsed amounts.
export function addTransaction(data, { form: f, type, amt, fee }) {
  const next = { ...data, transactions: [...data.transactions], categories: [...data.categories], recurring: data.recurring.map(r => ({ ...r })) };
  let catId = f.category;
  if (catId === '__new') {
    const nid = uid();
    next.categories.push({ id: nid, name: f.newCat.trim(), type: type === 'income' ? 'income' : 'expense', color: '#0F766E' });
    catId = nid;
  }
  const date = (f.date || todayStr()) + 'T12:00';
  const status = f.pending ? 'pending' : 'cleared';
  const t = { id: uid(), date, status, notes: f.notes || '', merchant: f.merchant || '' };
  if (type === 'expense' || type === 'refund') {
    t.type = type; t.amount = amt; t.category = catId;
    if (String(f.payWith).startsWith('card:')) t.cardId = f.payWith.slice(5); else t.accountId = f.payWith.slice(4);
  } else if (type === 'income') { t.type = 'income'; t.amount = amt; t.category = catId; t.accountId = f.account.slice(4); }
  else if (type === 'transfer') { t.type = 'transfer'; t.amount = amt; t.accountId = f.from.slice(4); t.toAccountId = f.to.slice(4); if (fee > 0) t.fee = fee; }
  else if (type === 'adjustment') { t.type = 'adjustment'; t.amount = f.direction === 'decrease' ? -amt : amt; t.accountId = f.account.slice(4); t.merchant = 'Balance adjustment'; t.notes = f.reason + (f.notes ? ' — ' + f.notes : ''); }
  next.transactions = [t, ...next.transactions];
  if (f.fromRecurring) {
    next.recurring = next.recurring.map(r => (r.id === f.fromRecurring ? { ...r, doneThisMonth: true } : r));
  }
  return next;
}

// payload: validated addAccount form + parsed bal. Seeds a pending opening snapshot.
export function addAccount(data, { form: f, bal }) {
  const next = { ...data, institutions: [...data.institutions], accounts: [...data.accounts], snapshots: [...data.snapshots] };
  let instId = f.inst;
  if (instId === '__custom') {
    instId = uid();
    next.institutions.push({ id: instId, name: f.customInst.trim(), kind: 'Custom' });
  }
  const id = uid();
  next.accounts.push({ id, instId, nickname: f.nickname.trim(), type: f.type || 'Current', islamic: f.islamic === 'islamic', currency: 'PKR', last4: f.last4 || '', status: 'active', notes: f.notes || '', createdAt: f.asof || todayStr() });
  next.snapshots.push({ month: currentMonth(), accountId: id, amount: bal, status: 'pending' });
  return next;
}

// payload: validated addCard form + resolved product/type/limit.
export function addCard(data, { form: f, prod, ctype, limit }) {
  const month = currentMonth();
  const card = {
    id: uid(), instId: f.inst, productId: prod ? prod.id : null, nickname: f.nickname.trim(), type: ctype,
    network: prod ? prod.network : (f.network || 'Visa'), tier: prod ? prod.tier : (f.tier || ''),
    last4: f.last4 || '', status: 'active', theme: ['teal', 'ink', 'warm'][data.cards.length % 3],
    openingOutstanding: { [month]: 0 },
  };
  if (ctype === 'credit') { card.limit = limit; card.statementDay = parseInt(f.stmtDay, 10) || 25; card.dueDate = f.due || ''; }
  else card.linkedAccountId = f.linked ? f.linked.slice(4) : '';
  return { ...data, cards: [...data.cards, card] };
}

// payload: { cardId, cardName, from, amt, date } — card payment is a transfer, never an expense.
export function payCard(data, { cardId, cardName, from, amt, date }) {
  const t = {
    id: uid(), type: 'transfer', amount: amt, accountId: from.slice(4), toCardId: cardId, isCardPayment: true,
    date: (date || todayStr()) + 'T12:00', status: 'cleared', merchant: (cardName || 'Card') + ' payment', notes: 'Credit card payment',
  };
  return { ...data, transactions: [t, ...data.transactions] };
}

// payload: { values: { [accountId]: amount } } — confirm all opening snapshots for the
// current month. Confirmed snapshots are immutable: a correction keeps the original in
// `history` and marks the row `corrected`.
export function confirmSnapshots(data, { values }) {
  const month = currentMonth();
  const next = { ...data, snapshots: data.snapshots.map(s => ({ ...s })) };
  Object.entries(values).forEach(([accountId, val]) => {
    const snap = next.snapshots.find(x => x.accountId === accountId && x.month === month);
    if (snap) {
      if (snap.status === 'confirmed' && snap.amount !== val) {
        snap.history = (snap.history || []).concat([{ amount: snap.amount, confirmedAt: snap.confirmedAt }]);
        snap.corrected = true;
      }
      snap.amount = val; snap.status = 'confirmed'; snap.confirmedAt = nowIso();
    } else {
      next.snapshots.push({ month, accountId, amount: val, status: 'confirmed', confirmedAt: nowIso() });
    }
  });
  return next;
}

// payload: { accountId, direction, amt, reason, date }
export function adjustBalance(data, { accountId, direction, amt, reason, date }) {
  const t = {
    id: uid(), type: 'adjustment', amount: direction === 'decrease' ? -amt : amt, accountId,
    date: (date || todayStr()) + 'T12:00', status: 'cleared', merchant: 'Balance adjustment', notes: reason.trim(),
  };
  return { ...data, transactions: [t, ...data.transactions] };
}

export function setAccountStatus(data, { accountId, status }) {
  return { ...data, accounts: data.accounts.map(a => (a.id === accountId ? { ...a, status } : a)) };
}

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
