# Keyboard Shortcuts + Help Modal (phase 1)

**Date:** 2026-08-08
**Status:** Approved design (pending spec review)
**Branch:** `worktree-account-ledger`

## Problem

Raqam has almost no keyboard shortcuts (only global Cmd+Z/Cmd+Y undo/redo and scattered Escape handlers) and no way to discover them. The user wants to mimic YNAB's keyboard-shortcut scheme, binding each key to the equivalent Raqam feature — and a `?` help modal like YNAB's.

Most of YNAB's ~40 shortcuts reference features Raqam does not have (it is manual-entry: no bank import, so no flags, approve/reject, match/unmatch, split, or budget targets/snooze, and no plan grid). This phase binds only the keys that drive **existing** Raqam features and ships the help modal. Row-navigation (arrow keys, shift-select, shift-click) and date-picker keys are deferred to a phase 2.

## Decisions locked in brainstorming

- **Honest mapping, not faithful mimicry:** only bind keys that do real work; the help modal is the source of truth for what exists. No dead keys.
- **Dropped (no feature to bind):** math ops (`+ − × /` — amount fields discard non-numbers), sidebar collapse (sidebar is drag-resize, no collapse state), flags, approve/reject/approve-all, match/unmatch, split, snooze target, plan-row & multi-category navigation.
- **Deferred to phase 2:** `↑/↓` row navigation, `shift ↑/↓` multi-select, `shift+click` range-select, and all Date-Picker keys.
- **Adaptations:** `C` toggles cleared/uncleared on the selection; `E` = "Enter Now" → Raqam's **Post now** on a single selected future-dated scheduled row; `shift E` = **Reconcile**, account-scoped so it only fires on `/transactions/:accountId`. Unmet preconditions → silent no-op.

## The shortcut set (phase 1)

| Group | Keys | Action | Backed by |
|---|---|---|---|
| Universal | `?` | Open shortcuts help | new modal |
| Universal | `Cmd Z` / `Cmd Shift Z` | Undo / Redo | already wired (Header.jsx) |
| Universal | `Cmd A` | Select all visible transactions | `toggleAll(true)` |
| Universal | `Escape` | Deselect all | already wired (Transactions.jsx:356) |
| Universal | `shift N` | Add transaction | `openers.addTx(openDrawer)` |
| Transactions | `C` | Toggle cleared/uncleared | `setTransactionsStatus` |
| Transactions | `shift D` | Duplicate | `bulkDuplicate` |
| Transactions | `Delete` / `Backspace` | Delete (with existing confirm) | `bulkDelete` |
| Transactions | `shift T` | Make repeating (single) | `openers.makeRepeating` |
| Transactions | `E` | Enter now / post scheduled (single) | `postTransactionNow` |
| Transactions | `shift E` | Reconcile (account ledger only) | `openers.reconcile` |
| Transactions | `Cmd Shift F` | Focus the search bar | SearchField ref |

`Cmd Z`/`Cmd Shift Z` (Header.jsx:24-40) and `Escape` deselect (Transactions.jsx:354-359) already exist and stay where they are — they are **listed** in the modal but **not re-bound** by the new hook.

## Architecture

### 1. `src/lib/shortcuts.js` — single source of truth (new)

The grouped list the help modal renders **and** the matcher the handlers use, so the two can never drift.

```js
// Display groups for the help modal; `spec` drives matchKey.
export const SHORTCUT_GROUPS = [
  { title: 'Universal', items: [
    { id: 'help',        keys: ['?'],            label: 'Open Keyboard Shortcuts Help', spec: { key: '?' } },
    { id: 'undo',        keys: ['⌘', 'Z'],        label: 'Undo',                         spec: { key: 'z', meta: true } },
    { id: 'redo',        keys: ['⌘', 'shift', 'Z'], label: 'Redo',                       spec: { key: 'z', meta: true, shift: true } },
    { id: 'selectAll',   keys: ['⌘', 'A'],        label: 'Select all transactions',      spec: { key: 'a', meta: true } },
    { id: 'deselectAll', keys: ['esc'],          label: 'Deselect all',                 spec: { key: 'Escape' } },
    { id: 'addTx',       keys: ['shift', 'N'],    label: 'Add transaction',              spec: { key: 'n', shift: true } },
  ] },
  { title: 'Transactions', items: [
    { id: 'toggleCleared', keys: ['C'],            label: 'Toggle cleared state',        spec: { key: 'c' } },
    { id: 'duplicate',     keys: ['shift', 'D'],   label: 'Duplicate',                   spec: { key: 'd', shift: true } },
    { id: 'delete',        keys: ['delete'],       label: 'Delete',                      spec: { key: 'Delete', alt: 'Backspace' } },
    { id: 'makeRepeating', keys: ['shift', 'T'],   label: 'Make repeating',              spec: { key: 't', shift: true } },
    { id: 'enterNow',      keys: ['E'],            label: 'Enter now (post scheduled)',  spec: { key: 'e' } },
    { id: 'reconcile',     keys: ['shift', 'E'],   label: 'Reconcile account',           spec: { key: 'e', shift: true } },
    { id: 'focusSearch',   keys: ['⌘', 'shift', 'F'], label: 'Focus the search bar',     spec: { key: 'f', meta: true, shift: true } },
  ] },
];

// Flat lookup by id, for handlers that reference a single spec.
export const SPEC = Object.fromEntries(
  SHORTCUT_GROUPS.flatMap(g => g.items.map(i => [i.id, i.spec])),
);

// True when focus is in a text-entry context — shortcuts must not fire there.
export function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

// Match a keydown event against a spec. metaKey OR ctrlKey both count as "meta"
// (cross-platform). Shift equality is enforced only for alphanumeric keys, so a
// symbol like '?' (which is itself Shift+/) still matches.
export function matchKey(e, spec) {
  const want = spec.key.length === 1 ? spec.key.toLowerCase() : spec.key;
  const got = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const keyHit = got === want || (spec.alt && e.key === spec.alt);
  if (!keyHit) return false;
  if (!!spec.meta !== (e.metaKey || e.ctrlKey)) return false;
  if (/^[a-z0-9]$/.test(want) && !!spec.shift !== e.shiftKey) return false;
  return true;
}
```

### 2. `src/ui/useShortcuts.js` — the reusable hook (new)

```js
import { useEffect } from 'react';
import { isTypingTarget, matchKey } from '../lib/shortcuts.js';

// bindings: [{ spec, run, when? }]. One bubble-phase keydown listener (leaves
// the existing capture-phase Escape chain untouched). Ignores keystrokes while
// typing. `enabled` gates the whole set (e.g. off while a drawer is open).
export function useShortcuts(bindings, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = e => {
      if (isTypingTarget(document.activeElement)) return;
      for (const b of bindings) {
        if (matchKey(e, b.spec) && (!b.when || b.when())) {
          e.preventDefault();
          b.run();
          return;
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [bindings, enabled]);
}
```

Callers pass a `useMemo`-stable `bindings` array (handlers close over current state; the effect re-subscribes when the array identity changes, which is fine).

### 3. Help modal — `src/ui/ShortcutHelpModal.jsx` + UIProvider state (new)

- Modeled on `src/ui/ExplainDialog.jsx` (centered modal, FocusTrap, capture-phase Escape, scrim click closes). Renders `SHORTCUT_GROUPS` in two columns with YNAB-style `kbd` chips (a small `Kbd` sub-component: bordered `var(--elev)` caps). Title "Keyboard Shortcuts", an `×` top-right.
- **UIProvider** (`src/ui/UIProvider.jsx`) gains `shortcutsOpen` state + `openShortcuts()` / `closeShortcuts()` in its context value, and renders `<ShortcutHelpModal open={shortcutsOpen} onClose={closeShortcuts} />` alongside `<ConfirmDialog>`. (Same pattern the confirm dialog already uses.)

### 4. Global shortcuts — `src/components/GlobalShortcuts.jsx` (new), mounted in `Shell` (App.jsx)

A render-null component mounted once inside the providers:

```js
const { openShortcuts, closeShortcuts, shortcutsOpen, confirmOpen } = useUI();
const { drawer, openDrawer } = useDrawer();
const bindings = useMemo(() => [
  { spec: SPEC.help,  run: () => (shortcutsOpen ? closeShortcuts() : openShortcuts()) },
  { spec: SPEC.addTx, run: () => openers.addTx(openDrawer) },
], [shortcutsOpen, openDrawer, openShortcuts, closeShortcuts]);
useShortcuts(bindings, !drawer && !confirmOpen);
```

`?` toggles the help modal; `shift N` opens Add Transaction. Both disabled while a drawer or confirm is open (so they never stack). The help modal's own Escape/× closes it.

### 5. Transactions shortcuts — in `src/screens/Transactions.jsx`

Register the selection/context actions with `useShortcuts`, gated on `!drawer && !confirmOpen`. Each `run` reuses the functions that already back the bulk bar:

- `selectAll` → `toggleAll(true)`
- `toggleCleared` → `when: () => sel.length > 0`; toggle: if every selected tx is cleared → `bulkStatus('pending')`, else `bulkStatus('cleared')`. (Read status via `S.transactions.find(t => t.id === id).status`.)
- `duplicate` → `when: () => sel.length > 0`, `run: bulkDuplicate`
- `delete` → `when: () => sel.length > 0`, `run: bulkDelete`
- `makeRepeating` → `when: () => singleRepeatItem() != null`, `run: () => singleRepeatItem().onClick()`
- `enterNow` → `when`: exactly one scheduled selection that is a postable future-dated tx (not a rule); `run`: `askPostNow(thatRow)`. (Derive the row from `schedSel` — a single id present in the scheduled tx rows.)
- `reconcile` → `when: () => !!acct`, `run: () => openers.reconcile(S, accountId, openDrawer)`
- `focusSearch` → `run: () => searchRef.current?.focus()`

`Cmd A` (`selectAll`) and `Delete` call `e.preventDefault()` via the hook, so they override browser select-all / back-navigation only while Transactions is mounted and not typing.

### 6. SearchField ref — `src/ui/SearchField.jsx`

Convert to `forwardRef` and expose an imperative `focus()` via `useImperativeHandle` that focuses the inner `<input>` (add a local input ref). Transactions holds `const searchRef = useRef(null)` and passes it: `<SearchField ref={searchRef} … />`. No behavior change otherwise.

### 7. Discoverability — user menu item

Add a "Keyboard shortcuts" item to the user menu (`src/components/UserMenu.jsx`) that calls `openShortcuts()`, so the modal is reachable without knowing `?`.

## Files

- **Create:** `src/lib/shortcuts.js`, `src/ui/useShortcuts.js`, `src/ui/ShortcutHelpModal.jsx`, `src/components/GlobalShortcuts.jsx`
- **Modify:** `src/ui/UIProvider.jsx` (state + render modal), `src/App.jsx` (mount `<GlobalShortcuts/>` in Shell), `src/screens/Transactions.jsx` (register shortcuts + search ref), `src/ui/SearchField.jsx` (forwardRef + focus), `src/components/UserMenu.jsx` (menu item)
- **Test:** `tests/shortcuts.test.js` (new)

## Reused functions (do not reinvent)

- Bulk actions already in `Transactions.jsx`: `toggleAll`, `bulkStatus`, `bulkDuplicate`, `bulkDelete`, `singleRepeatItem`, `askPostNow`, `clearSel`; selection `sel`/`selected`/`schedSel`.
- `openers.addTx`, `openers.makeRepeating`, `openers.reconcile` (`src/drawers/openers.js`); `useDrawer`, `useUI`, `useStore`.
- `ExplainDialog.jsx` as the shape template for `ShortcutHelpModal.jsx`; `FocusTrap.jsx`.

## Verification

**Unit (vitest), `tests/shortcuts.test.js`:**
- `matchKey`: `shift N` matches `{key:'n',shift:true}` but not plain `n`; `E` vs `shift E` disambiguate on shiftKey; `?` matches even though its event carries `shiftKey:true`; `Cmd A` matches on either `metaKey` or `ctrlKey`; `Cmd C` does **not** match `toggleCleared` (`c` with no meta); `Delete` and `Backspace` both match the `delete` spec via `alt`.
- `isTypingTarget`: true for `{tagName:'INPUT'}`, `{tagName:'TEXTAREA'}`, `{tagName:'SELECT'}`, `{isContentEditable:true}`; false for `{tagName:'DIV'}` and `null`.
- `SPEC`/`SHORTCUT_GROUPS`: every group item has an `id`, `keys`, `label`, `spec`; `SPEC` has one entry per item.
- Keep the full suite green; `vite build` clean.

**Manual (dev server, branch):**
- `?` opens/closes the help modal; it lists the Universal + Transactions groups with correct key chips; `×` and Escape close it; the user-menu item opens it.
- On Transactions with rows selected: `C` toggles cleared/uncleared, `shift D` duplicates, `Delete` prompts the delete confirm, `Cmd A` selects all (not the browser's select-all), `Escape` deselects.
- `shift N` opens Add Transaction from any screen; `Cmd Shift F` focuses the search box.
- With exactly one recorded row selected, `shift T` makes it repeating; with one future-dated scheduled row selected, `E` posts it now; on `/transactions/:accountId`, `shift E` opens Reconcile.
- Typing in any field: no letter shortcut fires (guarded). With a drawer or confirm open: global shortcuts don't fire.
