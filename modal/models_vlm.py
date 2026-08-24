"""U3 receipt scanning — VLM tier for ``/parse-receipt``.

Mirrors ``models_llm.py`` (U2): a **pure** function whose model backend is
dependency-injected, plus a **production** loader that pulls the heavy library
in LAZILY so importing this module (and therefore ``api``) stays light — pytest
imports everything with ``vllm``/``torch`` absent and drives the logic through a
fake ``generate_fn``.

Two clearly separated concerns:

* ``parse_receipt(image_bytes, generate_fn)`` — the **pure** extraction: build
  the VLM prompt, call the injected ``generate_fn(image_bytes) -> str`` (the
  model's raw JSON string), then parse + coerce the result into a
  ``ParsedReceipt``-shaped dict. Fields the model could not read are omitted; a
  non-receipt / junk image (or any malformed model output) yields ``{}``. It
  NEVER raises on bad model output.
* ``generate(image_bytes)`` + ``_load_vlm()`` — the **production** generator that
  serves ``Qwen/Qwen2.5-VL-7B-Instruct`` via vLLM (multimodal) with GUIDED
  (structured) JSON decoding constrained to ``PARSED_RECEIPT_JSON_SCHEMA``, so
  the output is always syntactically valid JSON. This runs ONLY inside the
  ISOLATED GPU ``vlm`` container (``modal/app.py``); the ``vllm``/vision imports
  happen INSIDE the loader so the VLM weights never load on any other route.

Contract (schemas.ParsedReceipt / fixtures/parse-receipt.response.json):
  merchant:str · date:'YYYY-MM-DD' · total:int PKR. All optional; a null parse
  is ``{}``.
Business rules: integer PKR (total), date → YYYY-MM-DD else drop, partial parse
(never fabricate). Image bytes are processed IN MEMORY only — never written to
disk, the volume, or any storage (US-15 privacy).
"""

from __future__ import annotations

import base64
import json
import os
import re
from datetime import datetime
from typing import Any, Callable

# The production generator takes the raw image bytes and returns the model's raw
# JSON string; tests inject a fake that ignores the bytes and returns canned JSON.
GenerateFn = Callable[[bytes], str]

# --------------------------------------------------------------------------- #
# Production model + where its weights live on the mounted volume (set once in
# app.py via _MODEL_ENV; default matches app.py's MODELS_DIR).
# --------------------------------------------------------------------------- #
MODEL_NAME = "Qwen/Qwen2.5-VL-7B-Instruct"
MODELS_DIR = os.environ.get("RAQAM_MODELS_DIR", "/models")

# JSON schema for vLLM guided decoding — the ParsedReceipt shape, all fields
# OPTIONAL (a junk image is allowed to yield ``{}``). ``additionalProperties`` is
# closed so the model can only emit the three contract keys.
PARSED_RECEIPT_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "merchant": {"type": "string"},
        "date": {"type": "string"},
        "total": {"type": "integer"},
    },
    "additionalProperties": False,
}

# Date input formats accepted from the model, normalized → YYYY-MM-DD.
_DATE_FORMATS = (
    "%Y-%m-%d",   # 2026-08-24
    "%d-%b-%Y",   # 24-Aug-2026
    "%d %b %Y",   # 24 Aug 2026
    "%b %d, %Y",  # Aug 24, 2026
    "%b %d %Y",   # Aug 24 2026
    "%d/%m/%Y",   # 24/08/2026
    "%d-%m-%Y",   # 24-08-2026
    "%d/%m/%y",   # 24/08/26
    "%d-%m-%y",   # 24-08-26
)

_SYSTEM_PROMPT = (
    "You are a precise receipt scanner. You read the photographed receipt and "
    "output ONLY the requested JSON object, never inventing fields the receipt "
    "does not clearly show."
)


# --------------------------------------------------------------------------- #
# Prompt
# --------------------------------------------------------------------------- #
def build_prompt() -> str:
    """Build the extraction instruction shown alongside the receipt image."""
    return (
        "Read this receipt image and return its details as a single JSON object.\n"
        "Include a field ONLY if the receipt clearly shows it; otherwise omit it:\n"
        '- "merchant": the store or merchant name printed on the receipt.\n'
        '- "date": the purchase date as YYYY-MM-DD.\n'
        '- "total": the grand total as an integer number of PKR (no currency '
        "symbol, no thousands separators).\n"
        "If the image is not a receipt, return an empty JSON object {}."
    )


# --------------------------------------------------------------------------- #
# Pure extraction — generate_fn is injected.
# --------------------------------------------------------------------------- #
def parse_receipt(image_bytes: bytes, generate_fn: GenerateFn) -> dict:
    """Extract a ``ParsedReceipt``-shaped dict from ``image_bytes``.

    ``generate_fn(image_bytes)`` returns the model's raw JSON string. The result
    is parsed and each field coerced/validated to the contract; unread or invalid
    fields are omitted, and a fully unreadable image (or malformed model output)
    yields ``{}``. Never raises on bad model output.
    """
    raw = generate_fn(image_bytes)
    data = _loads(raw)
    if not isinstance(data, dict):
        return {}

    out: dict[str, Any] = {}

    merchant = _coerce_merchant(data.get("merchant"))
    if merchant is not None:
        out["merchant"] = merchant

    date = _coerce_date(data.get("date"))
    if date is not None:
        out["date"] = date

    total = _coerce_total(data.get("total"))
    if total is not None:
        out["total"] = total

    return out


# --------------------------------------------------------------------------- #
# JSON tolerance — accept a clean object, a code-fenced object, or an object
# embedded in surrounding text; anything else → None (→ ``{}``).
# --------------------------------------------------------------------------- #
def _loads(raw: Any) -> Any:
    if isinstance(raw, (dict, list)):
        return raw
    if not isinstance(raw, str):
        return None
    s = raw.strip()
    if not s:
        return None
    # Strip a ```json ... ``` fence if the model wrapped its output.
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z0-9]*\s*", "", s)
        s = re.sub(r"\s*```$", "", s).strip()
    try:
        return json.loads(s)
    except (ValueError, TypeError):
        pass
    # Last resort: the first {...} block anywhere in the string.
    match = re.search(r"\{.*\}", s, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except (ValueError, TypeError):
            return None
    return None


# --------------------------------------------------------------------------- #
# Field coercions (each returns a valid value or None to drop the field).
# --------------------------------------------------------------------------- #
def _coerce_merchant(value: Any) -> str | None:
    if isinstance(value, str):
        s = value.strip()
        if s:
            return s
    return None


def _coerce_date(value: Any) -> str | None:
    """Normalize a known date format → YYYY-MM-DD; else drop.

    The service never invents a date — the client seeds today when it is absent.
    """
    if not isinstance(value, str):
        return None
    s = value.strip()
    if not s:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def _coerce_total(value: Any) -> int | None:
    """Coerce to an integer number of PKR: strip currency words + thousands
    separators, keep the decimal, round to the nearest integer."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(round(value))
    if isinstance(value, str):
        s = re.sub(r"(?i)\b(pkr|rs\.?|rupees?)\b", "", value)
        s = s.replace(",", "").strip()
        match = re.search(r"-?\d+(?:\.\d+)?", s)
        if match:
            try:
                return int(round(float(match.group(0))))
            except ValueError:
                return None
    return None


# --------------------------------------------------------------------------- #
# Production generator — lazy singleton. The ``vllm``/vision imports happen
# INSIDE the loader, so this module (and ``api``) import with vllm/torch/GPU
# absent. This code path runs ONLY inside the ISOLATED GPU ``vlm`` container
# defined in app.py — its 7B VL weights never load on any other route.
# --------------------------------------------------------------------------- #
_vlm = None


def _load_vlm():
    """Load Qwen2.5-VL-7B-Instruct via vLLM once, from the mounted models volume."""
    global _vlm
    if _vlm is None:
        from vllm import LLM  # heavy — lazy, GPU only

        _vlm = LLM(model=MODEL_NAME, download_dir=MODELS_DIR)
    return _vlm


def generate(image_bytes: bytes) -> str:
    """Production ``generate_fn``: guided-JSON decode the receipt image with vLLM.

    The image is passed to the multimodal model as an in-memory data URL (never
    written to disk or the volume). GUIDED decoding constrains the output to
    ``PARSED_RECEIPT_JSON_SCHEMA``, so the returned string is always
    syntactically valid JSON matching the contract.
    """
    from vllm import SamplingParams  # heavy — lazy, GPU only
    from vllm.sampling_params import GuidedDecodingParams

    vlm = _load_vlm()
    data_url = "data:image/jpeg;base64," + base64.b64encode(image_bytes).decode("ascii")
    guided = GuidedDecodingParams(json=PARSED_RECEIPT_JSON_SCHEMA)
    params = SamplingParams(temperature=0.0, max_tokens=256, guided_decoding=guided)
    conversation = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": build_prompt()},
                {"type": "image_url", "image_url": {"url": data_url}},
            ],
        },
    ]
    outputs = vlm.chat(conversation, params)
    return outputs[0].outputs[0].text
