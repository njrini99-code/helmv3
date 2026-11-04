# 08 · Acceptance: My stats, Team Stats, Home "Your game"

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 41 rows).
> Wiring, 4 Nov 2026: see the section of that name at the end of this file.

Design page: https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S · Local page: `redesign/stats-and-home-phone.html` (CSS `redesign/stats-phone.css`) · Status: ready to build. Prep only: no deploy, no flag flip, no migration (SHARED-9).

Built from the lane draft `redesign-package-src/acceptance/stats.md` and extended for the build contract (`BUILD_CONTRACT_STANDARD.md`). Screen IDs, states and capture ids are in `05-SCREENS.md`; measured numbers and contrast in `06-SCREEN-SPECS.md`; motion rows in `07-MOTION.md`. Where this file and 04 disagree, this file wins and 04 has a pointer. Sources in brackets: 03 = 03-DATA-CHECKS, 02 = 02-PLAN, 04 = 04-FIDELITY-SPEC, 06 and 07 as above.

Shared criteria SHARED-1 to SHARED-12 (`00-shared/ACCEPTANCE-SHARED.md` (fixed 4 Nov: the file is `../ACCEPTANCE-SHARED.md`, at the top of the package)) apply to every PR and are referenced, not repeated: 1 green bar, 2 flat page (Stats is the agreed exception for its section names), 3 no accent left borders, 4 contrast, 5 XXL unclipped, 6 Reduce Motion, 7 phone edge 16/20, 8 draft PRs behind a flag, 9 no deploy, flag flip or migration, 10 shot tracking unchanged, 11 players never see teammates' figures, 12 side by side.

Nick's calls applied: no large title on Stats, section names on the page ("Keep as drawn"); details run longer than drawn so nothing is removed; Home trend reads 10 rounds (`LEG_TREND` 10); players compare only against the PGA Tour and team averages.

Text sizes are at Text Size Default and scale as `calc(N * var(--ch-type-k))`; "x k" marks a box that scales too. XXL is `--ch-type-k` 1.36 (04 §2 said 1.35; 1.36 is right).

## Screen IDs

The full inventory, every state matrix and every capture id are in `05-SCREENS.md`. This file's criteria use those IDs. New since the draft: `S-STATS.stuck`, `S-STATS.window`, `S-STATS.custom`, `S-STATS.scrub`, `S-STATS.sg-pin`, `S-STATS.how`, `S-STATS.switcher`, `S-STATS.round`, `S-TEAMSTATS.filter`, `S-TEAMSTATS.pin`, `S-TEAMSTATS.player`, `S-HOMEGAME.leg`, `S-ALL.retry`. Drawn this round: loading, failed and long names for all three screens, and Home at 2 rounds and none.

## Part 1. Criteria per screen

### S-STATS (My stats summary)
1. No large title renders; the `large-title` test asserts none on Stats phone. Section names read Overview, Your game, Rounds, Development, in that order [02 Override 1–3].
2. Section name is 700 22/28, tracking −0.02em, `wdth` 92, `--ch-text-primary`; 30pt from the card above (18 margin plus the 12 gap), 12pt to its card; the first is 4pt from the controls [04 §4 `.sech`].
3. Cards: radius 18, padding 14 16 16, 12pt between cards, `--ch-card-bg` with `--ch-card-shadow`; card head min height 24, 10pt above the body, no hairline under it [04 §3].
4. Card title 600 17/22; meta 400 15/20 `--ch-text-secondary`; chevron 8x14 stroke 1.8 `--ch-text-tertiary` [04 §4].
5. Order: Scoring average (the only green card), What changed, At a glance; Strokes gained, Off the tee, Approach, Short game, Putting; Round by round; Goals and focus areas [04 §5].
6. Window switch sits directly under the bar's 16pt lip, sticky at the bar's measured height, page colour behind it, no blur, no hairline; padding 2 16 10 (20 sides at 430) [04 §4 `.ctl`].
7. Window switch: labels "5", "10", "20", "Season", "Qualifiers" (aria "Last 5/10/20"); grid 1fr 1fr 1fr 1.3fr 1.6fr; gap 4; track padding 4, radius 16, height 40 x k; chip radius 12, `--ch-seg-on-bg`; labels 500 14/1, selected 600 `--ch-seg-on-ink` [04 §4].
8. Filter button 40 x k square, radius 14, `--ch-well-bg`, icon 18x18 stroke 1.7 [04 §4].
9. With a custom range on, a sixth segment "Custom" appends and the switch scrolls sideways [04 §8].
10. Scoring feature card: flat `--ch-feature-bg`, no radial light (fixed 4 Nov: SHARED-2; contrast was measured on the lighter `--ch-feature-lit`, so ivory text on the flat fill only reads higher); icon tile 26 x k radius 8 at 12% ivory; title "Scoring average"; meta = window label; chevron in a 44pt hit area around the 24pt glyph [04 §4, odd 18].
11. Feature figure 500 40/1, −0.04em, `wdth` 92; sub "+N to par" 400 17/22 `--ch-feature-ink-2`; change pill plus "than the 10 before" 400 15/20, min height 24 x k [04 §4].
12. Feature chart SVG 160pt tall fixed, padding L 4 R 30 T 10 B 26; par rule 1px dash 3 4; five-round line 2.5 wide in the tone fill; area gradient 28% to 0; round dots r 3.6, newest r 5, 2px `--ch-card-bg` ring, under-par dots `--ch-feature-under`; date labels at the bottom corners [04 §4].
13. Legend 400 13/1.2: dot 8, line 16x3, par 16 dashed [04 §4].
14. What changed: sentence 400 16/23; compare rows columns 78 x k / 1fr / auto, gap 10; track 14 x k radius 999 `--ch-chart-track` [04 §4 `.hl`].
15. At a glance: meta "Tap one for more"; 3 columns bleeding to the card edges with a top rule; cell padding 12 14 14 16; label 400 15/1.25; figure 600 24/1.1 `wdth` 92; caption 400 13/1.3 ("Tour 66%" or "a round"); order Greens, Fairways, Scrambling / Putts, Birdies, Bogeys [04 §4].
16. Strokes gained card: total in summary figure 600 34/1 with caption "Strokes a round against the Tour"; four rows 96 x k / 1fr / 42 x k, min height 30; rail 10 x k; zero mark 1.5 wide, 20 tall; bars flat when |v| < 0.05; scale ±ceil(max |v|), at least 1; foot names Strongest and Biggest leak [04 §4].
17. Part cards: 26 x k icon tile `--ch-chip-gain-bg`, figure 600 34/1, caption 15/20, SG pill; Off the tee stacked bar 22 x k radius 6 (Left `--ch-chart-flat`, Fairway gain fill, Right `--ch-text-tertiary`); Approach 7 rails, Short game 4 rails, Putting 4 rails (3–5 to 15–25 ft); rails 10 x k; Tour tick 2 wide, 18 tall; strip figures 600 20/1.15 above a hairline (tee and approach 3, putting 2, short game none) [04 §4, 02 Override 8].
18. Round by round: "N rounds" figure, caption "Best 73 · Oct 3" format; ticker 64 x k tall, one bar per round oldest left, gap 3 above 12 rounds else 5, min height 6, radius 2.5; best round gain fill, others `--ch-chart-flat`; caption "Taller is lower; best in green" [04 §4].
19. Goals: rings 68 x k, r 27, track and fill 7 wide, label 600 15/1 inside; 3 columns gap 8 [04 §4].
20. At Text Size 1.24 and above: the switch scrolls sideways with a right-edge mask (black 85% to clear); card meta wraps under the title; the glance grid goes to 2 columns without inner rules; round card stacks figure over ticker [04 §4 `.is-big`].
21. 2 rounds (`few`): the few note sits above Overview (padding 12 14, radius 14, `--ch-well-bg-flat`, 400 15/21, bold lead "From 2 rounds."); SG rows show the no-data dash in `--ch-text-tertiary` with no rails; "Strokes gained shows from 3 rounds"; SG pills hidden; every figure tone flat [04 §4, 01 §1].
22. No rounds: an empty card in Overview (icon tile 44 x k radius 12, title 600 20/1.25 "Your stats start with your first round", body 400 15/21 max 30ch, padding 28 22 26); only Development keeps its section [04 §4].
23. Failed and loading are drawn (`#stats-light-full-failed`, `#stats-light-full-loading`) and specified in criteria 93 to 104; they replace the old "not drawn" rule [06 States].
24. Contrast pairs, measured on the design page (06; light / dark): feature secondary `--ch-feature-ink-2` on the lit corner 7.62 / 7.25; axis labels `--ch-feature-ink-3` on the lit corner 5.83 / 5.54; under-par `--ch-feature-under` on the lit corner 5.16 / 4.91; feature gain pill 5.18 / 4.92; secondary on card 9.77 / 10.25; tertiary on card 6.61 / 6.99; segment off-label on the well's darkest stop 6.28 / 11.84; selected label on the chip's top stop 6.04 / 5.62. Every pair in 06 meets 4.9; the PR's contrast test asserts each.
25. Pill pairs: gain 6.35 / 6.10; under-par tile 5.49 / 5.37; flat 8.73 / 8.48; loss `--ch-loss` #9A5700 on `--ch-chip-loss-bg` **#F7F0E6** = 4.97 / 6.18. The tint changed from #F5EDE2 (4.84) on the design page this round; the tokens PR ships #F7F0E6.
26. Marks on `--ch-chart-track` hold 3:1: gain fill 5.15 / 4.50, loss fill 3.15 / 5.52, flat 4.49 light (computed).
27. A player sees only their own figures; no teammate name or figure exists in the DOM (SHARED-11).

### S-STATS detail pages (all eight)
28. Bar: "‹ My stats" 400 17/1 in `--ch-champagne-dot` (chevron 11x19 stroke 2.2, padding 10 8 10 0, min height 44); title 600 17/1 centred, max 52% wide, ellipsis; right slot an empty 44x44; no bell [04 §4].
29. Sheet padding 8 16 56 (20 sides at 430), gap 12; hero on the page with padding 6 2 4, figure 500 40/1 −0.04em `wdth` 92, caption 15/20 6pt below, chips row 10pt below, gap 8 [04 §4, odd 14].
30. Each detail opens at its own top; the summary behind keeps its scroll.
31. Every block of today's phone Stats appears on the summary or a detail: each row of 02 "Where today's content goes" is checked off in the PR; blocks the page doesn't draw use the card head style (title and meta in the head, 14/16 padding) and may make the page longer than drawn.

### S-STATS.scoring
32. Blocks in order: hero (average, to par, change chip) · Score by round (par dashed) · An average round · Per round · What changed · Against the N before [04 §5].
33. Score mix bar 28 x k, radius 8, gap 2: Eagle `--ch-score-eagle-fill`, Birdie `--ch-flag`, Par `--ch-chart-par`, Bogey `--ch-chart-bogey`, Double+ `--ch-text-primary` 700 tone; key grid min 96 x k, swatch 10x10 radius 3 [04 §4].
34. "Against the N before" comes from `x.compare`, captioned "From round totals" [02 Data checks].

### S-STATS.sg
35. Blocks: hero (total, likely range) · By part of the game · Open a part (four rows, 56pt, push the part) · How strokes gained works [04 §5].
36. SG row columns 104 x k / 1fr / 48 x k, gap 12, min height 44, press wash edge to edge; rail 12 x k; zero 22 tall; Total row 600 under a `--ch-separator-strong` rule; scale row "−4 0 +4" 400 13/1 tertiary [04 §4].
37. Readout above the rows min height 40 x k; range whisker opacity 0 to 0.9 over 200ms when pinned [04 §4].
38. "How this is measured" button padding 13 16, 400 16/1.2 `--ch-accent`; chevron turns 90° in 200ms [04 §4]. The toggle sits at the end of "Against the N before" on Scoring, Off the tee, Approach and Putting; Strokes gained and Short game show the text open in a card of their own [06].

### S-STATS.tee, .approach, .short, .putting
39. Tee: hero Fairways hit with SG chip · In short · The figures · Where drives finish · Against the N before; meta "Par 4s and 5s"; no Tour mark on fairways; "Other tee shots" label, never "Other clubs" [04 §5, 03 §9, 02 Data checks].
40. Approach: You and the Tour (only existing Tour figures) · The figures · Greens hit by distance, 7 bands in yards, no Tour tick · Greens by round · Against the N before.
41. Short game: Up and down by lie with Tour ticks fairway 65, rough 58, sand 50 only; no tick on All chances; How this is measured.
42. Putting: Make rate by distance, 6 bands 0–3, 3–5, 5–10, 10–15, 15–25, 25+; Tour ticks 90.5, 62.2, 35.7, 15.4, 5.5; none on 0–3; Putts by round (up is fewer); one-putts per round only here, today's formula [03 Putting, 02 Data checks].
43. Bars `.hb` columns 84 x k / 1fr / 44 x k, min height 44; rail 12 x k; Tour tick 2 wide, 22 tall; key mark 2x12 [04 §4].
44. Part-page bench bar 10 x k (scales with Text Size) [04 odd 24].

### S-STATS.rounds and S-STATS.goals
45. Rounds: ticker full size · Personal bests · Against the N before · Every round (64pt rows: score tile 44 x k radius 11, `--ch-chip-flag-bg` fill and `--ch-flag` ink under par; sub "Oct 21 · Tournament" format; to par 600 15/1); fewest-putts tie goes to the latest round [04 §4, 03 §9].
46. Goals: rings from `progressOf(goal)`; a goal without a baseline shows value and target as text, no ring; label from the goal title; focus areas list the coach's rows with progress bars 8 x k and no "Set by" name [04 §8, 02 Data checks].

### S-STATS.coach
47. A coach on `?player=` sees the same page under today's coach head (identity, handicap, Message); bar reads "Player stats ⌄"; detail back reads "‹ Player stats" [04 §8].

### S-TEAMSTATS (summary)
48. Rendered only for a coach; a player account never receives team rank rows in the DOM (SHARED-11).
49. Section names Overview, Team game, Players [04 §4].
50. Team scoring average feature card, chart 160pt tall (padding L 0 R 30 T 8 B 24), team line and area always gain fill, mean rule labelled "Mean 74.1" format 6pt above it at x 4; bare chevron [04 §4, odd 20].
51. Team game: same SG card with scale fixed ±4; foot "Greens 55% · Putts 32.6 · Scrambling 32%" format.
52. Players: top three by SG, rows 52pt (rank 20 x k, name 104 x k, rail, value 44 x k), rail scale fixed ±8, bar and figure toned by sign; not tappable on the summary [04 §4, odd 25].
53. States: Last 20, 2 round days (`partial`), none ("No team rounds yet"), failed (criteria 99 to 100) and loading (criterion 94) each render as drawn.

### S-TEAMSTATS details
54. Team scoring: By round day · The round (`.m3` grid min 92 x k, figure 600 24/1.1) · Round days table (head 400 13/1.2, cells padding 9 0, columns Day, Team average, Rounds; no To par) · team putting · TeamInsight [04 §5, §8].
55. Team game: SG by leg · The round · How strokes gained works; no range on tap (none is loaded) [03 Team game].
56. Players: Who gains and loses (every player, ties marked "T") then today's Players list with Avg / SG sort and peek, unchanged.
57. With every player below zero the sentence reads "loses the least" [03 problem 9].
58. Back reads "‹ Stats".

### S-HOMEGAME
59. One card radius 16, title "Your game", meta "Strokes gained vs Tour" 400 15/20 secondary; header padding 14 16 12 with a hairline inset 16 [04 §4 Home].
60. Four legs (Off the tee, Approach, Short game, Putting), each padding 14 16 16 with a rule inset 16: 26pt icon tile `--ch-chip-gain-bg` with the Stats part-card glyph; title 600 16/21; SG pill; figure 600 28/1 −0.03em `wdth` 92; stat 400 15/20 [04 §4, §8].
61. Spark 46 x k tall, viewBox 240x46: line 2.25, round caps; area 22% to 0; mean 1px tertiary dash 2 3; end dot 9 with 2.5 card ring [04 §4].
62. Caption 400 13/1.2: trend word 600 in `--ch-gain` / `--ch-loss`, or "No clear change" in `--ch-text-secondary`; steady line in `--ch-chart-flat` (5.58 light, 6.27 dark on the card, computed).
63. You vs Tour rail on Approach only: rail 12 x k, Tour tick 2 wide, 22 tall; key 600 15/1.2 "You 55%" in the bar's tone and "Tour 66%" 400 secondary.
64. Counts line 400 15/20 ("59 of 140 fairways" format; Putting "321 putts in the last 10 rounds" = sum of recorded putts) [03 Home].
65. Footnote: "Figures are your last 10 rounds; strokes gained is the season's. A line turns green or amber only when the newer rounds differ by more than their likely error."
66. 2 rounds, no rounds, loading and partial failure render as drawn (criteria 101 to 104) from `?state=early`, `?state=empty`, `?state=loading` and `?state=failed` (fixtures added in PR 6).


## Part 2. Mechanics, motion and data (cross-screen)

### Mechanics [04 §6, 07]
67. Tap a summary card, or Enter / Space when focused, pushes its detail; haptic `select`.
68. Press and drag on the scoring chart reads the nearest round: rule 1px at 60% ink, ring r 10, dot r 6, figure shows that round's score and date; haptic tick per round crossed; release restores the average; never opens the detail; arrow keys step rounds when focused.
69. Glance tiles push: Greens to Approach, Fairways to Off the tee, Scrambling to Short game, Putts to Putting, Birdies and Bogeys to Scoring.
70. Window tap: chip slides, every figure on the page and any open detail changes; retapping the current segment does nothing.
71. Filter opens today's `StatsFilter`, unchanged; bar title and bell unchanged; no bell on details.
72. Back, left-edge swipe and Escape pop to the summary at the scroll position it left; retapping the current section pops the detail (`history.go(-level)`).
73. SG detail: tap a By part row pins it (its range whisker shows at .9 and the row keeps the press wash; other rows unchanged); tap again unpins. "Open a part" replaces the SG page, so Back reads "‹ My stats" and lands on the summary.
74. Team game leg row tap pins only. Players row: first tap pins, a second tap on the pinned row opens the player (`teamPlayerHref`). Every round row opens the round as today.
75. Home leg row opens `#gm-<part>` on My stats with no slide; one Back reaches the Stats summary.
76. Every inbound link in 02 "Every inbound link" (`?tab=rounds`, `?tab=dev`, `?tab=game`, `#gm-<leg>`, `?player=`) lands on its detail with no slide; one Back reaches the summary; no RSC request on open or Back; refreshing a detail keeps it.
77. Desktop maps `#sd-rounds` to the Rounds tab and `#sd-goals` to Development; desktop layout otherwise unchanged [02 Desktop].

### Motion [07]
78. Push matches M-STATS-01, 02 and 03: detail `translateX(100%)` to 0 over 462ms `--ch-ease-spring-smooth`, summary to −24% (`CH_UNDERLAY_SHIFT`), shade `--ch-push-dim` over 462ms `--ch-ease`, edge shadow `-10px 0 28px rgb(0 0 0/.10)`. On the clip, the detail's left edge is at 32% of the width at 116ms and 5% at 231ms (±1 frame). Reduce Motion: `CH_FADE_MS` opacity crossfade (180ms today), no travel, no shade.
79. Pop matches M-STATS-04 (01 to 03 reversed, `visibility: hidden` after 462ms); the summary keeps its scroll position. Edge swipe is the app's existing pop (M-STATS-05, not drawn).
80. Window change matches M-STATS-07 to 09: chip 360ms `cubic-bezier(.34,1.3,.64,1)` (instant under Reduce Motion); labels 200ms opacity swap between the 500 and 600 layers; every changing figure block crossfades 260ms `--ch-ease` (`CH_FADE_MS`, 180ms today, under Reduce Motion). No figure ever shows an in-between number.
81. Scoring line, area and dots morph over 360ms with `1 − (1 − t)^3.2` (M-STATS-10); none under Reduce Motion.
82. Grow-once matches M-STATS-12 to 15: 360ms `--ch-ease`, the first time the card is 25% in view; never again on scroll back, window change, refresh or Try again; drawn at rest under Reduce Motion.
83. Press matches M-STATS-16 to 20: summary cards take the inset 999px `--ch-press-wash` and fade it out over 280ms; feature cards `brightness(.94)` instantly; round rows 120ms wash; SG rows, team rows and glance tiles an instant wash; only the filter button scales (.97). No card or row scales (CH-1606). (fixed 4 Nov: summary cards and the two feature cards also scale to 0.97, 110ms down and 280ms release on `--ch-ease`, per START_HERE's shared Press value; no scale under Reduce Motion; rows and tiles still never scale. See CP-131.)
84. Sticky switch shade: 14pt `rgb(0 0 0/.10)` to clear, 180ms linear, once the switch is stuck (M-STATS-11); instant under Reduce Motion.
85. Deep-link arrival and Home leg taps never animate (M-STATS-26, M-HOME-01); keyboard push moves focus to Back after 80ms (M-STATS-27). Nothing counts up, bounces or loops except the loading sheen (M-STATS-24). Every "must never animate" item in 07 holds, and every interrupt case in 07 has a test or a clip.

### Data fields [03]
86. SG total in summary, SG hero and Total row equals `w.sgPerRound` (team: `team.sgMean`), never the sum of legs; legs equal `sgLegBars` / `legTotals`.
87. For GIR, fairways, putts and scrambling, the glance tile, part card and detail hero show the same value in every window [03 §10.1].
88. Tour text or tick appears only for keys in `golf_pga_standards` for the player's tour; none for fairways, overall scrambling, putts per round, one-putts, three-putts, GIR by distance, 0–3 ft; 5–10 ft reads 62 (62.2), never 56.
89. Missed short equals `s.approachMissShortPct`, phone and desktop.
90. What changed says "the N before" for Last 5 and Last 10; for Last 20, Season and Qualifiers it compares the newest half with the first half and says so.
91. Under 3 rounds no SG figure or pill renders; tones stay flat until the error rule clears.
92. Home: SG per leg = `season.sgLegs` (3+ rounds); key figure = last 10 rounds, equal to that part's figure on My stats for Last 10; `LEG_TREND` = 10; spark draws up to 10 points and the caption names the real count; "Improving" and "Slipping" render for a fixture whose halves differ past the error.


## Part 2b. Drawn states (new this round)

### S-STATS, S-TEAMSTATS, S-HOMEGAME · loading
93. Every card keeps its loaded height (`StatsPhoneSkeleton` rule): the loaded page and the loading page have the same card y positions within 2pt on the 393 capture.
94. Card titles and section names show; meta is a 72 × 12 bar right-aligned; the body is a 42%-wide bar 28 x k tall (radius 8) over a block that fills the rest (radius 10); the feature card is one block in the feature gradient; Home legs keep their height with title, figure and spark as bars. Bars `--ch-skel-base` #E2DBCA / #252C26, sheen `--ch-skel-sheen` #ECE6D8 / #2E362F. Skeleton bars are decorative (`aria-hidden`) and exempt from 3:1.
95. The page has `aria-busy="true"` and the label "Loading stats" or "Loading home"; the window switch is `inert`; today's team code CH-4401 stays on the team container.
96. Fade-in 260ms `--ch-ease`, sheen 1.9s linear repeating (M-STATS-23, 24); both off under Reduce Motion.

### S-STATS · failed (CH-5201)
97. A card under the switch: alert icon 16 in `--ch-danger-600` (#B03A2E / #EF8576; 5.96 / 6.67 on the card), title "Rounds didn’t load." 600 15/20 −0.01em, body "Posted rounds are safe. Every figure that reads them would be incomplete, so they’re hidden. Try again." 400 15/21 `--ch-ink-600`, Try again button min 36 x k (44 hit), radius 12, `--ch-well-bg-flat`, inset 1px `--ch-separator`, 600 15.
98. The switch stays live; Development and Goals still render; no other card renders.

### S-TEAMSTATS · failed (CH-4201)
99. One centred card: icon tile 44 x k radius 12 in the danger tint (`--ch-chip-danger-bg` #F7E8E5 / #3C2F2A; icon 5.05 / 5.08 on it), title "Team rounds didn’t load", body "Every figure would be incomplete, so none is shown.", Try again centred.
100. Try again shows the skeleton, then the page lands with no animation (S-ALL.retry, M-STATS-25); a second tap while loading does nothing.

### S-HOMEGAME · few, none, failed
101. 2 rounds: each leg's counts line opens with "Early read · " ("Early read · 12 of 28 fairways in 2 rounds"); no SG pills; tone flat; Scrambling shows "—" with "Needs 10 chances to get up and down" and no spark; sparks draw from 2 points; footnote "From 2 rounds. Each figure shows with an early-read tag and nothing is coloured until a difference is clear. Strokes gained starts from the third round."
102. No rounds (CH-2311): the card keeps its header; body "Nothing to break down yet." 600 16/21 and "Fairways, greens, scrambling and putts fill in from rounds posted with those stats." 400 15/21; no footnote.
103. Partial failure (CH-2216): a notice inside the card under its header with a bottom rule: "Some of your figures didn’t load" / "Scores, greens and putts are right; scrambling is missing." with Try again. Only the missing leg changes: "—", no spark, no counts, no pill.
104. No rounds and failed don't both show: with no rounds the empty body wins.

### Long names (S-STATS.rounds, S-TEAMSTATS.tplayers, S-HOMEGAME)
105. "The Country Club of North Carolina, Dogwood" ends in an ellipsis on one line in an Every round row; the row stays 64 tall at Default.
106. "Christopher Vanderhoeven-Castellanos" ends in an ellipsis inside the 104 x k name column; the rail beside it keeps its width.
107. "Good afternoon, Christopher" and "Practice at 3:30 · Lonnie Poole Golf Course practice range" wrap on Home's green top; nothing clips at XXL.

### Inline states
108. S-STATS.stuck: at scroll 320 the switch top sits at y 114 and the 14pt shade shows; at scroll 0 it is gone.
109. S-STATS.scrub: pressing the chart at 60% shows the rule, a ring r 10 and that round's dot r 6; the hero reads that round's score, "to par · SG" and "date · type"; release restores the average and the window label.
110. S-STATS.sg-pin and S-TEAMSTATS.pin: the pinned row keeps the press wash and shows its whisker at .9; nothing else on the page changes.
111. S-STATS.how: the text opens with no height animation; `aria-expanded` flips; the chevron turns 90°.
112. S-STATS.custom: with a custom range the switch shows a sixth segment "Custom" and scrolls sideways; not drawn, so the PR shows the app capture and the rule (04 §8).

### Hit areas [06]
113. Every control is at least 44 × 44: window segments (32 x k drawn, `::before` inset −6px 0), filter (40, inset −2px), feature `.dlink` (24, inset −10px), Try again (36 x k, inset −4px 0), Back (44 from padding), detail rows 44 / 52 / 64. A DOM test measures each hit box.

## Part 3. Per PR

Every PR also passes SHARED-1 to 12. "Hooks" are the `data-ch` attributes `capture.mjs` uses for inline states in the app; the PR that builds the element adds them.

### PR 4a. Plumbing
- Passes: 76 (logic level), 89; no visible change elsewhere.
- Adds tests: `detail-route.test.ts` (11 ids round-trip, `arrivalDetail` per inbound row, hash beats tab, `tab=overview` null, `summaryUrl` keeps player, window, filter), `use-stats-detail.test.tsx` (one `{chPhone:1}` entry, Back and `go(-1)` close, arrival replace then push, SG part replaces), `goal-ring.test.tsx` (`progressOf` 0, 1, past target, no baseline), Missed short unit test, fixture fixes per 03 problem 13.
- Adds fixtures: `player?state=empty`, `player?state=long`, `player?state=lots`, `player?state=one`.
- Done when: unit tests pass and `capture.mjs --id S-STATS --state default` (app) shows no change except Missed short. (fixed 4 Nov: with `clubhouse_stats_redesign_v1` off the capture shows no change at all, Missed short included; with it on, only Missed short changes. CP-114.)

### PR 4b. My stats summary and details
- Passes: 1–47, 67–80, 83–98, 105, 108, 113 for every S-STATS id; SHARED-1 to 12.
- Adds tests: `stats-summary-cards.test.tsx` (each card opens its detail, Back returns, chart drag doesn't open, Enter opens, chevron reachable), `stats-summary-figures.test.ts` (summary equals hero; SG is `sgPerRound`; no Tour text without `bench`), `stats-deep-links.e2e` (each inbound link, scroll restored, no RSC, no animation on arrival), `stats-states.test.tsx` (loading keeps card heights, `aria-busy`, inert switch; failed CH-5201 copy, Development still renders; Try again ignores a second tap), `hit-areas.test.ts` (113), `mini-rails.test.tsx`, `round-ticker.test.tsx`; updates `large-title` (none), `stats-parity`, `stats-player`, `stats-phone-crash`, `chips-tabs` (sections), CSS rule tests; contrast assertions for every 06 pair, including `--ch-chip-loss-bg` #F7F0E6 and the new skeleton and danger tokens.
- Hooks: `stats-window-seg` (each segment, with `data-v`), `stats-filter`, `stats-hero-chart`, `stats-retry`, `stats-card` (each summary card, with `data-go` set to its detail key: scoring, sg, tee, approach, short, putting, rounds, goals, tscore, tgame, tplayers), `stats-back`, `stats-round-row` (each Every round row), `stats-glance` (each At a glance tile).
- Done when: every S-STATS id in 05 matches side by side in every drawn state of its matrix (default, loading, failed, empty, few, long, xxl, dark, reduce, w430), redline within 2pt, and 03 §10 checks 1–5 are tabled in the PR.

### PR 4c. Detail polish
- Passes: 32, 35–45, 68, 81, 82, 109–111; M-STATS-06, 10, 12–15, 21, 22; the What changed to "Against the N before" anchor scrolls after the push settles (not animated under Reduce Motion).
- Adds tests: `stats-visuals-trend` (drag pins without opening; feature tone), grow-once test (no regrow on window change, refresh or Try again), scrub keyboard test (arrows step, Escape ends).
- Hooks: `stats-sg-row` (each By part row), `stats-how`.
- Done when: clips `push`, `pop`, `window`, `scrub`, `grow`, `pin`, `how` match the design's with and without Reduce Motion, and the 07 interrupt cases 1 to 7 and 10 to 11 pass.

### PR 4d. Desktop tokens
- Opened only if conflict 19 is decided. Done when: skipped, or desktop colours change and nothing else (desktop 1280 capture before and after differs only in colour).

### PR 5. Team Stats
- Passes: 48–58, 72–74, 78–86, 93–96, 99–100, 106, 110 for every S-TEAMSTATS id; 03 §10.6 (team average equals the mean of round-day averages, weighted by n).
- Adds tests: `stats-team` summary and three details, `TeamRank` "loses the least" wording, `charts-gauge` (team putting in Team scoring), team shots, team states (CH-4201 card, CH-4401 skeleton), a player-signed-in test that the team route and its rows never reach a player (SHARED-11).
- Adds fixtures: `stats?state=long`, `stats?state=lots`, `stats?state=one`. Hooks: `team-window-seg`, `team-player-row`, `stats-retry`.
- Done when: every S-TEAMSTATS id matches side by side in full, Last 20, few, none, failed, loading, long, dark, XXL and 430.

### PR 6. Player Home "Your game"
- Passes: 59–66, 75, 92, 93–96, 101–104, 107; M-HOME-01; 03 §10.7.
- Adds tests: `player-home`, `player-home-phone`, `home-phone-figs-css`, `contrast-tokens` (steady spark, track, tick, key, "You" tone, trend word), `LEG_TREND` = 10 with an "Improving" fixture, Home states (early-read counts, no pills under 3 rounds, CH-2311 empty, CH-2216 partial with only the missing leg changed).
- Hooks: `home-leg` (each of the four legs, in order).
- Adds fixtures: `home-player?state=early`, `?state=empty`, `?state=loading`, `?state=failed`, `?state=long`, `?state=one`.
- Done when: S-HOMEGAME and S-HOMEGAME.leg match in full, few, none, loading, failed, long, light and dark, XXL and 430, and player Home is re-shot after PR 10's `--ch-frame` bar change.

## Part 4. Side by side

The capture script (`capture/capture.mjs`) reads `capture/screens.json`, which `05-SCREENS.md` is generated with, so the two never disagree. One headless Chromium, one dev server (SHARED-9).

Stills, for each screen id the PR touches and each drawn state in its 05 matrix:

```
npm run dev -- -p 3100
node design-refresh/stats-home/capture/capture.mjs --id S-STATS.sg --state default
node design-refresh/stats-home/capture/capture.mjs --id S-STATS --state all        # every state in the matrix
node design-refresh/stats-home/capture/capture.mjs --id all --state default        # every id
```

It writes `screenshots/<ID>__<state>__{design,app}__{light,dark}.png` at 393 wide (`w430` at 430, `w390` at 390), Text Size Default unless the state is `xxl`, Reduce Motion on so charts are at rest. `--side design` or `--side app` shoots one side only. A state the app has no fixture for yet is listed as "add" and skipped, not failed. `--list` prints every id with the states each side can shoot; `capture-log.txt` in the output folder lists what was saved, skipped and failed. A summary card is tapped on its title row, because its centre can be a chart.

Put each pair side by side in the PR and check the 06 redline numbers for that id on both images. A PR is done only when every number is within 2pt.

Motion, for each 07 row the PR touches:

```
node design-refresh/stats-home/capture/capture.mjs --motion M-STATS-01
```

It records the design page and the app with Playwright `recordVideo` (add `--no-video` for frames only) at 393 × 852, once with motion and once with `reducedMotion: 'reduce'`, into `screenshots/motion/<M-ID>__{design,app}__{motion,reduce}.webm`, and writes the frame times 07's Check column names as PNGs beside them. Compare duration, curve (the frame positions 07 gives), what moves and what doesn't. Each difference is listed in the PR as matches, fixed, longer by design (02 "Where today's content goes") or can't match (04 §8 row). Anything else blocks the PR.

## Completeness pass, 4 Nov 2026

Numbered checks for every state, ID and motion row the Completeness passes in 05, 06, 07, 03 and 02 add, continuing this file's numbers with the prefix CP. Each is pass or fail on a screenshot, a DOM test or a clip.

### Flag and boundary
CP-114. With `clubhouse_stats_redesign_v1` off (every environment), a capture of every ID's route equals main pixel for pixel, Missed short included, and no `data-ch` hook of this lane is in the DOM; with it on, only this lane's screens change. `config/feature-flags.yml` has the entry with production, preview and development false.
CP-115. With the flag off, `#sd-*` hashes land on today's summary; `?tab=rounds`, `?tab=dev`, `?tab=game`, `#gm-<part>` and the Home leg links behave as main.
CP-116. PR 6 changes only the Your game card on player Home (`PlayerGame` legs, `.ch-ph-leg`, `.ch-ph-bench`, `.ch-ph-spark`, the legs block of `PlayerHomePhone.tsx`); a pixel diff of the hero, greeting, Up next and everything else on player Home against main after PR 10 shows no change. Coach Home is untouched.

### Every ID has a check (names the IDs 08 Part 1 didn't)
CP-117. S-STATS.approach, S-STATS.short and S-STATS.putting each open from their summary card and from their glance tile (Greens, Scrambling, Putts), render the blocks of criteria 40 to 42 in order, and pass the shared detail checks 28 to 31; each in default, few, long, xxl, dark, reduce, w390 and w430, side by side within 2pt.
CP-118. S-TEAMSTATS.tscore and S-TEAMSTATS.tgame each open from their summary card with the house push, render criteria 54 and 55, read "‹ Stats" (58), and match side by side in default, few, xxl, dark, reduce and w430.
CP-119. S-STATS.filter and S-TEAMSTATS.filter open today's StatsFilter from the new filter button (`stats-filter`), unchanged in look and motion against main's clip; closing returns focus to the filter button.
CP-120. S-TEAMSTATS.peek opens today's PlayerPeek from a row of the Players list on S-TEAMSTATS.tplayers, over the detail, unchanged; closing returns focus to the row; the detail stays open behind it.
CP-121. S-STATS.switcher, S-STATS.round and S-TEAMSTATS.player open today's components from the new screens (app capture `default` for each), and the round page and the player page come back to the detail per CP-130.

### States
CP-122. First run: a player with no rounds and no goals sees the drawn none card and the Goals card with today's empty copy; a team with no players sees "No team rounds yet"; Home shows the CH-2311 body. No setup step is asked for.
CP-123. S-STATS.filter-empty and S-TEAMSTATS.filter-empty: with a filter or window that matches nothing (fixture `filterempty`), the switch and filter stay live, one card in the none card's shape shows today's `FilterEmpty` copy and its clear action (44pt hit), Development still renders (player), and the first-round card does not show. Clearing returns the default window's figures with the M-STATS-09 crossfade.
CP-124. Season start: with fixture `filterempty&window=season`, Season and Qualifiers show the filter-empty card while Last 10 shows last season's rounds; on Home (`newseason`) figures, counts and sparks show, no SG pill renders, and the footnote reads "strokes gained shows from this season's third round."
CP-125. Practice rounds: with fixture `practice`, no practice round counts in the scoring average, SG, What changed, bests, team figures or Home legs, and My stats Last 10 equals Roster's and Home's figure for that player; picking Practice in StatsFilter counts them; "N rounds" equals the number of Every round rows.
CP-126. One round (`one`, all three screens): the scoring chart shows one dot r 5 and the par rule only and is not focusable; the ticker shows one `--ch-chart-flat` bar with "1 round"; What changed has no bars; Home sparks show the end dot only with "Last round"; no SG pill anywhere.
CP-127. S-STATS.updating: on a window whose rounds need a fetch, the chip moves at the tap, `UpdatingNote` (`role="status"`) shows after today's busy delay, and no figure changes until data lands, then all change in one crossfade. With the fetch failing or offline, the chip springs back to the old segment (M-STATS-33), today's toast shows, and every figure is unchanged.
CP-128. Offline (every ID): after load, offline, cached figures render as loaded with today's offline banner; a loaded window switches; Home renders its last figures and a leg tap navigates; nothing shows the failed card because of being offline alone.
CP-129. S-STATS.detail-loading: a cold load of `?tab=dev` (and `#sd-sg`, `#sd-team-score`) shows the pushed bar with the right back label and title on the first frame, the detail skeleton (06) with `aria-busy`, then the detail in place with no slide; a failed load shows the summary's failed card and Try again opens the detail; an empty load replaces the hash and lands on the empty card, except Goals, which opens.
CP-130. S-STATS.return: open a round from S-STATS.rounds at a scroll of 600, Back: the Rounds detail is in place at 600 (±1pt), the summary under it at its scroll, `history.length` is unchanged from before the round opened, and one more Back reaches the summary. Same for S-TEAMSTATS.player from S-TEAMSTATS.tplayers.
CP-131. Press (fixed 4 Nov): summary cards and both feature cards scale to 0.970 ± 0.005 at 180ms after pointerdown and back to 1 by 280ms after release, with the drawn wash; glance tiles, SG rows, team rows, Every round rows and Home legs never scale; under Reduce Motion nothing scales.
CP-132. Refresh: pull to refresh on S-STATS, S-TEAMSTATS and player Home re-reads the data and lands it with no fade, crossfade or regrow; a failed refresh keeps the figures and shows today's toast; details have no pull of their own.
CP-133. S-STATS.goals-sheets and S-STATS.share: each of today's sheets opens over the open detail, keeps its own saving and double-submit guard, closes by ✕, scrim, swipe down and Escape, and returns focus to its opener; after a save the Goals detail updates in place with no ring regrow; Add focus area and Share are absent from a player's DOM and `ProposalAnswer` from a coach's.
CP-134. S-STATS.denied: a player on `?player=<teammate>` never gets the teammate's id or figures in the DOM or responses; a player on the team route gets no team row; a coach on a removed player's id gets today's not-found with no detail; `#sd-team-game` on the player route, `#sd-sg` on the team route and `#sd-nope` land on the summary at the top with the hash replaced.
CP-135. Lots: 40 Every round rows at 64pt and 40 team players at 52pt render with no virtual list and no dropped row; the ticker gap is 3 above 12 rounds; the Goals card shows the first three rings and "N active"; the Goals detail lists all.
CP-136. Long notes: a three-line goal title, focus area note and FilterEmpty copy wrap and grow their card at Default and XXL; the ring label under a goal ring ends in an ellipsis after 2 lines and its full title is in the accessible name.
CP-137. Deleted mid-session: a round deleted on another device shows today's not-found on the round page and leaves the Rounds detail on its next load; a player removed from the team shows today's not-found on the second tap or in the peek.

### Sizes, keyboard and VoiceOver
CP-138. At 600 and 820 wide every S-STATS, S-TEAMSTATS and S-HOMEGAME ID uses the phone layout with a 20pt edge, cards fill, the feature chart is 160 tall with unstretched strokes, and there is no horizontal page scroll; at 821 the desktop layout shows.
CP-139. Desktop 1280: S-STATS and S-TEAMSTATS are main's layout with only the 02 Desktop changes; `#sd-rounds` opens the Rounds tab, `#sd-goals` Development, any other `#sd-*` the Overview tab; desktop player Home differs from main only in PR 6's colours.
CP-140. Keyboard (desktop and iPad with a keyboard, every S-STATS and S-TEAMSTATS ID): Tab order is bar, segments, filter, then cards in page order (card, then its chevron); Enter or Space pushes; focus is on Back 80ms later (0 under Reduce Motion); Escape pops and focus returns to the card that opened the detail (for a part reached by Open a part, to that part's summary card); Escape in a sheet closes only the sheet.
CP-141. Focus ring: 2px, offset 2, `--ch-accent` on cards and the page, `--ch-feature-ink` on the feature card, shown only on `:focus-visible`, with no transition (M-STATS-38); each pair in 06's focus table holds 3:1 in both themes.
CP-142. VoiceOver: section names are level 2 headings; each card, tile, SG row, team row, round row and Home leg is one element whose name has its figure as 06's table shows; the scoring chart is a slider with per-round value text when focused; skeleton bars and decorative marks are hidden; "—" reads as no value.
CP-143. Every hit area added here (clear filter, Home legs, peek rows, Back in detail-loading) is at least 44 × 44, measured by the DOM test of criterion 113.

### Motion (07 Completeness pass)
CP-144. Every ID in 07's "Every ID, in and out" table has an in and an out that match their rows, with and without Reduce Motion; the Reduce Motion clip of each is a `CH_FADE_MS` crossfade or a still.
CP-145. M-STATS-28 and 29: the route push from a detail and the pop back match the app's `nav-motion` push (462ms, −24%, brightness 0.9); the detail under the new page moves with the page, and on the way back it is already in place (no second slide).
CP-146. M-STATS-30 and 31: today's sheet and strip clips are unchanged against main.
CP-147. M-STATS-33 to 36: rollback chip spring 360ms; detail skeleton fade 260ms then an unanimated landing; filter-empty card crossfade 260ms; Custom segment appears with no motion while the chip springs.
CP-148. M-STATS-37: Open a part swaps the SG page for the part's page in one frame, scrolled to its top, with the summary unchanged under it; one Back reaches the summary.
CP-149. M-HOME-02 to 04: a Home leg press washes over 120ms and never scales; Back from Stats to Home is a section fade with Home at its scroll; Home's Try again reloads only the card and nothing outside it moves.
CP-150. Interrupt cases 13 to 17 in 07 each have a test or a clip: double tap gives one detail and one history entry; Back before a window fetch lands still crossfades once; refresh during a fetch lands once; the edge swipe with a sheet open dismisses only the sheet; Back during M-STATS-28 retargets.

### Cross-lane
CP-151. Every entry in 05's "Every way in" table lands where it says and Back goes where it says, including the `dev_plan_assigned` row on a cold start (fixed 4 Nov wiring: a bell row and an email, not a push), the same row from the bell, coach Home's links, Roster's All N rounds, Messages' profile link and Ask's "Open in Stats".
CP-152. With the Classes lane's flag off and this lane's on (and the reverse), coach Home's "Team stats", leg names and round sheet link still land on a working Stats page; with Ask's flag off, today's Ask links still land.
CP-153. No link from Stats or Home into Ask, CoachHelm Read or Lenses is added (none is drawn); the coach head's Message opens Messages as today.

### Per PR
CP-154. PR 4a passes CP-114, CP-115. PR 4b passes CP-117, CP-119, CP-121 to CP-123, CP-125 to CP-131, CP-133 to CP-136, CP-138 to CP-145, CP-151, CP-153. PR 4c passes CP-147, CP-148, CP-150. PR 5 passes CP-118, CP-120, CP-123, CP-124 (team), CP-130 (player), CP-134, CP-135, CP-137, CP-151. PR 6 passes CP-116, CP-124 (Home), CP-126 (Home), CP-128, CP-132, CP-149, CP-152. CP-132 and CP-146 are regression checks in every PR.

### Added by the lead (cross-lane, 4 Nov)
CP-155. PR 6: with this lane's flag on, player Home's root carries `data-ch-hero-flat` and its bar and hero are one `--ch-frame` green (#0a331f light, #08150e dark) with no seam; with this lane's flag off the attribute is absent and the bar and hero are pixel equal to main, whatever the Classes lane flag says (classes-roster-home CP-02.3). DOM test plus a pixel diff of the bar band.


## Wiring, 4 Nov 2026

Pass or fail, each against helmv3 03d9087 and 06 "Wiring, 4 Nov 2026" (W.1 to W.6).

W-STATS-1. Flag. `clubhouse_stats_redesign_v1` exists in `config/feature-flags.yml` with `default: false` and all three environments false, `npm run flags:generate` output is committed, and the flag is read only on the server (`routes/stats.tsx` and the Home route's player branch), reaching components as the `shs` prop. With it off, every ID in 05 renders main's DOM, `#sd-*` is ignored, Home legs are not links and `data-ch-hero-flat` is absent. Covers flagoff on every ID.
W-STATS-2. Player privacy. Signed in as a player, `stats?player=<teammate id>` and `stats/team` render the player's own S-STATS; the network log and DOM hold no teammate id, round, mean or SG (`stats-player.ts:291` to 303 and 398 run only for a coach). Covers S-STATS, S-STATS.denied, S-TEAMSTATS (SHARED-11).
W-STATS-3. Denied. A coach on a malformed id gets `NotOnTeam` CH-5306 with no database read; on an off-team uuid CH-5306 after the read; a wrong-screen hash gives that screen's summary. Covers S-STATS.denied.
W-STATS-4. Window and filter. A window tap navigates once through `pushOnce` with no scroll jump; offline shows CH-5901 and the chip springs back; a slow fetch shows CH-5902, then `UpdatingNote` CH-5903 (team CH-4903) until the figures land; the windows either side are fetched when idle. Covers S-STATS.window, .custom, .updating, S-TEAMSTATS.
W-STATS-5. Filter empty. A window or filter with 0 rounds while Last 10 has some shows `FilterEmpty` (both screens) and Clear restores the default. Covers S-STATS.filter-empty, S-TEAMSTATS.filter-empty.
W-STATS-6. Practice default. With the flag on, a player with 2 practice rounds among 10 shows the same Last 10 average, SG, What changed and Home leg figures as with those 2 removed, and the same figure Roster and Home show; picking Practice in StatsFilter counts them; the pressure gap and GameMore's Practice row still read them; one `countsForScoring` in `data/season.ts` serves all three screens. Flag off: figures match main. Covers S-STATS, S-TEAMSTATS, S-HOMEGAME.
W-STATS-7. Detail arrivals. `#sd-goals`, `?tab=dev` and each `#gm-<part>` open in place on refresh and on a cold start (detail-loading first); a failed load holds the target until Try again; an empty load lands on the summary except Goals. Covers every detail ID, S-STATS.detail-loading, S-STATS.return.
W-STATS-8. Set a goal. `createGoal` is called once per save (a second tap answers busy); a player can write only rows with their own `player_id` (`goals_player_own`); success refreshes Stats through `router.refresh()`; failure shows CH-5006 with the fields kept. A coach-created goal sends the player one `coach_assigned_goal` through `dispatchCoachHelmNotification`, unchanged. Covers S-STATS.goals-sheets.
W-STATS-9. Suggestions and goal state. Accept and dismiss call `acceptGoalSuggestion` / `dismissGoalSuggestion` once (CH-5007 / CH-5008 on failure, row kept); pause and resume call `pauseGoal` / `resumeGoal` once (CH-5009). Each success redraws S-STATS.goals. Covers S-STATS.goals, S-STATS.goals-sheets.
W-STATS-10. Proposal answer. Accept and Decline call `acceptFocusArea` / `declineFocusArea` once, both buttons disabled while either runs; CH-5003 / CH-5004 on failure; RLS lets the player update only their own focus area. Covers S-STATS.goals-sheets.
W-STATS-11. Add focus area. Present only on S-STATS.coach; `createFocusArea` once; CH-5001 on failure; a player session cannot insert (`golf_player_focus_areas_insert_coach`). The player gets one `dev_plan_assigned` bell row (and email) to `/golf/dashboard/stats?tab=dev` and no push. Covers S-STATS.goals-sheets, S-STATS.coach.
W-STATS-12. Bell row arrival. Opening that bell row lands on S-STATS.goals in place, cold or warm; Back goes to the summary, then the bell's page. Covers 05 "Every way in".
W-STATS-13. Round push. A `round_submitted` push with a round id opens `/golf/dashboard/rounds/<id>`, unchanged; without an id it opens S-TEAMSTATS. Covers 05 "Every way in".
W-STATS-14. Share. Coach Share uses `navigator.share` or copies the profile link ("Link copied"); best card share sends the image; a closed sheet is silent; failures show CH-5002 / CH-5005. No write. Covers S-STATS.share.
W-STATS-15. Coach links. Message opens `messages?player=<id>` (the direct thread), Plan opens `calendar?new=1&with=<id>`, Insights `coachhelm?player=<id>`, all main's strings; none renders for a player. Covers S-STATS.coach.
W-STATS-16. Team links. A pinned row's second tap uses `teamPlayerHref`, a grid cell `legDetailHref`, the Players list opens today's `PlayerPeek`. Covers S-TEAMSTATS.player, .peek, .pin.
W-STATS-17. Home leg. With the flag on, each leg links to `ownLegHref(leg)` (`/golf/dashboard/stats#gm-<part>`, the only new helper); it opens that part with no slide and one Back reaches the Stats summary. With it off the legs are not links. Covers S-HOMEGAME.leg.
W-STATS-18. Hero marker. `data-ch-hero-flat` is on `PlayerHomePhone`'s root only when the flag is on and the flat hero renders. Covers S-HOMEGAME (cross-lane, CP-02.3).
W-STATS-19. Shot tracking. No file this lane changes writes `golf_rounds`, hole or shot rows, or changes what the scoring screens collect; a grep of the PR diffs for those table names in writes returns nothing. Covers every ID.
W-STATS-20. Nothing added. The PR diffs add no table, column, RPC, policy, migration, insert into `notifications` or `golf_notifications`, or push sender. Covers every ID.
