import { useStore } from '../store/StoreProvider.jsx';
import { useIsPhone } from '../lib/useIsPhone.js';
import Tooltip from '../ui/Tooltip.jsx';
import { SHORTCUT_BY_ID } from '../lib/shortcuts.js';

// Always-visible eye toggle for the Hide-amounts preference, in the Header on
// both shells. Standard convention: amounts visible → open eye (tap hides);
// amounts masked → slashed eye (tap shows). The H shortcut (GlobalShortcuts)
// and the UserMenu row keep toggling the same pref.
export default function MaskToggle() {
  const { prefs, setPrefs } = useStore();
  const phone = useIsPhone();
  const size = phone ? 44 : 32;
  const label = prefs.masked ? 'Show amounts' : 'Hide amounts';
  return (
    <Tooltip label={label} keys={SHORTCUT_BY_ID.hideAmounts.keys} placement="bottom" align="end">
      <button
        onClick={() => setPrefs({ masked: !prefs.masked })}
        aria-pressed={prefs.masked}
        aria-label={label}
        className="hv-soft"
        // Phone: extended-touch-target pattern — the content box stays 44×44
        // (tap target), but negative margins shrink the LAYOUT footprint to
        // 20px (the icon's visual width) so the account-scoped header — the
        // fullest row: title + month nav + edit + Reconcile — doesn't overflow
        // 393pt. Asymmetric on purpose: the right reach-back (8px) stays inside
        // the flex gap so the tap area never overlaps the next control's box;
        // the left one (16px) lands over the empty flex spacer.
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, margin: phone ? '0 -8px 0 -16px' : 0, border: 'none', borderRadius: 8, background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
          <path d="M12 9.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5" />
          {prefs.masked && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </Tooltip>
  );
}
