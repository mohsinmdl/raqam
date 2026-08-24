"""U2 SMS parsing — LLM tier for ``/parse-sms``.

Mirrors the structure of ``embed.py`` (U1): a **pure** function whose model
backend is dependency-injected, plus a **production** loader that pulls in the
heavy library LAZILY so importing this module (and therefore ``api``) stays
light — pytest imports everything with ``vllm``/``torch`` absent and drives the
logic through a fake ``generate_fn``.

Two clearly separated concerns:

* ``parse_sms(text, generate_fn)`` — the **pure** extraction: build the prompt,
  call the injected ``generate_fn(prompt) -> str`` (the model's raw JSON string),
  then parse + coerce the result into a ``ParsedSms``-shaped dict. Fields the
  model could not read are omitted; a non-transaction / junk SMS (or any
  malformed model output) yields ``{}``. It NEVER raises on bad model output.
* ``generate(prompt)`` + ``_load_llm()`` — the **production** generator that
  serves ``Qwen/Qwen3-4B-Instruct`` via vLLM with GUIDED (structured) JSON
  decoding constrained to ``PARSED_SMS_JSON_SCHEMA``, so the model's output is
  always syntactically valid JSON. This runs only inside the GPU ``llm``
  container (``modal/app.py``); the ``vllm`` import happens INSIDE the loader.

Contract (schemas.ParsedSms / fixtures/parse-sms.*.json):
  amount:int PKR · direction:'debit'|'credit' · date:'YYYY-MM-DD' ·
  merchant:str · last4:str(4 digits). All optional; a null parse is ``{}``.
Business rules: BR-U2-3 (integer PKR), BR-U2-5 (date → YYYY-MM-DD else drop),
BR-U2-6 (direction), BR-U2-12 (partial parse, never fabricate).
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime
from typing import Any, Callable

GenerateFn = Callable[[str], str]

# --------------------------------------------------------------------------- #
# Production model + where its weights live on the mounted volume (set once in
# app.py via _MODEL_ENV; default matches app.py's MODELS_DIR).
# --------------------------------------------------------------------------- #
MODEL_NAME = "Qwen/Qwen3-4B-Instruct"
MODELS_DIR = os.environ.get("RAQAM_MODELS_DIR", "/models")

# JSON schema for vLLM guided decoding — the ParsedSms shape, all fields
# OPTIONAL (a junk SMS is allowed to yield ``{}``). ``additionalProperties`` is
# closed so the model can only emit the five contract keys.
PARSED_SMS_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "amount": {"type": "integer"},
        "direction": {"type": "string", "enum": ["debit", "credit"]},
        "date": {"type": "string"},
        "merchant": {"type": "string"},
        "last4": {"type": "string"},
    },
    "additionalProperties": False,
}

# Date input formats accepted from the model, normalized → YYYY-MM-DD (BR-U2-5).
_DATE_FORMATS = (
    "%Y-%m-%d",   # 2026-08-24
    "%d-%b-%Y",   # 24-Aug-2026
    "%d %b %Y",   # 24 Aug 2026
    "%d/%m/%Y",   # 24/08/2026
    "%d-%m-%Y",   # 24-08-2026
    "%d-%m-%y",   # 24-08-26
    "%d/%m/%y",   # 24/08/26
)

_SYSTEM_PROMPT = (
    "You are a precise parser for Pakistani bank and wallet SMS alerts. You only "
    "output the requested JSON object and never invent fields the SMS does not state."
)


# --------------------------------------------------------------------------- #
# Prompt
# --------------------------------------------------------------------------- #
def build_prompt(text: str) -> str:
    """Build the extraction prompt for a single SMS ``text``."""
    return (
        "Extract the transaction details from this bank SMS and return them as a "
        "single JSON object.\n"
        "Include a field ONLY if the SMS clearly states it; otherwise omit it:\n"
        '- "amount": transaction amount as an integer number of PKR (no currency '
        "symbol, no thousands separators).\n"
        '- "direction": "debit" if money left the account (debited / withdrawn / '
        'spent / paid / purchase), "credit" if money came in (credited / received '
        "/ deposit).\n"
        '- "date": the transaction date as YYYY-MM-DD.\n'
        '- "merchant": the merchant or counterparty name.\n'
        '- "last4": the last 4 digits of the account or card, as a string.\n'
        "If the message is not a financial transaction (OTP, promo, balance-only "
        "alert), return an empty JSON object {}.\n\n"
        f"SMS:\n{text}"
    )


# --------------------------------------------------------------------------- #
# Pure extraction — generate_fn is injected.
# --------------------------------------------------------------------------- #
def parse_sms(text: str, generate_fn: GenerateFn) -> dict:
    """Extract a ``ParsedSms``-shaped dict from ``text`` using ``generate_fn``.

    ``generate_fn(prompt)`` returns the model's raw JSON string. The result is
    parsed and each field coerced/validated to the contract; unread or invalid
    fields are omitted, and a fully unreadable SMS (or malformed model output)
    yields ``{}``. Never raises on bad model output.
    """
    raw = generate_fn(build_prompt(text))
    data = _loads(raw)
    if not isinstance(data, dict):
        return {}

    out: dict[str, Any] = {}

    amount = _coerce_amount(data.get("amount"))
    if amount is not None:
        out["amount"] = amount

    direction = _coerce_direction(data.get("direction"))
    if direction is not None:
        out["direction"] = direction

    date = _coerce_date(data.get("date"))
    if date is not None:
        out["date"] = date

    merchant = _coerce_merchant(data.get("merchant"))
    if merchant is not None:
        out["merchant"] = merchant

    last4 = _coerce_last4(data.get("last4"))
    if last4 is not None:
        out["last4"] = last4

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
def _coerce_amount(value: Any) -> int | None:
    """Coerce to an integer number of PKR (BR-U2-3): strip currency words +
    thousands separators, keep the decimal, round to the nearest integer."""
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


def _coerce_direction(value: Any) -> str | None:
    """Only the two contract literals survive (BR-U2-6); anything else drops."""
    if isinstance(value, str):
        d = value.strip().lower()
        if d in ("debit", "credit"):
            return d
    return None


def _coerce_date(value: Any) -> str | None:
    """Normalize a known PK date format → YYYY-MM-DD; else drop (BR-U2-5).

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


def _coerce_merchant(value: Any) -> str | None:
    if isinstance(value, str):
        s = value.strip()
        if s:
            return s
    return None


def _coerce_last4(value: Any) -> str | None:
    """Exactly four digits, as a string; else drop."""
    if isinstance(value, (str, int)) and not isinstance(value, bool):
        s = str(value).strip()
        if re.fullmatch(r"\d{4}", s):
            return s
    return None


# --------------------------------------------------------------------------- #
# Production generator — lazy singleton. The ``vllm`` import happens INSIDE the
# loader, so this module (and ``api``) import with vllm/torch/GPU absent. This
# code path runs ONLY inside the GPU ``llm`` container defined in app.py.
# --------------------------------------------------------------------------- #
_llm = None


def _load_llm():
    """Load Qwen3-4B-Instruct via vLLM once, from the mounted models volume."""
    global _llm
    if _llm is None:
        from vllm import LLM  # heavy — lazy, GPU only

        _llm = LLM(model=MODEL_NAME, download_dir=MODELS_DIR)
    return _llm


def generate(prompt: str) -> str:
    """Production ``generate_fn``: guided-JSON decode ``prompt`` with vLLM.

    GUIDED decoding constrains the output to ``PARSED_SMS_JSON_SCHEMA``, so the
    returned string is always syntactically valid JSON matching the contract.
    """
    from vllm import SamplingParams  # heavy — lazy, GPU only
    from vllm.sampling_params import GuidedDecodingParams

    llm = _load_llm()
    guided = GuidedDecodingParams(json=PARSED_SMS_JSON_SCHEMA)
    params = SamplingParams(temperature=0.0, max_tokens=256, guided_decoding=guided)
    conversation = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    outputs = llm.chat(conversation, params)
    return outputs[0].outputs[0].text
