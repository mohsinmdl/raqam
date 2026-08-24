# Business Rules — U2 sms-parse

Constants collected in `src/lib/smsParse.js`. Stories in brackets.

| ID | Rule | Value / logic |
| --- | --- | --- |
| BR-U2-1 | Tier-1 first [US-9] | Deterministic client parse runs first, offline, no network; LLM only on its failure |
| BR-U2-2 | Registry order [Q1] | Bank entries tried in order; first `test` hit wins; a generic amount+direction+tail fallback runs before giving up |
| BR-U2-3 | Amount = SMS digits [Q3] | Strip currency words + thousands separators, keep decimal, round to **integer PKR**; plan display numberFormat is NOT applied to parsing |
| BR-U2-4 | Account never guessed [US-10] | last4 fills `acc:`/`card:` ref only on **exactly one** match across accounts+cards; 0 or >1 → blank |
| BR-U2-5 | Date formats [Q5] | Parse `DD-Mon-YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`, `DD-MM-YY` → `YYYY-MM-DD`; unparseable → **today**; never invent a non-today date |
| BR-U2-6 | Direction → type [Q4] | debit→`expense`, credit→`income`; unknown direction → result not usable |
| BR-U2-7 | Usable threshold | A parse is usable only with amount AND direction; else null (→ LLM or notes fallback) |
| BR-U2-8 | LLM gate [US-11] | `/parse-sms` called only when tier-1 null AND `useAI().enabled`; same ParsedSms shape; account/date resolution stays client-side |
| BR-U2-9 | Never lose the SMS [US-12] | Total parse failure (or LLM off/failed) → empty editor with the raw pasted text in `notes` |
| BR-U2-10 | Editor is the gate [US-9] | U2 only prefills via `openers.addTx`; nothing writes until the user saves; validation identical to manual entry |
| BR-U2-11 | Privacy | The service receives only the SMS text; never the account list, never stores the text (U0 no-retention) |
| BR-U2-12 | Partial parse | Present fields fill; missing fields fall to defaults (date→today, account→blank); never fabricated |

## Error / edge scenarios
- Amount with decimals ("Rs 5,420.00") → 5420 (rounded).
- Both "debited" and "Avbl Bal ... credit" wording → the transaction verb near
  the amount wins; registry entries target the primary verb.
- last4 that matches an account AND a card → treated as ambiguous → blank.
- Non-transaction SMS (OTP, promo) → not usable → LLM (if on) likely returns
  `{}` → empty editor + notes.
- LLM returns an amount but garbage direction → not usable → notes fallback.
