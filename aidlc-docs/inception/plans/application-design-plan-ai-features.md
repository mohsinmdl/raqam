# Application Design Plan — AI Features (Cycle 2)

Answers PRE-FILLED with recommendations — edit any you disagree with, then
approve the plan.

## Execution Checklist

- [x] Generate components-ai-features.md (component definitions + responsibilities)
- [x] Generate component-methods-ai-features.md (method/route signatures, I/O types)
- [x] Generate services-ai-features.md (orchestration: who calls what, when)
- [x] Generate component-dependency-ai-features.md (dependency matrix + data flow)
- [x] Generate application-design-ai-features.md (consolidated doc)
- [x] Validate completeness against FR-0..FR-4 and US-1..US-18

## Questions

## Question 1
Where does the Modal service live?

A) In this repo, top-level `modal/` directory (Python package; deployed with `modal deploy modal/app.py`). One history, docs colocated, atomic client+service PRs; Cloudflare Pages build ignores it

B) A separate repository (independent lifecycle, but cross-repo coordination for every contract change)

C) Other (please describe after the answer tag below)

\[Answer]: A

## Question 2
Client-side AI layer shape?

A) Two pieces: `src/lib/ai.js` — pure module owning endpoint config, JWT attach, timeout, 401-refresh-retry, and typed per-route helpers (mirrors sync.js's style; unit-testable, no React) — plus one small hook `src/ui/ai/useAI.js` exposing { enabled, available, warming } and the call wrappers to components

B) One React hook owning everything (simpler file count, but network logic becomes untestable outside React)

C) Other (please describe after the answer tag below)

\[Answer]: A

## Question 3
API contract style for the four routes?

A) Plain JSON request/response shapes (documented per route in component-methods), `/health` returns { ok, version }; the client module is the single caller and owns compatibility — no envelope/versioning ceremony

B) Versioned envelope on every payload ({ v: 1, data: ... })

C) Other (please describe after the answer tag below)

\[Answer]: A

## Question 4
Suggestion requests (U1): call pattern?

A) Batched: one debounced request carries ALL visible needs-category transactions (+ shared context once); response maps txId → suggestions. One cold start amortized across the whole backlog

B) Per-transaction requests (simpler, N× the calls and cost)

C) Other (please describe after the answer tag below)

\[Answer]: A

## Question 5
How does the service verify Supabase JWTs?

A) Local verification, no per-request network: verify signature + expiry against the project's JWT signing config (JWKS public keys fetched & cached at container start; HS256 legacy secret via Modal Secret as fallback). Exact mechanism pinned in Infrastructure Design

B) Call Supabase's auth API (get_user) on every request — simpler but adds a network hop, latency, and a runtime dependency to every AI call

C) Other (please describe after the answer tag below)

\[Answer]: A
