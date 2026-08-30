# Domain Entities — U1 command-palette

The palette has no persisted domain entities of its own; it projects existing store data into a transient in-memory index.

## PaletteItem (transient, in-memory)
| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable & unique; also the Recents key. Namespaced: `page:*`, `account:*`, `category:*`, `payee:*`, `plan:*`, `action:*` |
| `kind` | enum | `page`\|`account`\|`category`\|`payee`\|`plan`\|`action` |
| `group` | string | Display bucket: Pages / Accounts / Categories / Payees / Actions (Recents is computed, not a kind) |
| `label` | string | Primary text shown & matched |
| `sublabel` | string? | Secondary context (e.g. section name, account type) |
| `keywords` | string[]? | Extra synonyms matched but not displayed |
| `icon` | ReactNode? | Small glyph |
| `priority` | number? | Base rank boost; pages default higher than deep actions |
| `perform` | (ctx)=>void | Side-effect on select (navigate / open drawer / run) |

## Recents (persisted, device-local)
| Field | Type | Notes |
|---|---|---|
| storage key | `raqam.cmdk.recents` | localStorage |
| value | string[] | Ordered list of PaletteItem `id`s, newest first, capped at 8 |

## Source projections (read-only)
- **Pages** — static catalog derived from the router (`App.jsx`) with synonyms.
- **Accounts** — `data.accounts` where `status==='active'` → `account:<id>`, label `nickname`.
- **Categories** — `data.categories` where `status==='active'` → `category:<id>`, sublabel = group name via `data.categoryGroups`.
- **Payees** — `data.payees` where `!transferRef && !hidden` → `payee:<id>`.
- **Plans** — `usePlan().plans` (other than the open one) → action `Switch plan → {name}`.
- **Actions** — static catalog bound to `openers`, `setPrefs`, `navigate`.
