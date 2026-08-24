# Infrastructure Design Plan — AI Features (consolidated, U0–U4)

Answers PRE-FILLED with recommendations — edit any you disagree with, then
approve.

Settled by prior gates (not re-asked): provider = Modal.com (the request
itself); compute topology api/llm/vlm with max_containers=1 (NFR tech-stack);
no database/storage of user data (stateless, Q6=A); no messaging/queues (no
async work — every request atomic; category N/A); networking = Modal-provided
HTTPS web endpoint + CORS allowlist, no API gateway needed for a single-tenant
single-endpoint service (category N/A beyond CORS); shared infra = ONE Modal
app shared by all units (units add routes, never apps).

## Execution Checklist

- [x] Generate infrastructure-design.md (Modal app layout, functions, secrets, volume, CORS, rate limit placement)
- [x] Generate deployment-architecture.md (deploy workflow, environments, endpoint wiring to client, smoke verification, operator runsheet)
- [x] Validate against NFR budgets (cost caps, cold-start strategy)

## Questions

## Question 1
Deploy workflow for the Modal service?

A) Manual by you: `modal deploy modal/app.py` from your machine (you hold the Modal credentials — same trust pattern as psql migrations); the repo carries the code + a runsheet, never tokens. CI deploy can be added later if wanted

B) GitHub Actions deploy on merge (needs MODAL_TOKEN_ID/SECRET as repo secrets now)

C) Other (please describe after the answer tag below)

\[Answer]: A

## Question 2
Environments?

A) Single deployed app/endpoint serving BOTH production (raqam.pages.dev) and local dev (localhost:5173) — a personal app doesn't need staging; the default-OFF toggle is the safety layer, and `modal serve` gives an ephemeral hot-reload URL when actively hacking on the service itself

B) Separate dev + prod Modal apps (twice the cold caches, config divergence risk)

C) Other (please describe after the answer tag below)

\[Answer]: A

## Question 3
Model weights storage?

A) Modal Volume (`raqam-ai-models`): weights download once on first container boot, cached for every later cold start — small images, fast iteration on code changes

B) Bake weights into the container images (immutable, but multi-GB images and slow rebuilds on any code change)

C) Other (please describe after the answer tag below)

\[Answer]: A

## Question 4
Monitoring / observability?

A) Modal dashboard only (per-function logs, invocations, spend) + `/health` for the client; structured log lines contain route, status, duration, user-id hash — NEVER request content (NFR no-retention). No third-party observability for a personal app

B) Add external observability (Sentry/Grafana/etc.)

C) Other (please describe after the answer tag below)

\[Answer]: A
