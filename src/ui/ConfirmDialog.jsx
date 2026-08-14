import { useEffect, useRef } from 'react';
import FocusTrap from './FocusTrap.jsx';

// Confirm dialog — ported from the prototype (template ~750-761).
// confirm: { title, body, action, onConfirm, tone? ('neg' default | 'accent') }
export default function ConfirmDialog({ confirm, onCancel }) {
  const rootRef = useRef(null);
  // Capture-phase Escape so the confirm (topmost overlay) closes before any
  // drawer/dialog beneath it can react.
  useEffect(() => {
    if (!confirm) return;
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [confirm, onCancel]);
  // Base UI's modal Dialog (TxSheet, BottomSheetPanel) calls floating-ui-react's
  // markOthers on open, which walks document.body's children and sets
  // aria-hidden="true" on every one that doesn't contain the popup — including
  // #root, since Dialog.Portal renders the popup as a body-level sibling of
  // #root rather than inside it. ConfirmDialog is mounted inside #root (see
  // UIProvider), so when it's asked to confirm something *while* a modal Base
  // UI dialog is already open beneath it (e.g. "Discard your changes?" over
  // TxSheet), it inherits aria-hidden from that ancestor and goes invisible to
  // assistive tech even though pointer users see it fine — it's the topmost
  // thing on screen. While open, walk up from our own node to <body> and strip
  // aria-hidden/inert from any ancestor that carries them, recording exactly
  // what was removed so it can be restored verbatim on close/unmount (the
  // dialog beneath must go back to being hidden once the confirm resolves).
  useEffect(() => {
    if (!confirm || !rootRef.current) return undefined;
    const removed = [];
    for (let node = rootRef.current; node && node !== document.body; node = node.parentElement) {
      for (const attr of ['aria-hidden', 'inert']) {
        if (node.hasAttribute(attr)) {
          removed.push([node, attr, node.getAttribute(attr)]);
          node.removeAttribute(attr);
        }
      }
    }
    return () => {
      for (const [node, attr, value] of removed) node.setAttribute(attr, value);
    };
  }, [confirm]);
  if (!confirm) return null;
  return (
    <div ref={rootRef} onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'hsFade .15s ease', zIndex: 70 }}>
      <FocusTrap>
        <div role="dialog" aria-modal="true" aria-label={confirm.title} onClick={e => e.stopPropagation()} style={{ width: 400, maxWidth: '92vw', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)', padding: '22px 24px', animation: 'hsUp .18s ease', color: 'var(--text)' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{confirm.title}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8, lineHeight: 1.55 }}>{confirm.body}</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
            <button onClick={onCancel} className="hv-elev" style={{ height: 36, padding: '0 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
            <button onClick={confirm.onConfirm} style={{ height: 36, padding: '0 16px', border: 'none', borderRadius: 8, background: confirm.tone === 'accent' ? 'var(--accent)' : 'var(--neg)', color: confirm.tone === 'accent' ? 'var(--on-accent)' : 'var(--on-neg)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{confirm.action}</button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
