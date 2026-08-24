"""U4 insights digest — LLM narration for ``/digest``.

Mirrors the structure of ``models_llm.py`` (U2): a **pure** function whose model
backend is dependency-injected, plus a **production** generator that pulls in the
heavy library LAZILY so importing this module (and therefore ``api``) stays
light — pytest imports everything with ``vllm``/``torch`` absent and drives the
logic through a fake ``generate_fn``.

Two clearly separated concerns:

* ``narrate(aggregates, generate_fn)`` — the **pure** narration: build a prompt
  that hands the model the client-computed monthly aggregates and STRICTLY
  instructs it to use only the numbers present and invent none (FR-4.3), call the
  injected ``generate_fn(prompt) -> str`` (the model's raw JSON string), then
  parse + coerce the result into a ``DigestResponse``-shaped dict
  (``{headline, observations}``). Malformed / empty output yields a safe minimal
  valid response (empty headline, no observations). It NEVER raises.
* ``generate(prompt)`` — the **production** generator that serves the SAME
  ``Qwen/Qwen3-4B-Instruct`` model as U2 via vLLM with GUIDED (structured) JSON
  decoding constrained to ``DIGEST_JSON_SCHEMA`` (the DigestResponse shape), so
  the output is always syntactically valid JSON. It REUSES U2's model loader
  (``models_llm._load_llm``) — the same weights, the same ``llm`` image, the same
  GPU container — so NO new GPU function / image / model download is introduced.

Reuse (per the U4 plan): the ``/digest`` route reuses U2's ``llm_generate`` GPU
function (``api.llm_generate`` → ``modal.Function.from_name("raqam-ai",
"llm_generate")``) exactly as ``/parse-sms`` does; there is NO new GPU function.
Because that shared remote generator is not itself digest-schema guided,
``narrate`` is deliberately tolerant of whatever JSON comes back and always
returns a contract-valid dict.

Contract (schemas.DigestResponse / fixtures/digest.*.json):
  headline:str · observations:list[str]. Every FIGURE the UI shows is rendered
  from the client's own computed aggregates; the narrative text merely references
  them (the app never displays a model-emitted number as authoritative).
"""

from __future__ import annotations

import json
import re
from typing import Any, Callable

GenerateFn = Callable[[str], str]

# JSON schema for vLLM guided decoding — the DigestResponse shape. Both fields
# are required; ``additionalProperties`` is closed so the model can only emit the
# two contract keys.
DIGEST_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "headline": {"type": "string"},
        "observations": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["headline", "observations"],
    "additionalProperties": False,
}

# A safe, contract-valid fallback for empty / malformed model output. Constructs
# a ``DigestResponse`` without error and shows nothing invented (FR-4.3).
_SAFE_RESPONSE: dict[str, Any] = {"headline": "", "observations": []}

_SYSTEM_PROMPT = (
    "You are a careful personal-finance summarizer. You describe a month's "
    "spending using ONLY the pre-computed figures you are given, you never "
    "invent, estimate, or recompute any number, and you only output the "
    "requested JSON object."
)


# --------------------------------------------------------------------------- #
# Prompt — hands the model the aggregates and forbids inventing figures.
# --------------------------------------------------------------------------- #
def build_prompt(aggregates: dict) -> str:
    """Build the narration prompt from the client-computed ``aggregates``.

    The aggregates are embedded verbatim as JSON. The instructions strictly bind
    the model to those numbers (FR-4.3: no fabricated figures) and ask for a
    short headline plus a few grounded observations.
    """
    data = json.dumps(aggregates, ensure_ascii=False, sort_keys=True)
    return (
        "Below is a JSON object of PRE-COMPUTED monthly spending figures for one "
        "user (amounts are integer PKR). Write a short, plain-language digest of "
        "their month and return it as a single JSON object.\n"
        "STRICT RULES:\n"
        "- Use ONLY the numbers present in the DATA below. Do NOT invent, "
        "estimate, extrapolate, or compute any new figure. Every number you "
        "mention must appear in the DATA.\n"
        "- If a fact is not in the DATA, do not state it.\n"
        "- Be concise and neutral; describe what the numbers show, do not give "
        "advice.\n"
        "Return a JSON object with exactly these keys:\n"
        '- "headline": one short sentence summarizing the month.\n'
        '- "observations": an array of 2-4 short strings, each a factual note '
        "grounded in the DATA (an empty array is allowed if there is nothing to "
        "say).\n\n"
        f"DATA:\n{data}"
    )


# --------------------------------------------------------------------------- #
# Pure narration — generate_fn is injected.
# --------------------------------------------------------------------------- #
def narrate(aggregates: dict, generate_fn: GenerateFn) -> dict:
    """Narrate ``aggregates`` into a ``DigestResponse``-shaped dict.

    ``generate_fn(prompt)`` returns the model's raw JSON string. The result is
    parsed and coerced to ``{headline: str, observations: list[str]}``. Any
    malformed, empty, or wrong-shaped output degrades to a safe minimal valid
    response (empty headline, no observations) — this function NEVER raises.
    """
    raw = generate_fn(build_prompt(aggregates))
    data = _loads(raw)
    if not isinstance(data, dict):
        return dict(_SAFE_RESPONSE)

    headline = data.get("headline")
    if not isinstance(headline, str):
        headline = ""

    observations: list[str] = []
    raw_obs = data.get("observations")
    if isinstance(raw_obs, list):
        for item in raw_obs:
            if isinstance(item, str) and item.strip():
                observations.append(item)

    return {"headline": headline, "observations": observations}


# --------------------------------------------------------------------------- #
# JSON tolerance — accept a clean object, a code-fenced object, or an object
# embedded in surrounding text; anything else → None (→ safe response).
# (Mirrors models_llm._loads so the digest path is equally forgiving.)
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
# Production generator — guided-JSON decode to DIGEST_JSON_SCHEMA, REUSING U2's
# already-loaded Qwen3-4B model (models_llm._load_llm). No new model / image /
# GPU function is introduced: this runs the SAME weights in the SAME ``llm``
# container as /parse-sms. The heavy vLLM import happens INSIDE the function, so
# this module (and ``api``) import with vllm/torch/GPU absent.
# --------------------------------------------------------------------------- #
def generate(prompt: str) -> str:
    """Production ``generate_fn``: guided-JSON decode ``prompt`` with vLLM.

    GUIDED decoding constrains the output to ``DIGEST_JSON_SCHEMA``, so the
    returned string is always syntactically valid JSON matching DigestResponse.
    Reuses U2's model loader — no new GPU function, image, or model download.
    """
    from vllm import SamplingParams  # heavy — lazy, GPU only
    from vllm.sampling_params import GuidedDecodingParams

    try:
        from . import models_llm  # package context (pytest)
    except ImportError:  # pragma: no cover - Modal script context
        import models_llm  # type: ignore

    llm = models_llm._load_llm()  # SAME singleton as /parse-sms — reused, not reloaded
    guided = GuidedDecodingParams(json=DIGEST_JSON_SCHEMA)
    params = SamplingParams(temperature=0.2, max_tokens=512, guided_decoding=guided)
    conversation = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    outputs = llm.chat(conversation, params)
    return outputs[0].outputs[0].text
