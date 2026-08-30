# NFR Requirements — U1 command-palette (Minimal)

| NFR | Requirement | How met |
|---|---|---|
| Performance | Open + per-keystroke filter feel instant (<~50ms) on hundreds–low-thousands of items | Index memoized (`useMemo` keyed on store data + plan + pathname); `rankItems` is O(n·|query|) over a flat array; no network |
| Accessibility | Keyboard-only operable; dialog semantics; active-option + results-count announced | Base UI `Dialog` (focus trap + restore + labelled); roving active index with `aria-activedescendant`; `role="listbox"/option"`; live region for count |
| Responsive | Desktop centered modal ↔ phone full-screen sheet; theme-aware | `useIsPhone`; theme CSS tokens (`--surface/--border/--text/--accent/--muted/--scrim`) |
| Offline-safe | Works with no network; storage failures degrade | Pure client index; `recents.js` try/catch |
| Security | SECURITY-05 (untrusted query as text), SECURITY-08 (no new data path), SECURITY-15 (fail-safe) | See business-rules BR-7/8/9 |
| Testability | Pure match/rank unit + property tested | `matchRank.js` pure; fast-check |

## Extension compliance (this stage)
- **Security**: SECURITY-05 ✅ (query rendered as text), SECURITY-08 ✅ (no endpoint/data-path change), SECURITY-15 ✅ (storage fail-safe). SECURITY-01/02/03/04/06/07/09/10/11/12/13/14 → **N/A** (no data store, network intermediary, server logging, HTML-serving endpoint, IAM, network config, auth, supply-chain surface changed by a client-only UI feature; app CSP/headers unchanged).
- **PBT**: PBT-09 framework = **fast-check** (present in devDependencies). PBT-01 properties documented (business-logic-model §5). PBT-02 N/A (no serialization pair; recents JSON round-trip is trivial localStorage, covered by example test). PBT-03/07/08 enforced on `matchRank.js`.
- **Resiliency**: disabled.
