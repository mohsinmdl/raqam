import { useMemo, useRef, useState } from 'react';

// One-field category combobox (YNAB-style): the field IS the search input.
// Closed, it shows the picked name (or a placeholder); focusing it opens the
// grouped list right beneath and typing filters. This replaces the old
// two-box feel (a "Choose a category" trigger that opened a separate
// "Search categories" input). The HOSTING popover still owns its own
// open/dismiss; this component only owns the field + list.
//
// Props: env (envelopeFor result), S, month, money, value (category id |
// 'rta' | null), onChange(idOr'rta'), excludeRta?, excludeId?, placeholder?.
export default function PlanCategoryPicker({ env, S, month, money, value, onChange, excludeRta, excludeId, placeholder = 'Choose a category' }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const inputRef = useRef(null);

  const nameOf = v => (v === 'rta' ? 'Ready to Assign' : v ? ((S.categories.find(c => c.id === v) || {}).name || '') : '');

  const flat = useMemo(() => {
    const norm = s => s.toLowerCase();
    const groups = [...(S.categoryGroups || [])].sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));
    const ids = new Set(groups.map(g => g.id));
    const cats = S.categories.filter(c => c.type === 'expense' && c.status === 'active' && c.id !== excludeId
      && (!q || norm(c.name).includes(norm(q))));
    const out = [];
    if (!excludeRta && (!q || 'ready to assign'.includes(norm(q)))) out.push({ kind: 'rta' });
    groups.forEach(g => {
      const members = cats.filter(c => c.groupId === g.id);
      if (members.length) { out.push({ kind: 'head', name: g.name }); members.forEach(c => out.push({ kind: 'cat', cat: c })); }
    });
    const other = cats.filter(c => !c.groupId || !ids.has(c.groupId));
    if (other.length) { out.push({ kind: 'head', name: 'Other' }); other.forEach(c => out.push({ kind: 'cat', cat: c })); }
    return out;
  }, [S, q, excludeRta, excludeId]);

  const pickable = flat.filter(x => x.kind !== 'head');
  const clampHi = i => (pickable.length ? Math.max(0, Math.min(pickable.length - 1, i)) : -1);
  const openList = () => { setQ(''); setHi(0); setOpen(true); };
  const pick = item => {
    if (!item) return;
    onChange(item.kind === 'rta' ? 'rta' : item.cat.id);
    setOpen(false);
    if (inputRef.current) inputRef.current.blur();
  };
  const onKey = e => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { e.preventDefault(); openList(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => clampHi(h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => clampHi(h - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(pickable[clampHi(hi)]); }
  };
  const availOf = id => (env.rows.get(id) || {}).available || 0;
  const tone = v => (v > 0 ? 'var(--pos)' : v < 0 ? 'var(--neg)' : 'var(--muted)');

  let pi = -1; // pickable index while rendering
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          value={open ? q : nameOf(value)}
          placeholder={placeholder}
          aria-label={placeholder} role="combobox" aria-expanded={String(open)}
          onFocus={openList}
          onBlur={() => setOpen(false)}
          onChange={e => { setQ(e.target.value); setHi(0); if (!open) setOpen(true); }}
          onKeyDown={onKey}
          style={{ width: '100%', boxSizing: 'border-box', height: 34, padding: '0 28px 0 10px', border: '1px solid ' + (open ? 'var(--accent)' : 'var(--border)'), borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}
        />
        <span aria-hidden="true" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 10, pointerEvents: 'none' }}>▾</span>
      </div>
      {open && (
        // The list OVERLAYS the popover content below the field (absolute, not
        // in-flow) so the card never stretches and its Cancel/OK row stays put
        // behind it — matching YNAB. preventDefault on mousedown keeps the
        // input focused while a row is clicked — otherwise the blur would
        // close the list before the click lands (SearchField's idiom).
        <div onMouseDown={e => e.preventDefault()}
          style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 40, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 15, fontWeight: 700, padding: '14px 16px 8px' }}>Plan Categories</div>
          <div style={{ maxHeight: 240, overflowY: 'auto', padding: '0 10px 16px 12px' }}>
          {flat.map((item, i) => {
            if (item.kind === 'head') return <div key={'h' + i} style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', padding: '6px 2px 2px' }}>{item.name}:</div>;
            pi += 1;
            const active = pi === clampHi(hi);
            const isRta = item.kind === 'rta';
            const val = isRta ? env.rta : availOf(item.cat.id);
            return (
              <button key={isRta ? 'rta' : item.cat.id} onClick={() => pick(item)} className="hv-elev"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', border: 'none', textAlign: 'left', padding: '7px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 13, background: active ? 'var(--soft)' : (isRta ? 'var(--elev)' : 'transparent'), color: 'var(--text)' }}>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isRta ? 'Inflow: Ready to Assign' : item.cat.name}</span>
                <span className="tnum" style={{ flex: 'none', fontWeight: 600, color: tone(val) }}>{money(val)}</span>
              </button>
            );
          })}
          {pickable.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: 8 }}>No matches.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
