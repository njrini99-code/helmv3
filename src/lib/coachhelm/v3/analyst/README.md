# CoachHelm analyst: fact sheet and notability

The first two code parts of the replacement for CoachHelm's insight engine. The shape of the whole: code measures, a
model judges and writes, code checks the model. This folder is the "code measures" half. It calls no model, writes no
prose for a coach, writes to no database and touches no screen or the old engine.

Why it exists: today's engine runs about 21 fixed checks, each firing when a sample floor is met, against the Tour.
Nearly every college player is below the Tour on nearly every check, so 716 visible insights across 76 players come
from 24 title shapes and 91% of players carry the same approach card. Nothing asks what is unusual about this player.

| File | What it is |
| --- | --- |
| `types.ts` | The fact sheet's shapes. `withoutCoachOnly` drops the team blocks. |
| `sources.ts` | The loader interface the builder takes (`AnalystSources`) and the row shapes. |
| `rounds.ts` | Which rounds count, and the three named windows. |
| `measures.ts` | The 35 measures, each computed over one window, and the floors. |
| `stats.ts` | The few statistics not already in `v3/stats` or `v3/support`. |
| `fact-sheet.ts` | Part 1. `assembleFactSheets` (pure) and `buildTeamFactSheets` / `buildFactSheet` (through the sources). |
| `notability.ts` | Part 2. `findNotable(sheet)`: one priority, at most three candidates, plus the other lists. |
| `putt-definitions.ts` | A count of where the app's two make-rate definitions disagree. A diagnostic; no figure reads it. |
| `supabase-sources.ts` | The sources over a Supabase client handed in by the caller. SELECTs only. |
| `dry-run.ts` | The dry run's logic: flags, the production refusal, the team report and its table. |
| `scripts/coachhelm/analyst-dry-run.ts` | The script. Thin: flags, client, print. |

`src/lib` code here imports nothing from `src/clubhouse` or `src/app`. Only the tests import `src/clubhouse`, to prove
the numbers match the screens.

## Part 1: the fact sheet

One player, one run. For each measure: id, a label in full words, unit, direction, the value, its sample (attempts and
rounds), its window (dates and round count), a 95% range, whether it is measured or estimated, the same measure for the
previous window and for the season, the team's spread, and the Tour figure with where it comes from.

### Rounds and windows

A round counts by the rule the Stats screens use, stated from the same lib functions: `isCountableRound`
(`src/lib/golf/round-countable.ts`), else a total posted without its holes (`isTotalOnlyCountable`,
`src/lib/golf/round-score-countable.ts`), with the canonical total (`withCanonicalRoundTotal`). Practice is left out
(`countsForScoring`, `src/lib/coachhelm/v3/chat/season-rule.ts`). 18-hole rounds only (Stats' default filter). Newest
first by date then id.

| Window | Rounds |
| --- | --- |
| `last10` "Last 10 rounds" | the newest 10 counted rounds, whenever played |
| `previous10` "The 10 rounds before those" | rounds 11 to 20; exists only with three or more (Stats' "vs previous 10" rule) |
| `season` "This season" | from 1 August on the team's calendar (`seasonStartDate`) |

The read goes back twelve months. No figure is ever "all time". The builder takes `now` and never reads the clock.

### Measures

Every per-round figure is per 18 holes (all rounds here are 18-hole rounds). Rates pool the chances, never a mean of
percentages. A value is `null`, with `withheld` saying what it needs, under the floor the Stats screen uses.

| Measure id | What it is | Source (function or table) | Floor | Range | Tour figure |
| --- | --- | --- | --- | --- | --- |
| `strokes_gained_total`, `_off_the_tee`, `_approach`, `_around_the_green`, `_putting` | strokes gained per round over the rounds MEASURED from logged shots | `golf_rounds` stored per-round figures, averaged as `sgOver` (`src/clubhouse/data/stats-weight.ts`) | 3 rounds with shots | t | 0, by definition |
| the same five with `_estimated` | the same over the rounds with NO shots logged (the scorecard estimate) | same columns; `sg_estimate_from_holes` wrote them | 3 such rounds | t | none: not on the Tour's scale |
| `scoring_average` | mean score | canonical round total; `summarizeWindow().avg` | 1 round | t | none |
| `par_3_scoring`, `par_4_scoring`, `par_5_scoring` | mean score on holes of that par | `golf_holes`; Stats prints par + the calculator's average to par, the same mean | 1 hole | t over rounds | `scoring_par_N` |
| `big_numbers` | double bogey or worse as a share of holes | round cache, as `bigNumberRate` | any hole | Wilson | `big_number_rate` (approximate) |
| `fairways_hit` | fairways hit of fairways | round cache, as `rate` (`stats-common.ts`) | 2 rounds | Wilson | none |
| `greens_in_regulation` | greens hit of greens | round cache, as `rate` | 2 rounds | Wilson | `gir_pct` |
| `approach_proximity_50_125`, `_125_175`, `_175_plus` | mean finish in feet over every approach from the band, misses in, lay-ups out | `aggregateApproachBuckets` (`src/lib/golf/leak-map-buckets.ts`) | 10 approaches | the aggregator's own t range | `approach_proximity_*` |
| `approach_green_hit_50_125`, `_125_175`, `_175_plus` | share of those approaches finishing on the green | the same call's `green_hit_pct` | 10 approaches | Wilson | men: 80 / 65 / 50, approximate (`greenHitAnchor`); women: none |
| `scrambling` | missed greens saved for par or better | round cache, as `rate` | 10 chances | Wilson | none |
| `sand_saves` | the same from a greenside bunker | round cache, as `rate` | 10 chances | Wilson | `scrambling_pct_sand` |
| `putts_per_round` | putts per round over rounds with putts recorded | round cache, as `cachedPutts` | 1 round | t | none |
| `three_putts_per_round` | three-putts per round, same rounds | round cache, as `cachedPutts` | 1 round | t | none |
| `putts_made_3_5`, `_5_10`, `_10_15`, `_15_25`, `_25_plus` | make rate by start distance | `bandedPutt` and `PUTT_REPORT_BAND_OF` (`src/lib/golf/putt-make.ts`, the one make-rate definition) | 10 putts | Wilson | `putts_made_*_pct` |
| `penalty_strokes_per_round` | penalty strokes per round | round cache `penalty_strokes`, as Stats' `per` | 1 round | t | `penalty_rate_per_round` (approximate) |
| `pressure_gap` | tournament and qualifier rounds against practice rounds, strokes to par per round | as `pressureGap` (`stats-figures.ts`); read from the window WITH practice, as Stats reads it | 3 competitive, 3 practice, 5 in all | Welch | `practice_tournament_delta` (approximate) |
| `opening_hole` | hole 1 against holes 2 to 18, strokes to par per hole | as `openingDelta` (`stats-figures.ts`) | 5 rounds | paired t | `opening_hole_delta` (approximate) |

Measured and estimated strokes gained are separate measures and are never averaged together. A round is measured when
it has at least one usable shot, the same test the database function applies
(`supabase/schemas/functions/public.sql:7919-7923`; `hasMeasuredStrokesGained`). The Stats screen prints one blended
figure; each measured strokes-gained measure carries it as `screen: { value, rounds, blended }` so a number quoted from
the screen can be traced.

What had no existing function to call:

- **Par scoring.** Stats takes it from the 3,300-line shots calculator through a server action. Here it is the mean
  score over the same `golf_holes` rows; its error is taken over rounds, because the holes of one round move together.
- **The spread of an approach band.** `aggregateApproachBuckets` returns the mean and its range, not the standard
  deviation. The standard error is read back off that range, (high − mean) / t(n − 1), so there is still one proximity
  formula.
- **Measured or estimated.** No column says which; the fact sheet applies the database function's shot test to the
  round's shot rows.
- **Arithmetic that lives in `src/clubhouse`** (`rate`, `cachedPutts`, `bigNumberRate`, `pressureGap`, `openingDelta`,
  `withoutEmptyHoleCounts`, the window cut). `src/lib` may not import it, so it is restated from the same tables and
  columns, and `__tests__/stats-parity.test.ts` runs both over the same rows and fails if they part.

### The team block

`team` on each measure: every teammate's value over their own last 10 rounds with its sample, the median, the MAD and
`spread` (MAD × 1.4826), without the player the sheet is about. Ids only: a fact sheet has no names. It is marked
`audience: 'coach_only'`; `withoutCoachOnly(sheet)` removes it before anything travels toward a player.

### The Tour block

From `golf_pga_standards` for the team's own tour (LPGA rows for a women's team; a metric the tour lacks has no figure,
never the other tour's). `provenance` is `measured`, `approximate` or `by_definition`:

- `approximate`: `big_number_rate`, `penalty_rate_per_round`, `practice_tournament_delta`, `opening_hole_delta` (the
  seed rows' own source notes call them estimates) and the approach green-hit anchors (never cross-checked; none for
  women).
- `by_definition`: measured strokes gained, whose Tour figure is zero.

## Part 2: notability

Two tiers. A `signal` is something unusual about the player that cleared a test, so most players have none in most
weeks (on staging, 3 of 23). A `priority` is where the strokes go: every player with enough measured rounds has one.

`findNotable(sheet)` returns:

- `priority`: one, or `null` with `priority_missing` saying what is needed. See below.
- `candidates`: the signal tier, at most three, ranked.
- `good_news`: measures that moved or stand out in the player's favor. Never among the candidates.
- `unremarkable`: measures that were tested and show nothing, with the p-values. Never among the candidates.
- `not_checked`: measures no rule could test, each with why.
- `beyond_cap`: qualified, past the cap. `outcome_context`: see below.
- `test_log`: every test that ran, with its p before correction. `biggest_cost_season`: rule (c) over the season,
  reported only.

### The priority

The strokes-gained area with the lowest mean over the season's rounds measured from logged shots (five or more, each
with all four areas). It carries the strokes per round it costs against the Tour baseline with a 95% range, the four
areas' means, and a `certainty`:

| Certainty | Means |
| --- | --- |
| `clear` | a real loss AND clearly worse than the player's other three areas (rule (c)'s two conditions, over the season) |
| `likely` | a real loss (its 95% range is below zero), not clearly worse than the others |
| `leaning` | neither: the lowest area so far, and the rounds cannot yet tell it from zero or from the others |

It describes; it does not claim a change, it is not a candidate, and no correction for many tests applies because
nothing is claimed beyond "the lowest area so far" with its doubt stated. With teammates on the sheet it carries
`team_shape` (coach-only): the team's worst area over the season, whether it is this player's too, and how the player
sits against the teammates' median in that area (`better`, `same` when the player's own range reaches the median, or
`worse`, with the difference), so a priority most of a team shares still says something about the player.

### The signal tier

A measure is a candidate only when at least one rule holds. A gap to the Tour alone never makes one: removing every
Tour figure from a sheet changes nothing in the result (tested).

| Rule | Compared with | Test |
| --- | --- | --- |
| (a) `changed` | the player's own previous 10 rounds | two rates: Newcombe 95% range and pooled z; two means: Welch range and t. Both from `computeGap` (`v3/support/gap.ts`). |
| (b) `stands_out_in_team` | the teammates' median | (x − median) / (1.4826 × MAD × √(1 + (π/2)/m)) on Student's t with 0.3675 × (m − 1) degrees of freedom, m teammates; AND the player's own 95% range clears the median. |
| (c) `biggest_cost` | the player's own other three areas | the strokes-gained area with the lowest mean over measured rounds; round by round, (that area − the mean of the other three) below zero AND the area's own mean below zero, both on a range widened for choosing one of four. |

A reason is supported when its range excludes zero and it survives Benjamini-Hochberg across every test run for the
player (`benjaminiHochberg`, `v3/support/multiplicity.ts`).

Each candidate carries: why it qualified (`reasons[].rule`), the numbers behind it (`compared`, `difference` with its
range, `test` with p and q), what was compared, `strokes_at_stake`, and `questions`: the shot-level questions to ask
next, as data (`{ ask: 'misses_by_side', band: '125_175' }`).

Ranking is by strokes per round at stake, with its range. There is no confidence score. A rate is sized as the
player's own attempts per round of the window × the rate difference × a stated cost per event; `fairways_hit` and
approach proximity have no sound cost in the repo, so they carry no size and rank after every sized candidate.

Two rules keep three candidates from being one problem said three times:

- **One candidate per area.** Other measures of the same area that also qualified ride along as `supporting`.
- **The round's result is context.** `scoring_average` and `strokes_gained_total` stand as candidates only when no part
  of the game qualified; otherwise they are in `outcome_context`.

Estimated strokes gained is never judged by any rule.

### Thresholds

| Constant | Value | Reason |
| --- | --- | --- |
| `ALPHA` | 0.05 | Every range a rule reads is the 95% range the fact sheet prints, so a rule and a card cannot disagree. |
| `FALSE_DISCOVERY_RATE` | 0.10 | The engine's existing owner default (`BH_Q`): the share of false reads tolerated among a player's reads. |
| `MIN_ROUNDS_PER_WINDOW` | 5 | Stats measures a player's own spread only from five rounds (`OWN_SD_MIN_ROUNDS`); under that a window is a day or two of golf. |
| `MIN_TEAMMATES` | 5 | A median and a MAD from fewer than five values are set by one or two players. A team of two never fires rule (b). |
| `MIN_MEASURED_ROUNDS_FOR_COST` | 5 | The same five-round reason, counted in the rounds rule (c) pairs. |
| `COST_AREAS_SEARCHED` | 4 | Rule (c) picks the worst of four areas, so its level is ALPHA / 4 (Bonferroni). |
| `MAX_CANDIDATES` | 3 | The owner's cap. |
| `MEDIAN_VARIANCE_FACTOR` | π/2 | A median has 2/π of a mean's efficiency under normal data. |
| `MAD_EFFICIENCY` | 0.3675 | A MAD has 0.3675 of a standard deviation's efficiency, so it is worth that share of the degrees of freedom. |
| `MAD_TO_SD` (`stats.ts`) | 1.4826 | 1 / Φ⁻¹(0.75): MAD to standard deviation under normal data. |
| `STROKES_PER_PUTT`, `_PENALTY`, `_FAILED_SAVE`, `_BIG_NUMBER` | 1 | The lower bounds the Stats priorities use (`src/lib/golf/strokes-gained.ts:240-244`). Sizing only. |
| `STROKES_PER_MISSED_GREEN` | 0.61 | `REFERENCE_MISSED_GREEN_COST`: rough at 20 yards against a 30-foot putt on the expected-strokes table. Sizing only. |
| `MIN_PREVIOUS_ROUNDS` (`rounds.ts`) | 3 | Stats shows "vs previous 10" only from three earlier rounds. |
| Floors in `measures.ts` | see the measures table | Each is the Stats screen's own floor; the parity test pins them to the screen's constants. |

None was tuned to produce candidates. Two corrections were made after measuring how often the rules fire on players who
are all alike (`__tests__/calibration.test.ts`): rule (b) with a plain t on m − 1 degrees of freedom fired at about
twice its stated rate, and par scoring with its error over holes instead of rounds did the same. Both moved in the
stricter direction. On 400 such players the tests now sit at or under their level and 5% get any read.

## The dry run

Read-only. One team: every active player's fact sheet, priority and candidates, a JSON summary and a table:

- per player: rounds in each window, tests run per rule, the priority with its certainty and how the player sits
  against the team, and the signals with the rule that fired;
- "N players share priority X" and "N players share candidate X", distinct candidate kinds, the share of players with
  the most common one;
- rule (c) over the last 10 rounds beside the same rule over the season;
- rule (a) before correction: tests per player, the p-values in bins, the smallest ones, and what a smaller family
  declared in advance (`PROPOSED_FAMILY`: the four areas and the scoring average) would support. Proposed, not applied;
- the two make-rate definitions, counted over every shot read.

    STAGING_SERVICE_KEY=... node --import tsx/esm --import ./scripts/coachhelm/server-only-hook.mjs \
      scripts/coachhelm/analyst-dry-run.ts --url https://<project>.supabase.co \
      --service-key-env STAGING_SERVICE_KEY --team <team uuid> [--out report.json] [--as-of 2026-11-10]

The target comes from the flags. No env file is loaded. It refuses when the URL contains the production project ref,
and when the key is a JWT issued for it. The key is read from the named variable and never printed. `--out` writes
every sheet and its candidates to a local file. No names are read.

## Tests

`npm run test:file -- src/lib/coachhelm/v3/analyst/__tests__/`

| File | Covers |
| --- | --- |
| `stats.test.ts` | The statistics, with the arithmetic by hand in comments. |
| `fact-sheet.test.ts` | Windows, each kind of figure, floors, measured against estimated, the team and Tour blocks, a women's team, determinism, the sources. |
| `notability.test.ts` | Each rule with its numbers by hand; the regression (below the Tour on everything, unchanged, typical: zero candidates); thin samples; estimates; a team of two; ranking, the cap, one per area. |
| `calibration.test.ts` | 400 players with nothing unusual: the rules fire at no more than their stated rates. |
| `stats-parity.test.ts` | The fact sheet against the Clubhouse functions over the same rows. |
| `priority.test.ts` | The priority and each certainty, the team shape, the season read, and the make-rate definition count. |
| `dry-run.test.ts` | Flags, the production refusal, the team report, ten ordinary players, and the Supabase sources over a client that can only select (paging past 1,000 rows, id chunks). |
