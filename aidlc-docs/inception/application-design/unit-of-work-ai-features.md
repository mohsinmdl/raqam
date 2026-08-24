# Units of Work — AI Features (Cycle 2)

Five units; each merges to main as its own PR (plan Q1=A), inert behind the
default-OFF toggle until the operator enables it. Components C1–C7 from
components-ai-features.md; each component is owned by exactly one unit.

## U0 — ai-foundation
- **Purpose**: Everything every feature needs; ships NO user-visible feature.
- **Owns**: C1 skeleton (`modal/app.py`, `auth.py`, `schemas.py` for all
  routes, `/health`; route handlers stubbed 501 for U1–U4 routes), C2 `ai.js`,
  C3 `useAI`, C7 toggle row; `.env.example` + deploy notes.
- **Code**: `modal/` (new), `src/lib/ai.js`, `src/ui/ai/useAI.js`,
  `src/components/UserMenu.jsx` (toggle row), `.env.example`.
- **Done means**: service deployable + `/health` live; JWT gate proven (401
  anonymous, 200 authed); toggle persists; warming + degradation primitives
  exist with tests; US-1..US-4 criteria met (US-4 live parts via smoke).

## U1 — auto-categorize
- **Purpose**: Suggestion chips → one-tap categorize → payee-rule graduation.
- **Owns**: `/categorize` implementation (C1 `embed.py`, embeddings-only kNN —
  plan Q2=A; no LLM), C4 `aiSuggest.js`, C7 chips + graduation prompt.
- **Code**: `modal/embed.py`, `src/lib/aiSuggest.js`, `src/ui/ai/SuggestionChips.jsx`,
  edits in `TxChips.jsx`/`TxPhoneList.jsx`/`Transactions.jsx`/`Dashboard.jsx`.
- **Done means**: US-5..US-8 criteria met (unit+mock); shared fixtures exercise
  the contract from both sides.

## U2 — sms-parse
- **Purpose**: Paste bank SMS → prefilled editor; regex-first, LLM long tail.
- **Owns**: C5 `smsParse.js` (pattern registry, last4 resolve, seed builder),
  `/parse-sms` implementation (C1 `models_llm.py` first real GPU route), C7
  paste entry surfaces.
- **Code**: `src/lib/smsParse.js`, `modal/models_llm.py`, `src/ui/ai/PasteSms*.jsx`,
  entry-point wiring (phone sheet + desktop).
- **Done means**: US-9..US-12 criteria met; parser registry under fast-check
  PBT; live LLM spot-check per US-11.

## U3 — receipt-scan
- **Purpose**: Photo → prefilled transaction.
- **Owns**: `/parse-receipt` (C1 `models_vlm.py`, isolated function/image), C7
  scan entry; reuses U1's suggestion contract (category prefill) and U2's
  seed-builder path.
- **Code**: `modal/models_vlm.py`, `src/ui/ai/ReceiptScan.jsx`, entry wiring.
- **Done means**: US-13..US-15 criteria met; no-persistence checks per US-15.

## U4 — insights-digest
- **Purpose**: On-demand narrative over Reflect data.
- **Owns**: `/digest` (reuses U2's LLM function), C6 `digestData.js`, C7
  insights card on Reflect Overview.
- **Code**: `src/lib/digestData.js`, `src/ui/reflect/InsightsCard.jsx` (or
  colocated with existing Reflect overview components), `modal/app.py` route.
- **Done means**: US-16..US-18 criteria met; digest figures provably from
  client aggregates.

## Cross-unit rules
- A unit may edit files owned by an earlier merged unit only additively
  (e.g. U1 adds its route handler into `modal/app.py`).
- No unit touches store reducers/sync (`actions.js` untouched; writes go
  through existing exported actions from UI code only).
- Every unit keeps the full existing test suite green and adds its own.
