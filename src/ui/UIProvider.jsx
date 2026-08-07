import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import ConfirmDialog from './ConfirmDialog.jsx';
import Toast from './Toast.jsx';

// Ephemeral UI chrome shared by every screen: toast notifications and the confirm dialog.
// (The drawer system builds on this in a later milestone.)
const Ctx = createContext(null);

export function UIProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);
  // True while a bottom-pinned bar (the bulk-actions bar) is showing. The toast
  // lifts above it rather than landing on top of it — see useBottomBar / Toast.
  const [bottomBar, setBottomBar] = useState(false);
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

  const value = useMemo(() => ({ notify, ask, closeTopOverlay, confirmOpen: !!confirm, setBottomBar }), [notify, ask, closeTopOverlay, confirm]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <ConfirmDialog confirm={confirm} onCancel={confirm?.onCancel} />
      <Toast msg={toast} raised={bottomBar} />
    </Ctx.Provider>
  );
}

export function useUI() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUI outside UIProvider');
  return v;
}

// A bottom-pinned bar declares itself here so the toast can sit above it instead
// of overlapping. Safe to call unconditionally with a boolean; it clears on
// unmount. Only one such bar exists (the bulk-actions bar), so a flag suffices.
export function useBottomBar(present) {
  const { setBottomBar } = useUI();
  useEffect(() => {
    setBottomBar(!!present);
    return () => setBottomBar(false);
  }, [present, setBottomBar]);
}
