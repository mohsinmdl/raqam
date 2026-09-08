// Reflect — transaction drill-down popover. Anchored to a donut slice (a
// virtual element derived from the click point, see SpendingDonut) or a
// category row (a real DOM element), listing that category's transactions
// (spendingReport.js's categoryTxRows). Desktop uses Base UI's Popover directly (the
// CategoryPickerPopover pattern: the shared PopoverPanel primitive has no
// `anchor` prop for an external anchor); phone uses the BottomSheet.
import { useNavigate } from 'react-router-dom';
import { Popover as BasePopover } from '@base-ui/react/popover';
import { useIsPhone } from '../../lib/useIsPhone.js';
import { activityDrillTarget } from '../../lib/activityDrill.js';
import { BottomSheet, BottomSheetPanel } from '../primitives/BottomSheet.jsx';

const fmtDate = ymd => {
  const [y, m, d] = String(ymd).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

const headerCellStyle = {
  fontSize: 11, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--muted)',
};

function Table({ rows, money, dropMemo, onDrill }) {
  const cols = dropMemo ? '1fr 84px 1fr 96px' : '1fr 90px 1fr 1fr 110px';
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '0 4px 8px', borderBottom: '1px solid var(--border)' }}>
        <span style={headerCellStyle}>Account</span>
        <span style={headerCellStyle}>Date</span>
        <span style={headerCellStyle}>Payee</span>
        {!dropMemo && <span style={headerCellStyle}>Memo</span>}
        <span style={{ ...headerCellStyle, textAlign: 'right' }}>Amount</span>
      </div>
      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        {rows.length === 0 && (
          <p style={{ margin: 0, padding: '16px 4px', fontSize: 13, color: 'var(--muted)' }}>No transactions</p>
        )}
        {rows.map(r => (
          // Each row deep-links into its account register with the transaction
          // pre-selected (activityDrillTarget → ?sel=), matching the Plan tab's
          // ActivityPopover. A positive amt is income/refund/inflow → green, the
          // same sign rule the register uses (txRow.js); expenses keep the
          // default text colour rather than turning red.
          <div key={r.id} role="button" tabIndex={0} className="hv-soft"
            onClick={() => onDrill(r)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDrill(r); } }}
            aria-label={'Open ' + (r.payee || 'transaction') + ' in ' + r.account + ' register'}
            style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '8px 4px', borderBottom: '1px solid var(--border)', fontSize: 13, cursor: 'pointer' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.account}</span>
            <span className="tnum" style={{ color: 'var(--muted)' }}>{fmtDate(r.date)}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.payee}</span>
            {!dropMemo && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted)' }}>{r.memo}</span>}
            <span className="tnum" style={{ textAlign: 'right', color: r.amt > 0 ? 'var(--pos)' : undefined }}>{money(r.amt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Header({ title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 15, fontWeight: 700 }}>{title.name}</span>
    </div>
  );
}

export default function TransactionPopover({ open, onClose, anchor, title, rows, money }) {
  const isPhone = useIsPhone();
  const navigate = useNavigate();
  // Navigating away unmounts the Reflect screen, which closes this popover — no
  // explicit onClose needed (same as ActivityPopover). accountId + id are all
  // activityDrillTarget reads off the row.
  const drill = r => { if (r?.id) navigate(activityDrillTarget(r)); };

  if (isPhone) {
    return (
      <BottomSheet open={open} onOpenChange={o => { if (!o) onClose(); }}>
        <BottomSheetPanel label={title.name}>
          <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid var(--border)' }}>
            <Header title={title} />
          </div>
          <div style={{ padding: '12px 12px 8px', flex: 1, overflowY: 'auto' }}>
            <Table rows={rows} money={money} dropMemo onDrill={drill} />
          </div>
          <div style={{ padding: '12px 16px 16px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
            <button
              onClick={onClose}
              style={{ border: 'none', background: 'none', padding: 0, color: 'var(--accent)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
            >
              Close
            </button>
          </div>
        </BottomSheetPanel>
      </BottomSheet>
    );
  }

  return (
    <BasePopover.Root open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <BasePopover.Portal>
        <BasePopover.Positioner
          anchor={anchor} side="top" align="center" sideOffset={10}
          collisionAvoidance={{ side: 'flip', align: 'shift' }} style={{ zIndex: 40 }}
        >
          <BasePopover.Popup
            aria-label={`${title.name} transactions`}
            style={{
              width: 560, maxWidth: '92vw', background: 'var(--surface)', color: 'var(--text)',
              border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)',
              outline: 'none', boxSizing: 'border-box', padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
            }}
          >
            <Header title={title} />
            <Table rows={rows} money={money} onDrill={drill} />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={onClose}
                style={{ border: 'none', background: 'none', padding: 0, color: 'var(--accent)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
