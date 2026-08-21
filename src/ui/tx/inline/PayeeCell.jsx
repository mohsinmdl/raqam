// The PAYEE cell: type-to-filter combobox over payeeSections. Free text is a
// valid payee (commits on blur / Enter-close); picking a To/From item makes
// the row a transfer instead. Item values are the section objects
// themselves — kind tells the pick handler which of the two events happened.
import { forwardRef, useMemo, useRef, useState } from 'react';
import { useStore } from '../../../store/StoreProvider.jsx';
import { useUI } from '../../UIProvider.jsx';
import { useIsPhone } from '../../../lib/useIsPhone.js';
import { payeeSections } from '../../../lib/payeeOptions.js';
import { Combobox, ComboboxPanel, ComboboxGroupLabel, ComboboxItem } from '../../primitives/Combobox.jsx';
import { Chevron } from '../../icons.jsx';

const ringStyle = { outline: '1px solid var(--neg)', outlineOffset: '-1px' };
const srOnly = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 };

const PayeeCell = forwardRef(function PayeeCell({ payee, transferTo, sourceRef, onPickPayee, onPickTransfer, disabled, autoFocus, invalid, errorMsg, errorId }, ref) {
  const { data: S } = useStore();
  const { openPayees } = useUI();
  // Manage Payees is desktop-only (spec decision 5) — ManagePayees renders
  // nothing on a phone, so offering the link there is a dead button.
  const phone = useIsPhone();
  const [q, setQ] = useState(null); // null = closed, show the committed value
  const sections = useMemo(() => payeeSections(S, { sourceRef, query: q || '' }), [S, sourceRef, q]);
  const transferLabel = useMemo(() => {
    if (!transferTo) return '';
    const hit = sections.flatMap(s => s.items).find(i => i.kind === 'transfer' && i.ref === transferTo);
    return hit ? hit.label : 'To/From —';
  }, [sections, transferTo]);
  const shown = q !== null ? q : (transferTo ? transferLabel : payee);
  // Item values aren't the {value,label} shape Base UI auto-derives a string
  // from (they're {kind,ref,label} / {kind,name}) — spell it out so
  // accessibility announcements and form-value coercion don't fall back to
  // "[object Object]". The visible field text is owned by `shown` above,
  // independent of this.
  const itemLabel = item => (item.kind === 'transfer' ? item.label : item.name);

  const pick = item => {
    if (!item) return;
    if (item.kind === 'transfer') onPickTransfer(item.ref);
    else onPickPayee(item.name);
    setQ(null);
  };
  const commitText = () => { if (q !== null) { onPickPayee(q); setQ(null); } };
  // The list's current highlight, mirrored for the Tab-commit below. Base UI's
  // Combobox keeps focus in the input (virtual focus), so at Tab time only
  // this callback knows which item is lit: autoHighlight lights the first
  // match while typing, arrows move it. The library reports undefined only
  // once a close finishes UNMOUNTING (handleUnmount), so onOpenChange clears
  // the mirror at close-request time as well — without that, a Tab in the
  // gap would commit a highlight from a list that already closed.
  const hl = useRef(undefined);
  // Tab-committed a highlighted item: the row moves focus in the SAME event
  // dispatch, so this input's blur fires before React applies pick()'s
  // setQ(null) — commitText's closure still sees the stale query and would
  // overwrite the just-picked payee with it ("gri" beating "Grill House").
  // The flag skips exactly that one blur; free text with no highlight still
  // commits through blur as before.
  const pickedOnTab = useRef(false);
  const id = errorId || 'txeditor-err-payee';
  // Nothing in the list at all — a brand-new merchant, or an empty ledger.
  const noMatches = sections.every(s => s.items.length === 0);

  return (
    <Combobox.Root items={sections.flatMap(s => s.items)} onValueChange={pick} value={null} filter={null}
      autoHighlight onItemHighlighted={v => { hl.current = v; }}
      onOpenChange={o => { if (!o) hl.current = undefined; }}
      itemToStringLabel={itemLabel} itemToStringValue={itemLabel}>
      {/* The chevron says this field is a picker as well as a text box —
          without it the cell looked like plain free text, and the To/From
          transfer list (the only way to make the row a transfer) was
          undiscoverable. Drawn, muted, and pointer-transparent so the whole
          field stays one click target. */}
      <span style={{ position: 'relative', display: 'block' }}>
        <Combobox.Input
          ref={ref} className="field" placeholder="Payee" aria-label="Payee" disabled={disabled} autoFocus={autoFocus}
          aria-invalid={invalid || undefined} aria-describedby={invalid ? id : undefined}
          value={shown}
          // Also re-arms a pickedOnTab that never got consumed (its blur only
          // fires if the row's focus move landed) — typing again is proof the
          // user is back here, and a stranded flag would eat the next
          // free-text blur commit.
          onChange={e => { pickedOnTab.current = false; setQ(e.target.value); }}
          onBlur={() => { if (pickedOnTab.current) { pickedOnTab.current = false; return; } commitText(); }}
          // With no item to pick, Enter has to MEAN what the empty state
          // promises: take the typed text as the payee. preventDefault stops
          // the same keystroke also reaching the editor row's Enter-to-save
          // (onRowKey checks defaultPrevented), which would otherwise submit
          // from a render that hadn't seen the payee yet — the free-text
          // commit would race the save and lose. One Enter commits, a second
          // saves.
          onKeyDown={e => {
            if (e.key === 'Enter' && noMatches && q !== null && q !== '') { e.preventDefault(); commitText(); }
            // Forward Tab takes the HIGHLIGHTED item with it (YNAB), then
            // lets the keystroke bubble on — the editor row's td handler owns
            // the focus move. With no highlight the existing blur commit
            // keeps free text as the payee, so brand-new merchants still
            // work; Shift+Tab (backing out) never commits a highlight.
            // (No `open` in this guard, unlike PlanCategoryPicker's: this
            // Root is uncontrolled, and the hl mirror — cleared on close —
            // is the open-list signal.)
            else if (e.key === 'Tab' && !e.shiftKey && hl.current != null) { pick(hl.current); pickedOnTab.current = true; }
          }}
          style={{ width: '100%', height: 28, padding: '0 22px 0 8px', fontSize: 13, ...(invalid ? ringStyle : null) }}
        />
        <span aria-hidden="true" style={{ position: 'absolute', right: 8, top: 14, transform: 'translateY(-50%)', color: 'var(--muted)', display: 'inline-flex', pointerEvents: 'none' }}><Chevron /></span>
      </span>
      {invalid && <span id={id} role="alert" style={srOnly}>{errorMsg}</span>}
      <ComboboxPanel footer={phone ? null : (
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={openPayees} className="hv-soft"
          style={{ width: '100%', border: 'none', background: 'none', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: '8px 2px 2px', textAlign: 'left' }}>
          Manage Payees
        </button>
      )}>
        {/* Typing a payee this ledger has never seen is the NORMAL case for a
            new merchant, but the panel simply emptied — which reads as "no,
            and there is nothing you can do", the opposite of the truth. Free
            text is a valid payee here (commitText on blur / Enter), so the
            empty state says so, quotes back what was typed, and names the key
            that takes it. Styled like PlanCategoryPicker's "No matches." so
            the two pickers' dead ends match. */}
        {noMatches && (
          <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: 8 }}>
            {q ? <>No saved payee matches. Press Enter to use “{q}”.</> : 'No saved payees yet.'}
          </div>
        )}
        {sections.map(s => (
          <Combobox.Group key={s.label} items={s.items}>
            <ComboboxGroupLabel>{s.label}</ComboboxGroupLabel>
            {s.items.map(i => (
              <ComboboxItem key={i.kind === 'transfer' ? i.ref : i.name} value={i} indent>
                {i.kind === 'transfer' ? i.label : i.name}
              </ComboboxItem>
            ))}
          </Combobox.Group>
        ))}
      </ComboboxPanel>
    </Combobox.Root>
  );
});

export default PayeeCell;
