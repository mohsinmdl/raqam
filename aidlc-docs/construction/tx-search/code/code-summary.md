# Code Summary — Structured Transaction Search (Cycle 4)

## Files changed

| File | Change |
| --- | --- |
| `src/lib/txSearch.js` | Extended the pure search layer: `txFlows`, `txNeedsCategory`, `matchesTerm`, `matchesSearch`, `parseSearchAmount`, `searchSuggestions` (+ helpers). Kept `txHaystack`/`matchesQuery`. |
| `src/ui/tx/TxSearchField.jsx` | **New.** Base UI Combobox-backed search field: grouped suggestion dropdown, facet chip, controlled-`open` tied to focus, keyboard support. Presentational. |
| `src/store/TxViewContext.jsx` | `DEFAULT_FILTERS` gains `term: null` (with the one-active-of-{q,term} note). |
| `src/screens/Transactions.jsx` | Suggestion memo + search handlers (`onSearchQuery`/`onSearchPick`/`clearSearch`); predicate → `matchesSearch`; running-balance + reveal-row + phone guards extended for `term`; both `SearchField` mounts → `TxSearchField`. |
| `tests/tx-search.test.js` | +25 tests: `parseSearchAmount`, `txFlows`, every `matchesTerm` facet, `matchesSearch`, and `searchSuggestions` ordering/contents. |

## Design notes

- **Honest status adaptation** — no "reconciled" state in Raqam; the "Is:" facet
  is Cleared/Uncleared plus the real Needs-Category flag.
- **Reuse** — `parseTypedDate` (lib/dates.js) powers the date facet exactly as
  the register's date cell parses typed dates (bare day → viewed month).
- **`anyFilter` free lunch** — because it diffs the live filter against
  `DEFAULT_FILTERS`, adding `term` there makes the scheduled-group suppression
  and `resetView` handle the facet with no extra code.
- **Back-compat** — `matchesSearch` falls back to `matchesQuery` when no term, so
  type-and-Enter is byte-for-byte the old behaviour.

## Verification

- `pnpm vitest run` → 113 files / 1643 tests passing.
- `pnpm build` → green.
- Live (isolation harness `harness/search.html` + Playwright subagent) across the
  reference-screenshot scenarios: bank / rent / reco / unc / need / 02 / inflo /
  keyboard. Results recorded in the PR description. (Harness is dev-only and is
  removed before commit.)
