// Dev Tools — a hand-maintained registry of the app's custom, reusable
// components, so we can find and reuse them instead of rebuilding. Mounted at
// /dev-tools. To list a new component, add an entry to REGISTRY below (name,
// import path, one-line purpose). This is a developer aid, not a user screen.
import { useMemo, useState } from 'react';

const REGISTRY = [
  {
    group: 'Primitives — src/ui/primitives',
    items: [
      { name: 'Popover', path: 'src/ui/primitives/Popover.jsx', desc: 'Base UI popover shell: anchored positioning, body portal, collision flip, Escape / outside-click dismissal, focus-return.' },
      { name: 'Menu', path: 'src/ui/primitives/Menu.jsx', desc: 'Base UI menu primitive (tokened surface, keyboard nav).' },
      { name: 'BottomSheet', path: 'src/ui/primitives/BottomSheet.jsx', desc: 'Base UI Dialog rendered as a phone bottom sheet.' },
    ],
  },
  {
    group: 'UI — src/ui',
    items: [
      { name: 'BulkBar', path: 'src/ui/BulkBar.jsx', desc: 'Floating bulk-action toolbar shown while rows are selected: count, selected total, inline icon actions, and an upward "More" menu.' },
      { name: 'PlanCategoryPicker', path: 'src/ui/PlanCategoryPicker.jsx', desc: 'YNAB-style one-field category combobox — the field is the search; grouped list + envelope Available beneath.' },
      { name: 'Checkbox', path: 'src/ui/Checkbox.jsx', desc: 'Tokened checkbox with fill / indeterminate states.' },
      { name: 'Kbd', path: 'src/ui/Kbd.jsx', desc: 'Keyboard-shortcut badge (has an onDark variant for inverted bars).' },
      { name: 'FocusTrap', path: 'src/ui/FocusTrap.jsx', desc: 'Traps focus inside a modal/sheet panel and restores it on unmount.' },
      { name: 'SearchField', path: 'src/ui/SearchField.jsx', desc: 'Search input with the shared field styling.' },
      { name: 'Tooltip', path: 'src/ui/Tooltip.jsx', desc: 'Hover/focus tooltip.' },
      { name: 'Toast', path: 'src/ui/Toast.jsx', desc: 'Transient bottom-pinned notification (stacks above BulkBar).' },
      { name: 'RowMenu', path: 'src/ui/RowMenu.jsx', desc: 'Per-row overflow (⋯) menu.' },
      { name: 'ToolbarAction', path: 'src/ui/ToolbarAction.jsx', desc: 'Toolbar icon buttons (Plus, Undo, Redo, …).' },
      { name: 'SortIcon', path: 'src/ui/SortIcon.jsx', desc: 'Ascending/descending sort indicator for sortable headers.' },
      { name: 'TxChips', path: 'src/ui/TxChips.jsx', desc: 'Transaction status chips, incl. the NeedsCategoryPill CTA.' },
      { name: 'ConfirmDialog', path: 'src/ui/ConfirmDialog.jsx', desc: 'Confirm/deny modal (used via useUI().ask).' },
      { name: 'ExplainDialog', path: 'src/ui/ExplainDialog.jsx', desc: 'Info/explanation modal.' },
      { name: 'ShortcutHelpModal', path: 'src/ui/ShortcutHelpModal.jsx', desc: 'Keyboard-shortcut cheat-sheet modal.' },
    ],
  },
  {
    group: 'Components — src/components',
    items: [
      { name: 'CategoryPickerPopover', path: 'src/components/CategoryPickerPopover.jsx', desc: 'Anchored category-picker popover (web): search + grouped list + Available. Controlled via open/onOpenChange + an anchor element + onPick — reusable on any trigger.' },
      { name: 'CategoryPickerSheet', path: 'src/components/CategoryPickerSheet.jsx', desc: 'Phone-first category-picker bottom sheet (search docked at the bottom).' },
      { name: 'MonthGridPopover', path: 'src/components/MonthGridPopover.jsx', desc: 'Month/year grid picker in a Base UI popover.' },
      { name: 'TxMonthNav', path: 'src/components/TxMonthNav.jsx', desc: 'Transaction month navigator (first production consumer of the Popover primitive).' },
      { name: 'AccountList', path: 'src/components/AccountList.jsx', desc: 'Sidebar account list with per-account balances and navigation.' },
      { name: 'PositionStrip', path: 'src/components/PositionStrip.jsx', desc: 'Cleared / uncleared / working-balance strip for the register header.' },
    ],
  },
];

const wrap = { maxWidth: 980, margin: '0 auto', padding: '28px 24px 64px' };
const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' };
const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

export default function DevTools() {
  const [q, setQ] = useState('');

  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return REGISTRY;
    return REGISTRY
      .map(g => ({ ...g, items: g.items.filter(it =>
        it.name.toLowerCase().includes(ql) || it.path.toLowerCase().includes(ql) || it.desc.toLowerCase().includes(ql)) }))
      .filter(g => g.items.length > 0);
  }, [q]);

  const total = REGISTRY.reduce((n, g) => n + g.items.length, 0);
  const shown = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Dev Tools</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--muted)' }}>
            Custom reusable components. Add entries in <code style={{ fontFamily: mono }}>src/screens/DevTools.jsx</code>.
          </p>
        </div>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{shown === total ? `${total} components` : `${shown} of ${total}`}</span>
      </div>

      <input
        value={q} onChange={e => setQ(e.target.value)}
        placeholder="Filter by name, path, or description…" aria-label="Filter components"
        style={{ width: '100%', boxSizing: 'border-box', height: 40, margin: '18px 0 24px', padding: '0 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', font: 'inherit', fontSize: 14, outline: 'none' }}
      />

      {groups.map(g => (
        <section key={g.group} style={{ marginBottom: 26 }}>
          <h2 style={{ margin: '0 0 10px 2px', fontSize: 13, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--muted)' }}>{g.group}</h2>
          <div style={card}>
            {g.items.map((it, i) => (
              <div key={it.name} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '12px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: mono, fontSize: 14, fontWeight: 700 }}>{it.name}</span>
                  <span style={{ fontFamily: mono, fontSize: 12, color: 'var(--muted)' }}>{it.path}</span>
                </div>
                <span style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.45 }}>{it.desc}</span>
              </div>
            ))}
          </div>
        </section>
      ))}

      {groups.length === 0 && (
        <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>No components match “{q}”.</p>
      )}
    </div>
  );
}
