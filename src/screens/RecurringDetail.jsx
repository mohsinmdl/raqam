// Rule detail — design iteration 003 (template 636-720).
// What this rule is, what it will do next, and everything it has already done.
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.jsx';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useMoney } from '../lib/format.js';
import { catById, shortDate } from '../lib/calc.js';
import { nowIso } from '../lib/dates.js';
import { iconStyle } from '../lib/catIcon.js';
import {
  advanceDue, estimatedSuggestion, freqLabel, longDate, nextOccurrences, ruleDueLabel, ruleStatus,
} from '../lib/schedule.js';
import { skipOccurrence, toggleRulePause, deleteRule } from '../store/actions.js';
import { openers } from '../drawers/openers.js';
import { RepeatIcon } from '../ui/icons.jsx';
import { sourceLabel } from './Recurring.jsx';

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 };
const colHeader = { fontSize: 11, fontWeight: 600, letterSpacing: '.05em', color: 'var(--muted)' };
const btn = { height: 30, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' };
const TINT = {
  overdue: ['var(--neg-soft)', 'var(--neg)'],
  due: ['var(--warn-soft)', 'var(--warn)'],
  later: ['var(--pos-soft)', 'var(--pos)'],
  paused: ['var(--elev)', 'var(--muted)'],
  ended: ['var(--elev)', 'var(--muted)'],
};
const STATUS_LABEL = { overdue: 'Overdue', due: 'Due soon', later: 'Scheduled', paused: 'Paused', ended: 'Ended' };

export default function RecurringDetail() {
  const { id } = useParams();
  const { data: S, applyData } = useStore();
  const { money } = useMoney();
  const { openDrawer } = useDrawer();
  const { ask, notify } = useUI();
  const navigate = useNavigate();

  const r = S.recurring.find(x => x.id === decodeURIComponent(id || ''));
  if (!r) {
    return (
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px 56px' }}>
        <Link to="/recurring" style={{ fontSize: 12.5, color: 'var(--accent)' }}>‹ All recurring rules</Link>
        <div style={{ ...card, padding: '48px 20px', textAlign: 'center', marginTop: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>That rule no longer exists</div>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '6px 0 0' }}>It may have been deleted. Any transactions it created are unaffected.</p>
        </div>
      </div>
    );
  }

  const now = nowIso();
  const status = ruleStatus(r, now);
  const [tintBg, tintFg] = TINT[status];
  const cat = catById(S, r.category);
  const occ = (r.occurrences || []).slice().sort((a, b) => String(b.due).localeCompare(String(a.due)));
  const recorded = occ.filter(o => o.outcome === 'recorded').length;
  const skipped = occ.filter(o => o.outcome === 'skipped').length;
  const sug = estimatedSuggestion(r);
  const upcoming = nextOccurrences(r, 3);
  const actionable = status !== 'paused' && status !== 'ended';

  const askSkip = async () => {
    const after = advanceDue(r.schedule, r.nextDate);
    const ok = await ask({
      title: 'Skip this one?',
      body: 'Nothing is recorded for ' + longDate(r.nextDate, now) + '. “' + r.name + '” moves on to ' + longDate(after, now) + '.',
      action: 'Skip this one', tone: 'accent',
    });
    if (!ok) return;
    applyData(data => skipOccurrence(data, { id: r.id, due: r.nextDate }));
    notify('Skipped — nothing recorded. Next due ' + longDate(after, now) + '.');
  };

  const askDelete = async () => {
    const ok = await ask({
      title: 'Delete this rule?',
      body: '“' + r.name + '” stops reminding you. ' + (recorded > 0
        ? 'The ' + recorded + ' transaction' + (recorded === 1 ? '' : 's') + ' it already created stay exactly as they are.'
        : 'It has not created any transactions.'),
      action: 'Delete rule',
    });
    if (!ok) return;
    applyData(data => deleteRule(data, { id: r.id }));
    notify('Rule deleted.');
    navigate('/recurring');
  };

  const Stat = ({ label, value, note, color }) => (
    <div style={{ ...card, padding: '12px 14px' }}>
      <div style={colHeader}>{label}</div>
      <div className="tnum" style={{ fontSize: 17, fontWeight: 600, marginTop: 4, color: color || 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{note}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px 56px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'hsFade .25s ease' }}>
        <Link to="/recurring" style={{ fontSize: 12.5, color: 'var(--accent)', textDecoration: 'none' }}>‹ All recurring rules</Link>

        <section style={{ ...card, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ flex: 'none', width: 30, height: 30, ...iconStyle(cat?.icon, cat?.color) }} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 17, fontWeight: 600, margin: 0 }}>
                  <RepeatIcon size={14} />{r.name}
                </h2>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: tintBg, color: tintFg }}>{STATUS_LABEL[status]}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                {freqLabel(r.schedule)} · {r.type === 'income' ? 'Money in' : 'Money out'} · {cat?.name || '—'} · {sourceLabel(S, r)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {actionable && <button onClick={() => openers.recordRule(S, r.id, openDrawer)} className="hv-accent" style={{ ...btn, background: 'var(--accent)', color: 'var(--on-accent)', border: 'none' }}>Record now</button>}
              {actionable && <button onClick={askSkip} className="hv-soft" style={btn}>Skip</button>}
              {status !== 'ended' && (
                <button onClick={() => { applyData(data => toggleRulePause(data, { id: r.id })); notify(r.status === 'paused' ? 'Rule resumed.' : 'Rule paused.'); }} className="hv-soft" style={btn}>
                  {r.status === 'paused' ? 'Resume' : 'Pause'}
                </button>
              )}
              <button onClick={() => openers.editRule(S, r.id, openDrawer)} className="hv-soft" style={btn}>Edit</button>
              <button onClick={askDelete} className="hv-neg-soft" style={{ ...btn, color: 'var(--neg)' }}>Delete</button>
            </div>
          </div>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <Stat label="AMOUNT" value={(r.estimated ? '~' : '') + money(r.amount)} note={r.estimated ? 'Estimated — varies each time' : 'Fixed amount'} />
          <Stat label="NEXT DUE" value={longDate(r.nextDate, now)} color={tintFg}
            note={status === 'paused' ? 'Paused' : status === 'ended' ? 'This rule has ended' : ruleDueLabel(r, now)} />
          <Stat label="RECORDED" value={String(recorded)} note={skipped > 0 ? skipped + ' skipped' : 'None skipped'} />
          <Stat label="WHEN RECORDING" value={money(sug.amount)}
            note={sug.basis === 'average' ? 'Average of the last ' + sug.n + ' actuals' : 'The rule amount'} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.6fr)', gap: 12, alignItems: 'start' }}>
          <section style={{ ...card, padding: '14px 16px' }}>
            <div style={colHeader}>NEXT THREE</div>
            {upcoming.length > 0 ? (
              <div style={{ marginTop: 8 }}>
                {upcoming.map((dt, i) => (
                  <div key={dt} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderBottom: i < upcoming.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: i === 0 ? tintFg : 'var(--border)', flex: 'none' }} />
                    <span style={{ flex: 1, fontSize: 13 }}>{longDate(dt, now)}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{i === 0 ? ruleDueLabel({ nextDate: dt }, now) : freqLabel(r.schedule).split(' · ')[0]}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '8px 0 0' }}>No further occurrences — this rule has reached the end you set.</p>
            )}
            {r.status === 'paused' && upcoming.length > 0 && (
              <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '8px 0 0' }}>This rule is paused — these are the dates it would resume to.</p>
            )}
          </section>

          <section style={{ ...card, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '14px 16px 8px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>History</span>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{occ.length === 1 ? '1 occurrence' : occ.length + ' occurrences'}</span>
            </div>
            {occ.length > 0 ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 92px minmax(0,1fr) auto', gap: 10, padding: '0 16px 6px', ...colHeader }}>
                  <span>DUE</span><span>OUTCOME</span><span style={{ textAlign: 'right' }}>AMOUNT</span><span />
                </div>
                {occ.map(o => {
                  const tx = o.txId ? S.transactions.find(t => t.id === o.txId) : null;
                  return (
                    <div key={o.due + o.outcome} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 92px minmax(0,1fr) auto', gap: 10, alignItems: 'center', padding: '9px 16px', borderTop: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12.5 }}>{shortDate(o.due + 'T00:00')}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, justifySelf: 'start', background: o.outcome === 'recorded' ? 'var(--pos-soft)' : 'var(--elev)', color: o.outcome === 'recorded' ? 'var(--pos)' : 'var(--muted)' }}>
                        {o.outcome === 'recorded' ? 'Recorded' : 'Skipped'}
                      </span>
                      <span className="tnum" style={{ fontSize: 12.5, textAlign: 'right' }}>{o.amount == null ? '—' : money(o.amount)}</span>
                      <span style={{ fontSize: 11.5, textAlign: 'right' }}>
                        {tx
                          ? <Link to="/transactions" style={{ color: 'var(--accent)', textDecoration: 'none' }}>View transaction</Link>
                          : <span style={{ color: 'var(--muted)' }}>{o.outcome === 'skipped' ? 'Nothing recorded' : o.txId ? 'Transaction deleted' : 'Before history was kept'}</span>}
                      </span>
                    </div>
                  );
                })}
              </>
            ) : (
              <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0, padding: '4px 16px 16px' }}>
                Nothing recorded yet. Once you record or skip an occurrence it appears here with the transaction it became.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
