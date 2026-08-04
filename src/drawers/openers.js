// Drawer-opening prefill helpers, ported from the prototype's open* handlers
// (script 812-833). Each returns via openDrawer(name, form).
import { accountBalance, cardOutstanding } from '../lib/calc.js';
import { currentMonth, nowIso, todayStr } from '../lib/dates.js';

export function txDefaults(type) {
  return {
    // Time defaults to NOW (app deviation from the design's fixed 12:00 — user request)
    type, date: todayStr(), time: nowIso().slice(11, 16), amount: '', payWith: '', account: '', from: '', to: '', fee: '',
    category: '', newCat: '', merchant: '', notes: '', pending: false,
    direction: 'increase', reason: '', fromRecurring: null,
    editId: null, originalType: null, originalCategory: null,
  };
}

// Reverse a stored transaction into form shape for editing (design formFromTx).
export function formFromTx(t) {
  const f = txDefaults(t.type === 'cardAdjustment' ? 'adjustment' : t.type);
  f.editId = t.id;
  f.originalType = t.type;
  f.originalCategory = t.category || null;
  f.date = t.date.slice(0, 10);
  f.time = t.date.slice(11, 16) || '12:00';
  f.amount = String(Math.abs(t.amount));
  f.pending = t.status === 'pending';
  f.merchant = t.merchant || '';
  f.notes = t.notes || '';
  if (t.type === 'expense' || t.type === 'refund') {
    f.payWith = t.cardId ? 'card:' + t.cardId : (t.accountId ? 'acc:' + t.accountId : '');
    f.category = t.category || '';
  } else if (t.type === 'income') {
    f.account = t.accountId ? 'acc:' + t.accountId : '';
    f.category = t.category || '';
  } else if (t.type === 'transfer') {
    f.from = t.accountId ? 'acc:' + t.accountId : '';
    f.to = t.toCardId ? 'card:' + t.toCardId : (t.toAccountId ? 'acc:' + t.toAccountId : '');
    f.fee = t.fee ? String(t.fee) : '';
  } else if (t.type === 'adjustment') {
    f.account = t.accountId ? 'acc:' + t.accountId : '';
    f.direction = t.amount < 0 ? 'decrease' : 'increase';
    f.reason = t.adjustmentReason || t.notes || '';
    f.merchant = '';
  }
  return f;
}

export const openers = {
  addTx: (openDrawer, type = 'expense') => openDrawer('addTx', txDefaults(type)),

  editTx: (S, txId, openDrawer) => {
    const t = S.transactions.find(x => x.id === txId);
    if (!t || t.type === 'cardAdjustment') return; // card corrections are re-issued, not edited
    openDrawer('addTx', formFromTx(t));
  },

  addAccount: openDrawer => openDrawer('addAccount', {
    inst: '', customInst: '', type: 'Current', nickname: '', islamic: 'conventional',
    balance: '', asof: todayStr(), last4: '', notes: '',
  }),

  addCard: openDrawer => openDrawer('addCard', {
    inst: '', product: '', ctype: 'debit', network: 'Visa', tier: '', nickname: '',
    last4: '', limit: '', stmtDay: '25', due: '', linked: '',
  }),

  snapshot: (S, openDrawer) => {
    const m = currentMonth(), f = {};
    S.accounts.filter(a => a.status === 'active').forEach(a => {
      const snap = S.snapshots.find(x => x.accountId === a.id && x.month === m);
      f['snap_' + a.id] = String(snap ? snap.amount : accountBalance(a, S, m));
    });
    openDrawer('snapshot', f);
  },

  payCard: (S, cardId, openDrawer) => {
    const c = S.cards.find(x => x.id === cardId);
    if (!c) return;
    const out = cardOutstanding(c, S, currentMonth());
    openDrawer('payCard', { cardId: c.id, from: c.linkedAccountId ? 'acc:' + c.linkedAccountId : '', amount: String(out), date: todayStr() });
  },

  // Target-value balance correction: prefill with the CURRENT computed balance.
  adjust: (S, accountId, openDrawer) => {
    const acc = S.accounts.find(a => a.id === accountId);
    const cur = acc ? accountBalance(acc, S, currentMonth()) : 0;
    openDrawer('adjust', { accountId, newBalance: String(cur), reason: '', date: todayStr(), currentBalance: cur });
  },

  editAccount: (S, accountId, openDrawer) => {
    const a = S.accounts.find(x => x.id === accountId);
    if (!a) return;
    openDrawer('addAccount', {
      editId: a.id, inst: a.instId, customInst: '', type: a.type, nickname: a.nickname,
      islamic: a.islamic ? 'islamic' : 'conventional', last4: a.last4 || '', notes: a.notes || '',
      status: a.status, balance: '', asof: '',
    });
  },

  editCard: (S, cardId, openDrawer) => {
    const c = S.cards.find(x => x.id === cardId);
    if (!c) return;
    openDrawer('addCard', {
      editId: c.id, inst: c.instId, product: c.productId || '__custom', ctype: c.type,
      network: c.network || 'Visa', tier: c.tier || '', nickname: c.nickname, last4: c.last4 || '',
      limit: c.limit != null ? String(c.limit) : '', stmtDay: c.statementDay != null ? String(c.statementDay) : '25',
      due: c.dueDate || '', linked: c.linkedAccountId ? 'acc:' + c.linkedAccountId : '',
      status: c.status, annualFeeMonth: c.annualFeeMonth || '', theme: c.theme || 'teal',
    });
  },

  adjustCard: (S, cardId, openDrawer) => {
    const c = S.cards.find(x => x.id === cardId);
    if (!c) return;
    const out = cardOutstanding(c, S, currentMonth());
    openDrawer('adjustCard', { cardId, newOutstanding: String(out), reason: '', date: todayStr(), currentOutstanding: out });
  },

  addCategory: openDrawer => openDrawer('category', {
    editId: null, name: '', type: 'expense', icon: 'square', color: '#0F766E',
    description: '', sortOrder: '99', originalType: null, excludeFromBudget: false,
  }),

  addBudget: openDrawer => openDrawer('budget', { editId: null, overall: false, category: '', amount: '', rollover: false }),

  editOverallBudget: (S, openDrawer) => {
    const b = S.budgets.find(x => !x.category);
    openDrawer('budget', b
      ? { editId: b.id, overall: true, category: '', amount: String(b.amount), rollover: !!b.rollover }
      : { editId: null, overall: true, category: '', amount: '', rollover: false });
  },

  editBudget: (S, id, openDrawer) => {
    const b = S.budgets.find(x => x.id === id);
    if (!b) return;
    openDrawer('budget', { editId: b.id, overall: !b.category, category: b.category || '', amount: String(b.amount), rollover: !!b.rollover });
  },

  budgetForCat: (catId, openDrawer) => openDrawer('budget', { editId: null, overall: false, category: catId, fixedCat: true, amount: '', rollover: false }),

  editCategory: (S, catId, openDrawer) => {
    const c = S.categories.find(x => x.id === catId);
    if (!c) return;
    openDrawer('category', {
      editId: c.id, name: c.name, type: c.type, icon: c.icon || 'square', color: c.color,
      description: c.description || '', sortOrder: String(c.sortOrder ?? 99), originalType: c.type,
      excludeFromBudget: !!c.excludeFromBudget,
    });
  },

  reassignCategory: (catId, openDrawer) => openDrawer('reassign', { catId, replacement: '' }),

  recurring: (S, recurringId, openDrawer) => {
    const r = S.recurring.find(x => x.id === recurringId);
    if (!r) return;
    const f = txDefaults(r.type === 'income' ? 'income' : 'expense');
    f.amount = String(r.amount); f.date = r.nextDate; f.merchant = r.name;
    f.category = r.category; f.fromRecurring = r.id;
    if (r.type === 'income') f.account = r.accountId ? 'acc:' + r.accountId : '';
    else f.payWith = r.cardId ? 'card:' + r.cardId : (r.accountId ? 'acc:' + r.accountId : '');
    openDrawer('addTx', f);
  },
};
