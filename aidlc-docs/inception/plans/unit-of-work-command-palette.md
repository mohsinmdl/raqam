# Units of Work — Command Palette (Cycle 3)

## Decision: Single Unit (no decomposition)
The feature is one cohesive client-side module with tight internal coupling (index → match/rank → overlay). Splitting it into multiple units would create artificial seams. Therefore **one unit**.

## U1 — `command-palette`
**Scope**: the entire `src/ui/command/` module + the five integration edits (UIProvider, App/Shell, Sidebar, Header, shortcuts.js).

**Stories delivered**: US-1 … US-10 (all).

**Dependencies**: none on other units. Depends on existing infra: `openers`, `useShortcuts`/`SPEC`, `UIProvider`, `DrawerProvider`, `useStore`, `usePlan`, Base UI Dialog, `fast-check` (already a devDependency).

**Construction stages for U1**: Functional Design → NFR Requirements → Code Generation. (NFR Design, Infrastructure Design skipped — see execution plan.)

**Testable-property carrier**: `matchRank.js` (pure) is the PBT focus (PBT-02/03/07/08 via fast-check; PBT-09 framework already present).
