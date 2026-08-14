// src/ui/tx/phone/TxSheet.jsx
// Phone-native rendering of the SAME addTx drawer: same form state, same
// useSubmit/useDanger — DrawerProvider chooses this shell on phone. Spec:
// docs/superpowers/specs/2026-08-15-mobile-accounts-ynab-design.md §3
import { useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { useDrawer } from '../../DrawerProvider.jsx';
import { useStore } from '../../../store/StoreProvider.jsx';
import { parseAmt } from '../../../lib/format.js';
import { pressDigit, pressOp, pressBackspace, pressClear, evaluate, displayOf } from '../../../lib/keypadState.js';
import Keypad from '../../phone/Keypad.jsx';
import { fieldsFor, tintFor, merchantLabel, payWithLabel, accountLabel } from './txSheetState.js';
import { useTxOpts } from '../../../drawers/TxForm.jsx';
import CategoryPickerSheet from '../../../components/CategoryPickerSheet.jsx';
import { Menu, MenuTrigger, MenuPanel, MenuItem } from '../../primitives/Menu.jsx';
import { BottomSheet, BottomSheetPanel } from '../../primitives/BottomSheet.jsx';

const TYPE_LABELS = { expense: 'Expense', income: 'Income', transfer: 'Transfer', refund: 'Refund', adjustment: 'Adjustment' };
const rowInner = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 52, padding: '8px 14px',
  border: 'none', background: 'none', color: 'var(--text)', font: 'inherit', cursor: 'pointer', textAlign: 'left' };

// Wraps one field row: the interactive control (button/label) plus an
// optional per-field error hint, both inside a single bordered "row" so the
// hairline separates ROWS (not the control from its own error message).
function Row({ last, error, children }) {
  return (
    <div style={{ borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      {children}
      {error && <div role="alert" style={{ fontSize: 12, color: 'var(--neg)', padding: '0 14px 8px' }}>{error}</div>}
    </div>
  );
}

export default function TxSheet({ def, state, requestClose }) {
  const { drawer, setForm, setField } = useDrawer();
  const submit = def.useSubmit();
  const { data: S } = useStore();
  const { bankOpts, creditOpts } = useTxOpts();
  const f = drawer.form, errors = drawer.errors;
  const type = f.type || 'expense';
  const fields = fieldsFor(type);
  // Keypad draft: null = closed. New transactions open with an empty draft.
  const [kp, setKp] = useState(() => (f.editId ? null : ''));
  const [picker, setPicker] = useState(null); // 'category' | 'payWith' | 'account' | null

  const current = parseAmt(f.amount) || 0;
  const commitKp = () => {
    if (kp == null) return;
    const r = evaluate(current, kp);
    if (r != null) setField('amount', String(r));
    setKp(null);
  };
  const onKey = (kind, v) => setKp(d => {
    if (kind === 'digit') return pressDigit(d, v);
    if (kind === 'op') return pressOp(d, v);
    if (kind === 'backspace') return pressBackspace(d);
    if (kind === 'clear') return pressClear();
    if (kind === 'equals') { const r = evaluate(current, d); return r != null ? String(r) : d; }
    return d;
  });
  const openRow = which => { commitKp(); setPicker(which); };
  const amountText = kp != null ? (displayOf(kp) || '0') : displayOf(String(f.amount || '0'));

  const catName = f.category ? (S.categories.find(c => c.id === f.category)?.name || '') : '';
  const optLabel = ref => [...bankOpts, ...creditOpts].find(o => o.id === ref)?.label || '';

  return (
    <Dialog.Root open modal onOpenChange={o => { if (!o) requestClose(); }}>
      <Dialog.Portal>
        <Dialog.Popup aria-label={def.title(state)}
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'var(--bg)', color: 'var(--text)',
            display: 'flex', flexDirection: 'column', outline: 'none' }}>
          {/* Amount header */}
          <div style={{ flex: 'none', background: tintFor(type), padding: '10px 16px 18px' }}>
            <button onClick={requestClose} aria-label="Close" className="hv-soft"
              style={{ width: 44, height: 44, border: 'none', borderRadius: 999, background: 'var(--surface)', color: 'var(--text)', fontSize: 17, cursor: 'pointer' }}>✕</button>
            <button onClick={() => setKp(k => (k == null ? String(f.amount || '') : k))} aria-label={'Amount, ' + amountText}
              className="tnum" style={{ display: 'block', width: '100%', border: 'none', background: 'none', color: 'var(--text)',
                fontSize: 40, fontWeight: 700, textAlign: 'center', cursor: 'pointer', padding: '6px 0 0' }}>
              {amountText}
            </button>
            {errors.amount && (
              <div role="alert" style={{ textAlign: 'center', fontSize: 12, color: 'var(--neg)', marginTop: 2 }}>{errors.amount}</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
              <Menu>
                <MenuTrigger className="hv-elev"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 16px',
                    border: '1px solid var(--border)', borderRadius: 999, background: 'var(--surface)', color: 'var(--text)',
                    font: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  {TYPE_LABELS[type]} <span aria-hidden="true" style={{ color: 'var(--muted)' }}>⌄</span>
                </MenuTrigger>
                <MenuPanel side="bottom" align="center">
                  {Object.entries(TYPE_LABELS).map(([id, label]) => (
                    <MenuItem key={id} onClick={() => setForm({ type: id, category: '', splitOn: false, splits: undefined })}>
                      <span style={{ width: 16, flex: 'none' }}>{type === id ? '✓' : ''}</span>{label}
                    </MenuItem>
                  ))}
                </MenuPanel>
              </Menu>
            </div>
          </div>

          {/* Scrollable body */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px' }}>
            {state.errList.length > 0 && (
              <div role="alert" style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--neg-soft)', border: '1px solid var(--neg)', marginBottom: 12 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--neg)' }}>Please fix the following:</div>
                {state.errList.map((e, i) => <div key={i} style={{ fontSize: 12.5, marginTop: 3 }}>• {e}</div>)}
              </div>
            )}
            {drawer.dupMsg && (
              <div role="alert" style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--warn-soft)', border: '1px solid var(--warn)', marginBottom: 12 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--warn)' }}>Possible duplicate — </span>
                <span style={{ fontSize: 12.5 }}>{drawer.dupMsg}</span>
              </div>
            )}

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              {fields.merchant && (
                <Row last={false}>
                  <label style={{ ...rowInner, cursor: 'text' }}>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{merchantLabel(type)}</span>
                      <input value={f.merchant} onFocus={commitKp} onChange={e => setField('merchant', e.target.value)}
                        placeholder="e.g. Imtiaz Super Market"
                        style={{ width: '100%', border: 'none', background: 'none', color: 'var(--text)', font: 'inherit', fontSize: 14.5, fontWeight: 500, outline: 'none', padding: 0 }} />
                    </span>
                  </label>
                </Row>
              )}
              {fields.category && (
                <Row last={false} error={errors.category}>
                  <button onClick={() => openRow('category')} style={rowInner}>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>Category</span>
                      <span style={{ display: 'block', fontSize: 14.5, fontWeight: 500 }}>{catName || 'Choose…'}</span>
                    </span>
                    <span aria-hidden="true" style={{ color: 'var(--muted)' }}>›</span>
                  </button>
                </Row>
              )}
              {(fields.payWith || fields.account) && (
                <Row last={false} error={fields.payWith ? errors.payWith : errors.account}>
                  <button onClick={() => openRow(fields.payWith ? 'payWith' : 'account')} style={rowInner}>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{fields.payWith ? payWithLabel(type) : accountLabel(type)}</span>
                      <span style={{ display: 'block', fontSize: 14.5, fontWeight: 500 }}>{optLabel(fields.payWith ? f.payWith : f.account) || 'Choose…'}</span>
                    </span>
                    <span aria-hidden="true" style={{ color: 'var(--muted)' }}>›</span>
                  </button>
                </Row>
              )}
              <Row last error={errors.date}>
                <label style={{ ...rowInner, cursor: 'pointer' }}>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>Date</span>
                    <input type="date" value={f.date} onFocus={commitKp} onChange={e => setField('date', e.target.value)}
                      style={{ border: 'none', background: 'none', color: 'var(--text)', font: 'inherit', fontSize: 14.5, fontWeight: 500, outline: 'none', padding: 0 }} />
                  </span>
                </label>
              </Row>
            </div>
          </div>

          {/* Keypad + CTA footer */}
          <div style={{ flex: 'none', background: 'var(--elev)', borderTop: '1px solid var(--border)',
            padding: '10px 12px calc(10px + env(safe-area-inset-bottom))' }}>
            {kp != null
              ? <Keypad onKey={onKey} onDone={commitKp} />
              : (
                <button onClick={submit} className="hv-accent"
                  style={{ width: '100%', height: 48, border: 'none', borderRadius: 999, background: 'var(--accent)',
                    color: 'var(--on-accent)', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                  {def.cta(state)}
                </button>
              )}
          </div>

          <CategoryPickerSheet open={picker === 'category'} onClose={() => setPicker(null)} allowCreate={false}
            catType={type === 'income' ? 'income' : 'expense'}
            onPick={id => { setField('category', id); setPicker(null); }} />
          <AccountSheet open={picker === 'payWith' || picker === 'account'} onClose={() => setPicker(null)}
            withCards={picker === 'payWith' && type === 'expense'} bankOpts={bankOpts} creditOpts={creditOpts}
            onPick={ref => { setField(picker === 'payWith' ? 'payWith' : 'account', ref); setPicker(null); }} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AccountSheet({ open, onClose, withCards, bankOpts, creditOpts, onPick }) {
  const opts = withCards ? [...bankOpts, ...creditOpts] : bankOpts;
  return (
    <BottomSheet open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <BottomSheetPanel label="Choose account">
        <div style={{ padding: '14px 16px', fontSize: 16, fontWeight: 700, borderBottom: '1px solid var(--border)', flex: 'none' }}>Choose account</div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 0 12px' }}>
          {opts.map((o, i) => (
            <button key={o.id} onClick={() => onPick(o.id)} className="hv-elev" style={{ ...rowInner, borderBottom: i === opts.length - 1 ? 'none' : '1px solid var(--border)' }}>
              <span className="tnum" style={{ flex: 1, minWidth: 0, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.label}</span>
            </button>
          ))}
        </div>
      </BottomSheetPanel>
    </BottomSheet>
  );
}
