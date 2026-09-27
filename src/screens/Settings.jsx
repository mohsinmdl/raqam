// Settings — the working preferences that have a home here today, above the
// roadmap note for the rest. First real control: the low-balance alert
// threshold. Accounts whose balance falls below it show a subtle "Low" hint
// (sidebar, Overview, Accounts). Stored as the user pref `lowBalanceThreshold`;
// clearing the field restores the default, 0 turns the hint off.
import { useStore } from '../store/StoreProvider.jsx';
import { LOW_BALANCE_DEFAULT, lowBalanceThreshold } from '../lib/lowBalance.js';

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '22px 24px' };

export default function Settings() {
  const { prefs, setPrefs } = useStore();
  const thr = lowBalanceThreshold(prefs);
  const isSet = prefs && Number.isFinite(prefs.lowBalanceThreshold);

  const onChange = e => {
    const raw = e.target.value.trim();
    if (raw === '') { setPrefs({ lowBalanceThreshold: undefined }); return; } // back to default
    const n = Math.max(0, Math.round(Number(raw.replace(/,/g, ''))));
    if (Number.isFinite(n)) setPrefs({ lowBalanceThreshold: n });
  };

  return (
    <div style={{ maxWidth: 640, margin: '32px auto 0', animation: 'hsFade .25s ease', padding: '0 28px 56px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section aria-label="Low-balance alert" style={card}>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>Low-balance alert</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '6px 0 16px', lineHeight: 1.6 }}>
          Accounts whose balance falls below this amount show a subtle &ldquo;Low&rdquo; hint next to their balance, so you know to top them up. Set it to 0 to turn the hint off.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13.5, fontWeight: 500 }}>Alert below</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', height: 38, background: 'var(--surface)' }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Rs</span>
            <input
              type="number" min="0" inputMode="numeric"
              value={isSet ? prefs.lowBalanceThreshold : ''}
              placeholder={String(LOW_BALANCE_DEFAULT)}
              onChange={onChange}
              aria-label="Low-balance alert threshold in rupees"
              className="tnum"
              style={{ width: 120, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', fontSize: 15, fontWeight: 600 }}
            />
          </span>
        </label>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '12px 0 0' }}>
          {thr > 0 ? `Currently alerting on balances under Rs ${thr.toLocaleString()}.` : 'The low-balance hint is off.'}
          {!isSet && ` (Default: Rs ${LOW_BALANCE_DEFAULT.toLocaleString()}.)`}
        </p>
      </section>

      <section style={card}>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: 'var(--info-soft)', color: 'var(--info)' }}>More settings — planned</span>
        <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '14px 0 0', lineHeight: 1.6 }}>
          Profile, default currency and timezone, category and institution management, data export and backup, and security (passkeys, sessions) are on the way. Balance privacy and dark mode already work from the account menu. Defaults: PKR &middot; Asia/Karachi &middot; English.
        </p>
      </section>
    </div>
  );
}
