# U1 auto-categorize — Code Summary

SDD (service + client streams). Stories US-5..US-8. Embeddings-only kNN, no LLM.

## Service (modal/)
- `embed.py` (new) — pure `rank(request, embed_fn)` (L4: e5 prefixes, hard type
  filter, k=10 summed-sim vote, floors 0.80/0.60/0.25, ≤2, confidence=share,
  BR-U1-9 id restriction) + lazy `multilingual-e5-small` singleton (model import
  inside the loader → api stays model-free).
- `api.py` (edit) — `/categorize` 501 → real handler (CPU `api` function).
- `app.py` (edit) — pinned torch/transformers/sentence-transformers on the api
  image; `raqam-ai-models` volume mounted + HF cache env.
- `tests/test_categorize.py` (new, 12) + `test_routes.py` (edit: /categorize off
  the 501 list). pytest **52 passed** (no model download; fake embedder).

## Client (src/)
- `lib/aiSuggest.js` (new, pure) — tunable consts (30/200/10/0.80/0.60/0.25),
  normMerchant, buildContext (30-guard, 200-window), collectTargets (excludes
  rule'd payees), validateSuggestions (US-8), recordAccept/dismissRule
  (graduation).
- `ui/ai/SuggestionChips.jsx`, `ui/ai/GraduationOffer.jsx`, `ui/ai/useSuggestions.js`
  (debounced 800ms batch + SuggestionCache keyed by visible needs-category set,
  failure-silence) — all new.
- Edits (additive): `ui/TxChips.jsx` (NeedsCategoryPill optional suggestions —
  byte-identical when absent), `components/TxPhoneList.jsx`, `screens/Transactions.jsx`,
  `screens/Dashboard.jsx`.
- Tests: `aiSuggest.test.js` (23, +fast-check), `suggestions.wiring.test.jsx` (11).

## prefs (no store/sync changes)
`aiAcceptCounts` + `aiRuleDismissed` ride the existing per-user `setPrefs`
fall-through (like `aiEnabled`).

## Verification
- pytest **52 passed**; client vitest **34 passed**; `pnpm build` green.
- Full worktree suite **101 files / 1449 tests passed**. No store/actions/sync
  edits; all AI UI gated on `useAI().enabled`.

## Story rollup
US-5 (chips + guard) ✓ · US-6 (tap-apply via setTransactionsCategory) ✓ ·
US-7 (3rd-accept graduation → upsertPayee) ✓ · US-8 (ephemeral, id-validated) ✓.

## Deploy note
`app.py` adds torch/transformers/sentence-transformers (pinned, not yet
deploy-tested) — validate at `modal deploy` time; first `/categorize` cold start
downloads e5-small into the volume once.
