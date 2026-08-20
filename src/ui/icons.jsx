// The app's only SVG icons — everything else is a CSS shape swatch
// (src/lib/catIcon.js). Both take their colour from `currentColor`, so one
// component serves a muted chip, an accent header or a --neg row unchanged.
//
// The two viewBoxes differ (17.53x19.42 and 24x24). Rendering each at
// width=height=size lets the default preserveAspectRatio centre it, so the
// transfer glyph sits slightly narrower in the same box at the same optical
// height — intended, not a clipping bug.
//
// Decorative beside existing text, so aria-hidden unless given a title.

const style = { flex: 'none', display: 'inline-block', verticalAlign: '-0.15em' };

// The app's one chevron. Every disclosure and picker used to draw its own from
// a TEXT glyph (▾ ▸ ⌄ ▼), which meant four different shapes at four different
// optical weights, each rendered by whichever font happened to answer — and
// none of them matching the 1.8px drawn stroke of the icons beside them. This
// is a real path: same stroke as EyeIcon/WideIcon, coloured by currentColor,
// and it never falls back to a system glyph.
//
// `dir` rotates rather than swapping paths, so a disclosure that animates has
// something continuous to animate: 'down' is the resting/open state, 'right'
// is a collapsed tree node, 'up' is a control that closes what it opened.
const CHEV_ROT = { down: '0deg', right: '-90deg', up: '180deg', left: '90deg' };

export function Chevron({ size = 9, dir = 'down', title }) {
  return (
    <svg viewBox="0 0 9 6" width={size} height={size * (6 / 9)} fill="none"
      role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'} focusable="false"
      style={{ ...style, transform: 'rotate(' + (CHEV_ROT[dir] || '0deg') + ')' }}>
      {title && <title>{title}</title>}
      <path d="M1 1.25 4.5 4.75 8 1.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Sort state, drawn — the ↑ ↓ ↕ text glyphs it replaces were three unrelated
// arrow shapes rendered by whichever font answered, at an optical weight that
// never matched the 1.8px strokes beside them (and ↕ in particular arrived as
// an emoji-ish double arrow on some stacks). Same geometry as Chevron, so a
// sorted header reads as the same family as the disclosure chevrons above it.
//
// `dir` null/undefined = sortable but not sorted: BOTH chevrons, which is the
// only state that has to say "this column can go either way". asc/desc show
// the single chevron for the direction in force. Colour comes from the caller
// (currentColor) at FULL opacity — the old 0.4 opacity on the inactive icon
// dropped --muted to 2.4:1, below any floor, for the one state that has to be
// discoverable before hover.
export function SortIcon({ dir, size = 10 }) {
  const active = dir === 'asc' || dir === 'desc';
  return (
    <svg viewBox="0 0 10 12" width={size} height={size * 1.2} fill="none" aria-hidden="true" focusable="false" style={style}>
      {!active && <path d="M1.5 4.6 5 1.4 8.5 4.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
      {!active && <path d="M1.5 7.4 5 10.6 8.5 7.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
      {dir === 'asc' && <path d="M1.5 7.6 5 4.4 8.5 7.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
      {dir === 'desc' && <path d="M1.5 4.4 5 7.6 8.5 4.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

// The amount cells' operator-pad trigger. Was the ⌗ text glyph — a "viewdata
// square", not a calculator, and one of the characters most likely to arrive
// as a tofu box or a wildly off-weight shape. Drawn as what it opens: a
// calculator body, its display bar, and four keys (round-cap zero-length
// segments, so each key is a dot at the same 1.8-family weight).
export function CalcIcon({ size = 14, title }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none"
      role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'} focusable="false" style={style}>
      {title && <title>{title}</title>}
      <rect x="4.5" y="2.5" width="15" height="19" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 7h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9.5 12.5h.01M14.5 12.5h.01M9.5 17h.01M14.5 17h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

// The app's one tick. Lifted verbatim from the inline editor's row marker so
// the picker's "Selected" tick and that marker are the same drawn shape rather
// than a ✓ text glyph beside a real path.
export function CheckIcon({ size = 10, title }) {
  return (
    <svg viewBox="0 0 10 10" width={size} height={size} fill="none"
      role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'} focusable="false" style={style}>
      {title && <title>{title}</title>}
      <path d="M1.6 5.2 3.9 7.5 8.4 2.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Plain plus and close, for the places that were spelling them with text
// characters (+ and ×, and the full-width ＋). Same stroke family again.
export function PlusIcon({ size = 10, title }) {
  return (
    <svg viewBox="0 0 10 10" width={size} height={size} fill="none"
      role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'} focusable="false" style={style}>
      {title && <title>{title}</title>}
      <path d="M5 1.2v7.6M1.2 5h7.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon({ size = 10, title }) {
  return (
    <svg viewBox="0 0 10 10" width={size} height={size} fill="none"
      role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'} focusable="false" style={style}>
      {title && <title>{title}</title>}
      <path d="M1.6 1.6 8.4 8.4M8.4 1.6 1.6 8.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function TransferIcon({ size = 14, title }) {
  return (
    <svg viewBox="0 0 17.53 19.42" width={size} height={size} fill="currentColor" style={style}
      role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'}>
      {title && <title>{title}</title>}
      <path d="M13.64,5.94a.44.44,0,0,1,.12.32v.87a.45.45,0,0,1-.12.32.43.43,0,0,1-.31.12h-7l2.05,2.1a.41.41,0,0,1,0,.63l-.6.63a.47.47,0,0,1-.32.14.37.37,0,0,1-.29-.14L3.37,7a.43.43,0,0,1,0-.63L7.2,2.46a.36.36,0,0,1,.6,0l.58.62a.41.41,0,0,1,0,.63l-2,2.11h7A.43.43,0,0,1,13.64,5.94Z" transform="translate(-3.24 -2.29)" />
      <rect x="12.28" y="3.53" width="3.5" height="1.75" rx="0.5" ry="0.5" />
      <path d="M10.36,18.06a.44.44,0,0,1-.12-.32v-.87a.45.45,0,0,1,.12-.32.43.43,0,0,1,.31-.12h7l-2.05-2.1a.41.41,0,0,1,0-.63l.6-.63a.47.47,0,0,1,.32-.14.37.37,0,0,1,.29.14L20.63,17a.43.43,0,0,1,0,.63L16.8,21.54a.36.36,0,0,1-.6,0l-.58-.62a.41.41,0,0,1,0-.63l2-2.11h-7A.43.43,0,0,1,10.36,18.06Z" transform="translate(-3.24 -2.29)" />
      <rect x="4.99" y="16.43" width="3.5" height="1.75" rx="0.5" ry="0.5" transform="translate(10.24 32.32) rotate(180)" />
    </svg>
  );
}

// The row's three secondary meta indicators — edited, excluded-from-budgets,
// split — drawn to sit in the same chip cluster as TransferIcon/RepeatIcon.
// They were text pills ("Edited", "Excluded from budgets", "Split"); once the
// register moved to table-layout:fixed the PAYEE column stopped growing to fit
// them and the long "Excluded from budgets" pill spilled into CATEGORY. Icons
// carry the same meaning at a fraction of the width, and match the two glyphs
// already beside them. The full label rides on the wrapping chip's title /
// aria-label (see TxChips), so nothing is lost.
export function EditedIcon({ size = 14, title }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" style={style}
      role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'} focusable="false">
      {title && <title>{title}</title>}
      <path d="M14.5 5.5l4 4M4.5 19.5l1-4L15 6l3 3-9.5 9.5-4 1z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Excluded from budgets: the "not counted" prohibition mark — a ring with a
// diagonal bar. Muted, so it reads as a quiet exclusion, not an error.
export function ExcludedIcon({ size = 14, title }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" style={style}
      role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'} focusable="false">
      {title && <title>{title}</title>}
      <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6.2 6.2l11.6 11.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// One transaction split across categories: a trunk forking into two legs.
export function SplitIcon({ size = 14, title }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" style={style}
      role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'} focusable="false">
      {title && <title>{title}</title>}
      <path d="M12 4v7M12 11l-5 9M12 11l5 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RepeatIcon({ size = 14, title }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" style={style}
      role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'}>
      {title && <title>{title}</title>}
      <path fillRule="evenodd" clipRule="evenodd" d="M17.4545 18.6653H6.55131V21.4397C6.54975 21.5434 6.52038 21.6447 6.46638 21.7326C6.41238 21.8206 6.3358 21.8918 6.24491 21.9387C6.15403 21.9855 6.0523 22.0062 5.95073 21.9984C5.84915 21.9906 5.75159 21.9548 5.66859 21.8946L0.242292 18.0128C0.170159 17.9619 0.111222 17.8938 0.0705176 17.8146C0.0298136 17.7354 0.00855292 17.6473 0.00855292 17.5579C0.00855292 17.4685 0.0298136 17.3804 0.0705176 17.3012C0.111222 17.2219 0.170159 17.1539 0.242292 17.1029L5.66859 13.2212C5.75159 13.161 5.84915 13.1251 5.95073 13.1174C6.0523 13.1096 6.15403 13.1303 6.24491 13.1771C6.3358 13.224 6.41238 13.2952 6.46638 13.3831C6.52038 13.4711 6.54975 13.5724 6.55131 13.6761V16.4435H17.4545C18.6118 16.4435 19.7218 15.9754 20.5401 15.1421C21.3584 14.3087 21.8182 13.1785 21.8182 12C21.8182 11.7054 21.9331 11.4229 22.1377 11.2145C22.3423 11.0062 22.6198 10.8892 22.9091 10.8892C23.1984 10.8892 23.4759 11.0062 23.6805 11.2145C23.8851 11.4229 24 11.7054 24 12C24 12.8753 23.8307 13.742 23.5018 14.5507C23.1728 15.3594 22.6907 16.0941 22.0829 16.7131C21.4751 17.332 20.7535 17.8229 19.9594 18.1579C19.1652 18.4929 18.3141 18.6653 17.4545 18.6653ZM18.3313 10.7789C18.2483 10.839 18.1507 10.8749 18.0492 10.8826C17.9476 10.8904 17.8459 10.8698 17.755 10.8229C17.6641 10.7761 17.5875 10.7048 17.5335 10.6169C17.4795 10.5289 17.4502 10.4276 17.4486 10.3239V7.55649H6.54547C5.38816 7.55649 4.27825 8.02464 3.45991 8.85796C2.64156 9.69127 2.18182 10.8215 2.18182 12C2.18182 12.2946 2.06689 12.5772 1.8623 12.7855C1.65772 12.9938 1.38024 13.1109 1.09091 13.1109C0.801584 13.1109 0.524106 12.9938 0.319521 12.7855C0.114935 12.5772 0 12.2946 0 12C0 10.2323 0.68961 8.53692 1.91712 7.28695C3.14464 6.03698 4.8095 5.33475 6.54547 5.33475H17.4486V2.56029C17.4502 2.45658 17.4796 2.35528 17.5336 2.26734C17.5876 2.1794 17.6641 2.10815 17.755 2.06132C17.8459 2.01448 17.9476 1.99383 18.0492 2.0016C18.1508 2.00937 18.2483 2.04526 18.3313 2.10539L23.7577 5.98716C23.8298 6.03814 23.8887 6.10614 23.9295 6.18537C23.9702 6.26459 23.9914 6.35268 23.9914 6.44209C23.9914 6.53151 23.9702 6.61959 23.9295 6.69882C23.8887 6.77804 23.8298 6.84605 23.7577 6.89702L18.3313 10.7789Z" />
    </svg>
  );
}
