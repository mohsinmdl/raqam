---
name: Raqam
description: Manual-entry personal-finance app — a calm, flat, hairline-precise ledger with a single teal voice
colors:
  accent: "#0F766E"
  accent-hover: "#115E59"
  on-accent: "#FFFFFF"
  soft: "#DDF3EC"
  paper: "#F7F7F3"
  surface: "#FFFFFF"
  raised: "#FCFCFA"
  ink: "#14201B"
  muted: "#66736C"
  hairline: "#DCE4DF"
  track: "#ECEFEA"
  pos: "#15803D"
  warn: "#B7791F"
  neg: "#C2413B"
  info: "#2563EB"
  pos-soft: "#E3F2E7"
  warn-soft: "#F6ECD9"
  neg-soft: "#F8E4E2"
  info-soft: "#E3EBFC"
typography:
  display:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "31px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.005em"
  title:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "normal"
  label:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
rounded:
  field: "4px"
  button: "8px"
  card: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.button}"
    padding: "0 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.accent}"
    rounded: "{rounded.button}"
    padding: "0 12px"
    height: "32px"
  button-link:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "16px 20px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    height: "40px"
    padding: "0 12px"
  nav-item-active:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "0 12px"
    height: "40px"
---

# Design System: Raqam

## Overview

**Creative North Star: "The Trusted Ledger"**

Raqam is a manual-entry personal-finance app: every figure on screen was typed in by the person reading it, and the whole product's promise is that those figures can be trusted. The visual system exists to earn that trust through calm and precision, not persuasion. Numbers lead; the interface recedes behind them. The dominant gesture is a warm-paper page carrying flat white cards separated by hairline borders, with a single deep-teal accent used sparingly for the things you can act on.

The mood is **calm and precise**. There is generous breathing room, a strict typographic hierarchy, and almost no ornament — the composure of a well-kept ledger where nothing is decorative and everything reconciles. All monetary figures are set in tabular (monospaced-digit) numerals so columns align to the pixel and the eye can compare them at a glance; this tabular discipline is the single most recognizable trait of the system.

Depth is built without shadows. Three paper tones (`paper` → `surface` → `raised`) plus 1px hairline borders do all the layering work; the one soft shadow in the system is reserved for transient overlays (drawers, dialogs) that float above the page. The palette is quiet by design — teal is the only chromatic voice in the primary UI, and the status hues (green, amber, red, blue) appear only where money or state genuinely demands a signal.

**Key Characteristics:**
- Warm off-white ground; flat white cards; 1px hairline separation, never shadow.
- One teal accent, used only on interactive and actionable elements.
- Tabular numerals for every monetary figure — alignment is non-negotiable.
- Small, consistent radii; refined and restrained controls.
- Status color earns its place; it is a signal, not decoration.

## Colors

A quiet, green-leaning neutral field with one deep-teal accent and a reserved set of status hues. Every color has a matching dark-theme value (`[data-theme="dark"]`); the roles below are stated in light values, and the dark palette preserves the same role for each token.

### Primary
- **Deep Teal** (`#0F766E`): the single accent. Interactive and actionable elements only — primary buttons, links, active nav, chart fills, the active-account dot, focus rings. Never a background wash.
- **Teal Deep** (`#115E59`): the pressed/hover state of the accent; also the resting active-nav text weight.
- **Soft Teal** (`#DDF3EC`): the accent's tonal wash — active nav-item background, callout/reminder banners, subtle selected states. Carries teal meaning without teal saturation.

### Neutral
- **Warm Paper** (`#F7F7F3`): the app ground behind all cards. Warm, low-glare, never pure gray.
- **Card White** (`#FFFFFF`): the surface of every card, drawer, and panel.
- **Raised Paper** (`#FCFCFA`): the one-step-up tone for hover on list rows and nav items — a tonal lift, not a shadow.
- **Ink** (`#14201B`): primary text; a near-black with a faint green cast so it belongs to the paper.
- **Slate Sage** (`#66736C`): secondary text, labels, captions, muted metadata.
- **Hairline** (`#DCE4DF`): every border and divider. The structural workhorse of the flat system.
- **Track** (`#ECEFEA`): the unfilled portion of bars, meters, and toggles.

### Tertiary (status)
- **Ledger Green** (`#15803D`, soft `#E3F2E7`): positive change, savings, cleared, income-positive.
- **Amber** (`#B7791F`, soft `#F6ECD9`): warnings, due-soon, uncleared-pending notes.
- **Rust Red** (`#C2413B`, soft `#F8E4E2`): negative change, overdue, overspent.
- **Signal Blue** (`#2563EB`, soft `#E3EBFC`): informational, non-severity emphasis.

### Named Rules
**The One Teal Rule.** Teal is the only chromatic voice in the primary UI, and it appears only on things the user can act on. If an element is not interactive or actionable, it is neutral. Rarity is what makes the accent legible.

**The Signal-Only Rule.** Status hues (green/amber/red/blue) are signals about money or state, never styling. A red that isn't reporting a negative, or a green that isn't reporting a positive, is a bug.

## Typography

**Display / Body / Label Font:** Figtree (with `system-ui, sans-serif` fallback), loaded 400/500/600/700 via Google Fonts.

**Character:** A single humanist sans across the whole product — friendly enough to feel human, geometric enough to keep long tables of figures orderly. Personality comes from weight and size steps, never from a second face. Body weight is 500 (not 400), giving the interface a quietly substantial, confident texture.

### Hierarchy
- **Display** (700, 31px, line-height 1.1, tracking −0.02em): the single headline balance (e.g. Total bank balance). One per screen.
- **Headline** (600, 19px, tracking −0.005em): card figures and secondary stats (summary cards, position figures).
- **Title** (600, 15px): section headings (`h2` on cards).
- **Body** (500, 13.5–14px, line-height 1.45): row content, values, running text.
- **Label** (500, 11.5–12px, color Slate Sage): captions, sub-labels, metadata, table headers.

### Named Rules
**The Tabular Money Rule.** Every monetary figure uses tabular numerals (`font-variant-numeric: tabular-nums`, the `.tnum` class). Amounts must align vertically wherever they stack, and must not reflow horizontally as digits change. This applies to balances, table amounts, chart totals, and inline figures alike.

**The Weight-Not-Face Rule.** Emphasis is created with weight (500 → 600 → 700) and size, never with a second font, italics, or color. Teal is reserved for interactivity, not for emphasizing text.

## Layout

A fixed two-column app shell: a resizable left sidebar (208–460px, user-draggable, remembered per device) and a scrolling main column with a sticky header. Content is centered in a `max-width: 1180px` column with `24–28px` horizontal padding.

The system is **desktop-first** — it is a sit-down tool, not a phone-first app; there is no mobile sidebar collapse. Responsive behavior is expressed with **container queries** keyed to real content width (so it reacts to the sidebar being dragged wider), not viewport media queries. Established breakpoints: the dashboard body stacks its two columns at ≤820px of content width, and the Plan grid drops its inspector at ≤1100px.

Rhythm: cards separated by `16px`; content groups inside a card by `10–14px`; tight label/value pairs by `2–6px`. The governing instinct is **tight within a group, generous between groups**. Spacing scale: `4 / 8 / 12 / 16 / 24`.

## Elevation & Depth

**Fully flat.** No in-page surface ever casts a shadow. Depth is constructed entirely from the three paper tones (`paper` behind, `surface` for cards, `raised` for hover) and 1px `hairline` borders. Hover on a row or nav item shifts its background one tone up — it never lifts.

The system contains exactly one shadow token, and it belongs to **transient overlays only**.

### Shadow Vocabulary
- **Overlay** (`box-shadow: 0 12px 32px rgba(10,20,16,.18)`; dark: `0 12px 32px rgba(0,0,0,.5)`): the drawer and dialog lift above the page, paired with a scrim. Used nowhere else.

### Named Rules
**The Flat Ledger Rule.** If it lives in the page, it is flat — bordered and tonally layered, never shadowed. The only shadow in Raqam floats a drawer or dialog over the app. A resting shadow on a card is a defect.

## Shapes

A calm, squared form language with small, consistent radii — nothing pill-shaped except genuine pills. Corners: **fields 4px**, **buttons 8px**, **cards/drawers 12px**, **status pills and dots 999px**. Borders are always 1px `hairline`; a colored or thick side-border is not part of the language (severity is carried by soft background fills and the status text color, not by an accent bar). Chart bars use a 3px top radius; category/account markers are 8px rounded squares or dots. Everything reads as orderly rectangles on paper.

## Components

### Buttons
- **Shape:** 8px radius (`rounded.button`); small secondary/row buttons use 7px.
- **Primary:** Deep Teal background, white (`on-accent`) text, no border, weight 600, height 32–36px, `0 14–16px` padding. Hover → Teal Deep (`.hv-accent`).
- **Secondary / Ghost:** `surface` background, 1px `hairline` border, teal text label, height 24–32px. Hover → Soft Teal background (`.hv-soft`).
- **Link:** no background, teal text, weight 600; hover → Teal Deep (`.hv-accent-fg`). Used for "View all ›" and inline actions.
- **Focus:** 2px teal outline at `outline-offset: 2px` on all controls.

### Cards / Containers
- **Corner:** 12px.
- **Background:** `surface` (white), on the `paper` ground.
- **Border:** 1px `hairline` on all sides.
- **Shadow:** none (see Elevation).
- **Padding:** `14–24px`, denser for list cards, roomier for the headline position card.

### Inputs / Fields
- **Style:** `surface` background, 1px `hairline` border, 4px radius, 40px height, 13.5px text.
- **Focus:** the border's own edge recolors to teal via a 1px inset outline (`outline-offset: -1px`) — no external halo, no thickness jump.

### Navigation (Sidebar)
- **Style:** stacked items, 40px tall, 8px radius, 11px gap between icon and label; drawn 1.8px-stroke line icons that inherit the item's color.
- **States:** rest → muted text, transparent background; hover → `raised` background (`.hv-elev`); active → Soft Teal background, Ink text at weight 600, teal icon.

### Lists & Rows (signature)
- Dense rows separated by 1px `hairline` dividers, with a label/sub-label stack on the left and a right-aligned tabular figure. **The last row in a list carries no divider** — the card's own edge closes the group.

### Bars & Meters (signature)
- A `track`-colored rail with a teal (or category-colored) fill; small radius; the "today"/peak bar deepens to Teal Deep. Charts are flat CSS bars, not illustrated graphics.

## Do's and Don'ts

### Do:
- **Do** set every monetary figure in tabular numerals (`.tnum`); keep stacked amounts aligned.
- **Do** build depth from the three paper tones and 1px hairlines; keep in-page surfaces flat.
- **Do** reserve teal for interactive and actionable elements, and keep it rare.
- **Do** carry callout/severity meaning with a soft background fill plus status text color.
- **Do** use container queries against content width for responsive changes (stack the dashboard body at ≤820px, the Plan grid at ≤1100px).
- **Do** create emphasis with weight and size steps in Figtree.

### Don't:
- **Don't** put a resting shadow on any card, row, or in-page surface — shadow is for drawers/dialogs only.
- **Don't** add a colored or thick side-border (accent bar) to cards, banners, or callouts.
- **Don't** introduce a second typeface, italics, or gradient text for emphasis.
- **Don't** use status color decoratively — a hue must report real money or state.
- **Don't** let the primary column exceed `1180px`, and don't leave a list's final row with a trailing divider.
- **Don't** assume viewport media queries; the resizable sidebar means content width ≠ viewport width.
