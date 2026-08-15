# Category pickers: one canonical ordering (match the Plan screen)

Date: 2026-08-16 · Status: validated design, implementation pending
Request: the category picker dropdown/popover must always list categories the
way the Plan (budget) screen sorts them — group order first, then category
order within each group — on mobile and web.

## Problem

The Plan screen is the ordering's source of truth: drag-reorder writes
`sortOrder` onto groups and categories, and the screen renders both with the
comparator `(sortOrder || 0) - (sortOrder || 0) || name.localeCompare(name)`
(`Plan.jsx:1104` for groups, `:1123` for members). `PlanPhone.jsx` and
`CategoryPickerSheet.jsx` copy that comparator faithfully — but
**`PlanCategoryPicker.jsx` drifted**:

- Groups sort with a different default and no tiebreak:
  `(sortOrder || 99)` (`PlanCategoryPicker.jsx:45`). A group whose sortOrder
  is 0/unset lands at 99, and ties render in unstable store order.
- **Categories within a group are not sorted at all** — `flat` filters
  `S.categories` and renders members in raw array order
  (`PlanCategoryPicker.jsx:57-68`).

Because PlanCategoryPicker is the combobox hosted by desktop TxForm (category
field + split lines), the desktop Assign/Cover/Move popovers, the phone
MoneySheets, BudgetForm, RecurringForm, and both Reassign drawers, the
mismatch shows up on both web and mobile.

The comparator is also copy-pasted in four places (Plan.jsx, PlanPhone.jsx,
CategoryPickerSheet.jsx ×2), which is how the drift happened.

## Decision (user-validated)

**Shared helper + fix all**: one canonical comparator module, the picker
fixed to use it, and every existing copy swapped to the import so ordering
can never drift again.

## Design

New `src/lib/categoryOrder.js` (pure, unit-tested):

```js
// The Plan screen's canonical ordering (Plan.jsx sections memo): sortOrder
// ascending with 0 as the missing default, names breaking ties. Groups and
// categories share the same comparator. Every list of groups or categories
// shown to the user must sort with these — never inline a copy.
export const byOrderThenName = (a, b) =>
  (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name);
export const sortGroups = groups => [...(groups || [])].sort(byOrderThenName);
export const sortCats = cats => [...(cats || [])].sort(byOrderThenName);
```

Changes:

1. **`src/ui/PlanCategoryPicker.jsx`** (the behavior fix): groups use
   `sortGroups` (replacing `||99`/no-tiebreak); in `flat`, each group's
   `members` and the trailing `Other` bucket are passed through `sortCats`
   before rendering. The `creating` form's group `<select>` inherits the
   corrected group order automatically (it maps `groups`).
2. **`src/screens/Plan.jsx`**, **`src/ui/plan/phone/PlanPhone.jsx`**,
   **`src/components/CategoryPickerSheet.jsx`** (pure refactor): replace the
   inline comparators with the shared import. Rendered output byte-identical
   by construction (same expression).

Explicitly unchanged: the pickers' special sections keep their placement —
Inflow/RTA header first, "Selected:" block, "Other" bucket last; search
filtering semantics; everything else about the components.

## Testing

- Unit: `tests/category-order.test.js` — sortOrder ascending, name tiebreak
  (localeCompare), 0-vs-undefined equivalence, input not mutated.
- Full suite + build green (the refactored files are covered by existing
  tests where testable; components verified live per repo convention).
- Live (read-only): Plan screen order vs picker order side-by-side — desktop
  TxForm picker at 1280 and a phone MoneySheets picker at 390 both list
  groups and members in exactly the Plan screen's order.

## Delivery

Single branch `feat/category-picker-order` off main, single draft PR
(no stack needed). SDD execution.
