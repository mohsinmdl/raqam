// Planned-area placeholder screens — template 494-503, plannedVals script 1134-1143.
// Copy updated to be month-agnostic (the prototype's Reports blurb referenced its
// fixed June–August window).
import { useLocation } from 'react-router-dom';

const INFO = {
  budgets: { t: 'Budgets', b: 'Full budget management: an overall monthly budget plus per-category budgets with spent, remaining, percentage used, overspending alerts, optional rollover, and previous-month comparison.', n: 'Budget progress for the current month already appears on your dashboard, driven by the demo budgets.' },
  recurring: { t: 'Recurring', b: 'Manage recurring salary, rent, utility bills, subscriptions, loan and family payments, savings contributions, and credit-card bills — reminder-based, with skip, reschedule, and edit. Nothing is recorded without your confirmation.', n: 'Upcoming recurring reminders already appear on your dashboard with one-tap recording.' },
  reports: { t: 'Reports', b: 'Monthly and annual income and expenses, spending by category, account, and card, cash-flow trend, budget performance, largest expenses, and month-to-month comparison — with date selection, filters, and export-ready layouts.', n: 'The dashboard’s month selector previews the underlying month-by-month calculations.' },
  categories: { t: 'Categories', b: 'Manage income and expense categories and subcategories: custom icons and colours, archiving (categories used in history are never hard-deleted), and budget assignment.', n: 'Seventeen Pakistan-appropriate categories are seeded and used across transactions, budgets, and charts.' },
  settings: { t: 'Settings', b: 'Profile, default currency and timezone, balance privacy, category and institution management, data export and backup placeholders, security (passkeys, sessions, sign-out), and account deletion.', n: 'Balance privacy and dark mode already work from the top bar. Defaults: PKR · Asia/Karachi · English (Urdu-ready architecture).' },
};

export default function Planned() {
  const seg = useLocation().pathname.split('/')[1];
  const info = INFO[seg] || { t: '', b: '', n: '' };
  return (
    <div style={{ maxWidth: 640, margin: '32px auto 0', animation: 'hsFade .25s ease', padding: '0 28px 56px' }}>
      <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '28px 30px' }}>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: 'var(--info-soft)', color: 'var(--info)' }}>Planned — not in this MVP pass</span>
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: '14px 0 0', letterSpacing: '-0.01em' }}>{info.t}</h2>
        <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '8px 0 0', lineHeight: 1.6 }}>{info.b}</p>
        <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: 'var(--soft)', fontSize: 12.5, color: 'var(--text)' }}>{info.n}</div>
      </section>
    </div>
  );
}
