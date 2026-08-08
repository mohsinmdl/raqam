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
  // Two-key "leader" sequences: press G, then the second key (within ~1.2s).
  { title: 'Navigation', items: [
    { id: 'goDashboard', keys: ['G', 'D'], label: 'Go to Dashboard', spec: { seq: ['g', 'd'] } },
    { id: 'goAccounts',  keys: ['G', 'A'], label: 'Go to All Accounts', spec: { seq: ['g', 'a'] } },
    { id: 'goBudget',    keys: ['G', 'B'], label: 'Go to Budget',    spec: { seq: ['g', 'b'] } },
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
