import { describe, it, expect } from 'vitest';
import { deleteTransactions, duplicateTransactions, setTransactionsAccount, setTransactionsCategory, setTransactionsDate, setTransactionsStatus } from '../src/store/actions.js';

const tx = over => ({
  id: 't1', date: '2026-08-05T12:00', type: 'expense', amount: 100, status: 'cleared',
  accountId: 'a1', category: 'rent', merchant: 'Shop', notes: '', ...(over || {}),
});
const store = over => ({
  institutions: [], cardProducts: [],
  categories: [
    { id: 'rent', name: 'Rent', type: 'expense', status: 'active' },
    { id: 'groc', name: 'Groceries', type: 'expense', status: 'active' },
    { id: 'salary', name: 'Salary', type: 'income', status: 'active' },
  ],
  accounts: [
    { id: 'a1', nickname: 'Main', type: 'Current', status: 'active' },
    { id: 'a2', nickname: 'Savings', type: 'Current', status: 'active' },
  ],
  cards: [], snapshots: [], budgets: [], recurring: [], audit: [],
  transactions: [
    tx({ id: 't1' }),
    tx({ id: 't2', amount: 200 }),
    tx({ id: 't3', amount: 300, status: 'pending' }),
  ],
  ...(over || {}),
});
const auditFor = (s, id) => s.audit.filter(a => a.entityId === id);

describe('deleteTransactions', () => {
  it('removes exactly the selected rows', () => {
    const s = deleteTransactions(store(), { ids: ['t1', 't3'] });
    expect(s.transactions.map(t => t.id)).toEqual(['t2']);
  });

  it('writes one audit row per transaction, sharing a batchId', () => {
    const s = deleteTransactions(store(), { ids: ['t1', 't3'] });
    const rows = s.audit.filter(a => a.action === 'delete');
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map(a => a.after.batchId)).size).toBe(1);
    // entity_type and action must stay inside the existing CHECK constraints
    expect(new Set(rows.map(a => a.entityType))).toEqual(new Set(['transaction']));
  });

  it('keeps each row individually queryable by entityId', () => {
    const s = deleteTransactions(store(), { ids: ['t1', 't3'] });
    expect(auditFor(s, 't1')).toHaveLength(1);
    expect(auditFor(s, 't3')).toHaveLength(1);
    expect(auditFor(s, 't2')).toHaveLength(0);
  });

  it('ignores ids that no longer exist', () => {
    const s = deleteTransactions(store(), { ids: ['t1', 'gone'] });
    expect(s.transactions.map(t => t.id)).toEqual(['t2', 't3']);
    expect(s.audit.filter(a => a.action === 'delete')).toHaveLength(1);
  });

  it('is a no-op for an empty or missing selection', () => {
    const base = store();
    expect(deleteTransactions(base, { ids: [] })).toBe(base);
    expect(deleteTransactions(base, { ids: ['nope'] })).toBe(base);
    expect(deleteTransactions(base, {})).toBe(base);
  });
});

describe('duplicateTransactions', () => {
  it('appends an exact copy of each selected row with a fresh id', () => {
    const s = duplicateTransactions(store(), { ids: ['t1', 't3'] });
    expect(s.transactions).toHaveLength(5);
    const copies = s.transactions.filter(t => !['t1', 't2', 't3'].includes(t.id));
    expect(copies).toHaveLength(2);
    // every field but the id matches an original
    for (const c of copies) {
      const orig = [tx({ id: 't1' }), tx({ id: 't3', amount: 300, status: 'pending' })]
        .find(o => o.amount === c.amount && o.status === c.status);
      const { id: _c, ...cRest } = c;
      const { id: _o, ...oRest } = orig;
      expect(cRest).toEqual(oRest);
      expect(c.id).not.toBe(orig.id);
    }
  });

  it('gives the copies unique ids', () => {
    const s = duplicateTransactions(store(), { ids: ['t1', 't2', 't3'] });
    const ids = s.transactions.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('writes one create-audit per copy, sharing a batchId, keyed to the NEW id', () => {
    const s = duplicateTransactions(store(), { ids: ['t1', 't3'] });
    const rows = s.audit.filter(a => a.action === 'create');
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map(a => a.after.batchId)).size).toBe(1);
    // audit points at the copies, never the originals
    const copyIds = new Set(s.transactions.filter(t => !['t1', 't2', 't3'].includes(t.id)).map(t => t.id));
    expect(rows.every(a => copyIds.has(a.entityId))).toBe(true);
  });

  it('does not carry edit history onto a copy', () => {
    const base = store({ transactions: [tx({ id: 't1', editedAt: '2026-08-06T10:00', editCount: 3 })] });
    const s = duplicateTransactions(base, { ids: ['t1'] });
    const copy = s.transactions.find(t => t.id !== 't1');
    expect(copy.editedAt).toBeUndefined();
    expect(copy.editCount).toBeUndefined();
  });

  it('is a no-op for an empty or missing selection', () => {
    const base = store();
    expect(duplicateTransactions(base, { ids: [] })).toBe(base);
    expect(duplicateTransactions(base, { ids: ['nope'] })).toBe(base);
    expect(duplicateTransactions(base, {})).toBe(base);
  });
});

describe('setTransactionsCategory', () => {
  it('recategorises the selected rows', () => {
    const s = setTransactionsCategory(store(), { ids: ['t1', 't2'], categoryId: 'groc' });
    expect(s.transactions.filter(t => t.category === 'groc').map(t => t.id)).toEqual(['t1', 't2']);
    expect(s.transactions.find(t => t.id === 't3').category).toBe('rent');
  });

  it('stamps the rows it changed', () => {
    const s = setTransactionsCategory(store(), { ids: ['t1'], categoryId: 'groc' });
    expect(s.transactions.find(t => t.id === 't1').editCount).toBe(1);
  });

  it('skips rows already in that category rather than churning them', () => {
    // Every selected row is already 'rent', so this must return the SAME store
    // — no edit stamps, no audit noise, no pointless sync push.
    const base = store();
    expect(setTransactionsCategory(base, { ids: ['t1', 't2'], categoryId: 'rent' })).toBe(base);
  });

  it('changes only the rows that differ when the selection is mixed', () => {
    const base = store({
      transactions: [tx({ id: 't1', category: 'rent' }), tx({ id: 't2', category: 'groc' })],
    });
    const s = setTransactionsCategory(base, { ids: ['t1', 't2'], categoryId: 'groc' });
    expect(s.transactions.map(t => t.category)).toEqual(['groc', 'groc']);
    expect(s.audit.filter(a => a.action === 'update')).toHaveLength(1);   // t2 was already groc
    expect(s.transactions.find(t => t.id === 't2').editCount).toBeUndefined();
  });

  it('refuses a category whose type does not match the transaction', () => {
    // 'salary' is income; the selection is all expenses
    const base = store();
    expect(setTransactionsCategory(base, { ids: ['t1', 't2'], categoryId: 'salary' })).toBe(base);
  });

  it('leaves transfers and adjustments alone — they carry no category', () => {
    const base = store({
      transactions: [
        tx({ id: 'x1', type: 'transfer', category: undefined, toAccountId: 'a2' }),
        tx({ id: 'x2', type: 'adjustment', category: undefined }),
      ],
    });
    expect(setTransactionsCategory(base, { ids: ['x1', 'x2'], categoryId: 'groc' })).toBe(base);
  });

  it('is a no-op for an unknown category', () => {
    const base = store();
    expect(setTransactionsCategory(base, { ids: ['t1'], categoryId: 'nope' })).toBe(base);
  });
});

describe('setTransactionsStatus', () => {
  it('marks the selected rows cleared', () => {
    const s = setTransactionsStatus(store(), { ids: ['t3'], status: 'cleared' });
    expect(s.transactions.find(t => t.id === 't3').status).toBe('cleared');
  });

  it('marks the selected rows pending', () => {
    const s = setTransactionsStatus(store(), { ids: ['t1', 't2'], status: 'pending' });
    expect(s.transactions.filter(t => t.status === 'pending').map(t => t.id)).toEqual(['t1', 't2', 't3']);
  });

  it('only touches rows whose status actually changes', () => {
    const s = setTransactionsStatus(store(), { ids: ['t1', 't2', 't3'], status: 'cleared' });
    expect(s.audit.filter(a => a.action === 'update')).toHaveLength(1); // only t3 was pending
  });

  it('never marks a card correction pending — it is machine-generated', () => {
    const base = store({ transactions: [tx({ id: 'c1', type: 'cardAdjustment', cardId: 'card1', accountId: undefined })] });
    expect(setTransactionsStatus(base, { ids: ['c1'], status: 'pending' })).toBe(base);
  });

  it('rejects a status outside the schema', () => {
    const base = store();
    expect(setTransactionsStatus(base, { ids: ['t1'], status: 'archived' })).toBe(base);
  });
});

describe('setTransactionsAccount', () => {
  it('reassigns the funding account of the selected rows', () => {
    const s = setTransactionsAccount(store(), { ids: ['t1', 't2'], accountId: 'a2' });
    expect(s.transactions.filter(t => t.accountId === 'a2').map(t => t.id)).toEqual(['t1', 't2']);
    expect(s.transactions.find(t => t.id === 't3').accountId).toBe('a1');
  });

  it('stamps the rows it changed', () => {
    const s = setTransactionsAccount(store(), { ids: ['t1'], accountId: 'a2' });
    expect(s.transactions.find(t => t.id === 't1').editCount).toBe(1);
  });

  it('skips rows already on the target account rather than churning them', () => {
    // Every selected row is already on a1 — same store back, no stamps or audit.
    const base = store();
    expect(setTransactionsAccount(base, { ids: ['t1', 't2'], accountId: 'a1' })).toBe(base);
  });

  it('leaves transfers untouched — moving one leg would break the pairing', () => {
    const base = store({
      transactions: [
        tx({ id: 'x1', type: 'transfer', category: undefined, accountId: 'a1', toAccountId: 'a2' }),
        tx({ id: 'x2', type: 'transfer', category: undefined, accountId: 'a1', isCardPayment: true, toCardId: 'card1' }),
      ],
    });
    expect(setTransactionsAccount(base, { ids: ['x1', 'x2'], accountId: 'a2' })).toBe(base);
  });

  it('leaves a non-transfer row that still carries a transfer leg untouched', () => {
    // The type isn't 'transfer', but a toAccountId/toCardId leg is present, so
    // moving the near account leg would still break a pairing. The !toAccountId
    // and !toCardId guards must exclude these independently of the type check —
    // if they didn't, these rows would be silently reassigned.
    const base = store({
      transactions: [
        tx({ id: 'g1', type: 'expense', toAccountId: 'a2' }),
        tx({ id: 'g2', type: 'expense', toCardId: 'card1' }),
      ],
    });
    expect(setTransactionsAccount(base, { ids: ['g1', 'g2'], accountId: 'a2' })).toBe(base);
  });

  it('leaves card-funded rows untouched — they live in a card register, not an account', () => {
    const base = store({ transactions: [tx({ id: 'c1', accountId: undefined, cardId: 'card1' })] });
    expect(setTransactionsAccount(base, { ids: ['c1'], accountId: 'a2' })).toBe(base);
  });

  it('moves only the eligible rows when the selection is mixed', () => {
    const base = store({
      transactions: [
        tx({ id: 't1', accountId: 'a1' }),
        tx({ id: 'x1', type: 'transfer', category: undefined, accountId: 'a1', toAccountId: 'a2' }),
      ],
    });
    const s = setTransactionsAccount(base, { ids: ['t1', 'x1'], accountId: 'a2' });
    expect(s.transactions.find(t => t.id === 't1').accountId).toBe('a2');
    expect(s.transactions.find(t => t.id === 'x1').accountId).toBe('a1'); // transfer untouched
    expect(s.audit.filter(a => a.action === 'update')).toHaveLength(1);
  });

  it('writes one audit row per moved transaction, sharing a batchId', () => {
    const s = setTransactionsAccount(store(), { ids: ['t1', 't2'], accountId: 'a2' });
    const rows = s.audit.filter(a => a.action === 'update');
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map(a => a.after.batchId)).size).toBe(1);
    expect(new Set(rows.map(a => a.entityType))).toEqual(new Set(['transaction']));
    expect(auditFor(s, 't1')[0].after.accountId).toBe('a2');
  });

  it('is a no-op for an unknown account or empty selection', () => {
    const base = store();
    expect(setTransactionsAccount(base, { ids: ['t1'], accountId: 'nope' })).toBe(base);
    expect(setTransactionsAccount(base, { ids: [], accountId: 'a2' })).toBe(base);
    expect(setTransactionsAccount(base, {})).toBe(base);
  });
});

describe('setTransactionsDate', () => {
  const NOW = '2026-08-31T23:59:59';
  const dated = over => ({
    id: 'd1', date: '2026-08-05T09:00', type: 'expense', amount: 100, status: 'cleared',
    accountId: 'a1', category: 'rent', merchant: 'Shop', notes: '', ...(over || {}),
  });
  const dateStore = rows => store({ transactions: rows });

  it('moves the selected rows to the new day', () => {
    const base = dateStore([dated({ id: 'd1' }), dated({ id: 'd2' })]);
    const s = setTransactionsDate(base, { ids: ['d1', 'd2'], date: '2026-08-20', now: NOW });
    expect(s.transactions.map(t => t.date.slice(0, 10))).toEqual(['2026-08-20', '2026-08-20']);
  });

  it('keeps each row its own time-of-day, preserving intra-day order', () => {
    const base = dateStore([
      dated({ id: 'd1', date: '2026-08-05T09:00' }),
      dated({ id: 'd2', date: '2026-08-05T15:30:45' }),
    ]);
    const s = setTransactionsDate(base, { ids: ['d1', 'd2'], date: '2026-08-20', now: NOW });
    expect(s.transactions.find(t => t.id === 'd1').date).toBe('2026-08-20T09:00');
    expect(s.transactions.find(t => t.id === 'd2').date).toBe('2026-08-20T15:30:45');
  });

  it('stamps the rows it changed', () => {
    const base = dateStore([dated({ id: 'd1' })]);
    const s = setTransactionsDate(base, { ids: ['d1'], date: '2026-08-20', now: NOW });
    expect(s.transactions.find(t => t.id === 'd1').editCount).toBe(1);
  });

  it('clamps to now so a bulk move can never push a row into the future', () => {
    // Row time is late in the day; targeting today would land past `now`.
    const now = '2026-08-31T14:00:00';
    const base = dateStore([dated({ id: 'd1', date: '2026-08-05T23:30' })]);
    const s = setTransactionsDate(base, { ids: ['d1'], date: '2026-08-31', now });
    expect(s.transactions.find(t => t.id === 'd1').date).toBe(now);
  });

  it('skips rows already on the target day rather than churning them', () => {
    const base = dateStore([dated({ id: 'd1', date: '2026-08-20T09:00' })]);
    expect(setTransactionsDate(base, { ids: ['d1'], date: '2026-08-20', now: NOW })).toBe(base);
  });

  it('changes only the rows that move when the selection spans days', () => {
    const base = dateStore([
      dated({ id: 'd1', date: '2026-08-20T09:00' }), // already on target
      dated({ id: 'd2', date: '2026-08-05T09:00' }),
    ]);
    const s = setTransactionsDate(base, { ids: ['d1', 'd2'], date: '2026-08-20', now: NOW });
    expect(s.audit.filter(a => a.action === 'update')).toHaveLength(1);
    expect(s.transactions.find(t => t.id === 'd1').editCount).toBeUndefined();
  });

  it('writes one audit row per moved transaction, sharing a batchId', () => {
    const base = dateStore([dated({ id: 'd1' }), dated({ id: 'd2' })]);
    const s = setTransactionsDate(base, { ids: ['d1', 'd2'], date: '2026-08-20', now: NOW });
    const rows = s.audit.filter(a => a.action === 'update');
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map(a => a.after.batchId)).size).toBe(1);
    expect(auditFor(s, 'd1')[0].after.date).toBe('2026-08-20T09:00');
  });

  it('rejects a malformed date, empty or missing selection', () => {
    const base = dateStore([dated({ id: 'd1' })]);
    expect(setTransactionsDate(base, { ids: ['d1'], date: 'NaN-08-20', now: NOW })).toBe(base);
    expect(setTransactionsDate(base, { ids: ['d1'], date: '2026-08-20T09:00', now: NOW })).toBe(base); // needs a day, not a stamp
    expect(setTransactionsDate(base, { ids: [], date: '2026-08-20', now: NOW })).toBe(base);
    expect(setTransactionsDate(base, {})).toBe(base);
  });
});

describe('immutability', () => {
  it('never mutates the store it was given', () => {
    const base = store();
    Object.freeze(base);
    Object.freeze(base.transactions);
    base.transactions.forEach(Object.freeze);
    expect(() => deleteTransactions(base, { ids: ['t1'] })).not.toThrow();
    expect(() => duplicateTransactions(base, { ids: ['t1'] })).not.toThrow();
    expect(() => setTransactionsCategory(base, { ids: ['t1'], categoryId: 'groc' })).not.toThrow();
    expect(() => setTransactionsStatus(base, { ids: ['t3'], status: 'cleared' })).not.toThrow();
    expect(() => setTransactionsAccount(base, { ids: ['t1'], accountId: 'a2' })).not.toThrow();
    expect(() => setTransactionsDate(base, { ids: ['t1'], date: '2026-08-20', now: '2026-08-31T23:59:59' })).not.toThrow();
    expect(base.transactions).toHaveLength(3);
    expect(base.transactions[0].category).toBe('rent');
    expect(base.transactions[0].accountId).toBe('a1');
  });
});
