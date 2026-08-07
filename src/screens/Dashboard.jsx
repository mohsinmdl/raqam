import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.jsx';
import { useMonth } from '../store/MonthContext.jsx';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useMoney } from '../lib/format.js';
import * as C from '../lib/calc.js';
import { nowIso, todayStr } from '../lib/dates.js';
import { txRowOf, freshInfo, instName, setupState } from '../lib/txRow.js';
import PositionStrip from '../components/PositionStrip.jsx';
import FirstUse from './FirstUse.jsx';
import { openers } from '../drawers/openers.js';
import TxChips from '../ui/TxChips.jsx';
import { overdueRules, upcomingRules } from '../lib/schedule.js';

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 };
const h2 = { fontSize: 15, fontWeight: 600, margin: 0 };
const linkBtn = { border: 'none', background: 'none', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0 };

// Port of the prototype's dashboardVals (script 934-999) — same names, same math.
function computeVals(S, month, isPast, fmt, snapDismissed, view) {
  const { money, moneyS, moneyRaw } = fmt;
  const now = nowIso();
  const M = C.monthMetrics(S, month, now);
  const activeAccts = S.accounts.filter(a => a.status === 'active');
  const v = { M, activeAccts };
  v.snapshotPending = !isPast && activeAccts.length > 0 && S.snapshots.some(s => s.month === month && s.status === 'pending') && !snapDismissed;
  v.snapBannerTitle = 'Review your opening balances for ' + C.monthLabel(month) + '.';
  const netColor = M.net > 0 ? 'var(--pos)' : M.net < 0 ? 'var(--neg)' : 'var(--text)';
  v.sumCards = [
    { label: 'Income', val: money(M.income), color: 'var(--text)', sub: C.monthLabel(month) },
    { label: 'Expenses', val: money(M.expenses), color: 'var(--text)', sub: 'incl. transfer fees' },
    { label: 'Net cash flow', val: moneyS(M.net), color: netColor, sub: 'income − expenses' },
    { label: 'Savings', val: money(M.savings), color: 'var(--text)', sub: M.net < 0 ? 'overspent this month' : 'set aside so far' },
    { label: 'Savings rate', val: M.rate == null ? '—' : C.fmtPct(M.rate), color: M.rate != null && M.rate < 0 ? 'var(--neg)' : 'var(--text)', sub: M.rate == null ? 'no income recorded' : 'of income' },
  ];
  const daily = C.dailySpending(S, month, view, now); const dmax = Math.max(...daily.map(d => d.amt), 1);
  const dtotal = daily.reduce((s, d) => s + d.amt, 0);
  const today = todayStr().slice(0, 7) === month ? +todayStr().slice(8, 10) : null;
  v.trendBars = daily.map(d => ({ h: d.amt > 0 ? Math.max(Math.round(d.amt / dmax * 100), 4) + '%' : '2%', bg: d.amt > 0 ? (today === d.day ? 'var(--accent-h)' : 'var(--accent)') : 'var(--track)', label: (d.day === 1 || d.day % 5 === 0) ? String(d.day) : '', tip: d.day + ' ' + C.monthLabel(month).slice(0, 3) + ' — ' + moneyRaw(d.amt) }));
  v.trendTotal = money(dtotal); v.trendEmpty = dtotal === 0; v.trendHas = dtotal > 0;
  const peak = daily.reduce((a, b) => (b.amt > a.amt ? b : a), daily[0]);
  v.trendSummary = 'Daily cleared spending in ' + C.monthLabel(month) + ', total ' + moneyRaw(dtotal) + (peak && peak.amt > 0 ? ', highest on day ' + peak.day : '');
  const cats = C.categorySpending(S, month, view, now); const cmaxAmt = Math.max(...cats.map(c => c.amt), 1);
  v.catBars = cats.slice(0, 6).map(c => ({ id: c.id, name: c.cat ? c.cat.name : c.id, color: c.cat ? c.cat.color : 'var(--border)', amt: money(c.amt), w: Math.max(Math.round(c.amt / cmaxAmt * 100), 3) + '%' }));
  v.hasCat = cats.length > 0; v.noCat = cats.length === 0;
  return { v, cats, daily, M };
}

export default function Dashboard() {
  const { data: S, prefs, setPrefs } = useStore();
  const { month, months, isPast } = useMonth();
  const fmt = useMoney();
  const { money, moneyS, masked } = fmt;
  const nav = useNavigate();
  const { openDrawer } = useDrawer();
  const [snapDismissed, setSnapDismissed] = useState(false);
  const now = nowIso();

  const setup = setupState(S);
  const showFirstUse = !setup.complete && !prefs.skippedSetup;

  // Chart-only lens (own pref, independent of the Budgets screen's toggle):
  // fold excluded (recoverable) categories back into the two spending charts.
  const incDash = !!prefs.includeRecoverableDash;
  const { v } = useMemo(
    () => computeVals(S, month, isPast, fmt, snapDismissed, incDash ? { includeExcluded: true } : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fmt is stable per `masked`
    [S, month, isPast, masked, snapDismissed, incDash]
  );

  const recSwitch = withLabel => (
    <button
      onClick={() => setPrefs({ includeRecoverableDash: !incDash })}
      role="switch"
      aria-checked={String(incDash)}
      aria-label="Include recoverable spending"
      title="Includes advances and other expenses marked as excluded from budgets."
      style={{ display: 'flex', alignItems: 'center', gap: 7, height: 24, padding: withLabel ? '0 4px' : 0, border: 'none', background: 'none', color: 'var(--muted)', fontSize: 11.5, fontWeight: 500, cursor: 'pointer', flex: 'none' }}
    >
      <span aria-hidden="true" style={{ width: 30, height: 18, padding: 2, boxSizing: 'border-box', borderRadius: 999, background: incDash ? 'var(--accent)' : 'var(--track)', border: `1px solid ${incDash ? 'var(--accent)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: incDash ? 'flex-end' : 'flex-start', flex: 'none' }}>
        <span style={{ display: 'block', width: 12, height: 12, borderRadius: 999, background: incDash ? 'var(--on-accent)' : 'var(--surface)' }} />
      </span>
      {withLabel ? 'Include recoverable spending' : null}
    </button>
  );

  if (showFirstUse) return <FirstUse setup={setup} onSkip={() => setPrefs({ skippedSetup: true })} />;

  const { M } = v;
  const monthName = C.monthLabel(month);
  const prevIdx = months.indexOf(month) - 1;
  const cmp = prevIdx >= 0 ? (() => {
    const prevMonth = months[prevIdx];
    const P = C.monthMetrics(S, prevMonth, now);
    const mk = (label, a, b, bColor) => { const mx = Math.max(a, b, 1); return { label, aVal: money(a), bVal: money(b), aW: Math.round(a / mx * 100) + '%', bW: Math.round(b / mx * 100) + '%', bColor }; };
    return { prevName: C.monthLabel(prevMonth).split(' ')[0], curName: monthName.split(' ')[0], rows: [mk('Income', P.income, M.income, 'var(--accent)'), mk('Expenses', P.expenses, M.expenses, 'var(--warn)')] };
  })() : null;

  const budgetRow = b => {
    // Personal-budget view always: budgetSpent excludes recoverable categories
    // and clamps at zero, matching the Budgets screen's default view.
    const spent = C.budgetSpent(S, b, month, null, now);
    const eff = C.effectiveBudget(S, b, month); // rollover-effective amount
    const pct = eff > 0 ? (spent / eff) * 100 : 0;
    const stx = C.budgetState(pct, spent);
    const tone = { pos: ['var(--pos-soft)', 'var(--pos)', 'var(--accent)'], warn: ['var(--warn-soft)', 'var(--warn)', 'var(--warn)'], neg: ['var(--neg-soft)', 'var(--neg)', 'var(--neg)'], muted: ['var(--elev)', 'var(--muted)', 'var(--border)'] }[stx.tone];
    const name = b.category ? (S.categories.find(c => c.id === b.category) || {}).name : (b.label || 'Overall');
    const left = eff - spent;
    return { id: b.id, name, stateLabel: stx.label, stateBg: tone[0], stateFg: tone[1], barColor: tone[2], w: Math.min(Math.round(pct), 100) + '%', pct, spentLabel: money(spent) + ' of ' + money(eff) + (left >= 0 ? ' · ' + money(left) + ' left' : ' · ' + money(-left) + ' over') };
  };
  const brows = S.budgets.map(budgetRow);
  const budgetRows = (brows.length ? [brows[0]] : []).concat(brows.slice(1).sort((a, b) => b.pct - a.pct).slice(0, 4));

  const nowStr = nowIso();
  const upc = isPast ? [] : upcomingRules(S, month, nowStr).slice(0, 5);
  // Missed occurrences never advance on their own, so they can sit outside the
  // upcoming window entirely — the pill is the only thing that surfaces them here.
  const overdue = isPast ? [] : overdueRules(S, nowStr);
  const upcomingRows = upc.map(r => { const d = C.daysUntil(r.nextDate, nowStr); return { id: r.id, name: r.name, when: (d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : 'In ' + d + ' days') + ' · ' + C.dayLabel(r.nextDate + 'T00:00'), whenColor: d <= 3 ? 'var(--warn)' : 'var(--muted)', amt: (r.estimated ? '~' : '') + money(r.amount) }; });

  const lg = C.largestExpenses(S, month, 5);
  const largestRows = lg.map(t => ({ id: t.id, merchant: t.merchant || '—', cat: (S.categories.find(c => c.id === t.category) || {}).name || '—', amt: money(t.amount) }));
  const recent = S.transactions.filter(t => C.inMonth(t, month)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const recentRows = recent.map(t => txRowOf(t, S, fmt));
  const acctMini = v.activeAccts.map(a => { const f = freshInfo(a, S); return { id: a.id, nick: a.nickname, inst: instName(S, a.instId), bal: money(C.accountBalance(a, S, month, now)), dot: f.dot, freshTip: f.tip }; });

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px 56px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'hsFade .25s ease' }}>

        {v.snapshotPending && (
          <div role="region" aria-label="Monthly opening reminder" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', border: '1px solid var(--border)', borderLeft: '3px solid var(--accent)', borderRadius: 12, background: 'var(--soft)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{v.snapBannerTitle}</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>Confirming locks in your starting position, so “change this month” stays trustworthy.</div>
            </div>
            <button onClick={() => openers.snapshot(S, openDrawer)} className="hv-accent" style={{ height: 32, padding: '0 14px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>Review now</button>
            <button onClick={() => setSnapDismissed(true)} style={{ height: 32, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', color: 'var(--muted)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', flex: 'none' }}>Later</button>
          </div>
        )}

        <PositionStrip />

        <section aria-label="Monthly summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
          {v.sumCards.map(s => (
            <div key={s.label} style={{ ...card, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>{s.label}</div>
              <div className="tnum" style={{ fontSize: 19, fontWeight: 600, marginTop: 4, color: s.color }}>{s.val}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{s.sub}</div>
            </div>
          ))}
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

            <section aria-label="Daily spending" style={{ ...card, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <h2 style={h2}>Daily spending</h2>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>cleared expenses · {monthName}</span>
                <span style={{ flex: 1 }} />
                {recSwitch(false)}
                <span className="tnum" style={{ fontSize: 13, fontWeight: 600 }}>{v.trendTotal}</span>
              </div>
              {v.trendEmpty && <div style={{ padding: '34px 0', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>No cleared expenses yet this month.</div>}
              {v.trendHas && (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 110, marginTop: 16 }} role="img" aria-label={v.trendSummary}>
                    {v.trendBars.map((b, i) => (
                      <div key={i} title={b.tip} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                        <div style={{ height: b.h, background: b.bg, borderRadius: '3px 3px 0 0', minHeight: 2 }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 2, marginTop: 6 }}>
                    {v.trendBars.map((b, i) => (
                      <div key={i} className="tnum" style={{ flex: 1, textAlign: 'center', fontSize: 10, color: 'var(--muted)' }}>{b.label}</div>
                    ))}
                  </div>
                </>
              )}
            </section>

            <section aria-label="Spending by category" style={{ ...card, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 4px' }}>
                <h2 style={{ ...h2, margin: 0, flex: 1 }}>Spending by category</h2>
                {recSwitch(true)}
              </div>
              {v.hasCat && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                  {v.catBars.map(c => (
                    <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 92px', gap: 12, alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 3, background: c.color, flex: 'none' }} />
                        <span style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                      </div>
                      <div style={{ height: 8, background: 'var(--track)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: c.w, height: '100%', background: c.color, borderRadius: 4 }} />
                      </div>
                      <div className="tnum" style={{ fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{c.amt}</div>
                    </div>
                  ))}
                </div>
              )}
              {v.noCat && <div style={{ padding: '26px 0', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>No categorised spending yet this month. Expenses you add will appear here.</div>}
            </section>

            {cmp && (
              <section aria-label="Month comparison" style={{ ...card, padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <h2 style={h2}>Month to month</h2>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{cmp.prevName} vs {cmp.curName}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
                  {cmp.rows.map(r => (
                    <div key={r.label}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--muted)' }}>{r.label}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: 12, alignItems: 'center', marginTop: 6 }}>
                        <div style={{ height: 10, background: 'var(--track)', borderRadius: 5, overflow: 'hidden' }}><div style={{ width: r.aW, height: '100%', background: 'var(--border)' }} /></div>
                        <div className="tnum" style={{ fontSize: 12.5, textAlign: 'right', color: 'var(--muted)' }}>{r.aVal}</div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: 12, alignItems: 'center', marginTop: 4 }}>
                        <div style={{ height: 10, background: 'var(--track)', borderRadius: 5, overflow: 'hidden' }}><div style={{ width: r.bW, height: '100%', background: r.bColor }} /></div>
                        <div className="tnum" style={{ fontSize: 12.5, fontWeight: 600, textAlign: 'right' }}>{r.bVal}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 11.5, color: 'var(--muted)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--border)' }} />{cmp.prevName}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--accent)' }} />{cmp.curName}</span>
                </div>
              </section>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

            <section aria-label="Accounts" style={{ ...card, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <h2 style={h2}>Accounts</h2><span style={{ flex: 1 }} />
                <button onClick={() => nav('/accounts')} className="hv-accent-fg" style={linkBtn}>View all ›</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: 6 }}>
                {acctMini.map(a => (
                  <button key={a.id} onClick={() => nav(`/accounts/${a.id}`)} className="hv-elev" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 2px', border: 'none', borderBottom: '1px solid var(--border)', background: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', color: 'var(--text)' }}>
                    <span title={a.freshTip} style={{ width: 8, height: 8, borderRadius: 999, background: a.dot, flex: 'none' }} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.nick}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{a.inst}</span>
                    </span>
                    <span className="tnum" style={{ fontSize: 13.5, fontWeight: 600 }}>{a.bal}</span>
                  </button>
                ))}
              </div>
            </section>

            <section aria-label="Budget progress" style={{ ...card, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={h2}>Budgets</h2><span style={{ flex: 1 }} />
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{monthName}</span>
                <button onClick={() => nav('/budget')} className="hv-accent-fg" style={linkBtn}>Manage ›</button>
              </div>
              {budgetRows.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                  {budgetRows.map(b => (
                    <div key={b.id}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{b.name}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: b.stateBg, color: b.stateFg }}>{b.stateLabel}</span>
                      </div>
                      <div style={{ height: 7, background: 'var(--track)', borderRadius: 4, overflow: 'hidden', marginTop: 6 }}>
                        <div style={{ width: b.w, height: '100%', background: b.barColor }} />
                      </div>
                      <div className="tnum" style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>{b.spentLabel}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '18px 0 8px', fontSize: 12.5, color: 'var(--muted)' }}>No budgets set up yet. Budget management is planned; demo budgets appear here once data exists.</div>
              )}
            </section>

            <section aria-label="Upcoming" style={{ ...card, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ ...h2, flex: 1 }}>Upcoming this month</h2>
                {overdue.length > 0 && (
                  <Link
                    to="/budget/recurring"
                    title={overdue.map(r => r.name).join(', ') + ' — past due and waiting on you'}
                    style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--neg-soft)', color: 'var(--neg)', textDecoration: 'none', flex: 'none' }}
                  >{overdue.length === 1 ? '1 overdue' : overdue.length + ' overdue'}</Link>
                )}
              </div>
              {upcomingRows.length > 0 ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', marginTop: 6 }}>
                    {upcomingRows.map(u => (
                      <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 500 }}>{u.name}</span>
                          <span style={{ display: 'block', fontSize: 11.5, color: u.whenColor }}>{u.when}</span>
                        </span>
                        <span className="tnum" style={{ fontSize: 13, fontWeight: 600 }}>{u.amt}</span>
                        <button onClick={() => openers.recordRule(S, u.id, openDrawer)} title="Review details and record this transaction" className="hv-soft" style={{ height: 26, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', color: 'var(--accent)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>Record</button>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>Reminders only — nothing is recorded until you confirm it.</div>
                </>
              ) : (
                <div style={{ padding: '16px 0 6px', fontSize: 12.5, color: 'var(--muted)' }}>Nothing due for the rest of this month.</div>
              )}
            </section>

            <section aria-label="Largest expenses" style={{ ...card, padding: '16px 18px' }}>
              <h2 style={h2}>Largest expenses</h2>
              {largestRows.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', marginTop: 6 }}>
                  {largestRows.map(l => (
                    <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.merchant}</span>
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{l.cat}</span>
                      </span>
                      <span className="tnum" style={{ fontSize: 13, fontWeight: 600 }}>{l.amt}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '16px 0 6px', fontSize: 12.5, color: 'var(--muted)' }}>No expenses recorded yet this month.</div>
              )}
            </section>
          </div>
        </div>

        <section aria-label="Recent transactions" style={{ ...card, padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <h2 style={h2}>Recent transactions</h2><span style={{ flex: 1 }} />
            <button onClick={() => nav('/transactions')} className="hv-accent-fg" style={linkBtn}>View all ›</button>
          </div>
          {recentRows.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 6 }}>
              {recentRows.map(t => (
                <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '96px minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) 110px 52px', gap: 12, alignItems: 'center', padding: '9px 2px', borderBottom: '1px solid var(--border)', opacity: t.rowOpacity }}>
                  <div className="tnum" style={{ fontSize: 12.5, color: 'var(--muted)' }}>{t.dateLabel}</div>
                  <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.merchant}</span>
                    <TxChips row={t} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: t.catColor, flex: 'none' }} />
                    <span style={{ fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.catName}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.acctLabel}</div>
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
            <div style={{ padding: '22px 0 10px', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>No transactions this month yet. Use “＋ Add transaction” to record the first one.</div>
          )}
        </section>
      </div>

    </div>
  );
}
