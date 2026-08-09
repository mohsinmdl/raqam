// Dependency-free div-bar chart for the Reflect report tabs — single-series
// or grouped columns. Reuses the Dashboard "Daily spending" div-bar idiom
// (a flex row of columns, each an inner div sized by height %).
// Pure props in, divs out — no store access, no data logic.
const identity = n => n;

export default function Bars({
  data = [],
  mode = 'single',
  height = 160,
  color = 'var(--accent)',
  formatValue = identity,
  average,
}) {
  const allValues = mode === 'grouped'
    ? data.flatMap(d => (d.groups || []).map(g => g.value))
    : data.map(d => d.value);
  const max = Math.max(...allValues, 0);
  const safeMax = max === 0 ? 1 : max;

  const summary = mode === 'grouped'
    ? `${data.length} groups, max ${formatValue(max)}`
    : `${data.length} bars, max ${formatValue(max)}`;

  return (
    <div role="img" aria-label={summary}>
      <div style={{ position: 'relative', height }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: mode === 'grouped' ? 6 : 2, height: '100%' }}>
          {data.map((d, i) => (
            <div
              key={i}
              title={mode === 'single' ? formatValue(d.value) : undefined}
              style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2, height: '100%' }}
            >
              {mode === 'grouped'
                ? (d.groups || []).map((g, gi) => (
                    <div
                      key={g.key ?? gi}
                      title={`${g.key}: ${formatValue(g.value)}`}
                      style={{
                        flex: 1,
                        height: Math.round(g.value / safeMax * 100) + '%',
                        background: g.color || color,
                        borderRadius: '3px 3px 0 0',
                        minHeight: 2,
                      }}
                    />
                  ))
                : (
                    <div
                      style={{
                        width: '100%',
                        height: Math.round(d.value / safeMax * 100) + '%',
                        background: color,
                        borderRadius: '3px 3px 0 0',
                        minHeight: 2,
                      }}
                    />
                  )}
            </div>
          ))}
        </div>
        {average != null && max > 0 && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: Math.round(average / safeMax * 100) + '%', borderTop: '1px dashed var(--muted)' }}>
            <span className="tnum" style={{ position: 'absolute', right: 0, top: -16, fontSize: 10.5, color: 'var(--muted)', background: 'var(--surface)', padding: '0 4px' }}>
              avg {formatValue(average)}
            </span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: mode === 'grouped' ? 6 : 2, marginTop: 6 }}>
        {data.map((d, i) => (
          <div key={i} className="tnum" style={{ flex: 1, textAlign: 'center', fontSize: 10, color: 'var(--muted)' }}>{d.label}</div>
        ))}
      </div>
    </div>
  );
}
