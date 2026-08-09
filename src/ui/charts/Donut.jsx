// Dependency-free SVG donut/ring chart for the Reflect report tabs.
// Pure props in, SVG out — no store access, no data logic.
export default function Donut({ slices = [], size = 240, thickness = 34, centerTop, centerBottom }) {
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;

  const visible = slices.filter(s => s && s.pct > 0);
  const hasData = visible.length > 0;

  // Cumulative offset so each slice's arc starts exactly where the previous
  // one ended. dasharray = "visibleLen restOfCircle" (sums to C); dashoffset
  // shifts that pattern's start backward along the path by the cumulative
  // percent seen so far, so slice i begins at cumulative_i * C.
  let cumulative = 0;
  const arcs = hasData
    ? visible.map(s => {
        const dash = s.pct * C;
        const gap = C - dash;
        const offset = C * (1 - cumulative);
        cumulative += s.pct;
        return { ...s, dash, gap, offset };
      })
    : [];

  const top = [...visible].sort((a, b) => b.pct - a.pct).slice(0, 3);
  const summary = hasData
    ? top.map(s => `${s.label} ${Math.round(s.pct * 100)}%`).join(', ')
    : 'No data';

  return (
    <div role="img" aria-label={summary} style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          {!hasData && (
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--track)" strokeWidth={thickness} />
          )}
          {arcs.map((a, i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={thickness}
              strokeDasharray={`${a.dash} ${a.gap}`}
              strokeDashoffset={a.offset}
            />
          ))}
        </g>
      </svg>
      {(centerTop || centerBottom) && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, textAlign: 'center', padding: '0 8px' }}>
          {centerTop && <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>{centerTop}</div>}
          {centerBottom && <div className="tnum" style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{centerBottom}</div>}
        </div>
      )}
    </div>
  );
}
