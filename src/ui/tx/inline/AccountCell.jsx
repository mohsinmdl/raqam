// The editor row's ACCOUNT cell: a grouped Base UI select over the same
// balance-annotated options the drawer used (useTxOpts). The picked ref lands
// in whichever legacy field the current type reads (txEditorState 'account').
import { forwardRef } from 'react';
import { Select, SelectGroup, SelectItem } from '../../primitives/Select.jsx';
import { useTxOpts } from '../../../drawers/TxForm.jsx';

const srOnly = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 };

const AccountCell = forwardRef(function AccountCell({ value, onChange, disabled, autoFocus, invalid, errorMsg, errorId }, ref) {
  const { bankOpts, creditOpts } = useTxOpts();
  const all = [...bankOpts, ...creditOpts];
  const picked = all.find(o => o.id === value);
  // Balance annotations stay in the LIST; the closed trigger shows the name
  // only (the row has no room for " — Rs 1,234,567").
  const nameOnly = label => label.split(' — ')[0];
  const id = errorId || 'txeditor-err-account';
  return (
    <span style={{ display: 'block', position: 'relative' }}>
      <Select ref={ref} value={value || null} onValueChange={v => onChange(v || '')} ariaLabel="Account" disabled={disabled} autoFocus={autoFocus}
        invalid={invalid} describedBy={id}
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
      {invalid && <span id={id} role="alert" style={srOnly}>{errorMsg}</span>}
    </span>
  );
});

export default AccountCell;
