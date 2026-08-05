// Transactions list screen — template 268-336, txScreenVals script 1018-1054.
import { useState } from 'react';
import { useStore } from '../store/StoreProvider.jsx';
import { useMonth } from '../store/MonthContext.jsx';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useMoney, parseAmt } from '../lib/format.js';
import { inMonth, isExcludedCat, monthLabel } from '../lib/calc.js';
import { txRowOf } from '../lib/txRow.js';
import { openers } from '../drawers/openers.js';
import { RepeatIcon, TransferIcon } from '../ui/icons.jsx';
import { ruleFromTx } from '../lib/schedule.js';
import RowMenu from '../ui/RowMenu.jsx';

const DEFAULT_FILTERS = { q: '', acct: 'all', cat: 'all', type: 'all', status: 'all', impact: 'all', min: '', max: '' };
const selStyle = { height: 36, padding: '0 8px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13 };
const th = { textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.05em', color: 'var(--muted)', padding: '9px 8px', borderBottom: '1px solid var(--border)' };
const td = { padding: '10px 8px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' };

export default function Transactions() {
  const { data: S } = useStore();
  const { month } = useMonth();
  const fmt = useMoney();
  const { openDrawer } = useDrawer();
  const [F, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState('date');
  const [menuOpen, setMenuOpen] = useState(null);

  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  const reset = () => setFilters(DEFAULT_FILTERS);
  const removeChip = k => setF(k, DEFAULT_FILTERS[k]);

  const monthTx = S.transactions.filter(t => inMonth(t, month));
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
  const txRows = list.map(t => txRowOf(t, S, fmt));

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

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px 56px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'hsFade .25s ease' }}>
        <section aria-label="Filters" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
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

        {/* No overflow:hidden — it would clip the per-row ⋯ menu on the last rows. */}
        <section aria-label="Transaction list" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Showing {list.length} of {monthTx.length} in {monthLabel(month)} · manually entered</span>
            <span style={{ flex: 1 }} />
            <button onClick={() => setSort(s => (s === 'date' ? 'amount' : 'date'))} className="hv-accent-fg" style={{ border: 'none', background: 'none', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
              {sort === 'date' ? 'Newest first ↓' : 'Largest first ↓'}
            </button>
          </div>
          {txRows.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th scope="col" style={{ ...th, padding: '9px 8px 9px 18px' }}>DATE</th>
                  <th scope="col" style={th}>DETAILS</th>
                  <th scope="col" style={th}>CATEGORY</th>
                  <th scope="col" style={th}>ACCOUNT / CARD</th>
                  <th scope="col" style={th}>STATUS</th>
                  <th scope="col" style={{ ...th, textAlign: 'right', padding: '9px 8px' }}>AMOUNT</th>
                  <th scope="col" style={{ ...th, padding: '9px 18px 9px 8px', width: 56 }}><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {txRows.map(t => (
                  <tr key={t.id} className="hv-elev" style={{ opacity: t.rowOpacity }}>
                    <td style={{ ...td, padding: '10px 8px 10px 18px' }}>
                      <div className="tnum" style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>{t.dateLabel}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{t.timeLabel}</div>
                    </td>
                    <td style={{ ...td, maxWidth: 280 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.merchant}</span>
                        {t.hasChip && <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: t.chipBg, color: t.chipFg, border: '1px solid var(--border)', flex: 'none', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{t.chipIcon === 'transfer' && <TransferIcon size={11} />}{t.chip}</span>}
                        {t.isRepeating && <span title="Part of a recurring rule" style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: 'var(--soft)', color: 'var(--accent)', border: '1px solid var(--border)', flex: 'none', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}><RepeatIcon size={11} />Repeats</span>}
                        {t.edited && <span title={t.editedLabel} style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--muted)', flex: 'none', whiteSpace: 'nowrap' }}>Edited</span>}
                        {t.excluded && <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--muted)', flex: 'none', whiteSpace: 'nowrap' }}>{t.excludedLabel}</span>}
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
                    <td style={td}><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: t.stBg, color: t.stFg }}>{t.stLabel}</span></td>
                    <td style={{ ...td, padding: '10px 8px', textAlign: 'right' }}>
                      <span className="tnum" style={{ fontSize: 13.5, fontWeight: 600, color: t.amtColor, whiteSpace: 'nowrap' }}>{t.amtLabel}</span>
                    </td>
                    <td style={{ ...td, padding: '10px 18px 10px 8px', textAlign: 'right' }}>
                      <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        {(t.canEdit || (t.canRepeat && !ruleFromTx(S, t.id))) && (
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
                      </span>
                    </td>
                  </tr>
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
          {monthTx.length === 0 && (
            <div style={{ padding: '44px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Nothing recorded in {monthLabel(month)}</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4, maxWidth: '44ch', marginLeft: 'auto', marginRight: 'auto' }}>Transactions you add appear here with search and filters. Recording as you spend keeps your dashboard honest.</div>
              <button onClick={() => openers.addTx(openDrawer)} disabled={addDisabled} className="hv-accent" style={{ marginTop: 12, height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: addDisabled ? 'default' : 'pointer', opacity: addDisabled ? .45 : 1 }}>＋ Add transaction</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
