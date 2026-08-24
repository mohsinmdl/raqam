"""Pydantic v2 contract models for the ``raqam-ai`` service.

This module is the **single server-side source of truth** for every route's
request and response shape. The client mirror lives in ``src/lib/ai.js`` and the
canonical examples in ``modal/fixtures/*.json`` are validated against these
models by the pytest suite, keeping both sides in lockstep (NFR maintainability).

Conventions (from the approved contract, ``component-methods-ai-features.md``):

* Money is **integer PKR** — every amount/total/income/expense is an ``int``.
* Dates are ``YYYY-MM-DD`` strings (kept as ``str``; no timezone semantics).
* Field names are **camelCase** to match the JSON wire contract and the JS
  mirror verbatim (``categoryId``, ``avgDaily``, ``byCategory`` …).
* ``extra="forbid"`` everywhere: the contract is closed, so an unexpected key is
  a contract violation, not silently ignored.
* For ``/parse-sms`` and ``/parse-receipt`` the ``parsed`` object omits fields
  the model could not extract; a null parse is ``{}``. Those fields are therefore
  all ``Optional`` with a ``None`` default, and serialization uses
  ``exclude_none`` at the handler so omitted fields never appear on the wire.

This module imports ONLY pydantic — no ``modal`` and no model libraries — so it
is importable in any test or client-tooling context.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class _Contract(BaseModel):
    """Base for all contract models: closed shape, no stray keys."""

    model_config = ConfigDict(extra="forbid")


# --------------------------------------------------------------------------- #
# Shared / infra
# --------------------------------------------------------------------------- #
class HealthResponse(_Contract):
    """``GET /health`` — no auth."""

    ok: bool
    version: str


class ErrorResponse(_Contract):
    """Shared error body for every route (401/408/413/422/429/500).

    The message is human-readable and NEVER echoes request content (NFR-2,
    no-retention).
    """

    error: str


# --------------------------------------------------------------------------- #
# POST /categorize
# --------------------------------------------------------------------------- #
class CategorizeTransaction(_Contract):
    """A transaction that needs a category suggestion."""

    id: str
    merchant: str
    amount: int
    type: str
    date: str


class CategorizeExample(_Contract):
    """A past user-confirmed (merchant → category) example for few-shot context."""

    merchant: str
    amount: int
    type: str
    categoryId: str


class Category(_Contract):
    """A category the model may choose from. Suggestions MUST use one of these ids."""

    id: str
    name: str
    group: str
    type: str


class CategorizeContext(_Contract):
    examples: list[CategorizeExample]
    categories: list[Category]


class CategorizeRequest(_Contract):
    transactions: list[CategorizeTransaction]
    context: CategorizeContext


class CategorySuggestion(_Contract):
    categoryId: str
    confidence: float = Field(ge=0.0, le=1.0)


class CategorizeResponse(_Contract):
    """Per transaction id, 0..2 suggestions; category ids only from the request context."""

    suggestions: dict[str, list[CategorySuggestion]]


# --------------------------------------------------------------------------- #
# POST /parse-sms
# --------------------------------------------------------------------------- #
class ParseSmsRequest(_Contract):
    text: str


class ParsedSms(_Contract):
    """Extracted SMS fields. Any field the model could not read is omitted;
    a fully unreadable SMS yields ``{}``."""

    amount: Optional[int] = None
    direction: Optional[Literal["debit", "credit"]] = None
    date: Optional[str] = None
    merchant: Optional[str] = None
    last4: Optional[str] = None


class ParseSmsResponse(_Contract):
    parsed: ParsedSms


# --------------------------------------------------------------------------- #
# POST /parse-receipt  (request is multipart/form-data, no JSON request model)
# --------------------------------------------------------------------------- #
class ParsedReceipt(_Contract):
    """Extracted receipt fields; unreadable fields omitted."""

    merchant: Optional[str] = None
    date: Optional[str] = None
    total: Optional[int] = None


class ParseReceiptResponse(_Contract):
    parsed: ParsedReceipt


# --------------------------------------------------------------------------- #
# POST /digest
# --------------------------------------------------------------------------- #
class MostFrequent(_Contract):
    name: str
    count: int


class LargestOutflow(_Contract):
    merchant: str
    amt: int


class DigestStats(_Contract):
    total: int
    avgDaily: int
    mostFrequent: MostFrequent
    largestOutflow: LargestOutflow


class DigestCategory(_Contract):
    name: str
    amt: int
    pct: int
    prevAmt: int


class IncomeExpensePoint(_Contract):
    month: str
    income: int
    expense: int


class DigestRequest(_Contract):
    month: str
    stats: DigestStats
    byCategory: list[DigestCategory]
    incomeExpense: list[IncomeExpensePoint]


class DigestResponse(_Contract):
    headline: str
    observations: list[str]
