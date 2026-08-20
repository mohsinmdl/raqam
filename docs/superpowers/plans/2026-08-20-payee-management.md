# Payee Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full YNAB-parity payee management: a `payees` overlay collection (synced), "Saved Payees" + "Manage Payees" in the editor's payee dropdown, auto-categorize on payee pick, and a Manage Payees modal with rename / rules / hide / combine / delete-with-reassignment and modal-scoped Undo/Redo.

**Architecture:** The `payees` collection is an **overlay** — a record exists only once a payee has customizations; the visible list is always the case-insensitive union of distinct transaction merchants and records. All writes are pure store actions through `applyData` (undo + audit free). The modal's scoped Undo/Redo is a boundary-marker window over the existing global stack (`src/lib/scopedUndo.js`), not a second history.

**Tech Stack:** React 18 + Vite, `@base-ui/react` 1.7.0 (dialog), Supabase (one new migration), Vitest pure-logic tests only (no jsdom), pnpm.

**Spec:** `docs/superpowers/specs/2026-08-20-payee-management-design.md`

## Global Constraints

- `pnpm test` (vitest, NO jsdom — never render components; new behavior in pure modules). `pnpm build` must stay green.
- Every new component is module-scope (structural test, empty allowlist). Inline styles with theme tokens only.
- All data writes go through `applyData` + pure actions in `src/store/actions.js`, each prepending a `makeAudit` row (entityType `'payee'` — the migration extends the CHECK). Actions no-op by returning the same `data` reference.
- Payee names match transactions **case-insensitively** on `merchant`; adjustments (`adjustment`/`cardAdjustment`) are NEVER payees and never rewritten by payee operations.
- Delete = **reassign-then-remove**: `''` replacement = [No Payee] (blanks `merchant`).
- Transfer payees are synthesized; the only stored customization is `hidden` via a record with `transferRef`. Rename/rules/auto-categorize/combine/delete never apply to them.
- Rename rules are stored + tested now but have NO production caller (the app has no import feature yet — `src/lib/csv.js` is export-only). `applyRenameRules` is the ready hook; do not invent an import UI.
- Commit after every task; push; NEVER open a PR. Branch: `worktree-payee-management-spec`.
- The Supabase migration is code in this repo; applying it to the hosted project is the user's deploy step — never run SQL against the live DB.

---

### Task 1: `payees` migration + sync mapping

**Files:**
- Create: `supabase/migrations/0016_payees.sql`
- Modify: `src/store/sync.js` (COLLECTIONS gains a `payees` entry, after `recurring`)
- Modify: `src/store/seed.js` (empty-store collections list gains `payees: []`)
- Test: extend the sync mapper test (find it: `grep -rln "COLLECTIONS" tests/` — assert the new mapper round-trips)

**Interfaces:**
- Produces: client record shape `{ id, name, transferRef?, autoCategorize?, autoCategoryId? (catId|'rta'), renameRules? ([{op:'contains'|'is', pattern}]), hidden? }` — optional fields absent (stripNulls), never null. Every later task consumes this shape.

- [ ] **Step 1: Write the migration**

```sql
-- Payees: an OVERLAY collection for payee customizations (Spec 2). A row
-- exists only once a payee has customizations; the payee LIST is derived
-- client-side from distinct transaction merchants ∪ these rows (name matched
-- case-insensitively against transactions.merchant — no FK, mirroring how
-- budgets.category_id stays a plain text column). transfer_ref set = the row
-- customizes a synthesized transfer payee (visibility only).
create table public.payees (
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id                text not null default gen_random_uuid()::text,
  name              text not null default '',
  transfer_ref      text,
  auto_categorize   boolean not null default false,
  auto_category_id  text,
  auto_category_rta boolean not null default false,
  rename_rules      jsonb not null default '[]'::jsonb,
  hidden            boolean not null default false,
  created_at        timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.payees enable row level security;
create policy "own select" on public.payees for select to authenticated using ((select auth.uid()) = user_id);
create policy "own insert" on public.payees for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own update" on public.payees for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own delete" on public.payees for delete to authenticated using ((select auth.uid()) = user_id);

-- Payee operations are audited entities now.
alter table public.audit_log drop constraint if exists audit_log_entity_type_check;
alter table public.audit_log add constraint audit_log_entity_type_check
  check (entity_type in ('transaction','account','card','category','budget','recurring','app','payee'));
```

Before committing, verify the mirror-claims: `grep -n "primary key (user_id, id)" supabase/migrations/0001_init.sql` (budgets/recurring use this composite PK) and confirm the CURRENT entity_type list you are replacing is the one in the latest migration that touched it (`grep -n "entity_type in" supabase/migrations/*.sql | tail -1`) — copy that list verbatim + `'payee'`.

- [ ] **Step 2: Sync mapper + seed**

In `src/store/sync.js`, add after the `recurring` entry (explicit nulls on toRow — clearing auto-categorize must clear columns):

```js
  {
    name: 'payees', table: 'payees', keyOf: r => r.id,
    toRow: r => ({
      id: r.id, name: r.name || '', transfer_ref: r.transferRef ?? null,
      auto_categorize: !!r.autoCategorize,
      auto_category_id: r.autoCategoryId && r.autoCategoryId !== 'rta' ? r.autoCategoryId : null,
      auto_category_rta: r.autoCategoryId === 'rta',
      rename_rules: r.renameRules || [], hidden: !!r.hidden,
    }),
    fromRow: r => stripNulls({
      id: r.id, name: r.name || '', transferRef: r.transfer_ref,
      autoCategorize: r.auto_categorize || undefined,
      autoCategoryId: r.auto_category_rta ? 'rta' : (r.auto_category_id || undefined),
      renameRules: (r.rename_rules && r.rename_rules.length) ? r.rename_rules : undefined,
      hidden: r.hidden || undefined,
    }),
  },
```

In `src/store/seed.js`, add `payees: []` to the empty-store collections object (the line listing `accounts: [], snapshots: [], ...`). Then verify `fetchAll` and the diff queue derive from `COLLECTIONS` (grep `COLLECTIONS` in sync.js) so no other wiring is needed — note the finding in your report.

- [ ] **Step 3: Extend the sync mapper test**

Locate the existing mapper/round-trip test file (`grep -rln "toRow\|COLLECTIONS" tests/`). Add, in its style:

```js
it('payees mapper round-trips, including the rta sentinel and transferRef', () => {
  const col = COLLECTIONS.find(c => c.name === 'payees');
  const full = { id: 'p1', name: 'Subway', autoCategorize: true, autoCategoryId: 'rta', renameRules: [{ op: 'is', pattern: 'SUBWAY*' }], hidden: true };
  expect(col.fromRow(col.toRow(full))).toEqual(full);
  const cat = { id: 'p2', name: 'Mepco', autoCategorize: true, autoCategoryId: 'c9' };
  expect(col.fromRow(col.toRow(cat))).toEqual(cat);
  const transfer = { id: 'p3', name: '', transferRef: 'acc:a1', hidden: true };
  expect(col.fromRow(col.toRow(transfer))).toEqual(transfer);
  const minimal = { id: 'p4', name: 'Dental' };
  expect(col.fromRow(col.toRow(minimal))).toEqual(minimal);
});
```

- [ ] **Step 4: Run** `pnpm test` — expect the new case green, all others untouched.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0016_payees.sql src/store/sync.js src/store/seed.js tests/
git commit -m "payees: table + RLS + audit entity, sync mapper, empty-store seed"
```

---

### Task 2: `src/lib/payees.js` — the pure payee index

**Files:**
- Create: `src/lib/payees.js`
- Test: `tests/payees.test.js`

**Interfaces (Produces):**
- `payeeKey(name) → string` (trimmed, lowercased)
- `payeeRecordFor(S, name) → record|null` (non-transfer records only)
- `payeeIndex(S) → [{ name, record: record|null, txCount: number }]` sorted by localeCompare; union of distinct merchants (skipping blanks and adjustment types) and non-transfer records; record casing wins over merchant casing
- `transferHidden(S, ref) → bool`
- `autoCategoryFor(S, name) → catId | 'rta' | null`
- `applyRenameRules(name, payees) → string` — 'is' (exact, ci) rules from ANY record beat 'contains' (substring, ci); within a tier, first record then first rule wins; no match → name unchanged
- `matchesPayeeTx(t, key) → bool` — non-adjustment tx whose merchant matches the key

- [ ] **Step 1: Failing tests**

```js
// tests/payees.test.js
import { describe, it, expect } from 'vitest';
import { payeeKey, payeeRecordFor, payeeIndex, transferHidden, autoCategoryFor, applyRenameRules, matchesPayeeTx } from '../src/lib/payees.js';

const S = {
  transactions: [
    { type: 'expense', merchant: 'Subway' }, { type: 'expense', merchant: 'subway' },
    { type: 'income', merchant: 'CodingCops' }, { type: 'expense', merchant: '' },
    { type: 'adjustment', merchant: 'Balance adjustment' },
  ],
  payees: [
    { id: 'p1', name: 'SUBWAY', autoCategorize: true, autoCategoryId: 'c9', renameRules: [{ op: 'contains', pattern: 'sub' }] },
    { id: 'p2', name: 'Landlord', hidden: true },                    // record with no transactions
    { id: 'p3', name: '', transferRef: 'acc:a1', hidden: true },     // hidden transfer payee
    { id: 'p4', name: 'Mepco', renameRules: [{ op: 'is', pattern: 'MEPCO LTD' }] },
  ],
};

describe('payeeIndex', () => {
  it('unions merchants and records; record casing wins; counts case-insensitively', () => {
    const idx = payeeIndex(S);
    const subway = idx.find(p => payeeKey(p.name) === 'subway');
    expect(subway.name).toBe('SUBWAY');       // record casing wins
    expect(subway.txCount).toBe(2);
    expect(subway.record.id).toBe('p1');
    const landlord = idx.find(p => p.name === 'Landlord');
    expect(landlord.txCount).toBe(0);         // record-only payee still listed
    expect(idx.some(p => p.name === 'Balance adjustment')).toBe(false); // adjustments never payees
    expect(idx.some(p => p.name === '')).toBe(false);
    expect(idx.map(p => p.name)).toEqual([...idx.map(p => p.name)].sort((a, b) => a.localeCompare(b)));
  });
  it('transfer records never appear in the index', () => {
    expect(payeeIndex(S).some(p => p.record && p.record.transferRef)).toBe(false);
  });
});

describe('lookups', () => {
  it('payeeRecordFor is case-insensitive and skips transfer records', () => {
    expect(payeeRecordFor(S, 'subway').id).toBe('p1');
    expect(payeeRecordFor(S, 'nope')).toBe(null);
  });
  it('transferHidden reads transferRef records', () => {
    expect(transferHidden(S, 'acc:a1')).toBe(true);
    expect(transferHidden(S, 'acc:a2')).toBe(false);
  });
  it('autoCategoryFor returns the id only when autoCategorize is on', () => {
    expect(autoCategoryFor(S, 'Subway')).toBe('c9');
    expect(autoCategoryFor(S, 'Mepco')).toBe(null);
    expect(autoCategoryFor(S, 'unknown')).toBe(null);
  });
});

describe('applyRenameRules', () => {
  it('is-rules beat contains-rules regardless of record order', () => {
    expect(applyRenameRules('MEPCO LTD', S.payees)).toBe('Mepco');   // p4 'is' wins over p1 'contains'... no overlap here
    expect(applyRenameRules('my subway order', S.payees)).toBe('SUBWAY'); // contains, ci
    expect(applyRenameRules('unmatched', S.payees)).toBe('unmatched');
  });
  it('an is-rule on a later record beats an earlier contains-rule', () => {
    const payees = [
      { id: 'a', name: 'First', renameRules: [{ op: 'contains', pattern: 'shop' }] },
      { id: 'b', name: 'Second', renameRules: [{ op: 'is', pattern: 'THE SHOP' }] },
    ];
    expect(applyRenameRules('THE SHOP', payees)).toBe('Second');
    expect(applyRenameRules('the shop nearby', payees)).toBe('First');
  });
});

describe('matchesPayeeTx', () => {
  it('matches merchant case-insensitively and never adjustments', () => {
    expect(matchesPayeeTx({ type: 'expense', merchant: 'SUBWAY' }, 'subway')).toBe(true);
    expect(matchesPayeeTx({ type: 'adjustment', merchant: 'subway' }, 'subway')).toBe(false);
    expect(matchesPayeeTx({ type: 'cardAdjustment', merchant: 'subway' }, 'subway')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to FAIL** (`pnpm test tests/payees.test.js`)

- [ ] **Step 3: Implement**

```js
// src/lib/payees.js
// The payee OVERLAY (Spec 2): payees are the distinct merchant strings on
// transactions; a S.payees record exists only once one is customized
// (auto-categorize, rename rules, hidden, canonical casing). Everything here
// is pure and case-insensitive on the trimmed name. Adjustment rows write a
// machine merchant ('Balance adjustment') and are never payees. Records with
// transferRef customize SYNTHESIZED transfer payees (visibility only) and
// never join the name index.
export const payeeKey = name => String(name || '').trim().toLowerCase();

export const matchesPayeeTx = (t, key) =>
  t.type !== 'adjustment' && t.type !== 'cardAdjustment' && payeeKey(t.merchant) === key;

export function payeeRecordFor(S, name) {
  const k = payeeKey(name);
  if (!k) return null;
  return S.payees.find(p => !p.transferRef && payeeKey(p.name) === k) || null;
}

export function payeeIndex(S) {
  const byKey = new Map(); // key -> { name, record, txCount }
  for (const t of S.transactions) {
    const k = payeeKey(t.merchant);
    if (!k || t.type === 'adjustment' || t.type === 'cardAdjustment') continue;
    const cur = byKey.get(k);
    if (cur) cur.txCount += 1;
    else byKey.set(k, { name: t.merchant.trim(), record: null, txCount: 1 });
  }
  for (const p of S.payees) {
    if (p.transferRef) continue;
    const k = payeeKey(p.name);
    if (!k) continue;
    const cur = byKey.get(k);
    if (cur) { cur.record = p; cur.name = p.name; } // record casing wins
    else byKey.set(k, { name: p.name, record: p, txCount: 0 });
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function transferHidden(S, ref) {
  return S.payees.some(p => p.transferRef === ref && p.hidden);
}

export function autoCategoryFor(S, name) {
  const r = payeeRecordFor(S, name);
  return r && r.autoCategorize ? (r.autoCategoryId || null) : null;
}

// Import-time canonicalization (NO production caller yet — the app has no
// file-import feature; this is the ready hook). 'is' rules are exact-match
// and beat every 'contains' rule; within a tier, record order then rule
// order decides.
export function applyRenameRules(name, payees) {
  const k = payeeKey(name);
  if (!k) return name;
  const records = payees.filter(p => !p.transferRef && (p.renameRules || []).length);
  for (const op of ['is', 'contains']) {
    for (const p of records) {
      for (const rule of p.renameRules) {
        if (rule.op !== op) continue;
        const pat = payeeKey(rule.pattern);
        if (!pat) continue;
        if (op === 'is' ? k === pat : k.includes(pat)) return p.name;
      }
    }
  }
  return name;
}
```

- [ ] **Step 4: Run to PASS**, then full `pnpm test`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/payees.js tests/payees.test.js
git commit -m "payees lib: overlay index, rule matching, auto-category lookup"
```

---

### Task 3: Payee store actions

**Files:**
- Modify: `src/store/actions.js` (new section after the transaction actions)
- Test: `tests/payee-actions.test.js`

**Interfaces:**
- Consumes: `payeeKey`, `matchesPayeeTx`, `payeeRecordFor` (Task 2); `makeAudit` from `./audit.js`; `uid`.
- Produces (each takes `(data, payload)` → new data, no-ops by returning `data` unchanged; ONE audit row per call, entityType `'payee'`):
  - `upsertPayee(data, { name, patch })` — create-or-update the record for `name`; `patch` may set `autoCategorize`, `autoCategoryId`, `renameRules`, `hidden`, but never `name`/`transferRef`.
  - `renamePayee(data, { from, to })` — record's `name` (if one exists) + bulk merchant update; no-op if `to` is blank or same key.
  - `combinePayees(data, { names, into })` — merchants of all `names` → `into` (exact `into` casing); rename rules of absorbed records merged (deduped by op+key(pattern)) into `into`'s record (created if rules exist and none does); absorbed records removed.
  - `deletePayees(data, { names, replacement })` — matching merchants → `replacement` (may be `''`); records removed.
  - `setPayeesHidden(data, { names = [], transferRefs = [], hidden })` — upserts `hidden`; un-hiding a record with no other customization deletes it (overlay stays minimal).

- [ ] **Step 1: Failing tests**

```js
// tests/payee-actions.test.js
import { describe, it, expect } from 'vitest';
import { upsertPayee, renamePayee, combinePayees, deletePayees, setPayeesHidden } from '../src/store/actions.js';

const base = () => ({
  transactions: [
    { id: 't1', type: 'expense', merchant: 'Subway', amount: 5 },
    { id: 't2', type: 'expense', merchant: 'SUBWAY', amount: 6 },
    { id: 't3', type: 'income', merchant: 'CodingCops', amount: 7 },
    { id: 't4', type: 'adjustment', merchant: 'Subway', amount: 1 },  // never rewritten
  ],
  payees: [
    { id: 'p1', name: 'Subway', renameRules: [{ op: 'contains', pattern: 'sub' }] },
    { id: 'p2', name: 'CodingCops', autoCategorize: true, autoCategoryId: 'c9' },
  ],
  audit: [],
});

describe('upsertPayee', () => {
  it('creates a record for an uncustomized payee', () => {
    const next = upsertPayee(base(), { name: 'New Shop', patch: { hidden: true } });
    const rec = next.payees.find(p => p.name === 'New Shop');
    expect(rec.hidden).toBe(true);
    expect(next.audit[0].entityType).toBe('payee');
  });
  it('updates in place, case-insensitively', () => {
    const next = upsertPayee(base(), { name: 'sUbWaY', patch: { autoCategorize: true, autoCategoryId: 'c1' } });
    expect(next.payees.find(p => p.id === 'p1').autoCategoryId).toBe('c1');
    expect(next.payees.length).toBe(2);
  });
});

describe('renamePayee', () => {
  it('bulk-updates merchants (ci) and the record name, skipping adjustments', () => {
    const next = renamePayee(base(), { from: 'subway', to: 'Subway Gulberg' });
    expect(next.transactions.find(t => t.id === 't1').merchant).toBe('Subway Gulberg');
    expect(next.transactions.find(t => t.id === 't2').merchant).toBe('Subway Gulberg');
    expect(next.transactions.find(t => t.id === 't4').merchant).toBe('Subway'); // adjustment untouched
    expect(next.payees.find(p => p.id === 'p1').name).toBe('Subway Gulberg');
    expect(next.audit[0].summary).toContain('Subway Gulberg');
  });
  it('no-ops on blank or same-key rename', () => {
    const d = base();
    expect(renamePayee(d, { from: 'Subway', to: '  ' })).toBe(d);
    expect(renamePayee(d, { from: 'Subway', to: 'SUBWAY' })).toBe(d);
  });
});

describe('combinePayees', () => {
  it('rewrites merchants, merges rules into the survivor, drops absorbed records', () => {
    const next = combinePayees(base(), { names: ['Subway', 'CodingCops'], into: 'Everything' });
    expect(next.transactions.filter(t => t.merchant === 'Everything').map(t => t.id).sort()).toEqual(['t1', 't2', 't3']);
    expect(next.payees.some(p => p.id === 'p1' || p.id === 'p2')).toBe(false);
    const survivor = next.payees.find(p => p.name === 'Everything');
    expect(survivor.renameRules).toEqual([{ op: 'contains', pattern: 'sub' }]);
  });
});

describe('deletePayees', () => {
  it('reassigns to the replacement and removes records', () => {
    const next = deletePayees(base(), { names: ['Subway'], replacement: 'CodingCops' });
    expect(next.transactions.find(t => t.id === 't1').merchant).toBe('CodingCops');
    expect(next.payees.some(p => p.id === 'p1')).toBe(false);
  });
  it('[No Payee] blanks the merchant', () => {
    const next = deletePayees(base(), { names: ['Subway'], replacement: '' });
    expect(next.transactions.find(t => t.id === 't1').merchant).toBe('');
    expect(next.transactions.find(t => t.id === 't4').merchant).toBe('Subway');
  });
});

describe('setPayeesHidden', () => {
  it('hides names and transfer refs; un-hiding a bare record removes it', () => {
    let next = setPayeesHidden(base(), { names: ['Subway'], transferRefs: ['acc:a1'], hidden: true });
    expect(next.payees.find(p => p.id === 'p1').hidden).toBe(true);
    expect(next.payees.find(p => p.transferRef === 'acc:a1').hidden).toBe(true);
    next = setPayeesHidden(next, { transferRefs: ['acc:a1'], hidden: false });
    expect(next.payees.some(p => p.transferRef === 'acc:a1')).toBe(false); // bare record dropped
  });
});
```

- [ ] **Step 2: Run to FAIL, then implement**

Add to `src/store/actions.js` (import `payeeKey, matchesPayeeTx, payeeRecordFor` from `../lib/payees.js`):

```js
// ---- Payees (Spec 2 overlay) ------------------------------------------------
// A payee is the merchant string on transactions; a S.payees record exists
// only once it is customized. Bulk merchant rewrites here are the ONLY place
// merchant strings change wholesale — always case-insensitive on the trimmed
// name and never touching adjustments (their merchant is machine-written).

const payeeAudit = (summary, before = null, after = null) =>
  makeAudit({ entityType: 'payee', entityId: 'payees', action: 'update', summary, before, after });

function rewriteMerchants(transactions, keys, to) {
  let changed = 0;
  const out = transactions.map(t => {
    if (!keys.some(k => matchesPayeeTx(t, k))) return t;
    changed += 1;
    return stampUpdate({ ...t, merchant: to });
  });
  return { out, changed };
}

export function upsertPayee(data, { name, patch }) {
  const k = payeeKey(name);
  if (!k) return data;
  const existing = payeeRecordFor(data, name);
  const rec = existing
    ? { ...existing, ...patch }
    : { id: uid(), name: String(name).trim(), ...patch };
  if (existing && JSON.stringify(rec) === JSON.stringify(existing)) return data;
  const payees = existing
    ? data.payees.map(p => (p.id === existing.id ? rec : p))
    : [...data.payees, rec];
  return { ...data, payees, audit: [payeeAudit('Updated payee “' + rec.name + '”'), ...(data.audit || [])] };
}

export function renamePayee(data, { from, to }) {
  const toName = String(to || '').trim();
  const fromKey = payeeKey(from);
  if (!toName || !fromKey || payeeKey(toName) === fromKey) return data;
  const { out, changed } = rewriteMerchants(data.transactions, [fromKey], toName);
  const rec = payeeRecordFor(data, from);
  const payees = rec ? data.payees.map(p => (p.id === rec.id ? { ...p, name: toName } : p)) : data.payees;
  if (!changed && !rec) return data;
  return {
    ...data, transactions: out, payees,
    audit: [payeeAudit('Renamed payee “' + String(from).trim() + '” to “' + toName + '” (' + changed + ' transaction' + (changed === 1 ? '' : 's') + ')'), ...(data.audit || [])],
  };
}

export function combinePayees(data, { names, into }) {
  const intoName = String(into || '').trim();
  if (!intoName || !names || names.length === 0) return data;
  const intoKey = payeeKey(intoName);
  const absorbedKeys = names.map(payeeKey).filter(k => k && k !== intoKey);
  const allKeys = [...new Set([...absorbedKeys, ...names.map(payeeKey).filter(Boolean)])];
  const { out, changed } = rewriteMerchants(data.transactions, allKeys, intoName);
  const absorbed = data.payees.filter(p => !p.transferRef && absorbedKeys.includes(payeeKey(p.name)));
  // Combining also combines renaming rules (YNAB copy) — deduped by op+pattern.
  const survivorExisting = payeeRecordFor(data, intoName);
  const ruleKey = r => r.op + '|' + payeeKey(r.pattern);
  const mergedRules = [];
  const seenRules = new Set();
  for (const r of [...(survivorExisting?.renameRules || []), ...absorbed.flatMap(p => p.renameRules || [])]) {
    if (seenRules.has(ruleKey(r))) continue;
    seenRules.add(ruleKey(r));
    mergedRules.push(r);
  }
  let payees = data.payees.filter(p => !absorbed.includes(p));
  if (survivorExisting) {
    payees = payees.map(p => (p.id === survivorExisting.id ? { ...p, name: intoName, ...(mergedRules.length ? { renameRules: mergedRules } : {}) } : p));
  } else if (mergedRules.length) {
    payees = [...payees, { id: uid(), name: intoName, renameRules: mergedRules }];
  }
  if (!changed && absorbed.length === 0) return data;
  return {
    ...data, transactions: out, payees,
    audit: [payeeAudit('Combined ' + names.length + ' payees into “' + intoName + '” (' + changed + ' transaction' + (changed === 1 ? '' : 's') + ')'), ...(data.audit || [])],
  };
}

export function deletePayees(data, { names, replacement = '' }) {
  const keys = (names || []).map(payeeKey).filter(Boolean);
  if (keys.length === 0) return data;
  const { out, changed } = rewriteMerchants(data.transactions, keys, String(replacement || '').trim());
  const payees = data.payees.filter(p => p.transferRef || !keys.includes(payeeKey(p.name)));
  if (!changed && payees.length === data.payees.length) return data;
  const dest = String(replacement || '').trim() || '[No Payee]';
  return {
    ...data, transactions: out, payees,
    audit: [payeeAudit('Deleted ' + keys.length + ' payee' + (keys.length === 1 ? '' : 's') + ' — ' + changed + ' transaction' + (changed === 1 ? '' : 's') + ' reassigned to ' + dest), ...(data.audit || [])],
  };
}

// A record whose ONLY remaining customization was `hidden` disappears when
// un-hidden, keeping the overlay minimal.
const bareAfterUnhide = p => !p.autoCategorize && !p.autoCategoryId && !(p.renameRules || []).length;

export function setPayeesHidden(data, { names = [], transferRefs = [], hidden }) {
  let payees = [...data.payees];
  let changed = 0;
  for (const name of names) {
    const rec = payeeRecordFor({ payees }, name);
    if (rec) {
      if (!!rec.hidden === !!hidden) continue;
      changed += 1;
      if (!hidden && bareAfterUnhide(rec)) payees = payees.filter(p => p.id !== rec.id);
      else payees = payees.map(p => (p.id === rec.id ? { ...p, hidden } : p));
    } else if (hidden) {
      changed += 1;
      payees = [...payees, { id: uid(), name: String(name).trim(), hidden: true }];
    }
  }
  for (const ref of transferRefs) {
    const rec = payees.find(p => p.transferRef === ref);
    if (rec) {
      if (!!rec.hidden === !!hidden) continue;
      changed += 1;
      if (!hidden) payees = payees.filter(p => p.id !== rec.id); // transfer records hold nothing else
      else payees = payees.map(p => (p === rec ? { ...p, hidden } : p));
    } else if (hidden) {
      changed += 1;
      payees = [...payees, { id: uid(), name: '', transferRef: ref, hidden: true }];
    }
  }
  if (!changed) return data;
  const n = names.length + transferRefs.length;
  return {
    ...data, payees,
    audit: [payeeAudit((hidden ? 'Hid ' : 'Unhid ') + n + ' payee' + (n === 1 ? '' : 's')), ...(data.audit || [])],
  };
}
```

Note: `stampUpdate` is already imported in actions.js; `payeeRecordFor` is called with `{ payees }` in one spot — it only reads `.payees`, which is why Task 2's implementation must not touch other collections (it doesn't).

- [ ] **Step 3: Run to PASS**, full suite.

- [ ] **Step 4: Commit**

```bash
git add src/store/actions.js tests/payee-actions.test.js
git commit -m "payee actions: upsert, rename, combine, delete-with-reassign, hide"
```

---

### Task 4: Saved Payees in the dropdown + Manage link plumbing

**Files:**
- Modify: `src/lib/payeeOptions.js` (union + hidden filtering)
- Modify: `src/ui/UIProvider.jsx` (a `payeesOpen` flag + open/close, mirroring `shortcutsOpen` exactly — read the file first)
- Modify: `src/ui/tx/inline/PayeeCell.jsx` (footer link via ComboboxPanel's existing `footer` prop)
- Test: `tests/payee-options.test.js` (extend)

**Interfaces:**
- Consumes: `payeeIndex`, `transferHidden` (Task 2); `ComboboxPanel({ children, footer })` (exists since Spec 1).
- Produces: `payeeSections(S, { sourceRef, query })` — same shape as today, but: the payees section is titled **'Saved Payees'**, built from `payeeIndex` minus hidden records; transfers minus `transferHidden` refs. `useUI()` gains `payeesOpen`, `openPayees()`, `closePayees()`.

- [ ] **Step 1: Extend the tests (failing)**

```js
// append to tests/payee-options.test.js (adapt S to include payees)
it('saved payees come from the index, hidden ones excluded, record casing wins', () => {
  const S2 = { ...S, payees: [
    { id: 'p1', name: 'SUBWAY' },
    { id: 'p2', name: 'Car Wash', hidden: true },
    { id: 'p3', name: 'Landlord' },                        // record-only payee
  ] };
  const sections = payeeSections(S2, { sourceRef: 'acc:a1', query: '' });
  const saved = sections.find(s => s.label === 'Saved Payees');
  const names = saved.items.map(i => i.name);
  expect(names).toContain('SUBWAY');       // record casing
  expect(names).toContain('Landlord');     // no transactions yet, still offered
  expect(names).not.toContain('Car Wash'); // hidden
});
it('hidden transfer payees are excluded from Payments and Transfers', () => {
  const S2 = { ...S, payees: [{ id: 'p9', name: '', transferRef: 'acc:a2', hidden: true }] };
  const [transfers] = payeeSections(S2, { sourceRef: 'acc:a1', query: '' });
  expect(transfers.items.some(i => i.ref === 'acc:a2')).toBe(false);
});
```

Existing tests referencing the old section label `'Payees'` must be updated to `'Saved Payees'`; the base fixture gains `payees: []`.

- [ ] **Step 2: Implement**

Rewrite the payees half of `payeeSections` to build from the index:

```js
import { payeeIndex, transferHidden } from './payees.js';
// transfers: add `&& !transferHidden(S, 'acc:' + a.id)` / card equivalent to the filters.
// payees section:
  const payees = payeeIndex(S)
    .filter(p => !(p.record && p.record.hidden))
    .filter(p => hit(p.name))
    .map(p => ({ kind: 'payee', name: p.name }));
  return [
    { label: 'Payments and Transfers', items: transfers },
    { label: 'Saved Payees', items: payees },
  ].filter(s => s.items.length > 0);
```

- [ ] **Step 3: UIProvider + footer link**

In `src/ui/UIProvider.jsx`: add `payeesOpen` state and `openPayees`/`closePayees` callbacks to the context value, copying the `shortcutsOpen` pattern in the same file (read it; keep naming symmetrical).

In `PayeeCell.jsx`: pass a footer to `ComboboxPanel`:

```jsx
      <ComboboxPanel footer={
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={openPayees} className="hv-soft"
          style={{ width: '100%', border: 'none', background: 'none', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: '8px 2px 2px', textAlign: 'left' }}>
          Manage Payees
        </button>
      }>
```

(`openPayees` from `useUI()`; the modal itself mounts in Task 7 — until then the flag flips with no listener, which is inert and fine for one task.)

- [ ] **Step 4: `pnpm test && pnpm build` green. Commit**

```bash
git add src/lib/payeeOptions.js src/ui/UIProvider.jsx src/ui/tx/inline/PayeeCell.jsx tests/payee-options.test.js
git commit -m "payee dropdown: Saved Payees from the overlay index, hidden filtering, Manage link"
```

---

### Task 5: Auto-categorize on payee pick

**Files:**
- Modify: `src/ui/tx/inline/TxEditorRow.jsx` (the payee pick handler)
- Test: `tests/payees.test.js` (extend — the DECISION is pure; the wiring is three lines)

**Interfaces:**
- Consumes: `autoCategoryFor(S, name)` (Task 2), `editorPatch(f, key, value, ctx)` (Spec 1, post-fix signature with `ctx.catTypeOf`).
- Produces: picking/committing a payee with auto-categorize prefills the category ONLY when `f.category` is empty; `'rta'` means "leave uncategorized" (no patch). An explicit user pick always wins because a non-empty `f.category` blocks the prefill.

- [ ] **Step 1: Pure decision test (failing)**

```js
// append to tests/payees.test.js
import { autoCategoryPatchArgs } from '../src/lib/payees.js';
describe('autoCategoryPatchArgs', () => {
  const S2 = { transactions: [], payees: [
    { id: 'p1', name: 'Mepco', autoCategorize: true, autoCategoryId: 'c9' },
    { id: 'p2', name: 'Boss', autoCategorize: true, autoCategoryId: 'rta' },
  ] };
  it('prefills only when the category is empty', () => {
    expect(autoCategoryPatchArgs(S2, 'Mepco', '')).toBe('c9');
    expect(autoCategoryPatchArgs(S2, 'Mepco', 'c1')).toBe(null);  // user pick wins
  });
  it('rta means leave uncategorized — no patch', () => {
    expect(autoCategoryPatchArgs(S2, 'Boss', '')).toBe(null);
  });
  it('unknown payee → no patch', () => {
    expect(autoCategoryPatchArgs(S2, 'nobody', '')).toBe(null);
  });
});
```

- [ ] **Step 2: Implement the helper in `src/lib/payees.js`**

```js
// The inline editor's prefill decision: returns the category id to patch, or
// null for "do nothing" (already categorized, no rule, or the rule says
// Ready-to-Assign — which for an inflow just means stay uncategorized).
export function autoCategoryPatchArgs(S, name, currentCategory) {
  if (currentCategory) return null;
  const auto = autoCategoryFor(S, name);
  return auto && auto !== 'rta' ? auto : null;
}
```

- [ ] **Step 3: Wire in TxEditorRow**

Find the PayeeCell wiring (`onPickPayee={v => patch('payee', v)}`) and replace with a module-level-simple handler inside the component:

```jsx
  const pickPayee = name => {
    const payeePatch = editorPatch(f, 'payee', name, ctx);
    const auto = autoCategoryPatchArgs(S, name, f.category);
    if (!auto) { setForm(payeePatch); return; }
    // One setForm: category inference runs against the payee-patched form.
    const f2 = { ...f, ...payeePatch };
    setForm({ ...payeePatch, ...editorPatch(f2, 'category', auto, ctx) });
  };
```

and pass `onPickPayee={pickPayee}`. (`ctx` is the existing `{ catTypeOf }` the component already builds.)

- [ ] **Step 4: PASS + full suite + build. Commit**

```bash
git add src/lib/payees.js src/ui/tx/inline/TxEditorRow.jsx tests/payees.test.js
git commit -m "auto-categorize: payee pick prefills an empty category via the overlay"
```

---

### Task 6: Scoped undo window

**Files:**
- Create: `src/lib/scopedUndo.js`
- Modify: `src/store/StoreProvider.jsx` (expose `undoDepth`)
- Test: `tests/scoped-undo.test.js`

**Interfaces:**
- Consumes: `state.past.length` from StoreProvider's reducer state.
- Produces: `openScope(depth)`, `transition(scope, depth, wasRedo)`, `canUndoScoped(scope, depth)`, `canRedoScoped(scope)`. StoreProvider's context value gains `undoDepth: state.past.length` (add to the useMemo deps? — `state.past` is already a dep, so no change needed there).

The invariant: while the modal is open it is the ONLY undo/redo control (the app behind it is scrimmed), so depth changes have exactly three causes — a modal action (depth+1, kills redo), a modal Undo (depth−1, redo+1), a modal Redo (depth+1 too, since redo pushes back onto past — the caller distinguishes it with `wasRedo`).

- [ ] **Step 1: Failing tests**

```js
// tests/scoped-undo.test.js
import { describe, it, expect } from 'vitest';
import { openScope, transition, canUndoScoped, canRedoScoped } from '../src/lib/scopedUndo.js';

describe('scoped undo window', () => {
  it('cannot undo past the modal-open boundary', () => {
    const s = openScope(5); // 5 changes existed before the modal opened
    expect(canUndoScoped(s, 5)).toBe(false);
    const after = transition(s, 6, false); // one modal action
    expect(canUndoScoped(after, 6)).toBe(true);
  });
  it('undo raises redoable; a new change kills it', () => {
    let s = openScope(0);
    s = transition(s, 1, false); // action
    s = transition(s, 2, false); // action
    s = transition(s, 1, false); // undo (depth fell)
    expect(canRedoScoped(s)).toBe(true);
    expect(canUndoScoped(s, 1)).toBe(true);
    s = transition(s, 2, false); // NEW action (not redo) — redo dies
    expect(canRedoScoped(s)).toBe(false);
  });
  it('redo consumes redoable', () => {
    let s = openScope(0);
    s = transition(s, 1, false);
    s = transition(s, 0, false); // undo
    expect(canRedoScoped(s)).toBe(true);
    s = transition(s, 1, true);  // redo (wasRedo)
    expect(canRedoScoped(s)).toBe(false);
    expect(canUndoScoped(s, 1)).toBe(true);
  });
  it('a multi-step depth fall counts every undo', () => {
    let s = openScope(0);
    s = transition(s, 3, false); s = transition(s, 4, false);
    s = transition(s, 1, false); // three undos landed in one observation
    expect(s.redoable).toBe(3);
  });
});
```

- [ ] **Step 2: Implement**

```js
// src/lib/scopedUndo.js
// The Manage Payees modal's Undo/Redo is a WINDOW over the global undo stack:
// a boundary is marked at open, and the modal's buttons cannot cross it. No
// second history — Done leaves everything in normal app history. While the
// modal is open it is the only undo/redo control (the app is scrimmed), so
// depth (past.length) moves for exactly three reasons: a modal action
// (depth+1, clears redo), a modal Undo (depth−1, redo+1 per step), a modal
// Redo (also depth+1 — applyRedo pushes back onto past — distinguished by
// the caller passing wasRedo).
export const openScope = depth => ({ mark: depth, depth, redoable: 0 });

export function transition(scope, depth, wasRedo = false) {
  if (depth < scope.depth) return { ...scope, depth, redoable: scope.redoable + (scope.depth - depth) };
  if (depth > scope.depth) return { ...scope, depth, redoable: wasRedo ? Math.max(0, scope.redoable - 1) : 0 };
  return scope;
}

export const canUndoScoped = (scope, depth) => depth > scope.mark;
export const canRedoScoped = scope => scope.redoable > 0;
```

- [ ] **Step 3: Expose `undoDepth`**

In `src/store/StoreProvider.jsx`'s context value (next to `canUndo`): `undoDepth: state.past.length,` — `state.past` is already in the useMemo dep list, so nothing else changes.

- [ ] **Step 4: PASS + full suite. Commit**

```bash
git add src/lib/scopedUndo.js src/store/StoreProvider.jsx tests/scoped-undo.test.js
git commit -m "scopedUndo: boundary-marker window over the global stack"
```

---

### Task 7: Modal primitive + Manage Payees shell, list, routing

**Files:**
- Create: `src/ui/primitives/Modal.jsx`
- Create: `src/ui/payees/ManagePayees.jsx`
- Modify: `src/App.jsx` (mount `<ManagePayees />` once, desktop-scoped — find where GlobalShortcuts/ShortcutHelpModal mount and follow that pattern; gate with `!phone` via `useIsPhone` inside the component itself)

**Interfaces:**
- Consumes: `useUI().payeesOpen/closePayees` (Task 4), `payeeIndex`/`payeeKey`/`transferHidden` (Task 2), `Checkbox`, `SearchField`, the Dialog wrapper style from `src/ui/primitives/BottomSheet.jsx` (read it).
- Produces: `Modal`/`ModalClose`/`ModalPanel({ children, label, width })` primitive; `ManagePayees()` shell exporting nothing else. Selection keys: `'p:' + payeeKey(name)` for payees, `'t:' + ref` for transfers. Right-pane routing contract for Tasks 8–9: `PayeeDetail({ entry, onDone })` for a single payee entry `{name, record, txCount}`; `PayeeBulk({ entries, onDone })` for 2+; both rendered by this shell (Task 7 ships placeholder panes that Tasks 8–9 replace: a `<div>` with the payee name / count — clearly marked placeholders are acceptable ONLY because Tasks 8–9 in this same plan replace them).

- [ ] **Step 1: Modal primitive**

```jsx
// src/ui/primitives/Modal.jsx
// Tokened wrapper over Base UI's Dialog as a centered DESKTOP modal —
// BottomSheet.jsx is the phone-shaped sibling. Backdrop + centered popup,
// theme surface, one hairline, --shadow. zIndex 60 matches the sheet family.
import { Dialog } from '@base-ui/react/dialog';

export const Modal = Dialog.Root;
export const ModalClose = Dialog.Close;

export function ModalPanel({ children, label, width = 980 }) {
  return (
    <Dialog.Portal>
      <Dialog.Backdrop style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', animation: 'hsFade .18s ease', zIndex: 60 }} />
      <Dialog.Popup aria-label={label} style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width, maxWidth: '96vw', height: '86vh', maxHeight: '92vh',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
        boxShadow: 'var(--shadow)', color: 'var(--text)', zIndex: 60,
        display: 'flex', flexDirection: 'column', overflow: 'hidden', outline: 'none',
        animation: 'hsFade .18s ease',
      }}>
        {children}
      </Dialog.Popup>
    </Dialog.Portal>
  );
}
```

- [ ] **Step 2: The shell**

```jsx
// src/ui/payees/ManagePayees.jsx
// Manage Payees (Spec 2). Two panes: a searchable checkbox list on the left,
// a detail/bulk editor on the right. Selection keys are namespaced —
// 'p:<payeeKey>' for payees, 't:<ref>' for transfer payees — because the two
// populations live in different tables of truth. Mixing the two groups shows
// the deselect-transfers empty state (YNAB's cone screen). Footer Undo/Redo
// is the scoped window from src/lib/scopedUndo.js.
import { useMemo, useState } from 'react';
import { useStore } from '../../store/StoreProvider.jsx';
import { useUI } from '../UIProvider.jsx';
import { useIsPhone } from '../../lib/useIsPhone.js';
import { Modal, ModalClose, ModalPanel } from '../primitives/Modal.jsx';
import Checkbox from '../Checkbox.jsx';
import { payeeIndex, payeeKey, transferHidden } from '../../lib/payees.js';
import { openScope, transition, canUndoScoped, canRedoScoped } from '../../lib/scopedUndo.js';
import PayeeDetail from './PayeeDetail.jsx';
import PayeeBulk from './PayeeBulk.jsx';

const paneMsg = { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--muted)', fontSize: 13.5, padding: 24, textAlign: 'center' };

function transferRows(S) { // plain data helper, not a component
  return [
    ...S.accounts.filter(a => a.status === 'active').map(a => ({ key: 't:acc:' + a.id, ref: 'acc:' + a.id, label: 'Transfer : ' + a.nickname })),
    ...S.cards.filter(c => c.type === 'credit' && c.status === 'active').map(c => ({ key: 't:card:' + c.id, ref: 'card:' + c.id, label: 'Transfer : ' + c.nickname + ' ••' + c.last4 })),
  ];
}

export default function ManagePayees() {
  const { data: S, undo, redo, undoDepth, canUndo, canRedo } = useStore();
  const { payeesOpen, closePayees } = useUI();
  const phone = useIsPhone();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(() => new Set());
  const [scope, setScope] = useState(null);

  // Scope lifecycle: mark the boundary when the modal opens; track depth on
  // every render while open (a modal action moved it).
  if (payeesOpen && !scope) setScopeSafe();
  function setScopeSafe() { setScope(openScope(undoDepth)); }
  if (scope && scope.depth !== undoDepth) setScope(s => transition(s, undoDepth, false));

  const index = useMemo(() => payeeIndex(S), [S]);
  const transfers = useMemo(() => transferRows(S), [S]);
  const hit = s => !q.trim() || s.toLowerCase().includes(q.trim().toLowerCase());
  const rows = [
    ...index.filter(p => hit(p.name)).map(p => ({ key: 'p:' + payeeKey(p.name), kind: 'p', entry: p, label: p.name, dim: !!(p.record && p.record.hidden) })),
    ...transfers.filter(t => hit(t.label)).map(t => ({ ...t, kind: 't', dim: transferHidden(S, t.ref) })),
  ];
  const visibleKeys = rows.map(r => r.key);
  const selVisible = visibleKeys.filter(k => sel.has(k));
  const allSelected = selVisible.length > 0 && selVisible.length === visibleKeys.length;
  const toggle = (key, on) => setSel(prev => { const n = new Set(prev); if (on) n.add(key); else n.delete(key); return n; });

  const selPayees = rows.filter(r => r.kind === 'p' && sel.has(r.key)).map(r => r.entry);
  const selTransfers = rows.filter(r => r.kind === 't' && sel.has(r.key));
  const mixed = selPayees.length > 0 && selTransfers.length > 0;
  const close = () => { setSel(new Set()); setQ(''); setScope(null); closePayees(); };
  const modalUndo = () => { undo(); setScope(s => transition(s, undoDepth - 1, false)); };
  const modalRedo = () => { redo(); setScope(s => transition(s, undoDepth + 1, true)); };

  if (phone) return null; // desktop-first (spec decision 5)
  return (
    <Modal open={payeesOpen} onOpenChange={o => { if (!o) close(); }}>
      <ModalPanel label="Manage Payees">
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)', flex: 'none' }}>
          <span style={{ fontSize: 17, fontWeight: 700 }}>Manage Payees</span>
          <span style={{ flex: 1 }} />
          <ModalClose aria-label="Close" className="hv-elev" style={{ width: 30, height: 30, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--muted)', fontSize: 15, cursor: 'pointer' }}>×</ModalClose>
        </div>
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <div style={{ width: 300, flex: 'none', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 14px 8px' }}>
              <input className="field" placeholder="Search Payees" aria-label="Search payees" value={q}
                onChange={e => setQ(e.target.value)} style={{ width: '100%', height: 34, padding: '0 10px', fontSize: 13 }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 14px 8px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              <Checkbox checked={allSelected} indeterminate={selVisible.length > 0 && !allSelected}
                onChange={on => setSel(on ? new Set(visibleKeys) : new Set())} label="Select all payees" />
              Payees ({selVisible.length || rows.length})
            </label>
            <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--border)' }}>
              {rows.map(r => (
                <label key={r.key} className="hv-elev" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', fontSize: 13.5, cursor: 'pointer', opacity: r.dim ? 0.5 : 1 }}>
                  <Checkbox checked={sel.has(r.key)} onChange={on => toggle(r.key, on)} label={'Select ' + r.label} />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0, background: 'var(--elev)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            {mixed ? (
              <div style={paneMsg}>
                <span style={{ fontSize: 34 }} aria-hidden="true">⚠️</span>
                <span>
                  Only one payee group can be edited at a time. Please{' '}
                  <button type="button" onClick={() => setSel(prev => new Set([...prev].filter(k => !k.startsWith('t:'))))}
                    style={{ border: 'none', background: 'none', color: 'var(--accent)', font: 'inherit', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                    deselect transfer payees
                  </button>{' '}to continue.
                </span>
              </div>
            ) : selTransfers.length > 0 ? (
              <TransferPane S={S} rows={selTransfers} />
            ) : selPayees.length === 1 ? (
              <PayeeDetail entry={selPayees[0]} onDeselect={() => setSel(new Set())} />
            ) : selPayees.length > 1 ? (
              <PayeeBulk entries={selPayees} onDeselect={() => setSel(new Set())} />
            ) : (
              <div style={paneMsg}>Select a Payee to Edit</div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border)', flex: 'none' }}>
          <button type="button" onClick={modalUndo} disabled={!(scope && canUndoScoped(scope, undoDepth) && canUndo)} className="hv-elev"
            style={{ height: 32, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', opacity: scope && canUndoScoped(scope, undoDepth) && canUndo ? 1 : 0.45 }}>↺ Undo</button>
          <button type="button" onClick={modalRedo} disabled={!(scope && canRedoScoped(scope) && canRedo)} className="hv-elev"
            style={{ height: 32, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', opacity: scope && canRedoScoped(scope) && canRedo ? 1 : 0.45 }}>↻ Redo</button>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={close} className="hv-accent" style={{ height: 34, padding: '0 20px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Done</button>
        </div>
      </ModalPanel>
    </Modal>
  );
}

// Transfer-only selection: visibility is the single editable property of a
// synthesized payee (spec §3).
function TransferPane({ S, rows }) {
  const { applyData } = useStore();
  const refs = rows.map(r => r.ref);
  const allHidden = refs.every(ref => transferHidden(S, ref));
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{rows.length === 1 ? rows[0].label : rows.length + ' Transfer Payees Selected'}</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
        <Checkbox checked={allHidden} onChange={on => applyData(d => setPayeesHidden(d, { transferRefs: refs, hidden: on }))} label="Hide these transfer payees" />
        Hide {rows.length === 1 ? 'this payee' : 'these payees'}
      </label>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', maxWidth: '52ch' }}>
        Hidden payees will not be suggested as you type or included in the list of payees when adding a transaction.
      </div>
    </div>
  );
}
```

Add the missing import in the same file: `import { setPayeesHidden } from '../../store/actions.js';`. NOTE on the two mid-render `setScope` calls: React allows a state set during render ONLY via the render-phase-update pattern — implement them exactly as written (an `if` around a bare `setState` during render is the documented "derived state" form and re-renders before commit); if the structural test or React warnings object, move both into a `useEffect` keyed on `[payeesOpen, undoDepth]` — behavior is identical because the scope only feeds button disabled states.

- [ ] **Step 3: Placeholder detail/bulk panes + mount**

Create `src/ui/payees/PayeeDetail.jsx` and `src/ui/payees/PayeeBulk.jsx` as minimal module-scope placeholders (Task 8/9 replace their bodies; keep the exact props):

```jsx
// src/ui/payees/PayeeDetail.jsx — body replaced in the next task.
export default function PayeeDetail({ entry, onDeselect }) {
  return <div style={{ padding: 24, fontSize: 13.5 }}>{entry.name}</div>;
}
```

```jsx
// src/ui/payees/PayeeBulk.jsx — body replaced in a later task.
export default function PayeeBulk({ entries, onDeselect }) {
  return <div style={{ padding: 24, fontSize: 13.5 }}>{entries.length} Payees Selected</div>;
}
```

Mount in `src/App.jsx`: find where global overlays render (GlobalShortcuts / ShortcutHelpModal) and add `<ManagePayees />` beside them (inside the providers, once).

- [ ] **Step 4: `pnpm test && pnpm build` + live smoke** (throwaway-harness recipe from the Spec 1 reports if a browser tool is available: dropdown footer link opens the modal; list shows payees + transfers; mixed selection shows the deselect-transfers pane and the link works; transfer hide round-trips; scoped Undo greys out at the boundary). **Commit**

```bash
git add src/ui/primitives/Modal.jsx src/ui/payees/ src/App.jsx
git commit -m "Manage Payees: modal shell, list pane, group routing, scoped undo footer"
```

---

### Task 8: PayeeDetail — rename, transactions, categorization, rules, visibility, delete

**Files:**
- Rewrite: `src/ui/payees/PayeeDetail.jsx`
- Create: `src/ui/payees/PayeeTxList.jsx` (the Show N Transactions sub-modal)

**Interfaces:**
- Consumes: actions (Task 3), `matchesPayeeTx`/`payeeKey`/`payeeIndex` (Task 2), `PlanCategoryPicker` (`excludeRta` OFF so Ready to Assign is offered; `catType="expense"`), `Modal` primitive (Task 7), `useMoney`, `dayLabel` from `src/lib/calc.js`.
- Produces: `PayeeDetail({ entry, onDeselect })` — entry `{name, record, txCount}`; `PayeeTxList({ names, open, onClose })`.

- [ ] **Step 1: PayeeTxList**

```jsx
// src/ui/payees/PayeeTxList.jsx
// "Show N Transactions": a read-only sub-modal listing every non-adjustment
// transaction whose merchant matches the selected payee name(s).
import { useMemo } from 'react';
import { useStore } from '../../store/StoreProvider.jsx';
import { useMoney } from '../../lib/format.js';
import { dayLabel } from '../../lib/calc.js';
import { Modal, ModalPanel } from '../primitives/Modal.jsx';
import { matchesPayeeTx, payeeKey } from '../../lib/payees.js';

const th = { textAlign: 'left', fontSize: 11.5, fontWeight: 600, letterSpacing: '.05em', color: 'var(--muted)', padding: '8px 10px', borderBottom: '1px solid var(--border)' };
const td = { fontSize: 13, padding: '7px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 };

export default function PayeeTxList({ names, open, onClose }) {
  const { data: S } = useStore();
  const { moneyS } = useMoney();
  const keys = names.map(payeeKey);
  const rows = useMemo(() => S.transactions
    .filter(t => keys.some(k => matchesPayeeTx(t, k)))
    .sort((a, b) => (a.date < b.date ? 1 : -1)), [S, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const acctOf = t => (S.accounts.find(a => a.id === t.accountId) || {}).nickname
    || (S.cards.find(c => c.id === t.cardId) || {}).nickname || '—';
  const catOf = t => (S.categories.find(c => c.id === t.category) || {}).name || (t.type === 'transfer' ? 'Transfer' : '—');
  const signed = t => (t.type === 'expense' ? -t.amount : t.amount);
  return (
    <Modal open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <ModalPanel label="Transactions" width={720}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid var(--border)', flex: 'none' }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Transactions</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>ACCOUNT</th><th style={th}>DATE</th><th style={th}>CATEGORY</th><th style={th}>MEMO</th><th style={{ ...th, textAlign: 'right' }}>AMOUNT</th>
            </tr></thead>
            <tbody>
              {rows.map(t => (
                <tr key={t.id}>
                  <td style={td}>{acctOf(t)}</td>
                  <td style={td} className="tnum">{dayLabel(t.date)}</td>
                  <td style={td}>{catOf(t)}</td>
                  <td style={{ ...td, color: 'var(--muted)' }}>{t.notes}</td>
                  <td style={{ ...td, textAlign: 'right' }} className="tnum">{moneyS(signed(t))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 18px', borderTop: '1px solid var(--border)', flex: 'none' }}>
          <button type="button" onClick={onClose} className="hv-accent" style={{ height: 32, padding: '0 18px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
        </div>
      </ModalPanel>
    </Modal>
  );
}
```

- [ ] **Step 2: PayeeDetail**

```jsx
// src/ui/payees/PayeeDetail.jsx
// Single-payee editor: name, transactions link, auto-categorize, rename
// rules, visibility, delete-with-reassignment (spec §3 + the reference
// screenshots — Delete swaps this pane into a "New payee" step defaulting
// [No Payee]).
import { useState } from 'react';
import { useStore } from '../../store/StoreProvider.jsx';
import { useMoney } from '../../lib/format.js';
import { currentMonth, nowIso } from '../../lib/dates.js';
import { envelopeFor } from '../../lib/envelope.js';
import Checkbox from '../Checkbox.jsx';
import PlanCategoryPicker from '../PlanCategoryPicker.jsx';
import PayeeTxList from './PayeeTxList.jsx';
import { upsertPayee, renamePayee, setPayeesHidden, deletePayees } from '../../store/actions.js';
import { payeeIndex, payeeKey } from '../../lib/payees.js';

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 };
const h = { fontSize: 13.5, fontWeight: 700 };
const note = { fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 };

export default function PayeeDetail({ entry, onDeselect }) {
  const { data: S, applyData } = useStore();
  const { money } = useMoney();
  const month = currentMonth();
  const [nameDraft, setNameDraft] = useState(null); // null = mirror entry.name
  const [txOpen, setTxOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [replacement, setReplacement] = useState('');
  const [ruleOp, setRuleOp] = useState('contains');
  const [rulePattern, setRulePattern] = useState('');
  const rec = entry.record;
  const rules = (rec && rec.renameRules) || [];

  const commitName = () => {
    if (nameDraft !== null && nameDraft.trim() && payeeKey(nameDraft) !== payeeKey(entry.name)) {
      applyData(d => renamePayee(d, { from: entry.name, to: nameDraft.trim() }));
      onDeselect(); // the selection key just changed
    }
    setNameDraft(null);
  };
  const patch = p => applyData(d => upsertPayee(d, { name: entry.name, patch: p }));
  const addRule = () => {
    const pattern = rulePattern.trim();
    if (!pattern) return;
    patch({ renameRules: [...rules, { op: ruleOp, pattern }] });
    setRulePattern('');
  };
  const others = payeeIndex(S).filter(p => payeeKey(p.name) !== payeeKey(entry.name));

  if (deleting) {
    return (
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={h}>New payee</div>
        <div style={{ ...note, fontStyle: 'italic' }}>
          {entry.txCount} transaction{entry.txCount === 1 ? ' is' : 's are'} using this payee. Select a new payee for {entry.txCount === 1 ? 'this transaction' : 'these transactions'}.
        </div>
        <select className="field" aria-label="New payee" value={replacement} onChange={e => setReplacement(e.target.value)}
          style={{ height: 36, padding: '0 10px', fontSize: 13.5, maxWidth: 520 }}>
          <option value="">[No Payee]</option>
          {others.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={() => setDeleting(false)} className="hv-elev" style={{ height: 34, padding: '0 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--soft)', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button type="button" className="hv-neg-soft"
            onClick={() => { applyData(d => deletePayees(d, { names: [entry.name], replacement })); setDeleting(false); onDeselect(); }}
            style={{ height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--neg-soft)', color: 'var(--neg)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card}>
        <div style={h}>Payee Name</div>
        <input className="field" aria-label="Payee name" value={nameDraft !== null ? nameDraft : entry.name}
          onChange={e => setNameDraft(e.target.value)} onBlur={commitName}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitName(); } }}
          style={{ height: 36, padding: '0 10px', fontSize: 13.5 }} />
        <button type="button" onClick={() => setTxOpen(true)} disabled={entry.txCount === 0}
          style={{ alignSelf: 'flex-start', border: 'none', background: 'none', color: entry.txCount ? 'var(--accent)' : 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: entry.txCount ? 'pointer' : 'default', padding: 0 }}>
          Show {entry.txCount} Transaction{entry.txCount === 1 ? '' : 's'}
        </button>
      </div>

      <div style={card}>
        <div style={h}>Categorization</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
          <Checkbox checked={!!(rec && rec.autoCategorize)} onChange={on => patch({ autoCategorize: on })} label="Automatically categorize payee" />
          Automatically categorize payee
        </label>
        <div style={note}>If enabled, transactions with this payee will automatically receive the selected category.</div>
        {rec && rec.autoCategorize && (
          <PlanCategoryPicker
            env={envelopeFor(S, month, nowIso())} S={S} month={month} money={money}
            catType="expense" showAmounts heading="Plan Categories"
            value={rec.autoCategoryId === 'rta' ? 'rta' : (rec.autoCategoryId || '')}
            onChange={id => patch({ autoCategoryId: id === 'rta' ? 'rta' : id })}
          />
        )}
      </div>

      <div style={card}>
        <div style={h}>Renaming</div>
        <div style={note}>Imported payees that match these rules will be renamed. (No import feature exists yet — rules are stored for when it does.)</div>
        {rules.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ fontWeight: 600, width: 76, flex: 'none', textTransform: 'capitalize' }}>{r.op}:</span>
            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.pattern}</span>
            <button type="button" aria-label={'Remove rule ' + (i + 1)} className="hv-soft"
              onClick={() => patch({ renameRules: rules.filter((_, j) => j !== i) })}
              style={{ width: 26, height: 26, border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14 }}>×</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="field" aria-label="Rule type" value={ruleOp} onChange={e => setRuleOp(e.target.value)} style={{ width: 110, height: 34, padding: '0 8px', fontSize: 13, flex: 'none' }}>
            <option value="contains">Contains</option>
            <option value="is">Is</option>
          </select>
          <input className="field" aria-label="Rule pattern" value={rulePattern} onChange={e => setRulePattern(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRule(); } }}
            style={{ flex: 1, height: 34, padding: '0 10px', fontSize: 13 }} />
          <button type="button" onClick={addRule} aria-label="Add rule" className="hv-soft"
            style={{ width: 34, height: 34, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--accent)', fontSize: 16, cursor: 'pointer', flex: 'none' }}>＋</button>
        </div>
      </div>

      <div style={card}>
        <div style={h}>Payee Visibility</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
          <Checkbox checked={!!(rec && rec.hidden)} onChange={on => applyData(d => setPayeesHidden(d, { names: [entry.name], hidden: on }))} label="Hide this payee" />
          Hide this payee
        </label>
        <div style={note}>Hidden payees will not be suggested as you type or included in the list of payees when adding a transaction. This is useful for payees you don't expect to use again, like from a trip or event.</div>
      </div>

      <button type="button" onClick={() => (entry.txCount === 0
        ? (applyData(d => deletePayees(d, { names: [entry.name], replacement: '' })), onDeselect())
        : setDeleting(true))}
        className="hv-neg-soft"
        style={{ alignSelf: 'flex-start', height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--neg-soft)', color: 'var(--neg)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        Delete
      </button>

      <PayeeTxList names={[entry.name]} open={txOpen} onClose={() => setTxOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 3: `pnpm test && pnpm build` + live check** (harness: rename ripples to the register; auto-categorize toggle + picker persists; a rule adds/removes; hide dims the list row and drops it from the editor dropdown; delete on a used payee shows the reassign step and [No Payee] blanks; delete on an unused payee is immediate). **Commit**

```bash
git add src/ui/payees/PayeeDetail.jsx src/ui/payees/PayeeTxList.jsx
git commit -m "Manage Payees: single-payee detail pane with delete-reassign step"
```

---

### Task 9: PayeeBulk — combine, bulk hide, delete all

**Files:**
- Rewrite: `src/ui/payees/PayeeBulk.jsx`

**Interfaces:**
- Consumes: `combinePayees`, `setPayeesHidden`, `deletePayees` (Task 3); `PayeeTxList` (Task 8); `payeeIndex`/`payeeKey`.
- Produces: `PayeeBulk({ entries, onDeselect })`.

- [ ] **Step 1: Implement**

```jsx
// src/ui/payees/PayeeBulk.jsx
// Multi-payee pane: combine-and-rename (merges renaming rules — YNAB copy),
// bulk hide, and Delete All via the same reassignment step as single delete.
import { useState } from 'react';
import { useStore } from '../../store/StoreProvider.jsx';
import Checkbox from '../Checkbox.jsx';
import PayeeTxList from './PayeeTxList.jsx';
import { combinePayees, deletePayees, setPayeesHidden } from '../../store/actions.js';
import { payeeIndex, payeeKey } from '../../lib/payees.js';

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 };
const h = { fontSize: 13.5, fontWeight: 700 };
const note = { fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 };

export default function PayeeBulk({ entries, onDeselect }) {
  const { data: S, applyData } = useStore();
  const names = entries.map(e => e.name);
  const txCount = entries.reduce((s, e) => s + e.txCount, 0);
  const [into, setInto] = useState(names[0]);
  const [txOpen, setTxOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [replacement, setReplacement] = useState('');
  const allHidden = entries.every(e => e.record && e.record.hidden);
  const keys = names.map(payeeKey);
  const others = payeeIndex(S).filter(p => !keys.includes(payeeKey(p.name)));

  if (deleting) {
    return (
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={h}>New payee</div>
        <div style={{ ...note, fontStyle: 'italic' }}>{txCount} transaction{txCount === 1 ? ' is' : 's are'} using {entries.length === 1 ? 'this payee' : 'these payees'}. Select a new payee for {txCount === 1 ? 'this transaction' : 'these transactions'}.</div>
        <select className="field" aria-label="New payee" value={replacement} onChange={e => setReplacement(e.target.value)} style={{ height: 36, padding: '0 10px', fontSize: 13.5, maxWidth: 520 }}>
          <option value="">[No Payee]</option>
          {others.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={() => setDeleting(false)} className="hv-elev" style={{ height: 34, padding: '0 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--soft)', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button type="button" className="hv-neg-soft"
            onClick={() => { applyData(d => deletePayees(d, { names, replacement })); setDeleting(false); onDeselect(); }}
            style={{ height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--neg-soft)', color: 'var(--neg)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontSize: 14.5, fontWeight: 700 }}>{entries.length} Payees Selected</span>
        <button type="button" onClick={() => setTxOpen(true)} disabled={txCount === 0}
          style={{ border: 'none', background: 'none', color: txCount ? 'var(--accent)' : 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: txCount ? 'pointer' : 'default', padding: 0 }}>
          Show {txCount} Transaction{txCount === 1 ? '' : 's'}
        </button>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{names.join(', ')}</div>

      <div style={card}>
        <div style={h}>Combine and Rename</div>
        <div style={note}>Combining these payees will also combine all their renaming rules.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="field" aria-label="Combined payee name" value={into} onChange={e => setInto(e.target.value)}
            style={{ flex: 1, height: 36, padding: '0 10px', fontSize: 13.5 }} />
          <button type="button" disabled={!into.trim()} className="hv-accent"
            onClick={() => { applyData(d => combinePayees(d, { names, into: into.trim() })); onDeselect(); }}
            style={{ height: 36, padding: '0 18px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: into.trim() ? 'pointer' : 'default', opacity: into.trim() ? 1 : 0.5, flex: 'none' }}>Combine</button>
        </div>
      </div>

      <div style={card}>
        <div style={h}>Payee Visibility</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
          <Checkbox checked={allHidden} onChange={on => applyData(d => setPayeesHidden(d, { names, hidden: on }))} label="Hide these payees" />
          Hide these payees
        </label>
        <div style={note}>Hidden payees will not be suggested as you type or included in the list of payees when adding a transaction.</div>
      </div>

      <button type="button" onClick={() => (txCount === 0
        ? (applyData(d => deletePayees(d, { names, replacement: '' })), onDeselect())
        : setDeleting(true))}
        className="hv-neg-soft"
        style={{ alignSelf: 'flex-start', height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--neg-soft)', color: 'var(--neg)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        Delete All
      </button>

      <PayeeTxList names={names} open={txOpen} onClose={() => setTxOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 2: `pnpm test && pnpm build` + live check** (combine two payees → register merchants rewritten + rules merged; bulk hide; Delete All reassign to a third payee). **Commit**

```bash
git add src/ui/payees/PayeeBulk.jsx
git commit -m "Manage Payees: bulk pane — combine-and-rename, bulk hide, delete all"
```

---

### Task 10: Full verification pass

**Files:** none — the gate.

- [ ] **Step 1:** `pnpm test && pnpm build` — green, no new warnings.

- [ ] **Step 2: Live Playwright pass** (throwaway-harness recipe; delete before committing) covering:
1. Payee dropdown shows Saved Payees + Manage Payees link; link opens the modal.
2. Rename a payee → register rows update; the editor dropdown shows the new casing.
3. Auto-categorize: enable on a payee, add a new transaction with it → category prefilled; explicit pick beforehand is not overwritten.
4. Rules: add Contains + Is rules; they persist across modal close/open (storage only — no import to exercise).
5. Hide: payee disappears from the dropdown, stays (dimmed) in the modal; unhide restores; bare unhide leaves no record (check via a second hide/unhide round-trip behaving identically).
6. Transfer payees: hide one → gone from Payments and Transfers; mixed selection shows the deselect-transfers pane; the link fixes the selection.
7. Combine: two payees into a typed third name; rules merged.
8. Delete with reassign: to another payee, and to [No Payee] (register shows blank payee, needs-attention flows unaffected for categorized rows).
9. Scoped undo: modal Undo reverts only modal actions and greys out at the boundary; Redo works; a new modal action kills Redo; after Done, the global toolbar can undo the modal's actions.
10. Sync mapper: reload-shaped check not possible in the harness (sync stubbed) — confirmed by the Task 1 round-trip test instead; say so in the report.

- [ ] **Step 3:** Fix what fails (smallest change, re-run, re-verify), commit fixes, then push:

```bash
git push origin worktree-payee-management-spec
```

No PR. Report the reminder that `supabase/migrations/0016_payees.sql` must be applied to the hosted Supabase project before this branch merges (the user's step).
