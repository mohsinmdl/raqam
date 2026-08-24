"""U3 receipt scanning — unit tests for the pure ``models_vlm.parse_receipt``
driven by a FAKE ``generate_fn`` returning canned JSON strings, plus an authed
``/parse-receipt`` route test with the production remote generator monkeypatched.
Everything here runs with NO GPU, NO model download, and NO Modal account:
``vllm``/``torch`` and the ``modal`` SDK are never imported. The route posts a
tiny fake image as ``multipart/form-data`` (field ``image``); the oversize case
proves the 8 MB cap → 413, and the no-persistence assertion proves the handler
never writes the uploaded bytes anywhere.
"""

import json
from pathlib import Path

from modal import api, models_vlm, schemas
from .conftest import make_hs256_token

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"

# A few arbitrary bytes standing in for an uploaded image — the fake generator
# ignores them, so no real image decoding happens.
FAKE_IMAGE = b"\xff\xd8\xff\xe0fake-jpeg-bytes"


def _gen(canned: str):
    """A fake generate_fn that ignores the image bytes and returns ``canned``."""
    return lambda _image_bytes: canned


def _load(name):
    with open(FIXTURES_DIR / name, encoding="utf-8") as fh:
        return json.load(fh)


# --------------------------------------------------------------------------- #
# Pure parse_receipt() — full / partial / junk / bad-field / date normalization.
# --------------------------------------------------------------------------- #
def test_full_valid_all_fields():
    canned = json.dumps(
        {"merchant": "Imtiaz Super Market", "date": "2026-08-24", "total": 5420}
    )
    assert models_vlm.parse_receipt(FAKE_IMAGE, _gen(canned)) == {
        "merchant": "Imtiaz Super Market",
        "date": "2026-08-24",
        "total": 5420,
    }


def test_partial_merchant_only():
    canned = json.dumps({"merchant": "Cafe Zouk"})
    assert models_vlm.parse_receipt(FAKE_IMAGE, _gen(canned)) == {"merchant": "Cafe Zouk"}


def test_junk_non_json_returns_empty():
    assert models_vlm.parse_receipt(FAKE_IMAGE, _gen("this is not a receipt")) == {}


def test_empty_object_returns_empty():
    assert models_vlm.parse_receipt(FAKE_IMAGE, _gen("{}")) == {}


def test_total_decimals_and_separators_rounded_to_int_pkr():
    canned = json.dumps({"merchant": "Metro", "total": "Rs 5,420.00"})
    assert models_vlm.parse_receipt(FAKE_IMAGE, _gen(canned)) == {
        "merchant": "Metro",
        "total": 5420,
    }


def test_date_normalization_from_dd_mon_yyyy():
    canned = json.dumps({"total": 10, "date": "24-Aug-2026"})
    out = models_vlm.parse_receipt(FAKE_IMAGE, _gen(canned))
    assert out["date"] == "2026-08-24"


def test_unparseable_date_dropped():
    canned = json.dumps({"total": 10, "date": "sometime last week"})
    assert models_vlm.parse_receipt(FAKE_IMAGE, _gen(canned)) == {"total": 10}


def test_empty_merchant_dropped():
    canned = json.dumps({"merchant": "  ", "total": 10})
    assert models_vlm.parse_receipt(FAKE_IMAGE, _gen(canned)) == {"total": 10}


def test_bad_total_dropped_other_fields_kept():
    canned = json.dumps({"merchant": "Store", "total": "N/A"})
    assert models_vlm.parse_receipt(FAKE_IMAGE, _gen(canned)) == {"merchant": "Store"}


def test_code_fenced_json_tolerated():
    canned = '```json\n{"merchant": "Naheed", "total": 42}\n```'
    assert models_vlm.parse_receipt(FAKE_IMAGE, _gen(canned)) == {
        "merchant": "Naheed",
        "total": 42,
    }


def test_result_is_parsedreceipt_schema_valid():
    canned = json.dumps({"merchant": "Imtiaz", "total": 5420})
    parsed = models_vlm.parse_receipt(FAKE_IMAGE, _gen(canned))
    obj = schemas.ParsedReceipt(**parsed)
    assert obj.model_dump(exclude_none=True) == parsed


# --------------------------------------------------------------------------- #
# Authed /parse-receipt route — posts a tiny fake image as multipart with the
# production remote generator monkeypatched to return the fixture's parsed JSON.
# --------------------------------------------------------------------------- #
def test_parse_receipt_route_matches_fixture(client, hs256_env, monkeypatch):
    expected = _load("parse-receipt.response.json")

    # The model's raw generation == the fixture's parsed JSON string.
    canned = json.dumps(expected["parsed"])
    monkeypatch.setattr(api, "vlm_generate", _gen(canned))

    r = client.post(
        "/parse-receipt",
        files={"image": ("receipt.jpg", FAKE_IMAGE, "image/jpeg")},
        headers={"Authorization": f"Bearer {make_hs256_token()}"},
    )
    assert r.status_code == 200
    assert r.json() == expected
    # And it validates against the contract model unchanged.
    schemas.ParseReceiptResponse.model_validate(r.json())


def test_parse_receipt_route_junk_returns_empty_parsed(client, hs256_env, monkeypatch):
    monkeypatch.setattr(api, "vlm_generate", _gen("not a receipt"))
    r = client.post(
        "/parse-receipt",
        files={"image": ("blank.jpg", FAKE_IMAGE, "image/jpeg")},
        headers={"Authorization": f"Bearer {make_hs256_token()}"},
    )
    assert r.status_code == 200
    assert r.json() == {"parsed": {}}


def test_parse_receipt_route_oversize_returns_413(client, hs256_env, monkeypatch):
    # The generator must never be reached — cap is enforced on the read bytes.
    def _boom(_image_bytes):
        raise AssertionError("generator must not run for an oversize upload")

    monkeypatch.setattr(api, "vlm_generate", _boom)
    oversize = b"\x00" * (api.MAX_RECEIPT_BYTES + 1)
    r = client.post(
        "/parse-receipt",
        files={"image": ("huge.jpg", oversize, "image/jpeg")},
        headers={"Authorization": f"Bearer {make_hs256_token()}"},
    )
    assert r.status_code == 413
    assert r.json() == {"error": "image too large"}


def test_parse_receipt_route_at_cap_is_allowed(client, hs256_env, monkeypatch):
    # Exactly at the cap is accepted (boundary — not > MAX).
    monkeypatch.setattr(api, "vlm_generate", _gen("{}"))
    at_cap = b"\x00" * api.MAX_RECEIPT_BYTES
    r = client.post(
        "/parse-receipt",
        files={"image": ("big.jpg", at_cap, "image/jpeg")},
        headers={"Authorization": f"Bearer {make_hs256_token()}"},
    )
    assert r.status_code == 200
    assert r.json() == {"parsed": {}}


def test_parse_receipt_route_requires_auth(client):
    r = client.post(
        "/parse-receipt",
        files={"image": ("receipt.jpg", FAKE_IMAGE, "image/jpeg")},
    )
    assert r.status_code == 401


# --------------------------------------------------------------------------- #
# No-persistence (US-15): the handler never writes the uploaded bytes to disk,
# the volume, or any storage. Proven two ways: (1) code inspection — no
# filesystem/storage API appears in the handler source; (2) behaviourally — a
# successful upload creates no new files anywhere under the worktree.
# --------------------------------------------------------------------------- #
def test_handler_source_touches_no_storage_apis():
    import inspect

    src = inspect.getsource(api.create_app)
    # Isolate the /parse-receipt handler body.
    start = src.index("async def parse_receipt(")
    end = src.index("async def digest_route(", start)
    handler = src[start:end]
    for forbidden in ("open(", "write", "aiofiles", ".save(", "shutil", "Path("):
        assert forbidden not in handler, f"handler must not reference {forbidden!r}"


def test_successful_upload_writes_no_files(client, hs256_env, monkeypatch):
    import os

    # Scope to the service package: a receipt write would land on the mounted
    # volume or beside the code, both under ``modal/`` in this layout.
    modal_dir = Path(__file__).resolve().parents[1]

    def _snapshot():
        found = set()
        for base, _dirs, files in os.walk(modal_dir):
            if "__pycache__" in base or ".venv" in base:
                continue
            for f in files:
                found.add(os.path.join(base, f))
        return found

    before = _snapshot()
    monkeypatch.setattr(api, "vlm_generate", _gen(json.dumps({"merchant": "X"})))
    r = client.post(
        "/parse-receipt",
        files={"image": ("receipt.jpg", FAKE_IMAGE, "image/jpeg")},
        headers={"Authorization": f"Bearer {make_hs256_token()}"},
    )
    assert r.status_code == 200
    after = _snapshot()
    assert before == after, f"handler created files: {sorted(after - before)}"
