import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// The compact YNAB-style name editor used across the Budget screen: a trigger
// (the clickable name, or the inspector's pencil) that opens a small popover
// with a rename input and a Hide? / Delete? / Cancel / OK row. Rendered through
// a portal with fixed positioning so it escapes the table card's overflow:hidden
// and never gets clipped. Hide/Delete are omitted when their handler is absent
// (groups have no Hide). onRename/onHide/onDelete own the store writes + notify;
// this component only owns the input, open state, and placement.
const softBtn = { padding: '7px 12px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const POP_W = 340;

export default function EditNamePopover({
  name, title, onRename, onHide, onDelete,
  align = 'left', triggerStyle, triggerClassName, children,
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(name);
  const [pos, setPos] = useState(null); // { left, top } fixed coords
  const triggerRef = useRef(null);
  const popRef = useRef(null);

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = Math.min(POP_W, window.innerWidth - 16);
    let left = align === 'right' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    // Prefer below; flip above if it would run past the viewport bottom.
    const estH = 110;
    const top = r.bottom + estH + 6 > window.innerHeight && r.top - estH - 6 > 8
      ? r.top - estH - 6
      : r.bottom + 6;
    setPos({ left, top, w });
  };
  const openPop = () => { setDraft(name); place(); setOpen(true); };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    const onDown = e => {
      if (popRef.current && popRef.current.contains(e.target)) return;
      if (triggerRef.current && triggerRef.current.contains(e.target)) return;
      setOpen(false);
    };
    // Reposition if the page scrolls/resizes while open (fixed coords are stale otherwise).
    const reflow = () => setOpen(false);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', reflow, true);
    window.addEventListener('resize', reflow);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', reflow, true);
      window.removeEventListener('resize', reflow);
    };
  }, [open]);

  const clean = draft.trim();
  const canSave = clean !== '';
  const doRename = () => {
    if (canSave && clean !== name) onRename(clean);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef} type="button" onClick={openPop}
        aria-haspopup="dialog" aria-expanded={open} aria-label={title} className={triggerClassName}
        style={triggerStyle}
      >{children}</button>
      {open && pos && createPortal(
        <div ref={popRef} role="dialog" aria-label={title}
          style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 60, width: pos.w, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)', padding: 12 }}>
          <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onFocus={e => e.target.select()}
            aria-label="Name"
            onKeyDown={e => { if (e.key === 'Enter') doRename(); if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }}
            style={{ width: '100%', boxSizing: 'border-box', height: 36, padding: '0 10px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontWeight: 600, marginBottom: 12 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {onHide && <button onClick={() => { setOpen(false); onHide(); }} className="hv-soft" style={{ ...softBtn, background: 'var(--soft)', color: 'var(--accent)' }}>Hide</button>}
            {onDelete && <button onClick={() => { setOpen(false); onDelete(); }} className="hv-soft" style={{ ...softBtn, background: 'var(--neg-soft)', color: 'var(--neg)' }}>Delete</button>}
            <button onClick={() => setOpen(false)} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '7px 4px' }}>Cancel</button>
            <button onClick={doRename} disabled={!canSave}
              style={{ padding: '7px 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: canSave ? 'pointer' : 'default', opacity: canSave ? 1 : .5 }}>OK</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
