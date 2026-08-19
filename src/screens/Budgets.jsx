// Budgets screen — design iteration 002 (template 574-665, budgetsVals 1793-1860).
// Overall-budget hero, per-category rows sorted by % used, unbudgeted callout,
// empty state. The screen is the single owner of budget amounts.
import { useState } from 'react';
import { useStore } from '../store/StoreProvider.jsx';
import { useMonth } from '../store/MonthContext.jsx';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useMoney } from '../lib/format.js';
import { budgetProjection, budgetRollover, budgetSpent, budgetState, catById, monthLabel, prevMonth, recoverableSpending, unbudgetedSpend } from '../lib/calc.js';
import { nowIso } from '../lib/dates.js';
import { toggleBudgetRollover, deleteBudget } from '../store/actions.js';
import RowMenu from '../ui/RowMenu.jsx';
import { openers } from '../drawers/openers.js';

const TONES = {
  pos: ['var(--pos-soft)', 'var(--pos)', 'var(--accent)'],
  warn: ['var(--warn-soft)', 'var(--warn)', 'var(--warn)'],
  neg: ['var(--neg-soft)', 'var(--neg)', 'var(--neg)'],
  muted: ['var(--elev)', 'var(--muted)', 'var(--border)'],
};
const colHeader = { fontSize: 11, fontWeight: 600, letterSpacing: '.05em', color: 'var(--muted)' };
const gridCols = { display: 'grid', gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1.5fr) minmax(0,1fr) minmax(0,1.05fr) minmax(0,1.05fr) 40px', gap: 10 };

export default function Budgets() {
  const { data: S, applyData, prefs, setPrefs } = useStore();
  const { month } = useMonth();
  const { money } = useMoney();
  const { openDrawer } = useDrawer();
  const { ask, notify } = useUI();
  const [menuOpen, setMenuOpen] = useState(null);

  const now = nowIso();
  const prev = prevMonth(month);
  const prevName = monthLabel(prev).split(' ')[0];
  // View-only preference: gross "cash outflow" view folds excluded (recoverable)
  // categories back into every figure on this screen. Never touches stored data.
  const inc = !!prefs.includeRecoverable;
  const view = inc ? { includeExcluded: true } : undefined;
  const rec = recoverableSpending(S, month, now);

  const deltaOf = (spent, prevSpent) => {
    if (prevSpent <= 0 && spent <= 0) return { label: 'No spending either month', color: 'var(--muted)' };
    if (prevSpent <= 0) return { label: 'Nothing spent in ' + prevName, color: 'var(--muted)' };
    const d = spent - prevSpent;
    if (d === 0) return { label: 'Same as ' + prevName, color: 'var(--muted)' };
    return { label: money(Math.abs(d)) + (d > 0 ? ' more' : ' less'), color: d > 0 ? 'var(--neg)' : 'var(--pos)' };
  };

  const askRemove = async b => {
    const cat = b.category ? catById(S, b.category) : null;
    const name = cat ? '“' + cat.name + '”' : 'the overall monthly budget';
    const ok = await ask({
      title: 'Remove this budget?',
      body: 'The budget on ' + name + ' is removed. No transaction, amount, or category is touched — that spending simply stops being measured against a limit.',
      action: 'Remove budget',
    });
    if (!ok) return;
    applyData(data => deleteBudget(data, { id: b.id }));
    notify('Budget removed.');
  };

  const toggleRoll = b => {
    const cat = b.category ? catById(S, b.category) : null;
    const name = cat ? cat.name : 'Overall budget';
    applyData(data => toggleBudgetRollover(data, { id: b.id }));
    notify(!b.rollover ? '“' + name + '” now carries unspent amounts forward.' : '“' + name + '” no longer carries unspent amounts forward.');
  };

  // ---- overall hero ----
  const overall = S.budgets.find(b => !b.category) || null;
  let ov = null;
  if (overall) {
    const roll = budgetRollover(S, overall, month, view);
    const eff = overall.amount + roll;
    const spent = budgetSpent(S, overall, month, view, now);
    const pct = eff > 0 ? (spent / eff) * 100 : 0;
    const stx = budgetState(pct, spent);
    const tone = TONES[stx.tone];
    const rem = eff - spent;
    const proj = budgetProjection(month, spent, now);
    const d = deltaOf(spent, budgetSpent(S, overall, prev, view, now));
    ov = {
      spent: money(spent), budget: money(eff),
      stateLabel: stx.label, stateBg: tone[0], stateFg: tone[1], barColor: tone[2],
      w: Math.min(Math.round(pct), 100) + '%', pctLabel: Math.round(pct) + '%',
      remaining: rem >= 0 ? money(rem) : money(-rem) + ' over',
      remColor: rem >= 0 ? 'var(--text)' : 'var(--neg)',
      projValue: proj ? money(proj.projected) : (String(now).slice(0, 7) === month ? 'Too early' : '—'),
      projColor: proj ? (proj.projected > eff ? 'var(--warn)' : 'var(--text)') : 'var(--muted)',
      deltaValue: d.label, deltaColor: d.color,
      note: roll > 0 ? 'Includes ' + money(roll) + ' rolled over from ' + prevName + ' — the part of that month’s budget you did not spend.' : '',
      recNote: inc && rec.net > 0 ? 'Includes ' + money(rec.net) + ' of recoverable spending.' : '',
    };
  }

  // ---- category rows ----
  const rows = S.budgets.filter(b => b.category).map(b => {
    const cat = catById(S, b.category);
    const roll = budgetRollover(S, b, month, view);
    const eff = b.amount + roll;
    const spent = budgetSpent(S, b, month, view, now);
    const pct = eff > 0 ? (spent / eff) * 100 : 0;
    const stx = budgetState(pct, spent);
    const tone = TONES[stx.tone];
    const rem = eff - spent;
    const proj = budgetProjection(month, spent, now);
    const overPace = !!(proj && proj.projected > eff && rem >= 0);
    const d = deltaOf(spent, budgetSpent(S, b, prev, view, now));
    return {
      raw: b, id: b.id, pct, name: cat ? cat.name : 'Unknown category',
      icon: cat ? cat.icon : 'square', color: cat && cat.color ? cat.color : 'var(--muted)',
      hasRoll: !!b.rollover, rollLabel: roll > 0 ? '+' + money(roll) + ' rolled over' : 'Rollover on, nothing left over',
      rollAction: b.rollover ? 'Turn off rollover' : 'Turn on rollover',
      w: Math.min(Math.round(pct), 100) + '%', barColor: tone[2],
      stateLabel: stx.label, stateFg: tone[1], pctLabel: Math.round(pct) + '% used',
      budget: money(eff), spent: money(spent),
      remaining: rem >= 0 ? money(rem) : money(-rem) + ' over',
      remColor: rem >= 0 ? 'var(--text)' : 'var(--neg)',
      deltaLabel: d.label, deltaColor: d.color,
      hasPace: overPace, paceLabel: overPace ? 'On pace for ' + money(proj.projected) : '',
    };
  }).sort((a, b) => b.pct - a.pct);

  const un = unbudgetedSpend(S, month, now);
  const budgetsEmpty = !overall && rows.length === 0 && un.length === 0;

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px 56px' }} onClick={() => setMenuOpen(null)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'hsFade .25s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, flex: 1 }}>
            A budget is one monthly amount that applies to every month. Spending counts cleared transactions only — uncleared ones are included once they clear.
          </p>
          <button
            onClick={() => setPrefs({ includeRecoverable: !inc })}
            role="switch"
            aria-checked={String(inc)}
            title="Includes advances and other expenses marked as excluded from budgets."
            className="hv-elev"
            style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', flex: 'none' }}
          >
            <span aria-hidden="true" style={{ width: 34, height: 20, padding: 2, boxSizing: 'border-box', borderRadius: 999, background: inc ? 'var(--accent)' : 'var(--track)', border: `1px solid ${inc ? 'var(--accent)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: inc ? 'flex-end' : 'flex-start', flex: 'none' }}>
              <span style={{ display: 'block', width: 14, height: 14, borderRadius: 999, background: inc ? 'var(--on-accent)' : 'var(--surface)' }} />
            </span>
            Include recoverable spending
          </button>
          <button onClick={() => openers.addBudget(openDrawer)} className="hv-accent" style={{ height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>＋ Add budget</button>
        </div>

        {ov && (
          <section aria-label="Overall monthly budget" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.05em', color: 'var(--muted)' }}>{inc ? 'OVERALL CASH OUTFLOW' : 'OVERALL MONTHLY BUDGET'}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 7, flexWrap: 'wrap' }}>
                  <span className="tnum" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em' }}>{ov.spent}</span>
                  <span className="tnum" style={{ fontSize: 13.5, color: 'var(--muted)' }}>of {ov.budget}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: ov.stateBg, color: ov.stateFg }}>{ov.stateLabel}</span>
                </div>
              </div>
              <button onClick={() => openers.editOverallBudget(S, openDrawer)} className="hv-elev" style={{ height: 32, padding: '0 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', flex: 'none' }}>Edit</button>
            </div>
            <div style={{ height: 10, background: 'var(--track)', borderRadius: 5, overflow: 'hidden', marginTop: 14 }}>
              <div style={{ width: ov.w, height: '100%', background: ov.barColor }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 14, marginTop: 16 }}>
              <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Remaining</div><div className="tnum" style={{ fontSize: 16, fontWeight: 600, marginTop: 2, color: ov.remColor }}>{ov.remaining}</div></div>
              <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Used</div><div className="tnum" style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{ov.pctLabel}</div></div>
              <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Projected by month end</div><div className="tnum" style={{ fontSize: 16, fontWeight: 600, marginTop: 2, color: ov.projColor }}>{ov.projValue}</div></div>
              <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>vs {prevName}</div><div className="tnum" style={{ fontSize: 16, fontWeight: 600, marginTop: 2, color: ov.deltaColor }}>{ov.deltaValue}</div></div>
            </div>
            {ov.note && <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: 'var(--soft)', fontSize: 12.5, lineHeight: 1.5 }}>{ov.note}</div>}
            {ov.recNote && <div style={{ marginTop: ov.note ? 8 : 14, padding: '10px 14px', borderRadius: 10, background: 'var(--soft)', fontSize: 12.5, lineHeight: 1.5 }}>{ov.recNote}</div>}
          </section>
        )}

        {!ov && !budgetsEmpty && (
          <section aria-label="Overall monthly budget" style={{ background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 12, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>No overall monthly budget</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>One ceiling for everything you spend in a month, card purchases included. Category budgets sit inside it.</div>
            </div>
            <button onClick={() => openers.editOverallBudget(S, openDrawer)} className="hv-soft" style={{ height: 34, padding: '0 15px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>Set overall budget</button>
          </section>
        )}

        {rows.length > 0 && (
          <section aria-label="Category budgets" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <div style={{ ...gridCols, padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
              <span style={colHeader}>CATEGORY</span><span style={colHeader}>PROGRESS</span>
              <span style={{ ...colHeader, textAlign: 'right' }}>BUDGET</span>
              <span style={{ ...colHeader, textAlign: 'right' }}>SPENT</span>
              <span style={{ ...colHeader, textAlign: 'right' }}>REMAINING</span><span />
            </div>
            {rows.map(b => (
              <div key={b.id} className="hv-elev" style={{ ...gridCols, alignItems: 'center', padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</span>
                    {b.hasRoll && <span style={{ display: 'block', fontSize: 10.5, color: 'var(--muted)' }}>{b.rollLabel}</span>}
                  </span>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ height: 7, background: 'var(--track)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: b.w, height: '100%', background: b.barColor }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: b.stateFg }}>{b.stateLabel}</span>
                    <span className="tnum" style={{ fontSize: 11, color: 'var(--muted)' }}>{b.pctLabel}</span>
                  </div>
                </div>
                <div className="tnum" style={{ fontSize: 13, fontWeight: 500, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.budget}</div>
                <div style={{ textAlign: 'right', minWidth: 0 }}>
                  <div className="tnum" style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.spent}</div>
                  <div className="tnum" style={{ fontSize: 10.5, color: b.deltaColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.deltaLabel}</div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 0 }}>
                  <div className="tnum" style={{ fontSize: 13, fontWeight: 600, color: b.remColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.remaining}</div>
                  {b.hasPace && <div style={{ fontSize: 10.5, color: 'var(--warn)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.paceLabel}</div>}
                </div>
                <RowMenu
                  open={menuOpen === b.id}
                  onToggle={() => setMenuOpen(m => (m === b.id ? null : b.id))}
                  onClose={() => setMenuOpen(null)}
                  label={'Actions for ' + b.name + ' budget'}
                  items={[
                    { label: 'Edit budget', onClick: () => openers.editBudget(S, b.id, openDrawer) },
                    { label: b.rollAction, onClick: () => toggleRoll(b.raw) },
                    { divider: true },
                    { label: 'Remove budget', tone: 'neg', onClick: () => askRemove(b.raw) },
                  ]}
                />
              </div>
            ))}
          </section>
        )}

        {inc && rec.rows.length > 0 && (
          <section aria-label="Recoverable spending" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <div style={{ padding: '14px 16px 10px' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Recoverable spending</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>
                Advances and other excluded categories — money that left your accounts but is expected back. Not measured against any budget.
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: 10, padding: '9px 16px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
              <span style={colHeader}>CATEGORY</span>
              <span style={{ ...colHeader, textAlign: 'right' }}>PAID</span>
              <span style={{ ...colHeader, textAlign: 'right' }}>RETURNED</span>
              <span style={{ ...colHeader, textAlign: 'right' }}>OUTSTANDING</span>
            </div>
            {rec.rows.map(r => (
              <div key={r.id} className="hv-elev" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: 10, alignItems: 'center', padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                </div>
                <div className="tnum" style={{ fontSize: 13, fontWeight: 500, textAlign: 'right' }}>{money(r.paid)}</div>
                <div className="tnum" style={{ fontSize: 13, fontWeight: 500, textAlign: 'right' }}>{money(r.returned)}</div>
                <div className="tnum" style={{ fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{money(r.outstanding)}</div>
              </div>
            ))}
          </section>
        )}

        {un.length > 0 && (
          <section aria-label="Spending without a budget" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Spending without a budget</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>
              {un.length === 1 ? 'One category has spending this month with no budget attached.' : un.length + ' categories have spending this month with no budget attached.'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {un.slice(0, 8).map(u => (
                <button key={u.id} onClick={() => openers.budgetForCat(u.id, openDrawer)} className="hv-soft" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 999, background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5, cursor: 'pointer' }}>
                  <span style={{ fontWeight: 600 }}>{u.name}</span>
                  <span className="tnum" style={{ color: 'var(--muted)' }}>{money(u.amt)}</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Set budget</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {budgetsEmpty && (
          <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '48px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>No budgets yet</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6, maxWidth: '48ch', marginLeft: 'auto', marginRight: 'auto' }}>
              Set a monthly amount for a category and every expense in it counts against that amount, on this screen and on your dashboard.
            </div>
            <button onClick={() => openers.addBudget(openDrawer)} className="hv-accent" style={{ marginTop: 14, height: 36, padding: '0 18px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>＋ Add your first budget</button>
          </section>
        )}
      </div>
    </div>
  );
}
