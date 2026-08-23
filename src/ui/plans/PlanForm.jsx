// The shared plan-settings fieldset — NewPlanModal and FirstPlanSetup render
// the SAME fields (US-3's first-run page is the modal's form as a page), so
// the fields live here once. Controlled: the host owns the draft object.
import { useMemo, useRef, useState } from 'react';
import { Combobox, ComboboxPanel, ComboboxItem } from '../primitives/Combobox.jsx';
import { Select, SelectItem } from '../primitives/Select.jsx';
import { CURRENCIES, DATE_FORMATS, NUMBER_FORMATS, PLACEMENTS, symbolFor } from '../../lib/planFormatOptions.js';
import { makeFormatter } from '../../lib/planFormat.js';
import { PLAN_DEFAULTS } from '../../store/seed.js';
import { dateFormatExample, PLAN_NAME_MAX, planNameError } from './planShellLogic.js';
import { Chevron } from '../icons.jsx';

export function emptyPlanDraft() {
  return { name: '', ...PLAN_DEFAULTS, seedDefaults: true };
}

const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 };
const fieldStyle = { width: '100%', boxSizing: 'border-box', height: 34, padding: '0 10px', fontSize: 13 };
const mutedNote = { fontSize: 12, color: 'var(--muted)' };

const currencyLabel = c => `${c.name}–${c.code}`;

// Searchable currency picker over the full ISO list ("Pakistan Rupee–PKR").
// Same closed-shows-pick / open-shows-query composition as PlanCategoryPicker,
// minus everything category-specific.
function CurrencyField({ value, onPick }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  // Focus stays on the input after a pick closes the list — without the guard
  // that retained focus would read as "the user focused the field" and reopen.
  const reopenGuard = useRef(false);
  const items = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? CURRENCIES.filter(c => c.name.toLowerCase().includes(n) || c.code.toLowerCase().includes(n)) : CURRENCIES;
  }, [q]);
  const current = CURRENCIES.find(c => c.code === value);
  const pick = c => {
    if (!c) return;
    onPick(c.code);
    reopenGuard.current = true;
    setOpen(false);
    setQ('');
    setTimeout(() => { reopenGuard.current = false; }, 0);
  };
  return (
    <div style={{ position: 'relative' }}>
      <Combobox.Root
        items={items} value={null} onValueChange={pick} filter={null}
        itemToStringLabel={currencyLabel} itemToStringValue={currencyLabel}
        open={open}
        onOpenChange={o => { setOpen(o); if (!o) setQ(''); }}
      >
        <Combobox.Input
          data-testid="new-plan-currency-input"
          className="field" aria-label="Currency" placeholder="Search currencies"
          value={open ? q : (current ? currencyLabel(current) : '')}
          onChange={e => { setQ(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => { if (!reopenGuard.current) setOpen(true); }}
          // Escape closes only the list, never the hosting dialog.
          onKeyDown={e => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}
          style={{ ...fieldStyle, padding: '0 26px 0 10px', ...(open ? { borderColor: 'var(--accent)' } : null) }}
        />
        <span aria-hidden="true" style={{ position: 'absolute', right: 10, top: 17, transform: 'translateY(-50%)', color: 'var(--muted)', display: 'inline-flex', pointerEvents: 'none' }}><Chevron /></span>
        <ComboboxPanel>
          {items.map(c => <ComboboxItem key={c.code} value={c}>{currencyLabel(c)}</ComboboxItem>)}
          {items.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: 8 }}>No matches.</div>}
        </ComboboxPanel>
      </Combobox.Root>
    </div>
  );
}

// draft: { name, currency, currencyPlacement, numberFormat, dateFormat,
// seedDefaults }; onChange(nextDraft); showErrors flips on the host's first
// blocked submit so a pristine form doesn't open shouting.
export default function PlanForm({ draft, onChange, showErrors, idPrefix = 'plan-form' }) {
  const set = patch => onChange({ ...draft, ...patch });
  const nameErr = showErrors ? planNameError(draft.name) : null;
  const nameId = idPrefix + '-name';
  const errId = idPrefix + '-name-err';

  // Previews only (BR-U2-1/BR-U3-2): a candidate formatter for the chosen
  // settings — the live singleton binds at the post-create reload, never here.
  const fmt = useMemo(() => makeFormatter(draft),
    [draft.currency, draft.currencyPlacement, draft.numberFormat, draft.dateFormat]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label htmlFor={nameId} style={labelStyle}>Plan Name</label>
        <input
          id={nameId} data-testid="new-plan-name-input" data-autofocus autoFocus
          value={draft.name} maxLength={PLAN_NAME_MAX + 1} placeholder="e.g. Family Budget"
          aria-invalid={nameErr ? true : undefined} aria-describedby={nameErr ? errId : undefined}
          onChange={e => set({ name: e.target.value })}
          className="field"
          style={{ ...fieldStyle, height: 38, padding: '0 12px', fontSize: 13.5, ...(nameErr ? { borderColor: 'var(--neg)' } : null) }}
        />
        {nameErr && <div id={errId} role="alert" style={{ fontSize: 12, color: 'var(--neg)', marginTop: 5 }}>{nameErr}</div>}
      </div>

      <div>
        <label style={labelStyle}>Currency</label>
        <CurrencyField value={draft.currency} onPick={code => set({ currency: code })} />
      </div>

      <div>
        <label style={labelStyle}>Currency Placement</label>
        <Select
          value={draft.currencyPlacement} onValueChange={v => set({ currencyPlacement: v })}
          ariaLabel="Currency Placement" testId="new-plan-placement-select" popupZIndex={65}
          triggerStyle={{ height: 34 }}
          renderValue={v => {
            const p = PLACEMENTS.find(x => x.key === v) || PLACEMENTS[0];
            return `${p.label} · ${p.example(symbolFor(draft.currency, p.key))}`;
          }}
        >
          {PLACEMENTS.map(p => (
            <SelectItem key={p.key} value={p.key}>
              {p.label} <span style={mutedNote} className="tnum">{p.example(symbolFor(draft.currency, p.key))}</span>
            </SelectItem>
          ))}
        </Select>
      </div>

      <div>
        <label style={labelStyle}>Number Format</label>
        <Select
          value={draft.numberFormat} onValueChange={v => set({ numberFormat: v })}
          ariaLabel="Number Format" testId="new-plan-number-format-select" popupZIndex={65}
          triggerStyle={{ height: 34 }}
          renderValue={v => (NUMBER_FORMATS.find(f => f.key === v) || {}).label || v}
        >
          {NUMBER_FORMATS.map(f => (
            <SelectItem key={f.key} value={f.key}><span className="tnum">{f.label}</span></SelectItem>
          ))}
        </Select>
      </div>

      <div>
        <label style={labelStyle}>Date Format</label>
        <Select
          value={draft.dateFormat} onValueChange={v => set({ dateFormat: v })}
          ariaLabel="Date Format" testId="new-plan-date-format-select" popupZIndex={65}
          triggerStyle={{ height: 34 }}
          renderValue={v => dateFormatExample(v)}
        >
          {DATE_FORMATS.map(f => (
            <SelectItem key={f.key} value={f.key}><span className="tnum">{dateFormatExample(f.key)}</span></SelectItem>
          ))}
        </Select>
        {/* One live line tying the four settings together, in this plan's own
            rendering — the same worked-example idea the option labels use. */}
        <div style={{ ...mutedNote, marginTop: 8 }}>
          Amounts and dates will look like <span className="tnum" style={{ color: 'var(--text)' }}>{fmt.money(123456.78, false, true)}</span> · <span className="tnum" style={{ color: 'var(--text)' }}>{fmt.date('2026-12-30')}</span>
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer' }}>
        <input
          type="checkbox" data-testid="new-plan-seed-checkbox"
          checked={!!draft.seedDefaults}
          onChange={e => set({ seedDefaults: e.target.checked })}
          style={{ width: 14, height: 14, margin: '2px 0 0', accentColor: 'var(--accent)', cursor: 'pointer', flex: 'none' }}
        />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>Start with default categories</span>
          <span style={{ display: 'block', ...mutedNote, marginTop: 2 }}>Raqam’s starter category set. Uncheck to begin with a blank plan.</span>
        </span>
      </label>
    </div>
  );
}
