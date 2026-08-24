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
        # Multipart form parsing for the /parse-receipt image upload (U3).
        "python-multipart==0.0.20",
        # e5-small embedder for /categorize (CPU). Pinned = lockfile.
        "torch==2.5.1",
        "transformers==4.46.3",
        "sentence-transformers==3.3.1",
    )
    .env(_MODEL_ENV)
    # Ship the pure-Python service modules into the container. ``models_llm`` is
    # included for U2: the /parse-sms route runs its pure ``parse_sms`` on the api
    # container (its vllm import is lazy, so the api image needs NO vllm/torch).
    # ``models_vlm`` is included for U3 the same way: the /parse-receipt route runs
    # its pure ``parse_receipt`` on the api container; its vllm/vision imports are
    # lazy so the api image needs NO vllm/torch/vision deps.
    .add_local_python_source(
        "api", "auth", "embed", "models_llm", "models_vlm", "schemas"
    )
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
# GPU llm function (U2) — the FIRST real GPU function. Serves
# Qwen/Qwen3-4B-Instruct via vLLM with GUIDED (structured) JSON decoding, on its
# OWN image (vllm + torch pinned) so the CPU api image stays lean. Weights are
# cached on the shared `raqam-ai-models` volume (HF cache env via _MODEL_ENV, the
# same one U1 set for `api`). max_containers=1 caps GPU cost; L4 fits a 4B model.
#
# `llm_generate(prompt) -> str` runs the guided-JSON generation and is called via
# `.remote()` from the /parse-sms route (api.py → models_llm.parse_sms). U4
# (/digest) reuses this same function.
# --------------------------------------------------------------------------- #
llm_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        # vLLM pulls its own matching CUDA torch build; torch pinned alongside so
        # the pair is an explicit, reproducible lockfile diff. GPU-only deps.
        "vllm==0.11.0",
        "torch==2.8.0",
    )
    .env(_MODEL_ENV)
    # Only the pure model module is needed in the GPU container (it holds the
    # prompt, the guided-JSON schema, and the lazy vLLM generator).
    .add_local_python_source("models_llm")
)


@app.function(
    image=llm_image,
    gpu="L4",
    volumes={MODELS_DIR: models_volume},
    max_containers=1,
    timeout=600,
)
def llm_generate(prompt: str) -> str:
    # Imported inside the container (where the image provides vllm + source).
    from models_llm import generate

    return generate(prompt)


# --------------------------------------------------------------------------- #
# GPU vlm function (U3) — the ISOLATED VLM GPU function. Serves
# Qwen/Qwen2.5-VL-7B-Instruct via vLLM (multimodal) with GUIDED (structured) JSON
# decoding, on its OWN image (vllm + torch + vision deps pinned) so its 7B VL
# weights NEVER load on /categorize, /parse-sms, or /digest — those routes never
# touch this function (NFR cost isolation). SEPARATE from `llm_generate`: its own
# image, its own container. Weights are cached on the shared `raqam-ai-models`
# volume (HF cache env via _MODEL_ENV, same as `api`/`llm`). max_containers=1 caps
# GPU cost; L4 fits the 7B VL model.
#
# `vlm_generate(image_bytes) -> str` runs the guided-JSON generation on the
# in-memory image bytes and is called via `.remote()` from the /parse-receipt
# route (api.py → models_vlm.parse_receipt). The image bytes are held in memory
# only — never written to disk, the volume, or any storage (US-15 privacy).
# --------------------------------------------------------------------------- #
vlm_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        # vLLM pulls its own matching CUDA torch build; torch pinned alongside so
        # the pair is an explicit, reproducible lockfile diff. The Qwen2.5-VL
        # processor needs qwen-vl-utils + Pillow for image handling. GPU-only deps.
        "vllm==0.11.0",
        "torch==2.8.0",
        "qwen-vl-utils==0.0.11",
        "Pillow==11.0.0",
    )
    .env(_MODEL_ENV)
    # Only the pure VL model module is needed in the GPU container (it holds the
    # prompt, the guided-JSON schema, and the lazy multimodal vLLM generator).
    .add_local_python_source("models_vlm")
)


@app.function(
    image=vlm_image,
    gpu="L4",
    volumes={MODELS_DIR: models_volume},
    max_containers=1,
    timeout=600,
)
def vlm_generate(image_bytes: bytes) -> str:
    # Imported inside the container (where the image provides vllm + vision + source).
    from models_vlm import generate

    return generate(image_bytes)
