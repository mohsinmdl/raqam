// OUTFLOW / INFLOW cells. Free typing is group-formatted like the drawer's
// AmountField; anything containing an operator is a calculator expression,
// folded left-to-right by applyCalcExpr on Enter/blur (seeded with the cell's
// prior committed value, same contract as the plan-cell calculator). The ⌗
// trigger opens a 2×2 op pad that appends the operator, YNAB-style.
import { useState } from 'react';
import { Popover, PopoverTrigger, PopoverPanel } from '../../primitives/Popover.jsx';
import { applyCalcExpr } from '../../../lib/calcExpr.js';
import { formatAmountInput } from '../../../lib/amountInput.js';
import { parseAmt } from '../../../lib/format.js';

const OP_KEYS = /[+\-−×*÷/]/;

export default function AmountCell({ value, onCommit, placeholder, ariaLabel, disabled, autoFocus }) {
  const [draft, setDraft] = useState(null); // null = idle, mirror committed value
  const shown = draft !== null ? draft : (value || '');

  // fromBlur distinguishes the two ways an invalid/negative expression can be
  // left behind: Enter keeps the draft open so the user can fix it in place,
  // but a blur means focus already left — leaving the stale draft shown would
  // silently hide the real committed value behind text that was never saved,
  // so blur reverts the draft instead.
  const commit = fromBlur => {
    if (draft === null) return;
    const s = draft.trim();
    if (!s) { onCommit(''); setDraft(null); return; }
    if (OP_KEYS.test(s)) {
      const r = applyCalcExpr(parseAmt(value || '') || 0, s);
      if (r === null || r < 0) {
        if (fromBlur) setDraft(null); // revert to the real committed value
        return; // Enter: stay open with the draft so it can be corrected
      }
      onCommit(formatAmountInput(String(r)));
    } else {
      onCommit(formatAmountInput(s));
    }
    setDraft(null);
  };

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Popover>
        <PopoverTrigger aria-label={'Calculator for ' + ariaLabel} disabled={disabled} tabIndex={-1} className="hv-soft"
          style={{ width: 18, height: 28, border: 'none', background: 'none', color: 'var(--muted)', fontSize: 10, cursor: 'pointer', flex: 'none', padding: 0 }}>
          ⌗
        </PopoverTrigger>
        <PopoverPanel width={92} arrow style={{ padding: 8 }}
          onKeyDown={e => { if (e.key === 'Escape') e.stopPropagation(); }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {['+', '−', '×', '÷'].map(op => (
              <button key={op} type="button" className="hv-soft"
                onClick={() => setDraft(d => (d !== null ? d : (value || '')) + op)}
                style={{ height: 30, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', color: 'var(--accent)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                {op}
              </button>
            ))}
          </div>
        </PopoverPanel>
      </Popover>
      <input className="field tnum" inputMode="decimal" placeholder={placeholder} aria-label={ariaLabel}
        disabled={disabled} autoFocus={autoFocus} value={shown}
        onFocus={e => e.target.select()}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => commit(true)}
        onKeyDown={e => { if (e.key === 'Enter' && draft !== null) { e.preventDefault(); commit(false); } }}
        style={{ width: '100%', height: 28, padding: '0 8px', fontSize: 13, textAlign: 'right', minWidth: 0 }}
      />
    </span>
  );
}
