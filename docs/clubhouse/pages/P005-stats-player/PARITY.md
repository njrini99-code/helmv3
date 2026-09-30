# P005 — Stats (player): parity with the production player stats page

Owner, 2026-09-30: "scrambling, GIR, putting, all of it needs to be in there." This is the row-by-row record
of what the production (Fairway) player stats page shows and where Clubhouse shows it. Every row is either
**shown** (already built), **added** (built in the parity pass of 2026-09-30) or **not shown because <reason>**.
Benchmarks are the Tour's only (Q-88): no row carries a D1 or college value.

87 rows: 31 already shown, 37 added, 8 shown and widened, 9 not shown because (each with its reason) and 2 waiting on the
shared Tour fix (Q-93: SG4 and PT12). Eight of the nine are figures production computes or fetches and never renders
(SC21, DR12, DR13, AP16, SH11, SH12, PT18, SG5: nothing to match); the ninth is CoachHelm's (SC17, P013). The
round-scope picker (SC18) was the twelfth and is built: the shared round filter with its Holes control (phase 3 of
this work; the owner's "make it 9 or 18" supersedes Q-94).

## How to read it

Production path key (all under `src/`):

- `SS` = `components/golf/stats/spine-stage` (the drills, the bento, the spine)
- `CALC` = `lib/utils/golf-stats-calculator-shots.ts` (`GolfStats`, the shot-level calculator)
- `SD` = `app/golf/actions/stats-data.ts`, `LM` = `app/golf/actions/stats-leak-maps.ts`, `DB` = `app/golf/actions/stats-dashboard.ts`
- `LMB` = `lib/golf/leak-map-buckets.ts`

Clubhouse location key (all under `src/clubhouse/screens/stats/`): **GD** = Game detail (`GameDetail.tsx`), its five
sections Scoring, Off the tee, Approach, Short game and Putting; each has a lead sentence, four figures, the panels,
and a **More detail** disclosure (open on the desktop, closed on the phone, one section at a time on the phone).
**OV** = Overview (`StatsPlayer.tsx`), **RT** = Rounds tab, **HERO** = the hero figures. The loader is
`data/stats-player.ts` and `data/stats-detail.ts`.

### Why the numbers can differ from production

Production reads its figures over the career: the newest 100 countable rounds of any type and length
(`SD:958-1002`), with trends, worst holes, leak maps and the spray chart on every completed round, and the
standing strips from a nightly cache that counts test and 9-hole rounds and needs five rounds
(`LM:579-607`). Clubhouse reads the **window's own rounds** (Last 10, This season, Qualifiers or the filter's range) of the
lengths the filter's Holes control chose (18 holes by default) for every figure, by passing those round ids to
`getDetailedStats` and to its own reads, so a figure counts exactly the rounds in the Rounds table, and says so
under itself ("Nine- and eighteen-hole rounds" below: 9 or 18, chosen in the filter; Q-94 superseded).
On the same rounds the figures are production's: the calculator (`calculateStatsFromShots`), the hole ranking
(`rankHoleAnalyses`), and the leak-map aggregators (`aggregateApproachBuckets`) are production's own code.

| Rule | Production | Clubhouse |
| --- | --- | --- |
| Rounds | newest 100 countable of any length, all types (`SD:958-1002`) | the window's rounds of the length chosen (18 holes, 9 holes or both), newest 100 at most (`SD:885-890`) |
| Round types | practice, qualifier and tournament all count | the window's own (Qualifiers = qualifier rounds; Last 10 and Season = every type), or the kinds chosen in the round filter |
| Tour reference | `golf_pga_standards`; a women's team falls back to the men's value per metric | the team's own tour only; a metric the tour has no value for shows a dash (Q-88) |
| Team marker | on every standing strip, from the nightly cache (5+ rounds each) | coach only (Q-91), and only where the window's own pooled figure exists |

## The round filter

One filter for the whole page (and Team stats, which applies it to every player and the team's figures), kept in the
address and stated under every figure ("Tournaments, Sep 1 to Sep 29 · 4 rounds, 18 holes only", or the lengths it reads):

- **Order.** Type, course and time first, then "Exclude these", then the window's newest-ten cut. So "Last 10" with
  Tournament chosen is the ten newest tournament rounds (per player on Team stats), and "vs. previous 10" is the ten
  matching rounds before them. "Only these" is exactly the picked rounds among the matching ones, with no cut. A custom
  date range replaces the window: every round in it counts, including rounds before this season (the read starts at
  the range's start), while "Rounds this season", the season's bests and the pager's order stay the season's.
- **Dimensions.** Round type (tournament, qualifying, practice; `golf_rounds.round_type` holds `tournament` 341,
  `qualifier` 217, `practice` 136 of 694 countable rounds), **holes** (18 holes by default, 9 holes, or Both; 36 of the
  694 rounds, 5%, across 21 players, are nine-hole rounds; see the next section), time, course (`course_name`, filled on
  every round, matched by its exact name) and the picks. Left out, from the same read-only counts: **tees and rating**
  (`tees_played` is free text that mixes tee colours with event names such as "Gate City Invite"; `tee_id` is filled on
  37% and `course_rating` on 51%), **event** (no column; `qualifier_id` exists on qualifier rounds only) and
  **home or away** (`golf_teams` has no home course or location).
- **Who sees what.** A player's filter reads only their own rounds (Q-91: a teammate's round id in the address is not
  loaded, so it cannot be picked); the address is parsed, every part checked, and round ids are matched against the
  rounds already read for that viewer before any figure is computed.

## Nine- and eighteen-hole rounds

Owner, 2026-09-30: "make it 9 or 18." This supersedes Q-94 and Q-90's 18-hole-only rule. The filter's **Holes** control
reads 18 holes (the default), 9 holes, or Both (`holes=18|9|all` in the address, left out at 18). One method, used by the
player page, Team stats, Game detail and both phones:

- **Per-round figures are per 18 holes.** A round weighs its holes over 18 (nine holes is 0.5). A figure is its sum over
  the rounds that have it divided by their summed weights, so a 38 over nine holes is 76 a round, and Both is the total
  over the whole rounds. With 18-hole rounds only every weight is 1 and this is the plain mean, so the default page does
  not move. It covers scoring average, average to par, scoring by round type, putts, 3-putts, birdies, pars, bogeys and
  doubles a round, penalties a round, strokes gained (total and each leg), the comparison with the previous 10, every
  by-round line (a 9-hole score drawn doubled, and said under the line) and the team's weekly lines and player grid.
- **Rates pool the holes and shots.** GIR, fairways, scrambling, sand saves, putt make rates, proximity, big numbers (doubles
  or worse over holes played) and every share of holes take no weight: a nine-hole round just has fewer holes.
- **Floors count whole rounds.** An early read (fewer than three), strokes gained's three rounds with shots, a leg's three,
  the previous 10's three and the pressure gap's floors. Four 9-hole rounds are two; six are three. The team grid's
  late-against-early change needs four whole rounds. The opening-hole floor stays a raw count of holes.
- **Bests list the lengths apart.** An 18-hole best and a 9-hole best are not the same best, so RT › Personal bests and GD ›
  Scoring numbers give each length its own card or tiles. "Rounds this season" and Team stats' season bests stay 18-hole
  rounds.
- **"Last 10" is cut after the length.** With Both it is the ten newest rounds of either length; with 18 holes or 9 holes it
  is the ten newest of that length.
- **The shared calculator is not edited (Q-93).** `calculateStatsFromShots` divides its per-round birdie, par, bogey and
  double counts by the number of rounds whatever their length, and leaves nine-hole rounds out of its scoring average,
  average to par and scoring by round type. When a nine-hole round is in the window a thin adapter (`perEighteen`,
  `data/stats-weight.ts`) restates those from the same totals over the holes played; with none the calculator's own numbers
  are untouched. Its putts, greens, 3-putts and penalties a round are already per 18 holes, and it keeps each length's best
  and worst round apart (`bestRound18`, `bestRound9`), which GD › Scoring numbers shows.
- **Said where it counts.** A note under the count line whenever nine-hole rounds are in (CH-4318, CH-5323), the line
  under each Game detail section, the line titles, a "9 holes" chip on a round, and "4 countable rounds, 2 counting 9-hole
  rounds as half" on an early read. With no round of the chosen length but nine-hole rounds posted, the page says where
  they are instead of looking empty (CH-4319, CH-5324).

## Waiting on the shared Tour fix (Q-93)

The owner decided (Q-93) that the Tour-only rule covers production's own code too, and that putting and scrambling get
one definition each in the shared stats code, built as its own PR. Clubhouse consumes that code through thin adapters and
does not edit it (`src/lib/utils/golf-stats-calculator-shots.ts`, `src/lib/golf/**` and `src/app/golf/actions/**` are
untouched here). So:

- **Two rows wait for it and show nothing yet:** SG4 (spine priorities) and PT12 ("Putting is costing an estimated N
  strokes a round").
- **Figures shown now that move when it lands** (listed so a change after it is expected, not a regression): putt make
  rates by band, the make-rate curve, make by break and distance and the putting standing strips (PT7 to PT10, PT17: one
  make-rate path and honest band labels); scrambling by lie, distance and miss direction (SH1 to SH3, SH7: one scrambling
  definition); sand saves (SH4, SH10); penalties a round (DR11, SH9, SH10: one penalty count); every shot-level figure
  (test rounds out); and the "most recent 100 rounds" note (SC19: the cap after the countable filter).
- **Production's patterns read** (SC17) orders by `stroke_impact` with a limit of 10, which drops a player's biggest
  leaks; reported to the shared-fix work, not fixed here.

## Scoring

| # | Production figure | Production source | Clubhouse | Window and rule |
| --- | --- | --- | --- | --- |
| SC1 | Scoring average (readout; spine fallback; bento "Per 18 holes") | `SS/ScoringDrill.tsx:220-234`, `SS/StatsBento.tsx:300-311` · `CALC:2609` | **Shown.** HERO "Scoring avg", GD › Scoring "Scoring average" | the window's rounds, per 18 holes |
| SC2 | Average to par | `SS/ScoringDrill.tsx:235-237`, `SS/StatsBento.tsx:368-403` · `CALC:2619` | **Added.** GD › Scoring › More detail › Scoring numbers | the window's rounds, per 18 holes |
| SC3 | Best round (with course and date) | `SS/ScoringDrill.tsx:238-247` · `CALC:2614`, `SD:1763` | **Shown.** OV "Best round"; **added** RT › Personal bests (course, date) | window's rounds, one length at a time |
| SC4 | Worst round | `SS/ScoringDrill.tsx:248-250` · `CALC:2615` | **Added.** GD › Scoring › More detail › Scoring numbers | window's rounds, each length's worst on its own |
| SC5 | Score mix bar with counts and shares (eagle+, birdie, par, bogey, double+) | `SS/ScoringDrill.tsx:138-142,166-172,205-211` · `CALC:1987-1991` | **Shown** per round (GD › Scoring "What an average round looks like"); **added** the holes and shares ("46 of 180 holes") under it | every scored hole of the window's rounds |
| SC6 | Per-round rates (eagles, birdies, pars, bogeys, double+) and season totals | `SS/ScoringDrill.tsx:144-159,173,212-216,253-274` · `CALC:2620-2624` | **Shown** (the mix's per-round legend); the totals are **added** with SC5 | per round played |
| SC7 | Par 3, 4 and 5 scoring against the Tour | `SS/StatsBento.tsx:225-234` · `CALC:2673-2686`; Tour `scoring_par_N` | **Shown.** GD › Scoring "Scoring by par" | holes of the window's rounds |
| SC8 | Par 3, 4 and 5 outcome mix (birdie+, par, bogey, double+ as a share of that par's holes, with "+0.31 / hole · 312 holes") | `SS/ScoringDrill.tsx:92-96,131-133,276-301` · `CALC:1994-2004` | **Added.** GD › Scoring › More detail › Outcomes by par | holes of the window's rounds; a par with no holes says so |
| SC9 | Scoring by round type (practice, qualifying, tournament: average and rounds) | `SS/ScoringDrill.tsx:177-182,303-324` · `CALC:1950-1961` | **Added.** GD › Scoring › More detail › By round type | the window's rounds of each type; a type with none says "No rounds" |
| SC10 | Streaks and records (most birdies in a round, birdies in a row, pars in a row, longest no-3-putt streak, longest hole-out) | `SS/ScoringDrill.tsx:326-345` · `CALC:1964-1967,2006-2039` | **Added.** GD › Scoring › More detail › Streaks and records | the window's rounds, each round walked hole by hole |
| SC11 | Toughest holes (top five by average to par, with a three-play floor) | `SS/ScoringDrill.tsx:347-370` · `SD:2513-2668`, `lib/golf/worst-hole-ranking.ts:29` | **Added.** GD › Scoring › More detail › Toughest holes (`rankHoleAnalyses`, the same floor) | the window's rounds (production: every completed round of the player) |
| SC12 | Score by round ribbon | `SS/RoundsDrill.tsx:111-118,165-174` · `SD:1705` | **Shown** as the scoreboard trend (OV, last 7); **added** RT › Score by round (the whole window) | the window's rounds, a 9-hole score drawn per 18 |
| SC13 | Personal bests (best score, best to par, best GIR, fewest putts) | `SS/RoundsDrill.tsx:176-238` · `SD:1762-1770` | **Added.** RT › Personal bests, each with course and date | the window's rounds, the 18-hole and 9-hole bests listed apart |
| SC14 | Last N days against the previous N (scoring average, GIR, fairways, putts) | `SS/RoundsDrill.tsx:118-157,240-268` · `SD:1741-1759,1800-1846` | **Added, on a different basis.** RT › This window against the one before: the latest 10 rounds against the 10 before them (Last 10 only; Season and Qualifiers have no previous window by design and say so). Production compares the last N days (the coach's setting, 30) with the N before, independent of any window. | 18-hole rounds; needs 3 in each |
| SC15 | Last 10 rounds list (score, course, type chip, date, to par, link to the round) | `SS/RoundsDrill.tsx:270-306` | **Shown** (the whole window), with a round-type chip **added** in the course cell, and a "9 holes" chip on a nine-hole round | the window's rounds |
| SC16 | Spine ledger (rounds, fairways, greens, putts a round with change arrows) | `SS/StatsSpineStage.tsx:604-615`, `SS/buildStatsViewModel.ts:149-168` | **Shown** as OV figure cards; the changes are SC14 | as SC14 |
| SC17 | "What CoachHelm sees" strips on each area (up to two patterns, a sparkline, a delta) | `SS/CategoryInsightStrip.tsx:73-193` · `lib`/`insights.ts:2356` | **Not shown because** CoachHelm's patterns are insights, not stats, and live on CoachHelm (P013). Production's read also orders by `stroke_impact` descending with a limit of 10, which drops a player's biggest leaks (reported, not fixed here). | n/a |
| SC18 | Round-scope picker ("Choose rounds", qualifier presets) and its scoped report | `SS/StatsSpineStage.tsx:497-568,653-702,737-825` · `SD:2312-2374` | **Added** as the shared round filter on the player profile and on Team stats (desktop and phone): round type, time (the three windows and a custom date range), course, and Only these / Exclude these rounds, kept in the address. Production's preset "qualifier rounds" is the Qualifiers window or the Qualifying type; its scoped report is every figure on the page reading the filtered rounds | the filtered 18-hole rounds (see "The round filter" below) |
| SC19 | "Stats cover your most recent 100 rounds" banner | `SS/StatsSpineStage.tsx:975-979` · `SD:1014-1018` | **Added** as a note under the Game detail tabs, when the window has more than 100 rounds | newest 100 |
| SC20 | Cold start ("Log your first round", "More rounds needed") | `SS/StatsSpineStage.tsx:179-215,827-854` | **Shown** as CH-5301 (no shot rounds), CH-5305 (early read), CH-5308 (too few with shots) | n/a |
| SC21 | Rolling averages, best holes, par averages to par, closing-holes average, per-hole trend, course breakdown, team comparison, summary (computed, never rendered) | `SD:1711-1735,2619-2655,2500,2226,852` | **Not shown because** production does not render them either | n/a |

## Off the tee

| # | Production figure | Production source | Clubhouse | Window and rule |
| --- | --- | --- | --- | --- |
| DR1 | Fairways hit % | `SS/DrivingDrill.tsx:179-197` · `CALC:2644` | **Shown.** GD › Off the tee, OV figure card | par 4 and 5 tee shots of the window's rounds |
| DR2 | "k of n attempts" under it | `SS/DrivingDrill.tsx:191-195` · `CALC:2059-2060` | **Added** under the Fairways figure | as DR1 |
| DR3 | Fairways trend ribbon (per round) | `SS/DrivingDrill.tsx:199-207` · `SD:1707` | **Added.** GD › Off the tee › More detail › Fairways by round | one point per round with fairway holes |
| DR4 | Driving distance (every tee shot) | `SS/DrivingDrill.tsx:170-172` · `CALC:2630-2633` | **Added.** "Distance by club" gains the all-tee-shots row | first tee shot per hole with a distance |
| DR5 | Driver-only distance | `SS/DrivingDrill.tsx:173-175` · `CALC:2634-2637` | **Shown.** "Driver distance" figure and "Distance by club" | as DR4 |
| DR6 | Non-driver distance | `SS/DrivingDrill.tsx:176-178` · `CALC:2639-2642` | **Shown.** "Distance by club" | as DR4 |
| DR7 | Fairways by tee type (par 4, par 5, driver, non-driver) | `SS/DrivingDrill.tsx:209-212` · `CALC:2645-2648` | **Added.** GD › Off the tee › More detail › Fairways by tee type (par 5 and par 4 were already the figure's sub-lines) | as DR1 |
| DR8 | Overall tee miss, left and right | `SS/DrivingDrill.tsx:213-216` · `CALC:2651-2653` | **Shown.** "Where drives finish" | lateral tee misses |
| DR9 | Tee miss by club (driver, non-driver) | `SS/DrivingDrill.tsx:218-232` · `CALC:2655-2661` | **Added.** GD › Off the tee › More detail › Tee miss by club | as DR8, by club |
| DR10 | Tee-shot dispersion (spray field: plotted shots, average forward and remaining, dominant sector) | `SS/DrivingDrill.tsx:233-236`, `FW/charts/SprayField` · `SD:1435-1492,588-632` | **Added as counts, not a plot.** GD › Off the tee › More detail › Where tee shots finish: shots by sector (left, centre, right, short, long) with counts and shares, average forward and remaining distance, playable, trouble and penalty counts. **Not shown:** the scatter, because production's dots are synthetic (a sector times a formula of the distance, `SD:521-550`), so they show no measured dispersion. | tee shots of the window's rounds (production: every completed round, no countable filter) |
| DR11 | Penalties off the tee (red dots only; `penaltiesPerRound` exists but is not drawn in either drill) | `SS/DrivingDrill.tsx:235`, `CALC:3173` | **Shown** as "Penalties / round" (GD › Off the tee, with the Tour rate) and the penalty count in DR10 | logged penalty shots per 18 holes (depends on the shared fix, Q-93) |
| DR12 | Penalty types | fetched at `SD:1051-1052`, never aggregated | **Not shown because** production does not render them | n/a |
| DR13 | Standing strips for driving | `SS/StandingDrill.tsx:145-267` | **Not shown because** production has no fairway strip (there is no fairway Tour value in `golf_pga_standards`) | n/a |

## Approach

| # | Production figure | Production source | Clubhouse | Window and rule |
| --- | --- | --- | --- | --- |
| AP1 | Greens in regulation % (with the Tour tick on the bento) | `SS/ApproachDrill.tsx:333-354`, `SS/StatsBento.tsx:344-354` · `CALC:2663` | **Shown.** GD › Approach figure with the Tour rate, OV card | every hole of the window's rounds |
| AP2 | GIR per round | `SS/ApproachDrill.tsx:357` · `CALC:2666-2668` | **Added.** GD › Approach › More detail › Approach numbers | per 18 holes |
| AP3 | Proximity, every approach | `SS/ApproachDrill.tsx:361` · `CALC:2956-2959` | **Shown.** "Proximity · all" | green hit or missed |
| AP4 | Proximity, green hit | `SS/ApproachDrill.tsx:362` · `CALC:2869-2872` | **Added.** Approach numbers | hit greens only |
| AP5 | Proximity, green missed | `SS/ApproachDrill.tsx:363` · `CALC:2873-2876` | **Added.** Approach numbers | missed greens only |
| AP6 | GIR by distance (8 bands) | `SS/ApproachDrill.tsx:392-397` · `CALC:2822-2835` | **Shown.** "Greens hit by distance" | as AP1 |
| AP7 | GIR by lie (fairway, rough, sand, with n) | `SS/ApproachDrill.tsx:398-401` · `CALC:2838-2843` | **Shown.** "Greens hit by lie"; the sample sizes are **added** | as AP1 |
| AP8 | GIR by par (par 3, par 4; par 5 exists but production draws none) | `SS/StatsBento.tsx:120-139` · `CALC:2671` | **Added, all three.** Approach numbers | holes of that par |
| AP9 | Efficiency matrix (strokes to hole out by distance and lie; proximity when the green is hit) | `SS/ApproachDrill.tsx:405-434` · `CALC:2339-2380` | **Added, unshaded.** GD › Approach › More detail › Strokes to hole out. Production shades each cell against hard-coded "college-golf targets" (`SS/ApproachDrill.tsx:170-191`); there is no Tour reference for it, so Clubhouse shows the values with their sample and no grade (Q-88). | approaches of 50 yards and more |
| AP10 | Approach misses overall | `SS/ApproachDrill.tsx:436-442` · `CALC:2846-2854` | **Shown**, in eight directions (production draws four). "Where missed greens finish" | missed greens with a direction |
| AP11 | Misses by distance band | `SS/ApproachDrill.tsx:443-468` · `CALC:2858-2866` | **Added.** GD › Approach › More detail › Misses by distance | as AP10, by band |
| AP12 | GIR trend ribbon | `SS/ApproachDrill.tsx:472-483` · `SD:1706` | **Added.** GD › Approach › More detail › Greens by round | one point per round |
| AP13 | Approach proximity against the Tour (three bands, every approach, lay-ups out, 10-shot floor) | `SS/ApproachDrill.tsx:488-500`, `FW/charts/LeakMap` · `LM:308-349`, `LMB:158-223` | **Added, and the old comparison corrected.** GD › Approach "Proximity against the Tour" uses `aggregateApproachBuckets` on the window's shots. The seven-band ladder counts hit greens only, which is not the Tour's basis, so its Tour ticks are **removed** and it says "when the green is hit". | approach shots of the window's rounds; a band needs 10 shots |
| AP14 | Approach dispersion (spray) | `SS/ApproachDrill.tsx:501` · `SD:1494-1538` | **Added as counts**, as DR10 (shots by sector, average remaining) | approach shots of the window's rounds |
| AP15 | Standing strips for GIR and approach proximity (you, team, Tour) | `SS/StandingDrill.tsx:145-267` | **Shown** as OV › You against the Tour rows (GIR with a team value for a coach; proximity bands against the Tour, no team value) | the window |
| AP16 | Proximity by par and by lie | `CALC:2930-2945` (computed, not rendered) | **Not shown because** production does not render them | n/a |

## Short game

| # | Production figure | Production source | Clubhouse | Window and rule |
| --- | --- | --- | --- | --- |
| SH1 | Scrambling % with "k of n" | `SS/ShortGameDrill.tsx:184-192,266-277` · `CALC:3059` | **Shown.** GD › Short game figure; "chances" in the section head | missed greens of the window's rounds |
| SH2 | Scrambling by lie (fairway, rough, sand) | `SS/ShortGameDrill.tsx:295-299` · `CALC:3060-3062` | **Shown**, with fringe and attempts, and the Tour rate on fairway, rough and sand. "Up and down by lie" | chips and pitches by lie |
| SH3 | Scrambling by distance (0-10, 10-20, 20-30) | `SS/ShortGameDrill.tsx:290-294` · `CALC:3063-3065` | **Shown.** "Up and down by distance" (production's "20-30" is everything over 20 yards) | as SH2 |
| SH4 | Sand saves | `SS/ShortGameDrill.tsx:196-198,270` · `CALC:3168` | **Shown** with the Tour rate; the made and attempts are **added** | bunker shots |
| SH5 | Around-the-green efficiency (strokes to hole out from a chip or pitch) | `SS/ShortGameDrill.tsx:269` · `CALC:3097-3100` | **Added.** GD › Short game › More detail › Short-game numbers | `around_green` shots within 50 yards |
| SH6 | Efficiency by distance and lie | `SS/ShortGameDrill.tsx:303-332` · `CALC:3101-3145` | **Added, unshaded.** More detail › Strokes to hole out. Production bands them 2.2, 2.5 and 2.8 by hand (not a Tour value). | as SH5 |
| SH7 | Up and down by the direction of the approach miss (short, long, left, right: rate, n, share) | `SS/ShortGameDrill.tsx:207-234,335-345` · `CALC:3080-3093` | **Added, unbanded.** More detail › Up and down by where the green was missed (production bands 35, 50 and 65 by hand) | scrambles with a known miss direction |
| SH8 | Chip proximity (overall, fairway, rough, sand) | `SS/ShortGameDrill.tsx:254-259,355-370` · `CALC:3148-3165` | **Added.** More detail › Finish after the chip | chips that finished on the green |
| SH9 | Penalties per round | `SS/ShortGameDrill.tsx:197,271` · `CALC:3173-3175` | **Shown** (GD › Off the tee, with the Tour rate) | logged penalty shots per 18 holes |
| SH10 | Standing strips: sand saves and penalties against the Tour | `SS/StandingDrill.tsx:148-163` | **Shown** as OV rows "Sand saves" and "Penalty strokes" (Tour; team for a coach) | the window |
| SH11 | Short-game trend | none in production (`SS/buildStatsViewModel.ts:557`) | **Not shown because** production has none | n/a |
| SH12 | Cache `up_and_down_percentage` | not rendered | **Not shown because** production does not render it | n/a |

## Putting

| # | Production figure | Production source | Clubhouse | Window and rule |
| --- | --- | --- | --- | --- |
| PT1 | Putts per round | `SS/PuttingDrill.tsx:376,385-421` · `CALC:2693-2694` | **Shown.** OV card, HERO-adjacent comparison row | putts per 18 holes of the window's rounds |
| PT2 | Putts per hole | `SS/PuttingDrill.tsx:377,415` · `CALC:2695` | **Added.** GD › Putting › More detail › Putting numbers | every hole |
| PT3 | Putts per GIR | `SS/PuttingDrill.tsx:378,416` · `CALC:2698` | **Shown.** "Putts / GIR" | holes where the green was hit |
| PT4 | 3-putts per round | `SS/PuttingDrill.tsx:379,418` · `CALC:2708-2710` | **Shown.** "3-putts / round" | per 18 holes |
| PT5 | 1-putts (a count in production) | `SS/PuttingDrill.tsx:382,419` · `CALC:2195` | **Shown** as "One-putt rate" (holes) | the window |
| PT6 | Average leave after a putt (holed = 0) | `SS/PuttingDrill.tsx:383,420` · `CALC:2743` | **Added.** Putting numbers | every putt with a known result |
| PT7 | Putting by distance: nine bands with make %, sample, share of first putts, average leave, strokes to hole out, proximity | `SS/PuttingDrill.tsx:248-264,505-556` · `CALC:2713-2812` | **Added.** GD › Putting › More detail › Putting by distance (nine bands: 0-3, 3-5, 5-10, 10-15, 15-20, 20-25, 25-30, 30-35, 35+ ft) | putts of the window's rounds |
| PT8 | Make-rate curve over the nine bands (production's has no Tour line; its leak map has six bands with one) | `SS/PuttingDrill.tsx:604`, `FW/charts/MakeCurve`, `FW/charts/LeakMap` · `CALC:2713-2728`, `LMB:32-46` | **Shown and widened.** GD › Putting "Make rate by distance": nine bands with a dashed Tour line where a Tour value maps (3-5, 5-10, 10-15, 15-25 for 15-20 and 20-25, 25+ for the last three; none for 0-3 ft), each band with its putts, bands under 10 putts not graded | putts with a distance and a result |
| PT9 | Make % by break and distance (matrix with n) | `SS/PuttingDrill.tsx:334-349,558-569` · `CALC:2881-2913` | **Added.** More detail › Make rate by break and distance | putts with a recorded break |
| PT10 | Break overview (overall make % by break) | `SS/PuttingDrill.tsx:351-355,568` · `CALC:2907` | **Shown** (inside 10 ft); the overall rate per break is **added** beside it | as PT9 |
| PT11 | "Work on next" (the weakest cell with 8 or more putts) | `SS/PuttingDrill.tsx:246,357-369,571-573` | **Added.** More detail › Practice target, with the same 8-putt floor and the same sentence when no cell has it | as PT9 |
| PT12 | "Putting is costing an estimated N strokes a round" | `SS/PuttingDrill.tsx:371-373,574` · `lib/golf/strokes-gained.ts:175-255` | **Waiting on the shared Tour fix (Q-93).** Production's line is built on `COLLEGE_BENCHMARKS`, not the Tour (Q-88), and the owner moved it to the Tour in production's own code (a separate PR). Clubhouse shows it once that lands, from the shared code through the adapter; until then SG putting (OV, HERO, phone, RT) is the Tour-based read | n/a |
| PT13 | Miss direction (left, right, short, long, low, high) | `SS/PuttingDrill.tsx:423-439,579-585` · `CALC:2815-2820` | **Shown.** "How putts miss" | missed first putts with a tag |
| PT14 | Miss tendency by break | `SS/PuttingDrill.tsx:441-455,586-589` · `CALC:2908-2910` | **Added.** More detail › Short, low and high misses by break | missed putts with a break |
| PT15 | Putts by round ribbon | `SS/PuttingDrill.tsx:312,593-603` · `SD:1708` | **Added.** GD › Putting › More detail › Putts by round | one point per round, per 18 holes |
| PT16 | Putting benchmarks sheet (make % by band against the Tour **and D1**, with verdicts and a footnote) | `SS/PuttingBenchmarkSheet.tsx:41-155` · `lib/golf/benchmarks/putting.ts:120-160` | **Added, Tour only.** GD › Putting › More detail › Against the Tour: band, you, Tour, putts, verdict (At or above the Tour, Below the Tour, Under 10 putts, No putts yet). The D1 column, its verdicts and its footnote are not built (Q-88). Production still ships the D1 column (reported). | bands of the nine with a Tour value; 10 putts to grade |
| PT17 | Standing strips for putting (five bands: you, team, Tour) | `SS/StandingDrill.tsx:145-163,231-267` | **Shown** as OV rows "Make 3-5 ft" to "Make 25+ ft" against the Tour; no team value (the round cache has no band columns) | the window |
| PT18 | Two-putt count, one-putt and three-putt percentages | defined in `lib/golf/metrics/display-registry.ts:223-229`, never rendered | **Not shown because** production does not render them | n/a |

## Strokes gained and standing

| # | Production figure | Production source | Clubhouse | Window and rule |
| --- | --- | --- | --- | --- |
| SG1 | SG total per round (spine hero; standing rail) | `SS/StatsSpine.tsx:48-71`, `SS/buildStatsViewModel.ts:226-255` | **Shown.** HERO, OV, phone Strokes gained panel, RT columns, with a change chip against the previous 10 | the window's rounds with shots, per 18 holes; three whole rounds needed |
| SG2 | SG by leg (off the tee, approach, around the green, putting) with team and Tour ticks | `SS/StandingDrill.tsx:57-143,219-230` | **Shown.** OV "Strokes gained by leg" and the comparison rows (coach: team's pooled mean; player: no team) | as SG1 |
| SG3 | Verdict ("Gaining +0.42 a round. Leaking most in putting") and the bento's "Strongest, biggest leak" | `SS/buildStatsViewModel.ts:262-276`, `SS/StatsBento.tsx:253-284` | **Shown.** The strokes-gained note under the leg route | as SG1 |
| SG4 | Spine priorities (top three weaknesses, "est." values) | `SS/buildStatsViewModel.ts:183-206` · `lib/golf/strokes-gained.ts:286-336` | **Waiting on the shared Tour fix (Q-93).** The ranking grades against `COLLEGE_BENCHMARKS` and the player's own mean, not the Tour (Q-88), and moves to the Tour in production's own code (a separate PR). Clubhouse shows it once that lands; until then the legs ranked by SG are the leak read | n/a |
| SG5 | Team percentile or rank | `team_pct` computed, never rendered (`SS/StandingDrill.tsx:248`) | **Not shown because** production does not render it | n/a |
| SG6 | Standing strips for the other metrics (scoring by par, big numbers, pressure gap, opening hole) | `SS/StandingDrill.tsx:145-267` · `STDG/metric-config.ts:33-103` | **Shown** as OV rows "Par 3, 4 and 5 scoring", "Big numbers", "Pressure gap" and "Opening hole" against the Tour (the pressure and opening rows with production's floors: 3 + 3 rounds and 5 rounds; 5 rounds) | the window's rounds |
| SG7 | Team marker on each strip | `SS/StandingDrill.tsx:93,248` · `lib/coachhelm/v3/standing/team-floor.ts:17-22` | **Coach only (Q-91) and where the window has the figure:** team value on scoring, fairways, GIR, putts, scrambling, sand saves, 3-putts, big numbers and penalty strokes (pooled from the window's round cache). **Not shown** on proximity bands, par scoring, putt bands, pressure and opening rows, because the round cache has no columns for them and production's team ticks there come from a nightly all-rounds cache that would not match the window beside it. | pooled 18-hole rounds of the active team in the window |
