import { describe, it, expect } from 'vitest';
import { monthGridFor } from '../src/components/MonthGridPopover.jsx';

const months = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']; // history + 3 lookahead

describe('monthGridFor', () => {
  it('builds 12 cells for the year with enabled = in months list', () => {
    const g = monthGridFor(months, 2026);
    expect(g.cells).toHaveLength(12);
    expect(g.cells[4]).toEqual({ ym: '2026-05', label: 'May', enabled: false });
    expect(g.cells[7]).toEqual({ ym: '2026-08', label: 'Aug', enabled: true });
    expect(g.cells[10]).toEqual({ ym: '2026-11', label: 'Nov', enabled: true });
  });
  it('yearly paging is clamped to years containing enabled months', () => {
    const g = monthGridFor(months, 2026);
    expect(g.prevYear).toBe(null);  // no 2025 months in list
    expect(g.nextYear).toBe(null);  // no 2027 months in list
  });
  it('spanning years pages correctly', () => {
    const span = ['2025-11', '2025-12', '2026-01'];
    expect(monthGridFor(span, 2026).prevYear).toBe(2025);
    expect(monthGridFor(span, 2025).nextYear).toBe(2026);
  });
});
