import { useEffect, useRef, useState } from 'react';
import Kbd from './Kbd.jsx';

// Wraps one control and shows a dark tooltip (action label + keycap chips) on
// hover AND keyboard focus, after a short delay. `label`/`keys` come from a
// registry item passed as `shortcut`, or explicitly. Purely presentational —
// pointer-events are off so it never intercepts a click. No tooltip fires on
// touch (no hover/focus), which is intended: keycaps are a desktop affordance.
export default function Tooltip({ shortcut, label, keys, placement = 'top', delay = 350, children }) {
  const [show, setShow] = useState(false);
  const timer = useRef();
  const lbl = label ?? shortcut?.label;
  const kys = keys ?? shortcut?.keys;
  useEffect(() => () => clearTimeout(timer.current), []);

  const open = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setShow(true), delay); };
  const close = () => { clearTimeout(timer.current); setShow(false); };
  const above = placement === 'top';

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={open} onMouseLeave={close} onFocusCapture={open} onBlurCapture={close}
    >
      {children}
      {show && (lbl || (kys && kys.length)) && (
        <span
          role="tooltip"
          style={{
            position: 'absolute', left: '50%', transform: 'translateX(-50%)',
            [above ? 'bottom' : 'top']: '100%', [above ? 'marginBottom' : 'marginTop']: 8,
            zIndex: 70, display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
            padding: '7px 10px', borderRadius: 8, background: '#1f2430', color: '#fff',
            fontSize: 12.5, fontWeight: 500, boxShadow: '0 6px 20px rgba(0,0,0,.28)', pointerEvents: 'none',
            animation: 'hsFade .12s ease',
          }}
        >
          {lbl && <span>{lbl}</span>}
          {kys && kys.length > 0 && (
            <span style={{ display: 'inline-flex', gap: 4 }}>{kys.map((k, i) => <Kbd key={i} onDark>{k}</Kbd>)}</span>
          )}
        </span>
      )}
    </span>
  );
}
