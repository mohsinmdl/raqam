# User Stories — Structured Transaction Search (Cycle 4)

**Persona**: Ledger-keeper (reused from prior cycles) — someone reconciling and
reviewing their own transactions on the Transactions screen.

Each story is Given/When/Then; acceptance criteria map to the requirements.

- **US-1 — Find by account.** Given transactions across several accounts, when I
  type part of an account's name and pick the "Account: …" suggestion, then the
  list narrows to rows touching that account (including transfers to/from it),
  and a chip names the filter.

- **US-2 — Find by category.** When I type part of a category name and pick the
  "Category: …" suggestion, then only rows in that exact category remain.

- **US-3 — Filter by status.** When I type "cleared" or "unc…" and pick the
  "Is: Cleared" / "Is: Uncleared" suggestion, then only rows of that
  reconciliation status remain.

- **US-4 — Find what needs a category.** When I type "need" and pick
  "Is: Needs Category", then only uncategorised money-in/out rows remain.

- **US-5 — Filter by date.** When I type a day or date and pick "On …",
  "On or before …", or "On or after …", then only rows on/before/after that date
  remain; a bare day resolves within the month I'm viewing.

- **US-6 — Filter by amount.** When I type a number (or "outflow"/"inflow") and
  pick an "Outflow/Inflow equals/≥/≤ …" suggestion, then only rows whose
  outflow or inflow side satisfies the comparison remain.

- **US-7 — Field-scoped text.** When I pick "Find 'q' in the Payee/Category/
  Memo", then only rows whose that field contains q remain; "in any field" keeps
  the classic behaviour.

- **US-8 — Remove a filter.** When I click the chip's ✕ or the field's clear
  button, then the filter is removed and all rows return.

- **US-9 — Keyboard only.** When I arrow to a suggestion and press Enter, then it
  is applied; Enter with nothing highlighted keeps my free-text search; Escape
  closes the dropdown.

- **US-10 — No regression.** When I type and press Enter without opening the
  dropdown, then search behaves exactly as before (free-text over any field),
  and the running balance / scheduled group behave as they do under a search.
