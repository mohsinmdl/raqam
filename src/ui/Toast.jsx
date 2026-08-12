// Toast — ported from the prototype (template ~775-777). aria-live so screen
// readers announce saves without focus moving.
// `raised` lifts the toast above the bulk-actions bar when it is showing, so the
// two bottom-pinned overlays stack instead of colliding. 86px clears the bar
// (bottom 24 + ~46 tall + a gap); the bar never wraps, so a constant is safe.
export default function Toast({ msg, raised }) {
  if (!msg) return null;
  return (
    // Centred with auto margins, NOT translateX(-50%): the hsUp entrance
    // animation drives `transform` (translateY), which would override a centring
    // transform mid-animation and snap the toast sideways. Auto-margin centring
    // leaves `transform` free for the animation. (Same fix as BulkBar.)
    <div role="status" aria-live="polite" className={raised ? 'toast toast-raised' : 'toast'} style={{ position: 'fixed', left: 0, right: 0, margin: '0 auto', width: 'fit-content', bottom: raised ? 86 : 26, transition: 'bottom .18s ease', background: 'var(--text)', color: 'var(--bg)', padding: '11px 20px', borderRadius: 10, fontSize: 13.5, fontWeight: 500, boxShadow: 'var(--shadow)', animation: 'hsUp .22s ease', zIndex: 60, maxWidth: '80vw' }}>
      {msg}
    </div>
  );
}
