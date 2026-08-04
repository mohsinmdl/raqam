// Account detail screen — template 380-446, detail section of accountsVals script 1067-1097.
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.jsx';
import { useMonth } from '../store/MonthContext.jsx';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useMoney } from '../lib/format.js';
import { accountBalance, accountDelta, dayLabel, inMonth, kindLabel, lastActivity, monthLabel, openingOf, relTime } from '../lib/calc.js';
import { txRowOf, instName } from '../lib/txRow.js';
import { openers } from '../drawers/openers.js';
import { setAccountStatus } from '../store/actions.js';

const cardBg = theme => ({ teal: '#0E5A53', ink: '#1D2925', warm: '#59452A' }[theme] || '#0E5A53');
const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 };
const chip = (bg, fg) => ({ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: bg, color: fg });

export default function AccountDetail() {
  const { id } = useParams();
  const { data: S, applyData } = useStore();
  const { month, months } = useMonth();
  const fmt = useMoney();
  const { money, moneyS, moneyRaw } = fmt;
  const { openDrawer } = useDrawer();
  const { ask, notify } = useUI();
  const nav = useNavigate();

  const a = S.accounts.find(x => x.id === id);
  const monthName = monthLabel(month);
  if (!a) {
    return (
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px' }}>
        <button onClick={() => nav('/accounts')} className="hv-text" style={{ border: 'none', background: 'none', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', padding: 0 }}>‹ All accounts</button>
        <div style={{ marginTop: 20, color: 'var(--muted)' }}>Account not found.</div>
      </div>
    );
  }

  const inst = S.institutions.find(i => i.id === a.instId);
  const bal = accountBalance(a, S, month);
  const snap = S.snapshots.find(s => s.accountId === a.id && s.month === month);
  const opening = snap ? snap.amount : 0;
  const atx = S.transactions.filter(t => inMonth(t, month) && (t.accountId === a.id || t.toAccountId === a.id)).sort((x, y) => y.date.localeCompare(x.date));
  const inflow = atx.reduce((s, t) => { const d = accountDelta(t, a.id); return s + (d > 0 ? d : 0); }, 0);
  const outflow = atx.reduce((s, t) => { const d = accountDelta(t, a.id); return s + (d < 0 ? -d : 0); }, 0);
  const change = bal - opening;
  const detTx = atx.map(t => txRowOf(t, S, fmt, a.id));
  const linkedCards = S.cards.filter(c => c.linkedAccountId === a.id);

  const pts = months.map(m => ({ label: monthLabel(m).slice(0, 3), val: openingOf(a, S.snapshots, m), tip: monthLabel(m) + ' opening: ' }))
    .concat([{ label: 'Now', val: bal, tip: 'Current balance: ' }]);
  const pmax = Math.max(...pts.map(p => p.val), 1);
  const detTrend = pts.map((p, i) => ({ label: p.label, h: Math.max(Math.round(p.val / pmax * 100), 4) + '%', bg: i === pts.length - 1 ? 'var(--accent)' : 'var(--border)', tip: p.tip + moneyRaw(p.val) }));

  const askArchive = async () => {
    const ok = await ask({
      title: 'Archive this account?',
      body: 'Archived accounts are excluded from totals and lists. All history is kept, and you can restore the account at any time.',
      action: 'Archive account',
    });
    if (!ok) return;
    applyData(data => setAccountStatus(data, { accountId: a.id, status: 'archived' }));
    nav('/accounts');
    notify('Account archived — excluded from totals. You can restore it anytime.');
  };
  const restore = () => {
    applyData(data => setAccountStatus(data, { accountId: a.id, status: 'active' }));
    notify('Account restored — included in totals again.');
  };

  const smallBtn = { height: 30, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' };

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px 56px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'hsFade .25s ease' }}>
        <button onClick={() => nav('/accounts')} className="hv-text" style={{ border: 'none', background: 'none', color: 'var(--muted)', fontSize: 13, fontWeight: 500, cursor: 'pointer', padding: 0, textAlign: 'left', width: 'fit-content' }}>‹ All accounts</button>

        <section style={{ ...card, padding: '22px 24px' }}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>{a.nickname}</h2>
                <span style={{ ...chip('var(--elev)', 'var(--muted)'), border: '1px solid var(--border)' }}>{a.type}</span>
                {a.status === 'archived' && <span style={chip('var(--warn-soft)', 'var(--warn)')}>Archived</span>}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                {inst ? inst.name : '—'} · {inst ? kindLabel(inst.kind) : '—'} · {a.last4 ? 'Account •• ' + a.last4 : 'No number stored'} · PKR
                {a.editedAt ? ' · Edited ' + relTime(a.editedAt) : ''}
              </div>
              {a.notes && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 10, padding: '10px 12px', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 8, maxWidth: '56ch' }}>{a.notes}</div>}
            </div>
            <div style={{ textAlign: 'right', flex: 'none' }}>
              <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Current balance</div>
              <div className="tnum" style={{ fontSize: 27, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 2 }}>{money(bal)}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>as of {dayLabel(lastActivity(a, S))}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button onClick={() => openers.editAccount(S, a.id, openDrawer)} className="hv-elev" style={{ ...smallBtn, color: 'var(--text)' }}>Edit account</button>
                <button onClick={() => openers.adjust(S, a.id, openDrawer)} className="hv-elev" style={{ ...smallBtn, color: 'var(--text)' }}>Adjust balance</button>
                {a.status === 'active' && <button onClick={askArchive} className="hv-neg-soft" style={{ ...smallBtn, color: 'var(--neg)' }}>Archive</button>}
                {a.status === 'archived' && <button onClick={restore} className="hv-elev" style={{ ...smallBtn, color: 'var(--text)' }}>Restore</button>}
              </div>
            </div>
          </div>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, alignItems: 'start' }}>
          <section aria-label="Activity" style={{ ...card, padding: '16px 20px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Activity in {monthName}</h3>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>in {money(inflow)} · out {money(outflow)}</span>
            </div>
            {detTx.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: 6 }}>
                {detTx.map(t => (
                  <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '78px minmax(0,1fr) 104px 48px', gap: 12, alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)', opacity: t.rowOpacity }}>
                    <div className="tnum" style={{ fontSize: 12.5, color: 'var(--muted)' }}>{t.dateLabel}</div>
                    <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.merchant}</span>
                      {t.hasChip && <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: t.chipBg, color: t.chipFg, flex: 'none' }}>{t.chip}</span>}
                    </div>
                    <div className="tnum" style={{ fontSize: 13.5, fontWeight: 600, textAlign: 'right', color: t.amtColor }}>{t.amtLabel}</div>
                    <div style={{ textAlign: 'right' }}>
                      {t.canEdit && (
                        <button onClick={() => openers.editTx(S, t.id, openDrawer)} aria-label="Edit this transaction" className="hv-soft" style={{ height: 24, padding: '0 9px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', color: 'var(--accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Edit</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '26px 0', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>No activity recorded for this account in {monthName}.</div>
            )}
          </section>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <section aria-label="Opening balance" style={{ ...card, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, flex: 1 }}>Opening balance · {monthName}</h3>
                <span style={chip(snap && snap.status === 'confirmed' ? 'var(--pos-soft)' : 'var(--warn-soft)', snap && snap.status === 'confirmed' ? 'var(--pos)' : 'var(--warn)')}>
                  {snap ? (snap.status === 'confirmed' ? (snap.corrected ? 'Corrected' : 'Confirmed') : 'Pending review') : 'Missing'}
                </span>
              </div>
              <div className="tnum" style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>{money(opening)}</div>
              <div className="tnum" style={{ fontSize: 12, color: change > 0 ? 'var(--pos)' : change < 0 ? 'var(--neg)' : 'var(--muted)', fontWeight: 600, marginTop: 2 }}>{moneyS(change)} since start of month</div>
            </section>

            <section aria-label="Balance trend" style={{ ...card, padding: '16px 18px' }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Opening-balance trend</h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 84, marginTop: 14 }} role="img" aria-label={'Opening balances for the last months, most recent value ' + moneyRaw(bal)}>
                {detTrend.map((b, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }} title={b.tip}>
                    <div style={{ height: b.h, background: b.bg, borderRadius: '4px 4px 0 0', minHeight: 3 }} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                {detTrend.map((b, i) => <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10.5, color: 'var(--muted)' }}>{b.label}</div>)}
              </div>
            </section>

            {linkedCards.length > 0 && (
              <section aria-label="Linked cards" style={{ ...card, padding: '16px 18px' }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Linked cards</h3>
                {linkedCards.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ width: 26, height: 18, borderRadius: 4, background: cardBg(c.theme), flex: 'none' }} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 500 }}>{c.nickname}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{c.type.charAt(0).toUpperCase() + c.type.slice(1)} · {c.network} · •• {c.last4}</span>
                    </span>
                  </div>
                ))}
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
