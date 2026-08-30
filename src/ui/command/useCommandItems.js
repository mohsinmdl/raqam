import { useMemo } from 'react';
import { useStore } from '../../store/StoreProvider.jsx';
import { usePlan } from '../../store/PlanProvider.jsx';
import { buildItems } from './buildItems.js';
import { buildActions } from './actions.js';

// Memoized flat item list for the open plan. Rebuilds only when the store data,
// plan list, or open plan changes — not on every keystroke (NFR-1 / US-9).
export function useCommandItems() {
  const { data } = useStore();
  const { plans, openPlanId } = usePlan();
  return useMemo(
    () => [
      ...buildItems({ data }),
      ...buildActions({ plans, openPlanId }),
    ],
    [data, plans, openPlanId],
  );
}
