# U3 receipt-scan — Code Summary

SDD (service + client). No FD (composes U1 contract + U2 seed path). Stories
US-13..US-15. Prefill-only; image in-memory; never stored.

## Service (modal/)
- `models_vlm.py` (new) — pure `parse_receipt(image_bytes, generate_fn)` → {merchant,
  date, total} (junk → {}, never raises) + guided-JSON schema + lazy vLLM
  `Qwen2.5-VL-7B-Instruct` singleton (vision imports inside loader).
- `app.py` (edit) — ISOLATED `vlm` GPU function (own image vllm+qwen-vl-utils+
  Pillow, L4, volume) — never loads on /categorize·/parse-sms·/digest.
- `api.py` (edit) — `/parse-receipt` 501 → multipart handler (in-memory read,
  8 MB cap → 413) via modal.Function.from_name; api stays SDK-free.
- `tests/test_parse_receipt.py` (new, 18 incl no-persistence proofs) +
  test_routes.py + requirements-dev (python-multipart). pytest **83 passed**.

## Client (src/)
- `lib/receiptSeed.js` (new, pure) — `toReceiptSeed`/`isUsableReceipt`.
- `ui/ai/receiptScanFlow.js` (new, node-testable) — runReceiptScan (VLM → seed →
  optional inline-validated category folded before open → openers.addTx;
  failure → empty editor + quiet notice).
- `ui/ai/ReceiptScanEntry.jsx` (new) — Base UI sheet/dialog, hidden file input
  (`capture=environment` on phone), warming state.
- Edits (additive): openers.scanReceipt, App held-mount, AddTxPill (phone) +
  Transactions toolbar (desktop) "Scan receipt" (AI-gated), ToolbarAction CameraIcon.
- Tests: receiptSeed.test.js (5) + receiptScan.wiring.test.js (8).

## Verification
- pytest **83**; client vitest **13**; `pnpm build` green.
- Full suite **105 files / 1505 tests passed**. No store/actions/sync edits.

## Story rollup
US-13 (scan→prefill) ✓ · US-14 (category prefill, seed-before-open, inline
validated) ✓ · US-15 (failure→empty+notice; image in-memory, no persistence —
proven by service tests) ✓.

## Deploy note
`app.py` adds the isolated `vlm` GPU function (vllm/torch/qwen-vl-utils/Pillow
pinned, not deploy-tested); first /parse-receipt cold start downloads
Qwen2.5-VL-7B into the volume once.
