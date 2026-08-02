import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import ConfirmDialog from './ConfirmDialog.jsx';
import Toast from './Toast.jsx';

// Ephemeral UI chrome shared by every screen: toast notifications and the confirm dialog.
// (The drawer system builds on this in a later milestone.)
const Ctx = createContext(null);

export function UIProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const toastTimer = useRef(null);

  const notify = useCallback(msg => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 3800);
  }, []);

  // ask({ title, body, action }) → resolves true on confirm, false on cancel.
  const ask = useCallback(opts => new Promise(resolve => {
    setConfirm({
      ...opts,
      onConfirm: () => { setConfirm(null); resolve(true); },
      onCancel: () => { setConfirm(null); resolve(false); },
    });
  }), []);

  const closeTopOverlay = useCallback(() => {
    // Escape handling: confirm sits above everything else.
    if (confirm) { confirm.onCancel(); return true; }
    return false;
  }, [confirm]);

  const value = useMemo(() => ({ notify, ask, closeTopOverlay, confirmOpen: !!confirm }), [notify, ask, closeTopOverlay, confirm]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <ConfirmDialog confirm={confirm} onCancel={confirm?.onCancel} />
      <Toast msg={toast} />
    </Ctx.Provider>
  );
}

export function useUI() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUI outside UIProvider');
  return v;
}
