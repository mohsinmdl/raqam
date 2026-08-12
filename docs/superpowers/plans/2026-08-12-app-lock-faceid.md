# App Lock (Face ID / biometric) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. All subagents run on the session model (Fable) — do not pass a model override.

**Goal:** An in-app biometric lock for the Raqam PWA (Face ID / Touch ID / Windows Hello via WebAuthn) that gates the app on cold launch and on resume after >60s backgrounded, per `docs/superpowers/specs/2026-08-12-app-lock-faceid-design.md`.

**Architecture:** Device-level pref (`appLock: { enabled, credId }`) in the existing localStorage prefs, a pure `appLock.js` engine wrapping WebAuthn, an enrollment toggle in the account menu, and a full-screen `LockScreen` overlay mounted in the auth `Gate`. No server, no schema, no new dependency — WebAuthn is a platform API. The lock is a **privacy gate over the live Supabase session**, not server-side re-auth.

**Tech Stack:** React 18, WebAuthn (`navigator.credentials`), Vitest, existing prefs facade (`useStore().prefs`/`setPrefs`), inline-style idiom.

## Global Constraints

- No server-side verification: the WebAuthn ceremony resolving **is** the unlock; challenges are client-generated and unverified.
- No new npm dependency; WebAuthn only. base64url helpers are local to `appLock.js`.
- `appLock` is a **device** pref (localStorage `raqam.prefs.v1`), routed like `theme`/`masked` — never synced to the server, never per-user data.
- Enrollment toggle appears ONLY when `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()` is true; unsupported platforms are never locked.
- Lock overlay `zIndex` ≥ 80 (above drawers 40, picker sheet 60, tab bar 40). Opaque `var(--bg)`. Reduced-motion-safe.
- Enrollment UI must state the privacy-not-vault-security scope in a muted sub-note.
- `pnpm test` green and `pnpm build` succeeds before every commit; commit after every task.
- Desktop and phone both function (feature offered on every platform with a platform authenticator).

---

### Task 1: Pure lock engine + WebAuthn helpers (`src/lib/appLock.js`)

**Files:**
- Create: `src/lib/appLock.js`
- Test: `src/lib/appLock.test.js`

**Interfaces:**
- Produces:
  - `shouldLock(hiddenAtMs: number|null, nowMs: number, thresholdMs = 60_000): boolean`
  - `toB64url(buf: ArrayBuffer): string`, `fromB64url(s: string): Uint8Array`
  - `probePlatformAuthenticator(): Promise<boolean>`
  - `enroll({ userId: string, email: string }): Promise<{ credId: string }>`
  - `unlock(credId: string): Promise<boolean>`

- [ ] **Step 1: Write the failing test** (`src/lib/appLock.test.js`)

```js
import { describe, expect, it } from 'vitest';
import { shouldLock, toB64url, fromB64url } from './appLock.js';

describe('shouldLock', () => {
  it('never locks when the app was never hidden', () => {
    expect(shouldLock(null, 10_000)).toBe(false);
  });
  it('does not lock within the threshold', () => {
    expect(shouldLock(1_000, 1_000 + 60_000)).toBe(false); // exactly 60s → not yet
    expect(shouldLock(1_000, 1_000 + 59_999)).toBe(false);
  });
  it('locks past the threshold', () => {
    expect(shouldLock(1_000, 1_000 + 60_001)).toBe(true);
  });
  it('honours a custom threshold', () => {
    expect(shouldLock(0, 5_001, 5_000)).toBe(true);
    expect(shouldLock(0, 4_999, 5_000)).toBe(false);
  });
});

describe('base64url round-trip', () => {
  it('encodes and decodes bytes losslessly, url-safe', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 62, 63]);
    const s = toB64url(bytes.buffer);
    expect(s).not.toMatch(/[+/=]/);            // url-safe, unpadded
    expect(Array.from(fromB64url(s))).toEqual(Array.from(bytes));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test -- appLock`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/appLock.js`**

```js
// In-app biometric app lock via WebAuthn. This is a PRIVACY GATE over the live
// session, not server-side re-auth: no challenge is verified anywhere, so the
// ceremony simply resolving (the OS confirmed the user via Face ID / Touch ID /
// Windows Hello / device passcode) IS the unlock. Spec:
// docs/superpowers/specs/2026-08-12-app-lock-faceid-design.md

// Pure: should the app relock after being backgrounded? True once it has been
// hidden for LONGER than the threshold. Exactly-threshold does not lock.
export function shouldLock(hiddenAtMs, nowMs, thresholdMs = 60_000) {
  return hiddenAtMs != null && nowMs - hiddenAtMs > thresholdMs;
}

// url-safe, unpadded base64 <-> bytes (no dependency).
export function toB64url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function fromB64url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Does this device expose a user-verifying platform authenticator (Face ID,
// Touch ID, Windows Hello)? Guarded so a missing API is just `false`.
export async function probePlatformAuthenticator() {
  try {
    if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}

function randChallenge() {
  return crypto.getRandomValues(new Uint8Array(32));
}

// Register a platform passkey. Returns its credId (base64url rawId). Rejects if
// the user cancels or the platform refuses.
export async function enroll({ userId, email }) {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: randChallenge(),
      rp: { id: location.hostname, name: 'Raqam' },
      user: { id: new TextEncoder().encode(userId), name: email, displayName: email },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60_000,
    },
  });
  if (!cred) throw new Error('enrollment cancelled');
  return { credId: toB64url(cred.rawId) };
}

// Prompt the platform authenticator. Resolves true when the OS verifies the
// user, false on cancel / timeout / any error — the caller keeps the lock up.
export async function unlock(credId) {
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randChallenge(),
        allowCredentials: [{ id: fromB64url(credId), type: 'public-key' }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    return !!assertion;
  } catch { return false; }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- appLock` → PASS. Then `pnpm test` → full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/appLock.js src/lib/appLock.test.js
git commit -m "App lock: pure shouldLock + WebAuthn enroll/unlock engine"
```

---

### Task 2: `appLock` device pref (`PrefsProvider` + `StoreProvider` facade)

**Files:**
- Modify: `src/store/PrefsProvider.jsx` (DEFAULTS)
- Modify: `src/store/StoreProvider.jsx` (setPrefs routing + prefs facade)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `useStore().prefs.appLock` = `{ enabled: boolean, credId: string|null }`; `setPrefs({ appLock })` persists it to device prefs. Tasks 3 & 4 read/write through this facade.

- [ ] **Step 1: Add the default in `PrefsProvider.jsx`**

Change the DEFAULTS line:

```jsx
const DEFAULTS = { theme: 'light', masked: true, appLock: { enabled: false, credId: null } };
```

- [ ] **Step 2: Route `appLock` as a device key in `StoreProvider.jsx` setPrefs**

In `setPrefs` (StoreProvider.jsx:164), change the key partition so `appLock` joins the device bucket:

```jsx
    Object.entries(patch).forEach(([k, v]) => {
      (k === 'theme' || k === 'masked' || k === 'appLock' ? device : user)[k] = v;
    });
```

- [ ] **Step 3: Expose `appLock` in the prefs facade**

In the `value` memo (StoreProvider.jsx:189), extend the flat facade:

```jsx
    prefs: { ...userPrefs, theme: devicePrefs.theme, masked: devicePrefs.masked, appLock: devicePrefs.appLock },
```

- [ ] **Step 4: Verify**

Run: `pnpm test` (existing prefs tests must stay green) and `pnpm build`. There is no new unit test here — the pref is exercised end-to-end in Task 5's live verification; the round-trip is guaranteed by the existing `prefsStore` tests plus the DEFAULTS change.

- [ ] **Step 5: Commit**

```bash
git add src/store/PrefsProvider.jsx src/store/StoreProvider.jsx
git commit -m "App lock: appLock device pref routed through the prefs facade"
```

---

### Task 3: Enrollment toggle in the account menu (`UserMenu.jsx`)

**Files:**
- Modify: `src/components/UserMenu.jsx`

**Interfaces:**
- Consumes: `probePlatformAuthenticator`, `enroll` from `../lib/appLock.js` (Task 1); `useStore().prefs.appLock` + `setPrefs` (Task 2); `useAuth().user`.
- Produces: user-facing enable/disable of `prefs.appLock`.

- [ ] **Step 1: Add imports and capability probe**

At the top of `UserMenu.jsx` add:

```jsx
import { useEffect, useState } from 'react';
import { probePlatformAuthenticator, enroll } from '../lib/appLock.js';
```

Inside the component (after the existing hook calls), add `user` from auth and the probe:

```jsx
  const { user } = useAuth();                 // extend the existing useAuth() destructure ({ signOut, user })
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
```

(`prefs`, `setPrefs` are already from `useStore()`; `notify` from `useUI()`; `email` is a prop.)

- [ ] **Step 2: Render the toggle row** (only when `canLock`), immediately after the "Hide amounts" row:

```jsx
      {canLock && (
        <button role="menuitem" className="hv-elev" style={{ ...row, flexWrap: 'wrap' }} aria-pressed={String(appLock.enabled)} onClick={onToggleLock}>
          <span aria-hidden="true">⚿</span> App lock <span style={rightNote}>{appLock.enabled ? 'On' : 'Off'}</span>
          <span style={{ flexBasis: '100%', paddingLeft: 26, marginTop: 2, fontSize: 11, color: 'var(--muted)' }}>
            Face ID / device biometrics to open. Privacy lock, not full security.
          </span>
        </button>
      )}
```

- [ ] **Step 3: Verify build + tests**

Run: `pnpm test` and `pnpm build` → green. (No unit test — UserMenu is verified live in Task 5; the repo has no jsdom component tests.)

- [ ] **Step 4: Commit**

```bash
git add src/components/UserMenu.jsx
git commit -m "App lock: enrollment toggle in the account menu (capability-gated)"
```

---

### Task 4: Lock overlay + Gate wiring (`LockScreen.jsx` + `App.jsx`)

**Files:**
- Create: `src/components/LockScreen.jsx`
- Modify: `src/App.jsx` (new `AppLockGate` wrapper inside `Gate`)

**Interfaces:**
- Consumes: `shouldLock`, `unlock` from `../lib/appLock.js` (Task 1); `useStore().prefs.appLock` + `setPrefs` (Task 2); `useAuth().signOut`.
- Produces: the running lock behaviour. Terminal task.

- [ ] **Step 1: Create `src/components/LockScreen.jsx`**

```jsx
// Full-screen biometric lock overlay. Opaque, above all app chrome. On mount it
// auto-attempts the biometric prompt (allowed in installed iOS PWAs); the
// Unlock button re-invokes it for platforms that need a user gesture and for
// retry after cancel. Sign out is the recovery path if the passkey was removed
// in OS settings. Spec: docs/superpowers/specs/2026-08-12-app-lock-faceid-design.md
import { useEffect, useRef, useState } from 'react';
import { unlock } from '../lib/appLock.js';

export default function LockScreen({ credId, onUnlock, onSignOut }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const tried = useRef(false);
  const attempt = async () => {
    if (busy) return;
    setBusy(true); setFailed(false);
    const ok = await unlock(credId);
    setBusy(false);
    if (ok) onUnlock(); else setFailed(true);
  };
  // Auto-attempt once on mount. iOS PWAs allow credentials.get() without a
  // prior gesture; where a gesture is required this rejects quietly and the
  // button takes over (failed state shown).
  useEffect(() => { if (!tried.current) { tried.current = true; attempt(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div role="dialog" aria-modal="true" aria-label="App locked" style={{
      position: 'fixed', inset: 0, zIndex: 80, background: 'var(--bg)', color: 'var(--text)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18,
      fontFamily: "'Figtree', system-ui, sans-serif", padding: 24, animation: 'hsFade .18s ease',
    }}>
      <div aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 20 }}>₨</div>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
      <div style={{ fontSize: 15, fontWeight: 600 }}>Raqam is locked</div>
      <div role="status" style={{ fontSize: 13, color: 'var(--muted)', minHeight: 18 }}>
        {busy ? 'Waiting for biometrics…' : failed ? 'Not verified. Try again.' : 'Unlock to continue.'}
      </div>
      <button onClick={attempt} disabled={busy} className="hv-accent" style={{ height: 44, padding: '0 22px', border: 'none', borderRadius: 10, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? .6 : 1 }}>
        Unlock
      </button>
      <button onClick={onSignOut} className="hv-elev" style={{ height: 40, padding: '0 16px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>
        Sign out
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire the gate in `App.jsx`**

Add imports near the other component imports:

```jsx
import { useState, useEffect } from 'react';   // extend existing react import if partial
import LockScreen from './components/LockScreen.jsx';
import { useStore } from './store/StoreProvider.jsx';
import { useAuth } from './auth/AuthProvider.jsx';
import { shouldLock } from './lib/appLock.js';
```

Add an `AppLockGate` component (module scope, above `Gate`):

```jsx
// Sits inside StoreProvider (needs prefs) and AuthProvider (needs signOut).
// Cold launch always locks when enabled; a resume relocks only after >60s hidden.
function AppLockGate({ children }) {
  const { prefs, setPrefs } = useStore();
  const { signOut } = useAuth();
  const enabled = !!prefs.appLock?.enabled;
  const [locked, setLocked] = useState(enabled);
  const hiddenAt = useRef(null);
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') { hiddenAt.current = Date.now(); return; }
      if (enabled && shouldLock(hiddenAt.current, Date.now())) setLocked(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [enabled]);
  // If the user disables the lock while it's showing (not reachable today, but
  // keeps state honest), drop the overlay.
  useEffect(() => { if (!enabled) setLocked(false); }, [enabled]);
  if (enabled && locked) {
    return (
      <LockScreen
        credId={prefs.appLock.credId}
        onUnlock={() => { hiddenAt.current = null; setLocked(false); }}
        onSignOut={() => { setPrefs({ appLock: { enabled: false, credId: null } }); signOut(); }}
      />
    );
  }
  return children;
}
```

Add `useRef` to the react import if missing. Then wrap `<Shell />` in `Gate`:

```jsx
            <DrawerProvider registry={drawerRegistry}>
              <AppLockGate>
                <Shell />
                <ImportLegacy />
              </AppLockGate>
            </DrawerProvider>
```

- [ ] **Step 3: Verify build + tests**

Run: `pnpm test` (857+ green) and `pnpm build` → succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/LockScreen.jsx src/App.jsx
git commit -m "App lock: full-screen LockScreen overlay wired into the auth Gate"
```

---

### Task 5: Live verification (Playwright + CDP virtual authenticator) + fixes

**Files:**
- Possibly modify: any file above (fixes); the spec doc (mark criteria verified).

- [ ] **Step 1: Delegate to a Playwright testing subagent** (repo protocol — the subagent tests AND fixes). It must:
  - Mount the app in a throwaway Vite harness outside `src/`, stubbing auth/session via a `resolveId` plugin (NOT alias), seeding a signed-in user + a couple of accounts (see prior mobile-tx verification and `verifying-ui-without-jsdom` memory).
  - Register a **CDP virtual authenticator** before interacting: `WebAuthn.enable`, then `addVirtualAuthenticator` with `{ protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true }`. (Playwright exposes CDP via `context.newCDPSession(page)`.)

- [ ] **Step 2: Walk the spec's acceptance criteria** at 393×852 and 1280×800:
  1. "App lock" toggle appears only when a platform authenticator exists (verify it is ABSENT with no virtual authenticator, PRESENT with one); enabling runs enrollment and persists `{enabled, credId}` in `localStorage['raqam.prefs.v1']`.
  2. With lock on, reload → LockScreen shows; auto/Unlock verifies (`isUserVerified: true`) → app revealed; the Supabase session (stubbed) is untouched.
  3. Set `isUserVerified: false` → Unlock keeps the lock and shows "Not verified. Try again."
  4. Relock on resume: dispatch `visibilitychange` hidden, advance a stubbed clock >60s, dispatch visible → LockScreen returns; <60s does not.
  5. Sign out from LockScreen clears `appLock` in localStorage and calls the stubbed signOut.
  6. Disabling the toggle stops locking (reload stays unlocked).

- [ ] **Step 3: Fix everything found, re-verify, delete the harness (never commit it), commit**

```bash
git add -A
git commit -m "App lock: live-verification fixes"
```

- [ ] **Step 4: Mark acceptance criteria verified in the spec and commit**

```bash
git add docs/superpowers/specs/2026-08-12-app-lock-faceid-design.md
git commit -m "Spec: mark app-lock acceptance criteria verified"
```

Note in the spec that the real Face ID sheet / passcode fallback is confirmed by the user on-device post-deploy (headless renders no OS sheet).
