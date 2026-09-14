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

// Display helper for the delete-reassignment step, which has to name the
// payees it is about to delete (the selection behind it is disabled, so this
// copy is the only remaining evidence of what the button will do). A 40-payee
// bulk delete would push the buttons off-screen, so cap it and say how many
// are unnamed rather than silently truncating.
export function payeeListLabel(names, { maxNames = 3, maxChars = 60 } = {}) {
  const shown = [];
  let chars = 0;
  for (const n of names) {
    if (shown.length >= maxNames || (shown.length && chars + n.length > maxChars)) break;
    shown.push(n);
    chars += n.length + 2;
  }
  const rest = names.length - shown.length;
  return shown.join(', ') + (rest > 0 ? ', … (' + rest + ' more)' : '');
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

// Fuzzy candidate selection for the LEARNED-category prefill. Tiers, highest
// wins: an exact key (3); the typed text being a prefix of a known payee
// (2, "JJ" → "JJ Store"); a known payee being a prefix of the typed text
// (1, "JJ Store Downtown" → "JJ Store"). The tie-break follows the match
// DIRECTION: for tier 2 (you typed less than the full name) the most-used
// completion wins, so evidence (txCount) leads; for tier 1 (you typed more)
// the longest — most specific — known prefix leads, so "JJ Store" beats a
// busier bare "JJ". Short input (1-2 chars) is held to exact-or-completion
// (tiers 3/2 only): typing "JJ" must never resolve to a shorter "J". Returns
// a payeeIndex entry or null.
function bestPayeeMatch(S, name) {
  const key = payeeKey(name);
  if (!key) return null;
  const short = key.length <= 2;
  const better = (a, b) => {
    if (a.tier !== b.tier) return a.tier > b.tier;
    if (a.tier === 1 && a.klen !== b.klen) return a.klen > b.klen; // most specific
    if (a.entry.txCount !== b.entry.txCount) return a.entry.txCount > b.entry.txCount;
    return a.entry.name.localeCompare(b.entry.name) < 0;
  };
  let best = null;
  for (const entry of payeeIndex(S)) {
    const k = payeeKey(entry.name);
    if (!k) continue;
    let tier = 0;
    if (k === key) tier = 3;
    else if (k.startsWith(key)) tier = 2;
    else if (!short && key.startsWith(k)) tier = 1;
    if (!tier) continue;
    const cand = { entry, tier, klen: k.length };
    if (!best || better(cand, best)) best = cand;
  }
  return best ? best.entry : null;
}

// The learned category for a matched payee: the category that payee's own
// transactions carry most often (any plurality, not a majority), ties broken
// by the most-recent use. Uncategorized legs don't vote; a winner whose
// category has since been archived or deleted is discarded (same standard as
// autoCategoryFor) rather than written back as a dead id.
function historyCategory(S, key) {
  const counts = new Map(); // catId -> { n, last }
  for (const t of (S.transactions || [])) {
    if (!matchesPayeeTx(t, key)) continue;
    const cid = t.category;
    if (!cid || cid === 'rta') continue;
    const cur = counts.get(cid) || { n: 0, last: '' };
    cur.n += 1;
    const d = t.date || '';
    if (d > cur.last) cur.last = d;
    counts.set(cid, cur);
  }
  let best = null; // { cid, n, last }
  for (const [cid, v] of counts) {
    if (!best || v.n > best.n || (v.n === best.n && v.last > best.last)) best = { cid, n: v.n, last: v.last };
  }
  if (!best) return null;
  return (S.categories || []).some(c => c.id === best.cid && c.status !== 'archived') ? best.cid : null;
}

// The auto-fill decision as the user commits a payee: returns the category id
// to fill, or null for "leave the category alone". A payee's explicit rule
// always wins over learned history (a Ready-to-Assign rule means the user
// asked to keep it uncategorized, so it suppresses inference too); otherwise
// the category is learned from the payee's own past transactions. A category
// the user typed by hand is never overwritten (currentCategory && !catAuto);
// one we auto-filled from an earlier payee IS reconsidered (catAuto), so
// changing the payee re-points the guess.
export function inferCategoryForPayee(S, name, { currentCategory = '', catAuto = false } = {}) {
  if (currentCategory && !catAuto) return null;
  const match = bestPayeeMatch(S, name);
  if (!match) return null;
  if (match.record && match.record.autoCategorize) {
    const ruled = autoCategoryFor(S, match.name);
    return ruled && ruled !== 'rta' ? ruled : null;
  }
  return historyCategory(S, payeeKey(match.name));
}
