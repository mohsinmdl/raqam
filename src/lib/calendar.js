// Month-grid math for date pickers, extracted from WhenField so the inline
// transaction editor's date cell shares one implementation. Pure: `today` is
// injected (like stampFor) so tests never read the wall clock.
const p2 = n => String(n).padStart(2, '0');

export function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const i = y * 12 + (m - 1) + n;
  return Math.floor(i / 12) + '-' + p2((i % 12) + 1);
}

// Whole weeks from the Sunday on or before the 1st. The trailing week is
// dropped when it holds nothing but next month, which is what keeps most
// months to five rows.
export function calendarCells(ym, selected, today) {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const start = new Date(y, m - 1, 1 - first.getDay());
  const out = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
    out.push({ iso, n: d.getDate(), out: iso.slice(0, 7) !== ym, sel: iso === selected, today: iso === today });
  }
  return out.slice(35).every(c => c.out) ? out.slice(0, 35) : out;
}
