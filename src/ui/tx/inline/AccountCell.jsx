// The editor row's ACCOUNT cell: a grouped Base UI select over the same
// options the drawer used (useTxOpts), YNAB-styled — name only, no balance
// (the closed trigger already omitted it; the open list now matches), a
// pinned "Selected" restatement at the top when a value is chosen, and both
// groups ordered by how often each account has actually been used (most-used
// first) rather than creation order. The picked ref lands in whichever
// legacy field the current type reads (txEditorState 'account').
//
// Keyboard entry (YNAB): autoOpen starts the list open when this cell greets
// the keyboard (Shift+N / Add Transaction land here first on an all-accounts
// register), and forward Tab COMMITS the highlighted option before the row
// moves on. Base UI Select gives the highlighted item real DOM focus, so at
// keydown time e.target IS the highlight; SelectItem stamps data-value for
// exactly this read. The commit path leaves the event to bubble — the row's
// td handler owns the focus move. Shift+Tab instead closes WITHOUT
// committing and preventDefaults, parking focus back on the trigger: backing
// out of a list you never chose from must not assign an account, and the
// native backward move would otherwise start from a popup that no longer
// exists (focus would fall to <body>).
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { Select, SelectGroup, SelectItem } from '../../primitives/Select.jsx';
import { useTxOpts } from '../../../drawers/TxForm.jsx';
import { useStore } from '../../../store/StoreProvider.jsx';
import { accountUsageCounts, byUsage } from '../../../lib/accountUsage.js';
import { CheckIcon } from '../../icons.jsx';

const srOnly = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 };
const noBlur = e => e.preventDefault(); // keep the trigger's own focus handling in charge, same guard PlanCategoryPicker uses for its header chrome

const AccountCell = forwardRef(function AccountCell({ value, onChange, disabled, autoFocus, autoOpen, invalid, errorMsg, errorId }, ref) {
  const { bankOpts: rawBankOpts, creditOpts: rawCreditOpts } = useTxOpts();
  const { data: S } = useStore();
  // Most-used-first: a transfer counts as usage of BOTH accounts it moves
  // money between (accountUsageCounts), so paying a card bill every month
  // keeps both the source account and the card near the top even though
  // neither is an "expense" in the ordinary sense.
  const usage = useMemo(() => accountUsageCounts(S.transactions), [S.transactions]);
  const bankOpts = useMemo(() => byUsage(rawBankOpts, usage), [rawBankOpts, usage]);
  const creditOpts = useMemo(() => byUsage(rawCreditOpts, usage), [rawCreditOpts, usage]);
  const [open, setOpen] = useState(() => !!autoOpen && !disabled);
  const tabbedAway = useRef(false);
  // Tab-commit announcement (see PayeeCell): the value lands in a cell the
  // focus just left, so this polite status region is the only way a screen
  // reader hears WHICH account went in.
  const [announced, setAnnounced] = useState('');
  // The trigger element, held locally as well as forwarded to the row's cell
  // ref: its aria-controls (set by Base UI while open) is the precise handle
  // on the PORTALLED popup, which no wrapper ref can reach.
  const triggerRef = useRef(null);
  const setTriggerRef = el => {
    triggerRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };
  const all = [...bankOpts, ...creditOpts];
  const picked = all.find(o => o.id === value);
  // Balance annotations stay in the LIST; the closed trigger shows the name
  // only (the row has no room for " — Rs 1,234,567").
  const nameOnly = label => label.split(' — ')[0];
  const id = errorId || 'txeditor-err-account';
  // With no value, Base UI lights nothing until the first ArrowDown (true for
  // our alignItemWithTrigger={false} configuration — the align-with-trigger
  // path highlights item 0 itself) — but the YNAB flow wants the first
  // account ready to Tab-commit the moment the list opens. Focusing the
  // first option is the supported way in: Select items track the highlight
  // from real focus (roving tabindex). This runs on ANY open while no
  // account is chosen — with no value there is no current-value highlight to
  // preserve; the `value` guard keeps a pointer open of a FILLED select on
  // Base UI's own highlight-the-current-value behavior. The popup is found
  // via the trigger's aria-controls (never a document-wide sweep), and the
  // portalled popup may take a frame or two to mount, hence the short retry.
  useEffect(() => {
    if (!open || value) return;
    let tries = 0;
    let raf;
    const attempt = () => {
      const popupId = triggerRef.current && triggerRef.current.getAttribute('aria-controls');
      const popup = popupId ? document.getElementById(popupId) : null;
      const first = popup && popup.querySelector('[data-value]');
      if (first) first.focus();
      else if (++tries < 5) raf = requestAnimationFrame(attempt);
    };
    raf = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(raf);
  }, [open, value]);
  const onKeyDown = e => {
    if (e.key !== 'Tab' || !open) return;
    if (e.shiftKey) { e.preventDefault(); setOpen(false); return; } // no commit; default restore parks focus on the trigger
    const item = e.target.closest ? e.target.closest('[data-value]') : null;
    const v = item && item.getAttribute('data-value');
    if (v) {
      onChange(v);
      const opt = all.find(o => o.id === v);
      if (opt) setAnnounced('Account set to ' + nameOnly(opt.label));
    }
    tabbedAway.current = true;
    setOpen(false);
  };
  return (
    <span style={{ display: 'block', position: 'relative' }} onKeyDown={onKeyDown}>
      <Select ref={setTriggerRef} value={value || null} onValueChange={v => onChange(v || '')} ariaLabel="Account" disabled={disabled} autoFocus={autoFocus}
        open={open} onOpenChange={o => { if (o) tabbedAway.current = false; setOpen(o); }}
        // false = suppress the restore (tab-away: the row already moved
        // focus); null = Base UI's DEFAULT restore to the trigger (Escape
        // etc.). NOT undefined: FloatingFocusManager.getReturnElement treats
        // undefined exactly like false — no restore at all — and only
        // null/true fall through to the default return element (verified
        // against @base-ui/react 1.7.0).
        finalFocus={() => (tabbedAway.current ? false : null)}
        invalid={invalid} describedBy={id}
        renderValue={() => picked ? nameOnly(picked.label) : 'Account'}>
        {/* A restatement of the row below, not a separate option (same
            contract as PlanCategoryPicker's own "Selected" — it stays OUT of
            the real listbox, so it never doubles up the keyboard order or a
            screen reader's option count). YNAB shows the picked account here
            even though it also appears, still checked, in its normal group
            further down — matching that rather than deduping keeps this
            list's shape identical to the reference. onMouseDown/noBlur stops
            the click from being read as a blur-then-refocus on the trigger. */}
        {picked && (
          <>
            <div style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 8px 4px' }}>Selected</div>
            <button type="button" onMouseDown={noBlur} onClick={() => setOpen(false)} className="hv-elev"
              style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', border: 'none', background: 'transparent', textAlign: 'left', padding: '5px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
              <span aria-hidden="true" style={{ flex: 'none', display: 'inline-flex', color: 'var(--accent)' }}><CheckIcon size={10} /></span>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nameOnly(picked.label)}</span>
            </button>
          </>
        )}
        <SelectGroup label="Cash Accounts">
          {bankOpts.map(o => <SelectItem key={o.id} value={o.id}>{nameOnly(o.label)}</SelectItem>)}
        </SelectGroup>
        {creditOpts.length > 0 && (
          <SelectGroup label="Credit Cards">
            {creditOpts.map(o => <SelectItem key={o.id} value={o.id}>{nameOnly(o.label)}</SelectItem>)}
          </SelectGroup>
        )}
      </Select>
      {invalid && <span id={id} role="alert" style={srOnly}>{errorMsg}</span>}
      <span role="status" style={srOnly}>{announced}</span>
    </span>
  );
});

export default AccountCell;
