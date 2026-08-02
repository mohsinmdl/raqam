// Monthly opening snapshot review drawer — template 709-726, drawerVals snapshot
// section script 1213-1228, submitSnapshot script 1342-1358.
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { parseAmt } from '../lib/format.js';
import { fmtPKR, fmtSigned, monthLabel } from '../lib/calc.js';
import { addMonths, currentMonth } from '../lib/dates.js';
import { confirmSnapshots } from '../store/actions.js';
import { instName } from '../lib/txRow.js';
import { AmountField } from './fields.jsx';

function Body() {
  const { drawer } = useDrawer();
  const { data: S } = useStore();
  const f = drawer.form;
  const month = currentMonth();
  const prevMonth = addMonths(month, -1);
  const active = S.accounts.filter(a => a.status === 'active');

  const rows = active.map(a => {
    const field = 'snap_' + a.id;
    const val = f[field] != null ? f[field] : '';
    const prev = S.snapshots.find(x => x.accountId === a.id && x.month === prevMonth && x.status === 'confirmed');
    const entered = parseAmt(val);
    const diff = prev && isFinite(entered) ? entered - prev.amount : null;
    return {
      id: a.id, nick: a.nickname, inst: instName(S, a.instId), field,
      ariaLabel: 'Opening balance for ' + a.nickname,
      diff: diff == null ? '' : fmtSigned(diff, false) + ' vs ' + monthLabel(prevMonth).split(' ')[0],
      diffColor: diff == null ? 'var(--muted)' : diff > 0 ? 'var(--pos)' : diff < 0 ? 'var(--neg)' : 'var(--muted)',
      lastLabel: prev ? 'Last confirmed: ' + fmtPKR(prev.amount, false) + ' · 1 ' + monthLabel(prevMonth).split(' ')[0] : 'No earlier confirmed snapshot',
      err: drawer.errors[field],
    };
  });
  const total = active.reduce((s, a) => { const n = parseAmt(f['snap_' + a.id]); return s + (isFinite(n) ? n : 0); }, 0);
  const cardOut = S.cards.filter(c => c.type === 'credit').reduce((s, c) => s + ((c.openingOutstanding || {})[month] || 0), 0);
  const hasCards = S.cards.some(c => c.type === 'credit');

  return (
    <>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.55 }}>
        Confirm what each account actually held at the start of {monthLabel(month)}. This locks in your opening position — the anchor for “change this month” and your savings rate.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map(s => (
          <div key={s.id} style={{ padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--elev)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>{s.nick}</span>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{s.inst}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <div style={{ flex: 1 }}>
                <AmountField field={s.field} big={false} ariaLabel={s.ariaLabel} placeholder="" />
              </div>
              <span className="tnum" style={{ fontSize: 11.5, color: s.diffColor, fontWeight: 600, flex: 'none', width: 110, textAlign: 'right' }}>{s.diff}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>{s.lastLabel}</div>
            {s.err && <div style={{ fontSize: 12, color: 'var(--neg)', marginTop: 4 }}>{s.err}</div>}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '12px 14px', borderRadius: 10, background: 'var(--soft)' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-h)', flex: 1 }}>Combined opening position</span>
        <span className="tnum" style={{ fontSize: 16, fontWeight: 700 }}>{fmtPKR(total, false)}</span>
      </div>
      {hasCards && (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          Credit-card outstanding at month start: <span className="tnum" style={{ fontWeight: 600, color: 'var(--text)' }}>{fmtPKR(cardOut, false)}</span> — tracked separately as liability.
          Starting net worth: <span className="tnum" style={{ fontWeight: 600, color: 'var(--text)' }}>{fmtPKR(total - cardOut, false)}</span>.
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
        Confirmed snapshots become a permanent record. If you correct one later, the original stays in history and the correction is labelled.
      </div>
    </>
  );
}

function useSubmit() {
  const { drawer, closeDrawer, fail } = useDrawer();
  const { data: S, applyData } = useStore();
  const { notify } = useUI();
  return () => {
    const f = drawer.form, errs = {};
    const active = S.accounts.filter(a => a.status === 'active');
    const values = {};
    active.forEach(a => {
      const n = parseAmt(f['snap_' + a.id]);
      if (!isFinite(n)) errs['snap_' + a.id] = a.nickname + ': enter the opening balance.';
      else values[a.id] = n;
    });
    if (Object.keys(errs).length) { fail(errs, Object.values(errs)); return; }
    applyData(data => confirmSnapshots(data, { values }));
    closeDrawer();
    notify('Opening balances confirmed for ' + monthLabel(currentMonth()) + '.');
  };
}

export const snapshotFormDef = {
  title: () => 'Monthly opening · ' + monthLabel(currentMonth()),
  sub: () => 'Confirm each account’s starting balance',
  cta: () => 'Confirm opening balances',
  Body,
  useSubmit,
};
