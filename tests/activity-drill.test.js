// Where an Activity-modal row drills to. A bank-account txn opens that account's
// register; a card-funded txn (no accountId) has no per-account register, so it
// opens the all-accounts view — the only place card txns are listed. Either way
// the txn id rides along as a one-shot ?sel= deep-link the register consumes.
import { describe, it, expect } from 'vitest';
import { activityDrillTarget } from '../src/lib/activityDrill.js';

describe('activityDrillTarget', () => {
  it('sends a bank-account txn to that account ledger, txn as ?sel=', () => {
    expect(activityDrillTarget({ id: 'tx1', accountId: 'askari' })).toEqual({
      pathname: '/transactions/askari',
      search: '?sel=tx1',
    });
  });

  it('sends a card-funded txn (no accountId) to the all-accounts view', () => {
    expect(activityDrillTarget({ id: 'tx2', cardId: 'visa' })).toEqual({
      pathname: '/transactions',
      search: '?sel=tx2',
    });
  });

  it('url-encodes a txn id with unsafe characters', () => {
    expect(activityDrillTarget({ id: 'a b/c', accountId: 'acc' }).search).toBe('?sel=a%20b%2Fc');
  });
});
