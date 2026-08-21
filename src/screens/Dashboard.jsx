import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.jsx';
import { useMonth } from '../store/MonthContext.jsx';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useAppLockToggle } from '../lib/useAppLockToggle.js';
import { useIsPhone } from '../lib/useIsPhone.js';
import { useMoney } from '../lib/format.js';
import * as C from '../lib/calc.js';
import { nowIso, todayStr } from '../lib/dates.js';
import { txRowOf, freshInfo, instName, setupState, isFirstUse } from '../lib/txRow.js';
import PositionStrip from '../components/PositionStrip.jsx';
import FirstUse from './FirstUse.jsx';
import { openers } from '../drawers/openers.js';
import TxChips, { NeedsCategoryPill } from '../ui/TxChips.jsx';
import CategoryPickerSheet from '../components/CategoryPickerSheet.jsx';
import CategoryPickerPopover from '../components/CategoryPickerPopover.jsx';
import { setTransactionsCategory } from '../store/actions.js';
import { effectiveNextDate, overdueRules, upcomingRules } from '../lib/schedule.js';
import { envelopeFor } from '../lib/envelope.js';
import { leftToSpend } from '../lib/leftToSpend.js';

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
  // Expenses is budget-spending (excludes recoverable advances); when advances
  // moved this month, a Recoverable card carries them so Net cash flow stays the
  // true bank change (income − spending − recoverable === net) and the row reconciles.
  const hasRec = M.recoverable !== 0;
  v.sumCards = [
    { label: 'Income', val: money(M.income), color: 'var(--text)', sub: C.monthLabel(month) },
    { label: 'Expenses', val: money(M.spending), color: 'var(--text)', sub: hasRec ? 'excl. recoverable advances' : 'incl. transfer fees' },
    ...(hasRec ? [{ label: 'Recoverable', val: moneyS(M.recoverable), color: 'var(--text)', sub: 'advances, net this month' }] : []),
    { label: 'Net cash flow', val: moneyS(M.net), color: netColor, sub: hasRec ? 'income − expenses − recoverable' : 'income − expenses' },
    { label: 'Savings', val: money(M.savings), color: 'var(--text)', sub: M.net < 0 ? 'overspent this month' : 'set aside so far' },
    { label: 'Savings rate', val: M.rate == null ? '—' : C.fmtPct(M.rate), color: M.rate != null && M.rate < 0 ? 'var(--neg)' : 'var(--text)', sub: M.rate == null ? 'no income recorded' : 'of income' },
  ];
  const daily = C.dailySpending(S, month, view, now); const dmax = Math.max(...daily.map(d => d.amt), 1);
  // Total from the true daily net (`net`), not the floored bars (`amt`): a refund
  // exceeding a day's spend must reduce the total, exactly as the Expenses card
  // nets refunds. Summing `amt` dropped those refunds and over-stated the total.
  const dtotal = daily.reduce((s, d) => s + d.net, 0);
  const dbars = daily.reduce((s, d) => s + d.amt, 0); // any visible spending, for empty/has flags
  const today = todayStr().slice(0, 7) === month ? +todayStr().slice(8, 10) : null;
  v.trendBars = daily.map(d => ({ h: d.amt > 0 ? Math.max(Math.round(d.amt / dmax * 100), 4) + '%' : '2%', bg: d.amt > 0 ? (today === d.day ? 'var(--accent-h)' : 'var(--accent)') : 'var(--track)', label: (d.day === 1 || d.day % 5 === 0) ? String(d.day) : '', tip: d.day + ' ' + C.monthLabel(month).slice(0, 3) + ' — ' + moneyRaw(d.amt) }));
  // empty/has track visible bars (a net-negative month can still have spending to show);
  // the header figure is the true net.
  v.trendTotal = money(dtotal); v.trendEmpty = dbars === 0; v.trendHas = dbars > 0;
  const peak = daily.reduce((a, b) => (b.amt > a.amt ? b : a), daily[0]);
  v.trendSummary = 'Daily cleared spending in ' + C.monthLabel(month) + ', total ' + moneyRaw(dtotal) + (peak && peak.amt > 0 ? ', highest on day ' + peak.day : '');
  const cats = C.categorySpending(S, month, view, now); const cmaxAmt = Math.max(...cats.map(c => c.amt), 1);
  // A row without a matching category is either a transaction that carries no
  // category (optional at entry — categorySpending buckets those under the
  // string 'undefined', since that is what an undefined object key coerces to)
  // or one pointing at a deleted id. Neither key is a name, so label them the
  // way the Spending Breakdown does instead of printing the raw key.
  v.catBars = cats.slice(0, 6).map(c => ({ id: c.id, name: c.cat ? c.cat.name : (c.id === 'undefined' ? 'Uncategorized' : 'Deleted category'), color: c.cat ? c.cat.color : 'var(--border)', amt: money(c.amt), w: Math.max(Math.round(c.amt / cmaxAmt * 100), 3) + '%' }));
  v.hasCat = cats.length > 0; v.noCat = cats.length === 0;
  return { v, cats, daily, M };
}

export default function Dashboard() {
  const { data: S, prefs, setPrefs, applyData } = useStore();
  const { month, months, isPast, balanceMonth } = useMonth();
  const fmt = useMoney();
  const { money, moneyS, masked } = fmt;
  const nav = useNavigate();
  const { openDrawer } = useDrawer();
  const { signOut, user } = useAuth();
  const { notify, flashRows, flashIds } = useUI();
  // Phone-only App lock enrollment row (the desktop account menu is
  // unreachable without a sidebar). Hook runs unconditionally — before the
  // first-use early return — per the Rules of Hooks.
  const appLockToggle = useAppLockToggle({ user, email: user?.email, prefs, setPrefs, notify });
  const phone = useIsPhone();
  const [snapDismissed, setSnapDismissed] = useState(false);
  // Single-row categorize from the recent-transactions pill (same CTA the
  // register rows carry): holds the target tx id while the picker is up. With
  // an anchor element the pick renders as a popover on the pill (web); without
  // one it falls back to the sheet — same split as the register.
  const [catTarget, setCatTarget] = useState(null);
  const [catAnchor, setCatAnchor] = useState(null);
  const openRowCategorize = (id, el) => { setCatTarget(id); setCatAnchor(el || null); };
  const categorizeOne = categoryId => {
    const id = catTarget;
    setCatTarget(null);
    if (!id) return;
    applyData(data => setTransactionsCategory(data, { ids: [id], categoryId }));
    flashRows([id]);
  };
  const now = nowIso();

  const setup = setupState(S);
  // Shared with the Reflect shell (which hides its tab bar during first-use).
  const showFirstUse = isFirstUse(S, prefs);

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

  // Hooks must all run before the first-use early return: this useMemo used to
  // sit below it, so completing/skipping setup changed the hook count and React
  // threw "Rendered more hooks than during the previous render".
  const env = useMemo(() => envelopeFor(S, month, now), [S, month, now]);

  if (showFirstUse) return <FirstUse setup={setup} onSkip={() => setPrefs({ skippedSetup: true })} />;

  const { M } = v;
  const lts = leftToSpend(env);
  const monthName = C.monthLabel(month);
  const prevIdx = months.indexOf(month) - 1;
  const cmp = prevIdx >= 0 ? (() => {
    const prevMonth = months[prevIdx];
    const P = C.monthMetrics(S, prevMonth, now);
    const mk = (label, a, b, bColor) => { const mx = Math.max(a, b, 1); return { label, aVal: money(a), bVal: money(b), aW: Math.round(a / mx * 100) + '%', bW: Math.round(b / mx * 100) + '%', bColor }; };
    return { prevName: C.monthLabel(prevMonth).split(' ')[0], curName: monthName.split(' ')[0], rows: [mk('Income', P.income, M.income, 'var(--accent)'), mk('Expenses', P.spending, M.spending, 'var(--warn)')] };
  })() : null;

  const nowStr = nowIso();
  const upc = isPast ? [] : upcomingRules(S, month, nowStr).slice(0, 5);
  // Missed occurrences never advance on their own, so they can sit outside the
  // upcoming window entirely — the pill is the only thing that surfaces them here.
  const overdue = isPast ? [] : overdueRules(S, nowStr);
  const upcomingRows = upc.map(r => { const nd = effectiveNextDate(r) || r.nextDate; const d = C.daysUntil(nd, nowStr); return { id: r.id, name: r.name, when: (d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : 'In ' + d + ' days') + ' · ' + C.dayLabel(nd + 'T00:00'), whenColor: d <= 3 ? 'var(--warn)' : 'var(--muted)', amt: (r.estimated ? '~' : '') + money(r.amount) }; });

  const lg = C.largestExpenses(S, month, 5);
  const largestRows = lg.map(t => ({ id: t.id, merchant: t.merchant || '—', cat: (S.categories.find(c => c.id === t.category) || {}).name || '—', amt: money(t.amount) }));
  const recent = S.transactions.filter(t => C.inMonth(t, month)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const recentRows = recent.map(t => txRowOf(t, S, fmt));
  // Dashboard summary shows the highest-balance accounts only (like "Largest
  // expenses"), capped so a long account list can't tower over the left column
  // and strand the Recent transactions section below it. The full list lives on
  // the Accounts screen; "View all" carries the total count.
  const ACCT_CAP = 4;
  const acctAll = v.activeAccts
    .map(a => { const f = freshInfo(a, S); const raw = C.accountBalance(a, S, balanceMonth, now); return { id: a.id, nick: a.nickname, inst: instName(S, a.instId), raw, bal: money(raw), dot: f.dot, freshTip: f.tip }; })
    .sort((x, y) => y.raw - x.raw);
  const acctMini = acctAll.slice(0, ACCT_CAP);
  const acctHidden = acctAll.length - acctMini.length;

  return (
    // Rendered inside the Reflect shell's Outlet as the "Overview" tab; the
    // shell already provides the max-width/padding container, so this root is
    // just the section stack (matching the other Reflect report tabs).
    <div className="dash-root" style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'hsFade .25s ease' }}>

        {v.snapshotPending && (
          <div role="region" aria-label="Monthly opening reminder" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--soft)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{v.snapBannerTitle}</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>Confirming locks in your starting position, so “change this month” stays trustworthy.</div>
            </div>
            <button onClick={() => openers.snapshot(S, openDrawer)} className="hv-accent rq-btn-solid" style={{ height: 32, padding: '0 14px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>Review now</button>
            <button onClick={() => setSnapDismissed(true)} className="rq-btn-outline" style={{ height: 32, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', color: 'var(--muted)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', flex: 'none' }}>Later</button>
          </div>
        )}

        <PositionStrip />

        <section aria-label="Left to spend" className="dash-lts" style={{ ...card, padding: '14px 16px', display: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Left to spend</span>
              <span className="tnum" style={{ display: 'block', fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 2 }}>{money(lts)}</span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>still in your envelopes · {C.monthLabel(month)}</span>
            </span>
            <button onClick={() => nav('/budget')} className="hv-accent-fg" style={linkBtn}>Budget ›</button>
          </div>
        </section>

        <section aria-label="Monthly summary" className="dash-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          {v.sumCards.map(s => (
            <div key={s.label} style={{ ...card, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>{s.label}</div>
              <div className="tnum" style={{ fontSize: 19, fontWeight: 600, marginTop: 4, color: s.color }}>{s.val}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{s.sub}</div>
            </div>
          ))}
        </section>

        <div className="dash-cols">
          <div className="dash-col-main" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

            <section aria-label="Daily spending" className="dash-daily" style={{ ...card, padding: '18px 20px' }}>
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

            <section aria-label="Spending by category" className="dash-cats" style={{ ...card, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 4px' }}>
                <h2 style={{ ...h2, margin: 0, flex: 1 }}>Spending by category</h2>
                {recSwitch(true)}
              </div>
              {v.hasCat && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                  {v.catBars.map(c => (
                    <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 92px', gap: 12, alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
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
              <section aria-label="Month comparison" className="dash-cmp" style={{ ...card, padding: '18px 20px' }}>
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

            <section aria-label="Upcoming" className="dash-upcoming" style={{ ...card, padding: '16px 18px' }}>
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
                    {upcomingRows.map((u, i) => (
                      <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i === upcomingRows.length - 1 ? 'none' : '1px solid var(--border)' }}>
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 500 }}>{u.name}</span>
                          <span style={{ display: 'block', fontSize: 11.5, color: u.whenColor }}>{u.when}</span>
                        </span>
                        <span className="tnum" style={{ fontSize: 13, fontWeight: 600 }}>{u.amt}</span>
                        <button onClick={() => { if (!phone) nav('/transactions'); openers.recordRule(S, u.id, openDrawer); }} title="Review details and record this transaction" className="hv-soft rq-btn-outline" style={{ height: 26, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', color: 'var(--accent)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>Record</button>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>Reminders only — nothing is recorded until you confirm it.</div>
                </>
              ) : (
                <div style={{ padding: '16px 0 6px', fontSize: 12.5, color: 'var(--muted)' }}>Nothing due for the rest of this month.</div>
              )}
            </section>
          </div>

          <div className="dash-col-side" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

            <section aria-label="Accounts" className="dash-accounts" style={{ ...card, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <h2 style={h2}>Accounts</h2><span style={{ flex: 1 }} />
                <button onClick={() => nav('/accounts')} className="hv-accent-fg" style={linkBtn}>{acctHidden > 0 ? `View all ${acctAll.length} ›` : 'View all ›'}</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: 6 }}>
                {acctMini.map((a, i) => (
                  <button key={a.id} onClick={() => nav(`/transactions/${a.id}`)} className="hv-elev" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 2px', border: 'none', borderBottom: i === acctMini.length - 1 ? 'none' : '1px solid var(--border)', background: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', color: 'var(--text)' }}>
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
          </div>
        </div>

        {/* Full-width by design (user request 2026-08-13): this sat in
            dash-col-side's narrow 1fr track and rendered ~⅓ page width on
            desktop. As a direct dash-root child it spans the content width at
            every viewport; on phone the ≤700px block orders it after
            dash-cols, keeping the old upcoming → daily → largest sequence. */}
        <section aria-label="Largest expenses" className="dash-largest" style={{ ...card, padding: '16px 18px' }}>
          <h2 style={h2}>Largest expenses</h2>
          {largestRows.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 6 }}>
              {largestRows.map((l, i) => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i === largestRows.length - 1 ? 'none' : '1px solid var(--border)' }}>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.merchant}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{l.cat}</span>
                  </span>
                  <span className="tnum" style={{ fontSize: 13, fontWeight: 600, flex: 'none', whiteSpace: 'nowrap' }}>{l.amt}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '16px 0 6px', fontSize: 12.5, color: 'var(--muted)' }}>No expenses recorded yet this month.</div>
          )}
        </section>

        <section aria-label="Recent transactions" className="dash-recent" style={{ ...card, padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <h2 style={h2}>Recent transactions</h2><span style={{ flex: 1 }} />
            <button onClick={() => nav('/transactions')} className="hv-accent-fg" style={linkBtn}>View all ›</button>
          </div>
          {recentRows.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 6 }}>
              {recentRows.map((t, i) => (
                <div key={t.id} className={'tx-row-grid' + (flashIds.has(t.id) ? ' row-flash' : '')} style={{ display: 'grid', gridTemplateColumns: '96px minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) 110px 52px', gap: 12, alignItems: 'center', padding: '9px 2px', borderBottom: i === recentRows.length - 1 ? 'none' : '1px solid var(--border)', opacity: t.rowOpacity }}>
                  <div className="tnum tx-cell-date" style={{ fontSize: 12.5, color: 'var(--muted)' }}>{t.dateLabel}</div>
                  <div className="tx-cell-merchant" style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.merchant}</span>
                    <TxChips row={t} />
                  </div>
                  <div className="tx-cell-cat" style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    {t.needsCategory ? <NeedsCategoryPill fontSize={11} onClick={e => openRowCategorize(t.id, e?.currentTarget)} /> : (
                      <span style={{ fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.catName}</span>
                    )}
                  </div>
                  <div className="tx-cell-acct" style={{ fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.acctLabel}</div>
                  <div className="tnum tx-cell-amt" style={{ fontSize: 13.5, fontWeight: 600, textAlign: 'right', color: t.amtColor }}>{t.amtLabel}</div>
                  <div className="tx-cell-edit" style={{ textAlign: 'right' }}>
                    {t.canEdit && (
                      <button onClick={() => { if (!phone) nav('/transactions'); openers.editTx(S, t.id, openDrawer); }} aria-label="Edit this transaction" className="hv-soft rq-btn-outline" style={{ height: 24, padding: '0 9px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', color: 'var(--accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Edit</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '22px 0 10px', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>No transactions this month yet. Use “＋ Add transaction” to record the first one.</div>
          )}
        </section>

        {/* Phone has no sidebar, so the sign-out control in the desktop
            UserMenu is unreachable there — this is the mobile equivalent.
            Sits at the bottom of the scroll, away from financial content,
            and stays a quiet bordered row (not accent-filled) so it never
            competes with the primary add-transaction action. */}
        {/* Phone-only App lock enrollment — the desktop toggle lives in the
            sidebar account menu, which has no phone equivalent. Same quiet
            bordered-row idiom as Sign out below; hidden (like the menu row)
            when no platform authenticator exists. */}
        <CategoryPickerSheet
          open={!!catTarget && !catAnchor}
          onClose={() => setCatTarget(null)}
          catType={catTarget && S.transactions.find(x => x.id === catTarget)?.type === 'income' ? 'income' : 'expense'}
          onPick={categorizeOne}
        />
        {/* Web: the pill anchors the category popover to itself; an anchor-less
            open (none today on this screen) would fall back to the sheet. */}
        <CategoryPickerPopover
          open={!!catTarget && !!catAnchor}
          onOpenChange={o => { if (!o) { setCatTarget(null); setCatAnchor(null); } }}
          anchor={catAnchor}
          catType={catTarget && S.transactions.find(x => x.id === catTarget)?.type === 'income' ? 'income' : 'expense'}
          onPick={categorizeOne}
        />

        {phone && appLockToggle.canLock && (
          <button
            onClick={appLockToggle.onToggleLock}
            aria-pressed={String(appLockToggle.appLock.enabled)}
            className="hv-elev dash-applock rq-btn-outline"
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, padding: '11px 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', textAlign: 'left' }}
          >
            <span aria-hidden="true" style={{ fontSize: 15, flex: 'none' }}>⚿</span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>App lock</span>
              <span style={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: 'var(--muted)' }}>Face ID / device biometrics to open. Privacy lock, not full security.</span>
            </span>
            <span style={{ flex: 'none', fontSize: 12, color: 'var(--muted)' }}>{appLockToggle.appLock.enabled ? 'On' : 'Off'}</span>
          </button>
        )}
        {phone && (
          <button
            onClick={() => signOut()}
            className="hv-elev dash-signout rq-btn-outline"
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, padding: '11px 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', textAlign: 'left' }}
          >
            <span aria-hidden="true" style={{ fontSize: 15, flex: 'none' }}>⇥</span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>Sign out</span>
              {user?.email && <span style={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</span>}
            </span>
          </button>
        )}
    </div>
  );
}
