"""U1 auto-categorize ranking — embeddings-only kNN, NO LLM.

Two clearly separated concerns live here:

* ``rank(request_dict, embed_fn)`` — the **pure** L4 ranking math. ``embed_fn``
  is dependency-injected (``embed_fn(texts) -> list[vector]``), so the whole
  algorithm is unit-testable with a deterministic fake and needs neither a model
  download nor a Modal account.
* ``embed_texts(texts)`` + ``_load_model()`` — the **production** embedder that
  loads ``intfloat/multilingual-e5-small`` via sentence-transformers from the
  ``raqam-ai-models`` Modal Volume. The heavy import is done LAZILY inside the
  loader, so importing this module (and therefore ``api``) stays model-free:
  pytest can import everything with sentence-transformers/torch absent.

L4 spec (business-logic-model.md §L4, business-rules BR-U1-3..8):
  1. e5 ``query:``/``passage:`` prefix convention on the NORMALIZED merchant.
  2. HARD type filter — a target only sees examples of the same ``type``.
  3. kNN with k=10 (cosine similarity).
  4. Per-category vote = SUM of the neighbour similarities in the top-k;
     ``topSim`` = the single highest similarity in the top-k.
  5. ``share(cat) = score(cat) / Σ score``.
  6. Emit the winner only if ``topSim >= 0.80`` AND ``share(winner) >= 0.60``;
     emit the runner-up only if its ``share >= 0.25``; at most 2 per tx.
  7. ``confidence = round(share, 2)``.
"""

from __future__ import annotations

import math
import os
import re
from typing import Callable, Sequence

# --------------------------------------------------------------------------- #
# Tunable constants — BR-U1-3..8, collected in one place (mirror of the client
# consts in src/lib/aiSuggest.js).
# --------------------------------------------------------------------------- #
K_NEIGHBOURS = 10          # BR-U1-5: k nearest neighbours
TOP_SIM_FLOOR = 0.80       # BR-U1-6: min best single similarity to emit a winner
WINNER_SHARE_FLOOR = 0.60  # BR-U1-6: min winner vote share to emit a winner
RUNNER_SHARE_FLOOR = 0.25  # BR-U1-7: min runner-up vote share to emit a 2nd chip
MAX_SUGGESTIONS = 2        # BR-U1-7: at most 2 chips per tx
CONFIDENCE_DP = 2          # BR-U1-8: confidence rounded to 2 dp

QUERY_PREFIX = "query: "     # e5 convention: queries (the target merchant)
PASSAGE_PREFIX = "passage: "  # e5 convention: passages (the example merchants)

# Production model + where its weights live on the mounted volume.
MODEL_NAME = "intfloat/multilingual-e5-small"
# Overridable so the mount path is set once in app.py; default matches app.py.
MODELS_DIR = os.environ.get("RAQAM_MODELS_DIR", "/models")

Vector = Sequence[float]
EmbedFn = Callable[[Sequence[str]], "list[Vector]"]


# --------------------------------------------------------------------------- #
# Merchant normalization — mirrors the client normMerchant (L1/L2): lower, trim,
# collapse inner whitespace, strip a single leading run of non-letter/digit
# (so "⚡️ Utilities" ≈ "utilities"). Idempotent, so re-normalizing an already
# normalized string is a no-op.
# --------------------------------------------------------------------------- #
def norm_merchant(s: str | None) -> str:
    s = (s or "").lower().strip()
    s = re.sub(r"\s+", " ", s)
    # Strip the single leading run of non-alphanumeric chars (unicode-aware:
    # str.isalnum() is True for unicode letters/digits, matching \p{L}\p{N}).
    i = 0
    while i < len(s) and not s[i].isalnum():
        i += 1
    return s[i:].strip()


# --------------------------------------------------------------------------- #
# Cosine similarity (works on non-normalized vectors, so fake embedders in tests
# need not be unit vectors).
# --------------------------------------------------------------------------- #
def _cosine(a: Vector, b: Vector) -> float:
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na <= 0.0 or nb <= 0.0:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))


# --------------------------------------------------------------------------- #
# L4 — pure ranking. embed_fn is injected.
# --------------------------------------------------------------------------- #
def rank(request_dict: dict, embed_fn: EmbedFn) -> dict:
    """Rank suggestions for every transaction in ``request_dict``.

    Returns the suggestions MAP only: ``{ txId: [ {categoryId, confidence}, … ] }``
    with 0..2 entries each; a tx with no emitted suggestion is omitted entirely
    (the caller wraps this in ``CategorizeResponse(suggestions=…)``). Never
    raises for empty/absent examples — it just returns fewer (or no) entries.
    """
    transactions = request_dict.get("transactions") or []
    context = request_dict.get("context") or {}
    examples = context.get("examples") or []
    categories = context.get("categories") or []

    # Valid category ids per type (BR-U1-9: only ever suggest a supplied,
    # matching-type category id).
    valid_ids_by_type: dict[str, set[str]] = {}
    for c in categories:
        valid_ids_by_type.setdefault(c.get("type"), set()).add(c.get("id"))

    # --- Collect every text to embed exactly once (dedup + request cache). ---
    # Examples carry a normalized merchant + a passage prefix; targets a query
    # prefix. Different prefixes ⇒ different embeddings ⇒ separate cache keys.
    texts_needed: set[str] = set()
    ex_norm: list[str] = []
    for ex in examples:
        n = norm_merchant(ex.get("merchant"))
        ex_norm.append(n)
        texts_needed.add(PASSAGE_PREFIX + n)
    tx_norm: list[str] = []
    for tx in transactions:
        n = norm_merchant(tx.get("merchant"))
        tx_norm.append(n)
        texts_needed.add(QUERY_PREFIX + n)

    vec_of: dict[str, Vector] = {}
    if texts_needed:
        ordered = sorted(texts_needed)
        vectors = embed_fn(ordered)
        vec_of = dict(zip(ordered, vectors))

    suggestions: dict[str, list[dict]] = {}

    for tx, tnorm in zip(transactions, tx_norm):
        target_type = tx.get("type")
        valid_ids = valid_ids_by_type.get(target_type, set())

        # HARD type filter (BR-U1-4) + id integrity (BR-U1-9): candidate
        # examples must match the target type and reference a supplied category.
        candidates = [
            (ex_norm[i], examples[i].get("categoryId"))
            for i in range(len(examples))
            if examples[i].get("type") == target_type
            and examples[i].get("categoryId") in valid_ids
        ]
        if not candidates:
            continue

        target_vec = vec_of[QUERY_PREFIX + tnorm]

        # Similarity to every candidate example.
        sims = [
            (_cosine(target_vec, vec_of[PASSAGE_PREFIX + n]), cat)
            for (n, cat) in candidates
        ]
        # kNN: the k=10 highest similarities.
        sims.sort(key=lambda p: p[0], reverse=True)
        top = sims[:K_NEIGHBOURS]

        top_sim = top[0][0]  # max single similarity in the top-k

        # Vote: per category, score = Σ similarity over its neighbours in top-k.
        scores: dict[str, float] = {}
        for sim, cat in top:
            scores[cat] = scores.get(cat, 0.0) + sim
        total = sum(scores.values())
        if total <= 0.0:
            continue

        ranked = sorted(scores.items(), key=lambda p: p[1], reverse=True)
        win_cat, win_score = ranked[0]
        win_share = win_score / total

        # Winner floors (BR-U1-6): both must hold, else the tx is omitted.
        if not (top_sim >= TOP_SIM_FLOOR and win_share >= WINNER_SHARE_FLOOR):
            continue

        out = [{"categoryId": win_cat, "confidence": round(win_share, CONFIDENCE_DP)}]

        # Runner-up (BR-U1-7): 2nd chip only if its share clears the floor.
        if len(ranked) > 1:
            run_cat, run_score = ranked[1]
            run_share = run_score / total
            if run_share >= RUNNER_SHARE_FLOOR:
                out.append(
                    {"categoryId": run_cat, "confidence": round(run_share, CONFIDENCE_DP)}
                )

        suggestions[tx.get("id")] = out[:MAX_SUGGESTIONS]

    return suggestions


# --------------------------------------------------------------------------- #
# Production embedder — lazy singleton. The sentence-transformers/torch import
# happens INSIDE _load_model so this module (and api) import model-free.
# --------------------------------------------------------------------------- #
_model = None


def _load_model():
    """Load multilingual-e5-small once, caching weights on the mounted volume."""
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer  # heavy — lazy

        _model = SentenceTransformer(MODEL_NAME, cache_folder=MODELS_DIR)
    return _model


def embed_texts(texts: Sequence[str]) -> "list[list[float]]":
    """Production ``embed_fn``: L2-normalized embeddings for ``texts``.

    The texts already carry their ``query:``/``passage:`` prefixes (rank adds
    them), so this is a plain encode.
    """
    model = _load_model()
    vectors = model.encode(
        list(texts),
        normalize_embeddings=True,
        convert_to_numpy=True,
    )
    return [v.tolist() for v in vectors]
