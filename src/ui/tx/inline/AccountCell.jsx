// The editor row's ACCOUNT cell: a grouped Base UI select over the same
// balance-annotated options the drawer used (useTxOpts). The picked ref lands
// in whichever legacy field the current type reads (txEditorState 'account').
import { Select, SelectGroup, SelectItem } from '../../primitives/Select.jsx';
import { useTxOpts } from '../../../drawers/TxForm.jsx';

export default function AccountCell({ value, onChange, disabled, autoFocus }) {
  const { bankOpts, creditOpts } = useTxOpts();
  const all = [...bankOpts, ...creditOpts];
  const picked = all.find(o => o.id === value);
  // Balance annotations stay in the LIST; the closed trigger shows the name
  // only (the row has no room for " — Rs 1,234,567").
  const nameOnly = label => label.split(' — ')[0];
  return (
    <Select value={value || null} onValueChange={v => onChange(v || '')} ariaLabel="Account" disabled={disabled} autoFocus={autoFocus}
      renderValue={() => picked ? nameOnly(picked.label) : 'account'}>
      <SelectGroup label="Cash Accounts">
        {bankOpts.map(o => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
      </SelectGroup>
      {creditOpts.length > 0 && (
        <SelectGroup label="Credit Cards">
          {creditOpts.map(o => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
        </SelectGroup>
      )}
    </Select>
  );
}
