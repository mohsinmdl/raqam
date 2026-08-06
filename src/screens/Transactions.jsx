// Transactions list screen — template 268-336, txScreenVals script 1018-1054.
import { useEffect, useState } from 'react';
import { useStore } from '../store/StoreProvider.jsx';
import { useMonth } from '../store/MonthContext.jsx';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useMoney, parseAmt } from '../lib/format.js';
import { isExcludedCat } from '../lib/calc.js';
import { nowIso } from '../lib/dates.js';
import { MONTH_OPTS, RANGE_PRESETS, clampRange, inRange, presetOf, rangeFor, rangeLabel, yearOpts } from '../lib/dateRange.js';
import { txGroups } from '../lib/txRow.js';
import { openers } from '../drawers/openers.js';
import TxChips from '../ui/TxChips.jsx';
import { advanceDue, longDate, ruleFromTx } from '../lib/schedule.js';
import { deleteTransactions, postTransactionNow, setTransactionsCategory, setTransactionsStatus, skipOccurrence } from '../store/actions.js';
import RowMenu from '../ui/RowMenu.jsx';
import Checkbox from '../ui/Checkbox.jsx';
import BulkBar from '../ui/BulkBar.jsx';
import PositionStrip from '../components/PositionStrip.jsx';

const DEFAULT_FILTERS = { q: '', acct: 'all', cat: 'all', type: 'all', status: 'all', impact: 'all', min: '', max: '' };
const selStyle = { height: 36, padding: '0 8px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13 };
const th = { textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.05em', color: 'var(--muted)', padding: '9px 8px', borderBottom: '1px solid var(--border)' };
const td = { padding: '10px 8px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' };
const rowBtn = { height: 26, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', flex: 'none' };

export default function Transactions() {
  const { data: S, applyData } = useStore();
  const { ask, notify } = useUI();
  const { month } = useMonth();
  const fmt = useMoney();
  const { openDrawer } = useDrawer();
  const [F, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState('date');
  const [menuOpen, setMenuOpen] = useState(null);
  // Seeded from the globally selected month: stepping to July on Dashboard and
  // then opening Transactions should still show July.
  const [range, setRange] = useState(() => ({ from: month, to: month }));
  const [rangeOpen, setRangeOpen] = useState(false);
  // The popover edits a draft; nothing re-filters until Apply.
  const [draft, setDraft] = useState(range);
  // Ids, not rows: a row object goes stale the moment anything re-renders.
  const [selected, setSelected] = useState(() => new Set());
  // Collapsed by default: this screen is for the ledger, and the scheduled
  // group is a standing header above it rather than the reason you came. Its
  // heading still carries the count and any overdue tally, so nothing is
  // hidden — only folded.
  const [schedOpen, setSchedOpen] = useState(false);
  const [postedOpen, setPostedOpen] = useState(true);

  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  const reset = () => { setFilters(DEFAULT_FILTERS); setRange(rangeFor('month')); };
  const openRange = () => { setDraft(range); setRangeOpen(true); };
  const applyRange = () => { setRange(clampRange(draft.from, draft.to)); setRangeOpen(false); };
  const setBound = (key, part, v) => setDraft(d => {
    const cur = d[key] || rangeFor('month').from;
    const next = part === 'm' ? cur.slice(0, 4) + '-' + v : v + '-' + cur.slice(5);
    return { ...d, [key]: next };
  });
  const years = yearOpts(S);
  const activePreset = presetOf(draft.from, draft.to);
  const removeChip = k => setF(k, DEFAULT_FILTERS[k]);

  const monthTx = S.transactions.filter(t => inRange(t, range.from, range.to));
  const q = F.q.trim().toLowerCase();
  const minA = parseAmt(F.min), maxA = parseAmt(F.max);
  const catName = id => ((S.categories.find(c => c.id === id) || {}).name || '');
  let list = monthTx.filter(t => {
    if (q && !((t.merchant || '').toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q) || catName(t.category).toLowerCase().includes(q))) return false;
    if (F.acct !== 'all') { const [k, id] = F.acct.split(':'); if (k === 'acc' && !(t.accountId === id || t.toAccountId === id)) return false; if (k === 'card' && !(t.cardId === id || t.toCardId === id)) return false; }
    if (F.cat !== 'all' && t.category !== F.cat) return false;
    if (F.type !== 'all' && t.type !== F.type) return false;
    if (F.status !== 'all' && t.status !== F.status) return false;
    if (F.impact !== 'all') {
      // Recoverable = expense/refund in an excluded category (advances etc.).
      const recoverable = (t.type === 'expense' || t.type === 'refund') && isExcludedCat(S, t.category);
      if (F.impact === 'excluded' ? !recoverable : recoverable) return false;
    }
    if (isFinite(minA) && t.amount < minA) return false;
    if (isFinite(maxA) && Math.abs(t.amount) > maxA) return false;
    return true;
  });
  list = list.sort((a, b) => (sort === 'amount' ? Math.abs(b.amount) - Math.abs(a.amount) : b.date.localeCompare(a.date)));

  // Scheduled and recorded are two populations, not one list — txGroups holds
  // the rules for which row lands where, and is tested there.
  const now = nowIso();
  const anyFilter = Object.keys(DEFAULT_FILTERS).some(k => F[k] !== DEFAULT_FILTERS[k]);
  const { scheduled, postedRows, postedTx, overdueCount, hiddenRuleCount } = txGroups(list, S, fmt, now, range, anyFilter);

  // Selection is pruned to what is currently visible. Keeping ids that a filter
  // has hidden would let the toolbar claim "12 selected" while showing three,
  // and then act on all twelve. Collapsing the scheduled group hides its rows,
  // so its ids leave the visible set for exactly the same reason.
  // Grouping only appears when there is something scheduled to separate from.
  // Without it the recorded rows carry no heading, so they must be treated as
  // open regardless of postedOpen — otherwise collapsing the group and then
  // filtering the scheduled rows away would strand the rows with no control
  // left on screen to expand them again.
  const grouped = scheduled.length > 0;
  const postedShown = !grouped || postedOpen;
  // Scheduled rows carry no checkbox at all — selection belongs to the ledger
  // below — so only the recorded rows are ever selectable, and collapsing the
  // scheduled group no longer changes what "select all" means.
  const visibleIds = postedShown ? postedTx.map(t => t.id) : [];
  const sel = visibleIds.filter(id => selected.has(id));
  const allVisibleSelected = sel.length > 0 && sel.length === visibleIds.length;
  const clearSel = () => setSelected(new Set());
  const toggleRow = (id, on) => setSelected(prev => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });
  const toggleAll = on => setSelected(on ? new Set(visibleIds) : new Set());

  // Escape clears the selection. Bubble phase, so RowMenu's capture-phase
  // handler still wins while a row menu is open, and the range popover — which
  // also stops propagation — keeps its own Escape.
  useEffect(() => {
    if (sel.length === 0) return;
    const onKey = e => { if (e.key === 'Escape') clearSel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sel.length]);

  const askSkip = async row => {
    const r = S.recurring.find(x => x.id === row.ruleId);
    if (!r) return;
    const after = advanceDue(r.schedule, r.nextDate);
    const ok = await ask({
      title: 'Skip this one?',
      body: 'Nothing is recorded for ' + longDate(r.nextDate, now) + '. “' + r.name + '” moves on to ' + longDate(after, now) + '.',
      action: 'Skip this one',
      tone: 'accent',
    });
    if (!ok) return;
    applyData(data => skipOccurrence(data, { id: r.id, due: r.nextDate }));
    notify('Skipped — nothing recorded. Next due ' + longDate(after, now) + '.');
  };

  const askPostNow = async row => {
    const ok = await ask({
      title: 'Move this to today?',
      body: '“' + row.merchant + '” is dated ' + row.dateLabel + '. Posting it now re-dates it to today, so it counts in your balance straight away.',
      action: 'Post now',
      tone: 'accent',
    });
    if (!ok) return;
    applyData(data => postTransactionNow(data, { id: row.id, now: nowIso() }));
    notify('Posted — dated today and counted.');
  };

  const afterBulk = (msg, next) => { applyData(next); clearSel(); notify(msg); };
  const bulkStatus = status => afterBulk(
    'Marked ' + sel.length + ' as ' + status + '.',
    data => setTransactionsStatus(data, { ids: sel, status }),
  );
  const bulkDelete = async () => {
    const ok = await ask({
      title: 'Delete ' + sel.length + ' transaction' + (sel.length === 1 ? '' : 's') + '?',
      body: 'They are removed from every balance and total that counted them. This cannot be undone.',
      action: 'Delete ' + sel.length,
    });
    if (!ok) return;
    afterBulk('Deleted ' + sel.length + '.', data => deleteTransactions(data, { ids: sel }));
  };

  const filterAcctOpts = S.accounts.filter(a => a.status === 'active').map(a => ({ id: 'acc:' + a.id, label: a.nickname }))
    .concat(S.cards.map(c => ({ id: 'card:' + c.id, label: c.nickname + ' ••' + c.last4 })));
  const filterCatOpts = S.categories.map(c => ({ id: c.id, label: c.name }));

  const chips = [];
  if (q) chips.push({ k: 'q', label: '“' + F.q + '”' });
  if (F.acct !== 'all') { const o = filterAcctOpts.find(x => x.id === F.acct); chips.push({ k: 'acct', label: o ? o.label : F.acct }); }
  if (F.cat !== 'all') chips.push({ k: 'cat', label: catName(F.cat) || F.cat });
  if (F.type !== 'all') chips.push({ k: 'type', label: F.type.charAt(0).toUpperCase() + F.type.slice(1) });
  if (F.status !== 'all') chips.push({ k: 'status', label: F.status.charAt(0).toUpperCase() + F.status.slice(1) });
  if (F.impact !== 'all') chips.push({ k: 'impact', label: F.impact === 'excluded' ? 'Excluded from budgets' : 'Counted in budgets' });
  if (F.min) chips.push({ k: 'min', label: 'Min Rs ' + F.min });
  if (F.max) chips.push({ k: 'max', label: 'Max Rs ' + F.max });

  const addDisabled = S.accounts.filter(a => a.status === 'active').length === 0;

  // One row renderer for both groups. ruleRowOf returns a txRowOf-shaped object,
  // so these cells never branch on which population they are drawing — the only
  // differences are handed in: selId (rules have none, so no checkbox) and the
  // action cell.
  const Row = ({ t, selId, actions }) => (
    <tr className="hv-elev" style={{ opacity: t.rowOpacity, background: selId && selected.has(selId) ? 'var(--soft)' : undefined }}>
      <td style={{ ...td, padding: '10px 4px 10px 18px' }}>
        {selId && (
          <Checkbox
            checked={selected.has(selId)}
            onChange={on => toggleRow(selId, on)}
            label={'Select ' + t.merchant + ' on ' + t.dateLabel}
          />
        )}
      </td>
      <td style={{ ...td, padding: '10px 8px' }}>
        <div className="tnum" style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>{t.dateLabel}</div>
        <div style={{ fontSize: 11.5, whiteSpace: 'nowrap', color: t.isOverdue ? 'var(--neg)' : 'var(--muted)', fontWeight: t.isOverdue ? 600 : 400 }}>{t.timeLabel}</div>
      </td>
      <td style={{ ...td, maxWidth: 280 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.merchant}</span>
          <TxChips row={t} meta />
        </div>
        {t.hasNotes && <div style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.notes}</div>}
      </td>
      <td style={td}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: t.catColor, flex: 'none' }} />
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{t.catName}</span>
        </div>
      </td>
      <td style={td}><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{t.acctLabel}</span></td>
      <td style={td}><span title={t.stTitle || undefined} style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: t.stBg, color: t.stFg }}>{t.stLabel}</span></td>
      <td style={{ ...td, padding: '10px 8px', textAlign: 'right' }}>
        <span className="tnum" style={{ fontSize: 13.5, fontWeight: 600, color: t.amtColor, whiteSpace: 'nowrap' }}>{t.amtLabel}</span>
      </td>
      <td style={{ ...td, padding: '10px 18px 10px 8px', textAlign: 'right' }}>
        <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>{actions}</span>
      </td>
    </tr>
  );

  // Group heading inside the table. A single full-width cell keeps the column
  // grid intact — a separate table per group would let the two drift apart.
  const GroupHead = ({ open, onToggle, label, count, note }) => (
    <tr>
      <td colSpan={8} style={{ padding: 0, borderBottom: '1px solid var(--border)', background: 'var(--elev)' }}>
        <button
          onClick={onToggle} aria-expanded={open}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 18px', border: 'none', background: 'none', color: 'var(--text)', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}
        >
          <span aria-hidden="true" style={{ fontSize: 10, color: 'var(--muted)', width: 10 }}>{open ? '▾' : '▸'}</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.05em' }}>{label}</span>
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{count}</span>
          {note && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>· {note}</span>}
        </button>
      </td>
    </tr>
  );

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px 56px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'hsFade .25s ease' }}>
        <PositionStrip />
        <section aria-label="Filters" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <button
                onClick={openRange} aria-haspopup="dialog" aria-expanded={rangeOpen}
                className="hv-soft"
                style={{ ...selStyle, padding: '0 12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >{rangeLabel(range.from, range.to)} ▾</button>
              {rangeOpen && (
                <>
                  <div onClick={() => setRangeOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 29 }} />
                  <div role="dialog" aria-label="Date range" style={{ position: 'absolute', top: 42, left: 0, zIndex: 30, width: 580, maxWidth: '92vw', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)', padding: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, paddingBottom: 10 }}>View Options</div>
                    {/* nowrap keeps the five presets on one line; it scrolls
                        rather than wrapping if the window is too narrow. */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 12, borderTop: '1px solid var(--border)', paddingTop: 12, borderBottom: '1px solid var(--border)' }}>
                      {RANGE_PRESETS.map(p => (
                        <button key={p.id} onClick={() => setDraft(rangeFor(p.id))} className="hv-soft"
                          style={{ height: 30, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                            border: '1px solid ' + (activePreset === p.id ? 'var(--accent)' : 'var(--border)'),
                            background: activePreset === p.id ? 'var(--accent)' : 'var(--surface)',
                            color: activePreset === p.id ? 'var(--on-accent)' : 'var(--text)' }}>{p.label}</button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', padding: '14px 0' }}>
                      {[['from', 'From'], ['to', 'To']].map(([key, label]) => (
                        <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{label}:</span>
                          <select aria-label={label + ' month'} value={(draft[key] || rangeFor('month').from).slice(5)}
                            onChange={e => setBound(key, 'm', e.target.value)} style={{ ...selStyle, height: 32, maxWidth: 120 }}>
                            {MONTH_OPTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                          </select>
                          <select aria-label={label + ' year'} value={(draft[key] || rangeFor('month').from).slice(0, 4)}
                            onChange={e => setBound(key, 'y', e.target.value)} style={{ ...selStyle, height: 32, maxWidth: 92 }}>
                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                          </select>
                        </span>
                      ))}
                    </div>
                    {!draft.from && !draft.to && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', paddingBottom: 10 }}>All dates — every transaction you have recorded.</div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                      <button onClick={() => setRangeOpen(false)} className="hv-soft" style={{ height: 32, padding: '0 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                      <button onClick={applyRange} className="hv-accent" style={{ height: 32, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Apply</button>
                    </div>
                  </div>
                </>
              )}
            </div>
            <input aria-label="Search transactions" placeholder="Search merchant, notes, category…" value={F.q} onChange={e => setF('q', e.target.value)} style={{ ...selStyle, flex: 2, minWidth: 220, padding: '0 12px' }} />
            <select aria-label="Account or card" value={F.acct} onChange={e => setF('acct', e.target.value)} style={{ ...selStyle, maxWidth: 190 }}>
              <option value="all">All accounts &amp; cards</option>
              {filterAcctOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <select aria-label="Category" value={F.cat} onChange={e => setF('cat', e.target.value)} style={{ ...selStyle, maxWidth: 170 }}>
              <option value="all">All categories</option>
              {filterCatOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <select aria-label="Type" value={F.type} onChange={e => setF('type', e.target.value)} style={selStyle}>
              <option value="all">All types</option><option value="expense">Expense</option><option value="income">Income</option><option value="transfer">Transfer</option><option value="refund">Refund</option><option value="adjustment">Balance adjustment</option><option value="cardAdjustment">Card correction</option>
            </select>
            <select aria-label="Status" value={F.status} onChange={e => setF('status', e.target.value)} style={selStyle}>
              <option value="all">Any status</option><option value="cleared">Cleared</option><option value="pending">Pending</option>
            </select>
            <select aria-label="Budget impact" value={F.impact} onChange={e => setF('impact', e.target.value)} style={selStyle}>
              <option value="all">Any budget impact</option><option value="counted">Counted in budgets</option><option value="excluded">Excluded from budgets</option>
            </select>
            <input aria-label="Minimum amount" placeholder="Min Rs" inputMode="numeric" value={F.min} onChange={e => setF('min', e.target.value)} style={{ ...selStyle, width: 86, padding: '0 10px' }} />
            <input aria-label="Maximum amount" placeholder="Max Rs" inputMode="numeric" value={F.max} onChange={e => setF('max', e.target.value)} style={{ ...selStyle, width: 86, padding: '0 10px' }} />
            <button onClick={reset} className="hv-text" style={{ height: 36, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--muted)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>Reset</button>
          </div>
          {chips.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }} aria-label="Active filters">
              {chips.map(c => (
                <button key={c.k} onClick={() => removeChip(c.k)} title="Remove filter" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', border: 'none', borderRadius: 999, background: 'var(--soft)', color: 'var(--accent-h)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {c.label}<span aria-hidden="true">×</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <BulkBar
          count={sel.length}
          onClear={clearSel}
          actions={[
            { label: 'Mark cleared', onClick: () => bulkStatus('cleared') },
            { label: 'Mark pending', onClick: () => bulkStatus('pending') },
            { label: 'Delete', onClick: bulkDelete, tone: 'neg' },
          ]}
        />

        {/* No overflow:hidden — it would clip the per-row ⋯ menu on the last rows. */}
        <section aria-label="Transaction list" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Showing {list.length} of {monthTx.length} {range.from || range.to ? 'in ' + rangeLabel(range.from, range.to) : 'across all dates'} · manually entered</span>
            <span style={{ flex: 1 }} />
            <button onClick={() => setSort(s => (s === 'date' ? 'amount' : 'date'))} className="hv-accent-fg" style={{ border: 'none', background: 'none', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
              {sort === 'date' ? 'Newest first ↓' : 'Largest first ↓'}
            </button>
          </div>
          {(postedRows.length > 0 || scheduled.length > 0) && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th scope="col" style={{ ...th, padding: '9px 4px 9px 18px', width: 34 }}>
                    <Checkbox
                      checked={allVisibleSelected}
                      indeterminate={sel.length > 0 && !allVisibleSelected}
                      onChange={toggleAll}
                      label={allVisibleSelected ? 'Clear selection' : 'Select all ' + visibleIds.length + ' visible transactions'}
                    />
                  </th>
                  <th scope="col" style={{ ...th, padding: '9px 8px' }}>DATE</th>
                  <th scope="col" style={th}>DETAILS</th>
                  <th scope="col" style={th}>CATEGORY</th>
                  <th scope="col" style={th}>ACCOUNT / CARD</th>
                  <th scope="col" style={th}>STATUS</th>
                  <th scope="col" style={{ ...th, textAlign: 'right', padding: '9px 8px' }}>AMOUNT</th>
                  <th scope="col" style={{ ...th, padding: '9px 18px 9px 8px', width: 56 }}><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Actions</span></th>
                </tr>
              </thead>
              {scheduled.length > 0 && (
                <tbody>
                  <GroupHead
                    open={schedOpen} onToggle={() => setSchedOpen(o => !o)} label="SCHEDULED"
                    count={scheduled.length + (scheduled.length === 1 ? ' item' : ' items')}
                    note={[
                      overdueCount > 0 ? overdueCount + ' overdue' : 'not yet spent',
                      // Say so rather than truncating silently: a folded reminder
                      // is a real future obligation the reader can't see.
                      hiddenRuleCount > 0 ? hiddenRuleCount + ' more later' : null,
                    ].filter(Boolean).join(' · ')}
                  />
                  {/* Every scheduled row is the same shape — no checkbox, two
                      ghost buttons — so the group reads as one list. The verbs
                      differ because the rows genuinely differ: a reminder has
                      nothing recorded yet, a future transaction already exists
                      and is only waiting for its date. */}
                  {schedOpen && scheduled.map(x => (
                    <Row
                      key={x.row.key || x.row.id} t={x.row}
                      actions={x.row.isRule ? (
                        <>
                          <button onClick={() => openers.recordRule(S, x.row.ruleId, openDrawer)} className="hv-soft" style={{ ...rowBtn, color: 'var(--accent)' }}>Record</button>
                          <button onClick={() => askSkip(x.row)} className="hv-soft" style={{ ...rowBtn, color: 'var(--muted)' }}>Skip</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => askPostNow(x.row)} className="hv-soft" style={{ ...rowBtn, color: 'var(--accent)' }}>Post now</button>
                          <button onClick={() => openers.editTx(S, x.selId, openDrawer)} className="hv-soft" style={{ ...rowBtn, color: 'var(--muted)' }}>Edit</button>
                        </>
                      )}
                    />
                  ))}
                </tbody>
              )}
              <tbody>
                {/* The recorded heading only appears when there is a scheduled
                    group above it — on its own it would label the obvious. */}
                {grouped && postedRows.length > 0 && (
                  <GroupHead
                    open={postedOpen} onToggle={() => setPostedOpen(o => !o)} label="RECORDED"
                    count={postedRows.length + (postedRows.length === 1 ? ' item' : ' items')}
                  />
                )}
                {postedShown && postedRows.map(t => (
                  <Row
                    key={t.id} t={t} selId={t.id}
                    actions={(t.canEdit || (t.canRepeat && !ruleFromTx(S, t.id))) && (
                      <RowMenu
                        open={menuOpen === t.id}
                        onToggle={() => setMenuOpen(menuOpen === t.id ? null : t.id)}
                        onClose={() => setMenuOpen(null)}
                        label="Actions for this transaction"
                        items={[
                          t.canEdit && { label: 'Edit', onClick: () => openers.editTx(S, t.id, openDrawer) },
                          t.canRepeat && !ruleFromTx(S, t.id) && { label: 'Make repeating', onClick: () => openers.makeRepeating(S, t.id, openDrawer) },
                        ]}
                      />
                    )}
                  />
                ))}
              </tbody>
            </table>
          )}
          {list.length === 0 && monthTx.length > 0 && (
            <div style={{ padding: '44px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>No matches for these filters</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>Try widening the amount range or clearing a filter.</div>
              <button onClick={reset} className="hv-soft" style={{ marginTop: 12, height: 32, padding: '0 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Reset filters</button>
            </div>
          )}
          {monthTx.length === 0 && scheduled.length === 0 && (
            <div style={{ padding: '44px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{range.from || range.to ? 'Nothing recorded in ' + rangeLabel(range.from, range.to) : 'Nothing recorded yet'}</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4, maxWidth: '44ch', marginLeft: 'auto', marginRight: 'auto' }}>Transactions you add appear here with search and filters. Recording as you spend keeps your dashboard honest.</div>
              <button onClick={() => openers.addTx(openDrawer)} disabled={addDisabled} className="hv-accent" style={{ marginTop: 12, height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: addDisabled ? 'default' : 'pointer', opacity: addDisabled ? .45 : 1 }}>＋ Add transaction</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
