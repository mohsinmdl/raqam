// Categories manager — design v2 template 506-573 + categoriesVals 1553-1589.
// Flat list (no subcategories); per-row actions collapsed into one kebab menu.
// CSS-grid rows (not a <table>) so the menu popover isn't clipped.
import { useState } from 'react';
import { useStore } from '../store/StoreProvider.jsx';
import { useMonth } from '../store/MonthContext.jsx';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useMoney } from '../lib/format.js';
import { catRefs, catMonthTotal } from '../lib/calc.js';
import { deletePolicy } from '../lib/validate.js';
import { iconStyle } from '../lib/catIcon.js';
import { archiveCategory, restoreCategory, deleteCategory } from '../store/actions.js';
import RowMenu from '../ui/RowMenu.jsx';
import { openers } from '../drawers/openers.js';

const DEFAULT_FILTERS = { q: '', type: 'all', status: 'active' };
const selStyle = { height: 36, padding: '0 8px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13 };
const colHeader = { fontSize: 11, fontWeight: 600, letterSpacing: '.05em', color: 'var(--muted)' };
const gridCols = { display: 'grid', gridTemplateColumns: 'minmax(0,2.2fr) minmax(0,1fr) minmax(0,1.4fr) minmax(0,1fr) minmax(0,.9fr) 40px', gap: 12 };

export default function Categories() {
  const { data: S, applyData } = useStore();
  const { month } = useMonth();
  const { money } = useMoney();
  const { openDrawer } = useDrawer();
  const { ask, notify } = useUI();
  const [F, setFilters] = useState(DEFAULT_FILTERS);
  const [menuOpen, setMenuOpen] = useState(null); // single-open row id

  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  const q = F.q.trim().toLowerCase();

  const all = S.categories;
  const list = all
    .filter(c => {
      if (q && !(c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q))) return false;
      if (F.type !== 'all' && c.type !== F.type) return false;
      const st = c.status || 'active';
      if (F.status !== 'all' && st !== F.status) return false;
      return true;
    })
    .sort((a, b) => a.type.localeCompare(b.type) || (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name));

  const activeCount = all.filter(c => (c.status || 'active') === 'active').length;
  const archivedCount = all.length - activeCount;

  const askArchive = async cat => {
    const ok = await ask({
      title: 'Archive “' + cat.name + '”?',
      body: 'Archived categories keep all history and stay filterable, but can no longer be chosen for new spending. You can restore it anytime.',
      action: 'Archive category',
    });
    if (!ok) return;
    applyData(data => archiveCategory(data, { id: cat.id }));
    notify('“' + cat.name + '” archived.');
  };

  const doRestore = cat => {
    applyData(data => restoreCategory(data, { id: cat.id }));
    notify('“' + cat.name + '” restored.');
  };

  const askDelete = async cat => {
    const policy = deletePolicy(S, cat);
    if (policy.mode === 'archive') {
      const ok = await ask({
        title: '“' + cat.name + '” is a built-in category',
        body: 'Built-in categories can be archived but never deleted — history and charts depend on them. Archive it instead?',
        action: 'Archive instead',
      });
      if (!ok) return;
      applyData(data => archiveCategory(data, { id: cat.id }));
      notify('“' + cat.name + '” archived.');
      return;
    }
    if (policy.mode === 'reassign') {
      openers.reassignCategory(cat.id, openDrawer);
      return;
    }
    const ok = await ask({
      title: 'Delete “' + cat.name + '” permanently?',
      body: 'Nothing uses this category, so it can be removed outright. The deletion is recorded in history.',
      action: 'Delete permanently',
    });
    if (!ok) return;
    applyData(data => deleteCategory(data, { id: cat.id }));
    notify('“' + cat.name + '” deleted.');
  };

  const menuLabelFor = cat => {
    const mode = deletePolicy(S, cat).mode;
    return mode === 'delete' ? 'Delete permanently' : mode === 'archive' ? 'Delete…' : 'Delete and reassign…';
  };

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px 56px' }} onClick={() => setMenuOpen(null)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'hsFade .25s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, flex: 1 }}>
            Categories organise every transaction, budget, and chart. Use a transaction's notes for anything more specific.
            Built-in categories can be archived but never deleted.
          </p>
          <button onClick={() => openers.addCategory(openDrawer)} className="hv-accent" style={{ height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>＋ Add category</button>
        </div>

        <section aria-label="Filters" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input aria-label="Search categories" placeholder="Search name or description…" value={F.q} onChange={e => setF('q', e.target.value)} style={{ ...selStyle, flex: 2, minWidth: 200, padding: '0 12px' }} />
          <select aria-label="Type" value={F.type} onChange={e => setF('type', e.target.value)} style={selStyle}>
            <option value="all">Income &amp; expense</option>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
          <select aria-label="Status" value={F.status} onChange={e => setF('status', e.target.value)} style={selStyle}>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </select>
          <button onClick={() => setFilters(DEFAULT_FILTERS)} className="hv-text" style={{ ...selStyle, color: 'var(--muted)', fontWeight: 500, cursor: 'pointer', padding: '0 12px' }}>Reset</button>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{list.length} of {all.length} shown · {activeCount} active · {archivedCount} archived</span>
        </section>

        {list.length > 0 ? (
          <section aria-label="Category list" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <div style={{ ...gridCols, padding: '10px 18px', borderBottom: '1px solid var(--border)' }}>
              <span style={colHeader}>CATEGORY</span><span style={colHeader}>TYPE</span>
              <span style={colHeader}>USED BY</span><span style={colHeader}>THIS MONTH</span>
              <span style={colHeader}>BUDGET</span><span />
            </div>
            {list.map(c => {
              const refs = catRefs(S, c.id);
              const refsLabel = [
                refs.transactions + ' tx',
                refs.budgets ? refs.budgets + ' budget' : null,
                refs.recurring ? refs.recurring + ' recurring' : null,
              ].filter(Boolean).join(' · ');
              const spend = catMonthTotal(S, c.id, month);
              const budget = S.budgets.find(b => b.category === c.id);
              const archived = (c.status || 'active') === 'archived';
              return (
                <div key={c.id} style={{ ...gridCols, alignItems: 'center', padding: '11px 18px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span aria-hidden="true" style={iconStyle(c.icon || 'square', c.color, 13)} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                        {archived && <span style={{ fontSize: 10.5, fontWeight: 600, padding: '1px 7px', borderRadius: 999, background: 'var(--warn-soft)', color: 'var(--warn)', flex: 'none' }}>Archived</span>}
                      </span>
                      {c.description && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.description}</span>}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: c.type === 'income' ? 'var(--pos)' : 'var(--text)' }}>{c.type === 'income' ? 'Income' : 'Expense'}</span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>{c.isSystem ? 'Built-in' : 'Custom'}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{refsLabel}</div>
                  <div className="tnum" style={{ fontSize: 13, fontWeight: 600 }}>{spend ? money(spend) : '—'}</div>
                  <div className="tnum" style={{ fontSize: 12.5, color: 'var(--muted)' }}>{budget ? money(budget.amount) : '—'}</div>
                  <RowMenu
                    open={menuOpen === c.id}
                    onToggle={() => setMenuOpen(m => (m === c.id ? null : c.id))}
                    onClose={() => setMenuOpen(null)}
                    label={'Actions for ' + c.name}
                    items={[
                      !archived && { label: 'Edit category', onClick: () => openers.editCategory(S, c.id, openDrawer) },
                      !archived && { label: 'Archive', onClick: () => askArchive(c) },
                      archived && { label: 'Restore', onClick: () => doRestore(c) },
                      { divider: true },
                      { label: menuLabelFor(c), tone: 'neg', onClick: () => askDelete(c) },
                    ].filter(Boolean)}
                  />
                </div>
              );
            })}
          </section>
        ) : all.length > 0 ? (
          <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '44px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>No categories match these filters</div>
            <button onClick={() => setFilters(DEFAULT_FILTERS)} className="hv-soft" style={{ marginTop: 12, height: 32, padding: '0 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Reset filters</button>
          </section>
        ) : (
          <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '44px 20px', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
            No categories yet — add one to organise your spending.
          </section>
        )}
      </div>
    </div>
  );
}
