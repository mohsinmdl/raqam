import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, supabaseConfigured } from '../lib/supabase.js';

// Session state + auth methods. Mounted above StoreProvider; the app renders
// only when a session exists (online-only, login required — no guest mode).
const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  // StoreProvider registers its sync-queue drain here so sign-out never races
  // an in-flight push (registered in M2; harmless null until then).
  const beforeSignOut = useRef(null);

  useEffect(() => {
    if (!supabaseConfigured) { setLoading(false); return; }
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) { setSession(data.session); setLoading(false); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!cancelled) { setSession(s); setLoading(false); }
    });
    // Clean residual OAuth params (?code= / ?error=) left after the PKCE exchange
    // so refreshes don't retry a used code. The #/route hash is preserved.
    const url = new URL(window.location.href);
    if (url.searchParams.has('code') || url.searchParams.has('error')) {
      url.searchParams.delete('code');
      url.searchParams.delete('error');
      url.searchParams.delete('error_description');
      window.history.replaceState(null, '', url.pathname + (url.search || '') + url.hash);
    }
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    authLoading: loading,
    configured: supabaseConfigured,
    signUp: (email, password) => supabase.auth.signUp({ email, password }),
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signInGoogle: () => supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    }),
    signOut: async () => {
      try { await beforeSignOut.current?.(); } catch (e) { console.error('drain before sign-out failed', e); }
      await supabase.auth.signOut();
    },
    registerBeforeSignOut: fn => { beforeSignOut.current = fn; },
  }), [session, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
