import { describe, it, expect } from 'vitest';
import { accountGroupsFor, archivedRowsFor } from '../src/ui/accounts/phone/accountsPhone.js';

const S = {
  institutions: [
    { id: 'i1', name: 'Meezan', kind: 'Bank' },
    { id: 'i2', name: 'JazzCash', kind: 'Wallet' },
    { id: 'i3', name: 'Under the mattress', kind: 'Custom' },
  ],
  accounts: [
    { id: 'a1', nickname: 'Meezan Current', instId: 'i1', status: 'active' },
    { id: 'a2', nickname: 'JazzCash', instId: 'i2', status: 'active' },
    { id: 'a3', nickname: 'Meezan Savings', instId: 'i1', status: 'active' },
    { id: 'a4', nickname: 'Cash box', instId: 'i3', status: 'active' },
    { id: 'a5', nickname: 'Old account', instId: 'i1', status: 'archived' },
    { id: 'a6', nickname: 'No inst', instId: null, status: 'active' },
  ],
};
const bal = { a1: 1000, a2: 200, a3: 500, a4: -50, a6: 10 };
const balanceOf = a => bal[a.id];

describe('accountGroupsFor', () => {
  const groups = accountGroupsFor(S, balanceOf);
  it('groups by institution kind in first-appearance order', () => {
    expect(groups.map(g => g.label)).toEqual(['Bank', 'Wallet', 'Other']);
  });
  it('keeps S.accounts order within a group and sums raw balances', () => {
    const bank = groups[0];
    expect(bank.rows.map(r => r.acct.id)).toEqual(['a1', 'a3']);
    expect(bank.total).toBe(1500);
  });
  it("maps Custom kind and missing institution both into 'Other'", () => {
    const other = groups[2];
    expect(other.rows.map(r => r.acct.id)).toEqual(['a4', 'a6']);
    expect(other.total).toBe(-40);
    expect(other.rows[1].inst).toBeNull();
  });
  it('excludes non-active accounts', () => {
    expect(groups.flatMap(g => g.rows).some(r => r.acct.id === 'a5')).toBe(false);
  });
});

describe('archivedRowsFor', () => {
  it('lists only non-active accounts with labels', () => {
    const rows = archivedRowsFor({ ...S, accounts: [...S.accounts, { id: 'a7', nickname: 'Shut', instId: 'i2', status: 'closed' }] });
    expect(rows.map(r => r.acct.id)).toEqual(['a5', 'a7']);
    expect(rows[0].instLabel).toBe('Meezan');
    expect(rows[1].statusLabel).toBe('closed');
    expect(rows[0].statusLabel).toBe('archived');
  });
});
