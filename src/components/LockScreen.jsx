// Full-screen biometric lock overlay. Opaque, above all app chrome. On mount it
// auto-attempts the biometric prompt (allowed in installed iOS PWAs); the
// Unlock button re-invokes it for platforms that need a user gesture and for
// retry after cancel. Sign out is the recovery path if the passkey was removed
// in OS settings. Spec: docs/superpowers/specs/2026-08-12-app-lock-faceid-design.md
import { useEffect, useRef, useState } from 'react';
import { unlock } from '../lib/appLock.js';

export default function LockScreen({ credId, onUnlock, onSignOut, signingOut = false }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const tried = useRef(false);
  // Both buttons freeze while a biometric attempt is in flight or a sign-out
  // is underway, so a second tap can't race the in-flight operation.
  const frozen = busy || signingOut;
  const attempt = async () => {
    if (frozen) return;
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
        {signingOut ? 'Signing out…' : busy ? 'Waiting for biometrics…' : failed ? 'Not verified. Try again.' : 'Unlock to continue.'}
      </div>
      <button onClick={attempt} disabled={frozen} className="hv-accent" style={{ height: 44, padding: '0 22px', border: 'none', borderRadius: 10, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 600, cursor: frozen ? 'default' : 'pointer', opacity: frozen ? .6 : 1 }}>
        Unlock
      </button>
      <button onClick={onSignOut} disabled={frozen} className="hv-elev" style={{ height: 40, padding: '0 16px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, cursor: frozen ? 'default' : 'pointer', opacity: frozen ? .6 : 1 }}>
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
}
