"""Modal wiring for the ``raqam-ai`` service.

This is the ONLY module that imports the Modal SDK. It is never imported by
pytest — it runs under ``modal deploy modal/app.py`` / ``modal serve`` /
``modal run``. Deploy from the repo root:

    modal deploy modal/app.py     # prints the stable endpoint URL

The image's pinned ``pip_install`` list is the service lockfile — bumping a
version is a deliberate diff, not a drift. U0 ships ONLY the CPU ``api``
function; the GPU ``llm`` / ``vlm`` functions are added by U2 / U3.
"""

import modal

app = modal.App("raqam-ai")

# --------------------------------------------------------------------------- #
# Image — pinned versions ARE the lockfile. U1 adds sentence-transformers (+ its
# torch/transformers deps) here because /categorize runs embeddings-only kNN on
# the CPU api container (multilingual-e5-small is small + CPU-friendly — NO GPU
# function for U1). U2/U3 add vllm to their OWN GPU images.
# --------------------------------------------------------------------------- #
# Weights live on the mounted volume; point every HF/sentence-transformers cache
# at it so the first cold start downloads once and later colds read from disk.
MODELS_DIR = "/models"
_MODEL_ENV = {
    "RAQAM_MODELS_DIR": MODELS_DIR,
    "HF_HOME": MODELS_DIR,
    "HF_HUB_CACHE": f"{MODELS_DIR}/hub",
    "SENTENCE_TRANSFORMERS_HOME": MODELS_DIR,
}

api_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "fastapi==0.141.1",
        "pydantic==2.13.4",
        "pyjwt[crypto]==2.13.0",
        "httpx==0.28.1",
        # e5-small embedder for /categorize (CPU). Pinned = lockfile.
        "torch==2.5.1",
        "transformers==4.46.3",
        "sentence-transformers==3.3.1",
    )
    .env(_MODEL_ENV)
    # Ship the pure-Python service modules into the container.
    .add_local_python_source("api", "auth", "embed", "schemas")
)

# --------------------------------------------------------------------------- #
# Shared resources (declared now; GPU functions in U2/U3 reuse the volume).
# --------------------------------------------------------------------------- #
# HF weights cache — the U1 CPU api function downloads e5-small into it on first
# cold start; later colds (and U2/U3 GPU functions) read from disk.
models_volume = modal.Volume.from_name("raqam-ai-models", create_if_missing=True)

# Supabase JWT config: SUPABASE_JWKS_URL and/or SUPABASE_JWT_SECRET, SUPABASE_URL.
jwt_secret = modal.Secret.from_name("raqam-supabase-jwt")


# --------------------------------------------------------------------------- #
# CPU api function — serves the FastAPI ASGI app (auth, CORS, rate limit,
# /health, and the four feature routes). max_containers=1 keeps the in-process
# rate-limit bucket globally correct and caps cost.
# --------------------------------------------------------------------------- #
@app.function(
    image=api_image,
    secrets=[jwt_secret],
    volumes={MODELS_DIR: models_volume},
    max_containers=1,
    cpu=2.0,
    memory=2048,
)
@modal.asgi_app()
def api():
    # Imported inside the container (where the image provides the deps + source).
    from api import app as fastapi_app

    return fastapi_app


# --------------------------------------------------------------------------- #
# GPU functions are intentionally NOT defined in U0:
#   * llm  — vLLM Qwen3-4B-Instruct (L4, max_containers=1) → /parse-sms, /digest
#            added by U2.
#   * vlm  — vLLM Qwen2.5-VL-7B-Instruct (L4, own image)   → /parse-receipt
#            added by U3.
# They mount `models_volume` and are called via `.remote()` from the api routes.
# --------------------------------------------------------------------------- #
