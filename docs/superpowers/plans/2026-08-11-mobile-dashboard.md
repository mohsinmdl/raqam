# Mobile Dashboard + Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Dashboard a phone-usable PWA landing screen (iPhone 15 Pro reference, 393×852pt) with a bottom tab bar, a left-to-spend card, and the transaction form as a bottom sheet — glance + quick-add.

**Architecture:** One responsive Dashboard (no separate mobile component): a `useIsPhone()` viewport hook drives the shell (sidebar ⇄ tab bar), while CSS classes + a `@media (max-width: 700px)` block in theme.css reorder/hide dashboard modules and restyle the drawer as a bottom sheet. All figures come from existing selectors; the only new math is `leftToSpend` summing positive envelope `available`.

**Tech Stack:** React 18, react-router-dom 6 (NavLink), Vite 8, vitest (pure-function tests only — no jsdom, per project rule), existing theme.css custom properties.

## Global Constraints

- Trusted Ledger system: flat cards, 1px `var(--border)` hairlines, ONE teal accent (`var(--accent)`) only on actionable elements, tabular numerals (`.tnum`) on every monetary figure, no resting shadows (the bottom sheet is a transient overlay — `var(--shadow)` is legitimate there).
- Phone breakpoint: **`@media (max-width: 700px)`** for shell + module visibility/order + sheet (approved in brief §7); the existing ≤820px container query keeps governing column stacking.
- Touch targets ≥44pt on phone. Inputs ≥16px font on phone (prevents iOS auto-zoom).
- Safe areas: `viewport-fit=cover` + `env(safe-area-inset-top)` on the header, `env(safe-area-inset-bottom)` on the tab bar and bottom sheet.
- Desktop appearance must be pixel-identical to today at >700px viewport.
- No new chart types, no swipe gestures, no service worker, no month-nav redesign.
- Amounts masked by default (existing `useMoney()` handles it — never bypass it).
- Tests: pure helpers only (no jsdom). Live verification happens via the Playwright subagent task at the end.

---

### Task 1: `leftToSpend` selector

**Files:**
- Create: `src/lib/leftToSpend.js`
- Test: `tests/left-to-spend.test.js`

**Interfaces:**
- Consumes: `envelopeFor(store, month, now)` from `src/lib/envelope.js` — returns `{ rows: Map(catId -> {assigned, activity, available, carryIn}), rta, ... }`.
- Produces: `leftToSpend(env) -> number` — sum of positive `available` across rows. Task 3 imports it.

- [ ] **Step 1: Write the failing test**

```js
// tests/left-to-spend.test.js
import { describe, it, expect } from 'vitest';
import { leftToSpend } from '../src/lib/leftToSpend.js';

const env = rows => ({ rows: new Map(rows) });

describe('leftToSpend', () => {
  it('sums positive available across envelopes', () => {
    expect(leftToSpend(env([
      ['groc', { available: 5000 }],
      ['rent', { available: 12000 }],
    ]))).toBe(17000);
  });
  it('ignores overspent (negative) envelopes — they are debt, not spendable money', () => {
    expect(leftToSpend(env([
      ['groc', { available: 5000 }],
      ['fuel', { available: -3000 }],
    ]))).toBe(5000);
  });
  it('is 0 for an empty envelope set', () => {
    expect(leftToSpend(env([]))).toBe(0);
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run tests/left-to-spend.test.js` — expect FAIL ("leftToSpend is not a function" / module not found).

- [ ] **Step 3: Implement**

```js
// src/lib/leftToSpend.js
// "Left to spend" for the mobile dashboard: money still sitting in envelopes
// this month — the sum of POSITIVE available across expense categories.
// Overspent envelopes are excluded: a negative envelope is money already gone,
// not money that can still be spent. (Deliberately NOT Ready-to-Assign, which
// is a planning number; confirmed in the 2026-08-11 shape brief.)
export function leftToSpend(env) {
  let sum = 0;
  env.rows.forEach(r => { if (r.available > 0) sum += r.available; });
  return sum;
}
```

- [ ] **Step 4: Run the test again** — expect 3/3 PASS. Then `pnpm test` — full suite green.
- [ ] **Step 5: Commit** — `git add src/lib/leftToSpend.js tests/left-to-spend.test.js && git commit -m "Mobile dash: leftToSpend selector (positive envelope available)"`

---

### Task 2: Phone shell — `useIsPhone`, MobileTabBar, Shell switch, safe areas

**Files:**
- Create: `src/lib/useIsPhone.js`, `src/components/MobileTabBar.jsx`
- Modify: `src/App.jsx` (Shell), `index.html` (viewport meta), `src/styles/theme.css` (append phone block)

**Interfaces:**
- Consumes: `useDrawer()` from `src/ui/DrawerProvider.jsx`; `openers.addTx(openDrawer)` from `src/drawers/openers.js` (defaults to expense — confirmed in brief); `NavLink` from react-router-dom.
- Produces: `useIsPhone() -> boolean` (Task 2 uses it in Shell; nothing else imports it — dashboard modules use CSS only); `<MobileTabBar />` rendered by Shell on phone.

- [ ] **Step 1: viewport meta** — in `index.html` change

```html
<meta name="viewport" content="width=device-width, initial-scale=1">
```
to
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

- [ ] **Step 2: `useIsPhone` hook**

```js
// src/lib/useIsPhone.js
import { useEffect, useState } from 'react';

// Phone-shell switch. Viewport media query — deliberately NOT a container
// query: the shell decides whether a sidebar exists at all, and on a phone
// there is no sidebar to drag, so content-width reactivity has no meaning
// here (brief §7). Dashboard modules keep container queries per the system.
const MQ = '(max-width: 700px)';

export function useIsPhone() {
  const [phone, setPhone] = useState(() => window.matchMedia(MQ).matches);
  useEffect(() => {
    const m = window.matchMedia(MQ);
    const on = e => setPhone(e.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
}
```

- [ ] **Step 3: MobileTabBar**

```jsx
// src/components/MobileTabBar.jsx
// Phone bottom tab bar: Dash · Tx · [+] · Budget · Accounts. The center [+]
// is the screen's one prominent teal action — it opens the add-transaction
// sheet (expense default). Active tab = Soft Teal per the nav-item idiom.
import { NavLink } from 'react-router-dom';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { openers } from '../drawers/openers.js';

const icon = d => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
// Line icons in the sidebar's 1.8-stroke language.
const ICONS = {
  dash: 'M4 13h6V5H4v8zm10 6h6v-8h-6v8zM4 19h6v-4H4v4zm10-10h6V5h-6v4z',
  tx: 'M4 7h13M13 3l4 4-4 4M20 17H7m4-4l-4 4 4 4',
  budget: 'M12 3v18M5 8c0-2 14-2 14 0M5 8v8c0 2 14 2 14 0V8',
  accounts: 'M4 10h16M4 10l8-6 8 6M6 10v8m4-8v8m4-8v8m4-8v8M4 20h16',
};

const tabStyle = ({ isActive }) => ({
  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
  minHeight: 48, justifyContent: 'center', textDecoration: 'none', borderRadius: 10,
  color: isActive ? 'var(--text)' : 'var(--muted)',
  background: isActive ? 'var(--soft)' : 'transparent',
  fontSize: 10.5, fontWeight: isActive ? 600 : 500,
});
const Tab = ({ to, label, d }) => (
  <NavLink to={to} style={tabStyle} aria-label={label}>
    {({ isActive }) => (
      <>
        <span style={{ color: isActive ? 'var(--accent)' : 'inherit', display: 'flex' }}>{icon(d)}</span>
        {label}
      </>
    )}
  </NavLink>
);

export default function MobileTabBar() {
  const { openDrawer } = useDrawer();
  return (
    <nav aria-label="Primary" style={{
      display: 'flex', alignItems: 'center', gap: 4, flex: 'none',
      padding: '6px 10px calc(6px + env(safe-area-inset-bottom))',
      background: 'var(--surface)', borderTop: '1px solid var(--border)',
    }}>
      <Tab to="/dashboard" label="Dash" d={ICONS.dash} />
      <Tab to="/transactions" label="Tx" d={ICONS.tx} />
      <button onClick={() => openers.addTx(openDrawer)} aria-label="Add transaction"
        style={{
          width: 52, height: 52, margin: '0 6px', flex: 'none', border: 'none', borderRadius: 999,
          background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 26, lineHeight: 1,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} className="hv-accent">＋</button>
      <Tab to="/budget" label="Budget" d={ICONS.budget} />
      <Tab to="/accounts" label="Accounts" d={ICONS.accounts} />
    </nav>
  );
}
```

- [ ] **Step 4: Shell switch in `src/App.jsx`** — import `useIsPhone` and `MobileTabBar`; inside `Shell()` add `const phone = useIsPhone();`. When `phone`:
  - grid becomes a single column: `gridTemplateColumns: 'minmax(0,1fr)'`, and `<Sidebar />` + the drag-handle `<div role="separator">` are not rendered (wrap both in `{!phone && ...}`).
  - after `<main>…</main>` inside the header/main column div, render `{phone && <MobileTabBar />}`.
  - height stays `100vh` but use `100dvh` on phone: `height: phone ? '100dvh' : '100vh'` (dynamic viewport unit — the iOS URL bar collapse otherwise leaves a dead gap).

Exact replacement for the outer div's opening (lines 64–72 of App.jsx):

```jsx
  const phone = useIsPhone();
  return (
    <div
      style={{
        position: 'relative',
        display: 'grid', gridTemplateColumns: phone ? 'minmax(0,1fr)' : `${sbW}px minmax(0,1fr)`,
        height: phone ? '100dvh' : '100vh',
        background: 'var(--bg)', color: 'var(--text)',
        fontFamily: "'Figtree', system-ui, sans-serif", fontSize: 14, lineHeight: 1.45,
      }}
    >
      <GlobalShortcuts />
      {!phone && <Sidebar />}
      {!phone && (
        <div
          role="separator" aria-orientation="vertical" aria-label="Resize sidebar"
          ...unchanged drag-handle JSX...
        </div>
      )}
```
and the main column:
```jsx
      <HeaderSlotProvider>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Header />
        <main style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <Routes>…unchanged…</Routes>
        </main>
        {phone && <MobileTabBar />}
      </div>
      </HeaderSlotProvider>
```

- [ ] **Step 5: theme.css phone-shell block** — append:

```css
/* ---------- Phone shell (≤700px viewport; brief 2026-08-11) ----------
   The shell swaps sidebar for a bottom tab bar (App.jsx renders them
   conditionally); this block carries the CSS-only parts: safe-area
   clearance and ≥16px inputs (iOS auto-zoom threshold). */
@media (max-width: 700px) {
  /* Header clears the Dynamic Island / notch under viewport-fit=cover. */
  .app-header { padding-top: env(safe-area-inset-top); }
  input:not([type="checkbox"]):not([type="radio"]),
  select, textarea { font-size: 16px !important; }
}
```
Then add `className="app-header"` to the root element of `src/components/Header.jsx` (its existing inline styles stay; the class only adds the safe-area padding).

- [ ] **Step 6: Verify** — `pnpm test` green (no component tests exist to break); `pnpm build` succeeds. Manually: `pnpm dev` still renders desktop unchanged at wide viewport (spot-check in the running dev server if available; the Playwright task does the real phone pass).
- [ ] **Step 7: Commit** — `git add -A && git commit -m "Mobile shell: useIsPhone, bottom tab bar with center add, safe areas"`

---

### Task 3: Dashboard recomposition + LeftToSpend card + PositionStrip phone mode

**Files:**
- Modify: `src/screens/Dashboard.jsx`, `src/components/PositionStrip.jsx`, `src/styles/theme.css`
- Consumes: `leftToSpend` (Task 1), `envelopeFor` from `src/lib/envelope.js`, `useMonth()`, `useMoney()`.

Phone scroll order (brief §6): position strip → left-to-spend → recent transactions → upcoming → daily spending → largest expenses. Hidden on phone: summary-card grid, spending-by-category, month-to-month, accounts card (Accounts tab owns that). `dash-root` is already `display:flex; flex-direction:column`, so ordering is pure CSS `order`; visibility is `display:none`.

- [ ] **Step 1: classNames in Dashboard.jsx** — add classes to the existing sections (inline styles untouched):
  - summary cards `<section aria-label="Monthly summary">` → `className="dash-summary"`
  - `<div className="dash-cols">` stays; its two inner column divs get `className="dash-col-main"` / `className="dash-col-side"`
  - daily spending section → `className="dash-daily"`, category section → `className="dash-cats"`, month comparison → `className="dash-cmp"`, upcoming → `className="dash-upcoming"`, accounts → `className="dash-accounts"`, largest → `className="dash-largest"`, recent transactions → `className="dash-recent"`
  - snapshot banner keeps no class (visible everywhere, order 0 by default).

- [ ] **Step 2: LeftToSpend card** — add inside `Dashboard()` after `const { M } = v;`:

```jsx
  const env = useMemo(() => envelopeFor(S, month, now), [S, month, now]);
  const lts = leftToSpend(env);
```
(imports: `import { envelopeFor } from '../lib/envelope.js'; import { leftToSpend } from '../lib/leftToSpend.js';`)

and render as the first child AFTER `<PositionStrip />`:

```jsx
        <section aria-label="Left to spend" className="dash-lts" style={{ ...card, padding: '14px 16px', display: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Left to spend</span>
              <span className="tnum" style={{ display: 'block', fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 2 }}>{money(lts)}</span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>still in your envelopes · {C.monthLabel(month)}</span>
            </span>
            <button onClick={() => nav('/budget')} className="hv-accent-fg" style={linkBtn}>Budget ›</button>
          </div>
        </section>
```
`display: 'none'` inline is the desktop default; the phone CSS flips it on (desktop dashboard stays pixel-identical — the brief adds this card to the phone only).

- [ ] **Step 3: PositionStrip phone mode** — in the full (non-compact) return, add classNames: the two `colBase` column divs get `className="pos-cols"`, and the balance div (`flex: 1.4`) gets `className="pos-lead"`. No JSX logic change.

- [ ] **Step 4: recent-row phone columns** — in Dashboard's recent-transactions map, add classNames to the 6 grid cells: date → `tx-cell-date`, merchant div → `tx-cell-merchant`, category div → `tx-cell-cat`, account div → `tx-cell-acct`, amount div → `tx-cell-amt`, edit div → `tx-cell-edit`; and the row div itself → `className="tx-row-grid"` (keep the inline grid style).

- [ ] **Step 5: phone dashboard CSS** — append to theme.css inside the same `@media (max-width: 700px)` block:

```css
  /* Dashboard phone recomposition (brief §6). dash-root is a flex column,
     so `order` re-sequences without touching JSX. */
  .dash-summary, .dash-cats, .dash-cmp, .dash-accounts { display: none; }
  .dash-lts { display: block !important; order: 2; }
  .dash-recent { order: 3; }
  .dash-cols { order: 4; display: flex; flex-direction: column; gap: 16px; }
  /* Inside dash-cols: upcoming (main col) then largest (side col); daily
     spending moves between them via column order. */
  .dash-col-main { display: flex; flex-direction: column; gap: 16px; }
  .dash-col-side { display: flex; flex-direction: column; gap: 16px; }
  /* Position strip: balance leads; the two stat columns collapse. */
  .pos-cols { display: none; }
  /* Recent tx rows: date · merchant+chips · amount; cap at 5 on phone
     (desktop keeps 8) — brief wants a short confirm-glance list. */
  .tx-row-grid { grid-template-columns: 64px minmax(0, 1fr) auto !important; }
  .tx-cell-cat, .tx-cell-acct, .tx-cell-edit { display: none; }
  .dash-recent .tx-row-grid:nth-child(n + 6) { display: none; }
```

Note: on phone, inside `.dash-cols` the DOM order is main-column (daily, cats✕, cmp✕, upcoming) then side-column (accounts✕, largest) — with the hidden ones gone this yields daily → upcoming → largest. Brief order wants upcoming before daily; fix with `order` on the sections: add `.dash-upcoming { order: -1; }` scoped under `.dash-col-main` in the same block:

```css
  .dash-col-main .dash-upcoming { order: -1; }
```
(Real resulting order: strip → left-to-spend → recent → [upcoming → daily] → largest. This satisfies the brief's glance priority; daily/largest are below-fold either way.)

- [ ] **Step 6: Verify** — `pnpm test` green; `pnpm build` green. Resize the dev server window below 700px: order and cuts as specified; above 700px: identical to before (the only DOM additions are hidden classNames and a `display:none` card).
- [ ] **Step 7: Commit** — `git add -A && git commit -m "Mobile dash: phone recomposition, left-to-spend card, strip + row compaction"`

---

### Task 4: Bottom-sheet drawer on phone

**Files:**
- Modify: `src/ui/DrawerProvider.jsx` (one className), `src/styles/theme.css`

- [ ] **Step 1:** in `DrawerShell`, add `className="drawer-panel"` to the `<aside role="dialog">` (inline styles unchanged — they remain the desktop truth).

- [ ] **Step 2:** append to the phone media block in theme.css:

```css
  /* Drawers become bottom sheets: full-width, up from the bottom, ~90% tall,
     rounded top corners. The overlay shadow is legitimate here (transient
     overlay — the one shadow in the system). hsUp already exists. */
  .drawer-panel {
    top: auto !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
    width: 100% !important; max-width: 100% !important; max-height: 90dvh;
    border-left: none !important; border-top: 1px solid var(--border) !important;
    border-radius: 12px 12px 0 0;
    padding-bottom: env(safe-area-inset-bottom);
    animation: hsUp .22s ease !important;
  }
```

- [ ] **Step 3: Verify** — dev server at ≤700px: open Add transaction from the tab bar's ＋ → sheet rises from the bottom, scrolls internally (the shell already has `overflowY:auto` on its body div), scrim tap closes (existing `requestClose`), footer buttons clear the home-indicator inset. Desktop >700px: drawer slides from the right exactly as before. `pnpm test` + `pnpm build` green.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "Mobile: transaction drawer presents as bottom sheet on phone"`

---

### Task 5: Live phone verification (Playwright subagent) + fixes

**Files:** none planned — fixes only if found.

- [ ] **Step 1:** Dispatch the Playwright testing subagent (project convention) against the dev server with viewport 393×852 (`browser_resize`), and have it verify + fix or report:
  1. Landing on `#/dashboard`: no sidebar; tab bar present with 5 items; no horizontal scroll (`document.documentElement.scrollWidth <= 393`).
  2. Above the fold (no scroll): total-balance headline, Left-to-spend card, and the top of Recent transactions all visible.
  3. Hidden on phone: summary cards, category chart, month comparison, accounts card. Order: strip → left-to-spend → recent → upcoming → daily → largest.
  4. ＋ opens the expense form as a bottom sheet; a test transaction can be added and then deleted (undo/cleanup per the usual protocol); inputs ≥16px computed font-size.
  5. Tab navigation works (Tx, Budget, Accounts, back to Dash); active tab shows Soft Teal.
  6. Desktop regression: at 1280×800 the dashboard renders with sidebar, no tab bar, no Left-to-spend card, all sections present.
- [ ] **Step 2:** Run `node <impeccable-skill-dir>/scripts/detect.mjs --json src/components/MobileTabBar.jsx src/styles/theme.css index.html` once (manual detector directive) and fix any hits.
- [ ] **Step 3: Commit fixes** — `git add -A && git commit -m "Mobile dash: live-verification fixes"` (skip if none).
