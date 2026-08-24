# NFR Requirements Plan — AI Features (consolidated, U0–U4)

Answers PRE-FILLED with recommendations — edit any you disagree with, then
approve.

Already fixed at Requirements (not re-asked): self-hosted models only (Q3=A),
JWT auth (Q4=A), stateless/no-retention (Q6=A), scale-to-zero + warming UX
(Q11=A), opt-in + silent degradation (Q12=A), latency budgets (NFR-4), cost
target < $10/month (NFR-3), Security Baseline enforced / PBT partial (Q13=A).

## Execution Checklist

- [x] Generate nfr-requirements.md (consolidated; per-route budgets + security + reliability)
- [x] Generate tech-stack-decisions.md (models, serving, Python stack, GPU classes, rationale)
- [x] Validate choices against the $30 credit and latency budgets

## Questions

## Question 1
Embedding model for `/categorize` (CPU route)?

A) `intfloat/multilingual-e5-small` — ~118M params, strong multilingual retrieval; Pakistani merchant strings mix English + Urdu transliteration ("KHAADI", "Cheezious", "METRO CASH CARRY"); runs fast on CPU, tiny cold start

B) `BAAI/bge-small-en-v1.5` — English-only, marginally better on pure-English text

C) Other (please describe after the answer tag below)

\[Answer]: A

## Question 2
Instruct LLM for `/parse-sms` + `/digest`, and how it's served?

A) `Qwen/Qwen3-4B-Instruct` served with vLLM on an L4 GPU (24 GB), using guided/structured JSON output (schema-constrained decoding) so parse responses are ALWAYS valid JSON — no prompt-and-pray parsing. ~$0.80/hr billed per second, scale-to-zero

B) Larger 7–8B model (better prose for digest, slower cold start, more VRAM headroom risk with vLLM overhead)

C) Other (please describe after the answer tag below)

\[Answer]: A

## Question 3
Vision model for `/parse-receipt`?

A) `Qwen/Qwen2.5-VL-7B-Instruct` on its own L4 f`text`unction (bf16 fits 24 GB; isolated image so other routes never pay its load); structured JSON output for {merchant, date, total}

B) Smaller VLM (Qwen2.5-VL-3B) — cheaper/faster, weaker on crumpled/low-light receipts

C) Other (please describe after the answer tag below)

\[Answer]: A

## Question 4
Python service stack + dependency policy?`text`

A) FastAPI + Pydantic v2 (schemas), PyJWT[crypto] (JWKS + HS256 verify), pytest + httpx TestClient; all versions PINNED in the Modal image definition (modal images are code — reproducible builds, no lockfile needed); Modal Secrets for the Supabase JWT config

B) Different framework/policy (describe)

C) Other (please describe after the answer tag below)

\[Answer]: A
