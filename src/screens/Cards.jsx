// Card wallet screen — template 447-493, cardsVals script 1098-1132.
import { useStore } from '../store/StoreProvider.jsx';
import { useMonth } from '../store/MonthContext.jsx';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useMoney } from '../lib/format.js';
import { accountBalance, cardOutstanding, dayLabel, daysUntil } from '../lib/calc.js';
import { nowIso } from '../lib/dates.js';
import { instName } from '../lib/txRow.js';
import { openers } from '../drawers/openers.js';

const cardBg = theme => ({ teal: '#0E5A53', ink: '#1D2925', warm: '#59452A' }[theme] || '#0E5A53');
const ord = n => (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');

export default function Cards() {
  const { data: S } = useStore();
  const { month } = useMonth();
  const { money } = useMoney();
  const { openDrawer } = useDrawer();
  const now = nowIso();

  const tiles = S.cards.map(c => {
    const inst = S.institutions.find(i => i.id === c.instId);
    const base = {
      id: c.id, instUpper: (inst ? inst.name : '—').toUpperCase(), nick: c.nickname, last4: c.last4 || '0000',
      network: (c.network || '').toUpperCase(), typeTier: c.type.charAt(0).toUpperCase() + c.type.slice(1) + (c.tier ? ' · ' + c.tier : ''),
      bg: cardBg(c.theme), isCredit: c.type === 'credit',
      aria: c.nickname + ' — ' + c.type + ' card ending ' + c.last4,
      status: c.status.charAt(0).toUpperCase() + c.status.slice(1),
      stBg: c.status === 'active' ? 'var(--pos-soft)' : c.status === 'frozen' ? 'var(--info-soft)' : 'var(--warn-soft)',
      stFg: c.status === 'active' ? 'var(--pos)' : c.status === 'frozen' ? 'var(--info)' : 'var(--warn)',
      feeNote: c.annualFeeMonth ? 'Annual fee due in ' + c.annualFeeMonth : '',
    };
    if (c.type === 'credit') {
      const out = cardOutstanding(c, S, month);
      const avail = Math.max((c.limit || 0) - out, 0);
      const pct = c.limit ? Math.min(Math.round((out / c.limit) * 100), 100) : 0;
      const dd = c.dueDate ? daysUntil(c.dueDate, now) : null;
      base.outstanding = money(out); base.available = money(avail);
      base.useW = pct + '%'; base.useColor = pct >= 90 ? 'var(--neg)' : pct >= 70 ? 'var(--warn)' : 'var(--accent)';
      base.useLabel = 'Using ' + pct + '% of ' + money(c.limit || 0) + ' limit';
      base.stmt = c.statementDay ? c.statementDay + ord(c.statementDay) + ' of month' : '—';
      base.due = out <= 0 ? 'Paid' : c.dueDate ? dayLabel(c.dueDate + 'T00:00') + (dd != null && dd >= 0 ? ' · in ' + dd + (dd === 1 ? ' day' : ' days') : '') : '—';
      base.dueColor = out <= 0 ? 'var(--pos)' : dd != null && dd <= 7 ? 'var(--warn)' : 'var(--text)';
    } else {
      const la = S.accounts.find(a => a.id === c.linkedAccountId);
      base.linked = la ? la.nickname + ' · ' + instName(S, la.instId) : 'Not linked';
      base.linkedBal = la ? money(accountBalance(la, S, month)) : '—';
    }
    return base;
  });

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px 56px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'hsFade .25s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, flex: 1 }}>Your wallet of owned cards. Card purchases add to the card's outstanding amount; paying the bill is a transfer, never a second expense. Only last-4 digits are stored.</p>
          <button onClick={() => openers.addCard(openDrawer)} className="hv-accent" style={{ height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>＋ Add card</button>
        </div>

        {tiles.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 16 }}>
            {tiles.map(c => (
              <section key={c.id} aria-label={c.aria} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ position: 'relative', height: 148, padding: '16px 18px', background: c.bg, color: '#F2F7F4', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div aria-hidden="true" style={{ position: 'absolute', right: -38, top: -46, width: 150, height: 150, borderRadius: 999, border: '22px solid rgba(255,255,255,.07)' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.06em', opacity: .85 }}>{c.instUpper}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'rgba(255,255,255,.14)' }}>{c.typeTier}</span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, marginTop: 8 }}>{c.nick}</div>
                  <div style={{ flex: 1 }} />
                  <div style={{ display: 'flex', alignItems: 'baseline' }}>
                    <span className="tnum" style={{ fontSize: 15, letterSpacing: '.14em' }}>•••• {c.last4}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.04em', opacity: .9 }}>{c.network}</span>
                  </div>
                </div>
                <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                  {c.isCredit ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                        <div><div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Outstanding</div><div className="tnum" style={{ fontSize: 18, fontWeight: 700 }}>{c.outstanding}</div></div>
                        <span style={{ flex: 1 }} />
                        <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Available credit</div><div className="tnum" style={{ fontSize: 14, fontWeight: 600, color: 'var(--pos)' }}>{c.available}</div></div>
                      </div>
                      <div>
                        <div style={{ height: 7, background: 'var(--track)', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: c.useW, height: '100%', background: c.useColor }} /></div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{c.useLabel}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--muted)' }}>
                        <span>Statement: <span style={{ color: 'var(--text)', fontWeight: 500 }}>{c.stmt}</span></span>
                        <span>Due: <span style={{ color: c.dueColor, fontWeight: 600 }}>{c.due}</span></span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
                        <button onClick={() => openers.payCard(S, c.id, openDrawer)} className="hv-accent" style={{ height: 32, padding: '0 14px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Record payment</button>
                        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Transfer — never a second expense</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Linked account</div>
                          <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.linked}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Account balance</div>
                          <div className="tnum" style={{ fontSize: 14, fontWeight: 600 }}>{c.linkedBal}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Spending on this card is recorded against the linked account.</div>
                    </>
                  )}
                  <div style={{ flex: 1 }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: c.stBg, color: c.stFg }}>{c.status}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{c.feeNote}</span>
                  </div>
                </div>
              </section>
            ))}
          </div>
        ) : (
          <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '48px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>No cards in your wallet</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6, maxWidth: '48ch', marginLeft: 'auto', marginRight: 'auto' }}>Add debit cards to link them to accounts, and credit cards to track outstanding amounts, available credit, and due dates.</div>
            <button onClick={() => openers.addCard(openDrawer)} className="hv-accent" style={{ marginTop: 14, height: 36, padding: '0 18px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>＋ Add a card</button>
          </section>
        )}
      </div>
    </div>
  );
}
