# Code Generation Plan — U2 sms-parse

**Single source of truth for U2 Code Generation.** Implements
`construction/sms-parse/functional-design/`. Stories US-9..US-12. Builds on U0
(ai.js/useAI). Independent of U1.

## Unit context
- Adds client tier-1 parser + LLM tier route `/parse-sms` + paste entry UI.
- WRITES nothing — only PREFILLS via existing `openers.addTx`. No
  store/reducer/sync changes.
- Contract fixed: `modal/schemas.py` ParseSms*, `modal/fixtures/parse-sms.*`.

## Generation steps

### Service
- [x] **Step 1 — `modal/models_llm.py`**: vLLM `Qwen3-4B-Instruct` served with
  guided/structured JSON decoding to the `ParsedSms` schema; loaded from the
  `raqam-ai-models` volume; a pure `parse_sms(text, generate_fn)` that builds the
  prompt + coerces/validates the model JSON to the schema (unread fields omitted;
  junk → `{}`). `generate_fn` injected so pytest uses a fake (no vLLM/GPU).
- [x] **Step 2 — `modal/app.py` + `modal/api.py`**: add the GPU `llm` function
  (L4, max_containers=1, own image with vllm pinned, volume mounted); REPLACE the
  `/parse-sms` 501 stub with a handler that calls `llm.remote(text)` →
  `parse_sms` → `ParseSmsResponse`. (This is the first real GPU function; U4
  reuses it.)
- [x] **Step 3 — `modal/tests/test_parse_sms.py`**: `parse_sms()` unit tests with
  a fake generate_fn (valid JSON → schema; partial JSON → omit; junk → {}); route
  test posting `fixtures/parse-sms.request.json` with the generator monkeypatched
  → asserts `fixtures/parse-sms.response.json`-shaped output. Pytest green, no GPU.

### Client
- [x] **Step 4 — `src/lib/smsParse.js`**: the tier-1 engine — a `BANK_PATTERNS`
  registry (HBL, UBL, MCB, Alfalah, Meezan, Faysal, BankIslami, SCB, JazzCash,
  easypaisa, Raqami) + generic fallback; `parseSmsLocal(text)` (L1/L2, usable =
  amount+direction); `resolveAccount(parsed, S)` (L4 exactly-one last4);
  `toTxSeed(parsed, S)` (L5). Shared field helpers (amount/date/last4/direction).
  PURE, no network.
- [x] **Step 5 — `src/lib/smsParse.test.js`** (+ fast-check): per-bank sample SMS
  → expected ParsedSms; amount/format cases (Rs 5,420.00 → 5420); date formats;
  last4 exactly-one/zero/ambiguous; direction→type; usable threshold; generic
  fallback; `toTxSeed` shape (payWith vs account by type). fast-check property:
  `toTxSeed` amount is always a positive-integer string when parsed.amount>0, and
  never emits a non-today date it didn't parse.
- [x] **Step 6 — `src/ui/ai/PasteSmsEntry.jsx`**: Base UI sheet(phone)/dialog
  (desktop), textarea + Parse, warming state, L6 orchestration (tier-1 → LLM if
  enabled → openers.addTx seed, else notes-fallback). testids per FD.
- [x] **Step 7 — wire the entry point (additive)**: add `openers.pasteSms` and
  surface a "Paste bank SMS" action next to the existing "add transaction"
  triggers (phone add flow + desktop toolbar). Rendered only when
  `useAI().enabled`.
- [x] **Step 8 — wiring test**: mock `useAI` (+ ai.parseSms); tier-1 hit opens a
  prefilled editor without calling the LLM; tier-1 miss + enabled calls
  ai.parseSms then seeds; failure/off → editor with SMS in notes. vitest.
- [x] **Step 9 — verify + docs**: full `pnpm test` + `pnpm build` green; pytest
  green; write `construction/sms-parse/code/code-summary.md`.

## Story rollup
- US-9 → 4,5,6,7 · US-10 → 4,5 · US-11 → 1,2,3,6 · US-12 → 6,8
- [x] US-9 · [x] US-10 · [x] US-11 · [x] US-12

## Execution notes
- SDD: service subagent (1–3), client subagent (4–8), I verify (9).
- First GPU function lands here; tests stay GPU-free via injected generators.
- Additive only; no store/actions/sync changes; data-testid on new interactive
  elements. Openers/entry-point edits are additive (new menu item next to addTx).
