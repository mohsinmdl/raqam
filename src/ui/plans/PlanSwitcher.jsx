// YNAB-style plan switcher block at the TOP of the sidebar (US-7/8): the open
// plan's name + account email + chevron, opening a Base UI menu of all plans
// (ordered by name, open one checked) plus New Plan / Manage Plans. Owns the
// two management modals so the phone entry can stay a thin sheet.
import { useState } from 'react';
import { Menu, MenuTrigger, MenuPanel, MenuItem } from '../primitives/Menu.jsx';
import { usePlan } from '../../store/PlanProvider.jsx';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { switcherPlans } from './planShellLogic.js';
import NewPlanModal from './NewPlanModal.jsx';
import ManagePlansModal from './ManagePlansModal.jsx';
import { CheckIcon, Chevron } from '../icons.jsx';

const sep = <div aria-hidden="true" style={{ borderTop: '1px solid var(--border)', margin: '4px 8px' }} />;

export default function PlanSwitcher() {
  const { plans, openPlan, openPlanId, switchPlan } = usePlan();
  const { user } = useAuth();
  const [newOpen, setNewOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [aborted, setAborted] = useState(false);
  const list = switcherPlans(plans, openPlanId);

  const pick = async id => {
    setAborted(false);
    const ok = await switchPlan(id); // true for the open plan too (no-op) — reload otherwise
    if (!ok) setAborted(true); // drain refused: the header's sync pill says why
  };

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <Menu>
        <MenuTrigger data-testid="plan-switcher-trigger" aria-label="Switch plan" className="hv-elev"
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '14px 14px 12px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', color: 'var(--text)' }}>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'block', fontWeight: 700, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{openPlan ? openPlan.name : ''}</span>
            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email || ''}</span>
          </span>
          <span aria-hidden="true" style={{ color: 'var(--muted)', flex: 'none', display: 'inline-flex' }}><Chevron /></span>
        </MenuTrigger>
        <MenuPanel side="bottom" align="start" style={{ minWidth: 232 }}>
          {list.map(p => (
            <MenuItem key={p.id} data-testid="plan-switcher-item" data-plan-id={p.id}
              data-open={p.open || undefined} onClick={() => pick(p.id)}>
              {/* Fixed check slot so unchecked names align under the checked one. */}
              <span aria-hidden="true" style={{ width: 14, flex: 'none', display: 'inline-flex', color: 'var(--accent)' }}>{p.open ? <CheckIcon /> : null}</span>
              <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
              {/* aria-checked isn't valid on role=menuitem, so the open state
                  is spoken through text instead of a state attribute. */}
              {p.open && <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>(open)</span>}
            </MenuItem>
          ))}
          {sep}
          <MenuItem data-testid="plan-switcher-new-plan" onClick={() => setNewOpen(true)}>
            <span aria-hidden="true" style={{ width: 14, flex: 'none' }} />New Plan
          </MenuItem>
          <MenuItem data-testid="plan-switcher-manage-plans" onClick={() => setManageOpen(true)}>
            <span aria-hidden="true" style={{ width: 14, flex: 'none' }} />Manage Plans
          </MenuItem>
        </MenuPanel>
      </Menu>
      {aborted && (
        <div role="status" style={{ margin: '0 12px 10px', padding: '6px 9px', borderRadius: 8, background: 'var(--warn-soft)', color: 'var(--warn)', fontSize: 11.5, fontWeight: 600 }}>
          Can’t switch yet — changes are still syncing.
        </div>
      )}
      <NewPlanModal open={newOpen} onClose={() => setNewOpen(false)} />
      <ManagePlansModal open={manageOpen} onClose={() => setManageOpen(false)} />
    </div>
  );
}
