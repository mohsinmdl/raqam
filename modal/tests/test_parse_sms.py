"""U2 SMS parsing — unit tests for the pure ``models_llm.parse_sms`` driven by a
FAKE ``generate_fn`` returning canned JSON strings, plus an authed ``/parse-sms``
route test with the production remote generator monkeypatched. Everything here
runs with NO GPU, NO model download, and NO Modal account: ``vllm``/``torch`` and
the ``modal`` SDK are never imported.
"""

import json
from pathlib import Path

from modal import api, models_llm, schemas
from .conftest import make_hs256_token

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"


def _gen(canned: str):
    """A fake generate_fn that ignores the prompt and returns ``canned``."""
    return lambda _prompt: canned


# --------------------------------------------------------------------------- #
# Pure parse_sms() — full / partial / junk / bad-field / date normalization.
# --------------------------------------------------------------------------- #
def test_full_valid_all_fields():
    canned = json.dumps(
        {
            "amount": 5420,
            "direction": "debit",
            "date": "2026-08-24",
            "merchant": "IMTIAZ",
            "last4": "1234",
        }
    )
    assert models_llm.parse_sms("whatever", _gen(canned)) == {
        "amount": 5420,
        "direction": "debit",
        "date": "2026-08-24",
        "merchant": "IMTIAZ",
        "last4": "1234",
    }


def test_partial_amount_only():
    assert models_llm.parse_sms("x", _gen(json.dumps({"amount": 900}))) == {"amount": 900}


def test_junk_non_json_returns_empty():
    assert models_llm.parse_sms("x", _gen("your OTP is 123456")) == {}


def test_empty_object_returns_empty():
    assert models_llm.parse_sms("x", _gen("{}")) == {}


def test_bad_direction_dropped_other_fields_kept():
    canned = json.dumps({"amount": 100, "direction": "sideways"})
    assert models_llm.parse_sms("x", _gen(canned)) == {"amount": 100}


def test_amount_decimals_and_separators_rounded_to_int_pkr():
    # String amount with currency word, thousands separator, and decimals → int.
    canned = json.dumps({"amount": "Rs 5,420.00", "direction": "DEBIT"})
    assert models_llm.parse_sms("x", _gen(canned)) == {"amount": 5420, "direction": "debit"}


def test_date_normalization_from_dd_mon_yyyy():
    canned = json.dumps({"date": "24-Aug-2026", "amount": 10, "direction": "credit"})
    out = models_llm.parse_sms("x", _gen(canned))
    assert out["date"] == "2026-08-24"


def test_unparseable_date_dropped():
    canned = json.dumps({"amount": 10, "direction": "credit", "date": "sometime"})
    assert models_llm.parse_sms("x", _gen(canned)) == {"amount": 10, "direction": "credit"}


def test_bad_last4_dropped():
    canned = json.dumps({"amount": 10, "direction": "debit", "last4": "12"})
    assert models_llm.parse_sms("x", _gen(canned)) == {"amount": 10, "direction": "debit"}


def test_empty_merchant_dropped():
    canned = json.dumps({"amount": 10, "direction": "debit", "merchant": "  "})
    assert models_llm.parse_sms("x", _gen(canned)) == {"amount": 10, "direction": "debit"}


def test_code_fenced_json_tolerated():
    canned = "```json\n{\"amount\": 42, \"direction\": \"credit\"}\n```"
    assert models_llm.parse_sms("x", _gen(canned)) == {"amount": 42, "direction": "credit"}


def test_result_is_parsedsms_schema_valid():
    canned = json.dumps({"amount": 5420, "direction": "debit", "merchant": "IMTIAZ"})
    parsed = models_llm.parse_sms("x", _gen(canned))
    # Must construct against the closed contract model without error.
    obj = schemas.ParsedSms(**parsed)
    assert obj.model_dump(exclude_none=True) == parsed


# --------------------------------------------------------------------------- #
# Authed /parse-sms route — posts the shared request fixture with the production
# remote generator monkeypatched to return the fixture's parsed JSON. No GPU.
# --------------------------------------------------------------------------- #
def _load(name):
    with open(FIXTURES_DIR / name, encoding="utf-8") as fh:
        return json.load(fh)


def test_parse_sms_route_matches_fixture(client, hs256_env, monkeypatch):
    request_body = _load("parse-sms.request.json")
    expected = _load("parse-sms.response.json")

    # The model's raw generation == the fixture's parsed JSON string.
    canned = json.dumps(expected["parsed"])
    monkeypatch.setattr(api, "llm_generate", _gen(canned))

    r = client.post(
        "/parse-sms",
        json=request_body,
        headers={"Authorization": f"Bearer {make_hs256_token()}"},
    )
    assert r.status_code == 200
    assert r.json() == expected
    # And it validates against the contract model unchanged.
    schemas.ParseSmsResponse.model_validate(r.json())


def test_parse_sms_route_junk_returns_empty_parsed(client, hs256_env, monkeypatch):
    monkeypatch.setattr(api, "llm_generate", _gen("not a transaction"))
    r = client.post(
        "/parse-sms",
        json={"text": "Your OTP is 445566"},
        headers={"Authorization": f"Bearer {make_hs256_token()}"},
    )
    assert r.status_code == 200
    assert r.json() == {"parsed": {}}


def test_parse_sms_route_requires_auth(client):
    r = client.post("/parse-sms", json={"text": "anything"})
    assert r.status_code == 401
