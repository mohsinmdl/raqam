import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useShortcuts } from '../ui/useShortcuts.js';
import { SPEC } from '../lib/shortcuts.js';
import { openers } from '../drawers/openers.js';

// App-level keys that are not tied to a screen: ? toggles the help modal,
// shift+N opens Add Transaction. Disabled while a drawer or confirm is open so
// they never stack.
export default function GlobalShortcuts() {
  const { openShortcuts, closeShortcuts, shortcutsOpen, confirmOpen } = useUI();
  const { drawer, openDrawer } = useDrawer();
  const bindings = [
    { spec: SPEC.help,  run: () => (shortcutsOpen ? closeShortcuts() : openShortcuts()) },
    { spec: SPEC.addTx, when: () => !shortcutsOpen, run: () => openers.addTx(openDrawer) },
  ];
  useShortcuts(bindings, !drawer && !confirmOpen);
  return null;
}
