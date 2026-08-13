import { useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/primitives/Popover.jsx';

// Radix reimplementation of src/ui/plan/EditNamePopover.jsx — SAME UX (rename
// input + Hide / Delete / Cancel / OK), SAME look, so the sandbox A/B isolates
// behavior. What's gone vs the hand-rolled original:
//   - the place() flip/clamp math (EditNamePopover.jsx:24-37)  → Radix side/align/collisionPadding
//   - the mousedown + keydown(Escape) + scroll/resize listener block (:40-61) → Radix built-ins
//   - the manual createPortal + fixed-coord bookkeeping (:77, :20)          → PopoverContent
//   - hand-wired aria-haspopup/aria-expanded on the trigger                 → Radix Trigger
// Radix Popover is non-modal (matches the original: no focus trap, just
// autofocus the input and return focus to the trigger on close).
const softBtn = { padding: '7px 12px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' };

export default function RadixEditNamePopover({
  name, title, onRename, onHide, onDelete,
  align = 'start', triggerStyle, triggerClassName, children,
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(name);
  // Reset the draft to the current name every time the popover opens.
  const onOpenChange = o => { if (o) setDraft(name); setOpen(o); };

  const clean = draft.trim();
  const canSave = clean !== '';
  const doRename = () => { if (canSave && clean !== name) onRename(clean); setOpen(false); };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={title} className={triggerClassName} style={triggerStyle}>
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} width={340} role="dialog" aria-label={title}>
        <input
          autoFocus value={draft} onChange={e => setDraft(e.target.value)} onFocus={e => e.target.select()}
          aria-label="Name"
          onKeyDown={e => { if (e.key === 'Enter') doRename(); }}
          style={{ width: '100%', boxSizing: 'border-box', height: 36, padding: '0 10px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontWeight: 600, marginBottom: 12 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onHide && <button onClick={() => { setOpen(false); onHide(); }} className="hv-soft" style={{ ...softBtn, background: 'var(--soft)', color: 'var(--accent)' }}>Hide</button>}
          {onDelete && <button onClick={() => { setOpen(false); onDelete(); }} className="hv-soft" style={{ ...softBtn, background: 'var(--neg-soft)', color: 'var(--neg)' }}>Delete</button>}
          <button onClick={() => setOpen(false)} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '7px 4px' }}>Cancel</button>
          <button onClick={doRename} disabled={!canSave}
            style={{ padding: '7px 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: canSave ? 'pointer' : 'default', opacity: canSave ? 1 : .5 }}>OK</button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
