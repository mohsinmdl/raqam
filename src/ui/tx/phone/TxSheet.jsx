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
import { useTxOpts, HINTS } from '../../../drawers/TxForm.jsx';
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
// `errorId` — when given, the caller can point its control's aria-describedby
// at this same id (and set aria-invalid) so the error is programmatically
// associated with the control, not just visually adjacent (WCAG 3.3.1/4.1.2).
function Row({ last, error, errorId, children }) {
  return (
    <div style={{ borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      {children}
      {error && <div id={errorId} role="alert" style={{ fontSize: 12, color: 'var(--neg)', padding: '0 14px 8px' }}>{error}</div>}
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
  // Show more: folded away until asked for, unless the form already carries
  // non-default state there — a note, a transfer fee, or Uncleared (money-
  // visible: excluded from totals) — mirrors TxForm's noteOpen seed
  // (TxForm.jsx:54) plus Status/Fee always being visible on desktop, so
  // nothing is ever hidden from an edit.
  const [showMore, setShowMore] = useState(() => !!f.notes || !!f.fee || !!f.pending);

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
    <Row last error={errors.date} errorId="tx-err-date">
      <label style={{ ...rowInner, cursor: 'pointer' }}>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>Date</span>
          <input type="date" value={f.date} onFocus={commitKp} onChange={e => setField('date', e.target.value)}
            aria-invalid={errors.date ? 'true' : undefined} aria-describedby={errors.date ? 'tx-err-date' : undefined}
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
            {/* Keypad digits update amountText silently otherwise — focus stays
                on the digit keys, not the amount button, so nothing gets
                re-announced per keystroke. Mirrors the visually-hidden
                aria-live precedent in Transactions.jsx (sort/row-count status)
                and the plain aria-live span PlanPhone.jsx uses for its assign
                draft: same formatted display string the button already shows,
                nothing extra, so this doesn't spam beyond the running total. */}
            <span role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
              {amountText}
            </span>
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
                    <MenuItem key={id} onClick={() => setForm({ type: id, category: '', splitOn: false, splits: undefined })}
                      style={{ alignItems: 'flex-start' }}>
                      <span style={{ width: 16, flex: 'none' }}>{type === id ? '✓' : ''}</span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block' }}>{label}</span>
                        {HINTS[id] && <span style={{ display: 'block', fontSize: 11.5, fontWeight: 400, color: 'var(--muted)', marginTop: 2 }}>{HINTS[id]}</span>}
                      </span>
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
              // Deviation from fieldsFor: fieldsFor(type).merchant is true for
              // transfer too (it mirrors TxForm's fx* truth table verbatim —
              // see txSheetState.js), but this two-card from/to layout
              // deliberately renders NO payee row for transfers (spec-
              // sanctioned; a transfer moves money between your own accounts,
              // there's no payee to name). An existing f.merchant value on a
              // transfer being edited is preserved untouched by buildTx even
              // though nothing here lets it be changed; desktop's TxForm still
              // offers the field for transfers if it's ever needed.
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
                  <Row last error={errors.transfer} errorId="tx-err-transfer">
                    <button onClick={() => openRow('to')} style={rowInner}
                      aria-invalid={errors.transfer ? 'true' : undefined} aria-describedby={errors.transfer ? 'tx-err-transfer' : undefined}>
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
                  <Row last={false} error={errors.merchant} errorId="tx-err-merchant">
                    <label style={{ ...rowInner, cursor: 'text' }}>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{merchantLabel(type)}</span>
                        <input value={f.merchant} onFocus={commitKp} onChange={e => setField('merchant', e.target.value)}
                          placeholder="e.g. Imtiaz Super Market"
                          aria-invalid={errors.merchant ? 'true' : undefined} aria-describedby={errors.merchant ? 'tx-err-merchant' : undefined}
                          style={{ width: '100%', border: 'none', background: 'none', color: 'var(--text)', font: 'inherit', fontSize: 14.5, fontWeight: 500, outline: 'none', padding: 0 }} />
                      </span>
                    </label>
                  </Row>
                )}
                {/* Payment source sits ABOVE Category: it is required while
                    Category is optional, so the must-fill field comes first. */}
                {(fields.payWith || fields.account) && (
                  <Row last={false} error={fields.payWith ? errors.payWith : errors.account} errorId={fields.payWith ? 'tx-err-paywith' : 'tx-err-account'}>
                    <button onClick={() => openRow(fields.payWith ? 'payWith' : 'account')} style={rowInner}
                      aria-invalid={(fields.payWith ? errors.payWith : errors.account) ? 'true' : undefined}
                      aria-describedby={(fields.payWith ? errors.payWith : errors.account) ? (fields.payWith ? 'tx-err-paywith' : 'tx-err-account') : undefined}>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{fields.payWith ? payWithLabel(type) : accountLabel(type)}</span>
                        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 500 }}>{optLabel(fields.payWith ? f.payWith : f.account) || 'Choose…'}</span>
                      </span>
                      <span aria-hidden="true" style={{ color: 'var(--muted)' }}>›</span>
                    </button>
                  </Row>
                )}
                {type === 'expense' && String(f.payWith || '').startsWith('card:') && (
                  <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text)', margin: '10px 14px', padding: '8px 10px', background: 'var(--info-soft)', borderRadius: 8 }}>
                    <span style={{ fontWeight: 700, color: 'var(--info)', flex: 'none' }}>Card purchase</span>
                    <span style={{ opacity: .85 }}>Adds to the card’s outstanding amount. Your bank balance is unchanged until you pay the bill.</span>
                  </div>
                )}
                {fields.category && (
                  <Row last={false} error={errors.category} errorId="tx-err-category">
                    <button onClick={() => openRow('category')} style={rowInner}
                      aria-invalid={errors.category ? 'true' : undefined} aria-describedby={errors.category ? 'tx-err-category' : undefined}>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>Category</span>
                        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 500 }}>{catName || 'Choose…'}</span>
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
                    <Row last={false} error={errors.reason} errorId="tx-err-reason">
                      <label style={{ ...rowInner, cursor: 'text' }}>
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>Reason <span style={{ color: 'var(--neg)' }}>*</span></span>
                          <input value={f.reason || ''} onFocus={commitKp} onChange={e => setField('reason', e.target.value)}
                            placeholder="e.g. Bank charges correction"
                            aria-invalid={errors.reason ? 'true' : undefined} aria-describedby={errors.reason ? 'tx-err-reason' : undefined}
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
                for anything this shell doesn't cover (repeat, split, etc). The
                toggle button stays mounted across both states (a real
                disclosure, not a one-way reveal) so keyboard/AT focus never
                gets dropped to a generic wrapper on expand — it just stays put
                on the button while aria-expanded/aria-controls track the
                revealed region. Collapsing only hides #tx-more-region; the
                notes/fee/status values themselves live in the form (f.notes /
                f.fee / f.pending), so nothing entered is lost. */}
            <div style={{ marginTop: 12 }}>
              <button onClick={() => { commitKp(); setShowMore(v => !v); }} className="hv-elev"
                aria-expanded={showMore} aria-controls="tx-more-region"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', height: 44,
                  border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--muted)',
                  font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {showMore ? 'Show less' : 'Show more'}
                <span aria-hidden="true" style={{ display: 'inline-block', transform: showMore ? 'rotate(180deg)' : 'none' }}>⌄</span>
              </button>
              {showMore && (
                <div id="tx-more-region" style={{ ...card, marginTop: 8 }}>
                  <Row last={false} error={errors.notes} errorId="tx-err-notes">
                    <div style={{ padding: '10px 14px' }}>
                      <label htmlFor="tx-notes" style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>Notes</label>
                      <textarea id="tx-notes" rows={2} value={f.notes || ''} onFocus={commitKp} onChange={e => setField('notes', e.target.value)}
                        aria-invalid={errors.notes ? 'true' : undefined} aria-describedby={errors.notes ? 'tx-err-notes' : undefined}
                        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--elev)',
                          color: 'var(--text)', font: 'inherit', fontSize: 14, padding: '8px 10px', resize: 'vertical', outline: 'none' }} />
                    </div>
                  </Row>
                  {fields.transfer && (
                    <Row last={false} error={errors.fee} errorId="tx-err-fee">
                      <div style={{ padding: '10px 14px' }}>
                        <label htmlFor="tx-fee" style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>Transfer fee</label>
                        <input id="tx-fee" inputMode="decimal" placeholder="0" value={f.fee || ''} onFocus={commitKp} onChange={e => setField('fee', e.target.value)}
                          aria-invalid={errors.fee ? 'true' : undefined} aria-describedby={errors.fee ? 'tx-err-fee' : undefined}
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
            withCards={(picker === 'payWith' && (type === 'expense' || type === 'refund')) || picker === 'to'} bankOpts={bankOpts} creditOpts={creditOpts}
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
