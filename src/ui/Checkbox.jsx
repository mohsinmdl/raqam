// The app's first checkbox — there was no form primitive for this, and the
// header one needs an indeterminate state, which is settable only through the
// DOM property, never an attribute. Hence the ref.
import { useEffect, useRef } from 'react';

export default function Checkbox({ checked, indeterminate, onChange, label, disabled }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={!!checked}
      disabled={disabled}
      aria-label={label}
      onChange={e => onChange(e.target.checked)}
      // Stops a click on the box from also reaching a row-level handler.
      onClick={e => e.stopPropagation()}
      style={{
        width: 16, height: 16, margin: 0, cursor: disabled ? 'default' : 'pointer',
        accentColor: 'var(--accent)', flex: 'none', opacity: disabled ? 0.4 : 1,
      }}
    />
  );
}
