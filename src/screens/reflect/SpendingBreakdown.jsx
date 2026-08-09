// Reflect — Spending Breakdown tab: donut + stats + a Categories|Groups list,
// all driven by the shared month from Reflect.jsx's outlet context. Data
// comes from src/lib/reports.js (untouched here); charting from
// src/ui/charts/Donut.jsx (untouched here).
//
// Filters: accountId scopes every figure on the tab — it's passed
// straight into spendingByCategory/spendingByGroup/spendingStats via
// opts.accountId, so the donut, list, and stat blocks (avg/day, most
// frequent, largest outflow) all agree on the same account scope.
// categoryId narrows only the *displayed* rows (donut slices + list) to that
// one category — it does not re-scope spendingStats, so the stat blocks keep
// reporting the full (account-scoped) picture per the brief.
import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useStore } from '../../store/StoreProvider.jsx';
import { useMoney } from '../../lib/format.js';
import { monthLabel } from '../../lib/calc.js';
import { spendingByCategory, spendingByGroup, spendingStats } from '../../lib/reports.js';
import { toCsv, downloadCsv } from '../../lib/csv.js';
import Donut from '../../ui/charts/Donut.jsx';

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 };
const h2 = { fontSize: 15, fontWeight: 600, margin: 0 };

// Fallback swatches for rows with no color of their own (group rows, and the
// Uncategorized row) — the accent color plus a handful of standard,
// mutually-distinct chart hues (teal, amber, blue, red, violet, cyan, pink,
// olive). Cycled by row index within the (already amt-descending) row list.
// Violet is lightened from the usual #7C3AED — that hue sits right at ~3:1
// against the dark-theme surface (#161D1A), too close to the line; #8B5CF6
// keeps comfortable contrast on both surfaces.
const PALETTE = ['#0F766E', '#B7791F', '#2563EB', '#C2413B', '#8B5CF6', '#0891B2', '#DB2777', '#65A30D'];

// "1 transactions" reads wrong — pluralize the count-driven noun.
const plural = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;

// pct display rule (brief): round to whole percent, but never show 0% for a
// genuinely nonzero (if tiny) share, and never show >0% for an exact zero.
function pctLabel(pct) {
  if (pct === 0) return '0%';
  if (pct < 0.005) return '<1%';
  return Math.round(pct * 100) + '%';
}

// Same pill-toggle idiom as Plan.jsx's ViewToggle (~304-324).
function ViewToggle({ view, onChange }) {
  const seg = (key, label) => (
    <button
      key={key} onClick={() => onChange(key)} aria-pressed={view === key}
      style={{
        height: 28, padding: '0 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
        background: view === key ? 'var(--surface)' : 'transparent', color: view === key ? 'var(--text)' : 'var(--muted)',
        boxShadow: view === key ? 'var(--shadow)' : 'none',
      }}
    >{label}</button>
  );
  return (
    <div role="group" aria-label="Category view" style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 8, background: 'rgba(125,109,63,.16)' }}>
      {seg('categories', 'Categories')}
      {seg('groups', 'Groups')}
    </div>
  );
}

export default function SpendingBreakdown() {
  const { month, categoryId, accountId } = useOutletContext();
  const { data: S } = useStore();
  const { money } = useMoney();
  const [lens, setLens] = useState('categories');

  // Unfiltered rows for the current lens, scoped to the selected account.
  const baseRows = useMemo(
    () => (lens === 'groups' ? spendingByGroup(S, month, { accountId }) : spendingByCategory(S, month, { accountId })),
    [S, month, lens, accountId]
  );

  // categoryId narrows the displayed set to that one category — or, in
  // Groups view, to the single group it belongs to (an "Other" fallback for
  // ungrouped categories, matching spendingByGroup's own fallback bucket).
  const narrowedRows = useMemo(() => {
    if (!categoryId) return baseRows;
    if (lens === 'categories') return baseRows.filter(r => r.id === categoryId);
    const cat = S.categories.find(c => c.id === categoryId);
    const groupId = cat && cat.groupId ? cat.groupId : 'other';
    return baseRows.filter(r => r.id === groupId);
  }, [baseRows, lens, categoryId, S]);

  // Percentages are re-based to the displayed subset's own total, so a single
  // filtered row reads as 100% (and the donut ring fills) rather than showing
  // its share of the unfiltered total.
  const total = useMemo(() => narrowedRows.reduce((s, r) => s + r.amt, 0), [narrowedRows]);
  const rows = useMemo(
    () => narrowedRows.map(r => ({ ...r, pct: total ? r.amt / total : 0 })),
    [narrowedRows, total]
  );

  // The stat blocks below (avg/day, most frequent, largest outflow) stay
  // scoped to the account filter only — categoryId never touches them.
  const stats = useMemo(() => spendingStats(S, month, { accountId }), [S, month, accountId]);
  const empty = total === 0;

  const slices = useMemo(
    () => rows.filter(r => r.amt > 0).map((r, i) => ({ label: r.name, value: r.amt, pct: r.pct, color: r.color || PALETTE[i % PALETTE.length] })),
    [rows]
  );

  const doExport = () => {
    const header = lens === 'groups' ? 'Group' : 'Category';
    const csv = toCsv([header, 'Amount', 'Percent'], rows.map(r => [r.name, r.amt, Math.round(r.pct * 100) + '%']));
    const filename = lens === 'groups' ? 'spending-by-group-' + month + '.csv' : 'spending-breakdown-' + month + '.csv';
    downloadCsv(filename, csv);
  };

  const statBlocks = [
    { label: 'Average Monthly Spending', value: money(stats.avgMonthly), sub: '' },
    { label: 'Average Daily Spending', value: money(stats.avgDaily), sub: '' },
    { label: 'Most Frequent Category', value: stats.mostFrequent ? stats.mostFrequent.cat.name : '—', sub: stats.mostFrequent ? plural(stats.mostFrequent.count, 'transaction') : '' },
    { label: 'Largest Outflow', value: stats.largestOutflow ? stats.largestOutflow.merchant : '—', sub: stats.largestOutflow ? money(stats.largestOutflow.amt) : '' },
  ];

  const emptyNote = <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>No spending recorded for {monthLabel(month)}.</div>;

  return (
    <div className="plan-grid">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

        <section aria-label="Total spending" style={{ ...card, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Total Spending</div>
              <div className="tnum" style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{money(total)}</div>
            </div>
            <span style={{ flex: 1 }} />
            <ViewToggle view={lens} onChange={setLens} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
            {empty ? emptyNote : (
              <Donut slices={slices} size={240} thickness={34} centerTop="Total Spending" centerBottom={money(total)} />
            )}
          </div>
        </section>

        <section aria-label="Spending stats" style={{ ...card, padding: '18px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {statBlocks.map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>{s.label}</div>
                <div className="tnum" style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{s.value}</div>
                {s.sub && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{s.sub}</div>}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section aria-label={lens === 'groups' ? 'Spending by group' : 'Spending by category'} style={{ ...card, padding: '18px 20px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={h2}>{lens === 'groups' ? 'Groups' : 'Categories'}</h2>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Total Spending</span>
          <button onClick={doExport} disabled={empty} aria-label={`Export ${lens === 'groups' ? 'spending by group' : 'spending by category'} as CSV`}
            style={{ border: 'none', background: 'none', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: empty ? 'default' : 'pointer', opacity: empty ? 0.5 : 1, padding: 0 }}
          >Export</button>
        </div>
        {empty ? emptyNote : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14, maxHeight: 380, overflowY: 'auto' }}>
            {rows.map((r, i) => {
              const color = r.color || PALETTE[i % PALETTE.length];
              return (
                <div key={r.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 3, background: color, flex: 'none' }} />
                    <span style={{ fontSize: 13, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                    <span className="tnum" style={{ fontSize: 13, fontWeight: 600, flex: 'none' }}>{money(r.amt)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <div style={{ flex: 1, height: 6, background: 'var(--track)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${r.pct * 100}%`, height: '100%', background: color, borderRadius: 3 }} />
                    </div>
                    <span className="tnum" style={{ fontSize: 11.5, color: 'var(--muted)', flex: 'none', width: 30, textAlign: 'right' }}>{pctLabel(r.pct)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
