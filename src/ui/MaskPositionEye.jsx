import { useStore } from '../store/StoreProvider.jsx';

// The "big number" privacy eye — flips `maskedPosition` (NOT the global
// `masked`), so it masks only the hero figures (Dashboard "Current position",
// the Transactions position strip, and the Plan "Ready to Assign"). Every
// instance drives the one `maskedPosition` pref, so they all stay in lockstep;
// the profile "Hide amounts" (`masked`) toggle is independent and untouched.
//
// stopPropagation is defensive: today the eye renders as a SIBLING of the
// clickable surfaces beside it (the phone RTA banner, the desktop breakdown
// trigger), so nothing bubbles to their handlers — but it guards a future
// placement inside a clickable parent from also firing that parent's click.
// `label` names the figures it protects — "balances" by default; the Plan RTA
// passes "Ready to Assign".
export default function MaskPositionEye({ label = 'balances', size = 24, iconSize = 15 }) {
  const { prefs, setPrefs } = useStore();
  const on = prefs.maskedPosition;
  const text = (on ? 'Show ' : 'Hide ') + label;
  return (
    <button
      onClick={e => { e.stopPropagation(); setPrefs({ maskedPosition: !on }); }}
      className="hv-soft" aria-label={text} title={text}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, border: 'none', borderRadius: 6, background: 'transparent', color: 'var(--muted)', cursor: 'pointer', flex: 'none' }}
    >
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {on
          ? <><path d="M17.94 17.94A10.4 10.4 0 0 1 12 19.5C5.5 19.5 2 12 2 12a19.8 19.8 0 0 1 4.87-5.62M9.9 4.75A9.9 9.9 0 0 1 12 4.5c6.5 0 10 7.5 10 7.5a19.9 19.9 0 0 1-2.24 3.31M14.12 14.12a3 3 0 1 1-4.24-4.24" /><path d="M2 2l20 20" /></>
          : <><path d="M2 12s3.5-7.5 10-7.5S22 12 22 12s-3.5 7.5-10 7.5S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>}
      </svg>
    </button>
  );
}
