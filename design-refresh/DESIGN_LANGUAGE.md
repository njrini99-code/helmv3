# Clubhouse design system

The one source for how Clubhouse (the GolfHelm coach and player UI) looks: the laws, the surfaces, the colour, the type, the toggle, the charts and what is banned. Every page follows this file. The values are not typed here: the tables in §3 are generated from `src/clubhouse/styles/tokens.css` by `scripts/clubhouse/design-language.mjs`, and `clubhouse:check` fails when they drift. Change a value in tokens.css, run the script, and say why in the same pull request.

Bar: Apple's own iOS apps. Smooth, accurate motion. Handcrafted, not basic.

Last change: 15 Nov 2026, the production audit (`clubhouse-handoff/prod-audit-2026-11-15/CLUBHOUSE-PROD-AUDIT-FINAL.md`, specs S1.1 to S2.8), Nick's calls of that day ("Bring the ivory gradient back", "Ivory cards, deeper page", "The Practice-style toggle everywhere") and the visual half of his motion and visual system (`clubhouse-handoff/launch-readiness-2026-11-15/MOTION-AND-VISUAL.md` §4.1 to §4.8: one bar material, the Practice style's three sizes, nine type roles, five radii, three elevations, and colour roles: red for errors only, under par in the gain). Where that file differs from the audit (the hero figure's weight, the bubble radius), it wins. It replaces the 31 Oct flat page (#2497, law 2 then read "The page is one flat color").

Companions, each generated or owned elsewhere:
- Values: `src/clubhouse/styles/tokens.css` (light root, dark root, phone, Increase Contrast and Reduce Transparency blocks).
- Components: `src/clubhouse/AGENTS.md` (the shared owners: Surface, Segmented, Modal, Menu, Button, PhoneScreen) and the generated catalog `src/clubhouse/preview/component-catalog.json`.
- The shared design system artifact, "Helm Clubhouse UI", republished from these tokens with each change to them.
- Doctrine the compiler cannot hold: `.claude/rules/clubhouse.md`, enforced by `scripts/clubhouse/check.mjs`.

Sources for the 31 Oct edition, still the base of §5 to §7: Nick's Claude Design reference in `design/handoff/` (the "Fairway, Clubhouse Edition" system, the mobile boards `Coach - * - Mobile.html` and `Player - * - Mobile.html`, `m.css`, `m-shell.jsx`, `design/handoff/screenshots/*-mobile.jpg`).

---

## 1. What changed on 15 Nov, in one paragraph

The 31 Oct edition flattened the page to one #f2f0e9 and pushed cards to near-white #fffefb (1.09:1 against the page). Nick's 15 Nov read of production: "There's too much white." Near-white covered 25 to 56% of most phone screens and 73% of Drills. This edition brings back the Oct 21 page (the time-of-day light and paper tint of d0f467a73) over a deeper linen (#e8e3d5), puts every card on ivory paper (#faf7ef, 1.20:1 on the linen), and makes nothing white. The 31 Oct structure fix stays: text lives on a surface (law 1), so the light shows only between cards, where there is no body text.

## 2. The six laws

1. **Text lives on a surface.** On phone, the only text allowed directly on the page is the large title and its one context line. Section titles, meta, notes, counts and captions go inside a card or a grouped list. No exceptions for "small" captions. One agreed exception, Nick's call on 31 Oct ("Keep as drawn"): the Stats page as drawn (v7) has no large title and puts section names such as "Overview" on the page. Build it as drawn.
2. **The page is the ivory light over a deeper linen** (Nick, 15 Nov). One paint, `--ch-page-paint` (the time-of-day light, the paper tint, the linen `--ch-workspace`), serves the phone page, a pushed screen, a crash screen and every page copy that slides during a push, so one walk through the app crosses one page. The desktop canvas paints the same layers plus the sidebar bleed and the green mist, scrolling with the page. Cards are ivory paper on it, tiles and wells inside a card are a step deeper, and **nothing is white**: no surface reaches #fcfcfc, and none is lighter than the elevated #fcfaf5. Every text spot holds 4.5:1 at the light's darkest point, light and dark. `src/clubhouse/styles/__tests__/page-colour.test.ts` holds this law.
3. **Depth comes from surfaces, not from colour.** Three elevations and no others (§4, MOTION-AND-VISUAL 4.6): flat (the page), card, and raised (sheets, menus, the palette, pins), plus the scrim under a sheet. Never a coloured border, a tinted fill or a gradient to separate a card.
4. **No accent left-border cards, ever** (Nick, Oct 24). No thick left rule, no coloured edge bar, no stripe. Status shows as a dot, a chip or coloured text.
5. **One feature card per view.** Deep green, flat, used once, for the single most important thing on the screen. Everything else is ivory paper.
6. **Organized, airy, visual first** (Nick, 31 Oct, on the first Stats page: "too busy, complicated, and not airy modern and visual", then "Not fewer. Just better organized."). Keep all the content; organize it so the screen reads calmly:
   - Group by question. Related figures share one card under one title; each group answers one question ("How am I scoring?", "Where do I gain and lose?", "Recent rounds"). Order the groups from the headline down to detail.
   - Clear hierarchy in every card: one lead visual or figure, then supporting figures smaller and quieter, then the note. The eye should land in one place first.
   - Picture first, words second: a chart, bar or ring carries the data, labels and sentences support it. On phone, prefer a chart or a grouped list over a table.
   - Generous, even spacing: 24pt between cards, 16pt card padding on phone and 20pt on desktop (list rows keep their 16pt inset), the hero chart at least 160pt tall. Same gaps on every screen so the rhythm is predictable.
   - Notes stay short (one or two lines) and inside their card.
   - Nothing is removed to get there. Where a group is long, it can collapse behind a "Show all" row or the toggle inside its card, but the content stays on the screen.

## 3. Colour

Rules:
- Body and meta text use primary or secondary only. Tertiary is for axis labels and timestamps (13px semibold or 15px regular and up), never for a sentence; it and the placeholder share `--ch-ink-500` (S1.7).
- Target 4.9:1 for all text, floor 4.5:1, 3:1 for chart marks, icons that must be seen and control borders (`--ch-border-control`), checked in light and dark against the surface the text actually sits on, at the light's darkest point.
- Colours come from tokens only. A page stylesheet names `var(--ch-*)`; a literal colour lives in tokens.css with a dark value. `src/clubhouse/styles/__tests__/raw-colour.test.ts` counts the literals left in page stylesheets and lets the count only fall.
- Gain means better and loss means worse, in every chart and stat: green for gains, amber for losses, ink for a change within noise ("No clear change"). Every gain or loss mark and number carries a sign or arrow (S2.5).
- **Red is for errors only** (MOTION-AND-VISUAL 4.7, Nick 15 Nov 2026; this retires D-42's "red means under par"). `--ch-flag` and the danger family mark an error or a destructive action; the pin flag (`--ch-chart-flag`) and a penalty stake keep their red because they are drawn as they stand on the course. `RED_TOKENS` in `scripts/clubhouse/check.mjs` flags any other red.
- **Under par is the gain.** `--ch-score-under` reads `--ch-chart-gain` (`#0f5233` text), `--ch-score-under-fill` the gain fill (`#0b3a25`, ivory numeral), `--ch-score-under-bg` the gain tint. In the scoring mix and the live beads birdie is a step lighter (`--ch-score-birdie-fill`) than eagle or better (the full gain fill). On the deep green (a stage, a board, the shot screen's strip) under par is the feature gain: `#8fd3aa` text, the `#6fc096` mint disc under the deep green numeral.
- **Hole chips** (4.7): under par a solid gain fill with an ivory numeral, par ivory, over par an amber wash with loss text, the current hole a 2px green-500 ring. No thick left borders. Over par on a scoreboard is ink.
- **Attention** is champagne, `--ch-champagne-100` with `--ch-champagne-ink` (`#efe6d2` / `#725b2c`): a due date and the personal-best badge. Nothing else should use it, so it means "look here"; the older champagne rules and gilt are still to be retired.
- The selected fill (`--ch-bg-selected`) always comes with a non-colour cue: a check, a bold label or the focus ring. Never a thick left border (S1.8b).
- No pale mint highlight fills. A summary row is a summary by weight and a top rule, not by tint.

### Generated tables

<!-- AUTOGEN:clubhouse-design-tokens:start (node scripts/clubhouse/design-language.mjs; do not edit inside) -->
Generated from `src/clubhouse/styles/tokens.css` (the light root and the dark root). Ratios are WCAG 2.x, alpha composited, measured against the token named after each ratio (`card-bg` is the ivory card, `workspace` the linen page base). Edit tokens.css, then run `node scripts/clubhouse/design-language.mjs`.

The page paint, once for every page, pushed screen and page copy: `var(--ch-light-canvas), var(--ch-light-paper), var(--ch-workspace)`.

#### Page and surfaces

| Token | Light | Dark | Role | On the page, light | On the page, dark |
|---|---|---|---|---|---|
| `--ch-workspace` | `#e8e3d5` | `#131814` | The linen page, under the light and the paper tint (S1.1) | — | — |
| `--ch-bg-page` | `#e8e3d5` | `#111512` | The recessed page: desktop main column, inset grouped lists (S1.2) | 1.00 | 1.03 |
| `--ch-card-bg` | `#faf7ef` | `#212722` | The one card; `--ch-bg-surface`, sheets, the chart paper and bubbles name it (S1.3) | 1.20 | 1.18 |
| `--ch-bg-surface` | `#faf7ef` | `#212722` | Same card | 1.20 | 1.18 |
| `--ch-bg-elevated` | `#fcfaf5` | `#2c322d` | Raised surfaces: menus, popovers, the secondary key (S1.6) | 1.23 | 1.37 |
| `--ch-bg-subtle` | `#f1ede2` | `#181d19` | Tiles and wells inside a card; `--ch-well-bg-flat` names it | 1.10 | 1.05 |
| `--ch-bg-selected` | `#ebe4d2` | `#2c322d` | Selected row or option, always with a non-colour cue (S1.8b) | 1.01 | 1.37 |
| `--ch-feature-bg` | `#0b3a25` | `#123d29` | The one deep green feature card per view | 9.95 | 1.48 |

#### Ink

| Token | Light | Dark | Role | Light ratios | Dark ratios |
|---|---|---|---|---|---|
| `--ch-text-primary` | `#1c1b18` | `#f1ecdf` | Titles, values | 16.09 on card-bg, 13.43 on workspace | 12.92 on card-bg, 15.24 on workspace |
| `--ch-text-secondary` | `#3a3833` | `#e2dccd` | Meta, notes, row subtitles | 10.94 on card-bg, 9.13 on workspace | 11.14 on card-bg, 13.14 on workspace |
| `--ch-text-tertiary` | `#46433d` | `#d0c9b8` | Axis labels, timestamps; never a sentence | 9.21 on card-bg, 7.69 on workspace | 9.24 on card-bg, 10.89 on workspace |
| `--ch-ink-500` | `#55524b` | `#c4bdad` | Placeholder and the quietest text (S1.7) | 7.28 on card-bg, 6.08 on workspace | 8.15 on card-bg, 9.61 on workspace |
| `--ch-accent-ink` | `#155a39` | `#7cc79b` | Links and accent text; `--ch-accent` is the fill, never text | 7.68 on card-bg, 6.41 on workspace | 7.62 on card-bg, 8.99 on workspace |
| `--ch-on-green-ink` | `#f4eedd` | `#f4eedd` | Text on the green frame and feature card | 11.01 on feature-bg | 10.50 on feature-bg |
| `--ch-text-on-accent` | `#ffffff` | `#f4eedd` | Text on a primary key | 12.76 on primary-bg | 4.98 on primary-bg |

#### Edges

| Token | Light | Dark | Role | Light ratios | Dark ratios |
|---|---|---|---|---|---|
| `--ch-card-ring` | `rgb(28 25 18 / 0.08)` | `rgb(241 236 223 / 0.08)` | The card edge, drawn as `0 0 0 1px` (S1.4); a boundary, not a 3:1 line | 1.17 on card-bg, 1.17 on workspace | 1.25 on card-bg, 1.22 on workspace |
| `--ch-separator` | `rgb(28 27 24 / 0.1)` | `rgb(241 236 223 / 0.1)` | Row hairlines, inset 16 from the leading edge | 1.22 on card-bg | 1.33 on card-bg |
| `--ch-border-control` | `#85817a` | `#807b6e` | Inputs, search, chips, switch off-ring, chart track rings (S1.8, 3:1) | 3.62 on card-bg, 3.02 on workspace | 3.61 on card-bg, 4.26 on workspace |
| `--ch-border-focus` | `#155a39` | `#6bbb8c` | Keyboard focus ring, 2px | 7.68 on card-bg, 6.41 on workspace | 6.61 on card-bg, 7.80 on workspace |

#### Data marks

| Token | Light | Dark | Role | Light ratios | Dark ratios |
|---|---|---|---|---|---|
| `--ch-chart-gain` | `#0f5233` | `#a9e0c0` | Gain text and signed numbers (S2.5) | 8.62 on card-bg | 10.24 on card-bg |
| `--ch-chart-loss` | `#7a4500` | `#f5c982` | Loss text and signed numbers (S2.5) | 7.32 on card-bg | 9.84 on card-bg |
| `--ch-chart-gain-fill` | `#0b3a25` | `#c2f2d3` | Gain bars and marks | 11.92 on card-bg, 9.42 on chart-track | 12.29 on card-bg, 10.58 on chart-track |
| `--ch-chart-loss-fill` | `#c58012` | `#b36c10` | Loss bars and marks; the track ring carries 3:1 (S2.6) | 3.03 on card-bg, 2.40 on chart-track | 3.68 on card-bg, 3.17 on chart-track |
| `--ch-chart-flat` | `#6b675f` | `#a39d90` | Steady or within-noise marks, drawn in ink | 5.26 on card-bg, 4.16 on chart-track | 5.65 on card-bg, 4.86 on chart-track |
| `--ch-chart-line` | `#2d6a47` | `#6db488` | The series line, 2px, one dot on the newest round (S2.4) | 6.01 on card-bg | 6.19 on card-bg |
| `--ch-chart-zero` | `#5f5c55` | `#ada697` | Mean and zero rules, 1px dashed | 6.23 on card-bg | 6.30 on card-bg |
| `--ch-separator-chart` | `#8a867c` | `#7a7568` | Gridlines, 1px, dashed 2 4, at most three (S2.2) | 3.39 on card-bg | 3.32 on card-bg |
| `--ch-chart-track` | `#e3ddcf` | `#2c322d` | Bar and progress tracks, ringed with `--ch-chart-track-ring` (S2.6) | 1.26 on card-bg | 1.16 on card-bg |
| `--ch-chart-par` | `#c9c2b1` | `#3a403b` | Par segments, ringed like the track | 1.66 on card-bg | 1.43 on card-bg |
| `--ch-chart-gilt` | `#927840` | `#c9ad74` | Qualifying line and its legend key | 3.94 on card-bg | 7.05 on card-bg |
| `--ch-score-under` | `#0f5233` | `#a9e0c0` | Under par, text and rings: the gain (MOTION-AND-VISUAL 4.7) | 8.62 on card-bg | 10.24 on card-bg |
| `--ch-score-under-fill` | `#0b3a25` | `#c2f2d3` | A filled under-par mark or hole chip, under `--ch-score-fill-ink` (4.7) | 11.92 on card-bg, 11.92 on score-fill-ink | 12.29 on card-bg, 12.45 on score-fill-ink |
| `--ch-score-birdie-fill` | `#2a7d53` | `#5fa57a` | The scoring mix and live beads: birdie, a step lighter than eagle or better | 4.72 on card-bg, 2.53 on score-eagle-fill | 5.19 on card-bg, 2.37 on score-eagle-fill |
| `--ch-champagne-100` | `#efe6d2` | `#2b2619` | Attention (4.7): a due date and the personal-best badge, with `--ch-champagne-ink` | 1.16 on card-bg, 5.21 on champagne-ink | 1.01 on card-bg, 7.96 on champagne-ink |
| `--ch-chart-flag` | `#b03a2e` | `#ef8576` | The pin flag, drawn as on the course | 5.62 on card-bg | 6.01 on card-bg |
| `--ch-flag` | `#b3261e` | `#f28b7d` | Errors and destructive actions: red means nothing else (4.7) | 6.11 on card-bg | 6.36 on card-bg |

#### Keys

| Token | Light | Dark | Role | Light ratios | Dark ratios |
|---|---|---|---|---|---|
| `--ch-primary-bg` | `#0b3a25` | `#25734d` | Primary key, solid (no gradient) | 11.92 on card-bg | 2.64 on card-bg |
| `--ch-primary-bg-hover` | `#124b2e` | `#2c7a52` | Primary key, hover | 9.47 on card-bg | 2.91 on card-bg |
| `--ch-primary-bg-press` | `#08301e` | `#17543a` | Primary key, pressed | 13.51 on card-bg | 1.72 on card-bg |
| `--ch-btn-secondary-bg` | `#fcfaf5` | `#2c322d` | Secondary key | 1.03 on card-bg | 1.16 on card-bg |

#### The one toggle

| Token | Light | Dark | Role |
|---|---|---|---|
| `--ch-well-bg` | `linear-gradient(180deg, #d4cebe 0%, #ddd8ca 55%, #e4dfd3 100%)` | `linear-gradient(180deg, #0a0d0b 0%, #0d110e 55%, #101411 100%)` | The toggle well (recessed linen) |
| `--ch-well-shadow` | `inset 0 2px 3px rgb(28 25 18 / 0.2), inset 0 4px 10px -2px rgb(28 25 18 / 0.16), inset 0 -1px 0 rgb(255 255 255 / 0.55), inset 0 0 0 1px rgb(28 25 18 / 0.13), 0 1px 0 #fff, 0 0 0 1px rgb(255 255 255 / 0.35)` | `inset 0 2px 3px rgb(0 0 0 / 0.5), inset 0 4px 10px -2px rgb(0 0 0 / 0.4), inset 0 0 0 1px rgb(0 0 0 / 0.4), 0 1px 0 rgb(255 255 255 / 0.05)` | Its inset |
| `--ch-seg-on-bg` | `linear-gradient(180deg, var(--ch-green-fill-500) 0%, var(--ch-green-fill-700) 100%)` | `linear-gradient(180deg, var(--ch-green-fill-600) 0%, var(--ch-green-fill-700) 100%)` | The raised green pill |
| `--ch-seg-on-shadow` | `inset 0 1px 0 rgb(255 255 255 / 0.2), inset 0 -1px 0 rgb(0 0 0 / 0.12), 0 1px 2px rgb(11 58 37 / 0.35), 0 3px 8px -2px rgb(11 58 37 / 0.3)` | `inset 0 1px 0 rgb(255 255 255 / 0.16), inset 0 -1px 0 rgb(0 0 0 / 0.2), 0 1px 2px rgb(0 0 0 / 0.5), 0 3px 8px -2px rgb(0 0 0 / 0.45)` | Its soft drop shadow |
| `--ch-seg-on-ink` | `#f9f7f1` | same | The pill label |

#### The three elevations

| Token | Light | Dark | Role |
|---|---|---|---|
| `--ch-elevation-card` | `0 0 0 1px rgb(28 25 18 / 0.08), 0 1px 2px rgb(28 25 18 / 0.05), 0 4px 12px -4px rgb(28 25 18 / 0.08)` | `0 0 0 1px rgb(241 236 223 / 0.08)` | Card: every card (MOTION-AND-VISUAL 4.6). Flat, the page, is none |
| `--ch-elevation-raised` | `0 0 0 1px rgb(28 25 18 / 0.1), 0 2px 6px rgb(28 25 18 / 0.06), 0 12px 32px -8px rgb(28 25 18 / 0.18)` | `0 0 0 1px rgb(241 236 223 / 0.1), 0 12px 32px -8px rgb(0 0 0 / 0.55)` | Raised: sheets, menus, the palette, pins, toasts (MOTION-AND-VISUAL 4.6) |
| `--ch-scrim` | `rgb(28 25 18 / 0.24)` | `rgb(2 6 4 / 0.58)` | The scrim under a sheet or dialog |

#### Radii

| Token | Value |
|---|---|
| `--ch-radius-sm` | `8px` |
| `--ch-radius-md` | `12px` |
| `--ch-radius-lg` | `16px` |
| `--ch-radius-xl` | `20px` |
| `--ch-radius-full` | `999px` |
| `--ch-radius-xs` | `4px` |
| `--ch-radius-bubble` | `18px` |
| `--ch-radius-tail` | `6px` |

#### Type roles

| Role | Token | Desktop: weight, size / leading | Phone: weight, size / leading |
|---|---|---|---|
| Large title: the page title | `--ch-type-large-title` | 700, 30 / 36 | 700, 34 / 41 |
| Title: card hero titles, a hole number | `--ch-type-title` | 600, 22 / 28 | same |
| Headline: card heads, bar titles, row titles that lead | `--ch-type-headline` | 600, 16 / 22 | 600, 17 / 22 |
| Body: prose, CoachHelm answers | `--ch-type-body` | 400, 15 / 22 | 400, 17 / 24 |
| Callout: row titles, controls, secondary prose | `--ch-type-callout` | 500, 14 / 20 | 500, 15 / 20 |
| Footnote: row meta, eyebrows, captions under figures | `--ch-type-footnote` | 500, 13 / 18 | same |
| Caption: axis labels, legends, chips | `--ch-type-caption` | 500, 12 / 16 | same |
| Hero figure, tabular: the one number a screen leads with | `--ch-type-figure-hero` | 600, 56 / 1 | 600, 44 / 1 |
| Row figure, tabular: scores and averages in rows | `--ch-type-figure` | 600, 15 / 20 | 600, 17 / 22 |

Sizes are at the default Text Size: every role multiplies by `--ch-type-k`, so text follows iPhone Text Size.
<!-- AUTOGEN:clubhouse-design-tokens:end -->

### Open calls (Nick's)

1. **Red for scores (PL-HOME-05, S2.5): settled 15 Nov by MOTION-AND-VISUAL 4.7.** Red is for errors only and under par is the gain (rules above). The change is its own commit, so it can be dropped on its own.
2. **Wave 3 design F (colour, surfaces, switches) and J (Practice look, Documents, Stats categories, Roster trends).** Rows that wait on these keep today's look; nothing in this file pre-empts them.

## 4. Surfaces and elevation

| Surface | Fill | Edge and elevation | Radius | Use |
|---|---|---|---|---|
| Page | `--ch-page-paint` (light, paper tint, linen) | none | n/a | Every page, pushed screen and page copy |
| Recessed page | `--ch-bg-page`, the linen | none | n/a | Desktop main column, inset grouped lists |
| Card | `--ch-card-bg`, ivory paper | `--ch-elevation-card`: ring plus two soft layers by day, ring only at night | 16 (`--ch-radius-lg`) | Every content group; `ui/Surface.tsx` |
| Tile or well in a card | `--ch-bg-subtle` | a hairline, or the toggle well's inset | 12 | Evidence bands, figure tiles, the search field |
| Raised | `--ch-bg-elevated` | `--ch-elevation-raised` | 12 or 16 | Menus, popovers, the palette, pins, the floating compose key, toasts |
| Sheet | `--ch-sheet-bg` (the card) over `--ch-scrim` (`rgb(28 25 18 / 0.24)` by day) | `--ch-elevation-raised` (`--ch-elevation-sheet` names it) | 20 (`--ch-radius-xl`) | Sheets and dialogs |
| Feature card | `--ch-feature-bg`, flat deep green, text `--ch-on-green-ink` | `--ch-elevation-feature` | 16 | Once per view |
| The bar material | `--ch-glass-bg`: `color-mix(in oklab, var(--ch-workspace) 78%, transparent)` under `blur(20px) saturate(140%)`, both themes | a hairline once content is under it | n/a | The one material, for the bar that appears on scroll and other navigation chrome (the strip, the composer tray). Never behind data, sheets or menus. Increase Contrast and Reduce Transparency make it the solid page |

These three elevations (flat, card, raised) are the only ones (MOTION-AND-VISUAL 4.6; S1.5 to S1.5c). Every other elevation token is an alias of one of them, or none. Green controls keep their inset highlight (`--ch-seg-on-shadow`): it is part of the control, not an elevation. Message bubbles, pills and chips are flat. No card inside a card. No lit inset rim, no sun drift, no third ambient layer. A drop shadow written in a page stylesheet instead of a token is counted per file by `npm run clubhouse:css` (`config/clubhouse/css-ratchet.json`) and may only fall.

Radii: five steps (MOTION-AND-VISUAL 4.5): `--ch-radius-sm` 8 (menu items, small chips, kbd, chart pins), `-md` 12 (buttons, inputs, hole chips, menus), `-lg` 16 (cards, toasts, options), `-xl` 20 (sheets and the phone lip) and `-full` (pills, the toggle, avatars). Three shapes sit outside the steps on purpose: `--ch-radius-xs` 4 for the bogey square (a square must not read as a circle), and a message bubble's 18 (`--ch-radius-bubble`) with its 6 corner (`--ch-radius-tail`). Chart marks take the stroke's cap, not a radius. A border-radius that is not a token is counted by the same ratchet; there are five left.

Card anatomy:
```
┌─────────────────────────────────────────┐
│ Strokes gained by leg     Per round · vs Tour │  ← header: title 17/600 primary, meta secondary, 16px pad
│─────────────────────────────────────────│  ← hairline, inset 16
│  body rows …                              │
│─────────────────────────────────────────│
│ Three legs are losing strokes: Approach,  │  ← note: secondary, inside the card
│ Around green and Putting.                 │
└─────────────────────────────────────────┘
  Hole stats from 56 of 70 rounds            ← NOT allowed on the page. Moves into the card's note.
```

## 5. Phone page anatomy

1. **Top bar: today's green bar, on every section, unchanged** (Nick, 31 Oct: the real phone top bar is the green bar with the section switcher on the left and the bell on the right, and every redesign keeps it). Same spec as `CLASSES_ROSTER_HOME_IMPLEMENTATION.md` section 2, which matches today's app:
   - Bar: `--ch-frame` (#0a331f light, #08150e dark), about 98pt tall including the status bar. No glass, no hairline.
   - Left: the section name is the switcher ("Stats ⌄", "Roster ⌄"), 16px from the edge, 18pt semibold in on-green ink `#f4eedd` (12.0:1 light, 16.1:1 dark), with the chevron and the champagne dot (news in another section) after it. It opens the section strip (`docs/clubhouse/phone/section-strip.md`, approved 12 Oct).
   - Right: the bell with its count badge, or the page's own action in its place where the page has one today (+ on Classes, add-player on Roster). Bare 44pt icons in `rgb(240 233 214 / .86)` (8.9:1).
   - Sheet: the page (the page paint: the ivory light over the linen, law 2) tucks under the bar with today's 16px rounded lip (the mask on `PhoneTop`). No green fading into a beige wash.
   - On scroll the bar stays put and keeps its title; only a soft 14px shade fades in under it after 8px.
   - Pushed pages (player profile): same green bar, "‹ Roster" in champagne on the left, the page's name centred in on-green ink, a more button on the right.
   - Home: the same green bar with the team mark and "Home ⌄", over the flat deep green hero.
   - Code: `shell/phone-chrome.tsx`, `ui/PhoneBar.tsx`, `PhoneTop`, the section switch. The refresh changes nothing about the bar's look, gestures or contents. No ivory or glass bar replaces it.
2. **Large title** (optional per screen, 34pt `--ch-type-large-title`) on the sheet under the bar, as the page's heading. It opens nothing; the bar's title is always visible above it. On scroll it shrinks about 14% and fades; nothing moves into the bar. Reduce Motion: fade only.
3. **Context line** under the large title: 15pt secondary, one line ("Varsity · 7 active · countable rounds").
4. **Controls** (the one toggle, §9) directly under the context line, sticky under the green bar when scrolled. A sticky bar is transparent at rest and paints the paper over the linen only once content is under it (S1.9).
5. **Cards**, 24pt apart, grouped by question (law 6).
6. **No tab bar.** The phone uses the section strip; nothing sits at the bottom except the Resume round accessory and a page's thumb dock, as today.

Edges: 16px page edge, 20px on large phones (≥ 414pt wide), already `--ch-page-x-phone` → `--ch-space-5` in the `@media (min-width: 414px)` block in `tokens.css`. Rows inside a card pad 16px. Minimum touch target 44x44.

## 6. Type

Instrument Sans only (`--ch-font-sans`). Every size scales with iPhone Text Size through `--ch-type-k` (from `-apple-system-body`, capped at XXL). No tracked caps, no serif, sentence case everywhere. Nine roles (MOTION-AND-VISUAL 4.3), their desktop and phone values in the generated "Type roles" table in §3: large title (the page title), title (card hero titles, a hole number), headline (card heads, bar titles, row titles that lead), body (prose; 16/24 inside a CoachHelm thread), callout (row titles, controls, secondary prose), footnote (row meta, eyebrows, captions under figures), caption (axis labels, legends, chips), the hero figure (the one number a screen leads with, 600) and the row figure (scores and averages in rows, 600). Secondary text is weight 500 for contrast on ivory. Meta is never larger than body. Weights are 400, 500, 600 and 700 only.

A new rule reads a role. The numeric steps (`--ch-type-11` to `-34`) that the roles replace are still read in older stylesheets; `src/clubhouse/__tests__/legacy-type-roles.test.ts` counts them per file and lets the count only fall, and no older named role (serif, display, label, eyebrow, meta, row, section, bar or card title) may come back.

Numbers: tabular figures everywhere, a true minus (−), "E" for even, "—" for no data, window and sample stated ("Last 10 rounds · 142 shots"). One number per card is the headline; it should not shout.

## 7. Lists and rows

- Row height 52 (single line) or 64 (two lines); hairline separator inset 16 from the leading edge, none after the last row.
- Leading: 32pt avatar coin or 28pt icon tile. Trailing: value, then chevron (13pt, tertiary) when the row opens something.
- Pressed state: `--ch-ink-900` at 5% wash, no scale on full-width rows.
- Swipe actions (existing `SwipeRow`) keep their springs.
- Summary row (team total): 600 weight, a full-width top hairline at 16% ink, no fill.

## 8. Motion

Owned by the navigation motion work (audit Batches 2 and 4); this section changes with that work, not with a colour or surface change.

One motion set, already in `tokens.css`; this file fixes which to use where.

| Moment | Duration | Easing | Notes |
|---|---|---|---|
| Press (buttons, cards that open) | 110ms down, 280ms release | `--ch-ease` | Scale 0.97 on buttons and tappable cards; rows wash instead |
| Tab switch | 260ms | crossfade, `--ch-ease` | Content only; bars do not move |
| Push to detail | 462ms | `--ch-ease-spring-smooth` (the `linear()` spring) | Incoming slides 100% → 0, outgoing to −24% (`CH_UNDERLAY_SHIFT` 0.24; `--ch-vt-parallax` moves to −24% in PR 1) and dims to 0.9 |
| Sheet up | 462ms spring; down 280ms `--ch-ease` | | Follows the finger; velocity hands off to the spring |
| Segmented thumb | 360ms | `--ch-ease-spring` (slight overshoot) | Thumb slides, label weights cross-fade |
| Large title on scroll | scroll-linked | none | Title scales to 86% and fades as it scrolls under; nothing moves into the green bar, whose title is always shown; the 14px shade fades in under the bar after 8px. Reduce Motion: fade only |
| Chart marks | 360ms once, when first scrolled into view | `--ch-ease` | Bars grow from the zero axis; never on re-render, never count-ups. Marks inside the shared read sheet and other sheets are drawn at rest (completeness pass, 4 Nov) |
| New message, new row | 260ms | spring | Height opens, then content fades and rises 6px |

Reduce Motion: every duration above goes to 0 except crossfades, which become opacity only (no movement) over `CH_FADE_MS` (180ms today, owner decision of 24 Oct, pinned by `reduced-motion.test.tsx`). Any lane file that says 120ms for the Reduce Motion crossfade means `CH_FADE_MS`. Today's override block at `tokens.css` 1094–1108 already zeroes them; add the 120ms crossfade exception.

Frame budget: animate only transform and opacity. No animated blur, no animated box-shadow on scroll.

## 9. Components every thread uses

- **Card** = `ui/Surface.tsx` (`title`, `subtitle`, `actions`, `footerNote`): radius 16, padding 16 on phone and 20 on desktop, the rest elevation. The note goes in `footerNote`.
- **Section on phone**: `ui/Section.tsx` keeps its API; on phone (≤ 820px) its head renders as the card header of the first card inside it, or as a grouped list header inside the list's card.
- **Feature card**: once per view, `--ch-feature-bg`, flat.
- **The one toggle, the Practice style** (Nick, 15 Nov: "The Practice-style toggle everywhere"; S4.5, SYS-10; MOTION-AND-VISUAL 4.2): `ui/Segmented.tsx` and `.ch-seg` in `controls.css`, with no weights. A recessed linen well (`--ch-well-bg`, `--ch-well-shadow`) and a raised green thumb (`--ch-seg-on-bg`, its soft drop shadow `--ch-seg-on-shadow`), both capsules, the thumb 3px in (`--ch-seg-inset`), ivory text on it (`--ch-seg-on-ink`) and secondary ink at 600 off it. Three sizes: 44 for a page-level toggle on the phone (`size="lg"`, or `md` on the phone), 36 on the desktop and inside a card (`md`), 32 only in a dense card (`sm`). A 44px tap area on the phone. A page never sets the toggle's height, padding, gap or radius. It replaces every other toggle, segment and tab family, including the 11 Nov "filter" weight. `src/clubhouse/ui/__tests__/segmented-weight-css.test.ts` fails on a new selected-state style outside Segmented and holds the remaining page paints to a falling count. The pill's gradient is the one allowed gradient on a control.
- **Keys**: the primary key is solid `--ch-primary-bg` with `--ch-primary-shadow` (hover and press step the fill, never a gradient); the secondary key is `--ch-btn-secondary-bg` on the raised surface with a control edge.
- **Charts** (S2.1 to S2.8): one line component in the Oct 21 style (`ui/Line`): `--ch-chart-line` 2px, straight segments, one 6px dot on the newest round with a card-colour halo, the mean as an unlabelled 1px dashed `--ch-chart-zero` line named in the legend, the legend under the chart. Gridlines are `--ch-separator-chart`, 1px, dashed 2 4, at most three, none on a sparkline. Tracks and par segments carry the `--ch-chart-track-ring` so a fill on them meets 3:1. Charts sit on the ivory card, never on a green slab. Better is up, and the legend says "Lower is better" once.
- **Summary to detail (the Stats pattern)** (Nick, 31 Oct). Each area gets one summary card: title, the lead figure, one visual, a one-line note and a chevron. The whole card is the tap target and pushes that area's detail page. Nothing is cut: the summary is the way in, the detail holds everything.
- **Chips**: status as text on a 10% tint of its own colour, 13/600. Never a coloured edge.
- **Empty and failed states**: inside the card that would have held the data, not floating on the page.

## 10. Banned list (check every design and PR against it)

- Text directly on the phone page other than the large title and its context line
- A white or near-white surface (any channel at 253 or more), and a second ivory on a sticky bar
- A gradient behind text inside a card; a flat page colour in place of the page paint
- Accent left-border or coloured edge cards
- Pale mint or tinted highlight rows
- Brown for losses (use `--ch-loss` amber)
- A fourth elevation, a lit inset rim, a drop shadow under a sheet, a drop shadow that is not an elevation token
- A radius off the five steps; a raw `999px` (use `--ch-radius-full`)
- A type token other than the nine roles in a new rule
- A toggle, segment or tab family other than Segmented
- A literal colour in a page stylesheet
- Tracked uppercase, serif, emoji
- Count-up numbers, entrance staggers on page load
- Glass behind data
- Replacing or restyling the green top bar
- Loose cards with no grouping, uneven gaps, captions over two lines, tables on phone (law 6)

## 11. Hand-off

- Build pages to this file. A token that is not here goes into tokens.css first, then the generated tables (`node scripts/clubhouse/design-language.mjs`), then the artifact.
- Nothing here changes what shot tracking collects.

## Adopted from threads

Approved by Nick on 31 Oct (Classes, Roster and coach Home page), plus the phone Stats page. These are part of the language.

**Class-year colours** (avatars, leader cards, class-mix bar, year chip). White initials on the fill. Coaches and unknown years keep the neutral coin.

| Token | Light | White on it | Dark | White on it |
|---|---|---|---|---|
| `--ch-yr-sr` Senior | `#1F6B45` | 6.5 | `#2A7A51` | 5.3 |
| `--ch-yr-jr` Junior | `#3D6787` | 6.0 | `#46739A` | 5.0 |
| `--ch-yr-so` Sophomore | `#86672C` | 5.3 | `#8F6E31` | 4.7 |
| `--ch-yr-fr` Freshman | `#9A4A35` | 6.2 | `#A3533E` | 5.4 |

A year-coloured surface (leader card) is the year colour at 11% over `--ch-card-bg` with a 24% ring of it. Text on it stays primary and secondary ink.

**Class tones** (Classes binders, ribbon, dots): five muted pairs, tint plus ink, every ink over 5.4:1 on its tint and primary ink over 12.9:1. Light tint / ink: mist `#DCE2E3`/`#3E5055`, clay `#EBDDD3`/`#6A4A3C`, sand `#EFE6D2`/`#6B5A33`, stone `#E5E2DB`/`#4F4B43`, sage `#DEE5D9`/`#3F5444`. Dark pairs are in the Classes page's `:root[data-theme=dark]` block. These are colour fills of a whole card, not edges, so law 4 holds.

**Green team card**: the Roster's feature card (team, "7 active · 1 injured" with injured counted as active, class-mix bar, top five; practice rounds never count toward averages, leaders or the top five). It is that view's one feature card.

**Leader cards**: a horizontal snap row of three year-coloured cards (best average, best SG, most improved) under the team card on phone; across the top on desktop.

**Chart marks**: superseded on 15 Nov by spec S2.5 and S2.6; the values are the "Data marks" table in §3. Steady sparklines use the neutral ink, turning green or amber only when the change is past its likely error.

**Feature card text** on the green: primary `#F4F1E8`, secondary `#D3D9CB`, gain and under par `#8FD3AA` (4.7), loss `#EDB867`.

**Home**: player and coach Home both keep the green bar and the flat deep green hero under it (no glow behind text), greeting at 34pt, hero bottom radius 24, and an ivory lip into the page. On Home the bar takes `--ch-frame` too (the hero-mode bar rule in shell.css), so bar and hero read as one green. Every other section keeps the same green bar with its switcher and bell.

**Settled from the Classes thread's open calls** (31 Oct): the phone keeps the section strip, no tab bar; year colours replace the B19 id tone for players whose year is known; tinted identity cards (class binders, leader cards) count as identity, not a second card style, and the one-feature-card rule still holds. Settled at 13:47: no Captain tag; a plain "Injured" chip with no date; nothing on Classes without a source (no finals, holidays or travel); desktop drops the "Needs a look" strip.

**Completeness pass, 4 Nov 2026** (full list in `COMPLETENESS.md`):
- Practice groups D to F (N-00 allows six): D slate `--gD` #435466 with a white letter (7.78:1), dark #9FB0C2 with a #0E120F letter (8.51:1), tint #E8ECF0 / #1F252B; E and F the neutral coin #5F5C55 (white 6.67:1), dark #ADA697 (#0E120F 7.8:1), tint #EFEDE7 / #24261F. Groups are always told apart by their letter, never by colour alone. A to C as before (C plum).
- Feature cards are flat: no radial light anywhere (SHARED-2).
- Breakpoints: phone up to 820 (`useChPhone()`); above that, desktop. Between 821 and the full layout each lane's 05 gives its narrow-desktop rule: Team, Read and Lenses go full at 1180, Ask at 1280, Documents per N-10 §12.14. Desktop captures stay at 1280.
- XXL Text Size is `--ch-type-scale` 1.36. Where a lane file says 1.35 or 1.353, read 1.36.
- Motion clip checks compare springs and curves against `tokens.css` and `lib/motion.ts`, never against a design page's `linear()` strings.

**15 Nov 2026, production audit** (this edition): law 2 rewritten, §3 and §4 regenerated from tokens, the one toggle, solid keys, three elevations, container radii on five steps, chart rules S2.1 to S2.8, meta under body, the raw-colour ratchet.
