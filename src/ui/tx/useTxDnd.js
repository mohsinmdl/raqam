import { useCallback, useMemo, useState } from 'react';
import { resolveDrop } from '../../lib/txReorder.js';
import { reorderTransactions } from '../../store/actions.js';
import { nowIsoSec } from '../../lib/dates.js';

// Drag-to-reorder for the transactions register. Rows are date-DESC and a
// transaction's order IS its timestamp, so a drop rewrites the dropped rows'
// `date` to moments between their new neighbors (planDrop decides auto vs. the
// picker). Native HTML5 DnD, desktop mouse only — modelled on usePlanDnd.
//
// Grabbing a row that is part of the current selection drags the WHOLE
// selection as one group (it keeps its order among itself); grabbing an
// unselected row drags that row alone.
//
// The dragged rows and the drop target are transient UI state; the actual move
// is a pure reducer dispatched on drop, so the register re-derives order, day
// group, running balance and budget month from the new dates alone.

// A compact drag ghost, appended off-screen (the DnD spec requires the node to
// be in the document at setDragImage time) and removed on the next tick.
function setGhost(e, label) {
  const chip = document.createElement('div');
  chip.textContent = label;
  chip.style.cssText = 'position:fixed;top:-1000px;left:-1000px;padding:6px 10px;border-radius:8px;'
    + 'background:var(--accent);color:var(--on-accent);font-size:13px;font-weight:700;'
    + 'box-shadow:var(--shadow);white-space:nowrap;';
  document.body.appendChild(chip);
  e.dataTransfer.setDragImage(chip, 12, 12);
  setTimeout(() => chip.remove(), 0);
}

// Auto-scroll the nearest scrollable ancestor as the pointer nears its edge, so
// a long register stays reorderable without releasing the drag.
function edgeAutoScroll(e) {
  const EDGE = 48, STEP = 12;
  // getComputedStyle throws on a non-Element; a fast drag teardown can leave
  // e.target a detached/non-element node, so start from a guaranteed Element.
  let el = e.target instanceof Element ? e.target : e.currentTarget;
  while (el && el !== document.body) {
    const canScroll = el.scrollHeight > el.clientHeight && /(auto|scroll)/.test(getComputedStyle(el).overflowY);
    if (canScroll) {
      const r = el.getBoundingClientRect();
      if (e.clientY < r.top + EDGE) { el.scrollTop -= STEP; return; }
      if (e.clientY > r.bottom - EDGE) { el.scrollTop += STEP; return; }
      return;
    }
    el = el.parentElement;
  }
}

// rows     — the recorded rows AS RENDERED (presenter rows; `.id` and `.sortAt`).
// enabled  — reorder only makes sense in the natural date-desc order.
// selectedIds — the register's current selection (a Set of ids). A drag that
//            starts on a selected row moves every selected row together.
// applyData — dispatch for the pure reducer. `now` is read fresh at drop time
//            (nowIsoSec) rather than per-render, so it's exact at the moment of
//            the drop and doesn't churn the row handlers every second.
// nowInView — is today inside the register's current date/month filter? Governs
//            whether a top drop stamps the clock or the viewed date's latest
//            moment (forwarded to resolveDrop → planDrop).
// openPicker({ ids, seed, bounds, x, y }) — called when the drop needs an
//            explicit date/time instead of an interpolated one. `bounds` is the
//            gap's neighbour dates, so the confirm can keep the pick inside it.
// notify    — surfaces a drop that couldn't happen (a dragged row or the target
//            vanished under a background sync) and a drop that touched more
//            than the dragged rows (neighbours nudged to make room), so a
//            reorder is never silent about what it did or didn't do.
export default function useTxDnd({ rows, enabled, applyData, nowInView = true, selectedIds, openPicker, notify }) {
  // { id, ids } — the grabbed row and the group moving with it (ids in
  // register order; just [id] for a lone row). null when idle.
  const [drag, setDrag] = useState(null);
  const dragId = drag ? drag.id : null;
  const [target, setTarget] = useState(null); // { beforeId } — row the line sits above; null = end

  const ids = useMemo(() => rows.map(r => r.id), [rows]);

  const start = useCallback((e, id, label) => {
    if (!enabled) return;
    // The whole row is the handle, but a grab that begins on a control (checkbox,
    // menu, chip, an open popover) stays that interaction, not a reorder.
    if (e.target.closest('button, input, textarea, select, [role="dialog"], [contenteditable]')) { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = 'move';
    const group = selectedIds && selectedIds.has(id) ? ids.filter(x => selectedIds.has(x)) : [id];
    setGhost(e, group.length > 1 ? group.length + ' transactions' : (label || 'Transaction'));
    setDrag({ id, ids: group });
  }, [enabled, ids, selectedIds]);

  const over = useCallback((e, id) => {
    if (!drag) return;
    e.preventDefault();
    edgeAutoScroll(e);
    // Top half of the hovered row → insert above it; bottom half → below it
    // (i.e. above the next row down). The line never sits on a member of the
    // moving group: a gap above a member means "gather the group here", i.e.
    // above the next row that stays — so the line the user sees is the gap
    // the drop will actually use, never one where the drop would do nothing.
    const r = e.currentTarget.getBoundingClientRect();
    const idx = ids.indexOf(id);
    const moving = new Set(drag.ids);
    let at = (e.clientY - r.top) < r.height / 2 ? idx : idx + 1;
    while (at < ids.length && moving.has(ids[at])) at += 1;
    setTarget({ beforeId: ids[at] ?? null });   // past the last row → the very end
  }, [drag, ids]);

  const end = useCallback(() => { setDrag(null); setTarget(null); }, []);

  const drop = useCallback(e => {
    e.preventDefault();
    if (!drag || !target) { end(); return; }
    // A background sync between grab and drop can remove a row; the reorder
    // would then quietly skip it. Say so rather than leave the user wondering
    // why the drag did nothing (or did less than it showed).
    const here = id => rows.some(r => r.id === id);
    if (!drag.ids.every(here) || (target.beforeId != null && !here(target.beforeId))) {
      notify?.(drag.ids.length > 1 ? 'Some of those transactions are no longer here — reload to try again.' : 'That transaction is no longer here — reload to try again.');
      end();
      return;
    }
    const now = nowIsoSec();
    const rowDate = id => rows.find(r => r.id === id)?.sortAt;
    const plan = resolveDrop({ ids, rowDate, dragIds: drag.ids, beforeId: target.beforeId, now, nowInView });
    if (plan) {
      if (plan.mode === 'auto') {
        const nudged = new Set(plan.nudged || []);
        applyData(d => reorderTransactions(d, { moves: plan.ids.map((id, i) => ({ id, date: plan.dates[i], nudged: nudged.has(id) })), now }));
        if (nudged.size) notify?.('Moved ' + drag.ids.length + ' — ' + nudged.size + (nudged.size === 1 ? ' neighbour' : ' neighbours') + ' nudged to make room.');
      } else {
        openPicker({ ids: plan.ids, seed: plan.seed, bounds: plan.bounds, x: e.clientX, y: e.clientY });
      }
    }
    end();
  }, [drag, target, ids, rows, nowInView, applyData, openPicker, end, notify]);

  // Handlers to spread onto a row's <tr>. null when reorder is off, so the row
  // stays a plain click/selection target.
  const rowProps = useCallback((id, label) => (enabled ? {
    draggable: true,
    onDragStart: e => start(e, id, label),
    onDragOver: e => over(e, id),
    onDrop: drop,
    onDragEnd: end,
  } : null), [enabled, start, over, drop, end]);

  // Where the insertion line should show for a given row.
  const dropLineFor = useCallback((id, isLast) => {
    if (dragId == null || !target) return null;
    if (target.beforeId === id) return 'above';
    if (target.beforeId == null && isLast) return 'below';
    return null;
  }, [dragId, target]);

  return { dragId, target, rowProps, dropLineFor };
}
