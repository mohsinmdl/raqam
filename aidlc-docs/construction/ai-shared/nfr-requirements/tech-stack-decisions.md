# Tech Stack Decisions — AI Features (consolidated)

All choices from the approved plan (Q1–Q4 = A).

## Models

| Role | Model | Runtime | Hardware | Rationale |
| --- | --- | --- | --- | --- |
| Embeddings (/categorize) | `intfloat/multilingual-e5-small` | sentence-transformers, CPU | CPU container | Multilingual (English + Urdu-transliterated merchants), ~118M params, fast CPU inference, tiny cold start |
| Instruct LLM (/parse-sms, /digest) | `Qwen/Qwen3-4B-Instruct` | vLLM with guided/structured JSON decoding | 1× L4 (24 GB) | Small enough for fast L4 cold starts; guided decoding guarantees schema-valid JSON |
| VLM (/parse-receipt) | `Qwen/Qwen2.5-VL-7B-Instruct` | vLLM (multimodal), guided JSON | 1× L4, OWN function + image | bf16 fits 24 GB; isolation keeps its weight out of every other route |

Weights cached in a Modal Volume (or image-baked snapshot) so cold start pays
load-from-disk, not download.

## Service stack (versions pinned in `modal/app.py` image definition)

- Python 3.12 (Modal base image)
- `modal` (SDK, latest at codegen; pinned)
- `fastapi` + `pydantic` v2 — routes + contract schemas
- `PyJWT[crypto]` — JWKS (ES/RS) + HS256 legacy verification
- `sentence-transformers` — embeddings
- `vllm` — LLM/VLM serving inside the GPU functions
- `pytest`, `httpx` — tests (TestClient against the FastAPI app, models faked)

Pinning policy: exact versions in the image build (`.pip_install("fastapi==…")`)
— the image definition is the lockfile; upgrades are deliberate diffs.

## Client stack (no new dependencies)

- `src/lib/ai.js` — plain fetch + AbortController timeouts; no HTTP library
- UI on existing Base UI primitives; no new npm packages (bundle unchanged
  until a feature surface mounts)

## Function topology (cost/latency mapping)

| Modal function | Contents | Class | max_containers |
| --- | --- | --- | --- |
| `api` | FastAPI ASGI: auth, routing, /health, /categorize (embeddings in-process) | CPU (2 vCPU) | 1 |
| `llm` | vLLM Qwen3-4B; called via `.remote()` from api for /parse-sms, /digest | L4 | 1 |
| `vlm` | vLLM Qwen2.5-VL-7B; called via `.remote()` for /parse-receipt | L4 | 1 |

## Rejected alternatives (for the record)

- Hosted frontier APIs — rejected at Requirements (privacy, Q3=A).
- bge-small-en (English-only) — merchant text is not reliably English.
- 7–8B text LLM — no quality need demonstrated for parse/digest; slower colds.
- Ollama/llama.cpp serving — vLLM's guided JSON + throughput fits better.
- supabase.auth.get_user() per request — latency + dependency (design Q5=A).
