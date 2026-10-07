---
name: MONO™ 방출선 셀렉티브 (Emission Line Rail)
description: A premium fashion selective documented as a spectrographic measuring instrument — charcoal continuum, bone legends, seven wavelength hairlines, state as line form.
colors:
  continuum-0: "#0E0D0B"
  continuum-1: "#12110E"
  continuum-2: "#161513"
  continuum-3: "#1C1A17"
  bone: "#D8D3C7"
  bone-2: "#A39C8F"
  bone-3: "#8D8679"
  hairline: "rgba(216,211,199,.22)"
  hairline-strong: "rgba(216,211,199,.45)"
  nm-405-violet: "#7B6BC4"
  nm-436-blue: "#5B7BD6"
  nm-486-cyan: "#4D9BD1"
  nm-546-green: "#57B374"
  nm-589-sodium: "#E5B84B"
  nm-615-ember: "#DE7548"
  nm-656-red: "#D6574B"
  scrim: "rgba(14,13,11,.78)"
  instrument-thumb: "#3B382F"
typography:
  display:
    fontFamily: "Archivo, 'Pretendard Variable', sans-serif"
    fontSize: "clamp(3.4rem, 7.2vw, 6rem)"
    fontWeight: 620
    lineHeight: 0.94
    letterSpacing: "0.015em"
    fontVariation: "'wdth' 72"
  headline:
    fontFamily: "Archivo, 'Pretendard Variable', sans-serif"
    fontSize: "clamp(1.9rem, 3.4vw, 3rem)"
    fontWeight: 580
    lineHeight: 1
    letterSpacing: "0.02em"
    fontVariation: "'wdth' 76"
  title:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Malgun Gothic', sans-serif"
    fontSize: "15px"
    fontWeight: 550
    lineHeight: 1.75
    letterSpacing: "0.04em"
  body:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Malgun Gothic', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.75
    letterSpacing: "0.01em"
    fontFeature: "tnum"
  label:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Malgun Gothic', sans-serif"
    fontSize: "15px"
    fontWeight: 450
    lineHeight: 1.75
    letterSpacing: "0.14em"
rounded:
  none: "0px"
spacing:
  gutter: "clamp(20px, 3vw, 44px)"
  rail-x: "clamp(72px, 13vw, 200px)"
  grid-gap: "clamp(18px, 2.4vw, 34px)"
  section-y: "clamp(84px, 11vh, 140px)"
  section-x: "clamp(24px, 4vw, 56px)"
  mat-pad: "8px"
  mat-pad-lg: "10px"
components:
  tick-button:
    backgroundColor: "transparent"
    textColor: "{colors.bone}"
    typography: "{typography.label}"
    padding: "12px 2px"
  tick-button-fill:
    backgroundColor: "transparent"
    textColor: "{colors.bone}"
    typography: "{typography.label}"
    padding: "12px 22px"
  tick-button-fill-hover:
    backgroundColor: "{colors.bone}"
    textColor: "{colors.continuum-0}"
  look-card:
    backgroundColor: "{colors.continuum-2}"
    textColor: "{colors.bone}"
    padding: "{spacing.mat-pad}"
  look-card-hover:
    backgroundColor: "{colors.continuum-3}"
  nav-link:
    textColor: "{colors.bone-2}"
    typography: "{typography.label}"
  nav-link-active:
    textColor: "{colors.bone}"
  size-chip:
    backgroundColor: "transparent"
    textColor: "{colors.bone-2}"
    typography: "{typography.label}"
    padding: "12px 0"
  size-chip-selected:
    textColor: "{colors.bone}"
  close-button:
    backgroundColor: "{colors.continuum-1}"
    textColor: "{colors.bone}"
    typography: "{typography.label}"
    padding: "10px 14px"
  toast:
    backgroundColor: "{colors.continuum-3}"
    textColor: "{colors.bone}"
    padding: "14px 26px"
  sheet-panel:
    backgroundColor: "{colors.continuum-1}"
    textColor: "{colors.bone}"
    width: "min(560px, 94vw)"
---

# Design System: MONO™ 방출선 셀렉티브 (Emission Line Rail)

## Overview

**Creative North Star: "방출선 레일 — the catalog is a spectrographic measuring instrument (카탈로그는 분광 계측기다)"**

The shop presents itself as a calibrated spectroscope. Every product registers as an emission line on one master rail spanning the visible band (380–700nm); category is wavelength, and the only chroma on the page is the seven physically meaningful spectral hairlines. Everything else is a warm charcoal continuum whose depth comes solely from band steps, written over with bone-toned legends. It rejects both the white-grid selective default and the gold-serif dark-luxury counter-default.

Typography is a single voice: one grotesque for all Korean/Latin running text at one size (15px), where hierarchy is produced by tracking (.02–.3em), weight (340–650), and ink (the bone ladder) — never by size or color. A condensed variable grotesque (Archivo, width axis 72–80%) is reserved for the house wordmark, section headlines, and instrument numerals. All figures are tabular. Photography is desaturated to graphite, matted on plates with a 1px bone inner hairline, under one fixed 5% film-grain overlay that is the plate's own texture. Motion has exactly one authored moment — the rail draws itself and the sodium doubled line lands with a single spring overshoot — after which everything settles and responds in quiet 0.25–0.45s eases.

Where the build diverged from the direction contract, the build won and is canonized here: the contract confined color strictly to wavelength hairlines, but the shipped page also inks sodium's own vertical rail label, the global caret, and the NOW label's top rule in `--nm589` (the Sodium Ink exception below); and the wavelength legend carries an explicit doubled-line entry (589 이중선 — 에디터) alongside the six single-line categories.

**Key Characteristics:**
- Charcoal continuum ground (four bands, no gradients, no shadows) with bone legends and 1px hairlines
- Chroma exists only as seven wavelength emission lines; sodium 589 is doubled and outranks its neighbours
- State is line form, never hue: solid = live, dashed = drop pending, half-height = nearly sold out, struck = sold out
- One text size (15px) for all UI copy; hierarchy by tracking, weight, and ink; tabular numerals everywhere
- The fixed master rail is the page's spine and its only ornament; photography is graphite-matted with provenance recorded

## Colors

A warm charcoal continuum with bone-toned ink, punctuated exclusively by seven spectral emission-line hairlines.

### Primary
- **405nm Violet** (#7B6BC4): Outerwear category line — 1px vertical hairline on look cards and in the legend.
- **436nm Blue** (#5B7BD6): Knitwear category line; also the pre-registration drop tick on the schedule band.
- **486nm Cyan** (#4D9BD1): Dress category line.
- **546nm Green** (#57B374): Lounge category line.
- **589nm Sodium** (#E5B84B): The doubled line — editor's pick, the "now" marker on the drop band, and (by the build's divergence) the ink for its own label, the global caret, and the NOW rule. The only wavelength that is ever text ink.
- **615nm Ember** (#DE7548): Evening category line.
- **656nm Red** (#D6574B): Jacket category line; also the restock drop tick.

### Neutral
- **Continuum Band 0** (#0E0D0B): Deepest ground — body, hero, drop-schedule band, masthead.
- **Continuum Band 1** (#12110E): One band up — collection and editor sections, sheet panel.
- **Continuum Band 2** (#161513): Plate mat — figure mats, chassis footer.
- **Continuum Band 3** (#1C1A17): Raised — mat hover state, toast background.
- **Bone** (#D8D3C7): Primary ink and legend; hairlines derive from it; inverts to fill on hover buttons and selection.
- **Bone Secondary** (#A39C8F): Dimension ink — micro captions, nav links, values.
- **Bone Tertiary** (#8D8679): Faintest ink — struck-out state line, fine print, axis labels.
- **Hairline** (rgba(216,211,199,.22)): 1px rules, minor graduations, mat inner edges.
- **Hairline Strong** (rgba(216,211,199,.45)): The master rail line, major graduations, panel borders, hover-strengthened mat edges.
- **Scrim** (rgba(14,13,11,.78)): Solid dim behind the open product sheet.
- **Instrument Thumb** (#3B382F): Scrollbar thumb on the continuum.

### Named Rules
**The Emission-Only Chroma Rule.** No color outside the seven wavelengths (plus the bone/charcoal neutrals) may appear anywhere. A wavelength is used only where it names a physical nm position: a category line, a drop tick, the doubled sodium. The Sodium Ink exception: `--nm589` may additionally serve as ink for sodium's own label, the caret, and the NOW rule — nothing else, no other wavelength gets ink duty.

**The Line-Form State Rule.** Commerce state is never communicated by hue. Solid 1px line = 판매 중 (live); dashed line (`repeating-linear-gradient(to bottom, bone 0 3px, transparent 3px 6px)` on a 1px-wide element) = 드롭 예정 (pending); half-height line (7px of 14px) = 품절 임박 (nearly gone); struck line (1px diagonal through it) = 품절 (sold out).

**The Band-Only Depth Rule.** Depth is a continuum band step (c0 → c1 → c2 → c3) or the scrim — never a gradient, never a shadow.

## Typography

**Display Font:** Archivo (variable, width axis 72–80%, with 'Pretendard Variable' fallback)
**Body Font:** Pretendard Variable (Korean/Latin grotesque, with Pretendard / -apple-system / Malgun Gothic fallbacks)
**Label/Mono Font:** None separate — labels are body-font micro ranks with heavy tracking; numerals are tabular via `font-variant-numeric: tabular-nums` on the body element itself.

**Character:** One calm instrument voice for everything readable; a compressed display grotesque that reads like engraved panel numerals on the instrument chassis. The pairing is deliberately asymmetric — the body never performs, the display never explains.

### Hierarchy
- **Display** (620, clamp(3.4rem,7.2vw,6rem), lh .94, wdth 72): The MONO™ wordmark once, at the hero; ™ as a .32em superscript at weight 420.
- **Headline** (560–580, clamp(1.9rem,3.4vw,3rem) sections; clamp(2.6rem,6vw,4.6rem) countdown, wdth 76–80): Section headings and the drop-countdown numerals. Archivo only.
- **Title** (550–600, 15px, ls .04em): Look names, sheet title, footer column heads (those at .22em tracking).
- **Body** (340–400, 15px, lh 1.75, ls .01–.02em): All running copy; statements cap near 34em, leads at 66ch.
- **Label** (340–650, 15px, ls .10–.3em): The micro-rank system — t-micro (.24em, bone-2), t-label (.14em, bone), t-dim (.10em, bone-2), t-price (.04em, 650, tabular). The instrument's own engraved micro-labels (rail graduations, axis numbers) go to 10–12px.

### Named Rules
**The One-Size Rule.** 15px is the only size for UI and reading text. Hierarchy is tracking (.02–.3em), weight (340–650), and ink (bone ladder). The only other sizes are Archivo display/numerals and the 10–12px engraved instrument labels. Never add a mid-range text size to create emphasis.

**The Tabular-Ink Rule.** Every figure is tabular (`tabular-nums` is set on body and inherited); emphasis among figures comes from weight (650) and ink, never from a different family or size.

## Layout

The page is an instrument with a fixed spine. The master rail (1px, `--hair-strong`) sits off-centre left at `clamp(72px,13vw,200px)` for the full viewport height, with 10nm minor graduations, 50nm major graduations labelled 380–700, end caps, the sodium doubled line at its true 589 position, and the visitor's collected segments (added by cart actions). All content lives in a frame padded `calc(rail-x + gutter)` on the left, `gutter` on the right; full-bleed section bands fake their width with negative `gutter` margins.

Sections stack as alternating continuum bands (c1 / c0), padded `clamp(84px,11vh,140px)` vertically and `clamp(24px,4vw,56px)` horizontally. The hero is a `100svh` two-column grid (1.05fr / .9fr, aligned to end) with a hairline-ruled readout row and foot rail. The collection is a 12-column grid (gap `clamp(18px,2.4vw,34px)`) with column spans s3/s4/s6/s8 and a `.tall` variant (3/4.6 aspect) anchoring one tall card per visual row — density varies, the type never resizes. The drop schedule is a horizontal nm axis (118px tall) with four drop ticks; the countdown sits above as Archivo numerals.

At 1080px the grid coarsens (s3→4, s4→6, s8→12) and hero/editor go single-column. At 720px the rail becomes a 30px spine (graduation labels hidden, sodium shortened to 76px and moved to bottom 24%), the gutter drops to 18px, the grid collapses to one column, the masthead shrinks to 56px and collapses nav to the cart link, sheet labels wrap left-aligned (end label stays right-aligned), the sheet panel goes full-width, and the footer fine row adds `env(safe-area-inset-bottom)`. Breakpoints shorten the band, never the type.

## Elevation & Depth

No shadows exist anywhere in the build (zero `box-shadow` declarations). Depth is conveyed three ways: continuum band steps (a raised element is one band lighter — mat c2 over section c1, toast c3 over anything), the solid scrim (rgba(14,13,11,.78)) behind the modal sheet, and the fixed 5% film-grain overlay (a base64 noise PNG, `position:fixed; inset:0; opacity:.05; pointer-events:none; z-index:60`) that is the plate's own physical texture, above everything including the sheet. Hover raises a mat exactly one band (c2 → c3) and strengthens its inner hairline (.22 → .45) — nothing lifts, nothing glows.

### Named Rules
**The No-Shadow Rule.** Never introduce `box-shadow`, `text-shadow`, or `drop-shadow`. If an element needs to sit higher, step its continuum band or open the scrim. The grain overlay is the only permitted global texture and stays at 5% opacity, non-interactive, topmost but under the toast's z-order intent (grain 60, sheet 80, toast 90).

## Shapes

Everything is square and everything is a line. `border-radius` is 0 across the system (declared once, on the scrollbar thumb, as 0). The recurring geometry:

- **Hairline:** 1px rules in bone at .22 (quiet) or .45 (structural). Buttons' ticks, mats' inner edges, table rows, section rules.
- **Doubled line (sodium):** two 1px vertical lines 3px apart (rail sodium uses 4px at 5px width). Reads as one instrument mark that resolves into two.
- **State glyphs:** a 14px × 1px vertical line; half state = 7px; strike = a 9px × 1px diagonal at −32° crossing the line.
- **Plates/mats:** figure backgrounds one band up with 8–10px padding and a 1px hairline inset at the padding edge — photography is mounted, never floating.
- **Tick marks:** the button/control primitive is a 26px × 1px horizontal line that scales to 1.7× on hover/focus; nav ticks are 14px; the nav 589 link carries a doubled vertical tick.

## Components

### Buttons
- **Tick Button (line).** Character: a control the instrument draws. A 26px hairline tick left of a tracked label (.18em, 500), transparent ground, padding 12px 2px. Hover/focus-visible scales the tick `scaleX(1.7)` and the label's tracking breathes (.25s ease). Used for secondary actions and in-page anchors.
- **Tick Button (fill).** Same grammar inverted: 1px bone border, padding 12px 22px, tick reordered after the label; hover floods bone and inverts text/tick to continuum-0. Used for primary actions (룩 열기, 장바구니에 담기).
- **Focus.** Global: `:focus-visible{outline:1px solid var(--bone); outline-offset:3px}` — a hairline, like everything else.

### Chips
- **Legend Key.** An inline-flex pairing of a state line or wavelength hairline with a tracked label (.08em) and a 650-weight bone value (the nm number). Two legend groups — 파장 범주 (wavelengths, including the doubled 589 entry) and 판매 상태 (four line forms) — sit between hairline rules.
- **Size Chip.** Equal-flex buttons (padding 12px 0) with a 1px hairline border in the quiet strength; selected state (`aria-pressed="true"`) strengthens the border to bone and the ink to bone — again form, not fill.

### Cards / Containers
- **Look Card.** Character: a registered specimen. A full-bleed button: graphite plate (mat, c2, 8px padding, inner 1px hairline) with 3/4 photography (`.tall` 3/4.6), over a data grid — 22px category wavelength line, micro caption (LOOK 00 · 000nm category), tabular price right-aligned (blank when sold out), name (550), and the state glyph pair. Hover steps the mat to c3 and strengthens the inner hairline (.25s ease). Grid spans s3/s4/s6/s8 with tall anchors.

### Inputs / Fields
- No free-text inputs exist. Size selection (above) and the close control are the only form-like surfaces; both use the hairline-border grammar.

### Navigation
- **Masthead.** Fixed 64px (56px mobile), continuum-0, bottom hairline. Brand: Archivo wdth 74/640/22px + a .28em micro suffix. Links: a 14px hairline tick that scales 1.7× and brightens (bone-3 → bone) on hover and on scroll-spy active; the 589 editor link carries the doubled vertical tick in sodium; the cart link holds the tabular count. Mobile keeps only the cart link.

### Signature Components
- **Master Rail.** The fixed vertical nm axis described in Layout. Draws itself once on load (`scaleY` 0→1, 1.1s, cubic-bezier(.22,.8,.3,1), .15s delay); the sodium doubled line then lands from −46vh with one spring overshoot (1.35s, cubic-bezier(.34,1.45,.5,1), .5s delay) — the page's single authored moment. Cart additions append 3px × 22px bone segments ("관심 N") at random rail positions.
- **Drop Band.** Horizontal nm axis (380–700, 10nm/50nm graduations) with four drop ticks above it: pending ticks dashed, low ticks half-height, the sodium doubled tick full-height and 1px-wider with a NOW label ruled in sodium above it; the end tick's label right-aligns to stay in band.
- **Product Sheet.** Right panel `min(560px,94vw)` (full-width mobile) on continuum-1 with a strong-hairline left edge, sliding in over the scrim (.45s, cubic-bezier(.16,1,.3,1)); focus moves to the bordered close control, Escape and scrim close, focus returns to the invoking card. Contents: mounted plate, micro number, title, hairline-ruled spec rows, size chips, fill add-button.
- **Toast.** Centered-bottom status line on continuum-3 with strong hairline border, emerging .4s and holding 2.4s — the instrument's readout.
- **Chassis Footer.** Continuum-2 full-bleed band, three columns, hairline-ruled fine print row with safe-area inset; carries the synthetic-demo disclosure and image provenance pointer.

## Do's and Don'ts

### Do:
- **Do** express every state as line form (solid/dashed/half/struck) with the exact grammar in the Line-Form State Rule — including the `repeating-linear-gradient(to bottom, var(--bone) 0 3px, transparent 3px 6px)` dash, which is the world's own drafting mark for "registered, not yet live".
- **Do** keep one 15px text size; build hierarchy with tracking (.02–.3em), weight (340–650), and the bone ink ladder, and set all figures tabular.
- **Do** mount photography as graphite plates: one-band-up mat, 8–10px padding, 1px inner bone hairline, `filter: contrast(1.02)` on the image; record provenance for every shipped raster (see assets/PROVENANCE.json).
- **Do** keep the 5% fixed grain overlay as the single global texture, and let hover raise surfaces exactly one continuum band with a hairline strengthen (.22 → .45).
- **Do** place chroma only at physically meaningful nm positions, and reserve doubled-line sodium outranking for exactly one emphasis per view.

### Don't:
- **Don't** use gradients, box/text/fit shadows, or border-radius other than 0 — depth is band steps and the scrim; corners are square.
- **Don't** encode meaning in hue (no red errors, no green confirmations); state, selection, and emphasis are line form, ink, and weight.
- **Don't** introduce any text color outside the bone ladder and the seven wavelength values (with the sodium-ink exception), or any size between the 15px body rank and the Archivo display scale.
- **Don't** animate beyond the grammar: one authored rail moment on load, settle rises (.8s cubic-bezier(.16,1,.3,1) with .25–.7s stagger), .25s control response, .45s sheet slide — and always honor `prefers-reduced-motion` by disabling all of it.
- **Don't** let the grid's density changes resize type; breakpoints shorten the band, collapse columns, and hide graduation labels — never the type.
