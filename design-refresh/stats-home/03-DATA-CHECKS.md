# Data checks: My stats, Team Stats, Home "Your game"

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 10 rows).

Every figure on the three screens, where today's code gets it, the formula, the fixture value, and a status (OK, RENAME, DERIVE, MISSING). Read at helmv3 `main` 75b4956. No new query, table, RPC or write is proposed, and nothing changes what shot tracking collects.

The tables below were taken against an earlier version of the design page. Where they name a figure the page no longer shows (an invented Tour value, a 4-band chart), section 9 at the end says what the page shows now. The page in `redesign/` is the current one.

Repo read at `75b4956` (origin/main), read only. Every figure in `prep/figures-dump.md`, mapped to where today's Clubhouse code gets it, the formula as the code computes it, the value the preview fixture gives, and a status.

## Summary

**Status counts (201 table rows):** OK 146 · RENAME 15 · DERIVE 19 · MISSING 21. Three rows are "OK value / Tour MISSING": counted as OK, with the missing Tour mark counted on the At a glance row it points to.

- **OK**: exists as shown. **RENAME**: exists under another label or unit. **DERIVE**: can be computed on the client from data the page already loads (how is in the row). **MISSING**: not loaded or not recorded today. Drop it or swap in the named replacement. No new query is proposed.
- The redesign's Tour numbers are mostly invented. `golf_pga_standards` (seed `supabase/migrations/20260610040300_seed_golf_pga_standards.sql`, LPGA in `20260610170000`) holds only these Tour values: GIR 66, double-or-worse rate 2.0%, par 3/4/5 scoring 3.00/3.97/4.55, penalties 0.3 a round, approach proximity 18/30/45 ft, scrambling from fairway 65, rough 58 and sand 50, make rates 3–5 ft 90.5, 5–10 ft 62.2, 10–15 ft 35.7, 15–25 ft 15.4 and 25+ ft 5.5, pressure gap 0.5, opening hole 0.1, and SG 0. **There is no Tour value for:** fairways hit, overall scrambling, putts per round, one-putts, three-putts, GIR by distance, GIR from fairway or rough, fringe or inside 10 yds, or 0–3 ft. The mock's 61%, 58%, 29.0, 74%, 49%, 83/72/58/39 and 99% come from nowhere. Its 58% equals the *rough* scrambling standard and must not be reused for overall scrambling. Its 5–10 ft Tour figure of 56% is wrong; the real value is 62.2.

### Formula problems found (file:line)

1. **"Missed short" counts some misses twice.** The calculator's `approachMissShortPct` already includes short-left and short-right (`src/lib/utils/golf-stats-calculator-shots.ts:3008`). Clubhouse then adds those two cells again: `screens/stats/GameDetail.tsx:357-358` and `screens/stats/OverviewZones.tsx:110-111`. That double-counts every compound miss, so a figure that is truly 54% can show up to about 74%. Production uses `approachMissShortPct` alone (`src/components/golf/stats/spine-stage/ApproachDrill.tsx:310`, `round-report/buildRoundStatReport.ts:396`). The `GreenMiss` grid (`GameDetail.tsx:600-609`) has the same mix-up: its Short, Long, Left and Right cells are axis totals that already include the corners, while the corners are pure. **Fix:** "Missed short" = `s.approachMissShortPct`. The preview fixture hides the bug because its 8 cells are written as pure cells that sum to 100.
2. **Home asks for Tour figures that don't exist.** `data/leg-rows.ts` (the `row('tee'…)`, `row('short'…)` and `row('putting'…)` calls) looks up `fairway_pct`, `scrambling_pct` and `putts_per_round`. None of these is in `golf_pga_standards`, so all three are always null. Only Approach (`gir_pct`) ever draws a "You vs Tour" bar.
3. **Home's "Improving" and "Slipping" can never show.** `screens/home/PlayerGame.tsx` `Spark` calls `halvesChange(data, null)` on at most `LEG_TREND = 7` points (`data/leg-rows.ts:17`). That gives 3 values per half. With no pooled spread to fall back on, `meanSe` (`lib/stats-signal.ts`) needs 5 values a half, so the standard error is null and every leg reads "No clear change". To make the label possible, `LEG_TREND` needs to be 10 (the window already holds 10 rounds), and a putts spread would still need 5 a half.
4. **SG leg "likely range" uses the total's spread.** With fewer than 5 rounds, or when the player's own spread is about 0, a leg's standard error falls back to `POOLED_SD.sg = 3.8`, the spread of total SG. This happens in `screens/stats/leg-rows.ts` `sgLegBars` (`spreadFor(s.values,'sg')`), `screens/stats/team-rank.ts:24-28` (`spread: 'sg'` on every leg) and `data/stats-team.ts:490`. The per-leg spreads `POOLED_LEG_SD` (tee 1.3, approach 2.5, around 1.4, putting 2.0, `lib/stats-signal.ts:19`) exist but only CoachHelm's dive uses them. For early players, leg ranges come out 1.5 to 3 times too wide. In the fixture, Off the tee shows +0.3 with a range of −0.9 to +1.5.
5. **One-putt rate is diluted.** `GameDetail.tsx:387` divides `onePuttsTotal` by `holesPlayed`. But one-putts only count holes with putts recorded (calculator `:2340-2352`). Putts per round and three-putts had the same denominator bug, fixed in #917, which divides by holes with putts. `totalHolesWithPutts` is not exposed on `GolfStats`, so the client cannot divide correctly.
6. **Tee distances include par-3 tee shots.** `drivingDistance` is the tee shot's distance on every hole (calculator `:1201`, `:2201`), with no par check. So "All tee shots" and especially "Other clubs · when driver stays in the bag" mix in par-3 irons. Fairways hit is correctly par 4 and 5 only.
7. **One figure, three sources, on one page.** GIR, fairways, putts and scrambling are read from three places:
   - (a) the shot calculator `GolfStats`: Game detail sections, the phone's leads and tiles
   - (b) `golf_round_stats_cache` through `comparisons`: desktop Overview, the comparison table, team figures
   - (c) `golf_rounds.total_*`: `extra.compare` ("vs the 10 before"), `extra.series`, Home's greens and putts

   These can disagree. In the fixture, GIR reads 47 vs 60 vs 47.2, scrambling 47 vs 53, and putts 29.8 vs 31.2 vs 29.8. **The redesign repeats one figure on the summary, the detail page and "Against the 10 before", so pick one source per figure.** Recommendation: the summary and detail headline from `comparisons` (cache, held to floors), breakdowns from `GolfStats`, and "vs before" from `extra.compare`, with a caption saying it is round totals.
8. **The mock's "How this is measured" copy contradicts the code.**
   - GIR: the denominator is every hole played, not "shots from outside 50 yards". GIR = `golf_holes.gir`, or else the first shot that finds the green has shot number ≤ par − 2.
   - Scrambling: a chance is every hole where the green was missed, and a save is par or better. It is not "inside 50 yds, holing out in two".
   - Make rates: every putt counts by its own start distance, not "where the first putt starts" (calculator `:2356` comment, `loadPutts`).
   - Sand saves: = `golf_holes.sand_save` non-null, a greenside-bunker visit, and that can include a GIR hole.
9. **Wrong wording when everyone is below zero.** Team "X gains the most; Y loses the most": in the demo every player is negative, so this should read "loses the least" (`TeamRank`/`team-rank.ts` copy for the redesign).
10. **Two definitions of the double-bogey rate.** Game detail divides doubles by holes *scored* (`GameDetail.tsx:316-317`). The comparison table's "Big numbers" divides by `holes_played` (`data/stats-weight.ts` `bigNumberRate`). They differ on partly scored cards.
11. **"Goals this season" is not filtered by season.** The goals read takes the newest 20 with no date filter (`data/stats-player.ts:267-274`).
12. **The Tour lookup has no season filter.** `readTourBenchmarks` (`data/stats-common.ts`) has no `season` filter. Once a second season's rows exist, the Map keeps whichever row comes last. Low risk today, because only 2024 rows exist.
13. **The preview fixtures are inconsistent with themselves** (`preview/fixtures-stats.ts`):
    - `missLeftCount`/`missRightCount` are unset, so the drive strip reads Left 0%, Right 0%, Other 37%.
    - `missLeftPct`/`missRightPct` (20/17) are written as shares of drives. The calculator's are shares of misses and sum to 100.
    - Sand reads 4 of 11 = 37% while `scramblingPctSand` reads 33 on 12 attempts. The calculator makes these identical.
    - `win.sgPerRound` is −0.9, but the rounds' own SG averages −0.49.
    - `comparisons` disagree with `stats` (scoring average 74.1 vs 73.6).
    - The best-GIR date is wrong (Sep 23 holds 14/18; the best is Sep 20 at 15/18), and the fewest-putts tie should go to the older round (Sep 20).
    - In `PREVIEW_TEAM_DEMO`, `legTotals` and `team.sgMean` are not recomputed from the demo grid, so the leg card (−0.5) and the ranking (−3.3 to −7.1) disagree.

### Definitions used below

- **Window.**
  - **Last N** (`window: 'last10'`, `last` ∈ 5/10/20; the code has no "Last 5 only" switch, and the mock's Last 5 / Last 10 / Season is a subset) = the player's newest N rounds that match the filter: scored, 18 holes unless Holes says 9 or Both, type/course/date filters applied, reading back up to 12 months across seasons (`LAST_TEN_MONTHS`, `lastTenFloor`).
  - **Season** = from 1 August in the team's zone.
  - **Qualifiers** = this season's qualifier rounds.
  - **"The 10 before"** = the next N matching rounds (`previousRounds`). It exists only for Last N, needs ≥3 whole rounds, and is null for Season and Qualifiers.
  - Rounds posted as a total only count for scores, never for hole figures (Q-123).
- **SG.** `golf_rounds.strokes_gained_*`, Broadie expected strokes against the Tour (women's curve ×1.083, `lib/sg.ts`). A round's total is the sum of its shots.
  - Window value = per-18 weighted mean over rounds with their holes. It needs ≥3 whole rounds (`MIN_SG_ROUNDS`).
  - **Likely range** = value ± 1 standard error. Standard error = SD / √n, using the player's own SD from 5 rounds, else the pooled 3.8 (`spreadFor`, `likelyRange` in `screens/stats/leg-rows.ts`).
  - **A change is toned** only when |Δ| > the standard error of the difference (`deltaTone`).
- **Tour choice.** `loadTourBenchmarks(tourForGender(team.gender))` reads `golf_pga_standards.pga_tour_value` where `tour` = pga or lpga. If the team row didn't load, no benchmark is shown. It is never D1.
- **Floors** (`FLOORS`, `floorRate`): fairways and greens show from 2 rounds and are steady from 5; scrambling and sand show from 10 chances and are steady from 30; make bands from 10 putts.

Fixture keys:
- **Fx-P** = `PREVIEW_PLAYER` (Jonah, coach view, Last 10)
- **Fx-T** = `PREVIEW_TEAM_STATS`
- **Fx-TD** = `PREVIEW_TEAM_DEMO` (grid only)
- **Fx-H** = `PREVIEW_PLAYER_HOME` (Theo)

Paths are under `src/clubhouse/` unless they start with `src/lib`.

---

## Player · My stats summary

### Scoring average card
| Figure | Source today | Formula | Fixture | Status |
|---|---|---|---|---|
| Scoring average 75.4 | `stats-player.ts` → `win.avg` (`summarizeWindow`) | per-18 weighted mean of `total_score`, all window rounds | Fx-P 73.6 | OK |
| +3.4 to par | `win.toPar` | per-18 weighted mean of `score_to_par` | +1.6 | OK |
| "4.3 lower than the 10 before" | `extra.compare.rows[0]` (Scoring avg) | last − previous window mean; toned if past `se` (`windowChangeSe`, pooled 3.6) | +0.7 (se 1.6, no clear change) | DERIVE (last − previous; today's phone "Scoring trend" is newer half vs older half *inside* the window, a different figure) |
| Round dots + "5-round average" line | `rounds[]` via `trendRounds`, `RoundTrend` | score per 18; line = trailing 5-round mean from the 3rd (`rollingMean`) | 10 dots, 72–75 | OK |
| Par 72 line | `rounds[].score − toPar` | par of each round | 72 | DERIVE (one line only when every round has the same par) |
| Date ticks Sep 15 / Oct 21 | `rounds[].date` | — | Aug 30 / Oct 12 | OK |

### What changed card
| Figure | Source today | Formula | Fixture | Status |
|---|---|---|---|---|
| Sentence + "Last 10 75.4 / 10 before 79.7" | `PlayerInsight` → `playerInsight` (`data/stats-insight.ts`) over `sgChange` + `extra.compare.rows` | lists only changes past their standard error, at most 2, clearest first | Fx-P: none past standard error → "No clear change vs previous 10" | RENAME (today's card lists toned lines, not a written sentence; the numbers are `compare.rows[0].last/previous`) |
| "Greens up 4.1 pts" | `compare.rows` GIR | `golf_rounds.total_gir` summed / `total_gir_possible` summed, hole rounds only | 47.2 from 52.8 (−5.6, se 5.4 → toned) | OK |
| "Fairways down 3.9" | `compare.rows` Fairways | Σ`total_fairways_hit` / Σ`total_fairways` | 62.7 from 61.1 | OK |

### At a glance
| Figure | Source today | Formula | Fixture | Status |
|---|---|---|---|---|
| Greens 57% | `comparisons` "Greens in regulation" (cache) **or** `stats.girPercentage` | cache Σ`greens_hit`/Σ`greens_total`, floored; calculator `girTotal/girOpportunities` (every hole) | cache 60 / calc 47 | OK (choose one source, see problem 7) |
| Tour 66% | `bench.gir_pct` | `golf_pga_standards` | 66 | OK |
| Fairways 43% | `comparisons` "Fairways hit" / `stats.fairwayPercentage` | par 4/5 holes with a known result | 63 / 63 | OK |
| Fairways Tour 61% | — | no `fairway_pct` row | — | MISSING (drop the Tour mark) |
| Scrambling 32% | `comparisons` "Scrambling" / `stats.scramblingPercentage` | missed GIR & score ≤ par ÷ missed GIR | 53 / 47 | OK |
| Scrambling Tour 58% | — | no overall row (58 is rough) | — | MISSING |
| Putts 32.1 | `comparisons` "Putts per round" (`cachedPutts`) / `stats.puttsPerRound` | per 18; rounds with putts recorded | 31.2 / 29.8 | OK |
| Putts Tour 29.0 | — | no `putts_per_round` row | — | MISSING (use "two a green is 36", as Team does) |
| Birdies 1.8 a round | `stats.birdiesPerRound` | holes at par−1 ÷ rounds (per 18 with 9-hole rounds) | 1.9 | OK |
| Bogeys 5.6 a round | `stats.bogeysPerRound` | holes at par+1 ÷ rounds | 4.8 | OK |

### Strokes gained card
| Figure | Source today | Formula | Fixture | Status |
|---|---|---|---|---|
| −5.7 vs Tour | `win.sgPerRound` | per-18 mean, ≥3 rounds with SG | −0.9 | OK |
| Off the tee −0.9 | `win.sgLegs.tee` → `sgLegRows` | per-18 mean of `strokes_gained_tee` | +0.3 | OK |
| Approach −3.4 | `win.sgLegs.approach` | same | −1.2 | OK |
| Around green −0.1 | `win.sgLegs.around` | same | −0.1 | OK |
| Putting −1.3 | `win.sgLegs.putting` | same | +0.2 | OK |
| "Strongest: X. Biggest leak: Y, n a round" | `sgLegRows` | max and min leg | Strongest Off the tee; leak Approach 1.2 | DERIVE (today's note is "N legs are losing strokes") |

### Off the tee card
| Figure | Source today | Formula | Fixture | Status |
|---|---|---|---|---|
| 43% Fairways hit | as At a glance | — | 63 | OK |
| Tour 61% | — | — | — | MISSING |
| −0.9 SG | `win.sgLegs.tee` | — | +0.3 | OK |
| Left 31% / Fairway 43% / Right 26% | `stats.missLeftCount`, `fairwaysHit`, `missRightCount` ÷ `fairwayOpportunities` (`FairwayStrip`) | share of par-4/5 drives; left = miss direction containing "left" | Fx-P: Left 0% Fairway 63% Right 0% **Other 37%** (fixture gap) | OK (keep the "Other" slice; L+F+R need not be 100) |
| All tee shots 268 yds | `stats.drivingDistanceAvg` | mean tee-shot `shot_distance` > 0, **every hole incl. par 3** | 259 | OK (formula issue 6) |
| Driver 281 yds | `stats.drivingDistanceDriverOnly` | tee shots with `club_type = driver` | 266 | OK |
| Other clubs 236 yds | `stats.drivingDistanceNonDriverOnly` | tee shots not driver, incl. par-3 irons | 238 | OK (formula issue 6) |

### Approach card
| Figure | Source today | Formula | Fixture | Status |
|---|---|---|---|---|
| 57% GIR · Tour 66% | as At a glance | — | 47 or 60 · 66 | OK |
| −3.4 SG | `win.sgLegs.approach` | — | −1.2 | OK |
| 50–100 / 100–150 / 150–200 / 200+ | `stats.girPct50_75 … girPct200_225 ?? girPct225Plus` | GIR % by approach distance, seven 25-yd bands | 77·70·57·44·39·28·15 | RENAME (use the seven real bands; the pct-only fields have no per-band counts, so 50–100 cannot be pooled) |
| Tour ticks on distance bars | — | none | — | MISSING |
| From the fairway 68% | `stats.girPctFromFairway` | approach raw lie = fairway (par-3 tee shots excluded) | 58 | OK |
| From the rough 41% | `stats.girPctFromRough` | raw lie = rough | 35 | OK |
| Missed short 58% | `stats.approachMissShortPct` | short + short-left + short-right ÷ missed approaches | today shows 54 (double count); correct 34 | OK (fix formula issue 1) |

### Short game card
| Figure | Source today | Formula | Fixture | Status |
|---|---|---|---|---|
| 32% Scrambling · Tour 58% | as At a glance; Tour none | — | 47 | OK value / Tour MISSING (counted under At a glance) |
| −0.1 SG | `win.sgLegs.around` | — | −0.1 | OK |
| All chances 32% | `stats.scramblingPercentage` | — | 47 | OK |
| From sand 17% | `stats.sandSavePercentage` | `golf_holes.sand_save`: true ÷ non-null | 37 | OK |
| Inside 10 yds 53% | `stats.scramblingPct0_10` | scramble chances whose chip/pitch was ≤10 yds | 60 | OK |
| From the fringe 46% | `stats.scramblingPctFringe` | chip lie = fringe | 64 | OK |
| Tour ticks | `bench.scrambling_pct_sand` (50) only for sand; none for all, inside 10, fringe | — | 50 | DERIVE (sand only; drop the others) |

### Putting card
| Figure | Source today | Formula | Fixture | Status |
|---|---|---|---|---|
| 32.1 Putts / round | `comparisons` / `stats.puttsPerRound` | putts ÷ holes with putts × 18 | 31.2 / 29.8 | OK |
| Tour 29.0 | — | — | — | MISSING |
| −1.3 SG | `win.sgLegs.putting` | — | +0.2 | OK |
| 0–3 / 3–5 / 5–10 / 10–20 ft | `puttBands` (`bandPutts`, `PUTT_BANDS`) | every putt with a distance and a result, by start distance; bands 0–3, 3–5, 5–10, 10–15, 15–25, 25+ | 89·63·39·20·11·3 | RENAME (10–20 doesn't exist; use 10–15 and 15–25) |
| Tour ticks | `puttBands[].bench` | 3–5 90.5, 5–10 62.2, 10–15 35.7, 15–25 15.4, 25+ 5.5; none for 0–3 | as listed | OK (no tick on 0–3) |
| Three-putts / round 1.4 | `comparisons` "3-putts per round" / `stats.threePuttsPerRound` | holes with ≥3 putts ÷ holes with putts × 18 | 0.8 | OK |
| One-putts / round 4.2 | `stats.onePuttsTotal`, `holesPlayed` | onePuttsTotal × 18 ÷ holesPlayed | 5.4 (54×18÷180) | DERIVE (today shows "One-putt rate" as a % of holes, 30%; under-reads, formula issue 5) |

### Round by round
| Figure | Source today | Formula | Fixture | Status |
|---|---|---|---|---|
| 10 rounds | `win.rounds` | — | 10 | OK |
| Bars per round | `rounds[].score` | — | 72–75 | OK |
| Best 73 · Oct 3 | `extra.bests.score` | lowest score, ties to oldest | 72 · Sep 9 | OK |

### Goals and focus areas
| Figure | Source today | Formula | Fixture | Status |
|---|---|---|---|---|
| "Coach Rivera" | — | focus/goal rows read no setter (`attestingCoach` is the team's primary coach, not the author) | — | MISSING |
| 75.4 / Under 75 / 0.4 to go | `goals[]` current, target | stored `golf_goals.current_value` − `target_value` | "Break 70 in competition": 72, 69, 3 to go | DERIVE (the "to go" subtraction; current is the stored value, not the live window average unless the goal's metric is the scoring average and you swap in `win.avg`) |
| 6/10 · Approach 125–150 yds | `focusAreas[].loop.progress` (flag `coachhelm_verdicts_v1`) | made of horizon *attempts* ("22 of 40 putts in") | Fx-P: "35 → target 30"; loops fixture "22 of 40 putts in" | RENAME (attempts, not practice blocks; flag off → `devProgress` current → target) |
| 3/8 · Sand saves "Bunker work" | same | same | — | RENAME (same as above) |

---

## Player · detail pages

### Scoring
| Figure | Source today | Formula | Fixture | Status |
|---|---|---|---|---|
| 75.4 · +3.4 to par | `win.avg`, `win.toPar` | — | 73.6 · +1.6 | OK |
| 4.3 lower than the 10 before | `extra.compare.rows[0]` | — | +0.7 | DERIVE |
| Score by round, Par dashed | `extra.series.score`, par from rounds | per 18 | 10 points | OK |
| Eagle 0.1 | `stats.eaglesPerRound` | score ≤ par−2 ÷ rounds | 0.06 | OK |
| Birdie 1.8 | `stats.birdiesPerRound` | — | 1.9 | OK |
| Par 9.4 | `stats.parsPerRound` | — | 9.8 | OK |
| Bogey 5.6 | `stats.bogeysPerRound` | — | 4.8 | OK |
| Double+ 1.1 | `stats.doublePlusPerRound` | score ≥ par+2 | 1.2 | OK |
| Scoring average 75.4 (Per round) | `stats.scoringAverage18` (restated to `win.avg` by `perEighteen`) | — | 73.6 | OK |
| Birdies / round, Bogeys / round | as above | — | 1.9, 4.8 | OK |
| Doubles or worse 1.1 | `stats.doublePlusPerRound` | — | 1.2 | OK |
| 6.1% of holes | `GameDetail` doublePct | totalDoublePlus ÷ holes scored | 6.7% | OK |
| Tour 2% | `bench.big_number_rate` | — | 2 | OK |
| Against the 10 before: 4 rows (avg, GIR, FW, putts) | `extra.compare.rows` | GIR/FW from `golf_rounds` totals; putts per 18 | 73.6←72.9, 47.2←52.8, 62.7←61.1, 29.8←30.6 | OK |
| change badges (4.3, 4.1 pts…) | `row.last − row.previous`, toned by `row.se` | — | +0.7, −5.6, +1.6, −0.8 | DERIVE |

### Strokes gained
| Figure | Source today | Formula | Fixture | Status |
|---|---|---|---|---|
| −5.7 · Last 10 | `win.sgPerRound` | — | −0.9 | OK |
| Likely −6.5 to −4.9 | `sgLegRows` total `se` → `likelyRange` | value ± SD/√n (own SD from 5 rounds, else 3.8) | −1.2 to −0.6 | OK |
| 4 legs + Total | `sgLegRows` | — | +0.3, −1.2, −0.1, +0.2, −0.9 | OK |
| Each leg's likely range on tap | `sgLegBars[].se`, `legReadout` | ± 1 standard error (formula issue 4) | tee −0.9 to +1.5; app −1.5 to −0.9 | OK |
| Axis −6 0 +6 | `sgScale` | ceil of the largest absolute value, ≥1 | ±2 | OK |
| Open a part: FW 43%, GIR 57%, Scr 32%, Putts 32.1 | as At a glance | — | 63, 60/47, 53/47, 31.2/29.8 | OK |
| Open a part: SG per leg | `win.sgLegs` | — | — | OK |

### Off the tee
| Figure | Source today | Formula | Fixture | Status |
|---|---|---|---|---|
| 43% · −0.9 SG | as summary | — | 63 · +0.3 | OK |
| likely −1.3 to −0.6 | `sgLegBars` tee `se` | — | −0.9 to +1.5 | OK |
| You 43% / Tour 61% bar | — | no fairway benchmark | — | MISSING |
| "Misses go left a little more" | `stats.missLeftPct` vs `missRightPct` (share of misses) | GameDetail lead | fixture 20 vs 17 → left | OK |
| Fairways hit 43% Tour 61% | value OK; Tour none | — | 63 | OK value / Tour MISSING (counted above) |
| All tee shots 268 · First shot of each hole | `drivingDistanceAvg` | includes par 3s | 259 | OK |
| Driver 281 · Carry and roll | `drivingDistanceDriverOnly` | `shot_distance`: carry + roll is assumed, not checked | 266 | OK |
| Other clubs 236 | `drivingDistanceNonDriverOnly` | — | 238 | OK |
| Where drives finish L/F/R | `FairwayStrip` counts | — | 0 / 63 / 0 (+Other 37) | OK |
| Against the 10 before: FW 42.9% from 46.8% | `extra.compare.rows[2]` | — | 62.7 from 61.1 | OK |

### Approach
| Figure | Source today | Formula | Fixture | Status |
|---|---|---|---|---|
| 57% · −3.4 SG · likely −3.9 to −2.9 | GIR as summary; `sgLegBars` approach | — | 47/60 · −1.2 · −1.5 to −0.9 | OK |
| You 57% / Tour 66% | GIR + `bench.gir_pct` | — | 47/60 · 66 | OK |
| "Most misses finish short…" | `approachMissShortPct` vs `approachMissLongPct` | `GameDetail` "Where missed greens finish" note | short | OK |
| From the fairway 68% | `girPctFromFairway` | — | 58 | OK |
| Fairway Tour 74% | — | — | — | MISSING |
| From the rough 41% | `girPctFromRough` | — | 35 | OK |
| Rough Tour 49% | — | — | — | MISSING |
| Missed short 58% of missed greens | `approachMissShortPct` | — | 34 (today renders 54) | OK (fix issue 1) |
| Greens hit by distance (4 bands) | `girPct*` (7 bands) | — | see summary | RENAME |
| Tour average line on bands | — | — | — | MISSING |
| Greens by round + Tour dashed | `extra.series.gir` (`girPct` from `golf_rounds`); Tour = `bench.gir_pct` | per round | 55.6–83.3; Tour 66 (mock's 89% is wrong) | DERIVE (draw `bench.gir_pct` as the line) |
| Against the 10 before GIR | `compare.rows[1]` | — | 47.2 from 52.8 | OK |

### Short game
| Figure | Source today | Formula | Fixture | Status |
|---|---|---|---|---|
| 32% · −0.1 SG · likely −0.4 to +0.2 | `scramblingPercentage`; `sgLegBars` around | — | 47 · −0.1 · −1.3 to +1.1 | OK |
| You 32% / Tour 58% | Tour none | — | — | MISSING |
| "Sand… 17% against the Tour's 50%" | `sandSavePercentage`, `bench.scrambling_pct_sand` | — | 37 vs 50 | OK |
| Scrambling 32% Tour 58% | value OK, Tour none | — | 47 | OK value / Tour MISSING (counted above) |
| Sand saves 17% | `sandSavePercentage` | — | 37 | OK |
| "2 of 12" | `sandSavesMade`, `sandSaveAttempts` | — | 4 of 11 | OK |
| "· Tour 50%" | `bench.scrambling_pct_sand` | — | 50 | OK (today shows Tour *or* the count; show both) |
| Inside 10 yds 53% | `scramblingPct0_10` | — | 60 | OK |
| From the fringe 46% · 13 attempts | `scramblingPctFringe`, `scrambleFringeAttempts` | — | 64 · 18 | RENAME (today's 4th tile is "From the rough"; swap it) |
| Up and down by lie: Fringe / Fairway / Rough / Sand + attempts | `scramblingPctFringe/Fairway/Rough/Sand`, `scramble*Attempts` | chip lie of the greenside shot; sand row = sand-save figures | 64/18, 56/14, 36/27, 33/12 | OK |
| Tour ticks by lie | `bench.scrambling_pct_fairway/rough/sand` 65/58/50; fringe none | — | 65, 58, 50 | OK |

### Putting
| Figure | Source today | Formula | Fixture | Status |
|---|---|---|---|---|
| 32.1 · −1.3 SG · likely −1.7 to −0.9 | putts/round; `sgLegBars` putting | — | 31.2/29.8 · +0.2 · −1.0 to +1.4 | OK |
| You 32.1 / Tour 29.0 | Tour none | — | — | MISSING |
| "three-putt 1.4 times" | `threePuttsPerRound` | — | 0.8 | OK |
| "Five to ten feet is the gap" | `GameDetail` `worstPutt` (largest band gap, ≥10 putts) | — | 3–5 ft (63 vs 90.5) | OK |
| Putts / round 32.1 · Two a green is 36 | putts/round; 36 is a fixed reference | — | 29.8 | OK |
| Three-putts / round 1.4 | `threePuttsPerRound` | — | 0.8 | OK |
| One-putts / round 4.2 | `onePuttsTotal`×18÷`holesPlayed` | — | 5.4 | DERIVE |
| Make rate 5–10 ft 41% | `puttBands` 5–10 | made ÷ attempts | 39 (20/51) | OK |
| 5–10 Tour 56% | `bench.putts_made_5_10ft_pct` | — | **62.2** | RENAME (value is 62.2, not 56) |
| Make rate by distance 0–3 / 3–5 / 5–10 / 10–20 / 20+ | `puttBands` six bands | — | 89/63/39/20/11/3 | RENAME |
| Tour line on bands | `puttBands[].bench` | none on 0–3 | 90.5/62.2/35.7/15.4/5.5 | OK |
| Putts by round + Tour dashed 31 | `extra.series.putts` | per 18 | 28–32 | DERIVE (series OK; no Tour putts benchmark: use 36 or none) |
| Against the 10 before putts 32.1 from 32.7 | `compare.rows[3]` | — | 29.8 from 30.6 | OK |

### Rounds
| Figure | Source today | Formula | Fixture | Status |
|---|---|---|---|---|
| 10 rounds · averaging 75.4 | `win.rounds`, `win.avg` | — | 10 · 73.6 | OK |
| Score by round | `extra.series.score` | — | — | OK |
| Best score 73 · Oct 3 · Pinehurst No. 8 | `extra.bests.score` (18-hole rounds; `bests9` for 9) | — | 72 · Sep 9 · Pinehurst No. 8 | OK |
| Best to par +1 | `extra.bests.toPar` | — | E | OK |
| Most greens 16/18 | `extra.bests.gir` (a %) | max `total_gir/possible` | 83.3% | DERIVE (show as % or use the round's `gir` "15/18" from `rounds[]`) |
| Fewest putts 31 | `extra.bests.putts` | min putts > 0 | 28 · Oct 12 | OK |
| "Personal bests · Last 10" | window, not career | bests over the window's rounds | — | RENAME (they're window bests; call them "Best in this window") |
| Every round: course, date, type, score, to par, SG | `rounds[]` | — | Oakmont CC · Oct 12 · Practice · 74 · +2 · −1.1 | OK |

### Goals
| Figure | Source today | Formula | Fixture | Status |
|---|---|---|---|---|
| 75.4 · goal under 75 this season | `goals[].current/target` | stored | 72 / 69 | DERIVE |
| 0.4 to go | current − target | — | 3 | DERIVE |
| "75.4 over last 10 rounds" | `win.avg` | only true if the goal's metric is the scoring average | — | DERIVE |
| "this season" | — | goals read is not season-filtered | — | MISSING |
| Focus "Set by Coach Rivera" | — | — | — | MISSING |
| "6 of 10 practice blocks logged" | `focusAreas[].loop.progress` | attempts in the horizon | "22 of 40 putts in" | RENAME |
| "3 of 8 bunker sessions logged" | same | — | — | RENAME |

---

## Team · Stats summary

| Figure | Source today | Formula | Fixture | Status |
|---|---|---|---|---|
| Team scoring average 74.1 | `figures['score'].value` (`stats-team.ts`) | per-18 mean over every active player's window rounds (not round days) | Fx-T 73.6 | OK |
| "Last 10 round days" (hero caption) | — | the hero is players' last 10 rounds pooled | — | RENAME ("Last 10 rounds each") |
| +2.1 to par | `figures['score'].gauge.toPar` | weighted `score_to_par` | +1.6 | OK |
| 1.2 lower than the 10 before | `figures['score'].delta`, `se` | same players' window minus their previous 10 (Q-112) | −0.9 (se 0.76 → toned) | OK |
| Chart by round day | `days[]` (last 10 dates with a round) | each day's mean per 18 | 74.8 … 73.4 | OK |
| Mean 74.3 dashed | `teamDaysMean(days)` | day means weighted by `n` | 73.9 | OK |
| Aug 30 / Oct 12 | `days[].label` | — | Aug 30 / Oct 12 | OK |
| Team SG −5.8 vs Tour | `team.sgMean` (= `figures['sg'].value`) | per-18 mean over players with ≥3 SG rounds (A4) | −0.5 (Fx-TD grid would give about −5.6) | OK |
| Legs +0.6 / −3.3 / −0.2 / −2.9 | `legTotals` | same rounds, per leg | +0.4/−0.7/+0.1/−0.3 | OK |
| Greens 55% · Putts 32.6 · Scrambling 32% | `figures` gir / putts / scramble | cache rates, floored | 61 · 30.4 · 52 | OK |
| Who gains and loses: 7 players | `grid.length` → `TeamRank` | players with ≥1 window round | Fx-TD 7 | OK |
| 1 Tyler Hayes −3.3 … | `grid[].total`, `rankWithTies` | player per-18 SG mean, ≥3 rounds; ties marked "T" | Fx-TD −3.3, −4.8, −5.2 | OK |
| "Tyler gains the most; Evan loses the most" | `grid` max and min | — | — | DERIVE (wording when all < 0: "loses the least") |

## Team · detail pages

### Team scoring
| Figure | Source today | Formula | Fixture | Status |
|---|---|---|---|---|
| 74.1 · +2.1 · 1.2 lower | as summary | — | 73.6 · +1.6 · −0.9 | OK |
| By round day + team mean dashed | `days`, `teamDaysMean` | — | mean 73.9 | OK |
| Trend reading (not in mock) | `daysHalves` | newer half vs older half of days | −0.9, se 0.85 → "Down 0.9" | OK |
| Greens 55% · Tour 66% · 3 pts | `figures['gir']` value, `gauge.ref`, `delta` | — | 61 · 66 · +3 | OK |
| Putts 32.6 · Two a green is 36 · 0.6 | `figures['putts']` | — | 30.4 · +0.3 | OK |
| Scrambling 32% · Before 35% · 2 pts | `figures['scramble']`, `gauge.ref` (previous-window rate, `refLabel: 'Previous'`) | — | 52 · ref not set in Fx-T · +4 | OK |
| Hole stats from 56 of 70 rounds | `holeCoverage(holeRoundCount, roundCount)` | null when all rounds have holes | none (Fx-T has no `holeRoundCount`) | OK |
| Grey = inside likely error | `deltaTone(delta, se)` | — | — | OK |
| Round days table: Day, Team average | `days[].label`, `days[].score` | — | 10 rows | OK |
| Round days table: To par | — | days carry no par | — | MISSING (drop the column) |

### Team game (SG by leg)
| Figure | Source today | Formula | Fixture | Status |
|---|---|---|---|---|
| −5.8 team strokes a round | `team.sgMean` | — | −0.5 | OK |
| "Approach costs the most, 3.3 a round" | min of `legTotals` | — | Approach −0.7 | DERIVE |
| 4 legs + Team total | `legTotals`, `team.sgMean` | — | +0.4/−0.7/+0.1/−0.3/−0.5 | OK |
| Tap a leg → likely range | — | no team-level leg standard error loaded (only per-player `grid[].spread.legs`, and `legHalves` for the change) | — | MISSING (drop the range, or send the tap to the TeamRank leg view) |
| Axis −4 0 +4 | `sgScale` | — | ±1 | OK |
| "Three legs are losing strokes: …" | `Legs` note | legs < −0.05 | "2 legs are losing strokes: Approach, Putting" | OK |
| The round vs the 10 before (3 rows) | as team scoring | — | — | OK |
| Hole stats from 56 of 70 | as above | — | — | OK |

### Team players
| Figure | Source today | Formula | Fixture | Status |
|---|---|---|---|---|
| 7 players | `grid.length` | — | 7 | OK |
| "Tyler Hayes gains the most" | `grid` top | — | Tyler (−3.3) | DERIVE (wording) |
| Ranked list 1–7 with SG | `TeamRank` rows | `rankWithTies`: players closer than their ranges share "T" | Tyler −3.3, Cole −4.8, Dylan −5.2, Jackson −5.4, Marcus −6.4, Owen −6.7, Evan −7.1 | OK (mock ignores ties) |
| Tap → likely range | `rankReadout` | value ± se (`grid.spread.sg.se`, pooled 3.8 below 5 rounds) | Fx-TD se 0.9 → Tyler −4.2 to −2.4 | OK |
| Tap again → open player | `teamPlayerHref` | — | — | OK |

---

## Player · Home "Your game"

Loader: `data/player-home.ts` → `legRows` (`data/leg-rows.ts`). Window: the newest 10 countable 18-hole rounds with their holes, in any season. SG is this season's (`summarizePlayer(seasonOnly)`).

| Figure | Source today | Formula | Fixture (Fx-H) | Status |
|---|---|---|---|---|
| Off the tee −0.9 SG this season | `legs.rows[tee].sg` = `season.sgLegs.tee` | season per-round mean, ≥3 rounds | +0.8 | OK |
| 42% Fairways hit | `rows[tee].value` | Σ hit ÷ Σ fairways (`golf_rounds` first, cache fallback), floored | 71 | OK |
| "Last 10 rounds" (spark caption) | `Spark` → `Last {trend.length}` | trend ≤7 points | "Last 7 rounds" | RENAME (the caption is the spark's point count, ≤7) |
| No clear change | `Spark` `halvesChange(trend, null)` | always this today (formula issue 3) | No clear change | OK |
| 59 of 140 fairways in the last 10 rounds | `rows[tee].note` | — | "101 of 142 fairways in the last 10 rounds" | OK |
| Approach −3.5 SG | `season.sgLegs.approach` | — | +0.6 | OK |
| 55% GIR | `rows[approach].value` | Σ`total_gir` ÷ Σ`total_gir_possible` | 74 | OK |
| "Last 11 rounds" | — | not producible (≤7); mock error | — | RENAME |
| You 55% / Tour 66% bar | `value`, `bench` (`gir_pct`) | — | 74 / 66 | OK |
| 99 of 180 greens | `rows[approach].note` | — | 133 of 180 | OK |
| Short game −0.1 SG | `season.sgLegs.around` | — | +0.3 | OK |
| 32% Scrambling | `rows[short].value` | cache Σ converted ÷ Σ attempts, floored at 10 chances | 62 | OK |
| You 32% / Tour 58% | `bench.get('scrambling_pct')` | no such row → null (formula issue 2) | null | MISSING |
| Up and down 26 of 81 · sand saves 2 of 12 | `rows[short].note` | cache counts | "Up and down 29 of 47 · sand saves 6 of 11" | OK |
| Putting −1.4 SG | `season.sgLegs.putting` | — | +0.1 | OK |
| 32.1 Putts per round | `rows[putting].value` | mean of `golf_rounds.total_putts` > 0 | 29.0 | OK |
| "Improving" | `Spark` | unreachable at 7 points (issue 3) | No clear change | MISSING (reachable only if `LEG_TREND` = 10 in the loader; putts would still need 5 a half) |
| You 32.1 / Tour 29.0 | `bench.get('putts_per_round')` | no such row | null | MISSING |
| 321 putts in the last 10 rounds | — | today's note is "N three-putts a round" | 290 (sum of fixture trend not available; derive from window putts) | DERIVE (sum of `recordedPutts` over the window in `legRows`) |
| Sparkline | `rows[].trend` | oldest→newest per-round rate or putts, last 7 | e.g. tee 62→71 | OK |
| Caption "Figures are your last 10 rounds; SG is the season's. A line turns green or amber only when…" | `PlayerGame` `Legs` header ("Last 10 rounds · strokes gained this season vs Tour") | — | — | OK |
| Tee "Tour" bar | `bench.get('fairway_pct')` | no such row | null | MISSING |

---

### Status tally by section

| Section | OK | RENAME | DERIVE | MISSING | Rows |
|---|---|---|---|---|---|
| Player summary | 42 | 5 | 6 | 7 | 60 |
| Player details | 59 | 7 | 9 | 8 | 83 |
| Team summary | 11 | 1 | 1 | 0 | 13 |
| Team details | 19 | 0 | 2 | 2 | 23 |
| Home Your game | 15 | 2 | 1 | 4 | 22 |
| **Total** | **146** | **15** | **19** | **21** | **201** |

*(Counted from the status cell of each table row, by its first word.)*

## 9. What the page changed to match the data

Each line was a mismatch in an earlier version of the page. The page now draws the right-hand side, so the build copies the page.

| Was on the page | Now | Why |
|---|---|---|
| Tour 61% fairways, 58% scrambling, 29.0 putts, 74% / 49% / 83 / 72 / 58 / 39 / 99% elsewhere | No Tour text or tick where `golf_pga_standards` has no value | Those values don't exist (Summary) |
| Tour 56% at 5–10 ft | Tour 62% (62.2) | The real standard |
| Approach: GIR by distance in 4 bands with a Tour tick | 7 bands as loaded, in yards, no tick | No Tour value by distance; merging bands is a new rule |
| Putting: 4 bands from 0–3 ft with a Tour tick inside 3 ft | The real 6 bands, Tour ticks at 3–5, 5–10, 10–15, 15–25 and 25+ | No Tour value inside 3 ft |
| Short game: Tour tick on "All chances" | No tick; the caption says the Tour mark is sand only, on the sand row | Overall scrambling has no Tour value |
| Off the tee: "Fairways hit" with a tone against a Tour mark | No tone, meta "Par 4s and 5s" | No Tour fairways; fairways count par 4s and 5s only (§6) |
| Home: Tour rails on every leg | Approach only (you 55, Tour 66) | §2: only `gir_pct` exists |
| Strokes gained shown after 2 rounds | Dashes and "Strokes gained shows from 3 rounds" until round 3 | `MIN_SG_ROUNDS = 3` |
| Tones (green and amber) after 2 rounds | Flat ink until there are enough rounds | The app's early-read rule |
| "What changed" said "the 10 before" for every window | "the N before" for Last 5 and Last 10; for Last 20, Season and Qualifiers it compares the newest half with the first half of the window and says so | Only Last 5 and Last 10 have an earlier window (`x.compare`); the others use halves (Conflict 17 in the plan) |
| Window switch: Last 5, Last 10, Season | Last 5, 10, 20, Season, Qualifiers, plus the filter | Today's WindowSwitch; nothing removed |
| Team round days: "To par" column | "Rounds" column | `days` has no par (plan conflict 18b) |
| Score by round in both Scoring and Rounds | Scoring only; Rounds opens with the round-by-round ticker | Test P005-D1 |
| "Fewest putts" took the first of a tie | The latest of a tie (`<=`) | Matches Personal bests in the app |
| Home sparks 7 points, labelled 10 | 10 points (the design's ask); the build draws `LEG_TREND` and labels the real count until open call 3 | §3 |

Still drawn but not buildable as drawn (the fix is in `04-FIDELITY-SPEC.md` section 8): the SG total (sum of legs vs the stored total), the goal rings' invented progress, one-putt denominator, missed-short formula.

## 10. Checks to run on staging before a PR is called done

Staging is the PROSP DATA project with Demo University Golf (demo coach and 5 players). Sign in as the demo coach and as one demo player, then for Last 10 and Season:

1. **One source per figure.** For GIR, fairways, putts and scrambling, the summary card, its detail hero and the glance tile show the same number. Record each with its source (§7 rule: headline from `comparisons`, breakdowns from `GolfStats`, "vs before" from `extra.compare` with its caption).
2. **SG.** The summary total equals the SG detail hero equals `sgPerRound`. The four legs equal `sgLegBars`. The leg ranges use the per-leg spreads once §4 is fixed.
3. **Tour.** Every Tour figure on screen appears in `golf_pga_standards` for the player's tour (men or LPGA). No Tour text for a key that's null in `bench`.
4. **Missed short.** Equals `approachMissShortPct`, on phone and desktop.
5. **Early player.** A player with 2 rounds sees no strokes gained, flat tones and the hollow early tags.
6. **Team.** The team average equals the mean of round-day averages shown in Round days. Players' order matches the SG figure shown.
7. **Home.** Each leg's figure equals that part's key figure on My stats for Last 10.

Write the results in the PR as a small table: figure, screen, value, source, matches.

## Completeness pass, 4 Nov 2026

Data rules the states in 05's Completeness pass need. Nothing here adds a query, table, RPC or write, and nothing changes what shot tracking collects, stores or sends (SHARED-10).

| Figure | Source today | Formula | Fixture | Status |
|---|---|---|---|---|
| Practice rounds in every average, SG, What changed, bests, leaders, team figures and Home legs | `round_type` on the rounds the Stats and Home loaders already read; StatsFilter's type choice | Left out by default (SHARED-11; DECISIONS 31 Oct for Roster and Home), so My stats Last 10 equals Roster's and Home's figure for the same player. The builder first checks today's default: if practice is already out, nothing changes; if it is in, the default type set drops Practice through the filter path that exists (no new query). A player who picks Practice in StatsFilter on purpose sees it counted, as the filter says. Every round lists the rounds the window counts, so "N rounds" and the list agree | add: `player?state=practice` (2 practice rounds among 12) | DERIVE (default only; list it at the top of PR 4b as a visible change if today counts practice) |
| Season window and Qualifiers on and after 1 August | Season = from 1 August in the team's zone (Definitions above) | A window with 0 rounds while Last 10 with no filter has rounds shows S-STATS.filter-empty, not the first-round card. Last N reads back 12 months across seasons, so Last 10 still has last season's rounds | add: `player?state=filterempty&window=season` | OK (rule only) |
| Home SG pills from 1 August | `season.sgLegs` (this season, 3+ rounds) | Hidden until this season has 3 rounds; the leg figures, counts, sparks and trend words read the newest 10 countable rounds in any season and keep showing (S-HOMEGAME.season-start) | add: `home-player?state=newseason` (10 rounds last season, 1 this season) | OK |
| Team Stats on and after 1 August | `stats-team.ts` window rounds | As the player: Season or Qualifiers with 0 team rounds shows S-TEAMSTATS.filter-empty; "No team rounds yet" only when Last 10 with no filter has none | add: `stats?state=filterempty` | OK |
| Round dates ("Oct 3", "Oct 21 · Tournament") | `golf_rounds.round_date` (a date, no time) | Printed as the stored calendar date with no time-zone conversion, so a round never shows a day early or late; Season's 1 August edge uses the team's zone as above | a round dated 1 Aug in a fixture viewed at UTC−5 and UTC+9 | OK (rule only) |
| One round | the same sources | Figures show with the early tag; no SG (`MIN_SG_ROUNDS` 3); no change chip (`x.compare` needs 3); the ticker has one bar and no "best"; What changed has no bars | add: `player?state=one`, `stats?state=one`, `home-player?state=one` | OK |
| Missing value | any null | "—" in `--ch-text-tertiary`, never 0, NaN or blank (SHARED-4); a Tour figure that isn't in `golf_pga_standards` is simply absent, not "—" | every fixture | OK |
| Filter-empty detection | the window's round count the loader returns; Last 10 count | `windowRounds === 0 && last10NoFilterRounds > 0`. If the loader can't give the Last 10 count without a new query, show the filter-empty card whenever the window or a filter is not the default and has 0 rounds, and the first-round card only for the default with 0 | — | OK (rule only) |
| Teammate figures for a player | none may be sent | A player's Stats and Home responses carry no other player's id or figure (SHARED-11); the team route is never served to a player | `stats?viewer=player` | OK (test) |
| Two devices | no live updates today | A round posted or deleted elsewhere shows on the next load, pull to refresh or window change; no live push is added | — | OK (rule only) |
