// Shared validation schemas, ported from design-v2 store.js.
// Each returns an errors object keyed by form field: {} means valid. Drawer
// useSubmit hooks run these on submit; RLS + CHECK constraints are the server gate.
import { catById, catRefs, duplicateCat } from './calc.js';
import { parseAmt } from './util.js';

const req = v => String(v == null ? '' : v).trim().length > 0;
const LAST4 = /^\d{4}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 240, MAX_NOTES = 1000;

export const validate = {
  // ---- transactions ----
  transaction(store, f, opts) {
    const o = opts || {}, e = {}, type = f.type || 'expense';
    const amt = parseAmt(f.amount);
    if (!(amt > 0)) e.amount = 'Enter an amount greater than zero.';
    else if (amt > 1e12) e.amount = 'That amount is too large to record.';
    if (!ISO_DATE.test(String(f.date || ''))) e.date = 'Choose a valid date.';
    if (f.time && !/^\d{2}:\d{2}$/.test(f.time)) e.date = 'Enter the time as HH:MM.';

    const ownsAcc = ref => !!store.accounts.find(a => 'acc:' + a.id === ref);
    const ownsCard = ref => !!store.cards.find(c => 'card:' + c.id === ref);

    if (type === 'expense' || type === 'refund') {
      if (!req(f.payWith)) e.payWith = type === 'refund' ? 'Choose where the refund landed.' : 'Choose the account or card you paid with.';
      else if (!(ownsAcc(f.payWith) || ownsCard(f.payWith))) e.payWith = 'That account or card is not available.';
    }
    if (type === 'income') {
      if (!req(f.account)) e.account = 'Choose the account that received it.';
      else if (!ownsAcc(f.account)) e.account = 'That account is not available.';
    }
    if (type === 'transfer') {
      if (!req(f.from) || !req(f.to)) e.transfer = 'Choose both the From and To accounts.';
      else if (f.from === f.to) e.transfer = 'From and To must be different accounts.';
      else if (!ownsAcc(f.from) || !(ownsAcc(f.to) || ownsCard(f.to))) e.transfer = 'One of those accounts is not available.';
      if (req(f.fee) && !(parseAmt(f.fee) >= 0)) e.fee = 'The fee must be zero or more.';
    }
    if (type === 'adjustment') {
      if (!req(f.account)) e.account = 'Choose the account to adjust.';
      else if (!ownsAcc(f.account)) e.account = 'That account is not available.';
      if (!req(f.reason)) e.reason = 'Add a short reason — adjustments are labelled in history.';
    }
    if (type === 'expense' || type === 'income' || type === 'refund') {
      if (!req(f.category)) e.category = 'Choose a category.';
      else if (f.category === '__new' && !req(f.newCat)) e.category = 'Name the new category.';
      else if (f.category !== '__new') {
        const cat = catById(store, f.category);
        if (!cat) e.category = 'That category no longer exists.';
        else if (cat.type !== (type === 'income' ? 'income' : 'expense')) e.category = 'That category is an ' + cat.type + ' category — choose one that matches this transaction.';
        else if (cat.status === 'archived' && !o.allowArchivedCategory) e.category = 'That category is archived — choose an active one.';
      }
    }
    if (String(f.merchant || '').length > MAX_TEXT) e.merchant = 'Keep this under ' + MAX_TEXT + ' characters.';
    if (String(f.notes || '').length > MAX_NOTES) e.notes = 'Keep notes under ' + MAX_NOTES + ' characters.';
    return e;
  },

  // ---- accounts ----
  account(store, f, opts) {
    const o = opts || {}, e = {};
    if (!req(f.inst)) e.inst = 'Choose an institution.';
    else if (f.inst === '__custom' && !req(f.customInst)) e.inst = 'Name the custom institution.';
    else if (f.inst !== '__custom' && !store.institutions.find(i => i.id === f.inst)) e.inst = 'That institution is not available.';
    if (!req(f.nickname)) e.nickname = 'Give the account a nickname.';
    else if (String(f.nickname).trim().length > 60) e.nickname = 'Keep the nickname under 60 characters.';
    if (f.type && !['Current', 'Savings', 'Salary', 'Foreign currency', 'Mobile wallet'].includes(f.type)) e.type = 'Choose a valid account type.';
    if (f.status && !['active', 'archived', 'closed'].includes(f.status)) e.status = 'Choose a valid status.';
    if (req(f.last4) && !LAST4.test(String(f.last4).trim())) e.last4 = 'Exactly 4 digits, or leave it blank.';
    if (String(f.last4 || '').length > 4) e.last4 = 'Only the last 4 digits — never a full account number.';
    if (!o.skipBalance) { if (!isFinite(parseAmt(f.balance))) e.balance = 'Enter the current balance in rupees.'; }
    if (String(f.notes || '').length > MAX_NOTES) e.notes = 'Keep notes under ' + MAX_NOTES + ' characters.';
    return e;
  },

  // ---- cards ----
  card(store, f, opts) {
    const o = opts || {}, e = {};
    if (!req(f.inst)) e.inst = 'Choose the bank.';
    else if (f.inst === '__custom' && !req(f.customInst)) e.inst = 'Name the custom institution.';
    else if (f.inst !== '__custom' && !store.institutions.find(i => i.id === f.inst)) e.inst = 'That institution is not available.';
    if (!req(f.nickname)) e.nickname = 'Give the card a nickname.';
    else if (String(f.nickname).trim().length > 60) e.nickname = 'Keep the nickname under 60 characters.';
    if (req(f.last4) && !LAST4.test(String(f.last4).trim())) e.last4 = 'Exactly 4 digits, or leave it blank.';
    const type = o.resolvedType || f.ctype || 'debit';
    if (!['debit', 'credit', 'prepaid', 'virtual'].includes(type)) e.ctype = 'Choose a valid card type.';
    if (f.network && !['Visa', 'Mastercard', 'UnionPay', 'PayPak', 'Other'].includes(f.network)) e.network = 'Choose a valid network.';
    if (f.status && !['active', 'closed'].includes(f.status)) e.status = 'Choose a valid status.';
    if (type === 'credit') {
      const lim = parseAmt(f.limit);
      if (!isFinite(lim)) e.limit = 'Enter the credit limit.';
      else if (lim < 0) e.limit = 'The credit limit cannot be negative.';
      const day = parseInt(f.stmtDay, 10);
      if (f.stmtDay && (!isFinite(day) || day < 1 || day > 31)) e.stmtDay = 'Statement day must be between 1 and 31.';
      if (f.due && !ISO_DATE.test(String(f.due))) e.due = 'Choose a valid due date.';
    }
    if (type === 'debit') {
      if (!req(f.linked)) e.linked = 'Choose the linked account.';
      else if (!store.accounts.find(a => 'acc:' + a.id === f.linked)) e.linked = 'That account is not available.';
    }
    // Fields that must never reach the model at all.
    ['cardNumber', 'cvv', 'pin', 'otp', 'password'].forEach(k => { if (f[k]) e.security = 'Sensitive card details are never stored.'; });
    return e;
  },

  // ---- categories ----
  category(store, f, opts) {
    const o = opts || {}, e = {};
    const name = String(f.name || '').trim();
    if (!name) e.name = 'Give the category a name.';
    else if (name.length > 40) e.name = 'Keep the name under 40 characters.';
    if (!['expense', 'income'].includes(f.type)) e.type = 'Choose income or expense.';
    if (name && f.type) {
      const dup = duplicateCat(store, { name, type: f.type, excludeId: o.id });
      if (dup) e.name = 'Another ' + f.type + ' category is already called “' + dup.name + '”.';
    }
    if (f.icon && !['square', 'circle', 'diamond', 'ring', 'bar', 'triangle'].includes(f.icon)) e.icon = 'Choose an icon from the set.';
    if (f.color && !/^#[0-9A-Fa-f]{6}$/.test(f.color)) e.color = 'Choose a colour from the palette.';
    if (String(f.description || '').length > MAX_TEXT) e.description = 'Keep the description under ' + MAX_TEXT + ' characters.';
    // Type change is blocked once financial records exist.
    if (o.id && o.originalType && f.type !== o.originalType) {
      const refs = catRefs(store, o.id);
      if (refs.transactions || refs.budgets || refs.recurring) {
        e.type = 'This category is used by ' + refs.transactions + ' transaction' + (refs.transactions === 1 ? '' : 's') +
          ' — its income/expense type can no longer be changed. Archive it and create a new one instead.';
      }
    }
    return e;
  },

  // ---- budgets ----
  budget(store, f, opts) {
    const o = opts || {}, e = {};
    const amt = parseAmt(f.amount);
    if (!(amt > 0)) e.amount = 'Enter a budget amount greater than zero.';
    else if (amt > 1e12) e.amount = 'That amount is too large to record.';
    if (!o.overall) {
      if (!req(f.category)) e.category = 'Choose the category this budget covers.';
      else {
        const cat = catById(store, f.category);
        if (!cat) e.category = 'That category no longer exists.';
        else if (cat.type !== 'expense') e.category = 'Budgets cover expense categories only.';
        else if (cat.status === 'archived') e.category = 'That category is archived — choose an active one.';
        else if (cat.excludeFromBudget) e.category = '“' + cat.name + '” is excluded from budgets.';
        else if (store.budgets.some(b => b.category === f.category && b.id !== o.id)) e.category = '“' + cat.name + '” already has a budget. Edit that one instead.';
      }
    }
    return e;
  },
};

// What a category delete is allowed to do, and why.
export function deletePolicy(store, cat) {
  const refs = catRefs(store, cat.id);
  if (cat.isSystem) return { mode: 'archive', refs, reason: 'system' };
  if (refs.total === 0) return { mode: 'delete', refs, reason: 'unused' };
  return { mode: 'reassign', refs, reason: 'referenced' };
}
