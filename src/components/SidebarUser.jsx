// Pinned bottom identity row. Shows the resolved display name + email, and
// opens the account menu upward. Dismisses on outside-click or Escape.
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { resolveDisplayName, initialOf } from '../lib/identity.js';
import UserMenu from './UserMenu.jsx';

export default function SidebarUser() {
  const { user } = useAuth();
  const { prefs } = useStore();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const email = user?.email || '';
  const name = resolveDisplayName(prefs.displayName, email);

  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative', borderTop: '1px solid var(--border)' }}>
      {open && <UserMenu name={name} email={email} onClose={() => setOpen(false)} />}
      <button onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={String(open)} className="hv-elev"
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 14px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
        <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 9, flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 600, fontSize: 13 }}>{initialOf(name)}</span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</span>
        </span>
        <span aria-hidden="true" style={{ color: 'var(--muted)', flex: 'none' }}>▴</span>
      </button>
    </div>
  );
}
