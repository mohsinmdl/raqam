# Recent Moves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A history panel beside the undo/redo buttons listing what the user has changed, grouped by day, surviving reloads.

**Architecture:** Every mutating action already writes an audit row with a human summary, a timestamp and an entity type — the panel is mostly a presenter over data that exists. The work is fetching that history back: `audit` is currently `skipFetch: true`, so it dies with the session. Three changes make it durable (a real `fromRow` mapper, a bounded query, and a test pinning the sync baseline), then a pure grouping module, then the UI.

**Tech Stack:** React 18 + Vite, plain JS/JSX, Vitest (pure-function tests only — no jsdom), Supabase via PostgREST.

## Global Constraints

- **`audit_log` is append-only.** `appendOnly: true` forces `deletes = []` in the differ, and the server has no delete policy. Nothing in this plan may write, update or remove audit rows.
- **Fetch is bounded to the 300 most recent rows, newest first.** Newest-first also matters to `labelFor` in `src/lib/undo.js`, which reads `audit[0]` as the newest row.
- **The sync baseline must keep containing fetched audit rows.** `diffStores` counts a row absent from the baseline as an *add*; `StoreProvider.jsx:79` fetches and `:88` passes that same store as `initialBaseline`. This is correct today by construction and becomes load-bearing — Task 1 pins it.
- **undo/redo audit rows are never listed** in the panel. They stay in the database.
- **Components go at module scope.** `tests/no-inline-components.test.js` enforces this with an empty allowlist.
- **`now` is injected, never read inside a pure module** — the project's convention (`hasOccurred`, `ruleStatus`, `stampFor`).
- **Money is whole PKR integers.** Never introduce paisa.
- Verify with `npx vitest run --exclude '**/.claude/**'` (403 tests pass on main today) and `npx vite build`.

---

### Task 1: Fetch audit history, bounded and correctly shaped

**Files:**
- Modify: `src/store/sync.js` — the `audit` entry in `COLLECTIONS` (~line 178-188) and `fetchAll` (~line 199-215)
- Test: `tests/audit-fetch.test.js` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `data.audit` is populated on load with rows shaped exactly like `makeAudit` output — `{ id, at, entityType, entityId, action, summary, before, after }`, newest first. Later tasks read that shape. Also exports `AUDIT_FETCH_LIMIT` (number, `300`) from `src/store/sync.js`.

- [ ] **Step 1: Write the failing test**

Create `tests/audit-fetch.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { AUDIT_FETCH_LIMIT, COLLECTIONS, diffStores } from '../src/store/sync.js';

const audit = COLLECTIONS.find(c => c.name === 'audit');

// A row exactly as PostgREST returns it from audit_log.
const serverRow = over => ({
  id: 'a1', entity_type: 'transaction', entity_id: 't1', action: 'delete',
  summary: 'Deleted adjustment of 3200', before: { amount: 3200 }, after: null,
  at: '2026-08-07T02:29', ...(over || {}),
});
// A row exactly as makeAudit builds it locally.
const localRow = over => ({
  id: 'a1', at: '2026-08-07T02:29', entityType: 'transaction', entityId: 't1',
  action: 'delete', summary: 'Deleted adjustment of 3200',
  before: { amount: 3200 }, after: null, ...(over || {}),
});

const store = auditRows => ({
  institutions: [], cardProducts: [], categories: [], accounts: [], cards: [],
  snapshots: [], transactions: [], budgets: [], recurring: [], audit: auditRows,
});

describe('audit is fetched now, not blanked', () => {
  it('no longer skips the fetch', () => {
    expect(audit.skipFetch).toBeFalsy();
  });

  it('stays append-only, so nothing can delete server rows', () => {
    expect(audit.appendOnly).toBe(true);
  });

  it('bounds the query to the most recent rows, newest first', () => {
    expect(AUDIT_FETCH_LIMIT).toBe(300);
    // fetchQuery is handed a PostgREST builder; record what it asks for.
    const calls = [];
    const fake = {
      order: (col, opts) => { calls.push(['order', col, opts]); return fake; },
      limit: n => { calls.push(['limit', n]); return fake; },
    };
    audit.fetchQuery(fake);
    expect(calls).toEqual([
      ['order', 'at', { ascending: false }],
      ['limit', 300],
    ]);
  });
});

describe('fromRow mirrors toRow', () => {
  it('maps a server row to the shape makeAudit produces', () => {
    expect(audit.fromRow(serverRow())).toEqual(localRow());
  });

  it('round-trips: local -> server -> local is unchanged', () => {
    expect(audit.fromRow(audit.toRow(localRow()))).toEqual(localRow());
  });

  it('normalises a missing summary to an empty string, not undefined', () => {
    expect(audit.fromRow(serverRow({ summary: null })).summary).toBe('');
  });

  it('keeps before/after null rather than dropping the keys', () => {
    const r = audit.fromRow(serverRow({ before: null, after: null }));
    expect(r.before).toBe(null);
    expect(r.after).toBe(null);
  });
});

describe('fetched rows are already in the sync baseline', () => {
  // The property the whole feature rests on: diffStores counts a row absent
  // from the baseline as an add. StoreProvider fetches, then passes that same
  // store as initialBaseline — so history must never be re-pushed.
  it('diffing a hydrated store against itself writes nothing', () => {
    const hydrated = store([localRow({ id: 'a1' }), localRow({ id: 'a2' })]);
    expect(diffStores(hydrated, hydrated)).toEqual([]);
  });

  it('pushes only rows created after hydrate', () => {
    const baseline = store([localRow({ id: 'a1' })]);
    const later = store([localRow({ id: 'a2' }), localRow({ id: 'a1' })]);
    const diff = diffStores(baseline, later);
    const auditDiff = diff.find(d => d.collection.name === 'audit');
    expect(auditDiff.added.map(r => r.id)).toEqual(['a2']);
    expect(auditDiff.deletes).toEqual([]);
  });

  it('never deletes, even when local audit is shorter than the baseline', () => {
    const baseline = store([localRow({ id: 'a1' }), localRow({ id: 'a2' })]);
    const shorter = store([localRow({ id: 'a1' })]);
    const diff = diffStores(baseline, shorter);
    expect(diff.find(d => d.collection.name === 'audit')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/audit-fetch.test.js`
Expected: FAIL — `AUDIT_FETCH_LIMIT` is not exported yet, so the import is undefined and the first assertion throws. (`COLLECTIONS` and `diffStores` already export cleanly, so the failure should be about the limit and the audit spec, nothing else. If you see an import resolution error instead, stop and report it.)

- [ ] **Step 3: Export what the test needs, and add the fetch hook**

In `src/store/sync.js`:

1. Add the limit constant above `COLLECTIONS`:

```js
// Bounded so a years-old ledger does not load its entire history at startup.
// 300 covers a heavy user's recent past; older rows stay on the server.
export const AUDIT_FETCH_LIMIT = 300;
```

2. Nothing to export: `COLLECTIONS` (sync.js:25) and `diffStores` (sync.js:221) are already exported. Verified — do not add a second `export` keyword.

3. Replace the whole `audit` entry with:

```js
  {
    // Append-only: the differ computes adds only (never changed/deletes), and
    // the server RLS has no update/delete policies. It IS fetched now — the
    // Recent Moves panel needs history that outlives the session — but only
    // the most recent rows, newest first, which is also the order the rest of
    // the app assumes (actions prepend, and undo's labelFor reads audit[0]).
    name: 'audit', table: 'audit_log', keyOf: r => r.id,
    appendOnly: true,
    fetchQuery: q => q.order('at', { ascending: false }).limit(AUDIT_FETCH_LIMIT),
    toRow: r => stripNulls({
      id: r.id, entity_type: r.entityType, entity_id: r.entityId, action: r.action,
      summary: r.summary || '', before: r.before ?? null, after: r.after ?? null, at: r.at,
    }),
    // Mirrors toRow exactly. It was a passthrough while audit was never
    // fetched; leaving it so would hand the app snake_case rows that toRow
    // then reads as undefined, pushing corrupt duplicates back to the server.
    fromRow: r => ({
      id: r.id, at: r.at, entityType: r.entity_type, entityId: r.entity_id,
      action: r.action, summary: r.summary || '',
      before: r.before ?? null, after: r.after ?? null,
    }),
  },
```

- [ ] **Step 4: Apply `fetchQuery` in `fetchAll`**

In `fetchAll`, the fetch currently reads `fetched.map(c => supabase.from(c.table).select('*'))`. Change it to honour the hook:

```js
  const results = await Promise.all(
    fetched.map(c => {
      const q = supabase.from(c.table).select('*');
      return c.fetchQuery ? c.fetchQuery(q) : q;
    })
  );
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/audit-fetch.test.js`
Expected: PASS (10 tests)

- [ ] **Step 6: Run the full suite and build**

Run: `npx vitest run --exclude '**/.claude/**' && npx vite build`
Expected: 403 + 10 PASS; build clean.

- [ ] **Step 7: Commit**

```bash
git add src/store/sync.js tests/audit-fetch.test.js
git commit -m "Sync: fetch audit history, bounded and correctly shaped"
```

---

### Task 2: `src/lib/moves.js` — filtering and day grouping

**Files:**
- Create: `src/lib/moves.js`
- Test: `tests/moves.test.js` (create)

**Interfaces:**
- Consumes: audit rows shaped `{ id, at, entityType, entityId, action, summary, before, after }` from Task 1.
- Produces:
  - `MOVE_FILTERS` — `[{ id: 'all'|'money'|'plans'|'setup', label: string }]`
  - `filterMoves(audit, filterId)` → `row[]` — drops undo/redo, applies the filter, newest first
  - `moveCount(audit, filterId)` → `number`
  - `groupMovesByDay(rows, now)` → `[{ day, dayLabel, relLabel, rows }]`

- [ ] **Step 1: Write the failing test**

Create `tests/moves.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { MOVE_FILTERS, filterMoves, groupMovesByDay, moveCount } from '../src/lib/moves.js';

const NOW = '2026-08-07T10:00';
const row = (id, over) => ({
  id, at: '2026-08-07T09:00', entityType: 'transaction', entityId: 'x',
  action: 'create', summary: 'Recorded expense', before: null, after: null, ...(over || {}),
});

describe('MOVE_FILTERS', () => {
  it('offers exactly All, Money, Plans and Setup', () => {
    expect(MOVE_FILTERS.map(f => f.id)).toEqual(['all', 'money', 'plans', 'setup']);
    expect(MOVE_FILTERS.map(f => f.label)).toEqual(['All', 'Money', 'Plans', 'Setup']);
  });
});

describe('filterMoves', () => {
  it('always drops undo and redo — they are navigation, not change', () => {
    const rows = [
      row('a'),
      row('u', { action: 'undo', entityType: 'app' }),
      row('r', { action: 'redo', entityType: 'app' }),
    ];
    expect(filterMoves(rows, 'all').map(r => r.id)).toEqual(['a']);
  });

  it('Money is transactions', () => {
    const rows = [row('t', { entityType: 'transaction' }), row('b', { entityType: 'budget' })];
    expect(filterMoves(rows, 'money').map(r => r.id)).toEqual(['t']);
  });

  it('Plans is recurring rules and budgets', () => {
    const rows = [
      row('r', { entityType: 'recurring' }), row('b', { entityType: 'budget' }),
      row('t', { entityType: 'transaction' }),
    ];
    expect(filterMoves(rows, 'plans').map(r => r.id).sort()).toEqual(['b', 'r']);
  });

  it('Setup is accounts, categories and cards', () => {
    const rows = [
      row('a', { entityType: 'account' }), row('c', { entityType: 'category' }),
      row('k', { entityType: 'card' }), row('t', { entityType: 'transaction' }),
    ];
    expect(filterMoves(rows, 'setup').map(r => r.id).sort()).toEqual(['a', 'c', 'k']);
  });

  it('shows an unrecognised entity type under All only, never a named chip', () => {
    const rows = [row('x', { entityType: 'investment' })];
    expect(filterMoves(rows, 'all').map(r => r.id)).toEqual(['x']);
    for (const f of ['money', 'plans', 'setup']) {
      expect(filterMoves(rows, f)).toEqual([]);
    }
  });

  it('falls back to All for an unknown filter id', () => {
    expect(filterMoves([row('a')], 'nonsense').map(r => r.id)).toEqual(['a']);
  });

  it('returns newest first regardless of input order', () => {
    const rows = [
      row('old', { at: '2026-08-01T09:00' }),
      row('new', { at: '2026-08-07T09:00' }),
      row('mid', { at: '2026-08-04T09:00' }),
    ];
    expect(filterMoves(rows, 'all').map(r => r.id)).toEqual(['new', 'mid', 'old']);
  });

  it('tolerates a missing audit array', () => {
    expect(filterMoves(undefined, 'all')).toEqual([]);
    expect(filterMoves(null, 'all')).toEqual([]);
  });
});

describe('moveCount', () => {
  it('counts what the filter would show', () => {
    const rows = [
      row('t', { entityType: 'transaction' }),
      row('b', { entityType: 'budget' }),
      row('u', { action: 'undo', entityType: 'app' }),
    ];
    expect(moveCount(rows, 'all')).toBe(2);
    expect(moveCount(rows, 'money')).toBe(1);
    expect(moveCount(rows, 'setup')).toBe(0);
  });
});

describe('groupMovesByDay', () => {
  it('groups by calendar day, newest day first', () => {
    const rows = [
      row('a', { at: '2026-08-07T09:00' }),
      row('b', { at: '2026-08-06T09:00' }),
      row('c', { at: '2026-08-07T08:00' }),
    ];
    const g = groupMovesByDay(rows, NOW);
    expect(g.map(x => x.day)).toEqual(['2026-08-07', '2026-08-06']);
    expect(g[0].rows.map(r => r.id)).toEqual(['a', 'c']);
  });

  it('labels today, yesterday and further back', () => {
    const rows = [
      row('a', { at: '2026-08-07T09:00' }),
      row('b', { at: '2026-08-06T09:00' }),
      row('c', { at: '2026-08-04T09:00' }),
    ];
    expect(groupMovesByDay(rows, NOW).map(x => x.relLabel))
      .toEqual(['Today', 'Yesterday', '3 days ago']);
  });

  it('crosses a month boundary correctly', () => {
    const rows = [row('a', { at: '2026-07-31T09:00' })];
    expect(groupMovesByDay(rows, '2026-08-01T10:00')[0].relLabel).toBe('Yesterday');
  });

  it('gives each day an absolute label too', () => {
    expect(groupMovesByDay([row('a', { at: '2026-08-07T09:00' })], NOW)[0].dayLabel)
      .toBe('7 Aug 2026');
  });

  it('orders rows newest first inside a day', () => {
    const rows = [
      row('early', { at: '2026-08-07T02:02' }),
      row('late', { at: '2026-08-07T17:30' }),
    ];
    expect(groupMovesByDay(rows, NOW)[0].rows.map(r => r.id)).toEqual(['late', 'early']);
  });

  it('skips a row with a missing or malformed timestamp rather than heading it Invalid Date', () => {
    const rows = [row('good'), row('bad', { at: null }), row('worse', { at: 'nonsense' })];
    const g = groupMovesByDay(rows, NOW);
    expect(g).toHaveLength(1);
    expect(g[0].rows.map(r => r.id)).toEqual(['good']);
  });

  it('returns nothing for an empty list', () => {
    expect(groupMovesByDay([], NOW)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/moves.test.js`
Expected: FAIL — `Failed to resolve import "../src/lib/moves.js"`

- [ ] **Step 3: Write the implementation**

Create `src/lib/moves.js`:

```js
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
  plans: ['recurring', 'budget'],
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/moves.test.js`
Expected: PASS (18 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/moves.js tests/moves.test.js
git commit -m "Recent Moves: filtering and day grouping"
```

---

### Task 3: The panel, beside undo/redo

**Files:**
- Create: `src/components/RecentMoves.jsx`
- Modify: `src/components/Header.jsx` — import and render it next to the ↶ ↷ buttons (they sit around line 105)

**Interfaces:**
- Consumes: `MOVE_FILTERS`, `filterMoves`, `moveCount`, `groupMovesByDay` from Task 2; `useStore()` for `data.audit`; `nowIso()` from `src/lib/dates.js`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Create the component**

Create `src/components/RecentMoves.jsx`:

```jsx
// Recent Moves — what you have changed, grouped by day.
//
// Read-only on purpose: audit rows outlive the things they describe (a delete
// entry names a row that is gone), so a click that sometimes lands nowhere
// would be worse than no click at all. The undo button beside this one is
// where acting happens.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/StoreProvider.jsx';
import { nowIso } from '../lib/dates.js';
import { MOVE_FILTERS, filterMoves, groupMovesByDay, moveCount } from '../lib/moves.js';

const panelStyle = {
  position: 'absolute', top: 38, right: 0, zIndex: 30, width: 380, maxWidth: '92vw',
  maxHeight: 460, overflowY: 'auto', background: 'var(--surface)',
  border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)', padding: 14,
};
const chipStyle = active => ({
  height: 26, padding: '0 11px', borderRadius: 999, cursor: 'pointer',
  fontSize: 12, fontWeight: 600,
  border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
  background: active ? 'var(--accent)' : 'var(--surface)',
  color: active ? 'var(--on-accent)' : 'var(--text)',
});

function MoveRow({ row }) {
  return (
    <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 13 }}>{row.summary || row.action}</div>
      <div className="tnum" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
        {row.at.slice(11, 16)}
      </div>
    </div>
  );
}

function DayGroup({ group }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 2px 4px' }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>{group.dayLabel}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{group.relLabel}</span>
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {group.rows.map(r => <MoveRow key={r.id} row={r} />)}
      </div>
    </div>
  );
}

export default function RecentMoves() {
  const { data: S } = useStore();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const rootRef = useRef(null);
  const triggerRef = useRef(null);

  // Same dismissal contract as RowMenu, rather than a second one.
  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const audit = S.audit || [];
  const rows = filterMoves(audit, filter);
  const groups = groupMovesByDay(rows, nowIso());
  const total = moveCount(audit, 'all');

  return (
    <div ref={rootRef} style={{ position: 'relative', flex: 'none' }}>
      <button
        ref={triggerRef}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog" aria-expanded={String(open)}
        title="Recent moves"
        className="hv-elev"
        style={{
          height: 32, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8,
          background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5, fontWeight: 500,
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        Recent moves
      </button>

      {open && (
        <div role="dialog" aria-label="Recent moves" style={panelStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>Recent moves</span>
            {MOVE_FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                aria-pressed={String(filter === f.id)}
                className="hv-soft"
                style={chipStyle(filter === f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {groups.map(g => <DayGroup key={g.day} group={g} />)}

          {groups.length === 0 && (
            <div style={{ padding: '28px 8px', textAlign: 'center', color: 'var(--muted)', fontSize: 12.5 }}>
              {total === 0 ? 'Nothing recorded yet.' : 'No moves match this filter.'}
            </div>
          )}

          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            Showing your most recent activity. Undo and redo steps are not listed.
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render it in the header**

In `src/components/Header.jsx`, add the import beside the other component imports:

```js
import RecentMoves from './RecentMoves.jsx';
```

Then place it immediately **after** the closing `</span>` of the undo/redo button pair (the `<span style={{ display: 'flex', gap: 6 }}>` holding `HistoryButton` ↶ and ↷):

```jsx
      <RecentMoves />
```

- [ ] **Step 3: Verify the build and the module-scope guard**

Run: `npx vite build && npx vitest run --exclude '**/.claude/**'`
Expected: build clean; all tests pass, including `no-inline-components`.

- [ ] **Step 4: Verify the components are at module scope**

Run:
```bash
grep -n "^function MoveRow\|^function DayGroup\|^export default function RecentMoves" src/components/RecentMoves.jsx
```
Expected: all three at column 0. A component defined inside another gets a new identity every render and remounts instead of updating — the defect that caused the transactions-table scroll jump.

- [ ] **Step 5: Commit**

```bash
git add src/components/RecentMoves.jsx src/components/Header.jsx
git commit -m "Recent Moves: the panel"
```

---

### Task 4: Verify end to end and open the PR

**Files:** none modified.

**Interfaces:** none.

- [ ] **Step 1: Run the full suite and build**

Run: `npx vitest run --exclude '**/.claude/**' && npx vite build`
Expected: all PASS, build clean.

- [ ] **Step 2: Check the invariants no test reaches**

Run:
```bash
grep -c "skipFetch" src/store/sync.js
grep -n "appendOnly: true" src/store/sync.js
grep -n "fetchQuery" src/store/sync.js
```
Expected: `skipFetch` now appears only in `fetchAll`'s filter and the blanking line (audit no longer sets it); `appendOnly: true` still present on audit; `fetchQuery` defined on audit and applied in `fetchAll`.

- [ ] **Step 3: Start a review server**

Run: `cp /Users/dev/projects/raqam/.env.local . 2>/dev/null; npx vite --port 5192 --strictPort`

Manual checks for the owner: open Recent moves and confirm days are grouped with Today / Yesterday / N days ago; confirm no "Undid:" or "Redid:" rows appear; each chip filters and its empty state reads correctly; Escape and an outside click both close it; **reload the page and confirm history is still there** — the whole point of the fetch; make a change and confirm it appears at the top without a reload.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin worktree-recent-moves
gh pr create --base main --head worktree-recent-moves \
  --title "Recent Moves: a history panel beside undo/redo" \
  --body "See docs/superpowers/specs/2026-08-07-recent-moves-design.md.

Audit history is now fetched (300 most recent rows, newest first) instead of dying with the session, so the panel can group by day across reloads.

The subtle part is \`fromRow\`: it was a passthrough marked 'never fetched', and leaving it that way would have handed the app snake_case rows that \`toRow\` then reads as undefined, pushing corrupt duplicates to the server. It now mirrors \`toRow\` exactly.

One property moved from incidental to load-bearing: \`fetchAll\` runs before the sync baseline is taken, so fetched rows are in the baseline and never re-push. A test pins it.

Undo/redo rows are excluded from the panel — they describe navigation, not change, and arrive in pairs that cancel. They remain in the database."
```

---

## Self-Review

**Spec coverage:** Bounded fetch + `fromRow` mapper + baseline test → Task 1. `src/lib/moves.js` with `MOVE_FILTERS`/`filterMoves`/`groupMovesByDay`/`moveCount` → Task 2. Panel, chips, read-only rows, RowMenu dismissal pattern, empty states, module scope → Task 3. Failure modes: malformed `at` skipped (Task 2 test), >300 rows disclosed in the panel footer (Task 3), fetch failure inherits the existing hydrate error screen (no code needed — stated in the spec). Out-of-scope items are absent from every task, as intended.

**Placeholder scan:** none — every step has runnable commands or complete code.

**Type consistency:** the audit row shape `{ id, at, entityType, entityId, action, summary, before, after }` is produced by Task 1's `fromRow` and consumed by Task 2's functions and Task 3's `MoveRow` (`row.summary`, `row.action`, `row.at`). `MOVE_FILTERS` entries are `{ id, label }` in Task 2 and read as `f.id`/`f.label` in Task 3. `groupMovesByDay` returns `{ day, dayLabel, relLabel, rows }` in Task 2 and is read as `g.day`/`group.dayLabel`/`group.relLabel`/`group.rows` in Task 3.

**One deviation from the spec, deliberate:** the spec named `src/components/RecentMoves.jsx` as a single component; the plan splits out `MoveRow` and `DayGroup` within that same file, both at module scope. Same file, clearer units, and it satisfies the no-inline-components guard.
