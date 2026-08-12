// The Transactions screen's view — date range, filters, sort and the two group
// collapse states — lifted out of the screen so it survives navigation. React
// Router unmounts a route component when you leave it, which was resetting the
// whole view every time you glanced at the Dashboard.
//
// Session-scoped on purpose: this lives in memory, not in prefs, so a reload
// starts clean. A filter you forgot about should not be waiting for you
// tomorrow, and a fixed range like '2026-08' should not still be showing when
// the month has rolled over.
//
// Same shape as MonthContext — a provider above <Routes>, one hook out.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useMonth } from './MonthContext.jsx';
import { DEFAULT_SORT } from '../lib/sortRows.js';

// Search only. The account, category, type, status and budget-impact filters
// that used to live here were removed with their controls rather than left as
// state nothing could set — each is returning on the screen that owns the
// question (sidebar, Categories, Budgets, reporting). Reinstating one means
// adding its key back here and a branch to the Transactions predicate.
export const DEFAULT_FILTERS = { q: '' };

const Ctx = createContext(null);

export function TxViewProvider({ children }) {
  const { month } = useMonth();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  // { key, dir } — direction was not modelled at all before, so both of the
  // old sorts were permanently descending.
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [range, setRange] = useState(() => ({ from: month, to: month }));
  const [schedOpen, setSchedOpen] = useState(true);
  const [postedOpen, setPostedOpen] = useState(true);
  // Spending's phone Select mode, lifted here only so app-level chrome
  // (AddTxPill) can hide while it is on. Transactions owns setting/clearing it.
  const [phoneSelect, setPhoneSelect] = useState(false);

  // The header's month stepper still drives the range — stepping to July on the
  // Dashboard and then opening Transactions should show July, as it always did.
  // Only an actual *change* of month resets it, so a range you chose here
  // (say "This Year") survives a trip to another tab untouched.
  const lastMonth = useRef(month);
  useEffect(() => {
    if (lastMonth.current === month) return;
    lastMonth.current = month;
    setRange({ from: month, to: month });
  }, [month]);

  const value = useMemo(() => ({
    filters, setFilters, sort, setSort, range, setRange,
    schedOpen, setSchedOpen, postedOpen, setPostedOpen,
    phoneSelect, setPhoneSelect,
    resetView: () => { setFilters(DEFAULT_FILTERS); setRange({ from: month, to: month }); setSort(DEFAULT_SORT); },
  }), [filters, sort, range, schedOpen, postedOpen, phoneSelect, month]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTxView() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTxView outside TxViewProvider');
  return v;
}
