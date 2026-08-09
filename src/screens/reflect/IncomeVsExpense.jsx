// Reflect — Income v Expense tab: grouped income/expense bars per month over
// the last 12 months, plus period totals. Card/heading language matches
// SpendingBreakdown.jsx (untouched here); data from src/lib/reports.js.
//
// Inferred v1 (Task 5) — the live design reference for this tab wasn't
// reachable, so this is a standard-report reading of "income vs expense":
// incomeExpenseSeries(), windowed to 12 months, rendered as grouped bars.
//
// Filters (Task 6): the shared category/account filters are Spending
// Breakdown-only for now — this tab ignores categoryId/accountId from the
// outlet context.
import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useStore } from '../../store/StoreProvider.jsx';
import { useMoney } from '../../lib/format.js';
import { monthLabel } from '../../lib/calc.js';
import { incomeExpenseSeries } from '../../lib/reports.js';
import { toCsv, downloadCsv } from '../../lib/csv.js';
import Bars from '../../ui/charts/Bars.jsx';

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 };
const h2 = { fontSize: 15, fontWeight: 600, margin: 0 };

const shortLabel = month => monthLabel(month).split(' ')[0].slice(0, 3);

function LegendDot({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: 3, background: color, flex: 'none' }} />
      {label}
    </span>
  );
}

export default function IncomeVsExpense() {
  const { month } = useOutletContext();
  const { data: S } = useStore();
  const { money, moneyS } = useMoney();

  const series = useMemo(() => incomeExpenseSeries(S, { window: 12 }), [S]);
  const income = series.reduce((s, x) => s + x.income, 0);
  const expense = series.reduce((s, x) => s + x.expense, 0);
  const net = income - expense;
  const empty = series.length === 0 || (income === 0 && expense === 0);

  const chartData = useMemo(() => series.map(x => ({
    label: shortLabel(x.month),
    groups: [
      { key: 'income', value: x.income, color: 'var(--pos)' },
      { key: 'expense', value: x.expense, color: 'var(--neg)' },
    ],
  })), [series]);

  const doExport = () => {
    const csv = toCsv(['Month', 'Income', 'Expense', 'Net'], series.map(x => [x.label, x.income, x.expense, x.income - x.expense]));
    downloadCsv('income-vs-expense.csv', csv);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section aria-label="Income vs expense totals" style={{ ...card, padding: '18px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Income</div>
            <div className="tnum" style={{ fontSize: 22, fontWeight: 700, marginTop: 2, color: 'var(--pos)' }}>{money(income)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Expenses</div>
            <div className="tnum" style={{ fontSize: 22, fontWeight: 700, marginTop: 2, color: 'var(--neg)' }}>{money(expense)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Net</div>
            <div className="tnum" style={{ fontSize: 22, fontWeight: 700, marginTop: 2, color: net > 0 ? 'var(--pos)' : net < 0 ? 'var(--neg)' : undefined }}>{moneyS(net)}</div>
          </div>
        </div>
      </section>

      <section aria-label="Income v Expense" style={{ ...card, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={h2}>Income v Expense</h2>
          <span style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: 'var(--muted)' }}>
            <LegendDot color="var(--pos)" label="Income" />
            <LegendDot color="var(--neg)" label="Expense" />
          </div>
          <button onClick={doExport} disabled={empty} aria-label="Export income vs expense as CSV"
            style={{ border: 'none', background: 'none', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: empty ? 'default' : 'pointer', opacity: empty ? 0.5 : 1, padding: 0 }}
          >Export</button>
        </div>
        {empty ? (
          <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>Not enough data yet for {monthLabel(month)}.</div>
        ) : (
          <div style={{ marginTop: 16 }}>
            <Bars data={chartData} mode="grouped" height={160} formatValue={money} />
          </div>
        )}
      </section>
    </div>
  );
}
