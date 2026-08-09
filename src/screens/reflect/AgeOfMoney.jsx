// Reflect — Age of Money tab: how many days, on average, sit between earning
// a rupee and spending it — a FIFO ledger, built once over the whole store's
// history by src/lib/reports.js's ageOfMoney(). Card/heading language matches
// SpendingBreakdown.jsx (untouched here).
//
// Inferred v1 (Task 5) — the live design reference for this tab wasn't
// reachable, so this is a standard-report reading of "age of money": the
// current figure plus its 12-month trend, both from ageOfMoney().
import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useStore } from '../../store/StoreProvider.jsx';
import { monthLabel } from '../../lib/calc.js';
import { ageOfMoney } from '../../lib/reports.js';
import Bars from '../../ui/charts/Bars.jsx';

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 };
const h2 = { fontSize: 15, fontWeight: 600, margin: 0 };

const shortLabel = month => monthLabel(month).split(' ')[0].slice(0, 3);
const formatDays = n => n + 'd';

export default function AgeOfMoney() {
  const { month } = useOutletContext();
  const { data: S } = useStore();

  const { current, series } = useMemo(() => ageOfMoney(S, month, {}), [S, month]);
  const empty = series.length === 0 || series.every(x => x.value === 0);

  const chartData = useMemo(() => series.map(x => ({ label: shortLabel(x.month), value: x.value })), [series]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section aria-label="Age of money" style={{ ...card, padding: '18px 20px' }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Age of Money</div>
        <div className="tnum" style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{current} days</div>
        <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '8px 0 0' }}>
          Average age of the money you spend — higher means you're spending money you earned longer ago.
        </p>
      </section>

      <section aria-label="Age of Money" style={{ ...card, padding: '18px 20px' }}>
        <h2 style={h2}>Age of Money</h2>
        {empty ? (
          <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>Not enough data yet for {monthLabel(month)}.</div>
        ) : (
          <div style={{ marginTop: 16 }}>
            <Bars data={chartData} mode="single" height={160} color="var(--accent)" formatValue={formatDays} />
          </div>
        )}
      </section>
    </div>
  );
}
