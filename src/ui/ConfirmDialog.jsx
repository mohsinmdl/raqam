import FocusTrap from './FocusTrap.jsx';

// Confirm dialog — ported from the prototype (template ~750-761).
// confirm: { title, body, action, onConfirm }
export default function ConfirmDialog({ confirm, onCancel }) {
  if (!confirm) return null;
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(8,16,13,.44)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'hsFade .15s ease', zIndex: 50 }}>
      <FocusTrap>
        <div role="dialog" aria-modal="true" aria-label={confirm.title} onClick={e => e.stopPropagation()} style={{ width: 400, maxWidth: '92vw', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)', padding: '22px 24px', animation: 'hsUp .18s ease', color: 'var(--text)' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{confirm.title}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8, lineHeight: 1.55 }}>{confirm.body}</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
            <button onClick={onCancel} className="hv-elev" style={{ height: 36, padding: '0 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
            <button onClick={confirm.onConfirm} style={{ height: 36, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--neg)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{confirm.action}</button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
