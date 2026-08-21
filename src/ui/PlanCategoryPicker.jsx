import { forwardRef, useMemo, useRef, useState } from 'react';
import { sortGroups, sortCats } from '../lib/categoryOrder.js';
import { Combobox, ComboboxPanel } from './primitives/Combobox.jsx';
import { CheckIcon, Chevron } from './icons.jsx';
import { PlusCircle } from './ToolbarAction.jsx';

const ringStyle = { outline: '1px solid var(--neg)', outlineOffset: '-1px' };
const srOnly = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 };

// One-field category combobox (YNAB-style): the field IS the search input.
// Closed, it shows the picked name (or a placeholder); focusing it opens the
// grouped list right beneath and typing filters. This replaces the old
// two-box feel (a "Choose a category" trigger that opened a separate
// "Search categories" input).
//
// Built on the Base UI Combobox primitive (Wave P1). What that bought:
//   - the panel is PORTALLED and positioned by Floating UI, so the 25-line
//     ancestor-walk that used to hunt for the nearest overflow ancestor (and
//     the app header) to decide dropUp/listMax is gone. A picker inside a
//     <td>, a drawer or a modal is no longer clipped by its container.
//   - real listbox/option semantics: role=listbox on the list, role=option on
//     each row, aria-activedescendant tracking the keyboard highlight. The old
//     markup put role="combobox" on the input and stopped there.
// The panel's header (＋ New Category, the heading, the current pick) and its
// footer (the Split button) are non-scrolling bands; only the list scrolls.
//
// Shared by the Budget Assign/Move flows (defaults) and the transaction form.
// Props:
//   env, S, month, money — data. value (category id | 'rta' | '__new' | null),
//   onChange(idOr'rta'). excludeRta?, excludeId?, placeholder?.
//   catType='expense'  — which category type to list (expense | income).
//   showAmounts=true   — show each envelope's available beside it; off for
//                        income categories, which have no envelope balance.
//   heading='Plan Categories' — panel title; pass null to omit it.
//   size=34            — field height. The inline register editor passes 28 so
//                        the category cell matches its sibling cells.
//   allowCreate=false, onCreate({name, groupId}) — render a "＋ New Category"
//                        row at the top (YNAB txn picker). Clicking it swaps the
//                        list for an inline Add Category form (name + group);
//                        Save calls onCreate — the host creates + selects it.
//   showSelected=false — render a "Selected" section for the current pick
//                        (with a ✓), even if that category is archived.
//   footer=null         — extra content rendered inside the panel, below the
//                        scrollable list, only while not in the create form
//                        (e.g. the inline transaction editor's Split button).
const PlanCategoryPicker = forwardRef(function PlanCategoryPicker({
  env, S, month, money, value, onChange,
  // 'Category' — the FIELD's name, not an instruction. Every consumer sits it
  // under (or in) a column already called Category, so "Choose a category" was
  // telling the reader what they could already see, twice. It doubles as the
  // aria-label below, where the name is what a screen reader needs.
  excludeRta, excludeId, excludeIds, placeholder = 'Category',
  // Which envelope figure the rows show and the caller steers by. Defaults to
  // 'available' (rollover-inclusive — what the Assign flow and every incumbent
  // caller want). The Fix-This un-assign flow passes 'assigned' so the number
  // shown is the THIS-MONTH assignment that moveAssigned actually decrements.
  amountField = 'available',
  catType = 'expense', showAmounts = true, heading = 'Plan Categories',
  allowCreate = false, onCreate, showSelected = false, footer = null,
  // Opt-in YNAB keyboard entry for hosts that own Tab (the inline tx editor):
  // the list opens with its FIRST item highlighted (autoHighlight 'always'),
  // arrows walk from it, Enter takes the highlight — and Tab commits it too,
  // but only once the user has ENGAGED (typed or arrowed): a bare tab-through
  // of an untouched field must skip without committing, or the optional
  // category column would silently assign the first category in the list.
  // Deliberately NOT the default — autoHighlight also changes what ENTER
  // does (Base UI commits a non-null highlight instead of falling through),
  // and several of this picker's 13 consumers sit one keystroke from a
  // persisted write (PayeeDetail's auto-category rule, the phone money
  // sheets' Assign), where an auto-highlighted guess must not be that easy
  // to commit.
  tabCommit = false,
  size = 34, invalid, errorMsg, errorId,
}, ref) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  // Inline Add Category form state (allowCreate). While `creating`, the panel
  // shows the form INSTEAD of the list (ComboboxPanel's `body`), and the
  // popup's open state stops following Base UI — the form's own inputs
  // legitimately take focus inside the popup, and none of that means "close".
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGroupId, setNewGroupId] = useState('');
  const [pendingName, setPendingName] = useState('');
  // Set the instant a pick/save closes the panel, so the focus that stays on
  // the field afterwards does not read as "the user focused the field" and
  // immediately reopen the list.
  const reopenGuard = useRef(false);
  // The list's current highlight, mirrored for the Tab-commit below (the
  // input keeps focus — virtual focus — so only this callback knows which
  // item is lit). With autoHighlight 'always' the first item is lit from the
  // moment the list opens, so `engaged` carries the tab-through guard the
  // highlight itself no longer can: it flips on typing or arrow navigation
  // and resets when the popup closes.
  const hl = useRef(undefined);
  const engaged = useRef(false);

  const groups = useMemo(() => sortGroups(S.categoryGroups), [S.categoryGroups]);
  const nameOf = v => (v === 'rta' ? 'Ready to Assign'
    : v === '__new' ? (pendingName || '＋ New category')
    : v ? ((S.categories.find(c => c.id === v) || {}).name || '') : '');
  const groupNameOf = c => (S.categoryGroups.find(g => g.id === (c || {}).groupId) || {}).name || 'Other';

  // excludeIds hides a whole set (e.g. every category already in a group being
  // deleted, or already-budgeted categories); excludeId is the single-id case.
  const excludeSet = useMemo(() => new Set([...(excludeIds || []), ...(excludeId ? [excludeId] : [])]), [excludeIds, excludeId]);
  // Sections mirror the panel's shape: a header row and the rows under it.
  // Ready to Assign sits under its own "Inflow:" header (YNAB), just like the
  // category groups below — an indented row, not a flat one.
  const sections = useMemo(() => {
    const norm = s => s.toLowerCase();
    const ids = new Set(groups.map(g => g.id));
    const cats = S.categories.filter(c => c.type === catType && c.status === 'active' && !excludeSet.has(c.id)
      && (!q || norm(c.name).includes(norm(q))));
    const out = [];
    if (!excludeRta && (!q || 'ready to assign'.includes(norm(q)))) out.push({ key: 'inflow', name: 'Inflow', items: [{ kind: 'rta' }] });
    groups.forEach(g => {
      const members = sortCats(cats.filter(c => c.groupId === g.id));
      if (members.length) out.push({ key: g.id, name: g.name, items: members.map(c => ({ kind: 'cat', cat: c })) });
    });
    const other = sortCats(cats.filter(c => !c.groupId || !ids.has(c.groupId)));
    if (other.length) out.push({ key: 'other', name: 'Other', items: other.map(c => ({ kind: 'cat', cat: c })) });
    return out;
  }, [S, q, excludeRta, excludeSet, catType, groups]);
  const pickable = useMemo(() => sections.flatMap(s => s.items), [sections]);
  const labelOf = item => (item.kind === 'rta' ? 'Ready to Assign' : item.cat.name);

  const closeAfter = () => {
    reopenGuard.current = true;
    setOpen(false);
    setQ('');
    // setOpen here bypasses onOpenChange (that only fires for Base UI-driven
    // opens/closes), so the highlight mirror and the engagement flag are
    // cleared on this path too.
    hl.current = undefined;
    engaged.current = false;
    setTimeout(() => { reopenGuard.current = false; }, 0);
  };
  const pick = item => {
    if (!item) return;
    setPendingName('');
    onChange(item.kind === 'rta' ? 'rta' : item.cat.id);
    closeAfter();
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
    closeAfter();
  };
  const cancelCreate = () => { setCreating(false); setQ(''); };

  const availOf = id => (env && env.rows.get(id) || {})[amountField] || 0;
  const tone = v => (v > 0 ? 'var(--pos)' : v < 0 ? 'var(--neg)' : 'var(--muted)');

  // Current pick for the "Selected" section — looked up directly (not via the
  // filtered list) so an archived category still shows while editing. It sits
  // in the panel's pinned header rather than scrolling away with the list, and
  // stays out of the listbox (it is a restatement of a row below, not a
  // separate option — duplicating it as an option would double it in the
  // keyboard order and in the screen reader's option count).
  const selectedCat = showSelected && value && value !== 'rta' && value !== '__new'
    ? S.categories.find(c => c.id === value) : null;

  // Category rows indent past the group headers (which sit at the panel's left
  // edge) so the grouping reads clearly.
  const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', border: 'none', textAlign: 'left', padding: '5px 6px 5px 18px', borderRadius: 0, cursor: 'pointer', fontSize: 13, background: 'transparent', color: 'var(--text)' };
  const headStyle = { fontSize: 12, fontWeight: 600, padding: '4px 0 2px' };
  const noBlur = e => e.preventDefault(); // keep the field focused when clicking panel chrome
  const fieldLabel = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' };
  const formField = { width: '100%', boxSizing: 'border-box', height: 34, padding: '0 10px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, marginBottom: 12 };

  const errId = errorId || 'txeditor-err-category';
  const shown = open && !creating ? q : nameOf(value);
  const pad = size >= 34 ? { right: 28, left: 10 } : { right: 24, left: 8 };

  // Header band: create row, heading, current pick. Rendered only when it has
  // something to say (an unheaded picker with nothing selected has no band).
  const header = (allowCreate || heading || selectedCat) ? (
    <>
      {allowCreate && (
        <button type="button" onMouseDown={noBlur} onClick={startCreate} className="hv-soft"
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', border: 'none', background: 'transparent', color: 'var(--accent)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', padding: '8px 6px' }}>
          {/* PlusCircle, the same drawn filled-circle plus the toolbar's "Add
              Transaction" uses — this was ＋ (U+FF0B FULLWIDTH PLUS SIGN)
              hand-centred inside a CSS circle, which sat a pixel or two off
              centre at every font size and matched nothing else in the app. */}
          <PlusCircle />
          New Category
        </button>
      )}
      {heading && <div style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>{heading}</div>}
      {selectedCat && (
        <>
          <div style={headStyle}>Selected:</div>
          <button type="button" onMouseDown={noBlur} onClick={() => pick({ kind: 'cat', cat: selectedCat })} className="hv-elev" style={rowStyle}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              {/* Drawn tick (the inline editor's row marker, shared out) — ✓
                  is U+2713, which several stacks answer with an emoji check. */}
              <span aria-hidden="true" style={{ flex: 'none', display: 'inline-flex', color: 'var(--accent)' }}><CheckIcon size={10} /></span>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedCat.name} <span style={{ color: 'var(--muted)' }}>({groupNameOf(selectedCat)})</span></span>
            </span>
            {showAmounts && <span className="tnum" style={{ flex: 'none', fontWeight: 600, color: tone(availOf(selectedCat.id)) }}>{money(availOf(selectedCat.id))}</span>}
          </button>
        </>
      )}
    </>
  ) : null;

  // Add Category form — replaces the list entirely, so it is the panel's
  // `body`, not a row inside a listbox. Its inputs do NOT preventDefault on
  // mousedown: they are meant to take focus.
  const createForm = (
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
        <button type="button" onClick={cancelCreate} className="hv-soft" style={{ border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '7px 10px', borderRadius: 8 }}>Cancel</button>
        <button type="button" onClick={saveCreate} disabled={!newName.trim()} className="hv-accent" style={{ border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: newName.trim() ? 'pointer' : 'default', opacity: newName.trim() ? 1 : .5, padding: '7px 16px' }}>Save</button>
      </div>
    </div>
  );

  return (
    <div style={{ position: 'relative' }}>
      <Combobox.Root
        items={pickable} value={null} onValueChange={pick} filter={null}
        autoHighlight={tabCommit ? 'always' : false} onItemHighlighted={v => { hl.current = v; }}
        itemToStringLabel={labelOf} itemToStringValue={labelOf}
        open={open}
        // The query is cleared on CLOSE, never on open: Base UI also reports
        // "opened" for the keystroke that opens a closed field, and clearing
        // there would eat that first character.
        onOpenChange={o => { if (creating) return; setOpen(o); if (!o) { setQ(''); hl.current = undefined; engaged.current = false; } }}
      >
        <Combobox.Input
          ref={ref}
          className="field"
          value={shown}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-invalid={invalid || undefined} aria-describedby={invalid ? errId : undefined}
          readOnly={creating}
          onChange={e => { engaged.current = true; setQ(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => { if (!creating && !reopenGuard.current) setOpen(true); }}
          onKeyDown={e => {
            // Enter on a closed field opens the list (it is a picker, and there
            // is nothing else Enter could mean here); Escape closes the panel
            // without also reaching a host drawer/popover's own Escape.
            if (e.key === 'Enter' && !open) { e.preventDefault(); setOpen(true); }
            else if (e.key === 'Escape' && open) { e.stopPropagation(); if (creating) cancelCreate(); setOpen(false); }
            // Arrow navigation is engagement: from here the highlight is the
            // user's own position in the list, not the open-time default.
            else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') engaged.current = true;
            // Forward Tab takes the highlighted category with it (YNAB) and
            // bubbles on so a host that owns Tab (the inline editor row) can
            // move focus — but only once the user engaged (typed or arrowed):
            // a bare tab-through skips the default first-item highlight and
            // closes the field unchanged. Shift+Tab (backing out) never
            // commits.
            else if (tabCommit && e.key === 'Tab' && !e.shiftKey && open && !creating && engaged.current && hl.current != null) pick(hl.current);
          }}
          style={{ width: '100%', boxSizing: 'border-box', height: size, padding: `0 ${pad.right}px 0 ${pad.left}px`, fontSize: 13, ...(open ? { borderColor: 'var(--accent)' } : null), ...(invalid ? ringStyle : null) }}
        />
        <span aria-hidden="true" style={{ position: 'absolute', right: pad.left, top: size / 2, transform: 'translateY(-50%)', color: 'var(--muted)', display: 'inline-flex', pointerEvents: 'none' }}><Chevron /></span>
        {invalid && <span id={errId} role="alert" style={srOnly}>{errorMsg}</span>}
        <ComboboxPanel
          style={{ minWidth: 240, padding: '10px 12px' }}
          header={creating ? null : header}
          body={creating ? createForm : null}
          footer={creating ? null : footer}
        >
          {sections.map(s => (
            <Combobox.Group key={s.key} items={s.items}>
              {/* No trailing colon. A group label heads the rows beneath it —
                  it is a name, not the start of a sentence the rows finish,
                  and the punctuation read as a stray character mid-list. */}
              <Combobox.GroupLabel style={headStyle}>{s.name}</Combobox.GroupLabel>
              {s.items.map(item => {
                const isRta = item.kind === 'rta';
                const val = isRta ? env.rta : availOf(item.cat.id);
                return (
                  <Combobox.Item key={isRta ? 'rta' : item.cat.id} value={item} className="rq-combo-item hv-elev" style={rowStyle}>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isRta ? 'Ready to Assign' : item.cat.name}</span>
                    {showAmounts && <span className="tnum" style={{ flex: 'none', fontWeight: 600, color: tone(val) }}>{money(val)}</span>}
                  </Combobox.Item>
                );
              })}
            </Combobox.Group>
          ))}
          {pickable.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: 8 }}>No matches.</div>}
        </ComboboxPanel>
      </Combobox.Root>
    </div>
  );
});

export default PlanCategoryPicker;
