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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useStore } from '../../store/StoreProvider.jsx';
import { useMoney } from '../../lib/format.js';
import { useIsPhone } from '../../lib/useIsPhone.js';
import { clampRange } from '../../lib/dateRange.js';
import { breakdownByCategory, breakdownByGroup, breakdownStats, categoryTxRows, foldForDonut } from '../../lib/spendingReport.js';
import { exportSpendingReport } from '../../lib/spendingExport.js';
import { useUI } from '../../ui/UIProvider.jsx';
import ReportFilterBar from '../../ui/reflect/ReportFilterBar.jsx';
import SpendingDonut, { pctLabel } from '../../ui/reflect/SpendingDonut.jsx';
import TransactionPopover from '../../ui/reflect/TransactionPopover.jsx';
import ExportModal from '../../ui/reflect/ExportModal.jsx';

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 };

const SKIP_KEY = 'raqam.reflect.exportConfirmSkip';

// "1 transactions" reads wrong — pluralize the count-driven noun.
const plural = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;

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
  const { data: S } = useStore();
  const { money } = useMoney();
  const { notify } = useUI();
  const isPhone = useIsPhone();

  const [range, setRange] = useState(() => ({ from: month, to: month }));
  const [catSel, setCatSel] = useState(null);   // null | Set
  const [acctSel, setAcctSel] = useState(null); // null | Set
  const [lens, setLens] = useState('categories');
  const [drillGroupId, setDrillGroupId] = useState(null);
  const [focus, setFocus] = useState(null);     // { id, anchor } | null
  const [exportOpen, setExportOpen] = useState(false);

  const opts = { from: range.from, to: range.to, acctIds: acctSel, catIds: catSel };
  const catRows = useMemo(() => breakdownByCategory(S, opts), [S, range, catSel, acctSel]);
  const groupRows = useMemo(() => breakdownByGroup(S, opts), [S, range, catSel, acctSel]);
  const drill = drillGroupId ? groupRows.find(g => g.id === drillGroupId) : null;

  // Visible rows: categories lens → catRows (zero rows hidden below); groups
  // lens → groupRows (zero rows hidden below); drilled → catRows subset
  // re-based so pct is within the group (YNAB: 82%/13%/5% inside Needs), all
  // members shown including zeros.
  const rows = useMemo(() => {
    if (lens === 'categories') return catRows;
    if (!drill) return groupRows;
    const member = catRows.filter(r => drill.catIds.includes(r.id));
    const t = member.reduce((s, r) => s + r.amt, 0);
    return member.map(r => ({ ...r, pct: t ? r.amt / t : 0 }));
  }, [lens, drill, catRows, groupRows]);
  const total = rows.reduce((s, r) => s + r.amt, 0);
  // Memoized: SpendingDonut's option-building effect depends on `slices` by
  // identity, so a fresh array every render would rebuild the chart and
  // replay its entry animation on every unrelated parent re-render.
  // foldForDonut caps the ring at the top few categories + one gray "Other";
  // the category list (visibleRows) is untouched and still shows every row.
  const slices = useMemo(() => foldForDonut(rows.filter(r => r.amt > 0)), [rows]);
  const stats = useMemo(() => breakdownStats(S, drill
    ? { ...opts, catIds: new Set(drill.catIds.filter(id => !catSel || catSel.has(id))) }
    : opts), [S, range, catSel, acctSel, drill]);

  // Displayed list: top-level lenses hide zero-amount rows; the drilled group
  // list shows every member category, zeros included (rendered without a bar).
  const visibleRows = drill ? rows : rows.filter(r => r.amt > 0);

  // Clear the open popover whenever anything upstream of the row set changes
  // — its anchor/id may no longer refer to a visible row.
  useEffect(() => { setFocus(null); }, [range, catSel, acctSel, lens, drillGroupId]);
  // If the drilled group disappears from the (filter-scoped) group list, back
  // out of drill rather than pointing at nothing.
  useEffect(() => {
    if (drillGroupId && !groupRows.some(g => g.id === drillGroupId)) setDrillGroupId(null);
  }, [drillGroupId, groupRows]);

  const openFocus = useCallback((id, anchor) => {
    if (id === '__other__') return; // the folded donut aggregate isn't one drillable category
    const g = lens === 'groups' && !drill ? groupRows.find(x => x.id === id) : null;
    if (g) { setDrillGroupId(id); return; } // donut slice click in groups lens drills too
    setFocus({ id, anchor });
  }, [lens, drill, groupRows]);

  const rowClick = (r, e) => {
    if (lens === 'groups' && !drill) { setDrillGroupId(r.id); return; }
    openFocus(r.id, e.currentTarget);
  };

  const changeLens = key => { setLens(key); setDrillGroupId(null); setFocus(null); };

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
      exportSpendingReport(S, drill ? { ...opts, catIds: new Set(drill.catIds) } : opts);
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
  const header = drill ? (
    // Same 18/700 as the undrilled title below — the breadcrumb REPLACES it,
    // so a smaller size just made the whole page shift up on drill-in.
    <h2 style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: 18, fontWeight: 700, margin: 0 }}>
      <button type="button" onClick={() => setDrillGroupId(null)}
        style={{ border: 'none', background: 'none', padding: 0, color: 'var(--accent)', fontSize: 18, fontWeight: 700, cursor: 'pointer' }}
      >All Groups</button>
      <span style={{ color: 'var(--muted)', fontSize: 18, fontWeight: 400 }}>›</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{drill.name}</span>
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
