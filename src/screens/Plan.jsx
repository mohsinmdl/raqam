// Plan screen — YNAB-style envelope budget table (Phase 1, task 6).
// Groups -> categories, ASSIGNED / ACTIVITY / AVAILABLE columns, click-to-edit
// assigned cells, a Ready-to-Assign banner, and a one-click adoption path from
// the legacy per-category Budgets screen. Visual tokens follow
// docs/superpowers/specs/2026-08-08-ynab-budget-reference.md; math comes from
// src/lib/envelope.js (T3) and the CRUD in src/store/actions.js (T4/T5).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store/StoreProvider.jsx';
import { useMonth } from '../store/MonthContext.jsx';
import { useMoney, parseAmt } from '../lib/format.js';
import { envelopeFor } from '../lib/envelope.js';
import { nowIso } from '../lib/dates.js';
import { prevMonth, monthLabel, catRefs } from '../lib/calc.js';
import { useUI } from '../ui/UIProvider.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { resolveDisplayName } from '../lib/identity.js';
import { applyCalcExpr } from '../lib/calcExpr.js';
import { BUILTIN_VIEWS, MAX_NAME, normalizeViews, newView, reorderViews, visibleSections, normalizeBuiltins, reorderBuiltins, toggleBuiltinHidden, orderedBuiltinViews, builtinRows, isHiddenBuiltin } from '../lib/planViews.js';
import { hasTarget, targetNeeded } from '../lib/targets.js';
import { rangeBetween } from '../lib/rowCursor.js';
import PlanCategoryPicker from '../ui/PlanCategoryPicker.jsx';
import Inspector from '../ui/plan/Inspector.jsx';
import FilterPills from '../ui/plan/FilterPills.jsx';
import ViewEditorModal from '../ui/plan/ViewEditorModal.jsx';
import ManageViewsModal from '../ui/plan/ManageViewsModal.jsx';
import ActivityModal from '../ui/plan/ActivityModal.jsx';
import usePlanDnd from '../ui/plan/usePlanDnd.js';
import RecentMoves from '../components/RecentMoves.jsx';
import { ToolbarAction, PlusCircle, UndoIcon, RedoIcon } from '../ui/ToolbarAction.jsx';
import { SHORTCUT_BY_ID } from '../lib/shortcuts.js';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import EditNamePopover from '../ui/plan/EditNamePopover.jsx';
import { askDeleteCategory } from '../ui/categoryActions.js';
import { openers } from '../drawers/openers.js';
import {
  setAssigned, addCategoryGroup, setCategoryGroup, upsertCategory,
  adoptYnabTree, importBudgetsAsAssignments, moveAssigned,
  renameCategory, archiveCategory, renameCategoryGroup, deleteCategoryGroupWithEmpties,
} from '../store/actions.js';

// Synthetic group used only for rendering: categories with no groupId, or a
// groupId whose group no longer exists, land here — never written to the store.
const OTHER = { id: null, name: 'Other' };

// Leading columns match YNAB: a disclosure chevron FIRST (20px), then the
// selection checkbox (22px), then the name — so group names align exactly with
// the category names beneath them. Group rows fill the chevron cell with the
// collapse toggle; category rows leave it empty.
const ROW_COLS = { display: 'grid', gridTemplateColumns: '20px 22px minmax(0,2.2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1.1fr)', gap: 10, alignItems: 'center' };
// Column headers use the DESIGN.md "Label" role: a quiet small-caps table
// header — muted, semibold, lightly tracked — so the figures below lead.
const HEAD = { fontSize: 11.5, fontWeight: 600, letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--muted)' };
// Shared right inset for every numeric column value (header, group total, and
// category cell) so the amounts line up down each column regardless of whether
// the value is plain text, a click-to-edit button, or a rounded available pill.
const NUM_INSET = 8;
const popCard = { position: 'absolute', zIndex: 30, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)', padding: 12 };
const popBtnRow = { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 };
const popCancel = { height: 30, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5, cursor: 'pointer' };
const popOk = { height: 30, padding: '0 14px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' };

// Same dismissal contract as TxMonthNav / BulkBar's MoreMenu: outside mousedown
// closes, Escape closes via the capture phase so it never bubbles into a
// screen-level shortcut handler.
// `extraRef` covers a popover portalled outside `ref`'s subtree (via
// createPortal to document.body): a click inside it must not read as "outside".
function usePopoverDismiss(open, ref, onClose, extraRef) {
  useEffect(() => {
    if (!open) return;
    const onDown = e => {
      const inTrigger = ref.current && ref.current.contains(e.target);
      const inPortal = extraRef && extraRef.current && extraRef.current.contains(e.target);
      if (!inTrigger && !inPortal) onClose();
    };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, ref, onClose, extraRef]);
}

// Native checkbox, accent-tinted; indeterminate is only reachable via the
// property, so a ref effect mirrors the prop onto the DOM node.
function PlanCheckbox({ checked, indeterminate, onChange, label }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate && !checked; }, [indeterminate, checked]);
  return (
    <input ref={ref} type="checkbox" checked={checked} aria-label={label}
      onChange={onChange} onClick={e => e.stopPropagation()}
      style={{ width: 15, height: 15, margin: 0, accentColor: 'var(--accent)', cursor: 'pointer' }} />
  );
}

// Fixed-position placement for a row popover portalled to <body>. The category
// rows live inside the rounded plan-table wrapper (overflow:hidden for its
// corners), which would clip an absolutely-positioned card at the last row even
// when the page below has room. Portalling out sidesteps that: the card opens
// downward under its trigger (right edges aligned, matching the old right:0),
// `width` is its fixed width and `estHeight` a height estimate — it flips above
// only when the VIEWPORT itself lacks room below. A fixed card can't ride the
// content scroll, so we CLOSE on scroll (and if the anchor row unmounts) rather
// than let it drift over the header or freeze glued to an empty spot; resize
// just re-places it.
function usePopoverPosition(open, triggerRef, width, estHeight, onClose) {
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!open) { setPos(null); return undefined; }
    const place = () => {
      const el = triggerRef.current;
      if (!el) { onClose?.(); return; }
      const r = el.getBoundingClientRect();
      const gap = 6;
      const roomBelow = window.innerHeight - r.bottom;
      const up = roomBelow < estHeight && r.top > roomBelow;
      const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
      setPos({
        left, width,
        ...(up ? { bottom: window.innerHeight - r.top + gap } : { top: r.bottom + gap }),
      });
    };
    place();
    const onScroll = () => onClose?.();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open, triggerRef, width, estHeight, onClose]);
  return pos;
}

// Lighter flip check for popovers that stay in-flow (Add-category, view history):
// open UPWARD only when anchoring below the trigger would slide off the viewport
// bottom. Decided at open time from the trigger's live rect and a height estimate.
function flipIfLow(el, estHeight) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const below = window.innerHeight - r.bottom;
  // Flip only when the room above is actually better — on a short window
  // everything is "low", and flipping then just cuts the card off at the top.
  return below < estHeight && r.top > below;
}

// Adds a category inside `groupId` (null → left ungrouped, which the section
// builder below reads back into the implicit "Other" bucket). upsertCategory's
// form contract creates the record but never writes groupId, so the group is
// applied as a second pure step, chained inside the SAME applyData call: we
// read the just-created id back off the returned store (upsertCategory mints
// its own uid() internally and doesn't hand it back) by diffing category ids
// before/after, then pass it to setCategoryGroup.
function addCategoryToGroup(applyData, name, groupId) {
  applyData(data => {
    const before = new Set(data.categories.map(c => c.id));
    const withCat = upsertCategory(data, {
      form: {
        name, type: 'expense', icon: 'square', color: '#0F766E',
        description: '', sortOrder: 99, excludeFromBudget: false,
      },
    });
    const added = withCat.categories.find(c => !before.has(c.id));
    return added && groupId ? setCategoryGroup(withCat, { categoryId: added.id, groupId }) : withCat;
  });
}

function AdoptionBanner({ noGroups, needsImport, onAdopt, onImport, onDismiss }) {
  return (
    <div role="region" aria-label="Set up your budget" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 12, background: 'var(--soft)', border: '1px solid var(--border)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Set up your budget</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>
          {noGroups
            ? 'Organize your categories into groups, then import your standing budgets as this month’s assigned amounts.'
            : 'You have standing budgets that haven’t been imported as assigned amounts for this month yet.'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
        {noGroups && <button onClick={onAdopt} className="hv-accent" style={{ height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Organize into groups</button>}
        {needsImport && <button onClick={onImport} className="hv-soft" style={{ height: 34, padding: '0 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Import budgets</button>}
        <button onClick={onDismiss} aria-label="Dismiss" className="hv-soft" style={{ width: 34, height: 34, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--muted)', fontSize: 16, lineHeight: 1, cursor: 'pointer' }}>×</button>
      </div>
    </div>
  );
}

// RTA breakdown popover — opened by clicking the banner's label/amount.
// Itemizes how `rta` was reached: last month's leftover, this month's opening
// balances/income/assignments/uncategorized spend, and a derived overspending
// line so the rows sum to `rta` exactly (see the identity comment below).
// Zero rows are hidden; the total never is.
function RtaBreakdown({ env, prevRta, month, money, moneyS, fg, labelColor }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const close = () => setOpen(false);
  usePopoverDismiss(open, rootRef, close);

  const monthName = monthLabel(month).split(' ')[0];
  // Exact by construction: rearranging rta = prevRta + opening + income -
  // assigned - uncategorized - prevOverspend (envelope.js's own fold) for
  // prevOverspend is what makes the breakdown's rows sum to `rta`.
  // Derived, not read off env: this is the one term envelope.js doesn't hand
  // back directly, and the same fold identity that makes it exact also
  // guarantees it is >= 0 — it only ever subtracts from the displayed total.
  const overspend = prevRta + env.openingTotal + env.income - env.assignedTotal - env.uncategorized - env.rta;
  const rows = [
    { label: 'Left over from last month', value: prevRta },
    { label: '+ Opening balances', value: env.openingTotal },
    { label: '+ Inflow: income in ' + monthName, value: env.income },
    { label: '− Assigned in ' + monthName, value: -env.assignedTotal },
    { label: '− Uncategorized outflows', value: -env.uncategorized },
    { label: '− Last month’s overspending', value: -overspend },
  ].filter(r => r.value !== 0);

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)} aria-haspopup="dialog" aria-expanded={String(open)}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '8px 6px 12px 0', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ fontSize: 14, fontWeight: 400, color: labelColor }}>Ready to Assign</span>
        <span className="tnum" style={{ fontSize: 21, fontWeight: 700, color: fg }}>{money(env.rta)}</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Ready to Assign breakdown" style={{ ...popCard, top: 58, left: 0, width: 320 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Ready to Assign Breakdown</div>
          <div style={{ background: 'var(--elev)', borderRadius: 8, padding: '8px 10px' }}>
            {rows.map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '4px 0', fontSize: 12.5 }}>
                <span style={{ color: 'var(--muted)' }}>{r.label}</span>
                <span className="tnum">{moneyS(r.value)}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '4px 0', fontSize: 13, fontWeight: 700 }}>
              <span>Total Ready to Assign</span>
              <span className="tnum" style={{ color: env.rta > 0 ? 'var(--pos)' : 'inherit' }}>{money(env.rta)}</span>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10 }}>
            Ready to Assign is money that hasn’t been given a job yet. Assign it to one or more categories.
          </div>
        </div>
      )}
    </div>
  );
}

// Assign popover on the RTA banner. "⚡ Auto" is a disabled placeholder tab
// (targets land in a later phase); "Manually" moves a chosen amount out of
// Ready to Assign into one category via moveAssigned — one CRUD call, same
// contract the Available-pill "Move" popover will reuse later. The category
// picker is nested inside this same popover: PlanCategoryPicker is the panel,
// this component owns its own open/dismiss (and the nested picker's).
function AssignPopover({ rta, env, S, month, money, applyData }) {
  const { notify } = useUI();
  const [open, setOpen] = useState(false);
  // rta can be negative (overspent); a negative prefill would read as "assign
  // a negative amount", which moveAssigned rejects anyway (amt <= 0 no-ops).
  const [amount, setAmount] = useState(() => String(Math.max(0, rta)));
  const [to, setTo] = useState(null);
  const rootRef = useRef(null);

  const close = () => setOpen(false);
  usePopoverDismiss(open, rootRef, close);

  const openPopover = () => {
    setAmount(String(Math.max(0, rta)));
    setTo(null);
    setOpen(true);
  };

  const toCat = to && S.categories.find(c => c.id === to);
  const amt = parseAmt(amount);
  const canAssign = !!to && amt > 0;

  const confirm = () => {
    if (!canAssign || to === 'rta') return;
    const name = toCat ? toCat.name : to;
    applyData(data => moveAssigned(data, { from: 'rta', to, month, amount: parseAmt(amount) }));
    setOpen(false);
    notify('Assigned ' + money(amt) + ' to ' + name + '.');
  };

  return (
    <div ref={rootRef} style={{ position: 'relative', flex: 'none' }}>
      <button
        onClick={() => (open ? close() : openPopover())} aria-haspopup="dialog" aria-expanded={String(open)}
        className="hv-accent"
        style={{ height: 32, padding: '0 14px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
      >Assign ▾</button>
      {open && (
        // Left-anchored: the banner sits at the content's left edge, and a
        // right-anchored card would extend past the main box where its
        // overflow clips it at the sidebar boundary.
        <div role="dialog" aria-label="Assign Ready to Assign money" style={{ ...popCard, top: 40, left: 0, width: 320 }}>
          <div style={{ display: 'flex', gap: 14, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
            <span title="Targets coming later" style={{ padding: '0 2px 8px', fontSize: 13, fontWeight: 600, color: 'var(--muted)', cursor: 'not-allowed' }}>⚡ Auto</span>
            <span style={{ padding: '0 2px 8px', fontSize: 13, fontWeight: 600, color: 'var(--accent)', borderBottom: '2px solid var(--accent)' }}>Manually</span>
          </div>

          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Assign:</label>
          <input
            className="tnum" value={amount} inputMode="numeric"
            onFocus={e => e.target.select()}
            onChange={e => setAmount(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', height: 34, padding: '0 10px', textAlign: 'right', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, marginBottom: 10 }}
          />

          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>To:</label>
          <PlanCategoryPicker
            env={env} S={S} month={month} money={money} excludeRta
            value={to} onChange={setTo}
          />

          <div style={popBtnRow}>
            <button onClick={close} className="hv-soft" style={popCancel}>Cancel</button>
            <button
              onClick={confirm} disabled={!canAssign} className="hv-accent"
              style={{ ...popOk, opacity: canAssign ? 1 : .5, cursor: canAssign ? 'pointer' : 'not-allowed' }}
            >Assign</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Ready-to-Assign card. Lives at the top of the Plan inspector (right column),
// where it sits with the summary figures it derives from. State colours come
// from Raqam's own status tokens (the Signal-Only Rule): positive money to
// assign reads in the ledger-green pos tokens, zero is neutral, negative
// (overspent) is the negative tokens. Stacks the clickable label/amount (opens
// RtaBreakdown) over a teal Assign ▾ button (opens AssignPopover) — both
// left-aligned on a shared left rail, which also keeps their popovers anchored
// at the card's left edge, inside the narrow inspector column.
function RtaBanner({ env, prevRta, month, money, moneyS, S, applyData }) {
  const rta = env.rta;
  const bg = rta > 0 ? 'var(--pos-soft)' : rta === 0 ? 'var(--elev)' : 'var(--neg-soft)';
  const fg = rta > 0 ? 'var(--pos)' : rta === 0 ? 'var(--muted)' : 'var(--neg)';
  const labelColor = 'var(--muted)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: '10px 14px 14px', borderRadius: 12, background: bg }}>
      <RtaBreakdown env={env} prevRta={prevRta} month={month} money={money} moneyS={moneyS} fg={fg} labelColor={labelColor} />
      {rta !== 0 && <AssignPopover rta={rta} env={env} S={S} month={month} money={money} applyData={applyData} />}
    </div>
  );
}

// Two-state segmented control, same pill-toggle pattern used elsewhere in the
// app; persisted via prefs.planView.
function ViewToggle({ view, onChange }) {
  const val = view === 'compact' ? 'compact' : 'progress';
  const seg = (key, label) => (
    <button
      key={key} onClick={() => onChange(key)} aria-pressed={val === key}
      style={{
        height: 28, padding: '0 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
        // Flat selection cue (no in-page shadow — Flat Ledger Rule): the active
        // segment is a white surface defined by a 1px hairline against the track.
        border: val === key ? '1px solid var(--border)' : '1px solid transparent',
        background: val === key ? 'var(--surface)' : 'transparent', color: val === key ? 'var(--text)' : 'var(--muted)',
      }}
    >{label}</button>
  );
  return (
    <div role="group" aria-label="Row view" style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 8, background: 'var(--track)' }}>
      {seg('progress', 'Progress')}
      {seg('compact', 'Compact')}
    </div>
  );
}

// Fit/full-width toggle, mirroring the All-Accounts (Transactions) control.
function WideIcon() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 8L3 12l5 4" /><path d="M16 8l5 4-5 4" /><path d="M3 12h18" />
    </svg>
  );
}
function WidthToggle({ wide, onToggle }) {
  return (
    <button
      onClick={onToggle} aria-pressed={wide}
      aria-label={wide ? 'Fit budget to page width' : 'Expand budget to full width'}
      title={wide ? 'Fit width' : 'Full width'} className="hv-soft"
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 28, border: '1px solid var(--border)', borderRadius: 7, background: wide ? 'var(--elev)' : 'transparent', color: wide ? 'var(--text)' : 'var(--muted)', cursor: 'pointer', flex: 'none' }}
    >
      <WideIcon />
    </button>
  );
}

// Toolbar "+ Category Group": name input, Cancel/OK, caret-topped popover.
function AddGroupButton({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const rootRef = useRef(null);
  const close = () => setOpen(false);
  usePopoverDismiss(open, rootRef, close);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName(''); setOpen(false);
  };

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <ToolbarAction
        icon={<PlusCircle />} label="Category Group"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog" aria-expanded={String(open)} aria-label="Add category group"
      />
      {open && (
        <div role="dialog" aria-label="Add category group" style={{ ...popCard, top: 38, left: 0, width: 240 }}>
          <input
            autoFocus className="field" placeholder="Group name" value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            style={{ height: 34, fontSize: 13 }}
          />
          <div style={popBtnRow}>
            <button onClick={() => { setOpen(false); setName(''); }} className="hv-soft" style={popCancel}>Cancel</button>
            <button onClick={submit} className="hv-accent" style={popOk}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Group (master) row: collapse chevron, name, a hover "+" that opens an inline
// add-category popover, and the group's totals per column.
function GroupRow({ group, totals, cats, collapsed, onToggle, beforeGroupId, firstCatId, ctx }) {
  const { S, applyData, money, selected, setMany, dnd } = ctx;
  const { notify, ask } = useUI();
  const { openDrawer } = useDrawer();
  // The synthetic "Other" (id null) is never draggable, but a group dropped on
  // it lands at the end of the real groups (beforeId → null, since Other's id
  // is null), and it still accepts a category drop (→ ungroup). So the group
  // insertion line IS allowed above Other — that is the "move to last" slot.
  const isOther = group.id == null;
  const showGroupLineAbove = dnd.target && dnd.target.kind === 'group'
    && dnd.target.beforeId === group.id && dnd.drag?.ids[0] !== group.id;
  const [hover, setHover] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addUp, setAddUp] = useState(false);
  const [name, setName] = useState('');
  const popRef = useRef(null);
  const addBtnRef = useRef(null);
  const close = () => setAddOpen(false);
  usePopoverDismiss(addOpen, popRef, close);
  // Flip the add-category popover above the "+" when the row is near the
  // viewport bottom (the last group otherwise opens off-screen). ~120 ≈ input
  // + button row + padding.
  const openAdd = () => { setAddUp(flipIfLow(addBtnRef.current, 120)); setAddOpen(true); };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    addCategoryToGroup(applyData, trimmed, group.id);
    setName(''); setAddOpen(false);
  };

  const t = totals || { assigned: 0, activity: 0, available: 0 };

  return (
    <div
      className="plan-row"
      draggable={!isOther}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onDragStart={e => {
        if (isOther) return;  // "Other" is a drop target but never draggable
        if (e.target.closest('input, textarea, [role="dialog"], [contenteditable]')) { e.preventDefault(); return; }
        dnd.startGroupDrag(e, group.id, group.name);
      }}
      onDragEnd={dnd.endDrag}
      onDragOver={e => {
        if (dnd.drag?.kind === 'group') dnd.overGroupGap(e, { beforeGroupId });
        else if (dnd.drag?.kind === 'category') dnd.overGroupHeader(e, { groupId: group.id, firstCatId });
      }}
      onDrop={dnd.drop}
      style={{ ...ROW_COLS, position: 'relative', height: 40, padding: '0 16px', background: 'var(--track)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}
    >
      {showGroupLineAbove && (
        <div aria-hidden="true" style={{ position: 'absolute', top: -1, left: 16, right: 16, height: 2, background: 'var(--accent)', borderRadius: 1 }} />
      )}
      <button
        onClick={onToggle} aria-label={(collapsed ? 'Expand ' : 'Collapse ') + group.name} aria-expanded={String(!collapsed)}
        style={{ width: 20, height: 20, border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 11, flex: 'none', transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .12s ease' }}
      >▾</button>
      <PlanCheckbox label={'Select ' + group.name + ' categories'}
        checked={cats.length > 0 && cats.every(c => selected.has(c.id))}
        indeterminate={cats.some(c => selected.has(c.id))}
        onChange={() => setMany(cats.map(c => c.id), !cats.every(c => selected.has(c.id)))} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {group.id ? (
          <EditNamePopover
            name={group.name} title={'Rename ' + group.name} align="left"
            triggerClassName="hv-text"
            triggerStyle={{ display: 'block', minWidth: 0, maxWidth: '100%', border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontSize: 16, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}
            onRename={nm => { applyData(d => renameCategoryGroup(d, { id: group.id, name: nm })); notify('Group renamed to “' + nm + '”.'); }}
            onDelete={async () => {
              // Check the FULL group membership (all statuses) — `cats` is
              // active-only, but the delete reducer touches every category with
              // this groupId, so an archived category that still carries refs
              // (incl. assignments) must be seen here or its money is dropped
              // silently. Any referenced category → route to the reassign modal.
              const groupCats = S.categories.filter(c => c.groupId === group.id);
              const hasRefs = groupCats.some(c => catRefs(S, c.id).total > 0);
              if (hasRefs) { openers.reassignGroup(group.id, openDrawer); return; }
              const n = groupCats.length;
              const ok = await ask({
                title: 'Delete group “' + group.name + '”?',
                body: n > 0
                  ? 'Its ' + n + ' categor' + (n === 1 ? 'y has' : 'ies have') + ' no transactions, budgets, or assignments, so they’ll be deleted along with the group.'
                  : 'The group has no categories — it’ll just be removed.',
                action: 'Delete group',
                tone: 'neg',
              });
              if (!ok) return;
              applyData(d => deleteCategoryGroupWithEmpties(d, { id: group.id }));
              notify('Group “' + group.name + '” deleted.');
            }}
          >{group.name}</EditNamePopover>
        ) : (
          <span style={{ fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.name}</span>
        )}
        {(hover || addOpen) && (
          <span ref={popRef} style={{ position: 'relative', flex: 'none' }}>
            <button
              ref={addBtnRef}
              onClick={() => (addOpen ? close() : openAdd())} aria-label={'Add category to ' + group.name}
              aria-haspopup="dialog" aria-expanded={String(addOpen)}
              style={{ width: 20, height: 20, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--accent)', fontSize: 12, lineHeight: 1, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >＋</button>
            {addOpen && (
              <div role="dialog" aria-label={'Add category to ' + group.name} style={{ ...popCard, ...(addUp ? { bottom: 26 } : { top: 26 }), left: 0, width: 220 }}>
                <input
                  autoFocus className="field" placeholder="Category name" value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submit(); }}
                  style={{ height: 34, fontSize: 13 }}
                />
                <div style={popBtnRow}>
                  <button onClick={() => { setAddOpen(false); setName(''); }} className="hv-soft" style={popCancel}>Cancel</button>
                  <button onClick={submit} className="hv-accent" style={popOk}>OK</button>
                </div>
              </div>
            )}
          </span>
        )}
      </div>
      <div className="tnum" style={{ textAlign: 'right', paddingRight: NUM_INSET, fontSize: 13, fontWeight: 600 }}>{money(t.assigned)}</div>
      <div className="tnum" style={{ textAlign: 'right', paddingRight: NUM_INSET, fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>{money(t.activity)}</div>
      <div className="tnum" style={{ textAlign: 'right', paddingRight: NUM_INSET, fontSize: 13, fontWeight: 600 }}>{money(t.available)}</div>
    </div>
  );
}

// DD/MM/YYYY for MovesPopover's DATE column — no other screen needed a
// human date format in this shape yet, so it lives here rather than dates.js.
function fmtDMY(iso) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return dd + '/' + mm + '/' + d.getFullYear();
}

const OP_GLYPHS = ['+', '−', '×', '÷'];

// The 2x2 calculator-operator grid under the ASSIGNED editor. Every button
// mousedown-prevents its default so the ASSIGNED input never blurs (and thus
// never commits) while the user is just picking an operator — onPick handles
// the actual draft mutation and refocuses the input itself.
function OpPopover({ onPick }) {
  return (
    <div
      role="dialog" aria-label="Calculator operators"
      onMouseDown={e => e.preventDefault()}
      style={{ ...popCard, top: 36, left: 0, width: 92, padding: 6 }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        {OP_GLYPHS.map(op => (
          <button
            key={op} type="button" onClick={() => onPick(op)}
            className="hv-elev"
            style={{ height: 28, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--elev)', color: 'var(--text)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >{op}</button>
        ))}
      </div>
    </div>
  );
}

// Read-only Moves history for one category+month, opened by the ASSIGNED
// editor's clock button. Replays S.audit into human rows rather than owning
// any state of its own. Unlike PlanCategoryPicker, the dismiss wiring does
// NOT live inside this component: the trigger button lives outside the
// card's own DOM subtree, so a ref scoped to just this card would leave the
// clock button "outside" for the outside-mousedown check — closing the
// popover on mousedown, then the same click's onClick immediately reopening
// it (I1). The host (CategoryRow) wraps the button and this popover in one
// shared ref instead and owns usePopoverDismiss.
//
// Move rows are found via after.month/from/to; direct set/create/update/
// delete rows via the entityId convention setAssigned uses (categoryId +
// '|' + month). Import rows (importBudgetsAsAssignments) write one summary
// row per import, keyed 'import|'+month rather than this category — surfaced
// here too (amount omitted, rendered '—') since they DID affect this
// category's assigned amount that month.
function MovesPopover({ open, up, cat, month, S, money, onClose }) {
  const { user } = useAuth();
  const { prefs } = useStore();
  if (!open) return null;

  const email = user?.email || '';
  const displayName = resolveDisplayName(prefs.displayName, email);
  const initial = (displayName.charAt(0) || '?').toUpperCase();

  const nameOf = id => (id === 'rta' ? 'Ready to Assign' : (S.categories.find(c => c.id === id) || {}).name || id);
  const key = cat.id + '|' + month;
  const importKey = 'import|' + month;
  const rows = (S.audit || [])
    .filter(a => a.entityType === 'assignment' && (
      a.action === 'move'
        ? a.after?.month === month && (a.after.from === cat.id || a.after.to === cat.id)
        : a.entityId === key || a.entityId === importKey
    ))
    .map(a => ({
      id: a.id,
      at: a.at,
      amount: a.entityId === importKey ? null : (a.after?.amount ?? 0),
      label: a.entityId === importKey ? 'Imported from budgets'
        : a.action === 'move'
          ? (a.after.to === cat.id ? 'Moved from ' + nameOf(a.after.from) : 'Moved to ' + nameOf(a.after.to))
          : a.action === 'delete' ? 'Removed' : 'Assigned',
    }));

  return (
    <div
      role="dialog" aria-label="Assignment history"
      onMouseDown={e => e.preventDefault()}
      // Below the editor it sits under OpPopover's footprint (top:36 + ~74px
      // card + 8px gap) so the two never overlap; flipped up (bottom rows) it
      // opens above the cell, clear of OpPopover entirely.
      style={{ ...popCard, ...(up ? { bottom: 40 } : { top: 118 }), right: 0, width: 340, textAlign: 'left' }}
    >
      <div style={{ fontSize: 14, fontWeight: 700 }}>Moves</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>{cat.name}</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: '10px 0' }}>No assignment activity for this month yet.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--muted)', padding: '0 0 6px' }}>DATE</th>
              <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--muted)', padding: '0 0 6px' }}>MOVE</th>
              <th style={{ textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--muted)', padding: '0 0 6px' }}>AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 0', fontSize: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: 999, flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 9.5, fontWeight: 700 }}>{initial}</span>
                    <span className="tnum">{fmtDMY(r.at)}</span>
                  </div>
                </td>
                <td style={{ padding: '6px 0', fontSize: 12.5 }}>{r.label}</td>
                <td className="tnum" style={{ padding: '6px 0', fontSize: 12.5, textAlign: 'right' }}>{r.amount === null ? '—' : money(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={popBtnRow}>
        <button onClick={onClose} className="hv-soft" style={popCancel}>Close</button>
      </div>
    </div>
  );
}

// AVAILABLE pill for an overspent (red) category: covers the shortfall by
// pulling a FIXED amount (money(-available)) in from another envelope (or
// RTA) — only the source is picked. Self-contained trigger+popover, same
// shape as AssignPopover.
function CoverPopover({ cat, month, available, env, S, money, applyData }) {
  const { notify } = useUI();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(null);
  const rootRef = useRef(null);
  const popRef = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  usePopoverDismiss(open, rootRef, close, popRef);
  // 300 = card width; 230 ≈ the card alone — the picker's list overlays and flips on its own.
  const pos = usePopoverPosition(open, rootRef, 300, 230, close);

  const openPopover = () => { setFrom(null); setOpen(true); };

  const fromCat = from && from !== 'rta' ? S.categories.find(c => c.id === from) : null;
  const fromLabel = from === 'rta' ? 'Ready to Assign' : (fromCat ? fromCat.name : null);
  const canCover = !!from;
  const amount = -available;

  const confirm = () => {
    // moveAssigned itself no-ops on amount<=0 or from===to; check here too so
    // notify() never fires for a commit that changed nothing.
    if (!canCover || amount <= 0 || from === cat.id) return;
    applyData(data => moveAssigned(data, { from, to: cat.id, month, amount }));
    setOpen(false);
    notify('Covered ' + money(amount) + ' from ' + fromLabel + '.');
  };

  return (
    <span ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => (open ? close() : openPopover())} aria-haspopup="dialog" aria-expanded={String(open)}
        className="tnum hv-elev"
        style={{ display: 'inline-block', minWidth: 72, padding: `4px ${NUM_INSET}px`, borderRadius: 999, border: 'none', background: 'var(--neg-soft)', color: 'var(--neg)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
      >{money(available)}</button>
      {open && pos && createPortal(
        <div ref={popRef} role="dialog" aria-label="Cover overspending" style={{ ...popCard, position: 'fixed', ...pos, textAlign: 'left' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Cover overspending from</div>
          <div className="tnum" style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>{money(amount)}</div>
          <PlanCategoryPicker
            env={env} S={S} month={month} money={money} excludeId={cat.id}
            value={from} onChange={setFrom}
          />
          <div style={popBtnRow}>
            <button onClick={close} className="hv-soft" style={popCancel}>Cancel</button>
            <button
              onClick={confirm} disabled={!canCover} className="hv-accent"
              style={{ ...popOk, opacity: canCover ? 1 : .5, cursor: canCover ? 'pointer' : 'not-allowed' }}
            >OK</button>
          </div>
        </div>,
        document.body
      )}
    </span>
  );
}

// AVAILABLE pill for a positive (green) category: moves leftover money OUT to
// another envelope (or RTA); amount defaults to the full balance but is
// editable, mirroring AssignPopover's amount field.
function MovePopover({ cat, month, available, env, S, money, applyData }) {
  const { notify } = useUI();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(() => String(available));
  const [to, setTo] = useState(null);
  const rootRef = useRef(null);
  const popRef = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  usePopoverDismiss(open, rootRef, close, popRef);
  // 300 = card width; 230 ≈ the card alone — the picker's list overlays and flips on its own.
  const pos = usePopoverPosition(open, rootRef, 300, 230, close);

  const openPopover = () => { setAmount(String(available)); setTo(null); setOpen(true); };

  const toCat = to && to !== 'rta' ? S.categories.find(c => c.id === to) : null;
  const toLabel = to === 'rta' ? 'Ready to Assign' : (toCat ? toCat.name : null);
  const amt = parseAmt(amount);
  const canMove = !!to && amt > 0;

  const confirm = () => {
    // moveAssigned itself no-ops on amount<=0 or from===to; check here too so
    // notify() never fires for a commit that changed nothing.
    if (!canMove || to === cat.id) return;
    applyData(data => moveAssigned(data, { from: cat.id, to, month, amount: amt }));
    setOpen(false);
    notify('Moved ' + money(amt) + ' to ' + toLabel + '.');
  };

  return (
    <span ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => (open ? close() : openPopover())} aria-haspopup="dialog" aria-expanded={String(open)}
        className="tnum hv-elev"
        style={{ display: 'inline-block', minWidth: 72, padding: `4px ${NUM_INSET}px`, borderRadius: 999, border: 'none', background: 'var(--pos-soft)', color: 'var(--pos)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
      >{money(available)}</button>
      {open && pos && createPortal(
        <div ref={popRef} role="dialog" aria-label="Move available money" style={{ ...popCard, position: 'fixed', ...pos, textAlign: 'left' }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Move:</label>
          <input
            className="tnum" value={amount} inputMode="numeric"
            onFocus={e => e.target.select()}
            onChange={e => setAmount(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', height: 34, padding: '0 10px', textAlign: 'right', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, marginBottom: 10 }}
          />
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>To:</label>
          <PlanCategoryPicker
            env={env} S={S} month={month} money={money} excludeId={cat.id}
            value={to} onChange={setTo}
          />
          <div style={popBtnRow}>
            <button onClick={close} className="hv-soft" style={popCancel}>Cancel</button>
            <button
              onClick={confirm} disabled={!canMove} className="hv-accent"
              style={{ ...popOk, opacity: canMove ? 1 : .5, cursor: canMove ? 'pointer' : 'not-allowed' }}
            >OK</button>
          </div>
        </div>,
        document.body
      )}
    </span>
  );
}

// Category (sub) row. ASSIGNED is click-to-edit (with a calculator-expression
// commit path — see applyCalcExpr — an operator popover, and a Moves-history
// popover); ACTIVITY is a signed muted number; AVAILABLE is a coloured pill
// that opens Cover/Move popovers when non-zero. In "progress" view a thin bar
// + note show spend against (carryIn + assigned); "compact" view drops both.
function CategoryRow({ cat, row, sectionGroupId, ctx }) {
  const { month, applyData, money, moneyS, view, env, S, selected, toggleSelect, selectRow, onOpenActivity, dnd, cursorId } = ctx;
  const { notify, ask } = useUI();
  const { openDrawer } = useDrawer();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyUp, setHistoryUp] = useState(false);
  const cancelledRef = useRef(false);
  const inputRef = useRef(null);
  const historyRef = useRef(null);
  const closeHistory = () => setHistoryOpen(false);
  // Shared ref wraps BOTH the clock trigger and MovesPopover (I1): if the ref
  // only wrapped the popover card, the trigger button would read as "outside"
  // on its own mousedown, so the dismiss handler would close the popover a
  // beat before onClick's toggle ran — and the toggle would then reopen it,
  // making the trigger unable to ever close its own popover.
  usePopoverDismiss(historyOpen, historyRef, closeHistory);

  useEffect(() => {
    if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [editing]);

  const r = row || { assigned: 0, activity: 0, available: 0, carryIn: 0 };

  const startEdit = () => {
    cancelledRef.current = false;
    setDraft(r.assigned ? String(r.assigned) : '');
    setHistoryOpen(false);
    setEditing(true);
  };
  // Calculator commit: applyCalcExpr(current, draft) → null means the text
  // doesn't parse (or divides by zero) — stay in edit mode with the text
  // selected so the user can retype, exactly like a bad formula in a
  // spreadsheet cell. A number commits via ONE setAssigned call. Guarded by
  // cancelledRef the same way the pre-calculator version was: Escape sets
  // that ref before tearing down the input, so if blur still fires on
  // teardown this bails out instead of re-committing. Any further duplicate
  // commit (e.g. Enter immediately followed by a teardown blur) is a no-op
  // in practice too — setAssigned itself skips the write when the amount is
  // unchanged.
  const commit = () => {
    if (cancelledRef.current) { cancelledRef.current = false; return; }
    const v = applyCalcExpr(r.assigned, draft);
    if (v === null) {
      if (inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
      return;
    }
    setEditing(false);
    applyData(data => setAssigned(data, { categoryId: cat.id, month, amount: v }));
  };
  const cancel = () => { cancelledRef.current = true; setEditing(false); };

  // Inserts an operator glyph into the draft, replacing any existing leading
  // operator (calcExpr only ever looks at the first character). The op
  // buttons mousedown-prevent their default so the input never loses focus in
  // the first place; this focus() is a harmless belt-and-suspenders per the
  // spec's "refocuses the input".
  const insertOp = op => {
    setDraft(d => {
      const s = String(d ?? '');
      const isLeadingOp = OP_GLYPHS.includes(s[0]) || s[0] === '-' || s[0] === '*' || s[0] === '/';
      return op + (isLeadingOp ? s.slice(1) : s);
    });
    if (inputRef.current) inputRef.current.focus();
  };

  const spend = Math.max(0, -r.activity);
  const overspent = r.available < 0;
  let target, funded, pct, subLabel;
  if (hasTarget(cat)) {
    target = cat.targetAmount;
    funded = cat.targetMode === 'setaside' ? r.assigned : r.available;
    pct = target > 0 ? Math.min(1, Math.max(0, funded / target)) : 0;
    const need = targetNeeded(r, cat);
    subLabel = need > 0 ? 'Needs ' + money(need) + ' more' : 'Funded';
  } else {
    target = r.carryIn + r.assigned;
    pct = target > 0 ? Math.min(1, spend / target) : (spend > 0 ? 1 : 0);
    subLabel = 'Spent ' + money(spend) + ' of ' + money(target);
  }
  const barColor = overspent ? 'var(--neg)' : 'var(--pos)';

  const pillBg = r.available > 0 ? 'var(--pos-soft)' : r.available < 0 ? 'var(--neg-soft)' : 'var(--elev)';
  const pillFg = r.available > 0 ? 'var(--pos)' : r.available < 0 ? 'var(--neg)' : 'var(--muted)';

  // Insertion line above this row when it's the current category drop target
  // (and not itself being dragged).
  const showLineAbove = dnd.target && dnd.target.kind === 'category'
    && (dnd.target.groupId ?? null) === (sectionGroupId ?? null)
    && dnd.target.beforeId === cat.id
    && !dnd.drag?.ids.includes(cat.id);

  return (
    <div
      className="plan-row"
      draggable
      onClick={e => {
        if (e.target.closest('button, input, textarea, [role="dialog"], [data-noselect]')) return;
        selectRow(cat.id, e);
      }}
      onDragStart={e => {
        // The whole row is the drag handle; but a drag that begins on an
        // editable field or an open popover should stay a text/pointer
        // interaction, not a reorder.
        if (e.target.closest('input, textarea, [role="dialog"], [contenteditable]')) { e.preventDefault(); return; }
        dnd.startCategoryDrag(e, cat.id, cat.name);
      }}
      onDragEnd={dnd.endDrag}
      onDragOver={e => dnd.overCategory(e, { groupId: sectionGroupId, beforeId: cat.id })}
      onDrop={dnd.drop}
      style={{ ...ROW_COLS, position: 'relative', minHeight: 44, padding: '7px 16px', boxShadow: cat.id === cursorId ? 'inset 3px 0 0 var(--accent)' : undefined, background: selected.has(cat.id) ? 'var(--soft)' : 'var(--surface)', borderBottom: '1px solid var(--border)' }}
    >
      {showLineAbove && (
        <div aria-hidden="true" style={{ position: 'absolute', top: -1, left: 16, right: 16, height: 2, background: 'var(--accent)', borderRadius: 1 }} />
      )}
      {/* Empty leading cell — keeps the checkbox aligned under the group
          chevron now that the drag handle is gone (the whole row drags). */}
      <span aria-hidden="true" />
      <PlanCheckbox label={'Select ' + cat.name} checked={selected.has(cat.id)} onChange={() => toggleSelect(cat.id, true)} />
      <div style={{ minWidth: 0 }}>
        <EditNamePopover
          name={cat.name} title={'Edit ' + cat.name} align="left"
          triggerClassName="hv-text"
          triggerStyle={{ display: 'block', maxWidth: '100%', border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontSize: 16, fontWeight: 500, color: 'var(--text)', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}
          onRename={nm => { applyData(d => renameCategory(d, { id: cat.id, name: nm })); notify('Renamed to “' + nm + '”.'); }}
          onHide={() => { applyData(d => archiveCategory(d, { id: cat.id })); notify('“' + cat.name + '” hidden.'); }}
          onDelete={() => askDeleteCategory(cat, { S, ask, notify, applyData, openDrawer })}
        >{cat.name}</EditNamePopover>
        {view !== 'compact' && (
          <div style={{ marginTop: 4 }}>
            <div style={{ height: 4, borderRadius: 2, background: 'var(--track)', overflow: 'hidden' }}>
              <div style={{ width: (pct * 100) + '%', height: '100%', background: barColor }} />
            </div>
            <div className="tnum" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{subLabel}</div>
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right', position: 'relative' }}>
        {editing ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 30, padding: '0 6px', border: '1px solid var(--accent)', borderRadius: 6, background: 'var(--surface)' }}>
              <span aria-hidden="true" style={{ flex: 'none', fontSize: 11, letterSpacing: '-.5px', color: 'var(--muted)', userSelect: 'none' }}>+−×÷</span>
              <input
                ref={inputRef} inputMode="numeric" className="tnum"
                value={draft} onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') { e.stopPropagation(); cancel(); } }}
                onBlur={commit}
                style={{ flex: 1, minWidth: 0, height: '100%', padding: 0, textAlign: 'right', border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 500 }}
              />
              <span ref={historyRef} style={{ flex: 'none' }}>
                <button
                  type="button" onMouseDown={e => e.preventDefault()}
                  onClick={() => { setHistoryUp(flipIfLow(historyRef.current, 380)); setHistoryOpen(o => !o); }}
                  aria-label="Assignment history" aria-haspopup="dialog" aria-expanded={String(historyOpen)}
                  style={{ width: 20, height: 20, border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >🕐</button>
                <MovesPopover open={historyOpen} up={historyUp} cat={cat} month={month} S={S} money={money} onClose={closeHistory} />
              </span>
            </div>
            <OpPopover onPick={insertOp} />
          </>
        ) : (
          <button
            onClick={startEdit} className="tnum hv-elev"
            style={{ width: '100%', height: 30, padding: `0 ${NUM_INSET}px`, textAlign: 'right', border: '1px solid transparent', borderRadius: 6, background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >{money(r.assigned)}</button>
        )}
      </div>
      <div data-noselect style={{ textAlign: 'right' }}>
        <button
          onClick={() => onOpenActivity(cat)} className="tnum hv-soft"
          aria-label={'Activity for ' + cat.name}
          style={{ padding: `2px ${NUM_INSET}px`, border: 'none', borderRadius: 6, background: 'transparent', color: 'var(--muted)', fontSize: 14, fontWeight: 500, cursor: 'pointer', textDecoration: 'none' }}
          onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; }}
          onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
        >{moneyS(r.activity)}</button>
      </div>
      <div style={{ textAlign: 'right' }}>
        {r.available === 0 ? (
          <span className="tnum" style={{ display: 'inline-block', minWidth: 72, padding: `4px ${NUM_INSET}px`, borderRadius: 999, background: pillBg, color: pillFg, fontSize: 13, fontWeight: 600 }}>{money(r.available)}</span>
        ) : r.available < 0 ? (
          <CoverPopover cat={cat} month={month} available={r.available} env={env} S={S} money={money} applyData={applyData} />
        ) : (
          <MovePopover cat={cat} month={month} available={r.available} env={env} S={S} money={money} applyData={applyData} />
        )}
      </div>
    </div>
  );
}

export default function Plan() {
  const { data: S, applyData, prefs, setPrefs, undo, redo, canUndo, canRedo, undoLabel, redoLabel } = useStore();
  const { month } = useMonth();
  const { money, moneyS } = useMoney();

  const env = useMemo(() => envelopeFor(S, month, nowIso()), [S, month]);
  const prevRta = useMemo(() => envelopeFor(S, prevMonth(month), nowIso()).rta, [S, month]);
  const envAt = useMemo(() => {
    const cache = new Map();
    return m => { if (!cache.has(m)) cache.set(m, envelopeFor(S, m, nowIso())); return cache.get(m); };
  }, [S]);

  const [collapsed, setCollapsed] = useState(() => new Set());
  const toggleGroup = key => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const [selected, setSelected] = useState(() => new Set());
  // The row a shift-range extends FROM — set by every non-shift interaction
  // (plain/cmd click, checkbox), same anchor model as the Transactions table.
  const [anchorId, setAnchorId] = useState(null);
  // The keyboard cursor (active row), shown as a left accent bar and used as
  // Cmd+A's group reference. Independent of selection; defaults to the first
  // visible category (see effectiveCursorId below), matching the Transactions
  // table's cursor model.
  const [cursorId, setCursorId] = useState(null);
  const activeCatIds = useMemo(
    () => (S.categories || []).filter(c => c.type === 'expense' && c.status === 'active').map(c => c.id),
    [S.categories],
  );
  const toggleSelect = (id, additive) => {
    setAnchorId(id);
    setCursorId(id);
    setSelected(prev => {
      const next = additive ? new Set(prev) : new Set();
      if (prev.has(id) && (additive || prev.size === 1)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const setMany = (ids, on) => setSelected(prev => {
    const next = new Set(prev);
    ids.forEach(id => { if (on) next.add(id); else next.delete(id); });
    return next;
  });
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') setSelected(prev => (prev.size ? new Set() : prev)); };
    document.addEventListener('keydown', onKey); // NOT capture — popover Escape (capture + stopPropagation) wins
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  // Prune selection of ids that stop existing (archive/delete) — the sections
  // memo below is the wrong place for this since it only tracks display
  // grouping, not the selection Set's own lifecycle.
  useEffect(() => {
    setSelected(prev => {
      const live = new Set(activeCatIds);
      const next = new Set([...prev].filter(id => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [activeCatIds]);

  const groupsSorted = useMemo(
    () => [...(S.categoryGroups || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name)),
    [S.categoryGroups],
  );
  const groupIds = useMemo(() => new Set(groupsSorted.map(g => g.id)), [groupsSorted]);

  // Sections carry their own totals (summed from env.rows over ACTIVE
  // categories only) rather than env.groupTotals: that map is folded over
  // every expense category including archived ones — correct for the RTA
  // fold, wrong for a header total the screen only ever shows next to active
  // rows. A dangling groupId (group deleted, or never set) is also
  // re-bucketed into "Other" here, independent of envelope.js's own keying.
  const sections = useMemo(() => {
    const activeCats = (S.categories || []).filter(c => c.type === 'expense' && c.status === 'active');
    const byGroup = new Map();
    activeCats.forEach(c => {
      const key = c.groupId && groupIds.has(c.groupId) ? c.groupId : 'other';
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key).push(c);
    });
    byGroup.forEach(list => list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name)));
    const totalsFor = cats => cats.reduce((acc, c) => {
      const r = env.rows.get(c.id) || { assigned: 0, activity: 0, available: 0 };
      acc.assigned += r.assigned; acc.activity += r.activity; acc.available += r.available;
      return acc;
    }, { assigned: 0, activity: 0, available: 0 });
    const out = groupsSorted.map(g => {
      const cats = byGroup.get(g.id) || [];
      return { group: g, key: g.id, cats, totals: totalsFor(cats) };
    });
    const other = byGroup.get('other') || [];
    if (other.length) out.push({ group: OTHER, key: 'other', cats: other, totals: totalsFor(other) });
    return out;
  }, [S.categories, groupsSorted, groupIds, env]);

  const views = useMemo(() => normalizeViews(prefs.planViews, S.categories), [prefs.planViews, S.categories]);
  const builtinPref = useMemo(() => normalizeBuiltins(prefs.builtinViews), [prefs.builtinViews]);
  const builtinPills = useMemo(() => orderedBuiltinViews(builtinPref), [builtinPref]);
  const builtinManageRows = useMemo(() => builtinRows(builtinPref), [builtinPref]);
  // A built-in that's hidden must not keep filtering invisibly — treat it as All.
  const activeViewId = prefs.planViewId && !isHiddenBuiltin(builtinPref, prefs.planViewId) ? prefs.planViewId : 'all';
  const activeView = useMemo(
    () => BUILTIN_VIEWS.find(v => v.id === activeViewId) || views.find(v => v.id === activeViewId) || BUILTIN_VIEWS[0],
    [activeViewId, views],
  );
  const shownSections = useMemo(() => visibleSections(sections, activeView, env), [sections, activeView, env]);
  const visibleCatIdList = useMemo(() => shownSections.flatMap(s => s.cats.map(c => c.id)), [shownSections]);
  const dnd = usePlanDnd({ selected, visibleCatIdList, applyData });
  const visibleCatIds = useMemo(() => new Set(visibleCatIdList), [visibleCatIdList]);
  // The live cursor: the tracked row if it's still visible, otherwise the first
  // visible category — so on first load the cursor sits on the first category of
  // the first group with no interaction needed.
  const effectiveCursorId = (cursorId && visibleCatIds.has(cursorId)) ? cursorId : (visibleCatIdList[0] ?? null);

  // Cmd/Ctrl+A expands the selection in stages from the cursor's group outward,
  // like the two-stage select-all in code editors: 1st press selects every
  // category in the cursor's group, 2nd selects every visible category, 3rd
  // clears — then it cycles. Skipped while a field is being edited or a dialog
  // is open, so it never hijacks the browser's own select-all there. A ref
  // carries live state into the once-registered listener (no stale closure).
  const selAllRef = useRef(null);
  selAllRef.current = { cursorId: effectiveCursorId, sections: shownSections, all: visibleCatIdList, selected };
  useEffect(() => {
    const onKey = e => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== 'a') return;
      if (e.target?.closest?.('input, textarea, [contenteditable], [role="dialog"]')) return;
      const st = selAllRef.current;
      if (!st.all.length) return;
      e.preventDefault();
      const section = st.sections.find(s => s.cats.some(c => c.id === st.cursorId)) || st.sections[0];
      const groupIds = (section?.cats || []).map(c => c.id);
      const isExactly = ids => ids.length > 0 && ids.length === st.selected.size && ids.every(id => st.selected.has(id));
      if (isExactly(st.all)) setSelected(new Set());          // all → clear
      else if (isExactly(groupIds)) setSelected(new Set(st.all)); // group → all
      else setSelected(new Set(groupIds));                    // (partial/none) → group
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Row-click selection, matching the Transactions table:
  //  • plain click  → select just this row (or clear it if it was the only one)
  //  • cmd/ctrl click → add/remove this row from the selection (multi-select)
  //  • shift click  → select the contiguous range from the anchor to this row
  // The anchor is where a shift-range extends from; it moves on every non-shift
  // click so the next range starts from the last plainly-clicked row.
  const selectRow = (id, e) => {
    setCursorId(id);
    if (e && e.shiftKey && anchorId) {
      // rangeBetween returns [] when the anchor is no longer visible (its group
      // got collapsed/filtered out) — fall back to selecting just this row so a
      // shift-click never clears the selection to nothing.
      const range = rangeBetween(visibleCatIdList, anchorId, id);
      setSelected(new Set(range.length ? range : [id]));
      return; // anchor stays put so the range can be re-dragged
    }
    if (e && (e.metaKey || e.ctrlKey)) { toggleSelect(id, true); return; }
    toggleSelect(id, false);
  };

  // Header chevron collapses/expands every visible group at once: if all are
  // already collapsed it expands them, otherwise it collapses them all.
  const shownKeys = useMemo(() => shownSections.map(s => s.key), [shownSections]);
  const allCollapsed = shownKeys.length > 0 && shownKeys.every(k => collapsed.has(k));
  const toggleAllGroups = () => setCollapsed(prev => {
    const next = new Set(prev);
    if (shownKeys.every(k => next.has(k))) shownKeys.forEach(k => next.delete(k));
    else shownKeys.forEach(k => next.add(k));
    return next;
  });

  // A selected row that the active view hides must not stay actionable.
  useEffect(() => {
    setSelected(prev => {
      const next = new Set([...prev].filter(id => visibleCatIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleCatIds]);

  // editing drives ViewEditorModal only (null = closed | 'new' = create | a
  // view = edit); independent of manageOpen, so Manage Views can be open
  // while editing is null. ViewEditorModal's `view` prop needs an actual null
  // for create mode, so the 'new' sentinel is unwrapped just before render.
  const [manageOpen, setManageOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const writeViews = next => setPrefs({ planViews: next });

  // The category whose Activity drill-down modal is open, or null. One modal
  // instance for the whole screen — not one per row.
  const [activityCat, setActivityCat] = useState(null);

  const saveView = ({ name, categoryIds }) => {
    if (editing === 'new') {
      const v = newView(name, categoryIds, views);
      writeViews([...views, v]);
      setPrefs({ planViewId: v.id });
    } else if (editing) {
      // Replace by id, preserving sortOrder — only name/categoryIds change.
      writeViews(views.map(v => (v.id === editing.id ? { ...v, name, categoryIds } : v)));
    }
    setEditing(null);
  };
  const deleteView = id => {
    writeViews(views.filter(v => v.id !== id));
    if (activeViewId === id) setPrefs({ planViewId: 'all' });
  };
  const renameView = (id, name) => writeViews(views.map(v => (v.id === id ? { ...v, name: String(name).slice(0, MAX_NAME) } : v)));
  const reorder = (fromId, toId) => writeViews(reorderViews(views, fromId, toId));

  const reorderBuiltin = (fromId, toId) => setPrefs({ builtinViews: reorderBuiltins(builtinPref, fromId, toId) });
  const toggleBuiltin = id => setPrefs({
    builtinViews: toggleBuiltinHidden(builtinPref, id),
    // Hiding the currently-active pill drops the filter back to All.
    ...(activeViewId === id ? { planViewId: 'all' } : {}),
  });

  const noGroups = !(S.categoryGroups && S.categoryGroups.length);
  const catBudgets = useMemo(() => (S.budgets || []).filter(b => b.category), [S.budgets]);
  const assignedCatsThisMonth = useMemo(
    () => new Set((S.assignments || []).filter(a => a.month === month).map(a => a.category)),
    [S.assignments, month],
  );
  const hasUnimportedStanding = catBudgets.length > 0 && !catBudgets.some(b => assignedCatsThisMonth.has(b.category));
  const showBanner = !prefs.planBannerDismissed && (noGroups || hasUnimportedStanding);

  const ctx = { S, month, applyData, money, moneyS, view: prefs.planView, env, selected, toggleSelect, selectRow, setMany, onOpenActivity: setActivityCat, dnd, cursorId: effectiveCursorId };

  // Full width (default, like the Transactions screen): drop the max-width cap
  // and page side-padding so the area sits flush against the sidebar and runs
  // edge-to-edge. Fit: the centred 1280 column. The RTA/filter/toolbar rows get
  // a light horizontal inset in wide mode so their content aligns with the
  // table's own 16px row inset instead of jamming against the sidebar.
  const wide = prefs.planWide !== false;
  const rowInset = wide ? { paddingLeft: 16, paddingRight: 16 } : null;
  return (
    <div style={{ maxWidth: wide ? 'none' : 1280, margin: wide ? 0 : '0 auto', padding: wide ? '16px 0 56px' : '24px 28px 56px' }}>
      <div className="plan-root" style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'hsFade .25s ease' }}>
        {showBanner && (
          <AdoptionBanner
            noGroups={noGroups}
            needsImport={hasUnimportedStanding}
            onAdopt={() => applyData(data => adoptYnabTree(data))}
            onImport={() => applyData(data => importBudgetsAsAssignments(data, { month }))}
            onDismiss={() => setPrefs({ planBannerDismissed: true })}
          />
        )}

        {/* Ready to Assign lives at the top of the inspector (right column),
            grouped with the summary figures it derives from — passed in as a
            node so its RtaBreakdown/AssignPopover stay defined here. */}

        {/* Filter pills span above the grid (full width). */}
        <div style={rowInset || undefined}>
          <FilterPills
            builtins={builtinPills}
            views={views}
            activeId={activeViewId}
            onSelect={id => setPrefs({ planViewId: id })}
            onManage={() => setManageOpen(true)}
            onNewView={() => setEditing('new')}
            env={env}
            catIds={activeCatIds}
          />
        </div>

        {/* Table (left) + inspector cards (right). The action toolbar lives
            INSIDE the left column so it spans only the table's width — the
            right-aligned width/row-view toggles sit above the table's right
            edge, and the inspector's top aligns with the toolbar row. */}
        <div className="plan-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', ...rowInset }}>
              <AddGroupButton onAdd={name => applyData(data => addCategoryGroup(data, { name }))} />
              <ToolbarAction icon={<UndoIcon />} label="Undo" disabled={!canUndo} shortcut={SHORTCUT_BY_ID.undo} title={undoLabel ? 'Undo: ' + undoLabel : 'Undo'} onClick={undo} />
              <ToolbarAction icon={<RedoIcon />} label="Redo" disabled={!canRedo} shortcut={SHORTCUT_BY_ID.redo} title={redoLabel ? 'Redo: ' + redoLabel : 'Redo'} onClick={redo} />
              <RecentMoves />
              <div style={{ flex: 1 }} />
              <WidthToggle wide={wide} onToggle={() => setPrefs({ planWide: !wide })} />
              <ViewToggle view={prefs.planView} onChange={v => setPrefs({ planView: v })} />
            </div>

            <div style={{ background: 'var(--surface)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ ...ROW_COLS, padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
              <button
                onClick={toggleAllGroups}
                aria-label={allCollapsed ? 'Expand all groups' : 'Collapse all groups'} aria-expanded={String(!allCollapsed)}
                title={allCollapsed ? 'Expand all' : 'Collapse all'} className="hv-soft"
                style={{ width: 20, height: 20, border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 11, flex: 'none', borderRadius: 4, transform: allCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .12s ease' }}
              >▾</button>
              <PlanCheckbox label="Select all categories"
                checked={visibleCatIdList.length > 0 && visibleCatIdList.every(id => selected.has(id))}
                indeterminate={visibleCatIdList.some(id => selected.has(id))}
                onChange={() => setMany(visibleCatIdList, !visibleCatIdList.every(id => selected.has(id)))} />
              <span style={HEAD}>CATEGORY</span>
              <span style={{ ...HEAD, textAlign: 'right', paddingRight: NUM_INSET }}>ASSIGNED</span>
              <span style={{ ...HEAD, textAlign: 'right', paddingRight: NUM_INSET }}>ACTIVITY</span>
              <span style={{ ...HEAD, textAlign: 'right', paddingRight: NUM_INSET }}>AVAILABLE</span>
            </div>
            {shownSections.map(({ group, key, cats, totals }) => {
              const isCollapsed = collapsed.has(key);
              return (
                <div key={key ?? 'other'}>
                  <GroupRow group={group} totals={totals} cats={cats} collapsed={isCollapsed} beforeGroupId={group.id} firstCatId={cats[0]?.id ?? null} onToggle={() => toggleGroup(key)} ctx={ctx} />
                  {!isCollapsed && cats.map(cat => (
                    <CategoryRow key={cat.id} cat={cat} row={env.rows.get(cat.id)} sectionGroupId={group.id} ctx={ctx} />
                  ))}
                </div>
              );
            })}
            {/* End-of-list drop zone for group reorder. The last slot is
                otherwise reachable only by dropping on the synthetic "Other"
                header (beforeId → null) — which isn't present when every
                category is grouped. This strip exists only while a group is
                being dragged and only when "Other" is absent, supplying that
                end slot and its insertion line. */}
            {dnd.drag?.kind === 'group' && !shownSections.some(s => s.key === 'other') && (
              <div onDragOver={e => dnd.overGroupGap(e, { beforeGroupId: null })} onDrop={dnd.drop} style={{ position: 'relative', height: 24 }}>
                {dnd.target?.kind === 'group' && dnd.target.beforeId === null && (
                  <div aria-hidden="true" style={{ position: 'absolute', top: -1, left: 16, right: 16, height: 2, background: 'var(--accent)', borderRadius: 1 }} />
                )}
              </div>
            )}
            {sections.length === 0 && (
              <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                No categories yet. Organize your categories into groups to start planning your budget.
              </div>
            )}
            {sections.length > 0 && shownSections.length === 0 && (
              <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                No categories match this view.
                <div style={{ marginTop: 10 }}>
                  <button onClick={() => setPrefs({ planViewId: 'all' })} className="hv-soft"
                    style={{ height: 30, padding: '0 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                    Show all
                  </button>
                </div>
              </div>
            )}
            </div>
          </div>
          <Inspector S={S} env={env} envAt={envAt} month={month} money={money} applyData={applyData} selected={selected}
            rtaBanner={<RtaBanner env={env} prevRta={prevRta} month={month} money={money} moneyS={moneyS} S={S} applyData={applyData} />} />
        </div>
      </div>

      <ViewEditorModal
        open={editing !== null}
        view={editing === 'new' ? null : editing}
        groups={sections}
        onSave={saveView}
        onCancel={() => setEditing(null)}
      />
      <ManageViewsModal
        open={manageOpen}
        builtins={builtinManageRows}
        onToggleBuiltin={toggleBuiltin}
        onReorderBuiltin={reorderBuiltin}
        views={views}
        onReorder={reorder}
        onRename={renameView}
        onDelete={deleteView}
        onNew={() => { setManageOpen(false); setEditing('new'); }}
        onEdit={v => { setManageOpen(false); setEditing(v); }}
        onClose={() => setManageOpen(false)}
      />
      <ActivityModal
        open={activityCat !== null}
        cat={activityCat}
        month={month}
        S={S}
        money={money}
        onClose={() => setActivityCat(null)}
      />
    </div>
  );
}
