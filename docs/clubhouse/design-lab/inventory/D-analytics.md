# D — Analytics, charts, dashboards, tables (Clubhouse) — read-only forensic inventory

Slice D of the dsx-01 design-engineering investigation. Scope: every chart, visualisation and metric display in
`src/clubhouse/**`, the chart architecture under them, interaction, dashboards, tables, metric-integrity risks, missing
visualisation types, and a proposed shared chart architecture. Inventory only: nothing here redesigns, and nothing was changed.
Paths are relative to `/home/user/helmv3/src/clubhouse/` unless they start with `src/`. Evidence tags: **V** = verified (I read the
file or ran a read-only grep and saw the output); **I** = inferred (reasoned, not observed).

Sources read first: `src/clubhouse/AGENTS.md`, `.claude/rules/clubhouse.md` (the chart lines), `design/refresh/DESIGN_LANGUAGE.md`
(rules S2.1-S2.8, "Data marks" token table, lines 44-46, 97-107, 270), `memory/registry.yml` (`stats_analytics`, line 762, doc
`memory/features/stats-analytics.md`), `docs/clubhouse/QUEUE.md` (look-09, line 528).

---------------------------------------------------------------------------------------------------------------------------

## 0. Headline findings (read this if nothing else)

1. **The premise "charts use recharts 3 and d3-scale" is wrong for Clubhouse.** Zero Clubhouse source imports recharts or
   d3-scale, and a test pins it: `ui/charts/__tests__/one-line-chart.test.ts:10` (`hits(/['"]recharts['"]/ …)` must equal `[]`; its
   header says `TeamTrendChart` "was the last Recharts chart") (V). Recharts lives only in `src/components/fairway/charts/*`,
   `src/components/lifting/**`, `src/components/baseball/**`, `src/components/features/player-comparison.tsx`; `d3-scale` is used
   once, in `src/components/recruiting/USStateMap.tsx:4` (V; `package.json:255,277` carry both deps). Every Clubhouse chart is
   hand-drawn SVG, CSS-width bars, or one `<canvas>` (the share card). So "tooltip/axis from scratch" is not an exception here, it
   is the rule; the real question is how much is shared.
2. **There is exactly one shared chart component, `ui/charts/Line.tsx`, and it draws 5 of about 19 trend renderings.** I count at
   least 13 independent line/trend/spark implementations (section 2.2), 4 path builders, 5 tick generators, 3 scrub/pin
   implementations, 11 differently named legend/key classes, and 5 different treatments of the same "par / zero" reference line.
3. **Statistical honesty is the strongest part of the system** (`lib/stats-signal.ts`: floors, standard errors, a 2-SE colour
   rule, Wilson intervals, tied ranks; early reads drawn hollow). It is applied unevenly: the interval/n disclosure exists on
   3 charts (`LegBars`, `PuttBands`, `TeamRank`) and is absent on `Compare`, `ParTiles`, `FairwayStrip`, `FigureGauge`, Home's
   `Leg` (section 7).
4. **Home's headline chart (`ScoreChart`) is outside the contract** that the Nov 15 wave (#2541) established: index-spaced x
   (not date-spaced), no scrub, no keyboard reading, no table, raw `--ch-green-600` instead of `--ch-chart-line`, 2.4px stroke.
   Player Home is owner-locked ("the 28 Oct version, permanent", `AGENTS.md` of Clubhouse), so this needs an owner decision, not
   a quiet fix.
5. **Gold is overloaded**: it is the Tour tick (`OverviewZones.tsx` "The gold tick is the Tour"), the loss side of the leg bars
   ("a loss to the left in gold", `LegBars.tsx` doc), the below-baseline wash of the team trend (`--ch-stage-down` champagne-300,
   `stats.css:5662`), and the qualifying line (`--ch-chart-gilt`), while DESIGN_LANGUAGE says loss = amber (line 44). Four meanings
   on one hue family.
6. Red is correctly absent from data marks (V): the only `--ch-danger-600` uses in stats CSS are empty/notice states
   (`styles/stats-redesign.css:932,999`); the only chart red is the pin flag (`--ch-chart-flag`, tokens.css:181), as the law allows.

---------------------------------------------------------------------------------------------------------------------------

## 1. Inventory of charts, visualisations and metric displays

Legend: Renderer = SVG (hand-drawn) / CSS (positioned `<i>`/`<span>` bars, widths in %) / canvas. Role: C coach, P player, B both.
"Shared?" = built on `ui/charts/Line` (L) or `lib/use-chart-pin` (pin). Data source = the loader/type the screen receives (the
loader name is V where I opened it, I otherwise).

### 1.1 Line / trend family (continuous series over rounds, weeks, days)

| # | Component (file:line) | Type | Renderer | Question it answers | Screen / role | Data source |
|---|---|---|---|---|---|---|
| T1 | `ui/charts/Line.tsx:206` `Line` | line + optional wash, baseline, hollow early dots, scrub | SVG, viewBox 340x168 / 680x184 | "Which way is this going, relative to a reference?" | team phone trend (`TeamTrendChart.tsx`, C), leg small multiples (`StatsTeamIslands.tsx:844`, C), Deep dive strips (`coachhelm/views/DeepDive.tsx:97`, B), read page (`coachhelm/read/parts.tsx:272`, B), form lines in rows (`ui/FormLine.tsx`; `roster/Roster.tsx:915`, `home/Leaderboard.tsx:100`, `roster/RosterPeek.tsx:168`, C) | `ChTeamStats.weeks/legWeeks`, `ChPlayerLeg.trend`, roster `p.trend` (V types, I loader fields) |
| T2 | `stats/RoundTrend.tsx:22` | dots per round + 5-round mean line + par/zero ref | SVG 340x168 / 680x184, pin | "How did each round go and is the 5-round average moving?" | Stats Overview desktop (`OverviewZones.tsx:203,237`), Game/Rounds phone detail (`StatsPlayerPhoneShs.tsx:1177`), B | `trendRounds(ChProfileRound[])` `stats/round-trend.ts:99` from `loadPlayerProfile` (`data/stats-player.ts:240`) |
| T3 | `stats/ScoringFeatureChart.tsx:43` `ScoringFeatureChart` and `:298` `TeamFeatureChart` | dots + avg line + area, press-drag read, morph on window change | SVG, measured width (ResizeObserver, :61,:306), H=160 | "What is my scoring doing this window?" | Player phone Overview feature card (`StatsPlayerPhoneShs.tsx:512`, B), team phone (`StatsTeamPhoneShs.tsx:353`, C) | `TrendRound[]`, `ChTeamStats` days |
| T4 | `stats/ShsBlocks.tsx:39` `Ribbon` | line + 12% area + dashed ref, no axis ticks (min/max labels only) | SVG 300x120 `preserveAspectRatio="none"` + HTML dot | "Per-round shape of one figure (score, GIR, putts)" | phone detail cards: scoring/GIR/putts (`StatsPlayerPhoneShs.tsx:958,993,999`), team by-round-day (`StatsTeamPhoneShs.tsx:536`) | `x.series.*` from the detail loader (`data/stats-detail.ts`, I) |
| T5 | `stats/detail.tsx:180` `RoundLine` | line + dots + value labels + dashed avg + ref | SVG 690x150 | same as T4, older drawing (value labels, no ticks) | desktop Game/Rounds tabs (`GameDetail.tsx`, `RoundsExtra.tsx`, I) | `points[{label,value,at}]` |
| T6 | `stats/StatsTeamIslands.tsx:313` `TeamTrend` | multi-line (team + every player), team wash green/gold to reference, focus/peek, best-week marker | SVG 900x300 custom scrub (`:444`) | "Is the team improving, and who is moving it?" | Team Stats desktop, C | `ChTeamCharts` (`weeks`, `players[].sg/score/toPar`, halves) from `loadTeamStats` (`data/stats-team.ts:199`) |
| T7 | `home/PlayerGame.tsx:225` `ScoreChart` | line + gradient area + par hatch below par + mean dotted + per-dot value labels + pin flag | SVG 340x196 / 760x340, no interaction | "How have my last N scores sat against par?" | Player Home "Your scoring" (P), Coach Home "Team scoring" (`home/TeamScoring.tsx:121`, C) | `ChPlayerHome.scoring`, `ChTeamForm.line/lineDays` (`data/home.ts`, `data/player-home.ts`) |
| T8 | `home/PlayerGame.tsx:457` `Spark` | smooth line + area + mean guide + HTML dot, "Improving/Slipping/No clear change" | SVG 240x44 `preserveAspectRatio="none"` | "Is each leg (fairways, greens, scrambling, putts) trending?" | Player Home "Your game" (P) | `ChPlayerLeg.trend` |
| T9 | `stats/TeamTape.tsx:110` `TapeCell` | sparkline + area under a KPI with a dial | SVG 200x46 | "KPI plus its weekly shape, scaled so noise stays flat" | Team Stats overview "tape", C | `ChTeamStats.figures[].series` |
| T10 | `rounds/parts.tsx:224` `Ribbon` (a second component of the same name) + `:488` `SeasonStage` + `:546` `MonthSpark` | per-round ribbon vs average; month bars | SVG + CSS | "How has my season gone, month by month?" | Rounds library, P | `ChRoundsSeason.ribbon` (`data/rounds.ts:128`) |
| T11 | `rounds/RoundZones.tsx:86` `ScoreFlow` + `rounds/CourseArc.tsx` | cumulative score to par across 18 holes, worst-hole label, key stepping | SVG, keyboard (`flowKeyStep` :58) | "Where in the round did it turn?" | Round review (B), course page average arc (P) | `ChReviewHole[]` (`data/round-review.ts`) |
| T12 | `coachhelm/team/CourseCard.tsx:31` `Trend` | weekly line, lowest on top | SVG | "How has the team scored on this course over weeks?" | CoachHelm Team > Course tab, C | `loadCourseHistory` (`data/course-history.ts:38`) |
| T13 | `coachhelm/chat/studio/drawings.tsx:208` `RuledTrend` | ruled line, `drawIn` opt-in, ChartTable | SVG 318 wide | "Show this metric's trend inside an Ask answer" | CoachHelm chat (B) | chat `TrendBlock` |
| T14 | `tournaments/History.tsx:195` review trend | line in runs, dividers between events, mean | SVG `preserveAspectRatio="none"`, `vectorEffect` | "Scoring form across events" | Tournaments history/review, C | `loadTournamentHistory` (`data/tournaments.ts:645`) |
| T15 | `live/MomentumLine.tsx` | 56x20 cumulative to-par over holes | SVG | "Is this live round trending up or down" | Live lanes (Home live card, qualifiers live), B | `LiveLane.holes` |
| T16 | `stats/PlayerStage.tsx` (`ch-fm`) | per-round column bars from own average, lower higher, pin/arrow read | CSS bars + pin | "Recent form relative to my average" | Player/coach scoring form, B | `StageRound[]` |

### 1.2 Bars, ranks, diverging, ladders, gauges

| # | Component | Type | Renderer | Question | Screen / role | Data |
|---|---|---|---|---|---|---|
| B1 | `stats/LegBars.tsx:26` | diverging bars from a zero, SE whisker, team mark, hollow early, `useFirstViewGrow`, `useGlide` | CSS + pin | "Which part of the game gains/loses strokes?" | Stats Overview (`OverviewZones.tsx:178`), B | `SgLegRow[]` (`leg-rows.ts`) |
| B2 | `stats/MiniCharts.tsx:9` `MiniDiverging` | 4 mini diverging rows | CSS | same, summary-card size | player SG card (`StatsPlayerPhoneShs.tsx:660`), team (`StatsTeamPhoneShs.tsx:396`) | same |
| B3 | `stats/MiniCharts.tsx:60` `MiniRails`, `:98` `HBars` | 0-100 rails with Tour tick | CSS | "Where do I sit on a rate vs the Tour?" | part cards and detail (`GameDetail.tsx:765,877,955`, `GameMore.tsx:326,351`) | calculator bands |
| B4 | `stats/charts.tsx:274` `Compare` | plain relative bars (max = row max unless `max` given) | CSS | "Rank these values" | GameDetail (:712,827,889,901,981,988), GameMore (:167,361) | misc |
| B5 | `stats/charts.tsx:310` `BandRows` / `:342` `Ladder` | distance-band ladders with Tour bench | CSS (phone `BandRows`) | "How does GIR/proximity change by yardage?" | GameDetail (:769,783,806) | `ChLadder` rows |
| B6 | `stats/TeamRank.tsx` + `team-rank.ts` | ranked dot plot with SE whiskers, ties ("T3"), metric Select, open player | CSS + pin | "Who gains/loses strokes on the team?" | Team Stats (desktop + `phone`), C | `ChTeamStats.grid` |
| B7 | `stats/ScoreMixBar.tsx:18` | 100% stacked bar by result, par in middle | CSS + pin | "What share of holes are birdies/bogeys/doubles?" | Overview (`OverviewZones.tsx:243`), GameDetail:629, GameMore:94 | `MixCounts` (`mix-rows.ts`) |
| B8 | `stats/charts.tsx:52` `FigureGauge` | 6px track gauge vs reference (SG/par/rate/putts/holes) | CSS | "Where does this number sit vs its reference?" | KPI heads (`StatsPlayerPhoneShs.tsx:939,1098`), TeamTape dial | `ChGauge` |
| B9 | `stats/charts.tsx:210` `ParTiles`, `stats/OverviewZones.tsx:548` `ParDots` | 3 tiles / dot row for par 3/4/5 average | CSS/HTML | "Do I play par 3s worse than par 5s?" | GameDetail:573,634; Overview:245 | par-type averages |
| B10 | `stats/charts.tsx:234` `FairwayStrip`; `detail.tsx:343,359` `teeSides`/`SectorGrid` | 100% strip left/FW/right; 3x3 sector grid | CSS | "Where do tee shots finish?" | Overview:286, GameDetail:706 | `ChSprayGroup` |
| B11 | `stats/charts.tsx:385` `GreenMiss`, `:417` `CupMiss`, `OverviewZones.tsx:585` `GreenDiagram` | 8-sector miss diagrams | SVG/CSS | "Which way do approaches/putts miss?" | Approach/putting | miss counts (`miss-split.ts`) |
| B12 | `stats/PuttBands.tsx:39` | dots with Wilson 95% whiskers by distance band + Tour line | CSS + `<svg>` tour polyline, pin, `useGlide` | "How reliable is my make rate by distance?" | Overview:523, GameDetail:967, phone `compact` | `puttBandViews` (`putt-bands.ts`) |
| B13 | `stats/charts.tsx:158` `PuttingRings` | concentric rings, fill = rate | SVG 360x256 | "Putting by distance, at a glance" | Team stats `StatsTeam.tsx:284` | bands |
| B14 | `stats/MiniCharts.tsx:196` `RoundTicker`, `:219` `RoundStrip`, `:238` `GoalBar` | one mark/cell per round; goal progress rail | SVG/HTML | "Rounds in window; progress to goal" | player summary cards (:822,:872,:1193), Goals | `tickerRounds(data)` |
| B15 | `tournaments/compare/CompareGrid.tsx:35` `Strip` | dot strip per metric, bar = own mean, dashed other | CSS | "Event A vs event B, round by round" | Tournament compare, C | `loadTournamentCompare` (`data/tournaments.ts:879`) |
| B16 | `tournaments/compare/Timeline.tsx` | draggable date-range timeline of rounds/events | CSS | "Which period am I comparing?" (a control, but also a time axis) | Tournament compare, C | `ChTourCompareRound[]` |
| B17 | `qualifiers/StandingsSpread.tsx` | number line, one coin per player at to-par | CSS | "How spread is the field?" | Qualifier detail, B | leaderboard rows |
| B18 | `qualifiers/RoundsShowcase.tsx:186,198,298` `holeBars`, `RoundVisual`, `FieldStrip` | per-hole bars vs par (capped, broken), field strip | CSS | "Which holes cost this player?" | Qualifier detail, B | `ChQHole[]` |
| B19 | `rounds/RoundZones.tsx:386-505` `HitRow`, `TeeToGreen`, `PuttingViz`, `ShotTrail`, `rounds/RoundReview.tsx:165` nine tables | per-hole hit/miss rows, putting per hole, shot trail | SVG/CSS | "What happened hole by hole?" | Round review, B | `ChReviewHole[]` |
| B20 | `coachhelm/file/cards.tsx:376` `SgCard`; `coachhelm/team/panels.tsx:55` `Comparison`; `:105` `ReadEvidence` | you/team/Tour bars from zero (`zeroBars`), score strip (`parColumns`), penalties | CSS | "How does this read compare?" | CoachHelm file, Team sheet, C (+P in Standing) | `ChInsight.compare` |
| B21 | `coachhelm/team/Stories.tsx:49` `storyAxis` | before/now/target on one axis | CSS | "Did the focus move the way it was asked?" | CoachHelm Team stories, C | focus rows |
| B22 | `coachhelm/views/Standing.tsx`, `TrackRecord.tsx` | two-way bars vs Tour/team; claim-level rates with target | CSS | "Where do I stand; how often were CoachHelm's claims right?" | CoachHelm Standing (P), Track record (C) | `loadPlayerStanding` (`data/coachhelm-standing.ts:187`) |

### 1.3 Spatial / drawn-hole and composite visuals

| # | Component | Type | Renderer | Role |
|---|---|---|---|---|
| S1 | `coachhelm/team/TeamHole.tsx:48` | the team as coins on a drawn hole (replaces the signal-list board) | SVG, ResizeObserver | C |
| S2 | `coachhelm/team/Huddle.tsx:146`, `Cards.tsx`, `SpotCard.tsx` | huddle chart, spot cards | SVG | C |
| S3 | `coachhelm/chat/studio/MissCompass.tsx`, `chat/visual/blocks.tsx:19` `MissPattern` | 8-cell miss compass | SVG/HTML | B |
| S4 | `coachhelm/chat/visual/blocks.tsx:83` `SeasonCompare`, `:133` `HoleStrip` | this season vs last season range rows; hole strip | SVG | B |
| S5 | `coachhelm/chat/studio/drawings.tsx:80` `HolePlan` | legs placed on a hole drawing | SVG | B |
| S6 | `rounds/track/parts.tsx:190` `HoleMap`, `rounds/HoleMap.tsx` | shot map per hole (measured, list fallback at large text) | SVG | B |
| S7 | `stats/BestCard.tsx:25` `drawBestCard` | 1080x1350 share card | **canvas** (the only one) | P |
| S8 | `ui/Nine.tsx`, `rounds/card/RoundCard.tsx:132,176`, `rounds/RoundReview.tsx:165` | scorecard tables with `ScoreMark` | `<table>` | B |

### 1.4 KPI / metric display components (no plot)

`stats/SummaryCard.tsx:61` `SummaryCard` (pushes detail) and `:132` `ShsCard` (look-09 option F title bar); `ui/DeltaChip.tsx`;
`stats/charts.tsx:120` `SgChangeChip`; `home/TeamScoring.tsx:67` four figures (`dl.ch-ph-figs`); `home/TeamGame.tsx:62`,
`home/TeamLegs.tsx:97,215`; `home/RoundViz.tsx` `GirViz/PuttsViz/SgViz`; `home/LatestRound.tsx:24` `Nine`; `home/Leaderboard.tsx`;
`stats/TeamTape.tsx:74` (6 KPI cells); `stats/detail.tsx:101` `Tiles`.

**Counts (V):** 82 `<svg` elements and 46 files with `role="img"` under `screens ui live`; 19 files draw trend-like marks; 1 canvas.

---------------------------------------------------------------------------------------------------------------------------

## 2. Chart architecture

### 2.1 What is shared (V)

| Layer | Shared piece | File | Used by |
|---|---|---|---|
| Frame | **none.** There is no chart surface/frame component. Frames are page cards (`SummaryCard`/`ShsCard`/`Zone`/`Vis`/`Panel`/`YardagePage`) that each chart is dropped into. | `stats/SummaryCard.tsx`, `stats/OverviewZones.tsx` `Vis`, `stats/detail.tsx:45` `Panel`, `stats/charts.tsx:22` `YardagePage` | 4 frame vocabularies |
| Line chart | `Line` (props: `lowerIsBetter`, `domain`, `baseline`, `early`, `marks`, `wash`, `readAt`, `ends`, `interactive`, `table`, `drawIn`) | `ui/charts/Line.tsx:206` | T1 only (5 screens) |
| Axis presets | `lineTicks` (<=3 round ticks, steps 0.5-25, `Line.tsx:73`), `lineDomain` (pad 12%, min 0.5, :87), `slotPositions` (time-true x with min gap, :40), `spreadLabels` (:143), `placeRefLabel` (:166) | `ui/charts/Line.tsx` | `RoundTrend` borrows `slotPositions` only; `StatsTeamIslands` borrows `lineTicks`; `file/cards.tsx`, `drawings.tsx` borrow `lineY`/`linePath` |
| Interaction | `useChartPin` (hover/arrow/tap-pin/scrub with 8px threshold, haptic ticks, aria-live only on pin) `lib/use-chart-pin.ts:26` | | `Line`, `RoundTrend`, `LegBars`, `PuttBands`, `TeamRank`, `ScoreMixBar` (6) |
| Tooltip | **no tooltip component.** Pattern is a "readout line" above the plot (`.ch-line__read`, `.ch-sv-read`) or a `tip` over the top corner (`readAt="tip"`); drawn per chart | | 6 CSS classes (section 2.3) |
| Legend | **no legend component.** 11 distinct key/legend class names | | section 2.3 |
| A11y alt | `ChartTable` (visually hidden `<table>`, caption + rows) `ui/charts/ChartTable.tsx:6`; `ChartText` (viewBox-unit text, `ui/charts/ChartText.tsx`) | | `Line`, `RoundTrend`, `LegBars`, `drawings.tsx` (4 files) |
| Palette | `--ch-chart-*` tokens (`styles/tokens.css:165-184,766-809,850`; documented DESIGN_LANGUAGE.md:97-112): gain, loss, gain-fill, loss-fill, flat, line, zero, separator-chart, track, par, gilt, flag, bogey, fairway, rough, paper | | partial (2.4) |
| Number formats | `lib/format.ts`: `formatSigned` (true minus, no -0.0, `:24`), `formatFixed` (:110), `formatPct` (:72), `formatSG` (:83), `formatHcp`, `formatDistance`, `formatPlace`, `trueMinus` (:116), `changeTone/Ink/Verdict` (:41-53), `versusTeam` (:63); `formatToPar` re-exported from `src/lib/golf/format-to-par.ts:14`; `lib/sg.ts` (`sgScale`, `sgShare`, `sgBaseline`); `lib/stats-signal.ts` | | widely used, with the leaks in 2.5 |
| Motion | `useGlide` (window-change glide), `useFirstViewGrow` (bars, once per screen per session; `lib/motion-glide.ts:113`) | | `LegBars`, `PuttBands`, `Line`, `StatsTeamPhone` (12 `useGlide` call sites) |
| States | `EmptyState` (coded `CH-xxxx`), `NoData` (`—`), `RefreshNotice`, `SectionBoundary` (per-section error), `useBusy` skeleton (150 ms delay, 300 ms hold) | `ui/States`, `ui/NoData.tsx`, `ui/SectionBoundary.tsx` | broad |

### 2.2 How many charts build their own axes / path / tooltip (V counts)

- **Trend renderers that do not use `Line`:** T2 `RoundTrend`, T3 `ScoringFeatureChart`+`TeamFeatureChart`, T4 `Ribbon` (stats), T5 `RoundLine`, T6 `TeamTrend`, T7 `ScoreChart`, T8 `Spark`, T9 `TapeCell`, T10 `Ribbon` (rounds), T11 `ScoreFlow`+`CourseArc`, T12 `CourseCard Trend`, T14 `History` trend, T15 `MomentumLine`, T16 `PlayerStage`. That is **14 renderers (15 components)** next to 5 `Line` consumers. `RoundTrend` is the clearest duplicate: same 340x168 / 680x184 box, same `PAD = {l:34,r:14,t:14,b:24}` (`RoundTrend.tsx:14` vs `Line.tsx:61`), same `useChartPin` inset, its own `niceTicks` (`round-trend.ts:58`) next to `lineTicks`.
- **Path builders:** `linePath` (`Line.tsx:~110`), `gappedPath`/`gappedArea`/`lonePoints` (`lib/chart.ts:52,60,68`), `straightPath` (`stats/shs-figures.ts:233`), `monotonePath` (`lib/chart.ts:5`, used once, `PlayerGame.tsx:474`), plus inline `d += ' L…'` string loops in `ScoreChart` (`PlayerGame.tsx:~275`), `RoundLine` (`detail.tsx:228`), `History.tsx:~203`, `rounds/parts.tsx`, `CourseCard.tsx`. **4 helpers + >=5 inline.**
- **Tick/axis generators:** `lineTicks` (`Line.tsx:73`), `niceTicks` (`round-trend.ts:58`), `scoreTicks` (`PlayerGame.tsx:211`), `ruledSpan` (`drawings.tsx:170`), `rankTicks` (`team-rank.ts:~125`), `legScale` (`StatsTeamIslands.tsx:806`), inline step logic in `ScoringFeatureChart.tsx:~88` (`step = hi-lo>10?4:…`). **7.** Label-thinning: `spreadLabels`, `thinLabels` (`StatsTeamIslands.tsx:774`), `axisLabelIndexes` (`PlayerGame.tsx:198`) = 3.
- **Time-true x spacing:** `slotPositions` (`Line.tsx:40`), `dateShares` + `weekShares` (`lib/chart.ts:91,77`); `ScoreChart` ignores all three and spaces by index (`PlayerGame.tsx:260`) (V).
- **Interaction implementations:** `useChartPin` (6 users), `ScoringFeatureChart` hand-rolled press-hold (HOLD_MS 120, SIDEWAYS_PX 6, `:16-17`, handlers at ~:185-230; `role="slider"` with `aria-valuetext`), `TeamTrend` pointer-only `onScrub` (`StatsTeamIslands.tsx:444`), `ScoreFlow` (`flowKeyStep`), `Timeline` pointer+keyboard. **5 behaviours, 3 thresholds** (8 / 6 / 120 ms hold).
- **Responsive geometry:** no `ResponsiveContainer`; every chart is a fixed viewBox scaled by CSS width (340/680, 300, 200, 240, 360, 690, 760, 900). Only `ScoringFeatureChart` (`:61,:306`), `TeamHole`, `HoleMap`, `RoundZones` (`:491`) measure with `ResizeObserver`. Consequence (I): in-SVG text size scales with the container, which is why `ChartText` and `.ch-line__t` re-pin type sizes in CSS px and `ScoringFeatureChart` reads `--ch-type-k` in JS (`readTypeK`, `:48`) while `Ribbon` multiplies `calc(124 * var(--ch-type-k))` in a style (`ShsBlocks.tsx:~105`). Three text-sizing strategies for SVG labels.

### 2.3 Legends and readouts (V class names)

Legend/key: `ch-line__key`, `ch-lb__key` (LegBars:115), `ch-fm__key` (PlayerStage:123), `ch-sv-pb__key` (PuttBands:133), `ch-sgt__legend` (StatsTeamIslands:532), `ch-lg__key` (:930), `ch-sv-tr__key` (TeamRank:175), `ch-shs-legend` (StatsPlayerPhoneShs:513), `ch-zlegend` (OverviewZones:187), `ch-tour-cmp-tl__legend` (Timeline:136), `ch-shs-tour-key` (MiniCharts). **11.** All `aria-hidden` (the words are carried elsewhere). Readout line: `.ch-line__read`, `.ch-line__tip`, `.ch-sv-read` (RoundTrend), PuttBands/LegBars/TeamRank/ScoreMixBar each re-render their own header line.

### 2.4 Palette tokens

- The `--ch-chart-*` set is complete and contrast-pinned (DESIGN_LANGUAGE.md:97-112; `__tests__/contrast-tokens.test.ts`).
- Aliases: stats redesign re-maps them as `--ch-shs-s-gain-fill/loss-fill/flat` (`stats-redesign.css:27-29`) and on the deep-green card `--ch-feature-*` (`:258-260`); Home has `--ch-spark` (`home.css:2156-2162`); team trend has `--ch-st-*` and `--ch-stage-up/down` (`stats.css:4227-4238,5661-5662`). Alias layers are fine; the problem is bypasses.
- **Bypass count (V):** `grep var(--ch-chart-` in `.tsx` under `screens ui` = **7**; `var(--ch-green-*|--ch-ivory-*|--ch-champagne*)` in chart `.tsx` under stats/home/rounds/coachhelm/tournaments = **21** (e.g. `detail.tsx:228,233` `--ch-green-700`; `StatsTeamIslands.tsx:600,623,642`; `charts.tsx:177`). CSS-side: `home.css:1823-1870` draws the Home chart with `--ch-green-600`, `--ch-ivory-25`, 2.4px; `stats.css:4238` has a raw hex `#b4dfc4`; `stats.css:4227` `rgb(28 25 18 / 0.35)`; `home.css:2184` `rgb(28 25 18 / 0.14)`.
- Stroke widths for "the series line": `Line` 2 (`ui.css:1938`), team phone override 2.2 (`stats.css:4496`), `RoundTrend` mean 2 (`stats.css:6146`), feature avg 2.5 (`stats-redesign.css:1798`), Home chart 2.4 (`home.css:1851`), Spark 2 (`home.css:2188`). DESIGN_LANGUAGE.md:270 says 2px.

### 2.5 Number formatting: shared utilities and leaks (V)

Shared and good: `formatSigned`, `formatFixed`, `formatPct`, `formatToPar`, `trueMinus`, `changeTone` (rounds-to-zero is never toned, `format.ts:41`). `tournaments/format.ts:14` re-exports them, so tournaments is clean. Leaks:

| Where | What | Issue |
|---|---|---|
| `coachhelm/file/cards.tsx:42` | `fmt = formatFixed(v, unit==='%' ? 0 : |v|<10 ? 1 : 0)` | digit rule: <10 gets 1 dp |
| `coachhelm/team/panels.tsx:61` | `fmt = formatFixed(v, unit==='%' ? 0 : |v|<10 ? 2 : 1)` | same idea, **different precision** (2 dp / 1 dp) for the same read in the file sheet and the team sheet |
| `coachhelm/team/Stories.tsx:22` | `signed = formatFixed(v).replace('-', '−')` | `formatFixed` already emits the true minus: dead code, and unsigned `+` rule differs from `formatSigned` |
| `coachhelm/team/CourseCard.tsx:21,88` | local `toPar` and `signed2` | re-implement `formatToPar` / `formatSigned(v,2)` |
| `coachhelm/chat/visual/blocks.tsx:84` | `fmt = (v>0?'+':v<0?'−':'') + formatFixed(abs,1)` | re-implements `formatSigned`; `0.04` prints "+0.0" there but "0.0" in `formatSigned` |
| `home/PlayerGame.tsx:412` | `Leg.fmt = v.toFixed(g.digits)` | bypasses `formatFixed` (no true minus, no -0 guard) |
| `home/TeamGame.tsx:65`, `home/TeamLegs.tsx:26` | local `fmt` per stat unit | three copies of "unit % -> round, else digits" |
| `stats/shs-figures.ts:50` | local `pct` (no `%`) | |
| `rounds/RoundReview.tsx:57` | `pct = Math.round(hit/of*100)%` | no NaN guard when `of`=0 (I), not `formatPct` |
| `stats/team-rank.ts:122` | `formatRankValue` score `toFixed(1)` | non-negative so benign, but a fourth path |
| `stats/GameMore.tsx:23`, `GameDetail.tsx:42` | `const pct = formatPct` | fine, alias |

Raw `.toFixed(` in `screens ui` (excluding tests) = 37 lines in 20 files (V), of which auth scene geometry, settings and messages are not stats; about 12 are stats/coachhelm figures.

### 2.6 Empty / loading / error / missing data (V)

Strong: null is a gap, never a zero (`Line.tsx` doc; `gappedPath`); "No figure" in readouts; `NoData` dash; `EmptyState` with codes (`CH-5302` filtered window, `CH-5309` needs shots, `CH-4303/4304` team); `FLOORS` (`lib/stats-signal.ts:41`) per stat with `none/early/steady`; hollow early dots; a one-round score trend keeps its frame (`RoundTrend.tsx:51`); per-section `SectionBoundary` and `RefreshNotice` (`CH-2216`). Weak/uneven: `Ribbon` returns `null` for no points (`ShsBlocks.tsx:~60`) while `RoundTrend` returns a coded empty state; chart-shaped skeletons exist per page (`StatsSkeleton.tsx`, `ShsSkeleton.tsx`, `HomeSkeleton.tsx`) but not per chart; `Compare`/`ParTiles` have a dash but no early state.

### 2.7 Accessible alternative (V)

`ChartTable` (AX-17) is rendered by 4 files only (`Line`, `RoundTrend`, `LegBars`, `drawings.tsx`). Others give: `aria-label` summary (RoundLine lists every value, `detail.tsx:~214`), `role="slider"` + `aria-valuetext` (`ScoringFeatureChart.tsx:178`), arrow-key readout + `aria-live` on pin (`useChartPin` users), or nothing beyond a summary (`Ribbon` is `aria-hidden`, `Spark` has a label only, `ScoreChart` has a label only, `TeamTape` cells are `aria-hidden` charts beside text). No chart exposes a "view as table" affordance to sighted users (I).

---------------------------------------------------------------------------------------------------------------------------

## 3. Chart visual anatomy per family

| Property | `Line` (T1) | `RoundTrend` (T2) | Feature (T3) | `Ribbon` (T4) | `ScoreChart` (T7) | `Spark` (T8) | `TeamTrend` (T6) |
|---|---|---|---|---|---|---|---|
| Axis type | 11px (12px phone) `--ch-type-11-medium`, tabular, tertiary (`ui.css:1925`) | `.ch-sv-rt__t` (own) | JS-scaled by type-k | min/max only, `calc(124*k)` | 11px 600 values + axis (`home.css:1823`) | none | `.ch-tick` 15*k on phone (`stats.css:560`) |
| Ticks | <=3, 0.5-25 step | `niceTicks` ~3 | step 1/2/4 by span | 2 (best/worst) | `scoreTicks` max 6 phone / 8 desktop | none | `lineTicks(...,6)` (`:360`) |
| Gridline | dashed 2 4, 1px, `--ch-separator-chart` (`ui.css:1900`) | solid 1px hairline (`stats.css:6130`) | (I) | solid `--ch-shs-s-sep` 1px, 3 lines | none | none | solid `--ch-ivory-200` @0.7 (`:600`) |
| Series stroke | 2px round, `--ch-chart-line` | mean 2px **ink** (`--ch-text-primary`); points are the scores | 2.5px | 2px | 2.4px green-600 | 2px `--ch-spark` | per player; team `--ch-st-team-line` |
| Curve | straight | straight | straight | straight | straight | **monotone cubic** (`PlayerGame.tsx:474`) | straight, gaps broken |
| Area | optional 16%->0% gradient, or flat 8% to baseline | none | area under avg | 14% flat | gradient + par hatch below par | gradient | gradient to reference, green above/gold below (`:576-590`) |
| Markers | 3px dots, 5 active; `marks` all/last/trail; hollow = early | 3px, 3.6 last, hollow = early | dots + avg | last dot HTML | 3.4px; under-par filled gain; 5 last | last dot HTML | lone points, team end dot |
| Data labels | readout above or tip | readout above | readout in card | none | **value above every dot** (<=10 pts), collision-dodged | none | end figures per player |
| Reference | baseline ink 1px, dashed optional, `placeRefLabel` avoids line | par/zero dashed `2 3` border-strong | par dashed | dashed ref | par solid 35% + hatch; mean dotted | mean faint | dashed champagne `4 4`, "Par"/"Tour" label |
| Comparison period | none | none | none | none | none | none | none (halves are words, not overlays) |
| Selected state | active dot r5 + guide line; pin | same + "Open round" | press-read | none | none | none | focus/peek line turns green, others fade to .12-.28 |
| Responsive | viewBox scale | viewBox scale | measured | viewBox + `non-scaling-stroke` | viewBox | `non-scaling-stroke` + HTML dot | viewBox 900x300 |
| Animation | none (glide on window change; `drawIn` opt-in) | none | morph on window change (360ms) | none | none | none | none; fade on peek |

Bar/rail family: tracks 6px (`FigureGauge`), `--ch-chart-track` with 1px ring (`styles/tokens.css:774`), zero rule 1px dashed `--ch-chart-zero`, Tour tick `ch-shs-tour`, hollow = early (`.is-early`), whisker = 1 SE (`LegBars`, `TeamRank`) or Wilson 95% (`PuttBands`), first-view grow 360ms (`useFirstViewGrow`), glide on window change.

Reference-line treatments for the same idea ("par" or "zero"/"Tour baseline") = **5**: `Line` ink 1px (`ui.css:1905`), `RoundTrend` border-strong dashed `2 3` (`stats.css:6134`), `ScoreChart` text-primary 35% solid + hatch (`home.css:1840`), `RoundLine` `--ch-chart-zero` dashed `3 4` (`detail.tsx:219`), `TeamTrend` `--ch-champagne-500` dashed `4 4` (`StatsTeamIslands.tsx:623`).

---------------------------------------------------------------------------------------------------------------------------

## 4. Interaction

| Capability | Where it exists (V) | Where it is missing (V/I) |
|---|---|---|
| Hover read | `useChartPin` charts (mouse/pen only; touch has no hover, `use-chart-pin.ts:~85`) | `ScoreChart`, `Ribbon`, `Spark`, `RoundLine`, `TeamTape`, `ParTiles`, `Compare`, `FairwayStrip` |
| Touch scrub | `useChartPin.area` (8px, mostly-sideways, `touch-action: pan-y`, haptic tick per point); `ScoringFeatureChart` own (press-hold 120ms); `TeamTrend` `onScrub` (pointer move) | all others; thresholds differ (8px vs 6px vs hold) |
| Tap-to-pin | `useChartPin` (tap pins, again unpins, Esc/outside clears) | feature chart releases to the average instead |
| Crosshair | `ch-line__guide` (Line), `ch-sv-rt__guide`, scrub tick | none elsewhere |
| Keyboard to points | arrow/Home/End/Esc on `Line`, `RoundTrend`, `LegBars`, `PuttBands`, `TeamRank`, `ScoreMixBar` (6); `slider` on the feature chart; `ScoreFlow`; `DataTable` rows J/K (`ui/DataTable.tsx`); `Timeline` | `ScoreChart`, `Ribbon`, `RoundLine`, `TeamTape`, desktop `TeamTrend` points (the legend buttons, `StatsTeamIslands.tsx:~715`, are the keyboard path to a player) |
| Drill-down | `RoundTrend` pinned -> "Open round" (`RoundTrend.tsx:~120`); `TeamRank` pinned -> "Open player"; `LegBars` `onOpen(label)`; `SummaryCard` whole card pushes a `#gm-*`/`#sd-*` detail (`stats/detail-route.ts:1-60`); `CompareGrid` value -> "rounds behind it"; `CourseCard` rows | no chart -> hole -> shots path; `ScoreChart` dots are not links; `PuttBands`/`ScoreMixBar` dots do not open the shots behind a band |
| Cross-filtering | `TeamTrend` focus/peek drives its legend, note, grid (`StatsTeamIslands.tsx:372`); `focus` shared with `LegGrid` (:254) | no chart filters another; clicking a leg bar opens the leg, does not re-scope trend |
| Filters | `ChFilter` (`data/stats-filter.ts:89`): window (last 5/10/20, season, qualifier rounds), all-time `span`, event type (`types`), 9/18 holes, date range, courses, a pick list (`PICK_MAX` 100); `WindowSwitch`, `StatsFilter` (498 lines), Home `HomeSpanSwitch`; team lens switch (Strokes gained / Scoring) `StatsTeamIslands.tsx:545` | Home has window only (last10/season/all); chart-level zoom/brush: none |
| Comparison period | text deltas "vs previous 10" (`deltaWords`), `AgainstBefore` card (`ShsBlocks.tsx:133`), `compare.previousRounds` | no overlaid prior-period series on any trend; season-over-season only in chat `SeasonCompare` (`blocks.tsx:83`) |

---------------------------------------------------------------------------------------------------------------------------

## 5. Dashboards

### 5.1 Player Home (P) — `home/PlayerHome.tsx`, `PlayerHomePhone.tsx` (V order from `PlayerHome.tsx:77-130`)
Order: head -> coach asks -> This week -> next event -> latest round (`LatestRound`, mine) -> "Your scoring" (`ScoreChart`, 4 figures) -> "Your game" (4 `Leg` cards, each value + SG chip + `Spark` + Tour bench rail). Primary = scoring line and average; supporting = 4 legs. KPI uniformity: the four legs are uniform (same `Leg` card); the four scoring figures are a `dl`. Time comparison: last 10 vs Tour only; "Improving/Slipping" word from `halvesChange` (`PlayerGame.tsx:~470`). Definitions: none on Home (no `StatTerm`). Drill: none from the chart; legs are not links (I, no `href` in `Leg`). Mobile: single column, `phone` flag shrinks `ScoreChart` to 340x196 and drops value labels' pin flag. Locked by owner ("Do not restyle it").

### 5.2 Coach Home (C) — `home/CoachHome.tsx:48-120`
Order: head -> class line -> live now -> queue cards -> This week -> latest round -> Team scoring (`ScoreChart` + 4 figures: Average, Greens, Putts, Rounds) -> The team's game (`TeamGame`/`TeamLegs`). Rank by weight: queue/actions first (not analytics); scoring is below the fold on phone (I). Figures use `deltaTone` against previous 10 with SE (`TeamScoring.tsx:70-72`). `partOf` shows "n of N rounds" where the basis differs (`:84`), good n disclosure. Table `TeamLegs.tsx:122` for desktop, cards for phone.

### 5.3 Player Stats — phone (`StatsPlayerPhoneShs.tsx`, V :262-330) and desktop (`StatsPlayer.tsx`, tabs `overview|game|rounds|dev`, :65)
Phone order: window/filter -> early/no-shots notes -> **Overview**: Scoring feature card (`ScoringFeatureChart`) -> What changed -> At a glance -> **Your game**: Strokes gained card (`MiniDiverging`) -> four part cards (tee, approach, short, putting; `MiniRails` + key figure) -> Round by round (`RoundStrip`) -> Development (goals, `GoalBar`). Each card is a `SummaryCard` that pushes a detail (`#gm-*`, `#sd-*`; `detail-route.ts`). Details: header figures card ("The figures", the one green feature card, look-09), "You and the Tour"/"In short", visuals, "What this counts" (`How` text, `SHS_HOW`), `AgainstBefore`. Desktop Overview = 7 zones (SG, Scoring, Off the tee, Approach, Short game, Putting, Last rounds; `OverviewZones.tsx:141-533`) each a `Zone` with `Vis` blocks.
Primary: scoring and SG. KPI uniformity: part cards share one card shell but the mini-visual differs per card (`MiniDiverging`, `MiniRails`, `RoundStrip`, `GoalBar`), by design ("make it specific to what it is displaying", `MiniCharts.tsx:204`). Definitions: `StatTerm` only at `GameDetail.tsx:218,286`, `StatsPlayer.tsx:409`, `TeamTape.tsx:136`, `StatsTeamPhoneShs.tsx:493` (5 call sites, V) plus the `HowToggle` prose; `STAT_DEFINITIONS` (`lib/stat-definitions.ts:58`, 16 keys, F-07) is not reached from Home, Rounds, CoachHelm, Tournaments.

### 5.4 Team Stats (C) — `StatsTeam.tsx`, `StatsTeamPhone(+Shs).tsx`, `StatsTeamIslands.tsx`
Desktop: filter/window -> `TeamTape` (KPI cells with dial + sparkline) -> `TeamTrend` (lens SG/Scoring, players as lines) -> `LegTrends` (4 small multiples sharing one scale, `legScale` :806) -> `TeamRank` dot plot -> `LegGrid` ledger table (CSV). Phone: Scoring average feature card (`TeamFeatureChart`) -> SG by leg (`MiniDiverging fixedScale={4}`) -> players card -> three details (`tscore|tgame|tplayers`). Strong: shared scales, SE whiskers, ties. Weak: the one-chart-many-lenses `TeamTrend` is a 450-line bespoke renderer.

### 5.5 CoachHelm boards (C/P)
Team board = the drawn hole (`TeamHole`, coins per player), Huddle, Stories (before/now/target axes), Course tab (`CourseCard`). Player file (`file/cards.tsx`): FeatureCard (one green card: top read, comparison, evidence), SgCard, ReadsCard, TrackCard. Standing (P): two-way bars vs Tour/team. Chat visuals: `RuledTrend`, `MissPattern`, `SeasonCompare`, `HoleStrip`, `HolePlan` (own composition rules, `docs/architecture/coachhelm-visual-playbook.md`). Evidence lives in a `DataTable` (`chat/Evidence.tsx`).

### 5.6 Tournaments / Rounds / Qualifiers
Compare (`tournaments/Compare.tsx`, `compare/CompareGrid.tsx`): two sides A/B on a draggable `Timeline`, per-metric dot strips, `DeltaChip`, `sampleWords`; History/Review trend; `SeasonLedger` table. Rounds: Season card + `Ribbon`, library rows with `MonthSpark`, review `ScoreFlow`. Qualifiers: leaderboard + `StandingsSpread` + per-player hole bars + field strip.

---------------------------------------------------------------------------------------------------------------------------

## 6. Tables

| Table | File | Sorting | Sticky | Numeric align | tabular | Mobile | Virtualised |
|---|---|---|---|---|---|---|---|
| `ui/DataTable` (div+role grid, `aria-sort`, J/K rows) | `ui/DataTable.tsx:46` | yes, per column `sortDirection` | sticky header (`.ch-dt` in `ui.css`) | `align: 'end'` | `.ch-num` class | desktop table only; Roster phone is a separate TanStack-sorted list (`roster/sort.ts:3`) | no |
| `stats/detail.tsx:122` `DataTable` (**same name, different component**) | `stats/detail.tsx:122` | no | no (horizontal `ScrollRegion` named, :140) | `td.r.ch-num` | yes | scroll sideways | no |
| `Ledger*` (list, not a table) | `ui/Ledger.tsx` | n/a | n/a | trail slot | | rows | no |
| Raw `<table>` | 20 sites: `LegGrid`, `ch-shs-tbl` (`StatsTeamPhoneShs.tsx:547`), nine tables (`ui/Nine.tsx:19`, `RoundReview.tsx:165`, `RoundCard.tsx:132,176`), `qualifiers/QualifierDetail.tsx:710`, `tournaments/HoleEntry.tsx:248`, `ImportResults.tsx:942`, `recruiting/RecruitingDesktop.tsx:130`, `hub/widgets.tsx:574`, `home/TeamLegs.tsx:122`, chat prose/studio tables, `practice/PrintStudio.tsx:122` | mostly none | mostly none | `ch-num` | scroll | no |
| `ChartTable` | `ui/charts/ChartTable.tsx` | n/a | n/a | n/a | | sr-only | n/a |

Virtualisation: none (`grep virtuali` in `src/clubhouse` finds only a comment). Largest tables are bounded (roster, `PICK_MAX` 100, 18-hole grids), so this is a future risk, not a live one (I). "Every round" (`StatsPlayerPhoneShs.tsx:1198`) is unbounded for All time (I).

---------------------------------------------------------------------------------------------------------------------------

## 7. Metric-integrity risks visible in code

Each: severity (H/M/L), evidence, tag.

1. **(M) Rolling mean ignores the half-weight rule.** `meanSeries` -> `rollingMean(values, 5, 3)` (`stats/round-trend.ts:~40`, `lib/stats-signal.ts:214`) averages per-18 values unweighted, while `lib/stat-definitions.ts:293` (`NINES_LINE`) and `data/stats-weight.ts` count a 9-hole round as half. A doubled nine moves the chart's average as much as a full round but the headline figure half as much. V (code); effect I.
2. **(M) A 9-hole round is a full-size dot.** `per18()` doubles (`data/stats-filter.ts:450`); `RoundTrend` marks it only in the readout "(9 holes, doubled)" (`round-trend.ts:80`); dots are hollow only for `early` (`RoundTrend.tsx:82`), never for `holes===9`. The doubled value has twice the variance of an 18-hole round. V.
3. **(M) `holes ?? 18`.** `per18(value, holes)` treats `holes_played = null` as 18 (`stats-filter.ts:451`); a partial round with null holes is not scaled. I (depends on whether the loader ever emits null with <18 played; `isScoreCountable`/stroke floor mitigates, `stat-definitions.ts:1`).
4. **(M) n is not shown on several graded displays.** `ParTiles` colours "to par vs Tour" with no n and no early state (`charts.tsx:210-231`); `FairwayStrip` takes `opportunities` but prints none (`:234-270`); `Compare` has no early/n (`:274`); `FigureGauge` rate branch tones by `n>=ref` (`:~100`) without a floor; Home `Leg` shows `early`/`needs` text but the bench bar is toned by `changeTone` without n unless `g.early` (`PlayerGame.tsx:417`). Counter-examples (good): `LegBars` (SE + early), `PuttBands` (Wilson + 10/30 floors), `TeamRank` (SE + ties), `TeamScoring.partOf` (n of N rounds).
5. **(M) Misleading-axis risk is mostly handled, residue exists.** Score/SG axes are data-ranged on purpose (a score chart that started at 0 would flatten); guards: `TICKER_MIN_SPAN` (`MiniCharts.tsx:165`), `TAPE_MIN_SPAN` (`TeamTape.tsx:52`), `EVIDENCE_MIN_SPAN` (`panels.tsx:~92`), `GAUGE_END` fixed at 6 (`charts.tsx:43`), `fixedScale={4}` (team legs). Residue: `Line`'s default `lineDomain` auto-zooms with min pad 0.5 (`Line.tsx:87`), so a 0.3-stroke wobble on an un-shared domain fills the plot (only `FormRange` and leg small multiples pass a shared domain). `Ribbon` pads 12% of its own span (`ShsBlocks.tsx:58`), with `sp = hi - lo || 1`: noise fills the card. `Compare` without `max` scales to its largest row (`charts.tsx:275`), so bar length is relative, not absolute.
6. **(M) Two different "average" lines.** `ScoreChart` mean = mean of plotted points unless the caller overrides (`PlayerGame.tsx:~262`); `RoundTrend` = 5-round trailing mean; `RoundLine` = window figure passed as `avg` (`detail.tsx:180`, CH-12). Same visual (dashed/dotted line, "Avg"), three meanings. V.
7. **(L) Colour semantics: compliant, with hue overloading.** Under par = gain: `.ch-ph-chart__dot.is-under` -> `--ch-score-under` (`home.css:1865`), `ScoreMixBar` birdie/eagle = gain, bogey = scorecard ink (not amber), loss = amber, red = errors/pin flag only (V). But gold is Tour tick / loss / qualifying / below-baseline wash (headline 5), and `--ch-chart-bogey #b3884a` (tokens.css:808) sits next to loss amber `#b06e0e`. A stale comment says "a label red" for under-par labels (`PlayerGame.tsx:~273`) while the CSS is gain. V.
8. **(L) Rounding.** Overall careful: `changeTone` uses the printed digits so "0.0" is never toned (`format.ts:41`), `versusTeam` decides on printed values (:63), `roundShares` makes the strip sum to 100 (`charts.tsx:~255`), `sgPartsRoundOff` + `SG_ROUNDING_NOTE` (`lib/sg.ts:101,110`). Residual: `ScoreChart` prints raw ints/`format(v)` per dot while tick labels are ints; `Leg.fmt` uses `toFixed`; the two coachhelm `fmt` rules (2.5) print the same read at different precision.
9. **(L) Per-18 doubling of `toPar` in `RoundTrend` readout** prints `formatToPar(Math.round(r.toPar))` (`round-trend.ts:83`): a doubled nine rounds to whole strokes (even number), correct but looks like 2x precision. I.
10. **(L) Dynamic Type vs fixed viewBox.** Chart text is re-pinned (`ChartText`, `.ch-line__t`), but `Ribbon` labels sit at `calc(y/H * 124 * k)` (`ShsBlocks.tsx`), which assumes plot height 124px; I-level risk of mis-aligned min/max labels at large Text Size.

---------------------------------------------------------------------------------------------------------------------------

## 8. Visualisation types the data supports but Clubhouse lacks

Data support is read from `src/lib/types/database.ts` (golf_shots Row, line 18927: `club_type, distance_to_hole_before/after, lie_before/after, miss_direction, putt_distance_feet, putt_made, putt_break, putt_slope, shot_distance, shot_type, is_penalty, hole_number` — **no x/y coordinates**, so true dispersion maps are impossible, direction+distance only; rounds row ~line 662: `strokes_gained_tee/approach/around_green/putting/total`; hole scores per hole). Existing partial coverage noted first, so nothing below is a duplicate.

Already present (do not re-propose): small multiples (4 leg trends on one scale, `StatsTeamIslands.tsx:844`, `legScale`), sparklines in rows (`FormLine` in Roster/Leaderboard, `FormRange` shared domain), dot strips (`CompareGrid` `Strip`), number-line spread (`StandingsSpread`), miss compass (`MissCompass`, `GreenMiss`), ranked dot plot with intervals (`TeamRank`), Wilson-interval dots (`PuttBands`), form timeline of events (`Timeline` is a control; `History` trend is the form line).

| # | Missing type | Analytical question (coach / player) | Data that exists | Notes |
|---|---|---|---|---|
| M1 | **Strokes-gained waterfall** (round or window: tee + approach + around + putting = total, bars stepping from 0 to total) | Coach: "Where did we lose to the field in this event?" Player: "How did the four parts add up to +/- today's score?" | per-round `strokes_gained_*` columns (V), `sgPartsRoundOff` already handles rounding (`lib/sg.ts:101`) | `LegBars` shows parts but not the sum-to-total relationship; `SG_ROUNDING_NOTE` exists |
| M2 | **Per-round SG stacked columns over time** | "Which leg drove each good/bad round, and is putting the volatile one?" | same columns | `RoundTrend` kind `sg` only plots total |
| M3 | **Distribution of round scores** (dot/strip or histogram, per player and team, with median/IQR) | Coach: "Who is consistent vs streaky?" Player: "What is my range, not my average?" | `total_score` per round; `POOLED_SD` already computed (`stats-signal.ts:13`), per-player SD exists (`sampleSd`, :93) | `Compare`/`TeamRank` show means + SE only; spread is never drawn |
| M4 | **Consistency / dispersion index** per player (SD or IQR of per-18 score or SG, ranked) | "Who can I trust in a counting lineup?" (team events count the best 4 of 5; variance matters) | as M3; lineup logic exists in `tournaments/scoring.ts`, `LineupBuilder.tsx` | strongest coach-decision link: lineup selection |
| M5 | **Hole heatmap** (hole x round, or hole x player, colour = to-par or SG) | Coach: "Which holes on this course/event does the team lose to?" Player: "Which holes do I double?" | hole scores (V), `course-history` rows, `qualifiers` `ChQHole[]`; `CourseCard` shows weekly line, not holes | `holeBars` (`RoundsShowcase.tsx:186`) does one player-round; no aggregate across rounds |
| M6 | **Score-type distribution by hole type over time** (par-3/4/5 trend) | "Is my par-5 scoring improving?" | `ParTiles` data per window only | extend B9 across windows |
| M7 | **Qualifier/event round-by-round leaderboard movement** ("bump" or slope chart) | Coach: "Who is rising into the lineup across the qualifier?" | qualifier per-round totals (`ChQRound`), tournament rounds | only static leaderboard + spread |
| M8 | **Counting-score contribution chart** (per round: counted vs dropped scores, who the team score rests on) | Coach: "Whose scores counted, who was the drop?" | `tournaments/WhoCounted.tsx` exists as a table (I: check) | visual form missing |
| M9 | **Cumulative strokes-gained vs benchmark timeline with event markers** | "Did the focus plan / the tournament change my trajectory?" | focus start dates (`focus-loop`), events, SG per round | marker overlay on `Line` (reference events) |
| M10 | **Prior-period overlay** (this window vs previous N as ghost line) | Coach: "Are we better than last month, shape and level?" | `compare.previousRounds`, `previous` flag, `AgainstBefore` | currently words only (`ShsBlocks.tsx:133`) |
| M11 | **Putting: make rate vs expected by distance, plus 3-putt / lag** | "Am I a poor putter or a poor lag putter?" | `putt_distance_feet`, `putt_made`, `distance_to_hole_after` (V) | `PuttBands`/`CupMiss` partially; no lag-to-next-putt curve beyond `Compare` rows (`GameDetail.tsx:981`) |
| M12 | **Approach proximity by yardage vs Tour as a band chart with n** | "Which yardage window costs me greens?" | `distance_to_hole_before/after`, `lie_before` | `Ladder` has n/floor optional (`charts.tsx:295-300`), rendered as rows not plot |
| M13 | **Practice-to-performance link** (practice plan volume against SG change) | Coach: "Does the plan we assigned move the number?" | `practice-*`, `focus-loop`, SG per round | CoachHelm `TrackRecord` measures claims, not practice |
| M14 | **Roster heat strip** (player x metric z-score grid) | Coach: "Scan the whole roster at once for outliers." | `ChTeamStats.grid` (`TeamRank` consumes it) | `LegGrid` is a table; no colour scale |
| M15 | **Course-fit / opponent history** (team strokes by course vs field) | Coach: "How do we play this venue before we go?" | `loadCourseHistory` | `CourseCard` + `Trend` exist; no per-hole or per-leg decomposition |

---------------------------------------------------------------------------------------------------------------------------

## 9. Ranked weaknesses (22)

Ranking = impact on correctness / trust first, then consistency cost, then polish. Each has evidence.

1. **No shared renderer for 14 of 19 trend charts; four path builders, seven tick generators.** (2.2). Cost: every rule change (#2541 straight lines, CH-15 gaps, CH-11 time spacing) had to be applied in many places, and `ScoreChart` plus `Spark` still miss them. `RoundTrend.tsx:14` literally duplicates `Line.tsx:61`.
2. **Home's headline chart breaks the one-line contract**: index x (`PlayerGame.tsx:260`) not date-spaced; no pin/scrub/arrow/ChartTable (V); monotone `Spark` curve (`:474`) against "straight segments" (`Line.tsx` doc, DESIGN_LANGUAGE.md:270, CH-15); raw `--ch-green-600`, 2.4px (`home.css:1851`). Blocked by the owner lock on Player Home: needs a decision, not a drive-by.
3. **Integrity: chart average ignores half-weight of nines** (7.1) and nine dots look like full rounds (7.2). The headline figure and the plotted line can disagree after a nine.
4. **n/interval disclosure only on 3 charts** (7.4). `ParTiles`, `FairwayStrip`, `Compare`, `FigureGauge`, Home bench bar grade or rank with no sample.
5. **Three "average line" semantics under one look** (7.6).
6. **Palette bypass**: 21 raw palette refs vs 7 `--ch-chart-*` refs in tsx, plus raw hex/rgba in `stats.css:4227,4238`, `home.css:2184`; six series-stroke widths (2/2.2/2.4/2.5) for the same role (2.4).
7. **Accessible alternative is not systemic**: `ChartTable` in 4 files; `Ribbon`, `ScoreChart`, `Spark`, `RoundLine`, `TeamTape`, desktop `TeamTrend` rely on a summary label; six charts are pointer-only or label-only for keyboard (section 4).
8. **Gold is overloaded** (Tour tick, loss, below-baseline wash, qualifying line) and a third amber-brown (`--ch-chart-bogey`) sits beside loss; DESIGN_LANGUAGE.md:44 only defines loss = amber.
9. **Gridline law not applied everywhere**: S2.2 "at most three, dashed 2 4" vs `TeamTrend` up to 6 solid at 0.7 opacity (`StatsTeamIslands.tsx:360,600`), `RoundTrend`/`Ribbon` solid.
10. **Five reference-line treatments** for par/zero/baseline (section 3) and no common legend entry for them.
11. **Eleven legend/key class names and no tooltip component**; readout line re-implemented per chart (2.3).
12. **Three scrub implementations with different thresholds** (8px `SCRUB_START_PX`, 6px `SIDEWAYS_PX`, 120ms hold) so the feel differs between the Overview feature chart and the Rounds chart.
13. **Formatter leaks**: two coachhelm `fmt` rules give 1 dp vs 2 dp for the same read (`file/cards.tsx:42` vs `team/panels.tsx:61`); local `toPar`/`signed2`/`signed`/`fmt` copies (2.5).
14. **Two components named `DataTable` and `Ribbon`** (`ui/DataTable.tsx` vs `stats/detail.tsx:122`; `stats/ShsBlocks.tsx:39` vs `rounds/parts.tsx:224`; a third ribbon in `PlayerStage`): discoverability and import mistakes.
15. **No comparison-period overlay anywhere** (section 4); prior period is words only, season-over-season exists only in chat.
16. **Drill paths stop at the round**: no chart reaches a hole or a shot; `PuttBands`/`ScoreMixBar` cannot open "the shots behind it" although the data exists.
17. **KPI card variety**: `SummaryCard`, `ShsCard`, `TapeCell`, Home `ch-ph-figs`, `Leg`, `Tiles` each own a KPI layout; the five mini-visuals (`MiniDiverging`, `MiniRails`, `RoundStrip`, `RoundTicker`, `GoalBar`) share no API. (Partly by design: "specific to what it is displaying".)
18. **Definitions reach 5 call sites** (`StatTerm`), `Abbr` covers 3 keys (`ui/Abbr.tsx:5-9`): Home, Rounds, CoachHelm, Tournaments figures have no definition path, although `STAT_DEFINITIONS` has 16 entries.
19. **Responsive/Dynamic Type text strategies diverge** (3 strategies, 2.2); only one chart measures its container.
20. **Tables**: two `DataTable`s, 20 raw `<table>`s, no sticky column, no virtualisation, no mobile card alternative other than horizontal scroll (section 6).
21. **Stale/contradicting comments**: "a label red" (`PlayerGame.tsx:~273`) vs gain colour; `Stories.tsx:22` dead `.replace`; `ScoringFeatureChart` doc says "never opens the detail" while the surrounding card does (I).
22. **Motion**: `ScoringFeatureChart` morph (360ms, custom `requestAnimationFrame` easing `1-(1-t)^3.2`, `:20`) is a parallel animation system to `useGlide`; DESIGN_LANGUAGE allows only a "window change glide".

---------------------------------------------------------------------------------------------------------------------------

## 10. Proposed shared chart architecture (proposal only; nothing applied)

Five layers; each maps existing files so the work is mostly extraction, not invention. Constraint from AGENTS: Clubhouse stays recharts-free (test at `ui/charts/__tests__/one-line-chart.test.ts`), tokens stay `--ch-chart-*`, no first-paint draw-ins (Q-153), Player Home look stays owner-locked until Nick decides item 2 above.

```
 data  ->  metric  ->  analytical config  ->  renderer  ->  presentation
```

**L1 Data (loaders, shape types; no change).** `data/stats-player.ts:240 loadPlayerProfile`, `data/stats-team.ts:199 loadTeamStats`, `data/home.ts`/`player-home.ts`, `data/stats-weight.ts` (round weights), `data/stats-filter.ts` (`ChFilter`, `per18`), `data/tournaments.ts`, `data/course-history.ts`, `data/coachhelm-*-shape.ts`. Contract: every series arrives as `Series<{ id, at (epoch), label, value|null, weight, holes, n }>`; the `weight` and `holes` fields are what the charts lack today (weaknesses 3, 7.1-7.3).

**L2 Metric (pure, one place).** Extend `lib/format.ts` + `lib/stats-signal.ts` + `lib/sg.ts` + `lib/stat-definitions.ts` into a `MetricDef` registry: `{ key, unit, digits, lowerIsBetter, floor (FLOORS key), spread (POOLED_SD key), reference ('par'|'tour'|'team'|0), format(), signed?, definition }`. One formatter (`formatMetric(def, v)`) replaces the leaked copies (2.5: `file/cards.tsx:42`, `panels.tsx:61`, `Stories.tsx:22`, `CourseCard.tsx:21,88`, `blocks.tsx:84`, `PlayerGame.tsx:412`, `TeamGame.tsx:65`, `TeamLegs.tsx:26`). Weighted rolling mean lives here (fixes 7.1). `STAT_DEFINITIONS` becomes the `definition` field so `StatTerm` can attach anywhere.

**L3 Analytical config (declarative, per question).** A small config per analytical question, not per chart: `{ question, metric, window (ChFilter), comparison ('none'|'previousN'|'season'|'team'|'tour'), reference, sample ('floors from L2'), emphasis ('latest'|'best'|'trend'), drill (route builder) }`. Existing homes: `stats/detail-route.ts` (drill ids), `stats/shs-figures.ts` (tones, `sgTone`, `divergeBar`), `stats/mix-rows.ts`, `stats/putt-bands.ts`, `stats/leg-rows.ts`, `stats/team-rank.ts`, `stats/round-trend.ts`, `stats/legs.ts`, `data/stats-detail.ts`. These already are the per-question configs for bars; trends have none (T2/T3/T4/T5/T7/T8 each compute domain, ticks, mean, early state inline). Proposal: a `trendModel(points, metricDef, window)` returning `{ domain, ticks, mean/rolling, reference, state(early/steady), hollow[], x positions, readouts, table rows }`, built from `lineDomain`, `lineTicks`, `slotPositions`, `rollingMean`, `sampleState`, `trendNote` (all exist; just unwired from each other).

**L4 Renderer (3 primitives + 2 compositions).**
1. `Line` (exists, `ui/charts/Line.tsx`) extended with: `markers: 'rounds'|'avg'`, `secondary: {path}` (rolling mean), `reference[]`, `ghost` (prior period, M10), `events[]` (M9), `size` presets, optional `values` labels, `fill: 'none'|'wash'|'baseline'`. Re-home T2 (`RoundTrend`), T3 (`ScoringFeatureChart`), T4 (`Ribbon`), T5 (`RoundLine`), T7 (`ScoreChart`), T8 (`Spark`, straight), T9 (`TapeCell`), T12, T14 onto it. T6 (multi-series) becomes `LineMulti` sharing the same plot, axis and pin code.
2. `Bars` (new): horizontal rail/diverging/stacked (`LegBars`, `MiniDiverging`, `MiniRails`, `HBars`, `Compare`, `ScoreMixBar`, `FairwayStrip`, `TeamRank`, `PuttBands` are all "value on a rail with reference, interval, early state"); one component, `variant`.
3. `Strip` (new): dots on a number line (`CompareGrid.Strip`, `StandingsSpread`, `TeamRank` dots, `PlayerStage`); unlocks M3/M4 distribution and consistency views.
4. `Plot` frame: shared `<ChartFrame>` (title row, readout line, legend, key, footnote, `ChartTable`, empty/early/error state) replacing the four page-level frame vocabularies for chart contents only (cards stay as they are; option F title bars stay in look-09).
5. Interaction hook: promote `useChartPin` to the only pointer/keyboard/touch implementation (absorb `ScoringFeatureChart`'s hold-to-read and `TeamTrend.onScrub`; one threshold).

**L5 Presentation (tokens + CSS, one stylesheet).** One `ui/charts/chart.css` generated from the token table: series 2px `--ch-chart-line` (set by `--ch-line-ink` per tone), grid dashed 2 4 `--ch-separator-chart` max 3, reference 1px `--ch-chart-zero`, track `--ch-chart-track` + ring, gain/loss/flat via `.is-gain/.is-loss/.is-flat` only, hollow = early, axis type via `ChartText` (viewBox units) or one `.ch-chart__t` class, motion limited to `useGlide`/`useFirstViewGrow`. A drift check (like `RED_TOKENS` in `scripts/clubhouse/check.mjs`) can fail on `--ch-green-*`/`--ch-ivory-*` inside chart TSX (the 21 bypasses) and on a series stroke width other than 2. A "gold" decision (Tour tick / qualifying vs loss) needs Nick.

**Rollout order that respects look-09 (in progress, QUEUE row `look-09`, line 528) and owner locks:** (1) L2 formatter + weighted mean (no visual change; fixes 7.1, 2.5); (2) `trendModel` + re-home `RoundTrend`/`RoundLine`/`Ribbon` on `Line` (stats-only, no Player Home); (3) `ChartFrame` + `ChartTable` everywhere; (4) `Bars`; (5) Home chart decision with Nick; (6) new types (M1-M5, M10) as `Line`/`Bars`/`Strip` variants. Card chrome is untouched throughout.

---------------------------------------------------------------------------------------------------------------------------

## 11. Contradictions with docs / rules

- Task premise vs code: recharts/d3-scale are not in Clubhouse (headline 1).
- DESIGN_LANGUAGE.md:270 (one line component, 2px `--ch-chart-line`, straight segments, <=3 dashed gridlines) vs `PlayerGame.tsx:474` (monotone), `home.css:1851` (2.4px green-600), `StatsTeamIslands.tsx:360` (6 solid ticks).
- DESIGN_LANGUAGE.md:44 (loss = amber) vs gold used as loss in `LegBars` and the team wash (`stats.css:5662`).
- `lib/stat-definitions.ts:293` (nine = half a round) vs `round-trend.ts` `meanSeries` (unweighted).
- `ui/charts/Line.tsx` header ("every trend reads the same way") vs 14 other trend renderers; `StatsDetail`'s `RoundLine` doc still says "Left out, the chart is main's" (`detail.tsx:~195`), a stale phrase.
- `PlayerGame.tsx` comment "a label red" vs `--ch-score-under` (gain) in CSS.
- `CLAUDE.md`/the brief name `d3-scale` and recharts as chart stack; `package.json` carries them for non-Clubhouse surfaces only.

## 12. What I could not verify

- Rendered look (no browser/screenshot was taken); all geometry claims are from code and CSS.
- Loader field names for the Home and Rounds series (I read type usage, not each loader body).
- Whether `src/components/fairway/charts` or the recharts-based `player-comparison.tsx` are still reachable from any live Clubhouse route (only the import graph inside `src/clubhouse` was checked).
- Whether `holes_played = null` with fewer than 18 holes can occur in production data (no database query was run).
- The in-progress look-09 PR #2610 content (not fetched); I only read the merged QUEUE row and the `P004/P005` change notes.
- Test coverage per chart (only the chart contract test and file lists were opened).

---------------------------------------------------------------------------------------------------------------------------

## Appendix A — Reproduction (read-only commands behind the counts)

```
rg "from 'recharts'|d3-scale" src/clubhouse                       # 0 hits (test pins it)
rg -l "recharts|d3-scale" src                                      # fairway/charts, lifting, baseball, recruiting map, features
rg -c "<svg" src/clubhouse/{screens,ui,live} --glob '*.tsx'        # 82 svg elements
rg -l 'role="img"' src/clubhouse/{screens,ui,live}                 # 46 files
rg -l "ChartTable" src/clubhouse                                   # Line, ChartTable, LegBars, RoundTrend, drawings (4 consumers)
rg -l "useChartPin" src/clubhouse                                  # Line, RoundTrend, LegBars, PuttBands, TeamRank, ScoreMixBar
rg "linePath\(|gappedPath\(|straightPath\(|monotonePath\(" src/clubhouse    # 4 builders
rg "<StatTerm" src/clubhouse                                       # 5 call sites
rg "var\(--ch-chart-" src/clubhouse --glob '*.tsx'                 # 7
rg "var\(--ch-(green|ivory|champagne)" src/clubhouse/screens/{stats,home,rounds,coachhelm,tournaments} --glob '*.tsx'   # 21
rg "toFixed" src/clubhouse/{screens,ui} --glob '*.ts*'             # 37 lines, 20 files
rg -i "virtuali" src/clubhouse                                     # comment only
```

## Appendix B — Stats feature surface map (for the next slice)

| Area | Files | Lines |
|---|---|---|
| Stats screens | `screens/stats/*.tsx|ts` (60 files) | about 14,100 total (V `wc`) |
| Biggest | `StatsPlayerPhoneShs.tsx` 1311, `StatsTeamIslands.tsx` 1023, `GameDetail.tsx` 1010, `StatsPlayer.tsx` 861, `StatsTeamPhoneShs.tsx` 655, `OverviewZones.tsx` 618, `StatsTeamPhone.tsx` 537, `GameMore.tsx` 520, `StatsFilter.tsx` 498 | |
| Shared chart code | `ui/charts/Line.tsx` 426, `lib/chart.ts`, `lib/chart-geometry.ts` (label placement, `clampRadius`, `scaleToBox`), `lib/use-chart-pin.ts`, `lib/motion-glide.ts`, `lib/stats-signal.ts`, `lib/format.ts`, `lib/sg.ts`, `lib/stat-definitions.ts` | |
| Docs | `memory/features/stats-analytics.md` (registry `stats_analytics`), `docs/clubhouse/pages/P004-stats-team/`, `P005-stats-player/`, `design/refresh/DESIGN_LANGUAGE.md` S2.1-S2.8 | |
| Guard tests seen | `ui/charts/__tests__/{Line,chart-table,line-spread-labels,line-time,line-wash,one-line-chart}`, `__tests__/contrast-tokens.test.ts`, `__tests__/redesign-shared-guards.test.ts` | |

## Appendix C — Decisions needed from Nick (not for an agent to take)

1. Does Player Home's `ScoreChart`/`Spark` stay as the 28 Oct drawing (owner lock), or may they adopt the `Line` contract (date spacing, scrub, table, `--ch-chart-line`, straight segments)?
2. Gold: one meaning (Tour/qualifying reference) or also the below-baseline/loss side of bars and washes?
3. Is a prior-period ghost line (M10) wanted, given "No clear change" words are the current comparison grammar?
4. Should a 9-hole round plot as a hollow/marked dot and carry half weight in the plotted average?
