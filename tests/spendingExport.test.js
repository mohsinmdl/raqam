// Reflect data-layer — tests the YNAB-shape CSV export builders (two-file
// export: per-month summary matrix + register-style transaction detail),
// mirroring the fixture/testing pattern in tests/spendingReport.test.js.
import { describe, it, expect } from 'vitest';
import { buildSummaryCsv, buildTransactionsCsv } from '../src/lib/spendingExport.js';
import { MN } from '../src/lib/calc.js';
import { addMonths, currentMonth, todayStr } from '../src/lib/dates.js';

// Months are anchored to the REAL current month, never hardcoded literals.
const CUR = currentMonth();
const PREV = addMonths(CUR, -1);

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

  it('filename: raqam-reflect-spending-breakdown-<todayStr()>-transactions.csv', () => {
    const S = makeStore([]);
    const { filename } = buildTransactionsCsv(S, {});
    expect(filename).toBe('raqam-reflect-spending-breakdown-' + todayStr() + '-transactions.csv');
  });
});
