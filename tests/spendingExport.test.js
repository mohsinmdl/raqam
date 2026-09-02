// Reflect data-layer — tests the YNAB-shape CSV export builders (two-file
// export: per-month summary matrix + register-style transaction detail),
// mirroring the fixture/testing pattern in tests/spendingReport.test.js.
import { afterAll, describe, expect, it, vi } from 'vitest';
import { buildSummaryCsv, buildTransactionsCsv } from '../src/lib/spendingExport.js';
import { MN } from '../src/lib/calc.js';
import { addMonths, currentMonth, todayStr } from '../src/lib/dates.js';

// Pin the clock. The fixtures below are dated the 10th (and later) of the
// CURRENT month, and the future-date guard drops anything after "today" —
// so on the 1st–9th of every real month they all vanished, the suite went
// red, and with it the deploy it gates. A frozen mid-month instant makes the
// month-relative fixtures deterministic on any calendar day. Only Date is
// faked; timers stay real.
vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(new Date(2026, 7, 20, 12, 0, 0));
afterAll(() => vi.useRealTimers());

// Months are anchored to the REAL current month, never hardcoded literals.
const CUR = currentMonth();
const PREV = addMonths(CUR, -1);
const PREV2 = addMonths(CUR, -2);

// Same month-label formula the implementation uses, computed independently
// here so the assertion doesn't just restate the source.
const monthCol = ym => MN[Number(ym.slice(5, 7)) - 1].slice(0, 3) + '-' + ym.slice(2, 4);

// Minimal store, same shape as tests/spendingReport.test.js: Rent/Groceries
// (normal, grouped), Household advance (grouped, no activity), Legacy
// (expense, no groupId -> folds to Other).
function makeStore(transactions, overrides) {
  return {
    categories: [
      { id: 'rent', name: 'Rent', icon: 'square', color: '#64748B', type: 'expense', status: 'active', groupId: 'housing' },
      { id: 'groc', name: 'Groceries', icon: 'circle', color: '#0F766E', type: 'expense', status: 'active', groupId: 'living' },
      { id: 'adv', name: 'Household advance', icon: 'diamond', color: '#B7791F', type: 'expense', status: 'active', excludeFromBudget: true, groupId: 'living' },
      { id: 'legacy', name: 'Legacy cat', icon: 'triangle', color: '#2563EB', type: 'expense', status: 'active' },
      { id: 'salary', name: 'Salary', icon: 'square', color: '#15803D', type: 'income', status: 'active' },
    ],
    categoryGroups: [
      { id: 'housing', name: 'Housing', sortOrder: 1 },
      { id: 'living', name: 'Living', sortOrder: 2 },
    ],
    budgets: [],
    accounts: [{ id: 'a1', nickname: 'Main', status: 'active' }],
    cards: [{ id: 'c1', nickname: 'Card', type: 'credit', status: 'active', openingOutstanding: { [CUR]: 0 } }],
    snapshots: [{ accountId: 'a1', month: CUR, amount: 100000, status: 'confirmed' }],
    recurring: [],
    audit: [],
    transactions,
    ...(overrides || {}),
  };
}
const tx = (over) => ({ id: '.', status: 'cleared', date: CUR + '-10T12:00', accountId: 'a1', ...over });

describe('buildSummaryCsv', () => {
  it('header: Category Group, Category, one column per month (Mon-YY), Average, Total', () => {
    const S = makeStore([]);
    const { csv } = buildSummaryCsv(S, { from: PREV, to: CUR });
    const header = csv.split('\r\n')[0];
    expect(header).toBe(['Category Group', 'Category', monthCol(PREV), monthCol(CUR), 'Average', 'Total'].join(','));
  });

  it('row order: Uncategorized first (blank group), then groups by sortOrder x categories by sortOrder/name, ungrouped under Other last', () => {
    const S = makeStore([]);
    const { csv } = buildSummaryCsv(S, { from: PREV, to: CUR });
    const lines = csv.split('\r\n').slice(1);
    const ids = lines.map(l => l.split(',').slice(0, 2));
    expect(ids).toEqual([
      ['', 'Uncategorized'],
      ['Housing', 'Rent'],
      ['Living', 'Groceries'],
      ['Living', 'Household advance'],
      ['Other', 'Legacy cat'],
    ]);
  });

  it('cell math: outflows negative per month, Total = sum of month cells, Average = total/month count; no-spend rows emit 0', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 5000, category: 'rent', date: PREV + '-10T12:00' }),
      tx({ id: 't2', type: 'expense', amount: 3000, category: 'rent', date: CUR + '-10T12:00' }),
      tx({ id: 't3', type: 'expense', amount: 2000, category: 'groc', date: CUR + '-10T12:00' }),
    ]);
    const { csv } = buildSummaryCsv(S, { from: PREV, to: CUR });
    const lines = csv.split('\r\n').slice(1);
    const byName = Object.fromEntries(lines.map(l => {
      const c = l.split(',');
      return [c[1], c.slice(2)];
    }));
    expect(byName.Rent).toEqual(['-5000', '-3000', '-4000', '-8000']);
    expect(byName.Groceries).toEqual(['0', '-2000', '-1000', '-2000']);
    expect(byName.Uncategorized).toEqual(['0', '0', '0', '0']);
    expect(byName['Household advance']).toEqual(['0', '0', '0', '0']);
    expect(byName['Legacy cat']).toEqual(['0', '0', '0', '0']);
  });

  // The summary is a NET accounting matrix, not the page's spending view: its
  // cells are deliberately unfloored, so a month whose refunds exceed its
  // expenses reads as a POSITIVE (money-back) cell. breakdownByCategory floors
  // per category at 0 instead, because the donut/percent math on screen can't
  // express a negative share.
  it('cells net refunds against expenses, and a net-refund month goes positive', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 5000, category: 'rent', date: PREV + '-10T12:00' }),
      tx({ id: 't2', type: 'refund', amount: 2000, category: 'rent', date: PREV + '-14T12:00' }),
      tx({ id: 't3', type: 'expense', amount: 3000, category: 'rent', date: CUR + '-10T12:00' }),
      tx({ id: 't4', type: 'refund', amount: 8000, category: 'rent', date: CUR + '-14T12:00' }),
    ]);
    const { csv } = buildSummaryCsv(S, { from: PREV, to: CUR });
    const rent = csv.split('\r\n').slice(1).find(l => l.split(',')[1] === 'Rent').split(',').slice(2);
    // PREV: 5000 out - 2000 back = 3000 spent -> -3000. CUR: 3000 out - 8000
    // back = 5000 net refund -> +5000 (the page floors this category to 0).
    expect(rent).toEqual(['-3000', '5000', '1000', '2000']);
  });

  it('Average rounds a non-divisible total to whole PKR', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 10000, category: 'rent', date: PREV2 + '-10T12:00' }),
    ]);
    const { csv } = buildSummaryCsv(S, { from: PREV2, to: CUR }); // 3 months
    const rent = csv.split('\r\n').slice(1).find(l => l.split(',')[1] === 'Rent').split(',').slice(2);
    expect(rent).toEqual(['-10000', '0', '0', '-3333', '-10000']); // -10000/3 = -3333.33…
  });

  it('null-category spend lands in the Uncategorized row (blank group)', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 1200, category: null, date: PREV + '-10T12:00' }),
      tx({ id: 't2', type: 'expense', amount: 800, category: null, date: CUR + '-10T12:00' }),
    ]);
    const line = buildSummaryCsv(S, { from: PREV, to: CUR }).csv.split('\r\n')[1].split(',');
    expect(line).toEqual(['', 'Uncategorized', '-1200', '-800', '-1000', '-2000']);
  });

  it('a catIds filter narrows the matrix to the selected categories only', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 5000, category: 'rent', date: CUR + '-10T12:00' }),
      tx({ id: 't2', type: 'expense', amount: 2000, category: 'groc', date: CUR + '-10T12:00' }),
      tx({ id: 't3', type: 'expense', amount: 900, category: null, date: CUR + '-10T12:00' }),
    ]);
    const lines = buildSummaryCsv(S, { from: CUR, to: CUR, catIds: new Set(['rent']) }).csv.split('\r\n').slice(1);
    expect(lines.map(l => l.split(',').slice(0, 2))).toEqual([['Housing', 'Rent']]); // no Uncategorized row either
  });

  it('transactions whose category id matches no record become a "Deleted category" row, right after Uncategorized', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 2500, category: 'ghost', date: CUR + '-10T12:00' }),
      tx({ id: 't2', type: 'expense', amount: 500, category: null, date: CUR + '-10T12:00' }),
    ]);
    const lines = buildSummaryCsv(S, { from: CUR, to: CUR }).csv.split('\r\n').slice(1);
    expect(lines.map(l => l.split(',').slice(0, 2)).slice(0, 2)).toEqual([
      ['', 'Uncategorized'],
      ['', 'Deleted category'],
    ]);
    expect(lines[1].split(',').slice(2)).toEqual(['-2500', '-2500', '-2500']);
  });

  // Exporting while drilled into the Deleted category passes catIds
  // Set(['deleted']). If that Set matched no transactions the user would get
  // header-only CSVs with no error at all.
  it('a catIds Set(["deleted"]) exports just the Deleted category row, with its cells', () => {
    const S = makeStore([
      tx({ id: 'g1', type: 'expense', amount: 2500, category: 'ghost', date: CUR + '-10T12:00' }),
      tx({ id: 'g2', type: 'expense', amount: 500, category: 'phantom', date: CUR + '-11T12:00' }),
      tx({ id: 'c1', type: 'expense', amount: 9000, category: 'rent', date: CUR + '-10T12:00' }),
    ]);
    const lines = buildSummaryCsv(S, { from: CUR, to: CUR, catIds: new Set(['deleted']) }).csv.split('\r\n').slice(1);
    expect(lines.map(l => l.split(','))).toEqual([['', 'Deleted category', '-3000', '-3000', '-3000']]);
  });

  it('filename: raqam-reflect-spending-breakdown-<todayStr()>.csv', () => {
    const S = makeStore([]);
    const { filename } = buildSummaryCsv(S, {});
    expect(filename).toBe('raqam-reflect-spending-breakdown-' + todayStr() + '.csv');
  });

  it('includes an archived expense category with in-range spend, keeping the summary total consistent with the transactions CSV', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 4000, category: 'oldcat', date: CUR + '-10T12:00' }),
    ], {
      categories: [
        { id: 'rent', name: 'Rent', icon: 'square', color: '#64748B', type: 'expense', status: 'active', groupId: 'housing' },
        { id: 'groc', name: 'Groceries', icon: 'circle', color: '#0F766E', type: 'expense', status: 'active', groupId: 'living' },
        { id: 'adv', name: 'Household advance', icon: 'diamond', color: '#B7791F', type: 'expense', status: 'active', excludeFromBudget: true, groupId: 'living' },
        { id: 'legacy', name: 'Legacy cat', icon: 'triangle', color: '#2563EB', type: 'expense', status: 'active' },
        { id: 'salary', name: 'Salary', icon: 'square', color: '#15803D', type: 'income', status: 'active' },
        { id: 'oldcat', name: 'Old Category', icon: 'diamond', color: '#DB2777', type: 'expense', status: 'archived', groupId: 'housing' },
      ],
    });
    const { csv } = buildSummaryCsv(S, { from: PREV, to: CUR });
    const lines = csv.split('\r\n').slice(1);
    const byName = Object.fromEntries(lines.map(l => {
      const c = l.split(',');
      return [c[1], c.slice(2)];
    }));
    expect(byName['Old Category']).toEqual(['0', '-4000', '-2000', '-4000']);
  });
});

describe('buildTransactionsCsv', () => {
  it('header matches the YNAB register shape', () => {
    const S = makeStore([]);
    const { csv } = buildTransactionsCsv(S, {});
    const header = csv.split('\r\n')[0];
    expect(header).toBe([
      'Account', 'Flag', 'Date', 'Payee', 'Category Group/Category',
      'Category Group', 'Category', 'Memo', 'Outflow', 'Inflow', 'Cleared',
    ].join(','));
  });

  it('rows: dd/mm/yyyy date, Category Group/Category form, Uncategorized when no category, expense->Outflow/refund->Inflow, Cleared from status, newest first', () => {
    const S = makeStore([
      tx({ id: 'e1', type: 'expense', amount: 1000, category: 'rent', merchant: 'Landlord', notes: 'jul', date: CUR + '-05T12:00', status: 'cleared' }),
      tx({ id: 'e2', type: 'refund', amount: 200, category: 'rent', merchant: 'Landlord', date: CUR + '-10T12:00', status: 'cleared' }),
      tx({ id: 'e3', type: 'expense', amount: 500, category: null, merchant: 'Store', date: CUR + '-08T12:00', status: 'uncleared' }),
      tx({ id: 'e4', type: 'expense', amount: 700, category: 'legacy', merchant: 'Old', date: CUR + '-01T12:00', status: 'cleared' }),
    ]);
    const { csv } = buildTransactionsCsv(S, {});
    const rows = csv.split('\r\n').slice(1).map(l => l.split(','));

    // newest first: e2 (10) > e3 (08) > e1 (05) > e4 (01)
    expect(rows.map(r => r[3])).toEqual(['Landlord', 'Store', 'Landlord', 'Old']);

    const [y, m] = CUR.split('-');
    expect(rows[0]).toEqual([
      'Main', '', '10/' + m + '/' + y, 'Landlord', 'Housing: Rent', 'Housing', 'Rent', '',
      '0', '200', 'Cleared',
    ]);

    expect(rows[1]).toEqual([
      'Main', '', '08/' + m + '/' + y, 'Store', 'Uncategorized', '', '', '', '500', '0', 'Uncleared',
    ]);

    expect(rows[2]).toEqual([
      'Main', '', '05/' + m + '/' + y, 'Landlord', 'Housing: Rent', 'Housing', 'Rent', 'jul', '1000', '0', 'Cleared',
    ]);

    expect(rows[3]).toEqual([
      'Main', '', '01/' + m + '/' + y, 'Old', 'Other: Legacy cat', 'Other', 'Legacy cat', '', '700', '0', 'Cleared',
    ]);
  });

  // A raw id in the Category column reads as corruption to whoever opens the
  // file; it also has to match the name the summary CSV and the page use.
  it('a category id with no matching record reads as "Deleted category", not the raw id', () => {
    const S = makeStore([
      tx({ id: 'd1', type: 'expense', amount: 400, category: 'ghost', merchant: 'Shop', date: CUR + '-06T12:00' }),
    ]);
    const row = buildTransactionsCsv(S, {}).csv.split('\r\n')[1].split(',');
    expect(row.slice(4, 7)).toEqual(['Deleted category', '', 'Deleted category']);
  });

  it('a catIds Set(["deleted"]) narrows the detail file to the dangling-id transactions', () => {
    const S = makeStore([
      tx({ id: 'g1', type: 'expense', amount: 400, category: 'ghost', merchant: 'Shop', date: CUR + '-06T12:00' }),
      tx({ id: 'c1', type: 'expense', amount: 900, category: 'rent', merchant: 'Landlord', date: CUR + '-07T12:00' }),
    ]);
    const rows = buildTransactionsCsv(S, { catIds: new Set(['deleted']) }).csv.split('\r\n').slice(1);
    expect(rows.map(r => r.split(',')[3])).toEqual(['Shop']); // the summary's row and this file agree
  });

  it('filename: raqam-reflect-spending-breakdown-<todayStr()>-transactions.csv', () => {
    const S = makeStore([]);
    const { filename } = buildTransactionsCsv(S, {});
    expect(filename).toBe('raqam-reflect-spending-breakdown-' + todayStr() + '-transactions.csv');
  });
});

// Category/group names carry user-typed emoji for on-screen identity (the
// in-name emoji IS the chip now); the exported sheets stay plain text.
describe('icon-free exports (plainName strips category/group emoji)', () => {
  it('an emoji category name and an emoji group name become plain names in both CSVs', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 5000, category: 'rentcat', date: CUR + '-10T12:00', merchant: 'Landlord' }),
    ], {
      categories: [
        { id: 'rentcat', name: '🏠 Rent/Mortgage', icon: 'square', color: '#64748B', type: 'expense', status: 'active', groupId: 'bills' },
      ],
      categoryGroups: [
        { id: 'bills', name: '⚡️ Bills', sortOrder: 1 },
      ],
    });
    const summaryLine = buildSummaryCsv(S, { from: CUR, to: CUR }).csv.split('\r\n').slice(1)
      .find(l => l.includes('Rent')).split(',');
    expect(summaryLine.slice(0, 2)).toEqual(['Bills', 'Rent/Mortgage']);

    const txRow = buildTransactionsCsv(S, {}).csv.split('\r\n').slice(1)
      .find(l => l.includes('Rent')).split(',');
    expect(txRow.slice(4, 7)).toEqual(['Bills: Rent/Mortgage', 'Bills', 'Rent/Mortgage']);
  });

  it('an emoji embedded mid-name collapses to a single space', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 1000, category: 'fooddel', date: CUR + '-10T12:00', merchant: 'Vendor' }),
    ], {
      categories: [
        { id: 'fooddel', name: 'Food 🍔 Delivery', icon: 'square', color: '#64748B', type: 'expense', status: 'active' },
      ],
    });
    const summaryLine = buildSummaryCsv(S, { from: CUR, to: CUR }).csv.split('\r\n').slice(1)
      .find(l => l.includes('Delivery')).split(',');
    expect(summaryLine[1]).toBe('Food Delivery');
  });

  it('an emoji merchant name stays verbatim in the Payee column (scope boundary: merchant is untouched)', () => {
    const S = makeStore([
      tx({ id: 't1', type: 'expense', amount: 1000, category: 'rent', date: CUR + '-10T12:00', merchant: '🍕 Pizza Place' }),
    ]);
    const row = buildTransactionsCsv(S, {}).csv.split('\r\n')[1].split(',');
    expect(row[3]).toBe('🍕 Pizza Place');
  });
});
