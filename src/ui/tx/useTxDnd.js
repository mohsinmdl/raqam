import { useCallback, useMemo, useState } from 'react';
import { resolveDrop } from '../../lib/txReorder.js';
import { reorderTransaction } from '../../store/actions.js';

// Drag-to-reorder for the transactions register. Rows are date-DESC and a
// transaction's order IS its timestamp, so a drop rewrites the dropped row's
// `date` to a moment between its new neighbors (planDrop decides auto vs. the
// picker). Native HTML5 DnD, desktop mouse only — modelled on usePlanDnd.
//
// The dragged row and the drop target are transient UI state; the actual move
// is a pure reducer dispatched on drop, so the register re-derives order, day
// group, running balance and budget month from the new date alone.

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
  let el = e.target;
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
// applyData/now — dispatch + injected clock for the pure reducer.
// openPicker({ id, seed, x, y }) — called when the drop needs an explicit
//            date/time instead of an interpolated one.
export default function useTxDnd({ rows, enabled, applyData, now, openPicker }) {
  const [dragId, setDragId] = useState(null);
  const [target, setTarget] = useState(null); // { beforeId } — row the line sits above; null = end

  const ids = useMemo(() => rows.map(r => r.id), [rows]);

  const start = useCallback((e, id, label) => {
    if (!enabled) return;
    // The whole row is the handle, but a grab that begins on a control (checkbox,
    // menu, chip, an open popover) stays that interaction, not a reorder.
    if (e.target.closest('button, input, textarea, select, [role="dialog"], [contenteditable]')) { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = 'move';
    setGhost(e, label || 'Transaction');
    setDragId(id);
  }, [enabled]);

  const over = useCallback((e, id) => {
    if (dragId == null) return;
    e.preventDefault();
    edgeAutoScroll(e);
    // Top half of the hovered row → insert above it; bottom half → below it
    // (i.e. above the next row down).
    const r = e.currentTarget.getBoundingClientRect();
    const idx = ids.indexOf(id);
    const beforeId = (e.clientY - r.top) < r.height / 2 ? id : (ids[idx + 1] ?? null);
    setTarget({ beforeId });
  }, [dragId, ids]);

  const end = useCallback(() => { setDragId(null); setTarget(null); }, []);

  const drop = useCallback(e => {
    e.preventDefault();
    if (dragId == null || !target) { end(); return; }
    const rowDate = id => rows.find(r => r.id === id)?.sortAt;
    const plan = resolveDrop({ ids, rowDate, dragId, beforeId: target.beforeId, now });
    if (plan) {
      if (plan.mode === 'auto') applyData(d => reorderTransaction(d, { id: plan.id, date: plan.date, now }));
      else openPicker({ id: plan.id, seed: plan.seed, x: e.clientX, y: e.clientY });
    }
    end();
  }, [dragId, target, ids, rows, now, applyData, openPicker, end]);

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
