import { Dialog } from '@base-ui/react/dialog';
import Keypad from '../../phone/Keypad.jsx';

// The YNAB-style on-screen keypad. Deliberately NOT a text input: the draft is
// plain state rendered as text, so the OS keyboard can never appear (the
// #100–#108 drawer-vs-keyboard class is unreachable by construction).

export default function KeypadSheet({ open, cat, hint, canAutoAssign, onKey, onDone, onClose, onAutoAssign, onMoveMoney }) {
  return (
    <Dialog.Root open={open} onOpenChange={o => { if (!o) onClose(); }} modal={false} disablePointerDismissal>
      <Dialog.Portal>
        <Dialog.Popup aria-label={'Assign to ' + (cat ? cat.name : '')}
          style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 60,
            background: 'var(--elev)', borderTop: '1px solid var(--border)',
            borderRadius: '12px 12px 0 0', boxShadow: 'var(--shadow)',
            padding: '10px 12px calc(10px + env(safe-area-inset-bottom))', outline: 'none' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button onClick={onAutoAssign} disabled={!canAutoAssign} className="hv-soft"
              style={{ flex: 1, height: 40, border: '1px solid var(--border)', borderRadius: 999,
                background: 'var(--surface)', color: canAutoAssign ? 'var(--text)' : 'var(--muted)',
                fontSize: 13, fontWeight: 600, cursor: canAutoAssign ? 'pointer' : 'default' }}>
              ⚡ Auto-Assign
            </button>
            <button onClick={onMoveMoney} className="hv-soft"
              style={{ flex: 1, height: 40, border: '1px solid var(--border)', borderRadius: 999,
                background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              ➡ Move Money
            </button>
          </div>
          {hint != null && (
            <button onClick={hint.onFill} className="hv-soft"
              style={{ width: '100%', border: 'none', borderRadius: 999, padding: '8px 12px', marginBottom: 8,
                background: 'var(--soft)', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {hint.label}
            </button>
          )}
          <Keypad onKey={onKey} onDone={onDone} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
