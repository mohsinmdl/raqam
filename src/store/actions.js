// Pure data-store actions: every function takes the current data store (and a payload)
// and returns a NEW store. The reducer in StoreProvider applies them immutably.
// Ported from the prototype's submit handlers; the month-rollover logic is new (real-date layer).
import { accountBalance, accountDeletePolicy, cardOutstanding, duplicateCat, moveCollision, normalizeName, INST_KINDS } from '../lib/calc.js';
import { addMonths, currentMonth, nowIso, nowIsoSec, todayStr } from '../lib/dates.js';
import { envelopeFor } from '../lib/envelope.js';
import { advanceDue, buildSchedule, nextOnOrAfter, presetSchedule, ruleFromTx } from '../lib/schedule.js';
import { uid } from '../lib/util.js';
import { parseAmt } from '../lib/format.js';
import { YNAB_TREE, OTHER_GROUP, ALIASES, normName } from '../lib/ynabTree.js';
import { payeeKey, matchesPayeeTx, payeeRecordFor } from '../lib/payees.js';
import { makeAudit, diffFields, stampUpdate } from './audit.js';
import { CATEGORIES, freshStore, PLAN_DATE_FORMATS, PLAN_DEFAULTS, PLAN_NUMBER_FORMATS, PLAN_PLACEMENTS } from './seed.js';
import { TARGET_MODES } from '../lib/targets.js';

// Reset re-seeds the default categories with FRESH ids (mirroring
// seedPlanCategories): the fixed catalogue ids belong to the migrated default
// plan, and re-inserting them from any OTHER open plan would upsert onto
// (user_id, id) and re-stamp the default plan's rows into this one.
export const resetAll = () => {
  const s = freshStore();
  return { ...s, categories: s.categories.map(c => ({ ...c, id: uid() })) };
};

// The category chosen alongside a brand-new custom bank's name. Unknown values
// fall back to 'Other' rather than writing a kind the schema would reject.
const instKindOf = f => (INST_KINDS.includes(f.customInstKind) ? f.customInstKind : 'Custom');

// Fields that participate in transaction update-audit diffs.
const TX_AUDIT_FIELDS = ['type', 'amount', 'date', 'status', 'accountId', 'toAccountId', 'cardId', 'toCardId', 'category', 'merchant', 'notes', 'fee', 'adjustmentReason'];

// Adjustments and card payments carry an effective DATE the user picks, not a
// moment in time. Dated today, the row should carry the real clock time: it is
// what the ledger displays, and it is what orders the row among the day's other
// entries. Dated any other day, a neutral midday is honest — nobody supplied a
// time, and inventing one would claim precision that does not exist.
//
// `now` is injected rather than read here so this stays pure and testable,
// matching the convention the money math uses.
export function stampFor(date, now) {
  const today = now.slice(0, 10);
  const d = date || today;
  return d === today ? now : d + 'T12:00';
}

// The timestamp a built transaction carries. Ordering on the register IS this
// value (date-desc), so a new entry made today must land on top with the real
// clock — to the SECOND, so rapid entries stay strictly ordered and drag can
// interpolate between them (0019 relaxes the DB CHECK to allow the ':ss').
//
//   - explicit time picked (WhenField sets timeTouched) → honor it, to the minute
//   - editing, day AND time untouched → keep the record's exact original stamp
//     (seconds included), so an unrelated edit never nudges the order
//   - brand-new, dated today, time untouched → nowIsoSec() → strictly on top
//   - anything else → the historical 'day T HH:mm' (a back-dated add keeps the
//     seeded clock it always used; no new precision is invented here)
// The stored-timestamp shape the DB CHECK enforces (0001, relaxed by 0019):
// 'YYYY-MM-DDTHH:mm' with optional ':ss'. Used to refuse a malformed reorder
// date before it can reach the store or the sync push.
const TX_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

function txDate(f) {
  const day = f.date || todayStr();
  if (f.timeTouched && f.time) return day + 'T' + f.time;
  if (f.editId && f.origDate && f.origDate.slice(0, 10) === day) return f.origDate;
  if (!f.editId && day === todayStr()) return nowIsoSec();
  return day + 'T' + (f.time || '12:00');
}

// Build a transaction record from scratch from the form — used by add AND edit,
// so a type change can never leave stale cross-type fields behind (design buildTx).
export function buildTx(f, type, amt, fee, catId, id) {
  const date = txDate(f);
  const status = f.pending ? 'pending' : 'cleared';
  const t = { id: id || uid(), date, status, notes: f.notes || '', merchant: f.merchant || '' };
  // Category is optional: '' must become undefined, not persist — sync's toRow
  // maps `r.category ?? null`, so an empty string would reach Supabase as
  // category_id '' (an FK violation) instead of SQL null.
  if (type === 'expense' || type === 'refund') {
    t.type = type; t.amount = amt; t.category = catId || undefined;
    if (String(f.payWith).startsWith('card:')) t.cardId = f.payWith.slice(5); else t.accountId = f.payWith.slice(4);
  } else if (type === 'income') { t.type = 'income'; t.amount = amt; t.category = catId || undefined; t.accountId = f.account.slice(4); }
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
    const catType = type === 'income' ? 'income' : 'expense';
    const groupId = f.newCatGroup || null;
    // Reuse an existing same-(type, group, name) category rather than minting a
    // duplicate — the validators block this at the UI, so this is the reducer
    // backstop that keeps an unvalidated caller from 23505-ing the sync (0018).
    const dup = duplicateCat(next, { name: f.newCat.trim(), type: catType, groupId });
    if (dup) return dup.id;
    catId = uid();
    next.categories = [...next.categories, {
      id: catId, name: f.newCat.trim(), type: catType,
      groupId,
      color: '#0F766E', icon: 'square', sortOrder: 99, isSystem: false, status: 'active', description: '',
    }];
  }
  return catId;
}

// payload: validated addTx form + { amt, fee } parsed amounts. `id` is optional:
// the caller may inject it so it can flash the new row immediately (see TxForm);
// omitted, buildTx mints one.
export function addTransaction(data, { form: f, type, amt, fee, id }) {
  const next = { ...data, transactions: [...data.transactions], recurring: data.recurring.map(r => ({ ...r })) };
  const catId = resolveCategory(next, f, type);
  const t = buildTx(f, type, amt, fee, catId, id);
  next.transactions = [t, ...next.transactions];
  next.audit = [makeAudit({ entityType: 'transaction', entityId: t.id, action: 'create', summary: 'Recorded ' + t.type, after: { type: t.type, amount: t.amount, date: t.date } }), ...(next.audit || [])];
  if (f.fromRecurring) markOccurrenceRecorded(next, f, t, amt);
  applyRepeat(next, f, t, amt, catId);
  return next;
}

// Split expense: N ordinary expense legs linked by one splitId, saved in a
// single call — one undo step, one sync push, one audit entry. Legs reuse
// buildTx so every cross-type rule stays in one place; the budget/balance
// engine never reads splitId (only display code does). No repeat/recurring
// integration by design (split mode hides Repeat).
export function addSplitTransaction(data, { form: f, legs, amt, ids }) {
  const next = { ...data, transactions: [...data.transactions] };
  const splitId = uid();
  const made = legs.map((leg, i) => {
    const catId = resolveCategory(next, { category: leg.category, newCat: leg.newCat, newCatGroup: leg.newCatGroup }, 'expense');
    // ids (optional) let the caller flash the new legs; falls back to a fresh uid.
    const t = buildTx(f, 'expense', parseAmt(leg.amount), 0, catId, ids && ids[i]);
    t.splitId = splitId;
    return t;
  });
  next.transactions = [...made, ...next.transactions];
  next.audit = [makeAudit({
    entityType: 'transaction', entityId: splitId, action: 'create',
    summary: 'Recorded split expense (' + legs.length + ' ways)',
    after: { type: 'expense', amount: amt, legs: legs.length, date: made[0].date },
  }), ...(next.audit || [])];
  return next;
}

// Recording an occurrence: log it against the due date it settles and advance
// the rule. Idempotent per due date — reopening the drawer for the same
// occurrence must not log it twice — and it only advances when the recorded
// occurrence is still the current one, so back-filling an older due date
// cannot drag the schedule backwards.
function markOccurrenceRecorded(next, f, t, amt) {
  const r = next.recurring.find(x => x.id === f.fromRecurring);
  if (!r) return;
  const due = f.recurringDue || r.nextDate;
  if (!due) return;
  const occ = Array.isArray(r.occurrences) ? r.occurrences : [];
  if (occ.some(o => o.due === due)) return;
  r.occurrences = [...occ, { due, outcome: 'recorded', amount: amt, txId: t.id, at: nowIso() }];
  if (r.nextDate === due) r.nextDate = advanceDue(r.schedule, due);
}

// A transaction becoming a series: the transaction itself is the first recorded
// occurrence, so it is seeded into the history and the rule's first due date is
// the one AFTER it. Shared by the Repeat preset (new and edited transactions)
// and by Make repeating from the Transactions row menu.
export function seedOccurrence(t, amt) {
  return { due: t.date.slice(0, 10), outcome: 'recorded', amount: amt, txId: t.id, at: nowIso() };
}

function ruleFromTransaction(next, t, amt, catId, schedule) {
  if (t.type !== 'expense' && t.type !== 'income') return;
  if (!schedule) return;
  const anchor = t.date.slice(0, 10);
  const cat = next.categories.find(c => c.id === catId);
  const id = uid();
  const rec = {
    id,
    name: (t.merchant || (cat && cat.name) || 'Recurring').slice(0, 60),
    type: t.type, amount: amt, estimated: false,
    schedule, nextDate: advanceDue(schedule, anchor),
    category: catId, status: 'active', autoPost: false,
    occurrences: [seedOccurrence(t, amt)],
  };
  if (t.cardId) rec.cardId = t.cardId;
  else if (t.accountId) rec.accountId = t.accountId;
  next.recurring = [...next.recurring, rec];
  next.audit = [makeAudit({
    entityType: 'recurring', entityId: id, action: 'create',
    summary: 'Recurring rule created from a transaction',
    after: { name: rec.name, amount: amt, schedule, nextDate: rec.nextDate },
  }), ...(next.audit || [])];
}

// Both transaction paths ask the same question: is a preset set, and has this
// transaction not already been turned into a rule?
function applyRepeat(next, f, t, amt, catId) {
  if (!f.repeat || f.repeat === 'never' || f.fromRecurring) return;
  if (ruleFromTx(next, t.id)) return;
  ruleFromTransaction(next, t, amt, catId, presetSchedule(f.repeat, t.date.slice(0, 10)));
}

// Edit: rebuild the record from scratch onto the same id, stamp it, audit the field diff.
export function updateTransaction(data, { form: f, type, amt, fee }) {
  const i = data.transactions.findIndex(t => t.id === f.editId);
  if (i < 0) return data;
  const before = data.transactions[i];
  // recurring is cloned too: Make repeating from the picker can add a rule here,
  // and it must not reach back into the store this action was given.
  const next = { ...data, transactions: [...data.transactions], recurring: [...data.recurring] };
  const catId = resolveCategory(next, f, type);
  const built = buildTx(f, type, amt, fee, catId, before.id);
  // buildTx never emits splitId (it builds add and edit records alike, and add
  // never has one to carry) — reattach it here or an edit silently unlinks the
  // leg from its split. A type change away from expense drops it on purpose:
  // a non-expense record can't be a split leg.
  if (type === 'expense' && before.splitId) built.splitId = before.splitId;
  const rebuilt = stampUpdate({ ...built, editCount: before.editCount || 0 });
  next.transactions[i] = rebuilt;
  const d = diffFields(before, rebuilt, TX_AUDIT_FIELDS);
  next.audit = [makeAudit({ entityType: 'transaction', entityId: before.id, action: 'update', summary: 'Edited ' + rebuilt.type + (d.keys.length ? ' (' + d.keys.join(', ') + ')' : ''), before: d.before, after: d.after }), ...(next.audit || [])];
  applyRepeat(next, f, rebuilt, amt, catId);
  return next;
}

// Deleting a transaction that recorded a rule occurrence un-records it: drop the
// occurrence and pull the rule's cursor back to that due date so the reminder
// returns — instead of leaving a "recorded" occurrence pointing at a gone
// transaction (the "Recorded · Transaction deleted" phantom). Rules with no
// affected occurrence are returned unchanged (same ref → no spurious sync write).
function revertRuleOccurrences(recurring, deletedIds) {
  return (recurring || []).map(r => {
    const occ = Array.isArray(r.occurrences) ? r.occurrences : [];
    const removed = occ.filter(o => o.txId && deletedIds.has(o.txId));
    if (removed.length === 0) return r;
    const kept = occ.filter(o => !(o.txId && deletedIds.has(o.txId)));
    const earliest = removed.map(o => o.due).sort()[0];
    const nextDate = r.nextDate && earliest && earliest < r.nextDate ? earliest : r.nextDate;
    return stampUpdate({ ...r, occurrences: kept, nextDate });
  });
}

export function deleteTransaction(data, { id }) {
  const t = data.transactions.find(x => x.id === id);
  if (!t) return data;
  return {
    ...data,
    transactions: data.transactions.filter(x => x.id !== id),
    recurring: revertRuleOccurrences(data.recurring, new Set([id])),
    audit: [makeAudit({ entityType: 'transaction', entityId: id, action: 'delete', summary: 'Deleted ' + t.type + ' of ' + t.amount, before: { type: t.type, amount: t.amount, date: t.date, merchant: t.merchant } }), ...(data.audit || [])],
  };
}

// "I paid this early." A transaction dated ahead of now sits in the Scheduled
// group and is kept out of every balance by hasOccurred(); if the money has in
// fact already moved, the honest fix is the date — the day it moved is the day
// it happened. So this action changes one field and nothing else. Leaving
// Scheduled, joining Recorded and starting to count are all consequences the
// presenters draw from that date, not extra state to keep in step.
//
// `now` is passed in rather than read here, matching the money math's
// convention (calc.js hasOccurred): a pure action stays testable without
// mocking the clock.
export function postTransactionNow(data, { id, now }) {
  const i = data.transactions.findIndex(x => x.id === id);
  if (i < 0) return data;
  const before = data.transactions[i];
  // Already in the past — nothing to bring forward. Same reference back, so a
  // double-click cannot re-stamp an edit or write a second audit row.
  if (!now || before.date <= now) return data;
  const after = stampUpdate({ ...before, date: now });
  const transactions = [...data.transactions];
  transactions[i] = after;
  return {
    ...data,
    transactions,
    audit: [makeAudit({
      entityType: 'transaction', entityId: before.id, action: 'update',
      summary: 'Posted now — moved from ' + before.date.slice(0, 10) + ' to today',
      before: { date: before.date }, after: { date: after.date },
    }), ...(data.audit || [])],
  };
}

// Drag-to-reorder result: set one row's timestamp to `date` (a moment the drop
// policy interpolated between its new neighbors, or one the user picked). Same
// one-field shape as postTransactionNow — the register re-derives order, day
// group, running balance and budget month from the date alone.
//
// A row can't sit in the future, so `date` is clamped to `now`. An unchanged
// date returns the same reference (no re-stamp, no spurious audit/sync write).
export function reorderTransaction(data, { id, date, now }) {
  const i = data.transactions.findIndex(x => x.id === id);
  // This is the one boundary every reorder path (interpolated auto-move AND the
  // picker) funnels through before the date reaches the store and the sync
  // queue, so it validates the SHAPE the DB CHECK (0019) enforces — not just a
  // falsy guard. A malformed 'NaN-…' or otherwise off-format string is refused
  // as a no-op rather than laundered into permanent state + the audit trail.
  if (i < 0 || !date || !TX_DATE_RE.test(date)) return data;
  const before = data.transactions[i];
  const clamped = now && date > now ? now : date;
  if (clamped === before.date) return data;
  const after = stampUpdate({ ...before, date: clamped });
  const transactions = [...data.transactions];
  transactions[i] = after;
  return {
    ...data,
    transactions,
    audit: [makeAudit({
      entityType: 'transaction', entityId: before.id, action: 'update',
      summary: 'Reordered — moved to ' + clamped.slice(0, 16).replace('T', ' '),
      before: { date: before.date }, after: { date: after.date },
    }), ...(data.audit || [])],
  };
}

// payload: validated addAccount form + parsed bal. Seeds a pending opening snapshot.
export function addAccount(data, { form: f, bal }) {
  const next = { ...data, institutions: [...data.institutions], accounts: [...data.accounts], snapshots: [...data.snapshots] };
  let instId = f.inst;
  if (instId === '__custom') {
    instId = uid();
    next.institutions.push({ id: instId, name: f.customInst.trim(), kind: instKindOf(f), own: true });
  }
  const id = uid();
  // No per-account Conventional/Islamic flag: an account takes its bank's category.
  next.accounts.push({ id, instId, nickname: f.nickname.trim(), type: f.type || 'Current', currency: 'PKR', last4: f.last4 || '', status: 'active', notes: f.notes || '', createdAt: f.asof || todayStr() });
  next.snapshots.push({ month: currentMonth(), accountId: id, amount: bal, status: 'pending' });
  return next;
}

// payload: validated addCard form + resolved product/type/limit.
export function addCard(data, { form: f, prod, ctype, limit }) {
  const month = currentMonth();
  const institutions = [...data.institutions];
  let instId = f.inst;
  if (instId === '__custom') { // a bank can now be created from the card drawer too
    instId = uid();
    institutions.push({ id: instId, name: f.customInst.trim(), kind: instKindOf(f), own: true });
  }
  const card = {
    id: uid(), instId, productId: prod ? prod.id : null, nickname: f.nickname.trim(), type: ctype,
    network: prod ? prod.network : (f.network || 'Visa'), tier: prod ? prod.tier : (f.tier || ''),
    last4: f.last4 || '', status: 'active', theme: ['teal', 'ink', 'warm'][data.cards.length % 3],
    openingOutstanding: { [month]: 0 },
  };
  if (ctype === 'credit') { card.limit = limit; card.statementDay = parseInt(f.stmtDay, 10) || 25; card.dueDate = f.due || ''; }
  else card.linkedAccountId = f.linked ? f.linked.slice(4) : '';
  return { ...data, institutions, cards: [...data.cards, card] };
}

// ---- Institutions (own rows only) ------------------------------------------
// A bank is ONE shared record: renaming or reclassifying it changes every
// account and card that points at it. Catalogue rows (no `own`) are read-only
// here and by RLS. No audit entry — this is display metadata, and audit_log's
// entity_type CHECK has no 'institution' value.
export function updateInstitution(data, { id, name, kind }) {
  const i = data.institutions.findIndex(x => x.id === id);
  if (i < 0 || !data.institutions[i].own) return data;
  const inst = data.institutions[i];
  const nextName = (name ?? inst.name).trim() || inst.name;
  const nextKind = INST_KINDS.includes(kind) ? kind : inst.kind;
  if (nextName === inst.name && nextKind === inst.kind) return data;
  const institutions = [...data.institutions];
  institutions[i] = { ...inst, name: nextName, kind: nextKind };
  return { ...data, institutions };
}

// Only ever offered for a bank nothing points at (see instRefs).
export function deleteInstitution(data, { id }) {
  const inst = data.institutions.find(x => x.id === id);
  if (!inst || !inst.own) return data;
  if (data.accounts.some(a => a.instId === id) || data.cards.some(c => c.instId === id)) return data;
  return { ...data, institutions: data.institutions.filter(x => x.id !== id) };
}

// payload: { cardId, cardName, from, amt, date } — card payment is a transfer, never an expense.
export function payCard(data, { cardId, cardName, from, amt, date }) {
  const t = {
    id: uid(), type: 'transfer', amount: amt, accountId: from.slice(4), toCardId: cardId, isCardPayment: true,
    date: stampFor(date, nowIso()), status: 'cleared', merchant: (cardName || 'Card') + ' payment', notes: 'Credit card payment',
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
export function adjustBalance(data, { accountId, delta, reason, date, currentBalance, merchant, notes }) {
  const acc = data.accounts.find(a => a.id === accountId);
  if (!acc || !delta) return data;
  const t = {
    id: uid(), type: 'adjustment', amount: delta, accountId,
    date: stampFor(date, nowIso()), status: 'cleared',
    // merchant/notes default to the generic adjustment labelling; callers such
    // as closeAccount override them to say why the adjustment exists.
    merchant: merchant || 'Balance adjustment', adjustmentReason: reason.trim(), notes: notes || '',
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

// Permanent removal of an archived account. Refuses while anything still points
// at it (accountDeletePolicy) — the same references the database's foreign keys
// would reject. Its opening snapshots go with it, mirroring the server cascade so
// local state matches immediately; the audit row outlives the account by design.
export function deleteAccountPermanently(data, { id }) {
  const acc = data.accounts.find(a => a.id === id);
  if (!acc || accountDeletePolicy(data, id).mode !== 'delete') return data;
  return {
    ...data,
    accounts: data.accounts.filter(a => a.id !== id),
    snapshots: data.snapshots.filter(s => s.accountId !== id),
    audit: [makeAudit({
      entityType: 'account', entityId: id, action: 'delete',
      summary: 'Deleted account ' + acc.nickname + ' permanently',
      before: { nickname: acc.nickname, instId: acc.instId, type: acc.type, status: acc.status },
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

// Close an account: zero its balance (when non-zero) with an adjustment, then
// mark it closed. One reducer → one undo step. `currentBalance` is supplied by
// the caller (already computed for the modal copy) so this stays pure.
export function closeAccount(data, { accountId, currentBalance }) {
  const hasBal = Math.abs(currentBalance) > 0.005;
  const zeroed = hasBal
    ? adjustBalance(data, { accountId, delta: -currentBalance, reason: 'Balance zeroed on account close', date: todayStr(), currentBalance, merchant: 'Manual Balance Adjustment', notes: 'Closed Account' })
    : data;
  return setAccountStatus(zeroed, { accountId, status: 'closed' });
}

const ACC_AUDIT_FIELDS = ['instId', 'nickname', 'type', 'currency', 'last4', 'notes', 'status'];

// Edit account metadata (balance is NEVER edited here — Adjust balance owns that).
export function updateAccount(data, { form: f }) {
  const i = data.accounts.findIndex(a => a.id === f.editId);
  if (i < 0) return data;
  const before = data.accounts[i];
  const next = { ...data, accounts: [...data.accounts], institutions: data.institutions };
  let instId = f.inst;
  if (instId === '__custom') {
    instId = uid();
    next.institutions = [...next.institutions, { id: instId, name: f.customInst.trim(), kind: instKindOf(f), own: true }];
  }
  const status = f.status || before.status;
  const patched = stampUpdate({
    ...before, instId, nickname: f.nickname.trim(), type: f.type || before.type,
    last4: f.last4 || '', notes: f.notes || '', status,
    archivedAt: status === 'archived' ? (before.archivedAt || nowIso()) : undefined,
  });
  delete patched.islamic; // retired: an account takes its bank's category
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
    date: stampFor(date, nowIso()), status: 'cleared',
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
  // A rule that lost its nextDate has to be re-materialised; a rule whose due
  // date has simply PASSED is deliberately left alone, so it keeps reading as
  // overdue until it is recorded or skipped. Nothing advances on its own.
  // Checked before the no-accounts bail-out — a card-funded rule needs this too.
  const unscheduled = data.recurring.filter(r => r.status === 'active' && !r.nextDate && r.schedule);
  if (active.length === 0 && unscheduled.length === 0) return data;
  const missing = active.filter(a => !data.snapshots.some(s => s.accountId === a.id && s.month === month));
  const cardsMissing = data.cards.filter(c => c.type === 'credit' && (!c.openingOutstanding || c.openingOutstanding[month] == null));
  if (missing.length === 0 && cardsMissing.length === 0 && unscheduled.length === 0) return data;

  const next = { ...data };

  // ── contribution block: pending-snapshot carry-forward policy (Option A default) ──
  if (missing.length > 0) {
    next.snapshots = [
      ...next.snapshots,
      ...missing.map(a => ({
        month,
        accountId: a.id,
        // Previous month's computed closing balance. Deliberately NOT date-
        // guarded: this is frozen into a snapshot and becomes the opening figure
        // every later month is measured from, so it must mean "the complete
        // month", never "the month as it looked at the moment of rollover".
        // As written, `prev` is always the month before the current one and so
        // entirely in the past, which means a guard would change nothing today.
        // That is a property of when this happens to run, not of what the value
        // means — and a frozen snapshot should not start depending on it.
        amount: accountBalance(a, data, prev),
        status: 'pending',
      })),
    ];
  }
  // ── end contribution block ──

  if (cardsMissing.length > 0) {
    next.cards = next.cards.map(c => {
      if (c.type !== 'credit' || (c.openingOutstanding && c.openingOutstanding[month] != null)) return c;
      // Not date-guarded, for the same reason as the account snapshot above.
      return { ...c, openingOutstanding: { ...(c.openingOutstanding || {}), [month]: cardOutstanding(c, data, prev) } };
    });
  }

  if (unscheduled.length > 0) {
    const ids = new Set(unscheduled.map(r => r.id));
    next.recurring = next.recurring.map(r => (
      ids.has(r.id) ? { ...r, nextDate: nextOnOrAfter(r.schedule, todayStr()) } : r
    ));
  }

  return next;
}

// ---- Bulk transaction actions ----------------------------------------------
//
// Narrow and id-keyed, unlike updateTransaction, which takes a whole drawer
// form and rebuilds each record from scratch — correct for an edit, unusable
// for "change the category on twenty rows". The shape follows
// reassignDeleteCategory: one pure pass over the collection.
//
// Auditing is one row per transaction, because makeAudit's entityId is singular
// and audit_log is append-only. A synthetic batch entity_type would be rejected
// by the CHECK constraint, so instead every row of a batch carries the same
// batchId in its `after` payload — enough to collapse the trail later, and free
// now. Retrofitting it once the table holds real data would not be.

const bulkIds = ids => new Set(Array.isArray(ids) ? ids : []);

function bulkAudit(rows, action, summary, batchId, payload) {
  return rows.map(t => makeAudit({
    entityType: 'transaction', entityId: t.id, action,
    summary, before: payload.before(t), after: { ...payload.after(t), batchId },
  }));
}

export function deleteTransactions(data, { ids }) {
  const set = bulkIds(ids);
  const hit = data.transactions.filter(t => set.has(t.id));
  if (hit.length === 0) return data;
  const batchId = uid();
  return {
    ...data,
    transactions: data.transactions.filter(t => !set.has(t.id)),
    recurring: revertRuleOccurrences(data.recurring, set),
    audit: [
      ...bulkAudit(hit, 'delete', 'Deleted ' + hit.length + ' transaction' + (hit.length === 1 ? '' : 's'), batchId, {
        before: t => ({ type: t.type, amount: t.amount, date: t.date, merchant: t.merchant }),
        after: () => ({}),
      }),
      ...(data.audit || []),
    ],
  };
}

export function setTransactionsCategory(data, { ids, categoryId }) {
  const cat = data.categories.find(c => c.id === categoryId);
  if (!cat) return data;
  const set = bulkIds(ids);
  // Only rows that CAN carry this category, and only where it actually changes.
  // Transfers have no category and adjustments are labelled, not categorised.
  const canCategorise = t => t.type === 'expense' || t.type === 'income' || t.type === 'refund';
  const hit = data.transactions.filter(t => set.has(t.id) && canCategorise(t) && t.category !== categoryId
    && (t.type === 'income') === (cat.type === 'income'));
  if (hit.length === 0) return data;
  const hitIds = new Set(hit.map(t => t.id));
  const batchId = uid();
  return {
    ...data,
    transactions: data.transactions.map(t => (hitIds.has(t.id) ? stampUpdate({ ...t, category: categoryId }) : t)),
    audit: [
      ...bulkAudit(hit, 'update', 'Recategorised ' + hit.length + ' to “' + cat.name + '”', batchId, {
        before: t => ({ category: t.category }),
        after: () => ({ category: categoryId }),
      }),
      ...(data.audit || []),
    ],
  };
}

export function setTransactionsStatus(data, { ids, status }) {
  if (status !== 'cleared' && status !== 'pending') return data;
  const set = bulkIds(ids);
  // cardAdjustment rows are machine-generated corrections and are never pending.
  const hit = data.transactions.filter(t => set.has(t.id) && t.status !== status && t.type !== 'cardAdjustment');
  if (hit.length === 0) return data;
  const hitIds = new Set(hit.map(t => t.id));
  const batchId = uid();
  return {
    ...data,
    transactions: data.transactions.map(t => (hitIds.has(t.id) ? stampUpdate({ ...t, status }) : t)),
    audit: [
      // Stored value is 'pending'; the audit reads "uncleared" to match the UI.
      ...bulkAudit(hit, 'update', 'Marked ' + hit.length + ' as ' + (status === 'pending' ? 'uncleared' : status), batchId, {
        before: t => ({ status: t.status }),
        after: () => ({ status }),
      }),
      ...(data.audit || []),
    ],
  };
}

// Exact copies of the selected rows with fresh ids — every other field is kept,
// so a duplicated cleared expense counts in balances immediately, exactly like
// its original. Edit history is dropped: a copy is a new row, not an edited one.
export function duplicateTransactions(data, { ids }) {
  const set = bulkIds(ids);
  const hit = data.transactions.filter(t => set.has(t.id));
  if (hit.length === 0) return data;
  const batchId = uid();
  const copies = hit.map(t => {
    const { editedAt, editCount, ...rest } = t;
    return { ...rest, id: uid() };
  });
  return {
    ...data,
    transactions: [...copies, ...data.transactions],
    audit: [
      ...copies.map(c => makeAudit({
        entityType: 'transaction', entityId: c.id, action: 'create',
        summary: 'Duplicated ' + copies.length + ' transaction' + (copies.length === 1 ? '' : 's'),
        after: { type: c.type, amount: c.amount, date: c.date, batchId },
      })),
      ...(data.audit || []),
    ],
  };
}

// ---- Recurring rules (design iteration 003) --------------------------------

const RULE_AUDIT_FIELDS = ['name', 'type', 'amount', 'estimated', 'schedule', 'nextDate', 'accountId', 'cardId', 'category', 'autoPost', 'status'];

// Built from scratch on add AND edit, like buildTx — switching the unit or the
// funding source can never leave a stale field behind.
function buildRule(f, amt, id) {
  const rec = {
    id,
    name: String(f.name || '').trim(),
    type: f.type,
    amount: amt,
    estimated: !!f.estimated,
    schedule: buildSchedule(f),
    nextDate: f.nextDate,
    category: f.category,
    status: f.status === 'paused' ? 'paused' : 'active',
    autoPost: !!f.autoPost,
  };
  const src = String(f.source || '');
  if (src.startsWith('card:')) rec.cardId = src.slice(5);
  else if (src.startsWith('acc:')) rec.accountId = src.slice(4);
  return rec;
}

export function upsertRule(data, { form: f, amt }) {
  const editing = !!f.editId;
  const next = { ...data, recurring: [...data.recurring] };
  let id = f.editId, before = null;
  if (editing) {
    const i = next.recurring.findIndex(r => r.id === id);
    if (i < 0) return data;
    before = next.recurring[i];
    // Occurrences are history: editing a rule never rewrites what it already did.
    next.recurring[i] = stampUpdate({ ...buildRule(f, amt, id), occurrences: before.occurrences || [] });
  } else {
    id = uid();
    // Opened via Make repeating: the transaction that prompted the rule is its
    // first recorded occurrence, so the history opens truthfully.
    const src = f.sourceTxId ? data.transactions.find(t => t.id === f.sourceTxId) : null;
    const occurrences = src && !ruleFromTx(data, src.id) ? [seedOccurrence(src, src.amount)] : [];
    next.recurring.push({ ...buildRule(f, amt, id), occurrences });
  }
  const after = next.recurring.find(r => r.id === id);
  const d = editing ? diffFields(before, after, RULE_AUDIT_FIELDS) : null;
  next.audit = [makeAudit({
    entityType: 'recurring', entityId: id, action: editing ? 'update' : 'create',
    summary: editing ? 'Rule updated' : 'Rule created',
    before: d ? d.before : null,
    after: d ? d.after : { name: after.name, amount: after.amount, schedule: after.schedule, nextDate: after.nextDate },
  }), ...(next.audit || [])];
  return next;
}

// Deleting a rule leaves every transaction it already produced untouched — the
// occurrences go with the rule, the money does not.
export function deleteRule(data, { id }) {
  const r = data.recurring.find(x => x.id === id);
  if (!r) return data;
  return {
    ...data,
    recurring: data.recurring.filter(x => x.id !== id),
    audit: [makeAudit({
      entityType: 'recurring', entityId: id, action: 'delete',
      summary: 'Rule deleted — its transactions are untouched',
      before: { name: r.name, amount: r.amount, nextDate: r.nextDate },
    }), ...(data.audit || [])],
  };
}

export function toggleRulePause(data, { id }) {
  const r = data.recurring.find(x => x.id === id);
  if (!r) return data;
  const status = r.status === 'paused' ? 'active' : 'paused';
  return {
    ...data,
    recurring: data.recurring.map(x => (x.id === id ? stampUpdate({ ...x, status }) : x)),
    audit: [makeAudit({
      entityType: 'recurring', entityId: id, action: 'update',
      summary: status === 'paused' ? 'Rule paused' : 'Rule resumed',
      before: { status: r.status }, after: { status },
    }), ...(data.audit || [])],
  };
}

// Skipping advances the rule without writing a transaction. Same idempotency
// and same only-advance-the-current-due rules as recording.
export function skipOccurrence(data, { id, due }) {
  const r = data.recurring.find(x => x.id === id);
  if (!r) return data;
  const d = due || r.nextDate;
  if (!d) return data;
  const occ = Array.isArray(r.occurrences) ? r.occurrences : [];
  if (occ.some(o => o.due === d)) return data;
  const nextDate = r.nextDate === d ? advanceDue(r.schedule, d) : r.nextDate;
  return {
    ...data,
    recurring: data.recurring.map(x => (x.id === id ? stampUpdate({
      ...x,
      occurrences: [...occ, { due: d, outcome: 'skipped', amount: null, txId: null, at: nowIso() }],
      nextDate,
    }) : x)),
    audit: [makeAudit({
      entityType: 'recurring', entityId: id, action: 'skip',
      summary: 'Occurrence skipped', before: { nextDate: r.nextDate }, after: { nextDate },
    }), ...(data.audit || [])],
  };
}

// ---- Categories (design v2 CRUD) -------------------------------------------

const CAT_AUDIT_FIELDS = ['name', 'type', 'icon', 'color', 'description', 'sortOrder', 'excludeFromBudget', 'targetAmount', 'targetMode', 'targetDueDay'];

// When a category becomes excluded from budgets it must not keep an unusable
// budget or target. Shared by upsertCategory (drawer) and setCategoryExcluded
// (inspector) so the two never diverge — the target-clearing lives here and
// ONLY here. Mutates `next` in place; returns it. Callers that need the
// clearing to show up in their own before/after audit diff must call this
// BEFORE computing that diff (see upsertCategory).
function dropBudgetAndTargetOnExclude(next, id, name) {
  const i = next.categories.findIndex(c => c.id === id);
  if (i >= 0) next.categories[i] = { ...next.categories[i], targetAmount: undefined, targetMode: undefined, targetDueDay: undefined };
  const dropped = next.budgets.find(b => b.category === id);
  if (dropped) {
    next.budgets = next.budgets.filter(b => b.id !== dropped.id);
    next.audit = [makeAudit({ entityType: 'budget', entityId: dropped.id, action: 'delete', summary: 'Budget removed — “' + name + '” excluded from budgets', before: { category: id, amount: dropped.amount, rollover: !!dropped.rollover } }), ...next.audit];
  }
  return next;
}

// Create or edit a category. Budget amounts are owned by the Budgets screen
// (design iteration 002) — no budget plumbing here, EXCEPT: turning
// excludeFromBudget on removes the category's budget and target (an excluded
// category must never keep an unusable budget or target attached; the form
// confirms first).
// `description` doubles as the inspector's Notes field (see setCategoryNote):
// the trim here is intentional for this form's plain-text entry and must not
// be extended to stripping inner formatting, which Notes deliberately preserves.
export function upsertCategory(data, { form: f }) {
  const editing = !!f.editId;
  const next = { ...data, categories: [...data.categories], budgets: [...data.budgets] };
  const excluded = f.type === 'expense' && !!f.excludeFromBudget; // income cats always store false
  let id = f.editId;
  let before = null;
  if (editing) {
    const i = next.categories.findIndex(c => c.id === id);
    if (i < 0) return data;
    before = next.categories[i];
    next.categories[i] = stampUpdate({
      ...before, name: f.name.trim(), type: f.type, icon: f.icon || 'square',
      color: f.color || '#0F766E', description: (f.description || '').trim(),
      sortOrder: parseInt(f.sortOrder, 10) || 99, excludeFromBudget: excluded,
    });
  } else {
    id = uid();
    next.categories.push({
      id, name: f.name.trim(), type: f.type, icon: f.icon || 'square', color: f.color || '#0F766E',
      description: (f.description || '').trim(), sortOrder: parseInt(f.sortOrder, 10) || 99,
      isSystem: false, status: 'active', excludeFromBudget: excluded,
    });
  }
  if (editing) {
    // Called BEFORE the diff below so the target nulling it does shows up in
    // the audit row's before/after, same as every other field in this edit —
    // one call, one place the target-clear happens (see the helper's comment).
    if (excluded && before && !before.excludeFromBudget) {
      dropBudgetAndTargetOnExclude(next, id, next.categories.find(c => c.id === id).name);
    }
    const after = next.categories.find(c => c.id === id);
    const d = diffFields(before, after, CAT_AUDIT_FIELDS);
    next.audit = [makeAudit({ entityType: 'category', entityId: id, action: 'update', summary: 'Edited category ' + after.name + (d.keys.length ? ' (' + d.keys.join(', ') + ')' : ''), before: d.before, after: d.after }), ...(next.audit || [])];
  } else {
    next.audit = [makeAudit({ entityType: 'category', entityId: id, action: 'create', summary: 'Created category ' + f.name.trim(), after: { name: f.name.trim(), type: f.type } }), ...(next.audit || [])];
  }
  return next;
}

// Monthly target for a category. amount<=0 clears it. Excluded and income
// categories reject — only an expense category can hold a target; the UI
// gates this too, but the reducer shouldn't trust the caller.
// targetDueDay is stored but not yet consumed anywhere in the app's math —
// it's reserved for a future due-date/pacing feature, so don't mistake it for
// dead plumbing and delete it.
export function setTarget(data, { id, amount, mode, dueDay }) {
  const i = data.categories.findIndex(c => c.id === id);
  if (i < 0) return data;
  const cur = data.categories[i];
  if (cur.excludeFromBudget) return data;
  if (cur.type !== 'expense') return data;
  if (!TARGET_MODES.includes(mode)) throw new Error('unknown target mode: ' + mode);
  const amt = Math.max(0, Math.round(amount) || 0);
  if (amt === 0) return clearTarget(data, { id });
  // DB range is 1–28 (no 29–31, which not every month has) — clamp so a
  // programmatic out-of-range dueDay can't 4xx the sync push.
  const day = dueDay == null ? undefined : Math.min(28, Math.max(1, Math.round(dueDay)));
  if (cur.targetAmount === amt && cur.targetMode === mode && (cur.targetDueDay ?? undefined) === day) return data;
  const cats = [...data.categories];
  cats[i] = stampUpdate({ ...cur, targetAmount: amt, targetMode: mode, targetDueDay: day });
  return {
    ...data, categories: cats,
    audit: [makeAudit({ entityType: 'category', entityId: id, action: 'update', summary: 'Set ' + (mode === 'setaside' ? 'set-aside' : 'refill') + ' target for ' + cur.name, before: { targetAmount: cur.targetAmount, targetMode: cur.targetMode, targetDueDay: cur.targetDueDay }, after: { targetAmount: amt, targetMode: mode, targetDueDay: day } }), ...(data.audit || [])],
  };
}

export function clearTarget(data, { id }) {
  const i = data.categories.findIndex(c => c.id === id);
  if (i < 0 || data.categories[i].targetAmount === undefined) return data;
  const cur = data.categories[i];
  const cats = [...data.categories];
  cats[i] = stampUpdate({ ...cur, targetAmount: undefined, targetMode: undefined, targetDueDay: undefined });
  return {
    ...data, categories: cats,
    audit: [makeAudit({ entityType: 'category', entityId: id, action: 'update', summary: 'Removed target for ' + cur.name, before: { targetAmount: cur.targetAmount, targetMode: cur.targetMode }, after: { targetAmount: undefined } }), ...(data.audit || [])],
  };
}

// Toggle excludeFromBudget from the inspector; enabling clears budget + target.
export function setCategoryExcluded(data, { id, excluded }) {
  const i = data.categories.findIndex(c => c.id === id);
  if (i < 0 || !!data.categories[i].excludeFromBudget === !!excluded) return data;
  const cur = data.categories[i];
  const next = { ...data, categories: [...data.categories], budgets: [...data.budgets] };
  next.categories[i] = stampUpdate({ ...cur, excludeFromBudget: !!excluded });
  // Called BEFORE the before/after snapshot below so a cleared target shows up
  // in this action's own audit row too, same ordering rule as upsertCategory.
  if (excluded) dropBudgetAndTargetOnExclude(next, id, cur.name);
  const before = { excludeFromBudget: !!cur.excludeFromBudget, targetAmount: cur.targetAmount, targetMode: cur.targetMode };
  const after = { excludeFromBudget: !!excluded, targetAmount: next.categories[i].targetAmount, targetMode: next.categories[i].targetMode };
  next.audit = [makeAudit({ entityType: 'category', entityId: id, action: 'update', summary: (excluded ? 'Excluded ' : 'Included ') + cur.name + ' from budgets', before, after }), ...next.audit];
  return next;
}

// Inspector Notes (Phase 3): the note IS categories.description — the field
// already syncs, so no schema work. Whitespace-only input clears to '';
// intentional inner formatting is preserved.
export function renameCategory(data, { id, name }) {
  const i = data.categories.findIndex(c => c.id === id);
  if (i < 0) return data;
  const val = (name || '').trim();
  const existing = data.categories[i].name;
  if (val === '' || val === existing) return data;
  // Names are unique per group (0018): a rename that would collide with a
  // sibling in the same group is refused here too — inline rename callers
  // (Inspector, Plan) don't run the drawer validator, and a colliding row
  // 23505s on sync. Same defense as setCategoryGroup/moveCategories below.
  const cur = data.categories[i];
  if (duplicateCat(data, { name: val, type: cur.type, groupId: cur.groupId, excludeId: id })) return data;
  const cat = stampUpdate({ ...cur, name: val });
  const categories = [...data.categories];
  categories[i] = cat;
  return {
    ...data, categories,
    audit: [makeAudit({
      entityType: 'category', entityId: id, action: 'update',
      summary: 'Renamed category “' + existing + '” → “' + val + '”',
      before: { name: existing },
      after: { name: val },
    }), ...(data.audit || [])],
  };
}

export function setCategoryNote(data, { id, note }) {
  const i = data.categories.findIndex(c => c.id === id);
  if (i < 0) return data;
  const raw = note || '';
  const val = raw.trim() === '' ? '' : raw;
  const existing = data.categories[i].description || '';
  if (val === existing) return data;
  const cat = stampUpdate({ ...data.categories[i], description: val });
  const categories = [...data.categories];
  categories[i] = cat;
  return {
    ...data, categories,
    audit: [makeAudit({
      entityType: 'category', entityId: id, action: 'update',
      summary: 'Updated note for ' + cat.name,
      before: { description: existing },
      after: { description: val },
    }), ...(data.audit || [])],
  };
}

export function archiveCategory(data, { id }) {
  const cat = data.categories.find(c => c.id === id);
  if (!cat) return data;
  // Return this month's unspent envelope balance to Ready to Assign BEFORE hiding
  // the category. Otherwise its assigned money stays subtracted from RTA while the
  // category disappears from the Plan grid — invisible yet still suppressing RTA
  // (the same family of leak as closing an account with a balance). Scope is the
  // CURRENT month only: current-month available already folds in all prior carry-
  // over, but a positive balance parked in a FUTURE month is not reclaimed here.
  // Only a POSITIVE available is returned; an overspent category keeps its
  // negative, which the fold aggregates as overspend against next month's RTA.
  // moveAssigned writes its own "Moved … to Ready to Assign" audit row; the whole
  // archive is still ONE undo step (undo is snapshot-based, not audit-based).
  const month = currentMonth();
  const available = envelopeFor(data, month, nowIso()).rows.get(id)?.available ?? 0;
  const returned = available > 0 ? Math.round(available) : 0;
  const funded = returned ? moveAssigned(data, { from: id, to: 'rta', month, amount: returned }) : data;
  return {
    ...funded,
    categories: funded.categories.map(c => (c.id === id ? stampUpdate({ ...c, status: 'archived', archivedAt: nowIso() }) : c)),
    audit: [makeAudit({ entityType: 'category', entityId: id, action: 'archive', summary: 'Archived category ' + cat.name + (returned ? ' (returned ' + returned + ' to Ready to Assign)' : ''), before: { status: cat.status }, after: { status: 'archived' } }), ...(funded.audit || [])],
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

// Hard delete — allowed only for unused custom categories (deletePolicy 'delete',
// which now also counts envelope assignments — see catRefs). assignments is
// dropped defensively even though the `used` guard should already keep this
// action from ever being called while any exist, so a stray assignment row can
// never survive as a dangling FK reference to a category that no longer exists.
export function deleteCategory(data, { id }) {
  const cat = data.categories.find(c => c.id === id);
  if (!cat || cat.isSystem) return data;
  const used = data.transactions.some(t => t.category === id) || data.budgets.some(b => b.category === id) || data.recurring.some(r => r.category === id)
    || (data.payees || []).some(p => p.autoCategoryId === id);
  if (used) return data; // policy violation — caller should have offered reassign
  return {
    ...data,
    categories: data.categories.filter(c => c.id !== id),
    assignments: (data.assignments || []).filter(a => a.category !== id),
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
  const srcAssignments = (data.assignments || []).filter(a => a.category === id);
  const moved = {
    transactions: data.transactions.filter(t => t.category === id).length,
    budgets: data.budgets.filter(b => b.category === id).length,
    recurring: data.recurring.filter(r => r.category === id).length,
    assignments: srcAssignments.length,
    payees: (data.payees || []).filter(p => p.autoCategoryId === id).length,
  };
  // Budgets are unique per category: if the replacement already has one, the
  // source's budget is dropped rather than repointed (the replacement's own
  // budget continues to apply).
  const replacementHasBudget = data.budgets.some(b => b.category === replacementId);
  // Assignments are unique per (category, month), same as budgets are unique
  // per category — but unlike a budget, a source assignment can't simply be
  // dropped on collision without losing money: instead the source's amount is
  // MERGED into the replacement's row for that month (summed), and only the
  // now-redundant source row is dropped.
  const srcByMonth = new Map(srcAssignments.map(a => [a.month, a]));
  const assignments = (data.assignments || [])
    .filter(a => a.category !== id)
    .map(a => {
      if (a.category !== replacementId || !srcByMonth.has(a.month)) return a;
      const src = srcByMonth.get(a.month);
      srcByMonth.delete(a.month); // consumed — don't also append it as a new row below
      return { ...a, amount: a.amount + src.amount };
    });
  srcByMonth.forEach(src => assignments.push({ ...src, category: replacementId })); // months the replacement had no row for
  return {
    ...data,
    transactions: data.transactions.map(t => (t.category === id ? { ...t, category: replacementId } : t)),
    budgets: replacementHasBudget
      ? data.budgets.filter(b => b.category !== id)
      : data.budgets.map(b => (b.category === id ? { ...b, category: replacementId } : b)),
    recurring: data.recurring.map(r => (r.category === id ? { ...r, category: replacementId } : r)),
    assignments,
    payees: sweepPayeeCategory(data.payees, id, replacementId),
    categories: data.categories.filter(c => c.id !== id),
    audit: [makeAudit({
      entityType: 'category', entityId: id, action: 'reassign-delete',
      summary: 'Deleted ' + cat.name + ' — ' + (moved.transactions + moved.budgets + moved.recurring + moved.assignments + moved.payees) + ' reference(s) moved to ' + repl.name,
      before: { name: cat.name, refs: moved }, after: { replacementId, replacementName: repl.name },
    }), ...(data.audit || [])],
  };
}

// ---- Envelope: per-month assignments + category groups -----------------------
export function setAssigned(data, { categoryId, month, amount }) {
  const existing = (data.assignments || []).find(a => a.category === categoryId && a.month === month);
  const amt = Math.round(amount) || 0;
  if (!existing && amt === 0) return data;
  if (existing && existing.amount === amt) return data;
  const assignments = amt === 0
    ? data.assignments.filter(a => a !== existing)
    : existing
      ? data.assignments.map(a => (a === existing ? { ...a, amount: amt } : a))
      : [...(data.assignments || []), { id: uid(), category: categoryId, month, amount: amt }];
  const cat = data.categories.find(c => c.id === categoryId);
  return {
    ...data, assignments,
    audit: [makeAudit({
      entityType: 'assignment', entityId: categoryId + '|' + month, action: existing ? (amt === 0 ? 'delete' : 'update') : 'create',
      summary: 'Assigned ' + amt + ' to ' + (cat ? cat.name : categoryId) + ' for ' + month,
      before: { amount: existing ? existing.amount : 0 }, after: { amount: amt },
    }), ...(data.audit || [])],
  };
}

// Move assigned money between two envelopes (or Ready to Assign) as ONE step:
// one new assignments array, one audit row, one undo entry. Either side may be
// 'rta' (from: plain assign; to: unassign). Sources may go negative — YNAB
// permits pulling more than is assigned.
export function moveAssigned(data, { from, to, month, amount }) {
  const amt = Math.round(amount) || 0;
  if (amt <= 0 || from === to || (from === 'rta' && to === 'rta')) return data;
  const catOf = id => data.categories.find(c => c.id === id);
  if (from !== 'rta' && !catOf(from)) return data;
  if (to !== 'rta' && !catOf(to)) return data;

  let assignments = [...(data.assignments || [])];
  const bump = (categoryId, delta) => {
    const existing = assignments.find(a => a.category === categoryId && a.month === month);
    const next = (existing ? existing.amount : 0) + delta;
    if (existing && next === 0) assignments = assignments.filter(a => a !== existing);
    else if (existing) assignments = assignments.map(a => (a === existing ? { ...a, amount: next } : a));
    else assignments.push({ id: uid(), category: categoryId, month, amount: next });
  };
  if (from !== 'rta') bump(from, -amt);
  if (to !== 'rta') bump(to, amt);

  const nameOf = id => (id === 'rta' ? 'Ready to Assign' : (catOf(id) || {}).name || id);
  return {
    ...data, assignments,
    audit: [makeAudit({
      entityType: 'assignment', action: 'move', entityId: from + '>' + to + '|' + month,
      summary: 'Moved ' + amt + ' from ' + nameOf(from) + ' to ' + nameOf(to) + ' (' + month + ')',
      after: { from, to, amount: amt, month },
    }), ...(data.audit || [])],
  };
}

export function addCategoryGroup(data, { name }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return data;
  const sortOrder = (data.categoryGroups || []).reduce((m, g) => Math.max(m, g.sortOrder || 0), 0) + 1;
  const g = { id: uid(), name: trimmed, sortOrder };
  return {
    ...data, categoryGroups: [...(data.categoryGroups || []), g],
    audit: [makeAudit({ entityType: 'categoryGroup', entityId: g.id, action: 'create', summary: 'Added group ' + trimmed }), ...(data.audit || [])],
  };
}

export function renameCategoryGroup(data, { id, name }) {
  const g = (data.categoryGroups || []).find(x => x.id === id);
  const trimmed = String(name || '').trim();
  if (!g || !trimmed || g.name === trimmed) return data;
  return {
    ...data,
    categoryGroups: data.categoryGroups.map(x => (x.id === id ? { ...x, name: trimmed } : x)),
    audit: [makeAudit({ entityType: 'categoryGroup', entityId: id, action: 'update', summary: 'Renamed group to ' + trimmed, before: { name: g.name }, after: { name: trimmed } }), ...(data.audit || [])],
  };
}

export function deleteCategoryGroup(data, { id }) {
  const g = (data.categoryGroups || []).find(x => x.id === id);
  if (!g) return data;
  // Un-grouping survivors moves them into the ungrouped "Other" bucket, which
  // enforces its own per-(type, name) uniqueness (0018, NULLS NOT DISTINCT). If
  // a survivor's name already exists ungrouped — or two survivors share one —
  // the un-group would 23505 and wedge sync. Disambiguate by suffixing the
  // deleted group's name (then a counter) so the name lands unique and visible.
  const keyOf = (type, name) => type + '\0' + normalizeName(name);
  const taken = new Set();
  for (const c of data.categories) {
    if (c.groupId != null) continue; // already ungrouped, and never touched here
    taken.add(keyOf(c.type, c.name));
  }
  const uniqueName = (type, name) => {
    if (!taken.has(keyOf(type, name))) return name;
    let candidate = name + ' (' + g.name + ')';
    for (let n = 2; taken.has(keyOf(type, candidate)); n++) candidate = name + ' (' + g.name + ' ' + n + ')';
    return candidate;
  };
  return {
    ...data,
    categoryGroups: data.categoryGroups.filter(x => x.id !== id),
    categories: data.categories.map(c => {
      if (c.groupId !== id) return c;
      const { groupId, ...rest } = c;
      const name = uniqueName(rest.type, rest.name);
      taken.add(keyOf(rest.type, name));
      return name === rest.name ? rest : stampUpdate({ ...rest, name });
    }),
    audit: [makeAudit({ entityType: 'categoryGroup', entityId: id, action: 'delete', summary: 'Deleted group ' + g.name }), ...(data.audit || [])],
  };
}

// Delete a whole group by first reassigning every category in it to a single
// replacement (transactions, budgets, recurring, assigned/available amounts —
// exactly what reassignDeleteCategory moves for one category), then removing the
// now-empty group. The replacement must live OUTSIDE the group so it isn't
// deleted mid-fold. System categories can't be deleted, so they're left behind
// and merely un-grouped when the group goes (deleteCategoryGroup's own rule).
export function reassignDeleteCategoryGroup(data, { id, replacementId }) {
  const g = (data.categoryGroups || []).find(x => x.id === id);
  const repl = data.categories.find(c => c.id === replacementId);
  if (!g || !repl) return data;
  const groupCatIds = data.categories.filter(c => c.groupId === id).map(c => c.id);
  if (groupCatIds.includes(replacementId)) return data; // replacement must be outside the group
  let next = data;
  for (const cid of groupCatIds) next = reassignDeleteCategory(next, { id: cid, replacementId });
  return deleteCategoryGroup(next, { id });
}

// Delete a group AND its truly-empty categories, so nothing orphans into the
// synthetic "Other" bucket. "Empty" means ZERO references of ANY kind —
// transactions, budgets, recurring, assignments, AND payee auto-categorize
// rules — matching catRefs / deletePolicy. A category with only an assignment
// is NOT empty: deleteCategory would otherwise drop its assignment rows (its
// own `used` check omits assignments), silently losing assigned money; so we
// skip it here and let deleteCategoryGroup un-group it instead. Same for a
// category still targeted by a payee's autoCategoryId — deleteCategory would
// leave that payee rule pointing at nothing. Referenced categories (incl.
// across ALL statuses — archived ones still carry assignments) should have
// been routed to the reassign flow before reaching here; this guard is
// defense in depth.
export function deleteCategoryGroupWithEmpties(data, { id }) {
  const g = (data.categoryGroups || []).find(x => x.id === id);
  if (!g) return data;
  const ids = data.categories.filter(c => c.groupId === id).map(c => c.id);
  const refFree = cid => !(
    data.transactions.some(t => t.category === cid)
    || data.budgets.some(b => b.category === cid)
    || data.recurring.some(r => r.category === cid)
    || (data.assignments || []).some(a => a.category === cid)
    || data.payees.some(p => p.autoCategoryId === cid)
  );
  let next = data;
  for (const cid of ids) if (refFree(cid)) next = deleteCategory(next, { id: cid });
  return deleteCategoryGroup(next, { id });
}

export function setCategoryGroup(data, { categoryId, groupId }) {
  const c = data.categories.find(x => x.id === categoryId);
  if (!c || c.groupId === groupId) return data;
  // Refuse a move that would collide with a same-name sibling in the target
  // group (0018 per-group uniqueness) — it would 23505 on sync otherwise.
  if (duplicateCat(data, { name: c.name, type: c.type, groupId, excludeId: categoryId })) return data;
  return {
    ...data,
    categories: data.categories.map(x => (x.id === categoryId ? stampUpdate({ ...x, groupId }) : x)),
    audit: [makeAudit({ entityType: 'category', entityId: categoryId, action: 'update', summary: 'Moved ' + c.name + ' to a group', before: { groupId: c.groupId }, after: { groupId } }), ...(data.audit || [])],
  };
}

// Drag-and-drop move/reorder of categories (Plan screen). `ids` are the dragged
// category ids in the order they should land; `groupId` is the target group, or
// null to ungroup into the synthetic "Other" bucket; `beforeId` is the
// target-group member to land in front of (null/absent/unknown = append last).
// Only groupId + sortOrder change — no amounts, assignments, or refs are
// touched. The target group's members are renumbered to a contiguous 0..n so
// sortOrder stays clean. A category whose group actually changes is stamped +
// audited (like setCategoryGroup); a pure reorder is silent so a drag can't
// flood the audit log / "Edited" chips. Returns the same `data` reference when
// nothing effectively changes. Members are matched by the movers' own type so a
// drag never disturbs unrelated categories that happen to share the null bucket.
export function moveCategories(data, { ids, groupId, beforeId }) {
  if (groupId != null && !(data.categoryGroups || []).some(g => g.id === groupId)) return data;
  const byId = new Map(data.categories.map(c => [c.id, c]));
  const moving = (ids || []).map(id => byId.get(id)).filter(Boolean);
  if (!moving.length) return data;
  const type = moving[0].type;
  const movingIds = new Set(moving.map(c => c.id));
  // Refuse the whole move if any mover would break per-group name uniqueness
  // (0018) — colliding with an existing member of the target group or with
  // another mover landing there. The Plan drag-drop pre-checks with the same
  // helper to toast; this is the reducer-level backstop (see moveCollision).
  if (moveCollision(data, { ids: moving.map(c => c.id), groupId })) return data;
  // A drop whose beforeId is itself one of the dragged rows is a drop-in-place,
  // not a reposition (the UI hides the insertion line over dragged rows). Bail
  // as a no-op rather than fall through to the "beforeId not in keep → append
  // to end" branch below, which would silently shove the row to the bottom.
  if (beforeId != null && movingIds.has(beforeId)) return data;
  const cmp = (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name);
  // Surviving members of the target group, in display order, minus the movers.
  const keep = data.categories
    .filter(c => c.type === type && (c.groupId ?? null) === (groupId ?? null) && !movingIds.has(c.id))
    .sort(cmp);
  let at = beforeId ? keep.findIndex(c => c.id === beforeId) : -1;
  if (at < 0) at = keep.length; // append when beforeId is absent / unknown / a mover
  const ordered = [...keep.slice(0, at), ...moving, ...keep.slice(at)];
  const orderById = new Map(ordered.map((c, i) => [c.id, i]));
  const audit = [];
  let changed = false;
  const categories = data.categories.map(c => {
    if (!orderById.has(c.id)) return c;
    const nextOrder = orderById.get(c.id);
    const groupChanged = (c.groupId ?? null) !== (groupId ?? null);
    const orderChanged = (c.sortOrder || 0) !== nextOrder;
    if (!groupChanged && !orderChanged) return c;
    changed = true;
    let nc = { ...c, sortOrder: nextOrder };
    if (groupId == null) delete nc.groupId; else nc.groupId = groupId;
    if (groupChanged) {
      nc = stampUpdate(nc);
      audit.push(makeAudit({
        entityType: 'category', entityId: c.id, action: 'update',
        summary: 'Moved ' + c.name, before: { groupId: c.groupId ?? null }, after: { groupId: groupId ?? null },
      }));
    }
    return nc;
  });
  if (!changed) return data;
  return { ...data, categories, audit: [...audit, ...(data.audit || [])] };
}

// Drag-and-drop reorder of a category group. Lands the group before `beforeId`
// (null/absent/unknown = move to the end) and renumbers every group's sortOrder
// to a contiguous 0..n. The synthetic "Other" bucket is not a stored group, so
// it can never be `id` or `beforeId` and always renders after the real groups.
// Returns the same `data` reference when the resulting order is unchanged.
export function reorderCategoryGroup(data, { id, beforeId }) {
  if (id === beforeId) return data;
  const cmp = (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name);
  const sorted = [...(data.categoryGroups || [])].sort(cmp);
  const from = sorted.findIndex(g => g.id === id);
  if (from < 0) return data;
  const before = sorted.map(g => g.id);
  const next = [...sorted];
  const [moved] = next.splice(from, 1);
  let at = beforeId ? next.findIndex(g => g.id === beforeId) : -1;
  if (at < 0) at = next.length;
  next.splice(at, 0, moved);
  if (before.join(' ') === next.map(g => g.id).join(' ')) return data;
  const orderById = new Map(next.map((g, i) => [g.id, i]));
  return {
    ...data,
    categoryGroups: data.categoryGroups.map(g => ({ ...g, sortOrder: orderById.get(g.id) })),
    audit: [makeAudit({ entityType: 'categoryGroup', entityId: id, action: 'update', summary: 'Reordered group ' + moved.name }), ...(data.audit || [])],
  };
}

// One-click adoption of the captured YNAB tree. Idempotent: returns `data`
// unchanged (same reference) when everything is already in place.
export function adoptYnabTree(data) {
  let changed = false;
  let groups = [...(data.categoryGroups || [])];
  const groupIdByName = {};
  [...YNAB_TREE.map(g => g.group), OTHER_GROUP].forEach((name, i) => {
    let g = groups.find(x => x.name === name);
    if (!g) { g = { id: uid(), name, sortOrder: i + 1 }; groups.push(g); changed = true; }
    groupIdByName[name] = g.id;
  });

  const seedColors = ['#0F766E', '#B7791F', '#2563EB', '#64748B', '#7C3AED', '#DC2626'];
  let categories = [...data.categories];
  const matchKey = c => ALIASES[normName(c.name)] || normName(c.name);
  YNAB_TREE.forEach(g => g.categories.forEach((display, i) => {
    const want = normName(display);
    const hit = categories.find(c => c.type === 'expense' && c.status === 'active' && matchKey(c) === want);
    if (hit) {
      if (hit.name !== display || hit.groupId !== groupIdByName[g.group]) {
        categories = categories.map(c => (c === hit ? stampUpdate({ ...c, name: display, groupId: groupIdByName[g.group] }) : c));
        changed = true;
      }
    } else {
      categories.push({
        id: uid(), name: display, type: 'expense', color: seedColors[i % seedColors.length],
        icon: 'circle', sortOrder: 99, isSystem: false, status: 'active', description: '',
        excludeFromBudget: false, groupId: groupIdByName[g.group],
      });
      changed = true;
    }
  }));
  // Raqam-only active expense categories without a group land in Other.
  categories = categories.map(c => {
    if (c.type !== 'expense' || c.status !== 'active' || c.groupId) return c;
    changed = true;
    return stampUpdate({ ...c, groupId: groupIdByName[OTHER_GROUP] });
  });
  if (!changed) return data;
  return {
    ...data, categoryGroups: groups, categories,
    audit: [makeAudit({ entityType: 'categoryGroup', entityId: 'adopt', action: 'create', summary: 'Organized categories into groups (YNAB set)' }), ...(data.audit || [])],
  };
}

// Copy standing per-category budgets into `month` assignments. Skips the
// overall budget, any category that already has an assignment that month, and
// any budget whose category is archived (or otherwise not active) — an
// archived category can no longer be chosen for new spending, so seeding it a
// fresh assignment would just add dead weight to the plan.
export function importBudgetsAsAssignments(data, { month }) {
  const existing = new Set((data.assignments || []).filter(a => a.month === month).map(a => a.category));
  const activeCatIds = new Set((data.categories || []).filter(c => c.status === 'active').map(c => c.id));
  const add = (data.budgets || [])
    .filter(b => b.category && b.amount > 0 && !existing.has(b.category) && activeCatIds.has(b.category))
    .map(b => ({ id: uid(), category: b.category, month, amount: b.amount }));
  if (add.length === 0) return data;
  return {
    ...data, assignments: [...(data.assignments || []), ...add],
    audit: [makeAudit({ entityType: 'assignment', entityId: 'import|' + month, action: 'create', summary: 'Imported ' + add.length + ' budget amounts as ' + month + ' assignments' }), ...(data.audit || [])],
  };
}

// ---- Budgets (design iteration 002) ----------------------------------------

// Create or edit a budget (category or overall). A budget is one standing
// monthly amount; `rollover` opts into carrying last month's unspent forward.
export function upsertBudget(data, { form: f, amt }) {
  const editing = !!f.editId;
  const next = { ...data, budgets: [...data.budgets] };
  const roll = !!f.rollover;
  let id = f.editId, before = null;
  if (editing) {
    const i = next.budgets.findIndex(b => b.id === id);
    if (i < 0) return data;
    before = next.budgets[i];
    next.budgets[i] = stampUpdate({ ...before, amount: amt, rollover: roll });
  } else {
    id = uid();
    const rec = { id, category: f.overall ? null : f.category, amount: amt, rollover: roll };
    if (f.overall) rec.label = 'Overall monthly budget';
    next.budgets.push(rec);
  }
  next.audit = [makeAudit({
    entityType: 'budget', entityId: id, action: editing ? 'update' : 'create',
    summary: editing ? 'Budget updated' : 'Budget created',
    before: before ? { amount: before.amount, rollover: !!before.rollover } : null,
    after: { amount: amt, rollover: roll },
  }), ...(next.audit || [])];
  return next;
}

// Rollover is a single-field change — the row menu flips it directly, still audited.
export function toggleBudgetRollover(data, { id }) {
  const b = data.budgets.find(x => x.id === id);
  if (!b) return data;
  const nextRoll = !b.rollover;
  return {
    ...data,
    budgets: data.budgets.map(x => (x.id === id ? stampUpdate({ ...x, rollover: nextRoll }) : x)),
    audit: [makeAudit({
      entityType: 'budget', entityId: id, action: 'update',
      summary: nextRoll ? 'Rollover turned on' : 'Rollover turned off',
      before: { rollover: !nextRoll }, after: { rollover: nextRoll },
    }), ...(data.audit || [])],
  };
}

// Removing a budget touches nothing else — spending simply stops being measured.
export function deleteBudget(data, { id }) {
  const b = data.budgets.find(x => x.id === id);
  if (!b) return data;
  return {
    ...data,
    budgets: data.budgets.filter(x => x.id !== id),
    audit: [makeAudit({
      entityType: 'budget', entityId: id, action: 'delete', summary: 'Budget removed',
      before: { category: b.category || null, amount: b.amount, rollover: !!b.rollover },
    }), ...(data.audit || [])],
  };
}

// ---- Payees (Spec 2 overlay) ------------------------------------------------
// A payee is the merchant string on transactions; a S.payees record exists
// only once it is customized. Bulk merchant rewrites here are the ONLY place
// merchant strings change wholesale — always case-insensitive on the trimmed
// name and never touching adjustments (their merchant is machine-written).

const payeeAudit = (summary, before = null, after = null) =>
  makeAudit({ entityType: 'payee', entityId: 'payees', action: 'update', summary, before, after });

function rewriteMerchants(transactions, keys, to) {
  let changed = 0;
  const out = transactions.map(t => {
    if (!keys.some(k => matchesPayeeTx(t, k))) return t;
    if (t.merchant === to) return t; // already exact, skip
    changed += 1;
    return stampUpdate({ ...t, merchant: to });
  });
  return { out, changed };
}

// A record with no effective customization left carries nothing the overlay
// needs to remember — same bare-record spirit as bareAfterUnhide below, but
// covers `hidden` too (used after a patch, not just after un-hiding).
const bareRecord = p => !p.autoCategorize && !p.autoCategoryId && !(p.renameRules || []).length && !p.hidden;

// The category-delete sweep for the overlay. `autoCategoryId` is a plain id
// with no FK behind it (the payees table is name-keyed and user-scoped — see
// migration 0016), so nothing but this pass stops a deleted category's id from
// living on inside a rule and being written onto a future transaction.
// With a replacement the rule follows the category; without one the rule is
// removed outright (the record keeps whatever else it customized, and is
// dropped when that leaves it bare). reassignDeleteCategory is the only
// caller today, and it always has a replacement; the no-replacement branch
// exists because deleteCategory's `used` guard is what forbids that path, and
// a guard is a decision that can be revisited.
function sweepPayeeCategory(payees, id, replacementId) {
  const src = payees || [];
  if (!src.some(p => p.autoCategoryId === id)) return src;
  const out = [];
  for (const p of src) {
    if (p.autoCategoryId !== id) { out.push(p); continue; }
    if (replacementId) { out.push({ ...p, autoCategoryId: replacementId }); continue; }
    const { autoCategoryId: _a, autoCategorize: _c, ...rest } = p;
    if (!bareRecord(rest)) out.push(rest);
  }
  return out;
}

export function upsertPayee(data, { name, patch }) {
  const k = payeeKey(name);
  if (!k) return data;
  const existing = payeeRecordFor(data, name);
  const { name: _n, transferRef: _t, ...safe } = patch || {};
  const rec = existing
    ? { ...existing, ...safe }
    : { id: uid(), name: String(name).trim(), ...safe };
  if (existing && JSON.stringify(rec) === JSON.stringify(existing)) return data;
  // Don't let bare records accumulate (e.g. autoCategorize toggled back off,
  // or the last renameRule removed) — if the patch leaves nothing to
  // customize, drop the record entirely rather than storing an empty shell.
  if (bareRecord(rec)) {
    if (!existing) return data;
    return {
      ...data, payees: data.payees.filter(p => p.id !== existing.id),
      audit: [payeeAudit('Updated payee "' + rec.name + '"'), ...(data.audit || [])],
    };
  }
  const payees = existing
    ? data.payees.map(p => (p.id === existing.id ? rec : p))
    : [...data.payees, rec];
  return { ...data, payees, audit: [payeeAudit('Updated payee "' + rec.name + '"'), ...(data.audit || [])] };
}

// A same-key rename ('amazon' → 'Amazon') is a CASING NORMALIZATION, not a
// no-op: the payee list shows one canonical spelling, so committing a new one
// has to reach the transactions (and the record, if there is one) or the old
// spelling wins the moment the record is dropped. rewriteMerchants skips rows
// that already read exactly `to`, so the common case costs one pass and zero
// writes. The only true no-ops are a blank `to` and a byte-identical one.
export function renamePayee(data, { from, to }) {
  const toName = String(to || '').trim();
  const fromKey = payeeKey(from);
  if (!toName || !fromKey || toName === String(from || '').trim()) return data;
  const { out, changed } = rewriteMerchants(data.transactions, [fromKey], toName);
  const rec = payeeRecordFor(data, from);
  const targetExisting = payeeRecordFor(data, toName);
  let payees = data.payees;
  if (rec && targetExisting && targetExisting.id !== rec.id) {
    // Renaming onto an already-customized payee would otherwise leave two
    // overlay records keyed to the same merged name. Merge into the target
    // instead: its renameRules first, then `from`'s (deduped by op+pattern),
    // and carry over autoCategorize/autoCategoryId/hidden only where the
    // target doesn't already set them. `from`'s record is dropped.
    const ruleKey = r => r.op + '|' + payeeKey(r.pattern);
    const mergedRules = [];
    const seenRules = new Set();
    for (const r of [...(targetExisting.renameRules || []), ...(rec.renameRules || [])]) {
      if (seenRules.has(ruleKey(r))) continue;
      seenRules.add(ruleKey(r));
      mergedRules.push(r);
    }
    const merged = { ...targetExisting, name: toName };
    if (mergedRules.length) merged.renameRules = mergedRules;
    if (merged.autoCategorize === undefined && rec.autoCategorize !== undefined) merged.autoCategorize = rec.autoCategorize;
    if (!merged.autoCategoryId && rec.autoCategoryId) merged.autoCategoryId = rec.autoCategoryId;
    if (merged.hidden === undefined && rec.hidden !== undefined) merged.hidden = rec.hidden;
    payees = data.payees.filter(p => p.id !== rec.id).map(p => (p.id === targetExisting.id ? merged : p));
  } else if (rec) {
    payees = data.payees.map(p => (p.id === rec.id ? { ...p, name: toName } : p));
  }
  // Nothing moved and the record (if any) already carries this exact spelling.
  if (!changed && (!rec || rec.name === toName)) return data;
  return {
    ...data, transactions: out, payees,
    audit: [payeeAudit('Renamed payee "' + String(from).trim() + '" to "' + toName + '" (' + changed + ' transaction' + (changed === 1 ? '' : 's') + ')'), ...(data.audit || [])],
  };
}

export function combinePayees(data, { names, into }) {
  const intoName = String(into || '').trim();
  if (!intoName || !names || names.length === 0) return data;
  const intoKey = payeeKey(intoName);
  const absorbedKeys = names.map(payeeKey).filter(k => k && k !== intoKey);
  // Pure self-combine (single name, no absorbed payees): nothing to combine
  if (absorbedKeys.length === 0 && names.length === 1) return data;
  const allKeys = [...new Set([...absorbedKeys, ...names.map(payeeKey).filter(Boolean)])];
  const { out, changed } = rewriteMerchants(data.transactions, allKeys, intoName);
  const absorbed = data.payees.filter(p => !p.transferRef && absorbedKeys.includes(payeeKey(p.name)));
  // Combining also combines renaming rules (YNAB copy) — deduped by op+pattern.
  const survivorExisting = payeeRecordFor(data, intoName);
  const ruleKey = r => r.op + '|' + payeeKey(r.pattern);
  const mergedRules = [];
  const seenRules = new Set();
  for (const r of [...(survivorExisting?.renameRules || []), ...absorbed.flatMap(p => p.renameRules || [])]) {
    if (seenRules.has(ruleKey(r))) continue;
    seenRules.add(ruleKey(r));
    mergedRules.push(r);
  }
  // Absorbed records also hand over their auto-categorize rule and hidden
  // flag — same merge as renamePayee's collision path, and for the same
  // reason: the absorbed record is about to vanish, so anything it customized
  // is lost unless the survivor takes it. The survivor's own settings always
  // win; among the absorbed, the first record that sets a value wins.
  const merged = survivorExisting ? { ...survivorExisting, name: intoName } : { id: uid(), name: intoName };
  if (mergedRules.length) merged.renameRules = mergedRules;
  for (const p of absorbed) {
    if (merged.autoCategorize === undefined && p.autoCategorize !== undefined) merged.autoCategorize = p.autoCategorize;
    if (!merged.autoCategoryId && p.autoCategoryId) merged.autoCategoryId = p.autoCategoryId;
    if (merged.hidden === undefined && p.hidden !== undefined) merged.hidden = p.hidden;
  }
  let payees = data.payees.filter(p => !absorbed.includes(p));
  if (survivorExisting) {
    payees = payees.map(p => (p.id === survivorExisting.id ? merged : p));
  } else if (!bareRecord(merged)) {
    payees = [...payees, merged];
  }
  if (!changed && absorbed.length === 0) return data;
  return {
    ...data, transactions: out, payees,
    audit: [payeeAudit('Combined ' + names.length + ' payees into "' + intoName + '" (' + changed + ' transaction' + (changed === 1 ? '' : 's') + ')'), ...(data.audit || [])],
  };
}

export function deletePayees(data, { names, replacement = '' }) {
  // Reassigning INTO one of the deleted payees is a legal (if odd) pick from
  // the UI's dropdown: "delete A, B and C, move everything to C". The
  // replacement must then survive both the merchant rewrite and the record
  // sweep, so its key never joins the delete set.
  const replKey = payeeKey(replacement);
  const keys = (names || []).map(payeeKey).filter(k => k && k !== replKey);
  if (keys.length === 0) return data;
  const { out, changed } = rewriteMerchants(data.transactions, keys, String(replacement || '').trim());
  const payees = data.payees.filter(p => p.transferRef || !keys.includes(payeeKey(p.name)));
  if (!changed && payees.length === data.payees.length) return data;
  const dest = String(replacement || '').trim() || '[No Payee]';
  return {
    ...data, transactions: out, payees,
    audit: [payeeAudit('Deleted ' + keys.length + ' payee' + (keys.length === 1 ? '' : 's') + ' — ' + changed + ' transaction' + (changed === 1 ? '' : 's') + ' reassigned to ' + dest), ...(data.audit || [])],
  };
}

// A record whose ONLY remaining customization was `hidden` disappears when
// un-hidden, keeping the overlay minimal.
const bareAfterUnhide = p => !p.autoCategorize && !p.autoCategoryId && !(p.renameRules || []).length;

export function setPayeesHidden(data, { names = [], transferRefs = [], hidden }) {
  let payees = [...data.payees];
  let changed = 0;
  for (const name of names) {
    const rec = payeeRecordFor({ payees }, name);
    if (rec) {
      if (!!rec.hidden === !!hidden) continue;
      changed += 1;
      if (!hidden && bareAfterUnhide(rec)) payees = payees.filter(p => p.id !== rec.id);
      else payees = payees.map(p => (p.id === rec.id ? { ...p, hidden } : p));
    } else if (hidden) {
      changed += 1;
      payees = [...payees, { id: uid(), name: String(name).trim(), hidden: true }];
    }
  }
  for (const ref of transferRefs) {
    const rec = payees.find(p => p.transferRef === ref);
    if (rec) {
      if (!!rec.hidden === !!hidden) continue;
      changed += 1;
      if (!hidden) payees = payees.filter(p => p.id !== rec.id); // transfer records hold nothing else
      else payees = payees.map(p => (p === rec ? { ...p, hidden } : p));
    } else if (hidden) {
      changed += 1;
      payees = [...payees, { id: uid(), name: '', transferRef: ref, hidden: true }];
    }
  }
  if (!changed) return data;
  return {
    ...data, payees,
    audit: [payeeAudit((hidden ? 'Hid ' : 'Unhid ') + changed + ' payee' + (changed === 1 ? '' : 's')), ...(data.audit || [])],
  };
}

// ---- plans (U2) ------------------------------------------------------------
// No audit rows for plan lifecycle (Q2=A): audit_log is plan-scoped, so a row
// about another plan's creation/deletion would misfile into whichever plan
// happens to be open. Callers dispatch createPlan/deletePlan with system:true
// (never undoable — the switch/delete flows reload anyway).

const MAX_PLAN_NAME = 80;

// Clamp settings to the 0017 catalogues rather than queueing a push the
// server's CHECK constraints would reject (a dead-end 'rejected:plans').
const planSettings = f => ({
  currency: /^[A-Z]{3}$/.test(f.currency || '') ? f.currency : PLAN_DEFAULTS.currency,
  currencyPlacement: PLAN_PLACEMENTS.includes(f.currencyPlacement) ? f.currencyPlacement : PLAN_DEFAULTS.currencyPlacement,
  numberFormat: PLAN_NUMBER_FORMATS.includes(f.numberFormat) ? f.numberFormat : PLAN_DEFAULTS.numberFormat,
  dateFormat: PLAN_DATE_FORMATS.includes(f.dateFormat) ? f.dateFormat : PLAN_DEFAULTS.dateFormat,
});

export function createPlan(data, f) {
  const name = String(f.name || '').trim();
  if (!name || name.length > MAX_PLAN_NAME) return data;
  const plans = data.plans || [];
  if (f.id && plans.some(p => p.id === f.id)) return data;
  const plan = { id: f.id || uid(), name, ...planSettings(f) };
  return { ...data, plans: [...plans, plan] };
}

export function renamePlan(data, { id, name }) {
  const p = (data.plans || []).find(x => x.id === id);
  const trimmed = String(name || '').trim();
  if (!p || !trimmed || trimmed.length > MAX_PLAN_NAME || p.name === trimmed) return data;
  return { ...data, plans: data.plans.map(x => (x.id === id ? { ...x, name: trimmed } : x)) };
}

// Removes only the plans row: children of a non-open plan are not in memory,
// and the server cascade owns them either way (U1 BR-2). The last plan can
// never be deleted (BR-U2-9) — guarded here as well as in the UI.
export function deletePlan(data, { id }) {
  const plans = data.plans || [];
  if (plans.length <= 1 || !plans.some(p => p.id === id)) return data;
  return { ...data, plans: plans.filter(p => p.id !== id) };
}

// One-shot seeding for a new plan (BR-U2-5): always mints fresh ids — the
// fixed catalogue ids exist only in the migrated default plan, and reusing
// them across plans would collide in exports and cross-plan tooling.
// isSystem stays true: it means "came from the default set", not "fixed id".
export function seedPlanCategories(data) {
  if ((data.categories || []).length > 0) return data;
  return { ...data, categories: CATEGORIES.map(c => ({ ...c, id: uid() })) };
}
