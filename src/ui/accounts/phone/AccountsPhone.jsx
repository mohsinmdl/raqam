// Phone Accounts screen (YNAB anatomy, ledger tokens): kind groups with
// totals, collapsible; archived behind one row; Add account at the bottom.
// Spec: docs/superpowers/specs/2026-08-15-mobile-accounts-ynab-design.md §1
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../../store/StoreProvider.jsx';
import { useMonth } from '../../../store/MonthContext.jsx';
import { useDrawer } from '../../DrawerProvider.jsx';
import { useMoney } from '../../../lib/format.js';
import { accountBalance } from '../../../lib/calc.js';
import { nowIso } from '../../../lib/dates.js';
import { freshInfo } from '../../../lib/txRow.js';
import { openers } from '../../../drawers/openers.js';
import { accountGroupsFor, archivedRowsFor } from './accountsPhone.js';
import ArchivedSheet from './ArchivedSheet.jsx';

const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' };

export default function AccountsPhone() {
  const { data: S } = useStore();
  const { balanceMonth } = useMonth();
  const { money } = useMoney();
  const { openDrawer } = useDrawer();
  const nav = useNavigate();
  // Pinned once per mount, not recomputed each render: nowIso() returns a
  // fresh string every call, and it sits in the useMemo deps below — a
  // render-time call there defeats the memo on every single render.
  const [now] = useState(nowIso);
  const [collapsed, setCollapsed] = useState(() => new Set()); // phone-local, not persisted
  const [archOpen, setArchOpen] = useState(false);

  const groups = useMemo(() => accountGroupsFor(S, a => accountBalance(a, S, balanceMonth, now)), [S, balanceMonth, now]);
  const archived = useMemo(() => archivedRowsFor(S), [S]);
  const toggle = label => setCollapsed(c => { const n = new Set(c); n.has(label) ? n.delete(label) : n.add(label); return n; });
  const balColor = raw => (raw < 0 ? 'var(--neg)' : 'var(--text)');

  return (
    <div style={{ padding: '16px 16px calc(var(--phone-nav-clearance) + 16px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {groups.map(g => {
        const closed = collapsed.has(g.label);
        return (
          <section key={g.label} aria-label={g.label + ' accounts'}>
            <button onClick={() => toggle(g.label)} aria-expanded={!closed} className="hv-soft"
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 36, padding: '0 4px 6px',
                border: 'none', background: 'none', color: 'var(--text)', font: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
              <span aria-hidden="true" style={{ color: 'var(--muted)', fontSize: 12, transform: closed ? 'rotate(-90deg)' : 'none' }}>▾</span>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>{g.label}</span>
              <span className="tnum" style={{ fontSize: 14, fontWeight: 600, color: balColor(g.total) }}>{money(g.total)}</span>
            </button>
            {!closed && (
              <div style={cardStyle}>
                {g.rows.map((r, i) => {
                  const f = freshInfo(r.acct, S);
                  return (
                    <button key={r.acct.id} onClick={() => nav(`/transactions/${r.acct.id}`)} className="hv-elev"
                      aria-label={r.acct.nickname + ', balance ' + money(r.raw)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 52, padding: '8px 14px',
                        border: 'none', borderBottom: i === g.rows.length - 1 ? 'none' : '1px solid var(--border)',
                        background: 'none', color: 'var(--text)', font: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
                      <span title={f.tip} style={{ width: 8, height: 8, borderRadius: 999, background: f.dot, flex: 'none' }} />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.acct.nickname}</span>
                        {r.inst && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{r.inst.name}</span>}
                      </span>
                      <span className="tnum" style={{ flex: 'none', fontSize: 14.5, fontWeight: 600, color: balColor(r.raw) }}>{money(r.raw)}</span>
                      <span aria-hidden="true" style={{ color: 'var(--muted)', fontSize: 14, flex: 'none' }}>›</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {groups.length === 0 && (
        <section style={{ ...cardStyle, padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>No accounts yet</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>Add each Pakistani bank account you use — institution, a nickname, and today's balance. Everything else builds on this.</div>
        </section>
      )}

      {archived.length > 0 && (
        <button onClick={() => setArchOpen(true)} className="hv-elev rq-btn-outline"
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 48, padding: '0 14px',
            ...cardStyle, color: 'var(--text)', font: 'inherit', fontSize: 14, cursor: 'pointer', textAlign: 'left' }}>
          <span style={{ flex: 1 }}>{archived.length} archived account{archived.length === 1 ? '' : 's'}</span>
          <span aria-hidden="true" style={{ color: 'var(--muted)' }}>›</span>
        </button>
      )}

      <button onClick={() => openers.addAccount(openDrawer)} className="hv-elev rq-btn-outline"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 48,
          ...cardStyle, color: 'var(--accent)', font: 'inherit', fontSize: 14.5, fontWeight: 600, cursor: 'pointer' }}>
        ＋ Add account
      </button>

      <ArchivedSheet open={archOpen} onClose={() => setArchOpen(false)} rows={archived} />
    </div>
  );
}
