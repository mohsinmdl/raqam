# Code Summary — U1 command-palette

## New module: `src/ui/command/`
| File | What it is | Tests |
|---|---|---|
| `matchRank.js` | **Pure** fuzzy match + rank. `fuzzyScore`, `scoreItem`, `rankItems`, `RECENT_BOOST`. Tiered: exact > prefix > word-boundary > subsequence; recents boost; stable total order. | `matchRank.test.js` — 15 tests (9 example + 6 properties P1–P6, fast-check) |
| `buildItems.js` | **Pure** projection of pages + active accounts/categories/payees into flat items. `PAGES` catalog with synonyms. | `buildItems.test.js` — 8 tests |
| `actions.js` | Action catalog; each `perform(ctx)` delegates to existing `openers`/prefs/nav. Add tx / new account / new category / manage payees / toggle theme / hide amounts / switch-plan (per other plan). | (covered in buildItems.test.js) |
| `recents.js` | localStorage-safe recents (`getRecents`/`pushRecent`, cap 8, try/catch). | — |
| `useCommandItems.js` | React hook memoizing `buildItems + buildActions` on `[data, plans, openPlanId]`. | — |
| `CommandPalette.jsx` | Base UI `Dialog` overlay: search input, grouped results (fixed group order), cross-group `↑/↓` nav, `Enter`/`Esc`/`Home`/`End`, active-row scroll-into-view, footer hint bar, empty (Recents/Jump-to) + no-match states, desktop modal ↔ phone full-screen. Owns the global `⌘K`/`Ctrl+K` + `/` listener. `aria-activedescendant`, live results count. Exports `isMacPlatform`. | live (Playwright harness) |
| `SidebarSearch.jsx` | Desktop "Quick search… ⌘K" button that opens the palette. | live |

## Edits to existing files
| File | Edit |
|---|---|
| `src/ui/UIProvider.jsx` | Added `paletteOpen` / `openPalette` / `closePalette` to context (mirrors `shortcutsOpen`). |
| `src/App.jsx` | Import + render `<CommandPalette/>` in the Shell (inside DrawerProvider, beside ManagePayees). |
| `src/components/Sidebar.jsx` | Render `<SidebarSearch/>` above the nav (nav top padding trimmed 12→8). |
| `src/components/Header.jsx` | Phone-only search icon button → `openPalette`. |
| `src/lib/shortcuts.js` | Added `commandPalette` (⌘K) row to the Universal group so the `?` help modal lists it. |

## Item contract
`{ id, kind, group, label, sublabel?, keywords?, icon?, priority?, perform(ctx) }` where `ctx = { navigate, openDrawer, setPrefs, prefs, phone, pathname, openPayees, switchPlan }`. `perform` is called after the dialog closes (setTimeout 0) so a freshly-opened drawer doesn't fight the palette's focus trap.

## Story coverage
US-1 (open/close incl. global ⌘K + `/`), US-2 (sidebar field + phone icon), US-3 (pages + synonyms), US-4 (accounts/categories/payees, filtered), US-5 (actions incl. per-plan switch), US-6 (recents, storage-safe, stale-filtered), US-7 (grouped + kbd nav + footer + empty/no-match), US-8 (dialog a11y, activedescendant, live count), US-9 (memoized index), US-10 (pure match/rank + example & property tests).

## Extension compliance
- SECURITY-05 ✅ query rendered as text only. SECURITY-08 ✅ no new data path (indexes RLS-gated store only). SECURITY-15 ✅ storage fail-safe. Others N/A (client-only UI).
- PBT-03/07/08 ✅ on `matchRank.js`; PBT-09 ✅ fast-check. PBT-10 ✅ example + property tests coexist.
