// The payee OVERLAY (Spec 2): payees are the distinct merchant strings on
// transactions; a S.payees record exists only once one is customized
// (auto-categorize, rename rules, hidden, canonical casing). Everything here
// is pure and case-insensitive on the trimmed name. Adjustment rows write a
// machine merchant ('Balance adjustment') and are never payees. Records with
// transferRef customize SYNTHESIZED transfer payees (visibility only) and
// never join the name index.
export const payeeKey = name => String(name || '').trim().toLowerCase();

export const matchesPayeeTx = (t, key) =>
  t.type !== 'adjustment' && t.type !== 'cardAdjustment' && payeeKey(t.merchant) === key;

export function payeeRecordFor(S, name) {
  const k = payeeKey(name);
  if (!k) return null;
  return S.payees.find(p => !p.transferRef && payeeKey(p.name) === k) || null;
}

export function payeeIndex(S) {
  const byKey = new Map(); // key -> { name, record, txCount }
  for (const t of S.transactions) {
    const k = payeeKey(t.merchant);
    if (!k || t.type === 'adjustment' || t.type === 'cardAdjustment') continue;
    const cur = byKey.get(k);
    if (cur) cur.txCount += 1;
    else byKey.set(k, { name: t.merchant.trim(), record: null, txCount: 1 });
  }
  for (const p of S.payees) {
    if (p.transferRef) continue;
    const k = payeeKey(p.name);
    if (!k) continue;
    const cur = byKey.get(k);
    if (cur) { cur.record = p; cur.name = p.name; } // record casing wins
    else byKey.set(k, { name: p.name, record: p, txCount: 0 });
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function transferHidden(S, ref) {
  return S.payees.some(p => p.transferRef === ref && p.hidden);
}

export function autoCategoryFor(S, name) {
  const r = payeeRecordFor(S, name);
  return r && r.autoCategorize ? (r.autoCategoryId || null) : null;
}

// Import-time canonicalization (NO production caller yet — the app has no
// file-import feature; this is the ready hook). 'is' rules are exact-match
// and beat every 'contains' rule; within a tier, record order then rule
// order decides.
export function applyRenameRules(name, payees) {
  const k = payeeKey(name);
  if (!k) return name;
  const records = payees.filter(p => !p.transferRef && (p.renameRules || []).length);
  for (const op of ['is', 'contains']) {
    for (const p of records) {
      for (const rule of p.renameRules) {
        if (rule.op !== op) continue;
        const pat = payeeKey(rule.pattern);
        if (!pat) continue;
        if (op === 'is' ? k === pat : k.includes(pat)) return p.name;
      }
    }
  }
  return name;
}
