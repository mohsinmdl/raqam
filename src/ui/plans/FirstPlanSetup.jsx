// Zero-plan first-run page (US-3) — the New Plan form as a full page, shown by
// PlanProvider before any providers below it exist. The store isn't alive
// here, so the plan row goes straight to Supabase via sync.js's insertPlan;
// the provider then persists openPlanId (+ the pendingSeed one-shot) and
// re-runs boot, which hydrates into the new plan and seeds it.
import { useState } from 'react';
import PlanForm, { emptyPlanDraft } from './PlanForm.jsx';
import { buildPlanInsert, planNameError } from './planShellLogic.js';
import { insertPlan } from '../../store/sync.js';
import { uid } from '../../lib/util.js';

export default function FirstPlanSetup({ onCreated }) {
  const [draft, setDraft] = useState(emptyPlanDraft);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (busy) return;
    if (planNameError(draft.name)) { setShowErrors(true); return; }
    const payload = buildPlanInsert({ ...draft, id: uid() });
    setBusy(true);
    setError(null);
    try {
      await insertPlan(payload);
      // Busy stays on: onCreated flips the provider back to loading, which
      // unmounts this page — clearing it here would flash an idle button.
      onCreated({ planId: payload.id, seed: !!draft.seedDefaults });
    } catch (e) {
      console.error('Raqam: first plan insert failed', e);
      setBusy(false);
      setError('Couldn’t create the plan — check your connection and try again.');
    }
  };

  return (
    // Shell styling matches the pre-app screens (LoadingScreen/NoPlansYet):
    // this renders outside Shell, so the font/background are set here.
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Figtree', system-ui, sans-serif", fontSize: 14, lineHeight: 1.45, padding: '48px 16px' }}>
      <div style={{ width: 460, maxWidth: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)', padding: '26px 28px', animation: 'hsFade .25s ease' }}>
        <h1 style={{ fontSize: 21, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>Create your first plan</h1>
        <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '8px 0 20px', lineHeight: 1.5 }}>
          A plan is one complete budget — its own accounts, categories, and settings. You can add more plans later and switch between them any time.
        </p>
        <PlanForm draft={draft} onChange={setDraft} showErrors={showErrors} idPrefix="first-plan" />
        {error && <div role="alert" style={{ marginTop: 14, padding: '8px 10px', borderRadius: 8, background: 'var(--neg-soft)', color: 'var(--neg)', fontSize: 12.5, fontWeight: 600 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}>
          <button onClick={submit} disabled={busy} data-testid="new-plan-create-button" className="hv-accent rq-btn-solid"
            style={{ height: 38, padding: '0 18px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13.5, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? .7 : 1 }}>
            {busy ? 'Creating plan…' : 'Create Plan'}
          </button>
        </div>
      </div>
    </div>
  );
}
