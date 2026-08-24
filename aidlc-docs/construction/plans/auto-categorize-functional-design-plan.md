# Functional Design Plan — U1 auto-categorize

Answers PRE-FILLED with recommendations — edit any you disagree with, then
approve. Stories US-5..US-8. Scope fixed at Units Generation: **embeddings-only
kNN over the user's own history; no LLM fallback in v1** (Q2=A there).

## Execution Checklist (generation after approval)

- [x] business-logic-model.md (context assembly, batch, embedding kNN vote, confidence, graduation)
- [x] business-rules.md (the numeric thresholds + integrity rules as a table)
- [x] domain-entities.md (SuggestionRequest/Response, accept-counter state shapes)
- [x] frontend-components.md (SuggestionChips + graduation prompt: props, states, interactions, testids)

## Questions

## Question 1
Confidence scoring from kNN — how is a suggestion's confidence computed and floored?

A) Cosine-similarity kNN over embedded merchant strings (e5 "query:"/"passage:" convention): take the k=10 nearest categorized examples, vote by summed similarity per category, confidence = winning category's share of total similarity. **Emit a chip only if** top similarity ≥ 0.80 AND winner's vote share ≥ 0.60; emit the 2nd chip only if it also clears share ≥ 0.25. Tunable constants in one place

B) Simpler: nearest-single-neighbour category, fixed 0.85 similarity floor, always one chip

C) Other (please describe after the answer tag below)

\[Answer]: A

## Question 2
What text/features get embedded for matching?

A) Normalized merchant string only (the existing `payeeKey`-style lower/trim, strip a leading emoji like splitTx's `catName`), because merchant is what recurs. Amount/date are NOT embedded (they add noise); type is used as a HARD filter (an expense tx only matches expense examples/categories)

B) Merchant + amount bucket + day-of-month as a combined feature string

C) Other (please describe after the answer tag below)

\[Answer]: A

## Question 3
Graduation trigger (US-7) — exact rule and where the counter lives?

A) Count in per-user prefs (rides the existing prefs fall-through — same place aiEnabled lives, NOT the ledger): a map `{ "<payeeKey>|<categoryId>": n }`. Increment on each ACCEPT whose tx merchant→payeeKey and chosen category match. At n===3 (third accept), fire the offer ONCE; on accept → `upsertPayee({ autoCategorize, autoCategoryId })` and stop suggesting for that payee; on decline → set a "dismissed" flag for that pair so it never re-offers. Counters are advisory UI state; losing them only delays an offer

B) Count derived on the fly from the audit log (no stored counter) — heavier, and audit is plan-scoped/capped

C) Other (please describe after the answer tag below)

\[Answer]: A

## Question 4
Chip interaction model on a row (US-6)?

A) Up to 2 chips shown inline where the needs-category pill is. Left-tap a chip = apply that category immediately (existing `setTransactionsCategory`). The pill itself still opens the full picker (unchanged) for "none of these". No long-press/secondary menu in v1. On phone, chips are pointer-`stopPropagation` spans (same constraint TxPhoneList already documents for its catChip)

B) One chip + a "more" affordance opening the picker

C) Other (please describe after the answer tag below)

\[Answer]: A

## Question 5
Batch trigger & recompute (US-5, US-8) — when do suggestions (re)fetch?

A) One debounced batched request (~800ms) after the visible needs-category set settles, covering all visible uncategorized rows; cache results in component state keyed by txId. Re-fetch only when the visible needs-category id-set changes (not on every render/scroll). Accepting/among rows does NOT refetch the rest. A failed batch → no chips, silent (US-3); never auto-retried

B) Fetch per row as it scrolls into view

C) Other (please describe after the answer tag below)

\[Answer]: A
