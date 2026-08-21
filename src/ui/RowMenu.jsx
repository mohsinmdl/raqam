import { useEffect, useRef } from 'react';

// Per-row overflow (kebab) menu — the design's collapsed row actions.
// Parent-controlled single-open state (pass `open` + onToggle/onClose, keyed by
// row id like the prototype's catMenu). Not modal: no focus trap; closes on
// outside mousedown, Escape (refocusing the trigger), or item click.
// items: [{ label, onClick, tone? ('neg'), divider? }]
// triggerSize: the square trigger's edge in px. Desktop rows keep the compact
// 30 default; primary phone chrome passes 44 for a full touch target.
export default function RowMenu({ open, onToggle, onClose, label, items, triggerSize = 30 }) {
  const rootRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (rootRef.current && !rootRef.current.contains(e.target)) onClose(); };
    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); triggerRef.current?.focus(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true); // before drawer/dialog Escape handlers
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose]);

  return (
    <div ref={rootRef} style={{ position: 'relative', width: triggerSize }}>
      <button
        ref={triggerRef}
        onClick={e => { e.stopPropagation(); onToggle(); }}
        aria-haspopup="menu"
        aria-expanded={String(!!open)}
        aria-label={label}
        className="hv-elev rq-btn-outline"
        style={{ width: triggerSize, height: triggerSize, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--muted)', fontSize: 15, cursor: 'pointer', lineHeight: 1 }}
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          onClick={e => e.stopPropagation()}
          style={{ position: 'absolute', top: triggerSize + 4, right: 0, zIndex: 30, width: 'max-content', maxWidth: 'min(210px, 60vw)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow)', padding: 4, display: 'flex', flexDirection: 'column' }}
        >
          {items.filter(Boolean).map((it, i) =>
            it.divider ? (
              <span key={i} aria-hidden="true" style={{ height: 1, background: 'var(--border)', margin: '4px 6px' }} />
            ) : (
              <button
                key={i}
                role="menuitem"
                onClick={() => { onClose(); it.onClick(); }}
                className={it.tone === 'neg' ? 'hv-neg-soft' : 'hv-elev'}
                style={{ border: 'none', background: 'none', textAlign: 'left', padding: '8px 12px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', color: it.tone === 'neg' ? 'var(--neg)' : 'var(--text)', whiteSpace: 'nowrap' }}
              >
                {it.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
