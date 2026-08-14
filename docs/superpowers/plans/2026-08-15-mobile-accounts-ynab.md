# Mobile Accounts (YNAB-style) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phone-native Accounts experience per `docs/superpowers/specs/2026-08-15-mobile-accounts-ynab-design.md`: grouped Accounts screen, account-register header, and a YNAB-style transaction editor (keypad amount, type menu, field rows) that re-presents the existing `addTx` drawer.

**Architecture:** Dedicated phone render paths gated AFTER all hooks (`if (phone) return <XPhone/>`), desktop untouched. The transaction editor is an **alternate rendering of the `addTx` drawer**: `DrawerProvider` renders `TxSheet` instead of `DrawerShell` on phone, so `TxSheet` consumes the same `useDrawer()` form state and calls the same `txFormDef.useSubmit()`/`useDanger()` — one submission path (validation, duplicate detection, type-change confirm, recurring bookkeeping, delete) by construction.

**Tech Stack:** React 18 + Vite, Base UI (`@base-ui/react` — Dialog/Menu via `src/ui/primitives/`), Vitest (node env, no jsdom), Playwright MCP for live verification.

## Global Constraints

- **Structure only**: YNAB's layout/interactions in "Trusted Ledger" tokens — flat `var(--surface)` cards, 1px `var(--border)` hairlines, `var(--shadow)` ONLY on transient overlays, teal (`--accent`) only on actionable elements, `.tnum` on all numerals, pos/neg via `--pos`/`--neg` (+`-soft` grounds).
- **Base UI** for all new interactive primitives, via `src/ui/primitives/` wrappers (`BottomSheet`, `Menu`); never hand-rolled overlays.
- **No business-logic changes**: no edits to `src/store/actions.js`, `src/lib/validate.js`, `src/lib/calc.js`. The ONLY logic-adjacent file changes allowed are the `keypadState.js` file move (content unchanged) and exporting `useOpts` from `TxForm.jsx` (rename to `useTxOpts`, body unchanged).
- **Desktop behavior byte-identical**: every desktop render path must be unchanged; phone gating is additive.
- Phone = `useIsPhone()` (`src/lib/useIsPhone.js`, ≤700px). Z-bands: drawer scrim 40, tab bar 40 (`--phone-nav-clearance` clearance), sheets/menus 60. TxSheet shell sits at zIndex 50 (above tab bar, below its own child sheets at 60).
- Tests: Vitest node env only — components are verified live, pure helpers get unit tests.
- Git: commit per task; branches exactly `feat/mobile-accounts-list` → `feat/mobile-accounts-register` → `feat/mobile-tx-editor` → `feat/mobile-tx-editor-types`, each based on the previous. PRs are created DRAFT via `gh stack submit --auto` and NEVER marked ready or merged without the user's explicit ask.
- Live testing: ONE mutating browser agent at a time; NEVER click the app's Undo button; restore every test write via its exact inverse operation; `.env.local` is never committed.

## File Structure

```
src/ui/accounts/phone/accountsPhone.js     (new — pure grouping helpers)
src/ui/accounts/phone/AccountsPhone.jsx    (new — phone Accounts screen)
src/ui/accounts/phone/ArchivedSheet.jsx    (new — archived accounts sheet)
src/screens/Accounts.jsx                   (gate only)
src/screens/Transactions.jsx               (phone header: back/subtitle/Edit)
src/lib/keypadState.js                     (moved from src/ui/plan/phone/)
src/ui/phone/Keypad.jsx                    (new — shared key grid)
src/ui/plan/phone/KeypadSheet.jsx          (consumes Keypad)
src/ui/tx/phone/txSheetState.js            (new — per-type field visibility etc.)
src/ui/tx/phone/TxSheet.jsx                (new — the editor)
src/components/CategoryPickerSheet.jsx     (catType + allowCreate props)
src/drawers/TxForm.jsx                     (export useTxOpts; no behavior change)
src/ui/DrawerProvider.jsx                  (phone addTx → TxSheet gate)
tests/accounts-phone.test.js               (new)
tests/tx-sheet-state.test.js               (new)
tests/keypad-state.test.js                 (import path only)
```

---

### Task 1: Accounts grouping helpers

Branch: `feat/mobile-accounts-list` (exists; contains the spec).

**Files:**
- Create: `src/ui/accounts/phone/accountsPhone.js`
- Test: `tests/accounts-phone.test.js`

**Interfaces:**
- Produces: `accountGroupsFor(S, balanceOf) -> [{ label, total, rows: [{ acct, inst, raw }] }]` and `archivedRowsFor(S) -> [{ acct, instLabel, statusLabel }]`. `balanceOf(acct) -> number` is injected so tests need no ledger fixture; the component passes `a => accountBalance(a, S, balanceMonth, now)`.

- [ ] **Step 1: Write the failing test**

```js
// tests/accounts-phone.test.js
import { describe, it, expect } from 'vitest';
import { accountGroupsFor, archivedRowsFor } from '../src/ui/accounts/phone/accountsPhone.js';

const S = {
  institutions: [
    { id: 'i1', name: 'Meezan', kind: 'Bank' },
    { id: 'i2', name: 'JazzCash', kind: 'Wallet' },
    { id: 'i3', name: 'Under the mattress', kind: 'Custom' },
  ],
  accounts: [
    { id: 'a1', nickname: 'Meezan Current', instId: 'i1', status: 'active' },
    { id: 'a2', nickname: 'JazzCash', instId: 'i2', status: 'active' },
    { id: 'a3', nickname: 'Meezan Savings', instId: 'i1', status: 'active' },
    { id: 'a4', nickname: 'Cash box', instId: 'i3', status: 'active' },
    { id: 'a5', nickname: 'Old account', instId: 'i1', status: 'archived' },
    { id: 'a6', nickname: 'No inst', instId: null, status: 'active' },
  ],
};
const bal = { a1: 1000, a2: 200, a3: 500, a4: -50, a6: 10 };
const balanceOf = a => bal[a.id];

describe('accountGroupsFor', () => {
  const groups = accountGroupsFor(S, balanceOf);
  it('groups by institution kind in first-appearance order', () => {
    expect(groups.map(g => g.label)).toEqual(['Bank', 'Wallet', 'Other']);
  });
  it('keeps S.accounts order within a group and sums raw balances', () => {
    const bank = groups[0];
    expect(bank.rows.map(r => r.acct.id)).toEqual(['a1', 'a3']);
    expect(bank.total).toBe(1500);
  });
  it("maps Custom kind and missing institution both into 'Other'", () => {
    const other = groups[2];
    expect(other.rows.map(r => r.acct.id)).toEqual(['a4', 'a6']);
    expect(other.total).toBe(-40);
    expect(other.rows[1].inst).toBeNull();
  });
  it('excludes non-active accounts', () => {
    expect(groups.flatMap(g => g.rows).some(r => r.acct.id === 'a5')).toBe(false);
  });
});

describe('archivedRowsFor', () => {
  it('lists only non-active accounts with labels', () => {
    const rows = archivedRowsFor({ ...S, accounts: [...S.accounts, { id: 'a7', nickname: 'Shut', instId: 'i2', status: 'closed' }] });
    expect(rows.map(r => r.acct.id)).toEqual(['a5', 'a7']);
    expect(rows[0].instLabel).toBe('Meezan');
    expect(rows[1].statusLabel).toBe('closed');
    expect(rows[0].statusLabel).toBe('archived');
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — `npx vitest run tests/accounts-phone.test.js` → FAIL (module not found).

- [ ] **Step 3: Implement**

```js
// src/ui/accounts/phone/accountsPhone.js
// Pure derivations for the phone Accounts screen. balanceOf is injected so
// these stay testable without a ledger fixture; the component supplies
// accountBalance at balanceMonth (the future-month clamp lives there).
import { kindLabel } from '../../../lib/calc.js';
import { instName } from '../../../lib/txRow.js';

export function accountGroupsFor(S, balanceOf) {
  const groups = [];
  const byLabel = new Map();
  for (const a of S.accounts) {
    if (a.status !== 'active') continue;
    const inst = S.institutions.find(i => i.id === a.instId) || null;
    const label = inst ? kindLabel(inst.kind) : 'Other';
    let g = byLabel.get(label);
    if (!g) { g = { label, total: 0, rows: [] }; byLabel.set(label, g); groups.push(g); }
    const raw = balanceOf(a);
    g.total += raw;
    g.rows.push({ acct: a, inst, raw });
  }
  return groups;
}

export function archivedRowsFor(S) {
  return S.accounts
    .filter(a => a.status !== 'active')
    .map(a => ({ acct: a, instLabel: instName(S, a.instId), statusLabel: a.status === 'closed' ? 'closed' : 'archived' }));
}
```

Note: `kindLabel('Custom')` returns `'Other'` (`src/lib/calc.js:287`) — that is what folds Custom-kind institutions into the same bucket as institution-less accounts.

- [ ] **Step 4: Run tests** — `npx vitest run tests/accounts-phone.test.js` → PASS. Also `npx vitest run` (full suite) → green.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "Accounts phone: pure grouping helpers (kind buckets, totals, archived rows)"`

---

### Task 2: AccountsPhone screen + ArchivedSheet + gate

Branch: `feat/mobile-accounts-list` (same).

**Files:**
- Create: `src/ui/accounts/phone/AccountsPhone.jsx`, `src/ui/accounts/phone/ArchivedSheet.jsx`
- Modify: `src/screens/Accounts.jsx` (gate + `useIsPhone` import only)

**Interfaces:**
- Consumes: Task 1 helpers; `BottomSheet`/`BottomSheetPanel`/`BottomSheetClose` (`src/ui/primitives/BottomSheet.jsx`); existing actions `setAccountStatus`, `deleteAccountPermanently`, `accountDeletePolicy`; `freshInfo` (`src/lib/txRow.js`); `openers.addAccount`.
- Produces: `<AccountsPhone/>` (self-contained — reads store/month/drawer/UI itself, like `PlanPhone`).

- [ ] **Step 1: `AccountsPhone.jsx`**

```jsx
// src/ui/accounts/phone/AccountsPhone.jsx
// Phone Accounts screen (YNAB anatomy, ledger tokens): kind groups with
// totals, collapsible; archived behind one row; Add account at the bottom.
// Spec: docs/superpowers/specs/2026-08-15-mobile-accounts-ynab-design.md §1
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../../store/StoreProvider.jsx';
import { useMonth } from '../../../store/MonthContext.jsx';
import { useDrawer } from '../../DrawerProvider.jsx';
import { useMoney } from '../../../lib/format.js';
import { accountBalance } from '../../../lib/calc.js';
import { nowIso } from '../../../lib/dates.js';
import { freshInfo } from '../../../lib/txRow.js';
import { openers } from '../../../drawers/openers.js';
import { accountGroupsFor, archivedRowsFor } from './accountsPhone.js';
import ArchivedSheet from './ArchivedSheet.jsx';

const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' };

export default function AccountsPhone() {
  const { data: S } = useStore();
  const { balanceMonth } = useMonth();
  const { money } = useMoney();
  const { openDrawer } = useDrawer();
  const nav = useNavigate();
  const now = nowIso();
  const [collapsed, setCollapsed] = useState(() => new Set()); // phone-local, not persisted
  const [archOpen, setArchOpen] = useState(false);

  const groups = useMemo(() => accountGroupsFor(S, a => accountBalance(a, S, balanceMonth, now)), [S, balanceMonth, now]);
  const archived = useMemo(() => archivedRowsFor(S), [S]);
  const toggle = label => setCollapsed(c => { const n = new Set(c); n.has(label) ? n.delete(label) : n.add(label); return n; });
  const balColor = raw => (raw < 0 ? 'var(--neg)' : 'var(--text)');

  return (
    <div style={{ padding: '16px 16px calc(var(--phone-nav-clearance) + 16px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {groups.map(g => {
        const closed = collapsed.has(g.label);
        return (
          <section key={g.label} aria-label={g.label + ' accounts'}>
            <button onClick={() => toggle(g.label)} aria-expanded={!closed} className="hv-soft"
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 36, padding: '0 4px 6px',
                border: 'none', background: 'none', color: 'var(--text)', font: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
              <span aria-hidden="true" style={{ color: 'var(--muted)', fontSize: 12, transform: closed ? 'rotate(-90deg)' : 'none' }}>▾</span>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>{g.label}</span>
              <span className="tnum" style={{ fontSize: 14, fontWeight: 600, color: balColor(g.total) }}>{money(g.total)}</span>
            </button>
            {!closed && (
              <div style={cardStyle}>
                {g.rows.map((r, i) => {
                  const f = freshInfo(r.acct, S);
                  return (
                    <button key={r.acct.id} onClick={() => nav(`/transactions/${r.acct.id}`)} className="hv-elev"
                      aria-label={r.acct.nickname + ', balance ' + money(r.raw)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 52, padding: '8px 14px',
                        border: 'none', borderBottom: i === g.rows.length - 1 ? 'none' : '1px solid var(--border)',
                        background: 'none', color: 'var(--text)', font: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
                      <span title={f.tip} style={{ width: 8, height: 8, borderRadius: 999, background: f.dot, flex: 'none' }} />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.acct.nickname}</span>
                        {r.inst && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{r.inst.name}</span>}
                      </span>
                      <span className="tnum" style={{ flex: 'none', fontSize: 14.5, fontWeight: 600, color: balColor(r.raw) }}>{money(r.raw)}</span>
                      <span aria-hidden="true" style={{ color: 'var(--muted)', fontSize: 14, flex: 'none' }}>›</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {groups.length === 0 && (
        <section style={{ ...cardStyle, padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>No accounts yet</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>Add each Pakistani bank account you use — institution, a nickname, and today's balance. Everything else builds on this.</div>
        </section>
      )}

      {archived.length > 0 && (
        <button onClick={() => setArchOpen(true)} className="hv-elev"
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 48, padding: '0 14px',
            ...cardStyle, color: 'var(--text)', font: 'inherit', fontSize: 14, cursor: 'pointer', textAlign: 'left' }}>
          <span style={{ flex: 1 }}>{archived.length} archived account{archived.length === 1 ? '' : 's'}</span>
          <span aria-hidden="true" style={{ color: 'var(--muted)' }}>›</span>
        </button>
      )}

      <button onClick={() => openers.addAccount(openDrawer)} className="hv-elev"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 48,
          ...cardStyle, color: 'var(--accent)', font: 'inherit', fontSize: 14.5, fontWeight: 600, cursor: 'pointer' }}>
        ＋ Add account
      </button>

      <ArchivedSheet open={archOpen} onClose={() => setArchOpen(false)} rows={archived} />
    </div>
  );
}
```

- [ ] **Step 2: `ArchivedSheet.jsx`** — `BottomSheet` hosting the desktop archived list's exact logic:

```jsx
// src/ui/accounts/phone/ArchivedSheet.jsx
// Archived/closed accounts in a bottom sheet — same restore/delete logic and
// policy guards as the desktop Accounts archived section, re-hosted.
import { BottomSheet, BottomSheetPanel, BottomSheetClose } from '../../primitives/BottomSheet.jsx';
import { useStore } from '../../../store/StoreProvider.jsx';
import { useUI } from '../../UIProvider.jsx';
import { accountDeletePolicy } from '../../../lib/calc.js';
import { deleteAccountPermanently, setAccountStatus } from '../../../store/actions.js';

export default function ArchivedSheet({ open, onClose, rows }) {
  const { data: S, applyData } = useStore();
  const { notify, ask } = useUI();

  const restore = id => {
    applyData(data => setAccountStatus(data, { accountId: id, status: 'active' }));
    notify('Account restored — included in totals again.');
  };
  const askDelete = async a => {
    const ok = await ask({
      title: 'Delete “' + a.nickname + '” for good?',
      body: 'Nothing points at this account, so it can be removed completely — it and its opening balance disappear from your data and from the server. This cannot be undone. Archiving is the reversible option.',
      action: 'Delete permanently',
    });
    if (!ok) return;
    applyData(data => deleteAccountPermanently(data, { id: a.id }));
    notify('“' + a.nickname + '” deleted.');
  };

  return (
    <BottomSheet open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <BottomSheetPanel label="Archived accounts">
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--border)', flex: 'none' }}>
          <span style={{ flex: 1, fontSize: 16, fontWeight: 700 }}>Archived accounts</span>
          <BottomSheetClose aria-label="Close" className="hv-soft"
            style={{ width: 36, height: 36, border: 'none', borderRadius: 999, background: 'var(--elev)', color: 'var(--text)', fontSize: 15, cursor: 'pointer' }}>✕</BottomSheetClose>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 16px 16px' }}>
          {rows.map(r => {
            const pol = accountDeletePolicy(S, r.acct.id);
            return (
              <div key={r.acct.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--muted)' }}>{r.acct.nickname}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{r.instLabel} · {r.statusLabel} · excluded from totals</span>
                </span>
                {pol.mode === 'delete'
                  ? <button onClick={() => askDelete(r.acct)} className="hv-neg-soft" style={{ minHeight: 36, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--neg)', font: 'inherit', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', flex: 'none' }}>Delete</button>
                  : <span style={{ fontSize: 11.5, color: 'var(--muted)', flex: 'none' }} title={'Kept because of ' + pol.blockers.join(', ')}>Kept</span>}
                <button onClick={() => restore(r.acct.id)} className="hv-elev" style={{ minHeight: 36, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', font: 'inherit', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', flex: 'none' }}>Restore</button>
              </div>
            );
          })}
        </div>
      </BottomSheetPanel>
    </BottomSheet>
  );
}
```

- [ ] **Step 3: Gate `Accounts.jsx`** — add `import { useIsPhone } from '../lib/useIsPhone.js';` and `import AccountsPhone from '../ui/accounts/phone/AccountsPhone.jsx';`; inside the component add `const phone = useIsPhone();` with the other hooks, then IMMEDIATELY BEFORE the desktop `return`: `if (phone) return <AccountsPhone />;`. All existing hooks in `Accounts.jsx` already run unconditionally before the return — verify none is added below the gate.
- [ ] **Step 4: Verify** — `npx vitest run` green; `npm run build` green (components are live-verified in Task 9).
- [ ] **Step 5: Commit** — `git commit -am "Accounts: phone screen — kind groups with totals, archived sheet, Add account"`

---

### Task 3: Account register header (back · institution · Edit)

Branch: `git switch -c feat/mobile-accounts-register` (from `feat/mobile-accounts-list` head).

**Files:**
- Modify: `src/screens/Transactions.jsx` — ONLY the phone header block (currently `Transactions.jsx:707-733`).

**Interfaces:**
- Consumes: existing `acct` (already derived in the component from `accountId`), `nav` (`useNavigate` already imported), `openers.editAccount`, `openDrawer`, `instName` from `src/lib/txRow.js` (add the import if not present).

The phone block already renders `<h1>{acct ? acct.nickname : 'Spending'}</h1>` and the account-scoped `PositionStrip compact` above it (which already gives the big working-balance figure on phone via `.pos-lead .tnum`). This task adds only: back chevron, institution subtitle, Edit access.

- [ ] **Step 1: Modify the phone title row** — replace the `<h1 …>{acct ? acct.nickname : 'Spending'}</h1>` element (keep everything around it) with:

```jsx
{acct && (
  <button onClick={() => nav('/accounts')} aria-label="Back to accounts" className="hv-soft"
    style={{ width: 44, height: 44, marginLeft: -12, border: 'none', borderRadius: 999, background: 'none',
      color: 'var(--text)', fontSize: 22, cursor: 'pointer', flex: 'none', lineHeight: 1 }}>‹</button>
)}
<div style={{ flex: 1, minWidth: 0 }}>
  <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
    {acct ? acct.nickname : 'Spending'}
  </h1>
  {acct && (
    <div style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {instName(S, acct.instId)}
    </div>
  )}
</div>
```

(The old `flex: 1` moves from the h1 to the wrapping div; the select/search buttons after it are untouched.)

- [ ] **Step 2: Add Edit access** — in the non-select branch (next to the existing `Select` pill button, before it), add — only when `acct`:

```jsx
{acct && (
  <button onClick={() => openers.editAccount(S, acct.id, openDrawer)} className="hv-soft"
    style={{ minHeight: 44, padding: '0 16px', border: '1px solid var(--border)', borderRadius: 999,
      background: 'var(--elev)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
    Edit
  </button>
)}
```

- [ ] **Step 3: Verify imports** — `instName` may not be imported in `Transactions.jsx`; if absent add it to the existing `../lib/txRow.js` import. `openers` and `openDrawer` are already in scope (used by the toolbar).
- [ ] **Step 4: Run** — `npx vitest run` green; `npm run build` green. Desktop path untouched (all edits inside `{phone && …}`).
- [ ] **Step 5: Commit** — `git commit -am "Register: phone account header — back chevron, institution subtitle, Edit access"`

---

### Task 4: Shared keypad — move `keypadState`, extract `Keypad`

Branch: `git switch -c feat/mobile-tx-editor` (from `feat/mobile-accounts-register` head).

**Files:**
- Move: `src/ui/plan/phone/keypadState.js` → `src/lib/keypadState.js` (git mv; content unchanged except the import: `from '../../../lib/calcExpr.js'` becomes `from './calcExpr.js'`).
- Modify imports: `src/screens/Plan.jsx`, `tests/keypad-state.test.js` (the only importers — verify with `grep -rn "keypadState" src tests`).
- Create: `src/ui/phone/Keypad.jsx`
- Modify: `src/ui/plan/phone/KeypadSheet.jsx` (consume Keypad; rendered output identical).

**Interfaces:**
- Produces: `<Keypad onKey={(kind, value?) => …} onDone={() => …} doneLabel="Done" />` — the 4×4 digit/op grid plus the `= / Done` row. `onKey` kinds: `'digit' | 'op' | 'clear' | 'backspace' | 'equals'` (exactly the current KeypadSheet contract).

- [ ] **Step 1: Move the state module** — `git mv src/ui/plan/phone/keypadState.js src/lib/keypadState.js`; fix its internal import; update the two importers' paths.
- [ ] **Step 2: Run** — `npx vitest run tests/keypad-state.test.js` → PASS.
- [ ] **Step 3: Extract `Keypad.jsx`** — lift the grid + `=`/Done rows out of `KeypadSheet.jsx` verbatim (the `keyBtn`/`opBtn` styles and all buttons from the `7 8 9 −` grid through the `=`/Done row):

```jsx
// src/ui/phone/Keypad.jsx
// The shared on-screen key grid (digits, ops, =, Done). Deliberately NOT a
// text input: callers render the draft as plain text, so the OS keyboard can
// never appear. State lives in src/lib/keypadState.js at each call site.
const keyBtn = {
  height: 52, border: 'none', borderRadius: 10, background: 'var(--surface)',
  color: 'var(--text)', fontSize: 20, fontWeight: 600, cursor: 'pointer',
};
const opBtn = { ...keyBtn, background: 'var(--soft)', color: 'var(--accent)' };

export default function Keypad({ onKey, onDone, doneLabel = 'Done' }) {
  return (
    <>
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
          {doneLabel}
        </button>
      </div>
    </>
  );
}
```

`KeypadSheet.jsx` keeps its Dialog shell, action row, and hint chip, and renders `<Keypad onKey={onKey} onDone={onDone} />` where the grid was. Its rendered DOM must be identical.

- [ ] **Step 4: Run** — `npx vitest run` green; `npm run build` green.
- [ ] **Step 5: Commit** — `git commit -am "Keypad: move keypadState to lib, extract shared Keypad grid from KeypadSheet"`

---

### Task 5: txSheetState helpers + CategoryPickerSheet `catType`/`allowCreate`

Branch: `feat/mobile-tx-editor` (same).

**Files:**
- Create: `src/ui/tx/phone/txSheetState.js`
- Test: `tests/tx-sheet-state.test.js`
- Modify: `src/components/CategoryPickerSheet.jsx`

**Interfaces:**
- Produces: `fieldsFor(type)` → `{ merchant, category, payWith, account, transfer, adjust }` booleans (must equal TxForm's `fx*` truth table, `TxForm.jsx:56-70`); `tintFor(type)` → CSS background token for the amount header; `merchantLabel(type)`, `payWithLabel(type)`, `accountLabel(type)` → the exact strings TxForm's labels use.

- [ ] **Step 1: Write the failing test**

```js
// tests/tx-sheet-state.test.js
import { describe, it, expect } from 'vitest';
import { fieldsFor, tintFor, merchantLabel, payWithLabel, accountLabel } from '../src/ui/tx/phone/txSheetState.js';

// This table IS TxForm's fx* truth table (src/drawers/TxForm.jsx:56-70).
// If TxForm changes, this test is the tripwire that the phone editor must follow.
const T = {
  expense:    { merchant: true,  category: true,  payWith: true,  account: false, transfer: false, adjust: false },
  income:     { merchant: true,  category: true,  payWith: false, account: true,  transfer: false, adjust: false },
  transfer:   { merchant: true,  category: false, payWith: false, account: false, transfer: true,  adjust: false },
  refund:     { merchant: true,  category: true,  payWith: true,  account: false, transfer: false, adjust: false },
  adjustment: { merchant: false, category: false, payWith: false, account: true,  transfer: false, adjust: true },
};
describe('fieldsFor', () => {
  for (const [type, expected] of Object.entries(T)) {
    it(type, () => expect(fieldsFor(type)).toEqual(expected));
  }
});
describe('labels and tint', () => {
  it('labels match TxForm copy', () => {
    expect(merchantLabel('income')).toBe('Payer / source');
    expect(merchantLabel('expense')).toBe('Paid to');
    expect(payWithLabel('refund')).toBe('Refund to');
    expect(payWithLabel('expense')).toBe('Paid with');
    expect(accountLabel('income')).toBe('Into account');
    expect(accountLabel('adjustment')).toBe('Account to adjust');
  });
  it('tint per type', () => {
    expect(tintFor('income')).toBe('var(--pos-soft)');
    expect(tintFor('refund')).toBe('var(--pos-soft)');
    expect(tintFor('transfer')).toBe('var(--soft)');
    expect(tintFor('expense')).toBe('var(--elev)');
    expect(tintFor('adjustment')).toBe('var(--elev)');
  });
});
```

- [ ] **Step 2: Run to fail**, then **Step 3: implement**

```js
// src/ui/tx/phone/txSheetState.js
// Per-type presentation facts for the phone tx editor. The booleans mirror
// TxForm's fx* flags (src/drawers/TxForm.jsx:56-70) — one truth table, tested.
export function fieldsFor(type) {
  return {
    merchant: type !== 'adjustment',
    category: type === 'expense' || type === 'income' || type === 'refund',
    payWith: type === 'expense' || type === 'refund',
    account: type === 'income' || type === 'adjustment',
    transfer: type === 'transfer',
    adjust: type === 'adjustment',
  };
}
export function tintFor(type) {
  if (type === 'income' || type === 'refund') return 'var(--pos-soft)';
  if (type === 'transfer') return 'var(--soft)';
  return 'var(--elev)';
}
export const merchantLabel = type => (type === 'income' ? 'Payer / source' : 'Paid to');
export const payWithLabel = type => (type === 'refund' ? 'Refund to' : 'Paid with');
export const accountLabel = type => (type === 'income' ? 'Into account' : 'Account to adjust');
```

- [ ] **Step 4: CategoryPickerSheet props** — signature becomes `({ open, onClose, onPick, catType = 'expense', allowCreate = true })`:
  - The category filter `c.type === 'expense'` becomes `c.type === catType`. First read `src/ui/PlanCategoryPicker.jsx`'s `catType`/`excludeRta` handling and replicate any RTA/pseudo-category exclusion it applies for `catType='income'` — the acceptance bar is: the option set equals what TxForm's desktop picker offers for the same type.
  - The Available amount span renders only when `catType === 'expense'` (income categories have no envelope — mirror TxForm's `showAmounts` rule).
  - The "＋ New Category" button renders only when `allowCreate` (from the tx editor it must be `false`: it opens the category drawer via `openDrawer`, which would REPLACE the addTx drawer state and destroy the draft).
  - Existing call sites pass neither prop → behavior unchanged.
- [ ] **Step 5: Run** — `npx vitest run` green; `npm run build` green.
- [ ] **Step 6: Commit** — `git commit -am "Tx editor prep: per-type field table (tested) + CategoryPickerSheet catType/allowCreate"`

---

### Task 6: TxSheet (expense + income) + DrawerProvider gate

Branch: `feat/mobile-tx-editor` (same).

**Files:**
- Create: `src/ui/tx/phone/TxSheet.jsx`
- Modify: `src/drawers/TxForm.jsx` (export the options hook: `function useOpts()` → `export function useTxOpts()`, update its two internal call sites; NO other change)
- Modify: `src/ui/DrawerProvider.jsx` (gate)

**Interfaces:**
- Consumes: drawer context (`useDrawer()` — `drawer`, `setForm`, `setField`), `def.useSubmit()` / `def.cta(state)` from the provider-passed `def`, `useTxOpts()` (bankOpts/creditOpts with balance labels), Task 4 `Keypad` + `src/lib/keypadState.js`, Task 5 helpers, `CategoryPickerSheet`, `parseAmt`/`useMoney`.
- Produces: `<TxSheet def state requestClose />` rendered by DrawerProvider instead of DrawerShell.

**Design contracts (bind the implementation):**
1. **One submission path**: Save calls the `submit` from `def.useSubmit()`. TxSheet never calls store actions directly.
2. **Stale-form guard**: `setField`/`setForm` are async React state — never call `submit()` in the same handler that commits the keypad draft. The footer CTA is two-phase: while the keypad draft is open (`kp != null`) the button reads "Done" and ONLY commits the draft (`setField('amount', String(result)); setKp(null)`); once closed it reads `def.cta(state)` and ONLY submits. The keypad's own Done does the same commit.
3. **Keypad semantics**: draft edited via `pressDigit/pressOp/pressBackspace/pressClear`; display via `displayOf`; `'equals'` → `evaluate(parseAmt(f.amount) || 0, kp)` and the result becomes the new draft (`String(result)`); committing evaluates the same way; `null` result (empty/invalid) commits nothing. Tapping any field row commits the draft first, then opens that row's control.
4. **Escape**: TxSheet is a Base UI `Dialog.Root open modal` with `onOpenChange(false) → requestClose` (the provider's dirty-guard). The provider's own document-level Escape listener must be SKIPPED while TxSheet renders (add `&& !phoneTx` to its condition) or Escape would trigger two discard confirms.
5. **Shell**: `Dialog.Popup` fixed `inset: 0`, `zIndex: 50`, `background: var(--bg)`, column flex; child sheets (category/account pickers at 60) stack above. ✕ top-left → `requestClose`.

- [ ] **Step 1: Export `useTxOpts` from TxForm.jsx** (pure rename + `export`; `npx vitest run` stays green).
- [ ] **Step 2: Write `TxSheet.jsx`.** Skeleton (implementer fleshes out styles to match the tokens; structure and handlers are the contract):

```jsx
// src/ui/tx/phone/TxSheet.jsx
// Phone-native rendering of the SAME addTx drawer: same form state, same
// useSubmit/useDanger — DrawerProvider chooses this shell on phone. Spec:
// docs/superpowers/specs/2026-08-15-mobile-accounts-ynab-design.md §3
import { useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { useDrawer } from '../../DrawerProvider.jsx';
import { useStore } from '../../../store/StoreProvider.jsx';
import { useMoney, parseAmt } from '../../../lib/format.js';
import { pressDigit, pressOp, pressBackspace, pressClear, evaluate, displayOf } from '../../../lib/keypadState.js';
import Keypad from '../../phone/Keypad.jsx';
import { fieldsFor, tintFor, merchantLabel, payWithLabel, accountLabel } from './txSheetState.js';
import { useTxOpts } from '../../../drawers/TxForm.jsx';
import CategoryPickerSheet from '../../../components/CategoryPickerSheet.jsx';
import { Menu, MenuTrigger, MenuPanel, MenuItem } from '../../primitives/Menu.jsx';
import { BottomSheet, BottomSheetPanel } from '../../primitives/BottomSheet.jsx';

const TYPE_LABELS = { expense: 'Expense', income: 'Income', transfer: 'Transfer', refund: 'Refund', adjustment: 'Adjustment' };
const rowStyle = last => ({ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 52, padding: '8px 14px',
  border: 'none', borderBottom: last ? 'none' : '1px solid var(--border)', background: 'none', color: 'var(--text)',
  font: 'inherit', cursor: 'pointer', textAlign: 'left' });

export default function TxSheet({ def, state, requestClose }) {
  const { drawer, setForm, setField } = useDrawer();
  const submit = def.useSubmit();
  const { data: S } = useStore();
  const { S: _S, bankOpts, creditOpts } = useTxOpts();
  const { money } = useMoney();
  const f = drawer.form, errors = drawer.errors;
  const type = f.type || 'expense';
  const fields = fieldsFor(type);
  // Keypad draft: null = closed. New transactions open with an empty draft.
  const [kp, setKp] = useState(() => (f.editId ? null : ''));
  const [picker, setPicker] = useState(null); // 'category' | 'payWith' | 'account' | null

  const current = parseAmt(f.amount) || 0;
  const commitKp = () => {
    if (kp == null) return;
    const r = evaluate(current, kp);
    if (r != null) setField('amount', String(r));
    setKp(null);
  };
  const onKey = (kind, v) => setKp(d => {
    if (kind === 'digit') return pressDigit(d, v);
    if (kind === 'op') return pressOp(d, v);
    if (kind === 'backspace') return pressBackspace(d);
    if (kind === 'clear') return pressClear();
    if (kind === 'equals') { const r = evaluate(current, d); return r != null ? String(r) : d; }
    return d;
  });
  const openRow = which => { commitKp(); setPicker(which); };
  const amountText = kp != null ? (displayOf(kp) || '0') : displayOf(String(f.amount || '0'));

  const catName = f.category ? (S.categories.find(c => c.id === f.category)?.name || '') : '';
  const optLabel = ref => [...bankOpts, ...creditOpts].find(o => o.id === ref)?.label || '';

  return (
    <Dialog.Root open modal onOpenChange={o => { if (!o) requestClose(); }}>
      <Dialog.Portal>
        <Dialog.Popup aria-label={def.title(state)}
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'var(--bg)', color: 'var(--text)',
            display: 'flex', flexDirection: 'column', outline: 'none' }}>
          {/* Amount header */}
          <div style={{ flex: 'none', background: tintFor(type), padding: '10px 16px 18px' }}>
            <button onClick={requestClose} aria-label="Close" className="hv-soft"
              style={{ width: 44, height: 44, border: 'none', borderRadius: 999, background: 'var(--surface)', color: 'var(--text)', fontSize: 17, cursor: 'pointer' }}>✕</button>
            <button onClick={() => setKp(k => (k == null ? String(f.amount || '') : k))} aria-label={'Amount, ' + amountText}
              className="tnum" style={{ display: 'block', width: '100%', border: 'none', background: 'none', color: 'var(--text)',
                fontSize: 40, fontWeight: 700, textAlign: 'center', cursor: 'pointer', padding: '6px 0 0' }}>
              {amountText}
            </button>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
              <Menu>
                <MenuTrigger className="hv-elev"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 16px',
                    border: '1px solid var(--border)', borderRadius: 999, background: 'var(--surface)', color: 'var(--text)',
                    font: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  {TYPE_LABELS[type]} <span aria-hidden="true" style={{ color: 'var(--muted)' }}>⌄</span>
                </MenuTrigger>
                <MenuPanel side="bottom" align="center">
                  {Object.entries(TYPE_LABELS).map(([id, label]) => (
                    <MenuItem key={id} onClick={() => setForm({ type: id, category: '', splitOn: false, splits: undefined })}>
                      <span style={{ width: 16, flex: 'none' }}>{type === id ? '✓' : ''}</span>{label}
                    </MenuItem>
                  ))}
                </MenuPanel>
              </Menu>
            </div>
          </div>

          {/* Scrollable body */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px' }}>
            {state.errList.length > 0 && (
              <div role="alert" style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--neg-soft)', border: '1px solid var(--neg)', marginBottom: 12 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--neg)' }}>Please fix the following:</div>
                {state.errList.map((e, i) => <div key={i} style={{ fontSize: 12.5, marginTop: 3 }}>• {e}</div>)}
              </div>
            )}
            {drawer.dupMsg && (
              <div role="alert" style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--warn-soft)', border: '1px solid var(--warn)', marginBottom: 12 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--warn)' }}>Possible duplicate — </span>
                <span style={{ fontSize: 12.5 }}>{drawer.dupMsg}</span>
              </div>
            )}

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              {fields.merchant && (
                <label style={{ ...rowStyle(false), cursor: 'text' }}>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{merchantLabel(type)}</span>
                    <input value={f.merchant} onFocus={commitKp} onChange={e => setField('merchant', e.target.value)}
                      placeholder="e.g. Imtiaz Super Market"
                      style={{ width: '100%', border: 'none', background: 'none', color: 'var(--text)', font: 'inherit', fontSize: 14.5, fontWeight: 500, outline: 'none', padding: 0 }} />
                  </span>
                </label>
              )}
              {fields.category && (
                <button onClick={() => openRow('category')} style={rowStyle(false)}>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>Category</span>
                    <span style={{ display: 'block', fontSize: 14.5, fontWeight: 500 }}>{catName || 'Choose…'}</span>
                  </span>
                  <span aria-hidden="true" style={{ color: 'var(--muted)' }}>›</span>
                </button>
              )}
              {(fields.payWith || fields.account) && (
                <button onClick={() => openRow(fields.payWith ? 'payWith' : 'account')} style={rowStyle(false)}>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{fields.payWith ? payWithLabel(type) : accountLabel(type)}</span>
                    <span style={{ display: 'block', fontSize: 14.5, fontWeight: 500 }}>{optLabel(fields.payWith ? f.payWith : f.account) || 'Choose…'}</span>
                  </span>
                  <span aria-hidden="true" style={{ color: 'var(--muted)' }}>›</span>
                </button>
              )}
              <label style={{ ...rowStyle(true), cursor: 'pointer' }}>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>Date</span>
                  <input type="date" value={f.date} onFocus={commitKp} onChange={e => setField('date', e.target.value)}
                    style={{ border: 'none', background: 'none', color: 'var(--text)', font: 'inherit', fontSize: 14.5, fontWeight: 500, outline: 'none', padding: 0 }} />
                </span>
              </label>
            </div>
          </div>

          {/* Keypad + CTA footer */}
          <div style={{ flex: 'none', background: 'var(--elev)', borderTop: '1px solid var(--border)',
            padding: '10px 12px calc(10px + env(safe-area-inset-bottom))' }}>
            {kp != null
              ? <Keypad onKey={onKey} onDone={commitKp} />
              : (
                <button onClick={submit} className="hv-accent"
                  style={{ width: '100%', height: 48, border: 'none', borderRadius: 999, background: 'var(--accent)',
                    color: 'var(--on-accent)', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                  {def.cta(state)}
                </button>
              )}
          </div>

          <CategoryPickerSheet open={picker === 'category'} onClose={() => setPicker(null)} allowCreate={false}
            catType={type === 'income' ? 'income' : 'expense'}
            onPick={id => { setField('category', id); setPicker(null); }} />
          <AccountSheet open={picker === 'payWith' || picker === 'account'} onClose={() => setPicker(null)}
            withCards={picker === 'payWith' && type === 'expense'} bankOpts={bankOpts} creditOpts={creditOpts}
            onPick={ref => { setField(picker === 'payWith' ? 'payWith' : 'account', ref); setPicker(null); }} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AccountSheet({ open, onClose, withCards, bankOpts, creditOpts, onPick }) {
  const opts = withCards ? [...bankOpts, ...creditOpts] : bankOpts;
  return (
    <BottomSheet open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <BottomSheetPanel label="Choose account">
        <div style={{ padding: '14px 16px', fontSize: 16, fontWeight: 700, borderBottom: '1px solid var(--border)', flex: 'none' }}>Choose account</div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 0 12px' }}>
          {opts.map((o, i) => (
            <button key={o.id} onClick={() => onPick(o.id)} className="hv-elev" style={rowStyle(i === opts.length - 1)}>
              <span className="tnum" style={{ flex: 1, minWidth: 0, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.label}</span>
            </button>
          ))}
        </div>
      </BottomSheetPanel>
    </BottomSheet>
  );
}
```

Notes for the implementer: `errors` per-field messages may additionally be surfaced under rows (`errors.category` etc.) — the `errList` block is the minimum. The `f.category === '__new'` inline-create path cannot be produced on phone (`allowCreate={false}`) — nothing to render for it.

- [ ] **Step 3: Provider gate** — in `src/ui/DrawerProvider.jsx`: import `useIsPhone` + `TxSheet`; inside `DrawerProvider` add `const phone = useIsPhone();` and:

```jsx
const phoneTx = phone && state?.name === 'addTx' && !state.form._classic
  && ['expense', 'income'].includes(state.form.type || 'expense'); // Task 7 widens to all five types
```

Render: `{state && def && (phoneTx ? <TxSheet key="tx-phone" def={def} state={state} requestClose={requestClose} /> : <DrawerShell key={state.name} … />)}`. In the Escape `useEffect`, the condition gains `&& !phoneTx` (Base UI's Dialog owns Escape for TxSheet; without this the discard confirm fires twice). NOTE the gate reads `state.form.type` — switching to a type outside the list mid-edit falls back to the classic drawer (correct interim behavior for this task; Task 7 removes the restriction).

- [ ] **Step 4: Run** — `npx vitest run` green; `npm run build` green.
- [ ] **Step 5: Commit** — `git commit -am "Tx editor: phone TxSheet (amount keypad, type menu, field rows) as an alternate addTx drawer shell — expense/income"`

---

### Task 7: Remaining types, Show more, edit extras, full gate

Branch: `git switch -c feat/mobile-tx-editor-types` (from `feat/mobile-tx-editor` head).

**Files:**
- Modify: `src/ui/tx/phone/TxSheet.jsx`, `src/ui/DrawerProvider.jsx`

**Interfaces:**
- Consumes: `def.useDanger()` (conditional hook is safe — TxSheet is keyed-mounted for addTx only, mirroring DrawerShell's pattern), Task 5 `fieldsFor` (`transfer`/`adjust` flags).

- [ ] **Step 1: Transfer layout** — when `fields.transfer`, replace the field-rows card with the two-card stack: "Transferred from" card (opens `AccountSheet` bank-only → `setField('from', ref)`), a centered `↓` glyph (`aria-hidden`, `color: var(--muted)`), "Transferred to" card (opens `AccountSheet` with `withCards` → `setField('to', ref)` — credit cards are bill payments, mirroring TxForm's optgroup), then the Date row. When `String(f.to).startsWith('card:')` render TxForm's "Card payment" info note verbatim (copy from `TxForm.jsx:216-221`).
- [ ] **Step 2: Adjustment rows** — when `fields.adjust`: a Direction row that toggles `f.direction` between `'increase'`/`'decrease'` (two-pill row, same idiom as the Cleared toggle below), and a Reason row (inline text input bound to `f.reason`, required label). Account row already renders via `fields.account`.
- [ ] **Step 3: Show more** — collapsed by default (open when `f.notes` is non-empty, mirroring TxForm's `noteOpen` seed); reveals, in order: Notes (textarea bound `f.notes`), Fee (transfer only — inline `inputMode="decimal"` input bound `f.fee`, hint "A fee is recorded separately as a Bank fees expense."), Status toggle (two pills bound `f.pending`: Cleared / Uncleared with TxForm's helper text), and **All options** — a row (`color: var(--accent)`) whose onClick is `setForm({ _classic: true })`. The provider then renders the classic DrawerShell with the SAME form state — the draft carries over wholesale. (Known nuance: `setForm` marks the drawer dirty, so closing the classic form immediately still asks to discard — acceptable, the draft genuinely traveled.)
- [ ] **Step 4: Edit extras** — when `f.editId`: render TxForm's edited-before notice (copy `TxForm.jsx:93-98` verbatim, deriving `prev` the same way) above the rows, and a Delete row/button under the card wired to `def.useDanger()`'s `onClick` (renders only when the hook returns non-null).
- [ ] **Step 5: Widen the gate** — in DrawerProvider drop the type-list condition: `const phoneTx = phone && state?.name === 'addTx' && !state.form._classic;`.
- [ ] **Step 6: Run** — `npx vitest run` green; `npm run build` green.
- [ ] **Step 7: Commit** — `git commit -am "Tx editor: transfer/refund/adjustment layouts, Show more (notes, fee, status, All options), edit mode + Delete"`

---

### Task 8: Suite, build, stack submission

Branch: `feat/mobile-tx-editor-types` (top).

- [ ] **Step 1:** `npx vitest run` — full suite green; `npm run build` — green. Record test count.
- [ ] **Step 2:** Create the stack from the four existing branches (adopts them, trunk `main`):

```bash
git config rerere.enabled true
git config remote.pushDefault origin
gh stack init feat/mobile-accounts-list feat/mobile-accounts-register feat/mobile-tx-editor feat/mobile-tx-editor-types
gh stack submit --auto        # pushes + opens DRAFT PRs
gh stack view --json          # capture PR numbers
```

- [ ] **Step 3:** Retitle the PRs (auto-titles are humanized branch names):

```bash
gh pr edit <n1> --title "Mobile Accounts 1/4: YNAB-style phone accounts list (kind groups, archived sheet) + spec"
gh pr edit <n2> --title "Mobile Accounts 2/4: account register header (back, institution, Edit)"
gh pr edit <n3> --title "Mobile Accounts 3/4: phone transaction editor — keypad amount, type menu, field rows"
gh pr edit <n4> --title "Mobile Accounts 4/4: transfer/refund/adjustment, Show more, edit mode"
```

- [ ] **Step 4:** PRs stay DRAFTS. Report stack + PR numbers in the ledger.

### Task 9: Live phone verification (Playwright subagent)

Dispatch ONE browser subagent (mutating — never in parallel with another; NEVER click the app's Undo button; every write restored by its exact inverse; if `.env.local` is missing in the worktree, copy it from the main checkout before `npm run dev`). Viewport 390×780 against the real app, checklist:

1. `/accounts`: groups render with kind labels + totals; no horizontal overflow; collapse toggles; balances match desktop values at 1280.
2. Archived row opens the sheet; Restore is NOT clicked (mutating) — presence-check only, unless an expendable test account exists; close sheet.
3. Tap an account → register shows back chevron, nickname + institution, working-balance strip; back returns to `/accounts`; Edit opens the account drawer (cancel out).
4. Add expense via ＋: keypad digits → `500+40` → `=` shows 540 → Done → category via sheet → account via sheet → Save. Row appears in register. Then delete it via edit → Delete (exact inverse). RTA/plan unaffected.
5. Income add/cancel: type menu switch to Income relabels rows (Payer / source, Into account); ✕ discards (confirm dialog appears because of the type-switch dirty flag — accept discard).
6. Transfer: from/to two-card layout; pick both; Save; verify both balances moved; delete the transfer (inverse).
7. Edit an existing transaction: amount tap opens keypad seeded with current amount; change and Save; then restore the original amount via the same path (inverse).
8. All options: draft (amount+merchant typed) → Show more → All options → classic drawer opens with the same values; Cancel + discard.
9. Duplicate flow: add the same expense twice — second Save shows the duplicate warning, CTA becomes "Save anyway"; cancel out; delete the first (inverse).
10. Desktop 1280 regression: Accounts grid, Transactions toolbar, TxForm drawer all render exactly as before; phone `/transactions` (no account) shows NO back chevron and NO Edit pill.
11. Dark mode spot-check of ①–③ surfaces; 0 console errors throughout.

Any failure → fix loop per SDD, re-verify the failed checks.

### Task 10: Accessibility audit

Run `/accessibility` on the three new surfaces (AccountsPhone, register header, TxSheet + its sheets). Fix Critical/Serious findings (amounts announced via accessible names — the keypad display and account balances especially; labeled inputs; ≥24×24 targets; contrast on tinted headers). Re-run the affected live checks if fixes touch behavior. Commit fixes on the branch that owns the file (navigate the stack with `gh stack checkout` + `gh stack rebase --upstack` per the gh-stack skill).

---

## Self-review notes

- Spec coverage: §1 → Tasks 1-2; §2 → Task 3; §3 → Tasks 4-7; testing → Tasks 1/5/8/9/10; delivery → Task 8. The spec's "shared submit path" invariant is resolved by the alternate-shell architecture (stronger than extraction — zero duplication), and the `fromRecurring` flow (openers.recordRule prefills the same addTx drawer) works unchanged through it.
- Type consistency: `accountGroupsFor(S, balanceOf)` rows `{acct, inst, raw}` used identically in Tasks 1-2; `fieldsFor` keys match Task 6-7 usage; `Keypad` onKey kinds match KeypadSheet's existing contract.
- Deviation from spec noted: the spec's §2 "Working balance figure" already exists via `PositionStrip compact` on phone (`.pos-lead .tnum` 28px) — Task 3 therefore adds only back/subtitle/Edit rather than duplicating the figure.
