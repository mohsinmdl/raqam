import { useMemo, useRef, useState } from 'react';

// One-field category combobox (YNAB-style): the field IS the search input.
// Closed, it shows the picked name (or a placeholder); focusing it opens the
// grouped list right beneath and typing filters. This replaces the old
// two-box feel (a "Choose a category" trigger that opened a separate
// "Search categories" input). The HOSTING popover still owns its own
// open/dismiss; this component only owns the field + list.
//
// Shared by the Budget Assign/Move flows (defaults) and the transaction form.
// Props:
//   env, S, month, money — data. value (category id | 'rta' | '__new' | null),
//   onChange(idOr'rta'). excludeRta?, excludeId?, placeholder?.
//   catType='expense'  — which category type to list (expense | income).
//   showAmounts=true   — show each envelope's available beside it; off for
//                        income categories, which have no envelope balance.
//   heading='Plan Categories' — panel title; pass null to omit it.
//   allowCreate=false, onCreate({name, groupId}) — render a "＋ New Category"
//                        row at the top (YNAB txn picker). Clicking it swaps the
//                        list for an inline Add Category form (name + group);
//                        Save calls onCreate — the host creates + selects it.
//   showSelected=false — render a "Selected" section for the current pick
//                        (with a ✓), even if that category is archived.
export default function PlanCategoryPicker({
  env, S, month, money, value, onChange,
  excludeRta, excludeId, placeholder = 'Choose a category',
  catType = 'expense', showAmounts = true, heading = 'Plan Categories',
  allowCreate = false, onCreate, showSelected = false,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const [dropUp, setDropUp] = useState(false);
  const [listMax, setListMax] = useState(240);
  // Inline Add Category form state (allowCreate). While `creating`, the panel
  // shows the form instead of the list, and the combobox's blur must NOT close
  // the panel (the form's own inputs legitimately take focus).
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGroupId, setNewGroupId] = useState('');
  const [pendingName, setPendingName] = useState('');
  const inputRef = useRef(null);

  const groups = useMemo(() => [...(S.categoryGroups || [])].sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99)), [S.categoryGroups]);
  const nameOf = v => (v === 'rta' ? 'Ready to Assign'
    : v === '__new' ? (pendingName || '＋ New category')
    : v ? ((S.categories.find(c => c.id === v) || {}).name || '') : '');
  const groupNameOf = c => (S.categoryGroups.find(g => g.id === (c || {}).groupId) || {}).name || 'Other';

  const flat = useMemo(() => {
    const norm = s => s.toLowerCase();
    const ids = new Set(groups.map(g => g.id));
    const cats = S.categories.filter(c => c.type === catType && c.status === 'active' && c.id !== excludeId
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
  }, [S, q, excludeRta, excludeId, catType, groups]);

  const pickable = flat.filter(x => x.kind !== 'head');
  const clampHi = i => (pickable.length ? Math.max(0, Math.min(pickable.length - 1, i)) : -1);
  const openList = () => {
    setQ(''); setHi(0);
    // Place the panel inside the field's actually-VISIBLE band, not the
    // window: overflow ancestors clip it and the app header paints over it,
    // so both act as ceilings/floors. Prefer below at full height, then
    // above at full height, else the roomier side with a shrunk list.
    const CHROME = 60; // heading + panel padding + borders around the scroll area
    const el = inputRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      let topLimit = 0, botLimit = window.innerHeight;
      for (let a = el.parentElement; a; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (s.overflowY !== 'visible' || s.overflowX !== 'visible') {
          const b = a.getBoundingClientRect();
          topLimit = Math.max(topLimit, b.top);
          botLimit = Math.min(botLimit, b.bottom);
        }
      }
      const hdr = document.querySelector('header');
      if (hdr) topLimit = Math.max(topLimit, hdr.getBoundingClientRect().bottom);
      const above = r.top - 6 - topLimit, below = botLimit - r.bottom - 6;
      const up = below < 240 + CHROME && above >= 240 + CHROME ? true
        : below >= 240 + CHROME ? false : above > below;
      setDropUp(up);
      setListMax(Math.min(240, Math.max(90, (up ? above : below) - CHROME)));
    }
    setOpen(true);
  };
  const pick = item => {
    if (!item) return;
    setPendingName('');
    onChange(item.kind === 'rta' ? 'rta' : item.cat.id);
    setOpen(false);
    if (inputRef.current) inputRef.current.blur();
  };
  const startCreate = () => {
    setNewName(q.trim()); // seed with whatever was typed into the search
    setNewGroupId(catType === 'expense' && groups[0] ? groups[0].id : '');
    setCreating(true);
  };
  const saveCreate = () => {
    const name = newName.trim();
    if (!name) return;
    if (onCreate) onCreate({ name, groupId: catType === 'expense' ? (newGroupId || null) : null });
    setPendingName(name);
    setCreating(false);
    setOpen(false);
    if (inputRef.current) inputRef.current.blur();
  };
  const cancelCreate = () => { setCreating(false); if (inputRef.current) inputRef.current.focus(); };
  const onKey = e => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { e.preventDefault(); openList(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => clampHi(h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => clampHi(h - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(pickable[clampHi(hi)]); }
  };
  const availOf = id => (env && env.rows.get(id) || {}).available || 0;
  const tone = v => (v > 0 ? 'var(--pos)' : v < 0 ? 'var(--neg)' : 'var(--muted)');

  // Current pick for the "Selected" section — looked up directly (not via the
  // filtered list) so an archived category still shows while editing.
  const selectedCat = showSelected && value && value !== 'rta' && value !== '__new'
    ? S.categories.find(c => c.id === value) : null;

  const rowStyle = active => ({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', border: 'none', textAlign: 'left', padding: '5px 6px 5px 4px', borderRadius: 0, cursor: 'pointer', fontSize: 13, background: active ? 'var(--soft)' : 'transparent', color: 'var(--text)' });
  const noBlur = e => e.preventDefault(); // keep the combobox focused when clicking a list row
  const fieldLabel = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' };
  const formField = { width: '100%', boxSizing: 'border-box', height: 34, padding: '0 10px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, marginBottom: 12 };

  let pi = -1; // pickable index while rendering
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          value={open && !creating ? q : nameOf(value)}
          placeholder={placeholder}
          aria-label={placeholder} role="combobox" aria-expanded={String(open)}
          onFocus={openList}
          onBlur={() => { if (!creating) setOpen(false); }}
          onChange={e => { setQ(e.target.value); setHi(0); if (!open) setOpen(true); }}
          onKeyDown={onKey}
          readOnly={creating}
          style={{ width: '100%', boxSizing: 'border-box', height: 34, padding: '0 28px 0 10px', border: '1px solid ' + (open ? 'var(--accent)' : 'var(--border)'), background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}
        />
        <span aria-hidden="true" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 10, pointerEvents: 'none' }}>▾</span>
      </div>
      {open && (
        // Panel overlays the popover content below the field (absolute, not
        // in-flow). Geometry captured from YNAB's .dropdown-modal: 16px padding,
        // 4px radius, 16/600 heading. List rows carry their own mousedown-
        // preventDefault (keeps the combobox focused so the click lands); the
        // Add Category form does NOT, so its own inputs can take focus.
        <div
          style={{ position: 'absolute', ...(dropUp ? { bottom: 'calc(100% + 6px)' } : { top: 'calc(100% + 6px)' }), left: 0, right: 0, zIndex: 40, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', boxShadow: 'var(--shadow)', padding: '14px 16px 16px' }}>
          {creating ? (
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, margin: '0 0 10px' }}>Add Category</div>
              <label style={fieldLabel} htmlFor="pcp-newname">Category Name</label>
              <input id="pcp-newname" autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveCreate(); } else if (e.key === 'Escape') { e.stopPropagation(); cancelCreate(); } }}
                style={formField} />
              {catType === 'expense' && (
                <>
                  <label style={fieldLabel} htmlFor="pcp-newgroup">In Category Group</label>
                  <select id="pcp-newgroup" value={newGroupId} onChange={e => setNewGroupId(e.target.value)} style={formField}>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
                <button onClick={cancelCreate} className="hv-soft" style={{ border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '7px 10px', borderRadius: 8 }}>Cancel</button>
                <button onClick={saveCreate} disabled={!newName.trim()} className="hv-accent" style={{ border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: newName.trim() ? 'pointer' : 'default', opacity: newName.trim() ? 1 : .5, padding: '7px 16px' }}>Save</button>
              </div>
            </div>
          ) : (
            <>
              {allowCreate && (
                <button onMouseDown={noBlur} onClick={startCreate} className="hv-soft"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', border: 'none', background: 'transparent', color: 'var(--accent)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', padding: '2px 4px 10px', borderBottom: '1px solid var(--border)', marginBottom: 6 }}>
                  <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 999, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, lineHeight: 1 }}>＋</span>
                  New Category
                </button>
              )}
              {heading && <div style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>{heading}</div>}
              <div className="picker-scroll" style={{ maxHeight: listMax, padding: '6px 0' }}>
              {selectedCat && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 600, padding: '4px 0 2px' }}>Selected:</div>
                  <button onMouseDown={noBlur} onClick={() => pick({ kind: 'cat', cat: selectedCat })} className="hv-elev" style={rowStyle(false)}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span aria-hidden="true" style={{ flex: 'none', color: 'var(--accent)' }}>✓</span>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedCat.name} <span style={{ color: 'var(--muted)' }}>({groupNameOf(selectedCat)})</span></span>
                    </span>
                    {showAmounts && <span className="tnum" style={{ flex: 'none', fontWeight: 600, color: tone(availOf(selectedCat.id)) }}>{money(availOf(selectedCat.id))}</span>}
                  </button>
                </>
              )}
              {flat.map((item, i) => {
                if (item.kind === 'head') return <div key={'h' + i} style={{ fontSize: 12, fontWeight: 600, padding: '4px 0 2px' }}>{item.name}:</div>;
                pi += 1;
                const active = pi === clampHi(hi);
                const isRta = item.kind === 'rta';
                const val = isRta ? env.rta : availOf(item.cat.id);
                return (
                  <button key={isRta ? 'rta' : item.cat.id} onMouseDown={noBlur} onClick={() => pick(item)} className="hv-elev"
                    style={{ ...rowStyle(active), background: active ? 'var(--soft)' : (isRta ? 'var(--elev)' : 'transparent') }}>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isRta ? 'Inflow: Ready to Assign' : item.cat.name}</span>
                    {showAmounts && <span className="tnum" style={{ flex: 'none', fontWeight: 600, color: tone(val) }}>{money(val)}</span>}
                  </button>
                );
              })}
              {pickable.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: 8 }}>No matches.</div>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
