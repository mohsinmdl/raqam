// Category icon swatches — shape CSS ported from the design's iconStyle().
// Colour is never the only signal: shape varies too.
export const ICONS = ['square', 'circle', 'diamond', 'ring', 'bar', 'triangle'];
export const CATEGORY_COLORS = ['#0F766E', '#2563EB', '#B7791F', '#C2413B', '#15803D', '#64748B'];

export function iconStyle(icon, color, size = 14) {
  const base = { width: size, height: size, background: color, flex: 'none', display: 'inline-block' };
  switch (icon) {
    case 'circle': return { ...base, borderRadius: 999 };
    case 'diamond': return { ...base, transform: 'rotate(45deg) scale(.82)', borderRadius: 2 };
    case 'ring': return { ...base, borderRadius: 999, background: 'transparent', border: `${Math.max(3, size / 4)}px solid ${color}` };
    case 'bar': return { ...base, height: Math.max(5, size / 2.5), borderRadius: 2 };
    case 'triangle': return { ...base, background: color, clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' };
    default: return { ...base, borderRadius: 3 }; // square
  }
}
