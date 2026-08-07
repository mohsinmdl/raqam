// The ACCOUNTS section of the sidebar: a live, flat list of active accounts
// with balances as of today (NOT the selected reporting month), a reconciling
// total, and an Add-account row. A row opens that account's detail screen.
import { useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.jsx';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useMoney } from '../lib/format.js';
import { openers } from '../drawers/openers.js';
import { currentMonth, nowIso } from '../lib/dates.js';
import { accountRows } from '../lib/sidebarAccounts.js';

export default function AccountList() {
  const { data } = useStore();
  const { money, masked } = useMoney();
  const { openDrawer } = useDrawer();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const { rows, total } = accountRows(data, currentMonth(), nowIso());
  const activeId = pathname.startsWith('/accounts/') ? decodeURIComponent(pathname.split('/')[2]) : null;

  const rowBtn = active => ({
    display: 'flex', alignItems: 'center', gap: 10, height: 34, padding: '0 12px',
    border: 'none', borderRadius: 8, background: active ? 'var(--soft)' : 'transparent',
    cursor: 'pointer', width: '100%', textAlign: 'left',
  });

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 6px' }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.09em', color: 'var(--muted)' }}>ACCOUNTS</span>
        {rows.length > 0 && <span className="tnum" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted)' }}>{money(total)}</span>}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 12px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {rows.length === 0 && (
          <div style={{ padding: '6px 12px', fontSize: 12.5, color: 'var(--muted)' }}>No accounts yet</div>
        )}
        {rows.map(r => {
          const active = r.id === activeId;
          const neg = !masked && r.balance < 0;
          return (
            <button key={r.id} onClick={() => navigate('/accounts/' + r.id)} className="hv-elev" style={rowBtn(active)}>
              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 13.5, color: 'var(--text)', fontWeight: active ? 600 : 500 }}>{r.nickname}</span>
              <span className="tnum" style={{ fontSize: 12.5, whiteSpace: 'nowrap', color: neg ? 'var(--neg)' : 'var(--muted)', fontWeight: neg ? 600 : 500 }}>{money(r.balance)}</span>
            </button>
          );
        })}
        <button onClick={() => openers.addAccount(openDrawer)} className="hv-elev" style={{ ...rowBtn(false), color: 'var(--accent)', fontWeight: 600, fontSize: 13.5, marginTop: 2 }}>
          <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>＋</span> Add account
        </button>
      </div>
    </div>
  );
}
