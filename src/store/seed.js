// Demo catalogue + seed data — ALL values fictional demo data, ported from the design prototype.
// The fixtures are authored against a frozen reference window (2026-06 … 2026-08); makeDemoStore()
// shifts every date by whole months so the demo always spans the real current month and the two before it.
import { clampDay, currentMonth, monthsBetween, todayStr } from '../lib/dates.js';

// ---- Fixture reference window (do not change without re-checking every date below) ----
const FIXTURE_MONTH = '2026-08';

export const INSTITUTIONS = [
  { id: 'hbl', name: 'HBL', kind: 'Conventional' },
  { id: 'ubl', name: 'UBL', kind: 'Conventional' },
  { id: 'mcb', name: 'MCB Bank', kind: 'Conventional' },
  { id: 'alfalah', name: 'Bank Alfalah', kind: 'Conventional' },
  { id: 'meezan', name: 'Meezan Bank', kind: 'Islamic' },
  { id: 'faysal', name: 'Faysal Bank', kind: 'Islamic' },
  { id: 'bankislami', name: 'BankIslami', kind: 'Islamic' },
  { id: 'scb', name: 'Standard Chartered Pakistan', kind: 'Foreign' },
  { id: 'mmbl', name: 'Mobilink Microfinance (JazzCash)', kind: 'Microfinance' },
  { id: 'tmb', name: 'Telenor Microfinance (easypaisa)', kind: 'Microfinance' },
  { id: 'raqami', name: 'Raqami Islamic Digital Bank', kind: 'Digital' },
];

export const ACCOUNT_TYPES = ['Current', 'Savings', 'Salary', 'Foreign currency', 'Mobile wallet'];

// Demo catalogue — generic labels, NOT verified product claims.
export const CARD_PRODUCTS = [
  { id: 'p1', instId: 'hbl', name: 'Debit Card (demo)', type: 'debit', network: 'Visa', tier: 'Classic' },
  { id: 'p2', instId: 'hbl', name: 'Gold Credit Card (demo)', type: 'credit', network: 'Visa', tier: 'Gold' },
  { id: 'p3', instId: 'hbl', name: 'Platinum Credit Card (demo)', type: 'credit', network: 'Visa', tier: 'Platinum' },
  { id: 'p4', instId: 'meezan', name: 'Titanium Debit (demo)', type: 'debit', network: 'Mastercard', tier: 'Titanium' },
  { id: 'p5', instId: 'ubl', name: 'PayPak Debit (demo)', type: 'debit', network: 'PayPak', tier: 'Classic' },
  { id: 'p6', instId: 'alfalah', name: 'Credit Card (demo)', type: 'credit', network: 'Mastercard', tier: 'Gold' },
  { id: 'p7', instId: 'scb', name: 'Credit Card (demo)', type: 'credit', network: 'Visa', tier: 'Platinum' },
];

export const CATEGORIES = [
  { id: 'groceries', name: 'Groceries', type: 'expense', color: '#0F766E' },
  { id: 'dining', name: 'Dining', type: 'expense', color: '#B7791F' },
  { id: 'transport', name: 'Transport', type: 'expense', color: '#2563EB' },
  { id: 'fuel', name: 'Fuel', type: 'expense', color: '#64748B' },
  { id: 'utilities', name: 'Utilities', type: 'expense', color: '#B7791F' },
  { id: 'mobile', name: 'Mobile & Internet', type: 'expense', color: '#2563EB' },
  { id: 'rent', name: 'Rent', type: 'expense', color: '#64748B' },
  { id: 'healthcare', name: 'Healthcare', type: 'expense', color: '#C2413B' },
  { id: 'education', name: 'Education', type: 'expense', color: '#0F766E' },
  { id: 'shopping', name: 'Shopping', type: 'expense', color: '#B7791F' },
  { id: 'entertainment', name: 'Entertainment', type: 'expense', color: '#2563EB' },
  { id: 'family', name: 'Family support', type: 'expense', color: '#0F766E' },
  { id: 'charity', name: 'Charity & zakat', type: 'expense', color: '#15803D' },
  { id: 'fees', name: 'Bank fees', type: 'expense', color: '#64748B' },
  { id: 'salary', name: 'Salary', type: 'income', color: '#15803D' },
  { id: 'freelance', name: 'Freelance income', type: 'income', color: '#0F766E' },
  { id: 'otherinc', name: 'Other income', type: 'income', color: '#2563EB' },
];

const ACCOUNTS = [
  { id: 'a1', instId: 'hbl', nickname: 'Salary account', type: 'Salary', islamic: false, currency: 'PKR', last4: '4821', status: 'active', notes: 'Employer credits salary here on the 1st.', createdAt: '2025-11-04' },
  { id: 'a2', instId: 'meezan', nickname: 'Savings', type: 'Savings', islamic: true, currency: 'PKR', last4: '0154', status: 'active', notes: 'Long-term savings. Monthly profit posts at month end.', createdAt: '2025-11-04' },
  { id: 'a3', instId: 'ubl', nickname: 'Household', type: 'Current', islamic: false, currency: 'PKR', last4: '7733', status: 'active', notes: 'Utilities and household bills.', createdAt: '2026-01-12' },
  { id: 'a4', instId: 'mcb', nickname: 'Old salary account', type: 'Current', islamic: false, currency: 'PKR', last4: '9102', status: 'archived', notes: 'Closed after switching employers.', createdAt: '2025-11-04' },
];

// Monthly opening snapshots. Confirmed snapshots are immutable; corrections create a new version.
const SNAPSHOTS = [
  { month: '2026-06', accountId: 'a1', amount: 500000, status: 'confirmed', confirmedAt: '2026-06-01T09:40' },
  { month: '2026-06', accountId: 'a2', amount: 1050000, status: 'confirmed', confirmedAt: '2026-06-01T09:40' },
  { month: '2026-06', accountId: 'a3', amount: 160000, status: 'confirmed', confirmedAt: '2026-06-01T09:40' },
  { month: '2026-07', accountId: 'a1', amount: 439490, status: 'confirmed', confirmedAt: '2026-07-01T09:12' },
  { month: '2026-07', accountId: 'a2', amount: 1113850, status: 'confirmed', confirmedAt: '2026-07-01T09:12' },
  { month: '2026-07', accountId: 'a3', amount: 153359, status: 'confirmed', confirmedAt: '2026-07-01T09:12' },
  { month: '2026-08', accountId: 'a1', amount: 322200, status: 'pending' },
  { month: '2026-08', accountId: 'a2', amount: 1215000, status: 'pending' },
  { month: '2026-08', accountId: 'a3', amount: 118000, status: 'pending' },
];

const CARDS = [
  { id: 'c1', instId: 'hbl', productId: 'p2', nickname: 'HBL Gold Credit', type: 'credit', network: 'Visa', tier: 'Gold', last4: '5512', linkedAccountId: 'a1', limit: 300000, openingOutstanding: { '2026-06': 98000, '2026-07': 121459, '2026-08': 84760 }, statementDay: 25, dueDate: '2026-08-15', annualFeeMonth: 'November', status: 'active', theme: 'teal' },
  { id: 'c2', instId: 'meezan', productId: 'p4', nickname: 'Meezan Debit', type: 'debit', network: 'Mastercard', tier: 'Titanium', last4: '0154', linkedAccountId: 'a2', status: 'active', theme: 'ink' },
  { id: 'c3', instId: 'ubl', productId: 'p5', nickname: 'UBL Debit', type: 'debit', network: 'PayPak', tier: 'Classic', last4: '7733', linkedAccountId: 'a3', status: 'active', theme: 'warm' },
];

// amount always positive except adjustment (signed). Card purchases: cardId set, accountId null.
const TRANSACTIONS = [
  // ---- Current month (fixture 2026-08, through the 2nd) ----
  { id: 't801', date: '2026-08-01T09:05', type: 'income', amount: 185000, accountId: 'a1', category: 'salary', merchant: 'Employer Pvt Ltd', notes: 'Monthly salary', status: 'cleared' },
  { id: 't802', date: '2026-08-01T10:20', type: 'transfer', amount: 50000, accountId: 'a1', toAccountId: 'a2', notes: 'Monthly savings move', status: 'cleared' },
  { id: 't803', date: '2026-08-01T18:40', type: 'expense', amount: 12450, accountId: 'a1', category: 'groceries', merchant: 'Imtiaz Super Market', status: 'cleared' },
  { id: 't804', date: '2026-08-01T20:12', type: 'expense', amount: 980, accountId: 'a3', category: 'mobile', merchant: 'Jazz top-up', status: 'cleared' },
  { id: 't805', date: '2026-08-02T08:55', type: 'expense', amount: 6200, accountId: 'a1', category: 'fuel', merchant: 'PSO — Shahrah-e-Faisal', status: 'cleared' },
  { id: 't806', date: '2026-08-02T11:30', type: 'expense', amount: 9999, cardId: 'c1', category: 'shopping', merchant: 'Daraz', notes: 'Kitchen mixer', status: 'cleared' },
  { id: 't807', date: '2026-08-02T13:00', type: 'expense', amount: 18340, accountId: 'a3', category: 'utilities', merchant: 'K-Electric', notes: 'Bill — awaiting clearance', status: 'pending' },
  // ---- Previous month (fixture 2026-07) ----
  { id: 't701', date: '2026-07-01T09:02', type: 'income', amount: 185000, accountId: 'a1', category: 'salary', merchant: 'Employer Pvt Ltd', status: 'cleared' },
  { id: 't702', date: '2026-07-01T11:00', type: 'transfer', amount: 100000, accountId: 'a1', toAccountId: 'a2', notes: 'Savings move', status: 'cleared' },
  { id: 't703', date: '2026-07-03T19:10', type: 'expense', amount: 11200, accountId: 'a1', category: 'groceries', merchant: 'Imtiaz Super Market', status: 'cleared' },
  { id: 't704', date: '2026-07-04T10:30', type: 'expense', amount: 10000, accountId: 'a1', category: 'charity', merchant: 'Edhi Foundation', status: 'cleared' },
  { id: 't705', date: '2026-07-05T09:00', type: 'expense', amount: 85000, accountId: 'a1', category: 'rent', merchant: 'House rent — Gulshan', status: 'cleared' },
  { id: 't706', date: '2026-07-06T21:15', type: 'expense', amount: 4200, cardId: 'c1', category: 'dining', merchant: 'Kolachi', status: 'cleared' },
  { id: 't707', date: '2026-07-08T12:00', type: 'expense', amount: 3999, accountId: 'a3', category: 'mobile', merchant: 'StormFiber', status: 'cleared' },
  { id: 't708', date: '2026-07-08T17:45', type: 'expense', amount: 5900, accountId: 'a1', category: 'fuel', merchant: 'PSO', status: 'cleared' },
  { id: 't709', date: '2026-07-09T08:30', type: 'expense', amount: 1240, accountId: 'a1', category: 'transport', merchant: 'Careem', status: 'cleared' },
  { id: 't710', date: '2026-07-10T13:20', type: 'expense', amount: 1960, accountId: 'a3', category: 'mobile', merchant: 'Jazz monthly bundle', status: 'cleared' },
  { id: 't711', date: '2026-07-12T10:00', type: 'expense', amount: 19400, accountId: 'a3', category: 'utilities', merchant: 'K-Electric', status: 'cleared' },
  { id: 't712', date: '2026-07-12T18:30', type: 'expense', amount: 9800, accountId: 'a1', category: 'groceries', merchant: 'Carrefour', status: 'cleared' },
  { id: 't713', date: '2026-07-14T20:40', type: 'expense', amount: 2800, cardId: 'c1', category: 'dining', merchant: 'Foodpanda', status: 'cleared' },
  { id: 't714', date: '2026-07-15T11:00', type: 'transfer', amount: 62000, accountId: 'a1', toCardId: 'c1', isCardPayment: true, notes: 'Statement payment', status: 'cleared' },
  { id: 't715', date: '2026-07-15T15:00', type: 'expense', amount: 3200, accountId: 'a3', category: 'utilities', merchant: 'SSGC', status: 'cleared' },
  { id: 't716', date: '2026-07-16T17:20', type: 'expense', amount: 15400, cardId: 'c1', category: 'shopping', merchant: 'Khaadi', status: 'cleared' },
  { id: 't717', date: '2026-07-18T14:00', type: 'income', amount: 7500, accountId: 'a1', category: 'freelance', merchant: 'Upwork client', status: 'cleared' },
  { id: 't718', date: '2026-07-19T19:00', type: 'expense', amount: 13400, accountId: 'a1', category: 'groceries', merchant: 'Imtiaz Super Market', status: 'cleared' },
  { id: 't719', date: '2026-07-20T10:15', type: 'refund', amount: 3499, cardId: 'c1', category: 'shopping', merchant: 'Daraz refund', notes: 'Returned lamp', status: 'cleared' },
  { id: 't720', date: '2026-07-20T22:00', type: 'expense', amount: 1100, cardId: 'c1', category: 'entertainment', merchant: 'Netflix', status: 'cleared' },
  { id: 't721', date: '2026-07-21T09:30', type: 'expense', amount: 4500, accountId: 'a1', category: 'healthcare', merchant: 'Aga Khan Lab', status: 'cleared' },
  { id: 't722', date: '2026-07-22T18:10', type: 'expense', amount: 5900, accountId: 'a1', category: 'fuel', merchant: 'Shell', status: 'cleared' },
  { id: 't723', date: '2026-07-23T08:45', type: 'expense', amount: 850, accountId: 'a1', category: 'transport', merchant: 'Bykea', status: 'cleared' },
  { id: 't724', date: '2026-07-25T21:00', type: 'expense', amount: 5300, cardId: 'c1', category: 'dining', merchant: "Xander's", status: 'cleared' },
  { id: 't725', date: '2026-07-27T19:30', type: 'expense', amount: 6800, accountId: 'a3', category: 'groceries', merchant: 'Al-Fatah', status: 'cleared' },
  { id: 't726', date: '2026-07-31T23:00', type: 'income', amount: 1150, accountId: 'a2', category: 'otherinc', merchant: 'Meezan monthly profit', status: 'cleared' },
  // ---- Two months back (fixture 2026-06) ----
  { id: 't601', date: '2026-06-02T09:10', type: 'income', amount: 185000, accountId: 'a1', category: 'salary', merchant: 'Employer Pvt Ltd', status: 'cleared' },
  { id: 't602', date: '2026-06-03T10:00', type: 'transfer', amount: 50000, accountId: 'a1', toAccountId: 'a2', status: 'cleared' },
  { id: 't603', date: '2026-06-05T09:00', type: 'expense', amount: 85000, accountId: 'a1', category: 'rent', merchant: 'House rent — Gulshan', status: 'cleared' },
  { id: 't604', date: '2026-06-07T18:00', type: 'expense', amount: 20400, accountId: 'a1', category: 'groceries', merchant: 'Imtiaz Super Market', status: 'cleared' },
  { id: 't605', date: '2026-06-09T17:00', type: 'expense', amount: 5400, accountId: 'a1', category: 'fuel', merchant: 'PSO', status: 'cleared' },
  { id: 't606', date: '2026-06-12T10:00', type: 'expense', amount: 24100, accountId: 'a3', category: 'utilities', merchant: 'K-Electric', status: 'cleared' },
  { id: 't607', date: '2026-06-14T20:00', type: 'expense', amount: 7600, accountId: 'a1', category: 'dining', merchant: 'Hardees', status: 'cleared' },
  { id: 't608', date: '2026-06-21T18:30', type: 'expense', amount: 18500, accountId: 'a1', category: 'groceries', merchant: 'Metro', status: 'cleared' },
  { id: 't609', date: '2026-06-24T17:40', type: 'expense', amount: 5500, accountId: 'a1', category: 'fuel', merchant: 'Shell', status: 'cleared' },
];

const BUDGETS = [
  { id: 'b0', category: null, amount: 240000, label: 'Overall monthly budget' },
  { id: 'b1', category: 'groceries', amount: 60000 },
  { id: 'b2', category: 'dining', amount: 20000 },
  { id: 'b3', category: 'fuel', amount: 15000 },
  { id: 'b4', category: 'utilities', amount: 30000 },
  { id: 'b5', category: 'transport', amount: 5000 },
  { id: 'b6', category: 'shopping', amount: 12000 },
];

const RECURRING = [
  { id: 'r1', name: 'Salary', type: 'income', amount: 185000, estimated: false, freq: 'Monthly · 1st', nextDate: '2026-09-01', accountId: 'a1', category: 'salary', behaviour: 'reminder', status: 'active', doneThisMonth: true },
  { id: 'r2', name: 'House rent', type: 'expense', amount: 85000, estimated: false, freq: 'Monthly · 5th', nextDate: '2026-08-05', accountId: 'a1', category: 'rent', behaviour: 'reminder', status: 'active' },
  { id: 'r3', name: 'StormFiber internet', type: 'expense', amount: 3999, estimated: false, freq: 'Monthly · 8th', nextDate: '2026-08-08', accountId: 'a3', category: 'mobile', behaviour: 'reminder', status: 'active' },
  { id: 'r4', name: 'K-Electric bill', type: 'expense', amount: 18500, estimated: true, freq: 'Monthly · ~12th', nextDate: '2026-08-12', accountId: 'a3', category: 'utilities', behaviour: 'reminder', status: 'active' },
  { id: 'r5', name: 'Credit card bill', type: 'expense', amount: 84760, estimated: true, freq: 'Monthly · due 15th', nextDate: '2026-08-15', accountId: 'a1', category: 'fees', behaviour: 'reminder', status: 'active', cardId: 'c1' },
  { id: 'r6', name: 'Netflix', type: 'expense', amount: 1100, estimated: false, freq: 'Monthly · 20th', nextDate: '2026-08-20', cardId: 'c1', category: 'entertainment', behaviour: 'reminder', status: 'active' },
];

// ---- Re-dating ----
// Shift a 'YYYY-MM…' date string by `delta` whole months, clamping the day to the target
// month's length. If the shifted date lands in the current month and `capToToday` is set,
// the day is also capped at today's day so demo data never claims the future.
function shiftDate(dateStr, delta, capToToday) {
  if (!dateStr) return dateStr;
  const ym = dateStr.slice(0, 7);
  const rest = dateStr.slice(10); // 'T HH:mm' tail or ''
  const [, , d] = dateStr.split(/[-T]/);
  const [y, m] = ym.split('-').map(Number);
  const i = y * 12 + (m - 1) + delta;
  const newYm = `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
  let day = clampDay(newYm, Number(d));
  if (capToToday && newYm === currentMonth()) day = Math.min(day, Number(todayStr().slice(8, 10)));
  return `${newYm}-${String(day).padStart(2, '0')}${rest}`;
}
const shiftYm = (ym, delta) => shiftDate(ym + '-01', delta).slice(0, 7);

export function makeDemoStore(targetMonth = currentMonth()) {
  const delta = monthsBetween(FIXTURE_MONTH, targetMonth);
  return {
    institutions: INSTITUTIONS.map(x => ({ ...x })),
    cardProducts: CARD_PRODUCTS.map(x => ({ ...x })),
    categories: CATEGORIES.map(c => ({ ...c })),
    accounts: ACCOUNTS.map(a => ({ ...a, createdAt: shiftDate(a.createdAt, delta) })),
    snapshots: SNAPSHOTS.map(s => ({
      ...s, month: shiftYm(s.month, delta),
      ...(s.confirmedAt ? { confirmedAt: shiftDate(s.confirmedAt, delta) } : {}),
    })),
    cards: CARDS.map(c => ({
      ...c,
      ...(c.dueDate ? { dueDate: shiftDate(c.dueDate, delta) } : {}),
      ...(c.openingOutstanding
        ? { openingOutstanding: Object.fromEntries(Object.entries(c.openingOutstanding).map(([ym, v]) => [shiftYm(ym, delta), v])) }
        : {}),
    })),
    transactions: TRANSACTIONS.map(t => ({ ...t, date: shiftDate(t.date, delta, true) })),
    budgets: BUDGETS.map(b => ({ ...b })),
    recurring: RECURRING.map(r => ({ ...r, nextDate: shiftDate(r.nextDate, delta) })),
  };
}

export function freshStore() {
  return {
    institutions: INSTITUTIONS.map(x => ({ ...x })),
    cardProducts: CARD_PRODUCTS.map(x => ({ ...x })),
    categories: CATEGORIES.map(c => ({ ...c })),
    accounts: [], snapshots: [], cards: [], transactions: [], budgets: [], recurring: [],
  };
}
