# Mobile Tab Bar + YNAB-Style Spending Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. All subagents run on the session model (Fable) — do not pass a model override.

**Goal:** Five-tab floating bottom bar (Home · Plan · Spending · Accounts · Reflect) plus a YNAB-style phone Spending screen (day sections, tap-to-edit, Select mode, banners, category-picker sheet) per `docs/superpowers/specs/2026-08-12-mobile-tabbar-ynab-spending-design.md`.

**Architecture:** Presentation-only. `useIsPhone()` (≤700px) keeps branching inside `Transactions()`; `TxPhoneList` is reworked to YNAB anatomy; new `AddTxPill` + `CategoryPickerSheet` components; one new context flag (`phoneSelect`) in `TxViewContext` so the pill can hide during Select mode. Store gains **zero** new actions — `setTransactionsCategory({ids, categoryId})` already exists (`src/store/actions.js:610`).

**Tech Stack:** React 18, react-router (HashRouter), inline styles per codebase convention, vitest via `pnpm test`, Playwright MCP for live verification.

## Global Constraints

- Desktop >700px byte-identical, EXCEPT one added "Categorize…" item in the recorded-selection BulkBar `more` menu.
- Phone touch targets ≥44pt (rows minHeight 48); amounts always pre-formatted (`amtLabel`/`amtColor`, `.tnum`) — never re-format in components.
- `useStore()` returns `{ data: S, ... }`; money via `useMoney()` → `{ money, moneyS }`.
- One Teal / Signal-Only / Flat Ledger: accent only on the active tab + the add pill; overdue red only on the overdue signal itself.
- The stored status word is `'pending'`; the user-facing word is "uncleared".
- No swipe gestures, no pull-to-refresh, no route changes, no schema changes.
- `pnpm test` green after every task; commit after every task.

---

### Task 1: Floating five-tab bar + content clearance

**Files:**
- Modify: `src/components/MobileTabBar.jsx` (full rewrite of the component body)
- Modify: `src/App.jsx` (`<main>` phone padding; Shell already renders `{phone && <MobileTabBar />}` — keep that)

**Interfaces:**
- Consumes: existing `NavLink`, theme tokens.
- Produces: fixed-position nav, height ≈60px + safe-area. Later tasks position floating chrome above it using the constant `bottom: calc(76px + env(safe-area-inset-bottom))` (pill) — keep geometry in sync if you adjust padding.

- [ ] **Step 1: Rewrite `MobileTabBar.jsx`**

```jsx
// Phone bottom tab bar — floating pill, YNAB section set: Home · Plan ·
// Spending · Accounts · Reflect. The add action moved to AddTxPill (floating
// "+ Transaction" above this bar). Spec:
// docs/superpowers/specs/2026-08-12-mobile-tabbar-ynab-spending-design.md
import { NavLink } from 'react-router-dom';

const icon = d => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
// Line icons in the sidebar's 1.8-stroke language.
const ICONS = {
  home: 'M3 11l9-8 9 8M5 9.5V20h5v-5h4v5h5V9.5',
  plan: 'M12 3v18M5 8c0-2 14-2 14 0M5 8v8c0 2 14 2 14 0V8',
  spending: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5',
  accounts: 'M4 10h16M4 10l8-6 8 6M6 10v8m4-8v8m4-8v8m4-8v8M4 20h16',
  reflect: 'M4 20v-9m5.33 9V4m5.34 16v-6M20 20V9',
};

const tabStyle = ({ isActive }) => ({
  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
  minHeight: 48, justifyContent: 'center', textDecoration: 'none', borderRadius: 999,
  color: isActive ? 'var(--text)' : 'var(--muted)',
  background: isActive ? 'var(--soft)' : 'transparent',
  fontSize: 10.5, fontWeight: isActive ? 600 : 500,
});
const Tab = ({ to, label, d }) => (
  <NavLink to={to} style={tabStyle} aria-label={label}>
    {({ isActive }) => (
      <>
        <span style={{ color: isActive ? 'var(--accent)' : 'inherit', display: 'flex' }}>{icon(d)}</span>
        {label}
      </>
    )}
  </NavLink>
);

export default function MobileTabBar() {
  return (
    <nav aria-label="Primary" style={{
      position: 'fixed', left: 10, right: 10,
      bottom: 'calc(8px + env(safe-area-inset-bottom))', zIndex: 40,
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '6px 8px', background: 'var(--surface)',
      border: '1px solid var(--border)', borderRadius: 999,
      boxShadow: '0 8px 24px rgba(0, 0, 0, .28)',
    }}>
      <Tab to="/dashboard" label="Home" d={ICONS.home} />
      <Tab to="/budget" label="Plan" d={ICONS.plan} />
      <Tab to="/transactions" label="Spending" d={ICONS.spending} />
      <Tab to="/accounts" label="Accounts" d={ICONS.accounts} />
      <Tab to="/reflect" label="Reflect" d={ICONS.reflect} />
    </nav>
  );
}
```

Before committing: `grep -n "boxShadow" src/ui/BulkBar.jsx` — if BulkBar's floating bar uses a shadow token/value, copy that exact value into both this nav and (Task 2) the pill so floating chrome shares one shadow.

- [ ] **Step 2: Give `<main>` phone clearance in `App.jsx`**

The bar is now `position: fixed` (out of flow), so scrolled content must clear it. In Shell, change the `<main>` style to:

```jsx
<main style={{ flex: 1, overflowY: 'auto', minHeight: 0,
  paddingBottom: phone ? 'calc(76px + env(safe-area-inset-bottom))' : 0 }}>
```

(76 = 8 bottom inset + ~60 bar + 8 breathing room.) `{phone && <MobileTabBar />}` stays where it is — a fixed element's DOM position is irrelevant, and keeping it inside `HeaderSlotProvider` avoids churn.

- [ ] **Step 3: Run tests + dev-server smoke**

Run: `pnpm test` → green. `pnpm build` → succeeds (catches JSX slips without a browser).

- [ ] **Step 4: Commit**

```bash
git add src/components/MobileTabBar.jsx src/App.jsx
git commit -m "Mobile: floating five-tab bar (Home/Plan/Spending/Accounts/Reflect), no center +"
```

---

### Task 2: `phoneSelect` flag + floating "+ Transaction" pill

**Files:**
- Modify: `src/store/TxViewContext.jsx`
- Create: `src/components/AddTxPill.jsx`
- Modify: `src/App.jsx` (mount pill next to the tab bar)

**Interfaces:**
- Consumes: `useDrawer`, `openers.addTx`, `useStore`, new `useTxView().phoneSelect`.
- Produces: `phoneSelect: boolean`, `setPhoneSelect(fn|bool)` on `useTxView()` — Task 5 drives it; `AddTxPill` (no props).

- [ ] **Step 1: Add the flag to `TxViewContext.jsx`**

Add alongside the existing state (NOT inside `resetView` — Select mode is per-visit chrome, not a view filter):

```jsx
// Spending's phone Select mode, lifted here only so app-level chrome
// (AddTxPill) can hide while it is on. Transactions owns setting/clearing it.
const [phoneSelect, setPhoneSelect] = useState(false);
```

and expose `phoneSelect, setPhoneSelect` in the provider's value object.

- [ ] **Step 2: Create `src/components/AddTxPill.jsx`**

```jsx
// Floating "+ Transaction" pill above the phone tab bar (YNAB). Rendered by
// the Shell on every tab screen; hides while Spending's Select mode is on and
// when there is no active account to record against (same rule as the desktop
// Add Transaction toolbar action).
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { openers } from '../drawers/openers.js';
import { useStore } from '../store/StoreProvider.jsx';
import { useTxView } from '../store/TxViewContext.jsx';

export default function AddTxPill() {
  const { openDrawer } = useDrawer();
  const { data: S } = useStore();
  const { phoneSelect } = useTxView();
  const disabled = S.accounts.filter(a => a.status === 'active').length === 0;
  if (phoneSelect || disabled) return null;
  return (
    <button onClick={() => openers.addTx(openDrawer)} className="hv-accent"
      aria-label="Add transaction"
      style={{
        position: 'fixed', right: 16,
        bottom: 'calc(76px + env(safe-area-inset-bottom))', zIndex: 39,
        display: 'flex', alignItems: 'center', gap: 8, minHeight: 48,
        padding: '0 20px', border: 'none', borderRadius: 999,
        background: 'var(--accent)', color: 'var(--on-accent)',
        fontSize: 15, fontWeight: 600, cursor: 'pointer',
        boxShadow: '0 8px 24px rgba(0, 0, 0, .28)',
      }}>
      <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>＋</span>
      Transaction
    </button>
  );
}
```

(Use the same shadow value you settled on in Task 1.)

- [ ] **Step 3: Mount in `App.jsx`**

```jsx
{phone && <AddTxPill />}
{phone && <MobileTabBar />}
```

- [ ] **Step 4: Tests + build; commit**

Run: `pnpm test` and `pnpm build` → green.

```bash
git add src/store/TxViewContext.jsx src/components/AddTxPill.jsx src/App.jsx
git commit -m "Mobile: floating + Transaction pill on all tab screens; phoneSelect flag"
```

---

### Task 3: Day-section grouping helper (TDD)

**Files:**
- Modify: `src/lib/txRow.js` (rows gain `dayKey`)
- Create: `src/lib/dayGroups.js`
- Test: `src/lib/dayGroups.test.js`

**Interfaces:**
- Consumes: `longDate(dateStr, now)` from `src/lib/schedule.js`; row objects.
- Produces: `dayGroups(rows, sortKey, now)` → `[{ key: 'YYYY-MM-DD', label, rows: [...] }]`, or `null` when `sortKey !== 'date'` (flat list fallback). `txRowOf` rows gain `dayKey: t.date.slice(0, 10)`.

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- dayGroups` → FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/dayGroups.js`**

```js
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
```

- [ ] **Step 4: Add `dayKey` to `txRowOf` in `src/lib/txRow.js`**

In the object `txRowOf` returns, add `dayKey: t.date.slice(0, 10),` next to `dateLabel`. (Scheduled rows never day-group, so `futureTxRowOf`/rule rows need nothing — but they inherit via `txRowOf` where applicable, which is harmless.)

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm test` → all green (including any existing txRow tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/dayGroups.js src/lib/dayGroups.test.js src/lib/txRow.js
git commit -m "Mobile: dayGroups helper + dayKey on tx rows (date-sorted day sections)"
```

---

### Task 4: TxPhoneList → YNAB anatomy (day sections, chips, select circles, tap-to-edit)

**Files:**
- Modify: `src/components/TxPhoneList.jsx` (rewrite)

**Interfaces:**
- Consumes: `dayGroups()` output from Task 3, `TxChips`, `schedNote`.
- Produces (Task 5 renders it):

```
TxPhoneList({
  groups,            // dayGroups() result or null
  postedRows,        // flat fallback when groups == null
  scheduled, schedKey, schedOpen, onToggleSchedOpen,
  overdueCount, hiddenRuleCount, hideAccount,
  needsCat,          // Set<txId> — category-bearing type with no category
  selectMode,        // boolean — circles + toggle taps when true
  selected, schedSel,            // Set — row membership
  onToggleRow, onToggleSched,    // select-mode tap handlers (id, on)
  onRowTap, onSchedTap,          // view-mode tap handlers (row) / (schedItem)
})
```

- [ ] **Step 1: Rewrite the component**

```jsx
// Phone presentation of the Spending register (≤700px) — YNAB anatomy: day
// section headers, payee/amount line, category chip + account line, optional
// memo line. Same data pipeline as the desktop table. Spec:
// docs/superpowers/specs/2026-08-12-mobile-tabbar-ynab-spending-design.md
// View mode: tap opens the editor (onRowTap/onSchedTap). Select mode: tap
// toggles membership; circles render on the left. Amounts arrive
// pre-formatted (amtLabel/amtColor).
import TxChips from '../ui/TxChips.jsx';
import { schedNote } from '../lib/txRow.js';

const chipStyle = (bg, fg) => ({
  fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999,
  background: bg, color: fg, border: '1px solid var(--border)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  display: 'inline-flex', alignItems: 'center', maxWidth: '100%',
});

// Selection circle: outlined when off, accent + check when on (YNAB).
function Circle({ on }) {
  return (
    <span aria-hidden="true" style={{
      width: 22, height: 22, borderRadius: 999, flex: 'none',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      border: on ? 'none' : '2px solid var(--muted)',
      background: on ? 'var(--accent)' : 'transparent',
      color: 'var(--on-accent)', fontSize: 12, fontWeight: 700,
    }}>{on ? '✓' : ''}</span>
  );
}

function PhoneRow({ t, selId, checked, selectMode, onToggle, onTap, scheduled, hideAccount, last, needsCat }) {
  const payee = t.merchant || 'No Payee Set';
  const catChip = needsCat
    ? <span style={chipStyle('var(--warn-soft)', 'var(--text)')}>Category Needed</span>
    : t.catName
      ? <span style={chipStyle('var(--soft)', 'var(--text)')}>{t.catName}</span>
      : null;
  return (
    <button
      onClick={() => (selectMode ? onToggle(selId, !checked) : onTap && onTap())}
      aria-pressed={selectMode ? checked : undefined}
      aria-label={(selectMode ? 'Select ' : 'Edit ') + payee + ' on ' + t.dateLabel + ', ' + t.amtLabel}
      className={checked ? undefined : 'hv-elev'}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 56,
        padding: '8px 16px', border: 'none', textAlign: 'left', cursor: 'pointer',
        color: 'var(--text)', font: 'inherit',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: checked ? 'var(--soft)'
          : scheduled ? 'color-mix(in srgb, var(--warn-soft) 40%, var(--surface))' : 'none',
      }}
    >
      {selectMode && <Circle on={checked} />}
      <span style={{ minWidth: 0, flex: 1, opacity: t.rowOpacity }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{payee}</span>
          <span className="tnum" style={{ fontSize: 14.5, fontWeight: 600, color: t.amtColor, whiteSpace: 'nowrap', flex: 'none' }}>{t.amtLabel}</span>
          {!scheduled && t.stGlyph && (
            <span role="img" aria-label={t.stLabel} title={t.stTitle || t.stLabel}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15, borderRadius: 999, boxSizing: 'border-box',
                background: t.stOutline ? 'transparent' : t.stColor,
                color: t.stOutline ? t.stColor : t.stOn,
                border: t.stOutline ? ('1.25px solid ' + t.stColor) : 'none',
                fontSize: 9, fontWeight: 700, lineHeight: 1, flex: 'none' }}
            >{t.stGlyph}</span>
          )}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, minWidth: 0 }}>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', gap: 6, alignItems: 'center', overflow: 'hidden' }}>
            {catChip}
            <TxChips row={t} />
          </span>
          {!hideAccount && t.acctLabel && (
            <span style={{ flex: 'none', fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{t.acctLabel}</span>
          )}
        </span>
        {t.hasNotes && (
          <span style={{ display: 'block', fontSize: 11.5, marginTop: 3, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.notes}</span>
        )}
      </span>
    </button>
  );
}

function DayHeader({ label }) {
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 2, padding: '10px 16px 6px',
      background: 'var(--bg)', borderBottom: '1px solid var(--border)',
      fontSize: 13, fontWeight: 700,
    }}>{label}</div>
  );
}

export default function TxPhoneList({
  groups, postedRows, scheduled, schedKey, schedOpen, onToggleSchedOpen,
  overdueCount, hiddenRuleCount, hideAccount, needsCat,
  selectMode, selected, schedSel, onToggleRow, onToggleSched, onRowTap, onSchedTap,
}) {
  const note = schedNote(overdueCount, hiddenRuleCount);
  const rowProps = t => ({
    t, selId: t.id, hideAccount, selectMode,
    needsCat: needsCat.has(t.id),
    checked: selected.has(t.id), onToggle: onToggleRow,
    onTap: () => onRowTap(t),
  });
  return (
    <div>
      {scheduled.length > 0 && (
        <>
          <button
            onClick={onToggleSchedOpen} aria-expanded={schedOpen}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 44, padding: '8px 16px', border: 'none', borderBottom: '1px solid var(--border)', background: 'none', color: 'var(--text)', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}
          >
            <span aria-hidden="true" style={{ fontSize: 12, color: 'var(--muted)', width: 12, transform: schedOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s ease' }}>›</span>
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>Scheduled</span>
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{scheduled.length} · {note}</span>
          </button>
          {schedOpen && scheduled.map((x, i) => {
            const key = schedKey(x);
            return (
              <PhoneRow
                key={key} t={x.row} selId={key} scheduled hideAccount={hideAccount}
                selectMode={selectMode} needsCat={false}
                checked={schedSel.has(key)} onToggle={onToggleSched}
                onTap={() => onSchedTap(x)}
                last={false}
              />
            );
          })}
        </>
      )}
      {groups
        ? groups.map(g => (
            <section key={g.key} aria-label={g.label}>
              <DayHeader label={g.label} />
              {g.rows.map((t, i) => (
                <PhoneRow key={t.id} {...rowProps(t)} last={i === g.rows.length - 1} />
              ))}
            </section>
          ))
        : postedRows.map((t, i) => (
            <PhoneRow key={t.id} {...rowProps(t)} last={i === postedRows.length - 1} />
          ))}
    </div>
  );
}
```

Notes: `TxChips row={t}` without `meta` — the compact row keeps transfer/repeat chips but drops Edited/Excluded/Split (same rule as the dashboard rows). The old date-in-subline disappears (day headers own the date); scheduled rows still show `dateLabel` via the aria-label only — their due wording lives in the chip `TxChips` renders (`t.chip` is the Scheduled pill for rule rows).

- [ ] **Step 2: Build check**

Run: `pnpm build` → succeeds. (Transactions.jsx still passes old props — the screen updates in Task 5; a temporarily broken phone view mid-branch is acceptable BETWEEN commits but NOT at a commit, so Task 4 and Task 5 commit together if you cannot keep both working. Preferred: implement Task 5 immediately after and commit once both compile against each other. If committing separately, update the call site minimally in this task.)

- [ ] **Step 3: Commit** (see note above — if you updated the call site here, include it)

```bash
git add src/components/TxPhoneList.jsx
git commit -m "Mobile tx: YNAB row anatomy, day sections, select circles in TxPhoneList"
```

---

### Task 5: Spending phone chrome — title/toolbar, banners, Select mode, action bar

**Files:**
- Modify: `src/screens/Transactions.jsx` (phone branch only; desktop JSX untouched except Task 6's menu item)

**Interfaces:**
- Consumes: everything Task 4 produces; `useTxView().setPhoneSelect`; existing handlers `toggleRow`, `toggleSched`, `bulkStatus`, `bulkDelete`, `bulkDuplicate`, `singleEditItem`, `schedMore`, `openers.editTx`, `RowMenu({open, onToggle, onClose, label, items})`.
- Produces: `const [pickerOpen, setPickerOpen] = useState(false)` + `bulkCategorize(categoryId)` — Task 6's sheet consumes both.

- [ ] **Step 1: Add phone-only state and derived data** (inside `Transactions()`, near the existing selection state)

```jsx
// Phone chrome state. phoneSelect lives in TxViewContext (AddTxPill hides on
// it); everything else is per-visit.
const { phoneSelect, setPhoneSelect } = useTxView();   // add to the existing useTxView() destructure
const [phoneQOpen, setPhoneQOpen] = useState(false);   // search row shown?
const [phoneMenuOpen, setPhoneMenuOpen] = useState(false); // ⋯ toolbar menu
const [phoneMoreOpen, setPhoneMoreOpen] = useState(false); // select-mode ⋯ sheet
const [pickerOpen, setPickerOpen] = useState(false);   // category picker sheet

// Types that carry a category; transfers/adjustments never do.
const CAT_TYPES = ['expense', 'refund', 'income'];     // module scope, next to DEFAULT list consts
const needsCat = new Set(postedTx.filter(t => CAT_TYPES.includes(t.type) && !t.category).map(t => t.id));
const unclearedIds = new Set(postedTx.filter(t => t.status === 'pending').map(t => t.id));

// Banner filters are phone-local view state, not TxView filters.
const [phoneFilter, setPhoneFilter] = useState('all'); // 'all' | 'uncleared' | 'needsCat'
const phoneRows = phoneFilter === 'uncleared' ? postedRows.filter(r => unclearedIds.has(r.id))
  : phoneFilter === 'needsCat' ? postedRows.filter(r => needsCat.has(r.id))
  : postedRows;
const groups = dayGroups(phoneRows, sort.key, now);    // import { dayGroups } from '../lib/dayGroups.js'

const exitSelect = () => { setPhoneSelect(false); setPhoneMoreOpen(false); clearSel(); clearSched(); };
useEffect(() => () => setPhoneSelect(false), [setPhoneSelect]); // leave mode on unmount

const bulkCategorize = categoryId => {
  const ids = sel.filter(id => { const t = S.transactions.find(x => x.id === id); return t && CAT_TYPES.includes(t.type); });
  const skipped = sel.length - ids.length;
  setPickerOpen(false);
  if (ids.length === 0) { notify('Nothing to categorize — transfers and adjustments have no category.'); return; }
  afterBulk(
    'Categorized ' + ids.length + '.' + (skipped ? ' Skipped ' + skipped + ' without a category field.' : ''),
    data => setTransactionsCategory(data, { ids, categoryId }),
  );
};
// The cleared toggle the ⓒ action uses — same rule as the keyboard shortcut.
const bulkToggleCleared = () => {
  const rows = sel.map(id => S.transactions.find(t => t.id === id)).filter(Boolean);
  const allCleared = rows.length > 0 && rows.every(t => t.status === 'cleared');
  bulkStatus(allCleared ? 'pending' : 'cleared');
};
```

`setTransactionsCategory` is already imported. Read `src/store/actions.js:610-635` once before wiring to confirm it tolerates every id you pass (it sets `category` on each listed tx) — the `CAT_TYPES` pre-filter is what keeps transfers out.

- [ ] **Step 2: Replace the phone toolbar block** (the current `{phone && (...)}` SearchField row) with title row + banners:

```jsx
{phone && (
  <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px 4px' }}>
      <h1 style={{ margin: 0, flex: 1, fontSize: 24, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {acct ? acct.nickname : 'Spending'}
      </h1>
      {phoneSelect ? (
        <button onClick={exitSelect} aria-label="Exit select mode" className="hv-soft"
          style={{ width: 44, height: 44, border: 'none', borderRadius: 999, background: 'var(--elev)', color: 'var(--text)', fontSize: 18, cursor: 'pointer' }}>✕</button>
      ) : (
        <>
          <button onClick={() => setPhoneSelect(true)} className="hv-soft"
            style={{ minHeight: 36, padding: '0 14px', border: '1px solid var(--border)', borderRadius: 999, background: 'var(--elev)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Select
          </button>
          <button onClick={() => setPhoneQOpen(o => !o)} aria-pressed={phoneQOpen} aria-label="Search" className="hv-soft"
            style={{ width: 44, height: 44, border: 'none', borderRadius: 999, background: phoneQOpen ? 'var(--soft)' : 'none', color: 'var(--text)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg aria-hidden="true" width="17" height="17" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.6"/><path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          </button>
          <RowMenu
            open={phoneMenuOpen} onToggle={() => setPhoneMenuOpen(o => !o)} onClose={() => setPhoneMenuOpen(false)}
            label="More options"
            items={[{
              label: sort.key === 'signed' ? 'Sort newest first' : 'Sort by biggest expense',
              onClick: () => setSort(s => (s.key === 'signed' ? DEFAULT_SORT : { key: 'signed', dir: 'asc' })),
            }]}
          />
        </>
      )}
    </div>
    {phoneQOpen && !phoneSelect && (
      <div style={{ padding: '4px 16px 10px', display: 'flex' }}>
        <SearchField ref={searchRef} value={F.q} onChange={v => setF('q', v)} collapsed="100%" expanded="100%" height={44}
          placeholder={acct ? 'Search ' + acct.nickname : 'Search All Accounts'} label="Search transactions" />
      </div>
    )}
    {!phoneSelect && (needsCat.size > 0 || unclearedIds.size > 0) && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '6px 16px 12px' }}>
        {needsCat.size > 0 && (
          <button onClick={() => setPhoneFilter(f => (f === 'needsCat' ? 'all' : 'needsCat'))} aria-pressed={phoneFilter === 'needsCat'} className="hv-elev"
            style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--elev)', color: 'var(--text)', font: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ flex: 'none', minWidth: 22, height: 22, borderRadius: 999, background: 'var(--warn-soft)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{needsCat.size}</span>
            <span style={{ flex: 1, fontSize: 13.5 }}>{'To categorize'}</span>
            <span style={{ color: 'var(--accent)', fontSize: 13.5, fontWeight: 600 }}>{phoneFilter === 'needsCat' ? 'Show all' : 'Review'}</span>
          </button>
        )}
        {unclearedIds.size > 0 && (
          <button onClick={() => setPhoneFilter(f => (f === 'uncleared' ? 'all' : 'uncleared'))} aria-pressed={phoneFilter === 'uncleared'} className="hv-elev"
            style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--elev)', color: 'var(--text)', font: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ flex: 1, fontSize: 13.5 }}>{(phoneFilter === 'uncleared' ? 'Showing ' : 'Show ') + unclearedIds.size + ' uncleared transaction' + (unclearedIds.size === 1 ? '' : 's')}</span>
            <span aria-hidden="true" style={{ color: 'var(--muted)' }}>{phoneFilter === 'uncleared' ? '✕' : '›'}</span>
          </button>
        )}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 3: Make the desktop BulkBar desktop-only and render the phone select chrome**

Wrap the existing `{sel.length > 0 ? <BulkBar .../> : <BulkBar .../>}` block in `{!phone && (...)}`. Then, after the list `<section>`, add the phone Select-mode chrome:

```jsx
{phone && phoneSelect && (
  <>
    {(sel.length > 0 || schedSel.size > 0) && (
      <div role="status" style={{
        position: 'fixed', left: '50%', transform: 'translateX(-50%)',
        bottom: 'calc(140px + env(safe-area-inset-bottom))', zIndex: 41,
        padding: '10px 18px', borderRadius: 16, textAlign: 'center',
        background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
        border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0, 0, 0, .28)',
        backdropFilter: 'blur(8px)',
      }}>
        <div className="tnum" style={{ fontSize: 17, fontWeight: 700 }}>
          {fmt.moneyS(sel.length > 0 ? selectedTotal : schedSelectedTotal)}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
          {(sel.length > 0 ? sel.length : schedSel.size) + ' transaction' + ((sel.length > 0 ? sel.length : schedSel.size) === 1 ? '' : 's') + ' selected'}
        </div>
      </div>
    )}
    <div style={{
      position: 'fixed', left: 16, right: 16,
      bottom: 'calc(76px + env(safe-area-inset-bottom))', zIndex: 39,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    }}>
      <button onClick={() => setPickerOpen(true)} disabled={sel.length === 0} className="hv-soft"
        style={{ minHeight: 48, padding: '0 18px', border: '1px solid var(--border)', borderRadius: 999, background: 'var(--surface)', color: sel.length === 0 ? 'var(--muted)' : 'var(--text)', fontSize: 14, fontWeight: 600, cursor: sel.length === 0 ? 'default' : 'pointer', boxShadow: '0 8px 24px rgba(0, 0, 0, .28)' }}>
        Categorize
      </button>
      <button onClick={bulkToggleCleared} disabled={sel.length === 0} aria-label="Toggle cleared" className="hv-soft"
        style={{ width: 48, height: 48, border: '1px solid var(--border)', borderRadius: 999, background: 'var(--surface)', color: sel.length === 0 ? 'var(--muted)' : 'var(--text)', fontSize: 15, fontWeight: 700, cursor: sel.length === 0 ? 'default' : 'pointer', boxShadow: '0 8px 24px rgba(0, 0, 0, .28)' }}>
        ⓒ
      </button>
      <div style={{ position: 'relative' }}>
        <button onClick={() => setPhoneMoreOpen(o => !o)} disabled={sel.length === 0 && schedSel.size === 0} aria-label="More actions" aria-expanded={phoneMoreOpen} className="hv-soft"
          style={{ width: 48, height: 48, border: '1px solid var(--border)', borderRadius: 999, background: 'var(--surface)', color: (sel.length === 0 && schedSel.size === 0) ? 'var(--muted)' : 'var(--text)', fontSize: 18, cursor: 'pointer', boxShadow: '0 8px 24px rgba(0, 0, 0, .28)' }}>
          ⋯
        </button>
        {phoneMoreOpen && (
          <div role="menu" style={{ position: 'absolute', right: 0, bottom: 56, minWidth: 200, padding: 6, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0, 0, 0, .28)', display: 'flex', flexDirection: 'column' }}>
            {(sel.length > 0
              ? [singleEditItem(), { label: 'Duplicate', onClick: bulkDuplicate }, { divider: true }, { label: 'Delete', tone: 'neg', onClick: bulkDelete }]
              : schedMore()
            ).filter(Boolean).map((it, i) => it.divider
              ? <span key={i} aria-hidden="true" style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              : (
                <button key={it.label} role="menuitem" onClick={() => { setPhoneMoreOpen(false); it.onClick(); }} className="hv-soft"
                  style={{ minHeight: 44, padding: '0 12px', border: 'none', borderRadius: 8, background: 'none', color: it.tone === 'neg' ? 'var(--neg)' : 'var(--text)', font: 'inherit', fontSize: 14, textAlign: 'left', cursor: 'pointer' }}>
                  {it.label}
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  </>
)}
```

- [ ] **Step 4: Update the `TxPhoneList` call site** to the Task 4 interface:

```jsx
<TxPhoneList
  groups={groups} postedRows={phoneRows}
  scheduled={scheduled} schedKey={schedKey}
  schedOpen={schedOpen} onToggleSchedOpen={() => setSchedOpen(o => !o)}
  overdueCount={overdueCount} hiddenRuleCount={hiddenRuleCount}
  hideAccount={!!accountId} needsCat={needsCat}
  selectMode={phoneSelect} selected={selected} schedSel={schedSel}
  onToggleRow={(id, on) => toggleRow(id, on)}   /* no event → additive branch, YNAB multi-toggle */
  onToggleSched={toggleSched}
  onRowTap={t => openers.editTx(S, t.id, openDrawer)}
  onSchedTap={x => (x.row.isRule ? navigate('/recurring/' + x.row.ruleId) : openers.editTx(S, x.selId, openDrawer))}
/>
```

- [ ] **Step 5: Tests + build; commit Tasks 4+5 together if Task 4 was not committed**

Run: `pnpm test` and `pnpm build` → green.

```bash
git add src/screens/Transactions.jsx src/components/TxPhoneList.jsx
git commit -m "Mobile tx: YNAB Spending chrome — title bar, banners, Select mode, floating actions"
```

---

### Task 6: Category picker sheet + Categorize wiring (phone + desktop menu item)

**Files:**
- Create: `src/components/CategoryPickerSheet.jsx`
- Modify: `src/screens/Transactions.jsx` (render sheet; desktop `more` menu gains "Categorize…")

**Interfaces:**
- Consumes: `envelopeFor(store, month, now)` (`src/lib/envelope.js:104`, returns `{ rows: Map(catId → {available, ...}), ... }`), `useMonth()` (`src/store/MonthContext.jsx`), `useMoney()`, `S.categoryGroups` (id/name/sortOrder) + `S.categories` (groupId, status, type), `openers.addCategory(openDrawer)`.
- Produces: `CategoryPickerSheet({ open, onClose, onPick })` — `onPick(categoryId)` fires and the HOST closes; used by Task 5's `bulkCategorize`.

- [ ] **Step 1: Create the sheet**

```jsx
// Phone-first category picker bottom sheet (YNAB): grouped categories with
// envelope Available on the right, search docked at the BOTTOM (thumb reach),
// "+ New Category" opens the existing category drawer. Used by Spending's
// Select-mode Categorize (desktop reuses it from the bulk more-menu). Spec:
// docs/superpowers/specs/2026-08-12-mobile-tabbar-ynab-spending-design.md
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/StoreProvider.jsx';
import { useMonth } from '../store/MonthContext.jsx';
import { useMoney } from '../lib/format.js';
import { nowIso } from '../lib/dates.js';
import { envelopeFor } from '../lib/envelope.js';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { openers } from '../drawers/openers.js';

export default function CategoryPickerSheet({ open, onClose, onPick }) {
  const { data: S } = useStore();
  const { month } = useMonth();
  const { money } = useMoney();
  const { openDrawer } = useDrawer();
  const [q, setQ] = useState('');
  useEffect(() => { if (open) setQ(''); }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const env = useMemo(() => (open ? envelopeFor(S, month, nowIso()) : null), [open, S, month]);
  const sections = useMemo(() => {
    if (!open) return [];
    const ql = q.trim().toLowerCase();
    const cats = (S.categories || []).filter(c => c.type === 'expense' && c.status === 'active'
      && (!ql || c.name.toLowerCase().includes(ql)));
    const groups = [...(S.categoryGroups || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name));
    const ids = new Set(groups.map(g => g.id));
    const byGroup = key => cats.filter(c => ((c.groupId && ids.has(c.groupId)) ? c.groupId : 'other') === key)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name));
    return [...groups.map(g => ({ id: g.id, name: g.name, cats: byGroup(g.id) })),
      { id: 'other', name: 'Other', cats: byGroup('other') }]
      .filter(s => s.cats.length > 0);
  }, [open, S.categories, S.categoryGroups, q]);

  if (!open) return null;
  const availColor = n => (n > 0 ? 'var(--pos)' : n < 0 ? 'var(--neg)' : 'var(--muted)');
  return (
    <div role="dialog" aria-modal="true" aria-label="Select category"
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'rgba(0, 0, 0, .45)' }} />
      <div style={{ position: 'relative', maxHeight: '82dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', borderRadius: '16px 16px 0 0', border: '1px solid var(--border)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <button onClick={onClose} aria-label="Close" className="hv-soft"
            style={{ width: 40, height: 40, border: 'none', borderRadius: 999, background: 'var(--elev)', color: 'var(--text)', fontSize: 16, cursor: 'pointer', flex: 'none' }}>✕</button>
          <span style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 700, marginRight: 40 }}>Select Category</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 76px' }}>
          <button onClick={() => { onClose(); openers.addCategory(openDrawer); }} className="hv-elev"
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 48, padding: '0 14px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--accent)', font: 'inherit', fontSize: 14.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
            ＋ New Category
          </button>
          {sections.map(sec => (
            <section key={sec.id} aria-label={sec.name}>
              <h3 style={{ margin: '18px 2px 8px', fontSize: 13.5, fontWeight: 700 }}>{sec.name}</h3>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                {sec.cats.map((c, i) => {
                  const avail = env.rows.get(c.id)?.available ?? 0;
                  return (
                    <button key={c.id} onClick={() => onPick(c.id)} className="hv-elev"
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 48, padding: '8px 14px', border: 'none', borderBottom: i === sec.cats.length - 1 ? 'none' : '1px solid var(--border)', background: 'none', color: 'var(--text)', font: 'inherit', fontSize: 14, cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                      <span className="tnum" style={{ flex: 'none', fontSize: 13.5, fontWeight: 600, color: availColor(avail) }}>{money(avail)}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          {sections.length === 0 && (
            <p style={{ margin: '24px 2px', fontSize: 13.5, color: 'var(--muted)' }}>No categories match “{q}”.</p>
          )}
        </div>
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search Categories" aria-label="Search categories"
            style={{ width: '100%', boxSizing: 'border-box', height: 46, padding: '0 16px', borderRadius: 999, border: '1px solid var(--border)', background: 'color-mix(in srgb, var(--elev) 92%, transparent)', color: 'var(--text)', font: 'inherit', fontSize: 15, outline: 'none', boxShadow: '0 8px 24px rgba(0, 0, 0, .28)', backdropFilter: 'blur(8px)' }} />
        </div>
      </div>
    </div>
  );
}
```

Before writing, confirm the `useMonth()` return shape: `grep -n "useMonth\|value=" src/store/MonthContext.jsx` — if it returns the month string directly (not `{ month }`), destructure accordingly. Also confirm `--pos` exists in `theme.css` (`grep -- '--pos' src/styles/theme.css`); if the token is named differently (e.g. only `amtColor` uses it via another name), use the token the Plan screen uses for positive Available amounts.

- [ ] **Step 2: Render + wire in `Transactions.jsx`**

Import and render once, after the select chrome:

```jsx
<CategoryPickerSheet open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={bulkCategorize} />
```

Desktop bulk `more` menu (the recorded-selection `<BulkBar more={[...]} />`) gains, after 'Duplicate':

```jsx
{ label: 'Categorize…', onClick: () => setPickerOpen(true) },
```

(The sheet renders fine over desktop too; it is modal and self-dismissing.)

- [ ] **Step 3: Tests + build; commit**

Run: `pnpm test` and `pnpm build` → green.

```bash
git add src/components/CategoryPickerSheet.jsx src/screens/Transactions.jsx
git commit -m "Mobile tx: category picker sheet; Categorize bulk action (phone bar + desktop menu)"
```

**Spec deviations locked in this task** (documented in the spec's allowed-fallback clause): no "Split Between Categories" row (this phase's only picker context is bulk categorize, where split doesn't apply) and no RTA/inflow pinned group (same reason — deferred to the keypad phase's edit context). "+ New Category" opens the existing category drawer without auto-selecting into the bulk action.

---

### Task 7: Live verification on iPhone 15 Pro viewport + fixes

**Files:**
- Possibly modify: any file above (fixes); `docs/superpowers/specs/2026-08-12-mobile-tabbar-ynab-spending-design.md` (mark criteria verified)

- [ ] **Step 1: Delegate to a Playwright testing subagent** (established repo protocol — the subagent tests AND fixes). Instruct it to: start the dev server; mount via the auth-stubbed throwaway harness used by the previous mobile-tx verification (see commits `358612e`, `f924a3` context and `docs/superpowers/specs/2026-08-12-mobile-transactions-design.md` — stub via `resolveId`, not alias); viewport 393×852; seed enough data to exercise every state (uncleared, uncategorized, scheduled rule, future tx, transfer, multi-account).

- [ ] **Step 2: Walk the spec's acceptance criteria 1–7** (bottom of the spec doc): five-tab navigation + active states; pill on all five screens opening the add sheet; day-grouped list; tap-opens-editor; Select mode end-to-end (select → Categorize via sheet → ⓒ toggle → ⋯ Delete); banners filtering and resetting; scheduled disclosure; desktop 1280px register unchanged (spot-check: table, toolbar, BulkBar with new Categorize… item); last row not trapped under floating chrome.

- [ ] **Step 3: Fix everything found, re-verify, then commit**

```bash
git add -A
git commit -m "Mobile tx: live-verification fixes (YNAB Spending iteration)"
```

- [ ] **Step 4: Mark acceptance criteria verified in the spec doc and commit**

```bash
git add docs/superpowers/specs/2026-08-12-mobile-tabbar-ynab-spending-design.md
git commit -m "Spec: mark mobile tab bar + YNAB Spending criteria verified"
```
