import { useState } from 'react';
import { useAuth } from './AuthProvider.jsx';

// Login/registration gate — rendered instead of the app when there is no session.
// Not a route: whatever #/route the user wanted survives login untouched.
const label = { display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 };

export default function AuthScreen() {
  const { configured, signIn, signUp, signInGoogle } = useAuth();
  const [mode, setMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const submit = async e => {
    e.preventDefault();
    setError(null); setNotice(null); setBusy(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await signUp(email, password);
        if (error) setError(error.message);
        else if (data.session == null) setNotice('Check your inbox — confirm your email address, then sign in.');
        // with confirmation off a session arrives and the gate lifts automatically
      } else {
        const { error } = await signIn(email, password);
        if (error) setError(error.message);
      }
    } finally { setBusy(false); }
  };

  const google = async () => {
    setError(null);
    const { error } = await signInGoogle();
    if (error) setError(error.message);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Figtree', system-ui, sans-serif", fontSize: 14, lineHeight: 1.45, padding: 20 }}>
      <div style={{ width: 380, maxWidth: '94vw' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, justifyContent: 'center' }}>
          <div aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 17 }}>₨</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em' }}>Raqam</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Personal finance · PKR</div>
          </div>
        </div>

        <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px 26px' }}>
          <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
            {mode === 'signin' ? 'Sign in' : 'Create your account'}
          </h1>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '6px 0 0' }}>
            Your data is stored in your account and protected per-user. Manual entry only — Raqam never connects to your bank.
          </p>

          {!configured && (
            <div role="alert" style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: 'var(--neg-soft)', border: '1px solid var(--neg)', fontSize: 12.5 }}>
              Supabase is not configured. Copy <code>.env.example</code> to <code>.env.local</code>, fill in the project keys, and restart the dev server.
            </div>
          )}

          {error && (
            <div role="alert" style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: 'var(--neg-soft)', border: '1px solid var(--neg)', fontSize: 12.5 }}>{error}</div>
          )}
          {notice && (
            <div role="status" style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: 'var(--soft)', fontSize: 12.5 }}>{notice}</div>
          )}

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
            <div>
              <label htmlFor="auth-email" style={label}>Email</label>
              <input id="auth-email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="field" />
            </div>
            <div>
              <label htmlFor="auth-password" style={label}>Password</label>
              <input id="auth-password" type="password" required minLength={8} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} className="field" />
              {mode === 'signup' && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>At least 8 characters.</div>}
            </div>
            <button type="submit" disabled={busy || !configured} className="hv-accent" style={{ height: 38, border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13.5, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? .6 : 1 }}>
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>or</span>
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          <button onClick={google} disabled={!configured} className="hv-elev" style={{ width: '100%', height: 38, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}>
            Continue with Google
          </button>

          <button
            onClick={() => { setMode(m => (m === 'signin' ? 'signup' : 'signin')); setError(null); setNotice(null); }}
            className="hv-text"
            style={{ border: 'none', background: 'none', color: 'var(--muted)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', padding: '14px 0 0', width: '100%', textAlign: 'center' }}
          >
            {mode === 'signin' ? 'New to Raqam? Create an account' : 'Already have an account? Sign in'}
          </button>
        </section>

        <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
          Only the last 4 digits of any account or card are ever stored. Amounts stay hidden until you choose to show them.
        </div>
      </div>
    </div>
  );
}
