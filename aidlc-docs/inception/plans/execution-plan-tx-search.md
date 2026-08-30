# Execution Plan — Structured Transaction Search (Cycle 4)

## Stage decisions

| Stage | Decision | Rationale |
| --- | --- | --- |
| Workspace Detection | Done | Brownfield; resume off origin/main (had Cycle 3 docs). |
| Reverse Engineering | SKIP | Artifacts current; the search surface was read directly (txSearch.js, txRow.js, TxViewContext.jsx, Transactions.jsx). |
| Requirements Analysis | Done | requirements-tx-search.md (Standard depth). |
| User Stories | Done | stories-tx-search.md (10 stories, reused persona). |
| Workflow Planning | This file | — |
| Application Design | SKIP | No new components/services in the architecture sense; one presentational component + pure-lib extension within existing boundaries. |
| Units Generation | SKIP | Single unit; no decomposition needed. |
| Functional Design | Done | construction/tx-search/functional-design/functional-design.md (the `term` model + suggestion order + predicate). |
| NFR Requirements / NFR Design / Infra Design | SKIP | No new tech stack, no NFR patterns, no infrastructure — client-only, no schema/network/deploy change. |
| Code Generation | Done | One unit (below). |
| Build and Test | Done | Full suite + build + live harness verification. |

## Single unit: `tx-search`

Change sequence (all client, in the tx-search worktree off origin/main):

1. **lib/txSearch.js** — extend with the structured layer: `matchesTerm`,
   `matchesSearch`, `searchSuggestions`, `parseSearchAmount`, `txFlows`,
   `txNeedsCategory`. Keep `txHaystack`/`matchesQuery`. (Pure, unit-tested.)
2. **ui/tx/TxSearchField.jsx** — new Base UI Combobox-backed field with the
   grouped suggestion dropdown + facet chip; presentational.
3. **store/TxViewContext.jsx** — `DEFAULT_FILTERS` gains `term: null`.
4. **screens/Transactions.jsx** — compute suggestions, add search handlers, swap
   the predicate to `matchesSearch`, extend running-balance/jump guards for
   `term`, mount `TxSearchField` on desktop + phone.
5. **tests/tx-search.test.js** — extend with facet + suggestion coverage.

## Verification

- `pnpm vitest run` — full suite green.
- `pnpm build` — green.
- Live: `harness/search.html` (isolation harness) driven with Playwright across
  the reference-screenshot scenarios (bank / rent / reco / unc / need / 02 /
  inflo / keyboard), delegated to a verification subagent.

## Risk / mitigation

- **Base UI Combobox controlled-`open`** is the only non-trivial risk (dropdown
  must open on type, not fight virtual focus, and register clicks). Mitigated by
  the live harness verification, since unit tests cannot exercise it.
