# CoachHelm Team (the hole): acceptance

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 27 rows).
> Wiring, 4 Nov 2026: see the section of that name at the end of this file.

Design page: `redesign/coachhelm-team.html` (same file as `coachhelm-team.html` in this folder). Screen IDs: `05-SCREENS.md`. Motion rows: `07-MOTION.md`. Figures: `03-DATA-CHECKS.md`. Values not repeated here live in `04-FIDELITY-SPEC.md` sections 2 to 4 and `06-SCREEN-SPECS.md` redlines. Where this file and 04 disagree, this file wins and 04 gets a pointer (BUILD_CONTRACT_STANDARD).

This file replaces the earlier draft `redesign-package-src/acceptance/team-board.md`. Its open items are settled: the fifth tab, Course, holds the course, scoring and pressure reads plus the team's scoring history (Nick, Oct 31: "I like having 5th tab with course stuff like reads and perf history and the 4 open reads are good"); up to 4 reads a player (3 needs work, 1 working); Team opens on the hole by default (`TEAM_BOARD_FIRST_VIEW = 'hole'`).

How to read a criterion: each is a fact a reviewer marks pass or fail. "Check" says how: **S** a screenshot pair from `capture.mjs`, **D** a DOM or unit test, **C** a motion clip. A capture state is the design hash token list `capture.mjs` uses (the theme is a separate part of the file name). "(add)" means the shot is not in `capture.mjs` yet: add a SHOTS row with that token.

## Shared criteria

SHARED-1 to SHARED-12 (`ACCEPTANCE-SHARED.md`) apply to every PR in this lane and are not repeated. Lane notes on four of them:

- SHARED-6 says a 120ms crossfade. The app's own `CH_FADE_MS` in `lib/motion.ts` is 180ms and its test (`reduced-motion.test.tsx`) pins 180 (owner decision 2, 24 Oct), so this lane uses 180ms (04 section 8 A, 02 section 10.3). Every Reduce Motion check here uses 180ms. Everything else in SHARED-6 holds (nothing travels, scales or rotates; loops stop).
- SHARED-5 XXL: the app caps Text Size at 23/17 (`MAX_SCALE` in `lib/dynamic-type.ts`, 1.353). The design page's Largest is `--k` 1.35 and the capture script sets `--ch-type-scale` 1.353, so XXL pairs compare like for like.
- SHARED-2 allows no gradients. The feature card and the story viewer are flat fills; the page's earlier soft radial lights were removed (3 Nov).
- SHARED-11: this board is coach only. Its criteria are under each screen's "Roles".

## Common states

Every screen ID below is checked in these states unless its own table says "n/a". Phone 390 × 844 is the default device and 430 × 932 the large phone; capture.mjs draws both sides at those sizes.

| State | Capture state (design hash) | Rule |
|---|---|---|
| default | `top` and the screen's own token | As drawn, fixture `default` |
| loading | `loading` | `TeamBoardSkeleton`: final card shapes, shimmer M-TEAM-39 |
| empty | `empty` | No rounds yet this season |
| failed | `failed` | The weekly brief and the track record failed; the rest draws |
| long text | `long-spot` | Longest names ("Priyanka Natarajan-Okonkwo", "Elijah Brandt-Whitaker"), long read title |
| early season | `early` | Every player under 5 rounds on file |
| XXL | `top-xxl` (1.35) | Nothing clips (SHARED-5) |
| dark | any token, dark theme | Dark tokens, 04 section 2 |
| Reduce Motion | any token plus `reduce` | 07 Reduce Motion column |
| phone 390 | default | 16pt edge |
| large phone 430 | `top-lg` | 20pt edge |
| desktop | `1280`, `1440`, `1728` | Two level columns |

## Per screen

### S-TEAM (board at rest)

Layout
- AC-TEAM-01. Phone order top to bottom: green bar (SHARED-1), Team and Ask switch, large title, context line, This week (S-TEAM.today), the hole (S-TEAM.hole), the spot card or Course card, the huddle, roster, Working on, track record. Check: D (order of `data-ch-team-card` and headings), S `top`.
- AC-TEAM-02. The switch is two segments, "Team" selected and "Ask"; 12pt outer radius, 9pt inner, 3pt padding; label 15pt 500. With the flag off it reads "Board" (02 section 5.1). Check: D, S.
- AC-TEAM-03. Large title is the team name, 34/1.2 weight 600, wdth 88, −.034em. The context line under it is 15/1.35 ink-2: "{n} players · {rounds} rounds this season · {reads} open reads"; with no rounds, "{n} players · no rounds yet this season". Check: D, S.
- AC-TEAM-04. Cards are 24pt apart on phone; the page edge is 16pt at 390 and 20pt at 430 (SHARED-7). Check: S `top`, `top-lg`.
- AC-TEAM-05. Exactly one `.ch-htb-feat` on the page, in every state that has data (one green feature card). Check: D.
- AC-TEAM-06. Desktop: `grid-template-columns: minmax(0,1fr) clamp(320px, 30%, 440px)`, gap 18; left column the hole then the spot card; right rail This week, Working on, the huddle; below, roster and track record side by side at the same height. Content padding 22 24 40. Check: D (computed style), S `1280`, `1440`, `1728`.
- AC-TEAM-07. Desktop columns end level: the bottom edges of the spot card and the huddle card are within 1pt at 1280, 1440 and 1728, and so are the roster and track record. The extra height sits inside the last card (spot split stretches, huddle centres), never as a gap under it. Check: D (bounding boxes), S.
- AC-TEAM-08. No horizontal scroll at 390, 430, 1280, 1440, 1728 (`scrollWidth === clientWidth` on the document and the board). Check: D.
- AC-TEAM-09. The sidebar and the glass top bar are today's, byte for byte; the switch sits where `CoachBoard` puts it on desktop today. Check: S against main, D.

States
| State | Capture | Criterion |
|---|---|---|
| loading | `loading`, `1440-loading` | AC-TEAM-10. Phone: a 120pt skeleton block card, the green hero skeleton (300pt hole block), skeleton cards of 5 and 4 rows (30pt coin, 12pt bar, 48pt value). Desktop: hero (250pt) and a 5-row card left; 3-row, 2-row and a 220pt-tall card in the rail; then 5-row and 3-row cards. All `aria-hidden`. Skeleton heights match the loaded cards within 8pt so nothing jumps. |
| empty | `empty`, `1440-empty` | AC-TEAM-11. Phone: the empty hero (S-TEAM.hole empty), S-TEAM.empty-steps, the roster. No This week, spot card, huddle, Working on or track record on phone. Desktop: empty hero left, steps right, then roster and the record's "No reads to check yet". |
| failed | `failed`, `1440-failed` | AC-TEAM-12. This week and the track record show their own failed notices (S-TEAM.today, S-TEAM.record); the hole, spot card, huddle, roster and Working on draw as default. Never "nothing new". |
| players read failed | not drawn; add fixture `state=partial` | AC-TEAM-13. Build rule from 03 "States" and 02 section 11: when `players.error` is set, a board-level notice takes the hole's place with its own Try again; no figure, bar or zero is drawn. |
| long | `long-spot` | AC-TEAM-14. Context line wraps to a second line, never ellipsis. |
| early | `early`, `1440-early` | AC-TEAM-15. Board draws in full; every coin hollow; one story; no Working on rows (empty line). |
| XXL | `top-xxl`, app 1.36 | AC-TEAM-16. Title and context line wrap; cards grow; nothing clips. |
| dark | `top` dark | AC-TEAM-17. Page `#0E120F`, cards `#191E1A`. |
| Reduce Motion | `top-reduce` | AC-TEAM-18. No fly-in; stations at rest on first paint. |
| 430 | `top-lg` | AC-TEAM-19. 20pt edge. |
| desktop | `1280`, `1440`, `1728` | AC-TEAM-06, 07. |

Roles and data
- AC-TEAM-20. The board renders only for a coach of the team the shell resolved. A player session at the CoachHelm address gets today's player view, and its DOM holds no `ch-htb-` element and no other player's id, name or figure (SHARED-11). Check: D as demo player, network responses included.
- AC-TEAM-21. With `coachhelm_team_board_v1` off, every CoachHelm address renders exactly as at 75b4956 (SHARED-8). With it on and `TEAM_BOARD_FIRST_VIEW = 'board'`, the view opens on today's board and the hole is one tap away. Check: D (unit test on the constant), S against main.
- AC-TEAM-22. Context line counts: players on the active roster; countable rounds this season since Aug 1 (`isCountableRound`, 03 section 2); reads actually drawn on the board (after the caps), never `ChCoachPlayer.count`. Check: D against the fixture.
- AC-TEAM-23. `?player=<id>` opens that player's sheet (phone) or inspector (desktop) once, and not again after it is closed. Check: D.

Motion: M-TEAM-01 to 04 on first paint only, M-TEAM-38, M-TEAM-39.

### S-TEAM.hole

Layout
- AC-HOLE-01. Feature card fill `--feat` (#0B3A25 light, #123D29 dark), radius 16, padding 18 16 14 on phone and 20 22 16 on desktop, shadow `0 14px 30px -18px rgba(5,30,18,.6)`. Flat fill, no light (SHARED-2). Check: D, S `top`.
- AC-HOLE-02. Kicker "Where {team} gives back strokes" 14/1.2 500 f-ink-2. Figure 40/1 500, wdth 92, −.04em, tabular, signed, one decimal (A20). Beside it, bottom aligned, "a round to Tour" and "This season · {n} rounds" 14/1.3 f-ink-2. Check: D, S.
- AC-HOLE-03. The SVG is viewBox 330×400 on phone and 760×268 on desktop. Path, fairway width (58 / 74), mow stripe (.42 of the width), green, fringe, tee box (rx 4), bunkers, flag (pole 34, 1.5 stroke; 16×10 champagne flag), station points, label points and coin slots deep-equal the page's `HOLE.v` and `HOLE.h`. Check: D (unit test of `hole-geometry.ts` against a copy of the page tables).
- AC-HOLE-04. Each station: halo radius 10 + abs(team value) × 22, fill rgb(237 184 103/.17), stroke f-loss 1.5, core r 4.5 f-loss. Selected: fill /.34, stroke 2.6. Label 13pt 500 f-ink-2 (selected f-ink 600), value 19pt 600, −.02em, 21pt under the label. Check: D (attributes), S `putt-spot`, `tee-spot`, `sg-spot`.
- AC-HOLE-05. Coins: r 11 in the player's roster colour, initials 9.5pt 600 white, ring rgb(244 241 232/.55) 1.5; each player at the station where they lose most; at most three per station in the drawn slots, then a "+N" coin in the third slot. Check: D (fixture `long` puts five at one station), S.
- AC-HOLE-06. Hollow coin for a player with fewer than 5 rounds on file (04 section 8 H): feature-green fill, dashed stroke 3/2.4, initials f-ink. Check: D, S `early`.
- AC-HOLE-07. Station chip row: five equal columns, gap 3, padding 3, radius 12, fill rgb(244 241 232/.07); each chip radius 9, padding 8 4, label 13/1.15 500 f-ink-2, value 14/1.2 600 f-loss tabular. The Course chip sits after a 1pt hairline rgb(244 241 232/.16) inset 10pt top and bottom; its value is the read count ("5 reads", "1 read", "No reads") in f-ink 500. Check: D, S.
- AC-HOLE-08. Pressed chip: fill rgb(244 241 232/.10), 1pt inset ring rgb(244 241 232/.18), text f-ink. Check: D (computed style), S.
- AC-HOLE-09. Each chip's hit area is at least 44pt tall and as wide as its column. Check: D.
- AC-HOLE-10. Desktop: the chip row is min(500pt, 64%) wide, bottom aligned beside the kicker and figure; the footer adds "Tap a spot" at the right. Check: S `1440`.
- AC-HOLE-11. Footer "Players stand where they lose most. Hollow: fewer than 5 rounds." 13/1.35 f-ink-2. Check: S.
- AC-HOLE-12. With Course selected: no station has `aria-pressed="true"`, all four stations sit at opacity .38 and coins at .5, the hole stays drawn. Check: D, S `course-spot`.
- AC-HOLE-13. Default selection on open is the team's biggest loss (Approach in the fixture); `?station=` overrides it. Check: D.

Accessibility
- AC-HOLE-14. The SVG has `role="img"` and an `aria-label` naming all four figures. Each station is `role="button"`, `tabIndex=0`, works with Enter and Space, has `aria-pressed`, and its label states the area, the figure and "a round". The chip row is `role="group"` labelled "Spots on the hole, and Course"; the Course chip's label is "Course and scoring, {n} open reads". Check: D.

States
| State | Capture | Criterion |
|---|---|---|
| spot selected | `putt-spot`, `tee-spot`, `sg-spot`, `spot` | AC-HOLE-15. That station's halo selected and its chip pressed; one at a time. |
| Course | `course-spot`, `course-dark-1440` | AC-HOLE-12. |
| loading | `loading` | AC-HOLE-16. Green skeleton: kicker bar 54% × 14, figure bar 38% × 40, hole block 100% × 300 (desktop 250), radius 14. |
| empty | `empty`, `1440-empty` | AC-HOLE-17. "No rounds yet" in the figure's place (40pt), the line "The hole fills in after the team’s first round this season. Each spot then shows what it costs the team against Tour." (15/1.45 f-ink-2, max 34ch), the hole drawn bare at opacity .55: no stations, no coins, no chip row, no footer. |
| early | `early` | AC-HOLE-06 for every coin. |
| long | `long-spot` | AC-HOLE-18. Coins still show initials; "+N" when more than three stand at one station. |
| failed | `failed` | AC-HOLE-19. Unchanged from default. |
| XXL | `top-xxl` | AC-HOLE-20. Chip labels and values wrap inside their chip, never overflow; the SVG scales with the card. |
| dark | dark | AC-HOLE-21. Feature `#123D29`; inks unchanged. |
| Reduce Motion | `reduce` | AC-HOLE-22. No ball, no line draw, no pulse. |
| 430, desktop | `top-lg`, `1280`, `1440`, `1728` | AC-HOLE-10. Desktop uses the horizontal hole. |

Contrast (light / dark, measured from the page tokens)
- AC-HOLE-23. f-ink on feature 11.30 / 10.78; f-ink-2 on feature 8.84 / 8.44; f-loss on feature 7.08 / 6.75; f-gain on feature 7.33 / 6.99.
- AC-HOLE-24. Chip row: f-ink-2 on the .07 row 7.31 / 6.96; f-loss on the .07 row 5.85 / 5.57; f-loss on the pressed chip (.10 fill over the feature) 5.37 / 5.12, and f-ink on it 8.57 / 8.17. The old .15 fill (4.4:1) must not come back. Check: contrast script.
- AC-HOLE-25. Non-text: halo stroke f-loss on feature 7.08; coin initials white on the five fixture colours 5.77 to 6.68.

Data
- AC-HOLE-26. Each station figure is the mean of the current roster's legs (03 section 1), never the stored `team_avg`; the hero total is the mean of stored per-round totals, never the sum of the legs (04 section 8 K, O). Window and sample are named: "This season · {n} rounds" for countable rounds since Aug 1, or "All time" when the held season table is not used (8 K). The baseline is named when it isn't the Tour (8 O). Check: D (loader test).
- AC-HOLE-27. A station with no team figure draws without a halo and reads "Not measured" (02 section 5.2). Check: D.

Motion: M-TEAM-01 to 07, 11, 16.

### S-TEAM.today

- AC-TODAY-01. Card header "This week" 17/600, meta "{rounds} rounds · {new} new reads · {cleared} cleared" 15 ink-2, from the brief's counts (03 section 6). Check: D, S `top`.
- AC-TODAY-02. Tiles scroll sideways with snap to start, gap 10, padding 2 16 16. Tile 138pt × k wide, at least 162 tall, radius 15, well fill, 1pt ring; a tile not yet opened this session has a 2pt accent inset ring. Inside: 44pt picture, headline 14.5/1.25 600, foot 24pt coin and "{first} · {when}" 12.5 ink-2. Check: D, S.
- AC-TODAY-03. At most three tiles, newest first, from brief read rows, focus progress (`ChBriefWorking`) and Improving or Slipping themes only; "No clear change" never makes a tile. Check: D.
- AC-TODAY-04. The round story (18-hole strip) appears only for a brief read whose player's newest round is inside the week (04 section 8 T). Check: D.
- AC-TODAY-05. Desktop: tiles stack in one column as rows: the text, then the picture (96 × 36) closing the row. A tile with no picture is the same row without it, so every row's text starts on one line (W10, owner's preview walk, 11 Nov 2026). Check: S `1440`, `crowded`.
- AC-TODAY-06. Opening a tile clears its ring for the session (`useChSessionState`, never the address). Check: D, C `story` (M-TEAM-34).

| State | Capture | Criterion |
|---|---|---|
| failed | `failed` | AC-TODAY-07. Notice in the card: loss-tint 34pt icon, "Couldn’t load what’s new" 15/600, "The weekly brief didn’t load. Everything below is current." 14 ink-2, small ghost "Try again". Never "nothing new". |
| brief flag off | add fixture `piecesoff` | AC-TODAY-08. The card is absent, not empty. |
| early | `early` | AC-TODAY-09. One tile. |
| empty | `empty` | AC-TODAY-10. Card absent. |
| loading | `loading` | AC-TODAY-11. 120pt skeleton card. |
| long, XXL | `long-spot`, `top-xxl` | AC-TODAY-12. Headlines wrap inside the tile; the tile grows taller, never clips. |
| dark, Reduce Motion, 430, desktop | as common | Common rules. |

Contrast: ink on well 15.66 / 15.20; ink-2 on well 8.96 / 10.87; accent ring on well (non-text) 7.48 / 8.96.

Motion: M-TEAM-34, M-TEAM-38.

### S-TEAM.spot

Layout
- AC-SPOT-01. Header: area name 17/600; meta "{team value} a round · {rank}" 15 ink-2, rank words "biggest leak", "second biggest", "third", "smallest" from the four spots; one decimal. Check: D, S `spot`.
- AC-SPOT-02. One bar row per roster player with a figure, worst first. Columns 92pt × k / 1fr / 52pt, gap 10, row min height 30, rows 9pt apart (12 on desktop). Name cell: 24pt coin and first name 14.5/1.2 500. Value 14.5/600 tabular, loss or gain colour. Check: D, S.
- AC-SPOT-03. Track 14 tall, radius 7, `--track`. Zero line 1.5 wide at 84% across, 4pt above and below the track, `--zero`. A loss of 1.30 fills the whole 84% to the left; a gain of 0.25 fills the 16% to the right; clamped beyond. Check: D (fill scale for the fixture values), S.
- AC-SPOT-04. The fill is one element per side scaled with `transform: scaleX()` from the zero line; no width, left or right is ever set or transitioned (04 section 8 Q). Check: D (CSS text test plus computed style).
- AC-SPOT-05. Team average: a 1.5pt dashed ink-3 line 3pt above and below the track, at the team mean on the same scale. Early players' fills use the 45° stripe (4pt loss fill, 3pt loss fill mixed 45% with the card), never a tint. Check: D (`data-early`), S `early-spot`.
- AC-SPOT-06. Axis line under the bars: "Team average dashed" at the left of the track, "Tour" at the zero line, 12.5 ink-3. Check: S.
- AC-SPOT-07. Subhead "What CoachHelm sees here · {n} open reads" 13.5/600 ink-2, then read rows: 30pt coin, "{first}: {title}" 15.5/1.3 500, evidence line 13/1.2 ink-2 with the size chip, the sample and the sureness chip; chevron ink-3; row padding 12 16; separators inset 56pt. Check: D, S.
- AC-SPOT-08. Shared pattern (when a row exists): well block radius 14, margin 4 16 16, padding 12 14; overlapping 24pt coins (−6pt overlap, 2pt well ring), title 15/600, line 13.5 ink-2. With patterns on and no row: "No shared pattern here yet. CoachHelm needs three players with the same step before it calls one." With `coachhelm_team_pattern_v1` off: nothing. Check: D (three states), S `spot`, `putt-spot`.
- AC-SPOT-09. "Add to practice" is absent until the practice lane exports `practicePlanHref`; never a dead button (04 section 8 V). Check: D.
- AC-SPOT-10. Desktop: bars and reads side by side in two equal columns with a hairline on top and between; the axis indents to the track; the pattern or its line pins to the bottom of the reads column. Check: S `1440-putt`.

Data
- AC-SPOT-11. Reads at a spot are that spot's findings only, in CoachHelm's feed order, never re-ranked by strokes or by size; strengths never listed (04 section 8 M). The page sorts by size; the build doesn't. Check: D.
- AC-SPOT-12. The size chip ("0.6 a round", one decimal) shows only when `strokesAtStake` gives an estimate; no "0.0" chip (03 section 5). Check: D.
- AC-SPOT-13. The sample is the read's own (`evidence.rounds_n` when present, else `evidence.sample`, 03 section 5), never the player's season rounds. Sureness is exactly "Solid read", "Early read" or "Thin read" (8 R). Check: D.
- AC-SPOT-14. Up to 3 needs-work and 1 working read per player in total across the board, from one `getTopInsightsForPlayers` call with `limit: 4` (8 I). Check: D (loader test).

States
| State | Capture | Criterion |
|---|---|---|
| no reads at the spot | add fixture | AC-SPOT-15. "No open reads here yet. CoachHelm reads a spot once a player has enough rounds to stand behind it." |
| early | `early-spot` | AC-SPOT-16. Every fill striped; only reads that clear the bar, each with its own sureness word; the "needs three players" line. |
| long | `long-spot` | AC-SPOT-17. Bar names stay on one line with an ellipsis inside 92 × k; read titles wrap and never run under the chevron. |
| loading, empty | `loading`, `empty` | AC-SPOT-18. Skeleton card of 5 rows; absent when empty. |
| failed | `failed` | AC-SPOT-19. As default. |
| XXL | `spot-xxl` | AC-SPOT-20. The name column grows with k (92 × 1.35); bars keep their scale; rows grow. |
| dark, Reduce Motion, 430, desktop | as common | Common rules; desktop AC-SPOT-10. |

Contrast (light / dark)
- AC-SPOT-21. ink on card 17.08 / 14.34; ink-2 on card 9.77 / 10.25; ink-3 on card 6.61 / 6.99; loss on card 5.57 / 8.53; gain on card 7.42 / 8.45.
- AC-SPOT-22. Size chip: `--loss-on-tint` (#8A4D00 / #E7AE57) on the loss tint over the card 5.69 / 6.46, over the page colour (sheets) 5.07 / 7.44. Plain `--loss` on that tint is 4.78 / 4.26 light and is not used for chip text. Sureness "Solid read" chip: gain on accent tint over card 6.33 / 6.39.
- AC-SPOT-23. Non-text: loss fill on track 3.15 / 5.52; gain fill on track 5.15 / 4.50; zero line on track 5.31 / 5.42.

Motion: M-TEAM-05 to 10, M-TEAM-16, M-TEAM-38.

### S-TEAM.course

Layout
- AC-COURSE-01. The Course card takes the spot card's place when Course is selected; the hole above stays. Header "Course and scoring", meta "Not on the hole · {n} open reads" or "Not on the hole · No open reads yet". Check: S `course-spot`.
- AC-COURSE-02. History: team to par this season 32pt × k 600, wdth 92, −.035em, tabular ("+6.4", "E" at zero), beside "a round to par" / "This season · {n} rounds" 13/1.3 ink-2; right, a chip "Last 4 weeks {value}": accent tint and gain text when below the season figure, loss tint and `--loss-on-tint` when above, neutral when level; "Early season" when fewer than 6 weeks have rounds. Check: D (three tones), S.
- AC-COURSE-03. Trend: viewBox 320×118, margins left 6, right 40, top 14, bottom 24; y from (min − .35) to (max + .35) with the lowest score at the top; line 2.2 accent, round joins and caps; dots r 3.1, card fill, 2pt accent ring; the latest r 4.6 accent fill with its value 10pt above (12.5/600 ink); season line 1.2 ink-3 dashed 3/4 with its value at x 292 (11/600 ink-2); a hairline at y 100 in `--sep`; month names 11/500 ink-3 under the first week of each month, the first start-anchored. Check: D (point coordinates for the fixture), S.
- AC-COURSE-04. Key: "Team, week by week" (14pt 2.2 accent swatch), "Season" (14pt 1.4 dashed ink-3), "Higher is better", 12.5 ink-3. Check: S.
- AC-COURSE-05. Courses: subhead "Courses this season · {n}"; most rounds first; at most 4, then "Show all {n} courses". Row: name 15/1.25 500; "{n} rounds · last {date}" plus " · 1 read" when a read is about that course, 12.5 ink-2; right, to par 15/600 tabular and "0.5 under season" (gain) or "1.1 over season" (loss) or "Level with season" (ink-2), 12.5/500; chevron. Check: D, S.
- AC-COURSE-06. Reads: same row as a spot read; at most 3, then "Show {n} more". Empty: "No course or scoring reads yet. Penalties, big numbers, par scoring and the first hole get read once a player has enough rounds to stand behind it." Check: D, S.
- AC-COURSE-07. Team against Tour: subhead "Team against Tour · this season" (early: "from {n} rounds"); a 3×2 grid with 1pt `--sep` gaps; cells padding 11 14 13; label 12.5/500 ink-2, value 19/1.15 600 tabular, line 12 ink-3 "{unit} · Tour {value}". Par 3s, 4s, 5s to two decimals a hole; penalty strokes one decimal a round; double or worse as % of holes one decimal; first hole two decimals against the average hole. A metric with no rows reads "Not measured yet". Check: D, S.
- AC-COURSE-08. "Show more" buttons are accent text 14/600, at least 44pt tall hit area (the drawn button is 36pt; pad the hit area). Check: D.
- AC-COURSE-09. Phone order: header, history, reads, Team against Tour, courses. Desktop: left column history then courses; right column reads then Team against Tour pinned to the bottom; both columns end level. Check: D, S `course-dark-1440`.

Data
- AC-COURSE-10. Season, weekly points, last 4 weeks and courses come from the season's countable rounds the board already reads, with `course_id`, `course_name`, `score_to_par` added to that select; round-weighted; a week's point is the mean of that week's rounds; last 4 weeks is the last 28 days, null under 6 weeks; courses group by `course_id`, else `course_name` (04 section 8 X, 03 section 10). No new query, no new column. Check: D (`course-shape.test.ts`: season +6.4, last 4 weeks +6.0, Oak Hollow 33 rounds +5.9, Hilltop 15 rounds +7.5; early fixture `last4: null`).
- AC-COURSE-11. Team against Tour is the mean of each roster player's standing row against `pga_value`, from the standing batch already loaded; never `team_avg` (8 X). Check: D.
- AC-COURSE-12. Course reads are the drawn reads with no station, as `deliverReads` returns them after folding, in feed order; a read keeps its own window, never "This season" (8 Y). They also stay in each player's sheet (8 U). Check: D.
- AC-COURSE-13. `COURSE_TAB = false` hides the Course chip and card; the reads stay in player sheets. Check: D.

States
| State | Capture | Criterion |
|---|---|---|
| default | `course-spot` | As above. |
| all | `course-all-spot` | S-TEAM.course.all. |
| early | `course-early-spot` | AC-COURSE-14. "Early season" chip, three weekly points, three courses, the empty reads line, "from {n} rounds". |
| empty | `empty` | AC-COURSE-15. Not reachable: the empty hero has no chip row. |
| failed part | not drawn | AC-COURSE-16. Build rule: if the rounds read or the standing batch fails, that block shows the board's part-failed notice with Try again (02 section 4.5); never a zero or a flat line. |
| long | add `course-long-spot` | AC-COURSE-17. Long course names wrap to two lines; figures never move under the chevron. |
| XXL | add `course-spot-xxl` | AC-COURSE-18. Grid cells grow; the history figure and chip wrap below, never overlap. |
| dark, Reduce Motion, 430, desktop | as common | Common rules. |

Contrast: ink-3 on card 6.61 / 6.99; accent (Show more) on card 8.15 / 8.45; chip text as AC-SPOT-22; non-text accent line and dots on card at least 3:1 (8.15 / 8.45).

Motion: M-TEAM-11 to 17.

### S-TEAM.course.all

- AC-COURSEALL-01. Every course read and every course is listed; both buttons read "Show fewer" with `aria-expanded="true"`. Check: D, S `course-all-spot`.
- AC-COURSEALL-02. Desktop at 1728: both columns still end level. Check: S `course-all-1728`.
- AC-COURSEALL-03. Expanding or collapsing doesn't redraw the trend (M-TEAM-17). Check: C `more`.

### S-TEAM.course-sheet

- AC-CSHEET-01. Phone: `ui/Modal` bottom sheet, max 86% tall, grabber 36×5 in `--track` 8pt from the top, top radius 20, page colour (04 section 8 C); content padding 8 edge 40, 14pt between blocks. Desktop: in S-TEAM.inspector. Check: S `crs`, add `1440-crs`.
- AC-CSHEET-02. Header: 30pt round mark on accent tint with the flag glyph, course name 16/600, "{n} rounds this season · last {date}" 13.5 ink-2, 34pt close. Check: S.
- AC-CSHEET-03. Number 32pt 600 ("+7.5") and "a round to par here" / "1.1 over the team’s season of +6.4" (or "Level with the team’s season"). Check: S.
- AC-CSHEET-04. "Players here" card, meta "Against their own season": one row per player who played here, best first; columns coin / name / dumbbell / value, gap 10, padding 10 16; first name 14.5/500 and "{n} rounds here" 12.5 ink-2; dumbbell 14 tall: season as a hollow 10pt dot (2pt ink-3 ring, card fill), here as a filled ink dot, joined by a 2pt line in loss fill when worse here, gain fill when better; value 14.5/600 and "1.6 over" / "0.4 under" / "Level" 12/500. Key "Here", "Their season". Check: D, S.
- AC-CSHEET-05. "Reads about {course}" card only when a read names this course; "Read the story from {when}" link only when a This week story came from a round here. Check: D.
- AC-CSHEET-06. Footnote 13.5 ink-2 states exactly which rounds count; it says "practice" only if `isCountableRound` counts practice rounds (03 section 10). Check: D.
- AC-CSHEET-07. Tapping a player row opens that player's sheet in place (M-TEAM-23). Check: D.

States: long (names wrap to two lines), XXL (rows grow; dumbbell keeps 64pt minimum), dark, Reduce Motion, 430, desktop as common rules; loading, empty and failed n/a (opened from loaded data).

Motion: M-TEAM-18 to 21, 23, 24, 25.

### S-TEAM.read-sheet

Layout
- AC-READ-01. Container as AC-CSHEET-01. Header: 30pt coin, full name 16/600, "{area} · {n} rounds this season" 13.5 ink-2, 34pt close. Check: S `read`.
- AC-READ-02. Title 23/1.18 600 −.018em; lede 15.5/1.45 ink-2. Check: S.
- AC-READ-03. Chips: "Worth {size} a round" (loss tint, only with an estimate), the sureness word, "Cause: {word}" only when the cause field is present (never "Not traced" for a missing field, 03 section 5), and the read's own window ("All rounds" or "{n} days"). Check: D.
- AC-READ-04. Comparison card titled with the evidence label, meta "Higher is better" or "Lower is better" (`evidence.polarity`). Rows: label column 70pt × k, bar 12 tall radius 6 (player loss fill, Team neutral, Tour gain fill), value 14.5/600 tabular with its unit. Team row draws only when the read carries a team pool, `coachhelm_team_pool_v1` is on and the pool has 5 or more players; otherwise the row is left out with no line (fixed 4 Nov: was "Team: not measured for this read" (8 S); the shared read sheet follows the Read lane's ladder rule, S-READ.nopool, so the peek and the full read agree). Check: D, S.
- AC-READ-05. Drill card: 40pt icon tile (radius 12, accent tint), drill name 15.5/600, meta 14 ink-2. Check: S.
- AC-READ-06. Actions: Assign as focus, primary (accent fill, text #F6F1E3 light / #0E120F dark, min height 42, radius 12, 15/600), full width while "Ask about this" isn't drawn (8 V). Then "Open the full read" accent link 14.5/600 with a chevron. Check: D, S.

Roles and data
- AC-READ-07. Coach only. Claim words and the "Likely" cause stay coach only (03 "Visibility"). Check: D as player (absent).
- AC-READ-08. Assign as focus calls `createFocusAreaFromInsightV2` through `useFocusActions` with the exact arguments the old board's `FocusActions` sends; status `proposed`; no target value; the player accepts it in their app. No other write. Check: D (spy).
- AC-READ-09. Duplicate and failed writes show today's messages (preview `duplicate`, `failwrites`). Check: D, S.

Sub-IDs
- AC-READ-10 (S-TEAM.read-sheet.assigning). The button is disabled and shows an 18pt spinner (2pt ring, clear right quarter) and today's `FocusActions` in-flight label (fixed 4 Nov: not "Proposing") until the write answers. Check: C `assign` frame tap + 350.
- AC-READ-11 (S-TEAM.read-sheet.assigned). The actions become one tinted row (accent tint, gain text 14.5/600, min height 42, radius 12) with a drawn check (18pt, 2.2 stroke) and "Proposed to {first} · now in Working on". Reopening the read later shows the same row with no draw. Check: S `assigned-read`, C `assign`.
- AC-READ-12 (S-TEAM.read-sheet.gathering). With no drill, the card reads "Still gathering" and the read's wait from `roundsToGo` ("4 more rounds before CoachHelm suggests a drill"), clock icon. Check: S, add `sg-read`.
- AC-READ-13 (S-TEAM.read-sheet.no-tour). With no Tour figure the ladder has player and Team rows only, and the line "No Tour figure for single holes, so none is drawn." Check: S, add a shot that taps the worst holes read from `course-spot`.

States: long (title wraps, never clips; chips wrap), XXL (label column 70 × k, bars keep scale), dark, Reduce Motion, 430, desktop (AC-INSP) as common; loading, empty, failed n/a.

Contrast: ink-2 on page colour 8.64 / 11.45; primary button text 7.29 / 9.44; assigned row gain on accent tint over page colour 5.63 / 7.35; size chip over page colour 5.07 / 7.44; accent link on page colour 7.21 / 9.44.

Motion: M-TEAM-18 to 23, 26, 27, 38.

### S-TEAM.player-sheet

- AC-PLAYER-01. Header: coin, full name, "{year} · {n} rounds · {total} a round to Tour" plus " · early" for early players. Check: S `player`.
- AC-PLAYER-02. Card "Where {first} gains and loses", meta "This season": four bar rows with short area names (Tee, Approach, Short game, Putting), the spot card's scale, zero line and team tick; no animation. Axis line under it. Check: D, S.
- AC-PLAYER-03. Card "Open reads", meta the count: needs work then working, rows without the name prefix; course reads included; "No open reads." when none. Check: D.
- AC-PLAYER-04. Link "Open {first}’s page": `coachPlayerHref('deep-dive', id)` until lane 2 exports `playerFileHref`. Check: D.
- AC-PLAYER-05. The sheet shows only this player's own figures and the team average tick; it is coach only (R4). Check: D as player (absent).
- AC-PLAYER-06 (S-TEAM.player-sheet.no-rounds). Header "{year} · no rounds yet this season"; a card with the loss-tint warning icon, "Nothing to show yet" 15/600 and "{first}’s four-area figures show after their first round this season." 14 ink-2; the page link. Check: S `empty-player`.

States: long, XXL, dark, Reduce Motion, 430, desktop (`1440-player`) as common.

Motion: M-TEAM-18 to 21, 23, 24, 25.

### S-TEAM.story

- AC-STORY-01. Full screen over the board on `--feat`, padding 54 edge 34. Progress segments 3pt tall, 4pt apart, track rgb(244 241 232/.25), fill f-ink; earlier stories full, later empty. Check: S `story` (held at 45%).
- AC-STORY-02. Header: coin, first name 15/600, when 13 f-ink-2, 34pt close on rgb(244 241 232/.12). Check: S.
- AC-STORY-03. Body centred, 22pt gaps: headline 30/1.1 600 wdth 90 −.025em; the picture (18-hole strip: 9 columns, 5pt gaps, radius 8 squares; double or worse f-loss with #2B1A00 numbers, bogey rgb(237 184 103/.22), birdie rgb(143 211 170/.24); or before and after bars 16 tall with a 2pt target tick); body 16/1.45 f-ink-2; source line 13 f-ink-2. Check: S.
- AC-STORY-04. Footer: the story's action (f-ink fill, #0B3A25 text) and Next or Done (rgb(244 241 232/.12), f-ink), equal width. A tap on the body is Next. Check: D.
- AC-STORY-05. Each story lasts 5200ms then the next; the last closes. Press and hold pauses; keyboard focus inside pauses (WCAG 2.2.2). Under Reduce Motion it never advances by itself. Check: D (fake timers), C `story`, `story-hold`.
- AC-STORY-06. Close returns focus to the tile that opened it. Check: D.
- AC-STORY-07. The action opens the read sheet over the closing viewer, or closes and scrolls to Working on. Check: D, C.

Contrast: f-ink on feature 11.30 / 10.78; f-ink-2 8.84 / 8.44; f-ink on the .12 button 8.09 / 7.71; #0B3A25 on f-ink 11.30; #2B1A00 on f-loss 9.32; f-ink on bogey tint 7.24 / 6.92, on birdie tint 6.61 / 6.35; f-ink-2 on the .09 hole squares 6.91 / 6.58; progress fill on its track (non-text) 5.54 / 5.31.

States: long (headline wraps up to 4 lines, then the body scrolls), XXL, dark, Reduce Motion as common; desktop uses S-TEAM.story.desk.

Motion: M-TEAM-29 to 33, 40.

### S-TEAM.story.desk

- AC-STORYDESK-01. In the inspector: header coin, full name, when; a feature-green block (padding 18, radius 16) with headline 22/1.2 600, the picture, body 15 f-ink-2; source line 13.5; the action as a primary button when the story has one. No progress bars, no auto advance. Check: S `1440-story`.

Motion: M-TEAM-24, 25, 33.

### S-TEAM.huddle

- AC-HUDDLE-01. Card "The huddle", meta "Strokes to Tour a round". SVG 320×256, margins left 36, right 12, top 16, bottom 36; both axes −1.8 to +0.2, widened in steps of 0.5 so no coin is clipped. Check: D (no point outside the plot), S `huddle`.
- AC-HUDDLE-02. Tour lines at 0 in gain fill 1.5 with "Tour" 11/600 gain; team average lines dashed 4/4 ink-3; axes in `--sep`; quadrant words 11 ink-3 ("Scores well, strikes poorly", "Behind on both", "Strikes well, leaks scoring"); axis captions 11.5/500 ink-2 "Ball striking: tee and approach" and, rotated, "Scoring: short game and putting". Check: S.
- AC-HUDDLE-03. Dots r 13 in the roster colour, initials 10.5/600 white; early players hollow (card fill, dashed 3.5/2.5, stroke 2, initials ink). Each dot is a button to the player sheet; keyboard order follows the roster. Check: D.
- AC-HUDDLE-04. A player missing a leg isn't plotted, and the note names them ("Not plotted: Sam, no putting figure yet"). Check: D.
- AC-HUDDLE-05. Trails (2.5 at .55, ghost r 4 at .35) only for players with 20 or more rounds, from their first 10 countable rounds this season, with the parity test (8 D). The legend's Line item drops when no player has a trail. Legend 12.5 ink-2. Check: D, S.
- AC-HUDDLE-06. Desktop: the plot fills the card's extra height, centred. Check: S `1440`.

States: early (all hollow, no trails), empty (absent), loading (220pt skeleton card on desktop), long (dots keep initials), XXL (SVG scales; legend wraps), dark, Reduce Motion (drawn at rest) as common.

Contrast: ink-3 on card 6.61 / 6.99; ink-2 9.77 / 10.25; gain label 7.42 / 8.45; white initials on fixture colours 5.77 to 6.68.

Motion: M-TEAM-35 to 37.

### S-TEAM.roster

- AC-ROSTER-01. Card "Roster", meta "T · A · S · P" (desktop "Finger-print: tee, approach, short game, putting"). Every player, worst total first. Check: D, S `roster`.
- AC-ROSTER-02. Row: 30pt coin, full name 16/1.25 500, "{year} · {n} rounds" (+ " · early") 13.5 ink-2, finger-print, total 15/600 tabular (loss colour when negative, gain when positive) over "{n} open" 12.5 ink-2; padding 11 16; separators inset 58 (desktop 60). Check: S.
- AC-ROSTER-03. Finger-print 60×34 (desktop 78 wide with T A S P labels 8/500 ink-3): four 10pt bars around a zero line at y 9; 20pt = 1.1 strokes; loss down in loss fill, gain up in gain fill; radius 2.5. Check: D (bar heights for the fixture).
- AC-ROSTER-04. Desktop columns `auto minmax(0,1fr) 112px auto 64px`, gap 16, padding 12 18; a "Loses most: {area}" loss chip; a player with no rounds shows a "No rounds yet" chip and empty cells. Check: S `1440`.
- AC-ROSTER-05. Players with no reads yet and held-back players are rows too, with today's wording (02 section 10.2). Check: D.

States: long (names wrap to two lines, never ellipsis), early, empty (rows with "no rounds"), XXL, dark, 430, desktop as common.

Motion: M-TEAM-38.

### S-TEAM.working

- AC-WORK-01. Card "Working on", meta "{n} focus areas". Rows: "{first} · {title}" 15/1.3 500; progress line 13.5 ink-2; state 13.5 ink-2 at regular weight ("Active · 5 rounds in", "In progress · 3 rounds in", or the verdict word), never in green. A ring 38 (r 15, stroke 4, `--track` track; fill in gain fill at 50% and over, neutral fill under, round cap, from 12 o'clock) closes the row only when the focus has a target; a row without one has no ring. A focus two or more players share (the same title) is one row: the title, their first names ("Cole, Dylan and Jackson") and the state word when all of them share it, with no ring (W11, owner's preview walk, 11 Nov 2026). Check: S `work`, `crowded`.
- AC-WORK-02. Ring fill = (baseline − current) / (baseline − target), clamped 0 to 1 (03 section 8). Check: D.
- AC-WORK-03. A proposal made in this visit appears as a row with no ring (it has no target until the player sets one; W11), "From {now} now · {first} sets the target" and "Proposed · {first} accepts it in their app". The board sends no target. Check: S `assigned-read` then `work`, C `assign`.
- AC-WORK-04. No rows: "Nothing in progress yet. Assign a read as a focus and it shows here." With the brief flag off the card is absent. Check: D.

States: early and empty (the empty line), long (titles wrap), XXL, dark as common.

Motion: M-TEAM-28.

### S-TEAM.record

- AC-RECORD-01. Card "How often CoachHelm is right"; big figure "{held} of {checked}" 34/1 500 wdth 92 −.035em tabular, "reads held up when re-checked" 14 ink-2, from `ChTrackRecord.program`. Check: S `record`.
- AC-RECORD-02. Five rows from the real rungs (`RUNG_WORD`): Seen repeatedly, Observed, Likely, Working hypothesis, Not enough yet; label column 128pt × k; 10pt track, fill in gain fill (Working hypothesis neutral fill), a 2pt ink target mark 4pt above and below at the rung's target (8, 7, 6 in 10, none, under 5 in 10); "{h} of {n}" 13.5 ink-2 tabular; desktop adds " · target 80%", " · target under 50%" or " · no target yet" in ink-3. Check: D, S.
- AC-RECORD-03. A rung with fewer than 10 rechecked reads shows its counts and "Not enough yet", never a share or a bar. Check: D.
- AC-RECORD-04. Footer: "Line: the target for that level" 13.5 ink-2 and today's Re-check control (`Recheck.tsx`, `refreshTeamAnalysisAsCoach`) with its own words. Check: D.

| State | Capture | Criterion |
|---|---|---|
| failed | `failed-record`, `1440-failed` | AC-RECORD-05. "Track record unavailable right now" and "It shows again once the check runs. No number is shown in its place." No figure. |
| empty | `empty` (desktop) | AC-RECORD-06. "No reads to check yet" and "Reads are re-checked against new rounds once the team has some." |
| flag off | `piecesoff` | AC-RECORD-07. Card absent. |
| XXL, dark, desktop | as common | Common rules. |

Contrast: target mark ink on track 13.72 / 11.12; gain fill on track 5.15 / 4.50; neutral fill on track 4.49 / 4.86; notice icon (non-text) 4.78 / 6.46.

### S-TEAM.inspector

- AC-INSP-01. Desktop only: an `aside` 420 wide, top 58 (under the glass bar) to the bottom, right 0, page colour, shadow `-1px 0 0 var(--sep)` plus the large shadow; 20pt content edge, 18pt top padding; no scrim; the board behind stays usable. Check: D, S `1440-read`, `1440-player`, `1440-story`.
- AC-INSP-02. Hosts read, player, course and story content with the same components as the phone sheet. Check: D (same component tree).
- AC-INSP-03. Focus moves to its heading on open; Esc closes; focus returns to the opener (`chFocusQuietly`). Check: D.
- AC-INSP-04. Phone never renders the inspector; desktop never renders the bottom sheet for the same tap. Check: D.

Motion: M-TEAM-23 to 25.

### S-TEAM.empty-steps

- AC-STEPS-01. Card "What fills in, and when"; three numbered steps (26pt accent-tint circles, gain numerals 13/600), title 15/500, text 13.5 ink-2, separators between. Check: S `empty`.
- AC-STEPS-02. Words: "After the first round" / "The hole and each player’s four-area figures, against Tour."; "As rounds add up" / "Players are drawn hollow until they have 5 rounds on file. CoachHelm reads a spot once there are enough shots to stand behind it."; "When three players share a step" / "A shared pattern shows on that spot". The page's ", with Add to practice" is left off until the practice lane exports its link (8 V). Check: D.

### S-TEAM.toast

- AC-TOAST-01. Not built. The page's toast stands in for links into other lanes. In the app each one navigates (Open the full read, Open {first}'s page), runs today's control (Re-check, Try again) or is absent (Ask about this, Add to practice). No toast element exists in the board's DOM. Check: D.

## Per PR

| PR | Screen criteria | Tests it adds | Done when |
|---|---|---|---|
| CT0a | none on screen; AC-SPOT-14 groundwork | `coachhelm-actions-contracts.test.ts`: without `drawnLater` the exposure rows equal today's; with `drawnLater` resolving 2 of 4 ids exactly those 2 are recorded in order; a rejecting promise records nothing and the call still returns rows. Only `insight-delivery.ts` and that test change. | The three contract tests pass and no other caller changes. |
| CT0 | AC-TEAM-22, AC-HOLE-26, AC-SPOT-11 to 14, AC-COURSE-10 to 12, AC-WORK-02, AC-HUDDLE-05 (parity maths) | Flag entry with production, preview and development all false; `coachhelm-team.test.ts` (one call with `limit: 4`, `drawnLater` ids, gate off and failed shapes, per-part failure, flag-off parts absent, `toChTeamLegs` stored total and the 5-round hollow floor, `readsAt` feed order, `area` null for course reads, `loadCoachCoachHelm` still `{ limit: 1 }`); `course-shape.test.ts`. | `npm test`, `flags:check` and typecheck pass; no route calls the loader; flag off changes nothing. |
| CT1 | S-TEAM (AC-TEAM-01 to 23, motion excluded), S-TEAM.hole (AC-HOLE-01 to 27, motion excluded), S-TEAM.empty-steps | `coachhelm-team.test.tsx`: flag switches boards; `?player=` opens once; switch label; one feature card; no left border over 1px; station keyboard and labels; hollow coin; "+N"; `hole-geometry` deep-equals the page tables; `TEAM_BOARD_FIRST_VIEW` and `COURSE_TAB` flips; contrast script for the hole pairs. | `capture.mjs --id S-TEAM` and `--id S-TEAM.hole` pairs match within 2pt on the 06 redlines at 390, 430, 1280, 1440, 1728, light and dark, and the bar band diff is zero (SHARED-1). |
| CT2 | S-TEAM.spot (AC-SPOT-01 to 23), S-TEAM.course (AC-COURSE-01 to 18), S-TEAM.course.all | Spot: sort, team tick, `data-early`, feed order, no strengths, no "0.0" chip, three pattern states, scaleX CSS text test, practice button absent. Course: three chip tones, the 4 and 3 caps, Show more labels and `aria-expanded`, "Not measured yet" cell, phone and desktop order. | `--id S-TEAM.spot` and `--id S-TEAM.course` pairs match for every state in their tables. |
| CT3 | S-TEAM.read-sheet and its four sub-IDs, S-TEAM.player-sheet and `.no-rounds`, S-TEAM.course-sheet, S-TEAM.inspector, S-TEAM.toast | Phone opens `Modal`, desktop `Inspector`; Assign spy args; duplicate and failwrites messages; Esc and focus return; Team row line; Ask and practice absent; claim words absent as player; no toast element. | `--id S-TEAM.read-sheet`, `S-TEAM.player-sheet`, `S-TEAM.course-sheet`, `S-TEAM.inspector` pairs match, and the duplicate and failwrites states show today's messages. |
| CT4 | S-TEAM.today, S-TEAM.story, S-TEAM.story.desk | Tile sources; "No clear change" excluded; round story rule; viewer advances at 5200ms with fake timers, pauses on hold and focus, doesn't advance under reduce; ring clears once seen; failed and flag-off card. | `--id S-TEAM.today`, `S-TEAM.story`, `S-TEAM.story.desk` pairs match. |
| CT5 | S-TEAM.huddle | No point outside the plot; range widening; not-plotted note; keyboard order; Line legend item drops; trail parity test (if trails ship). | `--id S-TEAM.huddle` pairs match and no coin is clipped. |
| CT6 | S-TEAM.roster, S-TEAM.working, S-TEAM.record | Sort order; finger-print signs; ring maths clamps; proposed row after Assign; rung words from `RUNG_WORD`; under-10 rule; failed, empty and flag-off record; Re-check is today's control. | `--id S-TEAM.roster`, `S-TEAM.working`, `S-TEAM.record` pairs match. |
| CT7 | Every row in `07-MOTION.md` (M-TEAM-01 to 40; M-TEAM-41 not built); the Motion line under each screen above | `e2e/clubhouse-quality.spec.ts`, `test.describe('CoachHelm team board')`: under `reducedMotion: 'reduce'` and `[data-motion='off']` no animation lasts longer than 180ms and nothing translates, scales or rotates; the ball never runs; the story doesn't advance; with motion on the ball runs once a session; the huddle plays once; the trend line doesn't redraw on Show more; no animation on a data refresh (SHARED-6). | `capture.mjs --motion <M-ID>` for every row: the app clip matches the design clip's duration, curve and what moves at each Check frame within 1 frame, with and without Reduce Motion (Reduce Motion compares against 07's column where 07 lists a difference from the page). |

## Side by side

Screens. For each screen ID and each state in its table:

```
node capture/capture.mjs --id <screen ID> --state <capture state>
```

It draws the design page and the app preview (`/clubhouse-preview/coachhelm-team` with the matching `?state=`, `&station=`, `&open=`) at the same width, theme and Text Size, and writes `screenshots/<ID>__<state>__{design,app}__{light,dark}.png` plus the side by side pair. `--id 'S-TEAM*'` runs every screen. Put the pairs in the PR and check the screen's 06 redline numbers on both images. A screen passes when every redline number is within 2pt and nothing else differs.

Widths: both sides draw at 390 × 844 and 430 × 932 on phone (BUILD_CONTRACT_STANDARD), so the 16pt and 20pt edges and every redline number compare directly.

Shots this file needs that `capture.mjs` doesn't have yet: `sg-read` (S-TEAM.read-sheet.gathering), the worst holes read from `course-spot` (S-TEAM.read-sheet.no-tour), `1440-crs` (S-TEAM.course-sheet on desktop), `course-long-spot`, `course-spot-xxl`, and the app fixtures `partial` and `piecesoff`. S-TEAM.today, S-TEAM.empty-steps and S-TEAM.story.desk are proved by the `top`, `empty` and `1440-story` shots; S-TEAM.read-sheet.assigning by the `assign` clip; S-TEAM.toast by its DOM test.

Motion. For each row in `07-MOTION.md`:

```
node capture/capture.mjs --motion <M-ID>
```

It records the design page (its Play button) and the app (the same taps) with Playwright `recordVideo` at 390 wide (inspector rows at 1440), once with motion and once with `reducedMotion: 'reduce'`, and writes `screenshots/<M-ID>__{design,app}[__reduce].webm`. Put both clips in the PR and compare duration, curve and what moves at the row's Check frames. The M-ID to clip map is in 07 ("M-ID to clip").

A PR is done only when every screen it lists matches within 2pt on the redline numbers, every motion row it lists matches, and SHARED-1 to SHARED-12 pass.

## Completeness pass, 4 Nov 2026

One pass or fail criterion for every state added in 05's Completeness pass section, and for the shared read sheet. Check letters as above: S screenshot, D DOM, C clip. The PR each one belongs to is in brackets.

- CP-TEAM-1 (S-TEAM.noplayers) [CT1]. With no players on the roster the board shows the context line "No players yet" and one empty card with "Go to Roster"; no hole, spot, huddle, Working on or record is in the DOM. Check: D, S.
- CP-TEAM-2 (S-TEAM.off) [CT1]. With `coachhelm_team_board_v1` off, CoachHelm renders today's board byte for byte (no segmented control), and `?player=` and `?open=` do nothing. Check: D.
- CP-TEAM-3 (S-TEAM.player) [CT1]. Signed in as a player, a Team URL lands on the player's own CoachHelm with the query dropped by replace, and no request loads another player's figures (network log). Check: D.
- CP-TEAM-4 (S-TEAM at 821 to 1179) [CT1]. At 1024 × 768 the board is one column, max 720, in phone card order, with no horizontal scroll; at 1180 it is the two-column grid. Check: S at 1024 and 1180.
- CP-TEAM-5 (S-TEAM.hole at 821 to 1179) [CT1]. The hole is horizontal when the card's inner width is 610 or more, vertical below; no station label clips at k 1.36. Check: S.
- CP-TEAM-6 (S-TEAM.inspector at 821 to 1179) [CT3]. The 420 inspector overlays the column from the right with no scrim; Esc closes it and focus returns to the opener. Check: D, C.
- CP-TEAM-7 (deep link player) [CT1]. `?player={id}` opens that player's sheet once after first paint; the param is gone from the URL; Back closes the sheet and leaves the board. A bad or removed id gives the plain board with no error. Check: D.
- CP-TEAM-8 (deep link read) [CT3]. `?open=read&insight={id}` opens the read sheet; a removed read or one not on this team opens the gone card with CH-13861 wording and loads no figures. Check: D.
- CP-TEAM-9 (notification) [CT1]. Opening the insight notification lands on Team at the hole, no sheet open. Check: D.
- CP-TEAM-10 (cold start, refresh) [CT7]. The fly-in plays once a session; pull to refresh and Try again never replay it or the huddle. Check: C.
- CP-TEAM-11 (scroll restore) [CT3]. From a read sheet, "Open the full read", then Back: the board is at the same scroll and station with the sheet closed. Check: D.
- CP-TEAM-12 (removed player) [CT3]. With a player removed while their sheet is open, Assign fails with today's not-on-team toast (CH-13311) and the sheet stays open. Check: D.
- CP-TEAM-13 (two devices) [CT3]. A read assigned on another device shows the Assigned row on next open and no second write is sent. Check: D.
- CP-TEAM-14 (double submit) [CT3]. Two quick taps on Assign send one write and fire one success feedback. Check: D.
- CP-TEAM-15 (1 Aug rollover) [CT0]. With the clock at 1 Aug and no new-season rounds, the board is `empty`; huddle trails and Course weeks are empty. Check: D with a fixed clock.
- CP-TEAM-16 (dates) [CT2]. A round dated 2026-10-31 shows as 31 Oct in every timezone the test runs (UTC−10 and UTC+13). Check: D.
- CP-TEAM-17 (keyboard) [CT1]. Every row, chip, station and button takes focus in card order with a visible ring; Esc closes the top sheet. Check: D.
- CP-TEAM-18 (shared sheet, content) [CT3]. The read sheet matches the shared read sheet table in 06 Completeness pass: grouped ground, section cards, close 34, head order, chip row, ladder at rest, links, footer 44. The same fixture read in the Lenses sheet gives the same DOM order. Check: D, S.
- CP-TEAM-19 (shared sheet, Team row) [CT3]. The Team row draws only with a team pool, `coachhelm_team_pool_v1` on and 5 or more in the pool; else it is absent with no placeholder line. Check: D.
- CP-TEAM-20 (shared sheet, links) [CT3]. "Open the full read" goes to `readHref` with `coachhelm_read_v1` on and to `coachReadHref` with it off. Ask and Add to practice are absent from the DOM until their hrefs exist. Check: D.
- CP-TEAM-21 (read-sheet.stale) [CT3]. A stale read shows "Out of date" first in the chips and no Assign. Check: D.
- CP-TEAM-22 (read-sheet.partfail) [CT3]. With the strip's query failing, that card reads "Couldn't load this part" with Try again, and the rest draws. Try again reloads only that part. Check: D.
- CP-TEAM-23 (read-sheet.gone) [CT3]. As CP-TEAM-8, with a Close button that returns focus to the opener. Check: D.
- CP-TEAM-24 (motion parity) [CT7]. The read sheet's open, close, drag and scrim clips match the Lenses sheet's (M-LNS-07 to 09) frame for frame: 462 smooth spring travel 100%, scrim 260, close on the same spring; Reduce Motion is the 180 fade. Check: C.
- CP-TEAM-25 (new motion rows) [CT7]. M-TEAM-42 to 52 hold: the five at-rest IDs never animate their contents; deep links open after first paint. Check: C.
- CP-TEAM-26 (screen reader) [CT3]. The sheet is `role="dialog"` with `aria-labelledby` on its title; VoiceOver reads close, head, chips, title, lede, cards, links, footer in that order. Check: D.
- CP-TEAM-27 (toast) [CT3]. No page toast ships: tapping a cross-lane link navigates; only `useFocusActions` raises toasts. Check: D.


## Wiring, 4 Nov 2026

Pass or fail checks for the wiring in 06's section of the same name, checked against helmv3 `main` 03d9087. Each names the screen IDs it covers and its PR in brackets (CT0a is PR 0a). Shot tracking: nothing in this lane changes what shot tracking collects, stores or sends; W-TEAM-18 proves it.

1. W-TEAM-1 (S-TEAM, S-TEAM.off) [CT1]. With `coachhelm_team_board_v1` off, `CoachHelmView` renders today's `CoachBoard` from line 61 byte for byte and `loadCoachTeamBoard` is never called (spy). With it on, `loadCoachCoachHelm` is not called.
2. W-TEAM-2 (S-TEAM.player) [CT1]. A player session with a Team URL never reaches `CoachHelmView`; the network log shows no request for any other player's rounds or reads.
3. W-TEAM-3 (S-TEAM) [CT0]. One board load calls `getTopInsightsForPlayers` once, with the resolved roster's ids only (never an id from the address) and `limit: 4`; `loadCoachCoachHelm` still passes `{ limit: 1 }`.
4. W-TEAM-4 (S-TEAM, S-TEAM.spot) [CT0a]. With `drawnLater`, the `roster_card` exposure rows equal exactly the reads the board draws (at most 3 needs work and 1 working a player), in order; without it, today's rows; a rejecting `drawnLater` records nothing and the rows still answer.
5. W-TEAM-5 (S-TEAM.hole, S-TEAM.spot, S-TEAM.huddle, S-TEAM.roster) [CT0]. Each player's leg figures equal Team Stats' figures for the same player and season (one `loadSeasonRounds` read); a leg under 3 rounds is null with its reason; the headline total is the stored total's mean, not the leg sum.
6. W-TEAM-6 (S-TEAM.spot) [CT2]. With `coachhelm_team_pattern_v1` on and the patterns read failing, the spot card shows "Couldn't load this part", never "No shared pattern here yet"; with it off, nothing is drawn; with it on and no row, the "needs three players" line.
7. W-TEAM-7 (S-TEAM.read-sheet, .assigning, .assigned) [CT3]. Assign in the sheet calls `writes.assign` with the exact `ChFocusTarget` that `FocusActions` sends on the old board for the same read (spy); the row reads "Proposed to {first}" only after success; failure shows toast CH-13001 and the sheet stays open with Assign back.
8. W-TEAM-8 (S-TEAM.read-sheet) [CT3]. A duplicate (`ACTIVE_FOCUS_DUPLICATE_ERROR`, or a read already `proposed` or `active` from another device) shows as Assigned and sends no second write; two quick taps send one request.
9. W-TEAM-9 (S-TEAM.read-sheet, S-TEAM.working) [CT6]. After Assign, Working on shows "Proposed · {first} accepts it in their app" in this visit (`fa.assigned`) and after a reload (from `ChInsight.assigned === 'proposed'`, since the brief's `readFocus` skips proposed rows).
10. W-TEAM-10 (S-TEAM.read-sheet) [CT3]. After Assign the player gets one `dev_plan_assigned` bell row and, only with `email_task_reminders` on, one email; no push. Opening sheets, stations or stories sends no notification.
11. W-TEAM-11 (S-TEAM.read-sheet) [CT3]. The Team row in the comparison draws only when the read carries a team pool line, `coachhelm_team_pool_v1` is on and the pool has 5 or more players; otherwise "Team: not measured for this read". No teammate's own figure appears anywhere in the sheet.
12. W-TEAM-12 (S-TEAM.read-sheet) [CT3]. "Open the full read" links `readHref(playerId, id, readOn)`: today's `coachReadHref` address with `coachhelm_read_v1` off, `?view=read&player=…&insight=…` with it on. "Ask about this" and "Add to practice" are absent from the DOM while their lanes export no href. Team offers no Dismiss.
13. W-TEAM-13 (S-TEAM.player-sheet) [CT3]. "Open {first}'s page" links `playerFileHref(id, undefined, fileOn)`: today's `coachPlayerHref('deep-dive', id)` with `coachhelm_player_file_v1` off, the Lenses file with it on.
14. W-TEAM-14 (S-TEAM, S-TEAM.read-sheet.gone) [CT1]. `?player={id}` and `?open=read&insight={id}` each open their sheet once and are dropped with replace; an id not on the loaded board opens the gone card (read) or the plain board (player) and makes no extra query. The page's searchParams type carries `open` and `insight`.
15. W-TEAM-15 (S-TEAM.today, S-TEAM.story, S-TEAM.working, S-TEAM.record) [CT4, CT6]. With `coachhelm_monday_brief_v1` or `coachhelm_track_record_v1` off, that card is absent (not empty); with the part failing, its card says it didn't load with Try again and the rest of the board draws.
16. W-TEAM-16 (S-TEAM.record) [CT6]. Re-check calls today's `refreshTeamAnalysisAsCoach` through `RecheckReads`, sits under the board (not in the record card), and its toast does not call it read only.
17. W-TEAM-17 (S-TEAM.course, S-TEAM.course-sheet) [CT2]. Courses group by `course_id` (the one column added to `ROUND_COLUMNS`), named by the newest `course_name`; two rounds at one course with two spellings make one row.
18. W-TEAM-18 (all screens) [CT0]. The lane's diff adds no query against `golf_shots`, no write except through `createFocusAreaFromInsightV2` and today's Re-check, no realtime channel, and no file under `supabase/migrations/`.
19. W-TEAM-19 (S-TEAM, S-TEAM.read-sheet) [CT1]. No client module imports `isFlagEnabled`; `readOn`, `fileOn` and each part's on or off arrive from the server.
20. W-TEAM-20 (S-TEAM) [CT1]. After Assign the action's `revalidatePath('/golf/dashboard/coachhelm')` refreshes the payload; a pull to refresh redraws in place with the open sheet kept and no fly-in.
