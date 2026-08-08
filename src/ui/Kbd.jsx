// A single keycap chip. Default styling sits on a light surface (the help
// modal); `onDark` swaps to a light-grey cap for the dark shortcut tooltip;
// `sm` is a compact size for tight rows (the user menu).
export default function Kbd({ children, onDark, sm }) {
  const tone = onDark
    ? { background: '#3a4152', color: '#fff', border: '1px solid #4a5265' }
    : { background: 'var(--elev)', color: 'var(--text)', border: '1px solid var(--border)' };
  const size = sm
    ? { minWidth: 18, height: 18, padding: '0 4px', fontSize: 10.5, borderRadius: 5 }
    : { minWidth: 22, height: 22, padding: '0 6px', fontSize: 11.5, borderRadius: 6 };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, lineHeight: 1, ...size, ...tone }}>{children}</span>
  );
}
