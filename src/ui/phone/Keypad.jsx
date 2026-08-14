// src/ui/phone/Keypad.jsx
// The shared on-screen key grid (digits, ops, =, Done). Deliberately NOT a
// text input: callers render the draft as plain text, so the OS keyboard can
// never appear. State lives in src/lib/keypadState.js at each call site.
const keyBtn = {
  height: 52, border: 'none', borderRadius: 10, background: 'var(--surface)',
  color: 'var(--text)', fontSize: 20, fontWeight: 600, cursor: 'pointer',
};
const opBtn = { ...keyBtn, background: 'var(--soft)', color: 'var(--accent)' };

export default function Keypad({ onKey, onDone, doneLabel = 'Done' }) {
  return (
    <>
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
          {doneLabel}
        </button>
      </div>
    </>
  );
}
