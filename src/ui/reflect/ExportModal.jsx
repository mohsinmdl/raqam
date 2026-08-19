// Reflect — export confirmation modal. Ported from the ConfirmDialog
// structural model (fixed overlay + FocusTrap + role="dialog" aria-modal) and
// ExplainDialog's centered-card sizing, with FilterMultiSelect's soft/accent
// pill footer styling. The caller owns "don't show again" persistence
// (localStorage, Task 9) — this component only reports the checkbox state on
// export.
import { useEffect, useState } from 'react';
import FocusTrap from '../FocusTrap.jsx';
import Checkbox from '../Checkbox.jsx';
import { useIsPhone } from '../../lib/useIsPhone.js';
import { BottomSheet, BottomSheetPanel } from '../primitives/BottomSheet.jsx';

const softPillStyle = {
  height: 36, padding: '0 16px', border: '1px solid var(--border)', borderRadius: 999,
  background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const accentPillStyle = {
  height: 36, padding: '0 18px', border: 'none', borderRadius: 999,
  background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const BODY_COPY = 'Your data is just that — yours. The report will be exported as CSV files, easy to open in other applications.';

function Content({ dontShowAgain, setDontShowAgain, onCancel, onExport, headerExtra }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>Export Report</div>
        <span style={{ flex: 1 }} />
        {headerExtra}
      </div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10, lineHeight: 1.55 }}>{BODY_COPY}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20 }}>
        <div
          onClick={() => setDontShowAgain(!dontShowAgain)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}
        >
          <Checkbox checked={dontShowAgain} onChange={setDontShowAgain} label="Don't show again" />
          Don't show again
        </div>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={onCancel} className="hv-soft" style={softPillStyle}>Cancel</button>
        <button type="button" onClick={() => onExport(dontShowAgain)} className="hv-accent" style={accentPillStyle}>Export</button>
      </div>
    </>
  );
}

export default function ExportModal({ open, onCancel, onExport }) {
  const isPhone = useIsPhone();
  // Resets to unchecked every time the modal opens.
  const [dontShowAgain, setDontShowAgain] = useState(false);
  useEffect(() => { if (open) setDontShowAgain(false); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const closeBtn = (
    <button
      onClick={onCancel}
      aria-label="Close"
      className="hv-soft"
      style={{ border: 'none', background: 'none', padding: 0, color: 'var(--accent)', fontSize: 16, lineHeight: 1, cursor: 'pointer' }}
    >
      ✕
    </button>
  );

  if (isPhone) {
    return (
      <BottomSheet open={open} onOpenChange={o => { if (!o) onCancel(); }}>
        <BottomSheetPanel label="Export Report">
          <div style={{ padding: '20px 20px 24px' }}>
            <Content
              dontShowAgain={dontShowAgain} setDontShowAgain={setDontShowAgain}
              onCancel={onCancel} onExport={onExport} headerExtra={closeBtn}
            />
          </div>
        </BottomSheetPanel>
      </BottomSheet>
    );
  }

  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'hsFade .15s ease', zIndex: 70 }}>
      <FocusTrap>
        <div role="dialog" aria-modal="true" aria-label="Export Report" onClick={e => e.stopPropagation()} style={{ width: 520, maxWidth: '92vw', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)', padding: '22px 24px', animation: 'hsUp .18s ease', color: 'var(--text)' }}>
          <Content
            dontShowAgain={dontShowAgain} setDontShowAgain={setDontShowAgain}
            onCancel={onCancel} onExport={onExport} headerExtra={closeBtn}
          />
        </div>
      </FocusTrap>
    </div>
  );
}
