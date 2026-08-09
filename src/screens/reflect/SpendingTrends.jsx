// Reflect — Spending Trends tab: total spending per month over the last 12
// months, as a bar chart with a period-average line, plus a most-recent-first
// table. Card/heading language matches SpendingBreakdown.jsx (untouched here);
// data from src/lib/reports.js (also untouched).
//
// Inferred v1 (Task 5) — the live design reference for this tab wasn't
// reachable, so this is a standard-report reading of "spending trends":
// monthlySeries() over spendingStats().total, windowed to 12 months.
import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useStore } from '../../store/StoreProvider.jsx';
import { useMoney } from '../../lib/format.js';
import { monthLabel } from '../../lib/calc.js';
import { monthlySeries, spendingStats } from '../../lib/reports.js';
import Bars from '../../ui/charts/Bars.jsx';

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 };
const h2 = { fontSize: 15, fontWeight: 600, margin: 0 };

// Axis label: drop the year for density ("August 2026" -> "Aug"); full label
// stays available via monthLabel() for tooltips/table rows.
const shortLabel = month => monthLabel(month).split(' ')[0].slice(0, 3);

export default function SpendingTrends() {
  const { month } = useOutletContext();
  const { data: S } = useStore();
  const { money } = useMoney();

  const series = useMemo(
    () => monthlySeries(S, (s, m, now) => spendingStats(s, m, { now }).total, { window: 12 }),
    [S]
  );

  const total = series.reduce((s, x) => s + x.value, 0);
  const average = series.length ? Math.round(total / series.length) : 0;
  const empty = series.length === 0 || total === 0;

  const chartData = useMemo(() => series.map(x => ({ label: shortLabel(x.month), value: x.value })), [series]);
  const rowsDesc = useMemo(() => [...series].reverse(), [series]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section aria-label="Spending totals" style={{ ...card, padding: '18px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Total spending (last {series.length} months)</div>
            <div className="tnum" style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{money(total)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Average / month</div>
            <div className="tnum" style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{money(average)}</div>
          </div>
        </div>
      </section>

      <section aria-label="Spending Trends" style={{ ...card, padding: '18px 20px' }}>
        <h2 style={h2}>Spending Trends</h2>
        {empty ? (
          <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>Not enough data yet for {monthLabel(month)}.</div>
        ) : (
          <>
            <div style={{ marginTop: 16 }}>
              <Bars data={chartData} mode="single" height={160} color="var(--accent)" formatValue={money} average={average} />
            </div>
            <div style={{ borderTop: '1px solid var(--border)', margin: '18px 0 0' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14, maxHeight: 320, overflowY: 'auto' }}>
              {rowsDesc.map(x => (
                <div key={x.month} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, flex: 1 }}>{x.label}</span>
                  <span className="tnum" style={{ fontSize: 13, fontWeight: 600 }}>{money(x.value)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
