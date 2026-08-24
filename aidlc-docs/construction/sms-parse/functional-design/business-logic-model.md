# Business Logic Model — U2 sms-parse

Client-side pure logic in `src/lib/smsParse.js`; service LLM tier at
`/parse-sms`. The editor is always the gate — U2 only PREFILLS, never writes
(US-9..US-12).

## L1 — Tier-1 deterministic parse (client, `parseSmsLocal(text)`)
1. Normalize the raw text lightly (collapse whitespace; keep original for notes).
2. Walk the pattern registry in order; the first entry whose `test(text)` is true
   runs its `extract(text)` → partial `ParsedSms`.
3. If no bank entry matches, try the GENERIC fallback pattern (amount + a
   debit/credit keyword + optional `A/C **NNNN` tail).
4. A result is "usable" only if it has at least an `amount` AND a `direction`.
   Usable → return it; otherwise return `null` (→ tier-2 or failure path).
- Pure, synchronous, offline. No amount → not usable.

## L2 — Field extraction rules (shared by every registry entry)
- **amount**: first currency-tagged number (`Rs`/`PKR`/`Rs.` +
  `[\d,]+(\.\d+)?`); strip thousands separators; round to integer PKR
  (BR-U2-3). The SMS digits are authoritative — plan numberFormat is NOT applied.
- **direction**: keyword scan — debit/debited/withdrawn/spent/paid/purchase →
  `debit`; credit/credited/received/deposit → `credit`. Ambiguous/none → entry
  may still return null.
- **merchant**: text after `at`/`to`/`@`/merchant-label up to the next
  delimiter (date, "Avbl Bal", newline); trimmed; empty allowed.
- **last4**: `A/C\s*\**\s*(\d{4})`, `card ending (\d{4})`, `xxNNNN` → the 4
  digits; else omitted.
- **date**: first date in a known PK format → `YYYY-MM-DD` (BR-U2-5); else
  omitted (seed defaults to today).

## L3 — Tier-2 LLM parse (service `/parse-sms`, client-triggered)
- Called ONLY when L1 returned null AND `useAI().enabled` (US-11).
- Request `{ text }`; response `{ parsed: ParsedSms | {} }` (same shape; unread
  fields omitted). No account/category resolution server-side — the service
  never sees the user's accounts (privacy).
- Client treats the LLM `parsed` exactly like an L1 result → L4/L5.

## L4 — Account resolution (client, `resolveAccount(parsed, S)`)
- If `parsed.last4`: find accounts+cards with `last4 === parsed.last4`.
  - exactly ONE → `{ ref }` = `acc:<id>` (account) or `card:<id>` (card).
  - zero / >1 → `{}` (leave the field blank; never guess — BR-U2-4).

## L5 — Seed building (client, `toTxSeed(parsed, S)`)
- `type` = `direction === 'credit' ? 'income' : 'expense'`.
- `amount` = String(parsed.amount) (form amounts are strings).
- `date` = parsed.date || today (`todayStr()`), `YYYY-MM-DD`.
- `merchant` = parsed.merchant || ''.
- Account field by type: expense → `payWith = ref`; income → `account = ref`
  (from L4; omitted when blank).
- Returns the partial seed for `openers.addTx(openDrawer, type, seed)`.

## L6 — Orchestration (the entry flow)
```
paste text
  → p = parseSmsLocal(text)                     # L1
  → if !p and enabled: p = await ai.parseSms(text)   # L3 (warming state shown)
  → if p (usable):  openers.addTx(openDrawer, seedType(p), toTxSeed(p, S))
  → else:           openers.addTx(openDrawer, 'expense', { notes: text })  # US-12
```
Any thrown AiError in L3 falls into the `else` branch (empty editor + notes).
The editor then validates/saves exactly like manual entry — the human confirms.

## Data flow (text)
SMS text → parseSmsLocal (pure) │ or → /parse-sms (LLM) → ParsedSms →
resolveAccount (reads accounts/cards) + toTxSeed → openers.addTx (existing) →
user reviews/saves → existing addTransaction. No AI write.
