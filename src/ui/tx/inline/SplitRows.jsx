// Split sub-rows under the inline editor (YNAB's indented split lines). Each
// line is category + memo + amount, they must sum to the row's total before
// Save (validateSplit runs in useSubmit, and the remainder chip shows the gap
// live). Lines reuse the drawer's split helpers so the two entry paths cannot
// drift. NOTE: a split line's memo is not stored per-leg today (legs share the
// parent's notes) — the memo cell is omitted until the model carries it.
//
// Column alignment: colSpan is the register's actual <td> count for this row
// (checkbox + data columns — see Transactions.jsx's gridColSpan). Each split
// line's td-1 sits under the checkbox column; the category picker spans every
// column up to OUTFLOW; then the amount td lands under outflow, an empty td
// under inflow, another under BALANCE when that column is showing, and the
// remove button under status/cleared. The picker's span is therefore colSpan
// minus the fixed tail — counted from `showBalance` rather than hard-coded,
// because a wrong count doesn't fail loudly, it silently slides the amount
// field one column right of the header it belongs under.
import { useDrawer } from '../../DrawerProvider.jsx';
import { useStore } from '../../../store/StoreProvider.jsx';
import { useMoney } from '../../../lib/format.js';
import { currentMonth, nowIso } from '../../../lib/dates.js';
import { envelopeFor } from '../../../lib/envelope.js';
import { blankLine, fillRemainderIndex, splitRemainder } from '../../../lib/splitTx.js';
import { formatAmountInput } from '../../../lib/amountInput.js';
import PlanCategoryPicker from '../../PlanCategoryPicker.jsx';

const lineTd = { padding: '2px 4px', borderBottom: '1px solid var(--border)', background: 'var(--soft)', verticalAlign: 'middle' };

export default function SplitRows({ colSpan, showBalance }) {
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
  // Fixed tail after the picker: amount + inflow spacer + (balance spacer) + remove.
  const tail = showBalance ? 5 : 4;
  const rem = splitRemainder(f.amount, lines);
  const fillIdx = fillRemainderIndex(lines);
  return (
    <>
      {lines.map((l, i) => (
        <tr key={l.id}>
          <td style={lineTd} />
          <td colSpan={colSpan - tail} style={{ ...lineTd, paddingLeft: 34 }}>
            <PlanCategoryPicker env={env} S={S} month={month} money={money} size={28}
              catType="expense" showAmounts excludeRta heading={null} allowCreate showSelected placeholder="Category"
              onCreate={({ name, groupId }) => setLine(i, { category: '__new', newCat: name, newCatGroup: groupId || '' })}
              value={l.category} onChange={id => setLine(i, { category: id, newCat: '', newCatGroup: '' })} />
          </td>
          <td style={lineTd}>
            <input className="field tnum" inputMode="decimal" aria-label={'Split line ' + (i + 1) + ' amount'}
              value={l.amount} onFocus={e => e.target.select()}
              onChange={e => setLine(i, { amount: formatAmountInput(e.target.value) })}
              style={{ width: '100%', height: 28, padding: '0 8px', fontSize: 13, textAlign: 'right' }} />
          </td>
          <td style={lineTd} />
          {showBalance && <td style={lineTd} />}
          <td style={{ ...lineTd, textAlign: 'center' }}>
            <button type="button" onClick={() => removeLine(i)} aria-label={'Remove split line ' + (i + 1)} className="hv-soft"
              style={{ width: 22, height: 22, border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14 }}>×</button>
          </td>
        </tr>
      ))}
      <tr>
        <td colSpan={colSpan} style={{ ...lineTd, padding: '4px 12px 8px 34px' }}>
          <span style={{ display: 'inline-flex', gap: 12, alignItems: 'center' }}>
            <button type="button" onClick={() => setLines([...lines, blankLine()])} className="hv-soft"
              style={{ border: 'none', background: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>+ Add line</button>
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
