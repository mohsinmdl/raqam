# U4 insights-digest — Code Summary

SDD (service + client). Final unit. No FD (aggregate-assembly + reuse of U2's
GPU function). Stories US-16..US-18.

## Service (modal/)
- `digest.py` (new) — pure `narrate(aggregates, generate_fn)` → {headline,
  observations[]}; prompt forbids inventing figures (FR-4.3); tolerant parse;
  malformed → safe {"headline":"","observations":[]}. `DIGEST_JSON_SCHEMA`.
- `api.py` (edit) — `/digest` 501 → handler; NO new GPU function.
- `app.py` (edit) — `digest` added to the `api` + `llm` image sources.
- **Cross-unit fix (orchestrator)**: the shared `llm_generate` was hard-guided
  to the SMS schema, so a reused-as-is `/digest` would emit SMS-shaped JSON →
  empty digest at deploy time. Parameterized `models_llm.generate(prompt,
  schema, max_tokens)` + the GPU `llm_generate(prompt, schema, max_tokens)`;
  added `api.llm_generate_digest` shim binding the digest schema (512 tokens).
  One model, one container, correct per-route guidance — still no 2nd GPU
  function. SMS path + its 1-arg test fakes unchanged; digest-path fakes
  retargeted to `llm_generate_digest`.
- `tests/test_digest.py` (new, 19) + test_routes/test_auth/test_parse_receipt +
  smoke updated. pytest **101 passed**.

## Client (src/)
- `lib/digestData.js` (new, pure) — `buildDigestPayload(S, month)` from existing
  selectors (spendingStats/spendingByCategory/incomeExpenseSeries); aggregates
  only, NO raw transactions; `hasEnoughData`.
- `ui/ai/insightsFlow.js` (new, node-testable) — `runDigest`.
- `ui/ai/InsightsCard.jsx` (new) — Reflect Overview card; idle/loading/done/error
  states; displayed figures render from the client payload, never model text
  (FR-4.3); ephemeral local state (US-17); AI-gated.
- Edit (additive): `screens/Dashboard.jsx` (the Reflect /reflect Overview index)
  mounts `<InsightsCard/>`.
- Tests: digestData.test.js (7) + insights.wiring.test.jsx (8).

## Verification
- pytest **101**; client vitest **15**; `pnpm build` green.
- Full suite **105 files / 1520 tests passed**. No store/actions/sync edits.

## Story rollup
US-16 (on-demand, client-computed) ✓ · US-17 (ephemeral) ✓ · US-18 (failure →
Overview intact + retry) ✓.

## Deploy note
No new GPU function; `/digest` shares U2's `llm_generate` (now schema-guided per
route). First /digest cold start reuses the already-downloaded Qwen3-4B.
