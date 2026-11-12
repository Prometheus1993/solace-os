---
name: Solace
description: A local-first personal OS that lives in a dark neon-noir room - one navy/purple world, cyan and magenta light, a warm amber lamp.
colors:
  void: "#050506"
  base: "#131019"
  base-warm: "#31212a"
  surface-1: "#111b24"
  surface-2: "#152730"
  surface-3: "#152e3c"
  surface-input: "#08121b"
  surface-rig: "#100f16"
  surface-overlay: "#0a1728"
  text-1: "#eaf0ef"
  text-2: "#bdcdd1"
  text-3: "#acbec5"
  text-4: "#8aa0a8"
  text-on-accent: "#0a171e"
  cyan: "#8ceaf0"
  cyan-soft: "#94e5e4"
  cyan-dim: "#4a7379"
  magenta: "#ff7283"
  magenta-strong: "#e94159"
  magenta-fill: "#a82136"
  red-hot: "#ff3545"
  amber: "#efb265"
  amber-light: "#ffd9a0"
  amber-mid: "#f2c78d"
  amber-deep: "#c9955a"
  violet: "#a8a4ff"
  ok: "#7fe9c4"
  warn: "#efb265"
  danger: "#ff7283"
  border: "#41636a"
  border-strong: "#6ca8bb"
  border-rig: "#805064"
  focus-ring: "#b9fbf3"
typography:
  display:
    fontFamily: "Oxanium, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Oxanium, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Oxanium, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0em"
  numeral:
    fontFamily: "Oxanium, sans-serif"
    fontSize: "3.375rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "0em"
  body-sm:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  label:
    fontFamily: "Share Tech Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.08em"
  label-sm:
    fontFamily: "Share Tech Mono, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.14em"
  data:
    fontFamily: "Share Tech Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.02em"
rounded:
  none: "0px"
  sm: "2px"
  md: "3px"
  round: "50%"
spacing:
  1: "2px"
  2: "4px"
  3: "6px"
  4: "8px"
  5: "12px"
  6: "16px"
  7: "24px"
  8: "32px"
  9: "48px"
components:
  panel:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-1}"
    padding: "16px"
  panel-inset:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.none}"
    padding: "12px"
  button:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.text-1}"
    typography: "{typography.label}"
    height: "40px"
    padding: "0 16px"
  button-hover:
    textColor: "{colors.cyan}"
  button-active:
    textColor: "{colors.text-on-accent}"
  button-primary:
    backgroundColor: "{colors.magenta-fill}"
    textColor: "{colors.text-1}"
    typography: "{typography.label}"
    height: "40px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.magenta-strong}"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.cyan}"
    typography: "{typography.label}"
  input:
    backgroundColor: "{colors.surface-input}"
    textColor: "{colors.text-1}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    height: "40px"
    padding: "0 10px"
  tab:
    textColor: "{colors.text-2}"
    typography: "{typography.label-sm}"
    height: "36px"
    padding: "0 14px"
  tab-active:
    textColor: "{colors.cyan}"
  badge:
    textColor: "{colors.cyan}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.none}"
    padding: "3px 9px"
  stat-tile:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-1}"
    padding: "14px 16px"
  toast:
    backgroundColor: "{colors.void}"
    textColor: "{colors.text-1}"
    typography: "{typography.label}"
    padding: "10px 18px 12px"
---

# Design System: Solace

> Status: target system for issue #34 "One Solace visual style". It is derived from the DESK (the approved look). The YoRHa khaki themes and the shell/area CSS are the anti-reference being replaced; this file describes the migration away from them, not their preservation. Frontmatter values are normative; prose explains how to apply them. No code has been changed by this document.

## Overview

**Creative North Star: "The Night Room"**

Solace is one room at night. The desk is lit by a warm amber lamp, the city outside glows cyan and magenta through the window, and every screen in the app is a monitor or panel inside that room. The whole product, not only the HOME desk, should feel like looking at hardware in the same lit space: dark navy/purple ground, cool neon for information and interaction, amber reserved for warmth and attention.

The system is dark-only. There is one theme. Day and night are not a user toggle: the desk shifts its own sky and light through the day, and the rest of the app stays in the night palette. The previous light/dark switch, the khaki YoRHa themes and the "ink inversion" language (filled bars, text flipping colour on hover) are retired.

Density is Operate-mode: a personal instrument panel read at desk distance. Numbers are the stars, set in Share Tech Mono with tabular figures; titles are set in Oxanium; longer sentences are set in Inter. Surfaces are quiet and opaque so the glow of an accent means something. Pixel-art frames (9-slice) give panels and buttons their hardware character; the CSS inside stays flat.

**Key Characteristics:**
- Dark navy/purple room, never pure black except the boot "void" and toast cores.
- Cyan is the default light (data, links, focus, active). Magenta is the single loud accent (primary action, rig/danger heat). Amber is warmth (lamp, warnings, the strength stat).
- Glow, not shadow: depth is a coloured halo around active things and a hard dark drop under raised hardware.
- Pixel-art frames and icons, rendered with `image-rendering: pixelated`; chamfered corners instead of rounded ones.
- Three-font role split, no exceptions: Oxanium titles, Share Tech Mono labels/numbers/HUD/nav, Inter body.
- Desktop first. Small screens keep working with the current breakpoints (640, 760, 1100) and get no new design.

**Anti-reference (being replaced, do not carry over):** the YoRHa-era shell. Khaki `#B6B19C` ground, gold-as-ink `--gold`, the inverted ink-fill CommandBar and active tab, the left-sweep `.yorha-btn` fill, corner `.ui-bracket` marks, the light/dark toggle, JetBrains Mono, and the 1px square box on a flat panel. Some of these have desk-side overrides today (for example `.terminal-explorer` redefines `--gold`, `--panel` locally to fake the new look); the token layer removes the need for those overrides.

## Colors

A cool dark ground, a cyan primary light, a magenta strike, an amber lamp. Values below were consolidated from roughly 350 hard-coded colours across the desk CSS (`desktop.css`, `desk-panels.css`, `desk-radio.css`, `desk-sky.css`, `netrunner-rig.css`, `terminal-explorer.css`, `netrunner-home.css`, `start-screen.css`, `desk-fallback.css`). Each token is the most frequent member of a family of near-duplicates (for example `#9ad9e0`, `#9aeef3`, `#a9e5ed` all collapse into `cyan` or `cyan-soft` family text; `#eaf0ef`, `#e8e8e5`, `#e6eeee`, `#e0eeea` collapse into `text-1`).

### Surfaces (dark navy to purple)
- **Void** (`#050506`): boot/start screen ground and the toast core. Nothing else.
- **Room Base** (`#131019`): the page background and the end of the desk-fallback gradient. Deep purple-black.
- **Room Warm** (`#31212a`): the warm end of the page gradient (`radial-gradient(ellipse at 30% 70%, #31212a, #131019 70%)`). Lamp bleed; use only inside that gradient.
- **Surface 1** (`#111b24`): the panel fill. Deep navy; the default surface for any framed panel.
- **Surface 2** (`#152730`): inset tiles, stat tiles, table row hover, sub-panels.
- **Surface 3** (`#152e3c`): raised controls (button face, vitals cells, deck links).
- **Surface Input** (`#08121b`): input, select, textarea ground. Darker than the panel so a field reads as a recess.
- **Surface Rig** (`#100f16`): the purple-black workspace used inside the "rig" hardware frame (terminal workspace, instrument body). Use for large working surfaces that sit under a magenta-edged frame.
- **Surface Overlay** (`#0a1728`): modal and shard-projector ground (used with 95% alpha over a scrim).

### Text
- **Text 1** (`#eaf0ef`): primary text and numbers. 15.1:1 on Surface 1.
- **Text 2** (`#bdcdd1`): secondary text, descriptions, table labels. 10.6:1 on Surface 1.
- **Text 3** (`#acbec5`): captions, notes, units. 9.1:1 on Surface 1.
- **Text 4** (`#8aa0a8`): disabled and null/empty values only. 6.4:1 on Surface 1; this is the floor for any text token.
- **Text on Accent** (`#0a171e`): text sitting on a filled cyan/amber/magenta surface. 13.1:1 on Cyan.

### Primary (cyan light)
- **Cyan** (`#8ceaf0`): the default accent: active tab, link, focus-adjacent glow, data line, progress, primary stat. 12.6:1 on Surface 1.
- **Cyan Soft** (`#94e5e4`): the desk's text-ink cyan for monitor labels and folder icons; a calmer step than Cyan.
- **Cyan Dim** (`#4a7379`): grid lines and chart gridlines at low alpha (`#48748244` hairline = Cyan Dim at 27%).

### Secondary (magenta strike)
- **Magenta** (`#ff7283`): rig-side headings, hover heat, danger text. 6.6:1 on Surface 1.
- **Magenta Strong** (`#e94159`): active chamfer fill, hover of a primary button.
- **Magenta Fill** (`#a82136`): the primary action button face (the desk's SYNC button). White text on it is 7.2:1.
- **Red Hot** (`#ff3545`): alert core for fills, dots and borders only; text on Surface 2 and 3 falls below 4.5:1, so never set body-size text in it.

### Tertiary (warmth)
- **Amber Light** (`#ffd9a0`): lamp-lit text on dark amber (radio display, setup buttons). 13:1.
- **Amber Mid** (`#f2c78d`): selection outlines and handles (layout editor).
- **Amber** (`#efb265`): warning state, strength stat, "stale" labels. 9.3:1.
- **Amber Deep** (`#c9955a`): amber borders and captions on dark amber surfaces (`#2a1b10`).
- **Violet** (`#a8a4ff`): the shard-projector accent for the manga channel and the leanness stat. 7.8:1.

### Status
- **OK** (`#7fe9c4`): success, done, connected. NEW token: the desk has no distinct green (its ok toast is cyan `#9be8ee`); a mint is added so "ok" and "info/cyan" stop colliding.
- **Warn** (`#efb265`): same value as Amber.
- **Danger** (`#ff7283`): error text, overdue, delete confirmation. Fill for danger buttons is Magenta Fill.
- **Info**: Cyan.

### Borders
- **Border** (`#41636a`): decorative separators and panel edges that carry no information. Only 2.7:1 on Surface 1, therefore never the sole indicator of a control's boundary.
- **Border Strong** (`#6ca8bb`): input, select, textarea and any control boundary the user must perceive. 6.6:1.
- **Border Rig** (`#805064`): the magenta-tinted edge of rig/terminal working frames.
- **Hairline** (`rgba(72,116,130,0.27)`, i.e. `#48748244`): table rows, section dividers.

### Glows
- **Cyan glow**: `0 0 22px color-mix(in srgb, var(--accent) 20%, transparent)` on a card hover or active tab; text glow `text-shadow: 0 0 10px #3bf1ee40`; icon glow `filter: drop-shadow(0 0 6px #5ad3da40)`.
- **Magenta glow**: `0 0 13px currentColor` on signal dots.
- **Amber glow**: lamp spill `radial-gradient(ellipse, #ffd9a073, #ffb45c2e 40%, transparent)`.

### Stat and rank colours (replace `--stamina/--strength/--leanness`, `--t*`, `--z1..5`)
- Stats: STAMINA Cyan `#8ceaf0`, STRENGTH Amber `#efb265`, LEANNESS Violet `#a8a4ff`.
- Tiers (Novice to Mythic): `#7d939b`, `#acbec5`, `#8ceaf0`, `#a8a4ff`, `#f2c78d`, `#ff7283`. Only Mythic gets the hot colour; the ramp climbs from grey to cyan to violet to amber.
- Heart-rate zones Z1..Z5: `#7fe9c4`, `#8ceaf0`, `#f2c78d`, `#ff8a3a`, `#ff3545`. Zone is always paired with its text label (Z1..Z5), never colour alone.

### YoRHa token map (every token the shell/areas use today)

| Old token | New token | Note |
|---|---|---|
| `--pageBg` | `base` `#131019` | page ground |
| `--panel` | `surface-1` `#111b24` | panel fill |
| `--panelBorder` | `border` `#41636a` (decor) / `border-strong` for controls | split by role |
| `--subTile` | `surface-2` `#152730` | |
| `--subBorder` | `border` `#41636a` | the old hairline-ish role goes to hairline below |
| `--trackBg` | `surface-input` `#08121b` | bar track, input ground |
| `--trackBorder` | `border-strong` `#6ca8bb` for inputs, `border` for bar tracks | |
| `--hairline` | hairline `#48748244` | dividers, table rows |
| `--gold` | `cyan` `#8ceaf0` | was the "ink"; never inverts to a fill with flipped text any more |
| `--text` | `text-1` | |
| `--headingWarm` | `text-1` | |
| `--muted`, `--muted2` | `text-2` | `#bdcdd1` and `#b9cbd0` were the same colour |
| `--muted3`, `--faint`, `--faint2` | `text-3` | |
| `--nullText` | `text-4` | |
| `--onAccent` | `text-on-accent` `#0a171e` | |
| `--danger` | `danger` `#ff7283` (text), `magenta-fill` (fills) | |
| `--ok` | `ok` `#7fe9c4` | |
| `--stamina/--strength/--leanness` | cyan / amber / violet | see above |
| `--z1..5` | zone ramp above | |
| `--tNovice..--tMythic` | tier ramp above | |
| `--fxLine` (RGB triplet) | `234, 240, 239` (Text 1) | removed with the texture overlays (see Decisions) |
| `--scrim` | `#080b17a6` | desk's actual overlay |
| `--font-body` | `--font-body: Inter` | |
| `--font-mono` | `--font-mono: 'Share Tech Mono'` | JetBrains Mono removed |
| `--radius: 0` | `rounded.none` | |

### Named Rules
**The One Voice Rule.** Cyan carries interaction and data; magenta appears at most once per screen (the one primary action or the one alarm). If two magenta things share a screen, one of them is wrong.

**The Lamp Rule.** Amber is warmth and caution, never decoration. It marks a warning, the strength stat, or something lit by the desk lamp.

**The Contrast Floor Rule.** No text token is dimmer than Text 4 (6.4:1 on Surface 1). The desk's older greys below `#8aa0a8` are not carried over.

**The No Pure Black Rule.** Surfaces are tinted navy or purple. `#000` exists only as a shadow colour.

## Typography

**Titles:** Oxanium (weights 400, 600, 700)
**Labels, numbers, HUD, nav:** Share Tech Mono (weight 400 only)
**Body:** Inter (weights 300, 400, 500)
**Removed:** JetBrains Mono (delete the two `@font-face` rules and the `.woff2` files after migration). `ui-monospace`, `system-ui`, `Georgia` literals in the desk CSS are replaced by the three families above (the books-channel `Georgia` heading in the shard becomes Oxanium).

**Character:** Oxanium is a squared techno display face that carries the hardware feel. Share Tech Mono is the instrument readout. Inter takes over wherever a sentence has to be read.

Share Tech Mono ships in one weight only. Never set `font-weight: bold` on it (the rig CSS does today; the browser fakes a bold). Use size, colour or Oxanium for emphasis.

All fonts are self-hosted from `frontend/src/assets/fonts/` via `@font-face` in `netrunner-home.css` (to be moved to the token layer). Fallback stacks: Oxanium falls back to `sans-serif`, Share Tech Mono to `ui-monospace, Menlo, monospace`, Inter to `system-ui, sans-serif`.

### Type scale (px at 16px root; keep the desk's 14px base)
| Token | Size | Used for |
|---|---|---|
| `--fs-2xs` | 10px | stat tile labels, micro captions (minimum anywhere; never for essential info) |
| `--fs-xs` | 11px | sub-tab labels, table headers, chip text, nav labels |
| `--fs-sm` | 12px | data rows, footnotes, status bar |
| `--fs-md` | 14px | desk base; labels, body-sm |
| `--fs-lg` | 16px | body copy, input text (prevents zoom on small screens) |
| `--fs-xl` | 20px | readiness verb, key numeric in lists |
| `--fs-2xl` | 24px | page headline in a working panel |
| `--fs-3xl` | 32px | display, panel title in a hero panel |
| `--fs-num` | 54px | the one big value in a scanner/detail view (Oxanium 500) |

### Hierarchy
- **Display** (Oxanium 600, 32px, 1.15, -0.03em): hero panel title (desk deck panel h1).
- **Headline** (Oxanium 600, 24px, 1.2, -0.02em): a working panel's page title (terminal `h1` 23px rounds to 24).
- **Title** (Oxanium 600, 18px, 1.3): card and instrument headings (`h2`).
- **Numeral** (Oxanium 500, 54px, 1): the single hero number of a detail view.
- **Body** (Inter 400, 16px, 1.65): explanatory paragraphs and notes. Maximum line length 65ch; the desk uses 52ch for error text.
- **Body-sm** (Inter 400, 14px, 1.5): rationale lines, descriptions inside panels.
- **Label** (Share Tech Mono, 14px, 0.08em): form labels, nav, buttons, HUD lines.
- **Label-sm** (Share Tech Mono, 11px, 0.14em, uppercase): sub-tabs, chips, table headers.
- **Data** (Share Tech Mono, 12px, 0.02em, `font-variant-numeric: tabular-nums`): table cells, telemetry, timestamps. Every number in a list or table is tabular.

### Named Rules
**The Three Voices Rule.** If you cannot say which of the three roles a piece of text plays (title, readout, sentence), it does not belong on the screen.

**The Tabular Numbers Rule.** Every digit that can change (distance, pace, level, price in cents formatted as euros) is Share Tech Mono with `tabular-nums` so columns do not jitter.

## Layout

A fixed desktop composition: a sticky CommandBar (areas, totals, SYNC) over a centred content column, `max-width: 1500px`, side gutter `clamp(14px, 4vw, 30px)`. HOME (DESK) is a full-bleed scene that brings its own chrome and is not wrapped by the shell.

- **Grid:** content areas use CSS grid with 18px gaps (two-column pairs such as `430px 1fr` and `1.32fr 1fr`); lists use `repeat(auto-fit, minmax(min(150px, 100%), 1fr))` with a 12px gap.
- **Spacing scale (4px base):** 2, 4, 6, 8, 12, 16, 24, 32, 48. Existing off-scale values in the desk (10, 14, 18, 22) are rounded to the nearest step during migration except where the desk visual must not move (then they stay as literals and are logged for review).
- **Density:** Operate. Panels pad 16px (inside the 9-slice frame); rows 36 to 46px high; controls 40px; minimum touch target 44px on controls that sit in the desk's terminal.
- **Breakpoints (unchanged, no new mobile design):** 1100px (single column for dashboard pairs, terminal drops its right instrument column), 760px, 640px (BottomNav appears, run rows collapse to two lines), 480px. Keep these working as they do today. Do not add new small-screen layouts under #34.
- **Z-index layers (token `--z-*`):** `base` 0, `raised` 2, `panel` 3, `header` 7, `overlay` 8 (radio close-up), `editor` 20, `commandbar` 40, `nav` 70, `toast` 90, `start` 100. The desk's loose 1 to 10 values map to base/raised/panel/header/overlay; the area texture overlays at 59 to 61 are removed (see Decisions).

## Elevation & Depth

A hybrid. Panels are flat and opaque on the room; hardware (the terminal workspace, the instrument body, the radio) lifts off the ground with a hard dark drop; active things glow. No light-source shadows on small controls.

### Shadow and glow vocabulary
- **Drop S** (`box-shadow: 0 5px 18px #0002`): small hover lift (cards, tiles).
- **Drop M** (`box-shadow: 0 16px 35px #0007`): side navigation rail, raised hardware.
- **Drop L** (`box-shadow: 0 22px 50px #0009`): primary workspace under a frame.
- **Drop XL** (`box-shadow: 0 20px 80px #02050bc9`): modal/close-up.
- **Glow Cyan** (`0 0 22px color-mix(in srgb, var(--accent) 20%, transparent)`): hover on a selectable card; the accent var sets the colour (cyan, amber, violet).
- **Glow Signal** (`0 0 13px currentColor`): a 6px status dot.
- **Inset Edge** (`inset 0 0 0 1px var(--tone), inset 0 0 22px color-mix(in srgb, var(--tone) 18%, transparent)`): toast outline plus inner glow.

### Named Rules
**The Halo Rule.** State is shown as a halo, not as a bigger shadow. Hover glows; focus rings; active inverts nothing.

**The Opaque Work Surface Rule.** Where reading or typing happens (tables, forms, logs) the surface is opaque Surface 1 / Surface Rig. Translucency is for ambient overlays (shard projector, scrim), not for working text.

## Shapes

Pixel hardware. Corners are square (0) or chamfered; only dots, knobs and avatar frames are circular. Rounded rectangles do not occur at panel scale (`rounded.md` 3px survives only on the radio's small buttons).

- **Panel frame:** 9-slice pixel-art border (see Components > Panel). The CSS box itself has `border-radius: 0`.
- **Chamfer:** `clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))` for toasts and pop-ups (14px); `10px` for an active tab or nav chamfer.
- **Borders:** 1px for controls and rows, 2px for the accent top-edge of a stat tile or card, 3px for the top edge of a rig workspace. 
- **Image rendering:** all pixel art uses `image-rendering: pixelated` and is displayed at an integer scale (the 2x PNG at 100% CSS size).

## Components

All components state default, hover, focus-visible, active and disabled where they apply. Focus-visible is global: `outline: 2px solid var(--focus-ring)` (`#b9fbf3`, 15.1:1 on Surface 1), `outline-offset: 3px`. Never `outline: none` without a replacement ring. Hover and active tint the content, never swap the whole fill to ink.

### Panel
Character: a hardware plate. The frame is pixel art; the inside is quiet.
- **Fill:** Surface 1 at 100%, placed *under* the frame (`background-clip: padding-box`), so the frame's transparent centre shows it.
- **Frame:** CSS `border-image` from the pixel-art 9-slice (slice contract below), `border-image-repeat: round` on edges, `image-rendering: pixelated`.
- **Padding:** 16px content padding beyond the frame width; hero panels 24px.
- **Header (optional):** Label-sm text (Share Tech Mono 11px, 0.22em, uppercase, Text 1), a 1px hairline below, and a 9px diamond/square mark in the panel's accent. The accent is a per-panel `--panel-accent` (default Cyan; STAMINA, STRENGTH, LEANNESS pass their stat colour).
- **Variants:** `panel` (default, cyan frame), `panel-inset` (Surface 2, flat 1px Border, no art; used for sub-tiles nested inside a panel), `panel-rig` (magenta frame on Surface Rig for terminal-type working views).
- **States:** a panel that is itself clickable (card row): hover adds Glow Cyan and translates -2px; focus-visible shows the ring around the frame; active no translate. Static panels have no hover.
- **Slice contract (what the art provides, what the code implements):**
  - Delivered as RGBA PNG at 2x: `panel-frame.png` = 96 x 96 px (renders at 48 x 48 CSS px).
  - Corners are 24 x 24 px (2x), i.e. 12 CSS px. Edge segments are 48 px long (2x) so they tile in whole steps; the centre 48 x 48 (2x) area is fully transparent.
  - CSS: `border-style: solid; border-width: 12px; border-image: url(panel-frame.png) 24 / 12px round; padding: 16px;` Content must never overlap the frame; minimum panel size 48 x 48 CSS px.
  - Edges must be uniform along their length (no unique detail in the middle third) because `round` repeats and resizes them. Unique detail (screws, notches, a header cut) lives in the corners only.
  - Scaling: never non-uniformly scale the PNG; integer device scales only (1x, 2x, 3x). Colourways (default cyan, rig magenta, optional amber alert) are separate files with identical geometry.
  - A mocked 9-slice with CSS (a plain 1px cyan border) is the allowed placeholder until the art lands, so the migration can ship ahead of the art.

### Buttons
Character: tactile hardware keys, labelled in the readout face. Share Tech Mono 14px, uppercase, 0.14em tracking, 40px high, 16px side padding.
- **Normal / Hover / Active art:** three pixel-art frames sharing one slice geometry: `button-normal.png`, `button-hover.png`, `button-active.png`, each 96 x 80 px (2x), slice 24 px (12 CSS px) on all sides, `border-image: url(...) 24 / 12px stretch` so a button can be any width at 40px height (the 40px height equals 80 px at 2x). Hover/active swap the `border-image-source`; the label colour shifts at the same time (Text 1 to Cyan on hover, Text on Accent only if the active frame art is bright; otherwise stays Text 1).
- **Primary action** (`button-primary`, SYNC, SAVE): Magenta Fill face (`#a82136`), a 1px `#ff435b` edge, Text 1 label; hover Magenta Strong `#e94159` (desk: `#cd2943`); active inverts nothing, presses 1px down (`translate: 0 1px`). Use at most once per view (One Voice Rule).
- **Secondary:** the three-state frame art above with Text 1 label.
- **Text button** (`button-text`): no frame; Cyan label, a 1px bottom border in Cyan Dim; hover brightens to Text 1 with underline in Cyan; for inline and "all runs" style links (the StatRef pattern).
- **Danger:** frame art plus Danger text on hover; the confirm step uses the primary face.
- **Disabled:** 45% opacity, `cursor: not-allowed`, no hover swap, `aria-disabled` set (keeps it focusable for explanation tooltips). Busy: label replaced by `...` or the spinning `SYNC` glyph (`solace-spin 0.9s linear`).
- **Press feedback:** transform scale 0.96 for 70ms on active for the start-screen "jack in" key only; other buttons use the art swap.

### Inputs / Selects / Textareas
Character: a recessed readout slot.
- **Style:** Surface Input ground, 1px Border Strong (`#6ca8bb`), square corners, Inter 16px Text 1 (numeric fields: Share Tech Mono 16px tabular), 40px high (32px compact variant for dense tables such as the strength log), 10px side padding; textarea min-height 96px and vertical resize.
- **Placeholder:** Text 3 (not dimmer; `#baa8b5` equivalent on rig).
- **Hover:** border to Cyan Soft.
- **Focus-visible:** border Cyan plus the global ring (outline offset 2px for fields) and `caret-color: var(--magenta)`; no layout shift.
- **Error:** border Danger, a Label-sm message below in Danger, the field's `aria-invalid="true"` and `aria-describedby` set; never colour alone.
- **Disabled:** Text 4 on Surface Input at 60% opacity, border Border.
- **Select:** native `<select>` styled to the same box with a pixel caret; the dropdown list stays native.
- **Label:** above the field, Label-sm uppercase Text 2.

### Table
Character: a telemetry readout.
- Share Tech Mono 12px tabular; header Label-sm uppercase Text 3 with a hairline underneath; rows separated by hairlines, no zebra, no vertical rules.
- Numeric columns right-aligned; the first label column left-aligned in Text 2.
- Row padding 7px by 14px (8px by 14px for headers). Row hover tints Surface 2; clickable rows get the card-row behaviour (hover glow, focus ring on the row).
- Direction arrows (up, down, equal) are neutral Text 2: direction is a fact, not a verdict.
- Empty cell: an em dash in Text 4; unknown block: "No data" in Text 3.
- Wide tables scroll inside their panel (`overflow-x: auto`); the first column stays put.

### Tabs / Sub-tabs
Character: switch rail on the console.
- **Sub-tabs** (STATUS / RUNS / STRENGTH / VITALS; SCHOOL TERM / EXAM TERM; BOOKS / MANGA): Share Tech Mono 11px, 0.14em, uppercase, 36px high, 14px side padding. Default Text 2; hover Text 1 with a 2px Cyan Dim underline; active Cyan with a 2px Cyan underline and Glow Cyan; the active tab never fills.
- Active is exposed with `aria-selected="true"` on a `role="tab"` inside a `role="tablist"`; arrow keys move between tabs when the list is a real tablist.
- **Filter tabs** (small filters inside a panel): same look at 34px high, outlined chips (1px Border Strong), active = Cyan text + Cyan border.
- Overflow wraps to a second row (flex-wrap) rather than scrolling.

### Navigation (Shell: CommandBar + BottomNav)
Areas rename: HOME to **DESK**, COMBAT to **BODY**, MISSIONS to **STUDY**, ARCHIVES to **SHELF**. Each has a pixel-art icon. Sub-tab names are unchanged. Old hashes (`#home`, `#training`, `#school`, `#archives`, and old Dutch sub-hashes handled by `tabs/hash-view.ts`) stay valid and resolve to the new names through an alias table, alongside the existing `schoolperiode`/`examenperiode` aliases.
- **CommandBar:** sticky, 52px high, Room Base ground with a 1px hairline underneath and a very soft Cyan glow line. Left: wordmark `SOLACE` in Oxanium 700 14px with 0.18em tracking in Cyan. Centre: the 4 area buttons, each a 24px icon + Label-sm text, 8px gap, 12px side padding. Right: totals (Share Tech Mono 11px, Text 2, tabular), the stale chip (Danger outline, Label-sm) and the SYNC primary button. The theme toggle is gone.
- **Area button states:** default Text 2 + Text 2 icon; hover Text 1 + icon brightens; active Cyan icon + Cyan label + a 2px Cyan underline with glow; focus-visible ring; the icon is a single-colour mask (see Art), tinted by the state colour.
- **BottomNav** (< 640px, existing behaviour): fixed bottom, Surface 1 ground, 1px top Border, 4 equal cells at least 52px high with the icon above a Label-sm caption; the active cell takes Cyan text/icon and a 2px Cyan top bar. Respects `env(safe-area-inset-bottom)`.
- **DESK:** unchanged. It brings its own header (the folders/terminal), which already follows this system; the shell is hidden there.

### Badge / Chip / Stat
- **Chip:** Share Tech Mono 10 to 11px uppercase, 0.12em, 3px by 9px, 1px border in its colour, square. Outline = tinted text on transparent; filled (tier, level) = Text on Accent on the colour. Always paired with a text label.
- **Level badge:** filled Cyan, Share Tech Mono 15px tabular, "LV 12".
- **Zone pill:** outline in the zone colour, Share Tech Mono 13px, dashed border when the zone is a soft estimate.
- **Stat tile:** Surface 2 ground, 1px Border, 2px top edge in the tile accent; label Share Tech Mono 10 to 11px uppercase Text 3; value Share Tech Mono 28px (clamped 20 to 28px) in the tile colour, tabular; sub-line Inter 12px Text 3.
- **Progress bar:** 10px track in Surface Input with a 1px Border, fill in the stat colour with a subtle Glow, no rounded ends; value text beside it in Share Tech Mono.

### Toast
Character: an incoming transmission. One component for every area (today it is Home-only). Chamfered 14px corners via `clip-path`; Void ground; inset 1px outline plus inner glow in the tone colour; a label line in Label-sm above the message. Tones: `ok` = OK mint with label `DATA RECEIVED`; `info` = Cyan with `UPLINK ACTIVE`; `err` = Red Hot border and Danger text with `UPLINK FAULT`. Slide-in `0.22s cubic-bezier(0.16, 1, 0.3, 1)` from 14px below, auto-dismiss per existing timer, positioned bottom-centre at `--z-toast`, `role="status"` (`role="alert"` for errors), max width 620px, `white-space: pre-line`. Under reduced motion it appears without the slide. Do not use `clip-path` on a container that needs an outer glow: draw the glow with the inset shadow.

### Empty / Loading / Error states
- **Loading:** centred in the panel, Share Tech Mono 14px Text 2, a label such as `LOADING STATUS` followed by a blinking block cursor (`0.55em x 1em`, Cyan, `steps(1)` blink 1.6s). A sync in flight spins only the `SYNC` glyph. No skeleton shimmer, no full-screen spinner. The app-level busy line (2px at the top) is Cyan.
- **Empty:** a Label-sm heading in Text 2 ("NO RUNS YET"), one Inter 14px sentence in Text 3 saying what will appear and how to add it, and the one relevant action as a text button. Never a bare blank panel.
- **Error:** a Danger-edged inset panel (1px Danger border, Surface 2), Label-sm heading `UPLINK FAULT` in Danger, Inter 14px message in Text 1 (max 52ch), and a retry button. "Server offline" uses this state. The desk-fallback error screen is the full-page version of it.

### Panel Header Mark (signature element)
The 9px diamond or square before a panel title, filled with the panel's accent. It is the one recurring ornament of the old shell worth keeping; it now glows faintly (Glow Signal) and is always paired with its text title.

## Do's and Don'ts

### Do:
- **Do** read every colour from the token layer (`--color-*`, `--font-*`, `--fs-*`, `--space-*`, `--z-*`, `--dur-*`). The desk and the other areas share the same variables; there are no area-local palettes.
- **Do** keep one Magenta element per screen and make it the primary action.
- **Do** use Cyan for interaction and data; amber only for warmth and caution (The Lamp Rule).
- **Do** keep tabular figures on every changeable number and Share Tech Mono on every readout.
- **Do** keep panels opaque where reading or typing happens, with pixel-art frames at integer scale.
- **Do** pair every colour signal with text or an icon (zone number, tier name, ok/danger label).
- **Do** respect reduced motion (see Motion below) and keep the focus ring on every interactive element.
- **Do** verify that migrating the desk to the token layer produces no visual change: the desk's existing colours keep their exact values as the token defaults.

### Don't:
- **Don't** reintroduce the khaki ground, the gold-ink fill, the left-sweep hover fill, corner brackets, or an inverted bar with flipped text.
- **Don't** add a light theme or a theme toggle. One dark theme.
- **Don't** use JetBrains Mono, `font-weight: bold` on Share Tech Mono, `system-ui`/`Georgia` for headings, or italic for explanatory text.
- **Don't** put body text in Red Hot, Text 4 for anything that must be read, or use Border (`#41636a`) as the only boundary of a form control.
- **Don't** use `#000`, pure white surfaces, rounded-rectangle cards, drop shadows on small controls, or gradient text.
- **Don't** invent new accent hues or per-area palettes. The desk's cyan/magenta/amber/violet are the whole spectrum.
- **Don't** use `outline: none` without a replacement, or `!important` to win a specificity fight (the desk's remaining `!important` uses are migrated away).

## Tokens: the one layer

One stylesheet (proposed `frontend/src/styles/tokens.css`) defines every custom property on `:root`. It replaces `themes/yorha-light.css` and `themes/yorha-dark.css`; `tokens.ts` keeps its `C.x` API but re-points to the new names. Desk components read the same variables. Values come from the frontmatter above; property names follow the `--color-*` pattern, for example `--color-surface-1: #111b24`. Required groups:

- **Colour:** every entry under `colors:` above, plus `--color-hairline: #48748244`.
- **Fonts:** `--font-title: Oxanium, sans-serif; --font-mono: 'Share Tech Mono', ui-monospace, Menlo, monospace; --font-body: Inter, system-ui, sans-serif`.
- **Type scale:** `--fs-2xs 10px, --fs-xs 11px, --fs-sm 12px, --fs-md 14px, --fs-lg 16px, --fs-xl 20px, --fs-2xl 24px, --fs-3xl 32px, --fs-num 54px`; letter-spacing `--ls-tight -0.03em, --ls-label 0.08em, --ls-caps 0.14em, --ls-wide 0.22em`.
- **Spacing:** `--space-1 2px, -2 4px, -3 6px, -4 8px, -5 12px, -6 16px, -7 24px, -8 32px, -9 48px`.
- **Borders and radii:** `--bw-1 1px, --bw-2 2px, --bw-3 3px; --radius-none 0, --radius-sm 2px, --radius-md 3px, --radius-round 50%`; chamfer sizes `--chamfer-sm 10px, --chamfer-md 14px`.
- **Shadows and glows:** `--shadow-s/m/l/xl` and `--glow-cyan`, `--glow-signal` as listed under Elevation.
- **Z-index:** `--z-base 0, --z-raised 2, --z-panel 3, --z-header 7, --z-overlay 8, --z-editor 20, --z-commandbar 40, --z-nav 70, --z-toast 90, --z-start 100`.
- **Motion:** durations `--dur-press 70ms, --dur-fast 120ms, --dur-base 180ms, --dur-enter 280ms, --dur-scene 680ms` (long ambient loops such as haze 34 to 47s and flights 30 to 60s are scene authoring, not tokens); easings `--ease-out cubic-bezier(0.16, 1, 0.3, 1)` (toasts, rig connect), `--ease-scene cubic-bezier(0.2, 0.75, 0.2, 1)` (desk zoom), `--ease-standard ease-out`.
- **Focus:** `--focus-ring: 2px solid var(--color-focus-ring)`, `--focus-offset: 3px`.

### Motion and reduced motion
- State changes (hover, press, tab switch) run 70 to 180ms; entrances (panel power-on, toast, terminal folder) 180 to 400ms; scene moves 680ms. Ease out; no bounce or elastic.
- **Reduced motion:** unchanged in this version. Existing per-feature handling stays as it is; new components follow the same pattern as the desk (ambient loops stop and show their resting state). No new global rule (see Decisions).

## Accessibility

- **Text contrast:** all body and label text meets WCAG AA (4.5:1) on every surface it sits on. Measured against Surface 1 / Surface 2 / Surface 3: Text 1 15.1 / 13.3 / 12.2; Text 2 10.6 / 9.4 / 8.6; Text 3 9.1 / 8.0 / 7.3; Text 4 6.4 / 5.6 / 5.2; Cyan 12.6 / 11.1 / 10.2; Magenta 6.6 / 5.9 / 5.4; Amber 9.3 / 8.2 / 7.5; Violet 7.8 / 6.9 / 6.3; OK 11.9 / 10.5 / 9.6. Red Hot (4.8 / 4.3 / 3.9) fails on Surface 2 and 3 for text; it is allowed for fills, dots, icons and borders only. Targets: 7:1 for primary text (met), 4.5:1 minimum for everything else.
- **Non-text contrast:** control boundaries and focus indicators at least 3:1: Border Strong 6.6, focus ring 15.1. Decorative Border (2.7) is never the sole boundary of an interactive control.
- **Focus-visible:** the global 2px ring `#b9fbf3`, 3px offset, on every interactive element, including the radio knobs (amber ring `#ffd9a0` allowed there because it sits on amber art).
- **Targets:** 40px minimum control height; 44px for buttons inside the terminal and BottomNav.
- **Reduced motion:** existing per-feature handling, unchanged (see Decisions).
- **Not colour alone:** zones show Z1..Z5, tiers show names, status chips show words, progress shows numbers.
- **Semantics:** tabs use the tab pattern; toasts use `role="status"`/`"alert"`; expandable rows (stat rows) use `aria-expanded`; icons that stand alone have `aria-label`, icons next to text are `aria-hidden`.

## Mock screen: BODY -> STATUS

Source: `frontend/src/Dashboard.tsx` (route `#body/status`, old `#training/...`), CSS `dashboard.css`, `parts.css`, `ui.css`. Layout, content and logic are unchanged; only the surface, type and accents are.

**Page frame.** CommandBar on top (BODY active). Under it the sub-tab rail (STATUS active, RUNS, STRENGTH, VITALS), 14px from the bar, 36px high tabs. Then the content column `max-width: 1500px`, centred, gutter `clamp(14px, 4vw, 30px)`, top padding 6px, bottom 24px, vertical gap 18px.

**Top grid** (`grid-template-columns: 430px 1fr`, gap 18px, `align-items: start`):

1. **Left: Character Status panel** (`panel`, cyan frame, no header text; 430px wide).
   - Top row: level badge `LV 12` (filled Cyan, Share Tech Mono 15px, Text on Accent) followed by the hero tier chip (filled, tier colour). Gap 8px, margin-top 12px.
   - Hairline divider (margin 16px 0 2px).
   - Three stat rows, STAMINA / STRENGTH / LEANNESS, margin-top 14px each. A row is a full-width button (`aria-expanded`) with: left a 9px rotated-45deg diamond in the stat colour (Cyan / Amber / Violet), the stat name in Share Tech Mono 14px uppercase 0.1em Text 1, the tier chip, a caret `▸/▾` in Text 3 (10px); right the confidence chip (outline, Label-sm) and `LV n` in Share Tech Mono 15px tabular in the stat colour.
   - Under the button: the progress bar (10px track Surface Input, fill = stat colour with Glow, 0 radius).
   - Footer line (flex, space-between, wrap): when expanded, breakdown items in Share Tech Mono 12px Text 2 with the factor label in Text 3; right-aligned `to next` text Share Tech Mono 11px Text 2 (`12.5 pt -> LV 13`) or `* MAX` in Cyan.
   - Note line: Inter 12px Text 3, line-height 1.4, 5px above. (Replaces the 11px mono italic notes.)
   - States: row hover tints the label to Cyan Soft and shows the caret in Text 1; focus-visible ring around the whole row; expanded rows slide the breakdown in (180ms, none under reduced motion). Level-up: the `LV n` pulses `scale(1.4)` to `1` over 1.1s (removed under reduced motion; the confetti/fanfare lives in `FxOverlay`, untouched).

2. **Right column** (flex column, gap 18px):
   - **Today's Directive panel** (`panel`, header mark in the directive colour). Header strip inside the frame: a full-width band, Surface 2 tinted with the directive colour at 16% (`color-mix`), a 3px left edge in the directive colour; left `● DIRECTIVE` Label-sm Text 2, right the verb (`ENGAGE`, `HOLD`, `STAND DOWN`) in Oxanium 700 20px in the directive colour (OK mint / Amber / Danger). Directive colours: go_hard = OK, go_easy = Amber, rest = Danger. The verb's meaning also appears in the rationale text, not colour alone.
     - Rationale lines below: each a 6px rotated diamond (directive colour) + Inter 14px / 1.5 Text 2 sentence, 8px gap between lines, padding 14px.
     - Footer: hairline above, 10px/14px padding, a text-button row `VITALS 78% battery ->` (StatRef: label Label-sm Text 2, value Share Tech Mono 13px Text 1, arrow in Cyan). Hover: label and arrow brighten, arrow nudges 2px right. Links to `#body/body` (view VITALS).
   - **Weekly report panel** (`panel`, header `WEEKLY REPORT`, right side the date range in Share Tech Mono 11px Text 2, e.g. `10-16 Nov`). Contains the telemetry table: columns metric | Last week | Week before | arrow; metric left in Text 2, values right-aligned Share Tech Mono 12px Text 1 tabular, headers Label-sm Text 3, hairline rows; arrows `↑ ↓ =` Text 2 and neutral. Cell fallbacks: `No data` Text 3, `—` Text 4. Under 600px the horizontal cell padding drops from 14px to 8px. When `narrow` (< 1100px) this panel moves out of the right column and sits full-width below the top grid.

**Bottom grid** (`1.32fr 1fr`, gap 18px, `align-items: start`; single column when narrow):

3. **Left: Recent runs panel** (`panel`, header `RECENT RUNS`; the old title was "Combat Log - Recent Runs"). Up to 4 rows, newest first. Row (desktop): flex, gap 16px, wrap; top hairline; padding 13px 0:
   - date block 46px: day number Share Tech Mono 20px Text 1 over month Share Tech Mono 10px uppercase 0.1em Text 3;
   - distance `8.4 km` Share Tech Mono 20px Text 1 tabular;
   - zone pill (outline in the zone colour, Z1..Z5; dashed if soft);
   - run label Inter 13px Text 2 capitalised;
   - `♥ 152 bpm` (or `152->148 bpm`) Share Tech Mono 14px Text 2;
   - flags: heat pill `🔥 -4` and drift pill `⚑` as outline chips in Danger (icons replaced by pixel glyphs when the icon set exists).
   Row hover: no fill (rows are not links); the whole footer link `ALL RUNS 214 ->` is a text button to `#body/runs`. On phones (< 640px) rows collapse to two lines (date + km + zone, then label, HR, flags) as in the current mobile layout.

4. **Right column** (flex column, gap 18px):
   - **Objectives panel** (`panel`, header `OBJECTIVES`). Intro sentence Inter 13px Text 2 (no italic). Then one quest per block, margin-top 14px: header row with the quest label Share Tech Mono 14px uppercase Text 1 (+ `✓ DONE` chip in OK, outline), and right `current / target unit` in Share Tech Mono 13px (current Text 1, target Text 2); progress bar 10px; detail line Inter 12px Text 3. Bar colour: **in progress = Cyan, done = OK** (the old red-while-incomplete is retired; red means failed/overdue).
   - **Equipment tile** (`panel-inset`, flat, no frame art): eyebrow `EQUIPMENT` Label-sm Text 3, the shoe model right-aligned in Oxanium 600 16px Text 1 uppercase; a 13px bar in Amber with the km `412 km` in Share Tech Mono 16px Amber; note line Inter 12px Text 3. Empty: `No shoe data.` in Text 3.

**Whole-screen states.** Loading: panel-shaped placeholders are not used; show the centred `LOADING STATUS` cursor line. Error/offline: full-width error state with retry. Empty week data: table shows `No data` per column. Responsive: below 1100px both grids become single-column (order: Character, Directive, Weekly, Recent runs, Objectives, Equipment); no other small-screen change.

**Accents on this screen.** Cyan: panel frames, active tab, level badge, links, MAX. Stat colours: bars and `LV`. Directive colour: one band. Amber: Equipment bar and the STRENGTH stat. Magenta: none (this view has no primary action; the SYNC button in the CommandBar is the screen's one magenta element).

## Art needed

All art matches the desk's pixel-art style (same palette family, 1-pixel steps, no anti-aliasing). Format: RGBA PNG, 2x, binary alpha (every pixel fully transparent or fully opaque, no semi-transparent edge), no embedded colour profile, transparent centres. Files go in `frontend/src/assets/ui/` (public repo: original art only, no third-party IP).

1. **Panel frame, 9-slice:** `panel-frame.png`, 96 x 96 px (2x), corners 24 x 24, edge segments 48 px, transparent centre; colourways: `panel-frame.png` (cyan, default), `panel-frame-rig.png` (magenta), optional `panel-frame-alert.png` (amber). Identical geometry for all. Unique detail only in corners.
2. **Button states, 9-slice:** `button-normal.png`, `button-hover.png`, `button-active.png`, each 96 x 80 px (2x), 24 px slices, flat-colour-friendly centre (the label sits on it). Optional text-colour guidance from the artist if the active face is bright. Disabled is the normal frame at reduced opacity (no art).
3. **Four area icons:** `icon-desk.png`, `icon-body.png`, `icon-study.png`, `icon-shelf.png`, each 48 x 48 px (2x of a 24-px art grid), shown at 24 CSS px. Drawn as a single-colour white silhouette with one transparent-or-opaque pixel (no greys) so CSS can tint them with `mask-image` for default/hover/active. DESK = desk lamp or monitor, BODY = running shoe or heart pulse, STUDY = book with pencil or graduation cap, SHELF = books standing on a shelf.
4. Naming and delivery: lowercase, hyphenated, exactly as above; a single sheet of the three frames is not wanted (separate files avoid slicing mistakes).

## Migration notes

- Create the token stylesheet first and map the desk's current literals to it with no visual change; then re-point the shell and area CSS; then delete `themes/yorha-*.css`, the theme toggle (`theme.ts`, CommandBar button, `data-theme` handling), `.yorha-btn`, `.ui-bracket`, `base.css` ink rules, and `fx` overlays if decided.
- `tokens.ts` keeps `C.x` and `cssVars()`; the values become the new variable names, with the old names kept as aliases only for the duration of the migration.
- Rename the area labels in `BottomNav.tsx`/`CommandBar.tsx` (`AREAS`), add the alias map for `#home/#training/#school/#archives`, and keep `HASH_VIEW_ALIASES`.
- Remove the local `.terminal-explorer` and `.desktop-hub` variable overrides (`--gold`, `--panel`, `--text`, ...) once the shared tokens exist.

## Decisions (2026-11-12)

These override anything above that says otherwise.

- **Reduced motion:** no new global rule in this version. The existing per-feature reduced-motion handling stays exactly as it is (the desk keeps its rules; the toast and start screen keep theirs).
- **Texture overlays:** the `fx` scanline, grid and vignette overlays and `--fxLine` are removed from the areas with YoRHa. The desk keeps its own effects.
- **Magenta** is both the accent and the danger text colour; a danger message always also carries an icon or a word, never colour alone.
- **New colours** are accepted: OK mint `#7fe9c4` and the zone/tier ramps.
- **Panel titles** get calmer copy, applied in the BODY area story: "Combat Log" becomes RECENT RUNS, "Today's Directive" becomes TODAY, "Objectives" becomes GOALS, and `ENGAGE / HOLD / STAND DOWN` become `TRAIN / EASY / REST`.
- **Goal bars:** in progress = Cyan, done = OK.
- **Hash scheme:** canonical ids `desk/body/study/shelf` with the old ids as aliases; the VITALS view id becomes `vitals` (`#body/vitals`), with `#body/body` and the old ids as aliases.
- **Inputs:** 40px high by default; 32px compact variant for dense tables such as the strength log.
- **Weekly report gets more colour:** each metric row carries its group colour as a 3px left edge and a coloured metric label (running = Cyan, strength = Amber, body/wellness = Violet); "Last week" values in Text 1, "Week before" in Text 2; arrows stay neutral (up is not always better). The two value columns are sized to their content (`width: 1%; white-space: nowrap`) so numbers sit close to their label.
- **Mock approved** by the user on 2026-11-12 (BODY → STATUS), with the weekly-report change above.
