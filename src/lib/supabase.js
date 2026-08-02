// Supabase client — the app's single connection to auth + database.
import { createClient } from '@supabase/supabase-js';

// import.meta.env is Vite-injected; the fallback keeps this module importable
// in plain Node (unit tests of pure logic that transitively import it).
const env = import.meta.env ?? {};
const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;

// Fail loudly and early with a actionable message rather than a cryptic
// createClient error — the app cannot function without its backend.
export const supabaseConfigured = Boolean(url && anonKey);
if (!supabaseConfigured) {
  console.error(
    'Raqam: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. ' +
    'Copy .env.example to .env.local and fill in your Supabase project keys, then restart the dev server.'
  );
}

export const supabase = supabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        // PKCE returns ?code= in the query string, which coexists with the
        // app's #/route hash routing (the implicit flow's hash fragment would collide).
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
