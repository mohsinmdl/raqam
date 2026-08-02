// Drawer-opening prefill helpers, ported from the prototype's open* handlers
// (script 812-833). Each returns via openDrawer(name, form).
import { accountBalance, cardOutstanding } from '../lib/calc.js';
import { currentMonth, todayStr } from '../lib/dates.js';

export function txDefaults(type) {
  return {
    type, date: todayStr(), amount: '', payWith: '', account: '', from: '', to: '', fee: '',
    category: '', newCat: '', merchant: '', notes: '', pending: false,
    direction: 'increase', reason: '', fromRecurring: null,
  };
}

export const openers = {
  addTx: (openDrawer, type = 'expense') => openDrawer('addTx', txDefaults(type)),

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

  adjust: (accountId, openDrawer) => openDrawer('adjust', {
    accountId, direction: 'increase', amount: '', reason: '', date: todayStr(),
  }),

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
