// Tokened wrapper over Base UI's Dialog, styled as a phone bottom sheet so
// overlays that are a popover on desktop become a native-feeling sheet on
// phone — consistent with the app's existing drawers.
//
// Reuses the SAME `.drawer-panel` class + base inline styling the real drawers
// use (src/ui/DrawerProvider.jsx + the phone override in theme.css:211), so the
// sheet rises with the same metrics, radius, and hsUp animation. Intended to be
// rendered only on phone (behind useIsPhone) — where the .drawer-panel media
// rules turn the panel into a bottom sheet.
import { Dialog } from '@base-ui/react/dialog';

export const BottomSheet = Dialog.Root;
export const BottomSheetTrigger = Dialog.Trigger;
export const BottomSheetClose = Dialog.Close;

export function BottomSheetPanel({ children, label }) {
  return (
    <Dialog.Portal>
      <Dialog.Backdrop
        style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', animation: 'hsFade .18s ease', zIndex: 60 }}
      />
      {/* Base inline styling mirrors the drawer <aside> (DrawerProvider.jsx);
          the .drawer-panel phone rules (theme.css) then override top/left/right/
          bottom/width/radius to make it a bottom sheet and apply hsUp. */}
      <Dialog.Popup
        className="drawer-panel"
        aria-label={label}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 480, maxWidth: '94vw',
          zIndex: 60, background: 'var(--surface)', borderLeft: '1px solid var(--border)',
          boxShadow: 'var(--shadow)', color: 'var(--text)',
          display: 'flex', flexDirection: 'column', overflowY: 'auto', outline: 'none',
        }}
      >
        {children}
      </Dialog.Popup>
    </Dialog.Portal>
  );
}
