# Domain Entities — U2 sms-parse

No persistent/synced entities. Transient parse shapes + the (code-only) pattern
registry. Wire contract == `modal/fixtures/parse-sms.*.json`.

## ParsedSms (both tiers produce this; all fields optional)
```
ParsedSms {
  amount?:    int          // integer PKR
  direction?: 'debit'|'credit'
  date?:      'YYYY-MM-DD'
  merchant?:  string
  last4?:     string(4 digits)
}
```
"Usable" (L1) requires `amount` and `direction`. A null parse = absent/{}.

## Bank pattern registry entry (client, code-only — `src/lib/smsParse.js`)
```
BankPattern {
  bank:    string            // label, for tests/debug
  test:    (text) => bool    // cheap identifier RegExp match
  extract: (text) => ParsedSms | null
}
```
Registry = ordered `BankPattern[]` ending with a generic fallback entry.

## Request/response (client ↔ /parse-sms)
```
ParseSmsRequest  { text: string }
ParseSmsResponse { parsed: ParsedSms | {} }
```

## AddTxSeed (subset of the existing add-tx form — from `toTxSeed`)
```
{ type: 'expense'|'income',
  amount: string, date: 'YYYY-MM-DD', merchant: string,
  payWith?: 'acc:<id>'|'card:<id>',   // expense
  account?: 'acc:<id>'|'card:<id>',   // income
  notes?: string }                    // failure path: raw SMS
```
Passed to the EXISTING `openers.addTx(openDrawer, type, seed)`; no new form
shape, no new id space, no new synced collection.

## Relationships
- `last4` → existing `accounts[].last4` / `cards[].last4` (string, `''` when
  absent) via L4.
- Seed refs use the existing `acc:`/`card:` prefix convention.
- No prefs additions in U2 (unlike U1).
