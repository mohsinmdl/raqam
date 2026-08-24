// U1 auto-categorize — the one-time "graduate to a rule" offer (US-7). Shown
// after the 3rd accept of the same payee→category pair (recordAccept surfaces
// it); a NON-blocking inline banner, never a modal. Presentational: onAccept
// creates the payee rule (via upsertPayee) and onDismiss records the declined
// flag — both handled by the parent surface. Auto-dismiss on navigation is the
// parent's job (the offer state is component-local to the screen).
const wrap = {
  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
  padding: '10px 14px', margin: '10px 0', borderRadius: 10,
  background: 'var(--soft)', border: '1px solid var(--border)',
};
const btn = accent => ({
  height: 28, padding: '0 12px', borderRadius: 7, cursor: 'pointer',
  fontSize: 12.5, fontWeight: 600, font: 'inherit',
  border: '1px solid ' + (accent ? 'var(--accent)' : 'var(--border)'),
  background: accent ? 'var(--accent)' : 'var(--surface)',
  color: accent ? 'var(--on-accent)' : 'var(--accent)',
});

export default function GraduationOffer({ payeeName, categoryName, onAccept, onDismiss }) {
  return (
    <div data-testid="graduation-offer" role="status" style={wrap}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
        Always categorize <strong>{payeeName}</strong> as <strong>{categoryName}</strong>?
      </span>
      <button
        type="button"
        data-testid="graduation-offer-accept"
        className="hv-accent"
        style={btn(true)}
        onClick={onAccept}
      >Always</button>
      <button
        type="button"
        data-testid="graduation-offer-dismiss"
        className="hv-soft rq-btn-outline"
        style={btn(false)}
        onClick={onDismiss}
      >Not now</button>
    </div>
  );
}
