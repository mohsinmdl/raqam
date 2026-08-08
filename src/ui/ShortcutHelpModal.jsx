import { useEffect } from 'react';
import FocusTrap from './FocusTrap.jsx';
import Kbd from './Kbd.jsx';
import { SHORTCUT_GROUPS } from '../lib/shortcuts.js';

export default function ShortcutHelpModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'hsFade .15s ease', zIndex: 60 }}>
      <FocusTrap>
        <div role="dialog" aria-modal="true" aria-label="Keyboard Shortcuts" onClick={e => e.stopPropagation()} style={{ width: 720, maxWidth: '94vw', maxHeight: '84vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)', padding: '22px 26px', animation: 'hsUp .18s ease', color: 'var(--text)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Keyboard Shortcuts</div>
            <button onClick={onClose} aria-label="Close" className="hv-soft" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
          </div>
          {SHORTCUT_GROUPS.map(g => (
            <div key={g.title} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{g.title}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '8px 24px' }}>
                {g.items.map(i => (
                  <div key={i.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--border)', padding: '6px 0' }}>
                    <span style={{ fontSize: 13, color: 'var(--text)' }}>{i.label}</span>
                    <span style={{ display: 'inline-flex', gap: 4, flex: 'none' }}>{i.keys.map((k, n) => <Kbd key={n}>{k}</Kbd>)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </FocusTrap>
    </div>
  );
}
