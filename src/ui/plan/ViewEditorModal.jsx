// Create/edit modal for a Plan custom view. Modal shell copied verbatim from
// ShortcutHelpModal.jsx (scrim + FocusTrap + role="dialog" aria-modal="true" +
// capture-phase Escape). `view: null` means create ("New Custom View");
// `view: {id, name, categoryIds}` means edit ("Edit View"). Save calls
// onSave({ name, categoryIds }) — the caller (Plan.jsx) owns turning that into
// a newView()/replace-by-id write via planViews.js.
import { useEffect, useRef, useState } from 'react';
import FocusTrap from '../FocusTrap.jsx';
import { MAX_NAME } from '../../lib/planViews.js';

// Indeterminate-capable checkbox with NO inline label text — same shape as
// Plan.jsx's PlanCheckbox. Checkbox.jsx's own <label> only wraps the input
// itself, so it can't extend the clickable target over a category's name
// text; that's why this local component (and a plain per-category <input>
// wrapped in a real <label>) is used instead of importing Checkbox.jsx.
function GroupCheckbox({ checked, indeterminate, onChange, label }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate && !checked; }, [indeterminate, checked]);
  return (
    <input ref={ref} type="checkbox" checked={checked} aria-label={label}
      onChange={onChange}
      style={{ width: 14, height: 14, margin: 0, accentColor: 'var(--accent)', cursor: 'pointer', flex: 'none' }} />
  );
}

export default function ViewEditorModal({ open, view, groups, onSave, onCancel }) {
  const [name, setName] = useState('');
  const [categoryIds, setCategoryIds] = useState(() => new Set());

  // This instance stays mounted across opens (same "always rendered, early
  // return null" shell as ShortcutHelpModal), so the draft has to be re-seeded
  // explicitly rather than via a useState initializer. Keyed on [open,
  // view?.id] — mirrors src/drawers/BankKindField.jsx's re-seed-on-identity-
  // change effect — so typing in the name field never gets clobbered mid-edit.
  useEffect(() => {
    if (!open) return;
    setName(view ? view.name : '');
    setCategoryIds(new Set(view ? view.categoryIds : []));
  }, [open, view ? view.id : null]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onCancel]);

  if (!open) return null;

  const toggleCat = (id, on) => setCategoryIds(prev => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });
  const toggleGroup = (cats, on) => setCategoryIds(prev => {
    const next = new Set(prev);
    cats.forEach(c => { if (on) next.add(c.id); else next.delete(c.id); });
    return next;
  });

  const canSave = name.trim().length > 0 && categoryIds.size > 0;
  const save = () => { if (canSave) onSave({ name: name.trim(), categoryIds: [...categoryIds] }); };

  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'hsFade .15s ease', zIndex: 60 }}>
      <FocusTrap>
        <div role="dialog" aria-modal="true" aria-label={view ? 'Edit View' : 'New Custom View'} onClick={e => e.stopPropagation()} style={{ width: 480, maxWidth: '94vw', maxHeight: '84vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)', padding: '22px 26px', animation: 'hsUp .18s ease', color: 'var(--text)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{view ? 'Edit View' : 'New Custom View'}</div>
            <button onClick={onCancel} aria-label="Close" className="hv-soft rq-btn-outline" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
          </div>

          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
            Choose a set of categories to include in this custom view.
          </p>

          <label htmlFor="view-name-input" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>View Name</label>
          <input
            id="view-name-input" data-autofocus value={name} maxLength={MAX_NAME}
            placeholder="Keep 'em short & sweet!"
            onChange={e => setName(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', height: 38, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13.5, marginBottom: 18 }}
          />

          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Select the categories below to include.</div>

          {groups.map(({ group, cats }) => {
            if (!cats.length) return null;
            const allOn = cats.every(c => categoryIds.has(c.id));
            const someOn = cats.some(c => categoryIds.has(c.id));
            return (
              <div key={group.id ?? 'other'} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <GroupCheckbox
                    label={'Select all in ' + group.name}
                    checked={allOn} indeterminate={someOn}
                    onChange={() => toggleGroup(cats, !allOn)}
                  />
                  <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.03em', color: 'var(--muted)' }}>{group.name.toUpperCase()}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {cats.map(cat => (
                    <label key={cat.id} className="hv-soft" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px 6px 22px', borderRadius: 6, cursor: 'pointer' }}>
                      <input
                        type="checkbox" checked={categoryIds.has(cat.id)}
                        onChange={e => toggleCat(cat.id, e.target.checked)}
                        style={{ width: 14, height: 14, margin: 0, accentColor: 'var(--accent)', cursor: 'pointer', flex: 'none' }}
                      />
                      <span style={{ fontSize: 13 }}>{cat.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}

          <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
            <button onClick={onCancel} className="hv-elev rq-btn-outline" style={{ height: 36, padding: '0 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
            <button
              onClick={save} disabled={!canSave} className="hv-accent rq-btn-solid"
              style={{ height: 36, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: canSave ? 'pointer' : 'not-allowed', opacity: canSave ? 1 : .5 }}
            >Save</button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
