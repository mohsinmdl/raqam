// The sidebar shows a friendly name where the app only stores an email.
// Order: an explicit displayName pref, else the email's local part with its
// first letter capitalised, else a neutral fallback.
export function resolveDisplayName(displayName, email) {
  const dn = (displayName || '').trim();
  if (dn) return dn;
  const local = (email || '').split('@')[0];
  if (local) return local.charAt(0).toUpperCase() + local.slice(1);
  return 'Account';
}

export function initialOf(name) {
  const c = (name || '').trim().charAt(0);
  return c ? c.toUpperCase() : '?';
}
