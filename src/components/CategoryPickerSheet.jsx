// Phone-first category picker bottom sheet (YNAB): grouped categories with
// envelope Available on the right, search docked at the BOTTOM (thumb reach),
// "+ New Category" opens the existing category drawer. Used by Spending's
// Select-mode Categorize (desktop reuses it from the bulk more-menu). Spec:
// docs/superpowers/specs/2026-08-12-mobile-tabbar-ynab-spending-design.md
import { useEffect, useMemo, useState } from 'react';
import { categoryPickerSections } from '../lib/categoryPicker.js';
import { useStore } from '../store/StoreProvider.jsx';
import { useMonth } from '../store/MonthContext.jsx';
import { useMoney } from '../lib/format.js';
import { nowIso } from '../lib/dates.js';
import { envelopeFor } from '../lib/envelope.js';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { openers } from '../drawers/openers.js';
import FocusTrap from '../ui/FocusTrap.jsx';

export default function CategoryPickerSheet({ open, onClose, onPick, catType = 'expense', allowCreate = true }) {
  const { data: S } = useStore();
  const { month } = useMonth();
  const { money } = useMoney();
  const { openDrawer } = useDrawer();
  const [q, setQ] = useState('');
  useEffect(() => { if (open) setQ(''); }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    // Capture-phase + stopPropagation: Escape closes the sheet before the
    // screen's document-level Escape clears the whole selection — same
    // contract as BulkBar's MoreMenu / RowMenu.
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  // Available amounts (per-envelope) only apply to expense categories — income
  // categories have no envelope. Mirrors TxForm's showAmounts rule
  // (catType === 'expense'); skip the envelopeFor() computation for income too.
  const showAmounts = catType === 'expense';
  const env = useMemo(() => (open && showAmounts ? envelopeFor(S, month, nowIso()) : null), [open, showAmounts, S, month]);
  const sections = useMemo(() => (open ? categoryPickerSections(S, catType, q) : []),
    [open, S.categories, S.categoryGroups, q, catType]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;
  const availColor = n => (n > 0 ? 'var(--pos)' : n < 0 ? 'var(--neg)' : 'var(--muted)');
  return (
    <div role="dialog" aria-modal="true" aria-label="Select category"
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'var(--scrim)' }} />
      {/* FocusTrap wraps the PANEL only (not the backdrop) — same contract as
          DrawerProvider's DrawerShell: aria-modal must actually hold focus, and
          unmounting restores it to whatever opened the sheet. */}
      <FocusTrap>
      <div style={{ position: 'relative', maxHeight: '82dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', borderRadius: '16px 16px 0 0', border: '1px solid var(--border)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <button onClick={onClose} aria-label="Close" className="hv-soft"
            style={{ width: 44, height: 44, border: 'none', borderRadius: 999, background: 'var(--elev)', color: 'var(--text)', fontSize: 16, cursor: 'pointer', flex: 'none' }}>✕</button>
          <span style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 700, marginRight: 44 }}>Select Category</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 76px' }}>
          {allowCreate && (
            <button onClick={() => { onClose(); openers.addCategory(openDrawer); }} className="hv-elev rq-btn-outline"
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 48, padding: '0 14px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--accent)', font: 'inherit', fontSize: 14.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
              ＋ New Category
            </button>
          )}
          {sections.map(sec => (
            <section key={sec.id} aria-label={sec.name}>
              <h3 style={{ margin: '18px 2px 8px', fontSize: 13.5, fontWeight: 700 }}>{sec.name}</h3>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                {sec.cats.map((c, i) => {
                  const avail = showAmounts ? (env.rows.get(c.id)?.available ?? 0) : 0;
                  return (
                    <button key={c.id} onClick={() => onPick(c.id)} className="hv-elev"
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 48, padding: '8px 14px', border: 'none', borderBottom: i === sec.cats.length - 1 ? 'none' : '1px solid var(--border)', background: 'none', color: 'var(--text)', font: 'inherit', fontSize: 14, cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                      {showAmounts && <span className="tnum" style={{ flex: 'none', fontSize: 13.5, fontWeight: 600, color: availColor(avail) }}>{money(avail)}</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          {sections.length === 0 && (
            <p style={{ margin: '24px 2px', fontSize: 13.5, color: 'var(--muted)' }}>No categories match “{q}”.</p>
          )}
        </div>
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search Categories" aria-label="Search categories"
            style={{ width: '100%', boxSizing: 'border-box', height: 46, padding: '0 16px', borderRadius: 999, border: '1px solid var(--border)', background: 'color-mix(in srgb, var(--elev) 92%, transparent)', color: 'var(--text)', font: 'inherit', fontSize: 15, outline: 'none', boxShadow: 'var(--shadow)', backdropFilter: 'blur(8px)' }} />
        </div>
      </div>
      </FocusTrap>
    </div>
  );
}
