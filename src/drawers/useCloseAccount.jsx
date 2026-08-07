import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useMoney } from '../lib/format.js';
import { accountBalance } from '../lib/calc.js';
import { currentMonth, nowIso } from '../lib/dates.js';
import { closeAccount } from '../store/actions.js';

// Confirm-dialog body for closing an account. Module scope (never defined
// inside the hook) so it keeps a stable identity and satisfies the
// no-inline-components guard.
export function CloseAccountBody({ money, balance }) {
  const hasBal = Math.abs(balance) > 0.005;
  return (
    <>
      <div>
        {hasBal
          ? <>Before you can close this account, the balance will have to be zeroed out. An adjustment transaction will be created for <strong style={{ color: 'var(--text)' }}>{money(-balance)}</strong>.</>
          : <>This account will be closed and removed from your totals. Its history is kept.</>}
      </div>
      {hasBal && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 14, padding: '12px 14px', borderRadius: 10, background: 'var(--info-soft)', color: 'var(--text)' }}>
          <span aria-hidden="true" style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 999, background: 'var(--info)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, fontStyle: 'italic' }}>i</span>
          <span>The money in this account will be removed from your plan. If you would like to keep it in your plan, you can transfer it to another account before closing this one.</span>
        </div>
      )}
    </>
  );
}

export function useCloseAccount() {
  const { data: S, applyData } = useStore();
  const { ask, notify } = useUI();
  const { money } = useMoney();
  const { closeDrawer } = useDrawer();
  const nav = useNavigate();
  const { pathname } = useLocation();

  return async accountId => {
    const acc = S.accounts.find(a => a.id === accountId);
    if (!acc) return;
    const cur = accountBalance(acc, S, currentMonth(), nowIso());
    const hasBal = Math.abs(cur) > 0.005;
    const ok = await ask({
      title: 'Close Account',
      body: <CloseAccountBody money={money} balance={cur} />,
      action: hasBal ? 'Adjust Balance & Close' : 'Close Account',
      tone: 'accent',
    });
    if (!ok) return;
    applyData(data => closeAccount(data, { accountId, currentBalance: cur }));
    closeDrawer();
    if (pathname === '/transactions/' + accountId) nav('/transactions');
    notify('"' + acc.nickname + '" closed.');
  };
}
