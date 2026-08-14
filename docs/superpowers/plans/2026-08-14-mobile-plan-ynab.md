# Mobile Plan (YNAB-style) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the /budget Plan screen a dedicated YNAB-style phone experience — two-column list, custom keypad assign sheet, money-move bottom sheets, month-grid picker + overflow menu — shipped as a 4-PR gh-stack.

**Architecture:** `Plan.jsx` gates `phone ? <PlanPhone/> : <desktop tree>`; all new UI lives in `src/ui/plan/phone/` and reuses the existing store actions, calculator, auto-assign, and picker. Overlays are Base UI via `src/ui/primitives/` (Popover/BottomSheet exist; Menu is added here). Desktop rendering is untouched.

**Tech Stack:** React 18 (plain JSX, inline styles + CSS vars), `@base-ui/react` 1.7.0 (popover/dialog/menu), vitest (node env — no jsdom), gh-stack.

**Spec:** `docs/superpowers/specs/2026-08-14-mobile-plan-ynab-design.md` (committed on this branch). Read it before any task.

## Global Constraints

- Design: "Trusted Ledger" only — flat surfaces, 1px `var(--border)` hairlines, the single `var(--shadow)` on overlays, teal (`--accent`) on actionable elements only, `--pos/-soft` `--neg/-soft` pills, `.tnum` on all numerals. NO YNAB purple/lime.
- All new interactive primitives are Base UI (standing convention). Base UI composition uses the `render` prop, never `asChild`. Verify part names/props against `node_modules/@base-ui/react/**/*.d.ts` when unsure.
- Desktop Plan behavior/markup unchanged (only additions: the phone gate, a `pick` on MonthContext, an export from RecentMoves).
- No new business logic: money writes go through `setAssigned`/`moveAssigned` (`src/store/actions.js:1053/1078`); calculator via `applyCalcExpr` (`src/lib/calcExpr.js`); auto-assign via `autoAssignAmount` (`src/lib/inspector.js`).
- The keypad display must never open the OS keyboard (no focusable text input on phone assign flow).
- Tests: vitest node env; component behavior is verified live (Playwright), not with jsdom.
- Bottom-pinned overlays: zIndex 60, `paddingBottom: env(safe-area-inset-bottom)`; they may cover the MobileTabBar (zIndex 40) like `.drawer-panel` does.
- Each PR = one stack branch; commit per task; never push to main; PRs stay drafts.

## Stack mechanics (controller, not a subagent task)

Worktree: `/Users/dev/projects/raqam/.claude/worktrees/mobile-plan`. Branch `feat/mobile-plan-list` exists with the spec commit, based on main @ 05b3022 (includes #119 `phone` in Plan.jsx and #121 Base UI primitives).

1. `gh stack init feat/mobile-plan-list` (adopts the existing branch).
2. Task 1 commits land on it.
3. `gh stack add feat/mobile-plan-keypad` → Tasks 2–3.
4. `gh stack add feat/mobile-plan-sheets` → Task 4.
5. `gh stack add feat/mobile-plan-monthmenu` → Tasks 5–7.
6. `gh stack submit --auto` (drafts) · `gh stack view --json` to verify.
7. Final: live Playwright verification + `/accessibility` audit (Task 8), fixes committed to the owning branch + `gh stack rebase --upstack` as needed.

---

### Task 1: PR1 — PlanPhone list (read-only foundation)

**Files:**
- Create: `src/ui/plan/phone/PlanPhone.jsx`
- Modify: `src/screens/Plan.jsx` (~line 1264, before the desktop `return`)
- Test: none (visual; suite must stay green)

**Interfaces:**
- Consumes (all already in scope at `Plan.jsx:1031+`): `S` (store data), `env` (from `envelopeFor` — `env.rta` number, `env.rows` Map catId→`{assigned, activity, available}`), `month`, `money` (formatter), `collapsed` Set + `toggleGroup(key)`, `phone` boolean.
- Produces: `<PlanPhone S env month money collapsed toggleGroup onAssignTap onPillTap onRtaTap onCoverTap />` — the four `on*Tap` handlers are OPTIONAL (default no-op) and are wired by Tasks 3–4. `PlanPhone` also exports `phoneRowsFor(S, env, collapsed)` for reuse: returns `[{ kind:'group', key, name, assigned, available, collapsed } | { kind:'cat', cat, row } ]` plus `{ hiddenCount, overspent: [{cat,row}...] }`.

- [ ] **Step 1: Create `PlanPhone.jsx`**

```jsx
import { useMemo } from 'react';

// Phone render path for the Plan screen — YNAB's mobile anatomy in ledger
// tokens. Read-only skeleton in PR1: taps are wired by the keypad (PR2) and
// sheets (PR3) layers via the on*Tap props.
const hair = '1px solid var(--border)';
const colHead = { fontSize: 11, fontWeight: 600, color: 'var(--muted)', lineHeight: 1.2 };

// Derives the flat list the phone screen renders. Groups in sortOrder, their
// active expense categories, per-group Assigned/Available sums from env.rows.
export function phoneRowsFor(S, env, collapsed) {
  const groups = [...(S.categoryGroups || [])].sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));
  const cats = (S.categories || []).filter(c => c.type === 'expense');
  const active = cats.filter(c => c.status === 'active');
  const hiddenCount = cats.filter(c => c.status === 'archived').length;
  const out = [];
  const overspent = [];
  const bucket = gid => active.filter(c => (c.groupId || null) === gid);
  const emit = (key, name, members) => {
    if (!members.length) return;
    let assigned = 0, available = 0;
    const rows = members.map(cat => {
      const row = env.rows.get(cat.id) || { assigned: 0, activity: 0, available: 0 };
      assigned += row.assigned; available += row.available;
      if (row.available < 0) overspent.push({ cat, row });
      return { kind: 'cat', cat, row };
    });
    out.push({ kind: 'group', key, name, assigned, available, collapsed: collapsed.has(key) });
    if (!collapsed.has(key)) out.push(...rows);
  };
  const ids = new Set(groups.map(g => g.id));
  groups.forEach(g => emit(g.id, g.name, bucket(g.id)));
  const other = active.filter(c => !c.groupId || !ids.has(c.groupId));
  emit('__other', 'Other', other);
  return { list: out, hiddenCount, overspent };
}

const pillTone = v => v > 0 ? { background: 'var(--pos-soft)', color: 'var(--pos)' }
  : v < 0 ? { background: 'var(--neg-soft)', color: 'var(--neg)' }
  : { background: 'var(--track)', color: 'var(--muted)' };

export default function PlanPhone({
  S, env, month, money, collapsed, toggleGroup,
  onAssignTap = () => {}, onPillTap = () => {}, onRtaTap = null, onCoverTap = null,
  assignDraft = null, // { catId, text } while the keypad edits a row (PR2)
}) {
  const { list, hiddenCount, overspent } = useMemo(
    () => phoneRowsFor(S, env, collapsed), [S, env, collapsed]);
  const rtaNeg = env.rta < 0;
  return (
    <div style={{ padding: '10px 12px 0' }}>
      {/* RTA banner — tap opens the Assign sheet (PR3). Until wired it is a
          static region, so render a div, not a dead button. */}
      {(() => {
        const Tag = onRtaTap ? 'button' : 'div';
        return (
          <Tag onClick={onRtaTap || undefined}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              width: '100%', border: 'none', borderRadius: 12, padding: '14px 16px', marginBottom: 10,
              cursor: onRtaTap ? 'pointer' : 'default', textAlign: 'left',
              background: rtaNeg ? 'var(--neg-soft)' : 'var(--pos-soft)',
              color: rtaNeg ? 'var(--neg)' : 'var(--pos)' }}>
            <span className="tnum" style={{ fontSize: 22, fontWeight: 700 }}>{money(env.rta)}</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Ready to Assign{onRtaTap ? ' ›' : ''}</span>
          </Tag>
        );
      })()}
      {overspent.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: hair, borderRadius: 12,
          padding: '10px 12px', marginBottom: 10, background: 'var(--surface)' }}>
          <span className="tnum" style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 999, background: 'var(--neg)', color: 'var(--on-neg)', fontSize: 12, fontWeight: 700 }}>
            {overspent.length}
          </span>
          <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>Overspent categories</span>
          {onCoverTap && (
            <button onClick={onCoverTap} className="hv-soft" style={{ border: 'none', borderRadius: 999,
              padding: '6px 14px', background: 'var(--soft)', color: 'var(--accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Cover
            </button>
          )}
        </div>
      )}
      <div style={{ background: 'var(--surface)', border: hair, borderRadius: 12, overflow: 'hidden' }}>
        {list.map(item => item.kind === 'group' ? (
          <button key={'g' + item.key} onClick={() => toggleGroup(item.key)}
            aria-expanded={String(!item.collapsed)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', border: 'none',
              borderBottom: hair, textAlign: 'left', padding: '10px 12px', cursor: 'pointer',
              background: 'var(--track)', color: 'var(--text)' }}>
            <span aria-hidden="true" style={{ flex: 'none', fontSize: 11, color: 'var(--muted)',
              transform: item.collapsed ? 'rotate(-90deg)' : 'none' }}>▼</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
            <span style={{ textAlign: 'right' }}>
              <span style={colHead}>Assigned</span>
              <span className="tnum" style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{money(item.assigned)}</span>
            </span>
            <span style={{ textAlign: 'right', minWidth: 84 }}>
              <span style={colHead}>Available</span>
              <span className="tnum" style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{money(item.available)}</span>
            </span>
          </button>
        ) : (
          <div key={item.cat.id} data-cat={item.cat.id}
            style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '4px 12px',
              borderBottom: hair,
              background: assignDraft && assignDraft.catId === item.cat.id ? 'var(--soft)' : 'transparent' }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 500,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {item.cat.emoji ? item.cat.emoji + ' ' : ''}{item.cat.name}
            </span>
            <button className="tnum" onClick={() => onAssignTap(item.cat, item.row)}
              aria-label={'Assigned for ' + item.cat.name}
              style={{ border: 'none', background: 'transparent', padding: '10px 4px', cursor: 'pointer',
                fontSize: 14.5, fontWeight: 600,
                color: assignDraft && assignDraft.catId === item.cat.id ? 'var(--accent)' : 'var(--text)' }}>
              {assignDraft && assignDraft.catId === item.cat.id ? assignDraft.text : money(item.row.assigned)}
            </button>
            <button className="tnum" onClick={() => item.row.available !== 0 && onPillTap(item.cat, item.row)}
              aria-label={'Available for ' + item.cat.name}
              style={{ flex: 'none', minWidth: 76, textAlign: 'center', border: 'none', borderRadius: 999,
                padding: '6px 10px', fontSize: 13.5, fontWeight: 700,
                cursor: item.row.available !== 0 ? 'pointer' : 'default', ...pillTone(item.row.available) }}>
              {money(item.row.available)}
            </button>
          </div>
        ))}
        {hiddenCount > 0 && (
          <div style={{ padding: '12px', fontSize: 13.5, color: 'var(--muted)' }}>
            {hiddenCount} hidden {hiddenCount === 1 ? 'category' : 'categories'}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Gate in `Plan.jsx`**

Directly before the desktop `return` (`Plan.jsx` ~:1264, AFTER all hooks so hook
order is stable), add:

```jsx
if (phone) {
  return (
    <PlanPhone S={S} env={env} month={month} money={money}
      collapsed={collapsed} toggleGroup={toggleGroup} />
  );
}
```

Import at top: `import PlanPhone from '../ui/plan/phone/PlanPhone.jsx';`
The gate must come after every `useState`/`useMemo`/`useEffect` in the component.

- [ ] **Step 3: Verify**

Run: `npx vitest run` → all pass (this task adds no logic under test).
Run: `npm run build` → succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/ui/plan/phone/PlanPhone.jsx src/screens/Plan.jsx
git commit -m "Plan: YNAB-style phone list (RTA banner, group totals, available pills)"
```

---

### Task 2: PR2a — keypad state reducer (TDD)

**Files:**
- Create: `src/ui/plan/phone/keypadState.js`
- Test: `tests/keypad-state.test.js`

**Interfaces:**
- Consumes: `applyCalcExpr(current, input)` from `src/lib/calcExpr.js` (returns rounded number or null).
- Produces (Task 3 relies on these exact names):
  - `pressDigit(draft, d) → draft'` — appends `'0'..'9'`; rejects a second leading zero on a fresh number segment.
  - `pressOp(draft, op) → draft'` — op ∈ `'−' '+' '×' '÷'`; appends; replaces a trailing op; allowed on empty draft (leading-op = adjust-current semantics).
  - `pressBackspace(draft) → draft'` — drops last char.
  - `pressClear() → ''`
  - `evaluate(current, draft) → number|null` — thin alias of `applyCalcExpr`; `''` → null.
  - `displayOf(draft) → string` — draft with each digit-run comma-grouped (`'1500+40'` → `'1,500+40'`); `''` → `''`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/keypad-state.test.js
import { describe, it, expect } from 'vitest';
import { pressDigit, pressOp, pressBackspace, pressClear, evaluate, displayOf } from '../src/ui/plan/phone/keypadState.js';

describe('keypad draft editing', () => {
  it('appends digits', () => {
    expect(pressDigit('', '5')).toBe('5');
    expect(pressDigit('5', '0')).toBe('50');
  });
  it('blocks a redundant leading zero per number segment', () => {
    expect(pressDigit('0', '0')).toBe('0');
    expect(pressDigit('', '0')).toBe('0');
    expect(pressDigit('0', '5')).toBe('5');      // 0 then 5 → 5, calculator style
    expect(pressDigit('10+0', '0')).toBe('10+0'); // second segment guarded too
    expect(pressDigit('10+0', '7')).toBe('10+7');
  });
  it('appends operators and replaces a trailing operator', () => {
    expect(pressOp('500', '+')).toBe('500+');
    expect(pressOp('500+', '×')).toBe('500×');
    expect(pressOp('', '+')).toBe('+'); // leading op → adjust-current semantics
  });
  it('backspace and clear', () => {
    expect(pressBackspace('500+')).toBe('500');
    expect(pressBackspace('')).toBe('');
    expect(pressClear()).toBe('');
  });
});

describe('evaluate', () => {
  it('delegates to applyCalcExpr semantics', () => {
    expect(evaluate(0, '20+40')).toBe(60);
    expect(evaluate(0, '20+40×2')).toBe(120);   // left-to-right
    expect(evaluate(5000, '+500')).toBe(5500);  // leading op seeds current
    expect(evaluate(100, '')).toBe(null);
    expect(evaluate(100, '20+')).toBe(null);    // trailing op invalid
  });
});

describe('displayOf', () => {
  it('groups each digit run', () => {
    expect(displayOf('1500')).toBe('1,500');
    expect(displayOf('1500+40')).toBe('1,500+40');
    expect(displayOf('1500000×2')).toBe('1,500,000×2');
    expect(displayOf('')).toBe('');
    expect(displayOf('+500')).toBe('+500');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/keypad-state.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/ui/plan/phone/keypadState.js
// Pure draft-string editing for the phone keypad sheet. The draft is a raw
// calculator expression ('1500+40'); rendering/grouping is displayOf's job and
// evaluation is applyCalcExpr's (same left-to-right semantics as the desktop
// ASSIGNED cell).
import { applyCalcExpr } from '../../../lib/calcExpr.js';

const OPS = ['−', '+', '×', '÷'];
const lastSegment = draft => draft.split(/[−+×÷]/).pop();

export function pressDigit(draft, d) {
  const seg = lastSegment(draft);
  if (d === '0' && seg === '0') return draft;            // no 00
  if (seg === '0') return draft.slice(0, -1) + d;        // 0 then 5 → 5
  return draft + d;
}
export function pressOp(draft, op) {
  if (OPS.includes(draft.slice(-1))) return draft.slice(0, -1) + op;
  return draft + op;
}
export function pressBackspace(draft) { return draft.slice(0, -1); }
export function pressClear() { return ''; }
export function evaluate(current, draft) {
  if (!draft) return null;
  return applyCalcExpr(current, draft);
}
export function displayOf(draft) {
  return draft.replace(/\d+/g, run => run.replace(/\B(?=(\d{3})+(?!\d))/g, ','));
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/keypad-state.test.js` → PASS, then `npx vitest run` → full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/ui/plan/phone/keypadState.js tests/keypad-state.test.js
git commit -m "Plan phone: keypad draft reducer (digits/ops/backspace, calcExpr evaluate)"
```

---

### Task 3: PR2b — KeypadSheet + wiring

**Files:**
- Create: `src/ui/plan/phone/KeypadSheet.jsx`
- Modify: `src/screens/Plan.jsx` (the phone gate block from Task 1)
- Test: none new (reducer covered; behavior verified live in Task 8)

**Interfaces:**
- Consumes: Task 2's exports; `setAssigned` (already imported in Plan.jsx); `autoAssignAmount(cat, r, envPrev)`-style helper — CHECK the real signature in `src/lib/inspector.js` before wiring (it's consumed by `Inspector.jsx:59-84` `AutoAssignRows`; mirror that call site exactly); `targetNeeded` from `src/lib/targets.js` for the hint chip amount.
- Produces: `<KeypadSheet open cat row current draft onKey onDone onClose onAutoAssign onMoveMoney />` where `onKey(action, payload)` receives `('digit', '7') | ('op', '+') | ('backspace') | ('clear') | ('equals')`.

- [ ] **Step 1: Create `KeypadSheet.jsx`**

Non-modal Base UI Dialog: no backdrop, page stays interactive/scrollable.

```jsx
import { Dialog } from '@base-ui/react/dialog';
import { displayOf } from './keypadState.js';

// The YNAB-style on-screen keypad. Deliberately NOT a text input: the draft is
// plain state rendered as text, so the OS keyboard can never appear (the
// #100–#108 drawer-vs-keyboard class is unreachable by construction).
const keyBtn = {
  height: 52, border: 'none', borderRadius: 10, background: 'var(--surface)',
  color: 'var(--text)', fontSize: 20, fontWeight: 600, cursor: 'pointer',
};
const opBtn = { ...keyBtn, background: 'var(--soft)', color: 'var(--accent)' };

export default function KeypadSheet({ open, cat, hint, canAutoAssign, onKey, onDone, onClose, onAutoAssign, onMoveMoney }) {
  return (
    <Dialog.Root open={open} onOpenChange={o => { if (!o) onClose(); }} modal={false}>
      <Dialog.Portal>
        <Dialog.Popup aria-label={'Assign to ' + (cat ? cat.name : '')}
          style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 60,
            background: 'var(--elev)', borderTop: '1px solid var(--border)',
            borderRadius: '12px 12px 0 0', boxShadow: 'var(--shadow)',
            padding: '10px 12px calc(10px + env(safe-area-inset-bottom))', outline: 'none' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button onClick={onAutoAssign} disabled={!canAutoAssign} className="hv-soft"
              style={{ flex: 1, height: 40, border: '1px solid var(--border)', borderRadius: 999,
                background: 'var(--surface)', color: canAutoAssign ? 'var(--text)' : 'var(--muted)',
                fontSize: 13, fontWeight: 600, cursor: canAutoAssign ? 'pointer' : 'default' }}>
              ⚡ Auto-Assign
            </button>
            <button onClick={onMoveMoney} className="hv-soft"
              style={{ flex: 1, height: 40, border: '1px solid var(--border)', borderRadius: 999,
                background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              ➡ Move Money
            </button>
          </div>
          {hint != null && (
            <button onClick={hint.onFill} className="hv-soft"
              style={{ width: '100%', border: 'none', borderRadius: 999, padding: '8px 12px', marginBottom: 8,
                background: 'var(--soft)', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {hint.label}
            </button>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {['7', '8', '9'].map(d => <button key={d} className="tnum hv-elev" style={keyBtn} onClick={() => onKey('digit', d)}>{d}</button>)}
            <button style={opBtn} className="hv-soft" aria-label="Minus" onClick={() => onKey('op', '−')}>−</button>
            {['4', '5', '6'].map(d => <button key={d} className="tnum hv-elev" style={keyBtn} onClick={() => onKey('digit', d)}>{d}</button>)}
            <button style={opBtn} className="hv-soft" aria-label="Plus" onClick={() => onKey('op', '+')}>+</button>
            {['1', '2', '3'].map(d => <button key={d} className="tnum hv-elev" style={keyBtn} onClick={() => onKey('digit', d)}>{d}</button>)}
            <button style={opBtn} className="hv-soft" aria-label="Multiply" onClick={() => onKey('op', '×')}>×</button>
            <button style={{ ...keyBtn, fontSize: 15 }} className="hv-soft" aria-label="Clear" onClick={() => onKey('clear')}>C</button>
            <button className="tnum hv-elev" style={keyBtn} onClick={() => onKey('digit', '0')}>0</button>
            <button style={{ ...keyBtn, fontSize: 17 }} className="hv-soft" aria-label="Backspace" onClick={() => onKey('backspace')}>⌫</button>
            <button style={opBtn} className="hv-soft" aria-label="Divide" onClick={() => onKey('op', '÷')}>÷</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button style={{ ...opBtn, flex: 1, height: 44 }} className="hv-soft" aria-label="Equals" onClick={() => onKey('equals')}>=</button>
            <button onClick={onDone}
              style={{ flex: 2, height: 44, border: 'none', borderRadius: 999, background: 'var(--accent)',
                color: 'var(--on-accent)', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              Done
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

Note: no `Dialog.Backdrop` — non-modal by design. If Base UI's non-modal Dialog
still traps focus or blocks page interaction in practice, check the `modal`
prop docs in the installed `.d.ts` (`'trap-focus' | false`) and use `false`.

- [ ] **Step 2: Wire into the phone gate in `Plan.jsx`**

Replace Task 1's gate block with (all still inside the Plan component, after
hooks — the keypad state lives in Plan so it can also serve re-targeting):

```jsx
// Phone keypad editing state: which category and the raw draft expression.
// Kept here (not in PlanPhone) so a tap on another row can commit-then-switch.
const [kp, setKp] = useState(null); // { catId, draft } | null
if (phone) {
  const kpCat = kp ? S.categories.find(c => c.id === kp.catId) : null;
  const kpRow = kp ? (env.rows.get(kp.catId) || { assigned: 0, available: 0 }) : null;
  const commitKp = () => {
    if (!kp) return;
    const v = KP.evaluate(kpRow.assigned, kp.draft);
    if (v !== null && v !== kpRow.assigned) {
      applyData(data => setAssigned(data, { categoryId: kp.catId, month, amount: v }));
    }
  };
  const openKeypad = (cat) => { commitKp(); setKp({ catId: cat.id, draft: '' }); };
  const onKey = (action, payload) => setKp(k => {
    if (!k) return k;
    if (action === 'digit') return { ...k, draft: KP.pressDigit(k.draft, payload) };
    if (action === 'op') return { ...k, draft: KP.pressOp(k.draft, payload) };
    if (action === 'backspace') return { ...k, draft: KP.pressBackspace(k.draft) };
    if (action === 'clear') return { ...k, draft: KP.pressClear() };
    if (action === 'equals') {
      const v = KP.evaluate(kpRow.assigned, k.draft);
      return v === null ? k : { ...k, draft: String(v) };
    }
    return k;
  });
  const need = kpCat && kpRow.available < 0 ? -kpRow.available : null;
  return (
    <>
      <PlanPhone S={S} env={env} month={month} money={money}
        collapsed={collapsed} toggleGroup={toggleGroup}
        onAssignTap={openKeypad}
        assignDraft={kp ? { catId: kp.catId, text: kp.draft ? KP.displayOf(kp.draft) : money(kpRow.assigned) } : null} />
      <KeypadSheet open={!!kp} cat={kpCat}
        hint={need ? { label: 'Assign ' + money(need) + ' more to cover overspending',
          onFill: () => setKp(k => ({ ...k, draft: String(kpRow.assigned + need) })) } : null}
        canAutoAssign={false /* PR2: enabled when auto-assign wired below */}
        onKey={onKey}
        onDone={() => { commitKp(); setKp(null); }}
        onClose={() => setKp(null)}
        onAutoAssign={() => {}}
        onMoveMoney={() => {}} />
    </>
  );
}
```

Imports: `import * as KP from '../ui/plan/phone/keypadState.js';` and
`import KeypadSheet from '../ui/plan/phone/KeypadSheet.jsx';`

Auto-Assign in this task: read `src/lib/inspector.js` and mirror how
`Inspector.jsx` computes a single category's suggested amount
(`autoAssignAmount`). If a per-category suggestion is derivable (target-based),
set `canAutoAssign={suggested != null && suggested !== kpRow.assigned}` and
`onAutoAssign={() => setKp(k => ({ ...k, draft: String(suggested) }))}` (fills
the draft; user still hits Done). If the helper is selection-shaped and cannot
give a single-category number without new logic, leave the button disabled and
record that in the task report — do NOT invent new assignment math.

- [ ] **Step 3: Verify**

`npx vitest run` green; `npm run build` succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/ui/plan/phone/KeypadSheet.jsx src/screens/Plan.jsx
git commit -m "Plan phone: keypad assign sheet (non-modal, calc keys, commit-then-switch)"
```

---

### Task 4: PR3 — Cover / Move / Assign / Overspent sheets

**Files:**
- Create: `src/ui/plan/phone/MoneySheets.jsx` (all four sheets — they share the amount+picker+confirm shell; one file keeps that shell DRY)
- Modify: `src/screens/Plan.jsx` (phone gate: wire pill taps, RTA tap, Cover banner, keypad Move Money)

**Interfaces:**
- Consumes: `BottomSheet, BottomSheetPanel, BottomSheetClose` from `src/ui/primitives/BottomSheet.jsx` (controlled: `<BottomSheet open onOpenChange>`); `PlanCategoryPicker` (props per `src/ui/PlanCategoryPicker.jsx:24-28`: `env, S, month, money, value, onChange, excludeId, excludeRta`); `moveAssigned`, `parseAmt` (already imported in Plan.jsx); `useUI().notify`.
- Produces: `<MoneySheets sheet onClose env S month money applyData />` where `sheet` is `null | { kind: 'cover'|'move', cat, row } | { kind: 'assign' } | { kind: 'overspent', onPick(cat,row) }`.

- [ ] **Step 1: Create `MoneySheets.jsx`**

Each sheet body mirrors its desktop popover's logic verbatim (`CoverPopover`
`Plan.jsx:729-770`, `MovePopover` `:775-823`, `AssignPopover` `:263-335`) —
same guards, same `moveAssigned` calls, same notify copy. Shell:

```jsx
import { useState } from 'react';
import { BottomSheet, BottomSheetPanel, BottomSheetClose } from '../../primitives/BottomSheet.jsx';
import PlanCategoryPicker from '../../PlanCategoryPicker.jsx';
import { moveAssigned } from '../../../store/actions.js';
import { parseAmt } from '../../../lib/format.js';
import { useUI } from '../../UIProvider.jsx';

const label = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', margin: '0 0 4px' };
const amountInput = { width: '100%', boxSizing: 'border-box', height: 38, padding: '0 10px', textAlign: 'right',
  border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 14, marginBottom: 12 };
const okBtn = ok => ({ flex: 1, height: 42, border: 'none', borderRadius: 999, background: 'var(--accent)',
  color: 'var(--on-accent)', fontSize: 14, fontWeight: 700, cursor: ok ? 'pointer' : 'default', opacity: ok ? 1 : .5 });

function SheetShell({ open, onClose, title, children }) {
  return (
    <BottomSheet open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <BottomSheetPanel label={title}>
        <div style={{ padding: '14px 16px calc(14px + env(safe-area-inset-bottom))' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span>
            <BottomSheetClose aria-label="Close" className="hv-soft"
              style={{ width: 30, height: 30, border: '1px solid var(--border)', borderRadius: 8,
                background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>×</BottomSheetClose>
          </div>
          {children}
        </div>
      </BottomSheetPanel>
    </BottomSheet>
  );
}
```

Then, in the same file, `CoverSheetBody`, `MoveSheetBody`, `AssignSheetBody`,
`OverspentSheetBody` implementing the desktop logic (fixed amount for Cover =
`-row.available`; Move amount state seeded `String(row.available)`; Assign from
`'rta'` with amount input; Overspent = list of `{cat,row}` with red pills →
`onPick(cat,row)`), and the default export:

```jsx
export default function MoneySheets({ sheet, onClose, env, S, month, money, applyData }) {
  if (!sheet) return null;
  const titles = { cover: 'Cover overspending', move: 'Move money', assign: 'Assign money', overspent: 'Overspent Categories' };
  return (
    <SheetShell open onClose={onClose} title={titles[sheet.kind]}>
      {sheet.kind === 'cover' && <CoverSheetBody {...{ sheet, onClose, env, S, month, money, applyData }} />}
      {sheet.kind === 'move' && <MoveSheetBody {...{ sheet, onClose, env, S, month, money, applyData }} />}
      {sheet.kind === 'assign' && <AssignSheetBody {...{ onClose, env, S, month, money, applyData }} />}
      {sheet.kind === 'overspent' && <OverspentSheetBody {...{ sheet, env, S, money }} />}
    </SheetShell>
  );
}
```

(The four bodies are ~20 lines each; copy the exact guard/notify lines from the
desktop popovers they mirror. `CoverSheetBody` example:)

```jsx
function CoverSheetBody({ sheet, onClose, env, S, month, money, applyData }) {
  const { notify } = useUI();
  const [from, setFrom] = useState(null);
  const amount = -sheet.row.available;
  const fromCat = from && from !== 'rta' ? S.categories.find(c => c.id === from) : null;
  const fromLabel = from === 'rta' ? 'Ready to Assign' : (fromCat ? fromCat.name : null);
  const confirm = () => {
    if (!from || amount <= 0 || from === sheet.cat.id) return;
    applyData(data => moveAssigned(data, { from, to: sheet.cat.id, month, amount }));
    onClose();
    notify('Covered ' + money(amount) + ' from ' + fromLabel + '.');
  };
  return (
    <>
      <span style={label}>Cover overspending from</span>
      <div className="tnum" style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>{money(amount)}</div>
      <PlanCategoryPicker env={env} S={S} month={month} money={money} excludeId={sheet.cat.id} value={from} onChange={setFrom} />
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={confirm} disabled={!from} className="hv-accent" style={okBtn(!!from)}>OK</button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Wire in `Plan.jsx` phone gate**

Add `const [sheet, setSheet] = useState(null);` beside `kp`. Wire:
- `onPillTap={(cat, row) => setSheet({ kind: row.available < 0 ? 'cover' : 'move', cat, row })}`
- `onRtaTap={() => setSheet({ kind: 'assign' })}`
- `onCoverTap={() => setSheet({ kind: 'overspent', onPick: (cat, row) => setSheet({ kind: 'cover', cat, row }) })}`
- KeypadSheet `onMoveMoney={() => { commitKp(); setKp(null); setSheet({ kind: 'move', cat: kpCat, row: kpRow }); }}`
- Render `<MoneySheets sheet={sheet} onClose={() => setSheet(null)} env={env} S={S} month={month} money={money} applyData={applyData} />` after `<KeypadSheet/>`.

If `PlanCategoryPicker`'s dropUp panel misrenders inside the sheet, pass no
change to the picker — instead give the sheet body `maxHeight: '70dvh',
overflowY: 'auto'` so the panel has room (the picker's own overflow-ancestor
scan then bounds it correctly). Do not modify PlanCategoryPicker in this stack.

- [ ] **Step 3: Verify + commit**

`npx vitest run` green; `npm run build` succeeds.

```bash
git add src/ui/plan/phone/MoneySheets.jsx src/screens/Plan.jsx
git commit -m "Plan phone: cover/move/assign/overspent bottom sheets (reuse desktop move logic)"
```

---

### Task 5: PR4a — Menu primitive

**Files:**
- Create: `src/ui/primitives/Menu.jsx`
- Test: none (verified live)

**Interfaces:**
- Consumes: `@base-ui/react/menu` — FIRST verify part names via `node -e "const {Menu}=require('@base-ui/react/menu'); console.log(Object.keys(Menu))"` (expect Root/Trigger/Portal/Positioner/Popup/Item at minimum; adjust to reality).
- Produces: `Menu, MenuTrigger, MenuPanel, MenuItem` — same wrapper shape as `Popover.jsx` (which is the template to copy tokens from: surface, hairline, radius 12, `var(--shadow)`, zIndex 60 for this one since it overlays screen content).

- [ ] **Step 1: Create the wrapper**

```jsx
import { Menu as BaseMenu } from '@base-ui/react/menu';

export const Menu = BaseMenu.Root;
export const MenuTrigger = BaseMenu.Trigger;

export function MenuPanel({ children, side = 'bottom', align = 'end', sideOffset = 6, style, ...rest }) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner side={side} align={align} sideOffset={sideOffset}
        collisionAvoidance={{ side: 'shift', align: 'shift' }} style={{ zIndex: 60 }}>
        <BaseMenu.Popup style={{ minWidth: 220, background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, boxShadow: 'var(--shadow)', padding: 6, color: 'var(--text)', outline: 'none', ...style }} {...rest}>
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

export function MenuItem({ children, style, ...rest }) {
  return (
    <BaseMenu.Item
      style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 8, padding: '10px 12px',
        fontSize: 13.5, fontWeight: 600, cursor: 'pointer', ...style }}
      className="hv-soft" {...rest}>
      {children}
    </BaseMenu.Item>
  );
}
```

- [ ] **Step 2: Verify + commit**

`npm run build` succeeds (import resolves; adjust part names if the introspection differed).

```bash
git add src/ui/primitives/Menu.jsx
git commit -m "primitives: Base UI Menu wrapper (tokened, collision-aware)"
```

---

### Task 6: PR4b — month-grid picker (phone header)

**Files:**
- Modify: `src/store/MonthContext.jsx` (add `pick`)
- Create: `src/components/MonthGridPopover.jsx`
- Modify: `src/components/Header.jsx:79-87` (phone: label becomes trigger)
- Test: `tests/month-grid.test.js`

**Interfaces:**
- Consumes: `useMonth()`; `monthLabel` (`src/lib/calc.js`); `Popover, PopoverTrigger, PopoverPanel, PopoverClose` from primitives; `useIsPhone`.
- Produces: MonthContext gains `pick(m)` — sets the month iff `months.includes(m)`. New pure helper `monthGridFor(months, year) → { year, prevYear, nextYear, cells: [{ ym, label, enabled, }×12] }` exported from `MonthGridPopover.jsx`.

- [ ] **Step 1: Failing tests for the grid derivation**

```js
// tests/month-grid.test.js
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
```

Run: `npx vitest run tests/month-grid.test.js` → FAIL (module/export missing).

- [ ] **Step 2: Implement `MonthGridPopover.jsx`**

```jsx
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
  const g = monthGridFor(months, year);
  const yrBtn = on => ({ width: 28, height: 28, border: 'none', borderRadius: 6, background: 'transparent',
    color: 'var(--text)', cursor: on ? 'pointer' : 'default', opacity: on ? 1 : .35, fontSize: 14 });
  return (
    <Popover>
      <PopoverTrigger className="tnum" aria-label="Choose month"
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
```

- [ ] **Step 3: Add `pick` to MonthContext**

In `src/store/MonthContext.jsx`, inside the `value` useMemo, add
`pick: m => { if (months.includes(m)) setMonth(m); },` and keep everything else
unchanged.

- [ ] **Step 4: Header phone integration**

In `src/components/Header.jsx` month-stepper block (`:79-87`): destructure
`months, pick` from `useMonth()` and `const phoneHdr = useIsPhone()` (import the
hook). Replace ONLY the center `<span>` when on phone:

```jsx
{phoneHdr
  ? <MonthGridPopover month={month} months={months} pick={pick}
      triggerLabel={monthLabel(month).replace(/^(\w{3})\w*/, '$1')} />
  : <span className="tnum" style={{ fontSize: 13, fontWeight: 600, padding: '0 8px' }}>{monthLabel(month).replace(/^(\w{3})\w*/, '$1')}</span>}
```

The ‹ › stepper buttons and both chips stay exactly as they are on both form
factors.

- [ ] **Step 5: Verify + commit**

`npx vitest run` (grid tests + full suite) green; `npm run build` succeeds.

```bash
git add src/store/MonthContext.jsx src/components/MonthGridPopover.jsx src/components/Header.jsx tests/month-grid.test.js
git commit -m "Header: phone month-grid picker (year-paged, range = stepper months)"
```

---

### Task 7: PR4c — Plan overflow ⋯ menu

**Files:**
- Modify: `src/components/RecentMoves.jsx` (extract + export the list body as `RecentMovesList` — pure presentational: the day-grouped list currently inside its panel; the existing popover keeps using it, no behavior change)
- Create: `src/ui/plan/phone/PlanOverflowMenu.jsx`
- Modify: `src/screens/Plan.jsx` (phone gate: render the menu; pass deps)

**Interfaces:**
- Consumes: `Menu, MenuTrigger, MenuPanel, MenuItem` (Task 5); `toggleAllGroups`/`allCollapsed` (`Plan.jsx:1191-1197`); the store's `undo` + `canUndo` (mirror how `Header.jsx` obtains `undo` — same source, read it there); `prefs.planView` + `setPrefs` (progress vs compact — see `ViewToggle` `Plan.jsx:360-380` for the exact pref write); the masking pref (find the existing "hide amounts" pref written by the Dashboard eye toggle / H key — grep `masked` in `src/store/PrefsProvider.jsx` and reuse its exact key); `RecentMovesList` + a `BottomSheet` to host it.
- Produces: `<PlanOverflowMenu onRecentMoves undo canUndo allCollapsed onToggleAll progressOn onToggleProgress maskedOn onToggleMasked />`.

- [ ] **Step 1: Extract `RecentMovesList`**

In `RecentMoves.jsx`, move the day-grouped list markup (the content inside
`listStyle`) into an exported `RecentMovesList({ ... })` component with the
same props it already consumes internally (filter state stays in the caller or
moves with it — smallest change that leaves the desktop popover pixel-identical).
Verify desktop still renders by running the build.

- [ ] **Step 2: Create `PlanOverflowMenu.jsx`**

```jsx
import { useState } from 'react';
import { Menu, MenuTrigger, MenuPanel, MenuItem } from '../../primitives/Menu.jsx';
import { BottomSheet, BottomSheetPanel, BottomSheetClose } from '../../primitives/BottomSheet.jsx';
import { RecentMovesList } from '../../../components/RecentMoves.jsx';

export default function PlanOverflowMenu({ undo, canUndo, allCollapsed, onToggleAll, progressOn, onToggleProgress, maskedOn, onToggleMasked }) {
  const [movesOpen, setMovesOpen] = useState(false);
  return (
    <>
      <Menu>
        <MenuTrigger aria-label="Plan menu" className="hv-soft"
          style={{ width: 34, height: 34, border: '1px solid var(--border)', borderRadius: 999,
            background: 'var(--surface)', color: 'var(--muted)', fontSize: 18, cursor: 'pointer' }}>⋯</MenuTrigger>
        <MenuPanel aria-label="Plan menu">
          <MenuItem onClick={() => setMovesOpen(true)}>🕘 Recent Moves</MenuItem>
          <MenuItem onClick={undo} disabled={!canUndo} style={{ opacity: canUndo ? 1 : .45 }}>↩ Undo last move</MenuItem>
          <MenuItem onClick={onToggleAll}>{allCollapsed ? '⌄ Expand all groups' : '⌃ Collapse all groups'}</MenuItem>
          <MenuItem onClick={onToggleProgress}>{progressOn ? 'Hide progress bars' : 'Show progress bars'}</MenuItem>
          <MenuItem onClick={onToggleMasked}>{maskedOn ? 'Show amounts' : 'Hide amounts'}</MenuItem>
        </MenuPanel>
      </Menu>
      <BottomSheet open={movesOpen} onOpenChange={setMovesOpen}>
        <BottomSheetPanel label="Recent Moves">
          <div style={{ padding: '14px 16px calc(14px + env(safe-area-inset-bottom))' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Recent Moves</span>
              <BottomSheetClose aria-label="Close" className="hv-soft"
                style={{ width: 30, height: 30, border: '1px solid var(--border)', borderRadius: 8,
                  background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>×</BottomSheetClose>
            </div>
            <RecentMovesList />
          </div>
        </BottomSheetPanel>
      </BottomSheet>
    </>
  );
}
```

(Adjust `RecentMovesList` props to whatever Step 1's extraction requires.)

- [ ] **Step 3: Wire into the phone gate**

Render a compact toolbar row above `<PlanPhone/>`:
`<div style={{ display:'flex', justifyContent:'flex-end', padding:'8px 12px 0' }}><PlanOverflowMenu …/></div>`
with: `undo`/`canUndo` read the same way Header does; `allCollapsed` +
`onToggleAll={toggleAllGroups}`; `progressOn={prefs.planView === 'progress'}` +
the same `setPrefs` write `ViewToggle` uses; `maskedOn` + toggle via the
existing masking pref. (Progress bars themselves render on phone in a later
follow-up; the pref toggle still works globally — note this in the PR body.)

- [ ] **Step 4: Verify + commit**

`npx vitest run` green; `npm run build` succeeds; desktop Recent Moves popover
still renders (build + a quick desktop Playwright glance in Task 8).

```bash
git add src/components/RecentMoves.jsx src/ui/plan/phone/PlanOverflowMenu.jsx src/screens/Plan.jsx
git commit -m "Plan phone: overflow menu (recent moves sheet, undo, collapse, view/mask toggles)"
```

---

### Task 8: Final — live verification + accessibility (controller-driven)

- [ ] Stack submitted as drafts (`gh stack submit --auto`), `gh stack view --json` clean.
- [ ] Playwright subagent at 390×780 (real app, logged-in session; date range/theme/prefs are restorable; any test ASSIGNMENT is written then reset to its original value; NEVER the Undo button):
  1. /budget renders the phone list — no horizontal overflow (`scrollWidth <= clientWidth`); RTA banner, group totals, pills all visible.
  2. Keypad: tap an assigned amount → sheet opens, NO OS keyboard (no focused input), digits/`=`/Done round-trip commits (verify via UI + reset after), `500+40=` shows 540, backspace/clear work, tapping another row re-targets.
  3. Pills: negative → Cover sheet; positive → Move sheet; both move money correctly (then reversed by an exact inverse move, not Undo).
  4. RTA banner → Assign sheet; overspent banner → Overspent sheet → Cover.
  5. Month grid: "Aug 2026 ▾" opens grid; months outside history+3 disabled; picking a month updates the screen; year paging clamps.
  6. ⋯ menu: all five items act; Recent Moves sheet lists todays' test moves.
  7. Desktop unchanged: at 1280px the classic table renders, month stepper label (not trigger), Recent Moves popover intact.
  8. Light + dark; zero console errors.
- [ ] `/accessibility` audit (WCAG 2.2) over the new phone surfaces; Critical/Serious findings fixed in the owning branch (+ `gh stack rebase --upstack`), the rest recorded in the PR bodies.
- [ ] Full suite + build green at the stack tip.

## Self-review notes (done)

- Spec coverage: ① Task 1 · ② Tasks 2–3 · ③ Task 4 · ④ Tasks 5–7 · testing/delivery Task 8 + stack mechanics. Deferred items from the spec are not tasked (correct).
- Names cross-checked: `phoneRowsFor`, `pressDigit/pressOp/pressBackspace/pressClear/evaluate/displayOf`, `pick`, `monthGridFor`, `MoneySheets` sheet kinds, `RecentMovesList` consistent across tasks.
- Known judgment points delegated with guardrails (auto-assign signature check; Base UI Menu part introspection; RecentMoves extraction shape) — each says exactly what to verify and forbids inventing logic.
