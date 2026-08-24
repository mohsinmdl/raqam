# Code Generation Plan — U4 insights-digest

**Single source of truth for U4 Code Generation.** Final unit. No separate
Functional Design (execution plan): thin aggregate-assembly over EXISTING report
selectors + reuse of U2's `llm_generate` GPU function. Stories US-16..US-18.
Builds on U0 (ai.js `digest`). Independent of U1/U2/U3.

## Unit context / design-in-brief
- A "Generate insights" action on the Reflect Overview tab. The CLIENT computes
  ALL figures via existing selectors; the request to `/digest` carries only
  aggregates (no raw transactions). The LLM returns headline + observations;
  every FIGURE shown in the UI is rendered from the client's own computed data
  (the narrative text references those numbers but the app never displays a
  model-emitted number as authoritative). Ephemeral (not stored/synced).
  Failure → Overview renders exactly as today + a quiet retry (US-18).
- WRITES nothing. No store/actions/sync changes. Reuses the GPU `llm_generate`
  (no new GPU function).
- Contract fixed: `modal/schemas.py` DigestRequest/Response,
  `modal/fixtures/digest.request.json` / `digest.response.json`.

## Generation steps

### Service
- [x] **Step 1 — `modal/digest.py`** (or extend `models_llm.py`): pure
  `narrate(aggregates, generate_fn) -> {headline, observations[]}`. Prompt is
  strictly instructed to use ONLY the numbers present in the request and to
  invent none; guided-JSON to the DigestResponse schema. `generate_fn` injected
  (fake in tests). Reuses the SAME `llm_generate` GPU function as /parse-sms.
- [x] **Step 2 — `modal/api.py`**: replace the `/digest` 501 with a handler
  validating `DigestRequest`, calling `narrate(payload, llm_generate)`, returning
  `DigestResponse`. No new GPU function; api stays SDK-free.
- [x] **Step 3 — `modal/tests/test_digest.py`**: `narrate()` unit tests with a
  fake generator (valid → headline+observations; junk → safe empty/`{}`
  handling); route test posting `fixtures/digest.request.json` (monkeypatched)
  → `digest.response` shape; anon → 401. No GPU.

### Client
- [x] **Step 4 — `src/lib/digestData.js`**: pure `buildDigestPayload(S, month)`
  assembling the DigestRequest ENTIRELY from existing selectors
  (`reports.spendingStats`/`spendingByCategory`/`incomeExpenseSeries` and/or
  `spendingReport.breakdownStats`/`breakdownByCategory` — pick what matches the
  Overview's own data). No raw transactions in the payload (only aggregates;
  merchant names appear only inside `largestOutflow` as the selectors already
  expose). Returns the exact wire shape (fixture lockstep).
- [x] **Step 5 — `src/lib/digestData.test.js`**: payload shape == fixture; no
  transaction array present; figures match the selector outputs; empty-month
  handled (few/no txs → a minimal but valid payload or a "not enough data" guard).
- [x] **Step 6 — `src/ui/ai/InsightsCard.jsx`**: a section on the Reflect
  Overview tab. States: idle (a "Generate insights" button,
  `data-testid="generate-insights"`), warming/loading, done (headline +
  observations rendered; any figures displayed come from the client payload, not
  model text), error (quiet retry). Gated on `useAI().enabled`. Ephemeral (local
  component state; regenerate replaces; unmount/reload clears — US-17).
- [x] **Step 7 — wire into Reflect Overview (additive)**: mount `InsightsCard` on
  the Overview/Dashboard index tab of Reflect, only when `useAI().enabled`. Do
  not alter the existing Overview content/layout beyond adding the card.
- [x] **Step 8 — wiring test**: mock `useAI().digest`; button → renders
  headline/observations; failure → card shows retry, rest of Overview intact;
  regenerate replaces; nothing rendered when AI off. vitest.
- [x] **Step 9 — verify + docs**: full `pnpm test` + `pnpm build` green; pytest
  green; write `construction/insights-digest/code/code-summary.md`.

## Story rollup
- US-16 → 1,2,3,4,6,7 · US-17 → 6 · US-18 → 6,8
- [x] US-16 · [x] US-17 · [x] US-18

## Execution notes
- SDD: service subagent (1–3), client subagent (4–8), I verify (9).
- Reuses `llm_generate` — no new GPU function/image.
- Additive only; no store/actions/sync changes; figures always client-computed
  (FR-4.3); data-testid on new interactive elements.
