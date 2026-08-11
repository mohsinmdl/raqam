# Mobile Transactions Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phone-usable Transactions screen per `docs/superpowers/specs/2026-08-12-mobile-transactions-design.md`: flex-row list + compact toolbar at ≤700px, desktop table untouched.

**Architecture:** `useIsPhone()` branches presentation inside `Transactions()`; new `TxPhoneList` component renders the two row populations from the SAME data pipeline (txGroups/selection/handlers). No new state, no store changes.

**Tech Stack:** React 18, existing `useIsPhone` (`src/lib/useIsPhone.js`), inline styles per codebase convention.

## Global Constraints

- Desktop >700px pixel-identical: table/toolbar JSX only wrapped, never edited.
- Phone rows ≥44pt (minHeight 48), gaps ≥8px, amounts `.tnum` right-aligned via `t.amtLabel`/`t.amtColor` (never re-formatted).
- `SearchField` accepts `collapsed`/`expanded` px props (default 190/280) — phone passes larger values; its input inherits the ≥16px phone font rule from theme.css.
- No swipe gestures, no new chart/grouping. One Teal / Signal-Only / Flat Ledger rules bind.
- Tests: `pnpm test` green; no jsdom component tests.

---

### Task 1: `TxPhoneList` component

**Files:**
- Create: `src/components/TxPhoneList.jsx`

**Interfaces:**
- Consumes: `TxChips` from `../ui/TxChips.jsx`; row objects shaped by `txRowOf`/`ruleRowOf` (fields: `merchant, dateLabel, catName, acctLabel, amtLabel, amtColor, rowOpacity, isOverdue, stGlyph, stColor, stOn, stOutline, stLabel, stTitle`).
- Produces: `default TxPhoneList({ postedRows, scheduled, schedKey, selected, schedSel, onToggleRow, onToggleSched, schedOpen, onToggleSchedOpen, overdueCount, hiddenRuleCount, hideAccount })` — Task 2 renders it.

- [ ] **Step 1: Write the component** (module-scope subcomponents — same remount lesson as Row/GroupHead in Transactions.jsx):

```jsx
// Phone presentation of the transactions register (≤700px) — same data
// pipeline as the desktop table, different markup. Spec:
// docs/superpowers/specs/2026-08-12-mobile-transactions-design.md
// Tap toggles selection (additive, like the desktop checkbox); actions stay
// in the existing BulkBar. Amounts arrive pre-formatted (amtLabel/amtColor).
import TxChips from '../ui/TxChips.jsx';

function PhoneRow({ t, selId, checked, onToggle, scheduled, hideAccount, last }) {
  const sub = [t.dateLabel, t.catName, !hideAccount && t.acctLabel].filter(Boolean).join(' · ');
  return (
    <button
      onClick={() => onToggle(selId, !checked)}
      aria-pressed={checked}
      className={checked ? undefined : 'hv-elev'}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 48,
        padding: '6px 16px', border: 'none', textAlign: 'left', cursor: 'pointer',
        color: 'var(--text)', font: 'inherit',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: checked ? 'var(--soft)'
          : scheduled ? 'color-mix(in srgb, var(--warn-soft) 40%, var(--surface))' : 'none',
      }}
    >
      <span style={{ minWidth: 0, flex: 1, opacity: t.rowOpacity }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflowEllipsis: undefined, textOverflow: 'ellipsis' }}>{t.merchant}</span>
          <TxChips row={t} meta />
        </span>
        <span style={{ display: 'block', fontSize: 11.5, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: t.isOverdue ? 'var(--neg)' : 'var(--muted)' }}>{sub}</span>
      </span>
      <span className="tnum" style={{ fontSize: 14, fontWeight: 600, color: t.amtColor, whiteSpace: 'nowrap', flex: 'none', opacity: t.rowOpacity }}>{t.amtLabel}</span>
      {!scheduled && t.stGlyph && (
        <span
          role="img" aria-label={t.stLabel} title={t.stTitle || t.stLabel}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15, borderRadius: 999, boxSizing: 'border-box',
            background: t.stOutline ? 'transparent' : t.stColor,
            color: t.stOutline ? t.stColor : t.stOn,
            border: t.stOutline ? ('1.25px solid ' + t.stColor) : 'none',
            fontSize: 9, fontWeight: 700, lineHeight: 1, flex: 'none' }}
        >{t.stGlyph}</span>
      )}
    </button>
  );
}

export default function TxPhoneList({
  postedRows, scheduled, schedKey, selected, schedSel,
  onToggleRow, onToggleSched, schedOpen, onToggleSchedOpen,
  overdueCount, hiddenRuleCount, hideAccount,
}) {
  const grouped = scheduled.length > 0;
  const note = [
    overdueCount > 0 ? overdueCount + ' overdue' : 'not yet spent',
    hiddenRuleCount > 0 ? hiddenRuleCount + ' more later' : null,
  ].filter(Boolean).join(' · ');
  return (
    <div>
      {grouped && (
        <>
          <button
            onClick={onToggleSchedOpen} aria-expanded={schedOpen}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 44, padding: '8px 16px', border: 'none', borderBottom: '1px solid var(--border)', background: 'var(--warn-soft)', color: 'var(--text)', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}
          >
            <span aria-hidden="true" style={{ fontSize: 10, color: 'var(--muted)', width: 10 }}>{schedOpen ? '▾' : '▸'}</span>
            <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.05em' }}>SCHEDULED</span>
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{scheduled.length + (scheduled.length === 1 ? ' item' : ' items')} · {note}</span>
          </button>
          {schedOpen && scheduled.map((x, i) => {
            const key = schedKey(x);
            return (
              <PhoneRow
                key={key} t={x.row} selId={key} scheduled hideAccount={hideAccount}
                checked={schedSel.has(key)} onToggle={onToggleSched}
                last={postedRows.length === 0 && i === scheduled.length - 1}
              />
            );
          })}
          {postedRows.length > 0 && (
            <div aria-hidden="true" style={{ height: '.3125rem', background: 'var(--warn-soft)', borderBottom: '1px solid var(--border)' }} />
          )}
        </>
      )}
      {postedRows.map((t, i) => (
        <PhoneRow
          key={t.id} t={t} selId={t.id} hideAccount={hideAccount}
          checked={selected.has(t.id)} onToggle={onToggleRow}
          last={i === postedRows.length - 1}
        />
      ))}
    </div>
  );
}
```

Note: remove the accidental `textOverflowEllipsis: undefined` if transcribing — keep only `textOverflow: 'ellipsis'`.

- [ ] **Step 2:** `pnpm test` (unchanged, green) and `pnpm build` (component compiles though unused).
- [ ] **Step 3: Commit** — `git add src/components/TxPhoneList.jsx && git commit -m "Mobile tx: TxPhoneList presentation component"`

---

### Task 2: Branch Transactions.jsx for phone

**Files:**
- Modify: `src/screens/Transactions.jsx`

**Interfaces:**
- Consumes: `useIsPhone` from `../lib/useIsPhone.js`, `TxPhoneList` (Task 1), everything already in scope.

- [ ] **Step 1: imports + flag** — add imports; inside `Transactions()` after `const wide = prefs.wide !== false;` add:

```jsx
  const phone = useIsPhone();
  // Phone always uses the flush, full-width layout — the boxed 1180px card
  // frame is a desktop choice; the wide pref stays desktop-only.
  const flush = wide || phone;
```
Replace layout usages of `wide` with `flush` ONLY in: the root div's `maxWidth`/`padding`, the column div's `gap`, the toolbar's `padding`/border ternary, `PositionStrip wide={flush}`, and the list `<section>` border/radius ternary. (The `setPrefs({ wide: !wide })` toggle and `aria-pressed` keep using `wide`.)

- [ ] **Step 2: toolbar branch** — wrap the existing toolbar div in `{!phone && (…existing JSX unchanged…)}`; add before it:

```jsx
        {phone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
            <span style={{ flex: 1, minWidth: 0, display: 'flex' }}>
              <SearchField ref={searchRef} value={F.q} onChange={v => setF('q', v)} collapsed={220} expanded={220}
                placeholder={acct ? 'Search ' + acct.nickname : 'Search All Accounts'} label="Search transactions" />
            </span>
            <button
              onClick={() => setSort(s => (s.key === 'signed' ? DEFAULT_SORT : { key: 'signed', dir: 'asc' }))}
              aria-label={sort.key === 'signed' ? 'Sort newest first' : 'Sort by biggest expense first'}
              className="hv-accent-fg"
              style={{ minHeight: 44, border: 'none', background: 'none', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: '0 4px', whiteSpace: 'nowrap', flex: 'none' }}
            >
              {sortLabel(sort) + ' ' + (sort.dir === 'asc' ? '↑' : '↓')}
            </button>
          </div>
        )}
```

- [ ] **Step 3: list branch** — inside the `<section aria-label="Transaction list">`, change the table condition to `{!phone && (postedRows.length > 0 || scheduled.length > 0) && (<table …unchanged…>)}` and add:

```jsx
          {phone && (postedRows.length > 0 || scheduled.length > 0) && (
            <TxPhoneList
              postedRows={postedRows} scheduled={scheduled} schedKey={schedKey}
              selected={selected} schedSel={schedSel}
              onToggleRow={toggleRow} onToggleSched={toggleSched}
              schedOpen={schedOpen} onToggleSchedOpen={() => setSchedOpen(o => !o)}
              overdueCount={overdueCount} hiddenRuleCount={hiddenRuleCount}
              hideAccount={!!accountId}
            />
          )}
```

- [ ] **Step 4:** `pnpm test` green, `pnpm build` clean.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "Mobile tx: phone list + compact toolbar branch (desktop table untouched)"`

---

### Task 3: Live verification (both viewports) + fixes

- [ ] **Step 1:** Dev server for this worktree is on port 5199. Dispatch the Playwright subagent: phone 393×852 and desktop 1280×800 against the spec's acceptance criteria. If the auth wall blocks (no session in the Playwright profile), build the established throwaway-harness verification instead: a scratch Vite root OUTSIDE the repo mounting `<Transactions/>` with providers and a fixture store, stubbing `../lib/supabase.js` and auth via a `resolveId` plugin (per the project's "Verifying UI without jsdom" pattern) — verify the same criteria against fixture data.
- [ ] **Step 2:** Fix real defects found (only in Task-1/2 files + theme.css), re-verify, `pnpm test` + `pnpm build`, commit `"Mobile tx: live-verification fixes"`.
- [ ] **Step 3:** Update the spec's acceptance-criteria checkboxes to verified state; commit.
