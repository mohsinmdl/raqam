// Audit-trail helpers. Every mutating action appends audit rows to data.audit
// (an append-only collection: the sync engine only ever INSERTs them, and the
// server's RLS has no update/delete policies). userId is stamped server-side.
import { uid } from '../lib/util.js';
import { nowIso } from '../lib/dates.js';

export function makeAudit({ entityType, entityId, action, summary = '', before = null, after = null }) {
  return { id: uid(), at: nowIso(), entityType, entityId, action, summary, before, after };
}

// Field-level diff for update audits: returns {before, after, keys} with only
// the fields that changed (undefined normalized to null).
export function diffFields(before, after, fields) {
  const b = {}, a = {}, keys = [];
  (fields || Object.keys({ ...before, ...after })).forEach(k => {
    const bv = before?.[k] === undefined ? null : before[k];
    const av = after?.[k] === undefined ? null : after[k];
    if (JSON.stringify(bv) !== JSON.stringify(av)) { b[k] = bv; a[k] = av; keys.push(k); }
  });
  return { before: b, after: a, keys };
}

// Mark a record as edited — drives the "Edited" chips.
export function stampUpdate(rec) {
  return { ...rec, editedAt: nowIso(), editCount: (rec.editCount || 0) + 1 };
}
