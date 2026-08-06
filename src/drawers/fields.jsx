// Shared form primitives for drawer bodies — the prototype repeats these inline
// styles dozens of times; here they live once. All fields write through the
// drawer's generic setField (the prototype's data-f pattern).
import { useDrawer } from '../ui/DrawerProvider.jsx';

export function Label({ htmlFor, children, required, optional }) {
  return (
    <label htmlFor={htmlFor} style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
      {children}
      {required && <span style={{ color: 'var(--neg)' }}> *</span>}
      {optional && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> (optional)</span>}
    </label>
  );
}

export function FieldError({ msg, style }) {
  if (!msg) return null;
  return <div style={{ fontSize: 12, color: 'var(--neg)', marginTop: 4, ...style }}>{msg}</div>;
}

export function Hint({ children, style }) {
  return <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4, ...style }}>{children}</div>;
}

// Rs-prefixed amount input (template's composite amount control).
export function AmountField({ id, field, big = true, placeholder = '0', ariaLabel, autoFocus }) {
  const { drawer, setField } = useDrawer();
  return (
    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', overflow: 'hidden' }}>
      <span style={{ padding: '0 10px', fontSize: big ? 13 : 12.5, color: 'var(--muted)', borderRight: '1px solid var(--border)', height: big ? 40 : 38, display: 'flex', alignItems: 'center', background: big ? 'var(--elev)' : undefined }}>Rs</span>
      <input
        id={id} aria-label={ariaLabel} inputMode="decimal" placeholder={placeholder} data-autofocus={autoFocus ? '' : undefined}
        value={drawer.form[field] ?? ''} onChange={e => setField(field, e.target.value)}
        className="tnum"
        style={{ flex: 1, height: big ? 40 : 38, border: 'none', padding: '0 12px', background: 'transparent', color: 'var(--text)', fontSize: big ? 15 : 14, fontWeight: 600, minWidth: 0, outlineOffset: -2 }}
      />
    </div>
  );
}

export function TextField({ id, field, placeholder, maxLength, inputMode, width, accent, ariaLabel, type = 'text' }) {
  const { drawer, setField } = useDrawer();
  return (
    <input
      id={id} aria-label={ariaLabel} type={type} placeholder={placeholder} maxLength={maxLength} inputMode={inputMode}
      value={drawer.form[field] ?? ''} onChange={e => setField(field, e.target.value)}
      className="field"
      style={{ width: width || '100%', ...(accent ? { border: '1px solid var(--accent)', marginTop: 8 } : {}) }}
    />
  );
}

export function SelectField({ id, field, disabled, ariaLabel, children }) {
  const { drawer, setField } = useDrawer();
  return (
    <select id={id} aria-label={ariaLabel} disabled={disabled} value={drawer.form[field] ?? ''} onChange={e => setField(field, e.target.value)} className="field" style={{ padding: '0 10px', opacity: disabled ? .6 : 1 }}>
      {children}
    </select>
  );
}

export function TextAreaField({ id, field, rows = 2, autoFocus }) {
  const { drawer, setField } = useDrawer();
  return (
    <textarea id={id} rows={rows} autoFocus={autoFocus} value={drawer.form[field] ?? ''} onChange={e => setField(field, e.target.value)} className="field" style={{ height: 'auto', padding: '9px 12px', resize: 'vertical' }} />
  );
}

// Pill toggle pair/group (tx type, cleared/pending, conventional/islamic).
export function Pill({ on, warn, onClick, children }) {
  const bg = on ? (warn ? 'var(--warn)' : 'var(--accent)') : 'var(--surface)';
  const fg = on ? (warn ? 'var(--on-warn)' : 'var(--on-accent)') : 'var(--muted)';
  const br = on ? (warn ? 'var(--warn)' : 'var(--accent)') : 'var(--border)';
  return (
    <button onClick={onClick} aria-pressed={String(on)} style={{ height: 30, padding: '0 12px', border: `1px solid ${br}`, borderRadius: 999, background: bg, color: fg, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
      {children}
    </button>
  );
}

export const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
export const grid3 = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 };
export const noteBox = bg => ({ padding: '10px 14px', borderRadius: 10, background: bg, fontSize: 12.5, lineHeight: 1.5 });
