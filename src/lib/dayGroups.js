// Day sections for the phone Spending list (YNAB's date headers). Grouping
// only makes sense when rows are date-sorted; any other sort returns null and
// the caller renders the flat list instead.
import { longDate } from './schedule.js';

export function dayGroups(rows, sortKey, now) {
  if (sortKey !== 'date') return null;
  const out = [];
  let cur = null;
  rows.forEach(r => {
    const key = r.dayKey || '';
    if (!cur || cur.key !== key) {
      cur = { key, label: longDate(key, now), rows: [] };
      out.push(cur);
    }
    cur.rows.push(r);
  });
  return out;
}
