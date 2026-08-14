// Phone bottom sheets for the Plan screen's money-movement flows — Cover
// overspending, Move leftover money, Assign from Ready to Assign, and the
// Overspent-categories picker that routes into Cover. Each body mirrors its
// desktop popover's logic verbatim (CoverPopover/MovePopover/AssignPopover,
// src/screens/Plan.jsx) — same guards, same moveAssigned calls, same notify
// copy — just swapped onto the shared BottomSheet shell instead of a
// portalled popCard. Sheet amount fields are regular text inputs: the OS
// keyboard is fine here (only the keypad flow in KeypadSheet.jsx forbids it).
import { useMemo, useState } from 'react';
import { BottomSheet, BottomSheetPanel, BottomSheetClose } from '../../primitives/BottomSheet.jsx';
import PlanCategoryPicker from '../../PlanCategoryPicker.jsx';
import { phoneRowsFor } from './PlanPhone.jsx';
import { moveAssigned } from '../../../store/actions.js';
import { parseAmt } from '../../../lib/format.js';
import { useUI } from '../../UIProvider.jsx';
import { rtaBreakdownLines } from '../../../screens/Plan.jsx';

const label = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', margin: '0 0 4px' };
const amountInput = { width: '100%', boxSizing: 'border-box', height: 38, padding: '0 10px', textAlign: 'right',
  border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 14, marginBottom: 12 };
const okBtn = ok => ({ flex: 1, height: 42, border: 'none', borderRadius: 999, background: 'var(--accent)',
  color: 'var(--on-accent)', fontSize: 14, fontWeight: 700, cursor: ok ? 'pointer' : 'default', opacity: ok ? 1 : .5 });

const breakdownRow = { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '3px 0', fontSize: 12 };

function SheetShell({ open, onClose, title, children }) {
  return (
    <BottomSheet open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <BottomSheetPanel label={title}>
        <div style={{ padding: '14px 16px calc(14px + env(safe-area-inset-bottom))', maxHeight: '70dvh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span>
            <BottomSheetClose aria-label="Close" className="hv-soft"
              style={{ width: 30, height: 30, border: '1px solid var(--border)', borderRadius: 8,
                background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>×</BottomSheetClose>
          </div>
          {children}
        </div>
      </BottomSheetPanel>
    </BottomSheet>
  );
}

// Mirrors CoverPopover (Plan.jsx:734-775): fixed amount = -row.available,
// only the source is picked.
function CoverSheetBody({ sheet, onClose, env, S, month, money, applyData }) {
  const { notify } = useUI();
  const [from, setFrom] = useState(null);
  // sheet.row is a snapshot taken when the sheet was opened — a keypad commit
  // (Plan.jsx's onMoveMoney) applies its draft and opens this sheet in the
  // SAME batched update, so env is already fresh on this render while
  // sheet.row still carries the pre-commit figure. Read the live row off env
  // (falling back to the snapshot only if the category somehow isn't in it).
  const row = env.rows.get(sheet.cat.id) || sheet.row;
  const amount = -row.available;
  const fromCat = from && from !== 'rta' ? S.categories.find(c => c.id === from) : null;
  const fromLabel = from === 'rta' ? 'Ready to Assign' : (fromCat ? fromCat.name : null);
  const confirm = () => {
    if (!from || amount <= 0 || from === sheet.cat.id) return;
    applyData(data => moveAssigned(data, { from, to: sheet.cat.id, month, amount }));
    onClose();
    notify('Covered ' + money(amount) + ' from ' + fromLabel + '.');
  };
  return (
    <>
      <span style={label}>Cover overspending from</span>
      <div className="tnum" style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>{money(amount)}</div>
      <PlanCategoryPicker env={env} S={S} month={month} money={money} excludeId={sheet.cat.id} value={from} onChange={setFrom} />
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={confirm} disabled={!from} className="hv-accent" style={okBtn(!!from)}>OK</button>
      </div>
    </>
  );
}

// Mirrors MovePopover (Plan.jsx:780-828): amount seeded from row.available
// but editable, destination excludes the category itself.
function MoveSheetBody({ sheet, onClose, env, S, month, money, applyData }) {
  const { notify } = useUI();
  // See CoverSheetBody: sheet.row can be a pre-commit snapshot (keypad's
  // Move Money path commits the draft and opens this sheet in the same
  // batched update), so this mounts on the post-commit render and must seed
  // from the live env row, not the snapshot.
  const row = env.rows.get(sheet.cat.id) || sheet.row;
  const [amount, setAmount] = useState(() => String(row.available));
  const [to, setTo] = useState(null);
  const toCat = to && to !== 'rta' ? S.categories.find(c => c.id === to) : null;
  const toLabel = to === 'rta' ? 'Ready to Assign' : (toCat ? toCat.name : null);
  const amt = parseAmt(amount);
  const canMove = !!to && amt > 0;
  const confirm = () => {
    if (!canMove || to === sheet.cat.id) return;
    applyData(data => moveAssigned(data, { from: sheet.cat.id, to, month, amount: amt }));
    onClose();
    notify('Moved ' + money(amt) + ' to ' + toLabel + '.');
  };
  return (
    <>
      <span style={label}>Move</span>
      <input
        className="tnum" value={amount} inputMode="numeric"
        onFocus={e => e.target.select()}
        onChange={e => setAmount(e.target.value)}
        style={amountInput}
      />
      <span style={label}>To</span>
      <PlanCategoryPicker env={env} S={S} month={month} money={money} excludeId={sheet.cat.id} value={to} onChange={setTo} />
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={confirm} disabled={!canMove} className="hv-accent" style={okBtn(canMove)}>OK</button>
      </div>
    </>
  );
}

// Mirrors AssignPopover's "Manually" tab (Plan.jsx:268-340) — the "⚡ Auto"
// tab is a disabled placeholder there too, so it's dropped here rather than
// carried onto a sheet with no room for a second tab strip. The RTA
// breakdown rows above the amount field reuse rtaBreakdownLines (exported
// from screens/Plan.jsx), the same pure derivation RtaBreakdown's desktop
// popover renders from — so the two surfaces can never drift apart.
function AssignSheetBody({ onClose, env, prevRta, S, month, money, moneyS, applyData }) {
  const { notify } = useUI();
  const [amount, setAmount] = useState(() => String(Math.max(0, env.rta)));
  const [to, setTo] = useState(null);
  const toCat = to && S.categories.find(c => c.id === to);
  const amt = parseAmt(amount);
  const canAssign = !!to && amt > 0;
  const rows = rtaBreakdownLines(env, prevRta, month);
  const confirm = () => {
    if (!canAssign || to === 'rta') return;
    const name = toCat ? toCat.name : to;
    applyData(data => moveAssigned(data, { from: 'rta', to, month, amount: amt }));
    onClose();
    notify('Assigned ' + money(amt) + ' to ' + name + '.');
  };
  return (
    <>
      {rows.length > 0 && (
        <div style={{ background: 'var(--elev)', borderRadius: 8, padding: '6px 10px', marginBottom: 12 }}>
          {rows.map(r => (
            <div key={r.label} style={breakdownRow}>
              <span style={{ color: 'var(--muted)' }}>{r.label}</span>
              <span className="tnum" style={{ color: 'var(--muted)' }}>{moneyS(r.value)}</span>
            </div>
          ))}
        </div>
      )}
      <span style={label}>Assign</span>
      <input
        className="tnum" value={amount} inputMode="numeric"
        onFocus={e => e.target.select()}
        onChange={e => setAmount(e.target.value)}
        style={amountInput}
      />
      <span style={label}>To</span>
      <PlanCategoryPicker env={env} S={S} month={month} money={money} excludeRta value={to} onChange={setTo} />
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={confirm} disabled={!canAssign} className="hv-accent" style={okBtn(canAssign)}>Assign</button>
      </div>
    </>
  );
}

// List of overspent categories, each a red pill → onPick(cat, row) reopens
// this sheet as 'cover' for that category (wired in Plan.jsx). Reuses
// PlanPhone's own phoneRowsFor for the overspent list — same fold that
// builds the "Overspent categories" banner count — rather than re-deriving
// "active expense categories with available < 0" a second time here.
function OverspentSheetBody({ sheet, env, S, money }) {
  const { overspent } = useMemo(() => phoneRowsFor(S, env, new Set()), [S, env]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {overspent.map(({ cat, row }) => (
        <button
          key={cat.id} onClick={() => sheet.onPick(cat, row)} className="hv-soft"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px',
            background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', textAlign: 'left' }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {cat.emoji ? cat.emoji + ' ' : ''}{cat.name}
          </span>
          <span className="tnum" style={{ flex: 'none', borderRadius: 999, padding: '4px 10px', fontSize: 13, fontWeight: 700,
            background: 'var(--neg-soft)', color: 'var(--neg)' }}>{money(row.available)}</span>
        </button>
      ))}
    </div>
  );
}

// Read-only list of hidden (archived) expense categories, opened from the
// phone list's "N hidden categories" row. Unhide stays desktop-only (per
// spec) — this is display only, no actions.
function HiddenSheetBody({ S }) {
  const hidden = (S.categories || []).filter(c => c.type === 'expense' && c.status === 'archived');
  if (!hidden.length) return <div style={{ fontSize: 13, color: 'var(--muted)' }}>No hidden categories.</div>;
  return (
    <div>
      {hidden.map((cat, i) => (
        <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 2px',
          borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
          <span style={{ fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {cat.emoji ? cat.emoji + ' ' : ''}{cat.name}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function MoneySheets({ sheet, onClose, env, prevRta, S, month, money, moneyS, applyData }) {
  const titles = { cover: 'Cover overspending', move: 'Move money', assign: 'Assign money', overspent: 'Overspent Categories', hidden: 'Hidden categories' };
  // Keep the shell (and its last body) mounted through the close animation
  // instead of unmount-yanking the content the instant `sheet` goes null —
  // Base UI's Dialog can then animate its own close rather than snapping shut.
  const [last, setLast] = useState(sheet);
  if (sheet && sheet !== last) setLast(sheet);
  const shown = sheet || last;
  return (
    <SheetShell open={!!sheet} onClose={onClose} title={shown ? titles[shown.kind] : ''}>
      {shown && shown.kind === 'cover' && <CoverSheetBody {...{ sheet: shown, onClose, env, S, month, money, applyData }} />}
      {shown && shown.kind === 'move' && <MoveSheetBody {...{ sheet: shown, onClose, env, S, month, money, applyData }} />}
      {shown && shown.kind === 'assign' && <AssignSheetBody {...{ onClose, env, prevRta, S, month, money, moneyS, applyData }} />}
      {shown && shown.kind === 'overspent' && <OverspentSheetBody {...{ sheet: shown, env, S, money }} />}
      {shown && shown.kind === 'hidden' && <HiddenSheetBody {...{ S }} />}
    </SheetShell>
  );
}
