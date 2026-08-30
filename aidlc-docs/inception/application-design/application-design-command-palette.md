# Application Design — Command Palette (Cycle 3)

**Depth**: Minimal. One new self-contained module under `src/ui/command/`, plus small edits to three existing files. No new services, no schema.

## New module: `src/ui/command/`
| File | Responsibility | Key exports |
|---|---|---|
| `matchRank.js` | **Pure** fuzzy match + rank (the PBT target). No React/DOM/store. | `fuzzyScore(query, text)`, `rankItems(query, items)` |
| `buildItems.js` | **Pure** assembly of the flat item list from a plain data snapshot + nav/action catalogs. No React. | `buildItems({ data, plans, openPlanId, pathname })`, `PAGES` |
| `actions.js` | Action catalog factory — maps action items to their `perform(ctx)` using existing `openers`/nav/prefs. | `buildActions(ctx)` |
| `recents.js` | localStorage-safe recents (try/catch). | `getRecents()`, `pushRecent(id)`, `RECENTS_KEY` |
| `useCommandItems.js` | React hook: memoizes `buildItems` + binds `perform` closures (nav, drawer, prefs, plan). | `useCommandItems()` |
| `CommandPalette.jsx` | The overlay UI (Base UI Dialog): input, grouped results, keyboard nav, footer, empty/no-match, mobile full-screen. Records recent + performs + closes. | default `CommandPalette` |
| `SidebarSearch.jsx` | The desktop sidebar "Quick search… ⌘K" trigger button. | default `SidebarSearch` |
| `matchRank.test.js` | Example + property-based tests (fast-check). | — |
| `buildItems.test.js` | Example tests for item assembly + filtering. | — |

## Item model (the contract)
A palette item is a plain object:
```
{
  id: string,            // stable, unique — recents key (e.g. 'page:reflect/spending', 'account:<id>', 'action:addTx')
  kind: 'page'|'account'|'category'|'payee'|'plan'|'action',
  group: string,         // display group label ('Pages','Accounts','Categories','Payees','Actions')
  label: string,         // primary text
  sublabel?: string,     // secondary context (e.g. 'Reflect', account type)
  keywords?: string[],   // extra synonyms for matching (not shown)
  icon?: ReactNode,      // small glyph
  priority?: number,     // base rank boost (pages > actions default)
  perform: (ctx) => void // navigate / open drawer / run
}
```
`perform` closures are bound in `useCommandItems` (has nav/drawer/prefs/plan); `buildItems`/`actions` stay pure by taking a `ctx` param or returning descriptors the hook wires up.

## Edits to existing files
| File | Edit |
|---|---|
| `src/ui/UIProvider.jsx` | Add `paletteOpen`, `openPalette`, `closePalette`, `togglePalette` (mirrors `shortcutsOpen`). Do **not** render CommandPalette here — it needs `useDrawer` (DrawerProvider is a descendant). |
| `src/App.jsx` (Shell) | Render `<CommandPalette />` (inside DrawerProvider, alongside ManagePayees). Add `<CommandPaletteHotkeys/>` or fold the ⌘K/`/` listener into the palette module. Add `<SidebarSearch/>` slot on phone header + desktop sidebar. |
| `src/components/Sidebar.jsx` | Render `<SidebarSearch/>` above the nav (the "Quick search… ⌘K" field). |
| `src/components/Header.jsx` | On phone, add a search icon button that calls `openPalette`. |
| `src/lib/shortcuts.js` | Add `commandPalette` entry to `SHORTCUT_GROUPS` (Universal): `⌘K` — so the help modal lists it. |

## Component dependency (text)
- `CommandPalette` → `useCommandItems` → `buildItems`+`buildActions`+`useStore`/`usePlan`/`useNavigate`/`useDrawer`/`setPrefs`; → `rankItems`; → `recents`.
- Open state: `UIProvider.paletteOpen` ← keyboard listener / `SidebarSearch` / Header icon.
- `matchRank.js` and `buildItems.js` depend on nothing app-specific (pure) → unit/property testable in isolation.

## Security posture (enabled extension)
- Query is rendered as **text only** (no `dangerouslySetInnerHTML`) — SECURITY-05.
- Index is derived only from already-loaded, RLS-gated store data; the palette opens **no new data path** — SECURITY-08 (N/A for new endpoints; honored by construction).
- All `localStorage` access in `recents.js` wrapped in try/catch; palette degrades, never throws — SECURITY-15.
