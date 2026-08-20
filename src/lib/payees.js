// The payee OVERLAY (Spec 2): payees are the distinct merchant strings on
// transactions; a S.payees record exists only once one is customized
// (auto-categorize, rename rules, hidden, canonical casing). Everything here
// is pure and case-insensitive on the trimmed name. Three transaction kinds
// carry a MACHINE-written merchant and are never payees: adjustments,
// card adjustments, and transfers (a card payment is the only transfer that
// carries a merchant at all, and the app writes it). Records with
// transferRef customize SYNTHESIZED transfer payees (visibility only) and
// never join the name index — that is where a transfer's visibility lives.
export const payeeKey = name => String(name || '').trim().toLowerCase();

export const matchesPayeeTx = (t, key) =>
  t.type !== 'adjustment' && t.type !== 'cardAdjustment' && t.type !== 'transfer' && payeeKey(t.merchant) === key;

export function payeeRecordFor(S, name) {
  const k = payeeKey(name);
  if (!k) return null;
  return (S.payees || []).find(p => !p.transferRef && payeeKey(p.name) === k) || null;
}

export function payeeIndex(S) {
  const byKey = new Map(); // key -> { name, record, txCount }
  for (const t of S.transactions) {
    const k = payeeKey(t.merchant);
    if (!k || t.type === 'adjustment' || t.type === 'cardAdjustment' || t.type === 'transfer') continue;
    const cur = byKey.get(k);
    if (cur) cur.txCount += 1;
    else byKey.set(k, { name: t.merchant.trim(), record: null, txCount: 1 });
  }
  for (const p of (S.payees || [])) {
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
  return (S.payees || []).some(p => p.transferRef === ref && p.hidden);
}

// A rule's category can go stale behind the overlay's back: the category may
// be archived (still in S.categories, but no longer offerable) or deleted
// outright by a path that missed the sweep. Resolving the id here — rather
// than trusting the record — keeps a stale rule from silently writing a dead
// category id onto a transaction. 'rta' is a sentinel, not an id, so it never
// needs to resolve.
export function autoCategoryFor(S, name) {
  const r = payeeRecordFor(S, name);
  if (!r || !r.autoCategorize) return null;
  const id = r.autoCategoryId || null;
  if (!id || id === 'rta') return id;
  return (S.categories || []).some(c => c.id === id && c.status !== 'archived') ? id : null;
}

// Import-time canonicalization (NO production caller yet — the app has no
// file-import feature; this is the ready hook). 'is' rules are exact-match
// and beat every 'contains' rule; within a tier, record order then rule
// order decides.
export function applyRenameRules(name, payees) {
  const k = payeeKey(name);
  if (!k) return name;
  const records = (payees || []).filter(p => !p.transferRef && (p.renameRules || []).length);
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

// The inline editor's prefill decision: returns the category id to patch, or
// null for "do nothing" (already categorized, no rule, or the rule says
// Ready-to-Assign — which for an inflow just means stay uncategorized).
export function autoCategoryPatchArgs(S, name, currentCategory) {
  if (currentCategory) return null;
  const auto = autoCategoryFor(S, name);
  return auto && auto !== 'rta' ? auto : null;
}
