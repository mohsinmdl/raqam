// Split sub-rows under the inline editor (YNAB's indented split lines). Each
// line is category + memo + amount, they must sum to the row's total before
// Save (validateSplit runs in useSubmit, and the remainder chip shows the gap
// live). Lines reuse the drawer's split helpers so the two entry paths cannot
// drift. NOTE: a split line's memo is not stored per-leg today (legs share the
// parent's notes) — the memo cell is omitted until the model carries it.
//
// Column alignment: colSpan is the register's actual <td> count for this row
// (checkbox + data columns — see Transactions.jsx's gridColSpan).
//
// The picker used to sit in ONE cell spanning everything from the checkbox
// column to OUTFLOW, which meant the split lines were not on the register's
// grid at all: the category field started wherever a 34px indent inside that
// span happened to put it, floating free of the CATEGORY column its own
// parent row's picker sits in. A split line is the same shape of thing as the
// row above it, so it is now laid out on the same columns:
//
//   [ lead span: checkbox → PAYEE, carrying the indent ]
//   [ CATEGORY: the picker, alone ]
//   [ MEMO spacer, when that column is showing ]
//   [ OUTFLOW: the amount ] [ INFLOW spacer ] [ BALANCE spacer? ] [ remove ]
//
// `tail` counts the trailing cells only (amount, inflow, balance?, remove) —
// it used to include the leading checkbox cell too, which made the arithmetic
// read as if it were one column longer than it is. The lead span is then
// everything the tail, the CATEGORY cell and the optional MEMO cell leave
// over. A wrong count here doesn't fail loudly, it silently slides the amount
// field one column off the header it belongs under, so it is derived, never
// hard-coded.
import { useDrawer } from '../../DrawerProvider.jsx';
import { useStore } from '../../../store/StoreProvider.jsx';
import { useMoney } from '../../../lib/format.js';
import { currentMonth, nowIso } from '../../../lib/dates.js';
import { envelopeFor } from '../../../lib/envelope.js';
import { blankLine, fillRemainderIndex, splitRemainder } from '../../../lib/splitTx.js';
import { formatAmountInput } from '../../../lib/amountInput.js';
import PlanCategoryPicker from '../../PlanCategoryPicker.jsx';
import { CloseIcon, PlusIcon } from '../../icons.jsx';

const lineTd = { padding: '2px 4px', borderBottom: '1px solid var(--border)', background: 'var(--soft)', verticalAlign: 'middle' };

export default function SplitRows({ colSpan, showBalance, hideMemo }) {
  const { drawer, setForm } = useDrawer();
  const { data: S } = useStore();
  const { money } = useMoney();
  const month = currentMonth();
  const env = envelopeFor(S, month, nowIso());
  const f = drawer.form;
  const lines = f.splits || [];
  const setLines = splits => setForm({ splits });
  const setLine = (i, patch) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const removeLine = i => {
    const rest = lines.filter((_, j) => j !== i);
    if (rest.length < 2) setForm({ splitOn: false, splits: undefined, category: rest[0]?.category || '', newCat: rest[0]?.newCat || '', newCatGroup: rest[0]?.newCatGroup || '' });
    else setLines(rest);
  };
  // Trailing cells after MEMO: amount + inflow spacer + (balance spacer) + remove.
  const tail = showBalance ? 4 : 3;
  // …and the lead cell swallows whatever is in front of CATEGORY: the checkbox
  // column, plus ACCOUNT/DATE/PAYEE as far as they are showing. Minus one for
  // the CATEGORY cell itself, minus one more for MEMO when it has not folded.
  const leadSpan = colSpan - tail - 1 - (hideMemo ? 0 : 1);
  const rem = splitRemainder(f.amount, lines);
  const fillIdx = fillRemainderIndex(lines);
  return (
    <>
      {lines.map((l, i) => (
        <tr key={l.id}>
          {/* The indent that used to push the picker rightwards now lives on
              this (empty) lead cell, where it marks the line as subordinate
              without moving the field off its column. */}
          <td colSpan={leadSpan} style={{ ...lineTd, paddingLeft: 34 }} />
          <td style={lineTd}>
            <PlanCategoryPicker env={env} S={S} month={month} money={money} size={28}
              catType="expense" showAmounts excludeRta heading={null} allowCreate showSelected placeholder="Category"
              onCreate={({ name, groupId }) => setLine(i, { category: '__new', newCat: name, newCatGroup: groupId || '' })}
              value={l.category} onChange={id => setLine(i, { category: id, newCat: '', newCatGroup: '' })} />
          </td>
          {/* MEMO spacer. A split leg's memo is not stored per-leg today (see
              the note above), so the column is held open, not filled. */}
          {!hideMemo && <td style={lineTd} />}
          <td style={lineTd}>
            <input className="field tnum" inputMode="decimal" aria-label={'Split line ' + (i + 1) + ' amount'}
              value={l.amount} onFocus={e => e.target.select()}
              onChange={e => setLine(i, { amount: formatAmountInput(e.target.value) })}
              style={{ width: '100%', height: 28, padding: '0 8px', fontSize: 13, textAlign: 'right' }} />
          </td>
          <td style={lineTd} />
          {showBalance && <td style={lineTd} />}
          <td style={{ ...lineTd, textAlign: 'center' }}>
            {/* 24×24, not 22×22 — the floor for a pointer target — and the ×
                is drawn rather than the MULTIPLICATION SIGN character, which
                rendered at whatever weight the text font felt like beside a
                row of 1.8px-stroke icons. */}
            <button type="button" onClick={() => removeLine(i)} aria-label={'Remove split line ' + (i + 1)} className="hv-soft"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0 }}>
              <CloseIcon size={10} />
            </button>
          </td>
        </tr>
      ))}
      <tr>
        <td colSpan={colSpan} style={{ ...lineTd, padding: '4px 12px 8px 34px' }}>
          <span style={{ display: 'inline-flex', gap: 12, alignItems: 'center' }}>
            {/* Padded to a 24px-high target (it was a bare text run), and the
                leading + is drawn for the same reason as the remove ×. */}
            <button type="button" onClick={() => setLines([...lines, blankLine()])} className="hv-soft"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 24, borderRadius: 6, border: 'none', background: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '0 8px', marginLeft: -8 }}>
              <PlusIcon size={9} />Add line
            </button>
            {rem !== 0 && (
              <button type="button" className="tnum hv-soft" disabled={rem < 0 || fillIdx < 0}
                onClick={() => { if (rem > 0 && fillIdx >= 0) setLine(fillIdx, { amount: formatAmountInput(String(rem)) }); }}
                style={{ border: 'none', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600, cursor: rem > 0 && fillIdx >= 0 ? 'pointer' : 'not-allowed', background: rem > 0 ? 'var(--elev)' : 'var(--neg-soft)', color: rem > 0 ? 'var(--muted)' : 'var(--neg)' }}>
                {rem > 0 ? money(rem) + ' left' : 'Over by ' + money(Math.abs(rem))}
              </button>
            )}
          </span>
        </td>
      </tr>
    </>
  );
}
