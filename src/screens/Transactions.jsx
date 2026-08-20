// Transactions list screen — template 268-336, txScreenVals script 1018-1054.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.jsx';
import { DEFAULT_FILTERS, useTxView } from '../store/TxViewContext.jsx';
import { DEFAULT_SORT, nextSortState, sortLabel } from '../lib/sortRows.js';
import SortIcon from '../ui/SortIcon.jsx';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useShortcuts, useSequence } from '../ui/useShortcuts.js';
import { SPEC, SHORTCUT_BY_ID, isTypingTarget } from '../lib/shortcuts.js';
import { stepCursor, rangeBetween } from '../lib/rowCursor.js';
import { useMoney } from '../lib/format.js';
import { nowIso } from '../lib/dates.js';
import { inRange, rangeFor, rangeLabel } from '../lib/dateRange.js';
import { selectionForSel } from '../lib/activityDrill.js';
import { instName, schedNote, txGroups } from '../lib/txRow.js';
import { openers } from '../drawers/openers.js';
import TxChips, { NeedsCategoryPill } from '../ui/TxChips.jsx';
import { advanceDue, effectiveNextDate, longDate, ruleFromTx } from '../lib/schedule.js';
import { deleteRule, deleteTransaction, deleteTransactions, duplicateTransactions, postTransactionNow, setTransactionsCategory, setTransactionsStatus, skipOccurrence } from '../store/actions.js';
import Checkbox from '../ui/Checkbox.jsx';
import BulkBar from '../ui/BulkBar.jsx';
import { dayGroups } from '../lib/dayGroups.js';
import PositionStrip from '../components/PositionStrip.jsx';
import RecentMoves from '../components/RecentMoves.jsx';
import SearchField from '../ui/SearchField.jsx';
import { ToolbarAction, PlusCircle, UndoIcon, RedoIcon } from '../ui/ToolbarAction.jsx';
import { matchesQuery } from '../lib/txSearch.js';
import { useIsPhone } from '../lib/useIsPhone.js';
import TxPhoneList from '../components/TxPhoneList.jsx';
import CategoryPickerSheet from '../components/CategoryPickerSheet.jsx';
import CategoryPickerPopover from '../components/CategoryPickerPopover.jsx';
import TxEditorRow from '../ui/tx/inline/TxEditorRow.jsx';

// Sticky against <main>'s scroll. No overflow is introduced here — the section
// deliberately has none, because it would clip the per-row ⋯ menu. z-index sits
// below RowMenu's 30 so an open menu still passes over the header.
// borderRight draws the column dividers; the last header cell overrides it to
// none so the outer right edge stays open (the outer left has no border-left).
const th = { textAlign: 'left', fontSize: 12, fontWeight: 500, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--muted)', padding: '9px 8px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 2, background: 'var(--surface)' };
const td = { padding: '10px 8px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' };

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
  { key: 'date', label: 'DATE', width: 96 },
  { key: 'details', label: 'DETAILS', width: null },
  { key: 'category', label: 'CATEGORY', width: 190 },
  { key: 'notes', label: 'MEMO', width: 180 },
  // Two amount columns (YNAB). altKeys keep the toolbar's size/signed modes
  // lighting a header: both are magnitude-family sorts, closest to OUTFLOW.
  { key: 'outflow', label: 'OUTFLOW', width: 110, align: 'right', altKeys: ['size', 'signed'] },
  { key: 'inflow', label: 'INFLOW', width: 110, align: 'right' },
  // Just a small one-letter badge, so the column is narrow and centred.
  { key: 'status', label: 'STATUS', width: 68, align: 'center' },
];

// Types that carry a category; transfers/adjustments never do.
const CAT_TYPES = ['expense', 'refund', 'income'];

// A sortable column header. The whole cell is the control, so the target is the
// full header height rather than the width of the label text.
function SortableHeader({ col, sort, onSort, last }) {
  const active = sort.key === col.key || (col.altKeys || []).includes(sort.key);
  const dir = active ? sort.dir : null;
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
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
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


function Row({ t, selId, checked, onToggleRow, scheduled, hideAccount, focused, onCategorize, flash }) {
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
      // The whole row (except the ⋯ menu and the checkbox, which both
      // stopPropagation) is a click target that toggles selection — hence the
      // pointer cursor on any selectable row. The event flows through so a
      // shift+click can select a range instead of toggling one row.
      onClick={selId ? e => onToggleRow(selId, !checked, e) : undefined}
      // hv-elev's hover background is !important, so it beat the inline
      // --soft when checked — the selection highlight only appeared once the
      // cursor left. Dropping hv-elev while checked lets --soft show at once.
      // row-flash is additive: a just-touched row blinks whatever its state.
      className={[checked ? null : 'hv-elev', flash ? 'row-flash' : null].filter(Boolean).join(' ') || undefined}
      // Scheduled rows sit on a SUBTLE warm wash — the full --warn-soft (used on
      // the group heading) is too heavy per row, so blend it down into the
      // surface. Theme-adaptive, and a checked row's --soft still wins.
      style={{ height: '2.25rem', background: checked ? 'var(--soft)' : scheduled ? 'color-mix(in srgb, var(--warn-soft) 40%, var(--surface))' : undefined, cursor: selId ? 'pointer' : undefined }}
    >
      {/* Padding moves onto the checkbox's own label so the whole cell, not
          just the 13px box, is the target. minWidth floors the column: the box
          has fixed geometry (18px inset + 13px), and without a floor the auto
          table-layout compresses this column on a narrow window until the box
          overflows into ACCOUNT. */}
      {/* The keyboard cursor shows as a left accent bar on this first cell — an
          inset box-shadow renders here (unlike on a <tr> under border-collapse)
          and reads on top of any row background, distinct from the checked fill. */}
      <td style={{ ...td, ...dim, padding: 0, position: 'relative', verticalAlign: 'middle', minWidth: 34, boxShadow: focused ? 'inset 3px 0 0 var(--accent)' : undefined }}>
        {selId && (
          <Checkbox
            fill
            checked={checked}
            onChange={on => onToggleRow(selId, on)}
            label={'Select ' + t.merchant + ' on ' + t.dateLabel}
          />
        )}
      </td>
      {!hideAccount && <td style={{ ...td, ...dim, maxWidth: 160, padding: pad, verticalAlign: 'middle' }}><span style={{ display: 'block', fontSize: 14, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.acctLabel}</span></td>}
      <td style={{ ...td, ...dim, padding: pad, verticalAlign: 'middle' }}>
        {/* Date only — no clock time, no "in N days". Overdue rows carry the
            cue on the date itself, since the second line that held it is gone. */}
        <span className="tnum" style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', color: t.isOverdue ? 'var(--neg)' : undefined }}>{t.dateLabel}</span>
      </td>
      <td style={{ ...td, ...dim, maxWidth: 280, padding: pad, verticalAlign: 'middle' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.merchant}</span>
          <TxChips row={t} meta />
        </div>
      </td>
      <td style={{ ...td, ...dim, maxWidth: 190, padding: pad, verticalAlign: 'middle' }}>
        {t.needsCategory
          ? <NeedsCategoryPill onClick={onCategorize ? e => onCategorize(t.id, e?.currentTarget) : undefined} />
          : <span style={{ display: 'block', fontSize: 14, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.catName}</span>}
      </td>
      {/* Memo: adjustment reason and/or free-text note, truncated with an ellipsis and the full value on hover. */}
      <td style={{ ...td, ...dim, maxWidth: 200, padding: pad, verticalAlign: 'middle' }}>
        <span title={t.notes || undefined} style={{ display: 'block', fontSize: 14, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.notes}</span>
      </td>
      <td style={{ ...td, ...dim, padding: pad, textAlign: 'right', verticalAlign: 'middle' }}>
        <span className="tnum" style={{ fontSize: 14, fontWeight: 500, color: t.amtColor, whiteSpace: 'nowrap' }}>{t.outflowLabel}</span>
      </td>
      <td style={{ ...td, ...dim, padding: pad, textAlign: 'right', verticalAlign: 'middle' }}>
        <span className="tnum" style={{ fontSize: 14, fontWeight: 500, color: t.amtColor, whiteSpace: 'nowrap' }}>{t.inflowLabel}</span>
      </td>
      {/* No status badge on scheduled rows — the warm band and the SCHEDULED
          heading already say what they are, so only recorded rows show C. */}
      <td style={{ ...td, ...dim, padding: pad, textAlign: 'center', verticalAlign: 'middle' }}>
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
          <span aria-hidden="true" style={{ fontSize: 10, color: 'var(--muted)', width: 10 }}>{open ? '▾' : '▸'}</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.05em' }}>{label}</span>
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{count}</span>
          {note && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>· {note}</span>}
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
  const { ask, notify, confirmOpen, shortcutsOpen, flashRows, flashIds } = useUI();
  const fmt = useMoney();
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
  // Search row shown? F.q lives in TxViewContext and survives navigation, so a
  // query left active must arrive with its row VISIBLE — a collapsed row over a
  // persisting filter would silently narrow the list with no cue on screen.
  const [phoneQOpen, setPhoneQOpen] = useState(() => F.q !== '');
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
  const reset = () => resetView();

  const monthTx = S.transactions.filter(t => inRange(t, range.from, range.to)
    && (!accountId || t.accountId === accountId || t.toAccountId === accountId));
  // Search is the only filter here now — it matches merchant, notes, category
  // and every account or card the row touches (matchesQuery). The other filters
  // are each moving to the screen that owns the question.
  const list = monthTx.filter(t => matchesQuery(t, F.q, S));

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

  // Hide the ACCOUNT column on a single-account ledger — every row is that
  // account. Header, colgroup, Row cells and the group-heading colSpan all read
  // from `columns` / `gridColSpan` so they can never drift.
  const columns = accountId ? COLUMNS.filter(c => c.key !== 'account') : COLUMNS;
  const gridColSpan = columns.length + 1;

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
    setFilters(f => (f.q ? { ...f, q: '' } : f)); // a stale search would filter the target out
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

  const bulkCategorize = categoryId => {
    const canTakeExpenseCat = t => t.type === 'expense' || t.type === 'refund';
    const ids = sel.filter(id => { const t = S.transactions.find(x => x.id === id); return t && canTakeExpenseCat(t); });
    const skipped = sel.length - ids.length;
    setPickerOpen(false);
    if (ids.length === 0) { notify('Nothing categorized — none of the selected can take an expense category.'); return; }
    // Blink the categorized rows instead of a "Categorized N" toast. A partial
    // skip is still a warning worth surfacing, so that keeps a (minimal) toast.
    applyData(data => setTransactionsCategory(data, { ids, categoryId }));
    clearSel();
    flashRows(ids);
    if (skipped) notify('Skipped ' + skipped + ' that can’t take an expense category.');
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

  // Signed sum of the current selection, shown in the bulk bar (like YNAB's
  // "Selected Total"). amtValue is the same signed figure the AMOUNT column shows.
  const selectedTotal = postedRows.reduce((s, r) => (selected.has(r.id) ? s + (r.amtValue || 0) : s), 0);
  const schedSelectedTotal = selSched.reduce((s, x) => s + (x.row.amtValue || 0), 0);

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
            when one is selected). The account header now lives in the top bar. */}
        <PositionStrip compact wide={flush} accountId={accountId} />

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
                    <button onClick={() => openers.editAccount(S, acct.id, openDrawer)} className="hv-soft"
                      style={{ minHeight: 44, padding: '0 16px', border: '1px solid var(--border)', borderRadius: 999,
                        background: 'var(--elev)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      Edit
                    </button>
                  )}
                  {/* Entering Select mode hides the search row, so a live query
                      would keep filtering invisibly — clear it (and collapse
                      the row) so selection always operates on the full list. */}
                  <button onClick={() => { setF('q', ''); setPhoneQOpen(false); setPhoneSelect(true); }} className="hv-soft"
                    style={{ minHeight: 44, padding: '0 16px', border: '1px solid var(--border)', borderRadius: 999, background: 'var(--elev)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Select
                  </button>
                  {/* Collapsing the row also clears the query — the filter must
                      never outlive its only visible control. */}
                  <button onClick={() => { if (phoneQOpen) setF('q', ''); setPhoneQOpen(!phoneQOpen); }} aria-pressed={phoneQOpen} aria-label="Search" className="hv-soft"
                    style={{ width: 44, height: 44, border: 'none', borderRadius: 999, background: phoneQOpen ? 'var(--soft)' : 'none', color: 'var(--text)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.6"/><path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                  </button>
                </>
              )}
            </div>
            {phoneQOpen && !phoneSelect && (
              <div style={{ padding: '4px 16px 10px', display: 'flex' }}>
                <SearchField ref={searchRef} value={F.q} onChange={v => setF('q', v)} collapsed="100%" expanded="100%" height={44}
                  placeholder={acct ? 'Search ' + acct.nickname : 'Search All Accounts'} label="Search transactions" />
              </div>
            )}
            {!phoneSelect && (needsCat.size > 0 || unclearedIds.size > 0) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '6px 16px 12px' }}>
                {needsCat.size > 0 && (
                  <button onClick={() => setListFilter(f => (f === 'needsCat' ? 'all' : 'needsCat'))} aria-pressed={listFilter === 'needsCat'} className="hv-elev"
                    style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--elev)', color: 'var(--text)', font: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ flex: 'none', minWidth: 22, height: 22, borderRadius: 999, background: 'var(--warn-soft)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{needsCat.size}</span>
                    <span style={{ flex: 1, fontSize: 13.5 }}>{'To categorize'}</span>
                    <span style={{ color: 'var(--accent)', fontSize: 13.5, fontWeight: 600 }}>{listFilter === 'needsCat' ? 'Show all' : 'Review'}</span>
                  </button>
                )}
                {unclearedIds.size > 0 && (
                  <button onClick={() => setListFilter(f => (f === 'uncleared' ? 'all' : 'uncleared'))} aria-pressed={listFilter === 'uncleared'} className="hv-elev"
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
        {!phone && needsCat.size > 0 && (
          <div role="region" aria-label="Transactions needing a category" style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
            background: 'var(--soft)', borderRadius: flush ? 0 : 12,
            ...(flush ? { borderBottom: '1px solid var(--border)' } : { border: '1px solid var(--border)' }),
          }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
              {needsCat.size === 1 ? '1 transaction needs a category.' : needsCat.size + ' transactions need a category.'}
            </span>
            <button
              onClick={() => { clearSel(); setListFilter(f => (f === 'needsCat' ? 'all' : 'needsCat')); }}
              aria-pressed={listFilter === 'needsCat'}
              className="hv-accent"
              style={{ height: 30, padding: '0 16px', border: 'none', borderRadius: 999,
                background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flex: 'none' }}
            >{listFilter === 'needsCat' ? 'Show all' : 'View'}</button>
          </div>
        )}
        {/* Action toolbar — the All-Accounts reference row: Add Transaction on
            the left, Undo/Redo after a divider, then View + Search on the right. */}
        {!phone && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: flush ? '9px 18px' : '10px 14px',
          background: 'var(--surface)',
          ...(flush ? { borderBottom: '1px solid var(--border)' } : { border: '1px solid var(--border)', borderRadius: 12 }),
        }}>
          <ToolbarAction
            icon={<PlusCircle />} label="Add Transaction" disabled={addDisabled}
            title={addDisabled ? 'Add a bank account first' : 'Record an expense, income, transfer, refund, or adjustment'}
            shortcut={addDisabled ? undefined : SHORTCUT_BY_ID.addTx}
            onClick={() => openers.addTx(openDrawer, 'expense', accountId ? { payWith: 'acc:' + accountId } : {})}
          />
          <span aria-hidden="true" style={{ width: 1, height: 20, background: 'var(--border)', flex: 'none', margin: '0 4px' }} />
          <ToolbarAction icon={<UndoIcon />} label="Undo" disabled={!canUndo} shortcut={SHORTCUT_BY_ID.undo} title={undoLabel ? 'Undo: ' + undoLabel : 'Undo'} onClick={undo} />
          <ToolbarAction icon={<RedoIcon />} label="Redo" disabled={!canRedo} shortcut={SHORTCUT_BY_ID.redo} title={redoLabel ? 'Redo: ' + redoLabel : 'Redo'} onClick={redo} />
          <RecentMoves />
          <span role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            {sortLabel(sort) + ', ' + list.length + ' row' + (list.length === 1 ? '' : 's')}
          </span>
          <span style={{ flex: 1 }} />
          <button
            onClick={() => setPrefs({ wide: !wide })}
            aria-pressed={wide}
            aria-label={wide ? 'Fit table to page width' : 'Expand table to full width'}
            title={wide ? 'Fit width' : 'Full width'}
            className="hv-soft"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 28, border: '1px solid var(--border)', borderRadius: 7, background: wide ? 'var(--elev)' : 'transparent', color: wide ? 'var(--text)' : 'var(--muted)', cursor: 'pointer', flex: 'none' }}
          >
            <WideIcon />
          </button>
          {/* Divider: Fit-width is a display control; Sort + Search are the
              content pair to its right. */}
          <span aria-hidden="true" style={{ width: 1, height: 20, background: 'var(--border)', flex: 'none', margin: '0 6px' }} />
          <SearchField ref={searchRef} value={F.q} onChange={v => setF('q', v)} placeholder={acct ? 'Search ' + acct.nickname : 'Search All Accounts'} label="Search transactions" />
          <button
            onClick={() => setSort(s => (s.key === 'signed' ? DEFAULT_SORT : { key: 'signed', dir: 'asc' }))}
            aria-label={sort.key === 'signed' ? 'Sort newest first' : 'Sort by biggest expense first'}
            className="hv-accent-fg"
            style={{ border: 'none', background: 'none', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: '0 4px', whiteSpace: 'nowrap', flex: 'none' }}
          >
            {sortLabel(sort) + ' ' + (sort.dir === 'asc' ? '↑' : '↓')}
          </button>
        </div>
        )}

        {/* No overflow:hidden — it would clip the per-row ⋯ menu on the last rows. */}
        <section aria-label="Transaction list" style={{ background: 'var(--surface)', border: flush ? 'none' : '1px solid var(--border)', borderRadius: flush ? 0 : 12 }}>
          {!phone && (postedRows.length > 0 || scheduled.length > 0 || (inlineTx && !editingId)) && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              {/* Widths declared once, so a header and its cells cannot drift. */}
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
                  {columns.map((c, i) => <SortableHeader key={c.key} col={c} sort={sort} onSort={onSort} last={i === columns.length - 1} />)}
                </tr>
              </thead>
              {inlineTx && !editingId && (
                <tbody>
                  <TxEditorRow hideAccount={!!accountId} colSpan={gridColSpan} scopeRef={accountId ? 'acc:' + accountId : null} />
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
                      ? <TxEditorRow key={key} hideAccount={!!accountId} colSpan={gridColSpan} scopeRef={accountId ? 'acc:' + accountId : null} />
                      : (
                        <Row
                          key={key} t={x.row} selId={key} scheduled hideAccount={!!accountId}
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
                {shownRows.map(t => (t.id === editingId
                  ? <TxEditorRow key={t.id} hideAccount={!!accountId} colSpan={gridColSpan} scopeRef={accountId ? 'acc:' + accountId : null} />
                  : <Row
                      key={t.id} t={t} selId={t.id} hideAccount={!!accountId}
                      checked={selected.has(t.id)} onToggleRow={toggleRow} focused={t.id === cursorId}
                      onCategorize={openRowCategorize} flash={flashIds.has(t.id)}
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
              onSchedTap={x => (x.row.isRule ? navigate('/recurring/' + x.row.ruleId) : openers.editTx(S, x.selId, openDrawer))}
            />
          )}
          {list.length === 0 && monthTx.length > 0 && (
            <div style={{ padding: '44px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>No matches for your search</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>Try different words, or widen the date range in the header.</div>
              <button onClick={reset} className="hv-soft" style={{ marginTop: 12, height: 32, padding: '0 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Reset filters</button>
            </div>
          )}
          {monthTx.length === 0 && scheduled.length === 0 && !inlineTx && (
            <div style={{ padding: '44px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{range.from || range.to ? 'Nothing recorded in ' + rangeLabel(range.from, range.to) : 'Nothing recorded yet'}</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4, maxWidth: '44ch', marginLeft: 'auto', marginRight: 'auto' }}>Transactions you add appear here with search and filters. Recording as you spend keeps your dashboard honest.</div>
              <button onClick={() => openers.addTx(openDrawer, 'expense', accountId ? { payWith: 'acc:' + accountId } : {})} disabled={addDisabled} className="hv-accent" style={{ marginTop: 12, height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: addDisabled ? 'default' : 'pointer', opacity: addDisabled ? .45 : 1 }}>＋ Add transaction</button>
            </div>
          )}
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
              <button onClick={() => setPickerOpen(true)} disabled={sel.length === 0} className="hv-soft"
                style={{ minHeight: 48, padding: '0 18px', border: '1px solid var(--border)', borderRadius: 999, background: 'var(--surface)', color: sel.length === 0 ? 'var(--muted)' : 'var(--text)', fontSize: 14, fontWeight: 600, cursor: sel.length === 0 ? 'default' : 'pointer', boxShadow: 'var(--shadow)' }}>
                Categorize
              </button>
              <button onClick={bulkToggleCleared} disabled={sel.length === 0} aria-label="Toggle cleared" className="hv-soft"
                style={{ width: 48, height: 48, border: '1px solid var(--border)', borderRadius: 999, background: 'var(--surface)', color: sel.length === 0 ? 'var(--muted)' : 'var(--text)', fontSize: 15, fontWeight: 700, cursor: sel.length === 0 ? 'default' : 'pointer', boxShadow: 'var(--shadow)' }}>
                ⓒ
              </button>
              <div style={{ position: 'relative' }}>
                <button onClick={() => setPhoneMoreOpen(o => !o)} disabled={sel.length === 0 && schedSel.size === 0} aria-label="More actions" aria-expanded={phoneMoreOpen} className="hv-soft"
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
      </div>
    </div>
  );
}
