// Plan filter pills (Phase 4). Built-ins first, then the user's custom views in
// sortOrder, then a ⋯ menu (Manage Views / New View). Tokens captured from
// YNAB's pill bar: 25px tall, radius 5, 12px/500, 3px 12px padding.
import { useEffect, useRef, useState } from 'react';
import { BUILTIN_VIEWS, countFor } from '../../lib/planViews.js';

const pillBase = { height: 25, padding: '3px 12px', borderRadius: 5, fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', border: '1.5px solid transparent', background: 'var(--elev)', color: 'var(--text)' };

export default function FilterPills({ views, activeId, onSelect, onManage, onNewView, env, catIds }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  // Built-ins carry `label`, custom views carry `name` — normalize once here so
  // the pill renderer below has exactly one concept to render.
  const all = [...BUILTIN_VIEWS, ...views.map(v => ({ ...v, label: v.name }))];

  // Replicates Plan.jsx's usePopoverDismiss contract inline (that hook is
  // module-scoped to Plan.jsx): outside mousedown closes; Escape closes on
  // the capture phase with stopPropagation.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); setMenuOpen(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [menuOpen]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {all.map(v => {
        const active = v.id === activeId;
        const count = countFor(v.id, env, catIds);
        const danger = v.id === 'overspent' && count > 0;
        return (
          <button key={v.id} onClick={() => onSelect(v.id)} aria-pressed={active}
            style={{ ...pillBase,
              background: active ? 'var(--soft)' : danger ? 'var(--neg-soft)' : 'var(--elev)',
              color: danger && !active ? 'var(--neg)' : 'var(--text)',
              borderColor: active ? 'var(--accent)' : 'transparent' }}>
            {count > 0 ? count + ' ' + v.label : v.label}
          </button>
        );
      })}
      <div ref={menuRef} style={{ position: 'relative' }}>
        <button onClick={() => setMenuOpen(o => !o)} aria-label="Views menu" aria-expanded={menuOpen}
          style={{ ...pillBase, padding: '3px 10px' }}>⋯</button>
        {menuOpen && (
          <div role="menu" style={{ position: 'absolute', top: 30, left: 0, zIndex: 40, minWidth: 150, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow)', padding: 4 }}>
            <button role="menuitem" className="hv-soft" onClick={() => { setMenuOpen(false); onManage(); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none', borderRadius: 6, background: 'transparent', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>Manage Views</button>
            <button role="menuitem" className="hv-soft" onClick={() => { setMenuOpen(false); onNewView(); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none', borderRadius: 6, background: 'transparent', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>New View</button>
          </div>
        )}
      </div>
    </div>
  );
}
