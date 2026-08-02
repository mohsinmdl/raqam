// Toast — ported from the prototype (template ~775-777). aria-live so screen
// readers announce saves without focus moving.
export default function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div role="status" aria-live="polite" style={{ position: 'fixed', left: '50%', bottom: 26, transform: 'translateX(-50%)', background: 'var(--text)', color: 'var(--bg)', padding: '11px 20px', borderRadius: 10, fontSize: 13.5, fontWeight: 500, boxShadow: 'var(--shadow)', animation: 'hsUp .22s ease', zIndex: 60, maxWidth: '80vw' }}>
      {msg}
    </div>
  );
}
