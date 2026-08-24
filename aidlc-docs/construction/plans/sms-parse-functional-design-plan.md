# Functional Design Plan — U2 sms-parse

Answers PRE-FILLED with recommendations — edit any you disagree with, then
approve. Stories US-9..US-12. Regex-first (client, offline), LLM long-tail
(`/parse-sms`), account matched by stored last4, result PREFILLS the existing
add-transaction editor (never writes).

## Execution Checklist (generation after approval)

- [x] business-logic-model.md (two-tier parse pipeline, field extraction, seed building)
- [x] business-rules.md (extraction/normalization/matching rules as a table)
- [x] domain-entities.md (ParsedSms shape, bank pattern registry entry, AddTxSeed)
- [x] frontend-components.md (Paste-SMS entry: sheet/dialog, states, testids)

## Questions

## Question 1
Pattern registry shape (client tier-1)?

A) A data-driven registry: an array of `{ bank, test, extract }` entries where
`test` is a cheap RegExp identifying the sender/format and `extract` pulls
fields. Adding a bank = one entry, unit-tested in isolation. A generic
"amount + debit/credit keyword + optional acct-tail" fallback pattern catches
common shapes even for unlisted banks before giving up to the LLM

B) One giant regex with named groups per bank

C) Other (please describe after the answer tag below)

\[Answer]: A

## Question 2
Which banks/wallets ship in the v1 registry?

A) The institutions Raqam already seeds + the big wallets: HBL, UBL, MCB,
Bank Alfalah, Meezan, Faysal, BankIslami, Standard Chartered, JazzCash
(Mobilink/MMBL), easypaisa (Telenor/TMB), Raqami — best-effort patterns from
common SMS shapes; anything unmatched → LLM. (Patterns are heuristic, refined
as real messages arrive; the LLM tier is the safety net so coverage gaps never
block entry)

B) Only 2–3 banks in v1, everything else to the LLM

C) Other (please describe after the answer tag below)

\[Answer]: A

## Question 3
Amount / number-format parsing?

A) Parse the SMS's own digits directly (strip thousands separators, keep the
decimal, round to integer PKR) — the message is authoritative. Do NOT apply the
plan's display number-format here (that's for rendering, not parsing). Currency
symbol/words ("Rs", "PKR", "Rs.") stripped

B) Interpret via the active plan's numberFormat

C) Other (please describe after the answer tag below)

\[Answer]: A

## Question 4
Direction → transaction type, and account/card field?

A) debit → `expense`, credit → `income`. Account resolution via stored last4
(BR from U2 stories): exactly-one match across accounts+cards fills the right
prefixed ref (`acc:<id>` for an account, `card:<id>` for a card) into the seed's
payWith (expense) / account (income); zero or multiple matches → leave blank.
Never guess an account

B) Always expense; user flips type manually

C) Other (please describe after the answer tag below)

\[Answer]: A

## Question 5
Date parsing + fallback?

A) Parse an explicit date in the SMS (common PK formats: `24-Aug-2026`,
`24/08/2026`, `2026-08-24`, `24-08-26`) → normalize to `YYYY-MM-DD`. No parseable
date → default to TODAY (the editor shows it; user can change). Never invent a
non-today date

B) Always default to today, ignore SMS dates

C) Other (please describe after the answer tag below)

\[Answer]: A

## Question 6
LLM-tier trigger, contract, and failure (US-11/US-12)?

A) Call `/parse-sms` ONLY when tier-1 returns null AND `useAI().enabled`. The
service returns the same `ParsedSms` shape (fields it can't read omitted);
client runs the SAME seed-building + last4 resolution on the result. If AI is
off/unreachable OR the LLM also fails → open the editor EMPTY with the pasted
SMS text in `notes` (US-12), so nothing is lost. A partial LLM parse (amount but
no date) fills what it has, today's date default applies

B) Always call the LLM (skip tier-1) — simpler, costs on every paste

C) Other (please describe after the answer tag below)

\[Answer]: A

## Question 7
Entry point surface (US-9)?

A) A "Paste bank SMS" affordance: on phone a bottom sheet with a textarea +
Parse button; on desktop a small dialog. Reachable from the add-transaction
entry cluster (the same places "add transaction" lives). On Parse → close the
sheet and open the prefilled editor (TxSheet on phone / TxForm on desktop) via
the existing `openers.addTx(openDrawer, type, seed)`

B) A dedicated route/screen

C) Other (please describe after the answer tag below)

\[Answer]: A
