// A single keycap chip. Default styling sits on a light surface (the help
// modal); `onDark` swaps to a light-grey cap for the dark shortcut tooltip.
export default function Kbd({ children, onDark }) {
  const tone = onDark
    ? { background: '#3a4152', color: '#fff', border: '1px solid #4a5265' }
    : { background: 'var(--elev)', color: 'var(--text)', border: '1px solid var(--border)' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 22, height: 22, padding: '0 6px', borderRadius: 6, fontSize: 11.5, fontWeight: 600, lineHeight: 1, ...tone }}>{children}</span>
  );
}
