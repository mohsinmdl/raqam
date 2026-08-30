# Business Logic Model — U1 command-palette

## 1. Fuzzy match + rank (`matchRank.js`, PURE)

### `fuzzyScore(query, text) -> number | -Infinity`
Normalized (lowercased, trimmed) subsequence matcher returning a relevance score, or `-Infinity` for no match.

Tiered scoring (higher = better):
1. **Exact** full match of `text` → highest.
2. **Prefix** — `text` starts with `query`.
3. **Word-boundary** — `query` starts a word within `text` (after space/`-`/`/`).
4. **Subsequence** — all chars of `query` appear in order in `text` (typo-light fuzzy); score decreases with gaps and with `text` length.
5. Empty query → score `0` (neutral, matches everything).

### `rankItems(query, items, opts) -> PaletteItem[]`
- For each item, score = best of `fuzzyScore(query, label)`, `fuzzyScore(query, sublabel)`, and each `keyword` (keywords/sublabel scored at a slight discount so a label match wins ties).
- Add `item.priority` (base boost) and a **recents boost** for ids in `opts.recentIds`.
- Drop items scoring `-Infinity` (non-matches). Empty query keeps all (or a curated default set decided by the caller).
- Sort by total score desc; **stable tie-break** by `priority` desc then original index (so equal-scoring items keep input order → a total, deterministic order).

## 2. Item assembly (`buildItems.js` + `actions.js`, PURE given a snapshot)
`buildItems({ data, plans, openPlanId, pathname }) -> PaletteItem[]` (descriptors; `perform` wired by the hook). Applies the filters in domain-entities.md. `buildActions(ctx)` returns action items whose `perform` calls existing `openers`/`setPrefs`/`navigate`.

## 3. Recents (`recents.js`)
`getRecents()` reads + JSON-parses the key inside try/catch (→ `[]` on any failure). `pushRecent(id)` prepends id, dedups, caps at 8, writes inside try/catch (silent on failure). Stale ids are filtered by the consumer against the live item set (an id with no matching item is dropped at render).

## 4. Orchestration (`CommandPalette.jsx`)
Open → focus input → empty query shows Recents (resolved against items) → typing calls `rankItems` (memoized) → arrow keys move a single active index across the flat ranked list → Enter calls `pushRecent(item.id)` then `item.perform(ctx)` then `close()` → Esc closes.

## 5. Testable Properties (PBT-01 — carried into Code Generation)
Target: `matchRank.js` (pure). Framework: **fast-check** (already a devDependency; PBT-09).

| # | Category | Property |
|---|---|---|
| P1 | Invariant (PBT-03) | `rankItems(q, items)` returns a **subset** of `items` (every result is referentially one of the inputs; no duplicates). |
| P2 | Invariant (PBT-03) | Empty/whitespace query returns **all** items (count preserved) — the "open with everything" state. |
| P3 | Invariant (PBT-03) | If `query` is a **substring** of an item's label, that item is **present** in the results (never wrongly filtered out). |
| P4 | Invariant (PBT-03) | Results are **ordered** by non-increasing total score → a stable total order (no item outranks one with a strictly higher score). |
| P5 | Invariant (PBT-03) | An item whose id is in `recentIds` never ranks **below** an otherwise-identical item not in `recentIds` (recents boost is monotonic). |
| P6 | Robustness (PBT-07/08) | `fuzzyScore`/`rankItems` **never throw** for any generated input (unicode, empty strings, very long strings, odd items) and are **deterministic** (same input → same output; seed-reproducible). |

Generators (PBT-07): realistic label/query generators (words, mixed case, unicode, spaces/hyphens) + item generators with optional sublabel/keywords/priority — not raw primitives alone. Shrinking on; seed logged on failure (PBT-08). Example-based tests pin the tier ordering (exact > prefix > word-boundary > subsequence) per PBT-10.
