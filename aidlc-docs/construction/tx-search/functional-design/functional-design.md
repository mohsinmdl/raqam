# Functional Design — Structured Transaction Search (Cycle 4)

## The `term` model

The view filter (`TxViewContext.DEFAULT_FILTERS`) gains a `term` beside `q`:

- `q` — free-text query; drives the field's text and its suggestions.
- `term` — the one structured facet a picked suggestion applied, or `null`.

Invariant: exactly one is "active". Typing sets `q` and `term = null`; picking a
suggestion sets `term` and `q = ''`; clearing sets both empty.

### Term shapes (all carry a `label`/`text` for the chip)

| kind | payload | matches when |
| --- | --- | --- |
| `field` | `field: any\|payee\|category\|memo`, `q` | substring of that field (any → whole haystack) |
| `account` | `id` | row touches the account/card (either transfer side) |
| `category` | `id` | `t.category === id` |
| `status` | `value: cleared\|uncleared` | `t.status` is / isn't `pending` |
| `needsCategory` | — | uncategorised expense/income/refund |
| `date` | `op: on\|onBefore\|onAfter`, `iso` | `t.date[0:10]` = / ≤ / ≥ iso |
| `amount` | `side: outflow\|inflow`, `op: eq\|gte\|lte`, `value` | that side's magnitude satisfies op; empty side never matches |

`txFlows(t)` derives the outflow/inflow magnitudes **identically to `txRowOf`'s
two columns** (all-accounts perspective): expense/transfer → outflow, income/
refund → inflow, signed adjustment by sign; the unpopulated side is `null`.

## Predicate

`matchesSearch(t, {q, term}, S)` — `term ? matchesTerm(t, term, S) : matchesQuery(t, q, S)`.
So a picked facet wins, and typing-then-Enter is the unchanged free-text path.
The screen filters `monthTx` through this.

## Suggestions

`searchSuggestions(q, S, anchorIso)` → ordered list; each item is
`{ key, prefix, icon?, main, term }`, `main` a string or `{pre, strong, post}`
(bolds the query in the "Find …" echoes). Order, richest signal first:

1. Accounts, then cards, whose name contains q (closed accounts skipped).
2. Categories whose name contains q (emoji stays in the name).
3. `Is:` Cleared / Uncleared — when q is a prefix of the keyword.
4. `Is: Needs Category` — when q is a prefix of "needs category"/"uncategorized".
5. Date On / On-or-before / On-or-after — when `parseTypedDate(q, anchor)` (from
   `lib/dates.js`, reused) parses; anchor = viewed month, so a bare day lands in it.
6. Amount Outflow/Inflow × equals/≥/≤ — numeric q fixes the value; the words
   "outflow"/"inflow" surface the facet at 0.00.
7. Find "q" in any field — the default (equivalent to typing + Enter).
8–10. Find "q" in the Payee / Category / Memo.

Open-ended entity groups (accounts/categories) are capped so the fixed facets
below them aren't buried.

## UI — `ui/tx/TxSearchField.jsx`

Built on the project's Base UI `Combobox` primitive (convention: all new
interactive primitives are). Presentational — `value`, `term`, `suggestions`,
and handlers come from the parent, so one component serves desktop toolbar and
phone row.

- `open` is **controlled**, derived as `focused && suggestions.length > 0`, so
  the popup shows only while a live query has interpretations and never as an
  empty box. Picking a term empties `suggestions` (parent stops computing them),
  which closes it with no extra state.
- Escape / Enter-with-no-highlight blur to close (leaving free text intact);
  arrow + Enter takes the highlighted suggestion via Base UI's own selection.
- When a `term` is set, an in-field chip names it with a ✕ to clear.

## Touch points in `screens/Transactions.jsx`

- `list = monthTx.filter(t => matchesSearch(t, {q: F.q, term: F.term}, S))`.
- `anyFilter` auto-includes `term` (it diffs against `DEFAULT_FILTERS`), so the
  scheduled-group suppression works unchanged.
- Running-balance eligibility gains `&& !F.term`; the reveal-linked-row jump
  clears `term` too; phone search open/clear handle `term`.
