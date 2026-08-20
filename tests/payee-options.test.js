import { describe, it, expect } from 'vitest';
import { payeeSections } from '../src/lib/payeeOptions.js';

const S = {
  accounts: [
    { id: 'a1', nickname: 'BankIslami', status: 'active' },
    { id: 'a2', nickname: 'Easypaisa', status: 'active' },
    { id: 'a3', nickname: 'Old', status: 'closed' },
  ],
  cards: [{ id: 'k1', nickname: 'Meezan Card', last4: '4242', type: 'credit', status: 'active' }],
  transactions: [
    { merchant: 'Subway' }, { merchant: 'subway' }, { merchant: 'Car Wash' },
    { merchant: '' }, { merchant: 'Balance adjustment', type: 'adjustment' },
  ],
  payees: [],
};

it('lists To/From per active account and credit card, excluding the source', () => {
  const [transfers] = payeeSections(S, { sourceRef: 'acc:a1', query: '' });
  expect(transfers.label).toBe('Payments and Transfers');
  const labels = transfers.items.map(i => i.label);
  expect(labels).toContain('To/From Easypaisa');
  expect(labels).toContain('To/From Meezan Card ••4242');
  expect(labels).not.toContain('To/From BankIslami'); // the source itself
  expect(labels).not.toContain('To/From Old');        // closed account
});

it('derives distinct payees from merchants, case-insensitively, skipping blanks and adjustments', () => {
  const sections = payeeSections(S, { sourceRef: 'acc:a1', query: '' });
  const payees = sections.find(s => s.label === 'Saved Payees').items.map(i => i.name);
  expect(payees).toEqual(['Car Wash', 'Subway']); // sorted, first-seen casing wins
});

it('filters both sections by query and drops empty sections', () => {
  const sections = payeeSections(S, { sourceRef: 'acc:a1', query: 'easy' });
  expect(sections.length).toBe(1);
  expect(sections[0].items[0].label).toBe('To/From Easypaisa');
});

it('saved payees come from the index, hidden ones excluded, record casing wins', () => {
  const S2 = { ...S, payees: [
    { id: 'p1', name: 'SUBWAY' },
    { id: 'p2', name: 'Car Wash', hidden: true },
    { id: 'p3', name: 'Landlord' },                        // record-only payee
  ] };
  const sections = payeeSections(S2, { sourceRef: 'acc:a1', query: '' });
  const saved = sections.find(s => s.label === 'Saved Payees');
  const names = saved.items.map(i => i.name);
  expect(names).toContain('SUBWAY');       // record casing
  expect(names).toContain('Landlord');     // no transactions yet, still offered
  expect(names).not.toContain('Car Wash'); // hidden
});
it('hidden transfer payees are excluded from Payments and Transfers', () => {
  const S2 = { ...S, payees: [{ id: 'p9', name: '', transferRef: 'acc:a2', hidden: true }] };
  const [transfers] = payeeSections(S2, { sourceRef: 'acc:a1', query: '' });
  expect(transfers.items.some(i => i.ref === 'acc:a2')).toBe(false);
});
