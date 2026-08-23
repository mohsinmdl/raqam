import { useCallback, useState } from 'react';
import { moveCategories, reorderCategoryGroup } from '../../store/actions.js';
import { moveCollision } from '../../lib/calc.js';

// Which ids a category drag carries: the whole current selection (in visible,
// top-to-bottom order) when the grabbed row is part of a multi-selection,
// otherwise just the grabbed row — grabbing an unselected row never disturbs
// the existing selection.
export function dragIdsFor(catId, selected, visibleCatIdList) {
  if (selected.has(catId) && selected.size > 1) return visibleCatIdList.filter(id => selected.has(id));
  return [catId];
}

// Build a compact drag ghost and register it with the drag event. The node is
// appended off-screen (the DnD spec requires it to be in the document at
// setDragImage time) and removed on the next tick.
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

// Auto-scroll the nearest scrollable ancestor when the pointer nears its top or
// bottom edge during a drag, so long category lists stay draggable.
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

// Transient drag-state controller for the Plan screen. Holds the active drag
// and the current drop target so rows can draw the insertion line; dispatches
// the pure reducers on drop. Native HTML5 DnD, desktop mouse only.
export default function usePlanDnd({ selected, visibleCatIdList, applyData, data, notify }) {
  const [drag, setDrag] = useState(null);
  const [target, setTarget] = useState(null);

  const startCategoryDrag = useCallback((e, catId, label) => {
    e.dataTransfer.effectAllowed = 'move';
    const ids = dragIdsFor(catId, selected, visibleCatIdList);
    setGhost(e, ids.length > 1 ? ids.length + ' categories' : (label || 'Category'));
    setDrag({ kind: 'category', ids });
  }, [selected, visibleCatIdList]);

  const startGroupDrag = useCallback((e, groupId, label) => {
    e.dataTransfer.effectAllowed = 'move';
    setGhost(e, label || 'Group');
    setDrag({ kind: 'group', ids: [groupId] });
  }, []);

  const overCategory = useCallback((e, { groupId, beforeId }) => {
    if (!drag || drag.kind !== 'category') return;
    e.preventDefault();
    edgeAutoScroll(e);
    setTarget({ kind: 'category', groupId, beforeId });
  }, [drag]);

  const overGroupHeader = useCallback((e, { groupId, firstCatId }) => {
    if (!drag || drag.kind !== 'category') return;
    e.preventDefault();
    edgeAutoScroll(e);
    setTarget({ kind: 'category', groupId, beforeId: firstCatId ?? null });
  }, [drag]);

  const overGroupGap = useCallback((e, { beforeGroupId }) => {
    if (!drag || drag.kind !== 'group') return;
    e.preventDefault();
    edgeAutoScroll(e);
    setTarget({ kind: 'group', beforeId: beforeGroupId ?? null });
  }, [drag]);

  const endDrag = useCallback(() => { setDrag(null); setTarget(null); }, []);

  const drop = useCallback(e => {
    e.preventDefault();
    if (drag && target) {
      if (drag.kind === 'category' && target.kind === 'category') {
        const { ids } = drag; const { groupId, beforeId } = target;
        // Per-group name uniqueness (0018): a move into a group that already
        // holds a same-named category would 23505 on sync. Refuse + explain
        // rather than let the reducer silently no-op the drop.
        const col = data && moveCollision(data, { ids, groupId });
        if (col) {
          notify?.('A category called “' + col.name + '” already exists in that group.');
        } else {
          applyData(d => moveCategories(d, { ids, groupId, beforeId }));
        }
      } else if (drag.kind === 'group' && target.kind === 'group') {
        const id = drag.ids[0]; const { beforeId } = target;
        applyData(d => reorderCategoryGroup(d, { id, beforeId }));
      }
    }
    endDrag();
  }, [drag, target, applyData, endDrag, data, notify]);

  return { drag, target, startCategoryDrag, startGroupDrag, overCategory, overGroupHeader, overGroupGap, drop, endDrag };
}
