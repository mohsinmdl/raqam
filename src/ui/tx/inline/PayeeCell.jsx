// The PAYEE cell: type-to-filter combobox over payeeSections. Free text is a
// valid payee (commits on blur / Enter-close); picking a To/From item makes
// the row a transfer instead. Item values are the section objects
// themselves — kind tells the pick handler which of the two events happened.
import { useMemo, useState } from 'react';
import { useStore } from '../../../store/StoreProvider.jsx';
import { useUI } from '../../UIProvider.jsx';
import { useIsPhone } from '../../../lib/useIsPhone.js';
import { payeeSections } from '../../../lib/payeeOptions.js';
import { Combobox, ComboboxPanel, ComboboxGroupLabel, ComboboxItem } from '../../primitives/Combobox.jsx';

export default function PayeeCell({ payee, transferTo, sourceRef, onPickPayee, onPickTransfer, disabled, autoFocus }) {
  const { data: S } = useStore();
  const { openPayees } = useUI();
  // Manage Payees is desktop-only (spec decision 5) — ManagePayees renders
  // nothing on a phone, so offering the link there is a dead button.
  const phone = useIsPhone();
  const [q, setQ] = useState(null); // null = closed, show the committed value
  const sections = useMemo(() => payeeSections(S, { sourceRef, query: q || '' }), [S, sourceRef, q]);
  const transferLabel = useMemo(() => {
    if (!transferTo) return '';
    const hit = sections.flatMap(s => s.items).find(i => i.kind === 'transfer' && i.ref === transferTo);
    return hit ? hit.label : 'To/From —';
  }, [sections, transferTo]);
  const shown = q !== null ? q : (transferTo ? transferLabel : payee);
  // Item values aren't the {value,label} shape Base UI auto-derives a string
  // from (they're {kind,ref,label} / {kind,name}) — spell it out so
  // accessibility announcements and form-value coercion don't fall back to
  // "[object Object]". The visible field text is owned by `shown` above,
  // independent of this.
  const itemLabel = item => (item.kind === 'transfer' ? item.label : item.name);

  const pick = item => {
    if (!item) return;
    if (item.kind === 'transfer') onPickTransfer(item.ref);
    else onPickPayee(item.name);
    setQ(null);
  };
  const commitText = () => { if (q !== null) { onPickPayee(q); setQ(null); } };

  return (
    <Combobox.Root items={sections.flatMap(s => s.items)} onValueChange={pick} value={null} filter={null}
      itemToStringLabel={itemLabel} itemToStringValue={itemLabel}>
      <Combobox.Input
        className="field" placeholder="payee" aria-label="Payee" disabled={disabled} autoFocus={autoFocus}
        value={shown}
        onChange={e => setQ(e.target.value)}
        onBlur={commitText}
        style={{ width: '100%', height: 28, padding: '0 8px', fontSize: 13 }}
      />
      <ComboboxPanel footer={phone ? null : (
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={openPayees} className="hv-soft"
          style={{ width: '100%', border: 'none', background: 'none', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: '8px 2px 2px', textAlign: 'left' }}>
          Manage Payees
        </button>
      )}>
        {sections.map(s => (
          <Combobox.Group key={s.label} items={s.items}>
            <ComboboxGroupLabel>{s.label}</ComboboxGroupLabel>
            {s.items.map(i => (
              <ComboboxItem key={i.kind === 'transfer' ? i.ref : i.name} value={i} indent>
                {i.kind === 'transfer' ? i.label : i.name}
              </ComboboxItem>
            ))}
          </Combobox.Group>
        ))}
      </ComboboxPanel>
    </Combobox.Root>
  );
}
