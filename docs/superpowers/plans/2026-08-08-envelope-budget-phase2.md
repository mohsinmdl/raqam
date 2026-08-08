# Envelope Budget Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The money-moving layer: Assign ▾ popover, RTA breakdown, calculator field + read-only Moves history, and Available-pill move/cover popovers — all sharing one grouped category picker.

**Architecture:** One `moveAssigned` reducer (either side `'rta'`, one undo step, one audit row) + a pure `applyCalcExpr` helper; a shared `PlanCategoryPicker`; four small module-scope popover components wired into the existing `Plan.jsx` (its `usePopoverDismiss`/ctx patterns).

**Tech Stack:** React 18, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-08-envelope-budget-phase2-design.md` · **Visuals:** `2026-08-08-ynab-budget-reference.md` + task screenshots.

## Global Constraints

- **`moveAssigned` is ONE reducer**: single new `assignments` array, ONE audit row (`entityType:'assignment'`, `action:'move'`, `after:{from,to,amount,month}`), one undo step. No chaining of two `setAssigned` calls.
- No-op cases return the SAME reference: `amount <= 0` (after `Math.round`), `from === to`, both sides `'rta'`, unknown category id on either non-rta side.
- Assigned may go negative (moving more than assigned is allowed) — no clamping.
- `applyCalcExpr(current, input)` → number or **null** (null = invalid, editor stays open). Accepts plain numbers (via `parseAmt`) and leading-operator forms `+ - − × * ÷ /`; `÷0` → null; result `Math.round`ed, may be negative.
- All new components module-scope (`tests/no-inline-components.test.js` scans `src/screens/*.jsx`).
- Popovers follow the existing `usePopoverDismiss` contract in `Plan.jsx:32` (capture-phase Escape + outside mousedown); white card, radius 12, shadow, caret where the reference shows one.
- Picker lists **active expense** categories grouped by `sortOrder` (implicit Other last), each with its Available from `env.rows` colored by sign; "Inflow: Ready to Assign" first unless `excludeRta`.
- Keep the full vitest suite green and `npx vite build` clean after every task.

---

### Task 1: `applyCalcExpr` — pure calculator helper

**Files:**
- Create: `src/lib/calcExpr.js`
- Test: `tests/calc-expr.test.js`

**Interfaces:**
- Consumes: `parseAmt` (`src/lib/util.js`, re-exported by `src/lib/format.js`).
- Produces: `applyCalcExpr(current: number, input: string) → number | null`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { applyCalcExpr } from '../src/lib/calcExpr.js';

describe('applyCalcExpr', () => {
  it('plain numbers replace the value', () => {
    expect(applyCalcExpr(5000, '12000')).toBe(12000);
    expect(applyCalcExpr(5000, '12,000')).toBe(12000);
    expect(applyCalcExpr(5000, '  700 ')).toBe(700);
  });
  it('applies leading operators to the current value', () => {
    expect(applyCalcExpr(5000, '+500')).toBe(5500);
    expect(applyCalcExpr(5000, '-500')).toBe(4500);
    expect(applyCalcExpr(5000, '−500')).toBe(4500);   // unicode minus
    expect(applyCalcExpr(5000, '×2')).toBe(10000);
    expect(applyCalcExpr(5000, '*2')).toBe(10000);
    expect(applyCalcExpr(5000, '÷4')).toBe(1250);
    expect(applyCalcExpr(5000, '/4')).toBe(1250);
  });
  it('rounds results and allows negatives', () => {
    expect(applyCalcExpr(100, '÷3')).toBe(33);
    expect(applyCalcExpr(100, '-250')).toBe(-150);
    expect(applyCalcExpr(100, '×1.5')).toBe(150);
  });
  it('rejects invalid input with null', () => {
    expect(applyCalcExpr(100, '')).toBe(null);
    expect(applyCalcExpr(100, 'abc')).toBe(null);
    expect(applyCalcExpr(100, '+')).toBe(null);
    expect(applyCalcExpr(100, '÷0')).toBe(null);
    expect(applyCalcExpr(100, '+-3')).toBe(null);
  });
});
```

- [ ] **Step 2: Verify it fails** (`npx vitest run tests/calc-expr.test.js`).

- [ ] **Step 3: Implement `src/lib/calcExpr.js`**

```js
// Calculator commit for the ASSIGNED editor: a plain number replaces the value;
// a leading operator applies it to the current value ('+500' → current + 500).
// Returns null for anything invalid so the editor can stay open. Pure.
import { parseAmt } from './util.js';

const OPS = { '+': (a, b) => a + b, '-': (a, b) => a - b, '−': (a, b) => a - b, '×': (a, b) => a * b, '*': (a, b) => a * b, '÷': (a, b) => a / b, '/': (a, b) => a / b };

export function applyCalcExpr(current, input) {
  const s = String(input || '').trim();
  if (!s) return null;
  const op = OPS[s[0]];
  const numText = op ? s.slice(1).trim() : s;
  if (!numText || !/^[\d.,\s]+$/.test(numText)) return null;
  const n = parseAmt(numText);
  if (!Number.isFinite(n)) return null;
  if (!op) return Math.round(n);
  if ((s[0] === '÷' || s[0] === '/') && n === 0) return null;
  return Math.round(op(current, n));
}
```

(Check `parseAmt`'s exact behavior in `src/lib/util.js` first — if it strips non-numerics itself, keep the `/^[\d.,\s]+$/` guard anyway so `'abc'` and `'+-3'` fail rather than parse partially.)

- [ ] **Step 4: Tests pass; full suite; build.**
- [ ] **Step 5: Commit** — `git add src/lib/calcExpr.js tests/calc-expr.test.js && git commit -m "Envelope: applyCalcExpr calculator helper with tests"`

---

### Task 2: `moveAssigned` action

**Files:**
- Modify: `src/store/actions.js` (next to `setAssigned`)
- Test: `tests/move-assigned.test.js`

**Interfaces:**
- Produces: `moveAssigned(data, { from, to, month, amount })` — `from`/`to` are a category id or `'rta'`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { moveAssigned } from '../src/store/actions.js';

const store = over => ({
  categoryGroups: [{ id: 'g1', name: 'Needs', sortOrder: 1 }],
  categories: [
    { id: 'groc', name: 'Groceries', type: 'expense', status: 'active', groupId: 'g1' },
    { id: 'fun', name: 'Fun', type: 'expense', status: 'active', groupId: 'g1' },
  ],
  assignments: [{ id: 'x1', category: 'groc', month: '2026-08', amount: 10000 }],
  transactions: [], budgets: [], accounts: [], cards: [], recurring: [], snapshots: [], audit: [],
  ...(over || {}),
});
const amt = (s, cat) => { const a = s.assignments.find(x => x.category === cat && x.month === '2026-08'); return a ? a.amount : 0; };

describe('moveAssigned', () => {
  it('moves between two categories in one step with one audit row', () => {
    const s = moveAssigned(store(), { from: 'groc', to: 'fun', month: '2026-08', amount: 3000 });
    expect(amt(s, 'groc')).toBe(7000);
    expect(amt(s, 'fun')).toBe(3000);
    expect(s.audit).toHaveLength(1);
    expect(s.audit[0]).toMatchObject({ entityType: 'assignment', action: 'move', after: { from: 'groc', to: 'fun', amount: 3000, month: '2026-08' } });
  });
  it('rta → category assigns; category → rta unassigns', () => {
    const a = moveAssigned(store(), { from: 'rta', to: 'fun', month: '2026-08', amount: 500 });
    expect(amt(a, 'fun')).toBe(500);
    expect(amt(a, 'groc')).toBe(10000);
    const b = moveAssigned(store(), { from: 'groc', to: 'rta', month: '2026-08', amount: 10000 });
    expect(amt(b, 'groc')).toBe(0);
    expect(b.assignments.find(x => x.category === 'groc')).toBeUndefined(); // removed at zero
  });
  it('allows the source to go negative', () => {
    const s = moveAssigned(store(), { from: 'fun', to: 'groc', month: '2026-08', amount: 200 });
    expect(amt(s, 'fun')).toBe(-200);
    expect(amt(s, 'groc')).toBe(10200);
  });
  it('no-ops by reference on invalid input', () => {
    const s0 = store();
    expect(moveAssigned(s0, { from: 'groc', to: 'groc', month: '2026-08', amount: 100 })).toBe(s0);
    expect(moveAssigned(s0, { from: 'rta', to: 'rta', month: '2026-08', amount: 100 })).toBe(s0);
    expect(moveAssigned(s0, { from: 'groc', to: 'fun', month: '2026-08', amount: 0 })).toBe(s0);
    expect(moveAssigned(s0, { from: 'nope', to: 'fun', month: '2026-08', amount: 100 })).toBe(s0);
    expect(moveAssigned(s0, { from: 'groc', to: 'nope', month: '2026-08', amount: 100 })).toBe(s0);
  });
  it('summary names both sides, with rta as Ready to Assign', () => {
    const s = moveAssigned(store(), { from: 'rta', to: 'fun', month: '2026-08', amount: 500 });
    expect(s.audit[0].summary).toContain('Ready to Assign');
    expect(s.audit[0].summary).toContain('Fun');
  });
});
```

- [ ] **Step 2: Verify it fails.**

- [ ] **Step 3: Implement in `actions.js`** (after `setAssigned`; reuses its upsert mechanics inline):

```js
// Move assigned money between two envelopes (or Ready to Assign) as ONE step:
// one new assignments array, one audit row, one undo entry. Either side may be
// 'rta' (from: plain assign; to: unassign). Sources may go negative — YNAB
// permits pulling more than is assigned.
export function moveAssigned(data, { from, to, month, amount }) {
  const amt = Math.round(amount) || 0;
  if (amt <= 0 || from === to || (from === 'rta' && to === 'rta')) return data;
  const catOf = id => data.categories.find(c => c.id === id);
  if (from !== 'rta' && !catOf(from)) return data;
  if (to !== 'rta' && !catOf(to)) return data;

  let assignments = [...(data.assignments || [])];
  const bump = (categoryId, delta) => {
    const existing = assignments.find(a => a.category === categoryId && a.month === month);
    const next = (existing ? existing.amount : 0) + delta;
    if (existing && next === 0) assignments = assignments.filter(a => a !== existing);
    else if (existing) assignments = assignments.map(a => (a === existing ? { ...a, amount: next } : a));
    else assignments.push({ id: uid(), category: categoryId, month, amount: next });
  };
  if (from !== 'rta') bump(from, -amt);
  if (to !== 'rta') bump(to, amt);

  const nameOf = id => (id === 'rta' ? 'Ready to Assign' : (catOf(id) || {}).name || id);
  return {
    ...data, assignments,
    audit: [makeAudit({
      entityType: 'assignment', action: 'move', entityId: from + '>' + to + '|' + month,
      summary: 'Moved ' + amt + ' from ' + nameOf(from) + ' to ' + nameOf(to) + ' (' + month + ')',
      after: { from, to, amount: amt, month },
    }), ...(data.audit || [])],
  };
}
```

- [ ] **Step 4: Tests pass; full suite; build.**
- [ ] **Step 5: Commit** — `git add src/store/actions.js tests/move-assigned.test.js && git commit -m "Envelope: moveAssigned reducer (one step, one audit row) with tests"`

---

### Task 3: `PlanCategoryPicker`

**Files:**
- Create: `src/ui/PlanCategoryPicker.jsx`

**Interfaces:**
- Consumes: nothing new — receives `{ env, S, month, money, onPick, excludeRta, excludeId }` as props (`env` = `envelopeFor` result).
- Produces: a dropdown panel component (module-scope) the Task 4/5 popovers embed.

- [ ] **Step 1: Create the component**

```jsx
import { useMemo, useRef, useState } from 'react';

// Grouped category dropdown for Assign / Move / Cover popovers: search input over
// "Inflow: Ready to Assign" + groups (sortOrder, implicit Other last) of active
// expense categories, each with its Available colored by sign. Keyboard: ↑/↓
// moves, Enter picks. The HOSTING popover owns open/dismiss; this is the panel.
export default function PlanCategoryPicker({ env, S, month, money, onPick, excludeRta, excludeId }) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const listRef = useRef(null);

  const flat = useMemo(() => {
    const norm = s => s.toLowerCase();
    const groups = [...(S.categoryGroups || [])].sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));
    const ids = new Set(groups.map(g => g.id));
    const cats = S.categories.filter(c => c.type === 'expense' && c.status === 'active' && c.id !== excludeId
      && (!q || norm(c.name).includes(norm(q))));
    const out = [];
    if (!excludeRta && (!q || 'ready to assign'.includes(norm(q)))) out.push({ kind: 'rta' });
    groups.forEach(g => {
      const members = cats.filter(c => c.groupId === g.id);
      if (members.length) { out.push({ kind: 'head', name: g.name }); members.forEach(c => out.push({ kind: 'cat', cat: c })); }
    });
    const other = cats.filter(c => !c.groupId || !ids.has(c.groupId));
    if (other.length) { out.push({ kind: 'head', name: 'Other' }); other.forEach(c => out.push({ kind: 'cat', cat: c })); }
    return out;
  }, [S, q, excludeRta, excludeId]);

  const pickable = flat.filter(x => x.kind !== 'head');
  const clampHi = i => Math.max(0, Math.min(pickable.length - 1, i));
  const pick = item => item && onPick(item.kind === 'rta' ? 'rta' : item.cat.id);
  const onKey = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => clampHi(h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => clampHi(h - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(pickable[clampHi(hi)]); }
  };
  const availOf = id => (env.rows.get(id) || {}).available || 0;
  const tone = v => (v > 0 ? 'var(--pos)' : v < 0 ? 'var(--neg)' : 'var(--muted)');

  let pi = -1; // pickable index while rendering
  return (
    <div style={{ width: 280 }}>
      <input autoFocus value={q} onChange={e => { setQ(e.target.value); setHi(0); }} onKeyDown={onKey}
        placeholder="Search categories" aria-label="Search categories"
        style={{ width: '100%', boxSizing: 'border-box', height: 34, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }} />
      <div ref={listRef} style={{ maxHeight: 260, overflowY: 'auto', marginTop: 8 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, padding: '4px 2px 6px' }}>Plan Categories</div>
        {flat.map((item, i) => {
          if (item.kind === 'head') return <div key={'h' + i} style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', padding: '6px 2px 2px' }}>{item.name}:</div>;
          pi += 1;
          const active = pi === clampHi(hi);
          const isRta = item.kind === 'rta';
          const label = isRta ? 'Ready to Assign' : item.cat.name;
          const val = isRta ? env.rta : availOf(item.cat.id);
          return (
            <button key={isRta ? 'rta' : item.cat.id} onClick={() => pick(item)} className="hv-elev"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', border: 'none', textAlign: 'left', padding: '7px 8px', borderRadius: 7, cursor: 'pointer', fontSize: 13, background: active ? 'var(--soft)' : (isRta ? 'var(--elev)' : 'transparent'), color: 'var(--text)' }}>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isRta ? 'Inflow: Ready to Assign' : label}</span>
              <span className="tnum" style={{ flex: 'none', fontWeight: 600, color: tone(val) }}>{money(val)}</span>
            </button>
          );
        })}
        {pickable.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: 8 }}>No matches.</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build + suite** (component compiles; nothing imports it yet).
- [ ] **Step 3: Commit** — `git add src/ui/PlanCategoryPicker.jsx && git commit -m "Envelope: shared PlanCategoryPicker panel"`

---

### Task 4: Assign ▾ popover + RTA breakdown

**Files:**
- Modify: `src/screens/Plan.jsx`

**Interfaces:**
- Consumes: `moveAssigned` (T2), `PlanCategoryPicker` (T3), existing `usePopoverDismiss` (`Plan.jsx:32`), `RtaBanner` (`Plan.jsx:90`), `envelopeFor`, `parseAmt`, `prevMonth` (`src/lib/calc.js` — confirm export; else compute via `addMonths(month, -1)` from `src/lib/dates.js`).

- [ ] **Step 1: Read `Plan.jsx` fully.** Note the `ctx` object passed to rows, the `env` memo (`:306`), and `RtaBanner`'s render (`:375`).

- [ ] **Step 2: Rework `RtaBanner` into a banner + two popovers (all module-scope):**
- The banner splits into: a clickable amount/label area (opens **RtaBreakdown**) and a dark-green **Assign ▾** button (opens **AssignPopover**) — colors per the existing 3-state logic; the Assign button only renders when `rta !== 0`.
- **AssignPopover** (module-scope): caret card under the button; tab strip `⚡ Auto` (disabled, `title="Targets coming later"`) / `Manually` (active, accent underline); body: label `Assign:` + amount input (prefilled `String(rta)`, select-all on focus) → label `To:` + a button showing the picked category name (or placeholder) that toggles an embedded `PlanCategoryPicker` (`excludeRta`) → footer `Cancel` / **`Assign`** (accent; disabled until a category is picked and `parseAmt(amount) > 0`). Confirm → `applyData(data => moveAssigned(data, { from: 'rta', to: picked, month, amount: parseAmt(amount) }))`, close, `notify('Assigned ' + money(amt) + ' to ' + name + '.')`.
- **RtaBreakdown** (module-scope): caret card; title "Ready to Assign Breakdown"; soft inner card with rows (label left, signed amount right, `tnum`): `Left over from last month` = `envelopeFor(S, prevMonth(month)).rta` (memoized alongside `env`) · `+ Opening balances` = `env.openingTotal` · `+ Inflow: income in <MonthName>` = `env.income` · `− Assigned in <MonthName>` = `env.assignedTotal` · `− Uncategorized outflows` = `env.uncategorized` · `− Last month's overspending` = derived `prevRta + openingTotal + income − assignedTotal − uncategorized − rta` · divider · **`Total Ready to Assign = <rta>`** (green when positive). Hide zero rows (never hide the total). Muted info note underneath: "Ready to Assign is money that hasn't been given a job yet. Assign it to one or more categories."

- [ ] **Step 3: Suite + build** (`no-inline-components` must stay green — every new component module-scope).

- [ ] **Step 4: Commit** — `git add src/screens/Plan.jsx && git commit -m "Envelope: Assign popover (manual) + Ready-to-Assign breakdown"`

---

### Task 5: ASSIGNED editor upgrades + Available-pill popovers

**Files:**
- Modify: `src/screens/Plan.jsx`

**Interfaces:**
- Consumes: `applyCalcExpr` (T1), `moveAssigned` (T2), `PlanCategoryPicker` (T3); the existing `CategoryRow` editor commit at `Plan.jsx:251`; `resolveDisplayName` (`src/lib/identity.js` — confirm path via SidebarUser's import) + auth email for the avatar initial.

- [ ] **Step 1: ASSIGNED editor (`CategoryRow`):**
- Commit path becomes: `const v = applyCalcExpr(currentAssigned, draft); if (v === null) { /* stay editing, select text */ } else applyData(data => setAssigned(data, { categoryId, month, amount: v }));` (Escape-cancel and Enter/blur wiring unchanged; keep the existing double-commit-safe behavior).
- While editing, render inside the field wrapper: the `+−×÷` glyph (muted, left), and the **clock** button (right; `aria-label="Assignment history"`). Below the field, a small caret popover with the 4 op buttons (`+ − × ÷`, 2×2 grid per the reference) — clicking one inserts that character into the draft at the cursor (or replaces a leading operator) and refocuses the input. The op popover opens automatically with the editor and dismisses with it.
- **MovesPopover** (module-scope; opened by the clock): title "Moves" + category name; table head DATE / MOVE / AMOUNT; rows from `S.audit` filtered to this category+month: entries with `entityType === 'assignment'` where (`a.after?.month === month` and (`a.after.from === catId || a.after.to === catId`)) for moves, or `a.entityId === catId + '|' + month` for set/create/update/delete. Labels: move+`to===catId` → `Moved from <nameOf(from)>`; move+`from===catId` → `Moved to <nameOf(to)>`; create/update → `Assigned`; delete → `Removed`. Amount = `a.after.amount ?? a.after?.amount`; date = `a.at` formatted `DD/MM/YYYY`; avatar chip = accent circle with the first letter of `resolveDisplayName(prefs.displayName, email)`. Footer **Close**. Read-only. Empty state: "No assignment activity for this month yet."
- [ ] **Step 2: Available-pill popovers (`CategoryRow`):**
- The AVAILABLE pill becomes a button when `available !== 0`.
- **Red pill → CoverPopover**: caret card "Cover overspending from"; the amount is fixed copy (`money(-available)`); embedded `PlanCategoryPicker` (includes RTA, `excludeId=this`); footer Cancel / **OK** (disabled until picked) → `applyData(data => moveAssigned(data, { from: picked, to: catId, month, amount: -availableValue }))`, notify.
- **Green pill → MovePopover**: caret card; `Move` label + amount input (default `String(available)`, select-all) + `To` + picker (includes RTA, `excludeId=this`); Cancel / **OK** (disabled until picked and `parseAmt > 0`) → `applyData(data => moveAssigned(data, { from: catId, to: picked, month, amount: parseAmt(amount) }))`, notify.
- [ ] **Step 3: Suite + build.** (Live Playwright verification is run by the controller afterwards, per Phase-1 convention — do not attempt it in this dispatch.)
- [ ] **Step 4: Commit** — `git add src/screens/Plan.jsx && git commit -m "Envelope: calculator editor + Moves history + cover/move popovers"`

---

## Self-Review notes

- **Spec coverage:** moveAssigned (T2) ✓ calculator typed+buttons (T1+T5) ✓ clock/Moves read-only history (T5) ✓ Assign popover with disabled Auto tab (T4) ✓ RTA breakdown with exact-sum lines (T4) ✓ cover/move pill popovers (T5) ✓ shared picker (T3) ✓.
- **Type consistency:** `moveAssigned({from,to,month,amount})` defined T2, called identically in T4 (`from:'rta'`) and T5 (both directions); `applyCalcExpr(current, input) → number|null` defined T1, consumed T5; `PlanCategoryPicker` props `{env,S,month,money,onPick,excludeRta,excludeId}` defined T3, used T4/T5.
- **No placeholders:** T1–T3 carry complete code; T4/T5 are wiring into the already-shipped `Plan.jsx` with exact anchors (`:32`, `:90`, `:251`, `:306`) and full behavioral contracts (the implementer reads the file first, as in Phase 1's Task 6, which shipped clean).
- **Verification:** unit coverage on both new pure surfaces; screen work verified by build + guard + the controller's live Playwright pass against the YNAB tab; `prevMonth`/`resolveDisplayName` import paths flagged for confirmation rather than guessed.
