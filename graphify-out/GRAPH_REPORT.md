# Graph Report - .  (2026-08-10)

## Corpus Check
- 131 files · ~219,166 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 834 nodes · 3068 edges · 51 communities (34 shown, 17 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 36 edges (avg confidence: 0.51)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Drawer Forms & Fields
- Recurring Schedules & Tx Rows
- Tx Navigation & Date Fields
- Store Actions & Category Tree
- Balance & Budget Calculations
- Sync, Undo & Prefs Persistence
- Envelope Budgeting
- Plan Screen (Assign/Cover)
- Reflect Headers & Cards
- CSV Export & Report Series
- Plan Views & Targets
- Authentication & User Menu
- Plan Inspector Panel
- Recent Moves
- DB Schema (Migrations)
- App Shell & Routing
- Inspector Auto-Assign Calc
- Manage Views Modal
- Sidebar & Account List
- Builtin Plan Views
- Module: SpendingBreakdown
- Module: calcExpr
- Module: AgeOfMoney
- Module: 0011_envelope
- Module: 0004_editing_audit
- Module: misc
- Module: misc
- Module: misc
- Module: misc
- Module: misc
- Module: misc
- Module: misc
- Module: misc
- Module: misc
- Module: misc
- Module: misc
- Module: misc
- Module: misc
- Module: misc
- Module: misc
- Module: misc

## God Nodes (most connected - your core abstractions)
1. `useStore()` - 100 edges
2. `useDrawer()` - 81 edges
3. `nowIso()` - 77 edges
4. `useUI()` - 66 edges
5. `useMoney()` - 57 edges
6. `makeAudit()` - 47 edges
7. `currentMonth()` - 46 edges
8. `monthLabel()` - 39 edges
9. `parseAmt()` - 34 edges
10. `Transactions()` - 31 edges

## Surprising Connections (you probably didn't know these)
- `Gate()` --calls--> `useAuth()`  [EXTRACTED]
  src/App.jsx → src/auth/AuthProvider.jsx
- `clampDay()` --calls--> `daysInMonth()`  [EXTRACTED]
  src/lib/dates.js → src/lib/calc.js
- `FilterRow()` --calls--> `useStore()`  [EXTRACTED]
  src/screens/reflect/Reflect.jsx → src/store/StoreProvider.jsx
- `AccountList()` --calls--> `currentMonth()`  [EXTRACTED]
  src/components/AccountList.jsx → src/lib/dates.js
- `AccountList()` --calls--> `nowIso()`  [EXTRACTED]
  src/components/AccountList.jsx → src/lib/dates.js

## Import Cycles
- None detected.

## Communities (51 total, 17 thin omitted)

### Community 0 - "Drawer Forms & Fields"
Cohesion: 0.07
Nodes (104): accountFormDef, Body(), useInstGroups(), useSubmit(), adjustCardFormDef, Body(), useSubmit(), adjustFormDef (+96 more)

### Community 1 - "Recurring Schedules & Tx Rows"
Cohesion: 0.06
Nodes (87): formFromTx(), openers, txDefaults(), catById(), dayLabel(), daysUntil(), shortDate(), timeLabel() (+79 more)

### Community 2 - "Tx Navigation & Date Fields"
Cohesion: 0.05
Nodes (67): GlobalShortcuts(), arrowStyle(), selStyle, TxMonthNav(), calendarCells(), chip(), Column(), dateLabel() (+59 more)

### Community 3 - "Store Actions & Category Tree"
Cohesion: 0.08
Nodes (71): nowIso(), uid(), ALIASES, normName(), OTHER_GROUP, YNAB_TREE, addCategoryToGroup(), GroupRow() (+63 more)

### Community 4 - "Balance & Budget Calculations"
Cohesion: 0.09
Nodes (52): accountBalance(), accountDeletePolicy(), accountDelta(), accountRefs(), budgetProjection(), budgetRollover(), budgetSpent(), budgetState() (+44 more)

### Community 5 - "Sync, Undo & Prefs Persistence"
Cohesion: 0.08
Nodes (42): ImportLegacy(), LoadingScreen(), loadUserPrefs(), readJson(), userPrefsKey(), writeJson(), writeUserPrefs(), applyRedo() (+34 more)

### Community 6 - "Envelope Budgeting"
Cohesion: 0.09
Nodes (21): categoryActivityRows(), earliestMonth(), earliestOpeningSnapshots(), isMonth(), monthOf(), SHORTCUT_GROUPS, btn, BulkBar() (+13 more)

### Community 7 - "Plan Screen (Assign/Cover)"
Cohesion: 0.10
Nodes (23): AddGroupButton(), AssignPopover(), CoverPopover(), flipIfLow(), fmtDMY(), HEAD, MovePopover(), MovesPopover() (+15 more)

### Community 8 - "Reflect Headers & Cards"
Cohesion: 0.11
Nodes (22): Header(), TITLES, card, linkBtn, PositionStrip(), availableCredit(), relTime(), cardBg() (+14 more)

### Community 9 - "CSV Export & Report Series"
Cohesion: 0.16
Nodes (22): RFC-4180, monthLabel(), downloadCsv(), escapeField(), toCsv(), incomeExpenseSeries(), monthlySeries(), netWorthSeries() (+14 more)

### Community 10 - "Plan Views & Targets"
Cohesion: 0.18
Nodes (19): availOf(), BUILTIN_VIEWS, countFor(), isBuiltin(), matchesView(), normalizeViews(), overfundedMatch(), TOGGLEABLE_BUILTINS (+11 more)

### Community 11 - "Authentication & User Menu"
Cohesion: 0.17
Nodes (15): AuthProvider(), Ctx, useAuth(), AuthScreen(), label, SidebarUser(), rightNote, row (+7 more)

### Community 12 - "Plan Inspector Panel"
Cohesion: 0.13
Nodes (15): AUTO_ASSIGN_KINDS, selectionSummary(), costToBeMe(), EditNamePopover(), softBtn, cardStyle, DISABLED_CADENCES, ExcludeToggle() (+7 more)

### Community 13 - "Recent Moves"
Cohesion: 0.21
Nodes (13): chipStyle(), listStyle, panelStyle, RecentMoves(), absLabelFor(), filterMoves(), groupMovesByDay(), GROUPS (+5 more)

### Community 14 - "DB Schema (Migrations)"
Cohesion: 0.41
Nodes (12): auth, public, public.accounts, public.budgets, public.card_products, public.cards, public.categories, public.institutions (+4 more)

### Community 15 - "App Shell & Routing"
Cohesion: 0.23
Nodes (8): App(), clampSb(), Gate(), Shell(), BudgetHub(), INFO, Planned(), UIProvider()

### Community 16 - "Inspector Auto-Assign Calc"
Cohesion: 0.38
Nodes (11): prevMonth(), assertCtx(), assignedIn(), autoAssignAmount(), autoAssignPlan(), mean3(), rowOf(), spentIn() (+3 more)

### Community 17 - "Manage Views Modal"
Cohesion: 0.18
Nodes (6): MAX_NAME, iconBtn, iconBtnOff, ManageViewsModal(), sectionLabel, ViewEditorModal()

### Community 18 - "Sidebar & Account List"
Cohesion: 0.29
Nodes (6): AccountList(), GLYPH, glyphFor(), NAV, Sidebar(), accountRows()

### Community 19 - "Builtin Plan Views"
Cohesion: 0.29
Nodes (10): builtinRows(), isHiddenBuiltin(), newView(), normalizeBuiltins(), orderedBuiltinViews(), reorderBuiltins(), reorderViews(), toggleBuiltinHidden() (+2 more)

### Community 20 - "Module: SpendingBreakdown"
Cohesion: 0.27
Nodes (7): card, h2, PALETTE, pctLabel(), plural(), SpendingBreakdown(), Donut()

### Community 21 - "Module: calcExpr"
Cohesion: 0.33
Nodes (7): applyCalcExpr(), OPS, deletePolicy(), CategoryRow(), archiveCategory(), askDeleteCategory(), CategoryHeader()

### Community 22 - "Module: AgeOfMoney"
Cohesion: 0.38
Nodes (5): AgeOfMoney(), card, h2, plural(), shortLabel()

### Community 23 - "Module: 0011_envelope"
Cohesion: 0.60
Nodes (4): public.assignments, public.category_groups, auth.users, public.categories

## Knowledge Gaps
- **116 isolated node(s):** `Ctx`, `label`, `GLYPH`, `TITLES`, `card` (+111 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `nowIso()` connect `Store Actions & Category Tree` to `Tx Navigation & Date Fields`?**
  _High betweenness centrality (0.000) - this node is a cross-community bridge._
- **What connects `Ctx`, `label`, `GLYPH` to the rest of the system?**
  _116 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Drawer Forms & Fields` be split into smaller, more focused modules?**
  _Cohesion score 0.06916493176035161 - nodes in this community are weakly interconnected._
- **Should `Recurring Schedules & Tx Rows` be split into smaller, more focused modules?**
  _Cohesion score 0.05627147766323024 - nodes in this community are weakly interconnected._
- **Should `Tx Navigation & Date Fields` be split into smaller, more focused modules?**
  _Cohesion score 0.05088919288645691 - nodes in this community are weakly interconnected._
- **Should `Store Actions & Category Tree` be split into smaller, more focused modules?**
  _Cohesion score 0.07684210526315789 - nodes in this community are weakly interconnected._
- **Should `Balance & Budget Calculations` be split into smaller, more focused modules?**
  _Cohesion score 0.08587570621468926 - nodes in this community are weakly interconnected._