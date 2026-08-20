# Payee Management (YNAB-style) — Design

**Date:** 2026-08-20
**Status:** Approved design, awaiting implementation plan
**Scope:** Spec 2 of the inline-editor initiative. Builds on Spec 1
(`docs/superpowers/specs/2026-08-20-inline-tx-editor-design.md`, merged to
main): the inline editor's payee combobox was sectioned so this spec's
additions are additive.

## Goal

Full YNAB-parity payee management: a "Saved Payees" section and a
"Manage Payees" link in the editor's payee dropdown, and a Manage Payees
modal with per-payee customization (rename, auto-categorize, import rename
rules, hide, delete-with-reassignment) plus multi-select operations
(combine-and-rename, bulk hide, delete all).

## Decisions (locked with user)

1. **Data model**: a name-keyed `payees` collection stored BESIDE
   transactions — no `payeeId` FK, no transaction migration. `merchant`
   stays the free-text source of truth on transactions; renaming a payee is
   a bulk merchant-string update through the undo-aware store.
2. **Overlay, not mirror**: a `payees` record exists only once a payee has
   customizations. The visible payee list is always the case-insensitive
   union of distinct transaction merchants and payee records (record casing
   wins). No seeding migration.
3. **Delete = reassign-then-remove** (per user's YNAB screenshots): deleting
   a referenced payee first asks "Select a new payee for these N
   transactions" via a dropdown defaulting to **[No Payee]** (which blanks
   `merchant`, landing those transactions in the existing needs-attention
   flows); other payees are offered. Then the record and the old name are
   gone.
4. **Modal-scoped Undo/Redo**: the modal's Undo/Redo buttons operate on a
   scoped window over the app's existing global undo stack — a boundary
   marker is recorded at modal open, and modal Undo/Redo cannot cross it.
   No parallel history; Done leaves everything in normal app history.
5. **Desktop-first**: phone TxSheet parity (suggestions, auto-categorize in
   the phone sheet, a phone Manage Payees surface) is deferred.

## Section 1 — Data model & sync

**Collection** `S.payees`, record shape:

```
{ id, name,                       // canonical display name; matches
                                  // transaction.merchant case-insensitively
  transferRef: 'acc:<id>' | 'card:<id>' | null,  // set = this record customizes a
                                  // SYNTHESIZED transfer payee (visibility only);
                                  // name is ignored for matching in that case
  autoCategorize: bool,
  autoCategoryId: catId | 'rta' | null,   // 'rta' = leave as uncategorized income
  renameRules: [{ op: 'contains' | 'is', pattern }],
  hidden: bool }
```

**Supabase**: one new migration — `payees` table (`id` uuid pk, `user_id`,
`name` text, `auto_categorize` bool, `auto_category_id` uuid nullable FK →
categories, `auto_category_rta` bool, `rename_rules` jsonb, `hidden` bool)
with the usual RLS — plus a `sync.js` collection mapping. This is the
initiative's first schema change; the implementation plan carries the SQL
for approval.

**Pure store actions** (all via `applyData`, so audit entries and history
come free; each is ONE undo step):

- `upsertPayee(data, { name, patch })` — create-or-update the overlay record.
- `renamePayee(data, { from, to })` — updates the record's name AND
  bulk-updates every matching transaction's `merchant` (case-insensitive
  match, exact replacement with `to`'s casing).
- `combinePayees(data, { names, into })` — survivor name `into`;
  bulk-updates merchants of all absorbed names; merges all rename rules
  onto the survivor's record (deduped); deletes absorbed records.
- `deletePayee(data, { name, replacement })` — reassigns matching
  transactions' `merchant` to `replacement` (`''` for [No Payee]), then
  removes the record. Bulk variant accepts multiple names, one replacement.
- `setPayeesHidden(data, { names, hidden })`.

## Section 2 — Editor & import integration

- **Payee combobox** (Spec 1's `payeeSections`) gains the "Saved Payees"
  section: the union list minus hidden payees; "Payments and Transfers"
  unchanged above it except that transfer payees hidden via their
  `transferRef` overlay record are excluded; a **"Manage Payees"** footer
  link opens the modal. Hidden payees are excluded from type-ahead
  suggestions but free text can still enter any name.
- **Pure module** `src/lib/payees.js` owns: `payeeIndex(S)` (the union with
  per-payee `txCount` and the overlay record), rule matching
  (`contains`/`is`, case-insensitive), and the auto-categorize decision
  helper.
- **Auto-categorize**: committing a payee in the inline editor whose record
  has `autoCategorize` fires a category prefill — only when the category
  cell is empty (an explicit user pick always wins); `'rta'` means leave
  the inflow uncategorized (income). Applied through `editorPatch`'s
  existing category semantics so the type inference stays consistent.
- **Rename rules** apply at File Import: an imported merchant matching any
  payee's rule is written as that payee's canonical name (first match wins;
  `is` rules take precedence over `contains`).

## Section 3 — Manage Payees modal

Desktop modal on a new Base UI Dialog primitive
(`src/ui/primitives/Modal.jsx`), two panes:

- **Left pane**: search field; "Payees (N)" select-all checkbox; checkbox
  list of the union (hidden payees shown here, dimmed — management must see
  what suggestion lists hide). Transfer payees are listed too, labeled
  "Transfer : <account>" (synthesized from accounts/credit cards, sorted
  after regular payees).
- **One payee group at a time** (per the reference screenshot): a selection
  mixing regular and transfer payees renders an empty-state pane —
  "Only one payee group can be edited at a time. Please *deselect transfer
  payees* to continue." — where the link deselects the transfer subset.
  A transfer-only selection offers **visibility only** (hide/unhide, stored
  as `transferRef` overlay records); rename, rules, auto-categorize, combine
  and delete never apply to synthesized transfer payees.
- **Right pane, single selection**: editable Payee Name (rename on commit);
  "Show N Transactions" link → sub-modal table (account / date / category /
  memo / amount); Categorization (auto-categorize toggle + the existing
  category picker including Ready to Assign); Renaming (rules list:
  Contains/Is select + pattern + add/remove); Payee Visibility (hide
  checkbox with the YNAB explanation copy); **Delete** → the pane switches
  to the reassignment step (dropdown defaulting **[No Payee]**, Cancel /
  Delete) per the reference screenshots.
- **Right pane, multi-selection**: "N Payees Selected" + combined
  "Show N Transactions"; **Combine and Rename** (name field + Combine
  button; note copy: combining also combines their renaming rules); **Hide
  these payees**; **Delete All** → the same reassignment step for the whole
  set.
- **Footer**: modal-scoped Undo/Redo (decision 4) + Done.

## Section 4 — Testing & verification

- Pure Vitest (no jsdom, repo convention): `payees.js` union/casing/hidden/
  txCount; rule matching incl. precedence; auto-categorize decision (empty
  cell, explicit pick wins, 'rta'); store actions (`renamePayee` bulk
  update, `combinePayees` rule merge + record cleanup, `deletePayee`
  reassignment incl. [No Payee], hidden), extending the existing
  store-action test style; upgraded `payeeOptions` sections (Saved Payees,
  hidden exclusion); sync round-trip mapping for the new collection; the
  modal's scoped-undo boundary logic as a pure module.
- Live verification by a Playwright subagent pass (throwaway-harness
  recipe): rename ripples to register rows; combine; hide removes from
  suggestions but not from management; delete-with-reassign both to a payee
  and to [No Payee]; auto-categorize prefill in the inline editor; scoped
  undo can't cross the modal-open boundary.

## Out of scope (this spec)

- Phone TxSheet payee suggestions / auto-categorize / a phone Manage Payees
  surface.
- Payee-based reporting or filters.
- Applying rename rules retroactively to existing transactions (rules are
  import-time only; retroactive apply could be a later bulk tool).
