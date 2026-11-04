# 06 · Screen specs: My stats, Team Stats, Home "Your game"

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 29 rows).
> Wiring, 4 Nov 2026: see the section of that name at the end of this file.

Every number in this file was read off the rendered design page (`redesign/stats-and-home-phone.html`, the page at https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S), not written from memory. A script loads each state by its hash, waits for fonts, and records every box, every text node and every mark with `getComputedStyle` and `getBoundingClientRect`; the tables below are that output, plus the notes a measurement can't give (icons, hit areas, data fields, redlines). Where this file and `04-FIDELITY-SPEC.md` disagree, this file wins; 04 has a pointer.

How to read it:

- Sizes are pt at Text Size Default (`--k` = 1) on the page's 393pt phone. Every type size, and every box marked "×k" in 04 §4, is `calc(N * var(--ch-type-k))` in the app. Page edge and card padding don't scale.
- "Type" is weight size/line-height, tracking in em, `wdth 92` where the condensed axis is set, `tnum` where `font-variant-numeric: tabular-nums` is set. Case is sentence case everywhere; nothing is uppercased.
- "Lines" is what the text does when it runs long: "wraps" means it grows the row (never clips; SHARED-5), "ellipsis" means one line with `text-overflow: ellipsis`, "nowrap" means one line that the layout always fits (a pill, a segment label).
- Colour is the page token, then the app token from 04 §2. Hex values are light / dark. "literal" means a fixed colour with no token (04 §2 lists each).
- Contrast is measured against the surface the text actually sits on, in each theme. Target 4.9:1, floor 4.5:1, 3:1 for large text (24pt, or 19pt bold) and for marks (SHARED-4). Text on the green feature card is measured against `--f-lit`, the lighter top-right corner, which is the worst case; the rest of that card is darker and reads higher.
- The window labels sit on a gradient well the measurer reads as the page, so those two rows are computed by hand against the gradient's darkest stop.

Every pair now meets 4.9:1 in both themes. Two pairs were under target before this round and were fixed on the page: the loss pill (`--loss` on `--loss-tint`, 4.84 light) now uses tint `#F7F0E6`, 4.97; and the "Average" legend label on the feature card (4.81 dark when drawn in `--f-gain-fill`) now keeps its text in `--f-ink-2` and colours only the swatch line. Both changes are in 04 §2's pointer.

Segmented control, computed by hand (light / dark):

| Pair | Light | Dark |
|---|---|---|
| Off label `--seg-off` on the well's darkest stop | #46433D on #D4CEBE 6.28 | #D0C9B8 on #0A0D0B 11.84 |
| Off label on the well's lightest stop | #46433D on #E4DFD3 7.41 | #D0C9B8 on #101411 11.26 |
| On label `--seg-on` on the chip's top stop | #F9F7F1 on #1F6B45 6.04 | #F9F7F1 on #23704A 5.62 |
| On label on the chip's bottom stop | #F9F7F1 on #0F4A2F 9.60 | #F9F7F1 on #1D613F 6.92 |

Shared rules (SHARED-1 to SHARED-12 in `00-shared/ACCEPTANCE-SHARED.md` (fixed 4 Nov: the file is `../ACCEPTANCE-SHARED.md`, at the top of the package)) are not repeated here: the bar is the house bar (98 tall plus the 16pt lip, so 114 to the first content), the page is flat, no card has an accent left border.

Contents: S-STATS, S-STATS.scoring, .sg, .tee, .approach, .short, .putting, .rounds, .goals; S-TEAMSTATS, .tscore, .tgame, .tplayers; S-HOMEGAME; then the states (few, none, loading, failed, long names, XXL, 430) for each screen.


## S-STATS: My stats summary

Design: [https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full) · local `redesign/stats-and-home-phone.html#stats-light-full` · app `/clubhouse-preview/player?state=self` · data 03 "Player · My stats summary"

The summary is a scroll of cards under four section names (Overview, Your game, Rounds, Development), no large title (Nick: "Keep as drawn"). The window switch is sticky at y 114, right under the bar's lip.

### Boxes, top to bottom (light, 393 wide, page height 3246)

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | header | My stats | 0 | 0 | 393 × 114 | 0 0 16 0 | 0px | 0 |
| 2 | `div.ctl` | — | 51020SeasonQualifiers | 0 | 114 | 393 × 52 | 2 16 10 16 | 0px | 12 |
| 3 | `h2.sech` | — | Overview | 18 | 178 | 357 × 28 | 0 0 0 0 | 0px | 12 |
| 4 | `section.card.feature` | hero | Scoring average | 16 | 218 | 361 × 341.6 | 14 16 16 16 | 18px | 12 |
| 5 | `section.card.hl` | highlight | What changed | 16 | 571.6 | 361 × 193 | 14 16 16 16 | 18px | 12 |
| 6 | `section.card.glc` | glance | At a glance | 16 | 776.6 | 361 × 237.1 | 14 16 16 16 | 18px | 30 |
| 7 | `h2.sech` | — | Your game | 18 | 1043.7 | 357 × 28 | 0 0 0 0 | 0px | 12 |
| 8 | `section.card` | s-sg | Strokes gained | 16 | 1083.7 | 361 × 323.1 | 14 16 16 16 | 18px | 12 |
| 9 | `section.card` | s-tee | Off the tee | 16 | 1418.8 | 361 × 255.6 | 14 16 16 16 | 18px | 12 |
| 10 | `section.card` | s-approach | Approach | 16 | 1686.3 | 361 × 412.9 | 14 16 16 16 | 18px | 12 |
| 11 | `section.card` | s-short | Short game | 16 | 2111.2 | 361 × 262 | 14 16 16 16 | 18px | 12 |
| 12 | `section.card` | s-putting | Putting | 16 | 2385.2 | 361 × 331.9 | 14 16 16 16 | 18px | 30 |
| 13 | `h2.sech` | — | Rounds | 18 | 2747.1 | 357 × 28 | 0 0 0 0 | 0px | 12 |
| 14 | `section.card` | s-rounds | Round by round | 16 | 2787.1 | 361 × 150.9 | 14 16 16 16 | 18px | 30 |
| 15 | `h2.sech` | — | Development | 18 | 2968 | 357 × 28 | 0 0 0 0 | 0px | 12 |
| 16 | `section.card` | s-goals | Goals and focus areas | 16 | 3008 | 361 × 181.6 | 14 16 16 16 | 18px | end |

Rules the table doesn't show:

- Section name `h2.sech` sits at x 18 (2pt inside the card edge so its optical edge lines up with card text at 16+2), 30pt below the card above (18 margin plus the 12 gap) and 12 above its first card. The first one is 12 below the switch.
- `.ctl` is sticky at top 114, page colour behind it, no blur, no hairline; its 14pt shade appears only once content passes under it (07 M-STATS-11). Padding 2 16 10 16 (20 at 430).
- Card: fill, 361 wide at 393 (page width minus 2×16), radius 18, padding 14 16 16 16, shadow `--ch-card-shadow`. Head `.ah` is a flex row, title left, meta and chevron right, min height 24, 10pt above the body, no hairline.
- Feature card: flat `--f-bg` (fixed 4 Nov: the page's radial `--f-lit` light is not built, SHARED-2 allows no gradient but the segmented chip; same as Team, Read and Lenses); shadow `--ch-feature-shadow`. Chart SVG 329 × 160 fixed (does not scale with Text Size), inner padding L 4 R 30 T 10 B 26.
- Glance grid: 3 columns that bleed to the card edge (margin 0 −16 −16), cells padding 12 14 14 16, top rule 1px `--sep`, inner rules between cells. At Text Size 1.24 and up: 2 columns, no inner rules.

### Type, colour and contrast (every text node, light and dark)

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.gb > button.sw > span` | My stats | 600 18/18, track −0.012em | 1, nowrap, never cut (fits by design) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.iseg.w5 > button > span` ×5 | 5 | 500 14/14, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--seg` → `--ch-well-bg` | #46433D on #D4CEBE (well top stop) 6.28 | #D0C9B8 on #0A0D0B 11.84 | pass |
| `div.sheet.airy > h2.sech` ×4 | Overview | 700 22/28, track −0.020em wdth 92 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #F1ECDF on #0E120F 16.01 | pass (large, 3:1) |
| `div.ah > h2` | Scoring average | 600 17/22, track 0 | wraps (1 at default) | `--f-ink` → `--ch-on-green-plate` on `--f-lit` → `--ch-feature-lit` | #F4F1E8 on #1A442E 9.73 | #F4F1E8 on #204732 9.26 | pass |
| `div.ah > span.meta` | Last 10 rounds | 400 15/20, track 0 | 1, nowrap, never cut (fits by design) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #204732 7.25 | pass |
| `div.figs > div.figline > span.fig` | 75.4 | 500 40/40, track −0.040em wdth 92 tnum | wraps (1 at default) | `--f-ink` → `--ch-on-green-plate` on `--f-lit` → `--ch-feature-lit` | #F4F1E8 on #1A442E 9.73 | #F4F1E8 on #204732 9.26 | pass (large, 3:1) |
| `div.figs > div.figline > span.fig-sub` | +3.4 to par | 400 17/22, track 0 tnum | wraps (1 at default) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #204732 7.25 | pass |
| `div.figs > div.delta > span.pill.gain` | 4.3 lower | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--f-gain` → `--ch-feature-gain` on `--f-gain-tint` → `--ch-feature-gain-tint` | #8FD3AA on #20523A 5.18 | #8FD3AA on #26553E 4.92 | pass |
| `div.figs > div.delta > span` | than the 10 before | 400 15/20, track 0 | wraps (1 at default) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #204732 7.25 | pass |
| `div.legend > span` ×3 | Round | 400 13/15.6, track 0 | wraps (1 at default) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #204732 7.25 | pass |
| `div.ah > h2` ×9 | What changed | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div > p` | Your scoring average is 4.3 lower  | 400 16/23, track 0 | wraps (3 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.cmp > div.cmp-row > span.k` ×2 | Last 10 | 400 15/18, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.cmp > div.cmp-row > span.v` ×2 | 75.4 | 600 17/17, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.glance > button.gc > span.t` ×6 | Greens | 400 15/18.75, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.glance > button.gc > span.v.loss-ink` | 57 | 600 24/26.4, track −0.020em wdth 92 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #E7AE57 on #191E1A 8.53 | pass (large, 3:1) |
| `button.gc > span.v.loss-ink > small` | % | 500 15/15, track 0 | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #E7AE57 on #191E1A 8.53 | pass |
| `div.glance > button.gc > span.m` ×6 | Tour 66% | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.glance > button.gc > span.v` ×5 | 43 | 600 24/26.4, track −0.020em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass (large, 3:1) |
| `button.gc > span.v > small` ×2 | % | 500 15/15, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.sb.one > div > span.bigv.loss-ink` | −5.7 | 600 34/34, track −0.035em wdth 92 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #E7AE57 on #191E1A 8.53 | pass (large, 3:1) |
| `div.sb.one > div > div.cap` | Strokes a round against the Tour | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.mrows > div.mrow > span.lab` ×4 | Off the tee | 400 15/18, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.mrows > div.mrow > span.val.loss-ink` ×4 | −0.9 | 600 15/15, track 0 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #E7AE57 on #191E1A 8.53 | pass |
| `div > p.sumfoot` | Strongest: . Biggest leak: , 3.4 a | 400 15/20, track 0 | wraps (3 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > p.sumfoot > b` ×2 | Around green | 600 15/20, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.kfr > div > span.bigv` ×4 | 43 | 600 34/34, track −0.035em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass (large, 3:1) |
| `div > span.bigv > small` ×4 | % | 500 17/17, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.kfr > div > div.cap` ×4 | Fairways hit | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > div.kfr > span.pill.loss` ×4 | −0.9 SG | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--loss` → `--ch-loss` on `--loss-tint` → `--ch-chip-loss-bg` | #9A5700 on #F7F0E6 4.97 | #E7AE57 on #3A3524 6.18 | pass |
| `div.viz > div.mini-key > span` ×3 | Left | 400 13/15.6, track 0 tnum | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.mini-key > span > b` ×3 | 31% | 600 13/15.6, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.strip > div > span.t` ×8 | All tee shots | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.strip > div > span.v` ×8 | 268 | 600 20/23, track −0.015em tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div > span.v > small` ×6 | yds | 500 13/13, track −0.023em | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.mrails > div.mr > span.l` ×15 | 50–75 yds | 400 15/18, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.mrails > div.mr > span.v` ×15 | 80% | 600 15/15, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div > div.viz > div.mini-cap` ×3 | Greens hit by distance, in yards | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.sb > div > span.bigv` | 10 | 600 34/34, track −0.035em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass (large, 3:1) |
| `div.sb > div > div.cap` | Best 73 · Oct 3 | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.sb > div.viz > div.mini-cap` | Taller is lower; best in green | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > span.rg > span` ×3 | 75.4 | 600 15/15, track 0 | wraps (5 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.rings > div > b` ×3 | Under 75 | 500 15/18.75, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.rings > div > small` ×3 | 0.4 to go | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |

### Marks, icons and controls

| Mark | w × h (pt) | Radius | Padding | Fill, design → app | Non-text contrast light / dark (3:1) |
|---|---|---|---|---|---|
| `span.thumb` | 49 × 32 | 12px | 0 0 0 0 | `—` → `—` |  |
| `button.fbtn` | 40 × 40 | 14px | 1 6 1 6 | `—` → `—` |  |
| `span.pi` | 26 × 26 | 8px | 0 0 0 0 | `--f-ink` → `--ch-on-green-plate` | 11.30 / 10.78 on `--f-bg` pass |
| `button.dlink` | 24 × 24 | 0px | 0 0 0 0 | `—` → `—` |  |
| `svg.chev` | 8 × 14 | 0px | 0 0 0 0 | `--ink-3` → `--ch-ink-500` | 6.61 / 6.99 on `--card` pass |
| `span.pill.gain` | 84.4 × 24 | 7px | 4 7 4 7 | `--f-gain-tint` → `--ch-feature-gain-tint` | surface (holds text; text pairs above) |
| `svg` | 329 × 160 | 0px | 0 0 0 0 | `—` → `—` |  |
| `span.cmp-track` | 195.7 × 14 | 999px | 0 0 0 0 | `--track` → `--ch-chart-track` | surface (holds text; text pairs above) |
| `span.rail` | 171 × 10 | 999px | 0 0 0 0 | `--track` → `--ch-chart-track` | surface (holds text; text pairs above) |
| `span.zero` | 1.5 × 20 | 1px | 0 0 0 0 | `--ink-3` → `--ch-ink-500` | 5.31 / 5.42 on `--track` pass |
| `span.bar.loss` | 19.2 × 10 | 999px | 0 0 0 0 | `--loss-fill` → `--ch-chart-loss-fill` | 3.15 / 5.52 on `--track` pass |
| `span.pill.loss` | 61.7 × 24 | 7px | 4 7 4 7 | `--loss-tint` → `--ch-chip-loss-bg` | surface (holds text; text pairs above) |
| `span.hrail` | 206.5 × 10 | 999px | 0 0 0 0 | `--track` → `--ch-chart-track` | surface (holds text; text pairs above) |
| `span.tour` | 2 × 18 | 1px | 0 0 0 0 | `--ink` → `--ch-ink-900` | 13.72 / 11.12 on `--track` pass |
| `svg.tick` | 167.4 × 64 | 0px | 0 0 0 0 | `—` → `—` |  |
| `span.rg` | 68 × 68 | 0px | 0 0 0 0 | `—` → `—` |  |

### Icons and hit areas

- Whole summary card is the button (`role="button"`, `tabindex="0"`); its hit area is the card, 361 wide and never under 150 tall. Focus ring: `outline: 2px solid --accent`, offset 2, following the card radius.
- Window segments: the page draws them 32×k tall inside a 40×k track. The app gives each segment `::before { inset: -6px 0 }` so the hit is 44 tall; widths are 49 to 87 (5, 10, 20, Season, Qualifiers), so width is never the limit. At XXL the segment is 43.5 tall and the inset still applies.
- Filter button `.fbtn` 40×40×k, radius 14, icon "sliders" 18×18 stroke 1.7 in `--seg-off`. Hit: `::before { inset: -2px }` makes 44; at XXL it is 54 on its own.
- Bar: switcher `.sw` min height 44, caret 12×12 stroke 1.8; bell 44×44, icon 22×22 stroke 1.5. Both unchanged from the house bar (SHARED-1).
- Chevron `.chev` 8×14 stroke 1.8 `--ink-3`: decoration only, the card is the target.
- Feature card: the chevron sits in `.dlink` (24×24, `::before { inset: -10px }` = 44); the card itself is the target too. The chart is a scrub surface (`touch-action: pan-y`), so a press-and-drag on it never opens the detail (07 M-STATS-06).
- Feature icon tile `.pi` 26×26×k radius 8, fill `rgb(244 241 232/.12)`, "flag" glyph 16×16 stroke 1.6 in `--f-ink`. Part cards: same tile in `--gain-tint` with `--accent` glyph: tee "tee", approach "target", short game "flag-in-bunker" (wedge), putting "hole"; the glyph paths are in the page (`ICONS` in the script) and match the Home legs.
- Glance cells are buttons, each 120 × 118, far over 44.

### Data

Field by field (03 "Player · My stats summary" has the formula and file:line for each):

- Scoring figure "75.4": `w.scoringAvg` for the window, one decimal, tnum. Sub "+3.4 to par": `w.scoringAvg − w.parAvg`, signed, one decimal. Pill "4.3 lower": `x.compare` delta against the N before; "higher" when worse; hidden under 3 rounds.
- Chart: one dot per round in the window, oldest left; par rule from `w.parAvg`; date labels first and last round (`MMM d`).
- What changed sentence and compare rows: 03 "What changed card" (Last 5 and Last 10 compare with the N before; Last 20, Season, Qualifiers compare newest half with first half and say so).
- At a glance: Greens `girPct`, Fairways `fairwayPct`, Scrambling `scramblePct` as whole percents; Putts `puttsPerRound` one decimal; Birdies and Bogeys per round one decimal. Caption "Tour 66%" only where `golf_pga_standards` has the key, else "a round".
- Strokes gained total "−5.7": `w.sgPerRound` (never the sum of the legs). Leg rows: `sgLegBars`. Under 3 rounds: "—" in `--ink-3`, no rails.
- Part cards: figures per 03 "Off the tee card" to "Putting card". Missing value is "—", never 0 (SHARED-4).
- Round by round: count of rounds in the window; "Best 73 · Oct 3" = lowest total and its date; latest wins a tie.
- Goals rings: `progressOf(goal)`; label is the current value; caption "0.4 to go". A goal with no baseline shows value and target as text, no ring.

### Redline: check these first

1. Switch track top at y 116 (114 + 2), 40 tall, chip 49 × 32 on "10".
2. First section name "Overview" top at y 178, 28 tall, x 18.
3. Feature card x 16, y 218, 361 × 342, radius 18.
4. Feature figure 40/40 baseline 14 + 24 + 10 below the card top; chart 160 tall.
5. Card padding 14 16 16 16; 12 between cards; 30 from a card to the next section name.
6. At a glance cells 3 across, figure 24pt, card 237 tall.
7. Strokes gained card 323 tall; rails 10 tall, zero mark 1.5 × 20.
8. Round ticker 167 × 64; goal rings 68 × 68.
9. Page edge 16 (20 at 430): card x 16 and w 361.


## S-STATS.scoring: Scoring detail (push)

Design: [https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-scoring](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-scoring) · local `redesign/stats-and-home-phone.html#stats-light-full-scoring` · app `/clubhouse-preview/player?state=self#gm-scoring` · data 03 "Player · detail pages / Scoring"

Every detail is a pushed page with the same bar: "‹ My stats" back label left in champagne, the page title centred, an empty 44pt slot right, no bell. The hero sits on the page (not in a card): figure, caption, chips. Cards start at y 239.5.

### Boxes, top to bottom (light, 393 wide, page height 1593)

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | — | My statsScoring | 0 | 0 | 393 × 114 | 0 0 16 0 | 0px | 130 |
| 2 | `section.card` | — | Score by round | 16 | 244 | 361 × 207 | 14 16 16 16 | 18px | 12 |
| 3 | `section.card` | — | An average round | 16 | 463 | 361 × 148 | 14 16 16 16 | 18px | 12 |
| 4 | `section.card` | — | Per round | 16 | 623 | 361 × 238.6 | 14 16 16 16 | 18px | 12 |
| 5 | `section.card.hl` | — | What changed | 16 | 873.6 | 361 × 193 | 14 16 16 16 | 18px | 12 |
| 6 | `section.card` | — | Against the 10 before | 16 | 1078.6 | 361 × 458.6 | 14 16 16 16 | 18px | end |

- Bar for every detail: back `.back` inline-flex gap 4, padding 10 8 10 0, margin-left −6, min height 44, 400 17/1 `--champ` (chevron 11×19 stroke 2.2, `currentColor`). Title `.ptitle` 600 17/1, absolutely centred, max 52% wide, ellipsis.
- `.d-sheet` padding 8 16 56 (20 at 430), gap 12. Hero `.d-hero` padding 6 2 4: figure 500 40/40, caption 15/20 6pt below, chips row 10pt below, gap 8.
- Score mix bar 28×k tall, radius 8, 2pt gaps between segments; key grid `repeat(auto-fit, minmax(96×k, 1fr))`, swatch 10×10 radius 3.

### Type, colour and contrast (every text node, light and dark)

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.gb > button.back > span` | My stats | 400 17/17, track 0 | 1, nowrap, never cut (fits by design) | `--champ` → `--ch-champagne-dot` on `--nav` → `--ch-frame` | #E2C98F on #0A331F 8.62 | #E2C98F on #08150E 11.55 | pass |
| `div.gb > span.ptitle` | Scoring | 600 17/17, track 0 | 1, nowrap, ellipsis | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.d-sheet > div.d-hero > div.bigv` | 75.4 | 500 40/40, track −0.040em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #F1ECDF on #0E120F 16.01 | pass (large, 3:1) |
| `div.d-sheet > div.d-hero > div.cap` | Scoring average · +3.4 to par · La | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--bg` → `--ch-grouped-bg` | #46433D on #F2F0E9 8.64 | #D0C9B8 on #0E120F 11.45 | pass |
| `div.d-hero > div.chips > span.pill.gain` | 4.3 lower | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--gain` → `--ch-gain` on `--gain-tint` → `--ch-chip-gain-bg` | #14613D on #E8EEE8 6.35 | #7CC79B on #29392F 6.10 | pass |
| `div.d-hero > div.chips > span` | than the 10 before | 400 15/19.5, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--bg` → `--ch-grouped-bg` | #46433D on #F2F0E9 8.64 | #D0C9B8 on #0E120F 11.45 | pass |
| `div.ah > h2` ×5 | Score by round | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.ah > span.meta` ×3 | Par dashed | 400 15/20, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.rib > div.rib-in > span.rref` | Par | 500 13/13, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > div.rib > span.ry.t` | 73 | 400 13/13, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > div.rib > span.ry.b` | 78 | 400 13/13, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.rib > div.rx > span` ×2 | Sep 15 | 400 13/13, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > div.skey > div` ×5 | Eagle | 400 15/18, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.skey > div > b` ×5 | 0.1 | 600 15/18, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.m4 > div > div.t` ×4 | Scoring average | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.m4 > div > div.v` ×3 | 75.4 | 600 24/26.4, track −0.020em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass (large, 3:1) |
| `div.m4 > div > div.m` ×2 | Per 18 holes | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.m4 > div > div.v.loss-ink` | 1.1 | 600 24/26.4, track −0.020em wdth 92 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #E7AE57 on #191E1A 8.53 | pass (large, 3:1) |
| `div > p` | Your scoring average is 4.3 lower  | 400 16/23, track 0 | wraps (3 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.cmp > div.cmp-row > span.k` ×2 | Last 10 | 400 15/18, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.cmp > div.cmp-row > span.v` ×2 | 75.4 | 600 17/17, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.db > div > div.l` ×4 | Scoring average | 500 16/21, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.db > div > div.nums` ×4 | from 79.7 | 400 15/19.5, track 0 tnum | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > div.nums > b` ×4 | 75.4 | 600 17/22.1, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div > div.db > span.pill.gain` ×2 | 4.3 | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--gain` → `--ch-gain` on `--gain-tint` → `--ch-chip-gain-bg` | #14613D on #E8EEE8 6.35 | #7CC79B on #29392F 6.10 | pass |
| `div > div.db > span.pill.loss` | 3.9 pts | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--loss` → `--ch-loss` on `--loss-tint` → `--ch-chip-loss-bg` | #9A5700 on #F7F0E6 4.97 | #E7AE57 on #3A3524 6.18 | pass |
| `div > div.db > span.pill.flat` | 0.6 | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--flat-tint` → `--ch-chip-flat-bg` | #46433D on #F2F1EE 8.73 | #D0C9B8 on #292D28 8.48 | pass |
| `div > button.how` | How this is measured | 400 16/19.2, track 0 | wraps (2 at default) | `--accent` → `--ch-green-600` on `--card` → `--ch-card-bg` | #155A39 on #FFFEFB 8.15 | #7CC79B on #191E1A 8.45 | pass |

### Marks, icons and controls

| Mark | w × h (pt) | Radius | Padding | Fill, design → app | Non-text contrast light / dark (3:1) |
|---|---|---|---|---|---|
| `span.pill.gain` | 84.4 × 24 | 7px | 4 7 4 7 | `--gain-tint` → `--ch-chip-gain-bg` | surface (holds text; text pairs above) |
| `span.cmp-track` | 195.7 × 14 | 999px | 0 0 0 0 | `--track` → `--ch-chart-track` | surface (holds text; text pairs above) |
| `span.pill.loss` | 70.3 × 24 | 7px | 4 7 4 7 | `--loss-tint` → `--ch-chip-loss-bg` | surface (holds text; text pairs above) |
| `span.pill.flat` | 48.2 × 24 | 7px | 4 7 4 7 | `--flat-tint` → `--ch-chip-flat-bg` | surface (holds text; text pairs above) |
| `svg.chev` | 8 × 14 | 0px | 0 0 0 0 | `--ink-3` → `--ch-ink-500` | 6.61 / 6.99 on `--card` pass |

### Icons and hit areas

- Back: 44 tall from its padding; with the label, at least 92 wide. Left-edge swipe from x < 24 also pops (07 M-STATS-02).
- The trend chart here is read-only (no scrub on details); rows are not buttons.
- Right slot is an empty 44×44 so the title stays centred.
- "How this is measured" toggle (also on Off the tee, Approach, Putting) at the end of Against the N before: padding 13 16, 400 16/1.2 `--accent` (8.15 / 8.45 on the card), at least 46 tall, full card width; chevron 8×14 stroke 1.8 turns 90° (07 M-STATS-22).

### Data

03 "Scoring": average, to par, change chip (`x.compare`); Score by round from round totals with par dashed; An average round from per-hole score types (Eagle, Birdie, Par, Bogey, Double+) as per-round counts, one decimal; Per round rows; Against the N before captioned "From round totals".

### Redline: check these first

1. Back label baseline centred in the 44 row under the status line; title centred at 196.5 x.
2. Hero figure 40/40 at y ≈ 130; first card y 239.5.
3. Score mix bar 28 tall, radius 8.
4. Cards 361 wide, 12 apart, radius 18.
5. Sheet bottom padding 56.


## S-STATS.sg: Strokes gained detail (push)

Design: [https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-sg](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-sg) · local `redesign/stats-and-home-phone.html#stats-light-full-sg` · app `/clubhouse-preview/player?state=self#sd-sg` · data 03 "Player · detail pages / Strokes gained"

Hero total and its likely range, then "By part of the game" (four diverging rows plus Total), "Open a part" (four rows that push the part page) and "How strokes gained works".

### Boxes, top to bottom (light, 393 wide, page height 1115)

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | — | My statsStrokes gained | 0 | 0 | 393 × 114 | 0 0 16 0 | 0px | 125.5 |
| 2 | `section.card` | — | By part of the game | 16 | 239.5 | 361 × 355 | 14 16 16 16 | 18px | 12 |
| 3 | `section.card.flushb` | — | Open a part | 16 | 606.5 | 361 × 296 | 14 0 4 0 | 18px | 12 |
| 4 | `section.card` | — | How strokes gained works | 16 | 914.5 | 361 × 144 | 14 16 16 16 | 18px | end |

- Diverging row `.drow`: columns 104×k / 1fr / 48×k, gap 12, min height 44, padding 4 16 with margin 0 −16 so the press wash runs edge to edge. Rail 12×k radius 999 `--track`; zero mark 1.5 × 22 `--zero`; bar from zero, radius 999, `--gain-fill` or `--loss-fill`, flat (no bar) when |v| < 0.05.
- Total row 600 under a 1px `--sep-strong` rule. Scale row "−6 0 +6" 400 13/13 `--ink-3`, scale = ±ceil(max |v|), at least 1.
- Readout `p.readout` above the rows, min height 40×k so the card doesn't jump when a row is pinned.
- "Open a part" list `.flushb`: rows `.rrow.lrow` min height 64, padding 10 16, icon tile 26, chevron 8×14.

### Type, colour and contrast (every text node, light and dark)

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.gb > button.back > span` | My stats | 400 17/17, track 0 | 1, nowrap, never cut (fits by design) | `--champ` → `--ch-champagne-dot` on `--nav` → `--ch-frame` | #E2C98F on #0A331F 8.62 | #E2C98F on #08150E 11.55 | pass |
| `div.gb > span.ptitle` | Strokes gained | 600 17/17, track 0 | 1, nowrap, ellipsis | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.d-sheet > div.d-hero > div.bigv` | −5.7 | 500 40/40, track −0.040em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #F1ECDF on #0E120F 16.01 | pass (large, 3:1) |
| `div.d-sheet > div.d-hero > div.cap` | Strokes a round against the Tour · | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--bg` → `--ch-grouped-bg` | #46433D on #F2F0E9 8.64 | #D0C9B8 on #0E120F 11.45 | pass |
| `div.d-hero > div.chips > span` | Likely −6.5 to −4.9 | 400 15/19.5, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--bg` → `--ch-grouped-bg` | #46433D on #F2F0E9 8.64 | #D0C9B8 on #0E120F 11.45 | pass |
| `div.ah > h2` ×3 | By part of the game | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.ah > span.meta` | Per round | 400 15/20, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > p.readout` | Tap a part to see its likely range | 400 15/20, track 0 | wraps (2 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.div-rows > div.drow > span.lab` ×4 | Off the tee | 500 16/21, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.div-rows > div.drow > span.val.loss-ink` ×4 | −0.9 | 600 17/17, track 0 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #E7AE57 on #191E1A 8.53 | pass |
| `div.div-rows > div.drow.total > span.lab` | Total | 600 16/21, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `.div-rows > div.drow.total > span.val.loss-ink` | −5.7 | 600 17/17, track 0 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #E7AE57 on #191E1A 8.53 | pass |
| `div.scale > span > span` ×3 | −6 | 400 13/13, track 0 tnum | wraps (1 at default) | `--ink-3` → `--ch-ink-500` on `--card` → `--ch-card-bg` | #5F5C55 on #FFFEFB 6.61 | #ADA697 on #191E1A 6.99 | pass |
| `li.rrow.lrow > span.c > b` ×4 | Off the tee | 500 16/21, track 0 | 1, nowrap, ellipsis | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `li.rrow.lrow > span.c > span` ×4 | Fairways hit 43% | 400 15/20, track 0 | 1, nowrap, ellipsis | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `li.rrow.lrow > span.r > span.pill.loss` ×4 | −0.9 SG | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--loss` → `--ch-loss` on `--loss-tint` → `--ch-chip-loss-bg` | #9A5700 on #F7F0E6 4.97 | #E7AE57 on #3A3524 6.18 | pass |
| `div > p.how-t` | Each shot is compared with what a  | 400 15/20, track 0 | wraps (4 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |

### Marks, icons and controls

| Mark | w × h (pt) | Radius | Padding | Fill, design → app | Non-text contrast light / dark (3:1) |
|---|---|---|---|---|---|
| `span.rail` | 153 × 12 | 999px | 0 0 0 0 | `--track` → `--ch-chart-track` | surface (holds text; text pairs above) |
| `span.zero` | 1.5 × 22 | 1px | 0 0 0 0 | `--ink-3` → `--ch-ink-500` | 5.31 / 5.42 on `--track` pass |
| `span.bar.loss` | 11.5 × 12 | 999px | 0 0 0 0 | `--loss-fill` → `--ch-chart-loss-fill` | 3.15 / 5.52 on `--track` pass |
| `span.whisk` | 8.9 × 2 | 0px | 0 0 0 0 | `--ink` → `--ch-ink-900` | 13.72 / 11.12 on `--track` pass |
| `span.pi` | 26 × 26 | 8px | 0 0 0 0 | `--gain-tint` → `--ch-chip-gain-bg` | surface (holds text; text pairs above) |
| `span.pill.loss` | 61.7 × 24 | 7px | 4 7 4 7 | `--loss-tint` → `--ch-chip-loss-bg` | surface (holds text; text pairs above) |
| `svg.chev` | 8 × 14 | 0px | 0 0 0 0 | `--ink-3` → `--ch-ink-500` | 6.61 / 6.99 on `--card` pass |

### Icons and hit areas

- Each `.drow` is a button, 44 tall minimum, full card width: tap pins it (the row keeps the `--press` wash and its range whisker fades to .9; the other rows don't change), tap again unpins (07 M-STATS-08).
- "Open a part" rows 64 tall, full width; each replaces this page with the part page, so Back still reads "‹ My stats".
- "How strokes gained works" is a plain card with its text always open (no toggle on this page).

### Data

Total `w.sgPerRound` with likely range `w.sgRange` ("Likely −6.5 to −4.9"); leg rows `sgLegBars` (Off the tee, Approach, Around green, Putting). Pinning shows that leg's range from `sgLegRange`; whisker opacity 0 to .9. Under 3 rounds the page shows "Strokes gained shows from 3 rounds" and no rows.

### Redline: check these first

1. First card y 239.5, 361 × 355.
2. Diverging rows 44 tall, rail 153 × 12, zero 1.5 × 22.
3. Readout min height 40.
4. Open a part rows 64 tall.
5. Total row rule 1px `--sep-strong`.


## S-STATS.tee: Off the tee detail (push)

Design: [https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-tee](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-tee) · local `redesign/stats-and-home-phone.html#stats-light-full-tee` · app `/clubhouse-preview/player?state=self#gm-tee` · data 03 "Player · detail pages / Off the tee"

Hero Fairways hit with its SG chip; In short; The figures; Where drives finish; Against the N before. Meta "Par 4s and 5s". No Tour mark on fairways.

### Boxes, top to bottom (light, 393 wide, page height 1021)

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | — | My statsOff the tee | 0 | 0 | 393 × 114 | 0 0 16 0 | 0px | 130 |
| 2 | `section.card` | — | In short | 16 | 244 | 361 × 122 | 14 16 16 16 | 18px | 12 |
| 3 | `section.card` | — | The figures | 16 | 378 | 361 × 255.5 | 14 16 16 16 | 18px | 12 |
| 4 | `section.card` | — | Where drives finish | 16 | 645.5 | 361 × 122 | 14 16 16 16 | 18px | 12 |
| 5 | `section.card` | — | Against the 10 before | 16 | 779.5 | 361 × 185.3 | 14 16 16 16 | 18px | end |

### Type, colour and contrast (every text node, light and dark)

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.gb > button.back > span` | My stats | 400 17/17, track 0 | 1, nowrap, never cut (fits by design) | `--champ` → `--ch-champagne-dot` on `--nav` → `--ch-frame` | #E2C98F on #0A331F 8.62 | #E2C98F on #08150E 11.55 | pass |
| `div.gb > span.ptitle` | Off the tee | 600 17/17, track 0 | 1, nowrap, ellipsis | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.d-sheet > div.d-hero > div.bigv` | 43 | 500 40/40, track −0.040em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #F1ECDF on #0E120F 16.01 | pass (large, 3:1) |
| `div.d-hero > div.bigv > small` | % | 500 33.3333/33.3333, track −0.048em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #F1ECDF on #0E120F 16.01 | pass (large, 3:1) |
| `div.d-sheet > div.d-hero > div.cap` | Fairways hit · Last 10 rounds | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--bg` → `--ch-grouped-bg` | #46433D on #F2F0E9 8.64 | #D0C9B8 on #0E120F 11.45 | pass |
| `div.d-hero > div.chips > span.pill.loss` | −0.9 SG | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--loss` → `--ch-loss` on `--loss-tint` → `--ch-chip-loss-bg` | #9A5700 on #F7F0E6 4.97 | #E7AE57 on #3A3524 6.18 | pass |
| `div.d-hero > div.chips > span` | likely −1.3 to −0.6 | 400 15/19.5, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--bg` → `--ch-grouped-bg` | #46433D on #F2F0E9 8.64 | #D0C9B8 on #0E120F 11.45 | pass |
| `div.ah > h2` ×4 | In short | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div > p.plead` | You hit 43% of fairways. Misses go | 400 16/23, track 0 | wraps (2 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.ah > span.meta` ×2 | Last 10 | 400 15/20, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.m4 > div > div.t` ×4 | Fairways hit | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.m4 > div > div.v` ×4 | 43% | 600 24/26.4, track −0.020em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass (large, 3:1) |
| `div.m4 > div > div.m` ×4 | Par 4s and 5s | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > div.skey > div` ×3 | Left | 400 15/18, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.skey > div > b` ×3 | 31% | 600 15/18, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.db > div > div.l` | Fairways hit | 500 16/21, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.db > div > div.nums` | from 46.8% | 400 15/19.5, track 0 tnum | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > div.nums > b` | 42.9% | 600 17/22.1, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div > div.db > span.pill.loss` | 3.9 pts | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--loss` → `--ch-loss` on `--loss-tint` → `--ch-chip-loss-bg` | #9A5700 on #F7F0E6 4.97 | #E7AE57 on #3A3524 6.18 | pass |
| `div > button.how` | How this is measured | 400 16/19.2, track 0 | wraps (2 at default) | `--accent` → `--ch-green-600` on `--card` → `--ch-card-bg` | #155A39 on #FFFEFB 8.15 | #7CC79B on #191E1A 8.45 | pass |

### Marks, icons and controls

| Mark | w × h (pt) | Radius | Padding | Fill, design → app | Non-text contrast light / dark (3:1) |
|---|---|---|---|---|---|
| `span.pill.loss` | 61.7 × 24 | 7px | 4 7 4 7 | `--loss-tint` → `--ch-chip-loss-bg` | surface (holds text; text pairs above) |
| `svg.chev` | 8 × 14 | 0px | 0 0 0 0 | `--ink-3` → `--ch-ink-500` | 6.61 / 6.99 on `--card` pass |

### Icons and hit areas

- No interactive rows; Back as on every detail. Figures strip cells are text.

### Data

`fairwayPct` (par 4s and 5s only), `sgLegs.tee`, drive distance avg, Left / Fairway / Right split (`missLeftPct`, `fairwayPct`, `missRightPct`), "Other tee shots" (never "Other clubs"). 03 §9.

### Redline: check these first

1. Hero figure 40/40.
2. Where drives finish stacked bar 22×k tall, radius 6.
3. Strip figures 600 20/23 above a hairline.
4. First card y 239.5.
5. Cards 12 apart.


## S-STATS.approach: Approach detail (push)

Design: [https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-approach](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-approach) · local `redesign/stats-and-home-phone.html#stats-light-full-approach` · app `/clubhouse-preview/player?state=self#gm-approach` · data 03 "Player · detail pages / Approach"

You and the Tour; The figures; Greens hit by distance (7 bands in yards, no Tour tick); Greens by round; Against the N before.

### Boxes, top to bottom (light, 393 wide, page height 1532)

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | — | My statsApproach | 0 | 0 | 393 × 114 | 0 0 16 0 | 0px | 130 |
| 2 | `section.card` | — | You and the Tour | 16 | 244 | 361 × 181 | 14 16 16 16 | 18px | 12 |
| 3 | `section.card` | — | The figures | 16 | 437 | 361 × 238.6 | 14 16 16 16 | 18px | 12 |
| 4 | `section.card` | — | Greens hit by distance | 16 | 687.6 | 361 × 372 | 14 16 16 16 | 18px | 12 |
| 5 | `section.card` | — | Greens by round | 16 | 1071.6 | 361 × 207 | 14 16 16 16 | 18px | 12 |
| 6 | `section.card` | — | Against the 10 before | 16 | 1290.6 | 361 × 185.3 | 14 16 16 16 | 18px | end |

- Bars `.hb`: columns 84×k / 1fr / 44×k, gap 10, min height 44; rail 12×k radius 999; Tour tick 2 × 22 `--ink` where a Tour figure exists; key mark 2 × 12.
- Trend ribbon `.rib`: SVG 100% × 124×k, padding-right 44 for the right labels; line `--flat` on every part page, 2.5 wide; end dot 10.

### Type, colour and contrast (every text node, light and dark)

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.gb > button.back > span` | My stats | 400 17/17, track 0 | 1, nowrap, never cut (fits by design) | `--champ` → `--ch-champagne-dot` on `--nav` → `--ch-frame` | #E2C98F on #0A331F 8.62 | #E2C98F on #08150E 11.55 | pass |
| `div.gb > span.ptitle` | Approach | 600 17/17, track 0 | 1, nowrap, ellipsis | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.d-sheet > div.d-hero > div.bigv` | 57 | 500 40/40, track −0.040em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #F1ECDF on #0E120F 16.01 | pass (large, 3:1) |
| `div.d-hero > div.bigv > small` | % | 500 33.3333/33.3333, track −0.048em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #F1ECDF on #0E120F 16.01 | pass (large, 3:1) |
| `div.d-sheet > div.d-hero > div.cap` | Greens in regulation · Last 10 rou | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--bg` → `--ch-grouped-bg` | #46433D on #F2F0E9 8.64 | #D0C9B8 on #0E120F 11.45 | pass |
| `div.d-hero > div.chips > span.pill.loss` | −3.4 SG | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--loss` → `--ch-loss` on `--loss-tint` → `--ch-chip-loss-bg` | #9A5700 on #F7F0E6 4.97 | #E7AE57 on #3A3524 6.18 | pass |
| `div.d-hero > div.chips > span` | likely −3.9 to −2.9 | 400 15/19.5, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--bg` → `--ch-grouped-bg` | #46433D on #F2F0E9 8.64 | #D0C9B8 on #0E120F 11.45 | pass |
| `div.ah > h2` ×5 | You and the Tour | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div > p.plead` | You hit 57% of greens. Most misses | 400 16/23, track 0 | wraps (3 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div > div.bench-k > span.loss-ink` | You 57% | 600 15/18, track 0 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #E7AE57 on #191E1A 8.53 | pass |
| `div > div.bench-k > span` | Tour 66% | 400 15/18, track 0 tnum | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.ah > span.meta` ×3 | Last 10 | 400 15/20, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.m4 > div > div.t` ×4 | Greens in regulation | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.m4 > div > div.v.loss-ink` | 57% | 600 24/26.4, track −0.020em wdth 92 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #E7AE57 on #191E1A 8.53 | pass (large, 3:1) |
| `div.m4 > div > div.m` ×4 | Tour 66% | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.m4 > div > div.v` ×3 | 68% | 600 24/26.4, track −0.020em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass (large, 3:1) |
| `div > div.hb > span.l` ×7 | 50–75 yds | 500 16/21, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div > div.hb > span.v` ×7 | 80% | 600 17/17, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.rib > div.rib-in > span.rref` | Tour | 500 13/13, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > div.rib > span.ry.t` | 89% | 400 13/13, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > div.rib > span.ry.b` | 44% | 400 13/13, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.rib > div.rx > span` ×2 | Sep 15 | 400 13/13, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.db > div > div.l` | Greens in regulation | 500 16/21, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.db > div > div.nums` | from 52.8% | 400 15/19.5, track 0 tnum | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > div.nums > b` | 56.9% | 600 17/22.1, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div > div.db > span.pill.gain` | 4.1 pts | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--gain` → `--ch-gain` on `--gain-tint` → `--ch-chip-gain-bg` | #14613D on #E8EEE8 6.35 | #7CC79B on #29392F 6.10 | pass |
| `div > button.how` | How this is measured | 400 16/19.2, track 0 | wraps (2 at default) | `--accent` → `--ch-green-600` on `--card` → `--ch-card-bg` | #155A39 on #FFFEFB 8.15 | #7CC79B on #191E1A 8.45 | pass |

### Marks, icons and controls

| Mark | w × h (pt) | Radius | Padding | Fill, design → app | Non-text contrast light / dark (3:1) |
|---|---|---|---|---|---|
| `span.pill.loss` | 61.7 × 24 | 7px | 4 7 4 7 | `--loss-tint` → `--ch-chip-loss-bg` | surface (holds text; text pairs above) |
| `span.hrail.kf-bar` | 329 × 10 | 999px | 0 0 0 0 | `--track` → `--ch-chart-track` | surface (holds text; text pairs above) |
| `span.tour` | 2 × 20 | 1px | 0 0 0 0 | `--ink` → `--ch-ink-900` | 13.72 / 11.12 on `--track` pass |
| `span.hrail` | 181 × 12 | 999px | 0 0 0 0 | `--track` → `--ch-chart-track` | surface (holds text; text pairs above) |
| `span.pill.gain` | 70.3 × 24 | 7px | 4 7 4 7 | `--gain-tint` → `--ch-chip-gain-bg` | surface (holds text; text pairs above) |
| `svg.chev` | 8 × 14 | 0px | 0 0 0 0 | `--ink-3` → `--ch-ink-500` | 6.61 / 6.99 on `--card` pass |

### Icons and hit areas

- No interactive rows. Rows reach 44 for VoiceOver focus only.

### Data

`girPct`, `sgLegs.approach`, Missed short `s.approachMissShortPct` (phone and desktop alike), GIR by band from `approachBands` (50–75 … 200+ yds). Tour figure only for keys in `golf_pga_standards`; none per band.

### Redline: check these first

1. Bars 44 tall, rail 12 tall.
2. Tour tick 2 × 22 where drawn.
3. Ribbon 124 tall with 44 right padding.
4. First card y 239.5.
5. Seven bands, each 44.


## S-STATS.short: Short game detail (push)

Design: [https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-short](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-short) · local `redesign/stats-and-home-phone.html#stats-light-full-short` · app `/clubhouse-preview/player?state=self#gm-short` · data 03 "Player · detail pages / Short game"

Up and down by lie with Tour ticks on fairway 65, rough 58, sand 50 only; no tick on "All chances"; How this is measured.

### Boxes, top to bottom (light, 393 wide, page height 1109)

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | — | My statsShort game | 0 | 0 | 393 × 114 | 0 0 16 0 | 0px | 130 |
| 2 | `section.card` | — | In short | 16 | 244 | 361 × 145 | 14 16 16 16 | 18px | 12 |
| 3 | `section.card` | — | The figures | 16 | 401 | 361 × 238.6 | 14 16 16 16 | 18px | 12 |
| 4 | `section.card` | — | Up and down by lie | 16 | 651.6 | 361 × 265 | 14 16 16 16 | 18px | 12 |
| 5 | `section.card` | — | How this is measured | 16 | 928.6 | 361 × 124 | 14 16 16 16 | 18px | end |

### Type, colour and contrast (every text node, light and dark)

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.gb > button.back > span` | My stats | 400 17/17, track 0 | 1, nowrap, never cut (fits by design) | `--champ` → `--ch-champagne-dot` on `--nav` → `--ch-frame` | #E2C98F on #0A331F 8.62 | #E2C98F on #08150E 11.55 | pass |
| `div.gb > span.ptitle` | Short game | 600 17/17, track 0 | 1, nowrap, ellipsis | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.d-sheet > div.d-hero > div.bigv` | 32 | 500 40/40, track −0.040em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #F1ECDF on #0E120F 16.01 | pass (large, 3:1) |
| `div.d-hero > div.bigv > small` | % | 500 33.3333/33.3333, track −0.048em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #F1ECDF on #0E120F 16.01 | pass (large, 3:1) |
| `div.d-sheet > div.d-hero > div.cap` | Scrambling · Last 10 rounds | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--bg` → `--ch-grouped-bg` | #46433D on #F2F0E9 8.64 | #D0C9B8 on #0E120F 11.45 | pass |
| `div.d-hero > div.chips > span.pill.loss` | −0.1 SG | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--loss` → `--ch-loss` on `--loss-tint` → `--ch-chip-loss-bg` | #9A5700 on #F7F0E6 4.97 | #E7AE57 on #3A3524 6.18 | pass |
| `div.d-hero > div.chips > span` | likely −0.4 to +0.2 | 400 15/19.5, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--bg` → `--ch-grouped-bg` | #46433D on #F2F0E9 8.64 | #D0C9B8 on #0E120F 11.45 | pass |
| `div.ah > h2` ×4 | In short | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div > p.plead` | You get up and down 32% of the tim | 400 16/23, track 0 | wraps (3 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.ah > span.meta` ×2 | Last 10 | 400 15/20, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.m4 > div > div.t` ×4 | Scrambling | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.m4 > div > div.v` ×3 | 32% | 600 24/26.4, track −0.020em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass (large, 3:1) |
| `div.m4 > div > div.m` ×4 | Up and down | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.m4 > div > div.v.loss-ink` | 17% | 600 24/26.4, track −0.020em wdth 92 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #E7AE57 on #191E1A 8.53 | pass (large, 3:1) |
| `div > div.hb > span.l` ×4 | Fringe | 500 16/21, track 0 | wraps (2 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.hb > span.l > small` ×4 | 13 attempts | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > div.hb > span.v` ×4 | 46% | 600 17/17, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div > div.tour-key` | Tour average | 400 13/13, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > p.how-t` | Every hole where the green was mis | 400 15/20, track 0 | wraps (3 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |

### Marks, icons and controls

| Mark | w × h (pt) | Radius | Padding | Fill, design → app | Non-text contrast light / dark (3:1) |
|---|---|---|---|---|---|
| `span.pill.loss` | 61.7 × 24 | 7px | 4 7 4 7 | `--loss-tint` → `--ch-chip-loss-bg` | surface (holds text; text pairs above) |
| `span.hrail` | 181 × 12 | 999px | 0 0 0 0 | `--track` → `--ch-chart-track` | surface (holds text; text pairs above) |
| `span.tour` | 2 × 22 | 1px | 0 0 0 0 | `--ink` → `--ch-ink-900` | 13.72 / 11.12 on `--track` pass |

### Icons and hit areas

- No interactive rows. "How this is measured" is a plain card here with its text always open (the toggle is on Scoring, Off the tee, Approach and Putting).

### Data

`scramblePct` overall and by lie (`scrambleByLie`), `sgLegs.short`. Tour ticks from `golf_pga_standards` only.

### Redline: check these first

1. Bars 44 tall.
2. Three Tour ticks only.
3. First card y 239.5.
4. Hero figure 40/40.
5. Toggle chevron 8 × 14.


## S-STATS.putting: Putting detail (push)

Design: [https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-putting](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-putting) · local `redesign/stats-and-home-phone.html#stats-light-full-putting` · app `/clubhouse-preview/player?state=self#gm-putting` · data 03 "Player · detail pages / Putting"

Make rate by distance (0–3, 3–5, 5–10, 10–15, 15–25, 25+ ft), Tour ticks 90.5, 62.2, 35.7, 15.4, 5.5, none on 0–3; Putts by round (up is fewer); one-putts per round here only.

### Boxes, top to bottom (light, 393 wide, page height 1477)

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | — | My statsPutting | 0 | 0 | 393 × 114 | 0 0 16 0 | 0px | 130 |
| 2 | `section.card` | — | In short | 16 | 244 | 361 × 145 | 14 16 16 16 | 18px | 12 |
| 3 | `section.card` | — | The figures | 16 | 401 | 361 × 238.6 | 14 16 16 16 | 18px | 12 |
| 4 | `section.card` | — | Make rate by distance | 16 | 651.6 | 361 × 353 | 14 16 16 16 | 18px | 12 |
| 5 | `section.card` | — | Putts by round | 16 | 1016.6 | 361 × 207 | 14 16 16 16 | 18px | 12 |
| 6 | `section.card` | — | Against the 10 before | 16 | 1235.6 | 361 × 185.3 | 14 16 16 16 | 18px | end |

### Type, colour and contrast (every text node, light and dark)

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.gb > button.back > span` | My stats | 400 17/17, track 0 | 1, nowrap, never cut (fits by design) | `--champ` → `--ch-champagne-dot` on `--nav` → `--ch-frame` | #E2C98F on #0A331F 8.62 | #E2C98F on #08150E 11.55 | pass |
| `div.gb > span.ptitle` | Putting | 600 17/17, track 0 | 1, nowrap, ellipsis | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.d-sheet > div.d-hero > div.bigv` | 32.1 | 500 40/40, track −0.040em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #F1ECDF on #0E120F 16.01 | pass (large, 3:1) |
| `div.d-sheet > div.d-hero > div.cap` | Putts / round · Last 10 rounds | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--bg` → `--ch-grouped-bg` | #46433D on #F2F0E9 8.64 | #D0C9B8 on #0E120F 11.45 | pass |
| `div.d-hero > div.chips > span.pill.loss` | −1.3 SG | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--loss` → `--ch-loss` on `--loss-tint` → `--ch-chip-loss-bg` | #9A5700 on #F7F0E6 4.97 | #E7AE57 on #3A3524 6.18 | pass |
| `div.d-hero > div.chips > span` | likely −1.7 to −0.9 | 400 15/19.5, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--bg` → `--ch-grouped-bg` | #46433D on #F2F0E9 8.64 | #D0C9B8 on #0E120F 11.45 | pass |
| `div.ah > h2` ×5 | In short | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div > p.plead` | You take 32.1 putts a round and th | 400 16/23, track 0 | wraps (3 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.ah > span.meta` ×3 | Last 10 | 400 15/20, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.m4 > div > div.t` ×4 | Putts / round | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.m4 > div > div.v` ×3 | 32.1 | 600 24/26.4, track −0.020em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass (large, 3:1) |
| `div.m4 > div > div.m` ×2 | Two a green is 36 | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.m4 > div > div.v.loss-ink` | 41% | 600 24/26.4, track −0.020em wdth 92 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #E7AE57 on #191E1A 8.53 | pass (large, 3:1) |
| `div > div.hb > span.l` ×6 | 0–3 ft | 500 16/21, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div > div.hb > span.v` ×6 | 96% | 600 17/17, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div > div.tour-key` | Tour average | 400 13/13, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > div.rib > span.ry.t` | 31 | 400 13/13, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > div.rib > span.ry.b` | 37 | 400 13/13, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.rib > div.rx > span` ×2 | Sep 15 | 400 13/13, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.db > div > div.l` | Putts per round | 500 16/21, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.db > div > div.nums` | from 32.7 | 400 15/19.5, track 0 tnum | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > div.nums > b` | 32.1 | 600 17/22.1, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div > div.db > span.pill.flat` | 0.6 | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--flat-tint` → `--ch-chip-flat-bg` | #46433D on #F2F1EE 8.73 | #D0C9B8 on #292D28 8.48 | pass |
| `div > button.how` | How this is measured | 400 16/19.2, track 0 | wraps (2 at default) | `--accent` → `--ch-green-600` on `--card` → `--ch-card-bg` | #155A39 on #FFFEFB 8.15 | #7CC79B on #191E1A 8.45 | pass |

### Marks, icons and controls

| Mark | w × h (pt) | Radius | Padding | Fill, design → app | Non-text contrast light / dark (3:1) |
|---|---|---|---|---|---|
| `span.pill.loss` | 61.7 × 24 | 7px | 4 7 4 7 | `--loss-tint` → `--ch-chip-loss-bg` | surface (holds text; text pairs above) |
| `span.hrail` | 181 × 12 | 999px | 0 0 0 0 | `--track` → `--ch-chart-track` | surface (holds text; text pairs above) |
| `span.tour` | 2 × 22 | 1px | 0 0 0 0 | `--ink` → `--ch-ink-900` | 13.72 / 11.12 on `--track` pass |
| `span.pill.flat` | 48.2 × 24 | 7px | 4 7 4 7 | `--flat-tint` → `--ch-chip-flat-bg` | surface (holds text; text pairs above) |
| `svg.chev` | 8 × 14 | 0px | 0 0 0 0 | `--ink-3` → `--ch-ink-500` | 6.61 / 6.99 on `--card` pass |

### Icons and hit areas

- No interactive rows.

### Data

`puttsPerRound`, `sgLegs.putt`, make rate by band (`puttBands`), one-putts per round (today's formula). 5–10 ft reads 62 (62.2), never 56.

### Redline: check these first

1. Six bands, each 44.
2. Tour tick 2 × 22, none on 0–3 ft.
3. Ribbon "up is fewer".
4. First card y 239.5.
5. Hero 40/40.


## S-STATS.rounds: Round by round detail (push)

Design: [https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-rounds](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-rounds) · local `redesign/stats-and-home-phone.html#stats-light-full-rounds` · app `/clubhouse-preview/player?state=self#sd-rounds` · data 03 "Player · detail pages / Rounds"

Ticker full width, Personal bests, Against the N before, Every round (one 64pt row per round).

### Boxes, top to bottom (light, 393 wide, page height 1829)

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | — | My statsRounds | 0 | 0 | 393 × 114 | 0 0 16 0 | 0px | 96 |
| 2 | `section.card` | — | Round by round | 16 | 210 | 361 × 180 | 14 16 16 16 | 18px | 12 |
| 3 | `section.card` | — | Personal bests | 16 | 402 | 361 × 238.6 | 14 16 16 16 | 18px | 12 |
| 4 | `section.card` | — | Against the 10 before | 16 | 652.6 | 361 × 416.4 | 14 16 16 16 | 18px | 12 |
| 5 | `section.card.flushb` | — | Every round | 16 | 1080.9 | 361 × 692 | 14 0 4 0 | 18px | end |

- Every round `.rrow`: columns 44×k / 1fr / auto / 13, gap 12, padding 10 16, min height 64. Score tile 44×k radius 11, `--well` fill, 600 19/1 tnum; under par `--under-tint` fill and `--under` ink. Course name 500 16/21 one line ellipsis; second line "Oct 21 · Tournament" 400 15/20 ellipsis; to-par pill right; chevron.

### Type, colour and contrast (every text node, light and dark)

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.gb > button.back > span` | My stats | 400 17/17, track 0 | 1, nowrap, never cut (fits by design) | `--champ` → `--ch-champagne-dot` on `--nav` → `--ch-frame` | #E2C98F on #0A331F 8.62 | #E2C98F on #08150E 11.55 | pass |
| `div.gb > span.ptitle` | Rounds | 600 17/17, track 0 | 1, nowrap, ellipsis | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.d-sheet > div.d-hero > div.bigv` | 10 | 500 40/40, track −0.040em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #F1ECDF on #0E120F 16.01 | pass (large, 3:1) |
| `div.d-sheet > div.d-hero > div.cap` | Rounds · averaging 75.4 · Last 10  | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--bg` → `--ch-grouped-bg` | #46433D on #F2F0E9 8.64 | #D0C9B8 on #0E120F 11.45 | pass |
| `div.ah > h2` ×4 | Round by round | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.ah > span.meta` ×3 | Taller is lower | 400 15/20, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > p.anote` | Best round in green. Score by roun | 400 15/20, track 0 | wraps (2 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.m4 > div > div.t` ×4 | Best score | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.m4 > div > div.v` ×4 | 73 | 600 24/26.4, track −0.020em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass (large, 3:1) |
| `div.m4 > div > div.m` ×4 | Oct 3 · Pinehurst No. 8 | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.db > div > div.l` ×4 | Scoring average | 500 16/21, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.db > div > div.nums` ×4 | from 79.7 | 400 15/19.5, track 0 tnum | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > div.nums > b` ×4 | 75.4 | 600 17/22.1, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div > div.db > span.pill.gain` ×2 | 4.3 | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--gain` → `--ch-gain` on `--gain-tint` → `--ch-chip-gain-bg` | #14613D on #E8EEE8 6.35 | #7CC79B on #29392F 6.10 | pass |
| `div > div.db > span.pill.loss` | 3.9 pts | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--loss` → `--ch-loss` on `--loss-tint` → `--ch-chip-loss-bg` | #9A5700 on #F7F0E6 4.97 | #E7AE57 on #3A3524 6.18 | pass |
| `div > div.db > span.pill.flat` | 0.6 | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--flat-tint` → `--ch-chip-flat-bg` | #46433D on #F2F1EE 8.73 | #D0C9B8 on #292D28 8.48 | pass |
| `ul.rlist > li.rrow > span.score` ×10 | 74 | 600 19/19, track −0.020em tnum | wraps (2 at default) | `--ink` → `--ch-ink-900` on `--well` → `--ch-well-bg-flat` | #1C1B18 on #F6F4EE 15.66 | #F1ECDF on #141815 15.20 | pass |
| `li.rrow > span.c > b` ×10 | Springfield Country Club | 500 16/21, track 0 | 1, nowrap, ellipsis | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `li.rrow > span.c > span` ×10 | Oct 21 · Tournament | 400 15/20, track 0 | 1, nowrap, ellipsis | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `li.rrow > span.r > span.tp` ×10 | +2 | 600 15/15, track 0 tnum | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `li.rrow > span.r > span.pill.loss` ×10 | −3.7 SG | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--loss` → `--ch-loss` on `--loss-tint` → `--ch-chip-loss-bg` | #9A5700 on #F7F0E6 4.97 | #E7AE57 on #3A3524 6.18 | pass |

### Marks, icons and controls

| Mark | w × h (pt) | Radius | Padding | Fill, design → app | Non-text contrast light / dark (3:1) |
|---|---|---|---|---|---|
| `svg.tick` | 329 × 64 | 0px | 0 0 0 0 | `—` → `—` |  |
| `span.pill.gain` | 48.2 × 24 | 7px | 4 7 4 7 | `--gain-tint` → `--ch-chip-gain-bg` | surface (holds text; text pairs above) |
| `span.pill.loss` | 70.3 × 24 | 7px | 4 7 4 7 | `--loss-tint` → `--ch-chip-loss-bg` | surface (holds text; text pairs above) |
| `span.pill.flat` | 48.2 × 24 | 7px | 4 7 4 7 | `--flat-tint` → `--ch-chip-flat-bg` | surface (holds text; text pairs above) |
| `svg.chev` | 8 × 14 | 0px | 0 0 0 0 | `--ink-3` → `--ch-ink-500` | 6.61 / 6.99 on `--card` pass |

### Icons and hit areas

- Every round row is a link to the round (today's round page), 64 tall, full width; press wash edge to edge.

### Data

Rounds in window from `rounds`, newest first; to par = total − par; Personal bests: lowest round, most birdies, fewest putts (latest wins a tie). 03 §9.

### Redline: check these first

1. Ticker 329 × 64.
2. Every round rows 64 tall; score tile 44 × 44 radius 11.
3. First card y 210 (no hero on this page).
4. Course name one line, ellipsis.
5. Chevron 8 × 14 at the row end.


## S-STATS.goals: Goals and focus areas detail (push)

Design: [https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-goals](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-goals) · local `redesign/stats-and-home-phone.html#stats-light-full-goals` · app `/clubhouse-preview/player?state=self#sd-goals` · data 03 "Player · detail pages / Goals"

Goal rings for every active goal, then the coach's focus areas with progress bars. No "Set by" name.

### Boxes, top to bottom (light, 393 wide, page height 786)

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | — | My statsGoals | 0 | 0 | 393 × 114 | 0 0 16 0 | 0px | 130 |
| 2 | `section.card` | — | Goals this season | 16 | 244 | 361 × 132 | 14 16 16 16 | 18px | 12 |
| 3 | `section.card.flushb` | — | Focus areas | 16 | 388 | 361 × 226 | 14 0 4 0 | 18px | end |

### Type, colour and contrast (every text node, light and dark)

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.gb > button.back > span` | My stats | 400 17/17, track 0 | 1, nowrap, never cut (fits by design) | `--champ` → `--ch-champagne-dot` on `--nav` → `--ch-frame` | #E2C98F on #0A331F 8.62 | #E2C98F on #08150E 11.55 | pass |
| `div.gb > span.ptitle` | Goals | 600 17/17, track 0 | 1, nowrap, ellipsis | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.d-sheet > div.d-hero > div.bigv` | 75.4 | 500 40/40, track −0.040em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #F1ECDF on #0E120F 16.01 | pass (large, 3:1) |
| `div.d-sheet > div.d-hero > div.cap` | Scoring average · goal is under 75 | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--bg` → `--ch-grouped-bg` | #46433D on #F2F0E9 8.64 | #D0C9B8 on #0E120F 11.45 | pass |
| `div.d-hero > div.chips > span.pill.flat` | 0.4 to go | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--flat-tint` → `--ch-chip-flat-bg` | #46433D on #F2F1EE 8.73 | #D0C9B8 on #292D28 8.48 | pass |
| `div.ah > h2` ×2 | Goals this season | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.goal1 > span.rg > span` | 75.4 | 600 15/15, track 0 | wraps (5 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.goal1 > div > b` | Average under 75 | 600 17/21.25, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.goal1 > div > span` | 75.4 over last 10 rounds | 400 15/19.5, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.ah > span.meta` | From your coach | 400 15/20, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.dev > div > b` ×2 | Approach from 125 to 150 yards | 500 16/21, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.dev > div > span` ×2 | 6 of 10 practice blocks logged | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |

### Marks, icons and controls

| Mark | w × h (pt) | Radius | Padding | Fill, design → app | Non-text contrast light / dark (3:1) |
|---|---|---|---|---|---|
| `span.pill.flat` | 66.9 × 24 | 7px | 4 7 4 7 | `--flat-tint` → `--ch-chip-flat-bg` | surface (holds text; text pairs above) |
| `span.rg` | 68 × 68 | 0px | 0 0 0 0 | `—` → `—` |  |

### Icons and hit areas

- No interactive elements beyond Back.

### Data

`progressOf(goal)` for each ring; focus areas from the coach's rows, progress bar 8×k tall.

### Redline: check these first

1. Rings 68 × 68, track and fill 7 wide.
2. Ring label 600 15/1 inside.
3. Progress bars 8 tall.
4. First card y 239.5.
5. Three columns, gap 8.


## S-TEAMSTATS: Team Stats summary (coach)

Design: [https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full) · local `redesign/stats-and-home-phone.html#team-light-full` · app `/clubhouse-preview/stats` · data 03 "Team · Stats summary"

Coach only. Section names Overview, Team game, Players. Same card system as My stats; window switch counts round days.

### Boxes, top to bottom (light, 393 wide, page height 1260)

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | theader | Stats2 | 0 | 0 | 393 × 114 | 0 0 16 0 | 0px | 0 |
| 2 | `div.ctl` | — | 51020SeasonQualifiers | 0 | 114 | 393 × 52 | 2 16 10 16 | 0px | 12 |
| 3 | `h2.sech` | — | Overview | 18 | 178 | 357 × 28 | 0 0 0 0 | 0px | 12 |
| 4 | `section.card.feature` | thero | Team scoring average | 16 | 218 | 361 × 282 | 14 16 16 16 | 18px | 30 |
| 5 | `h2.sech` | — | Team game | 18 | 530 | 357 × 28 | 0 0 0 0 | 0px | 12 |
| 6 | `section.card` | tgame | Strokes gained by leg | 16 | 570 | 361 × 303.1 | 14 16 16 16 | 18px | 30 |
| 7 | `h2.sech` | — | Players | 18 | 903.1 | 357 × 28 | 0 0 0 0 | 0px | 12 |
| 8 | `section.card.flushb` | tplayers | Who gains and loses | 16 | 943.1 | 361 × 261 | 14 0 4 0 | 18px | end |

- Team feature chart: the SVG is drawn in a 160-tall viewBox and shown 128 tall (329 × 128 at 393; it does not scale with Text Size), inner padding L 0 R 30 T 8 B 24. 04 §4 said 160 shown; 128 is what the page renders; team line and area always `--f-gain-fill`; mean rule labelled "Mean 74.1" 6pt above it at x 4. Bare chevron (no `.dlink`).
- Players card `.flushb`: padding 14 0 4 0; rows `.prow` columns 20×k / 104×k / 1fr / 44×k, gap 10, padding 4 16, min height 52; rail scale fixed ±8.

### Type, colour and contrast (every text node, light and dark)

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.gb > button.sw > span` | Stats | 600 18/18, track −0.012em | 1, nowrap, never cut (fits by design) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.gb > button.bellb > b.badge` | 2 | 650 11/19, track 0 | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--accent` → `--ch-green-600` | #F4EEDD on #155A39 7.10 | #F4EEDD on #155A39 7.10 | pass |
| `div.iseg.w5 > button > span` ×5 | 5 | 500 14/14, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--seg` → `--ch-well-bg` | #46433D on #D4CEBE (well top stop) 6.28 | #D0C9B8 on #0A0D0B 11.84 | pass |
| `div.sheet.airy > h2.sech` ×3 | Overview | 700 22/28, track −0.020em wdth 92 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #F1ECDF on #0E120F 16.01 | pass (large, 3:1) |
| `div.ah > h2` | Team scoring average | 600 17/22, track 0 | wraps (1 at default) | `--f-ink` → `--ch-on-green-plate` on `--f-lit` → `--ch-feature-lit` | #F4F1E8 on #1A442E 9.73 | #F4F1E8 on #204732 9.26 | pass |
| `div.ah > span.meta` | Last 10 days | 400 15/20, track 0 | 1, nowrap, never cut (fits by design) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #204732 7.25 | pass |
| `div.figs > div.figline > span.fig` | 74.1 | 500 40/40, track −0.040em wdth 92 tnum | wraps (1 at default) | `--f-ink` → `--ch-on-green-plate` on `--f-lit` → `--ch-feature-lit` | #F4F1E8 on #1A442E 9.73 | #F4F1E8 on #204732 9.26 | pass (large, 3:1) |
| `div.figs > div.figline > span.fig-sub` | +2.1 to par | 400 17/22, track 0 tnum | wraps (1 at default) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #204732 7.25 | pass |
| `div.figs > div.delta > span.pill.gain` | 1.2 lower | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--f-gain` → `--ch-feature-gain` on `--f-gain-tint` → `--ch-feature-gain-tint` | #8FD3AA on #20523A 5.18 | #8FD3AA on #26553E 4.92 | pass |
| `div.figs > div.delta > span` | than the 10 before | 400 15/20, track 0 | wraps (1 at default) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #204732 7.25 | pass |
| `div.ah > h2` ×2 | Strokes gained by leg | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.ah > span.meta` ×2 | vs Tour | 400 15/20, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.sb.one > div > span.bigv.loss-ink` | −5.8 | 600 34/34, track −0.035em wdth 92 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #E7AE57 on #191E1A 8.53 | pass (large, 3:1) |
| `div.sb.one > div > div.cap` | Team strokes a round against the T | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.mrows > div.mrow > span.lab` ×4 | Off the tee | 400 15/18, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.mrows > div.mrow > span.val.gain-ink` | +0.6 | 600 15/15, track 0 tnum | wraps (1 at default) | `--gain` → `--ch-gain` on `--card` → `--ch-card-bg` | #14613D on #FFFEFB 7.42 | #7CC79B on #191E1A 8.45 | pass |
| `div.mrows > div.mrow > span.val.loss-ink` ×3 | −3.3 | 600 15/15, track 0 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #E7AE57 on #191E1A 8.53 | pass |
| `div > p.sumfoot` | Greens · Putts · Scrambling | 400 15/20, track 0 | wraps (2 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > p.sumfoot > b` ×3 | 55% | 600 15/20, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.mini-players > div.prow > span.rk` ×3 | 1 | 400 13/13, track 0 tnum | wraps (1 at default) | `--ink-3` → `--ch-ink-500` on `--card` → `--ch-card-bg` | #5F5C55 on #FFFEFB 6.61 | #ADA697 on #191E1A 6.99 | pass |
| `div.mini-players > div.prow > span.nm` ×3 | Tyler Hayes | 500 16/19.2, track 0 | 1, nowrap, ellipsis | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `iv.mini-players > div.prow > span.val.loss-ink` ×3 | −3.3 | 600 17/17, track 0 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #E7AE57 on #191E1A 8.53 | pass |
| `div > p.sumfoot.pad` | Tyler Hayes is closest to the Tour | 400 15/20, track 0 | wraps (2 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |

### Marks, icons and controls

| Mark | w × h (pt) | Radius | Padding | Fill, design → app | Non-text contrast light / dark (3:1) |
|---|---|---|---|---|---|
| `span.thumb` | 49 × 32 | 12px | 0 0 0 0 | `—` → `—` |  |
| `button.fbtn` | 40 × 40 | 14px | 1 6 1 6 | `—` → `—` |  |
| `span.pi` | 26 × 26 | 8px | 0 0 0 0 | `--f-ink` → `--ch-on-green-plate` | 11.30 / 10.78 on `--f-bg` pass |
| `svg.chev` | 8 × 14 | 0px | 0 0 0 0 | `--ink-3` → `--ch-ink-500` | 6.61 / 6.99 on `--card` pass |
| `span.pill.gain` | 84.4 × 24 | 7px | 4 7 4 7 | `--f-gain-tint` → `--ch-feature-gain-tint` | surface (holds text; text pairs above) |
| `svg` | 329 × 128 | 0px | 0 0 0 0 | `—` → `—` |  |
| `span.rail` | 171 × 10 | 999px | 0 0 0 0 | `--track` → `--ch-chart-track` | surface (holds text; text pairs above) |
| `span.zero` | 1.5 × 20 | 1px | 0 0 0 0 | `--ink-3` → `--ch-ink-500` | 5.31 / 5.42 on `--track` pass |
| `span.bar.gain` | 12.8 × 10 | 999px | 0 0 0 0 | `--gain-fill` → `--ch-green-500` | 5.15 / 4.50 on `--track` pass |
| `span.bar.loss` | 70.5 × 10 | 999px | 0 0 0 0 | `--loss-fill` → `--ch-chart-loss-fill` | 3.15 / 5.52 on `--track` pass |
| `span.whisk` | 14.7 × 2 | 0px | 0 0 0 0 | `--ink` → `--ch-ink-900` | 13.72 / 11.12 on `--track` pass |

### Icons and hit areas

- Whole summary card is the button (`role="button"`, `tabindex="0"`); its hit area is the card, 361 wide and never under 150 tall. Focus ring: `outline: 2px solid --accent`, offset 2, following the card radius.
- Window segments: the page draws them 32×k tall inside a 40×k track. The app gives each segment `::before { inset: -6px 0 }` so the hit is 44 tall; widths are 49 to 87 (5, 10, 20, Season, Qualifiers), so width is never the limit. At XXL the segment is 43.5 tall and the inset still applies.
- Filter button `.fbtn` 40×40×k, radius 14, icon "sliders" 18×18 stroke 1.7 in `--seg-off`. Hit: `::before { inset: -2px }` makes 44; at XXL it is 54 on its own.
- Bar: switcher `.sw` min height 44, caret 12×12 stroke 1.8; bell 44×44, icon 22×22 stroke 1.5. Both unchanged from the house bar (SHARED-1).
- Chevron `.chev` 8×14 stroke 1.8 `--ink-3`: decoration only, the card is the target.
- Players rows on the summary are not buttons; the card is.
- Bell badge "2": 19 × 19 on `--accent`, 650 11/19, 7.10:1.

### Data

Team scoring average = mean of round-day averages weighted by n (03 §10.6); SG by leg from `team.sgMean` and `legTotals`, scale fixed ±4; Players top three by SG; names ellipsis at 104×k.

### Redline: check these first

1. Feature card y 218, 361 × 282.
2. Team game card 303 tall.
3. Players rows 52 tall, rank column 20.
4. Section names at x 18, 30 above, 12 below.
5. Bell badge 19 × 19.


## S-TEAMSTATS.tscore: Team scoring detail (push)

Design: [https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-tscore](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-tscore) · local `redesign/stats-and-home-phone.html#team-light-full-tscore` · app `/clubhouse-preview/stats#sd-team-score` · data 03 "Team · detail pages / Team scoring"

By round day; The round (`.m3` grid); Round days table (Day, Team average, Rounds; no To par); team putting; TeamInsight. Back reads "‹ Stats".

### Boxes, top to bottom (light, 393 wide, page height 1241)

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | — | StatsTeam scoring | 0 | 0 | 393 × 114 | 0 0 16 0 | 0px | 150 |
| 2 | `section.card` | — | By round day | 16 | 264 | 361 × 207 | 14 16 16 16 | 18px | 12 |
| 3 | `section.card` | — | The round | 16 | 483 | 361 × 217.8 | 14 16 16 16 | 18px | 12 |
| 4 | `section.card` | — | Round days | 16 | 712.8 | 361 × 472.6 | 14 16 16 16 | 18px | end |

### Type, colour and contrast (every text node, light and dark)

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.gb > button.back > span` | Stats | 400 17/17, track 0 | 1, nowrap, never cut (fits by design) | `--champ` → `--ch-champagne-dot` on `--nav` → `--ch-frame` | #E2C98F on #0A331F 8.62 | #E2C98F on #08150E 11.55 | pass |
| `div.gb > span.ptitle` | Team scoring | 600 17/17, track 0 | 1, nowrap, ellipsis | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.d-sheet > div.d-hero > div.bigv` | 74.1 | 500 40/40, track −0.040em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #F1ECDF on #0E120F 16.01 | pass (large, 3:1) |
| `div.d-sheet > div.d-hero > div.cap` | Team scoring average · +2.1 to par | 400 15/20, track 0 | wraps (2 at default) | `--ink-2` → `--ch-ink-600` on `--bg` → `--ch-grouped-bg` | #46433D on #F2F0E9 8.64 | #D0C9B8 on #0E120F 11.45 | pass |
| `div.d-hero > div.chips > span.pill.gain` | 1.2 lower | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--gain` → `--ch-gain` on `--gain-tint` → `--ch-chip-gain-bg` | #14613D on #E8EEE8 6.35 | #7CC79B on #29392F 6.10 | pass |
| `div.d-hero > div.chips > span` | than the 10 before | 400 15/19.5, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--bg` → `--ch-grouped-bg` | #46433D on #F2F0E9 8.64 | #D0C9B8 on #0E120F 11.45 | pass |
| `div.ah > h2` ×3 | By round day | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.ah > span.meta` ×3 | Team mean dashed | 400 15/20, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.rib > div.rib-in > span.rref` | Mean | 500 13/13, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > div.rib > span.ry.t` | 72.8 | 400 13/13, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > div.rib > span.ry.b` | 75.9 | 400 13/13, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.rib > div.rx > span` ×2 | Aug 30 | 400 13/13, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.m3 > div > div.t` ×3 | Greens | 400 15/19.5, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.m3 > div > div.v` ×3 | 55% | 600 24/26.4, track −0.020em tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass (large, 3:1) |
| `div.m3 > div > div.m` ×3 | Tour 66% | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.m3 > div > span.pill.loss` | 3 pts | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--loss` → `--ch-loss` on `--loss-tint` → `--ch-chip-loss-bg` | #9A5700 on #F7F0E6 4.97 | #E7AE57 on #3A3524 6.18 | pass |
| `div.m3 > div > span.pill.flat` ×2 | 0.6 | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--flat-tint` → `--ch-chip-flat-bg` | #46433D on #F2F1EE 8.73 | #D0C9B8 on #292D28 8.48 | pass |
| `div > p.anote` | Hole stats from 56 of 70 rounds. G | 400 15/20, track 0 | wraps (2 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `thead > tr > th` ×3 | Day | 400 13/15.6, track 0 | wraps (2 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `tbody > tr > td` ×20 | Oct 12 | 400 15/19.5, track 0 tnum | wraps (2 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `tr > td > b` ×10 | 72.8 | 600 15/19.5, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |

### Marks, icons and controls

| Mark | w × h (pt) | Radius | Padding | Fill, design → app | Non-text contrast light / dark (3:1) |
|---|---|---|---|---|---|
| `span.pill.gain` | 84.4 × 24 | 7px | 4 7 4 7 | `--gain-tint` → `--ch-chip-gain-bg` | surface (holds text; text pairs above) |
| `span.pill.loss` | 58.9 × 24 | 7px | 4 7 4 7 | `--loss-tint` → `--ch-chip-loss-bg` | surface (holds text; text pairs above) |
| `span.pill.flat` | 48.2 × 24 | 7px | 4 7 4 7 | `--flat-tint` → `--ch-chip-flat-bg` | surface (holds text; text pairs above) |

### Icons and hit areas

- Round day rows are text; table cells padding 9 0.

### Data

Round-day averages from `teamDays`; `.m3` cells 600 24/1.1.

### Redline: check these first

1. First card y 239.5.
2. `.m3` grid min 92 per cell.
3. Table head 400 13/1.2.
4. Back label "Stats".
5. Hero 40/40.


## S-TEAMSTATS.tgame: Team game detail (push)

Design: [https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-tgame](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-tgame) · local `redesign/stats-and-home-phone.html#team-light-full-tgame` · app `/clubhouse-preview/stats#sd-team-game` · data 03 "Team · detail pages / Team game"

SG by leg, The round, How strokes gained works. Tap pins a leg row; no range shows (none is loaded).

### Boxes, top to bottom (light, 393 wide, page height 1068)

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | — | StatsTeam game | 0 | 0 | 393 × 114 | 0 0 16 0 | 0px | 125.5 |
| 2 | `section.card` | — | Strokes gained by leg | 16 | 239.5 | 361 × 407 | 14 16 16 16 | 18px | 12 |
| 3 | `section.card` | — | The round | 16 | 658.5 | 361 × 197.8 | 14 16 16 16 | 18px | 12 |
| 4 | `section.card` | — | How strokes gained works | 16 | 868.3 | 361 × 144 | 14 16 16 16 | 18px | end |

### Type, colour and contrast (every text node, light and dark)

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.gb > button.back > span` | Stats | 400 17/17, track 0 | 1, nowrap, never cut (fits by design) | `--champ` → `--ch-champagne-dot` on `--nav` → `--ch-frame` | #E2C98F on #0A331F 8.62 | #E2C98F on #08150E 11.55 | pass |
| `div.gb > span.ptitle` | Team game | 600 17/17, track 0 | 1, nowrap, ellipsis | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.d-sheet > div.d-hero > div.bigv` | −5.8 | 500 40/40, track −0.040em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #F1ECDF on #0E120F 16.01 | pass (large, 3:1) |
| `div.d-sheet > div.d-hero > div.cap` | Team strokes a round against the T | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--bg` → `--ch-grouped-bg` | #46433D on #F2F0E9 8.64 | #D0C9B8 on #0E120F 11.45 | pass |
| `div.d-hero > div.chips > span` | Approach costs the most, 3.3 a rou | 400 15/19.5, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--bg` → `--ch-grouped-bg` | #46433D on #F2F0E9 8.64 | #D0C9B8 on #0E120F 11.45 | pass |
| `div.ah > h2` ×3 | Strokes gained by leg | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.ah > span.meta` ×2 | Per round | 400 15/20, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > p.readout` | Tap a leg to see its likely range. | 400 15/20, track 0 | wraps (2 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.div-rows > div.drow > span.lab` ×4 | Off the tee | 500 16/21, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.div-rows > div.drow > span.val.gain-ink` | +0.6 | 600 17/17, track 0 tnum | wraps (1 at default) | `--gain` → `--ch-gain` on `--card` → `--ch-card-bg` | #14613D on #FFFEFB 7.42 | #7CC79B on #191E1A 8.45 | pass |
| `div.div-rows > div.drow > span.val.loss-ink` ×3 | −3.3 | 600 17/17, track 0 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #E7AE57 on #191E1A 8.53 | pass |
| `div.div-rows > div.drow.total > span.lab` | Team total | 600 16/21, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `.div-rows > div.drow.total > span.val.loss-ink` | −5.8 | 600 17/17, track 0 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #E7AE57 on #191E1A 8.53 | pass |
| `div.scale > span > span` ×3 | −4 | 400 13/13, track 0 tnum | wraps (1 at default) | `--ink-3` → `--ch-ink-500` on `--card` → `--ch-card-bg` | #5F5C55 on #FFFEFB 6.61 | #ADA697 on #191E1A 6.99 | pass |
| `div > p.anote` ×2 | Three legs are losing strokes: App | 400 15/20, track 0 | wraps (2 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.m3 > div > div.t` ×3 | Greens | 400 15/19.5, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.m3 > div > div.v` ×3 | 55% | 600 24/26.4, track −0.020em tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass (large, 3:1) |
| `div.m3 > div > div.m` ×3 | Tour 66% | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.m3 > div > span.pill.loss` | 3 pts | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--loss` → `--ch-loss` on `--loss-tint` → `--ch-chip-loss-bg` | #9A5700 on #F7F0E6 4.97 | #E7AE57 on #3A3524 6.18 | pass |
| `div.m3 > div > span.pill.flat` ×2 | 0.6 | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--flat-tint` → `--ch-chip-flat-bg` | #46433D on #F2F1EE 8.73 | #D0C9B8 on #292D28 8.48 | pass |
| `div > p.how-t` | Each shot is compared with what a  | 400 15/20, track 0 | wraps (4 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |

### Marks, icons and controls

| Mark | w × h (pt) | Radius | Padding | Fill, design → app | Non-text contrast light / dark (3:1) |
|---|---|---|---|---|---|
| `span.rail` | 153 × 12 | 999px | 0 0 0 0 | `--track` → `--ch-chart-track` | surface (holds text; text pairs above) |
| `span.zero` | 1.5 × 22 | 1px | 0 0 0 0 | `--ink-3` → `--ch-ink-500` | 5.31 / 5.42 on `--track` pass |
| `span.bar.gain` | 11.5 × 12 | 999px | 0 0 0 0 | `--gain-fill` → `--ch-green-500` | 5.15 / 4.50 on `--track` pass |
| `span.whisk` | 11.5 × 2 | 0px | 0 0 0 0 | `--ink` → `--ch-ink-900` | 13.72 / 11.12 on `--track` pass |
| `span.bar.loss` | 63.1 × 12 | 999px | 0 0 0 0 | `--loss-fill` → `--ch-chart-loss-fill` | 3.15 / 5.52 on `--track` pass |
| `span.pill.loss` | 58.9 × 24 | 7px | 4 7 4 7 | `--loss-tint` → `--ch-chip-loss-bg` | surface (holds text; text pairs above) |
| `span.pill.flat` | 48.2 × 24 | 7px | 4 7 4 7 | `--flat-tint` → `--ch-chip-flat-bg` | surface (holds text; text pairs above) |

### Icons and hit areas

- Leg rows 44 tall, pin only.

### Data

`team.sgMean` total, `legTotals` per leg.

### Redline: check these first

1. Diverging rows 44.
2. Rail 12, zero 1.5 × 22.
3. First card y 239.5.
4. Scale fixed ±4.
5. Total rule `--sep-strong`.


## S-TEAMSTATS.tplayers: Team players detail (push)

Design: [https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-tplayers](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-tplayers) · local `redesign/stats-and-home-phone.html#team-light-full-tplayers` · app `/clubhouse-preview/stats#sd-team-players` · data 03 "Team · detail pages / Team players"

Who gains and loses: every player, ties marked "T", then today's Players list with Avg / SG sort and peek, unchanged. With every player below zero the sentence reads "loses the least".

### Boxes, top to bottom (light, 393 wide, page height 786)

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | — | StatsPlayers | 0 | 0 | 393 × 114 | 0 0 16 0 | 0px | 125.5 |
| 2 | `section.card.flushb` | — | Who gains and loses | 16 | 239.5 | 361 × 460 | 14 0 4 0 | 18px | end |

### Type, colour and contrast (every text node, light and dark)

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.gb > button.back > span` | Stats | 400 17/17, track 0 | 1, nowrap, never cut (fits by design) | `--champ` → `--ch-champagne-dot` on `--nav` → `--ch-frame` | #E2C98F on #0A331F 8.62 | #E2C98F on #08150E 11.55 | pass |
| `div.gb > span.ptitle` | Players | 600 17/17, track 0 | 1, nowrap, ellipsis | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.d-sheet > div.d-hero > div.bigv` | 7 | 500 40/40, track −0.040em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #F1ECDF on #0E120F 16.01 | pass (large, 3:1) |
| `div.d-sheet > div.d-hero > div.cap` | Players · strokes gained a round a | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--bg` → `--ch-grouped-bg` | #46433D on #F2F0E9 8.64 | #D0C9B8 on #0E120F 11.45 | pass |
| `div.d-hero > div.chips > span` | Tyler Hayes is closest to the Tour | 400 15/19.5, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--bg` → `--ch-grouped-bg` | #46433D on #F2F0E9 8.64 | #D0C9B8 on #0E120F 11.45 | pass |
| `div.ah > h2` | Who gains and loses | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.ah > span.meta` | Strokes gained | 400 15/20, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > p.readout.pad` | Tap a player to see their likely r | 400 15/20, track 0 | wraps (2 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > div.prow > span.rk` ×7 | 1 | 400 13/13, track 0 tnum | wraps (1 at default) | `--ink-3` → `--ch-ink-500` on `--card` → `--ch-card-bg` | #5F5C55 on #FFFEFB 6.61 | #ADA697 on #191E1A 6.99 | pass |
| `div > div.prow > span.nm` ×7 | Tyler Hayes | 500 16/19.2, track 0 | 1, nowrap, ellipsis | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div > div.prow > span.val.loss-ink` ×7 | −3.3 | 600 17/17, track 0 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #E7AE57 on #191E1A 8.53 | pass |

### Marks, icons and controls

| Mark | w × h (pt) | Radius | Padding | Fill, design → app | Non-text contrast light / dark (3:1) |
|---|---|---|---|---|---|
| `span.rail` | 131 × 12 | 999px | 0 0 0 0 | `--track` → `--ch-chart-track` | surface (holds text; text pairs above) |
| `span.zero` | 1.5 × 22 | 1px | 0 0 0 0 | `--ink-3` → `--ch-ink-500` | 5.31 / 5.42 on `--track` pass |
| `span.bar.loss` | 27 × 12 | 999px | 0 0 0 0 | `--loss-fill` → `--ch-chart-loss-fill` | 3.15 / 5.52 on `--track` pass |
| `span.whisk` | 14.7 × 2 | 0px | 0 0 0 0 | `--ink` → `--ch-ink-900` | 13.72 / 11.12 on `--track` pass |

### Icons and hit areas

- Player rows 52 tall: first tap pins, a second tap on the pinned row opens the player (`teamPlayerHref`).

### Data

Per player SG from `teamPlayers`; rail scale fixed ±8; ties share a rank and show "T".

### Redline: check these first

1. First card y 239.5, 361 × 460.
2. Player rows 52.
3. Name column 104, ellipsis.
4. Rail 131 × 12.
5. Whisker 2 tall when pinned.


## S-HOMEGAME: Home "Your game" card (player)

Design: [https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#home-light-full](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#home-light-full) · local `redesign/stats-and-home-phone.html#home-light-full` · app `/clubhouse-preview/home-player` · data 03 "Player · Home \"Your game\""

One card on player Home, four legs. The Home top is the flat green `--ch-frame` (SHARED-1), greeting 600 22, the 20pt-radius lip at y 170.6, the card at y 184.6.

### Boxes, top to bottom (light, 393 wide, page height 1095)

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `div.top` | hheader | Home2   JOGood afternoon, Jona | 0 | 0 | 393 × 190.6 | 0 16 34 16 | 0px | -20 |
| 2 | `div.lip` | — | Your game | 0 | 170.6 | 393 × 924 | 14 0 0 0 | 20px 20px 0px 0px | end |
| 3 | `section.card` | ygame | Your game | 16 | 184.6 | 361 × 862 | 0 0 0 0 | 16px | end |

- Card radius 16, padding 0 (legs carry their own). Header `.ch` padding 14 16 12 with a hairline inset 16.
- Leg `.leg` padding 14 16 16, rule inset 16 between legs. Head: 26 tile + title 600 16/21 + SG pill right. Main: figure 600 28/28 −0.03em wdth 92 tnum, stat 400 15/20, spark 46×k tall on the right half.
- Spark viewBox 240 × 46: line 2.25 round caps; area 22% to 0; mean 1px `--ink-3` dash 2 3; end dot 9 with a 2.5 `--card` ring.
- Approach only: You vs Tour rail 12×k, Tour tick 2 × 22, key 600 15/18.

### Type, colour and contrast (every text node, light and dark)

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.gb > button.sw > span` | Home | 600 18/18, track −0.012em | 1, nowrap, never cut (fits by design) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.gb > button.bellb > b.badge` | 2 | 650 11/19, track 0 | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--accent` → `--ch-green-600` | #F4EEDD on #155A39 7.10 | #F4EEDD on #155A39 7.10 | pass |
| `div.who > span.avatar` | JO | 600 16/16, track 0 | wraps (3 at default) | `--f-bg` → `--ch-green-800` on `#D8CCB0` → `literal` | #0B3A25 on #D8CCB0 8.01 | #0B3A25 on #D8CCB0 8.01 | pass |
| `div.who > span > b` | Good afternoon, Jonah | 600 22/26.4, track −0.015em wdth 92 | wraps (1 at default) | `--nav-ink-2` → `--ch-on-green-ink-2` on `--nav` → `--ch-frame` | #D9D3C2 on #0A331F 9.33 | #D3CCB9 on #08150E 11.66 | pass |
| `div.who > span > span` | Practice at 3:30 · Lonnie Poole ra | 400 15/20.25, track 0 | wraps (1 at default) | `--nav-ink-2` → `--ch-on-green-ink-2` on `--nav` → `--ch-frame` | #D9D3C2 on #0A331F 9.33 | #D3CCB9 on #08150E 11.66 | pass |
| `div.ch > h2` | Your game | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.ch > span.meta` | Strokes gained vs Tour | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `article.leg > div.leg-h > b` ×4 | Off the tee | 600 16/21, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `article.leg > div.leg-h > span.pill.loss` ×4 | −0.9 | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--loss` → `--ch-loss` on `--loss-tint` → `--ch-chip-loss-bg` | #9A5700 on #F7F0E6 4.97 | #E7AE57 on #3A3524 6.18 | pass |
| `div.leg-main > div > div.v` ×4 | 42% | 600 28/28, track −0.030em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass (large, 3:1) |
| `div.leg-main > div > div.s` ×4 | Fairways hit | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > div.spark-cap > span` ×4 | Last 10 rounds | 400 13/15.6, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > div.spark-cap > b` ×3 | No clear change | 600 13/15.6, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.cb.flush > article.leg > p.cnt` ×4 | 59 of 140 fairways in the last 10  | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.bench > div.bench-k > span.loss-ink` | You 55% | 600 15/18, track 0 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #E7AE57 on #191E1A 8.53 | pass |
| `div.bench > div.bench-k > span` | Tour 66% | 400 15/18, track 0 tnum | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > div.spark-cap > b.gain-ink` | Improving | 600 13/15.6, track 0 | wraps (1 at default) | `--gain` → `--ch-gain` on `--card` → `--ch-card-bg` | #14613D on #FFFEFB 7.42 | #7CC79B on #191E1A 8.45 | pass |
| `p.cn` | Figures are your last 10 rounds; s | 400 15/20, track 0 | wraps (5 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |

### Marks, icons and controls

| Mark | w × h (pt) | Radius | Padding | Fill, design → app | Non-text contrast light / dark (3:1) |
|---|---|---|---|---|---|
| `span.pill.loss` | 41 × 24 | 7px | 4 7 4 7 | `--loss-tint` → `--ch-chip-loss-bg` | surface (holds text; text pairs above) |
| `svg.spark` | 232.6 × 46 | 0px | 0 0 0 0 | `—` → `—` |  |
| `span.hrail` | 329 × 12 | 999px | 0 0 0 0 | `--track` → `--ch-chart-track` | surface (holds text; text pairs above) |
| `span.tour` | 2 × 22 | 1px | 0 0 0 0 | `--ink` → `--ch-ink-900` | 13.72 / 11.12 on `--track` pass |

### Icons and hit areas

- Each leg is a link to `#gm-<part>` on My stats (no slide; 07 M-HOME-01), full leg area ≈ 361 × 200.
- Avatar 44×44 and bell 44×44 unchanged.

### Data

03 "Player · Home": SG per leg `season.sgLegs` (3+ rounds); key figure last 10 rounds (`LEG_TREND` 10), equal to My stats Last 10; counts line e.g. "59 of 140 fairways in the last 10 rounds"; trend word "Improving" / "Slipping" only when halves differ past the error, else "No clear change" in `--ink-2`.

### Redline: check these first

1. Home top 190.6 tall; lip at 170.6, radius 20 20 0 0.
2. Card y 184.6, radius 16.
3. Leg figure 28/28.
4. Spark 233 × 46.
5. You vs Tour rail 329 × 12, tick 2 × 22.
6. Pill 24 tall, radius 7.


## States

Each state below was drawn on the design page this round and measured the same way. Only the boxes and the text of the state itself are listed; everything else matches the screen above. Rules that hold in every state:

- Loading keeps the loaded page's own cards at their loaded heights, so nothing moves when figures land (today's `StatsPhoneSkeleton` rule). Titles and section names show; figures, meta and visuals are bars in `--ch-skel-base` with a sheen in `--ch-skel-sheen`. The window switch keeps its look but is `inert` (no taps, no focus) until the page lands. `aria-busy="true"` and the label "Loading stats" / "Loading home" go on the page.
- Didn't load keeps today's codes and copy: CH-5201 My stats, CH-4201 Team, CH-2216 Home. The notice is a card, not a banner: alert icon 16×16 in `--danger`, title 600 15/20 −0.01em, body 400 15/21 `--ink-2`, "Try again" button min height 36×k (hit 44 via `::before { inset: -4px 0 }`), radius 12, `--well`, 1px inset `--sep`, 600 15. Try again shows the skeleton, then the page.
- Long names prove the overflow rules: course "The Country Club of North Carolina, Dogwood", player "Christopher Vanderhoeven-Castellanos", greeting "Good afternoon, Christopher", place "Lonnie Poole Golf Course practice range".


### S-STATS · few (2 rounds)

Few note above Overview: padding 12 14, radius 14, `--well`, 400 15/21 with bold lead "From 2 rounds." SG rows show "—" in `--ink-3`, no rails, "Strokes gained shows from 3 rounds"; SG pills hidden; every tone flat.

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | header | My stats | 0 | 0 | 393 × 114 | 0 0 16 0 | 0px | 0 |
| 2 | `div.ctl` | — | 51020SeasonQualifiers | 0 | 114 | 393 × 52 | 2 16 10 16 | 0px | 12 |
| 3 | `p.few-note` | few | From 2 rounds. Every figure sh | 18 | 178 | 357 × 129 | 12 14 12 14 | 14px | 30 |
| 4 | `h2.sech` | — | Overview | 18 | 337 | 357 × 28 | 0 0 0 0 | 0px | 12 |
| 5 | `section.card.feature` | hero | Scoring average | 16 | 377 | 361 × 341.6 | 14 16 16 16 | 18px | 12 |
| 6 | `section.card.hl` | highlight | What changed | 16 | 730.6 | 361 × 133 | 14 16 16 16 | 18px | 12 |
| 7 | `section.card.glc` | glance | At a glance | 16 | 875.6 | 361 × 237.1 | 14 16 16 16 | 18px | 30 |
| 8 | `h2.sech` | — | Your game | 18 | 1142.7 | 357 × 28 | 0 0 0 0 | 0px | 12 |
| 9 | `section.card` | s-sg | Strokes gained | 16 | 1182.7 | 361 × 280.1 | 14 16 16 16 | 18px | 12 |
| 10 | `section.card` | s-tee | Off the tee | 16 | 1474.8 | 361 × 255.6 | 14 16 16 16 | 18px | 12 |
| 11 | `section.card` | s-approach | Approach | 16 | 1742.3 | 361 × 412.9 | 14 16 16 16 | 18px | 12 |
| 12 | `section.card` | s-short | Short game | 16 | 2167.2 | 361 × 262 | 14 16 16 16 | 18px | 12 |
| 13 | `section.card` | s-putting | Putting | 16 | 2441.2 | 361 × 331.9 | 14 16 16 16 | 18px | 30 |
| 14 | `h2.sech` | — | Rounds | 18 | 2803.1 | 357 × 28 | 0 0 0 0 | 0px | 12 |
| 15 | `section.card` | s-rounds | Round by round | 16 | 2843.1 | 361 × 150.9 | 14 16 16 16 | 18px | 30 |
| 16 | `h2.sech` | — | Development | 18 | 3024 | 357 × 28 | 0 0 0 0 | 0px | 12 |
| 17 | `section.card` | s-goals | Goals and focus areas | 16 | 3064 | 361 × 181.6 | 14 16 16 16 | 18px | end |

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.gb > button.sw > span` | My stats | 600 18/18, track −0.012em | 1, nowrap, never cut (fits by design) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.iseg.w5 > button > span` ×5 | 5 | 500 14/14, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--seg` → `--ch-well-bg` | #46433D on #D4CEBE (well top stop) 6.28 | #D0C9B8 on #0A0D0B 11.84 | pass |
| `div.sheet.airy > p.few-note` | Every figure shows, with its range | 400 15/21, track 0 | wraps (6 at default) | `--ink-2` → `--ch-ink-600` on `--well` → `--ch-well-bg-flat` | #46433D on #F6F4EE 8.96 | #46433D on #F6F4EE 8.96 | pass |
| `div.sheet.airy > p.few-note > b` | From 2 rounds. | 600 15/21, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--well` → `--ch-well-bg-flat` | #1C1B18 on #F6F4EE 15.66 | #1C1B18 on #F6F4EE 15.66 | pass |
| `div.sheet.airy > h2.sech` ×4 | Overview | 700 22/28, track −0.020em wdth 92 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #1C1B18 on #F2F0E9 15.10 | pass (large, 3:1) |
| `div.ah > h2` | Scoring average | 600 17/22, track 0 | wraps (1 at default) | `--f-ink` → `--ch-on-green-plate` on `--f-lit` → `--ch-feature-lit` | #F4F1E8 on #1A442E 9.73 | #F4F1E8 on #1A442E 9.73 | pass |
| `div.ah > span.meta` | 2 rounds | 400 15/20, track 0 | 1, nowrap, never cut (fits by design) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #1A442E 7.62 | pass |
| `div.figs > div.figline > span.fig` | 75.5 | 500 40/40, track −0.040em wdth 92 tnum | wraps (1 at default) | `--f-ink` → `--ch-on-green-plate` on `--f-lit` → `--ch-feature-lit` | #F4F1E8 on #1A442E 9.73 | #F4F1E8 on #1A442E 9.73 | pass (large, 3:1) |
| `div.figs > div.figline > span.fig-sub` | +3.5 to par | 400 17/22, track 0 tnum | wraps (1 at default) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #1A442E 7.62 | pass |
| `div.figs > div.delta > span` | 2 rounds so far. A change shows fr | 400 15/20, track 0 | wraps (1 at default) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #1A442E 7.62 | pass |
| `div.legend > span` ×2 | Round | 400 13/15.6, track 0 | wraps (1 at default) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #1A442E 7.62 | pass |
| `div.ah > h2` ×9 | What changed | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div > p` | 2 rounds so far, averaging 75.5. O | 400 16/23, track 0 | wraps (3 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.glance > button.gc > span.t` ×6 | Greens | 400 15/18.75, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.glance > button.gc > span.v` ×6 | 57 | 600 24/26.4, track −0.020em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass (large, 3:1) |
| `button.gc > span.v > small` ×3 | % | 500 15/15, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.glance > button.gc > span.m` ×6 | Tour 66% | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.sb.one > div > span.bigv` | — | 600 34/34, track −0.035em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass (large, 3:1) |
| `div.sb.one > div > div.cap` | Strokes gained shows from 3 rounds | 400 15/20, track 0 | wraps (2 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.mrows.wait > div.mrow > span.lab` ×4 | Off the tee | 400 15/18, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.mrows.wait > div.mrow > span.val.ink-3` ×4 | — | 600 15/15, track 0 tnum | wraps (1 at default) | `--ink-3` → `--ch-ink-500` on `--card` → `--ch-card-bg` | #5F5C55 on #FFFEFB 6.61 | #5F5C55 on #FFFEFB 6.61 | pass |
| `div.kfr > div > span.bigv` ×4 | 43 | 600 34/34, track −0.035em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass (large, 3:1) |
| `div > span.bigv > small` ×4 | % | 500 17/17, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.kfr > div > div.cap` ×4 | Fairways hit | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.viz > div.mini-key > span` ×3 | Left | 400 13/15.6, track 0 tnum | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.mini-key > span > b` ×3 | 31% | 600 13/15.6, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.strip > div > span.t` ×8 | All tee shots | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.strip > div > span.v` ×8 | 268 | 600 20/23, track −0.015em tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div > span.v > small` ×6 | yds | 500 13/13, track −0.023em | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.mrails > div.mr > span.l` ×15 | 50–75 yds | 400 15/18, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.mrails > div.mr > span.v` ×15 | 80% | 600 15/15, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div > div.viz > div.mini-cap` ×3 | Greens hit by distance, in yards | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.sb > div > span.bigv` | 2 | 600 34/34, track −0.035em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass (large, 3:1) |
| `div.sb > div > div.cap` | Best 74 · Oct 21 | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.sb > div.viz > div.mini-cap` | Taller is lower; best in green | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div > span.rg > span` ×3 | 75.5 | 600 15/15, track 0 | wraps (5 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.rings > div > b` ×3 | Under 75 | 500 15/18.75, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.rings > div > small` ×3 | 0.5 to go | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |


### S-STATS · none

Empty card in Overview: icon tile 44×k radius 12 `--gain-tint`, title 600 20/1.25 "Your stats start with your first round", body 400 15/21 max 30ch, padding 28 22 26. Only Development keeps its section.

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | header | My stats | 0 | 0 | 393 × 114 | 0 0 16 0 | 0px | 8 |
| 2 | `section.card.empty-card` | empty | Your stats start with your fir | 16 | 122 | 361 × 230 | 14 16 16 16 | 18px | 30 |
| 3 | `h2.sech` | — | Development | 18 | 382 | 357 × 28 | 0 0 0 0 | 0px | 12 |
| 4 | `section.card` | s-goals | Goals and focus areas | 16 | 422 | 361 × 181.6 | 14 16 16 16 | 18px | end |

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.gb > button.sw > span` | My stats | 600 18/18, track −0.012em | 1, nowrap, never cut (fits by design) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `h2` | Your stats start with your first r | 600 20/25, track 0 | wraps (2 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `p` | Finish a round with shot tracking  | 400 15/21, track 0 | wraps (4 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.sheet.airy > h2.sech` | Development | 700 22/28, track −0.020em wdth 92 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #1C1B18 on #F2F0E9 15.10 | pass (large, 3:1) |
| `div.ah > h2` | Goals and focus areas | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.ah > span.meta` | 3 active | 400 15/20, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div > span.rg > span` ×2 | 6/10 | 600 15/15, track 0 | wraps (5 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.rings > div > b` ×2 | Approach | 500 15/18.75, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.rings > div > small` ×2 | 125–150 yds | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |


### S-STATS · loading

Every card at its loaded height; feature card a single `.skel.f` block in the feature gradient; head titles stay, meta becomes a 72 × 12 bar; body is a 42%-wide 28×k figure bar over a block that fills the rest, radius 10.

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | header | My stats | 0 | 0 | 393 × 114 | 0 0 16 0 | 0px | 0 |
| 2 | `div.ctl.is-loading` | — | 51020SeasonQualifiers | 0 | 114 | 393 × 52 | 2 16 10 16 | 0px | 12 |
| 3 | `h2.sech` | — | Overview | 18 | 178 | 357 × 28 | 0 0 0 0 | 0px | 12 |
| 4 | `section.card.feature.skel-card` | hero |  | 16 | 218 | 361 × 341.6 | 14 16 16 16 | 18px | 12 |
| 5 | `section.card.hl.skel-card` | highlight | What changed | 16 | 571.6 | 361 × 193 | 14 16 16 16 | 18px | 12 |
| 6 | `section.card.glc.skel-card` | glance | At a glance | 16 | 776.6 | 361 × 237.1 | 14 16 16 16 | 18px | 30 |
| 7 | `h2.sech` | — | Your game | 18 | 1043.7 | 357 × 28 | 0 0 0 0 | 0px | 12 |
| 8 | `section.card.skel-card` | s-sg | Strokes gained | 16 | 1083.7 | 361 × 323.1 | 14 16 16 16 | 18px | 12 |
| 9 | `section.card.skel-card` | s-tee | Off the tee | 16 | 1418.8 | 361 × 255.6 | 14 16 16 16 | 18px | 12 |
| 10 | `section.card.skel-card` | s-approach | Approach | 16 | 1686.3 | 361 × 412.9 | 14 16 16 16 | 18px | 12 |
| 11 | `section.card.skel-card` | s-short | Short game | 16 | 2111.2 | 361 × 262 | 14 16 16 16 | 18px | 12 |
| 12 | `section.card.skel-card` | s-putting | Putting | 16 | 2385.2 | 361 × 331.9 | 14 16 16 16 | 18px | 30 |
| 13 | `h2.sech` | — | Rounds | 18 | 2747.1 | 357 × 28 | 0 0 0 0 | 0px | 12 |
| 14 | `section.card.skel-card` | s-rounds | Round by round | 16 | 2787.1 | 361 × 150.9 | 14 16 16 16 | 18px | 30 |
| 15 | `h2.sech` | — | Development | 18 | 2968 | 357 × 28 | 0 0 0 0 | 0px | 12 |
| 16 | `section.card.skel-card` | s-goals | Goals and focus areas | 16 | 3008 | 361 × 181.6 | 14 16 16 16 | 18px | end |

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.gb > button.sw > span` | My stats | 600 18/18, track −0.012em | 1, nowrap, never cut (fits by design) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.iseg.w5 > button > span` ×5 | 5 | 500 14/14, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--seg` → `--ch-well-bg` | #46433D on #D4CEBE (well top stop) 6.28 | #D0C9B8 on #0A0D0B 11.84 | pass |
| `div.sheet.airy.is-loading > h2.sech` ×4 | Overview | 700 22/28, track −0.020em wdth 92 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #1C1B18 on #F2F0E9 15.10 | pass (large, 3:1) |
| `div.ah > h2` ×9 | What changed | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |


### S-STATS · failed (CH-5201)

"Rounds didn’t load." / "Posted rounds are safe. Every figure that reads them would be incomplete, so they’re hidden. Try again." The window switch stays live. Development and its goals card still render (they don't read rounds).

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | header | My stats | 0 | 0 | 393 × 114 | 0 0 16 0 | 0px | 0 |
| 2 | `div.ctl` | — | 51020SeasonQualifiers | 0 | 114 | 393 × 52 | 2 16 10 16 | 0px | 8 |
| 3 | `section.card.notice-card` | failed | Rounds didn’t load.Posted roun | 16 | 174 | 361 × 165 | 14 16 16 16 | 18px | 30 |
| 4 | `h2.sech` | — | Development | 18 | 369 | 357 × 28 | 0 0 0 0 | 0px | 12 |
| 5 | `section.card` | s-goals | Goals and focus areas | 16 | 409 | 361 × 181.6 | 14 16 16 16 | 18px | end |

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.gb > button.sw > span` | My stats | 600 18/18, track −0.012em | 1, nowrap, never cut (fits by design) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.iseg.w5 > button > span` ×5 | 5 | 500 14/14, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--seg` → `--ch-well-bg` | #46433D on #D4CEBE (well top stop) 6.28 | #D0C9B8 on #0A0D0B 11.84 | pass |
| `div.notice > div.n-tx > p.n-t` | Rounds didn’t load. | 600 15/20, track −0.010em | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.notice > div.n-tx > p.n-b` | Posted rounds are safe. Every figu | 400 15/21, track 0 | wraps (3 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.n-tx > button.n-btn > span` | Try again | 600 15/15, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--well` → `--ch-well-bg-flat` | #1C1B18 on #F6F4EE 15.66 | #F1ECDF on #141815 15.20 | pass |
| `div.sheet.airy > h2.sech` | Development | 700 22/28, track −0.020em wdth 92 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #F1ECDF on #0E120F 16.01 | pass (large, 3:1) |
| `div.ah > h2` | Goals and focus areas | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.ah > span.meta` | 3 active | 400 15/20, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > span.rg > span` ×2 | 6/10 | 600 15/15, track 0 | wraps (5 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.rings > div > b` ×2 | Approach | 500 15/18.75, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.rings > div > small` ×2 | 125–150 yds | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |


### S-STATS · XXL (1.36)

Everything ×1.36; the switch scrolls sideways with a right-edge mask; meta wraps under the title; glance goes to 2 columns; round card stacks the figure over the ticker. Page grows from 3246 to 4518 tall. Nothing clips.

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | header | My stats | 0 | 0 | 393 × 114 | 0 0 16 0 | 0px | 0 |
| 2 | `div.ctl` | — | 51020SeasonQualifiers | 0 | 114 | 393 × 66.4 | 2 16 10 16 | 0px | 12 |
| 3 | `h2.sech` | — | Overview | 18 | 192.4 | 357 × 38.1 | 0 0 0 0 | 0px | 12 |
| 4 | `section.card.feature` | hero | Scoring average | 16 | 242.5 | 361 × 410.8 | 14 16 16 16 | 18px | 12 |
| 5 | `section.card.hl` | highlight | What changed | 16 | 665.3 | 361 × 299.2 | 14 16 16 16 | 18px | 12 |
| 6 | `section.card.glc` | glance | At a glance | 16 | 976.5 | 361 × 435.3 | 14 16 16 16 | 18px | 30 |
| 7 | `h2.sech` | — | Your game | 18 | 1441.8 | 357 × 38.1 | 0 0 0 0 | 0px | 12 |
| 8 | `section.card` | s-sg | Strokes gained | 16 | 1491.8 | 361 × 394 | 14 16 16 16 | 18px | 12 |
| 9 | `section.card` | s-tee | Off the tee | 16 | 1897.8 | 361 × 381.5 | 14 16 16 16 | 18px | 12 |
| 10 | `section.card` | s-approach | Approach | 16 | 2291.3 | 361 × 603.9 | 14 16 16 16 | 18px | 12 |
| 11 | `section.card` | s-short | Short game | 16 | 2907.2 | 361 × 345.7 | 14 16 16 16 | 18px | 12 |
| 12 | `section.card` | s-putting | Putting | 16 | 3264.9 | 361 × 453 | 14 16 16 16 | 18px | 30 |
| 13 | `h2.sech` | — | Rounds | 18 | 3747.8 | 357 × 38.1 | 0 0 0 0 | 0px | 12 |
| 14 | `section.card` | s-rounds | Round by round | 16 | 3797.9 | 361 × 302.6 | 14 16 16 16 | 18px | 30 |
| 15 | `h2.sech` | — | Development | 18 | 4130.5 | 357 × 38.1 | 0 0 0 0 | 0px | 12 |
| 16 | `section.card` | s-goals | Goals and focus areas | 16 | 4180.5 | 361 × 281.6 | 14 16 16 16 | 18px | end |

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.gb > button.sw > span` | My stats | 600 24.48/24.48, track −0.012em | 1, nowrap, never cut (fits by design) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass (large, 3:1) |
| `div.iseg.w5 > button > span` ×5 | 5 | 500 19.04/19.04, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--seg` → `--ch-well-bg` | #46433D on #D4CEBE (well top stop) 6.28 | #D0C9B8 on #0A0D0B 11.84 | pass |
| `div.sheet.airy > h2.sech` ×4 | Overview | 700 29.92/38.08, track −0.020em wdth 92 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #1C1B18 on #F2F0E9 15.10 | pass (large, 3:1) |
| `div.ah > h2` | Scoring average | 600 23.12/29.92, track 0 | wraps (1 at default) | `--f-ink` → `--ch-on-green-plate` on `--f-lit` → `--ch-feature-lit` | #F4F1E8 on #1A442E 9.73 | #F4F1E8 on #1A442E 9.73 | pass |
| `div.ah > span.meta` | Last 10 rounds | 400 20.4/27.2, track 0 | 1, nowrap, never cut (fits by design) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #1A442E 7.62 | pass |
| `div.figs > div.figline > span.fig` | 75.4 | 500 54.4/54.4, track −0.040em wdth 92 tnum | wraps (1 at default) | `--f-ink` → `--ch-on-green-plate` on `--f-lit` → `--ch-feature-lit` | #F4F1E8 on #1A442E 9.73 | #F4F1E8 on #1A442E 9.73 | pass (large, 3:1) |
| `div.figs > div.figline > span.fig-sub` | +3.4 to par | 400 23.12/29.92, track 0 tnum | wraps (1 at default) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #1A442E 7.62 | pass |
| `div.figs > div.delta > span.pill.gain` | 4.3 lower | 600 17.68/21.76, track 0 tnum | 1, nowrap, never cut (fits by design) | `--f-gain` → `--ch-feature-gain` on `--f-gain-tint` → `--ch-feature-gain-tint` | #8FD3AA on #20523A 5.18 | #8FD3AA on #20523A 5.18 | pass |
| `div.figs > div.delta > span` | than the 10 before | 400 20.4/27.2, track 0 | wraps (1 at default) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #1A442E 7.62 | pass |
| `div.legend > span` ×3 | Round | 400 17.68/21.216, track 0 | wraps (1 at default) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #1A442E 7.62 | pass |
| `div.ah > h2` ×9 | What changed | 600 23.12/29.92, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div > p` | Your scoring average is 4.3 lower  | 400 21.76/31.28, track 0 | wraps (4 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.cmp > div.cmp-row > span.k` ×2 | Last 10 | 400 20.4/24.48, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.cmp > div.cmp-row > span.v` ×2 | 75.4 | 600 23.12/23.12, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.glance > button.gc > span.t` ×6 | Greens | 400 20.4/25.5, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.glance > button.gc > span.v.loss-ink` | 57 | 600 32.64/35.904, track −0.020em wdth 92 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #9A5700 on #FFFEFB 5.57 | pass (large, 3:1) |
| `button.gc > span.v.loss-ink > small` | % | 500 20.4/20.4, track 0 | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #9A5700 on #FFFEFB 5.57 | pass |
| `div.glance > button.gc > span.m` ×6 | Tour 66% | 400 17.68/22.984, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.glance > button.gc > span.v` ×5 | 43 | 600 32.64/35.904, track −0.020em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass (large, 3:1) |
| `button.gc > span.v > small` ×2 | % | 500 20.4/20.4, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.sb.one > div > span.bigv.loss-ink` | −5.7 | 600 46.24/46.24, track −0.035em wdth 92 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #9A5700 on #FFFEFB 5.57 | pass (large, 3:1) |
| `div.sb.one > div > div.cap` | Strokes a round against the Tour | 400 20.4/27.2, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.mrows > div.mrow > span.lab` ×4 | Off the tee | 400 20.4/24.48, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.mrows > div.mrow > span.val.loss-ink` ×4 | −0.9 | 600 20.4/20.4, track 0 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #9A5700 on #FFFEFB 5.57 | pass |
| `div > p.sumfoot` | Strongest: . Biggest leak: , 3.4 a | 400 20.4/27.2, track 0 | wraps (2 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div > p.sumfoot > b` ×2 | Around green | 600 20.4/27.2, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.kfr > div > span.bigv` ×4 | 43 | 600 46.24/46.24, track −0.035em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass (large, 3:1) |
| `div > span.bigv > small` ×4 | % | 500 23.12/23.12, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.kfr > div > div.cap` ×4 | Fairways hit | 400 20.4/27.2, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div > div.kfr > span.pill.loss` ×4 | −0.9 SG | 600 17.68/21.76, track 0 tnum | 1, nowrap, never cut (fits by design) | `--loss` → `--ch-loss` on `--loss-tint` → `--ch-chip-loss-bg` | #9A5700 on #F7F0E6 4.97 | #9A5700 on #F7F0E6 4.97 | pass |
| `div.viz > div.mini-key > span` ×3 | Left | 400 17.68/21.216, track 0 tnum | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.mini-key > span > b` ×3 | 31% | 600 17.68/21.216, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.strip > div > span.t` ×8 | All tee shots | 400 17.68/22.984, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.strip > div > span.v` ×8 | 268 | 600 27.2/31.28, track −0.015em tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass (large, 3:1) |
| `div > span.v > small` ×6 | yds | 500 17.68/17.68, track −0.023em | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.mrails > div.mr > span.l` ×15 | 50–75 yds | 400 20.4/24.48, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.mrails > div.mr > span.v` ×15 | 80% | 600 20.4/20.4, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div > div.viz > div.mini-cap` ×3 | Greens hit by distance, in yards | 400 17.68/22.984, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.sb > div > span.bigv` | 10 | 600 46.24/46.24, track −0.035em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass (large, 3:1) |
| `div.sb > div > div.cap` | Best 73 · Oct 3 | 400 20.4/27.2, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.sb > div.viz > div.mini-cap` | Taller is lower; best in green | 400 17.68/22.984, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div > span.rg > span` ×3 | 75.4 | 600 20.4/20.4, track 0 | wraps (5 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.rings > div > b` ×3 | Under 75 | 500 20.4/25.5, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.rings > div > small` ×3 | 0.4 to go | 400 17.68/22.984, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |


### S-STATS · 430 wide

Page edge 20: cards x 20, w 390; section names x 22; switch padding 2 20 10.

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | header | My stats | 0 | 0 | 430 × 114 | 0 0 16 0 | 0px | 0 |
| 2 | `div.ctl` | — | 51020SeasonQualifiers | 0 | 114 | 430 × 52 | 2 20 10 20 | 0px | 12 |
| 3 | `h2.sech` | — | Overview | 22 | 178 | 386 × 28 | 0 0 0 0 | 0px | 12 |
| 4 | `section.card.feature` | hero | Scoring average | 20 | 218 | 390 × 341.6 | 14 16 16 16 | 18px | 12 |
| 5 | `section.card.hl` | highlight | What changed | 20 | 571.6 | 390 × 193 | 14 16 16 16 | 18px | 12 |
| 6 | `section.card.glc` | glance | At a glance | 20 | 776.6 | 390 × 237.1 | 14 16 16 16 | 18px | 30 |
| 7 | `h2.sech` | — | Your game | 22 | 1043.7 | 386 × 28 | 0 0 0 0 | 0px | 12 |
| 8 | `section.card` | s-sg | Strokes gained | 20 | 1083.7 | 390 × 323.1 | 14 16 16 16 | 18px | 12 |
| 9 | `section.card` | s-tee | Off the tee | 20 | 1418.8 | 390 × 255.6 | 14 16 16 16 | 18px | 12 |
| 10 | `section.card` | s-approach | Approach | 20 | 1686.3 | 390 × 412.9 | 14 16 16 16 | 18px | 12 |
| 11 | `section.card` | s-short | Short game | 20 | 2111.2 | 390 × 262 | 14 16 16 16 | 18px | 12 |
| 12 | `section.card` | s-putting | Putting | 20 | 2385.2 | 390 × 331.9 | 14 16 16 16 | 18px | 30 |
| 13 | `h2.sech` | — | Rounds | 22 | 2747.1 | 386 × 28 | 0 0 0 0 | 0px | 12 |
| 14 | `section.card` | s-rounds | Round by round | 20 | 2787.1 | 390 × 150.9 | 14 16 16 16 | 18px | 30 |
| 15 | `h2.sech` | — | Development | 22 | 2968 | 386 × 28 | 0 0 0 0 | 0px | 12 |
| 16 | `section.card` | s-goals | Goals and focus areas | 20 | 3008 | 390 × 181.6 | 14 16 16 16 | 18px | end |

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.gb > button.sw > span` | My stats | 600 18/18, track −0.012em | 1, nowrap, never cut (fits by design) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.iseg.w5 > button > span` ×5 | 5 | 500 14/14, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--seg` → `--ch-well-bg` | #46433D on #D4CEBE (well top stop) 6.28 | #D0C9B8 on #0A0D0B 11.84 | pass |
| `div.sheet.airy > h2.sech` ×4 | Overview | 700 22/28, track −0.020em wdth 92 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #1C1B18 on #F2F0E9 15.10 | pass (large, 3:1) |
| `div.ah > h2` | Scoring average | 600 17/22, track 0 | wraps (1 at default) | `--f-ink` → `--ch-on-green-plate` on `--f-lit` → `--ch-feature-lit` | #F4F1E8 on #1A442E 9.73 | #F4F1E8 on #1A442E 9.73 | pass |
| `div.ah > span.meta` | Last 10 rounds | 400 15/20, track 0 | 1, nowrap, never cut (fits by design) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #1A442E 7.62 | pass |
| `div.figs > div.figline > span.fig` | 75.4 | 500 40/40, track −0.040em wdth 92 tnum | wraps (1 at default) | `--f-ink` → `--ch-on-green-plate` on `--f-lit` → `--ch-feature-lit` | #F4F1E8 on #1A442E 9.73 | #F4F1E8 on #1A442E 9.73 | pass (large, 3:1) |
| `div.figs > div.figline > span.fig-sub` | +3.4 to par | 400 17/22, track 0 tnum | wraps (1 at default) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #1A442E 7.62 | pass |
| `div.figs > div.delta > span.pill.gain` | 4.3 lower | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--f-gain` → `--ch-feature-gain` on `--f-gain-tint` → `--ch-feature-gain-tint` | #8FD3AA on #20523A 5.18 | #8FD3AA on #20523A 5.18 | pass |
| `div.figs > div.delta > span` | than the 10 before | 400 15/20, track 0 | wraps (1 at default) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #1A442E 7.62 | pass |
| `div.legend > span` ×3 | Round | 400 13/15.6, track 0 | wraps (1 at default) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #1A442E 7.62 | pass |
| `div.ah > h2` ×9 | What changed | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div > p` | Your scoring average is 4.3 lower  | 400 16/23, track 0 | wraps (3 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.cmp > div.cmp-row > span.k` ×2 | Last 10 | 400 15/18, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.cmp > div.cmp-row > span.v` ×2 | 75.4 | 600 17/17, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.glance > button.gc > span.t` ×6 | Greens | 400 15/18.75, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.glance > button.gc > span.v.loss-ink` | 57 | 600 24/26.4, track −0.020em wdth 92 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #9A5700 on #FFFEFB 5.57 | pass (large, 3:1) |
| `button.gc > span.v.loss-ink > small` | % | 500 15/15, track 0 | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #9A5700 on #FFFEFB 5.57 | pass |
| `div.glance > button.gc > span.m` ×6 | Tour 66% | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.glance > button.gc > span.v` ×5 | 43 | 600 24/26.4, track −0.020em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass (large, 3:1) |
| `button.gc > span.v > small` ×2 | % | 500 15/15, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.sb.one > div > span.bigv.loss-ink` | −5.7 | 600 34/34, track −0.035em wdth 92 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #9A5700 on #FFFEFB 5.57 | pass (large, 3:1) |
| `div.sb.one > div > div.cap` | Strokes a round against the Tour | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.mrows > div.mrow > span.lab` ×4 | Off the tee | 400 15/18, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.mrows > div.mrow > span.val.loss-ink` ×4 | −0.9 | 600 15/15, track 0 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #9A5700 on #FFFEFB 5.57 | pass |
| `div > p.sumfoot` | Strongest: . Biggest leak: , 3.4 a | 400 15/20, track 0 | wraps (3 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div > p.sumfoot > b` ×2 | Around green | 600 15/20, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.kfr > div > span.bigv` ×4 | 43 | 600 34/34, track −0.035em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass (large, 3:1) |
| `div > span.bigv > small` ×4 | % | 500 17/17, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.kfr > div > div.cap` ×4 | Fairways hit | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div > div.kfr > span.pill.loss` ×4 | −0.9 SG | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--loss` → `--ch-loss` on `--loss-tint` → `--ch-chip-loss-bg` | #9A5700 on #F7F0E6 4.97 | #9A5700 on #F7F0E6 4.97 | pass |
| `div.viz > div.mini-key > span` ×3 | Left | 400 13/15.6, track 0 tnum | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.mini-key > span > b` ×3 | 31% | 600 13/15.6, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.strip > div > span.t` ×8 | All tee shots | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.strip > div > span.v` ×8 | 268 | 600 20/23, track −0.015em tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div > span.v > small` ×6 | yds | 500 13/13, track −0.023em | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.mrails > div.mr > span.l` ×15 | 50–75 yds | 400 15/18, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.mrails > div.mr > span.v` ×15 | 80% | 600 15/15, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div > div.viz > div.mini-cap` ×3 | Greens hit by distance, in yards | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.sb > div > span.bigv` | 10 | 600 34/34, track −0.035em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass (large, 3:1) |
| `div.sb > div > div.cap` | Best 73 · Oct 3 | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.sb > div.viz > div.mini-cap` | Taller is lower; best in green | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div > span.rg > span` ×3 | 75.4 | 600 15/15, track 0 | wraps (5 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.rings > div > b` ×3 | Under 75 | 500 15/18.75, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.rings > div > small` ×3 | 0.4 to go | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |


### S-STATS.rounds · long names

Course names end in an ellipsis on one line; the row stays 64 tall at Default and grows at XXL (both lines keep one line each).

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | — | My statsRounds | 0 | 0 | 393 × 114 | 0 0 16 0 | 0px | 96 |
| 2 | `section.card` | — | Round by round | 16 | 210 | 361 × 180 | 14 16 16 16 | 18px | 12 |
| 3 | `section.card` | — | Personal bests | 16 | 402 | 361 × 238.6 | 14 16 16 16 | 18px | 12 |
| 4 | `section.card` | — | Against the 10 before | 16 | 652.6 | 361 × 416.4 | 14 16 16 16 | 18px | 12 |
| 5 | `section.card.flushb` | — | Every round | 16 | 1080.9 | 361 × 692 | 14 0 4 0 | 18px | end |

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.gb > button.back > span` | My stats | 400 17/17, track 0 | 1, nowrap, never cut (fits by design) | `--champ` → `--ch-champagne-dot` on `--nav` → `--ch-frame` | #E2C98F on #0A331F 8.62 | #E2C98F on #0A331F 8.62 | pass |
| `div.gb > span.ptitle` | Rounds | 600 17/17, track 0 | 1, nowrap, ellipsis | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.d-sheet > div.d-hero > div.bigv` | 10 | 500 40/40, track −0.040em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #1C1B18 on #F2F0E9 15.10 | pass (large, 3:1) |
| `div.d-sheet > div.d-hero > div.cap` | Rounds · averaging 75.4 · Last 10  | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--bg` → `--ch-grouped-bg` | #46433D on #F2F0E9 8.64 | #46433D on #F2F0E9 8.64 | pass |
| `div.ah > h2` ×4 | Round by round | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.ah > span.meta` ×3 | Taller is lower | 400 15/20, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div > p.anote` | Best round in green. Score by roun | 400 15/20, track 0 | wraps (2 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.m4 > div > div.t` ×4 | Best score | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.m4 > div > div.v` ×4 | 73 | 600 24/26.4, track −0.020em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass (large, 3:1) |
| `div.m4 > div > div.m` ×4 | Oct 3 · Pinehurst No. 8 | 400 13/16.9, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.db > div > div.l` ×4 | Scoring average | 500 16/21, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.db > div > div.nums` ×4 | from 79.7 | 400 15/19.5, track 0 tnum | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div > div.nums > b` ×4 | 75.4 | 600 17/22.1, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div > div.db > span.pill.gain` ×2 | 4.3 | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--gain` → `--ch-gain` on `--gain-tint` → `--ch-chip-gain-bg` | #14613D on #E8EEE8 6.35 | #14613D on #E8EEE8 6.35 | pass |
| `div > div.db > span.pill.loss` | 3.9 pts | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--loss` → `--ch-loss` on `--loss-tint` → `--ch-chip-loss-bg` | #9A5700 on #F7F0E6 4.97 | #9A5700 on #F7F0E6 4.97 | pass |
| `div > div.db > span.pill.flat` | 0.6 | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--flat-tint` → `--ch-chip-flat-bg` | #46433D on #F2F1EE 8.73 | #46433D on #F2F1EE 8.73 | pass |
| `ul.rlist > li.rrow > span.score` ×10 | 74 | 600 19/19, track −0.020em tnum | wraps (2 at default) | `--ink` → `--ch-ink-900` on `--well` → `--ch-well-bg-flat` | #1C1B18 on #F6F4EE 15.66 | #1C1B18 on #F6F4EE 15.66 | pass |
| `li.rrow > span.c > b` ×10 | The Country Club of North Carolina | 500 16/21, track 0 | 1, nowrap, ellipsis | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `li.rrow > span.c > span` ×10 | Oct 21 · Tournament | 400 15/20, track 0 | 1, nowrap, ellipsis | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `li.rrow > span.r > span.tp` ×10 | +2 | 600 15/15, track 0 tnum | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `li.rrow > span.r > span.pill.loss` ×10 | −3.7 SG | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--loss` → `--ch-loss` on `--loss-tint` → `--ch-chip-loss-bg` | #9A5700 on #F7F0E6 4.97 | #9A5700 on #F7F0E6 4.97 | pass |


### S-TEAMSTATS · few (2 round days)

Few note as My stats; tones flat; SG waits for 3 round days.

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | theader | Stats2 | 0 | 0 | 393 × 114 | 0 0 16 0 | 0px | 0 |
| 2 | `div.ctl` | — | 51020SeasonQualifiers | 0 | 114 | 393 × 52 | 2 16 10 16 | 0px | 12 |
| 3 | `p.few-note` | few | From 2 round days. Every figur | 18 | 178 | 357 × 108 | 12 14 12 14 | 14px | 30 |
| 4 | `h2.sech` | — | Overview | 18 | 316 | 357 × 28 | 0 0 0 0 | 0px | 12 |
| 5 | `section.card.feature` | thero | Team scoring average | 16 | 356 | 361 × 282 | 14 16 16 16 | 18px | 30 |
| 6 | `h2.sech` | — | Team game | 18 | 668 | 357 × 28 | 0 0 0 0 | 0px | 12 |
| 7 | `section.card` | tgame | Strokes gained by leg | 16 | 708 | 361 × 303.1 | 14 16 16 16 | 18px | 30 |
| 8 | `h2.sech` | — | Players | 18 | 1041.1 | 357 × 28 | 0 0 0 0 | 0px | 12 |
| 9 | `section.card.flushb` | tplayers | Who gains and loses | 16 | 1081.1 | 361 × 261 | 14 0 4 0 | 18px | end |

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.gb > button.sw > span` | Stats | 600 18/18, track −0.012em | 1, nowrap, never cut (fits by design) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.gb > button.bellb > b.badge` | 2 | 650 11/19, track 0 | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--accent` → `--ch-green-600` | #F4EEDD on #155A39 7.10 | #F4EEDD on #155A39 7.10 | pass |
| `div.iseg.w5 > button > span` ×5 | 5 | 500 14/14, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--seg` → `--ch-well-bg` | #46433D on #D4CEBE (well top stop) 6.28 | #D0C9B8 on #0A0D0B 11.84 | pass |
| `div.sheet.airy > p.few-note` | Every figure shows, with its range | 400 15/21, track 0 | wraps (5 at default) | `--ink-2` → `--ch-ink-600` on `--well` → `--ch-well-bg-flat` | #46433D on #F6F4EE 8.96 | #46433D on #F6F4EE 8.96 | pass |
| `div.sheet.airy > p.few-note > b` | From 2 round days. | 600 15/21, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--well` → `--ch-well-bg-flat` | #1C1B18 on #F6F4EE 15.66 | #1C1B18 on #F6F4EE 15.66 | pass |
| `div.sheet.airy > h2.sech` ×3 | Overview | 700 22/28, track −0.020em wdth 92 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #1C1B18 on #F2F0E9 15.10 | pass (large, 3:1) |
| `div.ah > h2` | Team scoring average | 600 17/22, track 0 | wraps (1 at default) | `--f-ink` → `--ch-on-green-plate` on `--f-lit` → `--ch-feature-lit` | #F4F1E8 on #1A442E 9.73 | #F4F1E8 on #1A442E 9.73 | pass |
| `div.ah > span.meta` | 2 days | 400 15/20, track 0 | 1, nowrap, never cut (fits by design) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #1A442E 7.62 | pass |
| `div.figs > div.figline > span.fig` | 73.3 | 500 40/40, track −0.040em wdth 92 tnum | wraps (1 at default) | `--f-ink` → `--ch-on-green-plate` on `--f-lit` → `--ch-feature-lit` | #F4F1E8 on #1A442E 9.73 | #F4F1E8 on #1A442E 9.73 | pass (large, 3:1) |
| `div.figs > div.figline > span.fig-sub` | +1.3 to par | 400 17/22, track 0 tnum | wraps (1 at default) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #1A442E 7.62 | pass |
| `div.figs > div.delta > span` | 2 round days so far | 400 15/20, track 0 | wraps (1 at default) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #1A442E 7.62 | pass |
| `div.ah > h2` ×2 | Strokes gained by leg | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.ah > span.meta` ×2 | vs Tour | 400 15/20, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.sb.one > div > span.bigv` | −5.8 | 600 34/34, track −0.035em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass (large, 3:1) |
| `div.sb.one > div > div.cap` | Team strokes a round against the T | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.mrows > div.mrow > span.lab` ×4 | Off the tee | 400 15/18, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.mrows > div.mrow > span.val` ×4 | +0.6 | 600 15/15, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div > p.sumfoot` | Greens · Putts · Scrambling | 400 15/20, track 0 | wraps (2 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div > p.sumfoot > b` ×3 | 55% | 600 15/20, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.mini-players > div.prow > span.rk` ×3 | 1 | 400 13/13, track 0 tnum | wraps (1 at default) | `--ink-3` → `--ch-ink-500` on `--card` → `--ch-card-bg` | #5F5C55 on #FFFEFB 6.61 | #5F5C55 on #FFFEFB 6.61 | pass |
| `div.mini-players > div.prow > span.nm` ×3 | Tyler Hayes | 500 16/19.2, track 0 | 1, nowrap, ellipsis | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.mini-players > div.prow > span.val` ×3 | −3.3 | 600 17/17, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div > p.sumfoot.pad` | Tyler Hayes is closest to the Tour | 400 15/20, track 0 | wraps (2 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |


### S-TEAMSTATS · none

Empty card "No team rounds yet".

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | theader | Stats2 | 0 | 0 | 393 × 114 | 0 0 16 0 | 0px | 8 |
| 2 | `section.card.empty-card` | empty | No team rounds yet | 16 | 122 | 361 × 205 | 14 16 16 16 | 18px | end |

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.gb > button.sw > span` | Stats | 600 18/18, track −0.012em | 1, nowrap, never cut (fits by design) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.gb > button.bellb > b.badge` | 2 | 650 11/19, track 0 | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--accent` → `--ch-green-600` | #F4EEDD on #155A39 7.10 | #F4EEDD on #155A39 7.10 | pass |
| `h2` | No team rounds yet | 600 20/25, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `p` | When players finish rounds with sh | 400 15/21, track 0 | wraps (4 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |


### S-TEAMSTATS · loading (CH-4401)

Skeleton as My stats; today's team skeleton code CH-4401 is kept on the container.

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | theader | Stats2 | 0 | 0 | 393 × 114 | 0 0 16 0 | 0px | 0 |
| 2 | `div.ctl.is-loading` | — | 51020SeasonQualifiers | 0 | 114 | 393 × 52 | 2 16 10 16 | 0px | 12 |
| 3 | `h2.sech` | — | Overview | 18 | 178 | 357 × 28 | 0 0 0 0 | 0px | 12 |
| 4 | `section.card.feature.skel-card` | thero |  | 16 | 218 | 361 × 282 | 14 16 16 16 | 18px | 30 |
| 5 | `h2.sech` | — | Team game | 18 | 530 | 357 × 28 | 0 0 0 0 | 0px | 12 |
| 6 | `section.card.skel-card` | tgame | Strokes gained by leg | 16 | 570 | 361 × 303.1 | 14 16 16 16 | 18px | 30 |
| 7 | `h2.sech` | — | Players | 18 | 903.1 | 357 × 28 | 0 0 0 0 | 0px | 12 |
| 8 | `section.card.flushb.skel-card` | tplayers | Who gains and loses | 16 | 943.1 | 361 × 261 | 14 0 4 0 | 18px | end |

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.gb > button.sw > span` | Stats | 600 18/18, track −0.012em | 1, nowrap, never cut (fits by design) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.gb > button.bellb > b.badge` | 2 | 650 11/19, track 0 | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--accent` → `--ch-green-600` | #F4EEDD on #155A39 7.10 | #F4EEDD on #155A39 7.10 | pass |
| `div.iseg.w5 > button > span` ×5 | 5 | 500 14/14, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--seg` → `--ch-well-bg` | #46433D on #D4CEBE (well top stop) 6.28 | #D0C9B8 on #0A0D0B 11.84 | pass |
| `div.sheet.airy.is-loading > h2.sech` ×3 | Overview | 700 22/28, track −0.020em wdth 92 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #1C1B18 on #F2F0E9 15.10 | pass (large, 3:1) |
| `div.ah > h2` ×2 | Strokes gained by leg | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |


### S-TEAMSTATS · failed (CH-4201)

Whole-page failure card `.empty-card.is-danger`: "Team rounds didn’t load" / "Every figure would be incomplete, so none is shown." with Try again; icon tile in `--danger-tint`.

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | theader | Stats2 | 0 | 0 | 393 × 114 | 0 0 16 0 | 0px | 0 |
| 2 | `div.ctl` | — | 51020SeasonQualifiers | 0 | 114 | 393 × 52 | 2 16 10 16 | 0px | 8 |
| 3 | `section.card.empty-card.is-danger` | failed | Team rounds didn’t load | 16 | 174 | 361 × 213 | 14 16 16 16 | 18px | end |

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.gb > button.sw > span` | Stats | 600 18/18, track −0.012em | 1, nowrap, never cut (fits by design) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.gb > button.bellb > b.badge` | 2 | 650 11/19, track 0 | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--accent` → `--ch-green-600` | #F4EEDD on #155A39 7.10 | #F4EEDD on #155A39 7.10 | pass |
| `div.iseg.w5 > button > span` ×5 | 5 | 500 14/14, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--seg` → `--ch-well-bg` | #46433D on #D4CEBE (well top stop) 6.28 | #D0C9B8 on #0A0D0B 11.84 | pass |
| `h2` | Team rounds didn’t load | 600 20/25, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `p` | Every figure would be incomplete,  | 400 15/21, track 0 | wraps (2 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `button.n-btn > span` | Try again | 600 15/15, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--well` → `--ch-well-bg-flat` | #1C1B18 on #F6F4EE 15.66 | #F1ECDF on #141815 15.20 | pass |


### S-TEAMSTATS · XXL (1.36)

As My stats.

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | theader | Stats2 | 0 | 0 | 393 × 114 | 0 0 16 0 | 0px | 0 |
| 2 | `div.ctl` | — | 51020SeasonQualifiers | 0 | 114 | 393 × 66.4 | 2 16 10 16 | 0px | 12 |
| 3 | `h2.sech` | — | Overview | 18 | 192.4 | 357 × 38.1 | 0 0 0 0 | 0px | 12 |
| 4 | `section.card.feature` | thero | Team scoring average | 16 | 242.5 | 361 × 345.6 | 14 16 16 16 | 18px | 30 |
| 5 | `h2.sech` | — | Team game | 18 | 618.1 | 357 × 38.1 | 0 0 0 0 | 0px | 12 |
| 6 | `section.card` | tgame | Strokes gained by leg | 16 | 668.1 | 361 × 421.2 | 14 16 16 16 | 18px | 30 |
| 7 | `h2.sech` | — | Players | 18 | 1119.3 | 357 × 38.1 | 0 0 0 0 | 0px | 12 |
| 8 | `section.card.flushb` | tplayers | Who gains and loses | 16 | 1169.4 | 361 × 312.5 | 14 0 4 0 | 18px | end |

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.gb > button.sw > span` | Stats | 600 24.48/24.48, track −0.012em | 1, nowrap, never cut (fits by design) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass (large, 3:1) |
| `div.gb > button.bellb > b.badge` | 2 | 650 11/19, track 0 | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--accent` → `--ch-green-600` | #F4EEDD on #155A39 7.10 | #F4EEDD on #155A39 7.10 | pass |
| `div.iseg.w5 > button > span` ×5 | 5 | 500 19.04/19.04, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--seg` → `--ch-well-bg` | #46433D on #D4CEBE (well top stop) 6.28 | #D0C9B8 on #0A0D0B 11.84 | pass |
| `div.sheet.airy > h2.sech` ×3 | Overview | 700 29.92/38.08, track −0.020em wdth 92 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #1C1B18 on #F2F0E9 15.10 | pass (large, 3:1) |
| `div.ah > h2` | Team scoring average | 600 23.12/29.92, track 0 | wraps (1 at default) | `--f-ink` → `--ch-on-green-plate` on `--f-lit` → `--ch-feature-lit` | #F4F1E8 on #1A442E 9.73 | #F4F1E8 on #1A442E 9.73 | pass |
| `div.ah > span.meta` | Last 10 days | 400 20.4/27.2, track 0 | 1, nowrap, never cut (fits by design) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #1A442E 7.62 | pass |
| `div.figs > div.figline > span.fig` | 74.1 | 500 54.4/54.4, track −0.040em wdth 92 tnum | wraps (1 at default) | `--f-ink` → `--ch-on-green-plate` on `--f-lit` → `--ch-feature-lit` | #F4F1E8 on #1A442E 9.73 | #F4F1E8 on #1A442E 9.73 | pass (large, 3:1) |
| `div.figs > div.figline > span.fig-sub` | +2.1 to par | 400 23.12/29.92, track 0 tnum | wraps (1 at default) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #1A442E 7.62 | pass |
| `div.figs > div.delta > span.pill.gain` | 1.2 lower | 600 17.68/21.76, track 0 tnum | 1, nowrap, never cut (fits by design) | `--f-gain` → `--ch-feature-gain` on `--f-gain-tint` → `--ch-feature-gain-tint` | #8FD3AA on #20523A 5.18 | #8FD3AA on #20523A 5.18 | pass |
| `div.figs > div.delta > span` | than the 10 before | 400 20.4/27.2, track 0 | wraps (1 at default) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #1A442E 7.62 | pass |
| `div.ah > h2` ×2 | Strokes gained by leg | 600 23.12/29.92, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.ah > span.meta` ×2 | vs Tour | 400 20.4/27.2, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.sb.one > div > span.bigv.loss-ink` | −5.8 | 600 46.24/46.24, track −0.035em wdth 92 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #9A5700 on #FFFEFB 5.57 | pass (large, 3:1) |
| `div.sb.one > div > div.cap` | Team strokes a round against the T | 400 20.4/27.2, track 0 | wraps (2 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.mrows > div.mrow > span.lab` ×4 | Off the tee | 400 20.4/24.48, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.mrows > div.mrow > span.val.gain-ink` | +0.6 | 600 20.4/20.4, track 0 tnum | wraps (1 at default) | `--gain` → `--ch-gain` on `--card` → `--ch-card-bg` | #14613D on #FFFEFB 7.42 | #14613D on #FFFEFB 7.42 | pass |
| `div.mrows > div.mrow > span.val.loss-ink` ×3 | −3.3 | 600 20.4/20.4, track 0 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #9A5700 on #FFFEFB 5.57 | pass |
| `div > p.sumfoot` | Greens · Putts · Scrambling | 400 20.4/27.2, track 0 | wraps (2 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div > p.sumfoot > b` ×3 | 55% | 600 20.4/27.2, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.mini-players > div.prow > span.rk` ×3 | 1 | 400 17.68/17.68, track 0 tnum | wraps (1 at default) | `--ink-3` → `--ch-ink-500` on `--card` → `--ch-card-bg` | #5F5C55 on #FFFEFB 6.61 | #5F5C55 on #FFFEFB 6.61 | pass |
| `div.mini-players > div.prow > span.nm` ×3 | Tyler Hayes | 500 21.76/26.112, track 0 | 1, nowrap, ellipsis | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `iv.mini-players > div.prow > span.val.loss-ink` ×3 | −3.3 | 600 23.12/23.12, track 0 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #9A5700 on #FFFEFB 5.57 | pass |
| `div > p.sumfoot.pad` | Tyler Hayes is closest to the Tour | 400 20.4/27.2, track 0 | wraps (2 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |


### S-TEAMSTATS · 430 wide

Edge 20.

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | theader | Stats2 | 0 | 0 | 430 × 114 | 0 0 16 0 | 0px | 0 |
| 2 | `div.ctl` | — | 51020SeasonQualifiers | 0 | 114 | 430 × 52 | 2 20 10 20 | 0px | 12 |
| 3 | `h2.sech` | — | Overview | 22 | 178 | 386 × 28 | 0 0 0 0 | 0px | 12 |
| 4 | `section.card.feature` | thero | Team scoring average | 20 | 218 | 390 × 282 | 14 16 16 16 | 18px | 30 |
| 5 | `h2.sech` | — | Team game | 22 | 530 | 386 × 28 | 0 0 0 0 | 0px | 12 |
| 6 | `section.card` | tgame | Strokes gained by leg | 20 | 570 | 390 × 303.1 | 14 16 16 16 | 18px | 30 |
| 7 | `h2.sech` | — | Players | 22 | 903.1 | 386 × 28 | 0 0 0 0 | 0px | 12 |
| 8 | `section.card.flushb` | tplayers | Who gains and loses | 20 | 943.1 | 390 × 261 | 14 0 4 0 | 18px | end |

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.gb > button.sw > span` | Stats | 600 18/18, track −0.012em | 1, nowrap, never cut (fits by design) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.gb > button.bellb > b.badge` | 2 | 650 11/19, track 0 | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--accent` → `--ch-green-600` | #F4EEDD on #155A39 7.10 | #F4EEDD on #155A39 7.10 | pass |
| `div.iseg.w5 > button > span` ×5 | 5 | 500 14/14, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--seg` → `--ch-well-bg` | #46433D on #D4CEBE (well top stop) 6.28 | #D0C9B8 on #0A0D0B 11.84 | pass |
| `div.sheet.airy > h2.sech` ×3 | Overview | 700 22/28, track −0.020em wdth 92 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #1C1B18 on #F2F0E9 15.10 | pass (large, 3:1) |
| `div.ah > h2` | Team scoring average | 600 17/22, track 0 | wraps (1 at default) | `--f-ink` → `--ch-on-green-plate` on `--f-lit` → `--ch-feature-lit` | #F4F1E8 on #1A442E 9.73 | #F4F1E8 on #1A442E 9.73 | pass |
| `div.ah > span.meta` | Last 10 days | 400 15/20, track 0 | 1, nowrap, never cut (fits by design) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #1A442E 7.62 | pass |
| `div.figs > div.figline > span.fig` | 74.1 | 500 40/40, track −0.040em wdth 92 tnum | wraps (1 at default) | `--f-ink` → `--ch-on-green-plate` on `--f-lit` → `--ch-feature-lit` | #F4F1E8 on #1A442E 9.73 | #F4F1E8 on #1A442E 9.73 | pass (large, 3:1) |
| `div.figs > div.figline > span.fig-sub` | +2.1 to par | 400 17/22, track 0 tnum | wraps (1 at default) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #1A442E 7.62 | pass |
| `div.figs > div.delta > span.pill.gain` | 1.2 lower | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--f-gain` → `--ch-feature-gain` on `--f-gain-tint` → `--ch-feature-gain-tint` | #8FD3AA on #20523A 5.18 | #8FD3AA on #20523A 5.18 | pass |
| `div.figs > div.delta > span` | than the 10 before | 400 15/20, track 0 | wraps (1 at default) | `--f-ink-2` → `--ch-feature-ink-2` on `--f-lit` → `--ch-feature-lit` | #D3D9CB on #1A442E 7.62 | #D3D9CB on #1A442E 7.62 | pass |
| `div.ah > h2` ×2 | Strokes gained by leg | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.ah > span.meta` ×2 | vs Tour | 400 15/20, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.sb.one > div > span.bigv.loss-ink` | −5.8 | 600 34/34, track −0.035em wdth 92 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #9A5700 on #FFFEFB 5.57 | pass (large, 3:1) |
| `div.sb.one > div > div.cap` | Team strokes a round against the T | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.mrows > div.mrow > span.lab` ×4 | Off the tee | 400 15/18, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.mrows > div.mrow > span.val.gain-ink` | +0.6 | 600 15/15, track 0 tnum | wraps (1 at default) | `--gain` → `--ch-gain` on `--card` → `--ch-card-bg` | #14613D on #FFFEFB 7.42 | #14613D on #FFFEFB 7.42 | pass |
| `div.mrows > div.mrow > span.val.loss-ink` ×3 | −3.3 | 600 15/15, track 0 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #9A5700 on #FFFEFB 5.57 | pass |
| `div > p.sumfoot` | Greens · Putts · Scrambling | 400 15/20, track 0 | wraps (2 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div > p.sumfoot > b` ×3 | 55% | 600 15/20, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.mini-players > div.prow > span.rk` ×3 | 1 | 400 13/13, track 0 tnum | wraps (1 at default) | `--ink-3` → `--ch-ink-500` on `--card` → `--ch-card-bg` | #5F5C55 on #FFFEFB 6.61 | #5F5C55 on #FFFEFB 6.61 | pass |
| `div.mini-players > div.prow > span.nm` ×3 | Tyler Hayes | 500 16/19.2, track 0 | 1, nowrap, ellipsis | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `iv.mini-players > div.prow > span.val.loss-ink` ×3 | −3.3 | 600 17/17, track 0 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #9A5700 on #FFFEFB 5.57 | pass |
| `div > p.sumfoot.pad` | Tyler Hayes is closest to the Tour | 400 15/20, track 0 | wraps (2 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |


### S-TEAMSTATS.tplayers · long names

Player names end in an ellipsis inside the 104×k column; the rail never narrows below 96.

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | — | StatsPlayers | 0 | 0 | 393 × 114 | 0 0 16 0 | 0px | 145 |
| 2 | `section.card.flushb` | — | Who gains and loses | 16 | 259 | 361 × 460 | 14 0 4 0 | 18px | end |

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.gb > button.back > span` | Stats | 400 17/17, track 0 | 1, nowrap, never cut (fits by design) | `--champ` → `--ch-champagne-dot` on `--nav` → `--ch-frame` | #E2C98F on #0A331F 8.62 | #E2C98F on #0A331F 8.62 | pass |
| `div.gb > span.ptitle` | Players | 600 17/17, track 0 | 1, nowrap, ellipsis | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.d-sheet > div.d-hero > div.bigv` | 7 | 500 40/40, track −0.040em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--bg` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 15.10 | #1C1B18 on #F2F0E9 15.10 | pass (large, 3:1) |
| `div.d-sheet > div.d-hero > div.cap` | Players · strokes gained a round a | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--bg` → `--ch-grouped-bg` | #46433D on #F2F0E9 8.64 | #46433D on #F2F0E9 8.64 | pass |
| `div.d-hero > div.chips > span` | Christopher Vanderhoeven-Castellan | 400 15/19.5, track 0 | wraps (2 at default) | `--ink-2` → `--ch-ink-600` on `--bg` → `--ch-grouped-bg` | #46433D on #F2F0E9 8.64 | #46433D on #F2F0E9 8.64 | pass |
| `div.ah > h2` | Who gains and loses | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.ah > span.meta` | Strokes gained | 400 15/20, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div > p.readout.pad` | Tap a player to see their likely r | 400 15/20, track 0 | wraps (2 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div > div.prow > span.rk` ×7 | 1 | 400 13/13, track 0 tnum | wraps (1 at default) | `--ink-3` → `--ch-ink-500` on `--card` → `--ch-card-bg` | #5F5C55 on #FFFEFB 6.61 | #5F5C55 on #FFFEFB 6.61 | pass |
| `div > div.prow > span.nm` ×7 | Christopher Vanderhoeven-Castellan | 500 16/19.2, track 0 | 1, nowrap, ellipsis | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div > div.prow > span.val.loss-ink` ×7 | −3.3 | 600 17/17, track 0 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #9A5700 on #FFFEFB 5.57 | pass |


### S-HOMEGAME · few (2 rounds)

Each figure with an "Early read · 12 of 28 fairways in 2 rounds" counts line; no pills (SG starts from round 3); Scrambling shows "—" and "Needs 10 chances to get up and down"; sparks draw from 2 points; trend "No clear change"; footnote "From 2 rounds. Each figure shows with an early-read tag and nothing is coloured until a difference is clear. Strokes gained starts from the third round."

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `div.top` | hheader | Home2   JOGood afternoon, Jona | 0 | 0 | 393 × 190.6 | 0 16 34 16 | 0px | -20 |
| 2 | `div.lip` | — | Your game | 0 | 170.6 | 393 × 896.4 | 14 0 0 0 | 20px 20px 0px 0px | end |
| 3 | `section.card` | ygame | Your game | 16 | 184.6 | 361 × 834.4 | 0 0 0 0 | 16px | end |

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.gb > button.sw > span` | Home | 600 18/18, track −0.012em | 1, nowrap, never cut (fits by design) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.gb > button.bellb > b.badge` | 2 | 650 11/19, track 0 | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--accent` → `--ch-green-600` | #F4EEDD on #155A39 7.10 | #F4EEDD on #155A39 7.10 | pass |
| `div.who > span.avatar` | JO | 600 16/16, track 0 | wraps (3 at default) | `--f-bg` → `--ch-green-800` on `#D8CCB0` → `literal` | #0B3A25 on #D8CCB0 8.01 | #0B3A25 on #D8CCB0 8.01 | pass |
| `div.who > span > b` | Good afternoon, Jonah | 600 22/26.4, track −0.015em wdth 92 | wraps (1 at default) | `--nav-ink-2` → `--ch-on-green-ink-2` on `--nav` → `--ch-frame` | #D9D3C2 on #0A331F 9.33 | #D9D3C2 on #0A331F 9.33 | pass |
| `div.who > span > span` | Practice at 3:30 · Lonnie Poole ra | 400 15/20.25, track 0 | wraps (1 at default) | `--nav-ink-2` → `--ch-on-green-ink-2` on `--nav` → `--ch-frame` | #D9D3C2 on #0A331F 9.33 | #D9D3C2 on #0A331F 9.33 | pass |
| `div.ch > h2` | Your game | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.ch > span.meta` | Strokes gained vs Tour | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `article.leg > div.leg-h > b` ×4 | Off the tee | 600 16/21, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.leg-main > div > div.v` ×4 | 43% | 600 28/28, track −0.030em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass (large, 3:1) |
| `div.leg-main > div > div.s` ×4 | Fairways hit | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div > div.spark-cap > span` ×3 | Last 2 rounds | 400 13/15.6, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div > div.spark-cap > b` ×3 | No clear change | 600 13/15.6, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.cb.flush > article.leg > p.cnt` ×4 | Early read · 12 of 28 fairways in  | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.bench > div.bench-k > span` | You 69% | 600 15/18, track 0 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.bench > div.bench-k > span` | Tour 66% | 400 15/18, track 0 tnum | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `p.cn` | From 2 rounds. Each figure shows w | 400 15/20, track 0 | wraps (5 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |


### S-HOMEGAME · none (CH-2311)

Card keeps its header; body "Nothing to break down yet." 600 16/21 and "Fairways, greens, scrambling and putts fill in from rounds posted with those stats." 400 15/21; no footnote.

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `div.top` | hheader | Home2   JOGood afternoon, Jona | 0 | 0 | 393 × 190.6 | 0 16 34 16 | 0px | -20 |
| 2 | `div.lip` | — | Your game | 0 | 170.6 | 393 × 187 | 14 0 0 0 | 20px 20px 0px 0px | end |
| 3 | `section.card` | ygame | Your game | 16 | 184.6 | 361 × 125 | 0 0 0 0 | 16px | end |

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.gb > button.sw > span` | Home | 600 18/18, track −0.012em | 1, nowrap, never cut (fits by design) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.gb > button.bellb > b.badge` | 2 | 650 11/19, track 0 | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--accent` → `--ch-green-600` | #F4EEDD on #155A39 7.10 | #F4EEDD on #155A39 7.10 | pass |
| `div.who > span.avatar` | JO | 600 16/16, track 0 | wraps (3 at default) | `--f-bg` → `--ch-green-800` on `#D8CCB0` → `literal` | #0B3A25 on #D8CCB0 8.01 | #0B3A25 on #D8CCB0 8.01 | pass |
| `div.who > span > b` | Good afternoon, Jonah | 600 22/26.4, track −0.015em wdth 92 | wraps (1 at default) | `--nav-ink-2` → `--ch-on-green-ink-2` on `--nav` → `--ch-frame` | #D9D3C2 on #0A331F 9.33 | #D9D3C2 on #0A331F 9.33 | pass |
| `div.who > span > span` | Practice at 3:30 · Lonnie Poole ra | 400 15/20.25, track 0 | wraps (1 at default) | `--nav-ink-2` → `--ch-on-green-ink-2` on `--nav` → `--ch-frame` | #D9D3C2 on #0A331F 9.33 | #D9D3C2 on #0A331F 9.33 | pass |
| `div.ch > h2` | Your game | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.ch > span.meta` | Strokes gained vs Tour | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.cb-empty > b` | Nothing to break down yet. | 600 16/21, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.cb-empty > span` | Fairways, greens, scrambling and p | 400 15/21, track 0 | wraps (2 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |


### S-HOMEGAME · loading

Each leg keeps its height; title, figure and spark become bars; counts become two lines of bar.

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `div.top` | hheader | Home2   JOGood afternoon, Jona | 0 | 0 | 393 × 190.6 | 0 16 34 16 | 0px | -20 |
| 2 | `div.lip.is-loading` | — | Your game | 0 | 170.6 | 393 × 924 | 14 0 0 0 | 20px 20px 0px 0px | end |
| 3 | `section.card.skel-card` | ygame | Your game | 16 | 184.6 | 361 × 862 | 0 0 0 0 | 16px | end |

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.gb > button.sw > span` | Home | 600 18/18, track −0.012em | 1, nowrap, never cut (fits by design) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.gb > button.bellb > b.badge` | 2 | 650 11/19, track 0 | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--accent` → `--ch-green-600` | #F4EEDD on #155A39 7.10 | #F4EEDD on #155A39 7.10 | pass |
| `div.who > span.avatar` | JO | 600 16/16, track 0 | wraps (3 at default) | `--f-bg` → `--ch-green-800` on `#D8CCB0` → `literal` | #0B3A25 on #D8CCB0 8.01 | #0B3A25 on #D8CCB0 8.01 | pass |
| `div.who > span > b` | Good afternoon, Jonah | 600 22/26.4, track −0.015em wdth 92 | wraps (1 at default) | `--nav-ink-2` → `--ch-on-green-ink-2` on `--nav` → `--ch-frame` | #D9D3C2 on #0A331F 9.33 | #D9D3C2 on #0A331F 9.33 | pass |
| `div.who > span > span` | Practice at 3:30 · Lonnie Poole ra | 400 15/20.25, track 0 | wraps (1 at default) | `--nav-ink-2` → `--ch-on-green-ink-2` on `--nav` → `--ch-frame` | #D9D3C2 on #0A331F 9.33 | #D9D3C2 on #0A331F 9.33 | pass |
| `div.ch > h2` | Your game | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |


### S-HOMEGAME · failed, partial (CH-2216)

Notice inside the card under its header with a bottom rule: "Some of your figures didn’t load" / "Scores, greens and putts are right; scrambling is missing." The Short game leg shows "—", no spark, no counts, no pill. Everything else renders.

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `div.top` | hheader | Home2   JOGood afternoon, Jona | 0 | 0 | 393 × 190.6 | 0 16 34 16 | 0px | -20 |
| 2 | `div.lip` | — | Your game | 0 | 170.6 | 393 × 1012.4 | 14 0 0 0 | 20px 20px 0px 0px | end |
| 3 | `section.card` | ygame | Your game | 16 | 184.6 | 361 × 950.4 | 0 0 0 0 | 16px | end |

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.gb > button.sw > span` | Home | 600 18/18, track −0.012em | 1, nowrap, never cut (fits by design) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #08150E 16.12 | pass |
| `div.gb > button.bellb > b.badge` | 2 | 650 11/19, track 0 | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--accent` → `--ch-green-600` | #F4EEDD on #155A39 7.10 | #F4EEDD on #155A39 7.10 | pass |
| `div.who > span.avatar` | JO | 600 16/16, track 0 | wraps (3 at default) | `--f-bg` → `--ch-green-800` on `#D8CCB0` → `literal` | #0B3A25 on #D8CCB0 8.01 | #0B3A25 on #D8CCB0 8.01 | pass |
| `div.who > span > b` | Good afternoon, Jonah | 600 22/26.4, track −0.015em wdth 92 | wraps (1 at default) | `--nav-ink-2` → `--ch-on-green-ink-2` on `--nav` → `--ch-frame` | #D9D3C2 on #0A331F 9.33 | #D3CCB9 on #08150E 11.66 | pass |
| `div.who > span > span` | Practice at 3:30 · Lonnie Poole ra | 400 15/20.25, track 0 | wraps (1 at default) | `--nav-ink-2` → `--ch-on-green-ink-2` on `--nav` → `--ch-frame` | #D9D3C2 on #0A331F 9.33 | #D3CCB9 on #08150E 11.66 | pass |
| `div.ch > h2` | Your game | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.ch > span.meta` | Strokes gained vs Tour | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.notice.in-card > div.n-tx > p.n-t` | Some of your figures didn’t load | 600 15/20, track −0.010em | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `div.notice.in-card > div.n-tx > p.n-b` | Scores, greens and putts are right | 400 15/21, track 0 | wraps (2 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.n-tx > button.n-btn > span` | Try again | 600 15/15, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--well` → `--ch-well-bg-flat` | #1C1B18 on #F6F4EE 15.66 | #F1ECDF on #141815 15.20 | pass |
| `article.leg > div.leg-h > b` ×4 | Off the tee | 600 16/21, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `article.leg > div.leg-h > span.pill.loss` ×3 | −0.9 | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--loss` → `--ch-loss` on `--loss-tint` → `--ch-chip-loss-bg` | #9A5700 on #F7F0E6 4.97 | #E7AE57 on #3A3524 6.18 | pass |
| `div.leg-main > div > div.v` ×4 | 42% | 600 28/28, track −0.030em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass (large, 3:1) |
| `div.leg-main > div > div.s` ×4 | Fairways hit | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > div.spark-cap > span` ×3 | Last 10 rounds | 400 13/15.6, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > div.spark-cap > b` ×2 | No clear change | 600 13/15.6, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.cb.flush > article.leg > p.cnt` ×3 | 59 of 140 fairways in the last 10  | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div.bench > div.bench-k > span.loss-ink` | You 55% | 600 15/18, track 0 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #E7AE57 on #191E1A 8.53 | pass |
| `div.bench > div.bench-k > span` | Tour 66% | 400 15/18, track 0 tnum | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| `div > div.spark-cap > b.gain-ink` | Improving | 600 13/15.6, track 0 | wraps (1 at default) | `--gain` → `--ch-gain` on `--card` → `--ch-card-bg` | #14613D on #FFFEFB 7.42 | #7CC79B on #191E1A 8.45 | pass |
| `p.cn` | Figures are your last 10 rounds; s | 400 15/20, track 0 | wraps (5 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |


### S-HOMEGAME · XXL (1.36)

Legs stack the spark under the figure from 1.24.

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `div.top` | hheader | Home2   JOGood afternoon, Jona | 0 | 0 | 393 × 235 | 0 16 34 16 | 0px | -20 |
| 2 | `div.lip` | — | Your game | 0 | 215 | 393 × 1346.6 | 14 0 0 0 | 20px 20px 0px 0px | end |
| 3 | `section.card` | ygame | Your game | 16 | 229 | 361 × 1284.6 | 0 0 0 0 | 16px | end |

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.gb > button.sw > span` | Home | 600 24.48/24.48, track −0.012em | 1, nowrap, never cut (fits by design) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass (large, 3:1) |
| `div.gb > button.bellb > b.badge` | 2 | 650 11/19, track 0 | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--accent` → `--ch-green-600` | #F4EEDD on #155A39 7.10 | #F4EEDD on #155A39 7.10 | pass |
| `div.who > span.avatar` | JO | 600 21.76/21.76, track 0 | wraps (3 at default) | `--f-bg` → `--ch-green-800` on `#D8CCB0` → `literal` | #0B3A25 on #D8CCB0 8.01 | #0B3A25 on #D8CCB0 8.01 | pass |
| `div.who > span > b` | Good afternoon, Jonah | 600 29.92/35.904, track −0.015em wdth 92 | wraps (1 at default) | `--nav-ink-2` → `--ch-on-green-ink-2` on `--nav` → `--ch-frame` | #D9D3C2 on #0A331F 9.33 | #D9D3C2 on #0A331F 9.33 | pass (large, 3:1) |
| `div.who > span > span` | Practice at 3:30 · Lonnie Poole ra | 400 20.4/27.54, track 0 | wraps (2 at default) | `--nav-ink-2` → `--ch-on-green-ink-2` on `--nav` → `--ch-frame` | #D9D3C2 on #0A331F 9.33 | #D9D3C2 on #0A331F 9.33 | pass |
| `div.ch > h2` | Your game | 600 23.12/29.92, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.ch > span.meta` | Strokes gained vs Tour | 400 20.4/27.2, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `article.leg > div.leg-h > b` ×4 | Off the tee | 600 21.76/28.56, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `article.leg > div.leg-h > span.pill.loss` ×4 | −0.9 | 600 17.68/21.76, track 0 tnum | 1, nowrap, never cut (fits by design) | `--loss` → `--ch-loss` on `--loss-tint` → `--ch-chip-loss-bg` | #9A5700 on #F7F0E6 4.97 | #9A5700 on #F7F0E6 4.97 | pass |
| `div.leg-main > div > div.v` ×4 | 42% | 600 38.08/38.08, track −0.030em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass (large, 3:1) |
| `div.leg-main > div > div.s` ×4 | Fairways hit | 400 20.4/27.2, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div > div.spark-cap > span` ×4 | Last 10 rounds | 400 17.68/21.216, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div > div.spark-cap > b` ×3 | No clear change | 600 17.68/21.216, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.cb.flush > article.leg > p.cnt` ×4 | 59 of 140 fairways in the last 10  | 400 20.4/27.2, track 0 | wraps (2 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.bench > div.bench-k > span.loss-ink` | You 55% | 600 20.4/24.48, track 0 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #9A5700 on #FFFEFB 5.57 | pass |
| `div.bench > div.bench-k > span` | Tour 66% | 400 20.4/24.48, track 0 tnum | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div > div.spark-cap > b.gain-ink` | Improving | 600 17.68/21.216, track 0 | wraps (1 at default) | `--gain` → `--ch-gain` on `--card` → `--ch-card-bg` | #14613D on #FFFEFB 7.42 | #14613D on #FFFEFB 7.42 | pass |
| `p.cn` | Figures are your last 10 rounds; s | 400 20.4/27.2, track 0 | wraps (6 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |


### S-HOMEGAME · 430 wide

Edge 20.

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `div.top` | hheader | Home2   JOGood afternoon, Jona | 0 | 0 | 430 × 190.6 | 0 16 34 16 | 0px | -20 |
| 2 | `div.lip` | — | Your game | 0 | 170.6 | 430 × 886.4 | 14 0 0 0 | 20px 20px 0px 0px | end |
| 3 | `section.card` | ygame | Your game | 20 | 184.6 | 390 × 824.4 | 0 0 0 0 | 16px | end |

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| `div.status > span` | 9:41 | 600 15/15, track 0 tnum | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.gb > button.sw > span` | Home | 600 18/18, track −0.012em | 1, nowrap, never cut (fits by design) | `--nav-ink` → `--ch-on-green-ink` on `--nav` → `--ch-frame` | #F4EEDD on #0A331F 12.03 | #F4EEDD on #0A331F 12.03 | pass |
| `div.gb > button.bellb > b.badge` | 2 | 650 11/19, track 0 | wraps (1 at default) | `--nav-ink` → `--ch-on-green-ink` on `--accent` → `--ch-green-600` | #F4EEDD on #155A39 7.10 | #F4EEDD on #155A39 7.10 | pass |
| `div.who > span.avatar` | JO | 600 16/16, track 0 | wraps (3 at default) | `--f-bg` → `--ch-green-800` on `#D8CCB0` → `literal` | #0B3A25 on #D8CCB0 8.01 | #0B3A25 on #D8CCB0 8.01 | pass |
| `div.who > span > b` | Good afternoon, Jonah | 600 22/26.4, track −0.015em wdth 92 | wraps (1 at default) | `--nav-ink-2` → `--ch-on-green-ink-2` on `--nav` → `--ch-frame` | #D9D3C2 on #0A331F 9.33 | #D9D3C2 on #0A331F 9.33 | pass |
| `div.who > span > span` | Practice at 3:30 · Lonnie Poole ra | 400 15/20.25, track 0 | wraps (1 at default) | `--nav-ink-2` → `--ch-on-green-ink-2` on `--nav` → `--ch-frame` | #D9D3C2 on #0A331F 9.33 | #D9D3C2 on #0A331F 9.33 | pass |
| `div.ch > h2` | Your game | 600 17/22, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `div.ch > span.meta` | Strokes gained vs Tour | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `article.leg > div.leg-h > b` ×4 | Off the tee | 600 16/21, track 0 | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass |
| `article.leg > div.leg-h > span.pill.loss` ×4 | −0.9 | 600 13/16, track 0 tnum | 1, nowrap, never cut (fits by design) | `--loss` → `--ch-loss` on `--loss-tint` → `--ch-chip-loss-bg` | #9A5700 on #F7F0E6 4.97 | #9A5700 on #F7F0E6 4.97 | pass |
| `div.leg-main > div > div.v` ×4 | 42% | 600 28/28, track −0.030em wdth 92 tnum | wraps (1 at default) | `--ink` → `--ch-ink-900` on `--card` → `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #1C1B18 on #FFFEFB 17.08 | pass (large, 3:1) |
| `div.leg-main > div > div.s` ×4 | Fairways hit | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div > div.spark-cap > span` ×4 | Last 10 rounds | 400 13/15.6, track 0 | 1, nowrap, never cut (fits by design) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div > div.spark-cap > b` ×3 | No clear change | 600 13/15.6, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.cb.flush > article.leg > p.cnt` ×4 | 59 of 140 fairways in the last 10  | 400 15/20, track 0 | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div.bench > div.bench-k > span.loss-ink` | You 55% | 600 15/18, track 0 tnum | wraps (1 at default) | `--loss` → `--ch-loss` on `--card` → `--ch-card-bg` | #9A5700 on #FFFEFB 5.57 | #9A5700 on #FFFEFB 5.57 | pass |
| `div.bench > div.bench-k > span` | Tour 66% | 400 15/18, track 0 tnum | wraps (1 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |
| `div > div.spark-cap > b.gain-ink` | Improving | 600 13/15.6, track 0 | wraps (1 at default) | `--gain` → `--ch-gain` on `--card` → `--ch-card-bg` | #14613D on #FFFEFB 7.42 | #14613D on #FFFEFB 7.42 | pass |
| `p.cn` | Figures are your last 10 rounds; s | 400 15/20, track 0 | wraps (4 at default) | `--ink-2` → `--ch-ink-600` on `--card` → `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #46433D on #FFFEFB 9.77 | pass |


## Not drawn, with the build rule

- Offline or stale (all IDs): not drawn. Build: today's offline banner is unchanged; cached figures render as loaded, and the window switch still works on cached data.
- Lots of items: Every round with 40 rows and Team players with 25 players are not drawn. Build: rows repeat at the same 64 / 52 height; no virtualising under 100 rows; the ticker gap drops to 3 above 12 rounds (04 §4).
- One item: one round renders as "few" (the few rules cover 1 and 2 rounds); one team player shows the row and "loses the least" or "gains" wording per sign.
- Desktop 1280: not drawn here. Build: desktop keeps today's layout; only `#sd-rounds` and `#sd-goals` map to the Rounds and Development tabs (02 Desktop).
- Coach on `?player=` (S-STATS.coach), StatsFilter sheet (S-STATS.filter), PlayerPeek (S-TEAMSTATS.peek): today's components, unchanged; see 05.

## Completeness pass, 4 Nov 2026

Specs for the states 05's Completeness pass adds. None of them is drawn, so every value reuses a shape this file already measured; light / dark contrast is computed with the same method as above (target 4.9, floor 4.5, marks 3:1).

### S-STATS.filter-empty and S-TEAMSTATS.filter-empty

Built exactly like the drawn none card (`.empty-card`, "S-STATS · none"), placed where the data cards were, under the live window switch. Development and Goals still follow on My stats.

| # | Element | Part | Title | x | y | w × h | Padding T R B L | Radius | Gap to next |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `header.gbar` | header | My stats / Stats | 0 | 0 | 393 × 114 | 0 0 16 0 | 0px | 0 |
| 2 | `div.ctl` | — | window switch, live | 0 | 114 | 393 × 52 | 2 16 10 16 | 0px | 12 |
| 3 | `section.card.empty-card` | filter-empty | today's `FilterEmpty` title | 16 | 178 | 361 × hug (about 230) | 28 22 26 22 | 18px | 30 |
| 4 | `h2.sech` + Goals card (player only) | — | Development | 18 | after 3 | as drawn | as drawn | as drawn | end |

| Element | Sample | Type (pt, ×k) | Lines, overflow | Colour, design → app token | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| icon tile 44×k, radius 12, filter glyph 20 stroke 1.7 | — | — | — | glyph `--gain` → `--ch-gain` on `--gain-tint` → `--ch-chip-gain-bg` | #14613D on #E8EEE8 6.35 | #7CC79B on #29392F 6.10 | pass (mark 3:1) |
| `h2` | today's FilterEmpty title | 600 20/25, track 0 | wraps | `--ch-ink-900` on `--ch-card-bg` | #1C1B18 on #FFFEFB 17.08 | #F1ECDF on #191E1A 14.34 | pass |
| `p` | today's FilterEmpty body, max 30ch | 400 15/21 | wraps | `--ch-ink-600` on `--ch-card-bg` | #46433D on #FFFEFB 9.77 | #D0C9B8 on #191E1A 10.25 | pass |
| clear button | today's FilterEmpty action label | 600 15/20 | 1, nowrap | `--ch-ink-900` on `--ch-well-bg-flat`, inset 1px `--ch-separator` (the Try again button's shape) | #1C1B18 on #F6F4EE 15.66 | #F1ECDF on #141815 15.20 | pass |

Hit area: the button is min 36×k tall, radius 12, a `::before` inset −4px 0 makes it 44 (as Try again). Data: no figure; the card shows because the window's round count is 0 while Last 10 with no filter is not.

### S-STATS.updating

Today's `UpdatingNote`, moved into the sticky controls under the segments, so it stays in view while the page scrolls.

| Element | Box | Type (pt, ×k) | Lines | Colour | Light | Dark | Contrast |
|---|---|---|---|---|---|---|---|
| note | inside `.ctl` under the segments, x 16 (20 at 430), 6pt below the track; `.ctl` grows by the note's line | 400 13/16 | 1 line, ellipsis | `--ch-text-secondary` on the page `--ch-grouped-bg` | #46433D on #F2F0E9 8.64 | #D0C9B8 on #0E120F 11.45 | pass |

It has `role="status"`; it appears after today's busy delay and goes the frame the figures land.

### S-STATS.detail-loading

| # | Element | Box | Fill | Notes |
|---|---|---|---|---|
| 1 | pushed bar | as the drawn detail bar (criterion 28): "‹ My stats" / "‹ Player stats" / "‹ Stats", the detail's title centred | `--ch-frame` | live: Back works and pops to the summary skeleton |
| 2 | hero skeleton | at the hero's place (sheet padding 8 16, hero padding 6 2 4): bar 42% × 40×k radius 8, then 6pt, bar 60% × 15×k radius 6 | `--ch-skel-base` #E2DBCA / #252C26, sheen `--ch-skel-sheen` #ECE6D8 / #2E362F | `aria-hidden`, exempt from 3:1 |
| 3 | two skeleton cards | 361 × 220, radius 18, gap 12, 12 below the hero; each the summary skeleton's body (criterion 94: head title bar, 42% bar 28×k, filler block radius 10) | card `--ch-card-bg`, bars as 2 | sheen 1.9s (M-STATS-24); off under Reduce Motion |

The screen has `aria-busy="true"` and the label "Loading <detail title>".

### Focus ring (every focusable element in this lane)

| Where | Ring | Light | Dark | Contrast (3:1 mark) |
|---|---|---|---|---|
| cards, rows, tiles, Home legs, Back, filter, Try again, clear | 2px `--ch-accent` outline, offset 2, radius = the element's radius + 2 | #155A39 on card #FFFEFB 8.15 | #7CC79B on card #191E1A 8.45 | pass |
| section-level items on the page (the few note has none; the switch's segments) | same ring | #155A39 on the well's darkest stop #D4CEBE 5.24 | #7CC79B on #0A0D0B 9.76 | pass |
| anything on the green feature card (the card itself, its chevron, the chart while scrubbing by keys) | 2px `--ch-feature-ink`, offset 2 | #F4F1E8 on `--ch-feature-lit` #1A442E 9.73 | same | pass |

Shows only for keyboard focus (`:focus-visible`); appears and goes with no transition.

### One round (S-STATS, S-STATS.scoring, S-STATS.rounds, S-HOMEGAME)

| Element | Rule | Colour | Light | Dark |
|---|---|---|---|---|
| scoring chart | one dot r 5 at the chart's right edge, 2px `--ch-card-bg` ring; par rule as drawn; no five-round line, no area, legend shows Round and Par only | dot in the tone fill of today's chart (flat tone, as few) | — | — |
| round ticker | one bar, full 64×k height, radius 2.5, at the left edge | `--ch-chart-flat` | #6B675F on #FFFEFB 5.58 | #A39D90 on #191E1A 6.27 |
| ticker caption | "1 round" (the "N rounds" figure's own wording) | `--ch-ink-600` | 9.77 | 10.25 |
| Home spark | end dot only (9, 2.5 card ring), no line, no area, no mean; caption "Last round" | `--ch-chart-flat` | 5.58 | 6.27 |

### 431 to 820 wide

Phone layout; page edge 20; cards are the width minus 40. Card internals keep their 430 values. The feature chart keeps 160 tall and its inner padding (L 4 R 30 T 10 B 26) and redraws its path at the measured width; Home sparks keep 46×k tall and fill the right half of the leg; strokes use `vector-effect: non-scaling-stroke` or are redrawn, never stretched. The glance grid stays 3 columns until Text Size 1.24. 821 and up is desktop.

### Accessible names and reading order

| Element | Role | Accessible name (example) | Order |
|---|---|---|---|
| summary card | button | "Off the tee, 42% fairways hit, strokes gained −0.9" (title, figure, pill; 02 SummaryCard) | after the section's heading |
| section name | heading level 2 | "Your game" | before its cards |
| glance tile | button | "Greens 55%, Tour 66%. Opens Approach" | left to right, top to bottom |
| scoring chart | slider when focused | value text "Oct 3, Tournament, 72, 2 over par" per round; at rest "Scoring average by round, last 10 rounds" | after the card's figure |
| other charts, rails, ticker, rings | img | one sentence with the figures shown ("Up and down from fairway 62%, Tour 65%") | in card order |
| SG row, team row | button with `aria-pressed` | "Approach, −3.4 strokes a round, likely −4.1 to −2.7" | top to bottom |
| Every round row | link | "Pinehurst No. 8, Oct 3, Tournament, 72, 2 over" | newest first |
| Home leg | link | "Off the tee, 42% fairways hit, strokes gained −0.9, no clear change. Opens Off the tee in My stats" | Off the tee, Approach, Short game, Putting |
| skeleton bars | hidden | — | skipped |
| "—" | text | read as "no value" through `aria-label` | in place |

### Season start on Home (S-HOMEGAME.season-start)

Same boxes and colours as S-HOMEGAME; no SG pill on any leg (as few); the footnote `p.cn` second clause reads "strokes gained shows from this season's third round." 400 15/20 `--ch-ink-600`, 9.77 / 10.25.


## Wiring, 4 Nov 2026

Every screen, sheet, menu and action in 05 (both inventories), traced to helmv3 main `03d9087`. All paths are under `src/clubhouse/` unless they start `src/` or `supabase/`. Nothing in this lane adds a table, column, RPC, policy, write, notification or push, so no held migration exists and the last column reads "none held" throughout.

### Rules for every row

- **Gate.** `src/app/golf/(dashboard)/dashboard/stats/page.tsx:49` to 50 and `stats/team/page.tsx` (its `ClubhouseStatsRoute` import at 14) hand every Clubhouse session to `ClubhouseStatsRoute` (`routes/stats.tsx:26`). Player Home is `dashboard/page.tsx` (player branch) over `loadPlayerHome` (`data/player-home.ts:102`).
- **Lane flag.** `clubhouse_stats_redesign_v1` does not exist on main (grep of `config/feature-flags.yml` and `src/` returns nothing); PR 4a adds it as 02 says. `isFlagEnabled` (`src/lib/flags/is-enabled.ts`) is server only, so the flag is read once in `routes/stats.tsx` (for both the player and the team branch) and once in the Home route's player branch, and passed down as a boolean prop `shs` to `StatsPlayer`, `StatsTeam` and `PlayerHome`. No client file reads the flag. With `shs` false every component renders main's phone tree (02 "The flag"), the `#sd-*` mapping is skipped, the Missed short formula is main's, the practice cut below is skipped, `PlayerGame` renders main's legs (not links) and `data-ch-hero-flat` is absent. Preview routes ignore the flag and honour `&flag=off`.
- **Double submit.** Every write here goes through `useAction` (`lib/use-action.ts`): its in-flight ref (73 to 77) answers `busy` to a second tap, offline answers CH-1903 (80 to 84), a save past `CH_SLOW_SAVE_AFTER` (44) shows CH-1902. `ProposalAnswer.tsx:33` disables both buttons while either runs.
- **Sync.** `ClubhouseFrame` runs `useQuietRefresh` (`shell/use-quiet-refresh.ts`) for every screen here: a refetch after 60s away or on reconnect, skipped while a sheet is open or a field has focus (20 to 27). Goal and focus actions do not revalidate `/golf/dashboard/stats` (goals.ts 294 to 295, 674 to 676, 769; development.ts 497 to 504, 602 to 608, 719 to 720), so each caller's `router.refresh()` on success is what redraws Stats; keep those calls when the components are re-homed into S-STATS.goals.
- **Privacy (SHARED-11).** A player session always gets its own profile: `routes/stats.tsx:34` to 41 loads `team.playerId`, never the address's `?player=`, and returns before the coach branch, so the team route (`StatsTeam`, 55) never renders for a player. `loadPlayerProfile` reads teammates' rounds only for `viewer: 'coach'` (`data/stats-player.ts:291` to 303), the team mean only for a coach (398) and the player's comparison is Tour only (404 to 407). Player Home reads `input.playerId` only (`player-home.ts:117`). This lane adds no read, so these are the filters; `stats-access.test.ts` (02 Tests) asserts them.
- **Shot tracking.** Nothing changes. No file this lane touches writes `golf_rounds`, hole or shot rows, or changes what the scoring screens collect, store or send (SHARED-10).
- **Notifications.** This lane adds none. The existing ones that land here are in W.6.
- **Practice rounds (shared helper).** Today they count: the default filter is `types: []` (`data/stats-filter.ts:96`) and `matchesFilter` (257 to 258) lets every kind through. With `shs` on and `types` empty, figures drop the rounds for which `countsForScoring(r)` is false; that helper is the one the classes-roster-home lane adds to `data/season.ts` (true when `round_type` is null or `roundTypeFromDb(round_type) !== 'practice'`, matching `roundKind` in `stats-filter.ts` and `stats-figures.ts:190`). Do it in `matchesFilter` (a `practiceOut` argument the loaders pass as `shs && f.types.length === 0`) so `loadPlayerProfile`, `loadTeamStats` and the window counts use one path; Home applies the helper in `fullOf` (`player-home.ts:120`). Two readers keep the uncut window on purpose: the pressure gap (`stats-figures.ts:175` to 198) and GameMore's by-type row (`GameMore.tsx:52`), because they compare practice with tournament play. Picking Practice in StatsFilter counts it, as the filter says. Every round lists the rounds the window counts (03 Completeness pass). Flag off: counted as today.

### W.1 Gate, flag, routes, denied

| element or action | reads | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Stats route | session (`getGolfSessionProfile`), `resolveClubhouseTeam`, `parseFilter` (`stats-filter.ts:146`) (`routes/stats.tsx:27` to 31) | none | player: own id; coach: own team | `isUuid(player)` before any read (45) | S-STATS, S-STATS.coach or S-TEAMSTATS | no team: `StatsNoTeam` (58) | frame quiet refresh | none | `shs` read here, server only | none held |
| S-STATS.denied | as above | none | player `?player=<other>` gets own S-STATS (34 to 41); coach on a malformed or off-team id | uuid shape; profile null | today's `NotOnTeam`, CH-5306 coach / CH-5307 player (66 to 71) | wrong-screen hash: summary (02) | none | none | same both ways | none held |
| Player Home card S-HOMEGAME | `loadPlayerHome` rounds (`player-home.ts:117`), full 18 (120), hole rounds window (122), cache, Tour bench (129), season SG (159) | none | player only | none | legs from `legRows` (160; `LEG_TREND` 7, `leg-rows.ts:15`) | legs null on rounds error: today's notices (`PlayerGame.tsx:101` CH-2215, 105 CH-2310; empty CH-2311 at 341), Try again reloads the card only (02 Files) | frame quiet refresh; `useHomeDayRollover` already on PlayerHome | none | `shs` from the Home route; off: main's `PlayerGame` | none held |
| `data-ch-hero-flat` | none | none | player Home | none | set on `PlayerHomePhone` root when PR 6's flat hero renders | absent with `shs` off | none | none | `shs` | none held |
| S-ALL.retry | same loaders | `router.refresh()` | as the screen | none | skeleton then page, no motion | failed notice stays | none | none | on: new notice; off: today's | none held |

### W.2 My stats (player, and the coach variant)

| element or action | reads | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| S-STATS summary, S-STATS.stuck, .scrub, .sg-pin, .how | `loadPlayerProfile` (`stats-player.ts:222`, own rounds 255), `loadStatsReads` for a player (`stats-reads.ts:94`), coach scope reads (`routes/stats.tsx:49` to 51) | none | RLS on `golf_rounds` and the stats cache as today; privacy above | none | page paints from the profile; reads stream in | today's failed notice; reads `{status:'failed'}` | frame quiet refresh | none | `shs` picks the redesign | none held |
| S-STATS.window, .custom, .updating | the next window's page (navigation) | `pushOnce(href, {scroll:false})` in a transition (`StatsPlayer.tsx:141`); idle fetch-ahead of the windows either side (169) | as above | `withScope`, `parseFilter` | figures land; note goes | offline CH-5901, slow CH-5902 (`StatsPlayer.tsx:156` to 166; `WindowSwitch.tsx:45`); `UpdatingNote` CH-5903 (210 to 211, `WindowSwitch.tsx:63` to 67); failed fetch springs the chip back to the window on screen (02 Files) | URL is the state | none | `shs` | none held |
| S-STATS.filter, .filter-empty | `parseFilter`, `matchesFilter` | navigation as above | as above | filter codes CH-5320 to CH-5323, CH-5102 (`StatsPlayer.tsx:170`) | figures for the filter | 0 rounds: `FilterEmpty` card; Clear restores the default | URL | none | `shs` (filter sheet itself unchanged) | none held |
| S-STATS.switcher | `nav.ts` | navigation | role's sections | none | section opens | none | none | none | unchanged | none held |
| Details .scoring .sg .tee .approach .short .putting .rounds .goals, .detail-loading, .return | the summary's data (no new read) | hash push (`use-stats-detail.ts`, 02 Files) | as summary | hash must name a detail of this screen | detail in place | loading: bar plus skeleton; failed: held target opened by Try again; empty: summary, except `#sd-goals` / `?tab=dev` | scroll saved to `sessionStorage` on leave | none | `shs`; off: `#sd-*` ignored | none held |
| S-STATS.round | today's round route | navigation | own round (player), team round (coach) | none | today's page | today's | S-STATS.return | none | unchanged | none held |
| Set a goal (`GoalSheet`) | goal metrics | `createGoal` (`src/app/golf/actions/v3/goals.ts:312`) | `golf_goals`: `goals_player_own` (`player_id = current_player_id()`, baseline 18712); coach: `goals_coach_create` (re-created `20260528010000:14`), `goals_coach_view` (baseline 18708) | today's sheet checks | sheet closes, `router.refresh()` (`GoalSheet.tsx:146`) | CH-5006 (118), sheet keeps its fields | refresh | coach-created only: `coach_assigned_goal` to the player (goals.ts 290 to 292), see W.6 | unchanged sheet, re-homed | none held |
| Accept / dismiss a suggestion (`Goals.tsx`) | `golf_goal_suggestions` | `acceptGoalSuggestion` (750), `dismissGoalSuggestion` (782) | `goal_suggestions_player_select` / `_update` (`20260528010000:44`, 50) | id | `router.refresh()` (38, 47) | CH-5007 (41), CH-5008 (50); row stays | refresh | none | unchanged | none held |
| Pause / resume a goal | `golf_goals` | `pauseGoal` (512), `resumeGoal` (545) | `goals_player_own` | id | `router.refresh()` (101) | CH-5009 (104) | refresh | none | unchanged | none held |
| Answer a coach's proposal (`ProposalAnswer`) | focus area | `acceptFocusArea` (`development.ts:736`), `declineFocusArea` (795) | `golf_player_focus_areas_update_player` (`20260621041839:11`) | id | `router.refresh()` (19, 28) | CH-5003 (22), CH-5004 (31); both buttons re-enable | refresh | none | unchanged | none held |
| Add focus area (coach, `FocusAreaSheet`, `StatsPlayer.tsx:660` to 685) | focus types | `createFocusArea` (`development.ts:515`, impl 344) | coach only: `golf_player_focus_areas_insert_coach` (baseline 19345) | today's sheet checks | sheet closes, refresh | CH-5001 (685) | refresh | `dev_plan_assigned` bell row and email to the player (495, W.6) | unchanged sheet, coach only | none held |
| S-STATS.share, coach Share | `playerHref` | `navigator.share`, else clipboard (`StatsPlayerPhone.tsx:119` to 143) | coach; the link opens only for team coaches | none | share sheet, or "Link copied" | AbortError silent; CH-5002 | none | none | unchanged | none held |
| S-STATS.share, best card | rendered image | `navigator.share` with the file, else download (`BestCard.tsx`) | both | none | sheet closes | CH-5005 (117) | none | none | unchanged | none held |
| S-STATS.coach head: Message, Plan 1:1, Insights | `data.id` | `rebuiltHref('/golf/dashboard/messages?player=<id>')` (172), `calendar?new=1&with=<id>` (174), `coachhelm?player=<id>` (176) | coach only (null for a player) | none | Messages opens the direct thread (`Messages.tsx:179` reads `?player=`) | none | none | none | unchanged hrefs | none held |
| S-STATS.refresh | loaders | `router.refresh()` | as screen | none | in place | today's | none | none | must work on the new scroller | none held |

### W.3 Team Stats (coach only)

| element or action | reads | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| S-TEAMSTATS, .tscore, .tgame, .tplayers, .pin, .filter, .filter-empty | `loadTeamStats` (`data/stats-team.ts:184`, team rounds 209) | navigation for window and filter | coach of the team; a player never reaches this branch (`routes/stats.tsx:34` to 41, 55) | `parseFilter` | figures land | window fetch: `UpdatingNote` CH-4903 (`StatsTeamIslands.tsx:130`); 0 rounds: `FilterEmpty` | URL; frame quiet refresh | none | `shs` | none held |
| S-TEAMSTATS.peek | rows already loaded (`gridPeek`, `screens/stats/links.ts:18`) | none | coach | none | today's `PlayerPeek` (`ui/PlayerPeek.tsx:48`) | none | none | none | unchanged | none held |
| S-TEAMSTATS.player, team grid cell | filter | `teamPlayerHref` (links.ts:8), `legDetailHref` (13) | coach | uuid at the route | S-STATS.coach, or that part's detail | NotOnTeam CH-5306 | none | none | unchanged hrefs | none held |

### W.4 Home "Your game" leg link

| element or action | reads | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| S-HOMEGAME.leg | leg row | new `ownLegHref(leg: ChLeg)` in `screens/stats/links.ts`, beside `legDetailHref`: returns `'/golf/dashboard/stats#gm-' + LEG_SECTION[leg]` (`legs.ts:7`); `PlayerGame` wraps it in `rebuiltHref(…, 'player')` as Home's other links do (`shell/nav.ts:331`) | player; the route ignores any `?player=` for a player | hash in `GAME_SECTION_IDS` (`legs.ts:15`) | that part's detail, no slide; Back to the summary, then Home | none | none | none | `shs` on only; off: no link, as main (`PlayerGame.tsx` `Legs` 315, `Leg` 354) | none held |
| S-HOMEGAME.season-start | `season.sgLegs` (this season, 3+ rounds) | none | player | 1 August in the team zone | no SG pills; footnote clause | none | rollover as today | none | `shs` | none held |

### W.5 Handoffs (one helper each)

| Handoff | Helper | Note |
|---|---|---|
| Practice rounds | `countsForScoring(r)` in `data/season.ts` (classes-roster-home lane adds it) | Stats, Roster and Home call the same function; each under its own lane flag, so figures differ between screens while one flag is on and the other off |
| Messages from Stats | `messages?player=<id>` via `rebuiltHref` (`StatsPlayer.tsx:172`) | the Messages lane owns `?player=` |
| Team cell, team player | `legDetailHref`, `teamPlayerHref` | unchanged |
| Home leg | `ownLegHref` (new, links.ts) | only Home calls it |
| Player Home bar | `data-ch-hero-flat` | classes-roster-home CP-02.3 keys on it |

### W.6 Notifications that land here (none added)

| Event | Sender | Category / setting | Recipient | Deep link | Lands on |
|---|---|---|---|---|---|
| Coach adds a focus area | `notifyPlayerOfProposedFocus` (`development.ts:1359`, called at 495) | `dev_plan_assigned`, in-app and email only (`src/lib/notifications/index.ts:195` to 218); `push.ts:71` maps it to `push_task_reminders`, but no sender pushes it | the player | `CLUBHOUSE_DEV_PLAN_PATH` `/golf/dashboard/stats?tab=dev` (`development.ts:313`, 1403 to 1412); bell opens it at `shell/Bell.tsx:385` to 387 | S-STATS.goals (S-STATS.detail-loading first on a cold start) |
| Weekly verdict job | `verdict-job.ts:317` | `dev_plan_assigned` | coach | `/golf/dashboard/players/<id>` | outside this lane, unchanged |
| Coach sets a goal | `notifyCoachAssignedGoal` (`src/lib/coachhelm/v3/notifications/notify.ts:70`) through `dispatchCoachHelmNotification` (player prefs; default in-app only) | `coach_assigned_goal` | the player | `surfaceHref('tab-plan-player')` = `/golf/dashboard/coachhelm?view=development` (`surface-registry.ts:92`) | CoachHelm Plan, not S-STATS.goals; unchanged |
| A player submits a round | `round-submit.ts:1835` to 1838 | `round_submitted`, setting `push_events` (`push.ts:59` to 60) | coaches | `/golf/dashboard/rounds/<roundId>` (`push.ts:162` to 167); `/stats/team` only without an id | today's round page |
