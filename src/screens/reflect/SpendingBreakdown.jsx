// Reflect — Spending Breakdown tab: YNAB-parity report page. Composes:
// spendingReport.js/spendingExport.js (range-aware data + CSV export),
// ReportFilterBar (date range + category/account multi-select), SpendingDonut
// (ECharts interactive ring), TransactionPopover (drill into a row/slice's
// transactions), ExportModal (confirm-once export).
//
// Local state only — the shell's month (via outlet context) merely seeds the
// initial range; every filter/lens/drill/focus/export choice on this page
// lives here, independent of the other five tabs. The Reflect shell renders
// no filter UI of its own at all (see Reflect.jsx).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { useStore } from '../../store/StoreProvider.jsx';
import { useMoney } from '../../lib/format.js';
import { useIsPhone } from '../../lib/useIsPhone.js';
import { clampRange } from '../../lib/dateRange.js';
import { PALETTE, breakdownByCategory, breakdownByGroup, breakdownStats, categoryTxRows, drillOther, foldForDonut, otherLevelCounts } from '../../lib/spendingReport.js';
import { exportSpendingReport } from '../../lib/spendingExport.js';
import { useUI } from '../../ui/UIProvider.jsx';
import { isTypingTarget } from '../../lib/shortcuts.js';
import ReportFilterBar from '../../ui/reflect/ReportFilterBar.jsx';
import SpendingDonut, { pctLabel } from '../../ui/reflect/SpendingDonut.jsx';
import TransactionPopover from '../../ui/reflect/TransactionPopover.jsx';
import ExportModal from '../../ui/reflect/ExportModal.jsx';
import RecoverableSwitch from '../../ui/RecoverableSwitch.jsx';

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 };

const SKIP_KEY = 'raqam.reflect.exportConfirmSkip';

// "1 transactions" reads wrong — pluralize the count-driven noun.
const plural = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;

const NO_STEPS = [];

// Same pill-toggle idiom as Plan.jsx's ViewToggle and the prior version of
// this page.
function ViewToggle({ view, onChange }) {
  const seg = (key, label) => (
    <button
      key={key} onClick={() => onChange(key)} aria-pressed={view === key}
      style={{
        height: 28, padding: '0 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
        background: view === key ? 'var(--surface)' : 'transparent', color: view === key ? 'var(--text)' : 'var(--muted)',
        boxShadow: view === key ? 'var(--shadow)' : 'none',
      }}
    >{label}</button>
  );
  return (
    <div role="group" aria-label="Category view" style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 8, background: 'rgba(125,109,63,.16)' }}>
      {seg('categories', 'Categories')}
      {seg('groups', 'Groups')}
    </div>
  );
}

export default function SpendingBreakdown() {
  const { month } = useOutletContext();
  const { data: S, prefs, setPrefs } = useStore();
  const { money } = useMoney();
  const { notify } = useUI();
  const isPhone = useIsPhone();

  const [range, setRange] = useState(() => ({ from: month, to: month }));
  const [catSel, setCatSel] = useState(null);   // null | Set
  const [acctSel, setAcctSel] = useState(null); // null | Set
  const location = useLocation();
  const navigate = useNavigate();
  // The drill trail lives in the HISTORY ENTRY, not component state: each
  // drill (into a group, or into the donut's "Other") pushes an entry, so the
  // browser/phone Back gesture steps up one level before it leaves the page,
  // and returning here with Back restores the drill. Shape:
  // { lens, steps: [{ type: 'group', id } | { type: 'other' }] }.
  const trail = location.state?.breakdownDrill;
  const [lens, setLens] = useState(() => trail?.lens || 'categories');
  const steps = trail && trail.lens === lens ? trail.steps : NO_STEPS;
  const [focus, setFocus] = useState(null);     // { id, anchor } | null
  const [exportOpen, setExportOpen] = useState(false);

  // "Include recoverable spending" lens — own pref, like the Overview's.
  // Defaults ON so the report keeps its gross YNAB-style total until the user
  // opts out; OFF drops excluded (recoverable/advance) categories from the
  // donut, list, stats, drill-down and export alike (all read `opts`).
  const incRec = prefs.includeRecoverableBreakdown !== false;
  const opts = { from: range.from, to: range.to, acctIds: acctSel, catIds: catSel, includeExcluded: incRec };
  const catRows = useMemo(() => breakdownByCategory(S, opts), [S, range, catSel, acctSel, incRec]);
  const groupRows = useMemo(() => breakdownByGroup(S, opts), [S, range, catSel, acctSel, incRec]);
  // Visible rows: categories lens → catRows (zero rows hidden below); groups
  // lens → groupRows (zero rows hidden below); drilled → catRows subset
  // re-based so pct is within the group (YNAB: 82%/13%/5% inside Needs), all
  // members shown including zeros.
  // Replay the trail over the lens's rows. A group step swaps in that group's
  // member categories — re-based pct AND re-colored by group-local rank (members
  // otherwise keep the color of their GLOBAL rank, so a group of low-ranked
  // categories would draw as identical muted-gray arcs); all members shown,
  // zeros included. Each "Other" step drills one level deeper into the donut's
  // folded tail, re-based within it; a still-long tail folds into its own
  // "Other", so the drill can keep going. A step that no longer resolves (its
  // group vanished under a filter, or that Other no longer folds) ends the
  // replay there, so rows and crumbs only ever describe levels that exist.
  const view = useMemo(() => {
    let base = lens === 'categories' ? catRows : groupRows;
    let drill = null, depth = 0;
    const crumbs = [];
    for (const st of steps) {
      if (st.type === 'group') {
        const g = lens === 'groups' && !drill && groupRows.find(x => x.id === st.id);
        if (!g) break;
        const member = catRows.filter(r => g.catIds.includes(r.id));
        const t = member.reduce((s, r) => s + r.amt, 0);
        base = member.map((r, i) => ({ ...r, pct: t ? r.amt / t : 0, color: i < PALETTE.length ? PALETTE[i] : null }));
        drill = g; depth = 0;
        crumbs.push(g.name);
      } else {
        const counts = otherLevelCounts(base, depth + 1);
        if (counts.length <= depth) break;
        depth += 1;
        crumbs.push(`Other (${counts[depth - 1]})`);
      }
    }
    return { drill, depth, crumbs, rows: depth ? drillOther(base, depth) : base };
  }, [lens, steps, catRows, groupRows]);
  const { drill, rows } = view;
  const otherDepth = view.depth;
  // The category ids the Other drill covers (a group row carries its members),
  // so stats and export narrow to exactly what's on screen. null = not drilled.
  const otherCatIds = otherDepth ? new Set(rows.flatMap(r => r.catIds || [r.id])) : null;
  const total = rows.reduce((s, r) => s + r.amt, 0);
  // Memoized: SpendingDonut's option-building effect depends on `slices` by
  // identity, so a fresh array every render would rebuild the chart and
  // replay its entry animation on every unrelated parent re-render.
  // foldForDonut caps the ring at the top few categories + one gray "Other";
  // the category list (visibleRows) is untouched and still shows every row.
  const slices = useMemo(() => foldForDonut(rows.filter(r => r.amt > 0)), [rows]);
  const stats = useMemo(() => breakdownStats(S, otherCatIds
    ? { ...opts, catIds: otherCatIds }
    : drill
      ? { ...opts, catIds: new Set(drill.catIds.filter(id => !catSel || catSel.has(id))) }
      : opts), [S, range, catSel, acctSel, drill, incRec, rows, otherDepth]);

  // Displayed list: top-level lenses hide zero-amount rows; the drilled group
  // list shows every member category, zeros included (rendered without a bar).
  const visibleRows = drill ? rows : rows.filter(r => r.amt > 0);

  // Drill = push a history entry carrying the longer trail.
  const here = { pathname: location.pathname, search: location.search };
  const pushStep = step => navigate(here, { state: { ...location.state, breakdownDrill: { lens, steps: [...steps, step] } } });
  // Step back n levels. Normally that is literally history Back n — so Back
  // afterwards can't re-enter a level the user just left. If fewer entries
  // exist than that (a restored tab, a replaced entry) fall back to rewriting
  // this entry, so we never navigate off the app. popped guards the effects
  // below from issuing a second Back before the first one lands.
  const popped = useRef(null);
  const popSteps = n => {
    if (n <= 0 || popped.current === location.key) return;
    popped.current = location.key;
    const idx = window.history.state?.idx;
    if (typeof idx === 'number' && idx >= n) navigate(-n);
    else navigate(here, { replace: true, state: { ...location.state, breakdownDrill: { lens, steps: steps.slice(0, steps.length - n) } } });
  };

  // Clear the open popover whenever anything upstream of the row set changes
  // — its anchor/id may no longer refer to a visible row.
  useEffect(() => { setFocus(null); }, [range, catSel, acctSel, lens, steps, incRec]);
  // A filter/range/recoverable change re-slices every level, so the drill
  // returns to the top. Keyed on the filter VALUES, not on effect runs:
  // arriving here via Back onto a drilled entry (and StrictMode's double
  // mount) must keep that drill, and neither changes a value.
  const ids = sel => (sel ? [...sel].sort().join(',') : '*');
  const filterKey = [range.from, range.to, ids(catSel), ids(acctSel), incRec].join('|');
  const lastFilterKey = useRef(filterKey);
  useEffect(() => {
    if (lastFilterKey.current === filterKey) return;
    lastFilterKey.current = filterKey;
    popSteps(steps.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on filter changes
  }, [filterKey]);

  // Escape steps up one level — unless something else owns the key: an open
  // popover/dialog/overlay (they handle Escape first) or a text field.
  const escRef = useRef(null);
  escRef.current = () => {
    if (!view.crumbs.length || focus || exportOpen) return false;
    if (document.querySelector('[role="dialog"], [data-rq-overlay]')) return false;
    popSteps(1);
    return true;
  };
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (isTypingTarget(document.activeElement)) return;
      if (escRef.current()) e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // In the groups lens (not yet inside a group) the rows ARE groups.
  const rowsAreGroups = lens === 'groups' && !drill;
  const openFocus = useCallback((id, anchor) => {
    // The folded aggregate isn't one category: clicking it drills into its rows.
    if (id === '__other__') { setFocus(null); pushStep({ type: 'other' }); return; }
    if (rowsAreGroups && groupRows.some(x => x.id === id)) { pushStep({ type: 'group', id }); return; } // donut slice click in groups lens drills too
    setFocus({ id, anchor });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pushStep reads the latest location each render
  }, [rowsAreGroups, groupRows, location, steps, lens]);

  const rowClick = (r, e) => {
    if (rowsAreGroups) { pushStep({ type: 'group', id: r.id }); return; }
    openFocus(r.id, e.currentTarget);
  };

  // Switching lens leaves the drill: pop back to the top entry first.
  const changeLens = key => { popSteps(steps.length); setLens(key); setFocus(null); };

  const focusRow = focus ? rows.find(r => r.id === focus.id) : null;

  // Export honors the active filters + lens drill: drilled into a group, the
  // export narrows to that group's member categories, same as the on-screen
  // rows/donut. localStorage read/write are guarded — Safari private mode or
  // a full quota must not abort the export the user just asked for; on
  // failure we just skip the "don't ask again" persistence.
  // A throwing builder or a Blob/download the browser refuses would otherwise
  // fail in total silence — by then the modal has closed, so the user sees a
  // dismissed dialog and no files and has no way to tell the two apart.
  const exportNow = () => {
    try {
      exportSpendingReport(S, otherCatIds ? { ...opts, catIds: otherCatIds } : drill ? { ...opts, catIds: new Set(drill.catIds) } : opts);
    } catch {
      notify("Couldn't export the report — please try again.");
    }
  };
  const onExportClick = () => {
    let skip = false;
    try { skip = !!localStorage.getItem(SKIP_KEY); } catch { /* proceed as if not skipped */ }
    if (skip) exportNow(); else setExportOpen(true);
  };
  const onExportConfirm = skip => {
    if (skip) { try { localStorage.setItem(SKIP_KEY, '1'); } catch { /* export proceeds regardless */ } }
    setExportOpen(false);
    exportNow();
  };

  // Drill-scoped on purpose: exportNow() exports the drilled view, so the
  // button follows whatever the page is currently showing. `total` already
  // covers the empty case — every slice comes from a row with amt > 0.
  const exportDisabled = total === 0;

  const statBlocks = [
    { label: 'Average Monthly Spending', value: money(stats.avgMonthly), sub: '' },
    { label: 'Average Daily Spending', value: money(stats.avgDaily), sub: '' },
    { label: 'Most Frequent Category', value: stats.mostFrequent ? stats.mostFrequent.name : '—', sub: stats.mostFrequent ? plural(stats.mostFrequent.count, 'transaction') : '' },
    // A payee-less transaction has an empty merchant; the dash marks the
    // missing NAME (the amount below still renders), matching how the other
    // stat blocks show an absent value.
    { label: 'Largest Outflow', value: stats.largestOutflow?.merchant || '—', sub: stats.largestOutflow ? money(stats.largestOutflow.amt) : '' },
  ];

  const emptyNote = <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>No spending recorded for this period.</div>;

  // The Header shell already renders the page's <h1> ("Reflect"), per
  // Header.jsx's one-h1-per-page rule — this is a section heading, so both
  // branches use <h2>.
  // Breadcrumb trail: root › each drilled level (group name / "Other (n)").
  // Every crumb but the last pops back to its level. On a phone the trail
  // collapses to one "‹ current" back button. Undrilled: the plain title.
  const crumbs = view.crumbs.length
    ? [{ key: 'root', label: lens === 'groups' ? 'All Groups' : 'All Categories' },
      ...view.crumbs.map((label, i) => ({ key: 'l' + i, label }))]
    : [];
  const crumbGo = i => popSteps(crumbs.length - 1 - i);
  const header = crumbs.length && isPhone ? (
    <h2 style={{ display: 'flex', alignItems: 'center', minWidth: 0, fontSize: 18, fontWeight: 700, margin: 0 }}>
      <button type="button" onClick={() => popSteps(1)} aria-label={`Back to ${crumbs[crumbs.length - 2].label}`}
        style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, border: 'none', background: 'none', padding: 0, color: 'var(--text)', fontSize: 18, fontWeight: 700, cursor: 'pointer' }}
      >
        <span aria-hidden="true" style={{ color: 'var(--accent)', fontWeight: 400 }}>‹</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{crumbs[crumbs.length - 1].label}</span>
      </button>
    </h2>
  ) : crumbs.length ? (
    // Same 18/700 as the undrilled title below — the breadcrumb REPLACES it,
    // so a smaller size just made the whole page shift up on drill-in.
    <h2 style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: 18, fontWeight: 700, margin: 0 }}>
      {crumbs.map((c, i) => (i === crumbs.length - 1 ? (
        <span key={c.key} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
      ) : (
        <span key={c.key} style={{ display: 'contents' }}>
          <button type="button" onClick={() => crumbGo(i)}
            style={{ border: 'none', background: 'none', padding: 0, color: 'var(--accent)', fontSize: 18, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >{c.label}</button>
          <span aria-hidden="true" style={{ color: 'var(--muted)', fontSize: 18, fontWeight: 400 }}>›</span>
        </span>
      )))}
    </h2>
  ) : (
    <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Spending Breakdown</h2>
  );

  const exportBtn = (
    <button onClick={onExportClick} disabled={exportDisabled} aria-label="Export spending report as CSV"
      style={{ border: 'none', background: 'none', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: exportDisabled ? 'default' : 'pointer', opacity: exportDisabled ? 0.5 : 1, padding: 0 }}
    >Export</button>
  );

  const leftCard = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      <section aria-label="Total spending" style={{ ...card, padding: '18px 20px' }}>
        {/* flexWrap + a non-wrapping amount: on a phone the toggle drops to its
            own line rather than squeezing "Rs 464,180" onto two lines. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Total Spending</div>
            <div className="tnum" style={{ fontSize: 22, fontWeight: 700, marginTop: 2, whiteSpace: 'nowrap' }}>{money(total)}</div>
          </div>
          <span style={{ flex: 1 }} />
          <RecoverableSwitch checked={incRec} onChange={on => setPrefs({ includeRecoverableBreakdown: on })} withLabel={!isPhone} />
          <ViewToggle view={lens} onChange={changeLens} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
          {total === 0 ? emptyNote : (
            <SpendingDonut
              slices={slices} total={total} money={money} onSliceClick={openFocus}
              labels={!isPhone} size={isPhone ? 280 : 380}
            />
          )}
        </div>
      </section>

      <section aria-label="Spending stats" style={{ ...card, padding: '18px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {statBlocks.map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>{s.label}</div>
              <div className="tnum" style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{s.value}</div>
              {s.sub && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{s.sub}</div>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  const rightCard = (
    <section aria-label={lens === 'groups' && !drill ? 'Spending by group' : 'Spending by category'} style={{ ...card, padding: '18px 20px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {visibleRows.length === 0 ? emptyNote : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 460, overflowY: 'auto' }}>
          {visibleRows.map(r => {
            const focused = focus?.id === r.id;
            return (
              <button key={r.id} type="button" onClick={e => rowClick(r, e)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 6, width: '100%', textAlign: 'left',
                  border: 'none', borderRadius: 8, padding: '8px 10px', cursor: 'pointer',
                  background: focused ? 'var(--soft)' : 'transparent',
                }}
                className="hv-soft"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                  <span className="tnum" style={{ fontSize: 13, fontWeight: 600, flex: 'none' }}>{money(r.amt)}</span>
                </div>
                {r.amt > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 6, background: 'var(--track)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${r.pct * 100}%`, height: '100%', background: r.color || 'var(--muted)', borderRadius: 3 }} />
                    </div>
                    <span className="tnum" style={{ fontSize: 11.5, color: 'var(--muted)', flex: 'none', width: 30, textAlign: 'right' }}>{pctLabel(r.pct)}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {header}
        <span style={{ flex: 1 }} />
        {exportBtn}
      </div>
      <ReportFilterBar
        store={S} range={range} onRangeChange={r => setRange(clampRange(r.from, r.to))}
        catSel={catSel} onCatSel={setCatSel} acctSel={acctSel} onAcctSel={setAcctSel}
      />
      <div style={isPhone
        ? { display: 'flex', flexDirection: 'column', gap: 16 }
        : { display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, alignItems: 'start' }}
      >
        {leftCard}
        {rightCard}
      </div>

      <TransactionPopover
        open={!!focus} anchor={focus?.anchor} onClose={() => setFocus(null)}
        title={focusRow || { name: '', icon: null, color: null }}
        rows={focus ? categoryTxRows(S, focus.id, opts) : []}
        money={money}
      />
      <ExportModal open={exportOpen} onCancel={() => setExportOpen(false)} onExport={onExportConfirm} />
    </div>
  );
}
