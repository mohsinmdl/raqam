// The inline editor's pure brain. The row edits YNAB-vocabulary cells
// (account/date/payee/category/memo/outflow/inflow/cleared/repeat) but the
// form object underneath stays in TxForm's legacy shape, so useSubmit(),
// validate.transaction and buildTx run unchanged. Every translation between
// the two vocabularies — including the type inference the spec fixes
// (outflow→expense, inflow+category→refund, inflow+none→income,
// transfer-payee→transfer) — lives here, tested without a DOM.
import { formatAmountInput } from './amountInput.js';

// Where the CURRENT type keeps its source-account ref.
export function sourceRef(f) {
  const type = f.type || 'expense';
  if (type === 'transfer') return f.from || '';
  if (type === 'income' || type === 'adjustment') return f.account || '';
  return f.payWith || '';
}

// A patch that moves the source ref into the field `nextType` reads it from.
// Both source fields are always emitted (one filled, one cleared) so a stale
// ref can never linger in the field the type just left.
function retype(f, nextType, ref) {
  if (nextType === 'income') return { type: 'income', account: ref, payWith: '' };
  return { type: nextType, payWith: ref, account: '' }; // expense | refund
}
function sourceField(f) {
  const type = f.type || 'expense';
  return type === 'transfer' ? 'from' : (type === 'income' || type === 'adjustment') ? 'account' : 'payWith';
}

// Income cannot land on a card (validate: ownsAcc only), so an inflow with a
// card source is always a refund; with a bank source the category decides.
function inflowType(f, categoryOverride) {
  const cat = categoryOverride !== undefined ? categoryOverride : f.category;
  const onCard = String(sourceRef(f)).startsWith('card:');
  return onCard || (cat && cat !== 'rta') ? 'refund' : 'income';
}

export function editorPatch(f, key, value) {
  const type = f.type || 'expense';
  if (key === 'date') return { date: value };
  if (key === 'memo') return { notes: value };
  if (key === 'cleared') return { pending: !value };
  if (key === 'repeat') return { repeat: value };

  if (key === 'account') return { [sourceField(f)]: value };

  if (key === 'payee') {
    if (type !== 'transfer') return { merchant: value };
    // A typed payee ends the transfer: back to money-out from the old source.
    return { merchant: value, type: 'expense', payWith: f.from || '', from: '', to: '' };
  }

  if (key === 'transfer') {
    // To/From payee: become a transfer from the current source to `value`.
    // Transfers carry no category, no merchant, no split, no repeat.
    return {
      type: 'transfer', from: sourceRef(f), to: value,
      merchant: '', category: '', splitOn: false, splits: undefined, repeat: 'never',
    };
  }

  if (key === 'category') {
    if (type === 'income' && value) return { category: value, ...retype(f, 'refund', sourceRef(f)) };
    if (type === 'refund' && !value && !String(sourceRef(f)).startsWith('card:')) {
      return { category: '', ...retype(f, 'income', sourceRef(f)) };
    }
    return { category: value };
  }

  const amount = formatAmountInput(String(value));
  if (key === 'outflow') {
    if (type === 'transfer') return { amount };
    if (type === 'adjustment') return { amount, direction: 'decrease' };
    if (type === 'expense') return { amount };
    return { amount, ...retype(f, 'expense', sourceRef(f)) };
  }
  // key === 'inflow'
  if (type === 'transfer') {
    // Direction flip: money arrives INTO the row's account, so from/to swap.
    return f.to ? { amount, from: f.to, to: f.from } : { amount };
  }
  if (type === 'adjustment') return { amount, direction: 'increase' };
  const t = inflowType(f);
  if (t === type) return { amount };
  return { amount, ...retype(f, t, sourceRef(f)) };
}

// The editor cells for a form (add defaults or formFromTx output for edits).
export function cellsFromForm(f) {
  const type = f.type || 'expense';
  const amt = f.amount ? formatAmountInput(String(f.amount)) : '';
  // Which side the magnitude sits on mirrors txRowOf's outflow/inflow split.
  const inflowSide = type === 'income' || type === 'refund'
    || (type === 'adjustment' && f.direction === 'increase');
  return {
    account: sourceRef(f),
    date: f.date || '',
    payee: f.merchant || '',
    transferTo: type === 'transfer' ? (f.to || '') : '',
    category: f.category || '',
    memo: f.notes || '',
    outflow: inflowSide ? '' : amt,
    inflow: inflowSide ? amt : '',
    cleared: !f.pending,
    repeat: f.repeat || 'never',
  };
}

// Which cells this row exposes. Adjustments reconcile a balance: no payee, no
// category, and the account is fixed. Transfers have no category (the picker's
// Payment/Transfer label renders instead).
export function editableCells(f) {
  const type = f.type || 'expense';
  if (type === 'adjustment') {
    return { account: false, date: true, payee: false, category: false, memo: true, outflow: true, inflow: true, cleared: true };
  }
  return { account: true, date: true, payee: true, category: type !== 'transfer', memo: true, outflow: true, inflow: true, cleared: true };
}

// Autofocus target: the first empty cell in column order. Amounts count as
// one slot (either side filled = not empty). Memo/category never take first
// focus on a fresh row — payee is the natural resting place YNAB uses.
export function firstEmptyCell(cells, hideAccount) {
  if (!hideAccount && !cells.account) return 'account';
  if (!cells.date) return 'date';
  if (!cells.payee) return 'payee';
  if (!cells.outflow && !cells.inflow) return 'payee';
  return 'payee';
}

// "Save and add another" carries the source and date into the next row. The
// next row always starts as an expense (txDefaults('expense')), and an
// expense reads its source from payWith — so the ref lands there whatever
// field the finished row kept it in.
export function keepForNext(f) {
  return { payWith: sourceRef(f), date: f.date };
}
