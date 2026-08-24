# Build Instructions — AI Features (Cycle 2)

Two independently-built components: the client SPA (Vite) and the Modal service
(Python). The client builds/deploys as before; the service deploys separately.

## Client (React + Vite)

### Prerequisites
- pnpm@10.33.4, Node (repo's existing toolchain)
- Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (existing) + optional
  `VITE_AI_ENDPOINT` (the deployed Modal URL; app works fully without it —
  AI UI stays hidden)

### Build
```bash
pnpm install
pnpm build
```
- **Expected**: `✓ built in ~200–900ms`; output in `dist/`.
- **Acceptable warning**: the pre-existing ">500 kB chunk" advisory (unrelated
  to this cycle).
- Deploy is unchanged (Cloudflare Pages auto-deploys on merge to main). `modal/`
  is Python and is ignored by the Vite build.

## Service (Modal — Python)

### Prerequisites
- Python 3.12 target (image); local dev venv can be 3.12+.
- `modal` CLI + a Modal account (operator only). Dev deps:
  `modal/requirements-dev.txt` (fastapi, pydantic, pyjwt[crypto], httpx,
  python-multipart, pytest) — heavy ML libs (vllm/torch/sentence-transformers)
  are NOT needed locally; they live only in the deployed images.

### Local check (no Modal account, no GPU)
```bash
python -m venv modal/.venv
modal/.venv/bin/pip install -r modal/requirements-dev.txt
modal/.venv/bin/python -m pytest modal/tests -q
```

### Deploy (operator — see infrastructure deployment-architecture.md / modal/README.md)
```bash
modal setup
modal secret create raqam-supabase-jwt SUPABASE_URL=... SUPABASE_JWKS_URL=... [SUPABASE_JWT_SECRET=...]
modal deploy modal/app.py           # prints the endpoint URL
modal run modal/smoke.py            # live PASS/FAIL matrix
# then set VITE_AI_ENDPOINT in the client build env + enable the in-app toggle
```
- First `/categorize`·`/parse-sms`·`/parse-receipt` cold start downloads its
  model into the `raqam-ai-models` volume once (minutes); later colds load from
  the volume within the NFR budget.

## Troubleshooting
- **Client build fails on an AI import**: AI modules import only supabase.js +
  dates/selectors; ensure no accidental fixture/test import leaked into a
  non-test module (`ai.js`/`smsParse.js`/`digestData.js` must import no
  `modal/fixtures`).
- **pytest can't import `modal.api`**: a heavy import (vllm/torch/modal SDK)
  leaked to module top-level — all are lazy-by-design (inside loaders /
  call-time). Keep them there.
- **`python-multipart` missing**: required by FastAPI `UploadFile`
  (`/parse-receipt`); it's in `requirements-dev.txt` and the api image.
