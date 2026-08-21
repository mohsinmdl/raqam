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
// card source is always a refund; with a bank source the category decides —
// and only an EXPENSE-typed category counts. Neither this function nor
// editorPatch can see the store, so the caller passes ctx.catTypeOf; with no
// ctx (or an unknown category) the safe default is income, never a silent
// refund flip (data-corruption class: refund requires an EXPENSE category —
// validate.transaction would reject an income-typed one).
function inflowType(f, categoryOverride, ctx = {}) {
  const cat = categoryOverride !== undefined ? categoryOverride : f.category;
  const onCard = String(sourceRef(f)).startsWith('card:');
  const catTypeOf = ctx.catTypeOf || (() => null);
  const isExpenseCat = !!cat && cat !== 'rta' && catTypeOf(cat) === 'expense';
  return onCard || isExpenseCat ? 'refund' : 'income';
}

export function editorPatch(f, key, value, ctx = {}) {
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
    // Only an EXPENSE-typed pick turns income into a refund — an income- or
    // unknown-typed category (ctx absent, or the category not found) leaves
    // the row as income, since validate.transaction requires a refund's
    // category to be EXPENSE-typed and would otherwise reject the save.
    if (type === 'income' && value) {
      const catType = (ctx.catTypeOf || (() => null))(value);
      if (catType === 'expense') return { category: value, ...retype(f, 'refund', sourceRef(f)) };
      return { category: value };
    }
    if (type === 'refund' && !value && !String(sourceRef(f)).startsWith('card:')) {
      return { category: '', ...retype(f, 'income', sourceRef(f)) };
    }
    return { category: value };
  }

  if ((key === 'outflow' || key === 'inflow') && !String(value).trim()) {
    // An emptied amount cell just clears the amount — it must not retype
    // the row (e.g. bounce an income row through expense on the way to empty).
    return { amount: '' };
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
    // Direction is controlled solely by the account cell and the To/From
    // payee — an amount edit must never flip it. A re-edit of an existing
    // inflow-direction transfer would otherwise silently reverse it back.
    return { amount };
  }
  if (type === 'adjustment') return { amount, direction: 'increase' };
  const t = inflowType(f, undefined, ctx);
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

// The row owns Tab (strict column-to-column, YNAB-style): these two derive
// the walk. tabCells lists the cells that participate — hidden columns and
// non-editable cells (editableCells) drop out, so Tab can never land on a
// disabled control and appear dead. tabTarget steps through that list; null
// off either end means the row hands the keystroke back to the browser
// (backward to whatever precedes the row, forward to the action buttons).
export function tabCells({ hideAccount, hideMemo, can }) {
  return ['account', 'date', 'payee', 'category', 'memo', 'outflow', 'inflow', 'cleared']
    .filter(k => !(k === 'account' && hideAccount) && !(k === 'memo' && hideMemo) && can[k] !== false);
}
export function tabTarget(cells, current, backward) {
  const i = cells.indexOf(current);
  if (i === -1) return null;
  return cells[backward ? i - 1 : i + 1] || null;
}

// Autofocus target: account when it's shown and empty, otherwise payee — the
// natural resting place YNAB uses. Date is always seeded by txDefaults, so it
// can never be the first empty cell in practice; memo/category never take
// first focus on a fresh row either.
export function firstEmptyCell(cells, hideAccount) {
  return (!hideAccount && !cells.account) ? 'account' : 'payee';
}

// Field attribution for validate.transaction / validateSplit's error map —
// which editor CELL should carry a given error key, so a failed submit can
// ring the right field instead of leaving the failure only in the footer
// summary. account absorbs the three source-of-truth keys (payWith/account/
// transfer) since they're the same visual cell under different type-driven
// field names (sourceField). amount is special: validate emits one 'amount'
// key regardless of which side the magnitude is showing on, so the side is
// re-derived here the same way cellsFromForm does (inflowSide truth table),
// never assumed. Values are the original message string, so a caller can
// wire it straight into aria-describedby text with no second lookup.
export function errorCells(errors, f) {
  const e = errors || {};
  const cells = {};
  const accountMsg = e.payWith || e.account || e.transfer;
  if (accountMsg) cells.account = accountMsg;
  if (e.date) cells.date = e.date;
  if (e.merchant) cells.payee = e.merchant;
  const categoryMsg = e.category || e.split;
  if (categoryMsg) cells.category = categoryMsg;
  if (e.amount) {
    const type = (f && f.type) || 'expense';
    const inflowSide = type === 'income' || type === 'refund'
      || (type === 'adjustment' && f && f.direction === 'increase');
    cells[inflowSide ? 'inflow' : 'outflow'] = e.amount;
  }
  return cells;
}

// Escape/Cancel discard-guard gate: an empty-ish addTx draft (payee typed, a
// memo jotted) isn't worth a confirm dialog on the way out — nothing the user
// would call "work" is at risk. A draft only earns the confirm once it holds
// something that would actually be lost: a real amount, a category pick, a
// split in progress, or (for a transfer) a chosen To/From account. Payee and
// memo text alone are NOT meaningful — closing quietly with just those typed
// matches YNAB's own quick-add feel.
export function isMeaningfulDraft(f) {
  if (!f) return false;
  if (String(f.amount == null ? '' : f.amount).trim()) return true;
  if (f.category) return true;
  if (f.splitOn && (f.splits || []).length > 0) return true;
  if ((f.type || 'expense') === 'transfer' && f.to) return true;
  return false;
}

// "Save and add another" carries the source and date into the next row. The
// next row always starts as an expense (txDefaults('expense')), and an
// expense reads its source from payWith — so the ref lands there whatever
// field the finished row kept it in.
export function keepForNext(f) {
  return { payWith: sourceRef(f), date: f.date };
}
