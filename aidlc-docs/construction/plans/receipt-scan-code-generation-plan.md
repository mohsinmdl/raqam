# Code Generation Plan — U3 receipt-scan

**Single source of truth for U3 Code Generation.** No separate Functional
Design (execution plan): U3 composes U1's suggestion contract + U2's
seed-builder path. Stories US-13..US-15. Builds on U0 (ai.js `parseReceipt`).

## Unit context / design-in-brief
- Snap/pick a receipt image → `/parse-receipt` (VLM) extracts `{merchant, date,
  total}` → PREFILL the existing add-transaction editor (single tx, no line
  items — v1). Optionally chain `ai.categorize` for a category prefill (US-14),
  non-blocking. Failure → empty editor + quiet notice (US-15). Image processed
  in-memory only; never stored on Modal or Supabase (US-15 privacy).
- WRITES nothing (prefill only). No store/actions/sync changes.
- Contract fixed: `modal/schemas.py` ParseReceiptResponse (multipart request),
  `modal/fixtures/parse-receipt.response.json`.
- Reuse: U2's `toTxSeed`-style mapping (a receipt is `direction:'debit'` →
  expense; total→amount; merchant/date), U1's `ai.categorize` for the optional
  category suggestion.

## Generation steps

### Service
- [x] **Step 1 — `modal/models_vlm.py`**: pure `parse_receipt(image_bytes,
  generate_fn) -> dict` (ParseReceipt shape: merchant/date/total; unread → omit;
  junk → {}, never raises), guided-JSON schema, + lazy vLLM
  `Qwen2.5-VL-7B-Instruct` singleton (import inside loader). `generate_fn(image)`
  injected → pytest uses a fake (no GPU/model).
- [x] **Step 2 — `modal/app.py` + `modal/api.py`**: add the isolated GPU `vlm`
  function (L4, own image with vllm+vision deps, volume mounted, max_containers=1
  — SEPARATE from `llm` so its weight never loads on other routes); replace
  `/parse-receipt` 501 with a handler accepting `multipart/form-data` `image`
  (size cap 8 MB → 413), calling the `vlm` function, returning
  `ParseReceiptResponse`. api stays SDK-free (Function.from_name, like U2).
- [x] **Step 3 — `modal/tests/test_parse_receipt.py`**: `parse_receipt()` unit
  tests with a fake generator (valid → fields; partial → omit; junk → {}); route
  test posting a tiny fake image (monkeypatched vlm) → `parse-receipt.response`
  shape; oversize → 413; anon → 401. No GPU/model.

### Client
- [x] **Step 4 — `src/lib/receiptSeed.js`**: pure `toReceiptSeed(parsed, S)` →
  AddTxSeed (type expense, amount=String(total), date=parsed.date||todayStr(),
  merchant=parsed.merchant||''); tiny — reuses the U2 seed conventions. (Kept
  separate from smsParse for clarity; may re-export shared helpers.)
- [x] **Step 5 — `src/lib/receiptSeed.test.js`**: seed shape, missing-field
  defaults (no total → amount ''? or omit — spec: omit amount if no total so the
  editor requires it), date fallback, fixture lockstep.
- [x] **Step 6 — `src/ui/ai/ReceiptScanEntry.jsx`** + `receiptScanFlow.js`
  (node-testable): entry = camera capture (`<input type=file accept=image/*
  capture>` on phone) / file picker (desktop). On pick → warming state →
  `ai.parseReceipt(file)`; parsed → open editor via `openers.addTx` seed, then
  (non-blocking) `ai.categorize([thatTx], buildContext)` to fill the category if
  US-14 context available; failure → `openers.addTx('expense', {})` + quiet
  notice (US-15). testids.
- [x] **Step 7 — wire entry (additive)**: `openers.scanReceipt`; a "Scan receipt"
  action next to the U2 "Paste SMS" action (AddTxPill phone + Transactions
  toolbar desktop), AI-gated. Held-mount the entry like PasteSmsEntry.
- [x] **Step 8 — wiring test**: mock `useAI` (+ parseReceipt/categorize); parsed
  → seeded editor; category suggestion fills when context present; parse failure
  → empty editor + notice; nothing rendered when AI off. vitest.
- [x] **Step 9 — verify + docs**: full `pnpm test` + `pnpm build` green; pytest
  green; write `construction/receipt-scan/code/code-summary.md`.

## Story rollup
- US-13 → 1,2,3,4,6,7 · US-14 → 6 · US-15 → 2,6,8 (+ no-persistence: assert the
  handler never writes image bytes to volume/storage — code-inspectable)
- [x] US-13 · [x] US-14 · [x] US-15

## Execution notes
- SDD: service subagent (1–3), client subagent (4–8), I verify (9).
- The `vlm` function is ISOLATED (own image/function) so /categorize, /parse-sms,
  /digest never pay its load (NFR cost). Tests inject fakes → no GPU.
- Additive only; no store/actions/sync changes; data-testid on new els. Image
  handled in-memory; no storage APIs touched anywhere.
