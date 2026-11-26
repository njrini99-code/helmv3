# Data checks: CoachHelm read

Most of the read already has a source: 49 of the 94 figures and words on the eight cards are drawn today, and 30 more are stored on the row and only need carrying or shaping (no new query, no migration).
15 have no source as drawn. Each has a design fix below, and none of the fixes changes what shot tracking collects.
Five preview fixtures hold states the engine cannot write, and three formulas in the design do not match the engine. Both lists are near the end.

Status count: OK 49, CARRY 3, PLUMB 27, QUERY 0, MISSING 15 (94 rows).

Checked against helmv3 `main` 75b4956 on 31 Oct 2026, by reading code only. No query was run, no flag was read from a live environment, and nothing was pushed, deployed or migrated.

Design: `redesign/coachhelm-read.html`. Its script model `R` (line 566) holds three reads: Approach (Priya, 43% from 175+), Penalties (Eli, 1.1 a round) and Putts (Jonah, 23 pts downhill gap). The eight cards are Board summary, Read headline, Where it shows up (the funnel), Why CoachHelm thinks so, How sure, How it has moved, The rounds behind it and What to do.

Paths are under `src/clubhouse/` unless they start with `src/`. Engine types are in `src/lib/coachhelm/v2/insights/types.ts` (called `types.ts` below). The engine's cause code is `src/lib/coachhelm/v3/engine/root-cause.ts` (called `root-cause.ts`).

Statuses:

- OK: shown today.
- CARRY: already in the Clubhouse shape (`ChInsight` or `ChDeepInsight`), just not drawn. View work only.
- PLUMB: stored on the row's `evidence` and loaded, but the shaper drops it. Add it to the shaper; no new query.
- QUERY: needs a new read of an existing column; no migration.
- MISSING: no source as drawn. The design fix is given.

## The short version

- The base read is all there. Title, value, sample, window, confidence word, as-of date, the Tour figure, the path line, the drill, the Assign state, the movement sentence, the outcome, the rounds list and the stroke figure with its anchor are drawn today (`toChInsight`, `toChDeepInsight`, `toChRead`).
- The pictures need shaping, not data. The ladder ticks, the funnel bars, the arm counts, the counted path's steps, the range, the confidence factors and the movement's two points are all stored as numbers on `evidence`. `gaugeFor` (`data/coachhelm-map.ts` 160-177) keeps only strings, and `narrowingOf` (`data/coachhelm-path.ts` 55-59) keeps only labels. Owner call 1 (pictures back in) is what turns these into PLUMB rows.
- The 15 MISSING items are mostly copy that claims more than the row stores: a joint "short-right" count, dates on the movement, a "lie missing" count, "9 of 9 inside 90 days", "Show all 9", and a verdict and target for metrics that have no criterion. The fixes are in the "Missing" list.
- The data gap meter is drawn wrong in the design. `target_count` is how many more tags are needed, not the total. "4 of 10, 6 more" should be "4 tagged, 10 more to go".
- "Each one cost about 1.4 strokes" overstates the record. `event_strokes` is the mean over every failing event whose baseline resolved, not over the counted path. See the event_strokes section.
- Player leak, live at 75b4956: the Deep dive's Why section lists a likely cause's arm drivers to players (`views/DeepDive.tsx` 248, from `data/coachhelm-dive-shape.ts` `diagnosisFor` 341-347, which does not filter by role). The fix is a role filter in the shaper.
- The team pool flag is set on in production in `config/feature-flags.yml` (708-735), which contradicts the brief's "off in prod". The engine also needs the `HELM_COACHHELM_TEAMS` canary, whose production value is not readable from here. Gate the drawing on the row, not on the flag.
- Nothing here changes what shot tracking collects. The data gap meter reads `evidence.cause.data_gap`, which the engine computes from shots already recorded.

---

## Card by card

Columns: the figure as the design draws it; the source field path on `InsightEvidence` (or the shape that carries it); whether today's loaders carry it to the screen; where it is dropped if not; the preview fixture value that proves it; status.

Loaders: player Board `data/coachhelm.ts` 396 (`toChInsight` 451-457); coach Board 547 (`toChInsight` 609-617); player Deep dive `data/coachhelm-dive.ts` `loadPlayerDeepDive` 101-194; coach Deep dive `data/coachhelm-player.ts` `loadCoachPlayerDeepDive` 187-269. All four load the whole `evidence` JSON. What is lost is lost in the shapers.

### 1. Board summary

| # | Drawn | Source | Carried today | Dropped at | Fixture proof | Status |
|---|---|---|---|---|---|---|
| B1 | Player name, "Priya" | roster row beside `ChInsight.playerId` | yes | | `fixtures-coachhelm.ts` players | OK |
| B2 | Category, "Approach" | `ChInsight.category` | yes | | penalties fixture, "Course management" | OK |
| B3 | Headline, "Long irons are finding fewer greens" | `golf_coach_insights.title` to `ChInsight.title` | yes | | every fixture title | OK |
| B4 | Lede sentence | first sentence of the content, `ChInsight.lede` | yes | | slope fixture lede | OK |
| B5 | Value, "43%" | `evidence.your_value_display` to `ChInsight.value`, unit word `valueUnitFor` (`coachhelm-map.ts` 251) | yes | | slope 58% / 81% (`fixtures-coachhelm.ts` 86) | OK |
| B6 | Stance pill, Priority | `ChInsight.priority`, `stanceOf` (`coachhelm-shape.ts` 360-367) | yes | | penalties, high | OK |
| B7 | Sample, "28 approaches" | `evidence.sample_n` and `sample_unit`, `evidenceFor` (`coachhelm-map.ts` 211-230) | yes | | penalties "21 rounds" | OK |
| B8 | Window, "Last 90 days" | `evidence.window_days`, `windowFor` (141) | yes | | penalties "All rounds" (lifetime) | OK |
| B9 | Confidence word | `evidence.confidence`, `readFor` (186) | yes | | penalties 0.7, "Early read" | OK |
| B10 | "As of Oct 24" | `metadata.last_refreshed_at` else window end, `asOfFor` (193) | yes | | fixture `as_of` | OK |
| B11 | Tour in words, "Tour 52%" | `evidence.comparison_value` or the secondary Tour value, `gaugeFor` (160-177) as `cmp` / `sec` | yes | | penalties secondary Tour 0.3 (`fixtures-coachhelm.ts` 108) | OK |
| B12 | Path line under the headline | `evidence.cause`, `pathLineFor` (`coachhelm-path.ts` 72-127) | yes | | `penaltiesTraced` 5 of 7 (`fixtures-coachhelm-path.ts` 42-46) | OK |
| B13 | Drill, "Long iron ladder" | focus drill or recommended action, `weekFor` (232) | yes | | fixture `week` | OK |
| B14 | Assigned chip | `ChInsight.assigned` | yes | | assigned fixture | OK |
| B15 | Player's tick on the ladder, 43 | `evidence.your_value` to `ChInsight.current` (`coachhelm-map.ts` 327) | yes, as a number | not drawn | slope 58 | CARRY |
| B16 | Tour tick on the ladder, 52 | `evidence.comparison_value` (Tour primary) or `evidence.comparison.lines[source = pga_tour].value` | on the row | `gaugeFor` keeps strings only (160-177) | penalties Tour 0.3 | PLUMB |
| B17 | Team pool tick, 49 | `evidence.comparison.lines[source = team_pool].value` (`types.ts` 290-314) | on the row | no Board shaper reads it; `teamPoolLine` is called only by the read (`coachhelm-read-shape.ts` 161) | `TEAM_LINE` (`fixtures-coachhelm-views.ts` 331) | PLUMB |
| B18 | Team pool in words beside the tick | same line, `teamPoolLine` (`src/lib/coachhelm/reads/team-pool-line.ts` 15-36) | on the row | as B17 | `TEAM_LINE` | PLUMB |
| B19 | Pool caption, "164 approaches · 8 teammates" | `comparison.lines[team_pool].n`, `n_unit` (or `n_noun`), `players` | on the row | `teamPoolLine` prints the value and `n` only; `players` is never read | `TEAM_LINE` n 212 rounds, players 8 | PLUMB |
| B20 | "Worth about 0.6 a round" chip | `ChDeepInsight.closes` (`closesFor`, `coachhelm-dive-shape.ts` 389-394), else `strokesAtStake` (`coachhelm-strokes.ts` 33-37) | Deep dive only | the Board loaders build no `ChDeepInsight` | `DIVE_THEMES` cause 0.9 (`fixtures-coachhelm-views.ts` 279) | PLUMB |
| B21 | Ladder axis ends | none | | | none | MISSING (1) |

### 2. Read headline

| # | Drawn | Source | Carried today | Dropped at | Fixture proof | Status |
|---|---|---|---|---|---|---|
| R1 | Title | `ChInsight.title` | yes | | as B3 | OK |
| R2 | Subject, "Greens from 175+ yards" | `evidence.metric_label`, `ChRead.what.subject` | yes | | slope label (`fixtures-coachhelm.ts` 86) | OK |
| R3 | Value, "43%" | `ChRead.what.value` | yes | | slope 58% | OK |
| R4 | Sample, "12 of 28 approaches" | `sampleOf` (`coachhelm-read-shape.ts` 119): "12 of" only when rate times sample is a whole number | yes | | slope sample | OK |
| R5 | "Compared with the Tour 52%" | `benchmarkOf` (160-168) | yes | | penalties "Compared with the Tour 0.3" | OK |
| R6 | Team pool line in place of the Tour | `benchmarkOf` to `teamPoolLine`, primary team_pool only | yes, when the row was written with the pool as primary | | `TEAM_LINE` | OK |
| R7 | "Worth about 0.6 strokes a round" | `strokesOf` (171-177): `closes` else `strokes_impact` when the method is `sg_baseline` or `peer_delta` | yes | | `DIVE_THEMES` | OK |
| R8 | "closing the gap to the team's average" / "to the Tour" | `strokesLine` (240-245), anchor from `closesFor` | yes | | `DIVE_THEMES` anchor team | OK |
| R9 | "estimated from strokes gained" | none: `closes` comes from the counterfactual lookup tables (`src/lib/coachhelm/v3/counterfactual/lookup-tables.ts`), not strokes gained | | | none | MISSING (2) |
| R10 | Putts read: "to his own level putts" | none: `closes` anchors only to team or tour (`coachhelm-dive-shape.ts` 389-394) | | | none | MISSING (3) |
| R11 | Confidence word | `ChRead.what.word` | yes | | penalties "Early read" | OK |
| R12 | "Through Oct 24" | `ChRead.when.through` | yes | | dive rows | OK |
| R13 | Out-of-date sentence | `ChRead.when.stale` | yes | | stale fixture | OK |
| R14 | Stance pill | `ChDeepInsight.stance` | yes | | as B6 | OK |

### 3. Where it shows up (the funnel)

The design: 28 approaches from 175+, 16 on par 4s, 12 of those missed, 9 finished short-right.

| # | Drawn | Source | Carried today | Dropped at | Fixture proof | Status |
|---|---|---|---|---|---|---|
| F1 | Step chips, "175+ · par 4s · short-right" | `evidence.diagnosis.basis.narrowing.steps[].label` | yes | | `approachNarrowed` narrowing (`fixtures-coachhelm-path.ts` 86-96) | OK |
| F2 | Top bar, "28 approaches" | `evidence.sample_n` | yes, as the sample words | | slope sample | OK |
| F3 | Second bar, "16 on par 4s" | `evidence.cause.alternatives[0].arm_a.n` (`types.ts` 357-367) | on the row | `causeOf` flattens the cause to one line (`coachhelm-engine-shape.ts` 273-299); `toChRead` keeps no arms | `approachNarrowed` arm 12 of 16 (104) | PLUMB |
| F4 | Third bar, "12 missed" | `cause.alternatives[0].arm_a.failures` | on the row | as F3 | 12 | PLUMB |
| F5 | "Everywhere else, 4 of 12" | `cause.alternatives[0].arm_b.failures` and `.n` | on the row | as F3 | 4 of 12 | PLUMB |
| F6 | Each step as a sentence | `narrowing.steps[].statement` (`types.ts` 510-519) | on the row | `narrowingOf` keeps labels only (`coachhelm-path.ts` 55-59) | `approachNarrowed` statements (simplified, see fixtures) | PLUMB |
| F7 | "9 finished short-right" | none: the shape step stores per-axis counts in its statement ("9 of 12 short, 8 of 11 right", `context-narrowing.ts` 486), never a joint count | | | none | MISSING (4) |

The step counts themselves (attempts, failures, slice) are dropped by the engine before storage (`toDiagnosisNarrowing`, `root-cause.ts` 909-918). Only the statement text carries them. F3 to F5 come from the cause's arms, which exist only for a likely cause. For a counted cause the funnel has `cause.occurrences`, `cause.denominator` and `cause.distinct_rounds` instead (`types.ts` 393-396).

### 4. Why CoachHelm thinks so

| # | Drawn | Source | Carried today | Dropped at | Fixture proof | Status |
|---|---|---|---|---|---|---|
| W1 | State word, Counted / Likely / Not traced yet | `evidence.cause.state`, `ChEngineCause.word` | yes, `coachhelm_root_cause_diagnosis` on | | `ENGINE_PENALTIES_COUNTED` (`fixtures-coachhelm-engine.ts` 131-135) | OK |
| W2 | The cause line, or the not-traced reason | `causeOf` and `notTracedSaid` (`coachhelm-engine-shape.ts` 273-333) | yes | | `notTraced` (30-46), `ENGINE_BREAK` count-down 6 of 10 | OK |
| W3 | The example holes | `cause.example_holes`, `whereFor` (`coachhelm-dive-shape.ts` 479-500) | yes | | `DIVE_PENALTIES_HOLES` (`fixtures-coachhelm-views.ts` 344-363) | OK |
| W4 | Path as steps, "Driver, water, bogey" | `cause.path` (string array, `types.ts` 391) | on the row | `causeOf` joins it into one line | `penaltiesTraced` path | PLUMB |
| W5 | An icon on each path step | none | | | none | MISSING (5) |
| W6 | "5 of 7" as dots | `cause.occurrences`, `cause.denominator` | on the row as numbers; drawn as words by `whereFor` | numbers not shaped | 5 of 7 | PLUMB |
| W7 | "since Sep 20" | `cause.window` ("2026-08-01 to 2026-10-17"): the window read, not the first occurrence | on the row | not shaped | `baseCause` window (`fixtures-coachhelm-path.ts` 25-39) | PLUMB |
| W8 | "over 4 rounds" | `cause.distinct_rounds` (set only for a counted cause, `root-cause.ts` 1381-1405) | on the row | not shaped | `penaltiesTraced` 4 | PLUMB |
| W9 | "Each one cost about 1.4 strokes" | `cause.event_strokes` | on the row | not shaped; the diagnosis text carries it at one decimal (`root-cause.ts` ~1186) | `DIVE_PENALTIES_HOLES` has `event_strokes` null | PLUMB (wording fix, see event_strokes) |
| W10 | Slice label, "Par 4s from 175+" against "Everywhere else" | `cause.alternatives[0].label`; drivers `armDrivers` (`root-cause.ts` 1466-1480) | on the row; the drivers reach the Why section | arms not shaped | `approachNarrowed` | PLUMB |
| W11 | "12 of 16" | `alternatives[0].arm_a` | on the row | as F3 | 12 of 16 | PLUMB |
| W12 | "4 of 12" | `alternatives[0].arm_b` | on the row | as F3 | 4 of 12 | PLUMB |
| W13 | "more than twice as often (75% against 33%)" | `alternatives[0].lift`, rates `arm_a.rate`, `arm_b.rate` | on the row | not shaped | lift 1.6 in the fixture, which disagrees with its arms (see fixtures) | PLUMB |
| W14 | "between 5 and 70 points" | `alternatives[0].lower_bound`, `upper_bound` (fractions) | on the row | not shaped | 0.05 / 0.7 (`fixtures-coachhelm-path.ts` 104) | PLUMB |
| W15 | Data gap field, "miss direction is on 4 of 13" | `cause.data_gap.field`, `cause.checked.fields_missing`, `GAP_FIELD` (`coachhelm-engine-shape.ts` 263-266) | partly, inside the not-traced line | counts not shaped | `ENGINE_SLOPE` data_gap (84) | PLUMB |
| W16 | Data gap meter, "4 of 10, 6 more" | `cause.data_gap.have_count` 4 and `target_count` 10 | on the row | | `ENGINE_SLOPE` have 4, target 10 | MISSING (6) |
| W17 | "10 more to go" | `cause.data_gap.target_count` | on the row | not shaped | target 10 | PLUMB |
| W18 | "Nothing new is asked during a round" | none; contradicted by the round-entry ask | | | none | MISSING (7) |

### 5. How sure

| # | Drawn | Source | Carried today | Dropped at | Fixture proof | Status |
|---|---|---|---|---|---|---|
| S1 | Rung, Observed / Likely / Not enough yet (coach) | `evidence.support.ladder`, `supportOf` (`coachhelm-engine-shape.ts` 248-261), word `LADDER_WORD` (166-172) | yes, coach only | | `ENGINE_SLOPE` ladder observed | OK |
| S2 | Claim range (coach) | `support` interval, `rangeWords` (210-222) | yes, coach only | | `ENGINE_SLOPE` 3 to 43 | OK |
| S3 | Count-down, "4 of 10 so far" | `support` watching / `cause.count_down` | yes | | `ENGINE_BREAK` 6 of 10 | OK |
| S4 | Sample meter, "28 of the 30 it needs" (coach) | `support.n` and `support.floor` (`src/lib/coachhelm/v3/support/evaluate.ts` 61) | on the row | `supportOf` keeps the word and range only | `ENGINE_SLOPE` n 31, floor 15 | PLUMB |
| S5 | Player's "the N it needs" | none for players: `support` is stripped from the player row | | `PLAYER_HIDDEN_EVIDENCE_KEYS` | none | MISSING (8) |
| S6 | Freshness, "9 of 9 inside 90 days" | `confidence_factors.recency` is a fraction of round dates inside half the window (`generator-base.ts` 160-182) | | | defaults 1, 1, 0.5 (`fixtures-coachhelm.ts` 26) | MISSING (9) |
| S7 | Record, "26 of 28 holes complete" | `cause.checked.holes_with_full_record` and `.of` | on the row; inside `auditOf` as a technical line | numbers not shaped | `ENGINE_SLOPE` checked 31 of 31 | PLUMB |
| S8 | "lie missing on 2" | none: `fields_missing` names fields under 60% coverage (`root-cause.ts` 720-725), no per-field count of holes | | | none | MISSING (10) |
| S9 | Three factor bars, sample / recency / record | `evidence.confidence_factors` (`types.ts` 122-151) | on the row | not shaped | defaults 1, 1, 0.5 | PLUMB |
| S10 | "across 9 rounds" | `evidence.rounds_n` (or `source_round_ids.length`) | on the row; `rounds.total` counts the ids | not on this card | 21 source rounds, `DIVE_PENALTIES` | PLUMB |

### 6. How it has moved

| # | Drawn | Source | Carried today | Dropped at | Fixture proof | Status |
|---|---|---|---|---|---|---|
| M1 | "From 51% to 43%" | `metadata.movement`, `movementFor` (`coachhelm-dive-shape.ts` 307-315) | yes | | `DIVE_SLOPE` 31 to 23 (`fixtures-coachhelm-views.ts` 210) | OK |
| M2 | Result word | `outcomeFor` (323) | yes | | outcome fixture | OK |
| M3 | "measured Oct 24" | outcome `when` | yes | | outcome fixture | OK |
| M4 | Category trend word and line | `getThemesForPlayer`, `themeRead` (404-416), drawn by `Trend` (`views/DeepDive.tsx` 127-185) | yes | | `DIVE_THEMES` | OK |
| M5 | Trend chip figure, "strokes gained −0.31" | `ChDiveTheme.sg` | yes, in the shape | `Trend` does not draw `sg` | `DIVE_THEMES` sg | CARRY |
| M6 | Two-point picture, 51 to 43 | `metadata.movement.from` and `.to` (`types.ts` 521-526) | on the row | `movementFor` keeps the sentence only | 31 / 23 | PLUMB |
| M7 | Dates, "Jul 27 to Oct 24" | none: `upsert.ts` stores from and to with no dates (`src/lib/coachhelm/v2/insights/upsert.ts` 380-387) | | | none | MISSING (11) |

### 7. The rounds behind it

| # | Drawn | Source | Carried today | Dropped at | Fixture proof | Status |
|---|---|---|---|---|---|---|
| RD1 | Round rows: date, course, score, to par | `evidence.source_round_ids` read by `readRounds` (`data/coachhelm-dive.ts` 30-47), `roundsFor` (`coachhelm-dive-shape.ts` 254-279) | yes | | `DIVE_ROUND_ROWS` | OK |
| RD2 | To-par strip | `rounds.strip` | yes | | `DIVE_ROUND_ROWS` | OK |
| RD3 | "9 rounds" | `rounds.total` | yes | | `DIVE_PENALTIES` 21 | OK |
| RD4 | Dots per round (how many counted holes on it) | `cause.example_holes[].round_id`, grouped | on the row, up to 5 holes | `whereFor` lists holes; no per-round count | `DIVE_PENALTIES_HOLES` | PLUMB |
| RD5 | "Show all 9" | the list is capped at `DIVE_ROUNDS_SHOWN` 8 (`coachhelm-dive-shape.ts` 32) | | | none | MISSING (12) |

### 8. What to do

| # | Drawn | Source | Carried today | Dropped at | Fixture proof | Status |
|---|---|---|---|---|---|---|
| D1 | Drill name | `ChRead.next.drill` | yes | | fixture week | OK |
| D2 | "12 min · intermediate" | `ChRead.next.meta` | yes | | fixture week | OK |
| D3 | Drill text | `ChRead.next.text` | yes | | fixture week | OK |
| D4 | "No drill assigned." | `ChRead.next.none` | yes | | no-drill fixture | OK |
| D5 | Focus state | `planFor` (`coachhelm-dive-shape.ts` 371-382), `readPlans` (`data/coachhelm-dive.ts` 53-71) | yes | | plan fixture | OK |
| D6 | Goal line | `ChDivePlan.goal.line` | yes | | plan fixture | OK |
| D7 | Assign / Suggest | `ChInsight.assignAs` | yes | | every finding | OK |
| D8 | "Proposed again" after a decline | `ChInsight.declined` | yes | | declined fixture | OK |
| D9 | "Starts at 43%" | `ChInsight.current` | yes | not drawn | slope 58 | CARRY |
| D10 | Verdict word, "Too early to call" | `golf_player_focus_areas` verdict, `verdictOf` (`coachhelm-engine-shape.ts` 386-413) | only for catalog metrics | no criterion for these metrics | none | MISSING (13) |
| D11 | Target, "50% or better over the next 20 approaches" | `targetLine` (371-380) from the focus criterion | only for catalog metrics | as D10 | none | MISSING (14) |
| D12 | "CoachHelm grades it at its target" | none for these metrics | | | none | MISSING (15) |

---

## Missing, with the design fix

1. Ladder axis ends (B21). Nothing stores a scale. Derive it from the values drawn: the lowest and highest of player, team pool and Tour, padded by a tenth of their spread on each side. Never label the ends with numbers.
2. "estimated from strokes gained" (R9). `closes` is `realisticTeamGap` over the counterfactual lookup tables (`src/lib/coachhelm/v3/themes/assemble.ts` 108-125), not strokes gained. Say "estimated". Name a method only when the figure is `strokes_impact` and `closes` was null: "from strokes gained" for `sg_baseline`, "from teammates' numbers" for `peer_delta`.
3. "to his own level putts" (R10). `closes` anchors only to the team or the Tour. For the putts read, draw no worth figure unless `strokesOf` returns one, and then say "Worth about X strokes a round" with no anchor (`strokesLine` already does this when the anchor is null).
4. "9 finished short-right" (F7). No joint count exists. Draw the shape step as words with both per-axis counts from its statement ("9 of 12 short, 8 of 11 right"), not as a fourth bar.
5. Path step icons (W5). Nothing stores a shot type per step. Either map a fixed word list (driver, iron, water, OB, bunker, chip, putt) to icons in the view and fall back to a plain dot, or drop the icons. Default: plain dots.
6. Data gap meter (W16). `target_count` is the smallest number of further tags that brings coverage to 60% (`types.ts` 369-380; `dataGapTagsNeeded`, `root-cause.ts` 1124), not the total. With have 4 and target 10 the meter has 14 cells, 4 filled. Words: "4 tagged, 10 more to go".
7. "Nothing new is asked during a round" (W18). With `coachhelm_data_gap_prompt_v1` on (production true, `config/feature-flags.yml` 748), round entry asks for the missing field (`src/lib/coachhelm/data-gap/load-asks.ts` 42-72). Reword: "Tag it when you enter the round. Nothing else changes."
8. Player's "the N it needs" (S5). `support` is coach only. For players draw the sample with no target: "28 approaches" and the confidence word.
9. "9 of 9 inside 90 days" (S6). `recency` is the share of round dates inside half the window, and it is a real measure only when `confidence_factors.factors_measured` is true (`generator-base.ts` 160-182; placeholder at 721-730). Draw it as a share with the right window ("most rounds in the last 45 days") and hide the bar when `factors_measured` is not true.
10. "lie missing on 2" (S8). Only `miss_direction` and `distance_to_hole_after` are checked, and only by name. Draw "Checked 26 of 28 holes. Miss direction is thin." from `checked` and `fields_missing`. For penalties, `checked` counts holes, so "118 of 126 penalty-hole shots" becomes "118 of 126 holes".
11. Movement dates (M7). Use "Before" and "Now". `from` and `to` are the previous and current write's values, stored only on a move of 5% or more (`upsert.ts` 324, 380-387), so `to` can lag the value on the card. When they differ, draw the card's value as "Now" and `to` as "Last change".
12. "Show all 9" (RD5). The list holds 8. Use "Newest 8 of 9", as `Rounds` already says (`views/DeepDive.tsx` 190).
13. to 15. Verdict word, target and "CoachHelm grades it at its target" (D10 to D12). Criteria exist only for the putt bands, `fairways_hit_pct`, `gir_pct`, `scrambling_pct` and `sand_save_pct` (`src/lib/coachhelm/v3/verdicts/metrics.ts` 14-19). None of the three design reads qualifies. Draw them only when `verdictOf` returns a verdict. The early word is "Too early", not "Too early to call". If a target is wanted for every focus, it is a QUERY: `golf_player_focus_areas.target_value` is a stored column not in `readPlans`' select (53-71).

---

## Player view rules

What the player row loses. `src/lib/coachhelm/delivery/player-projection.ts` 19-26 strips `support`, `ladder`, `what_ladder`, `ladder_reasons`, `strokes_shrunk` and `shrink` from the evidence. It is applied in `src/app/golf/actions/insight-delivery.ts` at 558, 619, 828 and 1388. It does not strip `cause`, `diagnosis`, `comparison`, `data_gap`, `confidence_factors`, `counterfactual` or `standing`. So an inferred cause reaches the player's server row, and Clubhouse is what hides it.

Where Clubhouse hides it today:

- `causeShown` (`coachhelm-read-shape.ts` 180-182): the Why line reads "Not traced yet" for a player when the cause is inferred (Q3).
- `pathLineFor` (`coachhelm-path.ts` 100-111): the likely path line is coach only.
- `supportOf` (`coachhelm-engine-shape.ts` 248-261): the support pass and claim rung are coach only.

The leak at 75b4956. `diagnosisFor` (`coachhelm-dive-shape.ts` 328-350) keeps the drivers whatever the role, and the Why section draws them at `views/DeepDive.tsx` 248. For a likely cause the drivers are `armDrivers` (`root-cause.ts` 1466-1480): the slice and "Everywhere else" with their counts. A player sees "Not traced yet" above the arms that make the guess. Fix: in `diagnosisFor`, drop the drivers when the level is hypothesis and the role is player.

Rule for every new field. `ChDeepInsight` is serialized into `'use client'` components, so anything put in the shape is in the page source. Role-gate the new fields in the shaper, never in the view: arms, lift, bounds, the slice label, `support.n` and `floor`, and the claim rung.

The funnel for players (owner call 2). The funnel is observed counts, so players get it by default, with these limits:

- Draw the step chips and the counts as counts.
- Draw no lift, no range, no arm verdict and no "likely" or "more often" words.
- The par step's statement has a rate form that quotes both arms (`context-narrowing.ts` 457-458). Those are the same numbers as the likely cause's arms, so the rate form says the guess. For a player, show that step's label only when its statement is in rate form.
- F3 to F5 come from the cause's arms. For a player, take the same counts from the step statements only, or draw the top bar and the chips alone.

The narrowing chips already reach players through `PathLine` (`screens/coachhelm/parts.tsx` 26-53).

Default, Nick can flip: players see the observed funnel but never a guessed cause.

---

## Team pool line

Source: `evidence.comparison.lines[]` with `source = 'team_pool'` (`types.ts` 290-319). It holds one pooled value, `n`, `n_unit`, `players` (a count, never who) and the pool's window. It is written by `attachTeamPool` (`src/lib/coachhelm/v3/team-pool/attach.ts` 20-48), called from `generator-base.ts` around 865-872.

The flag. `coachhelm_team_pool_v1` in `config/feature-flags.yml` 710-747 (fixed 4 Nov wiring: entry starts at 710) has default false, but its environment columns are production true and preview true, while its comment says "Created OFF on main". The environment column wins (`src/lib/flags/is-enabled.ts`). The engine also requires the `HELM_COACHHELM_TEAMS` canary (`src/lib/coachhelm/v3/team-pool/flag.ts` 1-13, `src/lib/coachhelm/canary.ts` 53-59). That variable's production value cannot be read from here. So whether production writes pool lines today cannot be verified. The brief says off in prod; the config file says on. Nick or the Mac should confirm.

Clubhouse does not read this flag. `readEngineFlags` (`data/coachhelm-engine.ts` 22-29) reads support, cause, recheck and verdicts only, and its comment at 20 ("production today" all off) is stale. The team line reaches the read only through the row.

Two engine facts that shape the drawing:

- `withTeamComparison` (`src/lib/coachhelm/v3/team-pool/pool.ts` 463-483) adds a Tour line only when `comparison_source` is `pga_baseline`. When the read already has a comparison, the team line is appended to `lines`, not made primary.
- `teamPoolLine` reads `comparison.primary` only. An appended pool line is never drawn. Change it to find the team_pool line in `lines`.

Pool families (`pool.ts` 386-402) cover approach proximity bands, 175 plus included, and `penalty_rate_per_round`. They do not cover putt slope, so the putts read draws no pool tick.

Q-88: the Tour is the only outside benchmark. The pool is teammates, so it is not an outside benchmark and may sit beside the Tour. Draw it with its count and never a teammate's name. A pool under 4 teammates is not written (`TEAM_POOL_MIN_TEAMMATES`, `pool.ts` 46, checked at 333 and 352), so its absence needs no copy.

Do not pair the pool tick with "closing the gap to the team's average". That anchor is `evidence.standing.team_avg` (`assemble.ts` 108-125), a mean that includes the player and has no `team_n` floor. It is a different number from the pool, and the two can disagree on one card.

Default, Nick can flip: team pool beside the Tour on the ladder when the row carries a team_pool line, which it does only when `coachhelm_team_pool_v1` was on at write time. Gate on the row, not on the render-time flag.

---

## Evidence rule

Every sentence the design draws should rest on a stored count. These do not, as drawn:

- "9 finished short-right": no joint count (Missing 4).
- "Each one cost about 1.4 strokes": a mean over the failing population, not each event or the path (next section).
- "since Sep 20": the window read, not the first occurrence. Say "Read from Sep 20".
- "more than twice as often (75% against 33%)": the arms give 2.25, but the fixture's stored lift is 1.6. The words must come from the arm rates, and the lift must agree.
- "between 5 and 70 points" mixed with the claim range: the design puts the cause interval (`lower_bound`, `upper_bound`) and the support range (`rangeWords`) in one sentence. They are different tests. Draw the cause interval under Why and the claim range under How sure, coach only.
- "lie missing on 2" (Missing 10), "9 of 9 inside 90 days" (Missing 9), "the N it needs" for players (Missing 8).
- "estimated from strokes gained" (Missing 2) and "to his own level putts" (Missing 3).
- "Nothing new is asked during a round" (Missing 7).
- "Too early to call", the target and "CoachHelm grades it at its target" on non-catalog metrics (Missing 13 to 15).
- The penalties trend chip "Off the tee strokes gained −0.31": the read's category is course management, so the chip must be that category's theme (`themeRead` by `cat`).
- The Board cause line for the approach read joins the likely slice ("par 4s") with the shape step's count ("9 short-right"). A likely cause has no shape count of its own. Draw the slice alone.
- Existing code: `Trend` labels the movement "Since it was first seen" (`views/DeepDive.tsx` 143). The movement is the last change of 5% or more. Relabel "Last change".

---

## event_strokes and "each cost about X"

How it is computed. `observeSequence` (`root-cause.ts` 681-764) takes every failing event whose strokes-gained baseline resolved and averages strokes against that baseline (727-729). Negative means strokes lost. The counted cause stores it rounded to two places (1445-1456). The diagnosis text says it at one place ("Each cost about X strokes", around 1186). The count it averages over is kept only as the strokes driver's `sample_n` (`strokesSampleN`), not on the cause.

Is the average honest. It is a real mean, but of the whole failing population (all penalty holes with a baseline), not of the 5 counted driver-water holes. With a denominator near the floor of 10 events (`SEQUENCE_MIN_EVENTS`), one bad hole moves it a lot.

What to draw. "On average a penalty hole cost about 1.4 strokes (across N)", with N from the driver's `sample_n`. Say "cost" only when the value is negative, and draw its absolute value. When it is null, as in `DIVE_PENALTIES_HOLES`, draw nothing. Never attach it to the path.

---

## Data gap meter and shot tracking

The meter reads `evidence.cause.data_gap`, mirrored at `evidence.data_gap` (`types.ts` 268). The engine computes it at analysis time from fields already on `golf_shots`, namely `miss_direction` and `distance_to_hole_after` on the failing shots (`root-cause.ts` 720-725), when coverage is under 60% (`DATA_GAP_MIN_COVERAGE`, 1115; `dataGapFor`, 1160-1173). It changes only on the next analysis run after new rounds. A data gap is written only for families with a sequence target. The putt slope family has none (`sequenceTargetFor`, 173-251), so a putts read is `no_shot_path`, never a data gap.

Nothing in this redesign changes what shot tracking collects. The only ask in a round is the existing Slice 8a prompt, behind its own flag.

---

## Formula problems

- Closes. `realisticTeamGap` (`assemble.ts` 108-125, not exported) anchors on `standing.team_avg` with no `team_n` floor, and the team mean includes the player. For a single read `buildCause` uses `ev.counterfactual.strokes_saved_per_round` (around 566-690). The design's 0.6 and 0.5 match no fixture. With `DIVE_THEMES` (cause 0.9, team 0.6) the consistent figure is 0.75, printed "0.8".
- Tour gap. `DIVE_THEMES` uses a tour gap of 1.4. The penalty lookup is 1.5 strokes a unit (`lookup-tables.ts` around 132), so (1.1 − 0.3) × 1.5 = 1.2.
- `targetLine` (`coachhelm-engine-shape.ts` 371-380) always prints a percent. It is wrong for a per-round target such as penalties.
- Likely-cause lift. `likelyFromTotals` (`root-cause.ts` 1070-1086) rounds lift to two places and returns null when the rest never failed. The view must handle a null lift ("only here") and must not compute its own ratio.
- Coach links. `whereFor` builds every hole's link with the player route (`coachhelm-dive-shape.ts` 492). The coach Deep dive reads rounds without the example rounds (`data/coachhelm-player.ts` 224), so a coach's Where list can be empty where the player's is full.
- The design's route table names the coach param `q=`. The real param is `insight=` (`data/coachhelm-views-shape.ts` 108).

## Fixture inconsistencies

Preview fixtures that hold states the engine cannot write:

- `approachNarrowed` (`fixtures-coachhelm-path.ts` 49-108). Lift 1.6 against arms 12 of 16 and 4 of 12 (rates 0.75 and 0.33, lift 2.25). `distinct_rounds` 9 set on a likely cause, which the engine leaves null. Metric `gir_175_plus` is not an engine id (the real one is `approach_proximity_175_plus_ft`). Statements and checked lines are plain labels, not the engine's templates (`checkedLines`, `root-cause.ts` 1255-1268).
- Counted causes under the floor. `penaltiesTraced` (5 of 7), `ENGINE_PENALTIES_COUNTED` (5 of 7) and `DIVE_PENALTIES_HOLES` (6 of 9) all have fewer than 10 failing events, below `SEQUENCE_MIN_EVENTS`. The engine would write a count-down. The design's penalties counted state cannot be written either.
- `ENGINE_PENALTIES` (`fixtures-coachhelm-engine.ts` 90-129) has a likely cause on penalties. There is no narrowing for that family, so the engine cannot write it.
- `ENGINE_SLOPE` (49-88) has a data gap on the slope read. That family has no sequence target, so it would be `no_shot_path`. Its numbers also imply a population of 13.
- `DIVE_PENALTIES_TEAM`'s Tour line carries the cohort value 0.6 (`fixtures-coachhelm-views.ts` 335).
- Penalty team figures differ across fixtures: cohort 0.6 (`fixtures-coachhelm.ts` 108), team pool 0.6, themes team 0.6 (`fixtures-coachhelm-views.ts` 295), standing team 0.8 with Tour 0.2 (103).
- The putts read: the design draws 51% against 74%; the fixture has 58% against 81%. The stored movement is on the gap (31 to 23), not the make rate, so "58 to 51" has no source.
- Rungs disagree with the design: penalties is Observed in the design and likely in `ENGINE_PENALTIES`; putts is Not enough yet in the design and observed in `ENGINE_SLOPE`; the approach read has no ladder fixture at all.

Fix the fixtures to engine-writable states before building the preview, or the preview proves states production never shows.

---

## Owner calls, built as defaults

1. Pictures back in the read. This reverses D8 (words only). The ladder, funnel, path, dots, meter and movement are drawn, each with its figure written beside it, so the page still reads as words without the picture. Default, Nick can flip.
2. Players see the observed funnel but never a guessed cause. The rules are in "Player view rules". Default, Nick can flip.
3. Team pool beside the Tour on the ladder when `coachhelm_team_pool_v1` is on, meaning when the row carries a team_pool line. Never name a teammate. Default, Nick can flip.
