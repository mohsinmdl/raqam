# Frontend Components — U1 auto-categorize

All gated on `useAI().enabled`. New primitives on Base UI where interactive.
Stories US-5..US-8.

## SuggestionChips — `src/ui/ai/SuggestionChips.jsx`
- **Props**: `{ txId, suggestions, onApply, compact }` where `suggestions` is the
  validated 0–2 array; `onApply(categoryId)` calls the row's categorize handler.
- **Render**: 1–2 small chips (category name; icon/emoji if present), placed
  alongside/replacing the needs-category pill. Nothing when `suggestions` empty.
- **Interaction**: left-tap chip → `onApply(categoryId)` (US-6). On phone the
  chip is a pointer-`stopPropagation` span (row is itself a button — same
  constraint TxPhoneList documents for its catChip). The pill still opens the
  full picker for "none of these" (unchanged).
- **testids**: `data-testid="suggestion-chip"` per chip;
  `data-suggestion-cat={categoryId}`.
- **Warming**: no per-row warming noise; a batch >3s shows a single subtle
  "finding suggestions…" hint on the needs-category BANNER only.

## Wiring into existing surfaces (edits, additive)
- `src/ui/TxChips.jsx` `NeedsCategoryPill` — accept an optional `suggestions` +
  `onApply` and render `<SuggestionChips>` before/around the pill.
- `src/components/TxPhoneList.jsx` — render chips next to `catChip` under the
  same pointer rules.
- `src/screens/Transactions.jsx`, `src/screens/Dashboard.jsx` — own the
  suggestion batch: build context/targets, debounced `useAI().categorize`, hold
  the `SuggestionCache`, pass per-row suggestions down, wire `onApply` to the
  existing `categorizeOne`.

## GraduationOffer — `src/ui/ai/GraduationOffer.jsx`
- **Trigger**: after an accept that hits the 3rd count (US-7), a NON-blocking
  inline offer / toast: "Always categorize <payee> as <category>?" with
  **Always** / **Not now**.
- **Props**: `{ payeeName, categoryId, categoryName, onAccept, onDismiss }`.
- **Actions**: Always → `upsertPayee(...)` + close; Not now → set dismissed flag
  + close. Auto-dismiss on navigation.
- **testids**: `data-testid="graduation-offer"`, `-accept`, `-dismiss`.

## State management
- Suggestion cache + batch effect: in the list screens (Transactions/Dashboard),
  keyed by the visible needs-category id-set; cleared on disable/apply.
- Accept counters/dismissed flags: `useStore()` prefs via `setPrefs` (US-7); no
  local duplication.

## Interaction flows
1. Uncategorized rows visible + AI on + ≥30 history → (debounced) chips appear.
2. Tap chip → category applied, row exits needs-category, chips gone.
3. 3rd same-payee accept → GraduationOffer → Always → future txs auto-categorized
   deterministically, that payee no longer queried.
4. AI off / down / <30 history → no chips; plain pill behaves exactly as today.

## Form validation
None (no forms). The only write is the existing categorize action, already
validated by the store.
