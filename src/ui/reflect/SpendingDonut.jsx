// Reflect — YNAB-style interactive donut. ECharts (tree-shaken) draws the ring,
// leader labels and hover blur; the center readout is a React overlay because
// it must re-render with money()'s masking and the hovered slice.
import { useEffect, useRef, useState } from 'react';
import { init, use } from 'echarts/core';
import { PieChart } from 'echarts/charts';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

// LabelLayout is what keeps the outside leader labels from colliding when
// several thin slices sit next to each other; without it ECharts just stacks
// them and they overlap.
use([PieChart, LabelLayout, CanvasRenderer]);

const cssVar = name => (typeof window === 'undefined' ? '#fff'
  : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#fff');
// The canvas can't inherit CSS custom properties, so these three have to be
// resolved to concrete values and baked into the ECharts option.
const readTheme = () => ({ surface: cssVar('--surface'), text: cssVar('--text'), muted: cssVar('--muted') });

// Whole percent, except that a genuinely nonzero but tiny share must not read
// as '0%'. Exported because the category list beside the chart labels its rows
// the same way — one rule, one place.
export const pctLabel = p => (p > 0 && p < 0.005 ? '<1%' : Math.round(p * 100) + '%');

// Only slices at least this big get an outside leader label; smaller ones would
// crowd the ring and are read from the category list instead. The fold caps the
// slice COUNT, not their sizes, so in practice this trims the thin arcs near the
// tail; labelLayout.hideOverlap below is the backstop for any that still collide.
const LABEL_MIN_PCT = 0.05;

// `labels` off drops the external leader labels (and their lines): on a phone
// there is no room beside the ring for them, and ECharts silently truncates
// them to unreadable stubs ("Enter…", "Rs 7,…", "…"). The category list below
// the chart already carries every name, amount and percent.
export default function SpendingDonut({ slices = [], total = 0, money, size = 380, labels = true, onSliceClick }) {
  const boxRef = useRef(null);
  const chartRef = useRef(null);
  const [hover, setHover] = useState(null); // a slice object or null

  // Re-resolve the baked-in colors whenever the theme changes, or a light/dark
  // toggle leaves the ring bordered in the old theme's surface colour and its
  // labels in the old text colour.
  //
  // Watching <html data-theme> rather than subscribing to the theme PREF is
  // deliberate: PrefsProvider writes that attribute from its own effect, and
  // React flushes a child's effects BEFORE its parent's — so a pref-driven
  // rebuild here would run while the attribute (and therefore every var())
  // still held the previous theme, leaving the chart one toggle behind. The
  // attribute is also the thing the CSS actually keys off, so this stays
  // correct no matter what sets it.
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    const read = () => setTheme(prev => {
      const next = readTheme();
      const same = next.surface === prev.surface && next.text === prev.text && next.muted === prev.muted;
      return same ? prev : next; // same object => no re-render, no option rebuild
    });
    read(); // the attribute may have been set after our first render
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

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
    const { surface, text, muted } = theme;
    chart.setOption({
      animationDuration: 300,
      series: [{
        type: 'pie', radius: ['58%', '84%'], center: ['50%', '50%'],
        itemStyle: { borderColor: surface, borderWidth: 3, borderRadius: 3 },
        label: {
          show: labels, position: 'outside', color: text, lineHeight: 18,
          formatter: p => p.data.slice.name + '\n' + p.data.sub,
          rich: {},
        },
        labelLine: { show: labels, length: 14, length2: 10, lineStyle: { color: muted } },
        // Drop any label that would still overlap after per-slice thresholding —
        // a safety net so the ring never shows two callouts on top of each other.
        labelLayout: { hideOverlap: true },
        emphasis: { scale: true, scaleSize: 4, focus: 'self' },
        blur: { itemStyle: { opacity: 0.25 }, label: { opacity: 0.3 } },
        data: slices.map(s => {
          // Small slices skip the outside label + leader line; the category list
          // carries their name/amount/percent. The folded "Other" is labelled
          // like any slice — its combined share usually clears the threshold.
          const showLabel = labels && s.pct >= LABEL_MIN_PCT;
          return {
            value: s.amt, name: s.name, slice: s,
            sub: money(s.amt) + ' (' + pctLabel(s.pct) + ')',
            // Tail/"Other" slices have no palette hue → the theme's muted gray,
            // resolved here because the canvas can't read the CSS variable.
            itemStyle: { color: s.color || muted },
            label: { show: showLabel },
            labelLine: { show: showLabel },
          };
        }),
      }],
    }, { notMerge: true });
    const over = e => { if (e.seriesIndex === 0) setHover(e.data.slice); };
    const out = () => setHover(null);
    const click = e => {
      if (e.seriesIndex !== 0 || !onSliceClick) return;
      if (e.data.slice.other) return; // the folded aggregate has no single tx list
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
  }, [slices, money, labels, onSliceClick, theme]);

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
