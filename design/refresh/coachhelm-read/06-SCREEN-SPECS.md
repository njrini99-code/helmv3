# 06. CoachHelm read: per-screen specs

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 15 rows).
> Wiring, 4 Nov 2026: see the section of that name at the end of this file.

Every element on every screen in `05-SCREENS.md`, top to bottom in the order the eye meets it. Values were read off the design page's CSS and script (`redesign/coachhelm-read.html`, version 4), not by eye. Where this file and `04-FIDELITY-SPEC.md` disagree, this file wins.

How to read the numbers:
- Sizes are pt (CSS px) at the default Text Size. "× k" means the value follows iPhone Text Size through `--ch-type-k` (k = 1 default, 1.353 at XXL). Values without × k stay fixed.
- Classes: the design page's `.ph .x` becomes `.ch-hr-x` in the build (04 names).
- Colours give the app token first, then light / dark hex. Feature-card tokens (`--ch-feature-*`) come from PR 1; if PR 1 names one differently, the hex wins and the PR says so.
- Contrast ratios come from `capture/contrast.py` (output in `capture/contrast-table.txt`, rerun 3 Nov with every pair below). Target 4.9:1, floor 4.5:1; non-text marks 3:1. Every text pair on this lane clears 4.9:1 in both themes, so no pair needs a fix.
- Data fields point to rows in `03-DATA-CHECKS.md`. Missing values follow SHARED-4: "—", never 0, NaN or blank, and a card with no data is left out.

## 0. Token map

| Design page | App token | Light | Dark |
|---|---|---|---|
| `--bg` | `--ch-grouped-bg` | #F2F0E9 | #0E120F |
| `--card` | `--ch-card-bg` | #FFFEFB | #191E1A |
| `--well` | `--ch-well-bg-flat` | #F6F4EE | #141815 |
| `--ink` | `--ch-text-primary` | #1C1B18 | #F1ECDF |
| `--ink-2` | `--ch-text-secondary` | #46433D | #D0C9B8 |
| `--ink-3` | `--ch-text-tertiary` | #5F5C55 | #ADA697 |
| `--gain` | `--ch-gain` | #14613D | #7CC79B |
| `--loss` | `--ch-loss` | #9A5700 | #E7AE57 |
| `--flag` | `--ch-flag` | #B3261E | #F28B7D |
| `--accent` | `--ch-accent` | #155A39 | #7CC79B |
| `--sep` | `--ch-separator` | rgb(28 27 24 / .10) | rgb(241 236 223 / .10) |
| `--ring` | `--ch-card-ring` | rgb(28 27 24 / .07) | rgb(255 255 255 / .06) |
| `--gain-fill` | `--ch-chart-gain-fill` | #1F6B45 | #4FA877 |
| `--loss-fill` | `--ch-chart-loss-fill` | #B86F0C | #E09A35 |
| `--neutral-fill` | `--ch-chart-flat` | #6B675F | #A39D90 |
| `--track` | `--ch-chart-track` | #EBE5D8 | #2C322D |
| `--nav` | `--ch-frame` | #0a331f | #08150e |
| `--champ` | today's back-label champagne | #d9c48f | #d9c48f |
| `--feat` | `--ch-feature-bg` (`--ch-green-800`) | #0B3A25 | #123D29 |
| `--f-ink` | `--ch-feature-ink` | #F4F1E8 | #F4F1E8 |
| `--f-ink-2` | `--ch-feature-ink-2` | #D3D9CB | #D3D9CB |
| `--f-gain` | `--ch-feature-gain` | #8FD3AA | #8FD3AA |
| `--f-loss` | `--ch-feature-loss` | #EDB867 | #EDB867 |
| `--f-track` | `--ch-feature-track` | rgb(244 241 232 / .18) | same |
| `--shadow` | today's card shadow | 0 1 2 rgb(28 25 18/.05), 0 8 20 −12 rgb(28 25 18/.12) | 0 1 0 rgb(255 255 255/.04) inset |
| button label on accent | `--ch-on-green-ink` | #F6F1E3 | #0E120F |

Fonts: `--ch-font-sans` (Instrument Sans) everywhere; `--mono` only for the error code line. Tabular figures on every number (SHARED-4).

## 1. S-DIVE.why (CR0, today's Deep dive)

No new pixels. The only change is data: for a player viewer on a `hypothesis` cause, `diagnosisFor` (`data/coachhelm-dive-shape.ts` 328 to 350) returns no drivers, so `views/DeepDive.tsx` 244 to 283 draws "Not traced yet" in today's styles. Redline: none; compare to 75b4956 pixel for pixel for the coach.

## 2. S-READ-BOARD (the summary card)

The card sits in a host column (16pt page edge, 20 at 430). One per view.

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Card | fill width; padding 18 16 16 16; radius 16; no border; shadow 0 10 24 −14 rgba(5 30 18 / .55); flat fill, no radial light (fixed 4 Nov: SHARED-2 allows no gradient but the segmented chip; Team and Lenses already draw this card flat; the page's 7% white circle is not built) | none | `--ch-feature-bg` #0B3A25 / #123D29 | whole card, one tab stop, `role="link"` | the read row |
| Kicker | hug; gap 8 to the stance chip | 14 × k / 1 / 500 | `--ch-feature-ink-2` | none | coach: player first name + " · " + area; player: area (03 rows 1 to 2) |
| Stance chip | hug; padding 5 8; radius 7 | 12.5 / 1 / 600, fixed | `--ch-feature-loss` on 12% loss tint; `.good` uses `--ch-feature-gain` on 12% gain tint; `.plain` uses `--ch-feature-ink` on 12% ink tint | none | stance word: Priority, Worth closing, Minor, Out of date, Dismissed, Assigned |
| Headline | fill; margin-top 10 | 23 × k / 1.18 / 600, −0.018em, wraps, no max lines | `--ch-feature-ink` | none | `title` |
| Lede | fill; margin-top 8 | 15 × k / 1.42 / 400, wraps | `--ch-feature-ink-2` | none | coach or player lede (03 row 4) |
| Hero row | flex, wrap; margin-top 14; column gap 12, row gap 6; items align to the bottom | none | none | none | |
| Hero number | hug, never wraps | 44 × k / 0.9 / 500, wdth 92, −0.04em, tabular | `--ch-feature-ink` | none | `value` with unit ("43%", "1.1", "23 pts") |
| Hero note | flex 1 1 150; padding-bottom 3; drops under the number when 150pt doesn't fit | 14 × k / 1.3 / 400 | `--ch-feature-ink-2` | none | `valueNote` |
| Ladder (SVG) | width 100%, viewBox 300×78, height auto; margin-top 12 + 14 × (min(k,1.2) − 1); margin-bottom 40 × (min(k,1.2) − 1) | labels 12.5 × min(k,1.2), name 400, value 600 on a second line at 1.15em, tabular | track `--ch-feature-track` from x 14 to 286 at y 30, height 6, radius 3; band from the lowest to the highest mark in `--ch-feature-loss` at 55% opacity; you-dot at y 33, r 8, fill `--ch-feature-loss`, stroke 3 in `--ch-feature-bg`; you label 600 at y 14 above the dot; line ticks y 24 to 42, 2 wide, round caps, `--ch-feature-ink-2`; tick names at y 58 in `--ch-feature-ink-2`, values in `--ch-feature-ink`; a label within 60 units of an edge anchors to that edge | none (read-only) | `ladder.you`, `ladder.lines[]` (03 rows 6 to 9); pad 14 each side; labels split above and below when two marks sit closer than 76 units |
| Cause line | fill; margin-top 14; padding-top 12; top hairline 1px rgb(244 241 232 / .14); gap 10 | 15 × k / 1.4 / 400 | `--ch-feature-ink` | none | cause sentence (03 rows 10 to 12) |
| Tier chip | hug; padding 5 8; radius 7; margin-top 1 | 12 / 1 / 600, fixed, nowrap | default `--ch-feature-ink` on 12% ink; `.counted` gain on 12% gain; `.likely` loss on 12% loss | none | coach: Counted, Likely, Not traced; player: Seen in your shots, Where, Not traced |
| Worth line | fill; margin-top 12 | 14 × k / 1.2 / 600 | `--ch-feature-ink`; "estimated" in 13.5 × k / 400 `--ch-feature-ink-2` | none | strokes estimate and anchor (03 rows 13 to 14); absent with no estimate |
| Footer | flex wrap, space-between; gap 6 12; margin-top 12 | 13.5 × k / 1.3 / 400, tabular | `--ch-feature-ink-2` | none | count, rounds, firmness, "Through {date}" (03 rows 15 to 18) |
| Open row | flex, space-between; margin-top 14; padding-top 12; top hairline as the cause line | 15 × k / 1 / 500 | `--ch-feature-ink`; chevron 8×13, stroke 1.8 | part of the card | "Open the read" |

Contrast (light / dark): headline and Open row on feature 11.30 / 10.78; lede, kicker, note, footer 8.84 / 8.44; stance chip 5.61 / 5.35; counted chip 5.64 / 5.38; tier chip 8.09 / 7.71.

Redline: card inset 16 from the screen edge; padding 18 top, 16 sides; headline cap height starts 10 under the kicker; hero number 44 on one line; ladder track 6 high at 30 units; footer 12 under the worth line; Open row 14 under the footer with its hairline; card radius 16.

### S-READ-BOARD.actions

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Row | flex; gap 10; 12 under the card | none | none | none | coach only, absent for a player |
| Assign as focus | flex 1; min-height 46; padding 0 16; radius 13 | 15.5 × k / 1 / 600 | label `--ch-on-green-ink` on `--ch-accent`: 7.29 / 9.44 | 46 tall, full width | `useFocusActions` target (02 §4.6) |
| More | hug; min-height 46; padding 0 16; radius 13; inset ring 1px `--ch-separator` | 15.5 × k / 1 / 600 | `--ch-accent` on page: 8.15 light / 8.45 dark | 46 | opens `S-READ.more` |

### S-READ-BOARD.dismissed and .loading

- Dismissed: the card and its row are replaced by a notice (spec in §12, "Notice"), text "Insight dismissed. It no longer shows on your board or on {first}'s. Undo brings it back." with an archive icon 16×16 stroke 1.8 in `--ch-text-secondary`, and Undo as a ghost button, min-height 36, radius 10, 14.5 × k. CH-13901.
- Loading: feature outline 330 high, radius 16, `--ch-feature-bg`; action outline 46 high, radius 13, `--ch-well-bg-flat`; pulse 1.6s opacity 1 → .55 → 1, stopped under Reduce Motion.

## 3. S-READ (pushed page and bar)

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Status bar band | 44 tall (safe area) | today's | `--ch-frame` | none | |
| Bar | 48 tall; padding 0 6 4 16 (20 left at 430); sticky top 0 | none | `--ch-frame` #0a331f / #08150e | none | |
| Back | hug; min-height 44; padding 10 8 10 0; margin-left −6; chevron 12×20 stroke 2.2, gap 2 | 17 × k / 1 / 400, nowrap | `--champ` #d9c48f on frame: 8.13 / 10.89 | 44 tall, label width | coach: player first name; player: "CoachHelm" |
| Bar title | centred absolutely | 17 × k / 1 / 600, one line, ellipsis only if it would meet the back label | `--nav-ink` #f4eedd on frame: 12.03 / 16.12 | none | area |
| More (⋯) | 44×44; icon 22×22, dots r 1.7 | none | `--nav-ink-2` | 44×44 | coach and player (the player's sheet is shorter) |
| Lip | 18 rounded tab into the page, radius 18 18 0 0 | none | `--ch-grouped-bg` | none | Build with today's 16pt lip (SHARED-2); the page draws 18 |
| Sheet | flex column; gap 20; padding 6 16 60 (20 sides at 430) | none | `--ch-grouped-bg` | none | |
| Card (every card but the feature) | fill; radius 16; ring 1px `--ch-card-ring` plus `--shadow`; overflow hidden | none | `--ch-card-bg` | none | |
| Card header | flex, baseline, space-between; gap 10; padding 16 16 12 | title 17 × k / 1.3 / 600; meta 14 × k / 1.3 / 400, right-aligned | title `--ch-text-primary` 17.08 / 14.34; meta `--ch-text-secondary` 9.77 / 10.25 | none | |
| Card body | padding 0 16 16 | | | | |
| Card note | margin 0 16; padding 12 0 14; top hairline `--ch-separator` | 15 × k / 1.4 / 400 | `--ch-text-secondary` | none | |

Card order: `S-READ.head`, `.where`, `.why`, `.sure`, `.moved`, `.rounds`, `.do`. A card whose data is absent is not in the DOM.

Redline: bar 44 + 48, lip under it; first card 6 under the lip; card gap 20; page edge 16 (20 at 430); card header baseline 16 + cap height from the card top; back chevron 16 from the screen edge; bottom padding 60.

## 4. S-READ.head

Same box, type and colour as `S-READ-BOARD` rows Card to Footer, minus the cause line and the Open row. Additions:

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Stale note | margin-top 12; padding-top 12; top hairline rgb(244 241 232 / .14) | 14.5 × k / 1.42 / 400 | `--ch-feature-ink-2` 8.84 / 8.44 | none | CH-13903 sentence; only in `stale` |
| Out-of-date title and hero | as above | as above | `--ch-feature-ink-2` | none | `stale` only |
| Team pool note | under its tick label, inside the SVG | 12.5 × min(k,1.2) | `--ch-feature-ink-2` | none | counts only ("164 approaches · 8 teammates"); no names or figures of teammates (SHARED-11) |

Redline: as `S-READ-BOARD`, plus the stale note 12 under the footer.

## 5. S-READ.where

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Header badge | hug; padding 5 8; radius 7 | 12 / 1 / 600, fixed | `--ch-text-secondary` on `--ch-well-bg-flat`: 8.96 / 10.87 | none | "Observed, not a cause" |
| Steps | grid; gap 12 | | | none | `diagnosis.basis.narrowing.steps[]` (03 rows 20 to 27) |
| Step head | flex, space-between; gap 10 | label 15 × k / 1.25 / 500 wraps; count 600, tabular, nowrap | `--ch-text-primary` | none | step label and count |
| Track | fill; 12 tall; radius 6; overflow hidden; 5 under the head | none | `--ch-chart-track` | none | |
| Bar | fill, `transform: scaleX(n / steps[0].n)` from the left | none | earlier steps `--ch-chart-flat` (4.49 / 4.86 on track), last barred step `--ch-chart-loss-fill` (3.15 / 5.52) | none | share |
| Step note | 5 under the track | 14 × k / 1.35 / 400 | `--ch-text-secondary` | none | statement |
| Miss shape row | words only; no bar | as step head | `--ch-text-primary` | none | "Miss shape · 9 of 12 short, 8 of 11 right" |
| Footer note | card note (§3) | 15 × k / 1.4 | `--ch-text-secondary` | none | "Each step only shows when its count clears the engine's floor." + passed count; absent when `stopped_at` is set |

Redline: steps 12 apart; bar 12 high, radius 6; bar of step 2 is 16/28 = 57% of the track; count right-aligned at the card's inner edge (16 in); badge 12pt type; footer hairline 16 in from both sides.

## 6. S-READ.why

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Stepper | grid of 3 (2 for a player); gap 4; each 6 tall, radius 3; margin-bottom 6 | none | off `--ch-chart-track`; on `--ch-text-secondary`; counted on `--ch-chart-gain-fill` | none | cause tier |
| Step labels | same grid; margin-bottom 14 | 12.5 × k / 1.25 / 500; on 600 | off `--ch-text-tertiary` 6.61 / 6.99; on `--ch-text-primary` | none | Not traced yet, Seen repeatedly, Working hypothesis (coach); Not traced yet, Seen in your shots (player) |
| Arm head (likely, coach) | flex, space-between; gap 10; margin-bottom 7 | label 15 × k / 1.3 / 500; count 400 tabular nowrap | label primary; count secondary | none | `cause.arms[]` (03 rows 30 to 34) |
| Dots | flex wrap; gap 5; 14×14 circles | none | empty `--ch-chart-track`; miss `--ch-chart-loss-fill` (3.92 / 7.12 on card) | none | failures of n |
| Arms | grid; gap 14 | | | | |
| Verdict box | margin-top 14; padding 12 14; radius 12 | 15 × k / 1.42 / 400; `b` 600; second line 14 × k secondary | `--ch-text-primary` on `--ch-well-bg-flat`: 15.66 / 15.20 | none | coach: the slice ("Misses gather on long par 4s · 12 of 16"); player: "Not traced yet." |
| Path (counted) | flex; margin 4 0 2 | node label 13.5 × k / 1.25 / 500 | node 38×38 circle, `--ch-well-bg-flat`, inset ring 1.5 `--ch-chart-flat` (5.12 / 6.65); hit node fill loss 16% over card, ring `--ch-chart-loss-fill`; connector 2 tall `--ch-chart-flat`, from node edge to node edge at y 19 | none | `cause.path[]` (03 rows 35 to 38); icon from the fixed map, 18×18 stroke 1.8 |
| Hole chips | flex wrap; gap 6; margin-top 12; chip padding 7 9, radius 8; at most 5 | 13 × k / 1 / 500, tabular | `--ch-text-primary` on well 15.66 / 15.20 | build min-height 36 with the hit area 4 above and below (row gap grows to 8) | hole numbers; tap opens that round at that hole |
| Cost line | under the chips, margin-top 10 | 14 × k / 1.4 | `--ch-text-secondary` | none | "On average a penalty hole cost about 1.4 strokes (across 14)"; absent when null |
| Meter (count-down) | flex; gap 4; margin 6 0 10; ten segments 10 tall radius 3 | none | empty track, filled `--ch-chart-flat` | none | `count_down.have` of `target` (03 rows 40 to 42) |
| Meter (data gap) | ring 54×54; radius 22; stroke 6, round caps; starts at the top; text beside it | title 15.5 × k / 1.3 / 600; line 14 × k / 1.45 secondary | track `--ch-chart-track`; fill `--ch-gain` | none | `have` of `have + still needed` (4 of 14); only for reads with a shot path |
| Count-down lines | under the meter | 15 × k / 1.4; second line 14 × k secondary | primary, secondary | none | "6 of the 10 missed downhill putts it needs, over 3 rounds" / "Nothing new is asked. It fills as Jonah plays." |
| Header meta | card header meta | 14 × k | secondary | none | Likely, Counted, Not traced yet |

Redline: stepper 6 high with 4 gaps; dots 14 with 5 gaps (Priya: 16 dots row 1, 12 misses filled); verdict 14 under the last arm, radius 12; path nodes 38 with 2pt connectors centred at 19; hole chips 36 tall; meter segments 10 high.

## 7. S-READ.sure and its corrections row

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Header word | in the header, left | 20 × k / 1.1 / 600, −0.01em | primary | none | "Solid read", "Fair read", "Thin read" (03 row 44) |
| Rows | grid; gap 12; each row grid auto / 1fr, gap 4 12 | label 15 × k / 1.3 / 500 nowrap; count 14 × k / 1.3 / 400 tabular, right | label primary; count secondary | none | Sample, Recent (only with `factors_measured`), Shot record (03 rows 45 to 49) |
| Bar | full row width; 8 tall; radius 4 | none | track; fill `--ch-chart-gain-fill` (5.15 / 4.50), `.mid` `--ch-chart-flat` | none | ratio |
| Checked list | grid; gap 6; tick 16×16 stroke 2 in `--ch-gain`, margin-top 2 | 14.5 × k / 1.35 / 400 | primary | none | `basis.checked[]` |
| Coach only well | verdict box style; "Coach only" chip padding 4 6, radius 6, 11.5 / 600, margin-left 6 | 15 × k / 1.42 | primary on well; chip secondary on well 8.96 / 10.87 | none | rung and range; absent for a player (DOM and payload) |
| Corrections block | grid; gap 8; padding-top 12; top hairline `--ch-separator` | prompt 14 × k / 1.3 / 500 secondary | | | `coachhelm_corrections_v1` |
| Chips | flex wrap; gap 6; each min-height 36, padding 0 12, radius 999, inset ring 1px separator | 14 × k / 1 / 500 | primary on well; selected: `--ch-accent` on 12% accent over card, ring accent 45% (6.73 / 6.68) | 36 visible, hit area 4 above and below | coach five chips, player two |
| Reasons panel | flex wrap; gap 6; padding 10; radius 12; well | chips on `--ch-card-bg` | as chips | as chips | It's wrong, Not important, Already known, No reason |
| Answer line | flex, space-between; gap 10 | 14.5 × k / 1.35 / 400 | secondary; Change in accent | Change 36 + 4 | "Your answer: Not this, it's wrong." |
| Answer failed | notice (§12) in the block | | | Try again 36 + 4 | "That answer didn't save. Try again." CH-13971 |

Redline: bars 8 high, 12 apart; header word 20pt; well radius 12; chips 36 tall with 6 gaps; corrections hairline 12 above the prompt.

## 8. S-READ.moved

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Header meta | | 14 × k | secondary | none | "Last change" |
| Slope chart (SVG) | width 100%, viewBox 300×118, height auto; points at x 40 and 260, y from 12 to 90 across the read's min and max; max width 300 on desktop | values 13 / 600 tabular, 12 above the higher point or 20 below the lower; Before and Now 12 / 400 at y 114 in tertiary; Tour label 12 secondary, end-anchored 6 above its line | line 2.5 wide round caps in `--ch-chart-loss-fill` (gain fill when better); start dot r 5 on card with a 2.5 ring in `--ch-chart-flat`; end dot r 6 filled; Tour reference 1.2 wide, dashed 3 4, `--ch-text-tertiary`, from x 30 to 270 | none | `trend.from`, `trend.to`, Tour line (03 rows 52 to 55); labels "Before" and "Now", no dates |
| Change sentence | margin-top 6 | 15 × k / 1.35 / 500 | `--ch-loss` 5.57 / 8.53 or `--ch-gain` 7.42 / 8.45 | none | "From 51% to 43%, down 8 pts" |
| Trend chip | inline-flex wrap; gap 2 6; padding 7 10; radius 9; well; margin-top 10 | 14 × k / 1.2 / 500 | first part primary; "· Slipping" secondary, nowrap | none | category theme (03 row 56) |
| No trend | card body text | 15 × k / 1.4 | secondary | none | "No trend yet" |

Redline: chart 118 units tall at 300 wide; Tour line dashed 3 4; chip radius 9; sentence 6 under the chart; chip 10 under the sentence.

## 9. S-READ.rounds and .rounds-all

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Row | flex; gap 12; min-height 52; padding 10 16; hairline from 16 in | title 16 × k / 1.3 / 500; subline 14 × k / 1.35 / 400 | title primary; subline secondary | whole row, 52 | date and course (03 rows 58 to 61) |
| Hole dots | in the subline: 9×9 dots, 4 apart, one per counted hole, then "{n} counted holes" | 14 × k subline | `--ch-chart-loss-fill` (3.92 / 7.12 on card) | none | holes counted (`event_strokes` with a round id); with none, the subline reads "Counted in the read" |
| Score | nowrap | 16 × k / 1 / 600, tabular; to par 500 | score primary; to par secondary | none | score and to par |
| Chevron | 8×13, stroke 1.8 | none | `--ch-text-tertiary` 6.61 / 6.99 | row | |
| Show all row | as a row, centred label | 15 × k / 1 / 500 | `--ch-accent` 8.15 / 8.45 | 52 | "Show all 9", "Show newest 8 of N", "Show fewer" |
| Rounds failed | notice (§12) inside the card, margin 0 16 16 | | | Try again 36 + 4 | "The rounds behind this read didn't load" CH-13281 |

Redline: rows 52; hairline 16 in; four rows before Show all; eight when open.

## 10. S-READ.do and its focus states

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Drill tile | flex; gap 12; align start | title 16 × k / 1.3 / 600; meta 14 × k / 1.3 secondary; body 15 × k / 1.45 primary, margin-top 6 | | none | `drill` (03 rows 63 to 65); "No drill assigned." when none |
| Drill icon | 40×40; radius 12; icon 20×20 target, stroke 1.8 | none | `--ch-gain` on 13% gain | none | |
| Target tiles | grid 1fr 1fr; gap 8; margin-top 14; each padding 12, radius 12, well | label 13 × k / 1.3 secondary; value 17 × k / 1.2 / 600 tabular, margin-top 3 | label 8.96 / 10.87; value 15.66 / 15.20 | none | Worth (absent with no strokes), Starts from |
| Plan line | flex; gap 10; margin-top 12 | 14.5 × k / 1.35 | secondary | none | plan or "Not part of a focus area or goal yet." |
| Actions | flex; gap 10; margin-top 14 | as `S-READ-BOARD.actions` | | 46 | coach only |
| Link chips | flex wrap; gap 8; margin-top 12; each padding 9 12, radius 10, well; icon 16 | 14.5 × k / 1 / 500 | `--ch-accent` on well 7.48 / 8.96 | build min-height 36, hit area 4 above and below | Message {first} (coach), Ask CoachHelm about this (only once `askAboutReadHref` exists) |
| Assigning | button keeps its size; spinner 18×18, border 2, right side clear, 0.7s linear spin | 15.5 × k | label as Assign | disabled | "Assigning…" (fixed 4 Nov: today's `FocusActions` in-flight string wins if it differs, so the Read page, the Team sheet and the Lenses sheet read the same) |
| Assigned chip | flex 1; gap 10; min-height 46; padding 0 14; radius 13 | 15 × k / 1.2 / 600 | `--ch-gain` on 12% gain over card: 6.16 / 6.68; tick 20×20, stroke 2.2 | none | "Assigned as {first}'s focus" (fixed 4 Nov: today's `FocusActions` done string wins if it differs) |
| Proposed line | under the chip, margin-top 10 | 14 × k / 1.4 | secondary | none | CH-13601 sentence |
| Declined, not offered, stale | notice (§12) where the button was | | | Propose again 46 | CH-13907, CH-13207, CH-13906 |

Redline: drill icon 40, radius 12; tiles 8 apart, radius 12; Assign 46 high, radius 13; chips 36; plan line 12 under the tiles.

## 11. S-READ.more (phone action sheet)

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Dim | covers the screen | none | black 40% | tap closes | |
| Sheet | left, right and bottom 8; grid gap 8 | | | | |
| Group | radius 14; overflow hidden; 94% card with 20px backdrop blur | | `--ch-card-bg` 94% | | |
| Title row | padding 13 16; centred | 13 × k / 1.35 / 400, two lines then ellipsis | secondary 9.77 / 10.25 | none | the read's title |
| Action rows | full width; min-height 57; top hairline separator | 19 × k / 1.2 / 400 | `--ch-accent` 8.15 / 8.45; Dismiss `--ch-flag` 6.48 / 7.06 | 57 | coach: Dismiss this read, Message {first}, Ask CoachHelm about this, Copy a link to this read; player: Ask, Copy. Ask only once `askAboutReadHref` exists (fixed 4 Nov) |
| Cancel | own group, 8 below | 19 × k / 1.2 / 600 | accent | 57 | |

Redline: 8 from the screen edges; groups radius 14; rows 57; 8 between the groups.

Focus: on open, focus moves to the first action row; on close it returns to the ⋯ button. Esc closes the sheet on a keyboard. VoiceOver reads the title row as the sheet's label.

## 12. Shared inline parts

| Part | Box | Type | Colour | Hit |
|---|---|---|---|---|
| Notice | flex; gap 10; padding 12 14; radius 12; well; icon 16 alert or archive, margin-top 2 | 14.5 × k / 1.42 / 400; `b` 600 | text 15.66 / 15.20 on well; icon secondary | buttons inside: ghost, min-height 36, padding 0 12, radius 10, 14.5 × k, hit area 4 above and below |
| Error card (failed, gone) | card; inner grid gap 10, padding 20 16, items start | title 17 × k / 1.3 / 600; body 15 × k / 1.45 secondary; code 12 / 1 / 500 mono tertiary 6.61 / 6.99 | | Try again primary 46 (failed); Back ghost 46 (gone) |
| Skeleton | outlines at final heights: feature 360, then 250, 270, 240; radius 16 | none | card with ring; feature outline `--ch-feature-bg` | none |

Error wording: failed "This read didn't load" / "Nothing was lost. Check the connection and try again." CH-13866 (fixed 4 Nov wiring: CH-13860 is taken in the catalog). Gone "This read is no longer open" / "It was cleared or dismissed after this link was made. {first}'s open reads are on the board." (player: "Your open reads…") CH-13861. Part failed banner "Part of this read didn't load. The rounds behind it are missing. Everything else is here." CH-13208.

## 13. S-READ-DESK, .rail, .more

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Sidebar | 232 wide | today's | `--ch-frame`; nav items 14.5 / 500, on state 12% champagne tint | today's | unchanged |
| Glass bar | 58 tall; padding 0 24; gap 12; bottom hairline; 78% card, blur 24, saturate 170% | 14.5 / 1 / 500; current crumb 600 primary | crumbs secondary | | coach: CoachHelm › {name} › {area}; player: CoachHelm › {area} |
| Bar buttons | padding 8 12; radius 10; well; inset ring separator; icon 16 | 14 / 1 / 500 | primary on well | 36 + pointer | Ask about this read (only once `askAboutReadHref` exists; fixed 4 Nov); Message {first} (coach); ⋯ |
| Body | grid 250 / minmax(0,1fr) / 320; gap 20; padding 22 24 | | | | |
| Columns | flex column; gap 16; scroll on their own; padding-bottom 24 | | | | middle: head, where, why, do; right: sure, moved, rounds |
| Switcher (coach) | flex; gap 2; padding 3; radius 11; well; inset ring | 14 / 1 / 500 | off secondary; on primary on card with ring and 0 1 2 shadow | 34 tall + pointer | Priya, Eli, Jonah |
| Rail card | card; group heads 13.5 / 1.2 / 600 secondary, padding 12 16 6 | rows 14.5 / 1.3 / 500, subline 13 / 1.3 secondary, value 14 / 1 / 600 tabular | open row: 9% accent over card (ink 14.81 / 12.08, secondary 8.47 / 8.64) | whole row | reads grouped Off the tee, Approach, Around the green, Putting, Course and scoring; empty groups hidden |
| Rail dot | 9×9 | none | loss, gain or flat fill | none | stance tone |
| Ladder, slope | max width 340, 300 | | | | |
| More popover | 250 wide; right 24, top 62; padding 6; radius 14; 94% card, blur 24; ring plus 0 18 40 −16 black 35%; grid gap 2 | items 14.5 / 1 / 500, padding 11 12, radius 9 | primary; Dismiss `--ch-flag`; hover `--press` | 37 + pointer | coach: Dismiss this read, Copy a link, Close; player: Copy a link, Close |

Breakpoints: three columns from 1180; 821 to 1179 the right column moves under the middle; 820 and below is the phone layout. No horizontal scroll at 1280 or 1024.

Redline: sidebar 232; glass bar 58; columns 250 / fill / 320 with 20 gaps; body padding 22 top, 24 sides; switcher 34; popover 250 wide, 4 under the bar; ladder no wider than 340.

## 14. Corrections to 04

- 04 §7 says Message opens the composer "prefilled with the read's headline". The plan (02 §4.6) opens today's compose with no prefill, so nothing is put in a message the coach didn't write. Build with no prefill.
- 04 §4 says the green bar's tab is 18. Build today's 16 (SHARED-2); listed under "Can't match as drawn".
- 04 §8 Reduce Motion fade: build `CH_FADE_MS` (180ms today) per SHARED-6; the page's 120ms is the drawn value only; see 07.

Settled against 02-PLAN (3 Nov). The design wins each; 02 now says so in place:
- Back label on the pushed bar: the player's first name for a coach, "CoachHelm" for a player (02 §4 said "CoachHelm" for both).
- Desktop rail: 250 wide (02 §5 and the class table said 300).
- Message {first}: today's compose to that player with no prefill (04 §7 said prefilled; 02 §4.6 wins here, so the coach never sends words they didn't write).
- Card gap and padding: 20 between cards, 16 inside (header 16/16/12, body 0/16/16) (02's style rules said 24 and 20).

## Completeness pass, 4 Nov 2026

Specs for the states 05 lists that had no element spec here, and for the states added in 05's Completeness pass section. Same columns as above. Contrast is worked out from §0's hex on `--ch-card-bg` (light #FFFEFB, dark #191E1A) unless a row names the ground. The Team and Lenses read sheet is not this page; its contract is in `coachhelm-team/06` and `coachhelm-lenses/06` under the same section name, and its "Open the full read" row links here.

| Element | Box | Type | Colour | Hit | Data |
|---|---|---|---|---|---|
| Cleared chip (S-READ.cleared) | headline stance chip slot; padding 5 8; radius 7 | 12.5 / 1 / 600 | `--ch-feature-gain` on 12% of itself over `--ch-feature-bg`: 5.66 / 5.39 | none | "Cleared {date}" (`ChDiveCleared`) |
| Cleared lede | headline lede slot | as lede | `--ch-feature-ink-2` 8.84 / 8.44 on feature | none | the recheck's sentence, e.g. "22 of your last 29 (76%). That one is fixed." |
| Cleared page | Do card and the Assign row are left out; More keeps Copy only | | | | no actions (02 §7.5) |
| Contradicted chip | stance chip slot | 12.5 / 1 / 600 | `--ch-feature-loss` on 12% of itself over feature, as the page's `.st` chip (amber, never red): 5.62 / 5.34 | none | "Contradicted" |
| Contradicted notice | §12 Notice under the headline, icon alert | 14.5 × k / 1.42 | text on well 15.66 / 15.20 | the conflicting read's title is a link row, 44 | "The newer rounds point the other way." then the read it conflicts with (`lifecycle.pair`), linking to its own `readHref` |
| Under review chip | stance chip slot | 12.5 / 1 / 600 | plain: `--ch-feature-ink-2` on white 10% over feature: 6.54 / 6.29 | none | "Under review" |
| Under review line (player) | §12 Notice under the headline | 14.5 × k / 1.42 | on well 15.66 / 15.20 | none | "Your coach is checking this read. It stays visible but is not on your focus." |
| Part failed banner | §12 Notice, margin 12 16 0 under the headline, icon alert | 14.5 × k / 1.42; `b` 600 | on well 15.66 / 15.20 | Try again ghost 36 + 4 extension | CH-13208 wording (§12); the Rounds card holds its own notice (CH-13281) |
| Dismissed notice | §12 Notice at the top of the page, icon archive | 14.5 × k / 1.42 | on well | Undo ghost 36 + 4 extension | CH-13901; stance chip reads "Dismissed" |
| Copied toast | today's Clubhouse toast, unchanged | today's | today's | none | "Link copied", 2.4s |
| No pool ladder (S-READ.nopool) | ladder rows as §4 with the Team row left out; the band keeps its place | as §4 | as §4 | none | player and Tour only; no line says why |
| Not yours card | §12 Error card, gone variant | as §12 | as §12 | Back ghost 46 | player words of CH-13861 (05 Completeness pass) |
| Long (S-READ.long) | titles wrap with no cap; the bar title is one line, centred, ellipsis only where it meets the back label; rail names ellipsize after one line on desktop | | | | longest real name in the fixture |
| Focus ring | today's `:focus-visible` ring, 2pt, offset 2, the target's radius; on the feature card `--ch-feature-ink` | | `--ch-accent` on card 8.15 / 8.45; on feature 11.30 / 10.78 | every button, chip, row and the board card | none |
| 821 to 1179 | desktop shell; rail 250 and middle column; the right column's cards follow the middle column's cards in the same scroll | as desktop | as desktop | | |

Redline: stance chips 12.5 tall type, padding 5 8, radius 7; notices 12 under the headline; toast as today.

## Wiring, 4 Nov 2026

Checked against helmv3 `main` 03d9087 (1 Nov) by reading code only. Paths under `src/clubhouse/` unless they start with `src/`, `supabase/` or `config/`. "new:" names code the build adds. Every cell that says "today's" means the file and line given, unchanged. A missing value shows "—". Shot tracking: no screen in this lane changes what shot tracking collects, stores or sends. `S-READ.why`, `S-READ.where`, `S-READ.gap`, `S-READ.countdown` and `S-READ.rounds` read shot-derived evidence that the engine already stored on `golf_coach_insights.evidence` (`cause`, `data_gap`, `diagnosis.basis.narrowing`) and round rows through `readRounds` (`data/coachhelm-dive.ts:30`); no screen reads or writes `golf_shots` directly.

Shared plumbing for every row below:

| element or action | reads (source, file:line) | writes or calls (file:line or new) | who and RLS | validation | success | failure and rollback | sync (realtime or refresh) | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Route `?view=read` (coach) | `ClubhouseCoachHelmRoute` `routes/coachhelm.tsx:166`; scope `loadCoachPlayerScope` `data/coachhelm-player.ts:90` | new: block after line 189 (`CoachReadPage`), `redirect(coachPlayerHref('deep-dive', player))` without `insight` | coach branch only (`pickGolfDashboardRole(session) === 'coach'`, line 173); the address id is input only, checked against the coach's team before any read | `player` and `insight` must be strings; any other value falls through | page renders | not member CH-13311, scope failed CH-13209, coach-off board CH-13305, player-off `ReadPage load={{status:'off'}}` (CH-13313) | none (server render) | none | `isReadEnabled()` new `src/lib/coachhelm/v3/read/flag.ts` (sync, server only); off: falls through to the board, exactly 03d9087 | none |
| Route `?view=read` (player) | session `getGolfSessionProfile`; gate `loadPlayerHelmGate` `data/coachhelm.ts` (as `PlayerHelmView` `routes/coachhelm.tsx:95`) | new: block before line 225 (`PlayerReadView`); `redirect(PLAYER_HELM_HREF['deep-dive'])` without `insight` | player id is `session.player.id`, never `?player=` | as coach | page renders | off: the view's off page; gate failed: `{status:'failed'}` | none | none | same flag; off: `playerHelmDrill('read')` is null, so the board renders | none |
| Page entry type | `src/app/golf/(dashboard)/dashboard/coachhelm/page.tsx:199` | add `insight?: string` to the searchParams type (type only; line 206 already spreads it) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | none |
| Loaders | coach `coachDiveCore` (new, body of `loadCoachPlayerDeepDive` `data/coachhelm-player.ts:187-269`, feed at 200, rounds at 224); player `playerDiveCore` (new, body of `loadPlayerDeepDive` `data/coachhelm-dive.ts:101-194`, feed at 127, rounds at 156) | new `data/coachhelm-read-view.ts` `loadCoachRead`, `loadPlayerRead`; one feed call each | coach feed `getInsightsForCoach` (`src/app/golf/actions/insight-delivery.ts:871`) checks coach access itself; player feed `getInsightsForPlayer` (836) is the player's own rows; reads go through the session client and RLS (`coach_insights_select_via_player_team`, `coach_insights_select_player_own`, baseline `20260527000000` 18546, 18552) | an `insight` not on the returned list gives `read: null` | `ChViewLoad<ChReadView>` ready | feed throws: `{status:'failed'}` (CH-13866) | none | none | same flag | none |
| Exposure | `recordExposureForReturned` (`insight-delivery.ts:347`) | coach: one `coach_feed` set per view (1069), the same set Deep dive records; player: `drawnLater: () => [insightId]` so exactly the read shown records one `player_feed` row (820) | server only | n/a | n/a | a rejecting `drawnLater` records nothing (155-160) | n/a | n/a | n/a | none |
| Coach corrections on the read | `readCorrections` `data/coachhelm-corrections.ts:29` (fixed 4 Nov wiring: `loadCoachPlayerDeepDive` does not call it today, so the coach read has none unless the loader adds it) | new: `loadCoachRead` calls `readCorrections(supabase, { role: 'coach', teamIds: [scope.teamId], reads })` beside the feed, as the coach board does at `data/coachhelm.ts:593`; player read keeps the player call (`data/coachhelm-dive.ts:162`) | `golf_coachhelm_corrections_select` (`20261020121000_golf_coachhelm_corrections.sql:135`) | null with the flag off or the table missing | chips drawn | null: no chips, no error | n/a | none | `coachhelm_corrections_v1` (`config/feature-flags.yml:1130`) through `isCorrectionsEnabled` inside `runWithCoachHelmTeams` | none (applied 2026-10-21) |

### S-DIVE.why (CR0)

| element or action | reads | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Why drivers and reason | `diagnosisFor` `data/coachhelm-dive-shape.ts:328-350`, called at 541 with no role; drawn by `Why` `screens/coachhelm/views/DeepDive.tsx:244-288` (drivers at 248) | fix: `diagnosisFor(ev, say, role)`; when `role !== 'coach'` and `causality_level !== 'observed_sequence'`, return null. `toChDeepInsight` passes its `role` (line 538) | server filter in the shaper; `ChDeepInsight` is serialized to a client component, so the drivers, the cause sentence and the reason never reach the player's payload | n/a | player Why shows the write-up only; `whyOf` (`data/coachhelm-read-shape.ts:190`) already answers "Not traced yet" for a null diagnosis, so the read's words do not change | n/a | n/a | none | none: ships with every flag off, a fix to today's Deep dive and to Lenses' sheet that reuses `Why` | none |
| Write-up text | `ChInsight.why` (`data/coachhelm-map.ts:310`) holds the full generator text; `writeUpFor` (`data/coachhelm-read-shape.ts:150`) drops causal sentences only at render | the read page builds its `why` text on the server with `writeUpFor(text, traced)`; Deep dive keeps today's render-time filter (CR0 does not edit `DeepDive.tsx`) | as above | n/a | n/a | n/a | n/a | none | none | none |

### S-READ-BOARD (+ .actions, .dismissed, .loading)

| element or action | reads | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Hosts (fixed 4 Nov wiring: engineering call, see the lane report) | the host's own loader calls `toChReadSummary(raw, base, viewer, calls)` beside `toChInsight` | read on and file off: `PlayerBoard`'s top focus card (player, `screens/coachhelm/PlayerBoard.tsx:44`) and the coach Deep dive dossier head for the open read each take one branch `readOn ? <ReadSummaryCard …/> : today`; read on and file on: Lenses' feature card, this card not drawn; never in Team | coach board ids come from the coach's own roster (`data/coachhelm.ts:518-532`); player rows are the session player's | n/a | n/a | n/a | n/a | none | `readOn` from `isReadEnabled()` in the route, passed as a prop (client modules cannot read flags, `src/lib/flags/is-enabled.ts` is server only); off: today's card byte for byte | none |
| Card tap | `ChReadSummary` | `Link` to `readHref(playerId \| null, id, readOn)` (new, `data/coachhelm-views-shape.ts` after line 130) | coach and player | n/a | push (PR 5 nav rule) | n/a | n/a | none | as above | none |
| Assign as focus (row) | `ChInsight` `assigned`, `declined`, `stale`; `ChBoardMissing` | `useFocusActions(writes).assign.run(target)` `screens/coachhelm/parts.tsx:306`, `FocusActions` 392 unchanged; `LIVE_COACHHELM_WRITES.assign` (`screens/coachhelm/writes.ts:37`) to `createFocusAreaFromInsightV2` (`src/app/golf/actions/development.ts:1736`) | coach only (the row is absent from the player DOM); `verifyPlayerAccess` in the action (1597); RLS `golf_player_focus_areas_insert_coach` (baseline 19345) | the action's duplicate guard answers `ACTIVE_FOCUS_DUPLICATE_ERROR`; title and description are the insight's own (`assignAs`) | chip "Assigned as {first}'s focus" (CH-13601), set only after success (no optimistic write, so nothing to roll back) | toast CH-13001 with Try again; duplicate shows Assigned plus "{first} already has a focus on this" | `revalidatePath('/golf/dashboard/coachhelm')` in the action (1727) refreshes the page payload; other devices see it on next load | `notifyPlayerOfProposedFocus` (`development.ts:1359`): bell row `dev_plan_assigned` (`src/lib/notifications/in-app.ts`, no settings gate) and email gated by `email_task_reminders` (`src/lib/notifications/email.ts:136`); link `/golf/dashboard/stats?tab=dev` for a Clubhouse team (`development.ts:313`); no push is sent on this path today | none | none |
| More, Dismiss this read | as above | `fa.dismiss.run(target)` to `dismissInsight` (`src/app/golf/actions/insights-feed.ts:681`) | coach only; session client, update scoped by `team_id` (insights-feed.ts 625-632); RLS "Coaches can manage their insights" (baseline 16837) | n/a | dismissed notice with Undo (CH-13901) | toast CH-13002 | revalidatePath `/golf/dashboard` and `/golf/dashboard/insights` (660-665); next load drops the read | none | none | none |
| Undo | as above | `fa.undo.run(target)` to `reactivateInsight(id, lifecycle, 'dismiss')` (`insights-feed.ts:790`) | coach only; same policy | n/a | card returns | toast CH-13003 | as Dismiss | none | none | none |
| Double submit | `useAction` `inFlight` ref (`lib/use-action.ts:73-77`) | a second tap answers `busy` and sends nothing | n/a | n/a | one write, one haptic | n/a | n/a | n/a | n/a | none |
| Loading | host Suspense | none | n/a | n/a | n/a | n/a | n/a | n/a | n/a | none |

### S-READ (shell, bar, More, copied, notyours, gone, failed, loading, off)

| element or action | reads | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Bar and Back | `head.first`, `areaLabel` | `PhoneTop` (`shell/phone-chrome.tsx:344`) as `views/Frame.tsx:45`; Back: history back on CoachHelm, else `readBackHref`: coach `playerFileHref(player, undefined, fileOn)` (Lenses, new) with file off giving today's `coachPlayerHref('deep-dive', id)`; player `PLAYER_HELM_HREF.board` | both | n/a | n/a | n/a | n/a | none | `fileOn` from `isPlayerFileEnabled()` in the route | none |
| More: Message {first} | `head.playerId` | link `rebuiltHref('/golf/dashboard/messages?player=…', 'coach')` as `DeepDive.tsx:450`; Messages reads `?player=` (`screens/messages/Messages.tsx:179`); no `ChPrefill`, so nothing is put in a message the coach didn't write | coach only | `rebuiltHref` null: item left out | navigation | n/a | n/a | none (sending is Messages') | none | none |
| More: Ask CoachHelm about this | `insightId`, `playerId` | `askAboutReadHref({ insightId, playerId })` from Ask's new `screens/coachhelm/chat/ask-links.ts` (Ask AK2) | both; null for a player when player Ask is off or the read isn't theirs | null: item and chip left out | navigation | n/a | n/a | none | Ask's `coachhelm_ask_v2`, decided on the server by Ask | none |
| More: Copy a link to this read | `readHref(player, id, true)` made absolute with `window.location.origin` | `navigator.clipboard.writeText`; no server write | both | n/a | today's toast "Link copied" (as `screens/stats/StatsPlayerPhone.tsx:129`) | clipboard refused: toast "Couldn't copy the link" (no code, nothing saved) | n/a | none | none | none |
| More: Dismiss this read | as S-READ-BOARD | as S-READ-BOARD; after success the page shows the dismissed notice with Undo in place; the next load gives `gone` | coach only | n/a | as S-READ-BOARD | as S-READ-BOARD | as S-READ-BOARD | none | none | none |
| Gone (CH-13861) | `read === null`: the id is not on this player's list (dismissed, cleared with recheck off, or never theirs) | none | both | n/a | n/a | n/a | n/a | none | none | none |
| Not yours | player: their own feed never holds another player's row (`getInsightsForPlayer`), so the page shows the gone card in player words and loads nothing of anyone else; coach: `loadCoachPlayerScope` not-member gives CH-13311 before any read | none | both | n/a | n/a | n/a | n/a | none | none | none |
| Failed (CH-13866) | loader `{status:'failed'}` | Try again: `router.refresh()` (re-runs the loader; it records the exposure again, as any page view) | both | n/a | page renders | stays on the error card | n/a | none | none | none |
| Pull to refresh | `shell/PullToRefresh.tsx` | today's | both | n/a | figures swap in place; marks that drew once do not draw again (`useInViewOnce`, `lib/use-in-view.ts:9`) | n/a | n/a | none | none | none |
| Flag off (S-READ.off) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | `?view=read` falls through; `readHref(..., false)` returns `coachPlayerHref('deep-dive', id)&insight=` or `diveReadHref(id)`, byte for byte | none |

### S-READ cards (head, where, why, sure, moved, rounds, do) and their states

| element or action | reads | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Head: title, lede, value, stance | `ChInsight` (`toChInsight` `data/coachhelm-map.ts:272`), `stanceOf` (`data/coachhelm-shape.ts:360`) | none | both | n/a | n/a | missing value "—" | n/a | none | none | none |
| Head: ladder | `evidence.comparison.lines` (`src/lib/coachhelm/v2/insights/types.ts:290`); team pool only when the row carries a `team_pool` line and `READ_CALLS.teamPoolOnLadder` allows; Tour from `comparison_value` | none | both; the pool line holds a count of teammates, never a name (`src/lib/coachhelm/v3/team-pool/attach.ts`) | n/a | n/a | no Tour figure: Tour tick left out (S-READ.nopool) | n/a | none | gate on the row, not the render-time flag (`coachhelm_team_pool_v1`, `config/feature-flags.yml:710`) | none |
| Head: worth, foot | `ChDeepInsight.closes`, `strokes_impact_method` (`ESTIMATED`, `data/coachhelm-read-shape.ts:90`), `ChHelmEvidence.sample/window`, `read.word`; coach only: `engine.support.word` (`supportOf` returns null for a player, `data/coachhelm-engine-shape.ts:249`) | none | rung coach only, filtered in `supportOf` on the server | n/a | n/a | no strokes: no worth line | n/a | none | `coachhelm_support_v1` through `readEngineFlags` (`data/coachhelm-engine.ts:22`) | none |
| Where (funnel) | `diagnosis.basis.narrowing` (`types.ts:510`) through new `funnelOf`; labels as `narrowingOf` (`data/coachhelm-path.ts:55`) | none | player: counts only; a rate-form par step shows its label only (03 "Player view rules"); built in the shaper, so the arm rates never reach the player's payload | a count that does not parse draws text only | n/a | no narrowing: card left out | n/a | none | `READ_CALLS.playerFunnel` (config object, not a flag) | none |
| Why | `evidence.cause` (`types.ts:382`): `alternatives[0]`, bounds, `path`, `occurrences/denominator/distinct_rounds`, `event_strokes`, `data_gap`, `count_down`; holes from `ChDeepInsight.where` (`whereFor` `data/coachhelm-dive-shape.ts:479`) | none | player: `readCauseOf(..., viewer)` never builds `arms`, `verdict`, `range` or `rung`; a likely cause becomes `not_traced` (as `pathLineFor`, `data/coachhelm-path.ts:100`) | n/a | n/a | `load_failed`: "Shot records could not be read this run" | n/a | none | `coachhelm_root_cause` engine flag through `readEngineFlags`; off: legacy drivers list (coach), nothing for a player | none |
| Why: hole chips | `ChDiveHole.href` | link to round review | coach links built with the coach route (03 "Formula problems": `whereFor` builds player routes, line 492; the coach read passes `exampleRounds: true` and the coach voice) | n/a | push | n/a | n/a | none | none | none |
| Sure | `confidence_factors.sample_adequacy`, `sample_n`, recency only when `factors_measured === true`; `cause.checked`; `diagnosis.basis.checked` | none | player: sample with no target (03 Missing 8) | n/a | n/a | row left out when not derivable | n/a | none | none | none |
| Sure: corrections chips | `ChCorrections` from `correctionsOf` (`data/coachhelm-engine-shape.ts`), fed by the loader row above | `LIVE_CORRECTION_WRITES.record` (`screens/coachhelm/writes.ts:94`) to `recordCoachHelmCorrection` (`src/app/golf/actions/coachhelm-corrections.ts:239`) through today's `CorrectionChips` (`screens/coachhelm/Corrections.tsx:59`) | coach: five chips; player: Not this and Good read only; RLS `golf_coachhelm_corrections_insert_author` (`20261020121000…sql:156`) also CHECKs that a player writes only `not_this` and `confirm` | today's reason list | "Your answer: …" with Change (CH-13971) | answer failed: CH-13971 line kept, chips stay (today's) | local state; next load reads the newest answer | none | `coachhelm_corrections_v1` | none (applied) |
| Moved | `raw.metadata.movement` (`insight-delivery.ts:116`), `movementFor` (`data/coachhelm-dive-shape.ts:307`), `ChDiveTheme` | none | both; own figures only | n/a | n/a | no movement: "No trend yet"; themes failed: notice in the card | n/a | none | none | none |
| Rounds | `ChDiveRounds` (newest 8, `DIVE_ROUNDS_SHOWN` `data/coachhelm-dive-shape.ts:32`) | link to round review | both; the coach loader reads the player's rounds after the scope check | n/a | n/a | failed: CH-13281 notice in the card; banner CH-13208 under the head when two or more parts fail | n/a | none | none | none |
| Do: drill, figures, plan line | `ChInsight.week`, `assigned`, `declined`; `engine.verdict` (`targetLine` `data/coachhelm-engine-shape.ts:371`); `ChDeepInsight.plan` (`planFor` 371) | none | both; the plan's goal is the coach-visible one only (Lenses L0 fix in `readPlans`) | n/a | n/a | plans failed: notice in the card | n/a | none | `coachhelm_verdicts_v1` for the verdict | none |
| Do: Assign as focus | as S-READ-BOARD; `assignStateOf(ins, fa, missing)` (new, pure, in `read/DoCard.tsx`) mirrors `FocusActions` branch by branch | `fa.assign.run(target)`, same `ChFocusTarget` (`parts.tsx:290`) | coach only; absent from the player DOM | as S-READ-BOARD | Assigned chip with the drawn tick; plan line swaps through `Swap` | as S-READ-BOARD | as S-READ-BOARD | as S-READ-BOARD | none | none |
| Do: Add to practice | none | not drawn: the Practice lane exports no entry today (see the lane report) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | none |
| States: stale, cleared, contradicted, under review, countdown, gap | `ChInsight.stale` (CH-13903), `ChDiveCleared`, `engine.lifecycle` (`COACH_FIRST_MS` decides the player's day), `cause.not_traced_reason`, `data_gap` | none; stale and cleared show no Assign | contradicted: the shaper drops it for a player before the day passes (`shapeReadsLifecycle`, called at `data/coachhelm-dive.ts:146`) | n/a | n/a | n/a | n/a | none | `coachhelm_recheck_v1` (cleared, contradicted); off: a cleared read opens as gone | none |

### S-READ-DESK (+ .rail, .more, .jump)

| element or action | reads | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Rail rows | `ChDeepDive.list` grouped by `DIVE_AREAS` (`data/coachhelm-dive-shape.ts:112`), `counts` | `Link` to `readHref(player, id, true)` with `replace` and `scroll={false}` | coach: tier word from `engine.support` (coach only); player: own reads | n/a | read swaps in place; each view records only the read shown | n/a | n/a | none | same flag | none |
| Desktop More | as phone | Copy, and Dismiss for a coach | as phone | n/a | as phone | as phone | as phone | none | none | none |
| Crumbs | `usePageCrumbs` (`shell/crumbs.tsx:22`) | none | both | n/a | n/a | n/a | n/a | none | none | none |
