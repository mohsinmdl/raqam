# Code Generation Plan — U1 auto-categorize

**Single source of truth for U1 Code Generation.** Implements the approved
functional design (`construction/auto-categorize/functional-design/`). Stories
US-5..US-8. Depends on U0 (merged/committed on this branch).

## Unit context
- Builds on U0's `ai.js`/`useAI`; adds the real `/categorize` route (embeddings,
  no LLM) + client suggestion engine + chips/graduation UI.
- WRITES only via existing `setTransactionsCategory` and `upsertPayee`. No
  store/reducer/sync changes.
- Contract already fixed in `modal/schemas.py` + `modal/fixtures/categorize.*`.

## Generation steps

### Service
- [x] **Step 1 — `modal/embed.py`**: sentence-transformers `multilingual-e5-small`
  loaded from the `raqam-ai-models` volume; helper `rank(request)` implementing
  L4 (e5 query/passage prefixes, cosine, type hard-filter, k=10, summed-sim
  vote, floors 0.80/0.60/0.25, confidence=share, ≤2/tx). Pure-python `rank()`
  testable with a FAKE embed fn (dependency-injected) so pytest needs no model.
- [x] **Step 2 — `modal/app.py` + `modal/api.py`**: add the `embed` CPU function
  (or run embeddings in the `api` container — decide for cost: keep in `api`
  since e5-small is CPU + tiny) and REPLACE the `/categorize` 501 stub with the
  real handler calling `rank()`; response validated by the existing schema.
- [x] **Step 3 — `modal/tests/test_categorize.py`**: `rank()` unit tests with a
  deterministic fake embedder — type filter, floors (below→omitted, above→
  emitted), ≤2 chips, share math, empty examples; plus a route test (authed)
  asserting the fixture request → schema-valid response shape. Full pytest green.

### Client
- [x] **Step 4 — `src/lib/aiSuggest.js`**: `normMerchant`, `buildContext(S)`
  (30-guard, 200-window, active-plan categories), `collectTargets(S, visibleIds)`
  (needs-category rows, exclude rule'd payees), `validateSuggestions(map, S)`
  (US-8 id drop, ≤2, sort), `recordAccept(prefs, tx, categoryId)` →
  `{ prefsPatch, offer|null }`, `shouldOfferRule`/dismiss helpers. Tunable
  consts (30/200/10/0.80/0.60/0.25) exported. PURE.
- [x] **Step 5 — `src/lib/aiSuggest.test.js`** (+ fast-check where natural):
  guard, window cap, type filter, validation drops foreign/archived ids,
  accept-count increments, 3rd→offer, decline→dismissed, rule'd-payee excluded.
  fast-check: validateSuggestions never returns a foreign id (property).
- [x] **Step 6 — `src/ui/ai/SuggestionChips.jsx`** + **`GraduationOffer.jsx`**:
  per FD frontend-components (props, testids, phone stopPropagation, Base UI).
- [x] **Step 7 — wire into surfaces (in-place, additive)**:
  `src/ui/TxChips.jsx` (NeedsCategoryPill accepts suggestions/onApply),
  `src/components/TxPhoneList.jsx`, `src/screens/Transactions.jsx`,
  `src/screens/Dashboard.jsx` (own the debounced batch + SuggestionCache keyed
  by visible needs-category id-set; wire onApply to existing categorizeOne;
  mount GraduationOffer). All gated on `useAI().enabled`.
- [x] **Step 8 — tests for the wiring**: mock `useAI().categorize`; assert chips
  render for suggested rows, tap applies via setTransactionsCategory, no chips
  when disabled/low-history/failure, graduation offer after 3 accepts. vitest.
- [x] **Step 9 — verify + docs**: full `pnpm test` + `pnpm build` green; pytest
  green; write `construction/auto-categorize/code/code-summary.md`.

## Story rollup
- US-5 → 1,2,4,6,7 · US-6 → 6,7 · US-7 → 4,5,6,7 · US-8 → 1,4,5
- [x] US-5 · [x] US-6 · [x] US-7 · [x] US-8

## Execution notes
- SDD: one subagent for the service delta (steps 1–3), one for the client
  (steps 4–8), I run the consolidated verification (step 9). Additive edits
  only; no store/actions/sync changes; data-testid on all new interactive els.
- e5-small stays in the `api` CPU container (no separate GPU) — cheapest path
  for U1 (matches NFR "categorize = CPU-only").
