# CoachHelm chat knowledge: where each app definition comes from

The golf block (`golf.ts`) and the data map (`data-map.ts`) state how THIS app defines things. Every such statement
is listed here with the code that proves it, so the facts can be reviewed apart from the prose. Paths are from the
repo root; line numbers are as of branch `agent/coachhelm-chat-rebuild` on 10 Nov 2026. `__tests__/app-definitions.test.ts`
re-checks the ones that live in importable code. Nothing in this file is sent to the model.

The golf block writes to the **Stats screen's** definition wherever two parts of the app differ (the readers
`get_player_stats` and `get_team_stats` return that screen's figures). Every difference found is in section B.

## A. Definitions the prompt states

### A1. What strokes gained is measured against
| Statement | Proof |
|---|---|
| The baseline is Tour level, matched to the team: the PGA Tour's expected strokes for a men's team, the same curve scaled for a women's team. Division and scratch baselines were removed on 2026-06-22. | `src/lib/golf/sg-benchmarks.ts:82-85` (type and the removal note), `:94-97` (the two options), `:110-112` (default by gender), `:42-58` (the women's scale) |
| The database applies it per player from the team's gender unless the setting names one of the same two. | `supabase/schemas/functions/public.sql:10554-10562` (`sg_baseline_scale`), `:10768-10783` (`sg_scale_for_player`); the setting's CHECK allows only `pga_tour`, `womens`: `supabase/schemas/golf/10_tables.sql:2193` |
| Zero means Tour level; Stats draws no Tour figure beside a strokes gained row because it is zero by definition. | `src/clubhouse/data/stats-player.ts:420`, `:430-440` (`bench: null`) |
| Strokes gained is stored per round. With shots logged it is worked out shot by shot; with no shots logged it is a rough estimate from the hole card (fairway, green, putts). A round posted as a total only has none. | `supabase/schemas/functions/public.sql:7919-7923` (shot count), `:8036-8038` (the estimate branch), `:10567-10581` (`sg_estimate_from_holes`); total-only: `src/clubhouse/data/round-scope.ts:4-11`, `src/clubhouse/data/stats-weight.ts:144-150` |
| Each shot goes to an area by the type it was logged as (tee, approach, around the green, putting). A penalty is charged to the area of the shot that earned it. | `supabase/schemas/functions/public.sql:8014-8023` |
| The round's total is the four areas added. A window's total is the mean of the stored round totals. | `supabase/schemas/functions/public.sql:8040`; `src/clubhouse/data/stats-weight.ts:127-136` |
| No strokes gained figure under three rounds that have one (a nine-hole round counts as half). | `src/clubhouse/data/season.ts:79` (`MIN_SG_ROUNDS`), `src/clubhouse/data/stats-weight.ts:127-136` |
| A strokes gained total above +15 for one round is treated as bad data and the round does not count. | `src/lib/golf/round-countable.ts:54`, `:134-137` (number not stated in the prompt) |

Not verified, so not stated: how a par-3 tee shot is typed when it is logged. Golf convention files it under
approach; the database files a shot under the `shot_type` it was saved with (`public.sql:8020-8023`), and only the
penalty rule names par 3 (`:8016`). The prompt says "by the type it was logged as" and makes no par-3 claim.

### A2. A counted round
| Statement | Proof |
|---|---|
| Counts: finished, not a test round, 9 or 18 holes, every hole scored, a plausible total. | `src/lib/golf/round-countable.ts:120-143`; loader filters `src/clubhouse/data/season.ts:139-145` |
| An 18-hole round posted as a total only counts in scores (average, to par, trend, best) and in nothing hole-level (greens, fairways, putts, scrambling, birdies, strokes gained). | `src/lib/golf/round-score-countable.ts:21-29`; `src/clubhouse/data/round-scope.ts:4-11`, `:36-38` |
| Practice rounds are left out of Stats and Roster figures by default; they still show in round lists. A round with no type counts; an unknown type reads as practice. | `src/clubhouse/data/season.ts:66-68`; `src/clubhouse/data/stats-common.ts:48-51`; `src/clubhouse/data/figure-window.ts:15-17`; `src/lib/golf/round-type-utils.ts:13-17` |
| Stats figures read 18-hole rounds only by default. | `src/clubhouse/data/stats-filter.ts:99-101` (`holes: '18'`), `:277` |
| A round's putts of 0 means not recorded, never a round with no putts. | `src/clubhouse/data/stats-common.ts:187-198`; `src/clubhouse/data/round-scope.ts:26-33` |

### A3. Windows
| Statement | Proof |
|---|---|
| The chat's windows are the Stats switch's: last 5, last 10, last 20, this season. | `src/lib/coachhelm/v3/chat/screen-loaders.ts:33`; `src/clubhouse/data/player-figures.ts:18-20` |
| "Last N" is the player's newest N counted 18-hole rounds, whenever played (it crosses seasons; the read goes back a year). | `src/clubhouse/data/stats-filter.ts:25-26`, `:257-259`, `:285`, `:300-307`; `src/clubhouse/data/season.ts:114-126` |
| "This season" starts 1 August on the team's calendar and runs to 31 July. | `src/clubhouse/data/season.ts:19`, `:84-94` |
| For the team, "last N" is every player's own newest N, pooled. | `src/clubhouse/data/stats-team.ts:218-232`; `src/clubhouse/data/team-sg.ts:11-14` |
| The default window is the last 10. | `src/lib/coachhelm/v3/chat/readers.ts:18`; `src/clubhouse/data/figure-window.ts:19-31` |
| Stats also has a Qualifier rounds window; the chat's readers do not offer it (use `get_rounds` with the type, or `get_qualifiers`). | `src/clubhouse/data/stats-filter.ts:29`, `:42`; `src/lib/coachhelm/v3/chat/screen-loaders.ts:33` |

### A4. Which figures need what was recorded
| Needs | Figures | Proof |
|---|---|---|
| A score only | scoring average, to par, trend, best round | `src/clubhouse/data/round-scope.ts:7-10` |
| Hole-by-hole scoring | greens, fairways, putts, three-putts, scrambling, sand saves, penalties, birdies and other counts, scoring by par, toughest holes, opening hole | `src/clubhouse/data/round-scope.ts:8-10`; `src/clubhouse/data/stats-figures.ts:42-54`, `:208-222`, `:247-298` |
| Logged shots | make rate by putt distance, approach proximity by distance, miss direction and lies, measured strokes gained | `src/clubhouse/data/stats-common.ts:343-375` (putts from `golf_shots`); `src/clubhouse/data/stats-detail.ts:83-86` (approach shots); `public.sql:7919-7923` |
| Floors before a figure is shown (numbers not stated in the prompt; the read says "no figure yet" with the reason) | fairways and greens, scrambling and sand saves, a putt band, an approach band, strokes gained, pressure gap, opening hole | `src/clubhouse/lib/stats-signal.ts:31-44`; `src/clubhouse/data/stats-player.ts:489-494`, `:518-528`, `:557-558`; `src/clubhouse/data/stats-figures.ts:175-177` |

### A5. Figures the Stats page defines its own way
| Statement | Proof |
|---|---|
| Rates pool the chances (greens hit over greens possible across the rounds), never an average of round percentages. | `src/clubhouse/data/stats-common.ts:200-213`; `src/clubhouse/data/stats-figures.ts:125-149` |
| Scrambling: of the greens missed in regulation, the share still saved for par or better. Sand saves: the same from a greenside bunker. | `src/lib/coachhelm/v3/chat/data-dictionary.ts` (`scramble_attempts`, `scrambles_converted`, `sand_attempts`, `sand_saves`), written from the cache SQL |
| Three-putts count holes with three or more putts. | `src/lib/coachhelm/v3/chat/readers-direct.ts:71`; dictionary `three_putts` |
| Big numbers: holes at double bogey or worse, as a share of holes. | `src/clubhouse/data/stats-weight.ts:105-115` |
| Pressure gap: tournament and qualifier rounds against practice rounds, in strokes to par a round; positive means the competitive rounds are worse. | `src/clubhouse/data/stats-figures.ts:175-199` |
| Opening hole: hole 1 against the other holes, in strokes to par a hole. | `src/clubhouse/data/stats-figures.ts:208-222` |
| Toughest holes are grouped by hole number across whatever courses were played. | `src/clubhouse/data/stats-figures.ts:247-259` |
| The Tour column is the team's own tour (PGA for a men's team, LPGA for a women's), never a division figure. | `src/clubhouse/data/stats-common.ts:233-261`; `src/clubhouse/data/stats-team.ts:205-208` |
| A player's Stats page has no team column: a player is never compared with teammates. | `src/clubhouse/data/stats-player.ts:411`, `:417-435`; `src/lib/coachhelm/v3/chat/registry.ts:8-13` |
| Form on Roster (improving, steady, slipping, early) is the newer half of the recent scores against the older half, called a change only when it clears its own noise. | `src/clubhouse/data/season.ts:173-185` |
| Proximity is feet, shot distance is yards, putt distance is feet. | `src/lib/golf/sg-benchmarks.ts:17-19`; `src/clubhouse/data/stats-common.ts:349-371` |

### A6. How a qualifier is scored
| Statement | Proof |
|---|---|
| Order: total to par, then total strokes, then more rounds played. | `src/lib/coachhelm/v3/qualifying/ranking.ts:28-30`; `src/clubhouse/screens/qualifiers/model.ts:421` |
| A card with fewer rounds in than the most anyone has ranks below every complete card. | `src/lib/coachhelm/v3/qualifying/ranking.ts:37-63`; `model.ts:228-235` |
| Players level on to par and strokes share a position. | `ranking.ts:32-35`, `:82-94` |
| The squad is the squad size; the places on score are the squad less the coach's picks; the rest are the coach's picks. | `model.ts:291-293`; columns `selection_slots_total`, `selection_slots_coach_pick` |
| A round with no total or no to-par is not counted; a second round entered for the same qualifier round is ignored. | `model.ts:197-209` |
| A tie across the last place on score stays a "tie at cut" until the coach chooses. | `model.ts:295-302` |
| Nothing is final until the coach confirms the squad (`selection_state` `selected`); a selection is `top_score` or `coach_pick`. | `model.ts:294`, `:306`; `supabase/schemas/golf/10_tables.sql:1678` and the `golf_qualifier_selections_type_check` constraint |

### A7. Level and division cohort
| Statement | Proof |
|---|---|
| A team's level is its division (I, II or III) from the newest season row, else the program's Division in Settings. NAIA, junior college and "not set" have no level. | `src/lib/coachhelm/v3/chat/benchmark-reads.ts:86-96`, `:200-208`; CHECK `supabase/schemas/golf/10_tables.sql:2334` |
| A division cohort is the players on Helm whose teams play at that division, same gender, averaged over all their recorded rounds, and only when the group is large enough. It is not a published NCAA average. | `src/lib/coachhelm/v3/chat/benchmark-reads.ts:155-162`, `:241-257`, `:286-287` |
| No published college average is in the app: every level figure in the standards table failed the source check. | `src/lib/coachhelm/v3/chat/benchmark-reads.ts:104-121` (`SOURCED_LEVEL_FIGURES = {}`) |
| The cohort table's migration is HELD, so today the level comparison falls back to the college players of the same gender on Helm. | `supabase/migrations/HELD.md:163`; `benchmark-reads.ts:158-162` |

### A8. How team figures pool rounds
| Statement | Proof |
|---|---|
| Team scoring average on Team Stats: every round in the window from every active player, pooled, one mean. A player with more rounds weighs more. | `src/clubhouse/data/stats-team.ts:215-232`, `:270` |
| Team rates pool the holes; per-round figures are per 18 holes. | `src/clubhouse/data/stats-team.ts:259`, `:275-278` |
| Team strokes gained on Team Stats counts only players with three rounds that have it. | `src/clubhouse/data/stats-team.ts:302-309`, `:455`; the team column on a player's page does the same: `src/clubhouse/data/stats-player.ts:421-429` |
| Roster's season team average: every active player's 18-hole counted round since 1 August, pooled per round. | `src/clubhouse/data/roster.ts:127-131`, `:240`, `:293` |

### A9. Timezones and season boundaries
| Statement | Proof |
|---|---|
| A round's date is a calendar day, not an instant. Event times are stored in UTC and shown in the team's zone. | `src/clubhouse/data/season.ts:278-283`; dictionary `golf_rounds.round_date`, `golf_events.start_time` |
| The season turns on 1 August on the team's calendar, not the server's. | `src/clubhouse/data/season.ts:84-94`, `:104-112` |
| The team's zone reaches the prompt in the team block; today's date arrives as a system note after the user's message. | `src/lib/coachhelm/v3/chat/instructions.ts:131-144`, `:31-37` |

## B. Where the app defines one thing two ways

1. **Team strokes gained, with and without the per-player floor.** Team Stats' headline and area totals count only
   players who have three rounds with strokes gained (`stats-team.ts:302-309`, `:455`). `loadTeamStrokesGained`
   (`src/clubhouse/data/team-sg.ts:16-30`) and `teamFiguresOver` (`src/clubhouse/data/player-figures.ts:76-82`) pool
   every round that has it, with no per-player floor, although the comment on `team-sg.ts:11-14` says it is the
   calculation Team Stats shares. A player with one or two tracked rounds moves the second and not the first.
   Another worker is unifying these in the Stats loaders. The prompt states the Stats screen's rule.
2. **Season scoring average, practice in or out.** Roster and Stats leave practice rounds out
   (`roster.ts:240`, `figure-window.ts:15-17`). The Rounds page's season line counts every countable 18-hole round,
   practice included (`src/clubhouse/data/rounds-shape.ts:170-177`, `team-rounds-shape.ts:61-63`). `get_season`
   returns the first and `get_rounds` prints the second as "This season ... as the Rounds page shows it"
   (`readers.ts:381`). The two can differ for the same team on the same day. The prompt tells the model that
   `get_season` is the season figure and that `get_rounds` averages include practice unless a type is given.
3. **Team average, three ways** (already in `TOOLS.md:70`): Team Stats' pooled figure; a mean of per-player cache
   values; `golf_player_standing.team_avg` (lifetime, mean of players). The readers now return only the first; the
   allowlist still exposes `golf_player_standing.team_avg` and `golf_player_stats_cache` to `query_team_data`. The
   data map marks both tables as lifetime figures that must not be quoted as the team average or a window figure.
4. **Scoring average, window or lifetime.** Stats: the window's counted 18-hole rounds, practice out. The stats
   cache (`golf_player_stats_cache.scoring_average`, `last_5_average`, `last_10_average`): every completed 18-hole
   round, practice included, implausible rounds included (dictionary notes; the countable-round migration
   `20260924120000` is still HELD, `supabase/migrations/HELD.md:176`).
5. **Putts per round.** Stats: mean over rounds with putts recorded, per 18. The cache divides by the holes of every
   completed round, so a round with no putts entered lowers it (`player-figures.ts:11-17` records 27.1 against 32.6
   for one player).
6. **Roster's season counts only 18-hole rounds and takes a plain mean** (`season.ts:209-212`, `:225`); a Stats
   season window is per-18 weighted and also 18-hole by default, so they agree unless the filter is changed.
7. **The team's timezone has two homes.** The chat context reads `golf_teams.timezone`
   (`src/lib/coachhelm/v3/chat/context.ts:44-45`, `:100`); the Clubhouse loaders turn the season on
   `golf_team_settings.timezone` (`season.ts:108-112`). If the two rows differ, the note's "today" and the season
   boundary are on different clocks for a few hours a year.
8. **"Level".** `golf_team_settings.sg_benchmark_level` still allows `scratch`, `ncaa_d1` ... `break_100`
   (`10_tables.sql`, `golf_team_settings_sg_benchmark_level_check`), while strokes gained itself is only ever
   Tour-based (A1). The data map does not present that column as what strokes gained is measured against.
9. **Qualifier standings.** The board (`model.ts`, `rankStandings`) is the one order; `golf_qualifier_entries`
   also stores `position`, `total_to_par` and `rounds_completed`, which the allowlist exposes. The stored
   aggregate can lag the board. The data map sends standings questions to `get_qualifiers`.

## C. Found wrong while reading (details in the final report)

- `readers.ts:493` prints `shortRounds` as "N short, ranked below full cards". `shortRounds` is the number of
  counted rounds that were not 18 holes (`model.ts:220`), not rounds missed. The "short card" rule is
  `played < most` (`ranking.ts:54-57`). TOOLS owns the file; reported, not edited.
- `data-dictionary.ts` said strokes gained is against "the team's chosen baseline ... not against the Tour by
  default" and listed `scratch, ncaa_d1, ncaa_d2, ncaa_d3` as `sg_baseline` values. Both false since 2026-06-22
  (A1). Fixed in this change, with three value lists the schema does fix (`golf_focus_area_criteria.source`,
  `golf_focus_area_practice_sessions.logged_by_role`, `golf_tournament_rounds.status`).
- `readers.ts:427`, `:440`, `:450` say "since 1 August" as a fixed phrase. True (A3), and stable.
- The golf research document (`docs/v3-research-golf-domain.md`) states college figures with no source in three
  causal sections (wedge proximity, sand saves, the practice-to-tournament gap in strokes) although its own section
  3 says no college figure is quoted without one, and its chapter 2 holds men's Tour 2024 tables that duplicate
  the standards table and are wrong for a women's team. The on-demand reference withholds those (see
  `reference-topics.ts`).

## D. Defaults taken without asking

1. Write to the Stats screen's definitions (brief). Everything else is flagged in B.
2. Strokes gained is described as "against Tour level, matched to the team", with zero as Tour level. The women's
   baseline is a scaled men's curve, not LPGA shot data; the prompt does not call it "LPGA ShotLink".
3. The prompt says a strokes gained figure may rest on estimated rounds, because the readers cannot tell the model
   which rounds were shot-tracked. If a reader later returns that count, the sentence should point to it.
4. Tour and level figures are served only by `get_reference` topic `standards` (tour-aware, the Stats page's own
   table). The research document's Tour tables are withheld from the golf reference.
5. The data map names tables only when a reader or the allowlist reaches them, and names columns only for
   allowlisted tables. Flag-gated tables (tournaments) are in the map with the words "only when tournaments are
   turned on", so the prefix stays the same bytes with the flag on or off.
6. A player's map has no table names at all: a player has no table reader.
