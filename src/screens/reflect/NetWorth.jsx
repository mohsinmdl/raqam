// Reflect — Net Worth tab: net worth level over the last 12 months, with
// assets/liabilities/change sub-stats. Card/heading language matches
// SpendingBreakdown.jsx (untouched here); data from src/lib/reports.js and
// src/lib/calc.js's monthMetrics (also untouched).
//
// Inferred v1 (Task 5) — the live design reference for this tab wasn't
// reachable, so this is a standard-report reading of "net worth": the
// netWorthSeries() level, windowed to 12 months.
//
// Filters (Task 6): the shared category/account filters are Spending
// Breakdown-only for now — this tab ignores categoryId/accountId from the
// outlet context.
import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useStore } from '../../store/StoreProvider.jsx';
import { useMoney } from '../../lib/format.js';
import { monthLabel, monthMetrics } from '../../lib/calc.js';
import { nowIso } from '../../lib/dates.js';
import { netWorthSeries } from '../../lib/reports.js';
import { toCsv, downloadCsv } from '../../lib/csv.js';
import Bars from '../../ui/charts/Bars.jsx';

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 };
const h2 = { fontSize: 15, fontWeight: 600, margin: 0 };

const shortLabel = month => monthLabel(month).split(' ')[0].slice(0, 3);

export default function NetWorth() {
  const { month } = useOutletContext();
  const { data: S } = useStore();
  const { money, moneyS } = useMoney();

  const series = useMemo(() => netWorthSeries(S, { window: 12 }), [S]);
  const empty = series.length === 0 || series.every(x => x.value === 0);

  // Current = the selected month's level if it's in the window, else fall
  // back to the latest month the series actually covers.
  const current = useMemo(() => {
    const hit = series.find(x => x.month === month);
    if (hit) return hit.value;
    return series.length ? series[series.length - 1].value : 0;
  }, [series, month]);

  const metrics = useMemo(() => monthMetrics(S, month, nowIso()), [S, month]);
  const change = series.length ? series[series.length - 1].value - series[0].value : 0;

  const chartData = useMemo(() => series.map(x => ({ label: shortLabel(x.month), value: x.value })), [series]);

  const doExport = () => {
    const csv = toCsv(['Month', 'NetWorth'], series.map(x => [x.label, x.value]));
    downloadCsv('net-worth.csv', csv);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section aria-label="Net worth summary" style={{ ...card, padding: '18px 20px' }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Current net worth</div>
        <div className="tnum" style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{money(current)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginTop: 18 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Assets</div>
            <div className="tnum" style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{money(metrics.totalBank)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Liabilities</div>
            <div className="tnum" style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{money(metrics.cardLiability)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Change over period</div>
            <div className="tnum" style={{ fontSize: 16, fontWeight: 600, marginTop: 4, color: change > 0 ? 'var(--pos)' : change < 0 ? 'var(--neg)' : undefined }}>{moneyS(change)}</div>
          </div>
        </div>
      </section>

      <section aria-label="Net Worth" style={{ ...card, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={h2}>Net Worth</h2>
          <span style={{ flex: 1 }} />
          <button onClick={doExport} disabled={empty}
            style={{ border: 'none', background: 'none', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: empty ? 'default' : 'pointer', opacity: empty ? 0.5 : 1, padding: 0 }}
          >Export</button>
        </div>
        {empty ? (
          <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>Not enough data yet for {monthLabel(month)}.</div>
        ) : (
          <div style={{ marginTop: 16 }}>
            {/* Net worth is a level, not a per-period flow — a line would be the
                more natural rendering, but the repo has no line-chart primitive
                yet. Bars (single mode) is the v1 rendering. */}
            <Bars data={chartData} mode="single" height={160} color="var(--accent)" formatValue={money} />
          </div>
        )}
      </section>
    </div>
  );
}
