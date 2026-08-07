import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SORT, SORT_COLUMNS, STATUS_RANK, compareRows, isSortable,
  nextSortState, scheduledSort, sortLabel, sortRows,
} from '../src/lib/sortRows.js';
import { txRowOf, ruleRowOf, txGroups } from '../src/lib/txRow.js';

// A presenter row, as txRowOf/ruleRowOf produce one — sorting only ever sees
// these, never a raw transaction.
const row = over => ({
  sortAt: '2026-08-03T12:00', sortId: 'a', merchant: 'Shop', catName: 'Groceries',
  acctLabel: 'Main', stLabel: 'Cleared', amtValue: -100, ...(over || {}),
});
const ids = rows => rows.map(r => r.sortId);
const asc = k => ({ key: k, dir: 'asc' });
const desc = k => ({ key: k, dir: 'desc' });

describe('sort model', () => {
  it('defaults to newest-first by date', () => expect(DEFAULT_SORT).toEqual({ key: 'date', dir: 'desc' }));
  it('sorts the six data columns, amount in two modes', () =>
    expect(Object.keys(SORT_COLUMNS)).toEqual(['date', 'details', 'category', 'account', 'status', 'size', 'signed']));
  it('rejects columns that are not sortable', () => {
    expect(isSortable('select')).toBe(false);
    expect(isSortable('actions')).toBe(false);
    expect(isSortable('category')).toBe(true);
    expect(isSortable('account')).toBe(true);
  });
  it('falls back to the default when handed an unknown column', () => {
    const rows = [row({ sortId: 'old', sortAt: '2026-01-01T09:00' }), row({ sortId: 'new', sortAt: '2026-09-01T09:00' })];
    expect(ids(sortRows(rows, { key: 'nonsense', dir: 'asc' }))).toEqual(['new', 'old']);
  });
});

describe('header click cycle', () => {
  it('gives a column its default direction first', () => {
    expect(nextSortState(DEFAULT_SORT, 'details')).toEqual({ key: 'details', dir: 'asc' });
    expect(nextSortState(DEFAULT_SORT, 'size')).toEqual({ key: 'size', dir: 'desc' });
  });
  it('toggles, then clears back to the table default', () => {
    const one = nextSortState(DEFAULT_SORT, 'category');
    const two = nextSortState(one, 'category');
    expect(two).toEqual({ key: 'category', dir: 'desc' });
    expect(nextSortState(two, 'category')).toEqual(DEFAULT_SORT);
  });
  it('reads as a two-state toggle on date, whose cleared state is the default', () => {
    const a = nextSortState(DEFAULT_SORT, 'date');
    expect(a).toEqual({ key: 'date', dir: 'asc' });
    expect(nextSortState(a, 'date')).toEqual(DEFAULT_SORT);
  });
  it('ignores clicks on unsortable columns', () =>
    expect(nextSortState(DEFAULT_SORT, 'actions')).toEqual(DEFAULT_SORT));
});

describe('date', () => {
  const rows = [
    row({ sortId: 'mid', sortAt: '2026-08-03T12:00' }),
    row({ sortId: 'new', sortAt: '2026-08-03T18:30' }),
    row({ sortId: 'old', sortAt: '2026-08-03T08:15' }),
  ];
  it('sorts newest first descending', () => expect(ids(sortRows(rows, desc('date')))).toEqual(['new', 'mid', 'old']));
  it('sorts oldest first ascending', () => expect(ids(sortRows(rows, asc('date')))).toEqual(['old', 'mid', 'new']));
  it('uses the time, not just the day', () => {
    // All three are 3 Aug. Only the timestamp separates them.
    expect(new Set(rows.map(r => r.sortAt.slice(0, 10))).size).toBe(1);
    expect(ids(sortRows(rows, asc('date')))).toEqual(['old', 'mid', 'new']);
  });
});

describe('details', () => {
  it('is case-insensitive', () => {
    const rows = [row({ sortId: 'b', merchant: 'banana' }), row({ sortId: 'A', merchant: 'Apple' })];
    expect(ids(sortRows(rows, asc('details')))).toEqual(['A', 'b']);
  });
  it('ignores leading and trailing space', () => {
    const rows = [row({ sortId: 'z', merchant: 'Zebra' }), row({ sortId: 'a', merchant: '   Apple  ' })];
    expect(ids(sortRows(rows, asc('details')))).toEqual(['a', 'z']);
  });
  it('orders embedded numbers naturally, not as text', () => {
    const rows = [row({ sortId: 'ten', merchant: 'Invoice 10' }), row({ sortId: 'two', merchant: 'Invoice 2' })];
    expect(ids(sortRows(rows, asc('details')))).toEqual(['two', 'ten']);
  });
  it('handles accents and symbols without throwing', () => {
    const rows = [row({ sortId: 's', merchant: '#Hash' }), row({ sortId: 'e', merchant: 'Épicerie' }), row({ sortId: 'a', merchant: 'Apple' })];
    expect(ids(sortRows(rows, asc('details')))).toHaveLength(3);
  });
  it('sorts transfers and adjustments on their visible label', () => {
    const rows = [
      row({ sortId: 'tr', merchant: 'Own-account transfer' }),
      row({ sortId: 'adj', merchant: 'Balance adjustment' }),
    ];
    expect(ids(sortRows(rows, asc('details')))).toEqual(['adj', 'tr']);
  });
});

describe('blanks sink to the bottom in BOTH directions', () => {
  // A blank is the absence of a value, not a value lower than others — so
  // flipping direction must not float it to the top.
  for (const [col, field] of [['details', 'merchant'], ['category', 'catName'], ['account', 'acctLabel']]) {
    it(`${col}: empty string and em dash both sink`, () => {
      const rows = [
        row({ sortId: 'blank', [field]: '' }),
        row({ sortId: 'dash', [field]: '—' }),
        row({ sortId: 'a', [field]: 'Alpha' }),
        row({ sortId: 'z', [field]: 'Zulu' }),
      ];
      expect(ids(sortRows(rows, asc(col))).slice(0, 2)).toEqual(['a', 'z']);
      expect(ids(sortRows(rows, desc(col))).slice(0, 2)).toEqual(['z', 'a']);
      expect(ids(sortRows(rows, asc(col))).slice(2).sort()).toEqual(['blank', 'dash']);
      expect(ids(sortRows(rows, desc(col))).slice(2).sort()).toEqual(['blank', 'dash']);
    });
  }
  it('signed: a missing number sinks in both directions', () => {
    const rows = [
      row({ sortId: 'none', amtValue: null }),
      row({ sortId: 'nan', amtValue: NaN }),
      row({ sortId: 'lo', amtValue: -500 }),
      row({ sortId: 'hi', amtValue: 900 }),
    ];
    expect(ids(sortRows(rows, asc('signed'))).slice(0, 2)).toEqual(['lo', 'hi']);
    expect(ids(sortRows(rows, desc('signed'))).slice(0, 2)).toEqual(['hi', 'lo']);
  });
  it('size: a missing number sinks in both directions too', () => {
    const rows = [
      row({ sortId: 'none', amtValue: null }),
      row({ sortId: 'small', amtValue: -5 }),
      row({ sortId: 'big', amtValue: 900 }),
    ];
    expect(ids(sortRows(rows, asc('size')))).toEqual(['small', 'big', 'none']);
    expect(ids(sortRows(rows, desc('size')))).toEqual(['big', 'small', 'none']);
  });
});

describe('category and account', () => {
  it('sorts categories alphabetically, uncategorised last', () => {
    const rows = [
      row({ sortId: 'u', catName: '—' }),
      row({ sortId: 'r', catName: 'Rent' }),
      row({ sortId: 't', catName: 'Transfer' }),
      row({ sortId: 'g', catName: 'groceries' }),
    ];
    expect(ids(sortRows(rows, asc('category')))).toEqual(['g', 'r', 't', 'u']);
  });
  it('sorts a transfer by its whole displayed account string', () => {
    const rows = [
      row({ sortId: 'z', acctLabel: 'Zenith' }),
      row({ sortId: 'tr', acctLabel: 'Main → Platinum ••4417' }),
      row({ sortId: 'a', acctLabel: 'Askari' }),
    ];
    // "Main → …" sorts under M, between Askari and Zenith — which is exactly
    // how the column reads.
    expect(ids(sortRows(rows, asc('account')))).toEqual(['a', 'tr', 'z']);
  });
});

describe('status', () => {
  it('ranks by meaning, not alphabet', () => {
    expect(STATUS_RANK.overdue).toBeLessThan(STATUS_RANK.uncleared);
    expect(STATUS_RANK.uncleared).toBeLessThan(STATUS_RANK.cleared);
    expect(STATUS_RANK.cleared).toBeLessThan(STATUS_RANK.cancelled);
  });
  it('puts what needs action first ascending, settled first descending', () => {
    const rows = ['Cleared', 'Overdue', 'Uncleared', 'Scheduled'].map((s, i) => row({ sortId: s, stLabel: s, sortAt: '2026-08-0' + (i + 1) + 'T12:00' }));
    expect(ids(sortRows(rows, asc('status')))).toEqual(['Overdue', 'Scheduled', 'Uncleared', 'Cleared']);
    expect(ids(sortRows(rows, desc('status')))).toEqual(['Cleared', 'Uncleared', 'Scheduled', 'Overdue']);
  });
  it('is unaffected by case, and never by a colour', () => {
    const rows = [row({ sortId: 'lower', stLabel: 'overdue' }), row({ sortId: 'title', stLabel: 'Cleared' })];
    expect(ids(sortRows(rows, asc('status')))).toEqual(['lower', 'title']);
  });
  it('sorts an unrecognised future status after everything known', () => {
    const rows = [row({ sortId: 'weird', stLabel: 'Reticulating' }), row({ sortId: 'done', stLabel: 'Cancelled' })];
    expect(ids(sortRows(rows, asc('status')))).toEqual(['done', 'weird']);
  });
});

describe('amount is signed, and comes from the presenter', () => {
  const S = {
    categories: [{ id: 'c', name: 'Cat', color: '#111' }],
    accounts: [{ id: 'a1', nickname: 'Main' }], cards: [], recurring: [],
  };
  const fmt = { money: n => 'Rs ' + Math.abs(n), moneyS: n => (n < 0 ? '-' : '+') + 'Rs ' + Math.abs(n) };
  const tx = o => ({ id: 'x', date: '2026-08-03T12:00', amount: 500, status: 'cleared', accountId: 'a1', category: 'c', merchant: 'M', ...o });

  it('derives direction from type, since the schema stores a magnitude', () => {
    expect(txRowOf(tx({ type: 'expense' }), S, fmt).amtValue).toBe(-500);
    expect(txRowOf(tx({ type: 'income' }), S, fmt).amtValue).toBe(500);
    expect(txRowOf(tx({ type: 'refund' }), S, fmt).amtValue).toBe(500);
    expect(txRowOf(tx({ type: 'transfer' }), S, fmt).amtValue).toBe(500);
  });
  it('trusts the stored sign for adjustments, the only signed types', () => {
    expect(txRowOf(tx({ type: 'adjustment', amount: -828 }), S, fmt).amtValue).toBe(-828);
    expect(txRowOf(tx({ type: 'cardAdjustment', amount: 250 }), S, fmt).amtValue).toBe(250);
  });
  it('separates an expense from an income of the same magnitude', () => {
    const rows = [
      txRowOf(tx({ id: 'out', type: 'expense', amount: 50000 }), S, fmt),
      txRowOf(tx({ id: 'in', type: 'income', amount: 50000 }), S, fmt),
      txRowOf(tx({ id: 'mid', type: 'expense', amount: 10 }), S, fmt),
    ].map(r => ({ ...r, sortId: r.id }));
    // The old Math.abs() sort put the 50,000s adjacent; signed puts them at
    // opposite ends with the small row between.
    expect(ids(sortRows(rows, desc('signed')))).toEqual(['in', 'mid', 'out']);
    expect(ids(sortRows(rows, asc('signed')))).toEqual(['out', 'mid', 'in']);
  });
  it('places zero between negatives and positives', () => {
    const rows = [row({ sortId: 'p', amtValue: 5 }), row({ sortId: 'z', amtValue: 0 }), row({ sortId: 'n', amtValue: -5 })];
    expect(ids(sortRows(rows, asc('signed')))).toEqual(['n', 'z', 'p']);
  });
  it('ignores currency formatting entirely', () => {
    const rows = [row({ sortId: 'big', amtValue: 1000000 }), row({ sortId: 'small', amtValue: 9 })];
    expect(ids(sortRows(rows, desc('signed')))).toEqual(['big', 'small']);
  });
});

describe('tie-breakers are deterministic', () => {
  // The real ledger has nine rows on 2026-08-03T12:00 — the entry drawer
  // defaults to noon and the timestamp is minute-precision. Without an
  // explicit chain these would render in whatever order the input happened
  // to be in.
  const cluster = ['delta', 'alpha', 'charlie', 'bravo'].map((m, i) =>
    row({ sortId: 'id' + i, merchant: m, sortAt: '2026-08-03T12:00' }));

  it('breaks a date tie on details, then id', () => {
    const out = sortRows(cluster, desc('date'));
    expect(out.map(r => r.merchant)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
  });
  it('produces the same order regardless of input order', () => {
    const a = ids(sortRows(cluster, desc('date')));
    const b = ids(sortRows([...cluster].reverse(), desc('date')));
    const c = ids(sortRows([cluster[2], cluster[0], cluster[3], cluster[1]], desc('date')));
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });
  it('falls to the id when the primary and both fallbacks tie', () => {
    const twins = [row({ sortId: 'z9' }), row({ sortId: 'a1' })];
    expect(ids(sortRows(twins, desc('date')))).toEqual(['a1', 'z9']);
    expect(ids(sortRows([...twins].reverse(), desc('date')))).toEqual(['a1', 'z9']);
  });
  it('breaks a non-date tie on the newest timestamp first', () => {
    const rows = [
      row({ sortId: 'older', catName: 'Rent', sortAt: '2026-08-01T09:00' }),
      row({ sortId: 'newer', catName: 'Rent', sortAt: '2026-08-09T09:00' }),
    ];
    expect(ids(sortRows(rows, asc('category')))).toEqual(['newer', 'older']);
  });
  it('never mutates the array it was given', () => {
    const rows = [row({ sortId: 'b', sortAt: '2026-01-01T00:00' }), row({ sortId: 'a', sortAt: '2026-09-09T00:00' })];
    const before = ids(rows);
    sortRows(rows, desc('date'));
    expect(ids(rows)).toEqual(before);
  });
  it('compareRows agrees with sortRows', () => {
    const [x, y] = [row({ sortId: 'x', amtValue: 10 }), row({ sortId: 'y', amtValue: 20 })];
    expect(compareRows(x, y, asc('signed'))).toBeLessThan(0);
    expect(compareRows(x, y, desc('signed'))).toBeGreaterThan(0);
  });
});

describe('scheduled group', () => {
  it('always reads forward in time, whichever way date is sorted', () => {
    expect(scheduledSort(desc('date'))).toEqual({ key: 'date', dir: 'asc' });
    expect(scheduledSort(asc('date'))).toEqual({ key: 'date', dir: 'asc' });
  });
  it('follows every other column normally', () => {
    expect(scheduledSort(desc('size'))).toEqual(desc('size'));
    expect(scheduledSort(asc('details'))).toEqual(asc('details'));
  });
  it('leaves overdue at the top under the default sort, without pinning it', () => {
    const rows = [
      row({ sortId: 'later', sortAt: '2026-09-20' }),
      row({ sortId: 'overdue', sortAt: '2026-07-01' }),
      row({ sortId: 'soon', sortAt: '2026-08-09' }),
    ];
    expect(ids(sortRows(rows, scheduledSort(DEFAULT_SORT)))).toEqual(['overdue', 'soon', 'later']);
  });
});

describe('groups sort independently', () => {
  const S = {
    categories: [{ id: 'c', name: 'Cat', color: '#111' }],
    accounts: [{ id: 'a1', nickname: 'Main' }], cards: [],
    recurring: [{
      id: 'r1', name: 'Rent', type: 'expense', amount: 45000, category: 'c', accountId: 'a1',
      status: 'active', nextDate: '2026-09-20', schedule: { every: 1, unit: 'month', days: [20], ends: { kind: 'never' } }, occurrences: [],
    }],
  };
  const fmt = { money: n => 'Rs ' + Math.abs(n), moneyS: n => (n < 0 ? '-' : '+') + 'Rs ' + Math.abs(n) };
  const NOW = '2026-08-06T10:00';
  const tx = (id, date, amount) => ({ id, date, type: 'expense', amount, status: 'cleared', accountId: 'a1', category: 'c', merchant: id });

  it('applies the chosen sort inside each group without merging them', () => {
    const list = [tx('p1', '2026-08-01T09:00', 100), tx('p2', '2026-08-02T09:00', 900), tx('f1', '2026-08-30T09:00', 400)];
    const g = txGroups(list, S, fmt, NOW, { from: null, to: null }, false, desc('signed'));
    // Recorded: -100 before -900 descending. Scheduled keeps the future row.
    expect(g.postedRows.map(r => r.id)).toEqual(['p1', 'p2']);
    expect(g.scheduled.map(x => x.selId || x.row.ruleId)).toContain('f1');
    expect(g.postedRows.map(r => r.id)).not.toContain('f1');
  });
  it('defaults the recorded group to newest first', () => {
    const list = [tx('older', '2026-08-01T09:00', 1), tx('newer', '2026-08-05T09:00', 1)];
    const g = txGroups(list, S, fmt, NOW, { from: null, to: null }, true, DEFAULT_SORT);
    expect(g.postedRows.map(r => r.id)).toEqual(['newer', 'older']);
  });
  it('reverses the recorded group on an ascending date sort', () => {
    const list = [tx('older', '2026-08-01T09:00', 1), tx('newer', '2026-08-05T09:00', 1)];
    const g = txGroups(list, S, fmt, NOW, { from: null, to: null }, true, asc('date'));
    expect(g.postedRows.map(r => r.id)).toEqual(['older', 'newer']);
  });
});

describe('sortLabel', () => {
  it('names every column and direction', () => {
    for (const k of Object.keys(SORT_COLUMNS)) {
      for (const d of ['asc', 'desc']) expect(sortLabel({ key: k, dir: d })).toBeTruthy();
    }
  });
  it('reads as plain language', () => {
    expect(sortLabel(DEFAULT_SORT)).toBe('Newest first');
    expect(sortLabel(desc('size'))).toBe('Largest first');
    expect(sortLabel(asc('signed'))).toBe('Biggest expense first');
    expect(sortLabel(desc('signed'))).toBe('Biggest income first');
    expect(sortLabel(asc('status'))).toBe('Needs action first');
  });
});

// --- amount colour --------------------------------------------------------
describe('amount colour marks the exception, not the norm', () => {
  // Money out is the ordinary case in a ledger, so it stays plain; colouring
  // every expense made the whole table shout. Green marks money in, which is
  // the rarer event and the one worth spotting.
  const S = {
    categories: [{ id: 'c', name: 'Cat', color: '#111' }],
    accounts: [{ id: 'a1', nickname: 'Main' }], cards: [], recurring: [],
  };
  const fmt = { money: n => 'Rs ' + Math.abs(n), moneyS: n => (n < 0 ? '-' : '+') + 'Rs ' + Math.abs(n) };
  const tx = o => ({ id: 'x', date: '2026-08-03T12:00', amount: 500, status: 'cleared', accountId: 'a1', category: 'c', merchant: 'M', ...o });
  const colorOf = o => txRowOf(tx(o), S, fmt).amtColor;

  it('leaves money out plain and paints money in green', () => {
    expect(colorOf({ type: 'expense' })).toBe('var(--text)');
    expect(colorOf({ type: 'income' })).toBe('var(--pos)');
    expect(colorOf({ type: 'refund' })).toBe('var(--pos)');
  });
  it('leaves transfers muted — they are neither', () =>
    expect(colorOf({ type: 'transfer' })).toBe('var(--muted)'));
  it('follows the stored sign on adjustments, the only signed types', () => {
    expect(colorOf({ type: 'adjustment', amount: -828 })).toBe('var(--text)');
    expect(colorOf({ type: 'adjustment', amount: 3950 })).toBe('var(--pos)');
  });
  it('uses no red at all — red belongs to overdue and stale, not to spending', () => {
    for (const o of [{ type: 'expense' }, { type: 'income' }, { type: 'refund' },
                     { type: 'transfer' }, { type: 'adjustment', amount: -828 },
                     { type: 'cardAdjustment', amount: -10 }]) {
      expect(colorOf(o)).not.toBe('var(--neg)');
    }
  });
  it('reads as one plain run then one green run under a signed sort', () => {
    const rows = [
      txRowOf(tx({ id: 'in', type: 'income', amount: 20000 }), S, fmt),
      txRowOf(tx({ id: 'out', type: 'expense', amount: 2000 }), S, fmt),
      txRowOf(tx({ id: 'small', type: 'expense', amount: 70 }), S, fmt),
      txRowOf(tx({ id: 'adj', type: 'adjustment', amount: 45 }), S, fmt),
    ].map(r => ({ ...r, sortId: r.id }));
    expect(sortRows(rows, asc('signed')).map(r => r.amtColor))
      .toEqual(['var(--text)', 'var(--text)', 'var(--pos)', 'var(--pos)']);
  });
});

// --- size: rank by how big, not which way -----------------------------------
describe('size ignores the sign', () => {
  const rows = [
    row({ sortId: 'bigOut', amtValue: -60850 }),
    row({ sortId: 'midIn', amtValue: 20000 }),
    row({ sortId: 'smallOut', amtValue: -70 }),
    row({ sortId: 'bigIn', amtValue: 100000 }),
  ];

  it('ranks a large expense above a smaller income', () => {
    expect(ids(sortRows(rows, desc('size')))).toEqual(['bigIn', 'bigOut', 'midIn', 'smallOut']);
  });
  it('reverses to smallest first', () => {
    expect(ids(sortRows(rows, asc('size')))).toEqual(['smallOut', 'midIn', 'bigOut', 'bigIn']);
  });
  it('is the mode the AMOUNT header drives', () => {
    const one = nextSortState(DEFAULT_SORT, 'size');
    expect([one, sortLabel(one)]).toEqual([{ key: 'size', dir: 'desc' }, 'Largest first']);
    const two = nextSortState(one, 'size');
    expect([two, sortLabel(two)]).toEqual([{ key: 'size', dir: 'asc' }, 'Smallest first']);
    expect(nextSortState(two, 'size')).toEqual(DEFAULT_SORT);
  });
  it('never produces the signed mode from a header click — that is dropdown-only', () => {
    for (const k of ['date', 'details', 'category', 'account', 'status', 'size']) {
      expect(nextSortState(DEFAULT_SORT, k).key).not.toBe('signed');
    }
  });
  it('resolves an equal-size pair of opposite signs deterministically', () => {
    const pair = [
      row({ sortId: 'plus', amtValue: 500, merchant: 'Zed', sortAt: '2026-08-03T12:00' }),
      row({ sortId: 'minus', amtValue: -500, merchant: 'Ada', sortAt: '2026-08-03T12:00' }),
    ];
    // Sizes tie, so the fallback chain decides — details before id.
    const out = ids(sortRows(pair, desc('size')));
    expect(out).toEqual(['minus', 'plus']);
    expect(ids(sortRows([...pair].reverse(), desc('size')))).toEqual(out);
  });
  it('interleaves money in among money out, unlike the signed mode', () => {
    const coloured = [
      { ...row({ sortId: 'a', amtValue: -60850 }), amtColor: 'var(--text)' },
      { ...row({ sortId: 'b', amtValue: 20000 }), amtColor: 'var(--pos)' },
      { ...row({ sortId: 'c', amtValue: -70 }), amtColor: 'var(--text)' },
    ];
    // Size ranks by how big, so incoming money lands wherever its magnitude
    // puts it. The sign glyph on each row is what states the direction.
    expect(sortRows(coloured, desc('size')).map(r => r.amtColor))
      .toEqual(['var(--text)', 'var(--pos)', 'var(--text)']);
  });
});

// --- what the header can reach, and what the toggle is for -------------------
describe('every sort has exactly one route', () => {
  const HEADER_KEYS = ['date', 'details', 'category', 'account', 'status', 'size'];

  it('a header click can reach every column sort, both directions', () => {
    for (const k of HEADER_KEYS) {
      const first = nextSortState(DEFAULT_SORT, k);
      const second = nextSortState(first, k);
      expect(new Set([first.dir, second.dir])).toEqual(new Set(['asc', 'desc']));
      expect(first.key).toBe(k);
      expect(second.key).toBe(k);
    }
  });

  it('leaves signed as the only sort no header can produce', () => {
    // Which is why the list header keeps one button for it — clicking a column
    // gives size (how big), never signed (which way the balance moved).
    const reachable = new Set();
    for (const k of HEADER_KEYS) {
      let s = DEFAULT_SORT;
      for (let i = 0; i < 4; i++) { s = nextSortState(s, k); reachable.add(s.key); }
    }
    expect(reachable.has('signed')).toBe(false);
    expect(Object.keys(SORT_COLUMNS).filter(k => !reachable.has(k))).toEqual(['signed']);
  });

  it('the toggle round-trips between the default and lowest-first', () => {
    const toggle = s => (s.key === 'signed' ? DEFAULT_SORT : { key: 'signed', dir: 'asc' });
    const on = toggle(DEFAULT_SORT);
    expect([on, sortLabel(on)]).toEqual([{ key: 'signed', dir: 'asc' }, 'Biggest expense first']);
    expect(toggle(on)).toEqual(DEFAULT_SORT);
    // From any header sort it lands on the same place, so it is predictable.
    expect(toggle({ key: 'category', dir: 'desc' })).toEqual({ key: 'signed', dir: 'asc' });
  });
});
