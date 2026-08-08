// "Manage Views" modal — reorder (drag handle AND ↑/↓ buttons, both wired to
// the same reorderViews swap semantics), inline rename, and delete (behind
// ask()) for the user's custom Plan views. Modal shell copied from
// ShortcutHelpModal.jsx.
import { useEffect, useRef, useState } from 'react';
import FocusTrap from '../FocusTrap.jsx';
import { useUI } from '../UIProvider.jsx';

const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--muted)', fontSize: 14, lineHeight: 1, cursor: 'pointer', flex: 'none' };
const iconBtnOff = { ...iconBtn, opacity: .4, cursor: 'not-allowed' };

// One row: drag handle, name (button → inline input while renaming), ↑/↓
// (disabled at the list's ends), delete. Reorder buttons swap with the
// immediate neighbour by calling onReorder(this id, neighbour id) —
// reorderViews's splice-then-insert semantics place the moved item exactly
// where the neighbour was, which for an adjacent pair is a plain swap.
function ViewRow({ view, atTop, atBottom, renaming, draft, onDraftChange, onStartRename, onCommitRename, onDragStart, onDrop, onMoveUp, onMoveDown, onDelete }) {
  return (
    <div
      onDragOver={e => e.preventDefault()}
      onDrop={onDrop}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderBottom: '1px solid var(--border)' }}
    >
      <span
        draggable onDragStart={onDragStart} aria-hidden="true" title="Drag to reorder"
        style={{ cursor: 'grab', color: 'var(--muted)', fontSize: 14, flex: 'none', padding: '4px 2px', userSelect: 'none' }}
      >⠿</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {renaming ? (
          <input
            ref={el => { if (el) { el.focus(); el.select(); } }}
            value={draft}
            onChange={e => onDraftChange(e.target.value)}
            onBlur={onCommitRename}
            onKeyDown={e => { if (e.key === 'Enter') onCommitRename(); }}
            style={{ width: '100%', boxSizing: 'border-box', height: 30, padding: '0 8px', border: '1px solid var(--accent)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}
          />
        ) : (
          <button
            onClick={onStartRename} className="hv-soft"
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', border: '1px solid transparent', borderRadius: 6, background: 'transparent', color: 'var(--text)', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >{view.name}</button>
        )}
      </div>
      <button aria-label={'Move ' + view.name + ' up'} disabled={atTop} onClick={onMoveUp} className="hv-soft" style={atTop ? iconBtnOff : iconBtn}>↑</button>
      <button aria-label={'Move ' + view.name + ' down'} disabled={atBottom} onClick={onMoveDown} className="hv-soft" style={atBottom ? iconBtnOff : iconBtn}>↓</button>
      <button aria-label={'Delete ' + view.name} onClick={onDelete} className="hv-soft" style={{ ...iconBtn, color: 'var(--neg)' }}>🗑</button>
    </div>
  );
}

export default function ManageViewsModal({ open, views, onReorder, onRename, onDelete, onNew, onClose }) {
  const { ask, confirmOpen } = useUI();
  const [renamingId, setRenamingId] = useState(null);
  const [draft, setDraft] = useState('');
  const dragIdRef = useRef(null);
  // Escape unmounts the rename input; if the browser fires a blur as part of
  // that removal, onBlur must not re-commit the just-cancelled draft. Same
  // guard as CategoryRow's ASSIGNED editor in Plan.jsx.
  const cancelledRef = useRef(false);

  useEffect(() => { if (!open) setRenamingId(null); }, [open]);

  // A single capture-phase Escape handler covers both cases it needs to: the
  // first Escape while renaming cancels just the rename (discarding the
  // draft) without touching the modal; only when nothing is being renamed
  // does Escape close the modal. This has to live in ONE listener — a
  // capture-phase document handler always runs before any bubble-phase
  // onKeyDown on the rename input, so a separate per-input Escape handler
  // would never get a turn.
  useEffect(() => {
    if (!open) return undefined;
    // !confirmOpen: when ask()'s confirm is stacked above (e.g. the delete
    // prompt), its own capture-phase listener owns Escape — this listener
    // must not also react, or one Escape would cancel the confirm AND close
    // Manage Views. Same guard as DrawerProvider.jsx's requestClose effect.
    const onKey = e => {
      if (e.key !== 'Escape' || confirmOpen) return;
      e.stopPropagation();
      if (renamingId) { cancelledRef.current = true; setRenamingId(null); } else onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, renamingId, onClose, confirmOpen]);

  if (!open) return null;

  const startRename = v => { cancelledRef.current = false; setRenamingId(v.id); setDraft(v.name); };
  const commitRename = () => {
    if (cancelledRef.current) { cancelledRef.current = false; return; }
    const trimmed = draft.trim();
    if (trimmed) onRename(renamingId, trimmed);
    setRenamingId(null);
  };

  const askDelete = async v => {
    const ok = await ask({
      title: 'Delete “' + v.name + '”?',
      body: 'This removes the saved view for good. Categories and transactions are unaffected — only the filter itself disappears.',
      action: 'Delete view',
      tone: 'neg',
    });
    if (!ok) return;
    onDelete(v.id);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'hsFade .15s ease', zIndex: 60 }}>
      <FocusTrap>
        <div role="dialog" aria-modal="true" aria-label="Manage Views" onClick={e => e.stopPropagation()} style={{ width: 420, maxWidth: '94vw', maxHeight: '84vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)', padding: '22px 26px', animation: 'hsUp .18s ease', color: 'var(--text)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Manage Views</div>
            <button onClick={onClose} aria-label="Close" className="hv-soft" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
          </div>

          {views.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No custom views yet.</div>
          ) : (
            <div>
              {views.map((v, i) => (
                <ViewRow
                  key={v.id}
                  view={v}
                  atTop={i === 0}
                  atBottom={i === views.length - 1}
                  renaming={renamingId === v.id}
                  draft={draft}
                  onDraftChange={setDraft}
                  onStartRename={() => startRename(v)}
                  onCommitRename={commitRename}
                  onDragStart={e => { dragIdRef.current = v.id; e.dataTransfer.effectAllowed = 'move'; }}
                  onDrop={e => {
                    e.preventDefault();
                    const from = dragIdRef.current;
                    dragIdRef.current = null;
                    if (from && from !== v.id) onReorder(from, v.id);
                  }}
                  onMoveUp={() => !!i && onReorder(v.id, views[i - 1].id)}
                  onMoveDown={() => i < views.length - 1 && onReorder(v.id, views[i + 1].id)}
                  onDelete={() => askDelete(v)}
                />
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
            <button onClick={onNew} className="hv-elev" style={{ height: 36, padding: '0 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>New View</button>
            <button onClick={onClose} className="hv-accent" style={{ height: 36, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Done</button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
