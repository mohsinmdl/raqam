import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { useShortcuts } from '../ui/useShortcuts.js';
import { SPEC } from '../lib/shortcuts.js';
import { openers } from '../drawers/openers.js';

// App-level keys that are not tied to a screen: ? toggles the help modal,
// shift+N opens Add Transaction, ctrl/⌘+shift+L flips the theme, H hides amounts.
// Disabled while a drawer or confirm is open so they never stack; the letter
// keys also stand down while the help modal is up (except ? which closes it).
export default function GlobalShortcuts() {
  const { openShortcuts, closeShortcuts, shortcutsOpen, confirmOpen } = useUI();
  const { drawer, openDrawer } = useDrawer();
  const { prefs, setPrefs } = useStore();
  const bindings = [
    { spec: SPEC.help,  run: () => (shortcutsOpen ? closeShortcuts() : openShortcuts()) },
    { spec: SPEC.addTx, when: () => !shortcutsOpen, run: () => openers.addTx(openDrawer) },
    { spec: SPEC.toggleTheme, when: () => !shortcutsOpen, run: () => setPrefs({ theme: prefs.theme === 'light' ? 'dark' : 'light' }) },
    { spec: SPEC.hideAmounts, when: () => !shortcutsOpen, run: () => setPrefs({ masked: !prefs.masked }) },
  ];
  useShortcuts(bindings, !drawer && !confirmOpen);
  return null;
}
