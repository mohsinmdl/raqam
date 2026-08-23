// Tokened wrapper over Base UI's Dialog as a centered DESKTOP modal —
// BottomSheet.jsx is the phone-shaped sibling. Backdrop + centered popup,
// theme surface, one hairline, --shadow. zIndex 60 matches the sheet family.
import { Dialog } from '@base-ui/react/dialog';

export const Modal = Dialog.Root;
export const ModalClose = Dialog.Close;

// `height` defaults to the fixed workspace shape the big modals (Manage
// Payees) rely on; form-sized dialogs pass 'auto' so the card hugs its
// content instead of towering over a five-field form.
export function ModalPanel({ children, label, width = 980, height = '86vh' }) {
  return (
    <Dialog.Portal>
      <Dialog.Backdrop style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', animation: 'hsFade .18s ease', zIndex: 60 }} />
      <Dialog.Popup aria-label={label} style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width, maxWidth: '96vw', height, maxHeight: '92vh',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
        boxShadow: 'var(--shadow)', color: 'var(--text)', zIndex: 60,
        display: 'flex', flexDirection: 'column', overflow: 'hidden', outline: 'none',
        animation: 'hsFade .18s ease',
      }}>
        {children}
      </Dialog.Popup>
    </Dialog.Portal>
  );
}
