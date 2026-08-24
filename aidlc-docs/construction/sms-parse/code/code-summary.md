# U2 sms-parse — Code Summary

SDD (service + client). Stories US-9..US-12. Regex-first, LLM long-tail,
prefill-only (never writes).

## Service (modal/)
- `models_llm.py` (new) — pure `parse_sms(text, generate_fn)` (prompt + JSON
  coerce to ParsedSms; junk → {}, never raises) + guided-JSON schema + lazy vLLM
  `Qwen3-4B-Instruct` singleton (vllm import inside loader).
- `api.py` (edit) — `/parse-sms` 501 → handler calling the GPU function via
  `modal.Function.from_name("raqam-ai","llm_generate")`; api stays SDK-free.
- `app.py` (edit) — first GPU function `llm_generate` (L4, own vllm image,
  volume + HF cache); U4 /digest reuses it.
- `tests/test_parse_sms.py` (new, 14) + `test_routes.py` edit. pytest **66 passed**.

## Client (src/)
- `lib/smsParse.js` (new, pure) — `BANK_PATTERNS` (11 banks/wallets + generic
  fallback), `parseSmsLocal`, `resolveAccount` (exactly-one last4), `toTxSeed`/
  `seedType`, field helpers (amount int-PKR, direction, merchant, last4, date).
- `ui/ai/pasteSmsFlow.js` (new) — `runPasteSms` L6 orchestration (node-testable).
- `ui/ai/PasteSmsEntry.jsx` (new) — Base UI sheet(phone)/dialog(desktop).
- Edits (additive): `drawers/openers.js` (`pasteSms`), `App.jsx` (held-mount),
  `components/AddTxPill.jsx` (phone "Paste SMS", AI-gated), `screens/Transactions.jsx`
  (desktop toolbar action, AI-gated), `ui/ToolbarAction.jsx` (SmsIcon).
- Tests: `smsParse.test.js` (38, +fast-check), `pasteSms.wiring.test.js` (5).

## Verification
- pytest **66**; client vitest **43**; `pnpm build` green.
- Full suite **103 files / 1492 tests passed**. No store/actions/sync edits;
  paste UI gated on `useAI().enabled`.

## Story rollup
US-9 (paste→prefill) ✓ · US-10 (last4 exactly-one) ✓ · US-11 (LLM long-tail) ✓ ·
US-12 (failure → editor with SMS in notes) ✓.

## Deploy note
`app.py` adds the GPU `llm_generate` (vllm/torch pinned, not deploy-tested);
first `/parse-sms` cold start downloads Qwen3-4B into the volume once.
