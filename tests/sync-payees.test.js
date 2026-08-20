// Sync contract for payees (Spec 2 overlay collection). The mapper must
// round-trip correctly, preserving the rta sentinel and all optional fields.
import { describe, it, expect } from 'vitest';
import { COLLECTIONS } from '../src/store/sync.js';

describe('payees sync mapper', () => {
  it('payees mapper round-trips, including the rta sentinel and transferRef', () => {
    const col = COLLECTIONS.find(c => c.name === 'payees');
    const full = { id: 'p1', name: 'Subway', autoCategorize: true, autoCategoryId: 'rta', renameRules: [{ op: 'is', pattern: 'SUBWAY*' }], hidden: true };
    expect(col.fromRow(col.toRow(full))).toEqual(full);
    const cat = { id: 'p2', name: 'Mepco', autoCategorize: true, autoCategoryId: 'c9' };
    expect(col.fromRow(col.toRow(cat))).toEqual(cat);
    const transfer = { id: 'p3', name: '', transferRef: 'acc:a1', hidden: true };
    expect(col.fromRow(col.toRow(transfer))).toEqual(transfer);
    const minimal = { id: 'p4', name: 'Dental' };
    expect(col.fromRow(col.toRow(minimal))).toEqual(minimal);
  });
});
