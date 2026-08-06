import { useStore } from '../store/StoreProvider.jsx';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { openers } from '../drawers/openers.js';

// First-use guided setup — ported from the prototype (template 233-267, firstUseVals
// script 1000-1017). Shown on /dashboard until setup completes or is skipped.
export default function FirstUse({ setup, onSkip }) {
  const { data: S } = useStore();
  const { openDrawer } = useDrawer();
  const doneCount = [setup.hasAccount, setup.snapConfirmed, setup.hasTx].filter(Boolean).length;
  const mk = (n, title, desc, done, cta, act, disabled, ctaTitle) => ({
    n: done ? '✓' : String(n), title, desc, done, cta, act, showCta: !done,
    disabled: !!disabled, ctaTitle: disabled ? ctaTitle : cta,
    nBg: done ? 'var(--accent)' : 'transparent', nFg: done ? 'var(--on-accent)' : 'var(--muted)', nBr: done ? 'var(--accent)' : 'var(--border)',
    ctaBg: disabled ? 'var(--elev)' : 'var(--accent)', ctaFg: disabled ? 'var(--muted)' : 'var(--on-accent)', ctaOpacity: disabled ? '.6' : '1',
  });
  const steps = [
    mk(1, 'Add your first bank account', 'Institution, a nickname, and today’s balance — about a minute.', setup.hasAccount, 'Add account', 'addAccount', false, ''),
    mk(2, 'Confirm your opening balance', 'Locks in your starting position so monthly change is trustworthy.', setup.snapConfirmed, 'Review & confirm', 'snapshot', !setup.hasAccount, 'Add an account first'),
    mk(3, 'Record your first transaction', 'An expense, income, or a transfer between your accounts.', setup.hasTx, 'Add transaction', 'addTx', !setup.hasAccount, 'Add an account first'),
  ];
  const stepAct = act => {
    if (act === 'addAccount') openers.addAccount(openDrawer);
    else if (act === 'snapshot') openers.snapshot(S, openDrawer);
    else if (act === 'addTx') openers.addTx(openDrawer);
  };

  return (
    <div style={{ maxWidth: 720, margin: '16px auto 0', display: 'flex', flexDirection: 'column', gap: 16, animation: 'hsFade .25s ease', padding: '0 28px 56px' }}>
      <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '26px 28px' }}>
        <h2 style={{ fontSize: 21, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>Welcome to Raqam</h2>
        <p style={{ fontSize: 14, color: 'var(--muted)', margin: '8px 0 0', maxWidth: '54ch' }}>One clear picture of your money across every Pakistani bank account — entered by you, on your terms. A few minutes of setup gets your dashboard working.</p>
        <div style={{ display: 'flex', gap: 12, marginTop: 16, padding: '12px 14px', borderRadius: 10, background: 'var(--soft)' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-h)', flex: 'none' }}>Private by design</span>
          <span style={{ fontSize: 12.5, color: 'var(--text)', opacity: .85 }}>Everything is entered manually — Raqam never connects to your bank, never asks for credentials, and never needs more than the last 4 digits of any account or card. Amounts stay hidden until you choose to show them.</span>
        </div>
      </section>
      <section aria-label="Setup" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '22px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, flex: 1 }}>Set up your finances</h2>
          <span className="tnum" style={{ fontSize: 12.5, color: 'var(--muted)' }}>{doneCount} of 3 done</span>
        </div>
        <div style={{ height: 6, background: 'var(--track)', borderRadius: 3, overflow: 'hidden', marginTop: 10 }}>
          <div style={{ width: `${Math.round(doneCount / 3 * 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
          {steps.map(s => (
            <div key={s.title} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
              <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: 999, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700, background: s.nBg, color: s.nFg, border: `1px solid ${s.nBr}` }}>{s.n}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{s.title}</span>
                <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)', marginTop: 1 }}>{s.desc}</span>
              </span>
              {s.done && <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: 'var(--pos-soft)', color: 'var(--pos)' }}>Done</span>}
              {s.showCta && (
                <button onClick={() => stepAct(s.act)} disabled={s.disabled} title={s.ctaTitle} style={{ height: 30, padding: '0 13px', border: 'none', borderRadius: 8, background: s.ctaBg, color: s.ctaFg, fontSize: 12.5, fontWeight: 600, cursor: s.disabled ? 'default' : 'pointer', flex: 'none', opacity: s.ctaOpacity }}>{s.cta}</button>
              )}
            </div>
          ))}
        </div>
        <button onClick={onSkip} className="hv-text" style={{ border: 'none', background: 'none', color: 'var(--muted)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', padding: '12px 0 0', textAlign: 'left' }}>Skip for now — go to the dashboard</button>
      </section>
      <section aria-label="Preview" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '22px 28px' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>What your dashboard will show</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginTop: 14 }}>
          <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Total bank balance</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--muted)', marginTop: 4 }}>Rs —</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>across all accounts</div>
          </div>
          <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Monthly cash flow</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--muted)', marginTop: 4 }}>Rs —</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>income − expenses</div>
          </div>
          <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Spending by category</div>
            <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 26, marginTop: 8 }}>
              {['100%', '70%', '45%', '25%'].map((hh, i) => <div key={i} style={{ flex: 1, height: hh, background: 'var(--track)', borderRadius: 2 }} />)}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
