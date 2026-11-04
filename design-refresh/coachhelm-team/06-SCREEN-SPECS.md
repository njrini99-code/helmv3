# CoachHelm Team (the hole): screen specs

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 39 rows).
> Wiring, 4 Nov 2026: see the section of that name at the end of this file.

One section per screen ID from `05-SCREENS.md`, top to bottom in the order the eye meets each part. Values were read off the design page `redesign/coachhelm-team.html`: its CSS, script and computed styles, rendered in Chromium with the Instrument Sans the page loads, at the capture size (phone 390 by 844, large phone 430 by 932, desktop 1280 / 1440 / 1728; page as updated 3 Nov). Page px are written as pt. Where this file and `04-FIDELITY-SPEC.md` disagree, this file wins; the list is at the end of 05.

Every figure in quotes is fixture data from the page. The field it comes from is named under Data, pointing to `03-DATA-CHECKS.md` sections (written "03 §n").

Text sizes scale with Text Size: every type size below is multiplied by `--k` (1 at default, 1.12 one step up, 1.35 at XXL, the app's cap: 23/17 in `lib/dynamic-type.ts`). Boxes that hold text grow with it. SVG drawings (the hole, the huddle, the trend) don't scale.

Motion is in `07-MOTION.md`; acceptance in `08-ACCEPTANCE.md`. Neither is repeated here.

## Shared: colour tokens

Never paste a hex in a component; use the app token. Hex values are for checking screenshots.

| Page token | App token | Light | Dark |
|---|---|---|---|
| `--bg` | grouped background | #F2F0E9 | #0E120F |
| `--card` | card surface | #FFFEFB | #191E1A |
| `--well` | flat well | #F6F4EE | #141815 |
| `--ink` | text primary | #1C1B18 | #F1ECDF |
| `--ink-2` | text secondary | #46433D | #D0C9B8 |
| `--ink-3` | text tertiary | #5F5C55 | #ADA697 |
| `--gain` | gain text | #14613D | #7CC79B |
| `--loss` | loss text (amber, never red) | #9A5700 | #E7AE57 |
| `--loss-on-tint` | loss text on a loss tint (new, this lane) | #8A4D00 | #E7AE57 |
| `--accent` | accent | #155A39 | #7CC79B |
| `--gain-fill` | chart fill gain | #1F6B45 | #4FA877 |
| `--loss-fill` | chart fill loss | #B86F0C | #E09A35 |
| `--neutral-fill` | chart fill neutral | #6B675F | #A39D90 |
| `--track` | chart track | #EBE5D8 | #2C322D |
| `--zero` | zero line | #5F5C55 | #ADA697 |
| `--sep` | separator | rgb(28 27 24 / .10) | rgb(241 236 223 / .10) |
| `--ring` | card ring | rgb(28 27 24 / .07) | rgb(255 255 255 / .06) |
| `--tint-acc` | accent tint | rgb(21 90 57 / .10) | rgb(124 199 155 / .14) |
| `--tint-loss` | loss tint | rgb(154 87 0 / .11) | rgb(231 174 87 / .14) |
| `--nav` | `--ch-frame` (green bar) | #0A331F | #08150E |
| `--nav-ink` | `--ch-on-green-ink` | #F4EEDD | #F4EEDD |
| `--champ` | champagne (switcher dot) | #DCCDA6 | #DCCDA6 |
| `--feat` | feature card green | #0B3A25 | #123D29 |
| `--f-ink` | text on feature | #F4F1E8 | #F4F1E8 |
| `--f-ink-2` | secondary text on feature | #D3D9CB | #D3D9CB |
| `--f-gain` | gain on feature | #8FD3AA | #8FD3AA |
| `--f-loss` | loss on feature | #EDB867 | #EDB867 |
| `--scrim` | sheet scrim | rgb(14 12 8 / .34) | rgb(0 0 0 / .5) |
| `--seg-on` | segmented selected fill | gradient #1D7048 to #135A38; SHARED-2 allows the segmented chip's green shade, so it stays | same |
| primary button text | on accent | #F6F1E3 | #0E120F |
| player colours (coins) | existing roster colour | Eli #2F6B4F, Jonah #8A5A2B, Priya #4B5F8A, Theo #7A4E6E, Sam #5E6B3A | same |

Card: `--card` fill, radius 16, shadow light `0 1px 2px rgb(28 25 18/.05), 0 8px 20px -12px rgb(28 25 18/.12)`, dark `inset 0 1px 0 rgb(255 255 255/.04)`, plus a 1pt `--ring`. Every surface is a flat fill: the feature card and story viewer lost their radial lights on 3 Nov (SHARED-2). No borders, no accent left edges.

## Shared: contrast table

Measured WCAG ratios, light / dark. Target 4.9:1, floor 4.5:1; large text (24pt, or 19pt bold) and glyphs 3:1. Rows under target are marked with their fix.

| Pair | Light | Dark | Status |
|---|---|---|---|
| ink on card / bg / well | 17.08 / 15.10 / 15.66 | 14.34 / 16.01 / 15.20 | pass |
| ink-2 on card / bg / well | 9.77 / 8.64 / 8.96 | 10.25 / 11.45 / 10.87 | pass |
| ink-3 on card / bg / well | 6.61 / 5.85 / 6.06 | 6.99 / 7.80 / 7.41 | pass |
| gain on card / bg / well | 7.42 / 6.56 / 6.80 | 8.45 / 9.44 / 8.96 | pass |
| loss on card / bg / well | 5.57 / 4.93 / 5.11 | 8.53 / 9.52 / 9.04 | pass (light on bg is 4.93, just over target: keep loss text off `--bg` where it can sit on a card) |
| accent on card / bg / well | 8.15 / 7.21 / 7.48 | 8.45 / 9.44 / 8.96 | pass |
| loss-on-tint on loss tint, over card / over bg | 5.70 / 5.06 | 6.47 / 7.43 | pass |
| `--loss` on loss tint (what 04 replaced), over card / bg | 4.79 / 4.25 | 6.47 / 7.43 | fail light; use `--loss-on-tint` |
| gain on accent tint, over card / over bg | 6.35 / 5.63 | 6.36 / 7.38 | pass |
| accent glyph on accent tint (cicon, drill icon) | 6.98 | 6.36 | pass (3:1 glyph) |
| loss glyph on loss tint (notice icon) | 4.79 | 6.47 | pass (3:1 glyph) |
| primary button text on accent | 7.29 | 9.44 | pass |
| segmented on-text #F6F1E3 on #1D7048 (top) / #135A38 (bottom) | 5.37 / 7.31 | same | pass |
| nav-ink on nav; nav-ink at .86 | 12.03; 8.92 | 16.12; 11.51 | pass |
| f-ink / f-ink-2 / f-loss / f-gain on feat | 11.30 / 8.84 / 7.08 / 7.33 | 10.78 / 8.44 / 6.75 / 6.99 | pass |
| f-ink / f-ink-2 / f-loss on chip row (f-ink .07 over feat) | 9.32 / 7.29 / 5.84 | 8.85 / 6.93 / 5.55 | pass |
| f-ink on selected chip (f-ink .10 over the row) | 7.12 | 6.76 | pass |
| **f-loss on selected chip** | **4.46** | **4.23** | **under target and floor. Fix: on the selected chip draw the value in `--f-ink` (7.12 / 6.76); the loss colour stays on unselected chips (5.84 / 5.55).** |
| holes grid: f-ink-2 on plain cell (.09); f-ink on bogey (amber .22); f-ink on birdie (green .24); #2B1A00 on double (f-loss) | 6.94; 7.21; 6.58; 9.32 | 6.60; 6.93; 6.35; 9.32 | pass |
| story primary #0B3A25 on f-ink; story ghost f-ink on .12 | 11.30; 8.09 | 11.30; 7.67 | pass |
| toast: bg-colour text on ink | 15.10 | 16.01 | pass |
| sidebar group label (nav-ink .72); active link #0A331F on ivory .95 | 6.68; 11.01 | 8.34; 10.86 | pass |
| white initials on coins (Eli, Jonah, Priya, Theo, Sam) | 6.29, 5.87, 6.36, 6.68, 5.77 | same | pass |
| **ink-2 initials on coins (old page bug, fixed 3 Nov; sheet header and pattern)** | **1.57, 1.68, 1.55, 1.47, 1.71** | **3.81, 3.56, 3.85, 4.05, 3.50** | **fail. Fix: white, 600** |
| **f-ink-2 initials on coins (old page bug, fixed 3 Nov; story header)** | **4.36, 4.07, 4.41, 4.63, 4.00** | same | **fail. Fix: white, 600** |
| ink on hollow coin (card); f-ink on hollow coin (feat) | 17.08; 11.30 | 14.34; 10.78 | pass |
| marks on track: gain fill / loss fill / neutral fill | 5.15 / **3.15** / 4.49 | 4.50 / 5.52 / 4.86 | pass as non-text (3:1); light loss fill is closest at 3.15 |
| loss fill on card; gain fill on card | 3.92; 6.41 | 7.12; 5.80 | pass (non-text) |

## Shared: components used by many screens

### Card header `.ch`
- Box: fill width; padding 16 16 10; title left, meta right, baseline aligned; gap to body 0.
- Title: card title, 17 / 21.25 / 600, `--ink`, sentence case, 2 lines max then wraps (no ellipsis on the page; "Course and scoring" wraps to 2 lines at 390).
- Meta: 15 / 19.95 / 400, `--ink-2`, right aligned, 1 line.
- Contrast: 17.08 / 14.34 (title); 9.77 / 10.25 (meta).

### Read row `.rd`
- Box: fill; padding 12 16; gap 11 between coin column and text; heights 71.6 (one-line title) and 91.8 (two-line); separator `--sep` 1pt inset 56 from the left; chevron right.
- Coin: 30, player colour, initials 11.5 / 600 white (build value; see contrast).
- Title: 15.5 / 20.15 / 500 `--ink`, "Name: title" form on the board, wraps with no line cap.
- Evidence line: 13 / 15.6 / 400 `--ink-2`, then chips, gap 6.
- Chips: height 22.5, padding 5 8, radius 7, 12.5 / 1 / 600. Worth chip `--loss-on-tint` on `--tint-loss` (".6 a round"); claim chip "Solid read" `--gain` on `--tint-acc`; "Thin read", "Early", "Early read" `--ink-2` on `--well`; rounds chip "21 rounds" `--ink-2` on `--well`.
- Chevron: 8 by 14, stroke 1.8, `--ink-3`.
- Hit area: whole row, 71.6 tall or more.
- Order: feed order (the reads feed's own order, `READS` on the page); never re-sorted by size.
- Data: 03 §4 (open reads, caps), §5 (evidence, worth), claim word from `supportOf` (coach only).

### Bar row `.br`
- Box: fill; height 30; padding 0 (the page's spot rows leaked the browser's 1px 6px until 3 Nov; fixed); columns name 92, track flex, value 52; gap 10.
- Name: 14.5 / 17.4 / 500 `--ink`, 2 lines max.
- Track: height 14, radius 7, `--track`. Zero line at 84% across: 1.5 wide, 22 tall, `--zero`. Team average mark: 1.5 dashed `--ink-3`, 20 tall. Loss fill grows left from zero: width `min(|v| / 1.3 × 84%, 84%)`; gain fill grows right: `min(v / .25 × 16%, 16%)`. Fill radius 7. Loss uses `--loss-fill`, gain `--gain-fill`. Early players (under 5 rounds) get a hatched fill instead: 45° stripes, 4 of `--loss-fill` then 3 of `--loss-fill` mixed 45% with `--card`.
- Value: 14.5 / 1 / 600, right aligned in 52, `--loss` or `--gain`, one decimal with a true minus ("−1.1").
- Axis under the rows: 12.5 / 15 / 400 `--ink-3`, padding 4 16 12 118: "Team average dashed" left, "Tour" right over the zero line.
- Hit area: see S-TEAM.spot.

### Notice `.notice`
- Box: fill; padding 16; gap 12; icon tile 34 by 34, radius 10, `--tint-loss` with a 18 warning glyph (stroke 1.7) in `--loss`.
- Title: 15 / 19.5 / 600 `--ink`. Line: 14 / 19.6 / 400 `--ink-2`.
- Button when present ("Try again"): small ghost button, 36 tall, 14 / 600 `--accent`, padding 0 12, radius 12.

### Buttons
- Primary `.btn.pri`: height 42, radius 12, padding 0 15, 15 / 1 / 600, text #F6F1E3 on `--accent` (dark: #0E120F on #7CC79B). 7.29 / 9.44.
- Ghost `.btn.gh`: height 42, same type, `--accent` text on `--tint-acc`. Small `.btn.gh.sm`: 36 tall, 14 / 600, padding 0 12.
- Link `.lk` (the page rendered 16 / 400 ink by a specificity bug until 3 Nov; fixed): 14.5 / 1 / 600 `--accent`, padding 6 0, gap 6 to a trailing chevron. Hit area 44 tall (min-height 44).
- More `.more` (same bug, fixed 3 Nov): 14 / 1 / 600 `--accent`, padding 8 0, margin 0 16 10, left aligned. Hit area 44 tall (page min-height is 36).

### Sheet chrome (phone)
- Panel: absolute to the bottom, max-height 86%, hugs content, scrolls inside, `--bg`, radius 20 20 0 0, large shadow. Scrim `--scrim` over the board. (fixed 4 Nov: on phone this is today's `ui/Modal`, unchanged, so its own scrim token `--ch-scrim`, grabber `.ch-grab`, drag and timing are what ship; the page's rgb(14 12 8/.34) scrim and the grabber numbers below are the drawing only. Shared read sheet contract: Completeness pass section.)
- Grabber: 36 by 5, radius 3, `--track`, margin 8 auto 2. Not a tap target.
- Body `.ins`: padding 8 16 40 (desktop inspector 18 20 40), gap 14.
- Header `.insh`: coin or icon 30, name 16 / 20 / 600 `--ink` (fixed on the page 3 Nov), sub-line 13.5 / 17.55 / 400 `--ink-2`, close button `.xb` 34 circle on `--well` with a 1pt `--ring`, 14 X glyph stroke 1.9 in `--ink-2` (page renders `--ink`). Close hit area 44 by 44 (5 of transparent padding round the 34 circle).
- Test hooks (3 Nov): `data-ch-team-close` on the close button, `data-ch-team-scrim` on the scrim, `data-ch-team-grabber` on the grabber.
- Contrast: ink on bg 15.10 / 16.01; ink-2 on bg 8.64 / 11.45.

### Coin
- Sizes: 22 on the hole (r 11, 9.5 / 600), 24 on tiles, 30 in rows and headers (11.5 / 600), 26 in the huddle (initials 10.5 / 600).
- Filled: player colour, initials white 600. Hollow (fewer than 5 rounds, `early`): no fill, 1.5 ring in the player colour, initials `--ink` (on the hole `--f-ink`).
- Data: rounds on file and `early` from 03 §2.

---

## S-TEAM

The board at rest. Phone order: green bar, segmented, large title and context line, then cards with 24 between.

| Element | Box | Type | Colour (light / dark) |
|---|---|---|---|
| Green bar | fill; 110 tall (padding-top 44, bottom 18) with an 18 lip that curves into the page | n/a | `--nav` #0A331F / #08150E |
| Switcher "CoachHelm" | `.gb` 48 tall, padding 0 6 4 16; 44 tall control; champagne dot 6 before the word; chevron-down 15, stroke 2.4 | 18 / 1 / 600, −.216 tracking | `--nav-ink` #F4EEDD; dot `--champ` |
| Bell, plus icons | 44 by 44 each, glyph 22, stroke 1.9 (bell) and 2 (plus); badge 18 tall | badge numerals 600 | `--nav-ink` |
| Page sheet `.sheet` | padding 6 16 72 (20 edge at 414 wide and up); gap 24 | | `--bg` |
| Segmented `.seg2` "Team / Ask" | fill; 41 tall; padding 3; radius 12; segments 35 tall, radius 9 | 15 / 500 | track `--well`; selected `--seg-on` (gradient #1D7048 to #135A38; SHARED-2 allows this one green shade, and the shared control owns it), text #F6F1E3; unselected text `--ink-2` |
| Large title "Varsity" | hug; line 40.8 | 34 / 40.8 / 600, −1.156 tracking, width axis 88 | `--ink` |
| Context line | fill; 1 line at 390 | 15 / 20.25 / 400 | `--ink-2` |
| Cards | fill minus edges; cards 358 wide at 390; heights at default: This week 227.3, hole 634.3, spot 758.1, huddle 377.4, roster 345, Working on 200.1, record 310.6 | | see each ID |

Contrast: title 15.10 / 16.01 (ink on bg); context line 8.64 / 11.45; segmented selected 5.37 to 7.31; switcher 12.03 / 16.12.

Icons: chevron-down 15 (stroke 2.4) beside "CoachHelm"; bell 22; plus 22. All `--nav-ink`.

Hit areas: switcher 44 tall; bell and plus 44 by 44; segmented segments are 35 tall inside a 41 control, so extend each segment's hit area to 44 (1.5 above and below the control, transparent).

Data:
- Title: the team's name (the shell's resolved team).
- Context line: "{players} players · {rounds} rounds this season · {open} open reads". Players = active roster count (03 §2); rounds = sum of each player's counted rounds this season (03 §2; 21+18+16+4+3 = 62 in the fixture); open reads = reads drawn and counted as open (03 §4, after `drawnLater`; stale reads not counted). Empty: "{players} players · no rounds yet this season". Singular forms: "1 player", "1 round", "1 open read".

Desktop (1280 / 1440 / 1728):
- Sidebar 232 wide on `--nav`: logo 22 / 600; nav links 39.3 tall, padding 8 12, radius 9, 15 / 500 in nav-ink; the active link 600 in #0A331F on ivory .95; group labels 13 at .72.
- Main `.dmain` radius 12. Top bar 58 tall: title 17 / 600, segmented 180 by 34, scope text 14 `--ink-2`, search field 220 by 35.7, radius 10.
- Body `.dbody` padding 22 24 40; grid gap 18; rail `clamp(320px, 30%, 440px)`.
- Column heights end level: 985.8 at 1280, 914.3 at 1440, 953.3 at 1728, 444.5 for `1440-empty`.

Loading (`#loading`): segmented, title and context line stay; skeleton cards 180, 406, 258, 216; each has a title bar 42% wide by 16 and a 120 block, radius 12. Shimmer: white .45 (light), .06 (dark), f-ink .10 on the green. Desktop 1440: hero 360 and card 258 in the main column, rail 174 / 132 / 294, then 258 and 258.

**Redline (S-TEAM)**
1. Green bar 110 tall; switcher row 48.
2. Segmented 41 tall, segments 35, radius 12 / 9.
3. "Varsity" 34 / 40.8 / 600.
4. Context line 15 / 20.25 in ink-2.
5. Side edge 16 at 390 (20 at 430); cards 358 wide.
6. Gap between cards 24.
7. Card radius 16.
8. Desktop: sidebar 232, top bar 58, rail 320 at 1280, gap 18.

## S-TEAM.today

| Element | Box | Type | Colour |
|---|---|---|---|
| Header | card header; title "This week", meta "4 rounds · 2 new reads · 1 cleared" | 17 / 600; 15 / 400 | ink; ink-2 |
| Tile row `.tiles` | scrolls sideways, padding 0 16 16, gap 8 | | |
| Tile | 138 by 162, radius 15, padding 10 11 11, row gap 10; unread tiles: 2 inset ring `--accent` | | `--well` |
| Tile picture | fill by 44 (an SVG drawn from the story: hole strip, before/after bars) | | marks in `--loss-fill`, `--gain-fill`, `--track` |
| Tile title | 2 lines max, then ellipsis | 14.5 / 18.125 / 600 | ink |
| Tile foot | coin 24 plus text, 1 line | 12.5 / 15 / 400 | ink-2 |

Tile texts (fixture): "Two doubles from penalties" / "Eli · Thursday at Hilltop"; "Three-putts coming down" / "Jonah · Since Oct 12"; "Approaches slipped" / "Priya · Last 6 rounds".

Failed: notice (shared) "Couldn't load what's new" / "The weekly brief didn't load. Everything below is current." with "Try again".

Contrast: tile title ink on well 15.66 / 15.20; foot 8.96 / 10.87; accent ring as a non-text mark 7.48 / 8.96.

Hit areas: the whole tile, 138 by 162. "Try again" 36 tall, extend to 44.

Data: 03 §6. Stories are `ChMondayBrief` items from the last 7 days. Meta counts: rounds in the window, new reads, cleared reads, from the brief (the page text is static; build reads the brief). Unread ring: story not yet opened this session. Foot: player first name and the story's when-line.

Desktop: tiles become rows 288 wide, picture 96 by 36, padding 10 12, gap 12.

**Redline (S-TEAM.today)**
1. Tile 138 by 162, radius 15.
2. Gap between tiles 8.
3. Tile padding 10 11 11.
4. Picture 44 tall.
5. Title 14.5 / 600, 2 lines max.
6. Foot coin 24.
7. Unread ring 2, accent.

## S-TEAM.hole

The one green card on the board.

| Element | Box | Type | Colour |
|---|---|---|---|
| Card `.feat.hero` | fill (358 by 634.3 at 390); padding 18 16 14; radius 16 | | `--feat` #0B3A25 / #123D29, flat (no radial light) |
| Kicker "Where Varsity gives back strokes" | 1 line | 14 / 16.8 / 500 | f-ink-2 |
| Figure "−1.9" | hug | 40 / 40 / 500, −1.6 tracking, width axis 92 | f-ink |
| Figure sub "a round to Tour" / "This season · 62 rounds" | 2 lines beside the figure | 14 / 18.2 / 400 | f-ink-2 |
| Hole SVG | 338 by 409.7 at 390, margin 0 −6 | stations: label 13 / 500 (600 selected), value 19 / 600, −.38 tracking | labels f-ink-2 (selected f-ink); values f-loss; flight line f-ink .62, 1.7 stroke |
| Station halo | circle radius R = 10 + |team value| × 22: tee 15.41, approach 26.24, short game 15.81, putting 24.61 | | fill rgb(237 184 103 / .17), stroke 1.5; selected fill /.34, stroke 2.6 |
| Coins on the hole | 22 (r 11), each at its player's worst station | 9.5 / 600 | player colour, white initials; hollow for early |
| Chip row `.stchips` | 326 by 70.7; padding 3; gap 3; radius 12 | | f-ink .07 over feat |
| Station chip | 61.6 by 64.7; padding 8 4; radius 9; label over value | label 13 / 14.95 / 500; value 14 / 16.8 / 600 | label f-ink-2; value f-loss; Course value "5 reads" 500 in f-ink |
| Selected chip | same box; f-ink .10 fill and 1pt inset ring f-ink .18 | label f-ink | value: build f-ink (see contrast) |
| Foot line `.hfoot` | fill | 13 / 17.55 / 400 | f-ink-2 |

Chips (fixture): Tee −0.2, Approach −0.7, Short game −0.3, Putting −0.7, Course "5 reads" (early: "No reads"). Foot line: "Players stand where they lose most. Hollow: fewer than 5 rounds."

On Course: stations dim to opacity .38, coins to .5, the old station's halo drops to the resting fill and stroke.

Empty: "No rounds yet" at 40 / 500 in the figure's place; explainer 15 / 21.75 f-ink-2 "The hole fills in after the team's first round this season. Each spot then shows what it costs the team against Tour."; hole at opacity .55; no stations, coins, chips or foot line.

Contrast: kicker and sub f-ink-2 on feat 8.84 / 8.44; figure 11.30 / 10.78; station values f-loss on feat 7.08 / 6.75; chip labels 7.29 / 6.93; chip values 5.84 / 5.55; **selected chip value 4.46 / 4.23, under target: draw it in f-ink (7.12 / 6.76)**; coin initials 5.77 to 6.68; hollow coin initials 11.30 / 10.78.

Icons: flag 16 at the green (stroke 1.7, f-ink); no other glyphs.

Hit areas: chips 61.6 by 64.7 (pass). Stations on the hole: halo radius can be 15.41 (30.8 wide), so give each station an invisible 44 by 44 target centred on it. Coins are not tappable on the page; keep them that way (the bar rows and roster open players).

Data:
- Figure: team strokes to Tour a round, `team.total` (03 §1), one decimal, true minus. −1.912 shows as "−1.9".
- Per station: team mean per area, 03 §1 (tee −.246, approach −.738, short game −.264, putting −.664). One decimal. A player with no figure at an area is left out of that mean (03 "Area with no figure").
- Halo radius from the same value.
- Coins: each player at their worst area (03 §2); hollow under 5 rounds on file.
- Sub-line rounds: team rounds this season (03 §2).
- Course chip: count of open reads with no station (`areaOf` null, 03 §4 and §10), "N reads", "1 read", "No reads".

Desktop: hole lies flat, 610 by 215 at 1280; card padding 20 22 16; chip row `min(500px, 64%)` wide (390.4 at 1280).

**Redline (S-TEAM.hole)**
1. Card padding 18 16 14, radius 16.
2. Figure 40 / 500.
3. Hole 338 by 409.7 (at 390).
4. Approach halo radius 26.24; putting 24.61.
5. Coin 22, initials 9.5 / 600.
6. Chip row 70.7 tall, padding 3, gap 3.
7. Chip 61.6 by 64.7, radius 9.
8. Selected chip: .10 fill, .18 inset ring, value in f-ink.
9. Foot line 13 / 17.55.

## S-TEAM.spot

| Element | Box | Type | Colour |
|---|---|---|---|
| Header "Approach" / "−0.7 a round · biggest leak" | card header | 17 / 600; 15 / 400 | ink; ink-2 |
| Bars block `.bars` | padding 2 16 4; gap 9 between rows | | |
| Bar rows | shared bar row; order worst first: Eli −1.1, Priya −0.9, Sam −0.8, Jonah −0.5, Theo −0.4 | | |
| Axis | padding 4 16 12 118 | 12.5 / 15 | ink-3 |
| Subhead "What CoachHelm sees here · 3 open reads" | padding 6 16 | 13.5 / 16.2 / 600 | ink-2 |
| Read rows | shared read row, feed order; at 390 Eli's and Priya's titles wrap (91.8), Sam's is one line (71.6) | | |
| Pattern well `.pat` | margin 4 16 16; padding 12 14; gap 8; radius 14; overlapping coins 24 | | `--well` |
| Pattern title "Eli, Priya and Sam all miss approaches short" | wraps | 15 / 19.5 / 600 | ink |
| Pattern line "3 of 5 players · common step: the ball finishes short of the green" | wraps | 13.5 / 18.225 / 400 | ink-2 |
| "Add to practice" | small ghost button 36 tall | 14 / 600 | accent on tint-acc |
| No pattern line | padding as the well, no fill | 13.5 / 18.9 / 400 | ink-2 |

No pattern text: "No shared pattern here yet. CoachHelm needs three players with the same step before it calls one."

Contrast: bar names ink on card 17.08 / 14.34; bar values loss on card 5.57 / 8.53; axis ink-3 6.61 / 6.99; subhead 9.77 / 10.25; pattern on well 15.66 / 8.96 (light), 15.20 / 10.87 (dark); chips per shared table; "Add to practice" accent on tint-acc over well (above 6.35 light).

Icons: chevron 8 by 14 on read rows; none in the bars.

Hit areas:
- Bar rows are 30 tall on a 39 pitch (30 + 9 gap). 44 is not met on the page. Fix: row gap 14 (pitch 44), with the hit area the full 44 band; the card grows by 20 for five rows. Keep the 30 visual row.
- Read rows 71.6 and up: pass.
- "Add to practice": 36 visual, 44 hit area. Drawn only when the practice lane exports its entry (02-PLAN: never a dead button).

Data:
- Header value: the station's team mean (03 §1). "biggest leak" only on the station with the largest loss; other stations show "−0.2 a round" alone.
- Bars: each player's area figure this season (03 §2), worst first. Team average mark: the station mean. Players with no figure at the area are left off (03 "Area with no figure").
- Subhead count and rows: open reads at the station (03 §4, capped; stale reads excluded).
- Pattern: `computeTeamPatterns` at the station, three or more players sharing a step (03 §7). Off and failed differ (03 "Patterns off vs failed").
- Early: one read, chip "Early"; count "1 open read" (page says "reads").

Desktop: card splits in two columns: bars left (padding-top 12), reads and pattern right (padding-top 6).

**Redline (S-TEAM.spot)**
1. Bar row 30 tall; build pitch 44 (page 39).
2. Name column 92; value column 52.
3. Track 150 wide at 390, 14 tall, radius 7; zero line at 84%, 22 tall.
4. Axis left inset 118.
5. Subhead 13.5 / 600, padding 6 16.
6. Read row 71.6 (one line), padding 12 16, separator inset 56.
7. Chip 22.5 tall, radius 7.
8. Pattern well radius 14, padding 12 14, margin 4 16 16.
9. "Add to practice" 36 tall (44 hit).

## S-TEAM.course

| Element | Box | Type | Colour |
|---|---|---|---|
| Header "Course and scoring" / "Not on the hole · 5 open reads" | card header (title wraps to 2 lines at 390) | 17 / 600; 15 / 400 | ink; ink-2 |
| Figure "+6.4" | hug; at 390 the figure row wraps, the recent chip drops under the figure (row 69.3 tall) | 32 / 32 / 600, −1.12 tracking | ink |
| Figure sub "a round to par" / "This season · 62 rounds" | | 13 / 16.9 / 400 | ink-2 |
| Recent chip "Last 4 weeks +6.0" | chip | 12.5 / 600 | gain on tint-acc |
| Trend SVG | 326 by 120.2 | last value label 12.5 / 600 ink "+6.1"; season label 11 / 600 "+6.4"; months 11 / 500 "Aug Sep Oct" | team line `--ink`; season line `--ink-3` dashed |
| Key `.tkey` | gap 4 14; swatches 14 wide | 12.5 / 400 | ink-3: "Team, week by week · Season · Higher is better" |
| Reads | shared read rows; top 3 then "Show 2 more" | | |
| Team against Tour grid | 3 by 2 cells, 1pt `--sep` gaps; cells 118.7 wide; row 1 101 tall, row 2 116 ("Double or worse" wraps to 2 lines); padding 11 14 13 | label 12.5 / 500; value 19 / 21.85 / 600, −.19 tracking; Tour line 12 / 15.6 | label ink-2; value ink; Tour line ink-3 |
| Grid label "Team against Tour · this season" | subhead | 13.5 / 600 | ink-2 |
| Courses subhead "Courses this season · 5" | subhead | 13.5 / 600 | ink-2 |
| Course row | 59 tall; padding 11 16; gap 12; separator inset | name 15 / 18.75 / 500; sub 12.5 / 16.25; value 15 / 18 / 600; delta 12.5 / 500 | name ink; sub ink-2; value ink; delta gain or loss, "Level with season" 400 ink-2 |
| "Show all 5 courses" / "Show 2 more" / "Show fewer" | shared More | 14 / 600 (page renders 16 / 400) | accent |

Grid cells (fixture): Par 3s "+0.36 a hole · Tour +0.00"; Par 4s "+0.27 · Tour −0.03"; Par 5s "+0.02 · Tour −0.45"; Penalty strokes "0.6 a round · Tour 0.3"; Double or worse "6.1% of holes · Tour 2.0%"; First hole "+0.12 vs average hole · Tour +0.10".

Course rows (fixture): Oak Hollow "33 rounds · last Oct 26 · 1 read" +5.9 "0.5 under season"; Hilltop "15 · Oct 29" +7.5 "1.1 over season"; Lakeside "5 · Sep 16" +6.4 "Level with season"; Ridgeview "5 · Aug 18" +7.4 "1.0 over season"; Brookfield "4 · Oct 14" +5.0 "1.4 under season" (fifth, behind "Show all").

Reads (fixture, top 3): Eli "Penalty strokes: 1.1 per round"; Jonah "Double bogey-or-worse rate: 7.6%"; Eli "Worst holes on Oak Hollow: #4, #11, #17"; then Theo "Par 3 scoring: 3.48 (+0.48 vs par)" and Priya "Opening hole gap: +0.19 strokes vs round avg".

Under to par, lower is better, so "under season" is gain and "over season" is loss. The trend key says "Higher is better" because the chart's y axis is flipped (lower scores plot higher).

Contrast: figure ink on card 17.08 / 14.34; subs and grid labels ink-2 9.77 / 10.25; Tour lines and key ink-3 6.61 / 6.99; deltas gain 7.42 / 8.45, loss 5.57 / 8.53; recent chip gain on tint-acc 6.35 / 6.36.

Icons: chevron on course rows (8 by 14, ink-3).

Hit areas: course rows 59 (pass); reads (pass); More buttons extend to 44.

Data (03 §10): team to par from `golf_rounds.score_to_par`, season mean; weekly series for the trend; course rows grouped by `course_id` / `course_name` with round counts and last date; delta = course mean minus season mean, one decimal, "Level with season" when it rounds to 0.0. Grid: `scoring_par_3/4/5` (two decimals, "a hole"), `penalty_rate_per_round` (one decimal), `big_number_rate` (percent, one decimal), `opening_hole_delta` (two decimals) against `pga_value`. Reads: open reads with no station (03 §4). Early state: "Early season" chip in place of "Last 4 weeks", grid label "Team against Tour · from 16 rounds", no reads line "No course or scoring reads yet. Penalties, big numbers, par scoring and the first hole get read once a player has enough rounds to stand behind it."

**Redline (S-TEAM.course)**
1. Figure 32 / 600.
2. Trend 326 by 120.2.
3. Grid cell 118.7 by 101 (second row 116), padding 11 14 13.
4. Grid value 19 / 600.
5. Course row 59 tall, padding 11 16.
6. Course value 15 / 600; delta 12.5 / 500.
7. Four courses then "Show all 5 courses"; three reads then "Show 2 more".
8. More button 14 / 600 accent, 44 hit.

## S-TEAM.course.all

Same specs as S-TEAM.course with every row showing. Both More buttons read "Show fewer" and keep their place at the end of their lists. `aria-expanded` true on each.

**Redline (S-TEAM.course.all)**
1. 5 course rows, each 59.
2. 5 read rows.
3. "Show fewer" under each list.
4. Desktop 1728: both columns end level at 1196.
5. No inner scroll in the card.

## S-TEAM.course-sheet

| Element | Box | Type | Colour |
|---|---|---|---|
| Panel | sheet chrome; 646.7 tall at 390 by 844 | | `--bg` |
| Header | course icon tile 30 (accent glyph on tint-acc), name "Hilltop", sub "15 rounds this season · last Oct 29", close 34 | 16 / 20 / 600; 13.5 / 17.55 | ink; ink-2 |
| Figure "+7.5" | | 32 / 600 | ink |
| Figure sub "a round to par here" / "1.1 over the team's season of +6.4" | | 13.5 | ink-2 |
| Card "Players here" / "Against their own season" | card header | | |
| Player row `.cp` | 54.4 tall; padding 10 16; gap 10; coin 30 | name 14.5 / 500; sub 12.5 "4 rounds here"; value 14.5 / 600; delta 12 / 500 | ink; ink-2; ink; loss or gain |
| Dumbbell | 117.4 by 14: line 2 tall in `--loss-fill` (gain fill when better); "here" dot 10 filled `--ink`; "season" dot 10 hollow with 2 `--ink-3` ring | | |
| Key | padding 2 16 12; gap 16 | 12.5 | ink-3: "Here" / "Their season" |
| Story link "Read the story from Thursday at Hilltop" | shared link | 14.5 / 600 (page renders 16 / 400) | accent |
| Footnote `.cnote` | | 13.5 / 1.45 (page renders 15.5 / 22.475 because `.ins .lede` also applies) | ink-2 |

Player rows (fixture), best first: Jonah +4.6 "0.7 over"; Priya +7.1 "0.9 over"; Theo +9.0 "0.7 over"; Eli +9.4 "1.6 over"; Sam +10.0 "0.9 over".

Footnote: "Every counted round here this season, practice, qualifiers and tournaments. To par uses the tees each player played."

Contrast: name ink on bg 15.10 / 16.01 (fixed on the page 3 Nov; was ink-2 at 8.64 / 11.45); values ink on card 17.08 / 14.34; deltas loss on card 5.57 / 8.53; key ink-3 on bg 5.85 / 7.80; course icon glyph accent on tint-acc 6.98 / 6.36 (fixed on the page 3 Nov).

Icons: course glyph (crosshair circle, 22 artboard, stroke 1.8) in the 30 tile; close X 14.

Hit areas: player rows 54.4 (pass); close 34 visual, 44 hit; story link 44 tall.

Data (03 §10): rounds and last date for the course; course mean to par and its difference from the team season mean; per player: rounds here, mean here, own season mean, difference (one decimal, "over" or "under"). Story link only when a story exists for the course's latest round (03 §6).

**Redline (S-TEAM.course-sheet)**
1. Panel radius 20; grabber 36 by 5.
2. Body padding 8 16 40, gap 14.
3. Header icon 30; close 34.
4. Figure 32 / 600.
5. Player row 54.4, padding 10 16.
6. Dumbbell 117.4 wide, dots 10.
7. Key 12.5 ink-3.
8. Panel 646.7 tall at 390 by 844 (under the 86% cap).

## S-TEAM.read-sheet

| Element | Box | Type | Colour |
|---|---|---|---|
| Panel | sheet chrome; 654.2 tall at 390 by 844 | | `--bg` |
| Header | coin 30, "Eli Brandt", "Approach · 21 rounds this season", close 34 | 16 / 20 / 600; 13.5 / 17.55 | ink; ink-2 |
| Title "Long approaches finish short-right" | wraps, no cap (2 lines, 54.3, at 390) | 23 / 27.14 / 600, −.414 tracking | ink |
| Lede "From 175 yards and out, 9 of Eli's 16 missed greens finish short and right." | wraps | 15.5 / 22.475 / 400 | ink-2 |
| Chips, gap 6 | shared chips | 12.5 / 600 | "Worth .6 a round" loss-on-tint on tint-loss; "Solid read" gain on tint-acc; "Cause: Counted" and "This season" ink-2 on well |
| Ladder card "Greens hit from 175 yd and out" / "Higher is better" | card header; `.lad` padding 2 16 16, gap 10 | | |
| Ladder row | 17.4 tall; label column 70; track 12 tall, radius 6; value 14.5 / 600 | label 14.5 / 500 | Eli fill `--loss-fill`, Team `--neutral-fill`, Tour `--gain-fill`; values ink |
| Drill card | padding 14 16; gap 12; icon tile 40 by 40, radius 12, tint-acc with a 20 target glyph (stroke 2) in accent | title 15.5 / 600; sub 14 / 18.9 | ink (fixed on the page 3 Nov); ink-2 |
| Actions | row, gap 10, each 42 tall, equal width (174 at 390) | 15 / 600 | "Assign as focus" primary; "Ask about this" ghost |
| "Open the full read" | shared link | 14.5 / 600 | accent |

Ladder (fixture): Eli 31%, Team 38%, Tour 52%. Drill: "Carry ladder, 175 to 200 yd" / "20 min · ball striking".

Contrast: title ink on bg 15.10 / 16.01; lede ink-2 on bg 8.64 / 11.45; chips per shared table (worth chip over bg 5.06 / 7.43, solid chip over bg 5.63 / 7.38); ladder marks on track 3.15 to 5.15 (non-text pass); primary button 7.29 / 9.44; drill glyph 6.98 / 6.36.

Icons: drill target 20 (stroke 2), close X 14, link chevron.

Hit areas: action buttons 42 visual, 44 hit; close 44 hit; link 44 tall.

Data:
- Header sub: station name and the player's rounds this season (03 §2).
- Title, lede, worth, claim word, cause: the read's evidence (03 §5); claim and "Likely" cause coach only.
- Ladder: the read's ladder rows, player / team / Tour (`ChLadderRow`, 03 §5); a row with `missing` shows its own line in place of the bar.
- Drill: the read's drill (03 §5); none: S-TEAM.read-sheet.gathering.
- Assign: existing focus write (03 §8); hidden when assigned or declined is unknown (03 "Side reads failed").

**Redline (S-TEAM.read-sheet)**
1. Title 23 / 27.14 / 600.
2. Lede 15.5 / 22.475.
3. Chip gap 6, chip 22.5 tall.
4. Ladder row 17.4, label column 70, track 12.
5. Drill icon tile 40, radius 12.
6. Buttons 42 tall, gap 10.
7. Panel 654.2 tall at 390 by 844.

## S-TEAM.read-sheet.assigning

- The primary button keeps its box (44 tall, same width; fixed 4 Nov: 44, the shared sheet footer height), turns disabled, and shows an 18 spinner then today's `FocusActions` in-flight label (15 / 600), gap 8 (fixed 4 Nov: not "Proposing"). Colours as the primary button.
- Page holds it 700ms; the app holds it until the write returns.
- Contrast: as primary, 7.29 / 9.44. A disabled look must keep that contrast (no opacity drop under .9).
- Hit area: none while busy (disabled).
- Data: existing focus write (03 §8).

**Redline (S-TEAM.read-sheet.assigning)**
1. Button width unchanged from rest.
2. Spinner 18.
3. Label is today's `FocusActions` in-flight string (fixed 4 Nov: was "Proposing").
4. Button 42 tall.
5. "Ask about this" stays enabled.

## S-TEAM.read-sheet.assigned

- Row in the primary button's place: 42 tall, padding 0 14, radius 12, `--tint-acc` fill, check glyph 18 (stroke 2.2) then "Proposed to Eli · now in Working on", 14.5 / 600 `--gain`. "Ask about this" keeps its place beside it.
- Page sample is r8: "Penalty strokes: 1.1 per round", ladder "Penalty strokes a round" / "Lower is better" (Eli 1.1, Team 0.6, Tour 0.3), drill "Pick the safe line: 9-hole game" / "30 min · on course".
- Working on gains the row "Eli · Penalty strokes: 1.1 per round" / "From 1.1 now · Eli sets the target" / "Proposed · Eli accepts it in their app".
- Contrast: gain on tint-acc over bg 5.63 / 7.38.
- Hit area: the row is not a button.
- Data: proposal state from the focus write (03 §8); status words "Proposed", then "Active" / "In progress" once accepted.

**Redline (S-TEAM.read-sheet.assigned)**
1. Row 42 tall, radius 12.
2. Padding 0 14.
3. Check 18.
4. Text 14.5 / 600 gain.
5. Working on count goes up by one.

## S-TEAM.read-sheet.gathering

- Header "Sam Whitfield" / "Approach · 2 rounds this season" (fixture; its lede says "from 6 rounds").
- Title "Proximity from 125 to 175"; chips "Worth .4 a round", "Early", "Cause: Not traced", "This season".
- Ladder: Sam 41 ft, Team 33 ft, Tour 27 ft ("Lower is better").
- Drill card replaced by a line pair: "Still gathering" (15.5 / 600 ink) / "4 more rounds before CoachHelm suggests a drill" (14 / 18.9 ink-2). No Assign button; "Ask about this" stays.
- Contrast: as the read sheet.
- Data: rounds to go before a drill (03 §5 and 03 "Player with no reads": `roundsToGo` once exported). Unknown: "Still gathering" alone.

**Redline (S-TEAM.read-sheet.gathering)**
1. No primary button.
2. "Still gathering" in the drill card's place, same padding 14 16.
3. Chip "Early" ink-2 on well.
4. Ladder units "ft".
5. Header shows the read's own round count.

## S-TEAM.read-sheet.no-tour

- Ladder draws Eli and Team rows only, then one line 12.5 / 400 `--ink-3`: "No Tour figure for single holes, so none is drawn."
- Contrast: ink-3 on card 6.61 / 6.99.
- Data: `ChLadderRow.missing` for the Tour row (03 "Area with no figure").

**Redline (S-TEAM.read-sheet.no-tour)**
1. Two ladder rows.
2. Missing line 12.5 ink-3.
3. Same gap 10 between rows and line.
4. Rest of the sheet unchanged.
5. No empty Tour track drawn.

## S-TEAM.player-sheet

| Element | Box | Type | Colour |
|---|---|---|---|
| Header | coin 30, "Eli Brandt", "Jr · 21 rounds · −2.1 a round to Tour", close 34 | 16 / 20 / 600; 13.5 / 17.55 | ink; ink-2 |
| Card "Where Eli gains and loses" / "This season" | card header | | |
| Bars | shared bar rows, padding 0, 30 tall, pitch 39: Tee −0.3, Approach −1.1, Short game −0.2, Putting −0.5 | | |
| Axis | as spot card | 12.5 | ink-3 |
| Card "Open reads" / "3" | card header, then shared read rows without the "Name:" prefix | | |
| Link "Open Eli's page" | shared link | 14.5 / 600 | accent |

Open reads (fixture, feed order): "Long approaches finish short-right"; "Penalty strokes: 1.1 per round"; "Worst holes on Oak Hollow: #4, #11, #17". Panel 693.9 tall at 390 by 844.

Contrast: as the read sheet; bar values loss on card 5.57 / 8.53.

Hit areas: bar rows here are not buttons (no target needed); read rows pass; link 44.

Data: class year and rounds (03 §2), total to Tour (03 §1 per player), four area figures (03 §2), open reads (03 §4). Early: sub-line adds " · early". No reads: "Open reads" 0 and "No open reads." in ink-2.

**Redline (S-TEAM.player-sheet)**
1. Header coin 30.
2. Four bar rows, 30 tall, gap 9.
3. Name column 92, value column 52.
4. Read title 15.5 / 500.
5. Link 14.5 / 600 accent, 44 hit.
6. Card gap 14.

## S-TEAM.player-sheet.no-rounds

- Header sub "Jr · no rounds yet this season".
- Notice (shared): 16 padding, icon 34 radius 10, title "Nothing to show yet", line "Eli's four-area figures show after their first round this season."
- No bars card, no reads card. Link "Open Eli's page" stays.
- Contrast: notice title ink on bg 15.10 / 16.01; line ink-2 8.64 / 11.45; icon glyph 4.79 / 6.47 (3:1 glyph).
- Data: rounds this season 0 (03 §2).

**Redline (S-TEAM.player-sheet.no-rounds)**
1. Notice padding 16, gap 12.
2. Icon tile 34, radius 10.
3. Title 15 / 600; line 14 / 19.6.
4. No bars drawn.
5. Link still present.

## S-TEAM.story

Full screen over the phone (390 by 844), flat `--feat` fill (no radial light, SHARED-2), padding 54 16 34. Test hook: `data-ch-team-story-viewer` on the viewer.

| Element | Box | Type | Colour |
|---|---|---|---|
| Progress `.prog` | fill by 3; one bar per story, gap 4, radius 2; track f-ink .25, fill f-ink | | |
| Header `.sto-h` | coin 30, name, sub-line, close 34 on f-ink .12; gap 10 | name 15 / 18 / 600; sub 13 / 16.9 | build: name f-ink, sub f-ink-2 (page renders both f-ink-2) |
| Body `.sto-b` | flex column, centred vertically in the space, gap 22 | | |
| Headline "Eli made two doubles from penalties at Hilltop" | wraps, no cap | 30 / 33 / 600, −.75 tracking, width axis 90 | f-ink |
| 18-hole grid | 9 columns, gap 5; cells 35.3 square at 390, radius 8 | 13 / 1 / 600 | plain: f-ink-2 on f-ink .09; bogey: f-ink on amber .22; birdie: f-ink on green .24; double or worse: #2B1A00 on f-loss |
| Body text | | 16 / 23.2 / 400 | f-ink-2 |
| Source "Thursday's round · 18 of 18 holes with shots tracked" | | 13 / 17.55 | f-ink-2 |
| Footer `.sto-f` | two buttons, 42 tall, gap 10, 174 wide each at 390 | 15 / 600 | "Open the penalty read": #0B3A25 on f-ink; "Next": f-ink on f-ink .12 |

Stories 2 and 3 (fixture, no hash): "Jonah's three-putts are coming down" with bars "Before the focus 0.9 a round" / "Last 5 rounds 0.5 a round" and note "Line: the 0.4 target"; "Priya's approaches slipped" with "First 10 rounds −0.70" / "Season to date −0.89". A story with no read goes to Working on instead. The last story's second button reads "Done".

Contrast: headline 11.30 / 10.78; body and source f-ink-2 8.84 / 8.44; grid cells 6.35 to 9.32; buttons 11.30 and 8.09 / 7.67; coin initials: page 4.00 to 4.63 (fail), build white 5.77 to 6.68.

Icons: close X 14 in f-ink.

Hit areas: close 34 visual, 44 hit; buttons 42 visual, 44 hit; tap left third / right two-thirds of the body steps back / forward is not on the page: build only the drawn controls. Each story runs 5200ms then advances; under Reduce Motion it never auto-advances (Next only) and the current progress bar shows full.

Data (03 §6): story kind, player, when-line, headline, per-hole score to par for the round (cell colour: under par green, one over amber, two or more over f-loss), body, source line ("holes with shots tracked" count), the linked read.

**Redline (S-TEAM.story)**
1. Padding 54 16 34.
2. Progress bars 3 tall, gap 4.
3. Header coin 30, close 34.
4. Headline 30 / 33 / 600.
5. Grid cell 35.3 at 390, gap 5, radius 8.
6. Body 16 / 23.2.
7. Buttons 42 tall, 174 wide, gap 10.

## S-TEAM.story.desk

- Inside the inspector (padding 18 20 40): a green block on `--feat`, padding 18, radius 16, holding the header, headline 22 / 26.4 / 600, the 18-hole grid, body and source line (13.5).
- Under it a full-width primary-style button "Open the penalty read" (#0B3A25 on f-ink inside the block; 42 tall).
- No progress bars, no Next.
- Contrast: as the phone story.
- Data: as the phone story.

**Redline (S-TEAM.story.desk)**
1. Inspector width 420.
2. Green block padding 18.
3. Headline 22 / 26.4.
4. Source line 13.5.
5. Button full width, 42 tall.

## S-TEAM.huddle

| Element | Box | Type | Colour |
|---|---|---|---|
| Header "The huddle" / "Strokes to Tour a round" | card header | | |
| Plot `.hud` | padding 0 10 4; SVG 338 by 270.4 at 390 | | |
| Quadrant labels | "Scores well, strikes poorly", "Behind on both", "Strikes well, leaks scoring" | 11 / 400 | ink-3 |
| Axis titles | "Ball striking: tee and approach" (x); "Scoring: short game and putting" (y) | 11.5 / 500 | ink-2 |
| Tour cross and label "Tour" | 1pt lines through Tour (0, 0) | 11 / 600 | gain |
| Dots | circle r 13 (26 wide), player colour fill and stroke; early: `--card` fill with a dashed 2 stroke (3.5 on, 2.5 off) | 10.5 / 600, centred | initials white; early initials ink |
| Trail | line from the first-10 point (small ghost dot r 4) to now, player colour | | |
| Team average | dashed lines | | ink-3 |
| Legend | padding 4 16 14; gap 4 14 | 12.5 / 16.875 | ink-2 |

Legend: "Line: from their first 10 rounds to now", "Dashed: team average", "Hollow: fewer than 5 rounds". Drop the first line when no trails draw.

Contrast: quadrant labels ink-3 on card 6.61 / 6.99; axis titles ink-2 9.77 / 10.25; "Tour" gain 7.42 / 8.45; legend 9.77 / 10.25. Dot initials white on the player colour 5.77 to 6.68; early initials ink on card 17.08 / 14.34.

Icons: Play triangle 14 (filled) on the play control when trails exist.

Hit areas: each dot opens the player sheet; give each a 44 by 44 target centred on the dot. Where two targets overlap, the dot drawn on top wins.

Data: x = tee + approach, y = short game + putting, each player's season figures (03 §2); trails from first-10-rounds standing (03 §3; drawn only where 02 §9.2 lands); hollow under 5 rounds.

**Redline (S-TEAM.huddle)**
1. Plot 338 by 270.4 at 390.
2. Dot 26, initials 10.5 / 600.
3. Quadrant labels 11 ink-3.
4. Axis titles 11.5 / 500.
5. Legend padding 4 16 14.
6. Dot hit area 44.

## S-TEAM.roster

| Element | Box | Type | Colour |
|---|---|---|---|
| Header "Roster" / "T · A · S · P" | card header | | |
| Row `.rr` | 59.5 tall; padding 11 16; gap 12; separator inset 58 | | |
| Coin | 30 | 11.5 / 600 | player colour, white initials; hollow when early |
| Name | wraps, 2 lines max | 16 / 20 / 500 | ink |
| Sub "Jr · 21 rounds" (adds " · early") | 1 line | 13.5 / 17.55 | ink-2 |
| Finger-print | 60 by 34: four columns T A S P, each a bar from a baseline, loss fill | | `--loss-fill`, `--gain-fill`, `--track` |
| Total | right aligned | 15 / 18 / 600 | loss or gain |
| Open count "3 open" | under the total | 12.5 | ink-2 |

Order (fixture): Theo −2.2 "3 open"; Eli −2.1 "3 open"; Sam −1.9 "2 open"; Jonah −1.8 "3 open"; Priya −1.7 "3 open". Biggest loss first.

Empty build rule: rows show coin, name, "Fr · 0 rounds · early" and "No rounds yet" in the figure's place (no finger-print, no total, no "0 open").

Contrast: name 17.08 / 14.34; sub 9.77 / 10.25; total loss 5.57 / 8.53; open count 9.77 / 10.25; finger-print marks per marks row.

Icons: none (chevron not drawn on the page; the whole row is a button).

Hit areas: rows 59.5 (pass).

Data: name (03 §2), class year, rounds, early; four area figures for the finger-print (03 §2); total to Tour (03 §1); open count per player (03 §4).

Desktop: rows 68 tall, padding 12 18, gap 16; adds a chip "Loses most: Putting" (or the area) and a 78 by 44 finger-print with T A S P labels. Card height equals the record card's (387.3; empty 355).

**Redline (S-TEAM.roster)**
1. Row 59.5, padding 11 16.
2. Coin 30.
3. Name 16 / 500.
4. Finger-print 60 by 34.
5. Total 15 / 600.
6. Separator inset 58.
7. Desktop row 68, finger-print 78 by 44.

## S-TEAM.working

| Element | Box | Type | Colour |
|---|---|---|---|
| Header "Working on" / "2 focus areas" | card header | | |
| Row | about 76 tall; padding 10 16; gap 12 | | |
| Ring | 38: track `--track`, arc `--gain-fill` for progress toward target | | |
| Title "Jonah · Lag putting from 30 ft and out" | wraps | 15 / 19.5 / 500 | ink |
| Line "Three-putts 0.9 to 0.5 a round · target 0.4" | wraps | 13.5 / 18.225 | ink-2 |
| Status "Active · 5 rounds in" / "In progress · 3 rounds in" | | 13.5 / 600 for the status word | Active gain; In progress ink-2 |
| Empty line | | 13.5 | ink-2 |

Empty: "Nothing in progress yet. Assign a read as a focus and it shows here."

Contrast: title 17.08 / 14.34; line 9.77 / 10.25; Active gain 7.42 / 8.45.

Icons: none.

Hit areas: rows are not buttons on the page.

Data (03 §8): `ChBriefWorking` rows: player, focus, from / now / target, status words "Active" and "In progress", rounds since start. Meta "N focus areas" (singular "1 focus area"), updated after Assign.

**Redline (S-TEAM.working)**
1. Ring 38.
2. Row padding 10 16, gap 12.
3. Title 15 / 500.
4. Line 13.5 / 18.225.
5. Status word 600, gain when Active.

## S-TEAM.record

| Element | Box | Type | Colour |
|---|---|---|---|
| Header "How often CoachHelm is right" | card header | | |
| Figure "36 of 55" | | 34 / 34 / 500, −1.19 tracking, width axis 92 | ink |
| Figure line "reads held up when re-checked" | | 15 | ink-2 |
| Levels `.rec` | padding 0 16 16; gap 12 | | |
| Level row `.lv` | label column 128, track flex, count right; gap 10 | label 14 / 16.8 / 500; count 13.5 | label ink; count ink-2 |
| Track | 10 tall, radius 5, `--track`; fill `--gain-fill` (Working hypothesis `--neutral-fill`); target mark 2 by 18, radius 1, `--ink` | | |
| Footer | padding 10 16 12: "Line: the target for that level" left, "Re-check reads" right | 12.5 ink-3; link 14.5 / 600 accent (page renders 13.5 / 400 ink-2) | |

Levels (fixture): Seen repeatedly 9 of 10; Observed 11 of 14; Likely 8 of 12; Working hypothesis 5 of 9 (label wraps to 2 lines); Not enough yet 3 of 10.

Failed: notice "Track record unavailable right now" / "It shows again once the check runs. No number is shown in its place."

Contrast: figure 17.08 / 14.34; labels 17.08 / 14.34; counts 9.77 / 10.25; fills on track 5.15 / 4.50 (gain), 4.49 / 4.86 (neutral); target mark ink on track, well above 3:1.

Hit areas: "Re-check reads" 44 tall.

Data (03 §9): reads re-checked and held up, per level; `RUNG_TARGETS` for the target marks; a level shows only once `TRACK_RECORD_MIN_RECHECKED` (10) is met overall. Unavailable, failed and empty are three different states (03 "States the screen needs").

Desktop: each level adds its target as text in ink-3.

**Redline (S-TEAM.record)**
1. Figure 34 / 500.
2. Label column 128.
3. Track 10 tall, radius 5.
4. Target mark 2 by 18.
5. Levels gap 12.
6. Footer padding 10 16 12.

## S-TEAM.empty-steps

| Element | Box | Type | Colour |
|---|---|---|---|
| Header "What fills in, and when" | card header | | |
| Step row | padding 10 0; gap 12; number circle 26 | number 600 | circle `--well`, number ink |
| Step title | | 15 / 500 | ink (fixed on the page 3 Nov) |
| Step line | wraps | 13.5 / 18.9 | ink-2 |

Steps: "After the first round" / "The hole and each player's four-area figures, against Tour."; "As rounds add up" / "Players are drawn hollow until they have 5 rounds on file. CoachHelm reads a spot once there are enough shots to stand behind it."; "When three players share a step" / "A shared pattern shows on that spot, with Add to practice."

Contrast: title ink 17.08 / 14.34; line 9.77 / 10.25.

Data: shown when team rounds this season is 0 (03 §1, §2). The "5 rounds" is the hollow threshold; 02's `TEAM_EARLY_ROUNDS` is 15 while 04 H says 5. Use one constant and print it here.

**Redline (S-TEAM.empty-steps)**
1. Number circle 26.
2. Row padding 10 0, gap 12.
3. Title 15 / 500 ink.
4. Line 13.5 / 18.9.
5. Three rows.

## S-TEAM.inspector

- Panel: absolute, top 58, right 0, bottom 0, width 420, `--bg`, a 1pt `--sep` on its left edge plus the large shadow, scrolls on its own, `--edge` 20.
- Body `.ins` padding 18 20 40, gap 14. Same parts as the phone sheets (read, player, course, story) with these differences: no grabber; action buttons 185 wide each at 1440; the story shows as S-TEAM.story.desk.
- The board behind stays where it is; no scrim on desktop.
- Contrast: as the sheets (on `--bg`).
- Hit areas: close 44; rows as on phone.

**Redline (S-TEAM.inspector)**
1. Width 420 at every desktop size.
2. Top 58 (under the top bar).
3. Body padding 18 20 40.
4. Buttons 185 wide at 1440.
5. Left edge 1pt separator.

## S-TEAM.toast

Page stand-in only; not built. For checking the page: absolute, bottom 28, centred, max-width 86%, padding 10 14, radius 12, `--ink` fill with `--bg` text, 13.5 / 1.35 / 500, large shadow, fades over 200ms, held 2600ms, `role="status"`. Contrast 15.10 / 16.01.

**Redline (S-TEAM.toast)**
1. Not present in the app.
2. Every tap that shows it on the page is a real link or action in the build, or isn't drawn.
3. Page: bottom 28.
4. Page: padding 10 14.
5. Page: radius 12.

## Completeness pass, 4 Nov 2026

Specs for the IDs and states added in 05's Completeness pass section, and the shared read sheet contract that Team and Lenses both build. These tables add Hit and Data columns to this file's Element | Box | Type | Colour shape, because the shared sheet table must read word for word the same in both lanes. Hex values are from this file's token map; contrast is worked out from them.

### CP S-TEAM.noplayers

| Element | Box | Type | Colour (light / dark) | Hit | Data |
|---|---|---|---|---|---|
| Context line | as S-TEAM context line | as S-TEAM | `--ink-2` 8.64 / 11.45 on `--bg` | none | "No players yet" |
| Empty card | `--card`, radius 16, padding 26 24 24, column centred, gap 8 | | `--card` #FFFEFB / #191E1A | none | none |
| Icon circle | 44, margin-bottom 4, `--tint-acc`; glyph 22 | none | glyph `--accent` 6.84 / 6.80 on its tint | none | none |
| Title | max 34ch | 17 × k / 1.3 / 600 | `--ink` 17.08 / 14.34 | none | "Add your players" |
| Body | max 34ch | 14 × k / 1.45 | `--ink-2` 9.77 / 10.25 | none | "Team fills in once your players are on the roster and log rounds." |
| Button | margin-top 8; today's secondary button | 15 × k / 600 | today's secondary | 44 | "Go to Roster", today's roster route |

### CP S-TEAM at 821 to 1179

| Element | Box | Type | Colour (light / dark) | Hit | Data |
|---|---|---|---|---|---|
| Shell | today's desktop shell: 232 sidebar, 58 top bar | as desktop | as desktop | | |
| Column | one column, max width 720, centred in the main area, side padding 24, cards 24 apart, phone card order | as phone sizes | as phone | | |
| Hole | horizontal desktop hole when the card's inner width is 610 or more; below that the vertical 338 phone hole | as each | as each | stations 44 | as S-TEAM.hole |
| Inspector | 420 wide, right edge, full height under the 58 bar, over the column; today's inspector shadow; no scrim | as S-TEAM.inspector | `--bg` | close 44; Esc | the shared read sheet, player sheet, course sheet or story |

### CP S-TEAM keyboard focus

| Element | Box | Type | Colour (light / dark) | Hit | Data |
|---|---|---|---|---|---|
| Focus ring | today's `:focus-visible` ring, 2pt, offset 2, follows each target's radius; on the green hole it uses `--nav-ink` | none | `--accent` on cards 8.15 / 8.45; `--nav-ink` on `--feat` 11.30 / 10.78 | every row, chip, station and button | none |

### CP shared read sheet (one component, two hosts)

The Team read sheet (`ReadPanel`, CT3) and the Lenses evidence sheet (`EvidenceSheet`, PR 3) are one content component. Team lands first (BUILD_BRIEF order), so Lenses imports it and adds nothing of its own inside it. This table is word for word the same in `coachhelm-team/06` and `coachhelm-lenses/06`. Where an older row in either file differs, this table wins and the older row carries a `(fixed 4 Nov: ...)` note. Contrast figures are on `--ch-card-bg` (light #FFFEFB, dark #191E1A), worked out from the token hex in each lane's token map.

| Element | Box | Type | Colour (light / dark) | Hit | Data |
|---|---|---|---|---|---|
| Container (phone, up to 820) | today's `ui/Modal` bottom sheet, unchanged: full width, hugs content, max 86% of the screen, radius 20 20 0 0, grabber `.ch-grab`, safe-area padding at the bottom | none | panel `--ch-grouped-bg` #F2F0E9 / #0E120F; scrim `--ch-scrim` rgb(20 20 18/.36) / rgb(2 6 4/.58) | scrim tap closes; drag on the head closes past 80pt or a 0.5pt/ms flick | none |
| Container (821 and up) | the host's own: Team puts the content in its 420 inspector (no scrim, overlays the board under 1180); Lenses in its 480 centred dialog, radius 20, max 86% | none | panel `--ch-grouped-bg`; Lenses dialog scrim `--ch-scrim` | Esc closes; focus returns to the row that opened it | none |
| Head (coach) | flex, gap 12, padding 14 20 8; coin 30; text column; close at the right | full name 16 × k / 1.25 / 600; meta "{area} · {n} rounds this season" 13 × k / 1.3 / 500 | name `--ch-text-primary` 15.10 / 16.01 on ground; meta `--ch-text-secondary` 8.64 / 11.45 | close 44 | player name and colour (roster), `insight.area`, season round count (03) |
| Head (player) | as coach, no coin | area kicker 13 × k / 1.3 / 600 caps off | `--ch-text-secondary` 8.64 / 11.45 | close 44 | `insight.area` |
| Close | 34 circle, icon 16 | none | `--ch-well-bg-flat` fill, icon `--ch-text-secondary` | 44 (5pt hit extension) | none |
| Chip row | wrap, gap 8, margin 4 20 0 | 13 × k / 1 / 600; chips 28 tall, padding 0 10, radius 999 | stance chip tints over ground: loss 8% (5.00 / 7.33 on card), gain 12% (6.15 / 6.70), accent 11% (6.84 / 6.80); plain chips `--ch-text-secondary` on 9% | none | stance, worth ("{x} strokes a round"), claim or read word, cause (coach only, only when the read has one), window ("Last {n} rounds") |
| Title | margin 10 20 0; wraps, no line cap | 23 × k / 1.18 / 600, `font-stretch` 92% | `--ch-text-primary` | none | `insight.title` |
| Lede | margin 6 20 0 | 15 × k / 1.42 / 400 | `--ch-text-secondary` 8.64 / 11.45 | none | `insight.summary` |
| Section card | margin 16 16 0; padding 14; radius 12; today's card ring and shadow | card title 13 × k / 1.3 / 600 `--ch-text-secondary`, margin-bottom 10 | `--ch-card-bg`; ink 17.08 / 14.34, ink-2 9.77 / 10.25, ink-3 6.61 / 6.99 | none | none |
| Comparison (ladder) | rows grid 56 / 1fr / 44, gap 10, rows 10 apart; bar 10 tall, radius 5; drawn at rest, no grow | label 15 × k / 1 / 500; figure tabular, right | bars `--ch-chart-flat` 5.58 / 6.27, the player's bar `--ch-chart-loss-fill` 3.92 / 7.12 (marks 3:1); track `--ch-chart-track` | none | rows: player (or "You"), Team only when the read carries a team pool, `coachhelm_team_pool_v1` is on and the pool has 5 or more players, PGA Tour. A row with no figure shows its label and today's `ChLadderRow.missing` line (03-DATA-CHECKS: "Not measured yet…") in place of the bar; a lone missing number elsewhere reads "—". No Tour figure: the Tour row is left out and one line sits under the rows, 13 × k `--ch-text-tertiary` 6.61 / 6.99, worded by `ChLadderRow.missing` ("No Tour figure to compare this with yet."; the Team page's "No Tour figure for single holes, so none is drawn." fills the same slot) |
| Evidence cards | as section card; last-8 strip 64 tall (bars flex 1, gap 6, min 3) and "Where it happened" rows (date and hole column, then text) | dates 13 × k / 1.5 / 600 tabular; text 15 × k / 1.38 | strip `--ch-chart-flat`, rounds over the read's line `--ch-chart-loss-fill` | none | only when the read has them (03): last 8 countable rounds, oldest first; three newest holes |
| Why card | as section card | 15 × k / 1.42; meta 13 × k / 1.3 / 600, margin-top 10 | body `--ch-text-primary`; meta `--ch-text-secondary` | none | title "Why we think this" (coach) or "Why CoachHelm thinks this" (player); meta "{n} rounds · {window} · {firmness} · as of {date}". Never the likely cause for a player (CR0) |
| Drill card | as section card; drill name, one line why, reps line | 16 × k / 1.3 / 600; 14 × k / 1.42 | `--ch-text-primary`, `--ch-text-secondary` | none | `insight.drill` when present |
| Still gathering card | as section card, centred, icon circle 36 on accent 11% | 15 × k / 1.3 / 600; 14 × k / 1.42 | glyph `--ch-accent` 6.84 / 6.80 on its tint | none | in place of the drill when the read has none: "Still gathering" and "{n} more rounds before CoachHelm suggests a drill" ("1 more round" singular; with the count unknown, "Still gathering" alone). No Assign while gathering |
| Corrections | today's `CorrectionChips`, unchanged, as its own section card | as today | as today | 44 per chip (36 drawn, 4 extension) | behind `coachhelm_corrections_v1` |
| Link rows | card of rows, each 48 tall, top hairline between, chevron 14 at the right | 15 × k / 1.2 / 500 | `--ch-accent` 8.15 / 8.45 | 48 | "Open the full read": `readHref` when `coachhelm_read_v1` is on; with it off, Team links `coachReadHref` (today's Deep dive) and Lenses leaves the row out. "Ask CoachHelm about this": only once Ask exports its href and its flag is on. "Add to practice": only once Practice exports `practicePlanHref` and `golf_practice_plans` is on |
| Footer (coach) | pinned on phone with a top hairline `--ch-separator`; padding 12 16 + safe area (16 on desktop); flex, gap 10; at k 1.36 the two buttons stack, primary on top | Button 15 × k / 600 | secondary today's `.ch-btn--secondary`; primary today's `.ch-btn--primary` | 44 tall, radius 12 | secondary "Dismiss" only where the host passes an Undo place (Lenses yes, Team no); primary "Assign as focus". Strings are today's `FocusActions` strings |
| Footer (player) | none | | | | players never get Dismiss or Assign |
| Assigning | primary keeps its box, disabled; spinner 18, 2pt ring, right quarter clear, gap 8 | as Button | as primary | disabled | today's `FocusActions` in-flight label |
| Assigned / focus exists | a 44 row in place of the primary, not a button: check 18, stroke 2.2, then the label | 15 × k / 1.2 / 600 | `--ch-gain` on 12% gain over card 6.15 / 6.70 | none | today's `FocusActions` done label; the Team host may add " · now in Working on" |
| Duplicate (assigned elsewhere) | as Assigned | as Assigned | as Assigned | none | a focus already exists for this read (second device, another coach): the write is not sent again; the row shows as Assigned |
| Write failed | the sheet stays open; primary back to "Assign as focus" | | | 44 | today's `useFocusActions` toast with its own words and code (CH-13001). No inline line |
| Stale | "Out of date" plain chip leads the chip row; no Assign | chip as above | plain chip | none | `ChInsight.stale` |
| Part failed | that one card's body becomes one line and a text button | 14 × k / 1.42; "Try again" 14 × k / 600 | `--ch-text-secondary`; button `--ch-accent` | 44 | "Couldn't load this part" (the rest draws) |
| Gone | the sheet shows one compact card in place of the body: icon circle 36 on loss 12%, title, one line, secondary "Close" | 16 × k / 1.3 / 600; 14 × k / 1.45 | glyph `--ch-loss` 5.57 / 8.53 (amber, never red); text `--ch-text-secondary` | 44 | CH-13861 wording: the read was removed or is not yours to see. No figures load for a read the viewer may not see |
| Long and XXL | title wraps with no cap; names ellipsize on one line in the head; at k 1.36 the sheet grows to its 86% cap, then the body scrolls under a pinned head and footer | every × k value | | | |
| Loading | the sheet never opens while the host is loading; a row tapped during a refresh opens on the data already shown | | | | |
| Screen reader | `role="dialog"`, `aria-modal="true"`, `aria-labelledby` on the title; order: close, head, chips, title, lede, cards in order, links, footer; Assign in-flight sets `aria-busy` on the footer | | | | |

Redline: head padding 14 20 8; close 34; title 23 × k; section cards 16 apart, padding 14, radius 12; ladder bar 10; strip 64; link rows 48; footer buttons 44, gap 10; phone max 86%; Team inspector 420; Lenses dialog 480.


## Wiring, 4 Nov 2026

Checked against helmv3 `main` 03d9087 (1 Nov) by reading code only. Paths under `src/clubhouse/` unless they start with `src/`, `supabase/` or `config/`. "new:" names code the build adds. A missing value shows "—". Team is coach only and read only except Assign (the shared read sheet) and Re-check (today's action). Shot tracking: no screen in this lane changes what shot tracking collects, stores or sends. The legs, huddle, roster and Course figures read stored round rows through `loadSeasonRounds` (`data/season.ts:108`); reads carry engine evidence already stored on `golf_coach_insights.evidence`; nothing reads or writes `golf_shots`.

### Shared plumbing (S-TEAM, S-TEAM.off, S-TEAM.player, S-TEAM.noplayers)

| element or action | reads (source, file:line) | writes or calls (file:line or new) | who and RLS | validation | success | failure and rollback | sync (realtime or refresh) | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Route branch | `CoachHelmView` `routes/coachhelm.tsx:60-61` | new: before line 61, `if (!ask && isTeamBoardEnabled()) return <TeamBoard data={await loadCoachTeamBoard({ coachId, teamId })} … />`; CSS import after line 41; Suspense fallback ternary | coach branch only (`ClubhouseCoachHelmRoute` 166); a player never reaches `CoachHelmView` (player branch 224-233), so `S-TEAM.player` is today's player CoachHelm with the query dropped | none beyond today's | board renders | gate off and failed give today's shapes (`loadCoachHelmGate`, as `loadCoachCoachHelm` `data/coachhelm.ts:501`) | none (server render) | none | new `coachhelm_team_board_v1`, `src/lib/coachhelm/v3/team-board/flag.ts`; off: line 61 unchanged, byte for byte (`S-TEAM.off`) | none |
| Loader | roster and names as `loadCoachCoachHelm` (518-532); `topInsights` (693, exported, new optional `{ limit: 4, drawnLater }`); `teamPatternsOf` (669); `pulseLater` (736) | new `data/coachhelm-team.ts` `loadCoachTeamBoard`; one `getTopInsightsForPlayers` call (`src/app/golf/actions/insight-delivery.ts:1261`, Impl 1113) | the roster comes from the coach's own team; the action trusts the caller's ids (comment above 1113), so ids are only the resolved roster, never the address; insight reads under `coach_insights_select_via_player_team` (baseline `20260527000000` 18552) | ids deduped, roster only | `ChTeamBoardData` | per part `{ status: 'failed' }` with its own Try again; roster error keeps today's CH-13209 | none | none | parts behind their flags as below | none |
| Exposure | `buildExposureRows(sliced, 'roster_card', …)` (`insight-delivery.ts:1247`) | PR 0a: new `drawnLater` on `getTopInsightsForPlayers`; resolves to exactly the drawn ids (3 needs work + 1 working a player) | server only | n/a | only drawn reads are recorded | a rejecting `drawnLater` records nothing; the rows still answer | n/a | n/a | none | none |
| Legs, totals, rounds | `loadSeasonRounds` (`data/season.ts:108`), `seasonStartDate` (68), `MIN_SG_ROUNDS` (58), `sgLegs` (`data/stats-team.ts:180`) | new pure `toChTeamLegs` (`data/coachhelm-team-shape.ts`) | session client; rounds RLS as Team Stats | under 3 rounds a leg is null with a reason | figures match Team Stats for the same player | part failed: "Couldn't load this part" in the hole and spot card | refresh only | none | none | none (the held season standing table `20261024151000` is not read; option B in 02 §4.3 would wait on it) |
| No players (`S-TEAM.noplayers`) | roster count 0 | link "Go to Roster" to today's `/golf/dashboard/roster` | coach | n/a | navigation | n/a | n/a | none | team board flag | none |
| Deep links | `page.tsx:199` searchParams (has `player`; fixed 4 Nov wiring: has no `open` or `insight`) | new: add `open?: string` and `insight?: string` to the type (type only, line 206 spreads them) and to the route props; `?player=` opens the player sheet once, `?open=read&insight=` the read sheet once; both dropped with `router.replace` | coach; an id not on the loaded board opens `S-TEAM.read-sheet.gone` (read) or the plain board (player); no extra query for an id off the roster | strings only | sheet open | bad id: no error | n/a | `insight-notifier.ts:119` lands on `/golf/dashboard/coachhelm` (Team at the hole, no sheet); `verdict-job.ts:320` unchanged | team board flag | none |
| Pull to refresh | `shell/PullToRefresh.tsx` | `router.refresh()` re-runs the loader | coach | n/a | redraw in place, open sheet kept | as each part | refresh | none | none | none |

### S-TEAM.hole, S-TEAM.spot, S-TEAM.course, S-TEAM.course.all, S-TEAM.course-sheet

| element or action | reads | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Station chips | `stationOrder(stations)` (new, pure) | none (session state `useChSessionState`) | coach | n/a | spot card swaps | n/a | n/a | none | team board flag | none |
| Spot bars | `ChTeamPlayer.legs` | none | coach; own roster only | early under 15 rounds hatched | drawn at rest | missing leg: row says why (`ChTeamLeg.missing`) | refresh | none | none | none |
| Spot reads | `readsAt(players, station)`; `ChInsight.area` (new, set in `toChInsight` `data/coachhelm-map.ts:272` from `areaOf` `data/coachhelm-ladder-shape.ts:99`) | tap opens the read sheet | coach | findings only, never a strength | sheet opens | n/a | n/a | none | none | none |
| Shared pattern | `teamPatternsOf` (`data/coachhelm.ts:669`); new `ChTeamPatternRow.memberIds`, `.area` | none | coach; `computeTeamPatterns` over the coach's own roster | at least `TEAM_PATTERN_MIN_MEMBERS` (3) | row drawn | (fixed 4 Nov wiring: `teamPatternsOf` returns null both when `teamPatternEnabled()` is off, line 670, and when it fails; the loader checks `teamPatternEnabled()` (`src/lib/coachhelm/v3/team-pattern/flag.ts:13`) itself first, so a null with the flag on reads as failed, never as "No shared pattern here yet") | refresh | none | `coachhelm_team_pattern_v1` (`config/feature-flags.yml:781`); off: nothing drawn | none |
| Add to practice | none | not drawn: the Practice lane exports no `practicePlanHref` at 03d9087 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | none |
| Course tab and course sheet | the same `loadSeasonRounds` rows; `ROUND_COLUMNS` (`data/season.ts:54`) has `course_name` and `score_to_par`; `golf_rounds.course_id` exists (`src/lib/types/database.ts:17248`) | add `course_id` to `ROUND_COLUMNS` (one additive column in a Stats lane file, see the lane report); new pure `toCourseHistory` (`team-board/course-shape.ts`) | coach | courses group by `course_id`, named by the newest `course_name`; `last4` null under `LAST4_MIN_WEEKS` (6) | drawn | part failed in the card | refresh | none | team board flag | none |
| Course reads | drawn reads with `areaOf` null; a worst-holes read's course from its signature `<player>:course_worst_holes:<course_id>` (`src/lib/coachhelm/v2/mining/course-management.ts:416`) | tap opens the read sheet | coach | n/a | n/a | no-tour state when the read has no Tour figure | n/a | none | none | none |

### S-TEAM.read-sheet (+ .assigning, .assigned, .gathering, .no-tour, .gone, .stale, .partfail), shared with Lenses

| element or action | reads | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Content | the drawn `ChInsight` and its `engine`, `ChBoardMissing`, `ChNotEnough`; team pool only from the row's `team_pool` line | new `team/ReadPanel.tsx`, the one shared component (Lenses imports it) | coach; the cause chip is coach only; figures are the read's own player and the Tour, plus the team pool line only when the read carries one with 5 or more players | no Team row otherwise | drawn at rest | gone: CH-13861 card, no figures; part failed: one line with Try again (`router.refresh()`) | n/a | none | `coachhelm_team_pool_v1` (`feature-flags.yml:710`) for the Team row | none |
| Assign as focus | `ChInsight.assigned`, `declined`, `stale` | `useFocusActions(writes).assign.run(target)` (`screens/coachhelm/parts.tsx:306`) inside today's `FocusActions` (392), the same `ChFocusTarget` (290) as `CoachBoard`; `LIVE_COACHHELM_WRITES.assign` (`screens/coachhelm/writes.ts`) to `createFocusAreaFromInsightV2` (`src/app/golf/actions/development.ts:1736`) | coach; `verifyPlayerAccess` in the action; RLS `golf_player_focus_areas_insert_coach` (baseline 19345) | duplicate guard `ACTIVE_FOCUS_DUPLICATE_ERROR` | "Proposed to {first}", set after success only (no optimistic write) | toast CH-13001, sheet stays open; duplicate shows as Assigned with "{first} already has a focus on this" | the action's `revalidatePath('/golf/dashboard/coachhelm')`; Working on shows the proposal from `fa.assigned` in this visit and from `ChInsight.assigned === 'proposed'` on the next load | to the player: bell row `dev_plan_assigned` and email gated by `email_task_reminders` (`notifyPlayerOfProposedFocus` `development.ts:1359`, `src/lib/notifications/index.ts:195`); no push on this path | none | none |
| Double submit | `useAction` `inFlight` ref (`lib/use-action.ts`) | second tap sends nothing | n/a | n/a | one write, one feedback | n/a | n/a | n/a | n/a | none |
| Open the full read | `insight.id`, `playerId` | `readHref(playerId, id, readOn)` (new, `data/coachhelm-views-shape.ts` after line 130); with Read off it returns `coachReadHref` (108), today's Deep dive | coach | n/a | push; Back returns with the sheet closed | n/a | n/a | none | `coachhelm_read_v1`, passed as `readOn` from the route | none |
| Ask about this | `insightId` or `station` | `askAboutHref` from Ask's `screens/coachhelm/chat/ask-links.ts` (Ask AK2) | coach | null: row left out | navigation | n/a | n/a | none | Ask's `coachhelm_ask_v2` (not yet in the yml) | none |
| Dismiss | n/a | not offered in Team (the host passes no Undo place) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | none |

### S-TEAM.player-sheet (+ .no-rounds)

| element or action | reads | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Bars and open reads | `ChTeamPlayer` | tap a read opens the read sheet | coach; roster player only | no rounds: `.no-rounds` | drawn | n/a | refresh | none | team board flag | none |
| Open {first}'s page | `player.id` | `playerFileHref(id, undefined, fileOn)` (new, `data/coachhelm-views-shape.ts` after line 130); off gives today's `coachPlayerHref('deep-dive', id)` (91) | coach | n/a | push | n/a | n/a | none | `coachhelm_player_file_v1` as `fileOn` | none |

### S-TEAM.today, S-TEAM.story, S-TEAM.story.desk, S-TEAM.huddle, S-TEAM.roster, S-TEAM.working, S-TEAM.record, S-TEAM.empty-steps, S-TEAM.inspector, S-TEAM.toast

| element or action | reads | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| This week tiles and stories | `loadCoachBrief` (`data/coachhelm-coach-brief.ts:61`), `ChBriefWorking`, `readThemes` (`data/coachhelm-dive.ts:77`, at most 4 at a time) | none; seen rings in `useChSessionState` | coach | "No clear change" never makes a story | drawn | "This week's brief didn't load" with Try again | refresh | none | `coachhelm_monday_brief_v1` (`feature-flags.yml:1230`); off: card not drawn | none |
| Huddle | `huddlePoint(player)` | coin opens the player sheet | coach | a player missing a leg is named in the note, not plotted | drawn | part failed | refresh | none | team board flag | none |
| Roster | `ChTeamPlayer`, `ChNotEnough` | row opens the player sheet | coach | n/a | drawn | part failed | refresh | none | `coachhelm_support_v1` (`feature-flags.yml:980`) for held-back rows | none |
| Working on | `ChBriefWorking` with new `playerId`, `progress` (`workingOf` `data/coachhelm-coach-brief-shape.ts:189`) (fixed 4 Nov wiring: the brief's `readFocus` (`data/coachhelm-coach-brief.ts:22`) reads only `active` and `in_progress`, so proposed rows come from the loader's own `ChInsight.assigned === 'proposed'`, not from the brief) | none | coach | ring clamped 0 to 1 | drawn | part failed | refresh | none | brief flag; verdict word behind `coachhelm_verdicts_v1` (`feature-flags.yml:1090`) | none |
| Track record | `loadCoachTrackRecord` (`data/coachhelm-track-record.ts:120`) | none | coach | n/a | drawn | unavailable: "Not available yet"; failed: Try again | refresh | none | `coachhelm_track_record_v1` (`feature-flags.yml:1198`) | none |
| Re-check reads | n/a | today's `RecheckReads` (`screens/coachhelm/Recheck.tsx:49`) through `LIVE_RECHECK_WRITES` (`writes.ts:109`) to `refreshTeamAnalysisAsCoach` (`src/app/golf/actions/insights-coachhelm.ts:1069`), unchanged, under the board, not inside the record card | coach; the action resolves the coach and team from the session and spends the engine's rate limit once | today's | today's result line | today's | today's | the engine's own `notifyInsightLanded` push to a player on a lifecycle change (`src/lib/notifications/insight-notifier.ts`), unchanged | today's | none |
| Inspector (desktop) | as the sheet it hosts | none | coach | n/a | n/a | n/a | n/a | none | team board flag | none |
| Toast | n/a | not built: links navigate; write results use today's `useToast` through `useFocusActions` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | none |
