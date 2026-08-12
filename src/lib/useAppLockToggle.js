// Shared enrollment-toggle logic for the App lock (Face ID / biometric) pref.
// Used by the desktop account menu (UserMenu) and the phone Dashboard row —
// the phone shell has no sidebar, so the account menu is unreachable there and
// the Dashboard hosts the mobile equivalent (same pattern as Sign out).
// Spec: docs/superpowers/specs/2026-08-12-app-lock-faceid-design.md
import { useEffect, useState } from 'react';
import { enroll, probePlatformAuthenticator } from './appLock.js';

export function useAppLockToggle({ user, email, prefs, setPrefs, notify }) {
  // Capability probe once on mount; the toggle stays hidden while probing/false.
  const [canLock, setCanLock] = useState(false);
  useEffect(() => { let ok = true; probePlatformAuthenticator().then(v => ok && setCanLock(v)); return () => { ok = false; }; }, []);
  const appLock = prefs.appLock || { enabled: false, credId: null };
  const onToggleLock = async () => {
    if (appLock.enabled) { setPrefs({ appLock: { enabled: false, credId: null } }); return; }
    try {
      const { credId } = await enroll({ userId: user.id, email });
      setPrefs({ appLock: { enabled: true, credId } });
      notify('App lock on — unlock with Face ID or your device biometrics.');
    } catch { notify('Could not turn on App lock — the biometric prompt was dismissed.'); }
  };
  return { canLock, appLock, onToggleLock };
}
