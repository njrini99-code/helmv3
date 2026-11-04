# Data checks: CoachHelm Team view (Team Board)

> Reconciled Oct 31 after this file was written: the design page now follows the app where they disagreed (one decimal, Solid, Early and Thin read, the five track record levels, hollow under 5 rounds on file, "This week", no target on a new proposal, the pulse plays twice). The old call 2 (turning the team flags on) is withdrawn because they're already on; the new call 2 is the fifth "Course" tab. `04-FIDELITY-SPEC.md` section 8 has every settled default. Where this file and spec section 8 differ, section 8 wins.

Checked against helmv3 `main` 75b4956 on Sat 31 Oct 2026, by reading code and by running read-only SELECTs on staging. Nothing was written to any database, no DDL was run, no flag was touched.

Repo `helmv3` at 75b4956. Staging Supabase `ybmwektreyrwjscxlogv` ("PROSP DATA"), team "Demo University Golf" (`6ecdd1a6…`), men's, zone America/New_York. The 2026–27 season started Aug 1 2026 (`data/season.ts:68` `seasonStartDate`). "Since Thursday" in the design means since Thu Oct 29.

Design: `coachhelm-team.html` (version 2). Its `<script>` holds the demo data (`AREAS`, `P`, `READS`, `PATTERN`, `WORK0`, `STORIES`, `REC`) and its `#map` section is the read-to-screen map. Both were treated as data.

Paths are under `src/clubhouse/` unless they start with `src/` or `supabase/`.

## The short version

- **The hole has a real source, but it is all time, not this season.** Each player's four areas come from `golf_player_standing` (`sg_ott`, `sg_approach`, `sg_around_green`, `sg_putting`) through `toChLadder` (`data/coachhelm-ladder-shape.ts:129`). The season table `golf_player_standing_season` is held and is **missing on staging** (`to_regclass` is null), so every figure is "All time". "This season · 73 rounds" has no source today.
- **The team figure must be computed in the loader, not read.** The standing rows carry `team_avg`, but on staging it averages 7 players (`team_n = 7`) while the roster has 5. The mean of the 5 roster ladders is the design's figure. Off the tee: rows say team 0.87, the 5 players average 0.55.
- **Raising the cap is one argument, and it costs no extra query.** `data/coachhelm.ts:696` asks `getTopInsightsForPlayers(ids, { limit: 1 })`. With `coachhelm_reads_v1_copy` on, the delivery already caps each player at 3 findings and 1 strength before the slice (`READS_OPEN_MAX`, `READS_STRENGTH_MAX`, `app/golf/actions/insight-delivery-reads.ts:25-27`). So `limit: 4` gives the Board's caps. The same one query already fetches every visible row. The cost is in what follows: 5 roster-card exposure rows become up to 20, and the per-card reads take up to 20 ids.
- **On staging, today's coach sees 5 of 68 open reads (7%). With the caps, about 15 (22%).** All 5 heads today are putting reads. With the caps the hole would hold roughly 11 putting, 2 approach, 2 around the green and 0 off the tee. Nothing on staging carries a ladder rung or a cause, so the shared pattern, the brief's counts, the claim words and the cause chips are all empty on staging.
- **Reads in two categories never reach a station.** The four stations map from `category` (`tee`, `approach`, `short_game`, `putting`, `areaOf`, `coachhelm-ladder-shape.ts:94`). `course_management`, `scoring` and `pressure` have no station. The design's penalty read sits at the tee, but the real penalty read is `course_management`. Staging has 20 such reads (8 course management, 12 par scoring). The Deep dive already files them under a fifth area, "Course and scoring" (`DIVE_AREAS`, `coachhelm-dive-shape.ts:111`). The board needs that fifth place.
- **The design's words for sureness and track record are not the product's.** Real sureness is "Solid read", "Early read", "Thin read" (confidence, `src/lib/coachhelm/confidence-label.ts`) and, for the coach only, the claim ladder (Seen repeatedly, Observed, Likely, Working hypothesis, Not enough yet). "Fair" does not exist. The Track record is by ladder rung (5 levels, targets 8, 7, 6 in 10, none, and fewer than 5 in 10), judged only from 10 rechecked reads. Not Solid, Fair, Early with 85% and 70%.
- **"Early: under 15 rounds" has no rule in the code.** The real floors are 4 countable rounds in 90 days for the miner (`ABSOLUTE_MIN_ROUNDS`, `src/lib/coachhelm/v2/mining/pattern-miner.ts:174`), 3 countable rounds for team patterns (`TEAM_PATTERN_MIN_ROUNDS`), and 5 rounds on file to count in a standing team value. Pick one and name it.
- **First-10 trails can be drawn, with a new read and no new data.** `golf_rounds` carries per-round `strokes_gained_tee`, `_approach`, `_around_green`, `_putting`. On staging their all-rounds average equals the standing rows exactly, so the first 10 SG rounds give a matching earlier point. It is "first 10 rounds on file", not "first 10 this season": every staging SG round is from May to July.
- **Flags: the brief's premise is out of date.** At 75b4956 the registry has `coachhelm_team_pattern_v1`, `coachhelm_monday_brief_v1`, `coachhelm_track_record_v1`, `coachhelm_support_v1`, `coachhelm_recheck_v1`, `coachhelm_verdicts_v1`, `coachhelm_root_cause_diagnosis`, `coachhelm_reads_v1_copy` and `coachhelm_corrections_v1` **on for production and preview**, off for development and by default (`src/lib/flags/registry.generated.ts`). What is "off" is Clubhouse itself in production. The build should confirm the deployed values per environment; this file did not.
- **Nothing here changes shot tracking or the engine.** Every change below is a loader argument, a read, a shape or a label. See the last section.

---

## Figure by figure

### 1. Team total strokes to Tour, and per area

| On the design | Source | Formula | Verdict |
|---|---|---|---|
| Per area (tee, approach, around the green, putting) | `ChLadder.rows[].strokes` per roster player, from `golf_player_standing.player_value − pga_value` for `sg_ott`, `sg_approach`, `sg_around_green`, `sg_putting` (`coachhelm-ladder-shape.ts:118-123`, `AREAS` `:70-75`) | Team = mean over roster players with a figure in that area. A player with `missing` is left out of that area's mean and named in the sheet. | Real, all time |
| Team total ("−5.32 a round") | Sum of the four area means | Equals the mean of `sg_total` within rounding (staging: −5.32 both ways) | Real, all time |
| "This season" | `golf_player_standing_season` | Held migration (`supabase/migrations/HELD.md`), table missing on staging; `loadPlayerStanding` falls back to the lifetime table and labels it "All time" (`data/coachhelm-standing.ts:155-165`) | **No source today.** Say "All time". |
| Spot size by cost | Same team means | Page rule | Real |

Notes:
- `ChLadder.strokes` is a string with one decimal ("−0.3"). The hole wants two decimals and a number. The loader must keep the raw delta (`player_value − pga_value`), not parse the string.
- On staging `pga_value` is 0 for all four SG metrics, so strokes to Tour equals `player_value`.
- Do not use `golf_player_standing.team_avg` for this. It is the refresh's team (active members with 5+ rounds on file at refresh time, `supabase/migrations/20260925120000_golf_standing_team_pct_floor_5.sql:131-141`) and it goes stale when the roster changes. Staging shows `team_n = 7` against 5 members today.
- Gender: the batch loader applies the LPGA anchor per player (`src/lib/coachhelm/v3/standing/loader.ts:278`). A women's team is never drawn against the men's Tour.

Staging, per player, all time (strokes a round vs Tour):

| Player | Tee | Approach | Around green | Putting | Total | Rounds on file (cache) |
|---|---|---|---|---|---|---|
| Ethan | −0.28 | −2.97 | −0.64 | −2.72 | −6.60 | 15 |
| Jackson | +0.81 | −1.54 | +0.20 | −3.91 | −4.44 | 17 |
| Mason | +1.01 | −2.44 | −0.45 | −3.00 | −4.88 | 14 |
| Owen | −0.15 | −3.83 | −0.31 | −2.16 | −6.45 | 14 |
| Tyler | +1.35 | −2.68 | +0.46 | −3.34 | −4.21 | 14 |
| **Team mean** | **+0.55** | **−2.69** | **−0.15** | **−3.03** | **−5.32** | |

So on staging the hole leads with putting, then approach, and the tee is a gain. Players "stand where they lose most": putting for Jackson, Mason and Tyler, approach for Ethan and Owen.

### 2. Each player's four areas, rounds this season, and "early"

- Four areas: as above, one `ChLadder` per player.
- Rounds this season: **three definitions disagree on staging.**

| Source | What it counts | Staging (each player) |
|---|---|---|
| `golf_player_stats_cache.rounds_this_season` | Countable by the SQL rule, from Aug 1 by the server's UTC date, refreshed only when the cache is | 2 (Tyler 3, stale) |
| `golf_rounds` since `seasonStartDate`, completed, not test | Every completed round | 2 |
| Same, filtered by `isCountableRound` (`src/lib/golf/round-countable.ts:120-139`) | Rounds with every hole scored | **0** |

The two Sep 25–26 qualifiers are posted as totals with no nines, so the TS rule does not count them. Use the TS rule (it is what the miner, patterns and the brief count) and say "countable rounds".
- "Early (under 15 rounds)": no 15 exists in the code. Real floors:
  - `roundsToGo` (`data/coachhelm.ts:99-121`): the miner's floor, at least 4 countable rounds in a 90-day window. Private today; only the player board uses it.
  - Team patterns: 3 countable rounds, all time (`TEAM_PATTERN_MIN_ROUNDS`, `src/lib/coachhelm/v3/team-pattern/pattern.ts:42`).
  - Standing team values: 5 rounds on file (`cache.rounds_played >= 5` in the refresh).
  - Per read: the support pass's Not enough yet (`ChNotEnough`, `data/coachhelm-firm.ts:35`).
  - Recommendation: draw a player hollow when `roundsToGo > 0`, and say "{n} more rounds before CoachHelm reads {name}". That is a number the code stands behind.
- On staging every player has `roundsToGo = 4` (no countable round in the last 90 days), yet each has 9 to 15 open reads from the summer. Hollow by that rule would sit beside a list of reads. The screen should say both: "Reads from last season's rounds. 4 more rounds this season before the next read."

### 3. First-10-rounds standing for the huddle trails

- No standing source has a window. `golf_player_standing` is lifetime; the season table is held and has no "first N" either.
- `golf_rounds` has per-round SG columns. The themes trend already reads them (`src/lib/coachhelm/v3/themes/trend.ts`). A new read, oldest 10 countable rounds with `strokes_gained_total` not null per player, gives the earlier point. One query for the roster, about 15 rows a player.
- Checked on staging: the all-rounds mean of these columns equals the standing value for every player and area (Ethan tee −0.28, approach −2.97 and so on). So the trail's two ends are on one basis.

| Player | SG rounds | First 10 ended | Striking now → first 10 | Scoring now → first 10 |
|---|---|---|---|---|
| Ethan | 13 | Jul 3 | −3.25 → −3.23 | −3.36 → −3.81 |
| Jackson | 15 | Jul 2 | −0.73 → 0.00 | −3.71 → −2.65 |
| Mason | 12 | Jul 8 | −1.43 → −1.12 | −3.45 → −3.19 |
| Owen | 12 | Jul 8 | −3.98 → −4.22 | −2.47 → −3.07 |
| Tyler | 11 | Jul 9 | −1.33 → −1.46 | −2.88 → −3.37 |

(Striking = tee + approach, scoring = around the green + putting, as the design's huddle.)
- Caveats: with 11 to 13 SG rounds, "first 10" overlaps "now" on most of its rounds. Draw a trail only when a player has at least 20 SG rounds (10 and 10), or say "first 10 of {n}". Label "first 10 rounds on file", never "this season". If the build skips the new read, the trails drop and the dots stay, as the design already allows.

### 4. Open reads per player, the caps, and stations

**Where the coach read comes from today.** `topInsights` (`data/coachhelm.ts:693-701`) calls `getTopInsightsForPlayers(ids, { limit: 1 })`. The implementation (`src/app/golf/actions/insight-delivery.ts:1113`): one batched read of every visible row for the roster, rank, `collapseParScoring`, `dedupeBySubject`, then `deliverReads` (fold, and cap 3 + 1 when `coachhelm_reads_v1_copy` is on), then `slice(0, limit)` (`:1239`), and roster-card exposure rows for what was sliced (`:1247`). Limit is clamped 1 to 50 (`:1138`).

Every caller and its cap:

| Caller | Cap | Effect of this design |
|---|---|---|
| `data/coachhelm.ts:696` (Clubhouse coach board) | `limit: 1` | Raise to 4 |
| `src/app/golf/actions/stats-intelligence.ts:403` (Fairway team stats) | default 1 | Unchanged |

Visible on staging (v3 engine, visible lifecycle, not dismissed, evidence present):

| Player | All rows | Visible | Tentative | Archived | Reaches coach today | With Board caps (estimate) |
|---|---|---|---|---|---|---|
| Ethan | 19 | 14 | 1 | 4 | 1 (putting) | 3 (putting ×3) |
| Jackson | 17 | 15 | 0 | 2 | 1 (putting) | 3 (putting ×2, around green) |
| Mason | 20 | 15 | 0 | 5 | 1 (putting) | 3 (putting ×2, around green) |
| Owen | 19 | 15 | 0 | 4 | 1 (putting) | 3 (putting ×2, approach) |
| Tyler | 19 | 9 | 6 | 4 | 1 (putting) | 3 (putting ×2, approach) |
| **Total** | 94 | **68** | 7 | 19 | **5** | **about 15** |

"Today" is the newest `roster_card` exposure per player (Oct 30). "With caps" is predicted from each player's order in the Oct 30 `coach_feed` exposure (`rank_position`), which ranks the same rows; the roster sweep can differ where a player has a goal or non-default coach weights (the delivery's own A6 note). Confirm by running the changed loader on preview.
- Strengths: none of the 68 beats its Tour comparison by a clear margin, so the "1 working" slot is empty for every player on staging.
- Notes never reach the Board: the three par-scoring rows per player collapse to one note, and "Driver vs layback: no clear preference" is a note.
- Folding (`FOLD_PAIRS`, `insight-delivery-reads.ts:146`): `sg_ott` + `penalty_rate_per_round` + `big_number_rate` fold into one card. For Owen the survivor is the tee read; for Ethan (whose tee read is a note) a course-management read survives. Which one survives decides whether that story is on the hole at all.

**Category to station.**

| `category` | Station | Staging visible |
|---|---|---|
| `tee` | tee | 5 (4 are notes) |
| `approach` | app | 15 |
| `short_game` | sg | 3 |
| `putting` | putt | 25 |
| `course_management` | **none** | 8 (penalties, doubles or worse) |
| `scoring` | **none** | 12 (par 3, 4, 5; all notes after collapse) |
| `pressure` | **none** | 0 |

Use `areaOf` from `coachhelm-ladder-shape.ts:99` (fixed 4 Nov wiring: was 94) for the four stations, and `areaOf` from `coachhelm-dive-shape.ts:120` (fallback "scoring", "Course and scoring") for the rest. A read with no station must still be listed, in the player's sheet and in a fifth group off the hole, never dropped.

**Count shown vs count open.** `ChCoachPlayer.count` (`coachhelm-shape.ts:221`) counts every open finding, not the capped set. Ethan has about 10 open findings and 3 drawn. The roster's "3 open" must say which: "3 shown · 10 open".

### 5. Each read's evidence

| Design field | Real source | Unit and words | Staging |
|---|---|---|---|
| Size "0.60 a round" (`sz`) | `strokesAtStake(evidence)` (`data/coachhelm-strokes.ts`): `strokes_impact` only when the method is `sg_baseline` or `peer_delta` and it prints above 0.0 | One decimal, strokes a round. Null for `rough_estimate`, missing or zero. Production: 364 of 710 reads are zero. | 60 of 68 have one; not the 5 tee strategy reads (`rough_estimate`) nor 3 that print as 0.0 |
| Ranked by strokes | Same | Page rule; reads with no size go after those with one, in feed order | |
| Rounds ("21 rounds") | `evidence.rounds_n` (v3 freshness stamp) | Countable rounds behind the read | **Absent on all 68.** Use `evidence.sample` ("41 putts", `coachhelm-map.ts:225`) instead. The design's "{p.r} rounds" is the player's count, not the read's. |
| Window chip "This season" | `evidence.window` (`coachhelm-map.ts:141-146`) | "All rounds" (lifetime) or "{n} days" | 90 or 132 days rolling; course management lifetime. Never "This season". |
| Sureness (Solid, Fair, Early) | `evidence.read.word` from `confidenceLabel` | "Solid read", "Early read", "Thin read, n=8". No "Fair". | Mostly Solid read; course management and par rows Early read (confidence 0.47 to 0.57) |
| Claim word (coach only) | `engine.support.word` (`LADDER_WORD`, `coachhelm-engine-shape.ts:166`) | Seen repeatedly, Observed, Likely, Working hypothesis, Not enough yet | **None on staging** (no `evidence.ladder`, no `evidence.support`) |
| Cause state | `engine.cause` (`causeOf`, `coachhelm-engine-shape.ts:273`) | `counted` "Counted"; `likely` "Likely, from the totals" (coach only); `not_traced` "Not traced yet" or "Data gap" | **None on staging.** No chip. Never "Cause: Not traced" when the field is absent. |
| You | `gauge.you` = `your_value_display` | Read's own unit (`evidence.unit`: percent, strokes, count, yards, feet) | Real |
| Tour | `gauge.cmp` (`gaugeFor`, `coachhelm-map.ts:160`); Q-88, the team's own tour | Same unit | Real on 51 (`pga_baseline`); 12 par rows are `absolute_target` (par) and 5 tee rows are `your_baseline` (the player's other side), not Tour |
| Team | **Not in any read on staging** (no `team_avg` source, primary or secondary) | | See below |
| Higher or lower is better | `evidence.polarity`, else the metric registry | | Real |
| Drill | `ChInsight.week` (`weekFor`, `coachhelm-map.ts`): first attached drill (`golf_insight_drill_attachments`) and its text | Name, minutes, level | **No drill attached to any staging read.** `week` falls back to the read's own recommended action, with no title. |
| "4 more rounds before CoachHelm suggests a drill" | Nothing ties drills to a round count | | **No source.** Real count-downs: `engine.support.watching` (Not enough yet), the cause's `count_down` line, or `roundsToGo`. |

**Team on a read.** Two options, both reads already loaded if the team ladder query is added:
- Mean of the roster's `golf_player_standing.player_value` for the read's `evidence.metric` (the batch loader returns all 20 metrics per player, 100 rows on staging). Draw only when 5 or more roster players have the metric (`TEAM_MARKER_MIN_N`, `coachhelm-standing-shape.ts:306`). The player is included.
- **Approach reads are the trap.** `approach_miss` reads keep `metric = approach_proximity_*ft` but their headline is greens hit, a percent (`polarity` override). The standing row for that metric is proximity in feet. A team figure from standing would be in the wrong unit. No source for "team greens hit from 125 to 175"; draw no team bar on these.
- Three-putt and up-and-down rates have no standing row either (the sibling package found the same).

### 6. This week stories and counts

| Design | Real source | What it gives | Staging |
|---|---|---|---|
| Counts "4 rounds · 2 new reads · 1 cleared" | `ChMondayBrief` (`data/coachhelm-monday-brief-shape.ts`), `computeMondayBrief` (`src/lib/coachhelm/v3/monday-brief/brief.ts:205`) | `rounds_last_week` (countable rounds), `counts.new` (Likely or above findings created in the window), `counts.cleared` (recheck cleared in the window), contradicted, out of date. **Window: the 7 days before now**, `MONDAY_BRIEF_WEEK_DAYS`, not "since Thursday". | 0 rounds (one round Oct 28 is `in_progress`), 0 new (no ladder, newest read Oct 1), 0 cleared (no recheck). `isEmptyBrief` true. |
| Story "Eli made two doubles from penalties at Hilltop, holes 7 and 14" | **No source.** No pulse item, brief row or theme speaks of one round's holes. | | Nothing |
| Story "Jonah's three-putts coming down, 0.9 to 0.5, target 0.4, 5 rounds since Oct 12" | `ChBriefWorking` (`coachhelm-coach-brief-shape.ts:80`): "Now X, target Y, from Z" and "5 rounds since Oct 12" | Real when a focus area has `target_metric`, `baseline_value`, `current_value`, `target_value` | No focus areas on staging |
| Story "Priya's approaches slipped: first 10 rounds −0.70, season −0.89" | `ChDiveTheme.trend` (`coachhelm-dive-shape.ts:98-104`, `themeRead` `:404`) | Last 5 SG rounds vs the 5 before (`WINDOW = 5`, `MIN_WINDOW = 3`, `trend.ts`), worded Improving or Slipping only past the standard error. **Not first 10 vs season.** | Each player has 11 to 15 SG rounds, so a trend exists per area; it compares rounds from June and July |
| Program pulse | `ChPulse` (`coachhelm-shape.ts:279`), `getCoachProgramPulse` | Rows such as "No rounds recorded in {n} days", "{n} players are scoring better over their last three rounds", RSVP, prep gap, focus stalled, tasks overdue | Expect "No rounds recorded in 35 days" (newest score-countable round Sep 26) and likely "4 players are scoring better over their last three rounds" (last 3 vs prior 3 to par: Ethan 6.3 to 0.3, Owen 6.3 to 1.0, Jackson 7.7 to 5.0, Mason 4.7 to 2.7; Tyler worse) |

Rules for the stories:
- Only Improving or Slipping become a story; No clear change never does (the design already says so; `themeRead` gives the word).
- The design's "Since Thursday" header needs a window the data has. Either label it "Last 7 days" (no change) or pass a `since` into `computeMondayBrief` (a pure lib change, not an engine change).
- Failure. `loadMondayBrief` answers `null` on any failed read (members, players, reads, rounds), which `loadCoachMondayBrief` turns into `failed`. The pulse answers `{ status: 'failed' }` or `missing: ['rounds', …]` (`pulseMissing`). Themes answer `null` (`readThemes`, `data/coachhelm-dive.ts:77`). Each must draw its own notice. An empty brief that loaded is "Nothing new in the last 7 days"; a failed one is "The week's summary didn't load".
- Cost: `getThemesForCoach` is one call per player, each with its own access check. For a 5-player roster that is 5 calls. Cheaper: run `computeSgTrends` (pure) over the same per-round SG read as the first-10 trails, then the page's standard-error rule from `themeRead`.

### 7. Shared patterns (`computeTeamPatterns`)

- Called by the board (`teamPatternsOf`, `data/coachhelm.ts:669-691`) and by the brief (`loadBriefInputs`, `src/lib/coachhelm/v3/monday-brief/loader.ts:142`).
- Inputs: the visible reads that are open findings (board) or fresh (brief), `rosterTotal`, and the eligible roster (players with 3 or more countable rounds, all time, `eligibleForPatterns` `data/coachhelm.ts:639`).
- A member is a player whose read on the family is at **Likely or above on the support ladder** (`MEMBER_RUNGS`). A read with no `evidence.ladder` never counts.
- The family key is the support family, the **metric with its band**, and the miss side from `evidence.detail.worse_side`. Threshold: 3 or more members **and** 30% or more of the eligible roster (`TEAM_PATTERN_MIN_MEMBERS`, `TEAM_PATTERN_MIN_SHARE`). At most 4 rows. Families of 2+ that miss are counted in `below`.
- **The design's pattern would not form.** "Eli, Priya and Sam all miss approaches short" joins 175+ yd, 100 to 150 yd and 125 to 175 yd. Those are three metrics, so three families of one. A real pattern needs three players short in the same band.
- Staging: eligible roster is 5 (11 to 14 countable rounds each, all time). No read has a ladder rung, and no approach read has `worse_side`. **Zero rows, zero below threshold.** The card shows its "no shared pattern" line on every station.
- The board's `teamPatternsOf` answers `null` both when the flag is off and when the eligibility read fails. The screen cannot tell "off" from "failed". The new board needs those apart.
- "Add to practice" goes to the practice plan lane; `ChTeamPatternRow.next` (the practice action most members share) is what to hand it.

### 8. Working on, and Assign as focus

| Design | Source | Notes |
|---|---|---|
| Row title | `ChBriefWorking.title` (focus area `title`, else the metric label) | Real |
| "Three-putts 0.9 to 0.5 a round · target 0.4" | `ChBriefWorking.line` "Now {current}, target {target}, from {baseline}" (`progressLine`, `coachhelm-coach-brief-shape.ts:165`) | Null when the metric is not one CoachHelm measures or nothing is recorded |
| Ring fill | Not in the shape. `(baseline − current) / (baseline − target)`, clamped 0 to 1, from the focus area's numbers | Shape must carry the three numbers, not only the line |
| "5 rounds in" | `ChBriefWorking.since` "5 rounds since Oct 12" or "5 of 10 rounds since Oct 2" (countable rounds since `started_at`) | Real |
| "On track", "Early days" | **No source.** Real status words: "Active", "In progress" (`WORKING_WORD`). Real verdicts (`coachhelm_verdicts_v1`, `readFocusVerdicts` `data/coachhelm-engine.ts:40`): Worked, Moved, Did not move, Got worse, Too early, Can't tell | Use those |
| Which focus areas | `readFocus` (`data/coachhelm-coach-brief.ts:22-38`): status `active` or `in_progress` only | Proposed ones are not read. Add `proposed` to show "Proposed, waiting for {name} to accept". |

**Assign as focus.** `screens/coachhelm/parts.tsx:318` calls `writes.assign` with `playerId`, `insightId`, title, description, `areaType`, `targetMetric` and `currentValue`. `createFocusAreaFromInsightV2` (`src/app/golf/actions/development.ts:1587`) writes `status: 'proposed'` and `started_at: null` when the caller is the player's coach (`isCoachPromoting`, `:1606`, `:1632`). **Confirmed: it is a proposal; the player accepts it** (`acceptFocusArea` sets `active` and stamps `started_at`). The design's "Proposed · Eli accepts it in their app" is right.
- The board sends **no `targetValue`**. So "Target: 52% or better" has no value behind it today. The action already takes `targetValue`; the board would have to pass one (for example the Tour value from the gauge). That is a change to what the board writes into the focus area, not to the engine. Decide it, or drop the target line.
- A duplicate is refused server side (`ACTIVE_FOCUS_AREA_STATUSES_FOR_DEDUP`, `development.ts:195`); `assignedByInsight` and `declinedByInsight` already say Assigned or Propose again.
- Staging: 0 focus areas, 0 goals. Working on is empty.

### 9. Track record

- Shape `ChTrackRecord` (`data/coachhelm-track-record-shape.ts:76`): `{ state: 'unavailable' }` when the database function is missing, else `ready` with `program`, `unrated`, `corrections`, `rungs`, `families`, `empty`. Loader `loadCoachTrackRecord` (`data/coachhelm-track-record.ts:120`) answers `failed` on a read error.
- Levels are the 5 ladder rungs with targets (`RUNG_TARGETS`, `src/lib/coachhelm/v3/track-record/track-record.ts:62`): Seen repeatedly at least 8 in 10, Observed at least 7, Likely at least 6, Working hypothesis none, Not enough yet fewer than 5 in 10. Below 10 rechecked a level says "Not enough yet" and gives counts, never a share (`TRACK_RECORD_MIN_RECHECKED`).
- Held vs total: `bar.held` of `bar.of` (rechecked), drawn only once a level has 10.
- Window: since Aug 1 in the team's zone, from `golf_coachhelm_shown_reads(team, since)`, which takes every surface's exposure (roster card included) and the ladder from `rank_factors`.
- Staging: the function exists. Run without its coach guard (`is_golf_team_coach`), it finds **48 reads shown since Aug 1, 0 with a ladder, 0 rechecked**. So the card would say 48 shown, all unrated, and every level "Not enough yet". The design's "28 of 40 held" cannot appear.
- "Re-check reads" button: the lifecycle recheck is a cron (`src/app/api/cron/coachhelm-insight-lifecycle/route.ts`), but the coach board already has a `Recheck.tsx` control that calls `refreshTeamAnalysisAsCoach`. Keep today's control unchanged (spec section 6); add no new action. (Corrected Oct 31: an earlier version of this line said to drop the button.)

---

### 10. The Course tab (added Oct 31, after Nick picked it)

Read only, and no new query: every figure comes from rows the board already reads.

| Figure on the page | Source | Notes |
|---|---|---|
| Team to par this season (+6.4), each week's point, "Last 4 weeks" | `golf_rounds.score_to_par` for the roster's countable rounds since Aug 1, the same rows as the hole's season figure (section 1); add `course_id`, `course_name`, `score_to_par` to that select | Round-weighted. A week is the mean of that week's rounds. "Last 4 weeks" is the last 28 days, shown only with 6 or more weeks of rounds; otherwise the chip reads "Early season". `score_to_par` uses the tees played. Countable rules are `round-countable.ts` (9-hole rounds follow the same rule as Team Stats). |
| Courses this season: rounds, team to par, last date, players here | the same rows, grouped by `course_id`, falling back to `course_name` | Staging, Oct 31: Demo University Golf has 11 rounds this season on 2 courses, round types practice and qualifier. |
| Team against Tour: par 3s, 4s, 5s, penalties, doubles or worse, first hole | `golf_player_standing` rows from the standing batch the board loads (`loadPlayersStandingMap`): `scoring_par_3`, `scoring_par_4`, `scoring_par_5`, `penalty_rate_per_round`, `big_number_rate`, `opening_hole_delta`, each with `pga_value` | All six are refreshed metrics (`standing/refresh.ts:34-37`, `:57-58`). Team value = mean of players with a row (spec 8 K: never the stored `team_avg`). Tour values at 75b4956 (`src/lib/golf/benchmarks/tour.ts:71-76`): penalties 0.3 a round, doubles 2.0 per 100 holes, par 3 3.00, par 4 3.97, par 5 4.55, first hole +0.10. A women's team uses the LPGA set (same file, `:90-95`). |
| Course reads | drawn reads with `areaOf(category) === null`: `course_management`, `scoring`, `pressure` | Staging, Oct 31: 10 open course management reads (penalty strokes per round, double bogey-or-worse rate), 4 pressure (opening hole gap, practice to tournament gap), and par 3, 4 and 5 scoring reads per player. Titles are the engine's own, for example "Penalty strokes: 1.1 per round", "Double bogey-or-worse rate: 7.6%", "Par 3 scoring: 3.48 (+0.48 vs par)", "Opening hole gap: +0.19 strokes vs round avg". The page uses these forms. `deliverReads` folds `penalty_rate_per_round` and `big_number_rate` into a tee read when one exists (`FOLD_PAIRS`, section 4) and `collapseParScoring` keeps one par read per player, so the tab lists what survives. Sureness on staging is mostly Early read; the window is all rounds for course management. |
| Worst holes on a course | `course-management.ts` worst-holes insight, signature `<player>:course_worst_holes:<course_id>` | Needs a hole played at least 5 times at 0.8 or more over par (`WORST_HOLES_MIN_ROUNDS`, `WORST_HOLES_MIN_AVG_OVER_PAR`). No Tour figure exists for single holes, so its ladder has no Tour row. |

Fixture on the page (not real): 62 rounds, five courses (Oak Hollow 33, Hilltop 15, Lakeside 5, Ridgeview 5, Brookfield 4), eleven weeks from Aug 17; early state 16 rounds, three courses, three weeks.

## The loader change, and what it costs

All in `data/coachhelm.ts` unless named. No migration, no new column, no flag.

**1. Caps.**
- `:696` `getTopInsightsForPlayers(ids, { limit: 1 })` becomes `{ limit: NEEDS_MAX + WORKING_MAX }` (4), importing the two from `coachhelm-shape.ts:342-343`. Fix the comment at `:695`.
- `:539` `ranked` takes `l[0]`; keep a list per player instead.
- `:550-560` `splitFirm` holds back Not enough yet reads around a single head. With a list, apply it per read (drop Not enough yet from the list into `notEnough`), so the held-back line still means what it says.
- `:569-577` and `:586-594`: `drillTextByInsight`, `assignedByInsight`, `declinedByInsight`, `readFocusVerdicts`, `readCorrections` take every delivered id, not `top`. Same query count, up to 20 ids instead of 5.
- `:600-622`: build every delivered read with `toChInsight` per player, then `partitionInsights` per player (`coachhelm-shape.ts:381`) so a development build (reads flag off, no cap in delivery) still holds 3 + 1.
- Exposure: `getTopInsightsForPlayers` writes one `roster_card` row per returned read (`insight-delivery.ts:1247`). With 4 a player, reads that sit on a station the coach never taps are recorded as shown, and `golf_coachhelm_shown_reads` (the Track record's base) counts them. The player board solved the same problem with `drawnLater` (CH13-21). The batch action has no `drawnLater`. Decide: accept "on the board" as shown, or add a `drawnLater` option to the batch action (a delivery change, not an engine change).

**2. One team ladder query.**
- `loadPlayersStandingMap(ids)` (`src/lib/coachhelm/v3/standing/loader.ts:278`): one chunked read of `golf_player_standing` for the roster, one chunked cohort read, and one LPGA standards read only for a women's team. Then `toChLadder(rows)` per player. The coach Brief already calls it (`data/coachhelm-coach-brief.ts:88`).
- Season: there is no batch season loader, and the table is missing. Keep "All time" until both exist.
- Team means and team-on-a-read are computed from these rows in the loader.

**3. Rounds and trails.** One `golf_rounds` read for the roster: `id, player_id, round_date, status, is_test, holes_played, total_score, front_nine, back_nine, total_putts, strokes_gained_total, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting`. It serves countable rounds this season, `roundsToGo` (exported), the first-10 trails and `computeSgTrends`. `eligibleForPatterns` (`:639`) and `newestRounds` (`:151`) already read the same table; fold them into this one.

**4. Brief, patterns, working, track record.** Call `loadCoachBrief` (`data/coachhelm-coach-brief.ts:61`) beside the board. It already composes `loadBriefInputs` (patterns included), `readFocus`, goals, the standing batch and `loadCoachTrackRecord`. Expose its `brief`, `patterns`, `working`, `record` and `standing` to the board, and add `proposed` to `readFocus`. Gate it by `coachhelm_monday_brief_v1` as the route does today.

**Cost** (5-player roster; production rosters run to about 20 players and up to 19 reads a player):

| Read | Today | After | Rows (staging) |
|---|---|---|---|
| Gate, members, players, team Tour (2) | 5 | 5 | small |
| Visible insights (`loadVisible`) | 1 paged | 1 | 68 |
| Batched heads (`getTopInsightsForPlayers`: auth, 1 paged read, pinned focus, coach weights) | 4 | 4 | 68 read, 5 returned → up to 20 |
| Exposure insert (fire and forget) | 1 (5 rows) | 1 (up to 20 rows) | |
| Newest rounds, pattern eligibility | 2 | 1 (shared rounds read) | about 80 |
| Drills, assigned, declined, verdicts, corrections | 5 to 6 | 5 to 6 (more ids) | |
| Pulse (program-wide, in its own Suspense) | about 7 | about 7 | |
| Standing batch (rows, cohorts, LPGA if women's) | 0 | 2 to 3 | 100 |
| Brief inputs (members, players, reads, rounds) | 0 | 4 (or 0 if shared with the board's own) | 68 reads again |
| Focus areas, goals | 0 | 2 | 0 |
| Track record (gate, settings, shown reads function, insights, corrections) | 0 | about 5 | 48 |
| **Total** | **about 26** | **about 37 to 41**, about 33 if the brief reuses the board's roster, reads and rounds | |

Note the visible set is read twice today (`loadVisible` and the batched heads) and would be read a third time by the brief. Passing the board's visible rows into the brief is the biggest saving.

---

## States the screen needs, and where the data says so

| State | Where the data says it | What to draw |
|---|---|---|
| CoachHelm off for coach or team | `loadCoachHelmGate` → `off { by, reason }` | Off notice, nothing else read |
| Gate lookup failed | `failed` | "Didn't load", never "off" |
| Roster failed | `roster.error` | Board-level notice |
| No players | `roster.count === 0` | Empty team |
| Reads failed | `players.error` (`playersFailed`, `:541`: empty heads beside visible rows) | Notice on the hole and spot card; the ladder may still draw |
| Player with no reads | `withoutNames`, `withoutIds` | Hollow coin, with `roundsToGo` once exported |
| Reads held back | `notEnough` (support flag on) | Collapsed line |
| Side reads failed | `missing.drills / assigned / declined / newest / tour` | `BoardPartial`; no Assign when assigned or declined is unknown |
| Out of date read | `ChInsight.stale` | "Out of date" stance, not counted as open |
| Area with no figure | `ChLadderRow.missing`: "Not measured yet…" or "No Tour figure to compare this with yet." | Leave the player off that spot's mean and bar; the sheet says why |
| Standing read failed | loader throws (`loadPlayersStandingMap` throws on error) | Hole notice; reads still list |
| Season table missing | `loadPlayerSeasonStandingMap` → `missing` | "All time" label (today's state) |
| No station for a read | `areaOf` null | Fifth group "Course and scoring" |
| Pulse loading | `pulse` is a promise | Its own Suspense |
| Pulse failed / partial | `{ status: 'failed' }` / `missing` | Own notice, never "nothing new" |
| Brief empty | `isEmptyBrief` | "Nothing new in the last 7 days" |
| Brief failed | `loadMondayBrief` null → `failed` | Own notice |
| Themes failed | `readThemes` null | Stories from themes left out, said |
| Patterns off vs failed | Both `null` today | Needs a `failed` flag |
| Below threshold | `ChTeamPatterns.below` | "{n} smaller groups" line |
| No focus areas | `working: []` | "Nothing in progress" |
| Focus read failed | `readFocus` null → `missing` | Own notice |
| Track record unavailable | `{ state: 'unavailable' }` | "Not available yet", never "nothing shown" |
| Track record failed | `'failed'` | Own notice |
| Track record empty | `empty: true` | "No reads shown since Aug 1" |
| Assign in flight, failed | existing writes (CH-13001 to 13403) | "Assigning", Retry |

---

## Real on staging vs only in the demo page

| Piece | Staging today | Demo page |
|---|---|---|
| Players | Ethan, Jackson, Mason, Owen, Tyler (5) | Eli, Jonah, Priya, Theo, Sam (fixtures) |
| Rounds | 13 to 17 completed each, all time; 2 this season each, both total-only qualifiers, 0 countable this season | 21, 18, 16, 12, 6 this season; "73 rounds this season" |
| Four areas | Real, all time, from 11 to 15 SG rounds | Real-looking, "this season" |
| Team total | −5.32 all time | about −2.3 "this season" |
| First-10 trails | Computable, from May to July | Drawn |
| Open reads | 68 visible; 5 reach the coach; about 15 with caps; mostly putting | 10 spread over four stations |
| Size, sureness | Size on 60 of 68; Solid or Early read | Size on all; Solid, Fair, Early |
| Claim word, cause | None on any read | Counted, Likely, Not traced |
| Team on a read | None in the reads; standing means for putting bands; none for approach greens hit | Every read |
| Drills | None attached | Named drills |
| Since Thursday | Empty brief; pulse "No rounds in 35 days" and likely "4 players scoring better"; theme trends from summer rounds | Three stories, "4 rounds · 2 new reads · 1 cleared" |
| Shared pattern | None | Approach short, 3 players |
| Working on | No focus areas | Two rings |
| Track record | 48 shown, 0 rated, 0 rechecked | 28 of 40 held, by Solid/Fair/Early |

To look like the design, staging needs: hole-by-hole rounds this season, the support pass, root cause and recheck run on the demo team, and drills attached. Those are engine runs and data entry, out of scope for this lane.

---

## No source (and the fix for each)

| On the design | Fix |
|---|---|
| "This season" on the hole, huddle, roster and read chips | "All time" (standing) or the read's own window ("All rounds", "90 days") |
| "73 rounds this season", "{n} rounds" per player | Countable rounds since `seasonStartDate` from the new rounds read; say "countable" |
| "Hollow: under 15 rounds" | `roundsToGo > 0`, worded with its number |
| "Fair" sureness | "Solid read", "Early read", "Thin read" |
| Read's "{n} rounds" | `evidence.sample` in its own unit |
| Team bar on approach greens-hit reads | Drop the team bar; no source in that unit |
| Penalty read at the tee | It is course management; list under "Course and scoring" |
| "4 more rounds before CoachHelm suggests a drill" | Support `watching`, cause count-down, or `roundsToGo`; else drop |
| "Since Thursday" | "Last 7 days", or add `since` to `computeMondayBrief` |
| Story from one round's holes ("two doubles from penalties, holes 7 and 14") | No source; drop, or a new story built from `golf_holes` later |
| "First 10 rounds −0.70 vs season −0.89" story | Theme trend is last 5 vs prior 5; reword to that, or use the first-10 read with its label |
| Pattern across different approach bands | Real patterns are one band and one side |
| "On track", "Early days" | "Active", "In progress", or the verdict word |
| Ring fill | Compute from baseline, current, target (shape change) |
| "Target: 52% or better" after Assign | Board passes no `targetValue`; pass one or drop |
| Track record by Solid/Fair/Early with 85% and 70% | Ladder rungs, targets 8/7/6 in 10, judged from 10 rechecked |
| "Re-check reads" | No coach action; drop |
| "Varsity" | Team name from `golf_teams.name` |

---

## Staging checks run (read-only, 31 Oct)

All SELECTs, small results, on `ybmwektreyrwjscxlogv` only. Results are summarised above. For the Mac to repeat:

```sql
-- Roster and cache
select p.first_name, c.rounds_played, c.rounds_this_season, c.sg_tee_per_round, c.sg_approach_per_round,
       c.sg_around_green_per_round, c.sg_putting_per_round
from golf_team_members m join golf_players p on p.id = m.player_id
left join golf_player_stats_cache c on c.player_id = p.id
where m.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' and m.status = 'active';

-- Standing SG rows and the stale team_n
select p.first_name, s.metric_id, s.player_value, s.team_avg, s.team_n, s.pga_value
from golf_player_standing s join golf_players p on p.id = s.player_id
where s.player_id in (select player_id from golf_team_members
                      where team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' and status = 'active')
  and s.metric_id in ('sg_ott','sg_approach','sg_around_green','sg_putting');
select to_regclass('public.golf_player_standing_season');  -- null

-- Visible reads by player and category, with ladder and cause
with team as (select player_id from golf_team_members
              where team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' and status = 'active')
select p.first_name, i.category, count(*),
       count(*) filter (where i.evidence ? 'ladder') as with_ladder,
       count(*) filter (where i.evidence ? 'cause') as with_cause
from golf_coach_insights i join team using (player_id) join golf_players p on p.id = i.player_id
where (i.engine_version = 'v3' or i.signature like 'v3:%')
  and i.lifecycle_state in ('detected','matured','addressed','resolved')
  and i.status <> 'dismissed' and i.evidence is not null
group by 1, 2 order by 1, 2;

-- First-10 SG window vs all rounds
with team as (select player_id from golf_team_members
              where team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' and status = 'active'),
r as (select r.*, row_number() over (partition by r.player_id order by r.round_date, r.id) as k
      from golf_rounds r join team using (player_id)
      where r.status = 'completed' and r.is_test = false and r.strokes_gained_total is not null)
select player_id, count(*), avg(strokes_gained_tee), avg(strokes_gained_tee) filter (where k <= 10)
from r group by 1;

-- What reached the coach (newest roster_card per player) and shown since Aug 1
select e.player_id, max(e.shown_at) from golf_insight_exposure e
where e.surface = 'roster_card' and e.player_id in (select player_id from golf_team_members
      where team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' and status = 'active')
group by 1;
```

The track record function `golf_coachhelm_shown_reads` returns 0 rows outside a coach session (its guard is `is_golf_team_coach`); the 48 above came from the same SELECT without the guard.

---

## Visibility

The Team view is coach only. Nothing new reaches a player.
- Claim words and the inferred ("Likely") cause stay coach only, as today (`supportOf`, `causeOf`).
- Team patterns are coach only by design (`pattern.ts` header).
- Standing is read with the service client and scoped only by the ids passed. The ids must stay the active roster of the team the shell resolved (as `loadCoachCoachHelm` does at `:518-532`).
- Player names appear on the coach's own board; the player sheet links to that player's page, which keeps its own rules.

## Bugs and gaps for the builder

1. **Team average from standing is stale against the roster** (staging `team_n = 7` with 5 members). Compute team means from the roster's rows.
2. **Patterns: off and failed are both `null`** (`teamPatternsOf`, `:669-691`).
3. **Exposure grows with the cap**, and the Track record's "shown" grows with it. Decide before shipping.
4. **Three "rounds this season" counts disagree** (cache SQL rule, any completed, TS countable). Use TS countable.
5. **`roundsToGo` is private** (`:99`). Export it for the hollow players.
6. **`readFocus` skips `proposed`**, so an assignment vanishes from Working on until accepted.
7. **The board passes no `targetValue`** on Assign.
8. **The brief's pattern filter and the board's differ** (freshness only vs `isOpenFinding` with Tour and newest round), so the brief and the spot card can disagree on a pattern. Use one.
9. **Visible reads are read two or three times per load.** Share them.

## Confirming the boundary

- Shot tracking: nothing here reads differently from or writes to `golf_shots`, `golf_holes` or `golf_rounds`. The new reads are SELECTs of existing columns.
- The engine: no generator, ranker, lifecycle, support pass, recheck, verdict or pattern rule changes. `getTopInsightsForPlayers` keeps its signature; only the board's argument changes. `computeMondayBrief` changes only if the team picks the optional `since` input, which is a pure summary of rows already written.
- Writes: the only write the view makes is the existing `createFocusAreaFromInsightV2` proposal, plus the existing exposure rows (more of them with the higher cap). Nothing is deployed and no flag is flipped by this package.
