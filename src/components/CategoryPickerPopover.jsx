// Anchored category-picker popover for the WEB (desktop): a search field over a
// grouped category list with each envelope's Available on the right. Hosted in a
// Base UI popover anchored to any element, so the same component serves the bulk
// bar's Categorize today and (later) a row's category cell / needs-category pill.
//
// Reusable + controlled by design: the caller owns `open`/`onOpenChange` and
// supplies the `anchor` element (usually the click target's currentTarget), then
// handles the pick via `onPick(categoryId)`. Base UI gives Escape / outside-click
// dismissal and focus-return for free. Phone keeps CategoryPickerSheet instead.
//
// It goes straight to Base UI rather than the shared Popover primitive because it
// needs an external `anchor` (no in-tree trigger) — a capability the primitive
// doesn't expose yet; the surface still matches its "Trusted Ledger" tokens.
import { useEffect, useMemo, useState } from 'react';
import { Popover as BasePopover } from '@base-ui/react/popover';
import { useStore } from '../store/StoreProvider.jsx';
import { useMonth } from '../store/MonthContext.jsx';
import { useMoney } from '../lib/format.js';
import { nowIso } from '../lib/dates.js';
import { envelopeFor } from '../lib/envelope.js';
import { categoryPickerSections } from '../lib/categoryPicker.js';

export default function CategoryPickerPopover({ open, onOpenChange, anchor, catType = 'expense', onPick }) {
  const { data: S } = useStore();
  const { month } = useMonth();
  const { money } = useMoney();
  const [q, setQ] = useState('');
  useEffect(() => { if (open) setQ(''); }, [open]);

  // Available only applies to expense categories (income has no envelope), so
  // skip the fold for income — same rule as the sheet / TxForm.
  const showAmounts = catType === 'expense';
  const env = useMemo(() => (open && showAmounts ? envelopeFor(S, month, nowIso()) : null), [open, showAmounts, S, month]);
  const sections = useMemo(() => (open ? categoryPickerSections(S, catType, q) : []),
    [open, S.categories, S.categoryGroups, q, catType]); // eslint-disable-line react-hooks/exhaustive-deps
  const availColor = n => (n > 0 ? 'var(--pos)' : n < 0 ? 'var(--neg)' : 'var(--muted)');
  const pick = id => { onPick(id); onOpenChange(false); };

  return (
    <BasePopover.Root open={open} onOpenChange={onOpenChange}>
      <BasePopover.Portal>
        <BasePopover.Positioner
          anchor={anchor} side="top" align="start" sideOffset={8}
          collisionAvoidance={{ side: 'flip', align: 'shift' }} style={{ zIndex: 40 }}
        >
          <BasePopover.Popup
            aria-label="Choose a category"
            style={{ width: 300, maxWidth: '94vw', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)', outline: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
              <input
                autoFocus value={q} onChange={e => setQ(e.target.value)}
                placeholder="Search Categories" aria-label="Search categories"
                style={{ width: '100%', boxSizing: 'border-box', height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', font: 'inherit', fontSize: 14, outline: 'none' }}
              />
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto', padding: '4px 0' }}>
              {sections.map(sec => (
                <section key={sec.id} aria-label={sec.name}>
                  <h3 style={{ margin: '8px 12px 4px', fontSize: 12, fontWeight: 700, letterSpacing: '.3px', color: 'var(--muted)' }}>{sec.name}</h3>
                  {sec.cats.map(c => {
                    const avail = showAmounts ? (env?.rows.get(c.id)?.available ?? 0) : 0;
                    return (
                      <button
                        key={c.id} onClick={() => pick(c.id)} className="hv-elev"
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', border: 'none', background: 'none', color: 'var(--text)', font: 'inherit', fontSize: 14, cursor: 'pointer', textAlign: 'left' }}
                      >
                        <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                        {showAmounts && <span className="tnum" style={{ flex: 'none', fontSize: 13, fontWeight: 600, color: availColor(avail) }}>{money(avail)}</span>}
                      </button>
                    );
                  })}
                </section>
              ))}
              {sections.length === 0 && (
                <p style={{ margin: '16px 12px', fontSize: 13, color: 'var(--muted)' }}>No categories match “{q}”.</p>
              )}
            </div>
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
