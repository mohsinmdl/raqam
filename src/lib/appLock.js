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
