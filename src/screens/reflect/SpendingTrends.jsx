// Stub — Task 4 replaces this with the real spending-trends chart.
import { useOutletContext } from 'react-router-dom';

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 };

export default function SpendingTrends() {
  const { month } = useOutletContext();
  return (
    <div style={card}>
      <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>Spending Trends</h2>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Selected month: {month}</p>
    </div>
  );
}
