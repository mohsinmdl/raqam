"""Contract lockstep: every fixture in modal/fixtures validates against — and
round-trips through — its matching Pydantic model.

This is the guard that keeps ``schemas.py`` and the shared fixtures (also
consumed by the client's vitest suite) from silently drifting. It MUST pass
against the existing fixtures unchanged: the fixture is the contract; the schema
follows it.
"""

import json
from pathlib import Path

import pytest

from modal import schemas

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"

# fixture filename -> contract model
FIXTURE_MODELS = {
    "health.response.json": schemas.HealthResponse,
    "error.json": schemas.ErrorResponse,
    "categorize.request.json": schemas.CategorizeRequest,
    "categorize.response.json": schemas.CategorizeResponse,
    "parse-sms.request.json": schemas.ParseSmsRequest,
    "parse-sms.response.json": schemas.ParseSmsResponse,
    "parse-receipt.response.json": schemas.ParseReceiptResponse,
    "digest.request.json": schemas.DigestRequest,
    "digest.response.json": schemas.DigestResponse,
}


def _load(name):
    with open(FIXTURES_DIR / name, encoding="utf-8") as fh:
        return json.load(fh)


def test_every_fixture_has_a_model():
    on_disk = {p.name for p in FIXTURES_DIR.glob("*.json")}
    assert on_disk == set(FIXTURE_MODELS), (
        "fixtures and FIXTURE_MODELS disagree; update the mapping when a "
        f"fixture is added/removed. disk={sorted(on_disk)}"
    )


@pytest.mark.parametrize("name,model", sorted(FIXTURE_MODELS.items()))
def test_fixture_validates_against_model(name, model):
    data = _load(name)
    obj = model.model_validate(data)
    # Round-trip: the model must reproduce the fixture exactly (omitting only
    # unset optional fields, of which the fixtures have none).
    assert obj.model_dump(exclude_none=True) == data
