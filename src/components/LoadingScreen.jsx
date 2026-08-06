
// Minimal themed splash for the auth check and (from M2) store hydration.
// The design's original skeleton was dropped when persistence was synchronous;
// this is its smallest reintroduction.
export default function LoadingScreen({ message = 'Loading…', error = null, onRetry = null }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontSize: 14 }}>
      <div style={{ textAlign: 'center', maxWidth: 420, padding: 20 }}>
        <div aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 17, margin: '0 auto 14px', animation: error ? 'none' : 'hsPulse 1.4s ease infinite' }}>₨</div>
        {error ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Couldn't load your data</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>{error}</div>
            {onRetry && (
              <button onClick={onRetry} style={{ marginTop: 16, height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Try again
              </button>
            )}
          </>
        ) : (
          <div role="status" style={{ fontSize: 13, color: 'var(--muted)' }}>{message}</div>
        )}
      </div>
    </div>
  );
}
