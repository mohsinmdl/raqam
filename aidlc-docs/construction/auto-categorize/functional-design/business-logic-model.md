# Business Logic Model — U1 auto-categorize

Technology-agnostic. Client-side pure logic lives in `src/lib/aiSuggest.js`;
the ranking math lives in the service `/categorize` route. Both are pinned by
the shared fixtures. Stories US-5..US-8.

## L1 — Context assembly (client, `buildContext`)
1. Guard: if `< 30` categorized (non-archived) transactions in the ACTIVE plan
   → return `null` (US-5 low-history guard; the Fresh Starter sees no chips).
2. Examples: take up to the 200 most-recent categorized transactions; map each
   to `{ merchant: normMerchant(t.merchant), amount, type, categoryId }` where
   the category still exists and is active. Drop rows whose merchant normalizes
   to empty.
3. Categories: the active plan's non-archived categories as
   `{ id, name, group, type }`.
4. Return `{ examples, categories }` or `null`.

`normMerchant(s)` = lower + trim + collapse inner whitespace + strip a single
leading run of non-letter/digit (mirrors splitTx `catName`, so "⚡️ Utilities"
≈ "utilities"). This is the ONLY text embedded (Q2).

## L2 — Target collection (client, `collectTargets`)
From the currently-visible rows, keep those with `needsCategory` true (the
existing `txRow.needsCategory`); shape each as
`{ id, merchant: normMerchant, amount, type, date }`. Empty list → no request.

## L3 — Batching (client)
- Debounce ~800ms after the visible needs-category id-set settles.
- One `ai.categorize(targets, context)` for the whole visible batch.
- Cache the response in component state keyed by txId; a row renders chips from
  cache. Refetch ONLY when the visible needs-category id-set changes (Q5).
- Failure (any AiError) → empty result, no chips, no retry (US-3).

## L4 — Ranking (service `/categorize`, embeddings-only — Q1/Q2)
For each target:
1. Embed the target merchant and every example merchant with
   multilingual-e5-small (dedup identical example strings; cache within request).
2. Restrict candidate examples to those with `example.type === target.type`
   (HARD type filter — Q2).
3. kNN: the k=10 highest cosine similarities.
4. Vote: per candidate categoryId, `score = Σ similarity` over its neighbours
   in the top-k. `topSim` = max single similarity in the top-k.
5. `share(cat) = score(cat) / Σ score(all)`.
6. Winner = argmax score. Emit it ONLY if `topSim ≥ 0.80` AND
   `share(winner) ≥ 0.60`. Emit runner-up ONLY if `share(runner) ≥ 0.25`.
7. `confidence = share` (0–1), rounded to 2 dp. Result: `txId → [{categoryId,
   confidence} …]` (0–2 entries). No candidates / floors unmet → omit the txId.

Empty examples for a type, or no target → empty `suggestions` map (never an
error). No LLM anywhere in v1.

## L5 — Client validation (US-8, `validateSuggestions`)
Drop any suggestion whose `categoryId` is not a present, non-archived category
of the matching type in the active plan (defense-in-depth over the server's
own list-restriction). Keep at most 2 per tx, order by confidence desc.

## L6 — Apply (US-6)
Tap a chip → `applyData(setTransactionsCategory({ ids:[txId], categoryId }))`
(the ONLY write path; ordinary audit + undo). The tx leaves the needs-category
set; its cached chips are discarded. A chip whose category vanished between
fetch and tap is a no-op (guarded by L5 at render + re-check on tap).

## L7 — Graduation (US-7, `recordAccept` / `shouldOfferRule`)
On each accept: compute `payeeKey(tx.merchant)`; if empty, skip. Key =
`payeeKey|categoryId`. Increment `prefs.aiAcceptCounts[key]`. When it reaches
**3** and no dismissed-flag is set for the key → surface a ONE-TIME offer
"Always categorize <payee> as <category>?".
- Accept → `upsertPayee({ name: originalMerchant, patch: { autoCategorize:true,
  autoCategoryId: categoryId } })`; thereafter `autoCategoryFor` handles that
  payee and L2 excludes it (a payee with an active rule is not a suggestion
  target).
- Decline → set `prefs.aiRuleDismissed[key] = true`; never re-offer that pair.
Counters/flags live in per-user prefs (Q3) — advisory; wiping them only re-arms
a future offer, never corrupts the ledger.

## Data flow (text)
store (read) → buildContext/collectTargets (pure) → ai.categorize → service
kNN → suggestions map → validateSuggestions → chips → user tap →
setTransactionsCategory (existing) → recordAccept → maybe upsertPayee (existing).
