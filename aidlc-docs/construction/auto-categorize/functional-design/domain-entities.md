# Domain Entities — U1 auto-categorize

No persistent/synced entities (US-8). These are transient request/response and
per-user-prefs shapes. Wire contract == `modal/fixtures/categorize.*.json`.

## Request (client → /categorize)
```
CategorizeRequest {
  transactions: [ TargetTx ]
  context: { examples: [ Example ], categories: [ Cat ] }
}
TargetTx  { id: string, merchant: string(normalized), amount: int, type: 'expense'|'income', date: 'YYYY-MM-DD' }
Example   { merchant: string(normalized), amount: int, type: string, categoryId: string }
Cat       { id: string, name: string, group: string|null, type: string }
```

## Response (/categorize → client)
```
CategorizeResponse { suggestions: { [txId: string]: [ Suggestion ] } }   // 0..2 per tx
Suggestion { categoryId: string, confidence: number(0..1) }
```

## Transient client cache (component state, not stored)
```
SuggestionCache: Map<txId, Suggestion[]>   // cleared on id-set change / disable / apply
```

## Per-user prefs additions (ride existing prefs fall-through — NOT ledger)
```
prefs.aiAcceptCounts:  { [`${payeeKey}|${categoryId}`]: number }   // graduation counter
prefs.aiRuleDismissed: { [`${payeeKey}|${categoryId}`]: true }     // declined-offer flag
```
(Alongside `prefs.aiEnabled` from U0; persisted via the same `setPrefs`
fall-through to per-user storage. Both optional/absent = defaults.)

## Relationships
- Example.categoryId / Suggestion.categoryId / Cat.id → existing category ids
  (no new id space).
- payeeKey derives from `tx.merchant` via existing `payees.payeeKey`.
- Graduation writes reuse the existing payee entity (`upsertPayee`); U1 adds NO
  new synced collection.
