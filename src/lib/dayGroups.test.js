import { describe, expect, it } from 'vitest';
import { dayGroups } from './dayGroups.js';

const row = (id, dayKey) => ({ id, dayKey });
const NOW = '2026-08-12T09:00:00';

describe('dayGroups', () => {
  it('splits date-sorted rows into contiguous day sections', () => {
    const rows = [row('a', '2026-08-12'), row('b', '2026-08-12'), row('c', '2026-08-10')];
    const g = dayGroups(rows, 'date', NOW);
    expect(g.map(x => x.key)).toEqual(['2026-08-12', '2026-08-10']);
    expect(g[0].rows.map(r => r.id)).toEqual(['a', 'b']);
    expect(g[1].rows.map(r => r.id)).toEqual(['c']);
    expect(g[0].label).toBeTruthy(); // longDate's wording is its own contract
  });
  it('returns null for non-date sorts (list stays flat)', () => {
    expect(dayGroups([row('a', '2026-08-12')], 'signed', NOW)).toBeNull();
  });
  it('handles empty input', () => {
    expect(dayGroups([], 'date', NOW)).toEqual([]);
  });
});
