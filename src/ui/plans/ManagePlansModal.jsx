// Manage Plans modal (US-16/17): inline rename (ordinary undoable action) and
// the guarded delete flow — type the plan's exact name, last-plan block, and
// L6's ordering: local deletePlan (system:true) → drain → only then the
// fallback persist + reload when the open plan was the one deleted.
import { useEffect, useRef, useState } from 'react';
import { Modal, ModalClose, ModalPanel } from '../primitives/Modal.jsx';
import { usePlan } from '../../store/PlanProvider.jsx';
import { useStore } from '../../store/StoreProvider.jsx';
import { deletePlan, renamePlan } from '../../store/actions.js';
import { deleteConfirmReady, PLAN_NAME_MAX, planNameError, switcherPlans } from './planShellLogic.js';

const btnOutline = { height: 32, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flex: 'none' };
const inputStyle = { width: '100%', boxSizing: 'border-box', height: 32, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13 };

// One plan row: name (click → inline rename input), an Open marker for the
// current plan, and the delete opener. The typed-name confirm expands beneath.
function PlanRow({
  plan, canDelete, renaming, draft, renameErr, onDraftChange, onStartRename, onCommitRename, onCancelRename,
  confirming, typed, onTypedChange, onOpenConfirm, onCancelConfirm, onConfirmDelete, deleting, busy,
}) {
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {renaming ? (
            <>
              <input
                ref={el => { if (el && !el.dataset.seeded) { el.dataset.seeded = '1'; el.focus(); el.select(); } }}
                data-testid="manage-plans-rename-input"
                value={draft} maxLength={PLAN_NAME_MAX + 1}
                aria-label={'Rename ' + plan.name}
                aria-invalid={renameErr ? true : undefined}
                onChange={e => onDraftChange(e.target.value)}
                onBlur={onCommitRename}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !renameErr) onCommitRename();
                  // Escape backs out of just the rename, not the whole dialog.
                  else if (e.key === 'Escape') { e.stopPropagation(); onCancelRename(); }
                }}
                style={{ ...inputStyle, borderColor: renameErr ? 'var(--neg)' : 'var(--accent)' }}
              />
              {renameErr && <div role="alert" style={{ fontSize: 12, color: 'var(--neg)', marginTop: 4 }}>{renameErr}</div>}
            </>
          ) : (
            <button onClick={onStartRename} title={'Rename ' + plan.name} data-testid="manage-plans-rename-button" className="hv-soft"
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', border: '1px solid transparent', borderRadius: 6, background: 'transparent', color: 'var(--text)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {plan.name}
            </button>
          )}
        </div>
        {plan.open && (
          <span style={{ flex: 'none', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'var(--soft)', color: 'var(--accent)' }}>Open</span>
        )}
        {canDelete && !confirming && (
          <button onClick={onOpenConfirm} disabled={busy} data-testid="manage-plans-delete-button" data-plan-id={plan.id}
            aria-label={'Delete ' + plan.name} className="hv-soft rq-btn-outline"
            style={{ ...btnOutline, color: 'var(--neg)', opacity: busy ? .5 : 1, cursor: busy ? 'default' : 'pointer' }}>
            Delete
          </button>
        )}
      </div>
      {confirming && (
        <div style={{ margin: '0 4px 10px', padding: '10px 12px', border: '1px solid var(--neg)', borderRadius: 10, background: 'var(--neg-soft)' }}>
          <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.5 }}>
            Deleting <b>{plan.name}</b> removes every account, transaction, and budget inside it — for good. Type the plan’s name to confirm.
          </div>
          <input
            data-testid="manage-plans-delete-confirm-input"
            value={typed} placeholder={plan.name}
            aria-label={'Type ' + plan.name + ' to confirm deletion'}
            onChange={e => onTypedChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onCancelConfirm(); } }}
            style={{ ...inputStyle, marginTop: 8 }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
            <button onClick={onCancelConfirm} disabled={deleting} data-testid="manage-plans-delete-cancel-button" className="hv-soft rq-btn-outline" style={btnOutline}>Cancel</button>
            <button
              onClick={onConfirmDelete}
              disabled={deleting || !deleteConfirmReady(typed, plan.name)}
              data-testid="manage-plans-delete-confirm-button"
              className="hv-soft rq-btn-outline"
              style={{ ...btnOutline, borderColor: 'var(--neg)', color: 'var(--neg)', opacity: deleting || !deleteConfirmReady(typed, plan.name) ? .5 : 1, cursor: deleting || !deleteConfirmReady(typed, plan.name) ? 'default' : 'pointer' }}>
              {deleting ? 'Deleting…' : 'Delete Plan'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ManagePlansModal({ open, onClose }) {
  const { plans, openPlanId, switchPlan, drain } = usePlan();
  const { applyData } = useStore();
  const [renamingId, setRenamingId] = useState(null);
  const [draft, setDraft] = useState('');
  const cancelledRef = useRef(false);
  const [confirmId, setConfirmId] = useState(null);
  const [typed, setTyped] = useState('');
  // { id, wasOpen } while a delete is in flight; the continuation effect picks
  // it up once the row has left the published plans list.
  const [deleting, setDeleting] = useState(null);
  const started = useRef(false);
  const [notice, setNotice] = useState(null);

  const list = switcherPlans(plans, openPlanId);

  useEffect(() => {
    if (open) { setRenamingId(null); setConfirmId(null); setTyped(''); setNotice(null); }
  }, [open]);

  // L6 continuation: the drain may only run once the store commit that removed
  // the plan has been published — that same commit re-registered the drain
  // over a store the differ will read as "one plans DELETE" (children are the
  // server cascade's job). Only a clean drain may persist a fallback + reload.
  useEffect(() => {
    if (!deleting || started.current || plans.some(p => p.id === deleting.id)) return;
    started.current = true;
    (async () => {
      const clean = await drain();
      if (!clean) {
        // Fail-closed: the sync-status pill in the header is already saying
        // why; the row will reappear from server truth on the next hydrate.
        started.current = false;
        setDeleting(null);
        setNotice('The delete hasn’t reached the server yet — check the sync status and try again once your changes have saved.');
        return;
      }
      if (deleting.wasOpen) {
        // Fallback = first remaining by name; switchPlan persists it and
        // reloads (the drain it runs first is already clean).
        const fallback = switcherPlans(plans, null)[0];
        await switchPlan(fallback.id); // reload — nothing after runs
        return;
      }
      started.current = false;
      setDeleting(null);
      setConfirmId(null);
      setTyped('');
    })();
  }, [deleting, plans, drain, switchPlan]);

  const startRename = p => { cancelledRef.current = false; setRenamingId(p.id); setDraft(p.name); };
  const cancelRename = () => { cancelledRef.current = true; setRenamingId(null); };
  const commitRename = () => {
    // Blur fires as the input unmounts after Escape — must not re-commit.
    if (cancelledRef.current) { cancelledRef.current = false; return; }
    const trimmed = draft.trim();
    // Invalid drafts revert (US-16: rejected inline — the error already showed
    // while typing); a valid new name is an ordinary undoable rename (Q1=A).
    if (!planNameError(trimmed)) applyData(d => renamePlan(d, { id: renamingId, name: trimmed }));
    setRenamingId(null);
  };

  const confirmDelete = p => {
    if (deleting) return;
    applyData(d => deletePlan(d, { id: p.id }), { system: true });
    setNotice(null);
    setDeleting({ id: p.id, wasOpen: p.id === openPlanId });
  };

  return (
    <Modal open={open} onOpenChange={o => { if (!o && !deleting) onClose(); }}>
      <ModalPanel label="Manage Plans" width={480} height="auto">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 10px', flex: 'none' }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Manage Plans</div>
          <ModalClose aria-label="Close" data-testid="manage-plans-close" className="hv-soft rq-btn-outline"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</ModalClose>
        </div>
        <div style={{ padding: '0 24px 20px', overflowY: 'auto', minHeight: 0 }}>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: '0 4px 8px' }}>Click a plan’s name to rename it.</div>
          {list.map(p => (
            <PlanRow
              key={p.id}
              plan={p}
              canDelete={list.length > 1}
              renaming={renamingId === p.id}
              draft={draft}
              renameErr={renamingId === p.id ? planNameError(draft) : null}
              onDraftChange={setDraft}
              onStartRename={() => startRename(p)}
              onCommitRename={commitRename}
              onCancelRename={cancelRename}
              confirming={confirmId === p.id}
              typed={typed}
              onTypedChange={setTyped}
              onOpenConfirm={() => { setConfirmId(p.id); setTyped(''); }}
              onCancelConfirm={() => { setConfirmId(null); setTyped(''); }}
              onConfirmDelete={() => confirmDelete(p)}
              deleting={!!deleting && deleting.id === p.id}
              busy={!!deleting}
            />
          ))}
          {list.length <= 1 && (
            <div style={{ fontSize: 12, color: 'var(--muted)', padding: '10px 4px 0', lineHeight: 1.5 }}>
              Your last remaining plan can’t be deleted — there’s always at least one plan to open into.
            </div>
          )}
          {notice && <div role="status" style={{ marginTop: 12, padding: '8px 10px', borderRadius: 8, background: 'var(--warn-soft)', color: 'var(--warn)', fontSize: 12.5, fontWeight: 600 }}>{notice}</div>}
        </div>
      </ModalPanel>
    </Modal>
  );
}
