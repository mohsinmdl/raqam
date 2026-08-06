// Recurring screen — design iteration 003 (template 574-635).
// One list grouped by what each rule needs from you: Overdue, Due soon, Later,
// Paused, Ended. Nothing on this screen advances a rule on its own.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.jsx';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useMoney } from '../lib/format.js';
import { catById } from '../lib/calc.js';
import { nowIso } from '../lib/dates.js';
import { iconStyle } from '../lib/catIcon.js';
import { advanceDue, freqLabel, longDate, ruleDueLabel, ruleStatus, sourceLabel } from '../lib/schedule.js';
import { skipOccurrence, toggleRulePause, deleteRule } from '../store/actions.js';
import RowMenu from '../ui/RowMenu.jsx';
import { RepeatIcon } from '../ui/icons.jsx';
import { openers } from '../drawers/openers.js';

const GROUPS = [
  { key: 'overdue', label: 'Overdue', dot: 'var(--neg)', note: 'Waiting on you — record or skip each one' },
  { key: 'due', label: 'Due soon', dot: 'var(--warn)', note: 'Within the next seven days' },
  { key: 'later', label: 'Later', dot: 'var(--accent)', note: '' },
  { key: 'paused', label: 'Paused', dot: 'var(--muted)', note: 'No reminders while paused' },
  { key: 'ended', label: 'Ended', dot: 'var(--muted)', note: 'These have reached the end you set' },
];
const colHeader = { fontSize: 11, fontWeight: 600, letterSpacing: '.05em', color: 'var(--muted)' };
// The header row and each data row are separate grid containers, so every track
// has to resolve identically in both. An `auto` action column would collapse to
// zero in the header (its cell is empty) and to ~115px in a row, shifting every
// fr column — hence a fixed width, matching the other list screens.
const gridCols = { display: 'grid', gridTemplateColumns: 'minmax(0,1.8fr) minmax(0,1.05fr) minmax(0,1fr) minmax(0,0.9fr) 120px 40px', gap: 10 };
// Note: no overflow:hidden on the group sections — it would clip the per-row ⋯
// menu, which RowMenu positions absolutely inside the row.
const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 };
const btn = { height: 26, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', flex: 'none' };

export default function Recurring() {
  const { data: S, applyData } = useStore();
  const { money } = useMoney();
  const { openDrawer } = useDrawer();
  const { ask, notify } = useUI();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(null);

  const now = nowIso();
  const rows = S.recurring.map(r => ({ r, status: ruleStatus(r, now) }));
  const groups = GROUPS
    .map(g => ({ ...g, rows: rows.filter(x => x.status === g.key).sort((a, b) => String(a.r.nextDate).localeCompare(String(b.r.nextDate))) }))
    .filter(g => g.rows.length > 0);
  const overdue = rows.filter(x => x.status === 'overdue');

  const askSkip = async r => {
    const after = advanceDue(r.schedule, r.nextDate);
    const ok = await ask({
      title: 'Skip this one?',
      body: 'Nothing is recorded for ' + longDate(r.nextDate, now) + '. “' + r.name + '” moves on to ' + longDate(after, now) + '.',
      action: 'Skip this one',
      tone: 'accent',
    });
    if (!ok) return;
    applyData(data => skipOccurrence(data, { id: r.id, due: r.nextDate }));
    notify('Skipped — nothing recorded. Next due ' + longDate(after, now) + '.');
  };

  const askDelete = async r => {
    const n = (r.occurrences || []).filter(o => o.outcome === 'recorded').length;
    const ok = await ask({
      title: 'Delete this rule?',
      body: '“' + r.name + '” stops reminding you. ' + (n > 0
        ? 'The ' + n + ' transaction' + (n === 1 ? '' : 's') + ' it already created stay exactly as they are.'
        : 'It has not created any transactions.'),
      action: 'Delete rule',
    });
    if (!ok) return;
    applyData(data => deleteRule(data, { id: r.id }));
    notify('Rule deleted.');
  };

  const togglePause = r => {
    applyData(data => toggleRulePause(data, { id: r.id }));
    notify(r.status === 'paused' ? '“' + r.name + '” resumed.' : '“' + r.name + '” paused — no more reminders until you resume it.');
  };

  const Row = ({ r, status }) => {
    const cat = catById(S, r.category);
    const actionable = status === 'overdue' || status === 'due' || status === 'later';
    const dueColor = status === 'overdue' ? 'var(--neg)' : status === 'due' ? 'var(--warn)' : 'var(--muted)';
    return (
      <div
        role="button" tabIndex={0}
        onClick={() => navigate('/recurring/' + r.id)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/recurring/' + r.id); } }}
        className="hv-elev"
        style={{ ...gridCols, alignItems: 'center', padding: '11px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ flex: 'none', width: 22, height: 22, ...iconStyle(cat?.icon, cat?.color) }} />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13.5, fontWeight: 500, minWidth: 0 }}>
              <RepeatIcon size={11} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
            </span>
            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{freqLabel(r.schedule)}</span>
          </span>
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sourceLabel(S, r)}</span>
        <span>
          <span style={{ display: 'block', fontSize: 12.5, color: dueColor, fontWeight: status === 'overdue' ? 600 : 400 }}>
            {status === 'paused' ? 'Paused' : status === 'ended' ? 'Ended' : ruleDueLabel(r, now)}
          </span>
          <span className="tnum" style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{longDate(r.nextDate, now)}</span>
        </span>
        <span style={{ textAlign: 'right' }}>
          <span className="tnum" style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: r.type === 'income' ? 'var(--pos)' : 'var(--text)' }}>
            {(r.estimated ? '~' : '') + money(r.amount)}
          </span>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>{(r.type === 'income' ? 'in' : 'out') + (r.estimated ? ' · varies' : '')}</span>
        </span>
        <span onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          {actionable && (
            <>
              <button onClick={() => openers.recordRule(S, r.id, openDrawer)} className="hv-soft" style={{ ...btn, color: 'var(--accent)' }}>Record</button>
              <button onClick={() => askSkip(r)} className="hv-soft" style={{ ...btn, color: 'var(--muted)' }}>Skip</button>
            </>
          )}
          {status === 'paused' && (
            <button onClick={() => togglePause(r)} className="hv-soft" style={{ ...btn, color: 'var(--accent)' }}>Resume</button>
          )}
        </span>
        <span onClick={e => e.stopPropagation()} style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <RowMenu
            open={menuOpen === r.id}
            onToggle={() => setMenuOpen(menuOpen === r.id ? null : r.id)}
            onClose={() => setMenuOpen(null)}
            label={'Actions for ' + r.name}
            items={[
              { label: 'View history', onClick: () => navigate('/recurring/' + r.id) },
              { label: 'Edit rule', onClick: () => openers.editRule(S, r.id, openDrawer) },
              ...(actionable ? [{ label: 'Record now', onClick: () => openers.recordRule(S, r.id, openDrawer) }, { label: 'Skip this one', onClick: () => askSkip(r) }] : []),
              ...(status !== 'ended' ? [{ label: r.status === 'paused' ? 'Resume rule' : 'Pause rule', onClick: () => togglePause(r) }] : []),
              { label: 'Delete rule', onClick: () => askDelete(r), tone: 'neg', divider: true },
            ]}
          />
        </span>
      </div>
    );
  };

  return (
    <div onClick={() => setMenuOpen(null)} style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px 56px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'hsFade .25s ease' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <p style={{ flex: 1, fontSize: 12.5, color: 'var(--muted)', margin: 0, maxWidth: 640 }}>
            Reminders for the things that repeat. Nothing is recorded until you confirm it — a missed occurrence waits here until you record or skip it.
          </p>
          {/* marginLeft:auto, not flex:1 on the paragraph — the intro is capped
              at 640px, so it can't grow to push the button to the edge itself. */}
          <button onClick={() => openers.addRule(openDrawer)} className="hv-accent" style={{ ...btn, marginLeft: 'auto', height: 34, padding: '0 14px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', fontSize: 13 }}>＋ Add rule</button>
        </div>

        {overdue.length > 0 && (
          <div role="status" style={{ ...card, borderLeft: '4px solid var(--neg)', padding: '12px 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--neg)' }}>
              {overdue.length === 1 ? '1 occurrence is overdue' : overdue.length + ' occurrences are overdue'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
              {overdue.map(x => x.r.name + ' (' + longDate(x.r.nextDate, now) + ')').join(' · ')}
              {' — nothing advances on its own, so each one waits until you record or skip it.'}
            </div>
          </div>
        )}

        {groups.map(g => (
          <section key={g.key} aria-label={g.label} style={{ ...card, ...(g.key === 'ended' ? { border: '1px dashed var(--border)' } : null) }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '12px 14px 8px' }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: g.dot, flex: 'none' }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{g.label}</span>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{g.rows.length === 1 ? '1 rule' : g.rows.length + ' rules'}</span>
              {g.note && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>· {g.note}</span>}
            </div>
            <div style={{ ...gridCols, padding: '0 14px 6px', ...colHeader }}>
              <span>RULE</span><span>FROM</span><span>NEXT DUE</span><span style={{ textAlign: 'right' }}>AMOUNT</span><span /><span />
            </div>
            {g.rows.map(x => <Row key={x.r.id} {...x} />)}
          </section>
        ))}

        {S.recurring.length === 0 && (
          <section style={{ ...card, padding: '48px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>No recurring rules yet</div>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', maxWidth: 420, margin: '6px auto 14px' }}>
              Rent, salary, a subscription — anything that comes back on a schedule. You can also turn any transaction into a rule with its Repeat field.
            </p>
            <button onClick={() => openers.addRule(openDrawer)} className="hv-accent" style={{ ...btn, height: 34, padding: '0 14px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', fontSize: 13 }}>＋ Add your first rule</button>
          </section>
        )}

        {S.recurring.length > 0 && (
          <Link to="/transactions" style={{ fontSize: 11.5, color: 'var(--muted)' }}>Recorded occurrences appear in Transactions like any other entry.</Link>
        )}
      </div>
    </div>
  );
}
