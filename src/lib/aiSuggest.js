// U1 auto-categorize — CLIENT suggestion engine (PURE, no React, no fetch).
// Implements the approved functional design's L1/L2/L5/L7 (business-logic-model.md)
// and BR-U1-1..19 (business-rules.md). The store passed in (`S`) is already the
// ACTIVE PLAN's data (StoreProvider hydrates one plan), so "active plan only"
// needs no extra filtering here. The ranking math (L4) lives in the service and
// is pinned by the same modal/fixtures/categorize.*.json this module speaks to.
//
// This file imports NO test/fixture code and touches NO store actions — the UI
// layer performs the (existing) setTransactionsCategory / upsertPayee writes.
import { autoCategoryFor, payeeKey } from './payees.js';

// ---- Tunable constants (single source of truth; mirrored in the service) ----
export const MIN_HISTORY = 30;   // BR-U1-1  low-history guard
export const EXAMPLE_WINDOW = 200; // BR-U1-2 kNN example cap
export const K = 10;             // BR-U1-5  nearest neighbours
export const TOP_SIM = 0.80;     // BR-U1-6  primary-chip similarity floor
export const WINNER_SHARE = 0.60; // BR-U1-6 primary-chip share floor
export const RUNNER_SHARE = 0.25; // BR-U1-7 runner-up share floor

// The category-type domain a transaction maps into. Expense and refund rows both
// take EXPENSE categories; income rows take income — this mirrors the store's own
// `(t.type === 'income') === (cat.type === 'income')` pairing in
// setTransactionsCategory, and the service's hard type filter (BR-U1-4).
const catTypeOf = t => (t.type === 'income' ? 'income' : 'expense');

// A category cell is offerable only while present and not archived.
const activeCat = c => c && c.status !== 'archived';

// Whether a raw transaction is a needs-category target: no category and a
// categorizable type. Mirrors txRow.js `needsCategory` (kept inline so this pure
// module needn't pull in the row presenter and its calc.js dependencies).
const needsCategory = t => !t.category && (t.type === 'expense' || t.type === 'income' || t.type === 'refund');

// normMerchant: lower + trim + collapse inner whitespace + strip a single leading
// run of non-letter/digit — mirrors splitTx `catName`, so "⚡️ Utilities" ≈
// "utilities". The ONLY text embedded (BR-U1-3 / Q2).
export function normMerchant(s) {
  const x = String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
  return x.replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

// Resolve a category id → the group's NAME (or null). Group is advisory context
// only (the ranking embeds merchant text, not group), so an unresolved group is
// harmless.
function groupNameOf(S, groupId) {
  if (groupId == null) return null;
  const g = (S.categoryGroups || []).find(x => x.id === groupId);
  return g ? g.name : null;
}

// L1 — Context assembly. Returns null when the active plan has < MIN_HISTORY
// transactions carrying a present, non-archived category (US-5: the Fresh
// Starter sees no chips); otherwise { examples, categories }.
export function buildContext(S) {
  const cats = (S.categories || []).filter(activeCat);
  const catById = new Map(cats.map(c => [c.id, c]));

  // Categorized (against a still-active category) transactions, most-recent
  // first. tx.date is an ISO timestamp — lexicographically sortable.
  const categorized = (S.transactions || [])
    .filter(t => t.category && catById.has(t.category))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  if (categorized.length < MIN_HISTORY) return null;

  const examples = [];
  for (const t of categorized) {
    if (examples.length >= EXAMPLE_WINDOW) break; // BR-U1-2 window cap
    const merchant = normMerchant(t.merchant);
    if (!merchant) continue; // drop empty-merchant rows
    const cat = catById.get(t.category);
    examples.push({ merchant, amount: t.amount, type: cat.type, categoryId: t.category });
  }

  const categories = cats.map(c => ({
    id: c.id, name: c.name, group: groupNameOf(S, c.groupId), type: c.type,
  }));

  return { examples, categories };
}

// L2 — Target collection. From the visible needs-category rows, shape each as
// { id, merchant(norm), amount, type, date }. Excludes payees that already have
// an active autoCategorize rule (BR-U1-19 — the deterministic path wins) and
// rows whose merchant normalizes to empty (BR-U1-18).
export function collectTargets(S, visibleIds) {
  const want = visibleIds instanceof Set ? visibleIds : new Set(visibleIds || []);
  const out = [];
  for (const t of (S.transactions || [])) {
    if (!want.has(t.id) || !needsCategory(t)) continue;
    if (autoCategoryFor(S, t.merchant)) continue; // rule'd payee → skip AI
    const merchant = normMerchant(t.merchant);
    if (!merchant) continue;
    out.push({ id: t.id, merchant, amount: t.amount, type: catTypeOf(t), date: String(t.date || '').slice(0, 10) });
  }
  return out;
}

// L5 — Client validation (US-8, defense-in-depth over the server's own list
// restriction). Drop any suggestion whose categoryId is not a present,
// non-archived category of the target's matching type in the active plan; keep
// at most 2 per tx, ordered by confidence desc. Also drops ids for txs no longer
// present in the store.
export function validateSuggestions(map, S) {
  const catById = new Map((S.categories || []).filter(activeCat).map(c => [c.id, c]));
  const txById = new Map((S.transactions || []).map(t => [t.id, t]));
  const out = {};
  for (const [txId, list] of Object.entries(map || {})) {
    const tx = txById.get(txId);
    if (!tx || !Array.isArray(list)) continue;
    const want = catTypeOf(tx);
    const kept = list
      .filter(s => s && catById.get(s.categoryId) && catById.get(s.categoryId).type === want)
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, 2);
    if (kept.length) out[txId] = kept;
  }
  return out;
}

// L7 — Graduation. On each accept, increment the per-user counter for the
// `payeeKey|categoryId` pair; when it reaches 3 and the pair was not previously
// declined, surface a one-time rule offer (BR-U1-14). An empty payeeKey never
// counts (BR-U1-18). Returns a { prefsPatch, offer } the caller persists via the
// existing setPrefs fall-through — advisory prefs, never the ledger.
export function recordAccept(prefs, tx, categoryId) {
  const pk = payeeKey(tx && tx.merchant);
  if (!pk) return { prefsPatch: {}, offer: null };
  const key = pk + '|' + categoryId;
  const counts = { ...(prefs && prefs.aiAcceptCounts) };
  const next = (counts[key] || 0) + 1;
  counts[key] = next;
  const dismissed = (prefs && prefs.aiRuleDismissed) || {};
  const offer = next === 3 && !dismissed[key]
    ? { payeeName: tx.merchant, categoryId }
    : null;
  return { prefsPatch: { aiAcceptCounts: counts }, offer };
}

// Decline a rule offer: set the per-pair dismissed flag so it is never re-offered
// (BR-U1-16). Returns a prefsPatch for setPrefs.
export function dismissRule(prefs, key) {
  return { aiRuleDismissed: { ...(prefs && prefs.aiRuleDismissed), [key]: true } };
}

// The graduation key for a payee/category pair — exported so the UI can build the
// same key recordAccept/dismissRule use.
export function graduationKey(payeeName, categoryId) {
  return payeeKey(payeeName) + '|' + categoryId;
}
