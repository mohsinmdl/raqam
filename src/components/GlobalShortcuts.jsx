import { useNavigate } from 'react-router-dom';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { useShortcuts, useSequence } from '../ui/useShortcuts.js';
import { SPEC } from '../lib/shortcuts.js';
import { openers } from '../drawers/openers.js';
import { useAppLock } from '../ui/AppLockContext.jsx';

// App-level keys that are not tied to a screen: ? toggles the help modal,
// shift+N opens Add Transaction, ctrl/⌘+shift+L flips the theme, H hides amounts,
// L locks the app now (only when App lock is enabled). Disabled while a drawer or
// confirm is open so they never stack; the letter keys also stand down while the
// help modal is up (except ? which closes it).
export default function GlobalShortcuts() {
  const { openShortcuts, closeShortcuts, shortcutsOpen, confirmOpen } = useUI();
  const { drawer, openDrawer } = useDrawer();
  const { prefs, setPrefs } = useStore();
  // Same lockNow the header icon uses (AppLockGate owns the lock state).
  const { enabled: lockEnabled, lockNow } = useAppLock();
  const nav = useNavigate();
  const bindings = [
    { spec: SPEC.help,  run: () => (shortcutsOpen ? closeShortcuts() : openShortcuts()) },
    { spec: SPEC.addTx, when: () => !shortcutsOpen, run: () => openers.addTx(openDrawer) },
    { spec: SPEC.toggleTheme, when: () => !shortcutsOpen, run: () => setPrefs({ theme: prefs.theme === 'light' ? 'dark' : 'light' }) },
    { spec: SPEC.hideAmounts, when: () => !shortcutsOpen, run: () => setPrefs({ masked: !prefs.masked }) },
    // Lock now: only meaningful once App lock is enrolled (an unenrolled lock
    // would trap the user — the lock screen needs a credId to unlock), so it is
    // gated on `enabled` and calls the shared lockNow (same path as the header icon).
    { spec: SPEC.lockNow, when: () => !shortcutsOpen && lockEnabled, run: () => lockNow() },
  ];
  useShortcuts(bindings, !drawer && !confirmOpen);
  // G-then-key navigation to the main screens.
  const seq = [
    { seq: SPEC.goDashboard.seq, run: () => nav('/reflect') },
    { seq: SPEC.goTransactions.seq, run: () => nav('/transactions') },
    { seq: SPEC.goAccounts.seq, run: () => nav('/accounts') },
    { seq: SPEC.goBudget.seq, run: () => nav('/budget') },
  ];
  useSequence(seq, !drawer && !confirmOpen && !shortcutsOpen);
  return null;
}
