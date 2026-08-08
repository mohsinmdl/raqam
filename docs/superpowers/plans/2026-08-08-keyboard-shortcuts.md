# Keyboard Shortcuts + Help Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind YNAB-style keyboard shortcuts to Raqam's existing features and ship a `?` help modal that lists them.

**Architecture:** A single source of truth (`src/lib/shortcuts.js`) holds the grouped shortcut list the modal renders *and* the key matchers the handlers use. A reusable `useShortcuts` hook registers one guarded `keydown` listener. Global keys live in a `GlobalShortcuts` component; selection keys live in `Transactions.jsx`.

**Tech Stack:** React 18, react-router-dom (HashRouter), Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-08-keyboard-shortcuts-design.md`

## Global Constraints

- **Single source of truth:** the help modal and the key handlers both read `SHORTCUT_GROUPS` / `SPEC` from `src/lib/shortcuts.js`. Never hardcode a key combo in a handler.
- **Typing guard:** shortcuts must not fire while focus is in an INPUT/TEXTAREA/SELECT/contentEditable (`isTypingTarget`).
- **Leave the Escape chain alone:** do not add or change any Escape handler. `useShortcuts` uses a bubble-phase listener and never binds Escape; the existing capture-phase Escape handlers (ConfirmDialog, drawers, popovers) and the Transactions selection-clear stay exactly as they are.
- **Reuse existing actions:** bind to the functions already backing the bulk bar (`toggleAll`, `bulkStatus`, `bulkDuplicate`, `bulkDelete`, `singleRepeatItem`, `askPostNow`, `clearSched`) and the openers (`addTx`, `reconcile`). Do not reimplement them.
- **Disable while blocked:** global and Transactions shortcuts are disabled while a drawer or confirm dialog is open.
- **`metaKey` OR `ctrlKey`** both count as "meta" (cross-platform). Shift equality is enforced only for alphanumeric keys so `?` (Shift+/) still matches.
- Keep the full vitest suite green and `npx vite build` clean after every task.

---

### Task 1: Shortcut registry, matchers, and the `useShortcuts` hook

**Files:**
- Create: `src/lib/shortcuts.js`, `src/ui/useShortcuts.js`
- Test: `tests/shortcuts.test.js`

**Interfaces:**
- Produces: `SHORTCUT_GROUPS` (array of `{title, items:[{id, keys, label, spec}]}`), `SPEC` (`{[id]: spec}`), `isTypingTarget(el) → bool`, `matchKey(event, spec) → bool`, and `useShortcuts(bindings, enabled)` where `bindings = [{spec, run, when?}]`.

- [ ] **Step 1: Write the failing test**

Create `tests/shortcuts.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { matchKey, isTypingTarget, SPEC, SHORTCUT_GROUPS } from '../src/lib/shortcuts.js';

const ev = (key, mods = {}) => ({ key, metaKey: false, ctrlKey: false, shiftKey: false, ...mods });

describe('matchKey', () => {
  it('requires shift for shift-letter combos', () => {
    expect(matchKey(ev('N', { shiftKey: true }), SPEC.addTx)).toBe(true);
    expect(matchKey(ev('n'), SPEC.addTx)).toBe(false);
  });

  it('disambiguates E from shift+E', () => {
    expect(matchKey(ev('e'), SPEC.enterNow)).toBe(true);
    expect(matchKey(ev('e', { shiftKey: true }), SPEC.enterNow)).toBe(false);
    expect(matchKey(ev('e', { shiftKey: true }), SPEC.reconcile)).toBe(true);
    expect(matchKey(ev('e'), SPEC.reconcile)).toBe(false);
  });

  it('matches ? even though its event carries shiftKey', () => {
    expect(matchKey(ev('?', { shiftKey: true }), SPEC.help)).toBe(true);
  });

  it('treats metaKey and ctrlKey alike', () => {
    expect(matchKey(ev('a', { metaKey: true }), SPEC.selectAll)).toBe(true);
    expect(matchKey(ev('a', { ctrlKey: true }), SPEC.selectAll)).toBe(true);
    expect(matchKey(ev('a'), SPEC.selectAll)).toBe(false);
  });

  it('does not fire a plain-letter shortcut when meta is held', () => {
    expect(matchKey(ev('c'), SPEC.toggleCleared)).toBe(true);
    expect(matchKey(ev('c', { metaKey: true }), SPEC.toggleCleared)).toBe(false);
  });

  it('accepts an alt key (Delete or Backspace)', () => {
    expect(matchKey(ev('Delete'), SPEC.delete)).toBe(true);
    expect(matchKey(ev('Backspace'), SPEC.delete)).toBe(true);
    expect(matchKey(ev('x'), SPEC.delete)).toBe(false);
  });

  it('requires both meta and shift for focus-search', () => {
    expect(matchKey(ev('f', { metaKey: true, shiftKey: true }), SPEC.focusSearch)).toBe(true);
    expect(matchKey(ev('f', { metaKey: true }), SPEC.focusSearch)).toBe(false);
  });
});

describe('isTypingTarget', () => {
  it('is true for text-entry elements', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });
  it('is false otherwise', () => {
    expect(isTypingTarget({ tagName: 'DIV' })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('registry', () => {
  it('every item is well-formed and present in SPEC', () => {
    const ids = [];
    for (const g of SHORTCUT_GROUPS) {
      expect(typeof g.title).toBe('string');
      for (const i of g.items) {
        expect(i.id && Array.isArray(i.keys) && i.label && i.spec).toBeTruthy();
        expect(SPEC[i.id]).toBe(i.spec);
        ids.push(i.id);
      }
    }
    expect(Object.keys(SPEC).length).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/shortcuts.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/shortcuts.js`**

```js
// Single source of truth for keyboard shortcuts: the grouped list the help
// modal renders AND the matchers the handlers use, so the two never drift.
export const SHORTCUT_GROUPS = [
  { title: 'Universal', items: [
    { id: 'help',        keys: ['?'],               label: 'Open Keyboard Shortcuts Help', spec: { key: '?' } },
    { id: 'undo',        keys: ['⌘', 'Z'],          label: 'Undo',                         spec: { key: 'z', meta: true } },
    { id: 'redo',        keys: ['⌘', 'shift', 'Z'], label: 'Redo',                         spec: { key: 'z', meta: true, shift: true } },
    { id: 'selectAll',   keys: ['⌘', 'A'],          label: 'Select all transactions',      spec: { key: 'a', meta: true } },
    { id: 'deselectAll', keys: ['esc'],             label: 'Deselect all',                 spec: { key: 'Escape' } },
    { id: 'addTx',       keys: ['shift', 'N'],      label: 'Add transaction',              spec: { key: 'n', shift: true } },
  ] },
  { title: 'Transactions', items: [
    { id: 'toggleCleared', keys: ['C'],               label: 'Toggle cleared state',       spec: { key: 'c' } },
    { id: 'duplicate',     keys: ['shift', 'D'],      label: 'Duplicate',                  spec: { key: 'd', shift: true } },
    { id: 'delete',        keys: ['delete'],          label: 'Delete',                     spec: { key: 'Delete', alt: 'Backspace' } },
    { id: 'makeRepeating', keys: ['shift', 'T'],      label: 'Make repeating',             spec: { key: 't', shift: true } },
    { id: 'enterNow',      keys: ['E'],               label: 'Enter now (post scheduled)', spec: { key: 'e' } },
    { id: 'reconcile',     keys: ['shift', 'E'],      label: 'Reconcile account',          spec: { key: 'e', shift: true } },
    { id: 'focusSearch',   keys: ['⌘', 'shift', 'F'], label: 'Focus the search bar',       spec: { key: 'f', meta: true, shift: true } },
  ] },
];

export const SPEC = Object.fromEntries(
  SHORTCUT_GROUPS.flatMap(g => g.items.map(i => [i.id, i.spec])),
);

export function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

// metaKey OR ctrlKey both count as "meta" (cross-platform). Shift equality is
// enforced only for alphanumeric keys, so '?' (itself Shift+/) still matches.
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

- [ ] **Step 4: Implement `src/ui/useShortcuts.js`**

```js
import { useEffect, useRef } from 'react';
import { isTypingTarget, matchKey } from '../lib/shortcuts.js';

// One bubble-phase keydown listener (the capture-phase Escape chain is left
// untouched). Ignores keystrokes while typing. A ref holds the latest bindings
// so handlers never go stale and the listener is not re-subscribed every render.
// bindings: [{ spec, run, when? }]; `enabled` gates the whole set.
export function useShortcuts(bindings, enabled = true) {
  const ref = useRef(bindings);
  ref.current = bindings;
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = e => {
      if (isTypingTarget(document.activeElement)) return;
      for (const b of ref.current) {
        if (matchKey(e, b.spec) && (!b.when || b.when())) {
          e.preventDefault();
          b.run();
          return;
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled]);
}
```

- [ ] **Step 5: Run the test and the build**

Run: `npx vitest run tests/shortcuts.test.js` — Expected: PASS.
Run: `npx vitest run --exclude '**/.claude/**'` — Expected: all green.
Run: `npx vite build` — Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/shortcuts.js src/ui/useShortcuts.js tests/shortcuts.test.js
git commit -m "Shortcuts: registry + matchKey/isTypingTarget + useShortcuts hook, with tests"
```

---

### Task 2: Help modal + UIProvider state + user-menu item

**Files:**
- Create: `src/ui/ShortcutHelpModal.jsx`
- Modify: `src/ui/UIProvider.jsx`, `src/components/UserMenu.jsx`

**Interfaces:**
- Consumes: `SHORTCUT_GROUPS` (Task 1).
- Produces: `useUI()` gains `shortcutsOpen` (bool), `openShortcuts()`, `closeShortcuts()`. The modal renders inside UIProvider. UserMenu gets a "Keyboard shortcuts" item.

- [ ] **Step 1: Create `src/ui/ShortcutHelpModal.jsx`**

Modeled on `src/ui/ExplainDialog.jsx` (centered modal, scrim click closes, capture-phase Escape, FocusTrap). Module-scope `Kbd` sub-component.

```jsx
import { useEffect } from 'react';
import FocusTrap from './FocusTrap.jsx';
import { SHORTCUT_GROUPS } from '../lib/shortcuts.js';

function Kbd({ children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 22, height: 22, padding: '0 6px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--elev)', color: 'var(--text)', fontSize: 11.5, fontWeight: 600, lineHeight: 1 }}>{children}</span>
  );
}

export default function ShortcutHelpModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'hsFade .15s ease', zIndex: 60 }}>
      <FocusTrap>
        <div role="dialog" aria-modal="true" aria-label="Keyboard Shortcuts" onClick={e => e.stopPropagation()} style={{ width: 720, maxWidth: '94vw', maxHeight: '84vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)', padding: '22px 26px', animation: 'hsUp .18s ease', color: 'var(--text)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Keyboard Shortcuts</div>
            <button onClick={onClose} aria-label="Close" className="hv-soft" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
          </div>
          {SHORTCUT_GROUPS.map(g => (
            <div key={g.title} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{g.title}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '8px 24px' }}>
                {g.items.map(i => (
                  <div key={i.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--border)', padding: '6px 0' }}>
                    <span style={{ fontSize: 13, color: 'var(--text)' }}>{i.label}</span>
                    <span style={{ display: 'inline-flex', gap: 4, flex: 'none' }}>{i.keys.map((k, n) => <Kbd key={n}>{k}</Kbd>)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </FocusTrap>
    </div>
  );
}
```

- [ ] **Step 2: Wire UIProvider (`src/ui/UIProvider.jsx`)**

- Import the modal: `import ShortcutHelpModal from './ShortcutHelpModal.jsx';`
- Add state next to `confirm`: `const [shortcutsOpen, setShortcutsOpen] = useState(false);`
- Add callbacks: `const openShortcuts = useCallback(() => setShortcutsOpen(true), []); const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);`
- Add to the context `value` object (and its `useMemo` deps): `shortcutsOpen, openShortcuts, closeShortcuts`.
- Render the modal next to `<ConfirmDialog …/>`: `<ShortcutHelpModal open={shortcutsOpen} onClose={closeShortcuts} />`

- [ ] **Step 3: Add the user-menu item (`src/components/UserMenu.jsx`)**

- Import `useUI` and read `openShortcuts`: `const { openShortcuts } = useUI();`
- Add a `role="menuitem"` button (same `style={row}` / `className="hv-elev"` pattern as the existing items), placed above the Sign-out item:

```jsx
<button role="menuitem" className="hv-elev" style={row} onClick={() => { onClose(); openShortcuts(); }}>
  <span aria-hidden="true">⌘</span> Keyboard shortcuts <span style={rightNote}>?</span>
</button>
```

- [ ] **Step 4: Build and manual check**

Run: `npx vitest run --exclude '**/.claude/**'` — Expected: all green (no logic changed).
Run: `npx vite build` — Expected: clean.
Manual (dev server): open the user menu → "Keyboard shortcuts" opens the modal; it lists Universal + Transactions with key chips; `×`, scrim click, and Escape all close it.

- [ ] **Step 5: Commit**

```bash
git add src/ui/ShortcutHelpModal.jsx src/ui/UIProvider.jsx src/components/UserMenu.jsx
git commit -m "Shortcuts: help modal + UIProvider open/close state + user-menu entry"
```

---

### Task 3: SearchField imperative focus

**Files:**
- Modify: `src/ui/SearchField.jsx`

**Interfaces:**
- Produces: `SearchField` becomes a `forwardRef` exposing `focus()` (focuses the inner `<input>`). No behavior change otherwise.

- [ ] **Step 1: Convert to forwardRef**

- Change imports: `import { forwardRef, useImperativeHandle, useRef, useState } from 'react';`
- Wrap the component: `const SearchField = forwardRef(function SearchField({ value, onChange, placeholder = 'Search', label, collapsed = 190, expanded = 280 }, ref) { … });` and `export default SearchField;` at the bottom.
- Add `const inputRef = useRef(null);` and `useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);`
- Put `ref={inputRef}` on the `<input>`.

- [ ] **Step 2: Build and manual check**

Run: `npx vite build` — Expected: clean.
Run: `npx vitest run --exclude '**/.claude/**'` — Expected: all green.
Manual: the search box still filters as before (no visual/behavior change).

- [ ] **Step 3: Commit**

```bash
git add src/ui/SearchField.jsx
git commit -m "Shortcuts: expose SearchField.focus() via forwardRef for the focus-search shortcut"
```

---

### Task 4: Global shortcuts (`?`, `shift N`)

**Files:**
- Create: `src/components/GlobalShortcuts.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `useShortcuts` + `SPEC` (Task 1), `useUI` (`openShortcuts`/`closeShortcuts`/`shortcutsOpen`/`confirmOpen`, Task 2), `useDrawer`, `openers.addTx`.
- Produces: a render-null component mounted once in `Shell`.

- [ ] **Step 1: Create `src/components/GlobalShortcuts.jsx`**

```jsx
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useShortcuts } from '../ui/useShortcuts.js';
import { SPEC } from '../lib/shortcuts.js';
import { openers } from '../drawers/openers.js';

// App-level keys that are not tied to a screen: ? toggles the help modal,
// shift+N opens Add Transaction. Disabled while a drawer or confirm is open so
// they never stack.
export default function GlobalShortcuts() {
  const { openShortcuts, closeShortcuts, shortcutsOpen, confirmOpen } = useUI();
  const { drawer, openDrawer } = useDrawer();
  const bindings = [
    { spec: SPEC.help,  run: () => (shortcutsOpen ? closeShortcuts() : openShortcuts()) },
    { spec: SPEC.addTx, run: () => openers.addTx(openDrawer) },
  ];
  useShortcuts(bindings, !drawer && !confirmOpen);
  return null;
}
```

(The `help` binding stays live even when `shortcutsOpen` is true so `?` can also close it — the modal itself is not a typing target. `useShortcuts` reads bindings via a ref, so the fresh `shortcutsOpen` closure is always used.)

- [ ] **Step 2: Mount it in `Shell` (`src/App.jsx`)**

Add the import (`import GlobalShortcuts from './components/GlobalShortcuts.jsx';`) and render `<GlobalShortcuts />` as the first child inside `Shell`'s returned root element (it renders null, so placement is cosmetic).

- [ ] **Step 3: Build and manual check**

Run: `npx vite build` — Expected: clean.
Run: `npx vitest run --exclude '**/.claude/**'` — Expected: all green.
Manual: `?` opens the help modal and `?` again (or Escape / ×) closes it; `shift N` opens Add Transaction from any screen; neither fires while typing in a field or while a drawer/confirm is open.

- [ ] **Step 4: Commit**

```bash
git add src/components/GlobalShortcuts.jsx src/App.jsx
git commit -m "Shortcuts: global ? (help) and shift+N (add transaction)"
```

---

### Task 5: Transactions selection shortcuts + focus-search

**Files:**
- Modify: `src/screens/Transactions.jsx`

**Interfaces:**
- Consumes: `useShortcuts` + `SPEC` (Task 1); `SearchField.focus()` (Task 3); the existing `toggleAll`, `bulkStatus`, `bulkDuplicate`, `bulkDelete`, `singleRepeatItem`, `askPostNow`, `clearSched`, `selSched`, `sel`, `acct`, `accountId`, `openers.reconcile`, `useDrawer().openDrawer`, `useUI().confirmOpen`.

- [ ] **Step 1: Add imports and the search ref**

- Import: `import { useShortcuts } from '../ui/useShortcuts.js';` and `import { SPEC } from '../lib/shortcuts.js';`
- Ensure `useRef` is imported from `react`.
- Add `const searchRef = useRef(null);` in the component body.
- Ensure `confirmOpen` and `drawer` are available: read `const { confirmOpen } = useUI();` (useUI is already used for `notify`/`ask`) and `const { openDrawer, drawer } = useDrawer();` (openDrawer already read; add `drawer`).

- [ ] **Step 2: Pass the ref to SearchField**

Change the SearchField usage to include the ref:

```jsx
<SearchField ref={searchRef} value={F.q} onChange={v => setF('q', v)} placeholder={acct ? 'Search ' + acct.nickname : 'Search All Accounts'} label="Search transactions" />
```

- [ ] **Step 3: Register the shortcuts**

Add near the other derived handlers (after `schedMore` / `addDisabled`, before `return`):

```jsx
// Keyboard shortcuts for the register. Each reuses the function that already
// backs the bulk bar; preconditions (`when`) make an unmet key a silent no-op.
const txShortcuts = [
  { spec: SPEC.selectAll, run: () => toggleAll(true) },
  { spec: SPEC.focusSearch, run: () => searchRef.current?.focus() },
  { spec: SPEC.toggleCleared, when: () => sel.length > 0, run: () => {
      const rows = sel.map(id => S.transactions.find(t => t.id === id)).filter(Boolean);
      const allCleared = rows.length > 0 && rows.every(t => t.status === 'cleared');
      bulkStatus(allCleared ? 'pending' : 'cleared');
    } },
  { spec: SPEC.duplicate, when: () => sel.length > 0, run: bulkDuplicate },
  { spec: SPEC.delete, when: () => sel.length > 0, run: bulkDelete },
  { spec: SPEC.makeRepeating, when: () => singleRepeatItem() != null, run: () => singleRepeatItem().onClick() },
  { spec: SPEC.enterNow, when: () => selSched.length === 1 && !selSched[0].row.isRule, run: () => { const x = selSched[0]; clearSched(); askPostNow(x.row); } },
  { spec: SPEC.reconcile, when: () => !!acct, run: () => openers.reconcile(S, accountId, openDrawer) },
];
useShortcuts(txShortcuts, !drawer && !confirmOpen);
```

(`selectAll` and `delete` call `e.preventDefault()` inside the hook, overriding the browser's Cmd+A / Backspace-navigation only while Transactions is mounted and not typing.)

- [ ] **Step 4: Build, full suite, and manual check**

Run: `npx vitest run --exclude '**/.claude/**'` — Expected: all green.
Run: `npx vite build` — Expected: clean.
Manual (dev server, `/transactions` and `/transactions/:accountId`):
- Select rows → `C` toggles cleared/uncleared, `shift D` duplicates, `Delete`/`Backspace` opens the delete confirm, `Cmd A` selects all visible (not the browser select-all), `Escape` deselects.
- One recorded row selected → `shift T` makes it repeating.
- One future-dated scheduled row selected → `E` posts it now; a rule row selected → `E` is a no-op.
- On an account ledger → `shift E` opens Reconcile; on All Accounts → no-op.
- `Cmd Shift F` focuses the search box.
- No shortcut fires while typing in the search box or a drawer field.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Transactions.jsx
git commit -m "Shortcuts: register register-context keys (select-all, cleared, duplicate, delete, repeat, post-now, reconcile, focus-search)"
```

---

## Self-Review notes

- **Spec coverage:** every phase-1 shortcut in the spec table is bound — Universal (`?`, `Cmd A`, `shift N`; undo/redo/Escape already existed and are only listed in the modal) and Transactions (`C`, `shift D`, `Delete`, `shift T`, `E`, `shift E`, `Cmd Shift F`). Help modal, UIProvider state, SearchField ref, and the user-menu entry are all present.
- **Type consistency:** `SPEC[id]` shape `{key, meta?, shift?, alt?}` is produced in Task 1 and consumed identically in Tasks 4–5; `useShortcuts(bindings, enabled)` with `bindings=[{spec, run, when?}]` is used the same way in both `GlobalShortcuts` and `Transactions`.
- **No placeholders:** every code step contains real code.
- **Escape untouched:** no task adds or edits an Escape handler; `useShortcuts` never binds Escape.
- **Verification note for the reviewer/implementer:** components (hook, modal, global, Transactions wiring) can't be unit-tested here (no jsdom, auth gate) — only `src/lib/shortcuts.js` is unit-tested (Task 1). Tasks 2–5 are verified by build + the manual dev-server checks listed.
```
