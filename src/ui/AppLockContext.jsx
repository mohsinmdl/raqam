import { createContext, useContext } from 'react';

// Bridges the manual "Lock now" icon (rendered inside Shell) up to AppLockGate,
// which owns the lock state. `enabled` mirrors the app-lock pref so the icon can
// hide when no lock is configured; `lockNow()` shows the lock screen at once.
export const AppLockContext = createContext({ enabled: false, lockNow: () => {} });
export const useAppLock = () => useContext(AppLockContext);
