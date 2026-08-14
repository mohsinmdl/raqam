import { Dialog } from '@base-ui/react/dialog';

// The YNAB-style on-screen keypad. Deliberately NOT a text input: the draft is
// plain state rendered as text, so the OS keyboard can never appear (the
// #100–#108 drawer-vs-keyboard class is unreachable by construction).
const keyBtn = {
  height: 52, border: 'none', borderRadius: 10, background: 'var(--surface)',
  color: 'var(--text)', fontSize: 20, fontWeight: 600, cursor: 'pointer',
};
const opBtn = { ...keyBtn, background: 'var(--soft)', color: 'var(--accent)' };

export default function KeypadSheet({ open, cat, hint, canAutoAssign, onKey, onDone, onClose, onAutoAssign, onMoveMoney }) {
  return (
    <Dialog.Root open={open} onOpenChange={o => { if (!o) onClose(); }} modal={false} disablePointerDismissal>
      <Dialog.Portal>
        <Dialog.Popup aria-label={'Assign to ' + (cat ? cat.name : '')}
          style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 60,
            background: 'var(--elev)', borderTop: '1px solid var(--border)',
            borderRadius: '12px 12px 0 0', boxShadow: 'var(--shadow)',
            padding: '10px 12px calc(10px + env(safe-area-inset-bottom))', outline: 'none' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button onClick={onAutoAssign} disabled={!canAutoAssign} className="hv-soft"
              style={{ flex: 1, height: 40, border: '1px solid var(--border)', borderRadius: 999,
                background: 'var(--surface)', color: canAutoAssign ? 'var(--text)' : 'var(--muted)',
                fontSize: 13, fontWeight: 600, cursor: canAutoAssign ? 'pointer' : 'default' }}>
              ⚡ Auto-Assign
            </button>
            <button onClick={onMoveMoney} className="hv-soft"
              style={{ flex: 1, height: 40, border: '1px solid var(--border)', borderRadius: 999,
                background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              ➡ Move Money
            </button>
          </div>
          {hint != null && (
            <button onClick={hint.onFill} className="hv-soft"
              style={{ width: '100%', border: 'none', borderRadius: 999, padding: '8px 12px', marginBottom: 8,
                background: 'var(--soft)', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {hint.label}
            </button>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {['7', '8', '9'].map(d => <button key={d} className="tnum hv-elev" style={keyBtn} onClick={() => onKey('digit', d)}>{d}</button>)}
            <button style={opBtn} className="hv-soft" aria-label="Minus" onClick={() => onKey('op', '−')}>−</button>
            {['4', '5', '6'].map(d => <button key={d} className="tnum hv-elev" style={keyBtn} onClick={() => onKey('digit', d)}>{d}</button>)}
            <button style={opBtn} className="hv-soft" aria-label="Plus" onClick={() => onKey('op', '+')}>+</button>
            {['1', '2', '3'].map(d => <button key={d} className="tnum hv-elev" style={keyBtn} onClick={() => onKey('digit', d)}>{d}</button>)}
            <button style={opBtn} className="hv-soft" aria-label="Multiply" onClick={() => onKey('op', '×')}>×</button>
            <button style={{ ...keyBtn, fontSize: 15 }} className="hv-soft" aria-label="Clear" onClick={() => onKey('clear')}>C</button>
            <button className="tnum hv-elev" style={keyBtn} onClick={() => onKey('digit', '0')}>0</button>
            <button style={{ ...keyBtn, fontSize: 17 }} className="hv-soft" aria-label="Backspace" onClick={() => onKey('backspace')}>⌫</button>
            <button style={opBtn} className="hv-soft" aria-label="Divide" onClick={() => onKey('op', '÷')}>÷</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button style={{ ...opBtn, flex: 1, height: 44 }} className="hv-soft" aria-label="Equals" onClick={() => onKey('equals')}>=</button>
            <button onClick={onDone}
              style={{ flex: 2, height: 44, border: 'none', borderRadius: 999, background: 'var(--accent)',
                color: 'var(--on-accent)', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              Done
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
