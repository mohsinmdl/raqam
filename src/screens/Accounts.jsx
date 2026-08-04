// Accounts list screen — template 337-379, accountsVals script 1056-1066.
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.jsx';
import { useMonth } from '../store/MonthContext.jsx';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useMoney } from '../lib/format.js';
import { accountBalance, dayLabel, kindLabel, lastActivity } from '../lib/calc.js';
import { freshInfo, instName } from '../lib/txRow.js';
import { openers } from '../drawers/openers.js';
import { setAccountStatus } from '../store/actions.js';

const colHeader = { fontSize: 11, fontWeight: 600, letterSpacing: '.05em', color: 'var(--muted)' };
const gridCols = { display: 'grid', gridTemplateColumns: '2fr 1.1fr 1fr 1.1fr 100px 128px', gap: 12 };

export default function Accounts() {
  const { data: S, applyData } = useStore();
  const { month } = useMonth();
  const { money } = useMoney();
  const { openDrawer } = useDrawer();
  const { notify } = useUI();
  const nav = useNavigate();

  const active = S.accounts.filter(a => a.status === 'active');
  const rows = active.map(a => {
    const f = freshInfo(a, S);
    const inst = S.institutions.find(i => i.id === a.instId);
    return {
      // The bank's category IS the account's — no separate per-account flag.
      id: a.id, nick: a.nickname, inst: inst ? inst.name : '—', kind: inst ? kindLabel(inst.kind) : '—', type: a.type,
      bal: money(accountBalance(a, S, month)), asOf: dayLabel(lastActivity(a, S)),
      dot: f.dot, fresh: f.label, last4: a.last4 ? '•• ' + a.last4 : '—',
    };
  });
  const archived = S.accounts.filter(a => a.status !== 'active');
  const restore = id => {
    applyData(data => setAccountStatus(data, { accountId: id, status: 'active' }));
    notify('Account restored — included in totals again.');
  };

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px 56px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'hsFade .25s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, flex: 1 }}>Balances are computed from your confirmed opening balance plus recorded activity. Only the last 4 digits of any account are ever stored.</p>
          <button onClick={() => openers.addAccount(openDrawer)} className="hv-accent" style={{ height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>＋ Add account</button>
        </div>

        {rows.length > 0 ? (
          <section aria-label="Account list" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ ...gridCols, padding: '10px 18px', borderBottom: '1px solid var(--border)' }}>
              <span style={colHeader}>ACCOUNT</span><span style={colHeader}>TYPE</span>
              <span style={{ ...colHeader, textAlign: 'right' }}>BALANCE</span>
              <span style={colHeader}>FRESHNESS</span><span style={colHeader}>NUMBER</span><span />
            </div>
            {rows.map(a => (
              <div key={a.id} onClick={() => nav(`/accounts/${a.id}`)} className="hv-elev" style={{ ...gridCols, alignItems: 'center', padding: '13px 18px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.nick}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{a.inst}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 999, background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--muted)' }}>{a.kind}</span>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{a.type}</div>
                <div style={{ textAlign: 'right' }}>
                  <div className="tnum" style={{ fontSize: 14.5, fontWeight: 600 }}>{a.bal}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>as of {a.asOf}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: a.dot, flex: 'none' }} />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{a.fresh}</span>
                </div>
                <div className="tnum" style={{ fontSize: 12.5, color: 'var(--muted)' }}>{a.last4}</div>
                <div style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button onClick={e => { e.stopPropagation(); openers.editAccount(S, a.id, openDrawer); }} className="hv-elev" style={{ height: 28, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', color: 'var(--text)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Edit</button>
                  <button onClick={e => { e.stopPropagation(); nav(`/accounts/${a.id}`); }} className="hv-soft" style={{ height: 28, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>View</button>
                </div>
              </div>
            ))}
          </section>
        ) : (
          <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '48px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>No accounts yet</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6, maxWidth: '46ch', marginLeft: 'auto', marginRight: 'auto' }}>Add each Pakistani bank account you use — institution, a nickname, and today's balance. Everything else builds on this.</div>
            <button onClick={() => openers.addAccount(openDrawer)} className="hv-accent" style={{ marginTop: 14, height: 36, padding: '0 18px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>＋ Add your first account</button>
          </section>
        )}

        {archived.length > 0 && (
          <section aria-label="Archived accounts" style={{ border: '1px dashed var(--border)', borderRadius: 12, padding: '14px 18px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.05em', color: 'var(--muted)' }}>ARCHIVED</div>
            {archived.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0 2px' }}>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--muted)' }}>{a.nickname}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}> · {instName(S, a.instId)} · {a.status === 'closed' ? 'closed' : 'archived'} · excluded from totals</span>
                </span>
                <button onClick={() => restore(a.id)} className="hv-elev" style={{ height: 28, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', color: 'var(--text)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Restore</button>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
