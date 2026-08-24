"""U1 auto-categorize — unit tests for embed.rank() with a DETERMINISTIC fake
embedder, plus an authed /categorize route test. Everything here runs with NO
Modal account and NO model download: the fake embed_fn maps known normalized
merchant strings to hand-chosen vectors, and the route test monkeypatches the
production embedder so sentence-transformers is never imported.

Vector convention: the target sits at [1, 0]; an example placed at [s, sqrt(1-s^2)]
is a unit vector whose cosine similarity with the target is exactly ``s``. That
lets each test pin similarities (and therefore the share math) precisely.
"""

import json
import math
from pathlib import Path

from modal import embed, schemas
from .conftest import make_hs256_token

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"

TARGET = [1.0, 0.0]


def _at(sim: float) -> list[float]:
    """A unit vector whose cosine with TARGET ([1,0]) equals ``sim``."""
    return [sim, math.sqrt(max(0.0, 1.0 - sim * sim))]


def make_fake_embed(vectors_by_merchant):
    """Build an embed_fn that ignores the e5 prefix and maps the (already
    normalized) merchant string to its chosen vector."""

    def embed_fn(texts):
        out = []
        for t in texts:
            key = t
            for pref in (embed.QUERY_PREFIX, embed.PASSAGE_PREFIX):
                if t.startswith(pref):
                    key = t[len(pref):]
                    break
            out.append(vectors_by_merchant[key])
        return out

    return embed_fn


def _req(transactions, examples, categories):
    return {
        "transactions": transactions,
        "context": {"examples": examples, "categories": categories},
    }


# --------------------------------------------------------------------------- #
# Type hard-filter + winner emitted (an income example is NEVER suggested for an
# expense target, even when it is the closest vector).
# --------------------------------------------------------------------------- #
def test_type_hard_filter_and_winner_emitted():
    req = _req(
        transactions=[{"id": "t1", "merchant": "imtiaz", "amount": 5420, "type": "expense", "date": "2026-08-24"}],
        examples=[
            {"merchant": "imtiaz super market", "amount": 3200, "type": "expense", "categoryId": "groceries"},
            {"merchant": "shell", "amount": 6000, "type": "expense", "categoryId": "fuel"},
            {"merchant": "monthly salary", "amount": 100, "type": "income", "categoryId": "salary_cat"},
        ],
        categories=[
            {"id": "groceries", "name": "Groceries", "group": "Needs", "type": "expense"},
            {"id": "fuel", "name": "Fuel", "group": "Needs", "type": "expense"},
            {"id": "salary_cat", "name": "Salary", "group": "Income", "type": "income"},
        ],
    )
    fake = make_fake_embed({
        "imtiaz": TARGET,
        "imtiaz super market": _at(1.0),  # sim 1.0 → groceries
        "shell": _at(0.0),                # sim 0.0 → fuel
        "monthly salary": _at(1.0),       # closest, but WRONG type → never used
    })

    out = embed.rank(req, fake)

    assert out == {"t1": [{"categoryId": "groceries", "confidence": 1.0}]}
    # The income category id must appear nowhere.
    assert "salary_cat" not in {s["categoryId"] for s in out["t1"]}


def test_income_examples_never_match_expense_target():
    req = _req(
        transactions=[{"id": "t1", "merchant": "imtiaz", "amount": 100, "type": "expense", "date": "2026-08-24"}],
        examples=[
            {"merchant": "monthly salary", "amount": 100, "type": "income", "categoryId": "salary_cat"},
        ],
        categories=[
            {"id": "salary_cat", "name": "Salary", "group": "Income", "type": "income"},
        ],
    )
    fake = make_fake_embed({"imtiaz": TARGET, "monthly salary": _at(1.0)})
    assert embed.rank(req, fake) == {}


# --------------------------------------------------------------------------- #
# topSim floor: below 0.80 → omitted; above → emitted.
# --------------------------------------------------------------------------- #
def test_below_topsim_floor_omitted():
    req = _req(
        transactions=[{"id": "t1", "merchant": "widgets", "amount": 100, "type": "expense", "date": "2026-08-24"}],
        examples=[{"merchant": "store", "amount": 100, "type": "expense", "categoryId": "shopping"}],
        categories=[{"id": "shopping", "name": "Shopping", "group": "Wants", "type": "expense"}],
    )
    fake = make_fake_embed({"widgets": TARGET, "store": _at(0.70)})  # topSim 0.70 < 0.80
    assert embed.rank(req, fake) == {}


def test_above_topsim_floor_emitted():
    req = _req(
        transactions=[{"id": "t1", "merchant": "widgets", "amount": 100, "type": "expense", "date": "2026-08-24"}],
        examples=[{"merchant": "store", "amount": 100, "type": "expense", "categoryId": "shopping"}],
        categories=[{"id": "shopping", "name": "Shopping", "group": "Wants", "type": "expense"}],
    )
    fake = make_fake_embed({"widgets": TARGET, "store": _at(0.95)})  # topSim 0.95 ≥ 0.80
    assert embed.rank(req, fake) == {"t1": [{"categoryId": "shopping", "confidence": 1.0}]}


# --------------------------------------------------------------------------- #
# Winner share gate: high topSim but vote split too evenly → omitted.
# --------------------------------------------------------------------------- #
def test_winner_share_floor_gate_omits():
    req = _req(
        transactions=[{"id": "t1", "merchant": "widgets", "amount": 100, "type": "expense", "date": "2026-08-24"}],
        examples=[
            {"merchant": "aa", "amount": 100, "type": "expense", "categoryId": "catA"},
            {"merchant": "bb", "amount": 100, "type": "expense", "categoryId": "catB"},
        ],
        categories=[
            {"id": "catA", "name": "A", "group": "G", "type": "expense"},
            {"id": "catB", "name": "B", "group": "G", "type": "expense"},
        ],
    )
    # topSim 0.90 ≥ 0.80, but winner share = 0.90/1.75 ≈ 0.514 < 0.60 → omit.
    fake = make_fake_embed({"widgets": TARGET, "aa": _at(0.90), "bb": _at(0.85)})
    assert embed.rank(req, fake) == {}


# --------------------------------------------------------------------------- #
# Runner-up emitted (share ≥ 0.25) and at most 2 chips (a tiny 3rd is dropped).
# --------------------------------------------------------------------------- #
def test_runner_up_emitted_and_max_two_chips():
    req = _req(
        transactions=[{"id": "t1", "merchant": "widgets", "amount": 100, "type": "expense", "date": "2026-08-24"}],
        examples=[
            {"merchant": "alpha", "amount": 1, "type": "expense", "categoryId": "catX"},
            {"merchant": "beta", "amount": 1, "type": "expense", "categoryId": "catX"},
            {"merchant": "gamma", "amount": 1, "type": "expense", "categoryId": "catY"},
            {"merchant": "delta", "amount": 1, "type": "expense", "categoryId": "catZ"},
        ],
        categories=[
            {"id": "catX", "name": "X", "group": "G", "type": "expense"},
            {"id": "catY", "name": "Y", "group": "G", "type": "expense"},
            {"id": "catZ", "name": "Z", "group": "G", "type": "expense"},
        ],
    )
    # scores: X=1.8, Y=0.9, Z=0.1, total=2.8 → shares 0.643 / 0.321 / 0.036.
    fake = make_fake_embed({
        "widgets": TARGET,
        "alpha": _at(0.90), "beta": _at(0.90),  # catX: two neighbours
        "gamma": _at(0.90),                      # catY: one neighbour
        "delta": _at(0.10),                      # catZ: negligible
    })
    out = embed.rank(req, fake)
    assert out == {"t1": [
        {"categoryId": "catX", "confidence": 0.64},
        {"categoryId": "catY", "confidence": 0.32},
    ]}
    assert len(out["t1"]) == embed.MAX_SUGGESTIONS


def test_runner_up_below_floor_dropped():
    req = _req(
        transactions=[{"id": "t1", "merchant": "widgets", "amount": 100, "type": "expense", "date": "2026-08-24"}],
        examples=[
            {"merchant": "alpha", "amount": 1, "type": "expense", "categoryId": "catX"},
            {"merchant": "beta", "amount": 1, "type": "expense", "categoryId": "catX"},
            {"merchant": "gamma", "amount": 1, "type": "expense", "categoryId": "catX"},
            {"merchant": "delta", "amount": 1, "type": "expense", "categoryId": "catY"},
        ],
        categories=[
            {"id": "catX", "name": "X", "group": "G", "type": "expense"},
            {"id": "catY", "name": "Y", "group": "G", "type": "expense"},
        ],
    )
    # X=2.7, Y=0.2, total=2.9 → winner share 0.931, runner share 0.069 < 0.25 → 1 chip.
    fake = make_fake_embed({
        "widgets": TARGET,
        "alpha": _at(0.90), "beta": _at(0.90), "gamma": _at(0.90),
        "delta": _at(0.20),
    })
    out = embed.rank(req, fake)
    assert out == {"t1": [{"categoryId": "catX", "confidence": 0.93}]}


# --------------------------------------------------------------------------- #
# Empty / degenerate inputs → empty map (never an error).
# --------------------------------------------------------------------------- #
def test_empty_examples_returns_empty():
    req = _req(
        transactions=[{"id": "t1", "merchant": "imtiaz", "amount": 1, "type": "expense", "date": "2026-08-24"}],
        examples=[],
        categories=[{"id": "groceries", "name": "Groceries", "group": "Needs", "type": "expense"}],
    )
    fake = make_fake_embed({"imtiaz": TARGET})
    assert embed.rank(req, fake) == {}


def test_no_transactions_returns_empty():
    req = _req(
        transactions=[],
        examples=[{"merchant": "shell", "amount": 1, "type": "expense", "categoryId": "fuel"}],
        categories=[{"id": "fuel", "name": "Fuel", "group": "Needs", "type": "expense"}],
    )
    fake = make_fake_embed({"shell": _at(1.0)})
    assert embed.rank(req, fake) == {}


def test_foreign_category_id_ignored():
    """An example referencing a categoryId not in the supplied categories list
    (BR-U1-9) contributes nothing."""
    req = _req(
        transactions=[{"id": "t1", "merchant": "widgets", "amount": 1, "type": "expense", "date": "2026-08-24"}],
        examples=[{"merchant": "store", "amount": 1, "type": "expense", "categoryId": "ghost"}],
        categories=[{"id": "shopping", "name": "Shopping", "group": "Wants", "type": "expense"}],
    )
    fake = make_fake_embed({"widgets": TARGET, "store": _at(1.0)})
    assert embed.rank(req, fake) == {}


# --------------------------------------------------------------------------- #
# Route test — authed POST of the shared fixture → schema-valid response.
# The production embedder is monkeypatched so no model loads.
# --------------------------------------------------------------------------- #
def test_categorize_route_schema_valid(client, hs256_env, monkeypatch):
    fake = make_fake_embed({
        "imtiaz": TARGET,
        "imtiaz super market": _at(1.0),
        "shell": _at(0.0),
    })
    monkeypatch.setattr(embed, "embed_texts", fake)

    with open(FIXTURES_DIR / "categorize.request.json", encoding="utf-8") as fh:
        body = json.load(fh)

    r = client.post(
        "/categorize",
        json=body,
        headers={"Authorization": f"Bearer {make_hs256_token()}"},
    )
    assert r.status_code == 200
    # Response must validate against the contract model, unchanged.
    parsed = schemas.CategorizeResponse.model_validate(r.json())
    assert parsed.suggestions["t1"][0].categoryId == "groceries"
    assert 0.0 <= parsed.suggestions["t1"][0].confidence <= 1.0


def test_categorize_route_requires_auth(client):
    r = client.post("/categorize", json={"transactions": [], "context": {"examples": [], "categories": []}})
    assert r.status_code == 401
