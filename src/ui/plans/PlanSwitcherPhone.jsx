// Phone entry to the plan switcher (US-10): the Budget shell header's plan
// title is the trigger, opening a bottom sheet with the plan list plus New
// Plan / Manage Plans. The two management modals are the same components the
// desktop switcher uses — Modal renders center-card at 96vw on phone, which
// keeps one behavior for both shells.
import { useState } from 'react';
import { BottomSheet, BottomSheetPanel, BottomSheetClose } from '../primitives/BottomSheet.jsx';
import { usePlan } from '../../store/PlanProvider.jsx';
import { switcherPlans } from './planShellLogic.js';
import NewPlanModal from './NewPlanModal.jsx';
import ManagePlansModal from './ManagePlansModal.jsx';
import { CheckIcon, Chevron } from '../icons.jsx';

const rowStyle = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: 'none', background: 'transparent', textAlign: 'left', padding: '12px 8px', borderRadius: 8, fontSize: 14.5, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' };

export default function PlanSwitcherPhone() {
  const { plans, openPlan, openPlanId, switchPlan } = usePlan();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [aborted, setAborted] = useState(false);
  const list = switcherPlans(plans, openPlanId);

  const pick = async id => {
    if (id === openPlanId) { setSheetOpen(false); return; }
    setAborted(false);
    const ok = await switchPlan(id); // true → reload; the sheet dies with the page
    if (!ok) setAborted(true);
  };

  return (
    <>
      <button data-testid="plan-switcher-phone-trigger" onClick={() => { setAborted(false); setSheetOpen(true); }}
        aria-label="Switch plan" className="hv-soft"
        style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, border: 'none', background: 'transparent', padding: '6px 8px', borderRadius: 8, cursor: 'pointer', color: 'var(--text)', textAlign: 'left' }}>
        <span style={{ fontSize: 17, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{openPlan ? openPlan.name : ''}</span>
        <span aria-hidden="true" style={{ color: 'var(--muted)', flex: 'none', display: 'inline-flex' }}><Chevron /></span>
      </button>
      <BottomSheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <BottomSheetPanel label="Plans">
          <div style={{ padding: '14px 16px calc(14px + env(safe-area-inset-bottom))' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Plans</span>
              <BottomSheetClose aria-label="Close" data-testid="plan-switcher-phone-close" className="hv-soft"
                style={{ width: 30, height: 30, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>×</BottomSheetClose>
            </div>
            {list.map(p => (
              <button key={p.id} data-testid="plan-switcher-item" data-plan-id={p.id}
                aria-current={p.open ? 'true' : undefined} onClick={() => pick(p.id)} className="hv-soft" style={rowStyle}>
                <span aria-hidden="true" style={{ width: 14, flex: 'none', display: 'inline-flex', color: 'var(--accent)' }}>{p.open ? <CheckIcon /> : null}</span>
                <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
              </button>
            ))}
            {aborted && (
              <div role="status" style={{ margin: '4px 8px 6px', padding: '6px 9px', borderRadius: 8, background: 'var(--warn-soft)', color: 'var(--warn)', fontSize: 12, fontWeight: 600 }}>
                Can’t switch yet — changes are still syncing.
              </div>
            )}
            <div aria-hidden="true" style={{ borderTop: '1px solid var(--border)', margin: '6px 8px' }} />
            <button data-testid="plan-switcher-new-plan" onClick={() => { setSheetOpen(false); setNewOpen(true); }} className="hv-soft" style={rowStyle}>
              <span aria-hidden="true" style={{ width: 14, flex: 'none' }} />New Plan
            </button>
            <button data-testid="plan-switcher-manage-plans" onClick={() => { setSheetOpen(false); setManageOpen(true); }} className="hv-soft" style={rowStyle}>
              <span aria-hidden="true" style={{ width: 14, flex: 'none' }} />Manage Plans
            </button>
          </div>
        </BottomSheetPanel>
      </BottomSheet>
      <NewPlanModal open={newOpen} onClose={() => setNewOpen(false)} />
      <ManagePlansModal open={manageOpen} onClose={() => setManageOpen(false)} />
    </>
  );
}
