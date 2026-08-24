"""U4 insights digest — unit tests for the pure ``digest.narrate`` driven by a
FAKE ``generate_fn`` returning canned JSON strings, plus an authed ``/digest``
route test with the production remote generator monkeypatched. Everything here
runs with NO GPU, NO model download, and NO Modal account: ``vllm``/``torch`` and
the ``modal`` SDK are never imported.
"""

import json
from pathlib import Path

from modal import api, digest, schemas
from .conftest import make_hs256_token

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"


def _gen(canned: str):
    """A fake generate_fn that ignores the prompt and returns ``canned``."""
    return lambda _prompt: canned


def _load(name):
    with open(FIXTURES_DIR / name, encoding="utf-8") as fh:
        return json.load(fh)


# --------------------------------------------------------------------------- #
# Pure narrate() — valid / partial / junk / malformed / wrong-shape handling.
# --------------------------------------------------------------------------- #
def test_valid_headline_and_observations():
    canned = json.dumps(
        {
            "headline": "Spending is up this month.",
            "observations": ["Groceries rose 44%.", "You kept a surplus."],
        }
    )
    assert digest.narrate({"month": "2026-08"}, _gen(canned)) == {
        "headline": "Spending is up this month.",
        "observations": ["Groceries rose 44%.", "You kept a surplus."],
    }


def test_headline_only_empty_observations():
    canned = json.dumps({"headline": "A quiet month.", "observations": []})
    assert digest.narrate({}, _gen(canned)) == {
        "headline": "A quiet month.",
        "observations": [],
    }


def test_junk_non_json_returns_safe_response():
    assert digest.narrate({}, _gen("sorry, I cannot help with that")) == {
        "headline": "",
        "observations": [],
    }


def test_empty_string_returns_safe_response():
    assert digest.narrate({}, _gen("")) == {"headline": "", "observations": []}


def test_empty_object_returns_safe_response():
    # A ``{}`` object → no headline, no observations, still contract-valid.
    assert digest.narrate({}, _gen("{}")) == {"headline": "", "observations": []}


def test_missing_headline_defaults_to_empty_string():
    canned = json.dumps({"observations": ["Just one note."]})
    assert digest.narrate({}, _gen(canned)) == {
        "headline": "",
        "observations": ["Just one note."],
    }


def test_non_string_headline_dropped():
    canned = json.dumps({"headline": 123, "observations": ["ok"]})
    assert digest.narrate({}, _gen(canned)) == {
        "headline": "",
        "observations": ["ok"],
    }


def test_non_list_observations_becomes_empty():
    canned = json.dumps({"headline": "Hello.", "observations": "not a list"})
    assert digest.narrate({}, _gen(canned)) == {"headline": "Hello.", "observations": []}


def test_non_string_and_blank_observations_filtered():
    canned = json.dumps(
        {"headline": "H.", "observations": ["keep me", "   ", 42, None, "keep two"]}
    )
    assert digest.narrate({}, _gen(canned)) == {
        "headline": "H.",
        "observations": ["keep me", "keep two"],
    }


def test_code_fenced_json_tolerated():
    canned = "```json\n{\"headline\": \"Fenced.\", \"observations\": [\"a\"]}\n```"
    assert digest.narrate({}, _gen(canned)) == {
        "headline": "Fenced.",
        "observations": ["a"],
    }


def test_json_embedded_in_text_tolerated():
    canned = 'Here you go: {"headline": "Embedded.", "observations": []} thanks!'
    assert digest.narrate({}, _gen(canned)) == {
        "headline": "Embedded.",
        "observations": [],
    }


def test_result_is_digestresponse_schema_valid():
    canned = json.dumps({"headline": "H.", "observations": ["a", "b"]})
    result = digest.narrate({}, _gen(canned))
    # Must construct against the closed contract model without error.
    obj = schemas.DigestResponse(**result)
    assert obj.model_dump() == result


def test_safe_response_is_schema_valid():
    result = digest.narrate({}, _gen("garbage"))
    schemas.DigestResponse(**result)  # does not raise


def test_narrate_never_raises_on_none_output():
    # A generator returning a non-string (e.g. None) still degrades safely.
    assert digest.narrate({}, lambda _p: None) == {"headline": "", "observations": []}


def test_prompt_includes_aggregate_numbers_and_forbids_invention():
    captured = {}

    def _capture(prompt):
        captured["prompt"] = prompt
        return json.dumps({"headline": "x", "observations": []})

    digest.narrate({"stats": {"total": 245000}}, _capture)
    prompt = captured["prompt"]
    # The aggregates are embedded verbatim and the model is told not to invent.
    assert "245000" in prompt
    assert "invent" in prompt.lower()


# --------------------------------------------------------------------------- #
# Authed /digest route — posts the shared request fixture with the production
# remote generator (api.llm_generate) monkeypatched to return the fixture's
# response JSON. No GPU, no model, no Modal SDK.
# --------------------------------------------------------------------------- #
def test_digest_route_matches_fixture(client, hs256_env, monkeypatch):
    request_body = _load("digest.request.json")
    expected = _load("digest.response.json")

    # The model's raw generation == the fixture's response JSON string. The route
    # reuses U2's ``llm_generate`` shim, so patching it here patches the digest path.
    monkeypatch.setattr(api, "llm_generate_digest", _gen(json.dumps(expected)))

    r = client.post(
        "/digest",
        json=request_body,
        headers={"Authorization": f"Bearer {make_hs256_token()}"},
    )
    assert r.status_code == 200
    assert r.json() == expected
    # And it validates against the contract model unchanged.
    schemas.DigestResponse.model_validate(r.json())


def test_digest_route_malformed_generation_returns_safe_response(
    client, hs256_env, monkeypatch
):
    request_body = _load("digest.request.json")
    monkeypatch.setattr(api, "llm_generate_digest", _gen("the model rambled, no JSON here"))

    r = client.post(
        "/digest",
        json=request_body,
        headers={"Authorization": f"Bearer {make_hs256_token()}"},
    )
    assert r.status_code == 200
    assert r.json() == {"headline": "", "observations": []}


def test_digest_route_rejects_unknown_field(client, hs256_env, monkeypatch):
    # Contract is closed (extra="forbid") → an unexpected key is a 422.
    monkeypatch.setattr(api, "llm_generate_digest", _gen("{}"))
    request_body = _load("digest.request.json")
    request_body["surprise"] = 1

    r = client.post(
        "/digest",
        json=request_body,
        headers={"Authorization": f"Bearer {make_hs256_token()}"},
    )
    assert r.status_code == 422


def test_digest_route_requires_auth(client):
    r = client.post("/digest", json=_load("digest.request.json"))
    assert r.status_code == 401
