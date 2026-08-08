import { useMemo, useRef, useState } from 'react';

// Grouped category dropdown for Assign / Move / Cover popovers: search input over
// "Inflow: Ready to Assign" + groups (sortOrder, implicit Other last) of active
// expense categories, each with its Available colored by sign. Keyboard: ↑/↓
// moves, Enter picks. The HOSTING popover owns open/dismiss; this is the panel.
export default function PlanCategoryPicker({ env, S, month, money, onPick, excludeRta, excludeId }) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const listRef = useRef(null);

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
  const clampHi = i => Math.max(0, Math.min(pickable.length - 1, i));
  const pick = item => item && onPick(item.kind === 'rta' ? 'rta' : item.cat.id);
  const onKey = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => clampHi(h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => clampHi(h - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(pickable[clampHi(hi)]); }
  };
  const availOf = id => (env.rows.get(id) || {}).available || 0;
  const tone = v => (v > 0 ? 'var(--pos)' : v < 0 ? 'var(--neg)' : 'var(--muted)');

  let pi = -1; // pickable index while rendering
  return (
    <div style={{ width: 280 }}>
      <input autoFocus value={q} onChange={e => { setQ(e.target.value); setHi(0); }} onKeyDown={onKey}
        placeholder="Search categories" aria-label="Search categories"
        style={{ width: '100%', boxSizing: 'border-box', height: 34, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }} />
      <div ref={listRef} style={{ maxHeight: 260, overflowY: 'auto', marginTop: 8 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, padding: '4px 2px 6px' }}>Plan Categories</div>
        {flat.map((item, i) => {
          if (item.kind === 'head') return <div key={'h' + i} style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', padding: '6px 2px 2px' }}>{item.name}:</div>;
          pi += 1;
          const active = pi === clampHi(hi);
          const isRta = item.kind === 'rta';
          const label = isRta ? 'Ready to Assign' : item.cat.name;
          const val = isRta ? env.rta : availOf(item.cat.id);
          return (
            <button key={isRta ? 'rta' : item.cat.id} onClick={() => pick(item)} className="hv-elev"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', border: 'none', textAlign: 'left', padding: '7px 8px', borderRadius: 7, cursor: 'pointer', fontSize: 13, background: active ? 'var(--soft)' : (isRta ? 'var(--elev)' : 'transparent'), color: 'var(--text)' }}>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isRta ? 'Inflow: Ready to Assign' : label}</span>
              <span className="tnum" style={{ flex: 'none', fontWeight: 600, color: tone(val) }}>{money(val)}</span>
            </button>
          );
        })}
        {pickable.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: 8 }}>No matches.</div>}
      </div>
    </div>
  );
}
