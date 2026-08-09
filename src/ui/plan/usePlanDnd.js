import { useCallback, useState } from 'react';
import { moveCategories, reorderCategoryGroup } from '../../store/actions.js';

// Which ids a category drag carries: the whole current selection (in visible,
// top-to-bottom order) when the grabbed row is part of a multi-selection,
// otherwise just the grabbed row — grabbing an unselected row never disturbs
// the existing selection.
export function dragIdsFor(catId, selected, visibleCatIdList) {
  if (selected.has(catId) && selected.size > 1) return visibleCatIdList.filter(id => selected.has(id));
  return [catId];
}

// Transient drag-state controller for the Plan screen. Holds the active drag
// and the current drop target so rows can draw the insertion line; dispatches
// the pure reducers on drop. Native HTML5 DnD, desktop mouse only.
export default function usePlanDnd({ selected, visibleCatIdList, applyData }) {
  const [drag, setDrag] = useState(null);
  const [target, setTarget] = useState(null);

  const startCategoryDrag = useCallback((e, catId) => {
    e.dataTransfer.effectAllowed = 'move';
    setDrag({ kind: 'category', ids: dragIdsFor(catId, selected, visibleCatIdList) });
  }, [selected, visibleCatIdList]);

  const startGroupDrag = useCallback((e, groupId) => {
    e.dataTransfer.effectAllowed = 'move';
    setDrag({ kind: 'group', ids: [groupId] });
  }, []);

  const overCategory = useCallback((e, { groupId, beforeId }) => {
    if (!drag || drag.kind !== 'category') return;
    e.preventDefault();
    setTarget({ kind: 'category', groupId, beforeId });
  }, [drag]);

  const overGroupHeader = useCallback((e, { groupId, firstCatId }) => {
    if (!drag || drag.kind !== 'category') return;
    e.preventDefault();
    setTarget({ kind: 'category', groupId, beforeId: firstCatId ?? null });
  }, [drag]);

  const overGroupGap = useCallback((e, { beforeGroupId }) => {
    if (!drag || drag.kind !== 'group') return;
    e.preventDefault();
    setTarget({ kind: 'group', beforeId: beforeGroupId ?? null });
  }, [drag]);

  const endDrag = useCallback(() => { setDrag(null); setTarget(null); }, []);

  const drop = useCallback(e => {
    e.preventDefault();
    if (drag && target) {
      if (drag.kind === 'category' && target.kind === 'category') {
        const { ids } = drag; const { groupId, beforeId } = target;
        applyData(d => moveCategories(d, { ids, groupId, beforeId }));
      } else if (drag.kind === 'group' && target.kind === 'group') {
        const id = drag.ids[0]; const { beforeId } = target;
        applyData(d => reorderCategoryGroup(d, { id, beforeId }));
      }
    }
    endDrag();
  }, [drag, target, applyData, endDrag]);

  return { drag, target, startCategoryDrag, startGroupDrag, overCategory, overGroupHeader, overGroupGap, drop, endDrag };
}
