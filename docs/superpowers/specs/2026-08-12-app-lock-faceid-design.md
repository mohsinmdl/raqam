# App Lock (Face ID / biometric) for the Raqam PWA — Design Spec

**Date:** 2026-08-12 · **Status:** user-approved (plan-mode approval)
**Request:** "Add a Face ID option like iOS's long-press → Require Face ID, for our installed PWA."

## Problem & platform constraint (researched first)

iOS 18's native long-press → **Require Face ID** applies only to App Store apps; Apple does **not** extend it to Home Screen web apps ([Progressier help](https://intercom.help/progressier/en/articles/11649686-can-you-use-require-face-id-to-limit-access-to-an-installed-pwa-on-ios)). We therefore build the lock **inside** the app. WebAuthn/passkeys **are** fully supported in installed iOS PWAs — `navigator.credentials.get()` raises the real Face ID sheet, with automatic device-passcode fallback ([passkeys.dev iOS](https://passkeys.dev/docs/reference/ios/), [whatpwacando.today](https://whatpwacando.today/authentication/)).

**Honest security scope (must appear in the enrollment UI copy):** this is a **privacy gate against someone holding the unlocked device**, not vault-grade security. The Supabase session and cached data persist beneath the overlay; a skilled attacker with devtools can bypass it. Standard fintech app-lock trade-off, chosen knowingly.

## User decisions (2026-08-12)

1. **Lock timing:** on cold launch, and on resume after the app was backgrounded >60s. Quick app-switches stay frictionless.
2. **Depth:** privacy gate over the live session — **not** server-side re-auth. No signature is verified server-side; the WebAuthn ceremony resolving *is* the unlock.
3. **Availability:** offered on **every** platform that reports a user-verifying platform authenticator (iOS/Android/Touch-ID Mac/Windows Hello), desktop included.

## Architecture

The lock is a **device-level preference** + a **full-screen overlay** mounted in the auth Gate. No server, no schema change, no new dependency (WebAuthn is a platform API).

### 1 · Pure lock engine — `src/lib/appLock.js` (+ `appLock.test.js`)

- `shouldLock(hiddenAtMs, nowMs, thresholdMs = 60_000) → boolean` — pure; true when `hiddenAtMs != null && nowMs - hiddenAtMs > thresholdMs`. Unit-tested matrix (never hidden, just-hidden <60s, >60s, exactly 60s boundary).
- `probePlatformAuthenticator() → Promise<boolean>` — `!!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()`, guarded in try/catch → false.
- `enroll({ userId, email }) → Promise<{ credId }>` — `navigator.credentials.create()` with: `authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }`, `rp: { id: location.hostname, name: 'Raqam' }`, random 32-byte challenge (client-generated; unverified by design), `user` = userId bytes + email, `pubKeyCredParams` ES256(-7)+RS256(-257). Returns base64url `rawId`.
- `unlock(credId) → Promise<boolean>` — `navigator.credentials.get()` with `allowCredentials: [{ id: fromB64url(credId), type: 'public-key' }]`, `userVerification: 'required'`, random challenge, `timeout: 60_000`. Resolves true on success; false on `NotAllowedError`/cancel/timeout (caller keeps the lock up and offers retry). Re-throws nothing — always resolves a boolean.
- base64url helpers local to the module (no dependency).

### 2 · Device pref — `src/store/PrefsProvider.jsx` + `StoreProvider.jsx`

- `PrefsProvider` DEFAULTS gains `appLock: { enabled: false, credId: null }` (localStorage `raqam.prefs.v1`, same tested `writeJson` path as theme/masked). Correct home: the passkey is bound to *this device*, exactly like theme/masking are per-device.
- `StoreProvider` facade already forwards `theme`/`masked` from `devicePrefs` (StoreProvider.jsx:189) and routes writes by device-key set (setPrefs, :164–178). **Add `appLock` to both**: include it in the `prefs` facade object and in the device-key routing so `setPrefs({ appLock })` lands in `devicePrefs`. Consumers keep using the flat `useStore().prefs` / `setPrefs`.

### 3 · Enrollment toggle — shared hook `src/lib/useAppLockToggle.js`, consumed by `UserMenu.jsx` (desktop) + `Dashboard.jsx` (phone)

- The enrollment logic (capability probe + enable/disable handler) lives in a shared hook, `useAppLockToggle({ user, email, prefs, setPrefs, notify })`, because the phone shell has no sidebar/account menu: the desktop toggle sits in `src/components/UserMenu.jsx`, and a capability-gated "App lock" row on the phone `src/screens/Dashboard.jsx` is the mobile equivalent (same pattern as Sign out there). Supporting order rules for the phone row live in `src/styles/theme.css`.
- Desktop: "App lock" row using the existing toggle-row idiom (`row` style, `className="hv-elev"`, `aria-pressed`, `rightNote` On/Off), placed with the other two device toggles (Appearance / Hide amounts).
- Rendered only when the cached capability probe passes (`probePlatformAuthenticator()`, run once on mount into hook state; row hidden while probing/false) — on both shells.
- **Enable:** call `enroll({ userId: user.id, email })` → on success `setPrefs({ appLock: { enabled: true, credId } })` and `notify('App lock on — unlock with Face ID or your device biometrics.')`. On failure/cancel → leave off, `notify` a soft error. A one-line muted sub-note states the privacy-not-security scope.
- **Disable:** `setPrefs({ appLock: { enabled: false, credId: null } })`. The OS owns the passkey; we don't delete it (best-effort). Reachable only while unlocked, so no auth needed to turn off.

### 4 · Lock overlay — `src/components/LockScreen.jsx`, mounted in `App.jsx` `Gate`

- Mounts inside `StoreProvider` (needs `prefs`/`user`) and only when a `session` exists — never locks the login screen. Placed as a sibling wrapping `<Shell />` in `Gate`.
- **State machine** (local to a small `AppLock` wrapper or hook `useAppLockState`):
  - `locked` initial = `prefs.appLock.enabled` (cold launch always locks when enabled).
  - `visibilitychange`: on `hidden` record `hiddenAt = Date.now()`; on `visible`, if `enabled && shouldLock(hiddenAt, Date.now())` → `locked = true`.
  - While `locked`, `AppLockGate` renders `<LockScreen onUnlock={...} />` **instead of** its children — the app tree is UNMOUNTED while locked. Privacy win: no financial DOM exists beneath the overlay for devtools/screen readers to reach. Trade-off, accepted: transient UI state (open drawers, scroll positions) resets on a >60s relock; store state survives because `StoreProvider` sits above the gate.
- **`LockScreen` UI:** fixed full-screen overlay, opaque `var(--bg)`, `zIndex ≥ 80` (above drawers 40 / picker sheet 60 / tab bar 40), centered Raqam wordmark + lock glyph (inline 1.8-stroke SVG, app icon idiom), primary **Unlock** button, secondary **Sign out**. Reduced-motion-safe fade.
  - On mount, auto-invoke `unlock(credId)` once (iOS PWAs allow it without a prior gesture); the **Unlock** button re-invokes for platforms that need a user gesture and for retry after cancel. Success → `onUnlock()` clears `locked` and `hiddenAt`.
  - **Sign out** (escape hatch, prevents permanent lockout if the passkey was deleted in OS settings): sets a `signingOut` flag, awaits `useAuth().signOut()`, and clears the lock pref (`setPrefs({ appLock: { enabled: false, credId: null } })`) only after it RESOLVES — so a future login isn't locked with a stale credId. Password re-entry becomes the recovery path (the passkey never affects `signOut()`, so the escape hatch works even when the passkey was deleted in OS settings).
  - **Sign-out hardening (fail-closed):** the `signingOut` flag holds the LockScreen mounted regardless of `enabled`/`locked`, so the app content is never revealed between tapping Sign out and the session actually dropping (the tree unmounts when the auth `Gate` swaps to the login screen). If `signOut()` rejects (offline / revoke failure) the overlay stays up and the pref is NOT cleared — the app is never revealed in a catch, and a reload re-locks instead of exposing the still-alive session. While `signingOut`, both LockScreen buttons are disabled and the Sign out button reads "Signing out…"; both buttons are likewise disabled while a biometric attempt is in flight (`busy`) so a second tap can't race it.

### Non-goals (this phase)

Server-side WebAuthn/passkey login; app-switcher snapshot blurring; a custom PIN screen (OS passcode fallback is free via the system sheet); remembering lock state across a full page reload beyond the "cold launch always locks" rule.

## Files

- **Create:** `src/lib/appLock.js`, `src/lib/appLock.test.js`, `src/components/LockScreen.jsx`, `src/lib/useAppLockToggle.js` (shared enrollment-toggle hook)
- **Modify:** `src/store/PrefsProvider.jsx` (DEFAULTS), `src/store/StoreProvider.jsx` (facade + device-key routing for `appLock`), `src/components/UserMenu.jsx` (desktop toggle row via the hook), `src/screens/Dashboard.jsx` (capability-gated phone App lock row via the hook), `src/styles/theme.css` (flex order rules so the phone account rows close the Dashboard scroll), `src/App.jsx` (mount lock in Gate)

## Testing

- **Unit (`pnpm test`):** `shouldLock` boundary matrix; base64url round-trip; prefs default/round-trip for `appLock`.
- **Live (Playwright subagent, throwaway resolveId harness):** Chromium **CDP virtual authenticator** (`WebAuthn.enable` + `addVirtualAuthenticator { protocol:'ctap2', transport:'internal', hasResidentKey:true, hasUserVerification:true, isUserVerified:true }`) drives the full ceremony headlessly — enroll via the toggle, cold-launch lock, unlock success, unlock-cancel keeps lock (`isUserVerified:false`), visibilitychange relock via injected clock, toggle hidden when no authenticator, Sign-out escape hatch clears pref. Phone 393×852 + desktop 1280×800.
- **On-device:** user confirms the real Face ID sheet + passcode fallback after deploy (headless cannot render the iOS sheet).

## Acceptance criteria

**Verified live 2026-08-12** — headless Chromium + CDP virtual authenticator (`WebAuthn.enable` / `addVirtualAuthenticator`, ctap2/internal, `isUserVerified` toggled per case), throwaway resolveId harness with stubbed auth/sync, at 393×852 (iPhone 15 Pro viewport) and 1280×800. The real Face ID sheet / device-passcode fallback cannot render headlessly — the user confirms it on-device after deploy. Live verification added two fixes (commit `1717f8f`): the phone shell has no account menu, so a capability-gated App lock row was added to the phone Dashboard (shared `useAppLockToggle` hook); and a pre-existing Dashboard hooks-order crash on setup-skip was hoisted out of the way.

1. ✅ "App lock" toggle appears in the account menu (desktop) / Dashboard row (phone) only when a platform authenticator exists — verified absent with no authenticator, present with one; enabling runs the biometric enrollment and persists `{ enabled, credId }` per device (observed in `raqam.prefs.v1`).
2. ✅ With the lock on, a cold launch and a resume-after->60s show the full-screen LockScreen over the app; the ceremony unlocks it (auto-attempt and button; failed verification keeps the lock with "Not verified. Try again."); the session is never dropped by unlocking.
3. ✅ Resume within 60s does not relock (30s and exactly-60s boundary verified via shifted clock + dispatched visibilitychange); disabling the toggle stops all locking (reload stays unlocked).
4. ✅ Sign-out from the LockScreen clears the pref (`{enabled:false, credId:null}`) and returns to the login screen (recovery path; stubbed signOut observed called once).
5. ✅ Unsupported platforms never see the toggle (UVPAA false → no row on either shell) and are never locked out.
6. ✅ No server, schema, or dependency changes; desktop and phone both function — including phone enrollment via the new Dashboard row.
