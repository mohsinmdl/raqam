// U3 receipt-scan — the "Scan receipt" entry surface (US-13..US-15). A Base UI
// bottom sheet on phone / centered dialog on desktop holding a file picker. On
// phone the input carries `capture="environment"` so it offers the camera; on
// desktop it's a plain image picker. Picking a file runs the flow
// (receiptScanFlow.runReceiptScan): `/parse-receipt` (VLM) → PREFILL the existing
// add-tx editor — never writes. A junk/failed read silently opens a blank editor
// plus a quiet notice; there is never a blocking error here.
//
// Opening the add-tx editor replaces this component's drawer-state slot, so the
// sheet closes on its own once a usable parse hands off — no explicit close then.
import { useEffect, useState } from 'react';
import { BottomSheet, BottomSheetPanel } from '../primitives/BottomSheet.jsx';
import { Modal, ModalClose, ModalPanel } from '../primitives/Modal.jsx';
import { useIsPhone } from '../../lib/useIsPhone.js';
import { useStore } from '../../store/StoreProvider.jsx';
import { useUI } from '../UIProvider.jsx';
import { useDrawer } from '../DrawerProvider.jsx';
import { useAI } from './useAI.js';
import { runReceiptScan } from './receiptScanFlow.js';

const btnOutline = { height: 36, padding: '0 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const pickLabel = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, padding: '0 18px', border: 'none', borderRadius: 10, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 600, cursor: 'pointer' };

function CameraGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function ReceiptScanBody({ isPhone, busy, warming, onPick, onClose }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Scan receipt</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>{isPhone ? 'Snap or pick a receipt photo' : 'Pick a receipt photo'} — we'll read the merchant, date, and total into a transaction for you to review.</div>
        </div>
        <ModalClose aria-label="Close" data-testid="receipt-scan-close" className="hv-soft rq-btn-outline"
          onClick={onClose}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, flex: 'none' }}>×</ModalClose>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 20 }}>
        <label style={{ ...pickLabel, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }} className="hv-accent">
          <CameraGlyph />
          {busy ? 'Reading…' : (isPhone ? 'Take or choose photo' : 'Choose photo')}
          <input
            type="file"
            accept="image/*"
            {...(isPhone ? { capture: 'environment' } : {})}
            data-testid="receipt-scan-input"
            aria-label="Receipt image"
            disabled={busy}
            onChange={onPick}
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
          />
        </label>
        {(busy || warming) && (
          <span role="status" data-testid="receipt-scan-reading" style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>
            {warming ? 'Warming up the scanner…' : 'Reading receipt…'}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
        <button onClick={onClose} disabled={busy} data-testid="receipt-scan-cancel" className="hv-elev rq-btn-outline"
          style={{ ...btnOutline, opacity: busy ? 0.5 : 1, cursor: busy ? 'default' : 'pointer' }}>Cancel</button>
      </div>
    </>
  );
}

export default function ReceiptScanEntry({ open, onClose }) {
  const isPhone = useIsPhone();
  const { enabled, parseReceipt, categorize, warming } = useAI();
  const { data: S } = useStore();
  const { notify } = useUI();
  const { openDrawer } = useDrawer();
  const [busy, setBusy] = useState(false);

  // Reset per open (held-mounted shell pattern, like PasteSmsEntry).
  useEffect(() => { if (open) setBusy(false); }, [open]);

  const onPick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow re-picking the same file after a miss
    if (!file || busy) return;
    setBusy(true);
    // runReceiptScan always ends by opening the add-tx editor (seed or blank),
    // which replaces this sheet's drawer slot — so no onClose() afterwards.
    try {
      await runReceiptScan({ file, enabled, parseReceipt, categorize, S, openDrawer, notify });
    } finally {
      setBusy(false);
    }
  };

  const body = <ReceiptScanBody isPhone={isPhone} busy={busy} warming={warming} onPick={onPick} onClose={onClose} />;

  if (isPhone) {
    return (
      <BottomSheet open={open} onOpenChange={o => { if (!o && !busy) onClose(); }}>
        <BottomSheetPanel label="Scan receipt">
          <div style={{ padding: '20px 20px 24px' }}>{body}</div>
        </BottomSheetPanel>
      </BottomSheet>
    );
  }

  return (
    <Modal open={open} onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <ModalPanel label="Scan receipt" width={480} height="auto">
        <div style={{ padding: '22px 24px 24px' }}>{body}</div>
      </ModalPanel>
    </Modal>
  );
}
