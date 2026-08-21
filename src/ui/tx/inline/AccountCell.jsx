// The editor row's ACCOUNT cell: a grouped Base UI select over the same
// balance-annotated options the drawer used (useTxOpts). The picked ref lands
// in whichever legacy field the current type reads (txEditorState 'account').
//
// Keyboard entry (YNAB): autoOpen starts the list open when this cell greets
// the keyboard (Shift+N / Add Transaction land here first on an all-accounts
// register), and Tab COMMITS the highlighted option before the row moves on.
// Base UI Select gives the highlighted item real DOM focus, so at keydown
// time e.target IS the highlight; SelectItem stamps data-value for exactly
// this read. The event is left to bubble — the row's td handler owns the
// focus move — and finalFocus returns false for a tab-away close so the
// closing popup doesn't yank focus back to this trigger mid-walk.
import { forwardRef, useEffect, useRef, useState } from 'react';
import { Select, SelectGroup, SelectItem } from '../../primitives/Select.jsx';
import { useTxOpts } from '../../../drawers/TxForm.jsx';

const srOnly = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 };

const AccountCell = forwardRef(function AccountCell({ value, onChange, disabled, autoFocus, autoOpen, invalid, errorMsg, errorId }, ref) {
  const { bankOpts, creditOpts } = useTxOpts();
  const [open, setOpen] = useState(() => !!autoOpen && !disabled);
  const tabbedAway = useRef(false);
  const all = [...bankOpts, ...creditOpts];
  const picked = all.find(o => o.id === value);
  // Balance annotations stay in the LIST; the closed trigger shows the name
  // only (the row has no room for " — Rs 1,234,567").
  const nameOnly = label => label.split(' — ')[0];
  const id = errorId || 'txeditor-err-account';
  // With no value, Base UI lights nothing until the first ArrowDown — but the
  // Shift+N flow promises the FIRST account ready to Tab-commit the moment the
  // list opens. Focusing the first option is the supported way in: Select
  // items track the highlight from real focus (roving tabindex), and the
  // Tab-commit below reads the option out of e.target either way. Scoped to
  // the auto-open (open with no value on mount-focus) so a pointer open of a
  // filled select keeps Base UI's own highlight-the-current-value behavior.
  useEffect(() => {
    if (!open || value) return;
    const raf = requestAnimationFrame(() => {
      const first = document.querySelector('[role="listbox"] [data-value]');
      if (first) first.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [open, value]);
  const onKeyDown = e => {
    if (e.key !== 'Tab' || !open) return;
    const item = e.target.closest ? e.target.closest('[data-value]') : null;
    const v = item && item.getAttribute('data-value');
    if (v) onChange(v);
    tabbedAway.current = true;
    setOpen(false);
  };
  return (
    <span style={{ display: 'block', position: 'relative' }} onKeyDown={onKeyDown}>
      <Select ref={ref} value={value || null} onValueChange={v => onChange(v || '')} ariaLabel="Account" disabled={disabled} autoFocus={autoFocus}
        open={open} onOpenChange={o => { if (o) tabbedAway.current = false; setOpen(o); }}
        // false = suppress the restore (tab-away: the row already moved
        // focus); null = Base UI's DEFAULT restore to the trigger (Escape
        // etc.). NOT undefined: FloatingFocusManager.getReturnElement treats
        // undefined exactly like false — no restore at all — and only
        // null/true fall through to the default return element.
        finalFocus={() => (tabbedAway.current ? false : null)}
        invalid={invalid} describedBy={id}
        renderValue={() => picked ? nameOnly(picked.label) : 'Account'}>
        <SelectGroup label="Cash Accounts">
          {bankOpts.map(o => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
        </SelectGroup>
        {creditOpts.length > 0 && (
          <SelectGroup label="Credit Cards">
            {creditOpts.map(o => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
          </SelectGroup>
        )}
      </Select>
      {invalid && <span id={id} role="alert" style={srOnly}>{errorMsg}</span>}
    </span>
  );
});

export default AccountCell;
