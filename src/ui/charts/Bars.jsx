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
  const grouped = mode === 'grouped';
  const allValues = grouped
    ? data.flatMap(d => (d.groups || []).map(g => g.value))
    : data.map(d => d.value);

  // Grouped mode (income/expense) is non-negative by construction — keep the
  // original floor-at-0 scaling untouched. Single mode can go negative (Net
  // Worth), so it scales by magnitude instead: a plain Math.max(...vals, 0)
  // floors at 0 and negative bars silently vanish.
  const max = grouped ? Math.max(...allValues, 0) : Math.max(...allValues.map(v => Math.abs(v)), 0);
  const safeMax = max === 0 ? 1 : max;

  // Zero-baseline for single mode, as a % distance from the bottom of the
  // plot. All-positive (or empty/all-zero) data — the common case: spending,
  // age-of-money, and Net Worth whenever it hasn't gone negative — keeps the
  // baseline pinned to the bottom, i.e. pixel-identical to the pre-fix
  // rendering. Only once the series actually crosses zero does the baseline
  // move to the middle, splitting the plot into a positive half above and a
  // negative half below; each bar's height is abs(value)/max of its own half,
  // so the single largest-magnitude bar (whichever sign) reaches that half's
  // outer edge, and positive/negative bars grow away from the shared zero-line
  // rather than off the same edge.
  const hasNeg = !grouped && allValues.some(v => v < 0);
  const baseline = hasNeg ? 50 : 0;

  const summary = grouped
    ? `${data.length} groups, max ${formatValue(max)}`
    : `${data.length} bars, max ${formatValue(max)}`;

  return (
    <div role="img" aria-label={summary}>
      <div style={{ position: 'relative', height }}>
        <div style={{ display: 'flex', alignItems: grouped ? 'flex-end' : 'stretch', gap: grouped ? 6 : 2, height: '100%' }}>
          {data.map((d, i) => (
            <div
              key={i}
              title={!grouped ? formatValue(d.value) : undefined}
              style={grouped
                ? { flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2, height: '100%' }
                : { flex: 1, position: 'relative', height: '100%' }}
            >
              {grouped
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
                : (() => {
                    const neg = d.value < 0;
                    const barPct = Math.round(Math.abs(d.value) / safeMax * (100 - baseline));
                    return (
                      <div
                        style={neg
                          ? { position: 'absolute', left: 0, right: 0, top: (100 - baseline) + '%', height: barPct + '%', background: color, borderRadius: '0 0 3px 3px', minHeight: 2 }
                          : { position: 'absolute', left: 0, right: 0, bottom: baseline + '%', height: barPct + '%', background: color, borderRadius: '3px 3px 0 0', minHeight: 2 }}
                      />
                    );
                  })()}
            </div>
          ))}
        </div>
        {average != null && max > 0 && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: (baseline + Math.round(average / safeMax * (100 - baseline))) + '%', borderTop: '1px dashed var(--muted)' }}>
            <span className="tnum" style={{ position: 'absolute', right: 0, top: -16, fontSize: 10.5, color: 'var(--muted)', background: 'var(--surface)', padding: '0 4px' }}>
              avg {formatValue(average)}
            </span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: grouped ? 6 : 2, marginTop: 6 }}>
        {data.map((d, i) => (
          <div key={i} className="tnum" style={{ flex: 1, textAlign: 'center', fontSize: 10, color: 'var(--muted)' }}>{d.label}</div>
        ))}
      </div>
    </div>
  );
}
