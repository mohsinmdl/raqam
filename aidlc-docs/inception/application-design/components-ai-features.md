# Components — AI Features (Cycle 2)

Two new deployable/buildable components plus client feature modules. Nothing in
the existing store/sync core changes ownership; AI modules read store data and
write ONLY through existing actions.

## C1 — AI Service (`modal/`) — NEW, Python

The app's first custom backend. One Modal app, deployed by `modal deploy`.

| File | Responsibility |
| --- | --- |
| `modal/app.py` | Modal app + FastAPI ASGI web endpoint; route handlers; wires auth dependency; delegates generation to GPU functions |
| `modal/auth.py` | Supabase JWT verification (JWKS cached at container start; HS256 secret fallback via Modal Secret); FastAPI dependency returning user id or 401 |
| `modal/schemas.py` | Pydantic request/response models for all routes (the contract source of truth) |
| `modal/models_llm.py` | GPU function: small instruct LLM (SMS long-tail parse, digest narration) |
| `modal/models_vlm.py` | GPU function (separate image): VLM for receipt parsing — loads ONLY on `/parse-receipt` calls |
| `modal/embed.py` | CPU embedding model used by `/categorize` (kNN over request-supplied examples) |

Properties: stateless (no storage, no logging of request content — NFR-2);
scale-to-zero on every function (NFR-3); CORS restricted to app origins (NFR-1).

## C2 — Client AI core (`src/lib/ai.js`) — NEW, pure JS

The ONLY place the app talks to the AI service (mirrors `sync.js`'s role for
Supabase). No React. Responsibilities: endpoint config (`VITE_AI_ENDPOINT`),
`aiConfigured()`, JWT attach from `supabase.auth.getSession()`, per-route typed
helpers, per-request timeout, single 401 → `refreshSession()` → retry, error
normalization (`{ kind: 'cold'|'auth'|'unavailable'|'bad-response' }`).

## C3 — AI state hook (`src/ui/ai/useAI.js`) — NEW, React

Bridges C2 to components: `{ enabled, available, warming, callX }` where
`enabled = prefs.aiEnabled && aiConfigured()`. Owns the warming-state timer
(>3s in-flight → warming; FR-0.8) and the global "AI off ⇒ render nothing"
contract (US-1).

## C4 — Suggestion engine (`src/lib/aiSuggest.js`) — NEW, pure JS (U1)

Context assembly (≤200 recent categorized txs + active category list), the
≥30-history guard, debounced batching of visible needs-category rows, response
validation (drop ids not in the plan — US-8), confidence floor, acceptance
counting + payee-rule graduation trigger (≥3 same payee→category accepts).

## C5 — SMS parser library (`src/lib/smsParse.js`) — NEW, pure JS (U2)

Tier-1 deterministic parsing: per-bank pattern registry (HBL, Meezan, UBL,
Alfalah, easypaisa/TMB, JazzCash/MMBL, extensible), normalized parse result,
last4 → account/card resolution (exactly-one-match rule), editor-seed builder
(`toTxSeed(parsed, S)` → `openers.addTx` seed shape). Zero network.

## C6 — Digest data assembly (`src/lib/digestData.js`) — NEW, pure JS (U4)

Builds the aggregate payload for `/digest` from EXISTING selectors
(`spendingReport.js`, `reports.js`) — no raw transactions, only aggregates
(FR-4.2). Also renders-side helper mapping the narrative back to client-computed
figures (FR-4.3).

## C7 — Feature UI surfaces — NEW, React (thin)

| Surface | Home | Unit |
| --- | --- | --- |
| Suggestion chips | extends `NeedsCategoryPill` (TxChips.jsx) + phone catChip (TxPhoneList.jsx) | U1 |
| Graduation prompt | non-blocking toast/inline offer after 3rd accept | U1 |
| Paste-SMS entry | sheet (phone) + dialog (desktop), Base UI primitives | U2 |
| Receipt scan entry | camera/file input + progress state | U3 |
| Insights card | Reflect Overview section w/ generate/retry states | U4 |
| AI toggle row | UserMenu toggle cluster (app-lock row pattern) | U0 |

## Existing components consumed (NOT modified in responsibility)

`openers.addTx(seed)` (prefill), `setTransactionsCategory` (the one categorize
write), `upsertPayee` (rule graduation), `payees.js` helpers (payeeKey),
`validate.js` (unchanged — editor validates seeds like manual input),
`StoreProvider.setPrefs` (aiEnabled persistence), report selectors (digest).
