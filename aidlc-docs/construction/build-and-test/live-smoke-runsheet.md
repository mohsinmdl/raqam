# Live-Endpoint Smoke Runsheet — AI Features (Cycle 2)

The 4 `live`-tagged stories (US-4, US-11, US-13, US-15) need the deployed Modal
endpoint — like cycle 1's apply-time DB proofs. Run this once after
`modal deploy`. Everything else (14/18 stories) is already proven by
unit+mock tests offline.

## Pre-req
`modal deploy modal/app.py` done; a valid Supabase session token available
(copy `access_token` from the app's session, or a test user's).

## A. Endpoint + auth matrix (US-4) — automated
```bash
RAQAM_AI_ENDPOINT=<url> RAQAM_AI_TEST_TOKEN=<jwt> modal run modal/smoke.py
```
Expect the matrix: `/health` 200 · anon feature route 401 · garbage token 401 ·
authed route 200 (routes now implemented) · rate-limit 429. **PASS = all green.**

## B. SMS LLM long-tail (US-11) — manual
1. App → enable AI → "Paste bank SMS".
2. Paste a REAL SMS from a bank NOT in the tier-1 registry (or a mangled one).
3. Expect: brief "reading…" → the editor opens prefilled (amount/date/merchant
   as the model read them). Fields it couldn't read are blank; date defaults to
   today. **PASS = a sensible prefill from an unlisted-format message.**
4. Negative: paste an OTP/promo → editor opens with the text in notes (US-12).

## C. Receipt scan (US-13) — manual
1. "Scan receipt" → photograph/upload a receipt.
2. Expect: "reading receipt…" → editor prefilled with merchant/date/total (+ a
   category suggestion if enough history). **PASS = correct total + merchant.**

## D. Receipt privacy/failure (US-15) — manual + inspect
1. Upload a blurry/non-receipt image → editor opens empty + a quiet notice; app
   never blocks. **PASS.**
2. Inspect: Modal dashboard logs show the request with NO image bytes/body;
   `modal volume ls raqam-ai-models` shows only model weights, no uploaded
   images. **PASS = no receipt persisted anywhere.**

## Record results
Log the A–D outcomes (and the smoke matrix) in `audit.md` under an
"Operations — live smoke" entry when run, mirroring cycle 1's DB-proof logging.
Until run, these 4 stories are **code-complete, live-proof pending** (non-blocking
for merge; blocking for calling the AI features "verified in production").
