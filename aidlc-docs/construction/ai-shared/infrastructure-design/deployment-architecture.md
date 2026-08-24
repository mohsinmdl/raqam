# Deployment Architecture — AI Features (consolidated)

## Deploy workflow (plan Q1=A — manual by operator)

The repo carries code + this runsheet; you run the deploys (you hold Modal
credentials, mirroring the psql-migration trust pattern).

### One-time setup (operator runsheet, U0)
```bash
pipx install modal            # or: pip install modal
modal setup                   # browser auth into your workspace
# Secret: Supabase JWT config (values from Supabase dashboard → Settings → API)
modal secret create raqam-supabase-jwt \
  SUPABASE_URL=https://<ref>.supabase.co \
  SUPABASE_JWKS_URL=https://<ref>.supabase.co/auth/v1/.well-known/jwks.json \
  SUPABASE_JWT_SECRET=<legacy JWT secret, if the project still uses HS256>
```

### Deploy / update (every unit merge that touches modal/)
```bash
modal deploy modal/app.py     # prints the endpoint URL (stable across deploys)
modal run modal/smoke.py      # smoke: /health 200, anon 401, authed 200
```

### Client wiring
```bash
# .env.local (dev) and Cloudflare Pages env (prod build):
VITE_AI_ENDPOINT=https://<workspace>--raqam-ai-api.modal.run
```
Then enable the in-app "AI features" toggle (per user). Rollback at any layer:
toggle off → env unset (next Pages build) → `modal app stop raqam-ai`.

## Environments (plan Q2=A)
Single deployed app serves prod + local dev. Service-side development uses
`modal serve` (ephemeral URL, hot reload) without touching the deployed app.

## First-boot behavior
First `llm`/`vlm` cold start downloads weights into the `raqam-ai-models`
volume (one-time, minutes); subsequent colds load from volume within budget.
The U0 smoke script warms `api` only; U2/U3 smokes warm their GPU functions.

## Verification per deploy
1. `modal run modal/smoke.py` — health/auth matrix (US-4).
2. Modal dashboard → app `raqam-ai` → three functions listed, volume attached,
   secret mounted.
3. In-app: toggle on → warming state on first call → feature responds.

## Coupling to Pages deploys
None. Client auto-deploys on merge to main (existing GitHub Action); the
service deploys only via this runsheet. A client expecting a route the service
lacks degrades silently (US-3) — deploy order between the two is never
breaking, though service-first is the recommended order per unit.
