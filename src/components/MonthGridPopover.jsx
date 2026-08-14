import { useState } from 'react';
import { Popover, PopoverTrigger, PopoverPanel, PopoverClose } from '../ui/primitives/Popover.jsx';

const LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = n => String(n).padStart(2, '0');

export function monthGridFor(months, year) {
  const years = [...new Set(months.map(m => Number(m.slice(0, 4))))];
  const cells = LABELS.map((label, i) => {
    const ym = `${year}-${p2(i + 1)}`;
    return { ym, label, enabled: months.includes(ym) };
  });
  return {
    year, cells,
    prevYear: years.includes(year - 1) ? year - 1 : null,
    nextYear: years.includes(year + 1) ? year + 1 : null,
  };
}

// "Aug 2026 ▾" trigger + a year-paged 4×3 month grid. Range comes from
// MonthContext's months list, so it automatically matches the stepper
// (full history + the 3-month lookahead).
export default function MonthGridPopover({ month, months, pick, triggerLabel }) {
  const [year, setYear] = useState(() => Number(month.slice(0, 4)));
  // Base UI keeps the Popover root mounted across open/close, so `year` state
  // survives a close. Without re-syncing on open, paging to another year,
  // closing, and reopening would show the stale year instead of jumping back
  // to the currently-selected month.
  const [open, setOpen] = useState(false);
  const g = monthGridFor(months, year);
  const yrBtn = on => ({ width: 28, height: 28, border: 'none', borderRadius: 6, background: 'transparent',
    color: 'var(--text)', cursor: on ? 'pointer' : 'default', opacity: on ? 1 : .35, fontSize: 14 });
  return (
    <Popover open={open} onOpenChange={o => { if (o) setYear(Number(month.slice(0, 4))); setOpen(o); }}>
      <PopoverTrigger className="tnum"
        style={{ border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 13,
          fontWeight: 600, padding: '0 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
        {triggerLabel} ▾
      </PopoverTrigger>
      <PopoverPanel width={300} aria-label="Month picker" side="bottom" align="center">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button style={yrBtn(g.prevYear)} disabled={!g.prevYear} aria-label="Previous year"
            onClick={() => g.prevYear && setYear(g.prevYear)}>‹</button>
          <span className="tnum" style={{ fontSize: 15, fontWeight: 700 }}>{year}</span>
          <button style={yrBtn(g.nextYear)} disabled={!g.nextYear} aria-label="Next year"
            onClick={() => g.nextYear && setYear(g.nextYear)}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {g.cells.map(c => (
            <PopoverClose key={c.ym} disabled={!c.enabled}
              onClick={() => c.enabled && pick(c.ym)}
              aria-label={c.label + ' ' + year}
              aria-current={c.ym === month ? 'date' : undefined}
              style={{ height: 40, border: 'none', borderRadius: 999, fontSize: 13, fontWeight: 600,
                cursor: c.enabled ? 'pointer' : 'default',
                background: c.ym === month ? 'var(--accent)' : 'transparent',
                color: c.ym === month ? 'var(--on-accent)' : c.enabled ? 'var(--text)' : 'var(--muted)',
                opacity: c.enabled || c.ym === month ? 1 : .45 }}>
              {c.label}
            </PopoverClose>
          ))}
        </div>
      </PopoverPanel>
    </Popover>
  );
}
