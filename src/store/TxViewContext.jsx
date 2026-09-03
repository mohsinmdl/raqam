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
import { singleDayOf } from '../lib/dateRange.js';
import { schedOpenFor } from '../lib/txRow.js';

// Search only. The account, category, type, status and budget-impact filters
// that used to live here were removed with their controls rather than left as
// state nothing could set — each is returning on the screen that owns the
// question (sidebar, Categories, Budgets, reporting). Reinstating one means
// adding its key back here and a branch to the Transactions predicate.
// `q` is the free-text query (drives the search box and its suggestions);
// `term` is the structured facet a picked suggestion applies (an account, a
// category, a status, a date or amount comparison, a field-scoped match). One
// or the other is active — typing clears `term`, picking a suggestion clears
// `q` and sets `term`. The predicate is matchesSearch (lib/txSearch.js).
export const DEFAULT_FILTERS = { q: '', term: null };

const Ctx = createContext(null);

export function TxViewProvider({ children }) {
  const { month } = useMonth();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  // { key, dir } — direction was not modelled at all before, so both of the
  // old sorts were permanently descending.
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [range, setRange] = useState(() => ({ from: month, to: month }));
  // SCHEDULED band fold, remembered per ledger (All Accounts vs. each
  // account's register) so that folding it on one does not fold it on the
  // others. Defaults live in schedOpenFor: closed on All Accounts, open in a
  // single register.
  const [schedOpenBy, setSchedOpenBy] = useState({});
  const schedOpenFor_ = accountId => schedOpenFor(schedOpenBy, accountId);
  const toggleSchedOpen = accountId => setSchedOpenBy(m => {
    const key = accountId || 'all';
    return { ...m, [key]: !schedOpenFor(m, accountId) };
  });
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

  // What a new entry inherits from the view: a register scoped to ONE day
  // (Today, Yesterday, a custom one-day range) seeds that day, so the row you
  // add lands where you are looking. Wider ranges seed nothing — the form keeps
  // its own default (today). Spread into every openers.addTx seed.
  const viewDay = singleDayOf(range);
  const addSeed = useMemo(() => (viewDay ? { date: viewDay } : {}), [viewDay]);

  const value = useMemo(() => ({
    filters, setFilters, sort, setSort, range, setRange, addSeed,
    schedOpenFor: schedOpenFor_, toggleSchedOpen, postedOpen, setPostedOpen,
    phoneSelect, setPhoneSelect,
    resetView: () => { setFilters(DEFAULT_FILTERS); setRange({ from: month, to: month }); setSort(DEFAULT_SORT); },
  }), [filters, sort, range, addSeed, schedOpenBy, postedOpen, phoneSelect, month]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTxView() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTxView outside TxViewProvider');
  return v;
}
