# Wave D — delight (P2)

## What changed

**Persistent saved-state** (`src/ui/UIProvider.jsx`)
- `flashRows(ids)` now also populates a new `lastSaved` Set (same ids) alongside
  the existing `flashIds` — `flashIds` still self-clears after 1.3s (driving
  the 1.1s `.row-flash` wash), but `lastSaved` does NOT clear on a timer. A
  new `flashRows` call supersedes it outright (one "moment" at a time, not an
  accumulating pile). `lastSaved` and a new `clearLastSaved()` are exposed
  from `useUI()`.
- **Clearing definition** (chosen and documented in-code, `Transactions.jsx`):
  a `pointerdown`/`keydown` listener on `document`, attached only while
  `lastSaved.size > 0`, clears it unless `event.target` is inside an element
  carrying `data-saved-row` (set on the saved `<tr>` by `Row`). So interacting
  WITH the just-saved row (selecting its checkbox, clicking its own
  "Categorize?" chip) doesn't end its own moment; anything else on the
  register does. "Any subsequent applyData" is satisfied transitively — every
  applyData in this screen is itself triggered by a click/keydown, and a save
  specifically is also directly superseding via the `flashRows` call above.
- `Row` (`Transactions.jsx`) takes a new `saved` boolean. While true: the
  `<tr>` gets `data-saved-row` + a `row-saved-wash` class (faint `--soft`
  tint, `theme.css`, only visible when the row isn't already `checked`/
  `scheduled` — those inline backgrounds still win, so selected+saved still
  reads as selected); the first `<td>` gets an inset `2px` left accent rule
  in `var(--accent)` (combined with the existing 3px keyboard-cursor rule
  when both apply — one px narrower so the two read as distinct). No glow,
  no shadow, no animation — a hairline, static cue. Reduced-motion needs no
  separate path here since nothing about it animates; the existing
  `.row-flash` reduced-motion fallback is unchanged.

**Inviting chip** (`src/ui/TxChips.jsx`, `Transactions.jsx`)
- `NeedsCategoryPill` gained a `tone` prop (`'warn'` default, `'accent'` new).
  `tone="accent"` swaps `--warn-soft`/text to `--soft`/`--accent` and the
  label from "This needs a category" to "Categorize?" (action, not problem) —
  identical size/shape/click-target/`stopPropagation` behavior either way.
  Row passes `tone={saved ? 'accent' : 'warn'}` — same `onCategorize` handler
  (desktop: opens the same inline editor), so the flow is byte-identical to
  today's; only the paint changes, and only while `saved && needsCategory`.

**Banner honesty** (`src/lib/needsCategoryBanner.js`, new; `Transactions.jsx`)
- Pure `needsCategoryBannerCount(needsCat, lastSaved)` — set difference,
  extracted for a direct unit test. Threaded ONLY into the desktop
  "N transactions need a category" banner's guard + count text (`!phone &&
  bannerNeedsCatCount > 0`). Deliberately left `needsCat` itself untouched —
  it also drives the phone "To categorize" mini-banner and the `needsCat`
  list filter, neither in this wave's scope — so the exclusion is minimal:
  one derived value, two call sites (banner visibility guard, banner count
  text), no change to filtering/population logic anywhere.

## Tests
- `src/lib/needsCategoryBanner.test.js` (new, 6 cases): empty needsCat → 0;
  no overlap → full count; full/partial overlap excluded; lastSaved id not
  present in needsCat is a no-op; missing/undefined sets tolerated.
- The rest of the feature (UIProvider state machine, the DOM-listener
  clearing rule, Row's conditional rendering) is UI wiring with no further
  pure logic to extract — covered by the live-check below, stated honestly
  rather than padded with a shallow "renders" test.
- `pnpm test`: 85 files, 1177 tests, all passed (17 new).
- `pnpm build`: succeeded (only the pre-existing >500kB chunk-size warning,
  unrelated).

## Live verification (throwaway Vite harness — `Transactions.jsx` mounted
directly with `src/store/sync.js` + `src/lib/supabase.js` stubbed via a
`resolveId` plugin, `enforce: 'pre'`; deleted before committing, `git status`
confirmed clean)

1. Saved an uncategorized expense: row settled into the left accent rule +
   faint wash; category cell showed "Categorize?" at `background: #DDF3EC`
   (`--soft`) / `color: #0F766E` (`--accent`); desktop banner stayed hidden
   (only uncategorized row, still in its saved moment). PASS.
2. Clicked the search field (outside the saved row): accent + wash cleared,
   chip flipped to the amber "This needs a category" (`--warn-soft`), banner
   appeared ("1 transaction needs a category."). PASS.
3. Saved a second, categorized transaction: same left-accent + wash, but the
   category cell rendered plain category text — no chip at all. PASS.
4. Under `prefers-reduced-motion: reduce`, saved a third transaction and
   checked state ~1.6s later (past the 1.3s flash-clear timer, confirmed
   `row-flash` no longer in the class list) — the accent rule and wash were
   still present, confirming the persistent state has no dependency on the
   flash animation. PASS.
5. Selected (checkbox) the still-saved row: background read as the `--soft`
   selection tint (selection wins, as designed) while the accent inset
   box-shadow remained — selected + saved coexist without fighting. PASS.

No bugs found; no source files needed correction after the live pass.

## Commit
`Saved rows hold their moment: persistent accent + inviting categorize chip`
— pushed to `worktree-register-craft`. No PR opened.
