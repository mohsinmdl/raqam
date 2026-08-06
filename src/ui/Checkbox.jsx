// The app's first checkbox — there was no form primitive for this, and the
// header one needs an indeterminate state, which is settable only through the
// DOM property, never an attribute. Hence the ref.
import { useEffect, useRef } from 'react';

// The box is deliberately smaller than its target. A <label> wrapper means the
// whole target toggles natively — no click handler, and the box keeps its own
// keyboard focus. `fill` stretches that label over the parent cell, which must
// then be position:relative with no padding; the inset reproduces the padding
// the cell gave up, so the box does not move.
export default function Checkbox({ checked, indeterminate, onChange, label, disabled, fill, inset = 18 }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
  const box = (
    <input
      ref={ref}
      type="checkbox"
      checked={!!checked}
      disabled={disabled}
      aria-label={label}
      onChange={e => onChange(e.target.checked)}
      style={{
        width: 13, height: 13, margin: 0, cursor: disabled ? 'default' : 'pointer',
        accentColor: 'var(--accent)', flex: 'none', opacity: disabled ? 0.4 : 1,
      }}
    />
  );
  return (
    <label
      // Stops a click anywhere on the target from also reaching a row handler.
      onClick={e => e.stopPropagation()}
      style={{
        display: 'flex', alignItems: 'center', cursor: disabled ? 'default' : 'pointer',
        ...(fill
          ? { position: 'absolute', inset: 0, paddingLeft: inset }
          : { padding: 6, margin: -6 }),
      }}
    >
      {box}
    </label>
  );
}
