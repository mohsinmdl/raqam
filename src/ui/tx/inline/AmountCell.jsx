// OUTFLOW / INFLOW cells. Free typing is group-formatted like the drawer's
// AmountField; anything containing an operator is a calculator expression,
// folded left-to-right by applyCalcExpr on Enter/blur (seeded with the cell's
// prior committed value, same contract as the plan-cell calculator). The ⌗
// trigger opens a 2×2 op pad that appends the operator, YNAB-style.
import { forwardRef, useState } from 'react';
import { Popover, PopoverTrigger, PopoverPanel } from '../../primitives/Popover.jsx';
import { applyCalcExpr } from '../../../lib/calcExpr.js';
import { formatAmountInput } from '../../../lib/amountInput.js';
import { parseAmt } from '../../../lib/format.js';

const OP_KEYS = /[+\-−×*÷/]/;
const CALC_MSG = {
  compute: "Couldn't compute — check the expression.",
  negative: 'Result is negative — amounts are magnitudes; use the other column for the opposite direction.',
};
const ringStyle = { outline: '1px solid var(--neg)', outlineOffset: '-1px' };
const srOnly = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 };

const AmountCell = forwardRef(function AmountCell({ value, onCommit, placeholder, ariaLabel, disabled, autoFocus, invalid, errorMsg, errorId }, ref) {
  const [draft, setDraft] = useState(null); // null = idle, mirror committed value
  // A bad calculator expression (can't compute, or resolves negative) is a
  // SEPARATE invalid source from the submit-time `invalid`/`errorMsg` props —
  // it lives entirely in this component since validate.js never sees an
  // unresolved expression. Enter and blur now behave IDENTICALLY: the draft
  // stays visible either way, the cell just gets marked. No silent revert on
  // blur, no silent refusal on Enter — the old fromBlur split is gone.
  const [calcErr, setCalcErr] = useState(null); // null | 'compute' | 'negative'
  const shown = draft !== null ? draft : (value || '');
  const showInvalid = !!calcErr || !!invalid;
  const message = calcErr ? CALC_MSG[calcErr] : errorMsg;
  const id = errorId || (ariaLabel ? 'txeditor-err-' + ariaLabel.toLowerCase() : undefined);

  const commit = () => {
    if (draft === null) return;
    const s = draft.trim();
    if (!s) { onCommit(''); setDraft(null); setCalcErr(null); return; }
    if (OP_KEYS.test(s)) {
      const r = applyCalcExpr(parseAmt(value || '') || 0, s);
      if (r === null) { setCalcErr('compute'); return; } // keep the draft, mark the cell
      if (r < 0) { setCalcErr('negative'); return; } // keep the draft, mark the cell
      onCommit(formatAmountInput(String(r)));
    } else {
      onCommit(formatAmountInput(s));
    }
    setDraft(null);
    setCalcErr(null);
  };

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Popover>
        {/* In the tab order (it used to be tabIndex -1): the op pad is the only
            way to reach the calculator without knowing the operators are
            typeable, and a control no keyboard can reach is not a control. The
            theme's :focus-visible ring makes the stop visible; the radius keeps
            that ring on the glyph rather than around the whole cell. */}
        <PopoverTrigger aria-label={'Calculator for ' + ariaLabel} disabled={disabled} tabIndex={0} className="hv-soft"
          style={{ width: 18, height: 28, border: 'none', borderRadius: 4, background: 'none', color: 'var(--muted)', fontSize: 10, cursor: 'pointer', flex: 'none', padding: 0 }}>
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
      <input ref={ref} className="field tnum" inputMode="decimal" placeholder={placeholder} aria-label={ariaLabel}
        aria-invalid={showInvalid || undefined} aria-describedby={showInvalid ? id : undefined}
        disabled={disabled} autoFocus={autoFocus} value={shown}
        onFocus={e => e.target.select()}
        onChange={e => { setDraft(e.target.value); setCalcErr(null); }}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter' && draft !== null) { e.preventDefault(); commit(); } }}
        style={{ width: '100%', height: 28, padding: '0 8px', fontSize: 13, textAlign: 'right', minWidth: 0, ...(showInvalid ? ringStyle : null) }}
      />
      {showInvalid && <span id={id} role="alert" style={srOnly}>{message}</span>}
    </span>
  );
});

export default AmountCell;
