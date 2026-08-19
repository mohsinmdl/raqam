// Reflect — YNAB-style interactive donut. ECharts (tree-shaken) draws the ring,
// leader labels and hover blur; the center readout is a React overlay because
// it must re-render with money()'s masking and the hovered slice.
import { useEffect, useRef, useState } from 'react';
import { init, use } from 'echarts/core';
import { PieChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';

use([PieChart, CanvasRenderer]);

const cssVar = name => (typeof window === 'undefined' ? '#fff'
  : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#fff');
const pctLabel = p => (p > 0 && p < 0.005 ? '<1%' : Math.round(p * 100) + '%');

export default function SpendingDonut({ slices = [], total = 0, money, size = 380, onSliceClick }) {
  const boxRef = useRef(null);
  const chartRef = useRef(null);
  const [hover, setHover] = useState(null); // a slice object or null

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const chart = init(el);
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => { ro.disconnect(); chart.dispose(); chartRef.current = null; };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const surface = cssVar('--surface');
    const text = cssVar('--text');
    const muted = cssVar('--muted');
    chart.setOption({
      animationDuration: 300,
      series: [{
        type: 'pie', radius: ['58%', '84%'], center: ['50%', '50%'],
        itemStyle: { borderColor: surface, borderWidth: 3, borderRadius: 3 },
        label: {
          show: true, position: 'outside', color: text, lineHeight: 18,
          formatter: p => p.data.slice.name + '\n' + p.data.sub,
          rich: {},
        },
        labelLine: { length: 14, length2: 10, lineStyle: { color: muted } },
        emphasis: { scale: true, scaleSize: 4, focus: 'self' },
        blur: { itemStyle: { opacity: 0.25 }, label: { opacity: 0.3 } },
        data: slices.map(s => ({
          value: s.amt, name: s.name, slice: s,
          sub: money(s.amt) + ' (' + pctLabel(s.pct) + ')',
          itemStyle: { color: s.color },
        })),
      }],
    }, { notMerge: true });
    const over = e => { if (e.seriesIndex === 0) setHover(e.data.slice); };
    const out = () => setHover(null);
    const click = e => {
      if (e.seriesIndex !== 0 || !onSliceClick) return;
      const me = e.event && e.event.event; // the raw browser MouseEvent
      const x = me ? me.clientX : 0, y = me ? me.clientY : 0;
      onSliceClick(e.data.slice.id, {
        getBoundingClientRect: () => ({ x, y, top: y, left: x, bottom: y, right: x, width: 0, height: 0 }),
      });
    };
    chart.on('mouseover', over); chart.on('mouseout', out); chart.on('click', click);
    return () => {
      // React runs the effects' cleanups in declaration order, so on unmount
      // (and on every StrictMode double-invoke) the init effect above has
      // ALREADY disposed this instance by the time we get here. Calling off()
      // on a disposed chart logs "[ECharts] Instance … has been disposed" —
      // three warnings per unmount. Nothing to detach in that case.
      if (chart.isDisposed()) return;
      chart.off('mouseover', over); chart.off('mouseout', out); chart.off('click', click);
    };
  }, [slices, money, onSliceClick]);

  const center = hover
    ? { top: hover.name, mid: money(hover.amt), sub: pctLabel(hover.pct) }
    : { top: 'Total Spending', mid: money(total), sub: null };

  return (
    <div style={{ position: 'relative', width: '100%', height: size }}>
      <div ref={boxRef} aria-hidden="true" style={{ position: 'absolute', inset: 0 }} />
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', textAlign: 'center',
      }}>
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>{center.top}</div>
        <div className="tnum" style={{ fontSize: 26, fontWeight: 700 }}>{center.mid}</div>
        {center.sub && <div style={{ color: 'var(--muted)', fontSize: 14 }}>{center.sub}</div>}
      </div>
    </div>
  );
}
