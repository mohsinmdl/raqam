# Application Design (Consolidated) — AI Features (Cycle 2)

One-page summary; details in the four sibling documents.

## Shape
- **C1 `modal/`** — the app's first custom backend: one Modal app, FastAPI ASGI
  endpoint, routes `/health` `/categorize` `/parse-sms` `/parse-receipt`
  `/digest`; local Supabase-JWT verification (JWKS cache / HS256 fallback);
  CPU embeddings + L4 LLM + isolated VLM function; stateless, scale-to-zero,
  CORS-restricted. → [components](components-ai-features.md), [methods/contracts](component-methods-ai-features.md)
- **C2 `src/lib/ai.js`** — sole network path to the service (sync.js's sibling):
  env config, token attach, timeout, 401-refresh-retry, typed helpers, AiError.
- **C3 `useAI()`** — `{ enabled, available, warming }` + call wrappers; owns the
  warming timer and the render-nothing-when-off contract.
- **C4–C6 pure builders** — aiSuggest (context/batch/validate/graduation),
  smsParse (per-bank registry, last4 resolve, seed builder), digestData
  (aggregates from existing selectors).
- **C7 thin UI** — chips, paste entry, scan entry, insights card, toggle row —
  all Base UI, all gated on `enabled`.

## Invariants (the design's load-bearing walls)
1. AI never writes: the only mutations are user-confirmed calls to EXISTING
   actions (`setTransactionsCategory`, `upsertPayee`, editor save).
2. Nothing existing depends on anything new (delete-the-AI-layer test).
3. One network path (ai.js); one contract (component-methods, mirrored by
   `modal/schemas.py`); shared JSON fixtures test both sides.
4. Stateless service; aggregates-not-transactions for digest; images in-memory
   only.
5. Every AI edge is severable → app degrades to exactly today's behavior.

## Orchestration
Client-driven request/response only; flows S1–S5 in
[services](services-ai-features.md). Dependency matrix + data-flow diagram in
[dependencies](component-dependency-ai-features.md).

## Completeness check
- FR-0.1–0.8 → C1/C2/C3 + S5 ✓ · FR-1.x → C4/C7 + S1 ✓ · FR-2.x → C5/C7 + S2 ✓
  · FR-3.x → C1(vlm)/C7 + S3 ✓ · FR-4.x → C6/C7 + S4 ✓
- US-1..18 each map to a flow step (S1–S5) and a verify tag; no story lacks a
  component home.
- Security Baseline: auth (C1 auth.py, S5), secrets (Modal Secrets, infra
  design), CORS (C1), no-retention (C1) — compliant at design level.
  Resiliency: disabled. PBT: parser/builder purity (C4/C5/C6) preserves the
  enforced-subset targets.
