// Pure data-store actions: every function takes the current data store (and a payload)
// and returns a NEW store. The reducer in StoreProvider applies them immutably.
// Ported from the prototype's submit handlers; the month-rollover logic is new (real-date layer).
import { accountBalance, cardOutstanding } from '../lib/calc.js';
import { addMonths, clampDay, currentMonth, nowIso, todayStr } from '../lib/dates.js';
import { uid } from '../lib/util.js';
import { makeAudit, diffFields, stampUpdate } from './audit.js';
import { freshStore } from './seed.js';

export const resetAll = () => freshStore();

// Fields that participate in transaction update-audit diffs.
const TX_AUDIT_FIELDS = ['type', 'amount', 'date', 'status', 'accountId', 'toAccountId', 'cardId', 'toCardId', 'category', 'merchant', 'notes', 'fee', 'adjustmentReason'];

// Build a transaction record from scratch from the form — used by add AND edit,
// so a type change can never leave stale cross-type fields behind (design buildTx).
export function buildTx(f, type, amt, fee, catId, id) {
  const date = (f.date || todayStr()) + 'T' + (f.time || '12:00');
  const status = f.pending ? 'pending' : 'cleared';
  const t = { id: id || uid(), date, status, notes: f.notes || '', merchant: f.merchant || '' };
  if (type === 'expense' || type === 'refund') {
    t.type = type; t.amount = amt; t.category = catId;
    if (String(f.payWith).startsWith('card:')) t.cardId = f.payWith.slice(5); else t.accountId = f.payWith.slice(4);
  } else if (type === 'income') { t.type = 'income'; t.amount = amt; t.category = catId; t.accountId = f.account.slice(4); }
  else if (type === 'transfer') {
    t.type = 'transfer'; t.amount = amt; t.accountId = f.from.slice(4);
    // Destination may be a bank account or a credit card (bill payment).
    if (String(f.to).startsWith('card:')) { t.toCardId = f.to.slice(5); t.isCardPayment = true; }
    else t.toAccountId = f.to.slice(4);
    if (fee > 0) t.fee = fee;
  } else if (type === 'adjustment') {
    t.type = 'adjustment'; t.amount = f.direction === 'decrease' ? -amt : amt; t.accountId = f.account.slice(4);
    t.merchant = 'Balance adjustment'; t.adjustmentReason = f.reason || ''; t.notes = f.notes || '';
  }
  return t;
}

// Inline "__new" category creation shared by add/update — full v2 category record.
function resolveCategory(next, f, type) {
  let catId = f.category;
  if (catId === '__new') {
    catId = uid();
    next.categories = [...next.categories, {
      id: catId, name: f.newCat.trim(), type: type === 'income' ? 'income' : 'expense',
      color: '#0F766E', icon: 'square', sortOrder: 99, isSystem: false, status: 'active', description: '',
    }];
  }
  return catId;
}

// payload: validated addTx form + { amt, fee } parsed amounts.
export function addTransaction(data, { form: f, type, amt, fee }) {
  const next = { ...data, transactions: [...data.transactions], recurring: data.recurring.map(r => ({ ...r })) };
  const catId = resolveCategory(next, f, type);
  const t = buildTx(f, type, amt, fee, catId);
  next.transactions = [t, ...next.transactions];
  if (f.fromRecurring) {
    next.recurring = next.recurring.map(r => (r.id === f.fromRecurring ? { ...r, doneThisMonth: true } : r));
  }
  next.audit = [makeAudit({ entityType: 'transaction', entityId: t.id, action: 'create', summary: 'Recorded ' + t.type, after: { type: t.type, amount: t.amount, date: t.date } }), ...(next.audit || [])];
  return next;
}

// Edit: rebuild the record from scratch onto the same id, stamp it, audit the field diff.
export function updateTransaction(data, { form: f, type, amt, fee }) {
  const i = data.transactions.findIndex(t => t.id === f.editId);
  if (i < 0) return data;
  const before = data.transactions[i];
  const next = { ...data, transactions: [...data.transactions] };
  const catId = resolveCategory(next, f, type);
  const rebuilt = stampUpdate({ ...buildTx(f, type, amt, fee, catId, before.id), editCount: before.editCount || 0 });
  next.transactions[i] = rebuilt;
  const d = diffFields(before, rebuilt, TX_AUDIT_FIELDS);
  next.audit = [makeAudit({ entityType: 'transaction', entityId: before.id, action: 'update', summary: 'Edited ' + rebuilt.type + (d.keys.length ? ' (' + d.keys.join(', ') + ')' : ''), before: d.before, after: d.after }), ...(next.audit || [])];
  return next;
}

export function deleteTransaction(data, { id }) {
  const t = data.transactions.find(x => x.id === id);
  if (!t) return data;
  return {
    ...data,
    transactions: data.transactions.filter(x => x.id !== id),
    audit: [makeAudit({ entityType: 'transaction', entityId: id, action: 'delete', summary: 'Deleted ' + t.type + ' of ' + t.amount, before: { type: t.type, amount: t.amount, date: t.date, merchant: t.merchant } }), ...(data.audit || [])],
  };
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

// Target-value balance correction: you type what the bank actually shows; the
// signed delta becomes a labelled adjustment transaction.
export function adjustBalance(data, { accountId, delta, reason, date, currentBalance }) {
  const acc = data.accounts.find(a => a.id === accountId);
  if (!acc || !delta) return data;
  const t = {
    id: uid(), type: 'adjustment', amount: delta, accountId,
    date: (date || todayStr()) + 'T12:00', status: 'cleared',
    merchant: 'Balance adjustment', adjustmentReason: reason.trim(), notes: '',
  };
  return {
    ...data,
    transactions: [t, ...data.transactions],
    audit: [makeAudit({
      entityType: 'account', entityId: accountId, action: 'adjust-balance',
      summary: 'Corrected balance on ' + acc.nickname,
      before: { balance: currentBalance },
      after: { balance: currentBalance + delta, adjustment: delta, transactionId: t.id },
    }), ...(data.audit || [])],
  };
}

export function setAccountStatus(data, { accountId, status }) {
  const acc = data.accounts.find(a => a.id === accountId);
  if (!acc) return data;
  const patched = stampUpdate({
    ...acc, status,
    archivedAt: status === 'archived' ? nowIso() : undefined,
  });
  if (status !== 'archived') delete patched.archivedAt;
  return {
    ...data,
    accounts: data.accounts.map(a => (a.id === accountId ? patched : a)),
    audit: [makeAudit({
      entityType: 'account', entityId: accountId,
      action: status === 'active' ? 'restore' : 'archive',
      summary: (status === 'active' ? 'Restored ' : 'Archived ') + acc.nickname,
      before: { status: acc.status }, after: { status },
    }), ...(data.audit || [])],
  };
}

const ACC_AUDIT_FIELDS = ['instId', 'nickname', 'type', 'islamic', 'currency', 'last4', 'notes', 'status'];

// Edit account metadata (balance is NEVER edited here — Adjust balance owns that).
export function updateAccount(data, { form: f }) {
  const i = data.accounts.findIndex(a => a.id === f.editId);
  if (i < 0) return data;
  const before = data.accounts[i];
  const next = { ...data, accounts: [...data.accounts], institutions: data.institutions };
  let instId = f.inst;
  if (instId === '__custom') {
    instId = uid();
    next.institutions = [...next.institutions, { id: instId, name: f.customInst.trim(), kind: 'Custom' }];
  }
  const status = f.status || before.status;
  const patched = stampUpdate({
    ...before, instId, nickname: f.nickname.trim(), type: f.type || before.type,
    islamic: f.islamic === 'islamic', last4: f.last4 || '', notes: f.notes || '', status,
    archivedAt: status === 'archived' ? (before.archivedAt || nowIso()) : undefined,
  });
  if (status !== 'archived') delete patched.archivedAt;
  next.accounts[i] = patched;
  const d = diffFields(before, patched, ACC_AUDIT_FIELDS);
  next.audit = [makeAudit({ entityType: 'account', entityId: before.id, action: 'update', summary: 'Edited account ' + patched.nickname + (d.keys.length ? ' (' + d.keys.join(', ') + ')' : ''), before: d.before, after: d.after }), ...(next.audit || [])];
  return next;
}

const CARD_AUDIT_FIELDS = ['instId', 'nickname', 'type', 'network', 'tier', 'last4', 'status', 'limit', 'statementDay', 'dueDate', 'linkedAccountId', 'annualFeeMonth', 'theme'];

// Edit card metadata; type-specific fields are pruned so a debit card carries no
// credit fields and vice versa. Outstanding is corrected via adjustCardOutstanding.
export function updateCard(data, { form: f, ctype, limit }) {
  const i = data.cards.findIndex(c => c.id === f.editId);
  if (i < 0) return data;
  const before = data.cards[i];
  const status = f.status || before.status;
  const patched = stampUpdate({
    ...before, instId: f.inst, nickname: f.nickname.trim(), type: ctype,
    network: f.network || before.network, tier: f.tier || '', last4: f.last4 || '',
    annualFeeMonth: f.annualFeeMonth || undefined, theme: f.theme || before.theme || 'teal',
    status, closedAt: status === 'closed' ? (before.closedAt || nowIso()) : undefined,
  });
  if (status !== 'closed') delete patched.closedAt;
  if (ctype === 'credit') {
    patched.limit = limit;
    patched.statementDay = parseInt(f.stmtDay, 10) || 25;
    patched.dueDate = f.due || '';
    delete patched.linkedAccountId;
    if (!patched.openingOutstanding) patched.openingOutstanding = { [currentMonth()]: 0 };
  } else {
    patched.linkedAccountId = f.linked ? f.linked.slice(4) : '';
    delete patched.limit; delete patched.statementDay; delete patched.dueDate;
  }
  const next = { ...data, cards: [...data.cards] };
  next.cards[i] = patched;
  const d = diffFields(before, patched, CARD_AUDIT_FIELDS);
  next.audit = [makeAudit({ entityType: 'card', entityId: before.id, action: 'update', summary: 'Edited card ' + patched.nickname + (d.keys.length ? ' (' + d.keys.join(', ') + ')' : ''), before: d.before, after: d.after }), ...(next.audit || [])];
  return next;
}

// "Correct outstanding": records a signed cardAdjustment transaction for the delta
// between the recorded outstanding and what the statement actually shows.
export function adjustCardOutstanding(data, { cardId, delta, reason, date, currentOutstanding }) {
  const card = data.cards.find(c => c.id === cardId);
  if (!card || !delta) return data;
  const t = {
    id: uid(), type: 'cardAdjustment', amount: delta, cardId,
    date: (date || todayStr()) + 'T12:00', status: 'cleared',
    merchant: 'Outstanding correction', adjustmentReason: reason.trim(), notes: '',
  };
  return {
    ...data,
    transactions: [t, ...data.transactions],
    cards: data.cards.map(c => (c.id === cardId ? stampUpdate(c) : c)),
    audit: [makeAudit({
      entityType: 'card', entityId: cardId, action: 'adjust-outstanding',
      summary: 'Corrected outstanding on ' + card.nickname,
      before: { outstanding: currentOutstanding },
      after: { outstanding: currentOutstanding + delta, adjustment: delta, transactionId: t.id },
    }), ...(data.audit || [])],
  };
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

// ---- Categories (design v2 CRUD) -------------------------------------------

const CAT_AUDIT_FIELDS = ['name', 'type', 'icon', 'color', 'description', 'sortOrder'];

// Create or edit a category; budget (monthly amount or '') upserts/removes the
// matching budgets row in the same atomic store transition.
export function upsertCategory(data, { form: f, budgetAmt }) {
  const editing = !!f.editId;
  const next = { ...data, categories: [...data.categories], budgets: [...data.budgets] };
  let id = f.editId;
  let before = null;
  if (editing) {
    const i = next.categories.findIndex(c => c.id === id);
    if (i < 0) return data;
    before = next.categories[i];
    next.categories[i] = stampUpdate({
      ...before, name: f.name.trim(), type: f.type, icon: f.icon || 'square',
      color: f.color || '#0F766E', description: (f.description || '').trim(),
      sortOrder: parseInt(f.sortOrder, 10) || 99,
    });
  } else {
    id = uid();
    next.categories.push({
      id, name: f.name.trim(), type: f.type, icon: f.icon || 'square', color: f.color || '#0F766E',
      description: (f.description || '').trim(), sortOrder: parseInt(f.sortOrder, 10) || 99,
      isSystem: false, status: 'active',
    });
  }
  // Budget upsert keyed on category
  const bi = next.budgets.findIndex(b => b.category === id);
  if (budgetAmt > 0) {
    if (bi >= 0) next.budgets[bi] = { ...next.budgets[bi], amount: budgetAmt };
    else next.budgets.push({ id: uid(), category: id, amount: budgetAmt });
  } else if (bi >= 0) {
    next.budgets.splice(bi, 1);
  }
  if (editing) {
    const after = next.categories.find(c => c.id === id);
    const d = diffFields(before, after, CAT_AUDIT_FIELDS);
    next.audit = [makeAudit({ entityType: 'category', entityId: id, action: 'update', summary: 'Edited category ' + after.name + (d.keys.length ? ' (' + d.keys.join(', ') + ')' : ''), before: d.before, after: d.after }), ...(next.audit || [])];
  } else {
    next.audit = [makeAudit({ entityType: 'category', entityId: id, action: 'create', summary: 'Created category ' + f.name.trim(), after: { name: f.name.trim(), type: f.type } }), ...(next.audit || [])];
  }
  return next;
}

export function archiveCategory(data, { id }) {
  const cat = data.categories.find(c => c.id === id);
  if (!cat) return data;
  return {
    ...data,
    categories: data.categories.map(c => (c.id === id ? stampUpdate({ ...c, status: 'archived', archivedAt: nowIso() }) : c)),
    audit: [makeAudit({ entityType: 'category', entityId: id, action: 'archive', summary: 'Archived category ' + cat.name, before: { status: cat.status }, after: { status: 'archived' } }), ...(data.audit || [])],
  };
}

export function restoreCategory(data, { id }) {
  const cat = data.categories.find(c => c.id === id);
  if (!cat) return data;
  return {
    ...data,
    categories: data.categories.map(c => {
      if (c.id !== id) return c;
      const restored = stampUpdate({ ...c, status: 'active' });
      delete restored.archivedAt;
      return restored;
    }),
    audit: [makeAudit({ entityType: 'category', entityId: id, action: 'restore', summary: 'Restored category ' + cat.name, before: { status: cat.status }, after: { status: 'active' } }), ...(data.audit || [])],
  };
}

// Hard delete — allowed only for unused custom categories (deletePolicy 'delete').
export function deleteCategory(data, { id }) {
  const cat = data.categories.find(c => c.id === id);
  if (!cat || cat.isSystem) return data;
  const used = data.transactions.some(t => t.category === id) || data.budgets.some(b => b.category === id) || data.recurring.some(r => r.category === id);
  if (used) return data; // policy violation — caller should have offered reassign
  return {
    ...data,
    categories: data.categories.filter(c => c.id !== id),
    audit: [makeAudit({ entityType: 'category', entityId: id, action: 'delete', summary: 'Deleted category ' + cat.name, before: { name: cat.name, type: cat.type } }), ...(data.audit || [])],
  };
}

// Reassign-then-delete: repoint every reference, then remove the category — one
// store transition. The differ pushes the repoints (upserts) BEFORE the delete,
// keeping the server FK-safe; not one DB transaction, converges on retry.
export function reassignDeleteCategory(data, { id, replacementId }) {
  const cat = data.categories.find(c => c.id === id);
  const repl = data.categories.find(c => c.id === replacementId);
  if (!cat || !repl || cat.isSystem || id === replacementId) return data;
  const moved = {
    transactions: data.transactions.filter(t => t.category === id).length,
    budgets: data.budgets.filter(b => b.category === id).length,
    recurring: data.recurring.filter(r => r.category === id).length,
  };
  // Budgets are unique per category: if the replacement already has one, the
  // source's budget is dropped rather than repointed (the replacement's own
  // budget continues to apply).
  const replacementHasBudget = data.budgets.some(b => b.category === replacementId);
  return {
    ...data,
    transactions: data.transactions.map(t => (t.category === id ? { ...t, category: replacementId } : t)),
    budgets: replacementHasBudget
      ? data.budgets.filter(b => b.category !== id)
      : data.budgets.map(b => (b.category === id ? { ...b, category: replacementId } : b)),
    recurring: data.recurring.map(r => (r.category === id ? { ...r, category: replacementId } : r)),
    categories: data.categories.filter(c => c.id !== id),
    audit: [makeAudit({
      entityType: 'category', entityId: id, action: 'reassign-delete',
      summary: 'Deleted ' + cat.name + ' — ' + (moved.transactions + moved.budgets + moved.recurring) + ' reference(s) moved to ' + repl.name,
      before: { name: cat.name, refs: moved }, after: { replacementId, replacementName: repl.name },
    }), ...(data.audit || [])],
  };
}
