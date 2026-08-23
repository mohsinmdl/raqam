// New Plan modal (US-4/5/6) — Base UI Modal shell hosting the shared
// PlanForm. Create is L4's exact order: optimistic createPlan (system:true,
// never undoable), pendingSeed persisted BEFORE the switch, then switchPlan
// into the new plan (which drains and reloads).
import { useEffect, useRef, useState } from 'react';
import { Modal, ModalClose, ModalPanel } from '../primitives/Modal.jsx';
import PlanForm, { emptyPlanDraft } from './PlanForm.jsx';
import { planNameError } from './planShellLogic.js';
import { usePlan } from '../../store/PlanProvider.jsx';
import { useStore } from '../../store/StoreProvider.jsx';
import { createPlan } from '../../store/actions.js';
import { uid } from '../../lib/util.js';

const btnOutline = { height: 36, padding: '0 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const btnSolid = { height: 36, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' };

export default function NewPlanModal({ open, onClose }) {
  const { plans, switchPlan } = usePlan();
  const { applyData, setPrefs } = useStore();
  const [draft, setDraft] = useState(emptyPlanDraft);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  // { id, seed } while waiting for the created plan to reach the published
  // plans list — the continuation effect below picks it up from there.
  const [pending, setPending] = useState(null);
  const started = useRef(false);

  // Held-mounted shell (same as ViewEditorModal): re-seed the draft per open.
  useEffect(() => {
    if (open) { setDraft(emptyPlanDraft()); setShowErrors(false); setNotice(null); }
  }, [open]);

  // switchPlan may only run once the new plan shows up in usePlan().plans:
  // that publish happens the commit AFTER StoreProvider re-registered its
  // drain over a store containing the new row — draining any earlier would
  // flush a queue that has never seen the plan and reload into a plan the
  // server doesn't have.
  useEffect(() => {
    if (!pending || started.current || !plans.some(p => p.id === pending.id)) return;
    started.current = true;
    (async () => {
      // One-shot seed flag BEFORE the switch (U2 L4): the post-reload hydrate
      // consumes it, so it must be on disk before the reload can happen.
      if (pending.seed) setPrefs({ pendingSeed: pending.id });
      const ok = await switchPlan(pending.id); // true → reload; nothing after runs
      if (!ok) {
        // Drain abort (fail-closed, BR-U2-2): the plan exists locally and will
        // sync with everything else; the header's sync status is already
        // showing why the switch couldn't happen.
        started.current = false;
        setPending(null);
        setBusy(false);
        setNotice('The plan was created, but switching is waiting on sync. Pick it from the switcher once your changes have saved.');
      }
    })();
  }, [pending, plans, setPrefs, switchPlan]);

  const submit = () => {
    if (busy) return;
    if (planNameError(draft.name)) { setShowErrors(true); return; }
    const id = uid();
    applyData(d => createPlan(d, { ...draft, id }), { system: true });
    setBusy(true);
    setPending({ id, seed: !!draft.seedDefaults });
  };

  return (
    <Modal open={open} onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <ModalPanel label="New Plan" width={480} height="auto">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 14px', flex: 'none' }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>New Plan</div>
          <ModalClose aria-label="Close" data-testid="new-plan-close" className="hv-soft rq-btn-outline"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</ModalClose>
        </div>
        <div style={{ padding: '0 24px', overflowY: 'auto', minHeight: 0 }}>
          <PlanForm draft={draft} onChange={setDraft} showErrors={showErrors} idPrefix="new-plan" />
          {notice && <div role="status" style={{ marginTop: 12, padding: '8px 10px', borderRadius: 8, background: 'var(--warn-soft)', color: 'var(--warn)', fontSize: 12.5, fontWeight: 600 }}>{notice}</div>}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '18px 24px 20px', flex: 'none' }}>
          <button onClick={onClose} disabled={busy} data-testid="new-plan-cancel-button" className="hv-elev rq-btn-outline"
            style={{ ...btnOutline, opacity: busy ? .5 : 1, cursor: busy ? 'default' : 'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={busy} data-testid="new-plan-create-button" className="hv-accent rq-btn-solid"
            style={{ ...btnSolid, opacity: busy ? .7 : 1, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Creating plan…' : 'Create Plan'}
          </button>
        </div>
      </ModalPanel>
    </Modal>
  );
}
