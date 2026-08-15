# Category Picker Canonical Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every category picker lists groups and categories in the Plan screen's exact order, via one shared comparator module (spec: `docs/superpowers/specs/2026-08-16-category-picker-order-design.md`).

**Architecture:** New pure module `src/lib/categoryOrder.js` holds the canonical comparator; `PlanCategoryPicker.jsx` adopts it (the behavior fix — groups had `||99`/no tiebreak, members were unsorted); `Plan.jsx`, `PlanPhone.jsx`, `CategoryPickerSheet.jsx` swap their identical inline copies for the import (pure refactor, byte-identical output).

**Tech Stack:** React + Vite, Vitest (node env, no jsdom).

## Global Constraints

- The canonical comparator, verbatim: `(a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name)` — groups and categories share it.
- Behavior changes ONLY in `PlanCategoryPicker.jsx`. The three refactored files must render byte-identically (same expression, just imported).
- Picker special sections unchanged: Inflow/RTA header first, "Selected:" block, "Other" bucket last, search semantics untouched.
- No business-logic changes (`actions.js`/`validate.js`/`calc.js` untouched).
- Branch `feat/category-picker-order` (exists, holds the spec). Single draft PR — never marked ready or merged without the user's explicit ask.
- Live checks are READ-ONLY (open pickers, compare order, cancel out; no writes, never Undo).

---

### Task 1: `categoryOrder` helper (TDD)

**Files:**
- Create: `src/lib/categoryOrder.js`
- Test: `tests/category-order.test.js`

**Interfaces:**
- Produces: `byOrderThenName(a, b)` comparator; `sortGroups(groups)` and `sortCats(cats)` returning sorted shallow copies (null/undefined input → `[]`).

- [ ] **Step 1: Write the failing test**

```js
// tests/category-order.test.js
import { describe, it, expect } from 'vitest';
import { byOrderThenName, sortGroups, sortCats } from '../src/lib/categoryOrder.js';

describe('byOrderThenName', () => {
  it('sorts by sortOrder ascending', () => {
    expect([{ name: 'b', sortOrder: 2 }, { name: 'a', sortOrder: 1 }].sort(byOrderThenName).map(x => x.name)).toEqual(['a', 'b']);
  });
  it('breaks sortOrder ties by name (localeCompare)', () => {
    expect([{ name: 'Zed', sortOrder: 1 }, { name: 'Alpha', sortOrder: 1 }].sort(byOrderThenName).map(x => x.name)).toEqual(['Alpha', 'Zed']);
  });
  it('treats missing and 0 sortOrder as equal (0 default)', () => {
    expect([{ name: 'b', sortOrder: 0 }, { name: 'a' }].sort(byOrderThenName).map(x => x.name)).toEqual(['a', 'b']);
  });
});

describe('sortGroups / sortCats', () => {
  const input = [{ name: 'z', sortOrder: 5 }, { name: 'a', sortOrder: 1 }];
  it('returns a sorted copy without mutating the input', () => {
    const out = sortGroups(input);
    expect(out.map(x => x.name)).toEqual(['a', 'z']);
    expect(input.map(x => x.name)).toEqual(['z', 'a']);
  });
  it('sortCats behaves identically and both tolerate null', () => {
    expect(sortCats(input).map(x => x.name)).toEqual(['a', 'z']);
    expect(sortGroups(null)).toEqual([]);
    expect(sortCats(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/category-order.test.js` → FAIL (module not found).
- [ ] **Step 3: Implement**

```js
// src/lib/categoryOrder.js
// The Plan screen's canonical ordering (Plan.jsx sections memo): sortOrder
// ascending with 0 as the missing default, names breaking ties. Groups and
// categories share the same comparator. Every list of groups or categories
// shown to the user must sort with these — never inline a copy.
export const byOrderThenName = (a, b) =>
  (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name);
export const sortGroups = groups => [...(groups || [])].sort(byOrderThenName);
export const sortCats = cats => [...(cats || [])].sort(byOrderThenName);
```

- [ ] **Step 4: Run tests** — focused file PASS, then `npx vitest run` full suite green.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "categoryOrder: canonical group/category comparator (Plan screen order), tested"`

---

### Task 2: Fix PlanCategoryPicker + consolidate the three copies

**Files:**
- Modify: `src/ui/PlanCategoryPicker.jsx`, `src/screens/Plan.jsx`, `src/ui/plan/phone/PlanPhone.jsx`, `src/components/CategoryPickerSheet.jsx`

**Interfaces:**
- Consumes: Task 1's `sortGroups`/`sortCats`/`byOrderThenName`.

- [ ] **Step 1: `PlanCategoryPicker.jsx` (the behavior fix).** Add `import { sortGroups, sortCats } from '../lib/categoryOrder.js';`. Replace line 45:

```js
const groups = useMemo(() => [...(S.categoryGroups || [])].sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99)), [S.categoryGroups]);
```
with
```js
const groups = useMemo(() => sortGroups(S.categoryGroups), [S.categoryGroups]);
```

In the `flat` memo, sort members and the Other bucket: `const members = sortCats(cats.filter(c => c.groupId === g.id));` and `const other = sortCats(cats.filter(c => !c.groupId || !ids.has(c.groupId)));` (everything else in the memo unchanged).

- [ ] **Step 2: `Plan.jsx` (pure refactor).** Import `{ sortGroups, byOrderThenName }`. `groupsSorted` memo body (`:1104`) becomes `() => sortGroups(S.categoryGroups)`. The sections memo's member sort (`:1123`) becomes `byGroup.forEach(list => list.sort(byOrderThenName));`.
- [ ] **Step 3: `PlanPhone.jsx` (pure refactor).** Import `{ sortGroups, sortCats }`. Line 16 becomes `const groups = sortGroups(S.categoryGroups);`. Delete the local `const sortCats = list => …` (line 22) — the imported `sortCats` takes over `bucket`'s call unchanged.
- [ ] **Step 4: `CategoryPickerSheet.jsx` (pure refactor).** Import `{ sortGroups, byOrderThenName }`. Line 47 becomes `const groups = sortGroups(S.categoryGroups);`. Line 50-51's `.sort((a, b) => …)` becomes `.sort(byOrderThenName)`.
- [ ] **Step 5: Verify** — `npx vitest run` green (896+ plus Task 1's); `npm run build` green; `grep -rn "localeCompare" src/screens/Plan.jsx src/ui/plan/phone/PlanPhone.jsx src/components/CategoryPickerSheet.jsx src/ui/PlanCategoryPicker.jsx` returns nothing (no inline copies remain in these files).
- [ ] **Step 6: Commit** — `git commit -am "Category pickers: adopt the canonical Plan ordering everywhere (fix PlanCategoryPicker member/group sort)"`

---

### Task 3: Push, draft PR, live verification

- [ ] **Step 1:** `git push -u origin feat/category-picker-order`; `gh pr create --draft --base main --title "Category pickers: match the Plan screen's ordering everywhere" --body "<summary per spec>"`. PR stays DRAFT.
- [ ] **Step 2: Live check (read-only Playwright subagent, needs the dev server + logged-in session).** At 1280: note the Plan screen's group order and the first group's category order; open TxForm's category picker (Add transaction → Category field) and confirm the identical sequence; cancel out. At 390×780: open a MoneySheets picker (Plan → tap a positive Available pill → Move sheet) and confirm the same; also spot-check the phone CategoryPickerSheet (register → Select → Categorize) still matches. No writes anywhere; if the session is logged out, report BLOCKED for the user to log in.
- [ ] **Step 3:** Report PR number + live verdicts.
