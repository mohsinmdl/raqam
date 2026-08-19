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
    { id: 'toggleTheme', keys: ['ctrl', 'shift', 'L'], label: 'Toggle light / dark mode',  spec: { key: 'l', meta: true, shift: true } },
    { id: 'hideAmounts', keys: ['H'],               label: 'Hide amounts',                 spec: { key: 'h' } },
    { id: 'lockNow',     keys: ['L'],               label: 'Lock the app now',             spec: { key: 'l' } },
  ] },
  { title: 'Transactions', items: [
    { id: 'toggleCleared', keys: ['C'],               label: 'Toggle cleared state',       spec: { key: 'c' } },
    { id: 'duplicate',     keys: ['shift', 'D'],      label: 'Duplicate',                  spec: { key: 'd', shift: true } },
    { id: 'delete',        keys: ['delete'],          label: 'Delete',                     spec: { key: 'Delete', alt: 'Backspace' } },
    { id: 'makeRepeating', keys: ['shift', 'T'],      label: 'Make repeating',             spec: { key: 't', shift: true } },
    { id: 'editSelected',  keys: ['shift', 'E'],      label: 'Edit selected transaction',  spec: { key: 'e', shift: true } },
    { id: 'enterNow',      keys: ['E'],               label: 'Enter now (post scheduled)', spec: { key: 'e' } },
    { id: 'reconcile',     keys: ['shift', 'E'],      label: 'Reconcile account (no selection)', spec: { key: 'e', shift: true } },
    { id: 'focusSearch',   keys: ['⌘', 'shift', 'F'], label: 'Focus the search bar',       spec: { key: 'f', meta: true, shift: true } },
  ] },
  // Two-key "leader" sequences: press G, then the second key (within ~1.2s).
  { title: 'Navigation', items: [
    { id: 'goDashboard',    keys: ['G', 'D'], label: 'Go to Reflect (Overview)', spec: { seq: ['g', 'd'] } },
    { id: 'goTransactions', keys: ['G', 'T'], label: 'Go to Transactions',    spec: { seq: ['g', 't'] } },
    { id: 'goAccounts',     keys: ['G', 'A'], label: 'Go to Accounts',        spec: { seq: ['g', 'a'] } },
    { id: 'goBudget',       keys: ['G', 'B'], label: 'Go to Budget',          spec: { seq: ['g', 'b'] } },
  ] },
  // Keyboard cursor over the recorded rows. These are handled by a raw keydown
  // listener + click handler in Transactions, not matchKey — the `spec` here is
  // only to satisfy the registry shape and is never matched against an event.
  { title: 'Row navigation (Transactions)', items: [
    { id: 'moveCursor',   keys: ['↑', '↓'],          label: 'Move between rows',          spec: { key: 'RowArrow' } },
    { id: 'selectCursor', keys: ['space'],            label: 'Select / deselect the row',  spec: { key: 'RowSpace' } },
    { id: 'extendSel',    keys: ['shift', '↑', '↓'], label: 'Extend the selection',       spec: { key: 'RowShiftArrow' } },
    { id: 'rangeClick',   keys: ['shift', 'click'],  label: 'Select a range',             spec: { key: 'RowShiftClick' } },
  ] },
  // Transactions-screen date-range presets: press V, then the second key.
  { title: 'View (Transactions)', items: [
    { id: 'viewToday',     keys: ['V', 'T'], label: 'View: Today',      spec: { seq: ['v', 't'] } },
    { id: 'viewYesterday', keys: ['V', 'Y'], label: 'View: Yesterday',  spec: { seq: ['v', 'y'] } },
    { id: 'viewMonth',     keys: ['V', 'M'], label: 'View: This Month', spec: { seq: ['v', 'm'] } },
    { id: 'viewAll',       keys: ['V', 'A'], label: 'View: All Dates',  spec: { seq: ['v', 'a'] } },
  ] },
];

export const SPEC = Object.fromEntries(
  SHORTCUT_GROUPS.flatMap(g => g.items.map(i => [i.id, i.spec])),
);

// Full item (id, keys, label, spec) by id — the source for shortcut tooltips,
// so a tooltip's label/chips can never drift from the help modal.
export const SHORTCUT_BY_ID = Object.fromEntries(
  SHORTCUT_GROUPS.flatMap(g => g.items.map(i => [i.id, i])),
);

export function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

// metaKey OR ctrlKey both count as "meta" (cross-platform). Shift equality is
// enforced only for alphanumeric keys, so '?' (itself Shift+/) still matches.
export function matchKey(e, spec) {
  if (!spec || !spec.key) return false; // sequence specs (`{ seq: […] }`) are handled elsewhere
  const want = spec.key.length === 1 ? spec.key.toLowerCase() : spec.key;
  const got = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const keyHit = got === want || (spec.alt && e.key === spec.alt);
  if (!keyHit) return false;
  if (!!spec.meta !== (e.metaKey || e.ctrlKey)) return false;
  if (/^[a-z0-9]$/.test(want) && !!spec.shift !== e.shiftKey) return false;
  return true;
}
