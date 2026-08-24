// Shared toolbar action button + its icons, used by the All-Accounts
// (Transactions) top row and the Budget (Plan) toolbar so the two stay
// identical. A ToolbarAction is icon + label, accent when enabled, muted when
// disabled, with a soft hover fill and no border. The add glyph is a filled
// accent circle with a plus; undo/redo are stroke arrows.
import Tooltip from './Tooltip.jsx';

const strokeIcon = children => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>{children}</svg>
);

export const PlusCircle = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}>
    <circle cx="12" cy="12" r="11" fill="currentColor" />
    <path d="M12 7.5v9M7.5 12h9" stroke="var(--on-accent)" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
// Speech-bubble glyph for the "Paste bank SMS" action (U2 sms-parse).
export const SmsIcon = () => strokeIcon(<><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" /></>);
// Camera glyph for the "Scan receipt" action (U3 receipt-scan).
export const CameraIcon = () => strokeIcon(<><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>);
export const UndoIcon = () => strokeIcon(<><path d="M9 14 4 9l5-5" /><path d="M4 9h9a6 6 0 0 1 0 12H7" /></>);
export const RedoIcon = () => strokeIcon(<><path d="m15 14 5-5-5-5" /><path d="M20 9h-9a6 6 0 0 0 0 12h6" /></>);

export function ToolbarAction({ icon, label, disabled, onClick, title, shortcut, ...rest }) {
  const btn = (
    <button
      onClick={onClick} disabled={disabled} title={shortcut ? undefined : (title || label)}
      className="hv-soft"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, height: 32, padding: '0 10px',
        border: 'none', borderRadius: 8, background: 'transparent',
        color: disabled ? 'var(--muted)' : 'var(--accent)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1,
      }}
      {...rest}
    >
      {icon}<span>{label}</span>
    </button>
  );
  // With a shortcut, the hover tooltip carries the label + keycaps (and replaces
  // the native title). Disabled controls skip it — nothing to prompt.
  return shortcut && !disabled ? <Tooltip shortcut={shortcut}>{btn}</Tooltip> : btn;
}
