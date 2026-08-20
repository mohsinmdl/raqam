import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import ConfirmDialog from './ConfirmDialog.jsx';
import ShortcutHelpModal from './ShortcutHelpModal.jsx';
import Toast from './Toast.jsx';

// Ephemeral UI chrome shared by every screen: toast notifications and the confirm dialog.
// (The drawer system builds on this in a later milestone.)
const Ctx = createContext(null);

export function UIProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [payeesOpen, setPayeesOpen] = useState(false);
  // True while a bottom-pinned bar (the bulk-actions bar) is showing. The toast
  // lifts above it rather than landing on top of it — see useBottomBar / Toast.
  const [bottomBar, setBottomBar] = useState(false);
  // Ids of rows to "blink" once — the quiet stand-in for a confirmation toast
  // after add / edit / categorize. A Set so a bulk action can flash many rows
  // at once; consumed by row components via flashIds.has(id).
  const [flashIds, setFlashIds] = useState(() => new Set());
  const toastTimer = useRef(null);
  const flashTimer = useRef(null);

  const notify = useCallback(msg => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 3800);
  }, []);

  // Briefly highlight one or more rows. Accepts a single id or an array of ids;
  // the row's hsRowFlash animation runs once (see theme.css), and we clear the
  // set after the animation window so a later remount can't re-trigger it.
  const flashRows = useCallback(ids => {
    const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
    if (!list.length) return;
    clearTimeout(flashTimer.current);
    setFlashIds(new Set(list));
    flashTimer.current = setTimeout(() => setFlashIds(new Set()), 1300);
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

  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);

  const openPayees = useCallback(() => setPayeesOpen(true), []);
  const closePayees = useCallback(() => setPayeesOpen(false), []);

  const value = useMemo(() => ({
    notify, ask, closeTopOverlay, confirmOpen: !!confirm, setBottomBar,
    shortcutsOpen, openShortcuts, closeShortcuts,
    payeesOpen, openPayees, closePayees,
    flashRows, flashIds,
  }), [notify, ask, closeTopOverlay, confirm, shortcutsOpen, openShortcuts, closeShortcuts, payeesOpen, openPayees, closePayees, flashRows, flashIds]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <ConfirmDialog confirm={confirm} onCancel={confirm?.onCancel} />
      <ShortcutHelpModal open={shortcutsOpen} onClose={closeShortcuts} />
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
