// Transactions list screen — template 268-336, txScreenVals script 1018-1054.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.jsx';
import { DEFAULT_FILTERS, useTxView } from '../store/TxViewContext.jsx';
import { DEFAULT_SORT, nextSortState, sortLabel } from '../lib/sortRows.js';
import SortIcon from '../ui/SortIcon.jsx';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useShortcuts, useSequence } from '../ui/useShortcuts.js';
import { SPEC, SHORTCUT_BY_ID, isTypingTarget } from '../lib/shortcuts.js';
import { stepCursor, rangeBetween } from '../lib/rowCursor.js';
import Tooltip from '../ui/Tooltip.jsx';
import { useMoney } from '../lib/format.js';
import { nowIso } from '../lib/dates.js';
import { inRange, rangeFor, rangeLabel } from '../lib/dateRange.js';
import { txGroups } from '../lib/txRow.js';
import { openers } from '../drawers/openers.js';
import TxChips from '../ui/TxChips.jsx';
import { advanceDue, effectiveNextDate, longDate, ruleFromTx } from '../lib/schedule.js';
import { deleteRule, deleteTransaction, deleteTransactions, duplicateTransactions, postTransactionNow, setTransactionsCategory, setTransactionsStatus, skipOccurrence } from '../store/actions.js';
import Checkbox from '../ui/Checkbox.jsx';
import BulkBar from '../ui/BulkBar.jsx';
import PositionStrip from '../components/PositionStrip.jsx';
import RecentMoves from '../components/RecentMoves.jsx';
import SearchField from '../ui/SearchField.jsx';
import { matchesQuery } from '../lib/txSearch.js';

// Sticky against <main>'s scroll. No overflow is introduced here — the section
// deliberately has none, because it would clip the per-row ⋯ menu. z-index sits
// below RowMenu's 30 so an open menu still passes over the header.
const th = { textAlign: 'left', fontSize: 12, fontWeight: 500, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--muted)', padding: '9px 8px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 2, background: 'var(--surface)' };
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
  // altKeys: the signed sort has no header of its own, so AMOUNT stays lit
  // while it drives the order — the reader can always see which column owns
  // the ordering, even when the mode came from the dropdown.
  { key: 'size', label: 'AMOUNT', width: 120, align: 'right', altKeys: ['signed'] },
  // Just a small one-letter badge, so the column is narrow and centred.
  { key: 'status', label: 'STATUS', width: 68, align: 'center' },
];

// A sortable column header. The whole cell is the control, so the target is the
// full header height rather than the width of the label text.
function SortableHeader({ col, sort, onSort }) {
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
    size: { asc: 'smallest first', desc: 'largest first' },
  }[col.key][nextDir];
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      style={{ ...th, padding: 0, textAlign: col.align || 'left' }}
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
          minHeight: 44, padding: '9px 8px', whiteSpace: 'nowrap',
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


function Row({ t, selId, checked, onToggleRow, scheduled, hideAccount, focused }) {
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
      className={checked ? undefined : 'hv-elev'}
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
        <span style={{ display: 'block', fontSize: 14, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.catName}</span>
      </td>
      {/* Memo: adjustment reason and/or free-text note, truncated with an ellipsis and the full value on hover. */}
      <td style={{ ...td, ...dim, maxWidth: 200, padding: pad, verticalAlign: 'middle' }}>
        <span title={t.notes || undefined} style={{ display: 'block', fontSize: 14, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.notes}</span>
      </td>
      <td style={{ ...td, ...dim, padding: pad, textAlign: 'right', verticalAlign: 'middle' }}>
        <span className="tnum" style={{ fontSize: 14, fontWeight: 500, color: t.amtColor, whiteSpace: 'nowrap' }}>{t.amtLabel}</span>
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
// Toolbar icons for the "All Accounts" action row (reference layout). Stroke
// icons take currentColor; the add glyph is a filled accent circle + a plus.
const strokeIcon = children => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>{children}</svg>
);
const PlusCircle = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}>
    <circle cx="12" cy="12" r="11" fill="currentColor" />
    <path d="M12 7.5v9M7.5 12h9" stroke="var(--on-accent)" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const UndoIcon = () => strokeIcon(<><path d="M9 14 4 9l5-5" /><path d="M4 9h9a6 6 0 0 1 0 12H7" /></>);
const RedoIcon = () => strokeIcon(<><path d="m15 14 5-5-5-5" /><path d="M20 9h-9a6 6 0 0 0 0 12h6" /></>);
// Full-width toggle glyph: arrows pushing outward to the edges.
function WideIcon() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 8L3 12l5 4" /><path d="M16 8l5 4-5 4" /><path d="M3 12h18" />
    </svg>
  );
}

// A toolbar action: icon + label, accent when enabled, muted when disabled, a
// soft hover fill. The row that runs across the top of the ledger.
function ToolbarAction({ icon, label, disabled, onClick, title, shortcut }) {
  const btn = (
    <button
      onClick={onClick} disabled={disabled} title={shortcut ? undefined : (title || label)}
      className="hv-soft"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, height: 32, padding: '0 10px',
        border: 'none', borderRadius: 8, background: 'transparent',
        color: disabled ? 'var(--muted)' : 'var(--accent)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1,
      }}
    >
      {icon}<span>{label}</span>
    </button>
  );
  // With a shortcut, the hover tooltip carries the label + keycaps (and replaces
  // the native title). Disabled controls skip it — nothing to prompt.
  return shortcut && !disabled ? <Tooltip shortcut={shortcut}>{btn}</Tooltip> : btn;
}

export default function Transactions() {
  const { data: S, applyData, prefs, setPrefs, undo, redo, canUndo, canRedo, undoLabel, redoLabel } = useStore();
  // Full-width view: lifts the page's max-width and drops the table's card frame
  // so the rows use all the space available. On by default; the toggle only
  // stores an explicit `false` to opt back into the narrow, boxed layout.
  const wide = prefs.wide !== false;
  const { ask, notify, confirmOpen, shortcutsOpen } = useUI();
  const fmt = useMoney();
  const { openDrawer, drawer } = useDrawer();
  const navigate = useNavigate();
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
  const visibleIds = postedTx.map(t => t.id);
  const sel = visibleIds.filter(id => selected.has(id));
  const allVisibleSelected = sel.length > 0 && sel.length === visibleIds.length;
  const clearSel = () => setSelected(new Set());
  const clearSched = () => setSchedSel(new Set());
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
  const toggleSched = (key, on) => {
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
    notify('Transaction deleted.');
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
    return { label: 'Edit', icon: 'edit', onClick: () => { const id = t.id; clearSel(); openers.editTx(S, id, openDrawer); } };
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
    <div style={{ maxWidth: wide ? 'none' : 1180, margin: '0 auto', padding: wide ? '0 0 56px' : '24px 28px 56px' }}>
      {/* Wide mode is flush and seamless: no column gap, so the sections meet at
          a single divider line rather than sitting apart as separate cards. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: wide ? 0 : 14, animation: 'hsFade .25s ease' }}>
        {/* Balance strip: Cleared + Uncleared = Working (scoped to the account
            when one is selected). The account header now lives in the top bar. */}
        <PositionStrip compact wide={wide} accountId={accountId} />

        {/* One bar at a time: recorded selection wins, else the scheduled one.
            The two selections are mutually exclusive, so only one has a count. */}
        {sel.length > 0 ? (
          <BulkBar
            count={sel.length}
            total={fmt.moneyS(selectedTotal)}
            onClear={clearSel}
            actions={[
              { label: 'Mark cleared', onClick: () => bulkStatus('cleared'), keys: SHORTCUT_BY_ID.toggleCleared.keys },
              { label: 'Mark uncleared', onClick: () => bulkStatus('pending'), keys: SHORTCUT_BY_ID.toggleCleared.keys },
            ]}
            more={[
              singleEditItem(),
              { label: 'Duplicate', icon: 'duplicate', onClick: bulkDuplicate, keys: SHORTCUT_BY_ID.duplicate.keys },
              singleRepeatItem(),
              { divider: true },
              { label: 'Delete', icon: 'delete', onClick: bulkDelete, tone: 'neg', keys: SHORTCUT_BY_ID.delete.keys },
            ]}
          />
        ) : (
          <BulkBar count={schedSel.size} total={fmt.moneyS(schedSelectedTotal)} onClear={clearSched} actions={[]} more={schedMore()} />
        )}

        {/* Action toolbar — the All-Accounts reference row: Add Transaction on
            the left, Undo/Redo after a divider, then View + Search on the right. */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: wide ? '9px 18px' : '10px 14px',
          background: 'var(--surface)',
          ...(wide ? { borderBottom: '1px solid var(--border)' } : { border: '1px solid var(--border)', borderRadius: 12 }),
        }}>
          <ToolbarAction
            icon={<PlusCircle />} label="Add Transaction" disabled={addDisabled}
            title={addDisabled ? 'Add a bank account first' : 'Record an expense, income, transfer, refund, or adjustment'}
            shortcut={addDisabled ? undefined : SHORTCUT_BY_ID.addTx}
            onClick={() => openers.addTx(openDrawer)}
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

        {/* No overflow:hidden — it would clip the per-row ⋯ menu on the last rows. */}
        <section aria-label="Transaction list" style={{ background: 'var(--surface)', border: wide ? 'none' : '1px solid var(--border)', borderRadius: wide ? 0 : 12 }}>
          {(postedRows.length > 0 || scheduled.length > 0) && (
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
                  <th scope="col" style={{ ...th, padding: '9px 4px 9px 18px', minWidth: 34 }}>
                    <Checkbox
                      fill
                      checked={allVisibleSelected}
                      indeterminate={sel.length > 0 && !allVisibleSelected}
                      onChange={toggleAll}
                      label={allVisibleSelected ? 'Clear selection' : 'Select all ' + visibleIds.length + ' visible transactions'}
                    />
                  </th>
                  {columns.map(c => <SortableHeader key={c.key} col={c} sort={sort} onSort={onSort} />)}
                </tr>
              </thead>
              {scheduled.length > 0 && (
                <tbody>
                  <GroupHead
                    open={schedOpen} onToggle={() => setSchedOpen(o => !o)} label="SCHEDULED" bg="var(--warn-soft)" colSpan={gridColSpan}
                    count={scheduled.length + (scheduled.length === 1 ? ' item' : ' items')}
                    note={[
                      overdueCount > 0 ? overdueCount + ' overdue' : 'not yet spent',
                      // Say so rather than truncating silently: a folded reminder
                      // is a real future obligation the reader can't see.
                      hiddenRuleCount > 0 ? hiddenRuleCount + ' more later' : null,
                    ].filter(Boolean).join(' · ')}
                  />
                  {/* Scheduled rows are selectable now (keyed by row key, since a
                      reminder has no tx id), and their verbs live in the bulk bar
                      like recorded rows — no per-row ⋯ anywhere. */}
                  {schedOpen && scheduled.map(x => {
                    const key = schedKey(x);
                    return (
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
                {postedRows.map(t => (
                  <Row
                    key={t.id} t={t} selId={t.id} hideAccount={!!accountId}
                    checked={selected.has(t.id)} onToggleRow={toggleRow} focused={t.id === cursorId}
                  />
                ))}
              </tbody>
            </table>
          )}
          {list.length === 0 && monthTx.length > 0 && (
            <div style={{ padding: '44px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>No matches for your search</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>Try different words, or widen the date range in the header.</div>
              <button onClick={reset} className="hv-soft" style={{ marginTop: 12, height: 32, padding: '0 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Reset filters</button>
            </div>
          )}
          {monthTx.length === 0 && scheduled.length === 0 && (
            <div style={{ padding: '44px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{range.from || range.to ? 'Nothing recorded in ' + rangeLabel(range.from, range.to) : 'Nothing recorded yet'}</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4, maxWidth: '44ch', marginLeft: 'auto', marginRight: 'auto' }}>Transactions you add appear here with search and filters. Recording as you spend keeps your dashboard honest.</div>
              <button onClick={() => openers.addTx(openDrawer)} disabled={addDisabled} className="hv-accent" style={{ marginTop: 12, height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: addDisabled ? 'default' : 'pointer', opacity: addDisabled ? .45 : 1 }}>＋ Add transaction</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
