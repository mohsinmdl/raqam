// src/ui/tx/phone/TxSheet.jsx
// Phone-native rendering of the SAME addTx drawer: same form state, same
// submission path (useSubmit) — DrawerProvider chooses this shell on phone.
// All five types render here now (Task 7); edit-mode extras (edited-before
// notice, Delete via def.useDanger) and the Show more disclosure (notes, fee,
// status, All options → classic drawer) arrived in the same task.
// Spec: docs/superpowers/specs/2026-08-15-mobile-accounts-ynab-design.md §3
import { useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { useDrawer } from '../../DrawerProvider.jsx';
import { useStore } from '../../../store/StoreProvider.jsx';
import { parseAmt } from '../../../lib/format.js';
import { relTime } from '../../../lib/calc.js';
import { pressDigit, pressOp, pressBackspace, pressClear, evaluate, displayOf } from '../../../lib/keypadState.js';
import Keypad from '../../phone/Keypad.jsx';
import { fieldsFor, tintFor, merchantLabel, payWithLabel, accountLabel } from './txSheetState.js';
import { useTxOpts } from '../../../drawers/TxForm.jsx';
import { Pill } from '../../../drawers/fields.jsx';
import CategoryPickerSheet from '../../../components/CategoryPickerSheet.jsx';
import { Menu, MenuTrigger, MenuPanel, MenuItem } from '../../primitives/Menu.jsx';
import { BottomSheet, BottomSheetPanel } from '../../primitives/BottomSheet.jsx';

const TYPE_LABELS = { expense: 'Expense', income: 'Income', transfer: 'Transfer', refund: 'Refund', adjustment: 'Adjustment' };
const rowInner = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 52, padding: '8px 14px',
  border: 'none', background: 'none', color: 'var(--text)', font: 'inherit', cursor: 'pointer', textAlign: 'left' };
const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' };

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
  // Optional destructive action (Delete when editing). Conditional hook call is
  // safe: TxSheet is keyed-mounted for addTx only (DrawerProvider.jsx `key="tx-phone"`
  // pairs with `key={state.name}` on the classic shell — either way `def` is fixed
  // per mount), mirroring DrawerShell's identical pattern.
  const danger = def.useDanger ? def.useDanger() : null;
  const { data: S } = useStore();
  const { bankOpts, creditOpts } = useTxOpts();
  const f = drawer.form, errors = drawer.errors;
  const type = f.type || 'expense';
  const fields = fieldsFor(type);
  // Keypad draft: null = closed. Seed on whether the form ALREADY carries an
  // amount, not on edit mode — a prefilled add (e.g. openers.recordRule,
  // src/drawers/openers.js:171-182, prefills f.amount with editId still null)
  // must open showing that real amount with the keypad closed, same as
  // editing. Only a truly blank add opens with the keypad up.
  const [kp, setKp] = useState(() => (f.amount ? null : ''));
  const [picker, setPicker] = useState(null); // 'category' | 'payWith' | 'account' | 'from' | 'to' | null
  // Show more: folded away until asked for, unless a note already exists —
  // mirrors TxForm's noteOpen seed (TxForm.jsx:54) so nothing is ever hidden.
  const [showMore, setShowMore] = useState(() => !!f.notes);

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
  const prev = f.editId ? S.transactions.find(t => t.id === f.editId) : null;

  const dateRow = (
    <Row last error={errors.date}>
      <label style={{ ...rowInner, cursor: 'pointer' }}>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>Date</span>
          <input type="date" value={f.date} onFocus={commitKp} onChange={e => setField('date', e.target.value)}
            style={{ border: 'none', background: 'none', color: 'var(--text)', font: 'inherit', fontSize: 14.5, fontWeight: 500, outline: 'none', padding: 0 }} />
        </span>
      </label>
    </Row>
  );

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
            {prev?.editedAt && (
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--info-soft)', fontSize: 12, color: 'var(--text)', marginBottom: 12 }}>
                <span style={{ fontWeight: 700, color: 'var(--info)' }}>Edited before — </span>
                last edited {relTime(prev.editedAt)} · {prev.editCount} edit{prev.editCount === 1 ? '' : 's'} recorded in history.
              </div>
            )}

            {fields.transfer ? (
              <>
                <div style={card}>
                  <Row last>
                    <button onClick={() => openRow('from')} style={rowInner}>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>Transferred from</span>
                        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 500 }}>{optLabel(f.from) || 'Choose…'}</span>
                      </span>
                      <span aria-hidden="true" style={{ color: 'var(--muted)' }}>›</span>
                    </button>
                  </Row>
                </div>
                <div aria-hidden="true" style={{ textAlign: 'center', color: 'var(--muted)', padding: '6px 0', fontSize: 18 }}>↓</div>
                <div style={card}>
                  <Row last error={errors.transfer}>
                    <button onClick={() => openRow('to')} style={rowInner}>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>Transferred to</span>
                        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 500 }}>{optLabel(f.to) || 'Choose…'}</span>
                      </span>
                      <span aria-hidden="true" style={{ color: 'var(--muted)' }}>›</span>
                    </button>
                  </Row>
                </div>
                {String(f.to || '').startsWith('card:') && (
                  <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text)', marginTop: 12, padding: '8px 10px', background: 'var(--info-soft)', borderRadius: 8 }}>
                    <span style={{ fontWeight: 700, color: 'var(--info)', flex: 'none' }}>Card payment</span>
                    <span style={{ opacity: .85 }}>Recorded as a bill payment — reduces the bank balance and the card's outstanding. Never an expense.</span>
                  </div>
                )}
                <div style={{ ...card, marginTop: 12 }}>{dateRow}</div>
              </>
            ) : (
              <div style={card}>
                {fields.merchant && (
                  <Row last={false} error={errors.merchant}>
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
                {fields.adjust && (
                  <>
                    <Row last={false}>
                      <div role="group" aria-label="Direction" style={{ ...rowInner, cursor: 'default', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Direction</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Pill on={f.direction !== 'decrease'} onClick={() => { commitKp(); setField('direction', 'increase'); }}>Increase</Pill>
                          <Pill on={f.direction === 'decrease'} onClick={() => { commitKp(); setField('direction', 'decrease'); }}>Decrease</Pill>
                        </div>
                      </div>
                    </Row>
                    <Row last={false} error={errors.reason}>
                      <label style={{ ...rowInner, cursor: 'text' }}>
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>Reason <span style={{ color: 'var(--neg)' }}>*</span></span>
                          <input value={f.reason || ''} onFocus={commitKp} onChange={e => setField('reason', e.target.value)}
                            placeholder="e.g. Bank charges correction"
                            style={{ width: '100%', border: 'none', background: 'none', color: 'var(--text)', font: 'inherit', fontSize: 14.5, fontWeight: 500, outline: 'none', padding: 0 }} />
                        </span>
                      </label>
                    </Row>
                  </>
                )}
                {dateRow}
              </div>
            )}

            {/* Show more: folded to keep the sheet short — notes, transfer fee,
                clear/uncleared status, and the escape hatch to the classic drawer
                for anything this shell doesn't cover (repeat, split, etc). */}
            <div style={{ marginTop: 12 }}>
              {!showMore ? (
                <button onClick={() => { commitKp(); setShowMore(true); }} className="hv-elev"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', height: 44,
                    border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--muted)',
                    font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Show more <span aria-hidden="true">⌄</span>
                </button>
              ) : (
                <div style={card}>
                  <Row last={false}>
                    <div style={{ padding: '10px 14px' }}>
                      <label htmlFor="tx-notes" style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>Notes</label>
                      <textarea id="tx-notes" rows={2} value={f.notes || ''} onFocus={commitKp} onChange={e => setField('notes', e.target.value)}
                        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--elev)',
                          color: 'var(--text)', font: 'inherit', fontSize: 14, padding: '8px 10px', resize: 'vertical', outline: 'none' }} />
                    </div>
                  </Row>
                  {fields.transfer && (
                    <Row last={false}>
                      <div style={{ padding: '10px 14px' }}>
                        <label htmlFor="tx-fee" style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>Transfer fee</label>
                        <input id="tx-fee" inputMode="decimal" placeholder="0" value={f.fee || ''} onFocus={commitKp} onChange={e => setField('fee', e.target.value)}
                          className="tnum" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--elev)',
                            color: 'var(--text)', font: 'inherit', fontSize: 14, padding: '8px 10px', outline: 'none' }} />
                        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>A fee is recorded separately as a Bank fees expense.</div>
                      </div>
                    </Row>
                  )}
                  <Row last={false}>
                    <div role="group" aria-label="Status" style={{ padding: '10px 14px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>Status:</span>
                      <Pill on={!f.pending} onClick={() => { commitKp(); setField('pending', false); }}>Cleared</Pill>
                      <Pill on={!!f.pending} warn onClick={() => { commitKp(); setField('pending', true); }}>Uncleared</Pill>
                      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Uncleared amounts are excluded from totals until cleared.</span>
                    </div>
                  </Row>
                  <Row last>
                    <button onClick={() => { commitKp(); setForm({ _classic: true }); }} style={{ ...rowInner, color: 'var(--accent)', fontWeight: 600, justifyContent: 'center' }}>
                      All options
                    </button>
                  </Row>
                </div>
              )}
            </div>

            {danger && (
              <button onClick={danger.onClick} className="hv-neg-soft"
                style={{ display: 'block', width: '100%', marginTop: 14, padding: '12px 14px', border: 'none', background: 'none',
                  color: 'var(--neg)', font: 'inherit', fontSize: 14, fontWeight: 600, textAlign: 'center', cursor: 'pointer' }}>
                {danger.label}
              </button>
            )}
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
          <AccountSheet open={picker === 'payWith' || picker === 'account' || picker === 'from' || picker === 'to'} onClose={() => setPicker(null)}
            withCards={(picker === 'payWith' && type === 'expense') || picker === 'to'} bankOpts={bankOpts} creditOpts={creditOpts}
            onPick={ref => { setField(picker === 'payWith' ? 'payWith' : picker === 'account' ? 'account' : picker, ref); setPicker(null); }} />
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
