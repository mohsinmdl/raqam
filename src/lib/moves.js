// Recent Moves — turning audit rows into something a person can read.
//
// Every mutating action already writes a row carrying a human summary, a
// timestamp and an entity type, so this module only has to select, order and
// group. Pure and DOM-free; `now` is injected, per the convention the money
// math and the schedule engine follow.

// Which entity types sit behind each chip. An entity type absent from every
// group still appears under All — a future 'investment' row must not vanish
// from the panel just because nobody has assigned it a chip yet.
const GROUPS = {
  money: ['transaction'],
  plans: ['recurring', 'budget', 'assignment', 'categoryGroup'],
  setup: ['account', 'category', 'card'],
};

export const MOVE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'money', label: 'Money' },
  { id: 'plans', label: 'Plans' },
  { id: 'setup', label: 'Setup' },
];

// Undo and redo describe how you navigated, not what you changed, and they
// arrive in pairs that cancel out. They stay in the database — the audit trail
// is still complete — but listing them would make the panel a third longer
// while telling the reader less.
const isMove = r => r && r.action !== 'undo' && r.action !== 'redo';

export function filterMoves(audit, filterId) {
  const types = GROUPS[filterId];
  return (Array.isArray(audit) ? audit : [])
    .filter(r => isMove(r) && (!types || types.includes(r.entityType)))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

export const moveCount = (audit, filterId) => filterMoves(audit, filterId).length;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const VALID_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function relLabelFor(day, now) {
  // Compare calendar days, not elapsed hours: something at 23:50 last night is
  // "Yesterday" at 00:10, not "0 days ago".
  const diff = Math.round((Date.parse(now.slice(0, 10)) - Date.parse(day)) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return diff + ' days ago';
}

function absLabelFor(day) {
  const [y, m, d] = day.split('-');
  return Number(d) + ' ' + MONTHS[Number(m) - 1] + ' ' + y;
}

export function groupMovesByDay(rows, now) {
  const byDay = new Map();
  for (const r of rows || []) {
    // A malformed timestamp would otherwise produce an "Invalid Date" heading.
    if (!r || !VALID_AT.test(String(r.at))) continue;
    const day = r.at.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(r);
  }
  return [...byDay.keys()]
    .sort((a, b) => b.localeCompare(a))
    .map(day => ({
      day,
      dayLabel: absLabelFor(day),
      relLabel: relLabelFor(day, now),
      rows: byDay.get(day).sort((a, b) => String(b.at).localeCompare(String(a.at))),
    }));
}

// Global Recent Moves feed (Phase 4), read from the audit log — the same rows
// that power Phase 2's per-category clock popover, but across all categories
// and grouped by day. Read-only: undo stays on Cmd+Z.
const MS_DAY = 86400000;

const dayKey = iso => String(iso).slice(0, 10);
const fmtDate = key => {
  const [y, m, d] = key.split('-');
  return d + ' ' + MONTHS[Number(m) - 1] + ' ' + y;
};
const relLabelFor2 = (key, nowKey) => {
  const diff = Math.round((Date.parse(nowKey + 'T00:00:00Z') - Date.parse(key + 'T00:00:00Z')) / MS_DAY);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return diff + ' days ago';
};

export function recentMoves(S, { now, days = 34, kind = 'all' } = {}) {
  const nowKey = dayKey(now);
  const cutoff = Date.parse(nowKey + 'T00:00:00Z') - (days - 1) * MS_DAY;
  const nameOf = id => {
    if (id === 'rta') return 'Ready to Assign';
    const c = (S.categories || []).find(x => x.id === id);
    return c ? c.name : '(deleted category)';
  };

  const rows = (S.audit || [])
    .filter(a => a.entityType === 'assignment' && Date.parse(a.at) >= cutoff)
    .map(a => {
      if (a.action === 'move') {
        return { id: a.id, at: a.at, verb: 'moved', amount: a.after?.amount ?? 0,
          from: nameOf(a.after?.from), to: nameOf(a.after?.to), month: a.after?.month || '' };
      }
      const [head, month] = String(a.entityId || '').split('|');
      if (head === 'import') return { id: a.id, at: a.at, verb: 'imported', amount: null, from: null, to: null, month: month || '' };
      return { id: a.id, at: a.at, verb: a.action === 'delete' ? 'removed' : 'assigned',
        amount: a.after?.amount ?? 0, from: null, to: nameOf(head), month: month || '' };
    })
    .filter(r => kind === 'all'
      || (kind === 'moved' && r.verb === 'moved')
      || (kind === 'assigned' && r.verb !== 'moved'))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  const groups = [];
  for (const r of rows) {
    const key = dayKey(r.at);
    let g = groups[groups.length - 1];
    if (!g || g.dateKey !== key) {
      g = { dateKey: key, dateLabel: fmtDate(key), relLabel: relLabelFor2(key, nowKey), rows: [] };
      groups.push(g);
    }
    g.rows.push(r);
  }
  return groups;
}
