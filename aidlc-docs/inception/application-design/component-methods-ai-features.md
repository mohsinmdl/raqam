# Component Methods & Route Contracts — AI Features (Cycle 2)

Plain JSON contracts (design plan Q3=A). `schemas.py` is the server-side source
of truth; `ai.js` helpers mirror it client-side. Detailed business rules land in
Functional Design (U1, U2); this file pins signatures and I/O shapes.

## C1 — AI Service routes

### GET /health  (no auth)
→ `200 { ok: true, version: string }`

### POST /categorize  (auth)
```jsonc
// request
{
  "transactions": [ { "id": "t1", "merchant": "IMTIAZ", "amount": 5420, "type": "expense", "date": "2026-08-24" } ],
  "context": {
    "examples":   [ { "merchant": "IMTIAZ SUPER", "amount": 3200, "type": "expense", "categoryId": "groceries" } ],
    "categories": [ { "id": "groceries", "name": "Groceries", "group": "Needs", "type": "expense" } ]
  }
}
// response — per tx, 0..2 entries, ids ONLY from context.categories
{ "suggestions": { "t1": [ { "categoryId": "groceries", "confidence": 0.91 } ] } }
```

### POST /parse-sms  (auth)
```jsonc
// request
{ "text": "HBL: Rs 5,420 debited from A/C **1234 at IMTIAZ..." }
// response — fields the model could not extract are omitted; null parse = {}
{ "parsed": { "amount": 5420, "direction": "debit", "date": "2026-08-24", "merchant": "IMTIAZ", "last4": "1234" } }
```
(Account resolution is CLIENT-side — the server never sees the account list.)

### POST /parse-receipt  (auth)
Request: `multipart/form-data` with `image` (jpeg/png/webp, ≤8 MB).
→ `{ "parsed": { "merchant": "Imtiaz Super Market", "date": "2026-08-24", "total": 5420 } }` (fields omitted when unreadable)

### POST /digest  (auth)
```jsonc
// request — aggregates only, no raw transactions
{ "month": "2026-08",
  "stats": { "total": 245000, "avgDaily": 8166, "mostFrequent": {"name":"Groceries","count":14}, "largestOutflow": {"merchant":"Alfatah","amt":42000} },
  "byCategory": [ { "name": "Groceries", "amt": 88000, "pct": 36, "prevAmt": 61000 } ],
  "incomeExpense": [ { "month": "2026-06", "income": 400000, "expense": 210000 } ] }
// response
{ "headline": "Spending is up 17% this month, led by groceries.",
  "observations": [ "Groceries rose 44% vs July (Rs 88,000 vs Rs 61,000)." ] }
```

Errors (all routes): `401` invalid/missing JWT · `408` model timeout · `413`
image too large · `422` schema violation · `500` model failure. Bodies:
`{ "error": string }` (no request content echoed — NFR-2).

## C2 — `src/lib/ai.js`

```js
aiConfigured(): boolean                    // VITE_AI_ENDPOINT present
health(): Promise<{ok,version}>            // no auth
categorize(txs, context): Promise<SuggestionsMap>   // throws AiError
parseSms(text): Promise<ParsedSms|null>
parseReceipt(file): Promise<ParsedReceipt|null>
digest(aggregates): Promise<{headline, observations}>
// internal: authedFetch(path, init) — JWT attach, timeout, one 401-refresh-retry
// AiError: { kind: 'cold'|'auth'|'unavailable'|'bad-response', status? }
```

## C3 — `src/ui/ai/useAI.js`

```js
useAI(): { enabled, available, warming, categorize, parseSms, parseReceipt, digest }
// enabled  = prefs.aiEnabled && aiConfigured()
// warming  = a tracked call has been in-flight > 3s (clears on settle)
// wrappers = ai.js calls + warming bookkeeping; throw-through for degradation
```

## C4 — `src/lib/aiSuggest.js` (rules detailed in U1 Functional Design)

```js
buildContext(S): { examples, categories } | null    // null under 30-history guard
collectTargets(S, visibleIds): TxLite[]             // needs-category rows only
validateSuggestions(map, S): SuggestionsMap         // drop foreign/archived ids
recordAccept(prefs, payeeKey, categoryId): { prefsPatch, graduationOffer|null }
shouldOfferRule(prefs, payeeKey, categoryId): boolean
```

## C5 — `src/lib/smsParse.js` (rules detailed in U2 Functional Design)

```js
parseSmsLocal(text): ParsedSms | null      // tier 1, pure, per-bank registry
resolveAccount(parsed, S): { payWith? }     // exactly-one last4 match, else {}
toTxSeed(parsed, S): AddTxSeed              // openers.addTx-shaped seed
```

## C6 — `src/lib/digestData.js`

```js
buildDigestPayload(S, month): DigestAggregates   // from existing selectors only
```

## C7 — UI surfaces (props sketch)

`SuggestionChips({ txId })` · `PasteSmsEntry({ onSeed })` ·
`ReceiptScanEntry({ onSeed })` · `InsightsCard({ month })` ·
UserMenu AI toggle row (uses `setPrefs({ aiEnabled })`).
