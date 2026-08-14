import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useStore } from './StoreProvider.jsx';
import { currentMonth, monthsFor } from '../lib/dates.js';

// Selected reporting month, shared by the header selector and the dashboard /
// transactions screens. A month string ('YYYY-MM'), never an index — string
// comparison gives ordering for free.
const Ctx = createContext(null);

export function MonthProvider({ children }) {
  const { data } = useStore();
  const months = useMemo(() => monthsFor(data, { lookahead: 3 }), [data]);
  const [month, setMonth] = useState(() => currentMonth());

  // If data changes under us (demo load, reset, new real month), snap into range.
  useEffect(() => {
    if (!months.includes(month)) setMonth(currentMonth());
  }, [months, month]);

  const value = useMemo(() => {
    const idx = months.indexOf(month);
    const cur = currentMonth();
    return {
      month, months,
      isPast: month < cur,
      isFuture: month > cur,
      // Balance reads clamp to the present: opening snapshots only exist up to
      // the real current month, so a future month would fabricate zero
      // balances. Consumers that read account/card balances (not envelope or
      // assignment data, which are correctly future-aware) use this instead
      // of `month`.
      balanceMonth: month > cur ? cur : month,
      prevDisabled: idx <= 0,
      nextDisabled: idx >= months.length - 1,
      goPrev: () => idx > 0 && setMonth(months[idx - 1]),
      goNext: () => idx < months.length - 1 && setMonth(months[idx + 1]),
      pick: m => { if (months.includes(m)) setMonth(m); },
    };
  }, [month, months]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMonth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMonth outside MonthProvider');
  return v;
}
