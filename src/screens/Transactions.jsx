// Transactions list screen — template 268-336, txScreenVals script 1018-1054.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.jsx';
import { DEFAULT_FILTERS, useTxView } from '../store/TxViewContext.jsx';
import { DEFAULT_SORT, isSortable, nextSortState, sortLabel } from '../lib/sortRows.js';
import SortIcon from '../ui/SortIcon.jsx';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useShortcuts, useSequence } from '../ui/useShortcuts.js';
import { SPEC, SHORTCUT_BY_ID, isTypingTarget } from '../lib/shortcuts.js';
import { stepCursor, rangeBetween, cursorStatusLabel } from '../lib/rowCursor.js';
import { useMoney } from '../lib/format.js';
import { nowIso, nowIsoSec } from '../lib/dates.js';
import { openingOf } from '../lib/calc.js';
import { useMonth } from '../store/MonthContext.jsx';
import { inRange, rangeFor, rangeLabel } from '../lib/dateRange.js';
import { selectionForSel } from '../lib/activityDrill.js';
import { instName, netTotal, schedNote, txGroups, withRunningBalances } from '../lib/txRow.js';
import { openers } from '../drawers/openers.js';
import TxChips, { NeedsCategoryPill } from '../ui/TxChips.jsx';
import { Chevron } from '../ui/icons.jsx';
import { advanceDue, effectiveNextDate, longDate, ruleFromTx } from '../lib/schedule.js';
import { deleteRule, deleteTransaction, deleteTransactions, duplicateTransactions, postTransactionNow, reorderTransaction, setTransactionsCategory, setTransactionsStatus, skipOccurrence } from '../store/actions.js';
import Checkbox from '../ui/Checkbox.jsx';
import BulkBar from '../ui/BulkBar.jsx';
import { dayGroups } from '../lib/dayGroups.js';
import PositionStrip from '../components/PositionStrip.jsx';
import RecentMoves from '../components/RecentMoves.jsx';
import TxSearchField from '../ui/tx/TxSearchField.jsx';
import { ToolbarAction, PlusCircle, UndoIcon, RedoIcon, SmsIcon, CameraIcon } from '../ui/ToolbarAction.jsx';
import { useAI } from '../ui/ai/useAI.js';
import { matchesSearch, searchSuggestions } from '../lib/txSearch.js';
import { useIsPhone } from '../lib/useIsPhone.js';
import { useContainerWidth } from '../lib/useContainerWidth.js';
import { visibleColumnKeys } from '../lib/registerColumns.js';
import { ScrollArea, ScrollAreaViewport, ScrollAreaContent, ScrollAreaScrollbar } from '../ui/primitives/ScrollArea.jsx';
import { needsCategoryBannerCount } from '../lib/needsCategoryBanner.js';
import TxPhoneList from '../components/TxPhoneList.jsx';
import CategoryPickerSheet from '../components/CategoryPickerSheet.jsx';
import CategoryPickerPopover from '../components/CategoryPickerPopover.jsx';
import TxEditorRow from '../ui/tx/inline/TxEditorRow.jsx';
import useTxDnd from '../ui/tx/useTxDnd.js';
import TxWhenPicker from '../ui/tx/TxWhenPicker.jsx';
import { useSuggestions } from '../ui/ai/useSuggestions.js';
import GraduationOffer from '../ui/ai/GraduationOffer.jsx';

// Sticky against <main>'s scroll. No overflow is introduced here — the section
// deliberately has none, because it would clip the per-row ⋯ menu. z-index sits
// below RowMenu's 30 so an open menu still passes over the header.
// borderRight draws the column dividers; the last header cell overrides it to
// none so the outer right edge stays open (the outer left has no border-left).
const th = { textAlign: 'left', fontSize: 12, fontWeight: 500, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--muted)', padding: '9px 8px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 2, background: 'var(--surface)' };
const td = { padding: '10px 8px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' };
const srOnly = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 };

// Row and GroupHead live at MODULE scope on purpose. Defined inside
// Transactions() they were rebuilt on every render, so React saw a new
// component *type* each time and unmounted/remounted every row. That destroyed
// and rebuilt the table on any state change — opening a row menu, typing in
// the search box, ticking a checkbox — which collapsed <main>'s scroll height
// and snapped it back to the top, taking the just-opened menu off screen.
//
// One row renderer for both groups. ruleRowOf returns a txRowOf-shaped object,
// so these cells never branch on which population they are drawing — the only
// differences are handed in: selId (rules have none, so no checkbox) and the
// action cell.
// The sortable data columns, in render order. Widths live here so <colgroup>
// and the cells cannot disagree; this array is also what a future
// drag-to-reorder stage would permute, instead of the markup.
// Order here MUST match the cell order in Row(): the header and colgroup are
// driven by this array while the body cells are laid out by hand, so the two
// line up only if they agree.
const COLUMNS = [
  { key: 'account', label: 'ACCOUNT', width: 150 },
  // 120, not 96: the editor's DATE field is a TYPED dd/mm/yyyy input, and at 96
  // the placeholder and a committed value both overflowed the input's content
  // box (scrollWidth > clientWidth), so the field clipped the year the moment
  // it was not focused. The column is sized for the widest thing it has to
  // hold, which is the editor's field, not the read-only "26 Aug" label.
  { key: 'date', label: 'DATE', width: 120 },
  // PAYEE, not DETAILS. The sort key stays `details` (SORT_COLUMNS, the header
  // altKeys, every stored sort) — only the printed label changes, so the column
  // is called the same thing here, in the editor's field, and in the product
  // doc. "Details" named a cell that holds exactly one thing: who was paid.
  { key: 'details', label: 'PAYEE', width: null },
  { key: 'category', label: 'CATEGORY', width: 190 },
  { key: 'notes', label: 'MEMO', width: 180 },
  // Two amount columns (YNAB). altKeys keep the toolbar's size/signed modes
  // lighting a header: both are magnitude-family sorts, closest to OUTFLOW.
  { key: 'outflow', label: 'OUTFLOW', width: 110, align: 'right', altKeys: ['size', 'signed'] },
  { key: 'inflow', label: 'INFLOW', width: 110, align: 'right' },
  // Running balance — a passbook column, so it closes the money run. Not
  // sortable (see SortableHeader's caller): its whole meaning is "the balance
  // after this row in date order", which any other sort destroys, so the
  // column withdraws instead of offering a sort that would lie. Conditions for
  // it appearing at all are in balanceEligible below.
  { key: 'balance', label: 'BALANCE', width: 120, align: 'right' },
  // Just a small one-letter badge, so the column is narrow and centred.
  { key: 'status', label: 'STATUS', width: 68, align: 'center' },
];

// Types that carry a category; transfers/adjustments never do.
const CAT_TYPES = ['expense', 'refund', 'income'];

// A sortable column header. The whole cell is the control, so the target is the
// full header height rather than the width of the label text.
function SortableHeader({ col, sort, onSort, last }) {
  const active = sort.key === col.key || (col.altKeys || []).includes(sort.key);
  // `signed` borrows the OUTFLOW header (altKeys) but ranks by effect on the
  // balance, so its stored direction is the OPPOSITE of what this column shows:
  // signed-ASC puts the most negative row on top, i.e. the LARGEST outflow —
  // which under this column's own vocabulary is descending. Showing the raw
  // dir here drew an ascending icon over a column reading largest-first.
  const shownDir = active && sort.key === 'signed'
    ? (sort.dir === 'asc' ? 'desc' : 'asc')
    : (active ? sort.dir : null);
  const dir = shownDir;
  const nextDir = nextSortState(sort, col.key).dir;
  const nextWord = {
    date: { asc: 'oldest first', desc: 'newest first' },
    details: { asc: 'A to Z', desc: 'Z to A' },
    category: { asc: 'A to Z', desc: 'Z to A' },
    account: { asc: 'A to Z', desc: 'Z to A' },
    notes: { asc: 'A to Z', desc: 'Z to A' },
    status: { asc: 'needs action first', desc: 'settled first' },
    outflow: { asc: 'smallest first', desc: 'largest first' },
    inflow: { asc: 'smallest first', desc: 'largest first' },
  }[col.key][nextDir];
  return (
    <th
      scope="col"
      aria-sort={active ? (shownDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      style={{ ...th, padding: 0, textAlign: col.align || 'left', ...(last ? { borderRight: 'none' } : null) }}
    >
      <button
        type="button"
        onClick={() => onSort(col.key)}
        // Label states the ACTION, not the state — a screen reader reads it
        // before activation, when what matters is what pressing it will do.
        // The resulting state is announced separately through the live region.
        aria-label={'Sort ' + col.label.toLowerCase() + ' ' + nextWord}
        // No hover fill on the column header — the pointer cursor and the sort
        // icon are the affordance; the tinted fill read as the column being
        // highlighted.
        style={{
          display: 'flex', alignItems: 'center', gap: 5, width: '100%',
          minHeight: 32, padding: '0 8px', whiteSpace: 'nowrap',
          justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start',
          border: 'none', background: 'none', font: 'inherit', cursor: 'pointer',
          letterSpacing: '0.6px',
          color: active ? 'var(--text)' : 'var(--muted)',
          fontWeight: active ? 600 : 500,
        }}
      >
        {col.align === 'right' && <SortIcon dir={dir} />}
        <span>{col.label}</span>
        {col.align !== 'right' && <SortIcon dir={dir} />}
      </button>
    </th>
  );
}


// A column with no sort of its own. BALANCE is the only one: it is derived
// from the date order, so there is nothing here to sort by — and a header that
// looked clickable and then reordered the rows into a column of meaningless
// running totals would be worse than no affordance at all. Plain text, no
// button, no aria-sort (the column is not a sort candidate, which "none"
// would wrongly imply).
function PlainHeader({ col, last }) {
  return (
    <th scope="col" style={{ ...th, padding: 0, textAlign: col.align || 'left', ...(last ? { borderRight: 'none' } : null) }}>
      {/* Same box as SortableHeader's button (32px, 0 8px, matching
          justification) so a non-sortable column does not make the header row
          taller than its sortable neighbours. */}
      <span style={{
        display: 'flex', alignItems: 'center', minHeight: 32, padding: '0 8px', whiteSpace: 'nowrap',
        justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start',
      }}>{col.label}</span>
    </th>
  );
}

// A transfer's acctLabel is 'Source → Dest'; a plain nowrap+ellipsis on the
// whole string truncates from the END, hiding the destination — the half
// that answers "where did this go", which matters more than the source (the
// row is already scoped near the source in most views). Rendered as two
// spans, BOTH individually truncatable (overflow hidden + ellipsis +
// minWidth 0) so nothing can paint past the cell into DATE/PAYEE.
//
// The shrink weights used to be wildly unequal (1000 : 1) so the SOURCE gave
// up its width first — which worked right up to the point where it gave up
// ALL of it: on a narrow container the source collapsed to ~1.8px, a stray
// ellipsis with no word left in it, which reads as damage rather than as
// truncation. Both halves now shrink on equal terms and are each capped at
// HALF the cell, so neither can eat the other: a long source ellipsizes at
// 50% and hands the rest to the destination, a short one takes only what it
// needs (no flex-grow, so nothing stretches into a gap before the arrow), and
// when both are long they truncate symmetrically. The outer span also clips as
// a backstop. Non-transfer rows have no acctTo and fall back to the single
// truncating span exactly as before.
const half = (fontSize, color) => ({
  minWidth: 0, maxWidth: '50%', flex: '0 1 auto',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize, color,
});
function AccountLabel({ t, fontSize, color }) {
  if (t.acctTo) {
    return (
      <span style={{ display: 'flex', minWidth: 0, maxWidth: '100%', overflow: 'hidden', alignItems: 'baseline' }}>
        <span style={half(fontSize, color)}>{t.acctFrom}</span>
        <span style={half(fontSize, color)}>{' → ' + t.acctTo}</span>
      </span>
    );
  }
  return <span style={{ display: 'block', maxWidth: '100%', fontSize, color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.acctLabel}</span>;
}

function Row({ t, selId, checked, onToggleRow, scheduled, hideAccount, hideMemo, showBalance, foldAccount, focused, onCategorize, flash, saved, suggestions, onApplySuggestion, dragProps, dropLine }) {
  // Fixed 2.25rem (36px) row height, YNAB-style — so the vertical padding is
  // zero and content is centred by the cells' middle alignment; horizontal
  // padding is all that remains.
  const pad = '0 12px';
  // The keyboard cursor scrolls itself into view when it lands on this row.
  const rowRef = useRef(null);
  useEffect(() => { if (focused) rowRef.current?.scrollIntoView({ block: 'nearest' }); }, [focused]);
  // A pending row dims to rowOpacity. That dim lives on the data cells, NOT the
  // <tr> — CSS opacity on the row would flatten its whole subtree into one
  // translucent group, and the RowMenu popover (absolutely positioned inside
  // the actions cell) would inherit it, rendering see-through over the rows it
  // drops onto. The actions cell is deliberately left un-dimmed so the menu
  // stays fully opaque. '1' is a no-op, so this is unconditional.
  const dim = { opacity: t.rowOpacity };
  return (
    <tr
      ref={rowRef}
      {...dragProps}
      // The whole row (except the ⋯ menu and the checkbox, which both
      // stopPropagation) is a click target that toggles selection — hence the
      // pointer cursor on any selectable row. The event flows through so a
      // shift+click can select a range instead of toggling one row.
      onClick={selId ? e => onToggleRow(selId, !checked, e) : undefined}
      // hv-elev's hover background is !important, so it beat the inline
      // --soft when checked — the selection highlight only appeared once the
      // cursor left. Dropping hv-elev while checked lets --soft show at once.
      // row-flash is additive: a just-touched row blinks whatever its state.
      // row-saved-wash (Wave D) holds a fainter version of that same wash after
      // the flash fades — see theme.css; harmless alongside row-flash (the
      // animation's !important background wins first, then hands off to this).
      className={['tx-row', checked ? null : 'hv-elev', flash ? 'row-flash' : null, saved ? 'row-saved-wash' : null,
        dropLine === 'above' ? 'tx-drop-above' : dropLine === 'below' ? 'tx-drop-below' : null].filter(Boolean).join(' ')}
      // Scheduled rows sit on a SUBTLE warm wash — the full --warn-soft (used on
      // the group heading) is too heavy per row, so blend it down into the
      // surface. Theme-adaptive, and a checked row's --soft still wins.
      // Wave D: data-saved-row marks this <tr> so the register's "clear on next
      // interaction outside the saved row" listener (Transactions.jsx) can tell
      // a click/keydown landing ON this row (e.g. its own Categorize? chip, or
      // selecting it) apart from one landing anywhere else — selecting a saved
      // row must not itself end its completion accent (selected + saved both
      // read at once; see the category cell and background below).
      // The scheduled wash is mixed further up in DARK (70% vs 40%): the dark
      // --warn-soft (#2E2412) and dark --surface (#161D1A) are both near-black,
      // so a 40% blend of one into the other moved the row by about 1% relative
      // luminance — a band that existed in the stylesheet and not on the
      // screen. 70% is still a wash rather than a fill, and a checked row's
      // --soft still wins over it. Light stays at 40%, where the difference was
      // already legible.
      style={{ height: '2.25rem', background: checked ? 'var(--soft)' : scheduled ? 'var(--sched-row)' : undefined, cursor: selId ? 'pointer' : undefined }}
      data-saved-row={saved || undefined}
    >
      {/* Padding moves onto the checkbox's own label so the whole cell, not
          just the 13px box, is the target. minWidth floors the column: the box
          has fixed geometry (18px inset + 13px), and without a floor the auto
          table-layout compresses this column on a narrow window until the box
          overflows into ACCOUNT. */}
      {/* The keyboard cursor shows as a left accent bar on this first cell — an
          inset box-shadow renders here (unlike on a <tr> under border-collapse)
          and reads on top of any row background, distinct from the checked fill.
          Wave D's saved-state rule is 1px narrower (2px vs 3px) so the two read
          as distinct on the rare row that is both the cursor and just-saved. */}
      <td style={{ ...td, ...dim, padding: 0, position: 'relative', verticalAlign: 'middle', minWidth: 34, boxShadow: [focused ? 'inset 3px 0 0 var(--accent)' : null, saved ? 'inset 2px 0 0 var(--accent)' : null, dropLine === 'above' ? 'inset 0 2px 0 var(--accent)' : dropLine === 'below' ? 'inset 0 -2px 0 var(--accent)' : null].filter(Boolean).join(', ') || undefined }}>
        {selId && (
          <Checkbox
            fill
            checked={checked}
            onChange={on => onToggleRow(selId, on)}
            // a11yName, not the printed merchant: a machine-written row with no
            // payee shows an em dash, and "Select — on 26 Aug" names nothing.
            label={'Select ' + (t.a11yName || t.merchant) + ' on ' + t.dateLabel}
          />
        )}
      </td>
      {!hideAccount && <td style={{ ...td, ...dim, maxWidth: 160, padding: pad, verticalAlign: 'middle' }}><AccountLabel t={t} fontSize={14} color="var(--text)" /></td>}
      <td style={{ ...td, ...dim, padding: pad, verticalAlign: 'middle' }}>
        {/* Date only — no clock time, no "in N days". Overdue rows carry the
            cue on the date itself, since the second line that held it is gone. */}
        <span className="tnum" style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', color: t.isOverdue ? 'var(--neg)' : undefined }}>{t.dateLabel}</span>
      </td>
      {/* minWidth 0 alongside the maxWidth: under table-layout:fixed the
          colgroup sets this column's width, and a min-width floor of
          "whatever the longest nickname measures" is exactly what used to
          push the table wider than its wrapper. */}
      <td style={{ ...td, ...dim, maxWidth: 280, minWidth: 0, padding: pad, verticalAlign: 'middle' }}>
        {/* overflow:hidden is the guard that keeps a long name or a full chip
            cluster from bleeding into CATEGORY now that table-layout:fixed pins
            this column: the merchant ellipsizes (minWidth:0) and the chips clip
            at the column edge rather than spilling past it. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
          <span style={{ fontSize: 14, fontWeight: 500, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.merchant}</span>
          <TxChips row={t} meta />
        </div>
        {/* ACCOUNT folds in here under ~900px container width (narrower than
            the ACCOUNT column itself can afford) instead of just vanishing —
            the row still says whose money this is, at a quieter weight. Not
            shown for an account-scoped register: there every row is already
            that one account, so a sub-label would be pure noise. */}
        {foldAccount && <AccountLabel t={t} fontSize={11.5} color="var(--muted)" />}
      </td>
      <td style={{ ...td, ...dim, maxWidth: 190, padding: pad, verticalAlign: 'middle' }}>
        {t.needsCategory
          // Wave D: while the row is still holding its saved-state accent, the
          // same CTA (opens the identical categorize flow) renders as an
          // inviting accent chip instead of the amber warning pill — the row
          // just finished being saved, and calling that a mistake mid-moment
          // reads as a scold. The instant the saved-state ends the amber pill
          // takes back over (same t.needsCategory, saved just goes false).
          ? <NeedsCategoryPill tone={saved ? 'accent' : 'warn'} onClick={onCategorize ? e => onCategorize(t.id, e?.currentTarget) : undefined}
              suggestions={suggestions} onApply={onApplySuggestion ? cid => onApplySuggestion(t.id, cid) : undefined} />
          : <span style={{ display: 'block', fontSize: 14, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.catName}</span>}
      </td>
      {/* Memo: adjustment reason and/or free-text note, truncated with an ellipsis and the full value on hover. Dropped under ~1000px container width. */}
      {!hideMemo && (
        <td style={{ ...td, ...dim, maxWidth: 200, padding: pad, verticalAlign: 'middle' }}>
          <span title={t.notes || undefined} style={{ display: 'block', fontSize: 14, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.notes}</span>
        </td>
      )}
      <td style={{ ...td, ...dim, padding: pad, textAlign: 'right', verticalAlign: 'middle' }}>
        <span className="tnum" style={{ fontSize: 14, fontWeight: 500, color: t.amtColor, whiteSpace: 'nowrap' }}>{t.outflowLabel}</span>
      </td>
      <td style={{ ...td, ...dim, padding: pad, textAlign: 'right', verticalAlign: 'middle' }}>
        <span className="tnum" style={{ fontSize: 14, fontWeight: 500, color: t.amtColor, whiteSpace: 'nowrap' }}>{t.inflowLabel}</span>
      </td>
      {/* Running balance. Deliberately the quietest number in the row: --muted
          and regular weight, so the eye still lands on OUTFLOW/INFLOW (what
          happened) and finds the balance only when it goes looking (where that
          left you). Blank on a scheduled row — nothing has moved yet, and a
          figure there would claim otherwise.
          NOT dimmed on an uncleared row (see `dim` above): --muted is already
          at the 4.96:1 floor, and .62 opacity dropped it to 2.43:1 — the row
          state must not be paid for out of the legibility of the number.
          An uncleared row steps the running balance by ZERO (withRunningBalances,
          matching accountBalance()), so the figure here would be a verbatim
          repeat of the row above — three identical numbers down a column read
          as an arithmetic error, not as "these don't count yet". An em dash
          says the true thing instead, and the title says why. The cleared math
          is untouched: the last cleared row still carries the figure the
          balance strip shows. */}
      {showBalance && (
        <td style={{ ...td, padding: pad, textAlign: 'right', verticalAlign: 'middle' }}>
          {t.isPending && !scheduled
            ? <span aria-hidden="true" title="Uncleared — not counted until cleared" style={{ fontSize: 13.5, color: 'var(--muted)' }}>—</span>
            : <span className="tnum" style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{t.balanceLabel || ''}</span>}
        </td>
      )}
      {/* No status badge on scheduled rows — the warm band and the SCHEDULED
          heading already say what they are, so only recorded rows show C.
          Un-dimmed for the same reason as BALANCE: the uncleared badge is
          drawn in --muted, and it is the one cell whose whole job is to
          report the state that would have dimmed it. */}
      <td style={{ ...td, padding: pad, textAlign: 'center', verticalAlign: 'middle' }}>
        {!scheduled && (
          <span
            role="img" aria-label={t.stLabel} title={t.stTitle || t.stLabel}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15, borderRadius: 999, boxSizing: 'border-box',
              background: t.stOutline ? 'transparent' : t.stColor,
              color: t.stOutline ? t.stColor : t.stOn,
              border: t.stOutline ? ('1.25px solid ' + t.stColor) : 'none',
              fontSize: 9, fontWeight: 700, lineHeight: 1, flex: 'none' }}
          >{t.stGlyph}</span>
        )}
      </td>
    </tr>
  );
}

// Group heading inside the table. A single full-width cell keeps the column
// grid intact — a separate table per group would let the two drift apart.
function GroupHead({ open, onToggle, label, count, note, bg, colSpan }) {
  return (
    <tr>
      {/* checkbox + data columns. Derived so adding a column can't leave it stale. */}
      <td colSpan={colSpan ?? (COLUMNS.length + 1)} style={{ padding: 0, borderBottom: '1px solid var(--border)', background: bg || 'var(--elev)' }}>
        <button
          onClick={onToggle} aria-expanded={open}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 18px', border: 'none', background: 'none', color: 'var(--text)', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}
        >
          {/* Drawn chevron, rotating between the two states — the ▾/▸ pair it
              replaces were two different glyphs at two different optical
              weights, so the band appeared to change more than its own
              open/closed state when you toggled it. */}
          <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', width: 10 }}>
            <Chevron dir={open ? 'down' : 'right'} />
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.05em' }}>{label}</span>
          {/* The subtitle sits on --warn-soft, where --muted measures 4.23:1 —
              under the 4.5:1 floor, and 11.5px is nowhere near large-text
              territory, so nothing exempts it. --text-toned (theme.css) is the
              muted-but-compliant tone: 5.11:1 light, 7.80:1 dark on this
              band. 12/600 as well, so the count still reads as secondary to
              the heading beside it without leaning on colour alone. */}
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-toned)' }}>{count}</span>
          {note && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-toned)' }}>· {note}</span>}
        </button>
      </td>
    </tr>
  );
}

// Lives in the list toolbar where the "Showing N of M" caption used to be.
// Reads as plain accent text at rest; on hover the inner pill fills into a
// solid accent button. Two layers: the OUTER button is a roomy, invisible hit
// area — its padding gives the extra clickable margin and an equal negative
// margin cancels it, so the toolbar layout never moves. The INNER pill is the
// only visible part; its hover padding grows by 8px each side, compensated by
// its own negative margin, so the label stays put (no jerk).
// Full-width toggle glyph: arrows pushing outward to the edges.
function WideIcon() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 8L3 12l5 4" /><path d="M16 8l5 4-5 4" /><path d="M3 12h18" />
    </svg>
  );
}

// Eye / eye-off pair for the masked-mode toggle — same drawn paths as
// PositionStrip's eye (the maskedPosition toggle), so the two icons read as
// one glyph everywhere in the app. Open eye = amounts showing; the crossed
// eye reflects the CURRENT state (amounts hidden), while the label/tooltip
// name the next action, matching PositionStrip's convention.
function EyeIcon() {
  return (
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
      <path d="M2 12s3.5-7.5 10-7.5S22 12 22 12s-3.5 7.5-10 7.5S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
      <path d="M17.94 17.94A10.4 10.4 0 0 1 12 19.5C5.5 19.5 2 12 2 12a19.8 19.8 0 0 1 4.87-5.62M9.9 4.75A9.9 9.9 0 0 1 12 4.5c6.5 0 10 7.5 10 7.5a19.9 19.9 0 0 1-2.24 3.31M14.12 14.12a3 3 0 1 1-4.24-4.24" /><path d="M2 2l20 20" />
    </svg>
  );
}

export default function Transactions() {
  const { data: S, applyData, prefs, setPrefs, undo, redo, canUndo, canRedo, undoLabel, redoLabel } = useStore();
  // Full-width view: lifts the page's max-width and drops the table's card frame
  // so the rows use all the space available. On by default; the toggle only
  // stores an explicit `false` to opt back into the narrow, boxed layout.
  const wide = prefs.wide !== false;
  const phone = useIsPhone();
  // Phone always uses the flush, full-width layout — the boxed 1180px card
  // frame is a desktop choice; the wide pref stays desktop-only.
  const flush = wide || phone;
  // Real content width of the table wrapper (not the viewport) — the same
  // container-query convention as .dash-cols/.plan-grid, resolved in JS here
  // since COLUMNS drives <colgroup>/header/cells from one array (see below).
  const tableWrapRef = useRef(null);
  const containerWidth = useContainerWidth(tableWrapRef);
  const { ask, notify, confirmOpen, shortcutsOpen, flashRows, flashIds, lastSaved, clearLastSaved } = useUI();
  // The month the balance strip reads (PositionStrip is month-scoped, never
  // range-scoped, because opening snapshots exist per month). The running
  // balance column seeds off the same month's snapshot, so the two agree.
  const { balanceMonth } = useMonth();
  const fmt = useMoney();
  const { enabled: aiEnabled } = useAI();
  const { openDrawer, drawer } = useDrawer();
  // The inline editor session (desktop only — phone renders TxSheet instead).
  const inlineTx = !phone && drawer?.name === 'addTx' ? drawer : null;
  const editingId = inlineTx ? inlineTx.form.editId : null;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchRef = useRef(null);
  // Optional per-account scope: /transactions/:accountId shows one account's
  // ledger. An unknown id falls back to the whole All-Accounts view.
  const { accountId } = useParams();
  const acct = accountId ? S.accounts.find(a => a.id === accountId) : null;
  useEffect(() => { if (accountId && !acct) navigate('/transactions', { replace: true }); }, [accountId, acct, navigate]);
  // The view itself lives above the router (TxViewContext) so leaving this
  // screen and coming back does not reset it. Everything below is genuinely
  // per-visit: a selection, an open popover, an open row menu.
  const {
    filters: F, setFilters, sort, setSort, range, setRange,
    schedOpen, setSchedOpen, resetView,
    phoneSelect, setPhoneSelect,
  } = useTxView();
  // Focus stays on the header after sorting (React keeps the node, since
  // SortableHeader is a stable module-scope type), so the result is announced
  // through a live region rather than by moving focus.
  const onSort = key => setSort(s => nextSortState(s, key));
  // Ids, not rows: a row object goes stale the moment anything re-renders.
  const [selected, setSelected] = useState(() => new Set());
  // Keyboard cursor over the recorded rows: a highlight (cursorId) that moves
  // independently of selection, and the anchor a range extends from.
  const [cursorId, setCursorId] = useState(null);
  const [anchorId, setAnchorId] = useState(null);
  // Scheduled rows have their own selection (keyed by row key — a tx id for a
  // future-dated row, 'rule:…' for a reminder), because their actions differ
  // from a recorded row's. The two selections are mutually exclusive so only one
  // bulk bar is ever up.
  const [schedSel, setSchedSel] = useState(() => new Set());

  // Phone chrome state. phoneSelect lives in TxViewContext (AddTxPill hides on
  // it); everything else is per-visit.
  // Search row shown? F.q and F.term both live in TxViewContext and survive
  // navigation, so a query OR an applied facet left active must arrive with its
  // row VISIBLE — a collapsed row over a persisting filter would silently
  // narrow the list with no cue on screen.
  const [phoneQOpen, setPhoneQOpen] = useState(() => F.q !== '' || !!F.term);
  const [phoneMoreOpen, setPhoneMoreOpen] = useState(false); // select-mode ⋯ sheet
  const [pickerOpen, setPickerOpen] = useState(false);   // category picker sheet (phone bulk Categorize…)
  // Desktop bulk Categorize opens an anchored popover instead of the sheet; the
  // anchor is the Categorize button the click came from.
  const [catBulkOpen, setCatBulkOpen] = useState(false);
  const [catBulkAnchor, setCatBulkAnchor] = useState(null);
  // Single-row categorize: the row pill's CTA. Holds the tx id; shares the
  // mounted CategoryPickerSheet with the bulk flow (bulk wins if both somehow set).
  const [catTarget, setCatTarget] = useState(null);
  // The element the needs-category pill click came from. With an anchor the
  // single-row pick renders as a popover on it (web); without one (phone list
  // passes no element) it falls back to the sheet.
  const [catAnchor, setCatAnchor] = useState(null);
  const openRowCategorize = (id, el) => {
    // Desktop: the needs-category pill opens the same inline editor as a
    // second click, rather than a standalone category popover — the editor
    // has a category field, so a separate popover is redundant. Phone keeps
    // the sheet (no inline editor there).
    if (!phone) { openers.editTx(S, id, openDrawer); return; }
    setCatTarget(id); setCatAnchor(el || null);
  };
  // Banner filters are phone-local view state, not TxView filters.
  const [listFilter, setListFilter] = useState('all'); // 'all' | 'uncleared' | 'needsCat' — phone banners + the desktop needs-category banner share it

  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  // Search box handlers. Typing always returns to free-text mode (clears any
  // applied facet); picking a suggestion applies its structured term and blanks
  // the text; clearing resets both. One structured term is active at a time.
  const onSearchQuery = v => setFilters(f => ({ ...f, q: v, term: null }));
  const onSearchPick = term => setFilters(f => ({ ...f, term, q: '' }));
  const clearSearch = () => setFilters(f => ({ ...f, q: '', term: null }));
  // Suggestions are computed only in free-text mode (no active term). A bare
  // day resolves within the viewed month, so date facets land where the
  // register is looking. `range.from` is NOT always 'YYYY-MM' — it is a full
  // day for Today/Yesterday and null for All Dates — so take its month, falling
  // back to the balance month (the strip's month) when the range is unbounded.
  const searchAnchor = (range.from || balanceMonth).slice(0, 7) + '-15';
  const suggestions = useMemo(
    () => (F.term ? [] : searchSuggestions(F.q, S, searchAnchor)),
    [F.term, F.q, S, searchAnchor],
  );
  const reset = () => resetView();

  const monthTx = S.transactions.filter(t => inRange(t, range.from, range.to)
    && (!accountId || t.accountId === accountId || t.toAccountId === accountId));
  // Search is the only filter here now — either free text over merchant, notes,
  // category and every account/card the row touches, or the one structured
  // facet a picked suggestion applied (matchesSearch). The other filters are
  // each moving to the screen that owns the question.
  const list = monthTx.filter(t => matchesSearch(t, { q: F.q, term: F.term }, S, accountId));

  // Scheduled and recorded are two populations, not one list — txGroups holds
  // the rules for which row lands where, and is tested there.
  const now = nowIso();
  const anyFilter = Object.keys(DEFAULT_FILTERS).some(k => F[k] !== DEFAULT_FILTERS[k]);
  const { scheduled, postedRows, postedTx, overdueCount, hiddenRuleCount } = txGroups(list, S, fmt, now, range, anyFilter, sort, accountId);

  // Phone banner populations, derived from the recorded rows on screen.
  const needsCat = useMemo(
    () => new Set(postedTx.filter(t => CAT_TYPES.includes(t.type) && !t.category).map(t => t.id)),
    [postedTx],
  );
  const unclearedIds = useMemo(
    () => new Set(postedTx.filter(t => t.status === 'pending').map(t => t.id)),
    [postedTx],
  );
  const shownRows = listFilter === 'uncleared' ? postedRows.filter(r => unclearedIds.has(r.id))
    : listFilter === 'needsCat' ? postedRows.filter(r => needsCat.has(r.id))
    : postedRows;
  const groups = dayGroups(shownRows, sort.key, now);
  // A banner filter whose population empties (everything cleared/categorized)
  // would strand an empty list with no reset control — the banner is the only
  // way back to 'all' and it disappears with the population. Fall back here.
  useEffect(() => {
    if ((listFilter === 'uncleared' && unclearedIds.size === 0)
      || (listFilter === 'needsCat' && needsCat.size === 0)) setListFilter('all');
  }, [listFilter, unclearedIds, needsCat]);

  // Wave D: the desktop banner below must not visibly increment for a row
  // that's still showing its own accent "Categorize?" chip (see Row) — that
  // would read as the save itself creating a new mistake. needsCat itself is
  // left alone (it also drives the phone review banner and the 'needsCat'
  // list filter, neither in this wave's scope) — only the desktop banner's
  // count is threaded through the exclusion.
  const bannerNeedsCatCount = needsCategoryBannerCount(needsCat, lastSaved);

  // Wave D: a saved row holds its completion accent until the NEXT user
  // interaction. Defined as a pointerdown/keydown anywhere on this screen
  // OUTSIDE the saved row itself (data-saved-row, set by Row) — so selecting
  // the just-saved row, or clicking its own Categorize? chip, doesn't end its
  // own moment, but touching anything else does. A later save supersedes this
  // outright (flashRows replaces lastSaved), so this only needs to handle the
  // "nothing else happened" case.
  useEffect(() => {
    if (lastSaved.size === 0) return;
    const onInteract = e => {
      if (e.target?.closest?.('[data-saved-row]')) return;
      clearLastSaved();
    };
    document.addEventListener('pointerdown', onInteract);
    document.addEventListener('keydown', onInteract);
    return () => {
      document.removeEventListener('pointerdown', onInteract);
      document.removeEventListener('keydown', onInteract);
    };
  }, [lastSaved, clearLastSaved]);

  // Hide the ACCOUNT column on a single-account ledger — every row is that
  // account — and fold ACCOUNT/MEMO by measured container width (registerColumns.js,
  // same thresholds the pure visibleColumns() helper is tested against).
  // Header, colgroup, Row cells and the group-heading colSpan all read from
  // `columns` / `gridColSpan` so they can never drift.
  //
  // BALANCE is gated on TRUTH before width. A running balance is only honest
  // when the last one printed equals the figure in the strip above it, and
  // that holds under exactly four conditions:
  //   * account-scoped — "the balance" needs an account to be the balance OF;
  //   * sorted by date (either direction) — the column IS the date order;
  //   * the range is exactly the month the strip reads, because the opening
  //     snapshot that seeds the walk is a per-month figure. A three-month or
  //     All-Dates range has no opening balance to start from;
  //   * nothing is filtering rows out — a cumulative that skips the rows a
  //     search hid is not a balance, it is a subtotal wearing one's clothes.
  // Fail any of them and the column withdraws rather than print a number the
  // strip would contradict. (The arithmetic itself, and the check against
  // accountBalance(), live in txRow.balance.test.js.)
  const rangeIsBalanceMonth = range.from === balanceMonth && range.to === balanceMonth;
  // `acct`, not `accountId`: a stale/deleted id redirects on the next effect,
  // but this render still has to survive it, and there is no opening snapshot
  // to seed from without an account.
  const balanceEligible = !!acct && sort.key === 'date' && rangeIsBalanceMonth
    && !F.q && !F.term && listFilter === 'all';
  const visibleKeys = useMemo(
    () => visibleColumnKeys(COLUMNS, containerWidth, !!accountId, balanceEligible),
    [containerWidth, accountId, balanceEligible],
  );
  const columns = useMemo(() => COLUMNS.filter(c => visibleKeys.has(c.key)), [visibleKeys]);
  const gridColSpan = columns.length + 1;
  const hideAccountCol = !visibleKeys.has('account');
  const hideMemoCol = !visibleKeys.has('notes');
  const showBalanceCol = visibleKeys.has('balance');
  // Rows as RENDERED, with the balance walked over them. `money` (not moneyPos)
  // — this is a row figure like OUTFLOW/INFLOW, so it follows the app-wide
  // "Hide amounts" toggle, which is also what the register's own eye drives.
  const tableRows = useMemo(
    () => (showBalanceCol
      ? withRunningBalances(shownRows, openingOf(acct, S.snapshots, balanceMonth), sort.dir, fmt.money)
      : shownRows),
    [showBalanceCol, shownRows, acct, S.snapshots, balanceMonth, sort.dir, fmt.money],
  );
  // Only fold the account name into the PAYEE sub-label when it's the
  // *width* that dropped the column — an account-scoped register already
  // omits it deliberately (every row is that one account already) and a
  // repeated sub-label there would be pure noise.
  const foldAccount = hideAccountCol && !accountId;

  // Drag-to-reorder (desktop register). Reorder writes the dropped row's
  // timestamp — order IS the date — so it only makes sense in the natural
  // date-descending order; any other sort or the phone list opts out. The
  // picker opens when a moment can't be honestly interpolated (see planDrop).
  const [reorderPicker, setReorderPicker] = useState(null);
  const reorderable = !phone && sort.key === 'date' && sort.dir === 'desc';
  // When the register is scoped to a past date/month, `now` is outside the view,
  // so a top-of-list drop must anchor to that date's latest moment instead of
  // the real clock — otherwise the row would jump to today and vanish from view.
  const nowInView = inRange({ date: now }, range.from, range.to);
  const dnd = useTxDnd({
    rows: tableRows,
    enabled: reorderable,
    applyData,
    nowInView,
    openPicker: setReorderPicker,
    notify,
  });

  // Selection is pruned to what is currently visible. Keeping ids that a filter
  // has hidden would let the toolbar claim "12 selected" while showing three,
  // and then act on all twelve. Recorded rows are always shown — there is no
  // recorded heading to collapse them under (the scheduled band separates the
  // two on its own), so every recorded id is selectable.
  const grouped = scheduled.length > 0;
  // Filtered view: ranges, select-all and the keyboard cursor must only ever
  // touch rows that are actually rendered.
  const visibleIds = shownRows.map(r => r.id);
  const sel = visibleIds.filter(id => selected.has(id));
  const allVisibleSelected = sel.length > 0 && sel.length === visibleIds.length;
  const clearSel = () => setSelected(new Set());
  const clearSched = () => setSchedSel(new Set());
  const exitSelect = () => { setPhoneSelect(false); setPhoneMoreOpen(false); setPickerOpen(false); setCatBulkOpen(false); clearSel(); clearSched(); };
  useEffect(() => () => setPhoneSelect(false), [setPhoneSelect]); // leave mode on unmount
  // Switching ledgers reuses this mounted component (only :accountId changes),
  // so account A's banner filter and Select mode would carry onto account B.
  // Running on first mount too is a harmless no-op.
  useEffect(() => { setListFilter('all'); exitSelect(); }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Deep-link from the Activity modal (and anywhere else): ?sel=<txId> lands here
  // to check that one row, scroll to it, and raise the desktop bulk bar — YNAB's
  // "open the register on this transaction". One-shot: consume the param and clear
  // it so a reload starts clean and a later deselect is not undone on re-render.
  // selectionForSel does the pure decision (found? widen the range?); a missing id
  // (deleted/stale link) is a deliberate silent no-op.
  const selParam = searchParams.get('sel');
  useEffect(() => {
    const target = selectionForSel(S.transactions, selParam, range);
    if (!target) return;
    setSearchParams(prev => { const p = new URLSearchParams(prev); p.delete('sel'); return p; }, { replace: true });
    if (!target.found) return;
    if (target.range) setRange(target.range);  // widen the date window to reveal the row
    setFilters(f => (f.q || f.term ? { ...f, q: '', term: null } : f)); // a stale search would filter the target out
    setListFilter('all');       // clear any banner (uncleared/needsCat) that could hide the target
    setSchedSel(new Set());     // recorded/scheduled selections are mutually exclusive
    setSelected(new Set([target.id]));
    setCursorId(target.id);     // reuses the cursor's scrollIntoView to bring it on screen
  }, [selParam]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleRow = (id, on, e) => {
    setCursorId(id);
    setSchedSel(new Set()); // mutual exclusion with the scheduled selection
    // Shift+click selects the contiguous range from the anchor to here (rather
    // than toggling one row); the anchor stays put so the range can grow.
    if (e && e.shiftKey) {
      e.preventDefault();
      setSelected(new Set(rangeBetween(visibleIds, anchorId ?? id, id)));
      return;
    }
    // YNAB edit gesture: the row is already the sole selection and is clicked
    // plainly again → open it in the inline editor instead of deselecting.
    // (Desktop only; phone taps already edit via TxSheet. cardAdjustment rows
    // are refused by openers.editTx itself.)
    if (!phone && e && !e.shiftKey && !e.metaKey && !e.ctrlKey
      && selected.size === 1 && selected.has(id)) {
      openers.editTx(S, id, openDrawer);
      return;
    }
    setAnchorId(id);
    // The checkbox (no event), Ctrl/Cmd+click, and Space add to / remove from
    // the selection. A plain row-body click selects only that row (clearing the
    // rest), or clears it when it is already the sole selection.
    const additive = !e || e.metaKey || e.ctrlKey;
    if (additive) {
      setSelected(prev => {
        const next = new Set(prev);
        const shouldSelect = e ? !next.has(id) : on;
        if (shouldSelect) next.add(id); else next.delete(id);
        return next;
      });
      return;
    }
    setSelected(prev => (prev.size === 1 && prev.has(id)) ? new Set() : new Set([id]));
  };
  const toggleAll = on => { setSchedSel(new Set()); setSelected(on ? new Set(visibleIds) : new Set()); };
  const toggleSched = (key, on, e) => {
    // Same YNAB edit gesture as toggleRow: a plain second click on the sole
    // scheduled selection opens the editor instead of deselecting. Guarded on
    // `e` (absent from the checkbox's onChange) and modifier keys so the
    // checkbox and ⌘/Ctrl+click still deselect. 'rule:' keys have no tx to
    // edit — skip them.
    if (!phone && e && !e.shiftKey && !e.metaKey && !e.ctrlKey
      && schedSel.size === 1 && schedSel.has(key) && !String(key).startsWith('rule:')) {
      openers.editTx(S, key, openDrawer);
      return;
    }
    setSelected(new Set()); // mutual exclusion with the recorded selection
    setSchedSel(prev => {
      const next = new Set(prev);
      if (on) next.add(key) ; else next.delete(key);
      return next;
    });
  };
  const schedKey = x => x.selId || x.row.key;
  const selSched = scheduled.filter(x => schedSel.has(schedKey(x)));

  // Escape clears whichever selection is active. Bubble phase, so the range
  // popover — which stops propagation — keeps its own Escape.
  useEffect(() => {
    if (sel.length === 0 && schedSel.size === 0) return;
    const onKey = e => { if (e.key === 'Escape') { clearSel(); clearSched(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sel.length, schedSel.size]);

  const askSkip = async row => {
    const r = S.recurring.find(x => x.id === row.ruleId);
    if (!r) return;
    const nd = effectiveNextDate(r) || r.nextDate;
    const after = advanceDue(r.schedule, nd);
    const ok = await ask({
      title: 'Skip this one?',
      body: 'Nothing is recorded for ' + longDate(nd, now) + '. “' + r.name + '” moves on to ' + longDate(after, now) + '.',
      action: 'Skip this one',
      tone: 'accent',
    });
    if (!ok) return;
    applyData(data => skipOccurrence(data, { id: r.id, due: nd }));
    notify('Skipped — nothing recorded. Next due ' + longDate(after, now) + '.');
  };

  const askPostNow = async row => {
    const ok = await ask({
      title: 'Move this to today?',
      body: '“' + row.merchant + '” is dated ' + row.dateLabel + '. Posting it now re-dates it to today, so it counts in your balance straight away.',
      action: 'Post now',
      tone: 'accent',
    });
    if (!ok) return;
    applyData(data => postTransactionNow(data, { id: row.id, now: nowIso() }));
    notify('Posted — dated today and counted.');
  };

  // Mirrors the Recurring screen's wording: deleting a rule stops the reminders
  // and leaves every transaction it has already created untouched.
  const askDeleteRule = async row => {
    const r = S.recurring.find(x => x.id === row.ruleId);
    if (!r) return;
    const n = (r.occurrences || []).filter(o => o.outcome === 'recorded').length;
    const ok = await ask({
      title: 'Delete this rule?',
      body: '“' + r.name + '” stops reminding you. ' + (n > 0
        ? 'The ' + n + ' transaction' + (n === 1 ? '' : 's') + ' it already created stay exactly as they are.'
        : 'It has not created any transactions.'),
      action: 'Delete rule',
    });
    if (!ok) return;
    applyData(data => deleteRule(data, { id: r.id }));
    notify('Rule deleted.');
  };

  const askDeleteTx = async row => {
    const ok = await ask({
      title: 'Delete this transaction?',
      // A row still dated ahead is counted by nothing yet, so promising that
      // balances will change would be untrue.
      body: row.isFuture
        ? '“' + row.merchant + '” is dated ' + row.dateLabel + ' and is not counted in any balance yet, so nothing recalculates. This cannot be undone.'
        : '“' + row.merchant + '” is removed from every balance and total that counted it. This cannot be undone.',
      action: 'Delete',
    });
    if (!ok) return;
    applyData(data => deleteTransaction(data, { id: row.id }));
    notify('Deleted.');
  };

  // A transaction's relationship to a series, as one menu item. Either it can
  // still become one, or it already belongs to one — and in that case the row
  // says so with the ⟳ icon, so the menu should explain rather than just go
  // quiet: View rule jumps to the rule behind it.
  const seriesItem = (txId, canRepeat) => {
    const r = ruleFromTx(S, txId);
    if (r) return { label: 'View rule', onClick: () => navigate('/recurring/' + r.id) };
    return canRepeat && { label: 'Make repeating', onClick: () => openers.makeRepeating(S, txId, openDrawer) };
  };

  const afterBulk = (msg, next) => { applyData(next); clearSel(); notify(msg); };
  // The stored value is 'pending'; the word shown to the user is "uncleared".
  const statusWord = status => (status === 'pending' ? 'uncleared' : status);
  const bulkStatus = status => afterBulk(
    'Marked ' + sel.length + ' as ' + statusWord(status) + '.',
    data => setTransactionsStatus(data, { ids: sel, status }),
  );
  const bulkDelete = async () => {
    const ok = await ask({
      title: 'Delete ' + sel.length + ' transaction' + (sel.length === 1 ? '' : 's') + '?',
      body: 'They are removed from every balance and total that counted them. This cannot be undone.',
      action: 'Delete ' + sel.length,
    });
    if (!ok) return;
    afterBulk('Deleted ' + sel.length + '.', data => deleteTransactions(data, { ids: sel }));
  };
  const bulkDuplicate = () => afterBulk(
    'Duplicated ' + sel.length + ' transaction' + (sel.length === 1 ? '' : 's') + '.',
    data => duplicateTransactions(data, { ids: sel }),
  );
  // Categorize applies one category to every selected row the action will
  // actually accept. The picker lists only EXPENSE categories, and
  // setTransactionsCategory (actions.js) refuses a type mismatch —
  // `(t.type === 'income') === (cat.type === 'income')` — so with an expense
  // category an income row is refused exactly like a transfer or adjustment.
  // Mirror that rule here: only expense/refund rows go into `ids`, everything
  // else is counted as skipped, so the toast can never claim a row it left
  // unchanged. (A row already carrying the picked category still counts as
  // categorized — it ends in the state the user asked for.)
  // The row pill's CTA: assign the picked category to that one transaction.
  const categorizeOne = categoryId => {
    const id = catTarget;
    setCatTarget(null);
    if (!id) return;
    applyData(data => setTransactionsCategory(data, { ids: [id], categoryId }));
    flashRows([id]);
  };

  // U1 auto-categorize: the debounced batch + cache + graduation for the visible
  // needs-category rows. Empty (no chips, no offer) whenever AI is off / history
  // is low / the batch fails, so the register reads exactly as pre-AI.
  const { suggestions: aiSuggestions, recordAccept: recordAiAccept, offer: gradOffer, acceptOffer: acceptGradOffer, dismissOffer: dismissGradOffer } = useSuggestions(needsCat);
  // Chip tap: the SAME write as categorizeOne (the only category write path),
  // plus the graduation counter. Applied directly since we already hold the id.
  const applySuggestion = (txId, categoryId) => {
    applyData(data => setTransactionsCategory(data, { ids: [txId], categoryId }));
    flashRows([txId]);
    recordAiAccept(txId, categoryId);
  };

  const bulkCategorize = categoryId => {
    const canTakeExpenseCat = t => t.type === 'expense' || t.type === 'refund';
    const ids = sel.filter(id => { const t = S.transactions.find(x => x.id === id); return t && canTakeExpenseCat(t); });
    const skippedIds = sel.filter(id => !ids.includes(id));
    setPickerOpen(false);
    if (ids.length === 0) { notify('Nothing categorized — none of the selected can take an expense category.'); return; }
    // Blink the categorized rows instead of a "Categorized N" toast. A partial
    // skip is still a warning worth surfacing, so that keeps a (minimal) toast —
    // named, not just counted, so the skip is actually actionable (which rows
    // to go fix by hand) instead of a bare "3 skipped" the user has to hunt for.
    applyData(data => setTransactionsCategory(data, { ids, categoryId }));
    clearSel();
    flashRows(ids);
    if (skippedIds.length) {
      const names = skippedIds.map(id => {
        const t = S.transactions.find(x => x.id === id);
        return t ? (t.merchant || (t.type === 'transfer' ? 'Own-account transfer' : 'Uncategorized')) : 'that item';
      });
      const shown = names.slice(0, 2).join(', ') + (names.length > 2 ? ', +' + (names.length - 2) + ' more' : '');
      notify('Skipped ' + skippedIds.length + ' (' + shown + ') that can’t take an expense category.');
    }
  };
  // The cleared toggle the ⓒ action uses — same rule as the keyboard shortcut.
  // Adaptive so the action is never pointless: on an all-cleared selection it
  // unclears; otherwise it clears.
  const allSelCleared = sel.length > 0 && sel.every(id => S.transactions.find(t => t.id === id)?.status === 'cleared');
  const bulkToggleCleared = () => bulkStatus(allSelCleared ? 'pending' : 'cleared');
  // "Make repeating" only makes sense one row at a time — the drawer configures
  // a single schedule. Shown for a lone selection, and it reuses seriesItem so
  // an already-repeating row offers "View rule" instead. Clearing the selection
  // first lets the drawer own the screen.
  const singleRepeatItem = () => {
    if (sel.length !== 1) return null;
    const t = S.transactions.find(x => x.id === sel[0]);
    if (!t) return null;
    const item = seriesItem(t.id, t.type === 'expense' || t.type === 'income');
    if (!item) return null;
    return { label: item.label, icon: 'repeat', onClick: () => { clearSel(); item.onClick(); }, keys: SHORTCUT_BY_ID.makeRepeating.keys };
  };
  // Editing is a one-row action, so it appears in the bulk menu only for a lone
  // selection — the same rule as Make repeating. Card corrections cannot be
  // edited (canEdit is false for them).
  const singleEditItem = () => {
    if (sel.length !== 1) return null;
    const t = S.transactions.find(x => x.id === sel[0]);
    if (!t || t.type === 'cardAdjustment') return null;
    return { label: 'Edit', icon: 'edit', onClick: () => { const id = t.id; clearSel(); openers.editTx(S, id, openDrawer); }, keys: SHORTCUT_BY_ID.editSelected.keys };
  };

  // Scheduled bulk actions. A reminder and a future-dated transaction have
  // different verbs, and most are one-row (open a drawer, navigate), so the full
  // set shows only for a lone selection; a multi-select offers just Delete,
  // which spans both kinds. Each item clears the selection, then runs the same
  // handler the ⋯ menu used to call.
  const schedBulkDelete = async () => {
    const ok = await ask({
      title: 'Delete ' + selSched.length + ' scheduled item' + (selSched.length === 1 ? '' : 's') + '?',
      body: 'Reminders stop and any dated-ahead transactions are removed. This cannot be undone.',
      action: 'Delete ' + selSched.length,
    });
    if (!ok) return;
    applyData(data => selSched.reduce((d, x) => (x.row.isRule
      ? deleteRule(d, { id: x.row.ruleId })
      : deleteTransaction(d, { id: x.selId })), data));
    clearSched();
    notify('Deleted ' + selSched.length + '.');
  };
  const schedMore = () => {
    if (selSched.length !== 1) return [{ label: 'Delete ' + selSched.length, tone: 'neg', onClick: schedBulkDelete }];
    const x = selSched[0];
    const run = fn => () => { clearSched(); fn(); };
    if (x.row.isRule) {
      return [
        { label: 'Record…', onClick: run(() => openers.recordRule(S, x.row.ruleId, openDrawer)) },
        { label: 'Skip this one', onClick: run(() => askSkip(x.row)) },
        { label: 'View rule', onClick: run(() => navigate('/recurring/' + x.row.ruleId)) },
        { divider: true },
        { label: 'Delete rule', tone: 'neg', onClick: run(() => askDeleteRule(x.row)) },
      ];
    }
    const series = seriesItem(x.selId, x.row.canRepeat);
    return [
      { label: 'Post now', onClick: run(() => askPostNow(x.row)), keys: SHORTCUT_BY_ID.enterNow.keys },
      x.row.canEdit && { label: 'Edit', icon: 'edit', onClick: run(() => openers.editTx(S, x.selId, openDrawer)) },
      series && { label: series.label, icon: 'repeat', onClick: run(series.onClick) },
      { divider: true },
      { label: 'Delete', icon: 'delete', tone: 'neg', onClick: run(() => askDeleteTx(x.row)) },
    ];
  };

  const addDisabled = S.accounts.filter(a => a.status === 'active').length === 0;

  // Signed sum of the current selection (YNAB's "Selected Total"), shown in
  // the bulk bar, the phone pill, and the position strip's trailing slot.
  // netTotal sums the DISPLAYED outflow/inflow sides, not amtValue — the old
  // amtValue reduce counted a transfer positively even though the register
  // shows it in the OUTFLOW column. Summed over shownRows (not postedRows,
  // as before): `sel` and every visible count come from shownRows, so a row
  // hidden by the banner list-filter but lingering in the selection Set no
  // longer counts toward a total whose stated (N) excludes it.
  const selectedTotal = netTotal(shownRows.filter(r => selected.has(r.id)));
  const schedSelectedTotal = netTotal(selSched.map(x => x.row));

  // Keyboard shortcuts for the register. Each reuses the function that already
  // backs the bulk bar; preconditions (`when`) make an unmet key a silent no-op.
  const txShortcuts = [
    { spec: SPEC.selectAll, run: () => toggleAll(true) },
    { spec: SPEC.focusSearch, run: () => searchRef.current?.focus() },
    { spec: SPEC.toggleCleared, when: () => sel.length > 0, run: () => {
        const rows = sel.map(id => S.transactions.find(t => t.id === id)).filter(Boolean);
        const allCleared = rows.length > 0 && rows.every(t => t.status === 'cleared');
        bulkStatus(allCleared ? 'pending' : 'cleared');
      } },
    { spec: SPEC.duplicate, when: () => sel.length > 0, run: bulkDuplicate },
    { spec: SPEC.delete, when: () => sel.length > 0, run: bulkDelete },
    { spec: SPEC.makeRepeating, when: () => singleRepeatItem() != null, run: () => singleRepeatItem().onClick() },
    { spec: SPEC.enterNow, when: () => selSched.length === 1 && !selSched[0].row.isRule, run: () => { const x = selSched[0]; clearSched(); askPostNow(x.row); } },
    // Shift+E edits the selected row when exactly one editable row is selected;
    // otherwise it reconciles the account (only meaningful on an account ledger).
    { spec: SPEC.reconcile, when: () => singleEditItem() != null || !!acct, run: () => {
        const edit = singleEditItem();
        if (edit) edit.onClick(); else openers.reconcile(S, accountId, openDrawer);
      } },
  ];
  useShortcuts(txShortcuts, !drawer && !confirmOpen && !shortcutsOpen);
  // V-then-key sets the date-range view (the presets from the View Options popover).
  const viewSeq = [
    { seq: SPEC.viewToday.seq, run: () => setRange(rangeFor('today')) },
    { seq: SPEC.viewYesterday.seq, run: () => setRange(rangeFor('yesterday')) },
    { seq: SPEC.viewMonth.seq, run: () => setRange(rangeFor('month')) },
    { seq: SPEC.viewAll.seq, run: () => setRange(rangeFor('all')) },
  ];
  useSequence(viewSeq, !drawer && !confirmOpen && !shortcutsOpen);

  // Keyboard row cursor over the recorded rows. Arrow moves the highlight,
  // Space toggles it, Shift+Arrow extends the selection from the anchor. A ref
  // holds the latest state so the listener reads current values without being
  // re-subscribed every render (same pattern as useShortcuts).
  const navEnabled = !drawer && !confirmOpen && !shortcutsOpen;
  const cursorStatus = cursorStatusLabel(shownRows, cursorId, selected);
  const navRef = useRef();
  navRef.current = { visibleIds, cursorId, anchorId, selected };
  useEffect(() => {
    if (!navEnabled) return undefined;
    const onKey = e => {
      if (isTypingTarget(document.activeElement)) return;
      const st = navRef.current;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (st.visibleIds.length === 0) return;
        e.preventDefault();
        const next = stepCursor(st.visibleIds, st.cursorId, e.key === 'ArrowDown' ? 1 : -1);
        setCursorId(next);
        if (e.shiftKey) {
          setSchedSel(new Set());
          setSelected(new Set(rangeBetween(st.visibleIds, st.anchorId ?? next, next)));
        } else {
          setAnchorId(next);
        }
        return;
      }
      if (e.key === ' ' || e.key === 'Spacebar') {
        // Only when a cursor exists and focus isn't on a control that Space
        // should activate (a button/link), so it never hijacks those.
        const tag = document.activeElement ? document.activeElement.tagName : '';
        if (!st.cursorId || tag === 'BUTTON' || tag === 'A') return;
        e.preventDefault();
        toggleRow(st.cursorId, !st.selected.has(st.cursorId));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navEnabled]);

  return (
    <div style={{ maxWidth: flush ? 'none' : 1180, margin: '0 auto', padding: flush ? '0 0 56px' : '24px 28px 56px' }}>
      {/* Wide mode is flush and seamless: no column gap, so the sections meet at
          a single divider line rather than sitting apart as separate cards. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: flush ? 0 : 14, animation: 'hsFade .25s ease' }}>
        {/* Balance strip: Cleared + Uncleared = Working (scoped to the account
            when one is selected). The account header now lives in the top bar.
            trailing: YNAB's "Selected Total (N)" at the band's far right,
            rendered only while a selection exists (recorded wins over
            scheduled, same rule as the bulk bar) and only on desktop — the
            phone select mode already has its own floating total pill. It is a
            ROW-amount aggregate, so it renders through fmt.moneyS (the
            register eye / prefs.masked), NOT the strip's own moneySPos — the
            strip's eye masks the three POSITION figures beside it, and this
            deliberately doesn't follow it, same split the two eyes were
            built to keep (PositionStrip's own comment on the two masks). */}
        <PositionStrip compact wide={flush} accountId={accountId}
          trailing={!phone && (sel.length > 0 || schedSel.size > 0) ? (() => {
            const n = sel.length > 0 ? selectedTotal : schedSelectedTotal;
            const count = sel.length > 0 ? sel.length : schedSel.size;
            return (
              <div style={{ textAlign: 'right' }}>
                <div className="tnum" style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2, color: n > 0 ? 'var(--pos)' : n < 0 ? 'var(--neg)' : 'var(--muted)' }}>{fmt.moneyS(n)}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Selected Total ({count})</div>
              </div>
            );
          })() : null} />

        {/* One bar at a time: recorded selection wins, else the scheduled one.
            The two selections are mutually exclusive, so only one has a count.
            Desktop-only — the phone Select mode has its own floating chrome. */}
        {!phone && (
        sel.length > 0 ? (
          <BulkBar
            count={sel.length}
            total={fmt.moneyS(selectedTotal)}
            onClear={clearSel}
            actions={[
              // Visible bar: Categorize, Edit (only for a lone selection — Edit is
              // a one-row action, so singleEditItem() is null on a multi-select and
              // BulkBar drops it), and the cleared toggle (Clear ⇄ Unclear by
              // selection state — one adaptive action, so it's never a no-op).
              { label: 'Categorize', icon: 'categorize', onClick: e => { setCatBulkAnchor(e.currentTarget); setCatBulkOpen(true); } },
              singleEditItem(),
              { label: allSelCleared ? 'Unclear' : 'Clear', icon: allSelCleared ? 'uncleared' : 'cleared', onClick: bulkToggleCleared, keys: SHORTCUT_BY_ID.toggleCleared.keys },
            ]}
            more={[
              { label: 'Duplicate', icon: 'duplicate', onClick: bulkDuplicate, keys: SHORTCUT_BY_ID.duplicate.keys },
              singleRepeatItem(),
              { divider: true },
              { label: 'Delete', icon: 'delete', onClick: bulkDelete, tone: 'neg', keys: SHORTCUT_BY_ID.delete.keys },
            ]}
          />
        ) : (
          <BulkBar count={schedSel.size} total={fmt.moneyS(schedSelectedTotal)} onClear={clearSched} actions={[]} more={schedMore()} />
        )
        )}

        {phone && (
          <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px 4px' }}>
              {acct && (
                <button onClick={() => navigate('/accounts')} aria-label="Back to accounts" className="hv-soft"
                  style={{ width: 44, height: 44, marginLeft: -12, border: 'none', borderRadius: 999, background: 'none',
                    color: 'var(--text)', fontSize: 22, cursor: 'pointer', flex: 'none', lineHeight: 1 }}>‹</button>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {acct ? acct.nickname : 'Spending'}
                </h1>
                {acct && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {instName(S, acct.instId)}
                  </div>
                )}
              </div>
              {phoneSelect ? (
                <button onClick={exitSelect} aria-label="Exit select mode" className="hv-soft"
                  style={{ width: 44, height: 44, border: 'none', borderRadius: 999, background: 'var(--elev)', color: 'var(--text)', fontSize: 18, cursor: 'pointer' }}>✕</button>
              ) : (
                <>
                  {acct && (
                    <button onClick={() => openers.editAccount(S, acct.id, openDrawer)} className="hv-soft rq-btn-outline"
                      style={{ minHeight: 44, padding: '0 16px', border: '1px solid var(--border)', borderRadius: 999,
                        background: 'var(--elev)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      Edit
                    </button>
                  )}
                  {/* Entering Select mode hides the search row, so a live query
                      would keep filtering invisibly — clear it (and collapse
                      the row) so selection always operates on the full list. */}
                  <button onClick={() => { clearSearch(); setPhoneQOpen(false); setPhoneSelect(true); }} className="hv-soft rq-btn-outline"
                    style={{ minHeight: 44, padding: '0 16px', border: '1px solid var(--border)', borderRadius: 999, background: 'var(--elev)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Select
                  </button>
                  {/* Collapsing the row also clears the query — the filter must
                      never outlive its only visible control. */}
                  <button onClick={() => { if (phoneQOpen) clearSearch(); setPhoneQOpen(!phoneQOpen); }} aria-pressed={phoneQOpen} aria-label="Search" className="hv-soft"
                    style={{ width: 44, height: 44, border: 'none', borderRadius: 999, background: phoneQOpen ? 'var(--soft)' : 'none', color: 'var(--text)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.6"/><path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                  </button>
                </>
              )}
            </div>
            {phoneQOpen && !phoneSelect && (
              <div style={{ padding: '4px 16px 10px', display: 'flex' }}>
                <TxSearchField ref={searchRef} value={F.q} term={F.term} suggestions={suggestions}
                  onQueryChange={onSearchQuery} onPick={onSearchPick} onClear={clearSearch}
                  collapsed="100%" expanded="100%" height={44}
                  placeholder={acct ? 'Search ' + acct.nickname : 'Search All Accounts'} label="Search transactions" />
              </div>
            )}
            {!phoneSelect && (needsCat.size > 0 || unclearedIds.size > 0) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '6px 16px 12px' }}>
                {needsCat.size > 0 && (
                  <button onClick={() => setListFilter(f => (f === 'needsCat' ? 'all' : 'needsCat'))} aria-pressed={listFilter === 'needsCat'} className="hv-elev rq-btn-outline"
                    style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--elev)', color: 'var(--text)', font: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ flex: 'none', minWidth: 22, height: 22, borderRadius: 999, background: 'var(--warn-soft)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{needsCat.size}</span>
                    <span style={{ flex: 1, fontSize: 13.5 }}>{'To categorize'}</span>
                    <span style={{ color: 'var(--accent)', fontSize: 13.5, fontWeight: 600 }}>{listFilter === 'needsCat' ? 'Show all' : 'Review'}</span>
                  </button>
                )}
                {unclearedIds.size > 0 && (
                  <button onClick={() => setListFilter(f => (f === 'uncleared' ? 'all' : 'uncleared'))} aria-pressed={listFilter === 'uncleared'} className="hv-elev rq-btn-outline"
                    style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--elev)', color: 'var(--text)', font: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ flex: 1, fontSize: 13.5 }}>{(listFilter === 'uncleared' ? 'Showing ' : 'Show ') + unclearedIds.size + ' uncleared transaction' + (unclearedIds.size === 1 ? '' : 's')}</span>
                    <span aria-hidden="true" style={{ color: 'var(--muted)' }}>{listFilter === 'uncleared' ? '✕' : '›'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {/* Needs-a-category banner (desktop; the phone list has its own inline
            review banners). View flips the shared listFilter, and the auto-reset
            effect dissolves banner + filter once the last row is categorized. */}
        {!phone && bannerNeedsCatCount > 0 && (
          <div role="region" aria-label="Transactions needing a category" style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
            background: 'var(--soft)', borderRadius: flush ? 0 : 12,
            ...(flush ? { borderBottom: '1px solid var(--border)' } : { border: '1px solid var(--border)' }),
          }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
              {bannerNeedsCatCount === 1 ? '1 transaction needs a category.' : bannerNeedsCatCount + ' transactions need a category.'}
            </span>
            <button
              onClick={() => { clearSel(); setListFilter(f => (f === 'needsCat' ? 'all' : 'needsCat')); }}
              aria-pressed={listFilter === 'needsCat'}
              className="hv-accent rq-btn-solid"
              style={{ height: 30, padding: '0 16px', border: 'none', borderRadius: 999,
                background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flex: 'none' }}
            >{listFilter === 'needsCat' ? 'Show all' : 'View'}</button>
          </div>
        )}
        {/* Action toolbar — the All-Accounts reference row: Add Transaction on
            the left, Undo/Redo after a divider, then View + Search on the right. */}
        {!phone && (
        // flexWrap: the toolbar's own content (Add Transaction, Undo/Redo,
        // RecentMoves, the eye/fit-width toggles, Search, the sort button —
        // none of which shrink) can add up to more than the available
        // container width once the sidebar eats into it (same 1024/1366
        // regime the register table folds columns for below). Wrapping to a
        // second line keeps every control reachable without reintroducing
        // the page-level horizontal scrollbar this wave removes from the
        // table itself — the `flex: 1` spacer still pushes the trailing
        // group right on whichever line it lands on.
        <div className="tx-toolbar" style={{
          display: 'flex', alignItems: 'center', gap: 6, rowGap: 6, flexWrap: 'wrap', padding: flush ? '9px 18px' : '10px 14px',
          background: 'var(--surface)',
          ...(flush ? { borderBottom: '1px solid var(--border)' } : { border: '1px solid var(--border)', borderRadius: 12 }),
        }}>
          <ToolbarAction
            icon={<PlusCircle />} label="Add Transaction" disabled={addDisabled}
            title={addDisabled ? 'Add a bank account first' : 'Record an expense, income, transfer, refund, or adjustment'}
            shortcut={addDisabled ? undefined : SHORTCUT_BY_ID.addTx}
            onClick={() => openers.addTx(openDrawer, 'expense', accountId ? { payWith: 'acc:' + accountId } : {})}
          />
          {/* U2 sms-parse: "Paste bank SMS" — AI-only affordance (US-1). */}
          {aiEnabled && (
            <ToolbarAction
              data-testid="paste-sms-trigger"
              icon={<SmsIcon />} label="Paste bank SMS" disabled={addDisabled}
              title={addDisabled ? 'Add a bank account first' : 'Pre-fill a transaction from a bank debit/credit SMS'}
              onClick={() => openers.pasteSms(openDrawer)}
            />
          )}
          {/* U3 receipt-scan: "Scan receipt" — AI-only affordance (US-1). */}
          {aiEnabled && (
            <ToolbarAction
              data-testid="scan-receipt-trigger"
              icon={<CameraIcon />} label="Scan receipt" disabled={addDisabled}
              title={addDisabled ? 'Add a bank account first' : 'Pre-fill a transaction from a receipt photo'}
              onClick={() => openers.scanReceipt(openDrawer)}
            />
          )}
          <span aria-hidden="true" style={{ width: 1, height: 20, background: 'var(--border)', flex: 'none', margin: '0 4px' }} />
          <ToolbarAction icon={<UndoIcon />} label="Undo" disabled={!canUndo} shortcut={SHORTCUT_BY_ID.undo} title={undoLabel ? 'Undo: ' + undoLabel : 'Undo'} onClick={undo} />
          <ToolbarAction icon={<RedoIcon />} label="Redo" disabled={!canRedo} shortcut={SHORTCUT_BY_ID.redo} title={redoLabel ? 'Redo: ' + redoLabel : 'Redo'} onClick={redo} />
          <RecentMoves />
          <span role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            {sortLabel(sort) + ', ' + list.length + ' row' + (list.length === 1 ? '' : 's')}
          </span>
          <span style={{ flex: 1 }} />
          {/* No aria-pressed. The label names the ACTION ("Hide amounts"), so
              aria-pressed=false alongside it announced "Hide amounts, not
              pressed" while amounts were in fact showing — the state read as
              the inverse of the truth. A control whose name changes with its
              state is not a toggle button; it is two named actions. */}
          <ToolbarAction
            icon={prefs.masked ? <EyeOffIcon /> : <EyeIcon />}
            label={prefs.masked ? 'Show amounts' : 'Hide amounts'}
            shortcut={SHORTCUT_BY_ID.hideAmounts}
            title={prefs.masked ? 'Show amounts' : 'Hide amounts'}
            onClick={() => setPrefs({ masked: !prefs.masked })}
          />
          <button
            onClick={() => setPrefs({ wide: !wide })}
            aria-pressed={wide}
            aria-label={wide ? 'Fit table to page width' : 'Expand table to full width'}
            title={wide ? 'Fit width' : 'Full width'}
            className="hv-soft rq-btn-outline"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 28, border: '1px solid var(--border)', borderRadius: 7, background: wide ? 'var(--elev)' : 'transparent', color: wide ? 'var(--text)' : 'var(--muted)', cursor: 'pointer', flex: 'none' }}
          >
            <WideIcon />
          </button>
          {/* Divider: Fit-width is a display control; Sort + Search are the
              content pair to its right. It is the FIRST thing dropped once the
              row wraps (theme.css, container query on .tx-toolbar): a divider
              is a separator between two groups on one line, and once the line
              breaks it either lands at the end of the first row separating
              nothing, or at the head of the second row pointing at a group
              that no longer sits beside it. The 13px it gives back is also
              often the whole overflow. */}
          <span aria-hidden="true" className="tx-toolbar-divider" style={{ width: 1, height: 20, background: 'var(--border)', flex: 'none', margin: '0 6px' }} />
          <TxSearchField ref={searchRef} value={F.q} term={F.term} suggestions={suggestions}
            onQueryChange={onSearchQuery} onPick={onSearchPick} onClear={clearSearch}
            placeholder={acct ? 'Search ' + acct.nickname : 'Search All Accounts'} label="Search transactions" />
          {/* The one sort with no header of its own (`signed` — rank by effect
              on the balance), so this button is its only door. The LABEL names
              the state you are in; the TITLE names the door, because a label
              that reads as a state gives no hint that it is also a switch.
              No arrow. Every label here already CONTAINS its direction —
              "Newest first", "Biggest expense first" — so the ↑/↓ beside it
              was a second, independent claim about the same ordering, and one
              of them was routinely wrong: `signed` ASC reads as "biggest
              expense first", which the arrow drew as ascending. The word
              wins; the arrow goes. */}
          <button
            onClick={() => setSort(s => (s.key === 'signed' ? DEFAULT_SORT : { key: 'signed', dir: 'asc' }))}
            title={sort.key === 'signed'
              ? 'Sorted by effect on your balance. Click to go back to newest first.'
              : 'Click to sort by effect on your balance — biggest expense first.'}
            aria-label={sort.key === 'signed' ? 'Sort newest first' : 'Sort by biggest expense first'}
            className="hv-accent-fg"
            style={{ border: 'none', background: 'none', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: '0 4px', whiteSpace: 'nowrap', flex: 'none' }}
          >
            {sortLabel(sort)}
          </button>
        </div>
        )}

        {/* container-type: inline-size (tx-table-wrap in theme.css) so the
            container-width state above tracks real content width — the
            resizable sidebar, not the viewport, same convention as
            .dash-cols/.plan-grid. The overflow role itself now lives on the
            nested ScrollArea/Viewport below (a real Base UI scrollbar, not
            the browser's native one — see src/ui/primitives/ScrollArea.jsx),
            not on this section: container-type only measures THIS element's
            own box, unaffected by what scrolls inside it, so the section
            keeps its ref/className exactly as before and only its CHILDREN
            changed. The horizontal scroll itself is the fallback for
            containers narrower than even the folded column set (ACCOUNT and
            MEMO both dropped) can fit — a LOCAL scrollbar here instead of a
            page-level one; TxEditorRow's action row stays sticky through it
            (ScrollAreaContent renders a plain, unstyled div — no grid/flex/
            transform to break the sticky chain, same as the header's own
            `position:sticky` against <main>'s unrelated vertical scroll).
            overflowY is explicitly hidden on the Viewport: this wrapper's
            height is never capped, so vertical scrolling belongs solely to
            <main>, never to this local wrapper. */}
        {/* U1: the one-time graduation offer after a 3rd same-payee accept
            (US-7). Non-blocking; sits above the list and auto-dismisses when the
            screen unmounts (offer state is local to this screen). */}
        {gradOffer && (
          <GraduationOffer
            payeeName={gradOffer.payeeName} categoryId={gradOffer.categoryId} categoryName={gradOffer.categoryName}
            onAccept={acceptGradOffer} onDismiss={dismissGradOffer}
          />
        )}
        <section ref={tableWrapRef} aria-label="Transaction list" className="tx-table-wrap" style={{ background: 'var(--surface)', border: flush ? 'none' : '1px solid var(--border)', borderRadius: flush ? 0 : 12 }}>
        <ScrollArea style={{ width: '100%' }}>
        <ScrollAreaViewport style={{ width: '100%', overflowY: 'hidden' }}>
        <ScrollAreaContent>
          {/* The arrow-key cursor's spoken half. The cursor itself is an accent
              bar on the row — visible only. This says where it landed, and
              whether that row is selected, so Space has an audible result. */}
          <span role="status" aria-live="polite" style={srOnly}>{cursorStatus}</span>
          {!phone && (postedRows.length > 0 || scheduled.length > 0 || (inlineTx && !editingId)) && (
            /* table-layout: fixed makes the <colgroup> below AUTHORITATIVE.
               Under the default auto layout the browser sizes every column
               from its content's min-content width, so one long account
               nickname folded into the PAYEE sub-line (a nowrap+ellipsis span,
               whose min-content is the whole string) widened the PAYEE column
               past the wrapper and put a horizontal scrollbar under a table
               that had already folded ACCOUNT and MEMO away to avoid exactly
               that. Fixed layout means the declared widths win, the one
               width-less column (PAYEE) takes the remainder, and every
               over-long cell ellipsises inside its column instead of pushing
               it. */
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              {/* Widths declared once, so a header and its cells cannot drift.
                  `columns` is already filtered by container width (registerColumns.js)
                  before it reaches colgroup/header/cells, so all three fold together. */}
              <colgroup>
                <col style={{ width: 34 }} />
                {columns.map(c => <col key={c.key} style={c.width ? { width: c.width } : undefined} />)}
              </colgroup>
              <thead>
                <tr>
                  {/* No `position: relative` here — it would override the sticky
                      position from `th` and this one header cell would scroll
                      away while the rest stuck, letting rows bleed through.
                      Sticky already provides the containing block the fill
                      checkbox needs. */}
                  <th scope="col" style={{ ...th, padding: '0 4px 0 18px', minWidth: 34, borderRight: 'none' }}>
                    <Checkbox
                      fill
                      checked={allVisibleSelected}
                      indeterminate={sel.length > 0 && !allVisibleSelected}
                      onChange={toggleAll}
                      label={allVisibleSelected ? 'Clear selection' : 'Select all ' + visibleIds.length + ' visible transactions'}
                    />
                  </th>
                  {columns.map((c, i) => (isSortable(c.key)
                    ? <SortableHeader key={c.key} col={c} sort={sort} onSort={onSort} last={i === columns.length - 1} />
                    : <PlainHeader key={c.key} col={c} last={i === columns.length - 1} />))}
                </tr>
              </thead>
              {inlineTx && !editingId && (
                <tbody>
                  <TxEditorRow hideAccount={hideAccountCol} hideMemo={hideMemoCol} showBalance={showBalanceCol} colSpan={gridColSpan} scopeRef={accountId ? 'acc:' + accountId : null} />
                </tbody>
              )}
              {scheduled.length > 0 && (
                <tbody>
                  <GroupHead
                    open={schedOpen} onToggle={() => setSchedOpen(o => !o)} label="SCHEDULED" bg="var(--warn-soft)" colSpan={gridColSpan}
                    count={scheduled.length + (scheduled.length === 1 ? ' item' : ' items')}
                    note={schedNote(overdueCount, hiddenRuleCount)}
                  />
                  {/* Scheduled rows are selectable now (keyed by row key, since a
                      reminder has no tx id), and their verbs live in the bulk bar
                      like recorded rows — no per-row ⋯ anywhere. */}
                  {schedOpen && scheduled.map(x => {
                    const key = schedKey(x);
                    return key === editingId
                      ? <TxEditorRow key={key} hideAccount={hideAccountCol} hideMemo={hideMemoCol} showBalance={showBalanceCol} colSpan={gridColSpan} scopeRef={accountId ? 'acc:' + accountId : null} />
                      : (
                        <Row
                          key={key} t={x.row} selId={key} scheduled hideAccount={hideAccountCol} hideMemo={hideMemoCol} showBalance={showBalanceCol} foldAccount={foldAccount}
                          checked={schedSel.has(key)} onToggleRow={toggleSched}
                        />
                      );
                  })}
                </tbody>
              )}
              <tbody>
                {/* An empty spacer row separates scheduled from recorded — like
                    YNAB — instead of a "RECORDED" heading. Only between the two. */}
                {grouped && postedRows.length > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={gridColSpan} style={{ height: '.3125rem', background: 'var(--warn-soft)', borderBottom: '1px solid var(--border)' }} />
                  </tr>
                )}
                {/* Recorded rows act through the bulk bar once selected — no ⋯. */}
                {tableRows.map((t, i) => (t.id === editingId
                  ? <TxEditorRow key={t.id} hideAccount={hideAccountCol} hideMemo={hideMemoCol} showBalance={showBalanceCol} colSpan={gridColSpan} scopeRef={accountId ? 'acc:' + accountId : null} />
                  : <Row
                      key={t.id} t={t} selId={t.id} hideAccount={hideAccountCol} hideMemo={hideMemoCol} showBalance={showBalanceCol} foldAccount={foldAccount}
                      checked={selected.has(t.id)} onToggleRow={toggleRow} focused={t.id === cursorId}
                      onCategorize={openRowCategorize} flash={flashIds.has(t.id)} saved={lastSaved.has(t.id)}
                      suggestions={aiSuggestions.get(t.id)} onApplySuggestion={applySuggestion}
                      dragProps={reorderable ? dnd.rowProps(t.id, t.merchant) : null}
                      dropLine={reorderable ? dnd.dropLineFor(t.id, i === tableRows.length - 1) : null}
                    />))}
              </tbody>
            </table>
          )}
          {phone && (postedRows.length > 0 || scheduled.length > 0) && (
            <TxPhoneList
              groups={groups} postedRows={shownRows}
              scheduled={scheduled} schedKey={schedKey}
              schedOpen={schedOpen} onToggleSchedOpen={() => setSchedOpen(o => !o)}
              overdueCount={overdueCount} hiddenRuleCount={hiddenRuleCount}
              hideAccount={!!accountId} needsCat={needsCat} flashIds={flashIds}
              selectMode={phoneSelect} selected={selected} schedSel={schedSel}
              onToggleRow={(id, on) => toggleRow(id, on)}   /* no event → additive branch, YNAB multi-toggle */
              onToggleSched={toggleSched}
              onRowTap={t => openers.editTx(S, t.id, openDrawer)}
              onCategorize={setCatTarget}
              suggestions={aiSuggestions} onApplySuggestion={applySuggestion}
              onSchedTap={x => (x.row.isRule ? navigate('/recurring/' + x.row.ruleId) : openers.editTx(S, x.selId, openDrawer))}
            />
          )}
          {/* Suppressed while an inline editor session is open: the row being
              typed IS the subject of the screen, and "No matches for your
              search" under it announces a dead end the user is not in — they
              are mid-entry, and the row they are writing is right there.
              (`inlineTx` is the open session; `editingId` narrows it to an
              existing row, which is itself hidden by the search — hence the
              plain `inlineTx` test, matching the table's own render gate.)
              The copy names the two controls that actually widen the view:
              the search words, and the month arrows in the header. "Widen the
              date range" named nothing on screen. And the button says what it
              does — it clears search, sort AND range, which is the whole
              view, not just a filter. */}
          {list.length === 0 && monthTx.length > 0 && !inlineTx && (
            <div style={{ padding: '44px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>No matches for your search</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>Try different words, or step to another month with the arrows in the header.</div>
              <button onClick={reset} className="hv-soft rq-btn-outline" style={{ marginTop: 12, height: 32, padding: '0 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Reset view</button>
            </div>
          )}
          {monthTx.length === 0 && scheduled.length === 0 && !inlineTx && (
            <div style={{ padding: '44px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{range.from || range.to ? 'Nothing recorded in ' + rangeLabel(range.from, range.to) : 'Nothing recorded yet'}</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4, maxWidth: '44ch', marginLeft: 'auto', marginRight: 'auto' }}>Transactions you add appear here with search and filters. Recording as you spend keeps your dashboard honest.</div>
              <button onClick={() => openers.addTx(openDrawer, 'expense', accountId ? { payWith: 'acc:' + accountId } : {})} disabled={addDisabled} className="hv-accent rq-btn-solid" style={{ marginTop: 12, height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: addDisabled ? 'default' : 'pointer', opacity: addDisabled ? .45 : 1 }}>＋ Add transaction</button>
            </div>
          )}
        </ScrollAreaContent>
        </ScrollAreaViewport>
        <ScrollAreaScrollbar orientation="horizontal" />
        </ScrollArea>
        </section>

        {/* Phone Select mode: floating selected-total pill + action bar. The
            pill sits above the action bar, which clears the bottom tab bar. */}
        {phone && phoneSelect && (
          <>
            {/* Read-only chip: pointerEvents none so it can never intercept
                taps meant for the ⋯ menu below it, and it hides entirely while
                that menu is open so the items (Delete last) stay visible. */}
            {(sel.length > 0 || schedSel.size > 0) && !phoneMoreOpen && (
              <div role="status" style={{
                position: 'fixed', left: '50%', transform: 'translateX(-50%)',
                bottom: 'calc(140px + env(safe-area-inset-bottom))', zIndex: 41,
                padding: '10px 18px', borderRadius: 16, textAlign: 'center',
                background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
                border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
                backdropFilter: 'blur(8px)', pointerEvents: 'none',
              }}>
                <div className="tnum" style={{ fontSize: 17, fontWeight: 700 }}>
                  {fmt.moneyS(sel.length > 0 ? selectedTotal : schedSelectedTotal)}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                  {(sel.length > 0 ? sel.length : schedSel.size) + ' transaction' + ((sel.length > 0 ? sel.length : schedSel.size) === 1 ? '' : 's') + ' selected'}
                </div>
              </div>
            )}
            <div style={{
              position: 'fixed', left: 16, right: 16,
              bottom: 'var(--phone-nav-clearance)', zIndex: 39,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            }}>
              <button onClick={() => setPickerOpen(true)} disabled={sel.length === 0} className="hv-soft rq-btn-outline"
                style={{ minHeight: 48, padding: '0 18px', border: '1px solid var(--border)', borderRadius: 999, background: 'var(--surface)', color: sel.length === 0 ? 'var(--muted)' : 'var(--text)', fontSize: 14, fontWeight: 600, cursor: sel.length === 0 ? 'default' : 'pointer', boxShadow: 'var(--shadow)' }}>
                Categorize
              </button>
              <button onClick={bulkToggleCleared} disabled={sel.length === 0} aria-label="Toggle cleared" className="hv-soft rq-btn-outline"
                style={{ width: 48, height: 48, border: '1px solid var(--border)', borderRadius: 999, background: 'var(--surface)', color: sel.length === 0 ? 'var(--muted)' : 'var(--text)', fontSize: 15, fontWeight: 700, cursor: sel.length === 0 ? 'default' : 'pointer', boxShadow: 'var(--shadow)' }}>
                ⓒ
              </button>
              <div style={{ position: 'relative' }}>
                <button onClick={() => setPhoneMoreOpen(o => !o)} disabled={sel.length === 0 && schedSel.size === 0} aria-label="More actions" aria-expanded={phoneMoreOpen} className="hv-soft rq-btn-outline"
                  style={{ width: 48, height: 48, border: '1px solid var(--border)', borderRadius: 999, background: 'var(--surface)', color: (sel.length === 0 && schedSel.size === 0) ? 'var(--muted)' : 'var(--text)', fontSize: 18, cursor: 'pointer', boxShadow: 'var(--shadow)' }}>
                  ⋯
                </button>
                {phoneMoreOpen && (
                  <div role="menu" style={{ position: 'absolute', right: 0, bottom: 56, minWidth: 200, padding: 6, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column' }}>
                    {(sel.length > 0
                      ? [singleEditItem(), { label: 'Duplicate', onClick: bulkDuplicate }, { divider: true }, { label: 'Delete', tone: 'neg', onClick: bulkDelete }]
                      : schedMore()
                    ).filter(Boolean).map((it, i) => it.divider
                      ? <span key={i} aria-hidden="true" style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                      : (
                        <button key={it.label} role="menuitem" onClick={() => { setPhoneMoreOpen(false); it.onClick(); }} className="hv-soft"
                          style={{ minHeight: 44, padding: '0 12px', border: 'none', borderRadius: 8, background: 'none', color: it.tone === 'neg' ? 'var(--neg)' : 'var(--text)', font: 'inherit', fontSize: 14, textAlign: 'left', cursor: 'pointer' }}>
                          {it.label}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
        <CategoryPickerSheet
          open={pickerOpen || (!!catTarget && !catAnchor)}
          onClose={() => { setPickerOpen(false); setCatTarget(null); }}
          // Income rows need the income list; the bulk flow stays expense-only
          // (its own guard filters the selection), so only the single-target
          // path switches type.
          catType={!pickerOpen && catTarget && S.transactions.find(x => x.id === catTarget)?.type === 'income' ? 'income' : 'expense'}
          onPick={pickerOpen ? bulkCategorize : categorizeOne}
        />
        {/* Desktop bulk Categorize: an anchored popover (the sheet above still
            serves phone bulk + anchor-less single-row). bulkCategorize is expense-only. */}
        <CategoryPickerPopover
          open={catBulkOpen} onOpenChange={setCatBulkOpen} anchor={catBulkAnchor}
          catType="expense" onPick={bulkCategorize}
        />
        {/* Web single-row categorize: the needs-category pill anchors the same
            popover to itself; the phone list sends no anchor and keeps the sheet. */}
        <CategoryPickerPopover
          open={!!catTarget && !!catAnchor}
          onOpenChange={o => { if (!o) { setCatTarget(null); setCatAnchor(null); } }}
          anchor={catAnchor}
          catType={catTarget && S.transactions.find(x => x.id === catTarget)?.type === 'income' ? 'income' : 'expense'}
          onPick={categorizeOne}
        />
        {/* Drag-to-reorder fallback: a moment the drop couldn't honestly
            interpolate is chosen here, then written like any other reorder. */}
        {reorderPicker && (
          <TxWhenPicker
            seed={reorderPicker.seed} x={reorderPicker.x} y={reorderPicker.y}
            onCancel={() => setReorderPicker(null)}
            onConfirm={iso => {
              applyData(data => reorderTransaction(data, { id: reorderPicker.id, date: iso, now: nowIsoSec() }));
              setReorderPicker(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
