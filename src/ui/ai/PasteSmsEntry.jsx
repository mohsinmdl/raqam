// U2 sms-parse — the "Paste bank SMS" entry surface (US-9..US-12). A Base UI
// bottom sheet on phone / centered dialog on desktop holding a textarea + a
// Parse action. Parse runs the two-tier flow (pasteSmsFlow.runPasteSms): tier-1
// regex first, LLM only on a miss when AI is on, then it PREFILLS the existing
// add-tx editor — never writes. Failure silently routes to the notes fallback;
// there is never a blocking error here.
//
// Opening the add-tx editor replaces this component's drawer-state slot, so the
// sheet closes on its own once Parse hands off — no explicit close after Parse.
import { useEffect, useState } from 'react';
import { BottomSheet, BottomSheetPanel } from '../primitives/BottomSheet.jsx';
import { Modal, ModalClose, ModalPanel } from '../primitives/Modal.jsx';
import { useIsPhone } from '../../lib/useIsPhone.js';
import { useStore } from '../../store/StoreProvider.jsx';
import { useDrawer } from '../DrawerProvider.jsx';
import { useAI } from './useAI.js';
import { runPasteSms } from './pasteSmsFlow.js';

const btnOutline = { height: 36, padding: '0 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const btnSolid = { height: 36, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' };

function PasteSmsBody({ text, setText, busy, onParse, onClose }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Paste bank SMS</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>Paste a debit/credit alert — we'll pre-fill a transaction for you to review.</div>
        </div>
        <ModalClose aria-label="Close" data-testid="paste-sms-close" className="hv-soft rq-btn-outline"
          onClick={onClose}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, flex: 'none' }}>×</ModalClose>
      </div>
      <textarea
        data-testid="paste-sms-input"
        aria-label="Bank SMS text"
        value={text}
        onChange={e => setText(e.target.value)}
        disabled={busy}
        rows={5}
        placeholder="e.g. Rs 5,420.00 debited from A/C **1234 at IMTIAZ on 24-Aug-2026"
        style={{ width: '100%', marginTop: 16, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--elev)', color: 'var(--text)', fontSize: 13.5, lineHeight: 1.5, resize: 'vertical', outline: 'none', boxSizing: 'border-box', opacity: busy ? 0.7 : 1 }}
      />
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18, alignItems: 'center' }}>
        {busy && <span role="status" data-testid="paste-sms-reading" style={{ marginRight: 'auto', fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>Reading…</span>}
        <button onClick={onClose} disabled={busy} data-testid="paste-sms-cancel" className="hv-elev rq-btn-outline"
          style={{ ...btnOutline, opacity: busy ? 0.5 : 1, cursor: busy ? 'default' : 'pointer' }}>Cancel</button>
        <button onClick={onParse} disabled={busy || !text.trim()} data-testid="paste-sms-parse" className="hv-accent rq-btn-solid"
          style={{ ...btnSolid, opacity: (busy || !text.trim()) ? 0.6 : 1, cursor: (busy || !text.trim()) ? 'default' : 'pointer' }}>
          {busy ? 'Reading…' : 'Parse'}
        </button>
      </div>
    </>
  );
}

export default function PasteSmsEntry({ open, onClose }) {
  const isPhone = useIsPhone();
  const { enabled, parseSms } = useAI();
  const { data: S } = useStore();
  const { openDrawer } = useDrawer();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  // Re-seed per open (held-mounted shell pattern, like NewPlanModal).
  useEffect(() => { if (open) { setText(''); setBusy(false); } }, [open]);

  const onParse = async () => {
    if (busy || !text.trim()) return;
    setBusy(true);
    // runPasteSms always ends by opening the add-tx editor (seed or notes),
    // which replaces this sheet's drawer slot — so no onClose() afterwards.
    try {
      await runPasteSms({ text, enabled, parseSms, S, openDrawer });
    } finally {
      setBusy(false);
    }
  };

  const body = <PasteSmsBody text={text} setText={setText} busy={busy} onParse={onParse} onClose={onClose} />;

  if (isPhone) {
    return (
      <BottomSheet open={open} onOpenChange={o => { if (!o && !busy) onClose(); }}>
        <BottomSheetPanel label="Paste bank SMS">
          <div style={{ padding: '20px 20px 24px' }}>{body}</div>
        </BottomSheetPanel>
      </BottomSheet>
    );
  }

  return (
    <Modal open={open} onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <ModalPanel label="Paste bank SMS" width={480} height="auto">
        <div style={{ padding: '22px 24px 24px' }}>{body}</div>
      </ModalPanel>
    </Modal>
  );
}
