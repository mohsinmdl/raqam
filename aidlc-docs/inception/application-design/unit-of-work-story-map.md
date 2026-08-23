# Story → Unit Map — Multi-Plan System

All 17 stories assigned; several span units (primary owner bolded — the unit whose code generation must satisfy the ACs; contributors provide prerequisites).

| Story | U1 db-plans | U2 plan-scoping | U3 plan-formatting | U4 plan-shell-ui |
|---|---|---|---|---|
| US-1 Migration into "My Plan" | **Owner** | contributes (plans in store) | contributes (identical rendering) | — |
| US-2 Plan ownership integrity | **Owner** | contributes (stamping) | — | — |
| US-3 First-use plan creation | contributes (schema) | contributes (zero-plan gate, seeding) | contributes (previews) | **Owner** (FirstPlanSetup) |
| US-4 Create plan via modal | contributes (constraints) | contributes (createPlan/switch) | contributes (previews) | **Owner** |
| US-5 Full option sets | contributes (CHECK keys) | — | **Owner** (catalogues) | contributes (selects) |
| US-6 Seed checkbox | — | **Owner** (seed flag + action) | — | contributes (checkbox) |
| US-7 Sidebar plan identity | — | contributes (usePlan) | — | **Owner** |
| US-8 Switch plans | — | **Owner** (switchPlan) | — | contributes (dropdown) |
| US-9 Remembered open plan | — | **Owner** (resolveOpenPlan) | — | — |
| US-10 Phone switcher | — | contributes | — | **Owner** |
| US-11 Data isolation | contributes (FKs) | **Owner** (fetch filters) | — | — |
| US-12 Plan-stamped writes, scoped undo/audit | — | **Owner** | — | — |
| US-13 Per-plan amount rendering | — | contributes (settings) | **Owner** | — |
| US-14 Per-plan date rendering | — | — | **Owner** | — |
| US-15 Separator-aware input | — | — | **Owner** | contributes (keypads) |
| US-16 Rename plan | — | contributes (renamePlan) | — | **Owner** |
| US-17 Guarded delete | contributes (cascade) | contributes (deletePlan/drain) | — | **Owner** |

## Per-unit AC ownership counts
- U1: 2 owned (US-1, US-2) + 5 contributing
- U2: 5 owned (US-6, US-8, US-9, US-11, US-12) + 7 contributing
- U3: 4 owned (US-5, US-13, US-14, US-15) + 3 contributing
- U4: 6 owned (US-3, US-4, US-7, US-10, US-16, US-17) + 4 contributing

No orphan stories; every story has exactly one owner.
