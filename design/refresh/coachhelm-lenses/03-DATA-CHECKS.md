# Data checks: CoachHelm Player Lenses

Checked against helmv3 `main` 75b4956 on 31 Oct 2026, by reading code and migrations only. No query was run. The SELECTs in "Staging spot checks" are for the Mac to run, read-only, on staging.

Read-only. Repo `helmv3` at `main` 75b4956. Staging Supabase `ybmwektreyrwjscxlogv` (Demo University Golf, team `6ecdd1a6-63fe-4beb-b094-00118f334163`). Today in the team's zone is Sat Oct 31 2026 (America/New_York), so the 2026–27 season started Aug 1 2026 (`data/season.ts:68` `seasonStartDate`).

Design: `redesign/coachhelm-lenses.html` (render functions `featCard`, `planCard`, `sgCard`, `readsCard`, `workingCard`, `fieldCard`, `intentCard`, `trackCard`, `sheetHTML`). Checked against page v3, its state switch included (section 12). Nick's four calls of 31 Oct are taken as decided: one file per player; the "As Eli sees it" lens; the coach's plan for the player, coach only, in its own words; players see the team average, never teammates by name.

Paths are under `src/clubhouse/` unless they start with `src/` or `supabase/`.

## The short version

- **Most of the page has a real source.** The read, its value, sample, window and read word (`ChInsight`), the Tour figure, "closes 0.4 a round" (`ChDeepInsight.closes`), the stance words, the ladder word for the coach, Suggested and Accepted (focus area `created_at` and `started_at`), the goal line and its check-ins (`golf_goals.snapshots` or `golf_player_focus_areas.snapshots`), the coach's intent (`golf_coach_player_intent`) and the field-day figures (`v3/field-day`) all exist. None needs a migration.
- **"Team 0.7" is not in the read.** The penalty read compares only against the Tour (`comparison_source: 'pga_baseline'`). The team figure must come from `golf_player_standing.team_avg` for `penalty_rate_per_round`. That row is drawn only when 5 or more teammates have the stat (`TEAM_MARKER_MIN_N`). The team mean includes the player.
- **"Closes 0.4" uses a team average with no floor.** `realisticTeamGap` anchors on `team_avg` even when `team_n` is under 5. So the page could say "closing to the team's average is worth 0.4" while the Team figure is hidden. With the mock's own numbers (1.1 / 0.7 / 0.3) the formula gives **0.6**, not 0.4.
- **"Seen Oct 24, 9:12 PM" has a source at the right grain, with care.** `golf_insight_exposure` keeps `player_id`, `insight_id`, `surface` and `shown_at`. Use `surface = 'player_feed'` only. `coach_id` null does not mean a player saw it: the coach roster sweep writes `roster_card` rows with `coach_id` null. It records that the read's card was drawn, not that the proposal was opened.
- **Field day needs teammates, not other teams.** A field is 3 or more of the *same team's* players on the same day and the same `course_id`, each round countable (every hole scored). Staging's newest rounds (Sep 25–26 qualifiers) are totals only, so they are not countable and make no field. The card should not draw on staging.
- **Where the strokes go is against the Tour today, not the team.** The ladder draws the four SG legs vs the Tour (`data/coachhelm-ladder-shape.ts:6-13`). The vs-team bars need `player_value − team_avg` from the same standing rows, which the shape currently drops. The rows are **all time**, not "Season · 14 rounds": the season standing table is held and not applied.
- **No source:** "Started at 1.4 … Oct 4" with "Focus since Oct 24" (the dates disagree), "2 of 3 sessions" (the log table is behind an off flag and nothing stores "3"), per-hole lines like "drop, bogey 5" and "trouble right", the "Penalties in the last 10 rounds" strip (the dive strip is score to par), "A hard day for everyone", "Top of your game this week", "biggest leak", "Approach from 125 to 150 yds" (the band is 125–175), team figures on the three-putt and up-and-down rows, and "the penalties are most of it". Fixes are in the "No source" list.
- **Visibility leaks found.**
  1. Coach side, live at 75b4956: the coach's Deep dive reads the player's goals through the service client with no `shared_with_coach` filter (`src/lib/coachhelm/v3/goals/loader.ts:19-38`, called from `data/coachhelm-dive.ts:53-71`). RLS (`goals_coach_view`) lets a coach see only coach-made or shared goals. A player's private goal can reach the coach's plan line, and the new goal card would show it.
  2. Player side, in the design: the field card's dots show each teammate's score that day. In a field of 3 to 5 the player can tell whose is whose. Page v3's decision 4 text allows "unnamed dots" for the player, so this is a risk for Nick to rule on (section 12). Safe choice: dots coach-only, the field mean only for the player.
  3. Not a leak, but the same risk: RLS lets a player read their own dismissed insights, the ladder keys in `evidence`, focus-area verdicts and their `golf_insight_action` / `golf_insight_outcome` rows. "Never" for those is kept by the server, not by RLS. Intent is the one coach-only item RLS really enforces.
- **The lens must not write.** If the lens reads `getInsightsForPlayer` to be faithful, it must pass `drawnLater: () => Promise.resolve([])`. Without it, every coach preview writes `player_feed` exposure rows and fakes "Seen".
- **Page v3's Early and Empty states miscount.** The round floor is 4 (`ABSOLUTE_MIN_ROUNDS`), not 3, and is counted in a 90-day window, not the season. Total-only rounds count as 0 and make no field card. See section 12.
- **On staging** the file will be thin: 5 real players (no Eli), lifetime reads from the summer rounds if any were generated, no focus, no Seen, no goals, no intent, no field card, no season track record. That maps to the design's stage 0 ("No focus yet") and the "No reads yet: N more rounds" list row. Most other cards have no empty state drawn; see "What staging will show".

---

## Formula findings

### 1. Top read (the green feature card)

**Rows**
- Coach: `getInsightsForCoach(coachId, { player_id, limit: 30, includeMore: true })`, then `toChInsight` and `toChDeepInsight` (`data/coachhelm-player.ts:187-269`).
- Player: `getInsightsForPlayer` with `drawnLater` (`data/coachhelm-dive.ts:101-194`).
- Table: `golf_coach_insights` through `applyInsightVisibility`: v3 engine only, `lifecycle_state` in detected / matured / addressed / resolved, `status <> 'dismissed'` (`src/lib/coachhelm/v3/insight-visibility.ts:78-81`).
- The top read is `partitionInsights(...).focus`: the first current finding in the feed's own order (`data/coachhelm-shape.ts:381-402`).

**Figures**

| On the design | Source | Formula | Verdict |
|---|---|---|---|
| "Penalty strokes: 1.1 a round" | `ChInsight.title`, `value` (`evidence.your_value_display`) | The penalty generator reads `golf_player_stats_cache.penalty_strokes_per_round` (`src/lib/coachhelm/v3/generators/course-mgmt.ts:116-127`). Lifetime. | Real |
| "Tour 0.3" | `ChHelmGauge.cmp` (`data/coachhelm-map.ts:160-176`) | `comparison_value` = the team's Tour value (`comparison_source: 'pga_baseline'`, `course-mgmt.ts:255-260`). Label is the generator's "… avg". | Real |
| "Team 0.7" | **Not in the read.** The penalty read has no team or secondary tick. | Use `golf_player_standing.team_avg` where `metric_id='penalty_rate_per_round'`. `team_avg = AVG(player_value)` over the team's active members with a value, **the player included**; `team_n` counts them (`supabase/migrations/20260925120000_golf_standing_team_pct_floor_5.sql:136-141`). Draw only when `team_n >= 5` (`data/coachhelm-standing-shape.ts:306, 321`), else "—" and "Team comparison needs 5 teammates". | Real with a new join; floor applies |
| "21 rounds" | `evidence.sample` = `sample_n` + noun (`coachhelm-map.ts:225`) | `sample_n = rounds_played` from the stats cache (`course-mgmt.ts:334`). | Real |
| "All rounds" | `evidence.window` (`coachhelm-map.ts:141-146`) | `window_basis: 'lifetime'` (`course-mgmt.ts:339`). | Real |
| "Solid read" | `evidence.read.word` (`coachhelm-map.ts:187-191`) | `confidenceLabel(confidence, sample_n)`. Solid / Early / Thin read. | Real |
| "Seen repeatedly" (coach) | `ChDeepInsight.firmness` = `engine.support.word` else the read word (`data/coachhelm-dive-shape.ts:503-505`) | `LADDER_WORD[evidence.ladder]` (`data/coachhelm-engine-shape.ts:166-172`), only for a coach viewer (`supportOf`, `:248-260`). Flag `coachhelm_support_v1` (on in production and preview). | Real; coach only |
| "Priority" chip | `stanceOf` (`data/coachhelm-shape.ts:360-367`) | Out of date, Note, Working, Assigned, Acknowledged, else `PRI_LABEL` Priority / Worth closing / Minor. | Real. Once assigned the coach's chip reads **Assigned**, not Priority. |
| "worth 0.4 strokes a round" | `ChDeepInsight.closes` (`coachhelm-dive-shape.ts:185, 389-394`) | The theme cause for this insight: `strokesSavedPerRound = tourGap × clamp((player − team_avg)/(player − pga), 0, 1)` (`src/lib/coachhelm/v3/themes/assemble.ts:108-125`). `tourGap` is the stored `evidence.counterfactual.strokes_saved_per_round`. For penalties `tourGap = (player − tour) × 1.5` (`src/lib/coachhelm/v3/counterfactual/lookup-tables.ts:132`). `anchor` is `team` when player, team and Tour values are all known, else `tour`. | Real, two problems below |

**Problems**
- **0.4 is not what the formula gives.** With 1.1 / 0.7 / 0.3: `tourGap = 0.8 × 1.5 = 1.2`, fraction = 0.4 / 0.8 = 0.5, so 0.6. The mock should read 0.6 or change its inputs.
- **No team floor on the anchor.** `realisticTeamGap` uses `team_avg` whatever `team_n` is (`assemble.ts:115`). The card can then say "to the team's average" next to a hidden Team figure. Fix in the page: say "to the team's average" only when the Team figure is drawn (`team_n >= 5`); otherwise say "to the Tour" with `tourGapPerRound`, or "—". This is a label rule, no engine change.
- "Across all 21 rounds on file" (coach copy) is true for this read. The player copy "the team averages 0.7" is fine under decision 4 (an average, no names).
- The player's st 0 title "Penalty strokes are your biggest leak" claims a ranking by size. The feed ranks by its own score, not strokes. Use the read's own title. The st 1–3 title "Keep the ball in play off the tee" is not stored anywhere: a focus area made from a read is saved with the read's own title (`ChInsight.assignAs`, `coachhelm-shape.ts:116`).

### 2. The plan card: handshake, goal line, drill

**Handshake** (coach lens)

| Step | Source | Notes |
|---|---|---|
| Suggested Oct 24 | `golf_player_focus_areas.created_at` where `from_insight_id = read id` (status `proposed` at create). Also `golf_insight_action` `action_type='create_focus'` (`src/app/golf/actions/development.ts:1705-1713`). | Real. `readPlans` already reads the focus areas but not `created_at` (`data/coachhelm-dive.ts:56-61`); add it to the select. |
| Seen Oct 24, 9:12 PM | `golf_insight_exposure`: `min(shown_at)` where `insight_id = focus.from_insight_id`, `player_id`, `surface = 'player_feed'`, `shown_at >= focus.created_at`. Show in the team's zone. | Real at per-player, per-insight grain. Caveats below. |
| Accepted Oct 25 | `golf_player_focus_areas.started_at`, stamped by `acceptFocusArea` with `status='active'` (`src/app/golf/actions/development.ts:695-702`). | Real. Declined: `status='declined'`, `updated_at` (`:760`). |

Seen caveats:
- The ledger keeps one row per (insight, coach, surface, UTC day) (`src/lib/coachhelm/v3/effectiveness/exposure-rows.ts:118-142`; insert `event-ledger.ts:193-226`). The first row of the first day is the true first time. Later renders that day are dropped.
- Only `player_feed` is the player's own Clubhouse view (`src/app/golf/actions/insight-delivery.ts:814-824`). `hub_signal` is the legacy player hub. `roster_card` is the coach's roster sweep, written with `coach_id` null (`insight-delivery.ts:1246-1247`). `round_review` can be either. So filter on surface, never on `coach_id is null`.
- It records the read's card being drawn, not the proposal card being opened. Proposals (`ChProposal`) write no exposure. If the read is not one of the player's drawn cards, Seen stays "Not yet" even after the player saw the proposal. Label it "Shown to Eli" or accept the proxy.
- RLS: coach of the team and the player may SELECT (`supabase/migrations/20260621160000_insight_event_ledger.sql:57-69`).

**Goal line** ("Under 0.6 penalties a round", "Started at 1.4 · now 1.1 · 5 check-ins", sparkline, "Improved")
- Two real sources with history:
  - `golf_goals`: `baseline_value`, `current_value`, `target_value`, `snapshots [{date, value, team_avg?}]`, `started_at`, `ends_at`, `state` (`src/lib/coachhelm/v3/goals/types.ts:27-65`). Loaded today by `readPlans` → `loadActiveGoals` / `loadRecentlyAchievedGoals`. `ChDivePlan.goal` keeps only title, word and a "Now X, target Y, by date" line (`coachhelm-dive-shape.ts:356-382`); the snapshots are loaded but dropped.
  - `golf_player_focus_areas`: `baseline_value` (stamped at accept), `current_value`, `target_value`, `snapshots` (`supabase/migrations/20260802140000_golf_focus_areas_baseline_and_snapshots.sql`).
- **Window.** A penalty goal is tracked over its goal window, not all time (`src/lib/coachhelm/v3/goals/window-metric-ids.ts`, `penalty_rate_per_round` is windowed). The read's 1.1 is lifetime. Two "1.1"s from different windows must not sit side by side unlabelled. Say "over the goal's window, since {started_at}".
- **Dates disagree in the mock.** Check-ins start Oct 4, but the focus started Oct 24 and was accepted Oct 25. A focus area's history starts at acceptance; its `baseline_value` is the value at accept. If the line is the focus area's, it starts Oct 25. If it is a goal's, it starts at the goal's `started_at`.
- "Improved" chip: two different things exist.
  - `ChDiveOutcome` reads `golf_coach_insights.outcome_status` (`coachhelm-dive-shape.ts:317-326`), written when a coach records a focus outcome by hand (`development.ts:2124-2159`). It is a coach's call, not a measurement. In production it was null on 594 of 596 rows (`src/app/golf/actions/player-effectiveness.ts:24-30`).
  - `golf_player_focus_areas.verdict.word`, measured by the lifecycle cron behind `coachhelm_verdicts_v1` (`supabase/migrations/20261020120000_golf_focus_area_prescription.sql`, applied). Read by `readFocusVerdicts` (`data/coachhelm-engine.ts:40-65`).
  - Evidence rule: say which one. Prefer the verdict; if only `outcome_status`, label it "Coach marked improved".

**Drill** ("This week: Fairway finder", text, "logged 2 of 3 sessions")
- Name and text: `ChInsight.week` from the read's first attached drill and `golf_drills.description` (`data/coachhelm.ts:189-205`). Real.
- "2 of 3 sessions": the log is `golf_focus_area_practice_sessions` (`supabase/migrations/20260923110000_golf_focus_area_practice_log.sql:78-100`), gated by `coachhelm_focus_area_practice_log`, whose own note says the migration is not applied everywhere. Check it exists on staging (query 12). **Nothing stores the "3".** Show "2 sessions logged" or drop it.

### 3. Where the strokes go

- Today: `ChStanding.ladder` (`data/coachhelm-ladder-shape.ts:60-73`) from `golf_player_standing` rows `sg_ott`, `sg_approach`, `sg_around_green`, `sg_putting`. Strokes a round **against the Tour**.
- The design draws them **against the team** (Off the tee −0.7 …). The rows carry `team_avg` and `team_n`, and `toRow` builds `team` and `vsTeam` for them (`coachhelm-standing-shape.ts:306-323`), but those four rows are filtered out of the groups so no number shows twice (`:366`). The vs-team bars are `player_value − team_avg`, per row, only when `team_n >= 5`. No new read; the shape has to expose it.
- Window: Standing reads `golf_player_standing_season` first, else the lifetime `golf_player_standing` labelled "All time" (`data/coachhelm-standing.ts:155-165`). The season table is **HELD** (`supabase/migrations/HELD.md:239`). So today the label is "All time", and the rows carry no round count (`rounds: null`, `coachhelm-standing-shape.ts:70-71`). "Season · 14 rounds" has no source; use "All time" and `ChStanding.rounds` (stats-cache `rounds_played`).
- "and the penalties are most of it": nothing links penalties to a share of SG off the tee. Drop the clause.
- Players: team average only, as decided. The coach can keep this card as is; it names nobody either.

### 4. All reads, Also worth knowing, dismissed Undo

- Coach list: `ChDeepDive.list` (`coachhelm-dive-shape.ts:201-218`), each with `stance` and `firmness`.
- Player list: the Board shows at most 3 findings (the focus counted) and 1 strength (`NEEDS_MAX`, `WORKING_MAX`, `coachhelm-shape.ts:342-343`). The design's player "Also worth knowing · 3 reads" repeats the focus as its first row and the Working card shows 2 strengths. Either keep the Board's 3 + 1 or say this is the Deep dive.
- Row subtitles name team values that are not in the reads: "31 ft vs team 26 ft", "team 1 in 12", "team 49%". The read's comparison is the gauge's `cmp`, which is the Tour for v3 rows. Use `gauge.cmp`, or join `golf_player_standing.team_avg` for metrics that have a standing row. Three-putts and up-and-down have no standing row (the cache has `three_putt_percentage` and `up_and_down_percentage`, but `METRIC_IDS` does not; `coachhelm-standing-shape.ts:141-170`). For those, no team figure.
- "Approach from 125 to 150 yds": the band is 125–175 yd (`approach_proximity_125_175ft`). Relabel.
- **Dismissed: "Fairways hit on par 5s · Undo".** Visibility drops dismissed rows, so no Clubhouse loader returns them. New read, no migration: `golf_coach_insights` for the player with the v3 filter, visible lifecycle and `status='dismissed'`. Undo is `reactivateInsight(id, lifecycle, 'dismiss')`, already wired (`screens/coachhelm/writes.ts:40`). RLS: the coach reads it (`coach_insights_select_via_player_team`, `supabase/migrations/20260527000000_prod_public_baseline.sql:18552`). The player can also read their own dismissed rows (`coach_insights_select_player_own`, `:18546`), so the player route must never ship them.
- A player's own dismissals are a different table (`golf_insight_player_feedback`, `rating='dismissed'`, `data/coachhelm.ts:78-92`). The player feed drops them; the coach feed does not. That matters for the lens (section 11).

### 5. What's working (player)

- `partitionInsights(...).working`, strengths only (`kind === 'strength'`, `data/coachhelm-classify.ts:63-72`). Max 1 on the Board.
- "Bogey avoidance on par 3s · par 3 average +0.18, team +0.31": par-type rows are descriptive (`feed_exempt`) and usually classify as notes, which are never drawn. The team figure is in `golf_player_standing` (`scoring_par_3`) if `team_n >= 5`. Treat this row as sample data.

### 6. Last round in context (field day)

**Source:** `src/lib/coachhelm/v3/field-day/field.ts` and `loader.ts`. No Clubhouse file reads it today; only the pressure generator and the bad-day angle do.

- Loader `loadTeamFieldRounds(supabase, teamId, since)` (`field-day/loader.ts:29-73`): `golf_rounds` where `team_id = teamId`, `status='completed'`, `is_test=false`, `round_date >= since`, then `isCountableRound` (every declared hole scored: front and back nine for 18, `src/lib/golf/round-countable.ts:112-139`).
- Field (`field.ts:67-94`): group by (team, day, `course_id`). Keep groups with **3 or more distinct players** (`FIELD_MIN_MEMBERS`, `:22`). Per round: `per18 = score_to_par × 18 / holes`. `field_mean` = mean over the group's rounds, **the player's own included**. `relative = per18 − field_mean` (positive is worse). `field_n` counts distinct players, the player included.
- It does **not** use other teams' rounds. It needs teammates on the same course the same day, with `team_id` and `course_id` set and holes scored.
- Mock check: "76 (+4) … field +6.4 … −2.4" is internally right (4 − 6.4). But the mock's mean excludes Eli (dots 3, 5, 7, 8, 9 average 6.4) and calls the 5 "teammates who played". Real `field_n = 5` means Eli plus 4. With Eli plus those 5, real `field_n` is 6 and the mean is 6.0, so relative is −2.0.
- "A hard day for everyone": no rule exists. `FIELD_DAY_LABEL` is "Relative to the team on the day" (`field.ts:24`). Calling a day hard needs a reference (the team's usual to par), which nothing computes. Use the label and the numbers.
- Which round: "last round" must be the newest round **in a field**, or the card hides. A newest round that is total-only or played alone has no entry.
- Window: pass `since = seasonStartDate(now, tz)`.
- RLS: a player may read teammates' rounds (`golf_rounds_select`, `is_golf_team_player`, `supabase/migrations/20260527000000_prod_public_baseline.sql:19518`), so the read works in either session. Decision 4 is kept by what the page draws: player sees `field_n` and `field_mean` only, **no per-teammate dots**.

### 7. Your plan for Eli (coach only)

- Table `golf_coach_player_intent`: `coach_id`, `player_id` (primary key on both), `narrative_goal` (breakout / maintain / bubble / develop / rehabilitate), `alert_posture` (aggressive / balanced / conservative / silent), `highlight_categories text[]`, `notes`, `updated_at` (`supabase/migrations/20260527000000_prod_public_baseline.sql:9148-9158`).
- Words: `NARRATIVE_GOAL_PRESENTATION` labels Bubble, Maintain, Develop, Breakout, Rehab (`src/lib/coachhelm/v3/intent/types.ts:43-53`). Do not use its emoji or pill classes.
- RLS `intent_coach_only`: `coach_id = current_coach_id()` for every command (`baseline.sql:19912`). The player cannot read it. It is **per coach**: an assistant coach sees only their own row, not the head coach's. "Only you" is literally true.
- Clubhouse reads only `notes` today (`data/roster.ts:373-388`). The file needs `narrative_goal`, `alert_posture`, `highlight_categories` and `notes` with the session client.
- `loadIntent` returns a made-up default (develop, balanced) when there is no row (`src/lib/coachhelm/v3/intent/loader.ts:60-70`). Do not use it here: with no row, show "Not set".
- `alert_posture` changes what reaches the player (`ALERT_POSTURE_MULTIPLIER`, `types.ts:32-37`). "Silent" means no reads surface for that player. Worth one line on the card.

### 8. Track record with Eli (coach only)

- The existing Track record (`data/coachhelm-track-record-shape.ts`) is a different thing: whether reads **held** when rechecked, by claim level, team-wide, from `golf_coachhelm_shown_reads` (applied 2026-10-21). It does not answer "did the focus work".
- The design's "3 focuses assigned / 2 improved / 1 no change" and the rows can come from `golf_player_focus_areas` for the player with `created_at >= season start`:
  - assigned = count of rows (`assigned_by` tells coach from engine or player);
  - improved / no change / got worse = `verdict->>'word'` when present (measured), else `outcome_status` (coach's call, say so);
  - the row line "1 in 7 → 1 in 9 · Sep" = `baseline_value` → `current_value` (or the verdict's `post.value`), month of `completed_at`.
- The other ledger the brief names: `golf_insight_action` holds `create_focus`, `acknowledged`, `dismissed`, `resolved` (`development.ts:1713`, `insights-feed.ts:574/656/849`, `intelligence-dashboard.ts:669/762`). There is no "accepted" action; acceptance is on the focus area. `golf_insight_outcome` is written only by the causality cron with `improvement` (lift, positive = worked) (`src/app/api/cron/v3/causality-attribute/route.ts:734-743`). Both have `player_id`, so "reads shown / acted on / improved" per player is countable (query 9).
- Visibility: RLS lets the player read their own focus areas, actions and outcomes. "Coach only" is a page rule.
- Mock rows ("Lag putting from 30 ft", "Wedge distance control") are sample data.

### 9. The evidence sheet

| Part | Source | Verdict |
|---|---|---|
| The comparison (You / Team / Tour bars) | You and Tour from `ChHelmGauge`; Team from standing as in section 1 | Team needs the join and the floor |
| "Penalties in the last 10 rounds" strip | `ChDiveRounds.strip` exists but is **score to par per 18** (`coachhelm-dive-shape.ts:274-278`), and empty under 3 rounds | Mislabelled. Per-round penalties exist as `golf_rounds.total_penalties` and `golf_round_stats_cache.penalty_strokes`; reading them for `source_round_ids` is a new read, no migration. Or relabel the strip "Score to par". |
| "Sep 6 … Oct 26" | First and last of `ChDiveRounds.list` (newest 8 shown, `DIVE_ROUNDS_SHOWN`) | Real; the mock says 10, the shape shows 8 |
| Where it happened: "Oct 12 · 7", "Oct 19 · 14", "Oct 26 · 3" | `ChDiveWhere.holes`: round date, course, hole number from the stored counted sequence (`evidence.cause.example_holes`, up to 5, `coachhelm-dive-shape.ts:438-500`) | Date and hole are real. The line is **the same counted path on every hole** (`seq.what`, e.g. "tee shot right into water → penalty", `src/lib/coachhelm/v3/engine/root-cause.ts:536-549`). "drop, bogey 5", "re-tee, double 6" and club names per hole have no source. |
| "9 of 23 penalties" | `ChDiveWhere.counted` = occurrences "of your" denominator + population ("penalty strokes", `root-cause.ts:215-221`) | Real wording is "9 of your 23 penalty strokes" |
| "on holes with trouble right" | Nothing stores hazard side | No source; drop |
| "21 rounds · All rounds · Seen repeatedly · as of Oct 30" | sample, window, firmness, `asOf` | Real |
| Is this right? Not this / Wrong cause / Already working on it | `coachhelm-corrections.ts`, flag `coachhelm_corrections_v1` | The coach board reads corrections for top cards only (`data/coachhelm.ts:593`); the coach Deep dive does not (`data/coachhelm-player.ts:219-232`). The file loader must call `readCorrections` with `role: 'coach'`. |

**Bug for the file:** the coach Deep dive reads rounds for `source_round_ids` only (`data/coachhelm-player.ts:224`). The player's adds `exampleRoundIds` (`data/coachhelm-dive.ts:156`). On the coach's file, a hole whose round is not among the source rounds is silently dropped. Add `exampleRoundIds` to the coach read.

### 10. Header, list and words

- "Junior · Last round Oct 26, 5 days ago": `coachHeadLine` (`data/coachhelm-views-shape.ts:119-130`) from `classYearLabel` and the newest completed, non-test round (`data/coachhelm-player.ts:76-83`). Note "days ago" counts UTC days, not the team's.
- "21 rounds" in the header: not in the head line. Closest is `ChStanding.rounds` (stats-cache `rounds_played`, all time). Label it "on file".
- "refreshed Oct 30" (player): `ChStanding.refreshed`, team zone (`coachhelm-standing-shape.ts:280-285`), or the read's `asOf`.
- List rows: name, top read title, stance chip (`ChCoachPlayer.top`, `sortCoachPlayers`, `coachhelm-shape.ts:410-414`). "3 players have an open signal": `playersLine` (`:421-424`).
- "No reads yet: 3 more rounds": `roundsToGo` exists but is private and only on the player's board (`data/coachhelm.ts:99-122`). The coach board has names only (`withoutNames`). Export it or drop the count.
- "From Coach Reyes": `ChProposal` carries `coachUserId` only (`coachhelm-shape.ts:159`). The name needs one read of the coach by `golf_player_focus_areas.coach_id`.
- "Top of your game this week": the reads are lifetime, not this week. Say "Top of your list".
- "Varsity", "Head coach · Varsity": no source (as in the sibling package).

### 11. The lens ("As Eli sees it")

The design says the lens draws the player components "from the data the coach's page already loaded, minus the coach-only fields". That is not faithful enough:

- The coach feed and the player feed differ. The player feed drops the player's own dismissals, folds overlapping reads and holds 3 + 1 (`insight-delivery.ts:800-827`). The coach feed does none of that. A lens built from coach data can show reads the player never gets.
- The coach mapping carries coach-only parts: `engine.support` (the ladder), an inferred cause marked Likely, `coach_copy` voice, `declined`. Re-mapping with `viewer: { role: 'player' }` drops the ladder and the inferred cause (`coachhelm-engine-shape.ts:248-249, 287`).
- Do one of these:
  1. **Faithful:** server-side, call `getInsightsForPlayer(playerId, { limit: 30, includeMore: true, drawnLater: () => Promise.resolve([]) })` and map with the player viewer. The empty `drawnLater` is required: without it the call writes `player_feed` exposure rows (`insight-delivery.ts:818-824`) and every coach preview fakes "Seen". `readLadderReads` already does this (`data/coachhelm-standing.ts:97`).
  2. **Cheap:** reuse the coach rows, run `projectInsightsForPlayer` (`src/lib/coachhelm/delivery/player-projection.ts:19-45`), drop the player's dismissed ids (`loadPlayerDismissed`; the coach may read them, `ipf_coach_select_team`), re-map with the player viewer, then apply `partitionInsights`. Label it "Close to what Eli sees".
- The lens is shown to the coach only, so nothing here leaks to the player.

### 12. Page v3 states (Early, Empty, No field, No plan, plan sheet)

Page v3 adds a state switch. Each state checked against the code:

- **The round floor is 4, not 3.** `roundsToGo` (`data/coachhelm.ts:99-122`) is the coach floor (`min_rounds_for_signal`) raised to at least `ABSOLUTE_MIN_ROUNDS = 4` (`src/lib/coachhelm/v2/mining/pattern-miner.ts:174`, `resolveMinerWindows` `:354-364`). It subtracts the countable rounds inside the lookback window: 90 days unless the coach set `pattern_lookback_days` (`WINDOW_DAYS`, `:165`). It is private today.
  - Early's "No read yet (2 of 3)", "2 of 3 rounds" and "one more full round" are wrong. With 2 countable rounds the floor leaves at least 2 to go. Total-only rounds count as 0, so on staging it says 4 or more.
  - Empty's "reads start after 3 full rounds" is wrong for the same reason: say "after 4 full rounds", or use `roundsToGo`.
  - Empty's "The season started Aug 1" pairs a season date with a count that is not by season. The count is a 90-day window, and the reads and Standing are lifetime. Drop the season line, or say "in the last 90 days".
- **A total-only round is not countable.** `roundExclusionReason` (`src/lib/golf/round-countable.ts:120-139`) returns `holes_missing` when the recorded holes are not equal to `holes_played`. Recorded holes means `recorded_holes`, or else 9 each for `front_nine` and `back_nine` (`:112-117`). A round with only `total_score` fails. A total with both nines filled in passes. Query 14 says which kind staging has.
- **The Early field card cannot draw from totals.** `loadTeamFieldRounds` (`src/lib/coachhelm/v3/field-day/loader.ts:29-73`) keeps countable rounds only. So "the field card still works from totals" (Sep 26, field of 4) is not true of total-only rounds. Either the Early card is dropped, or the rounds need their nines.
- **Early "strokes gained shows —" and "No reads yet" may not match staging.** Standing and the reads are all time (season table held, section 3). Staging has summer hole rounds with SG, so Standing may show SG values and summer reads may exist. Queries 2 and 4 settle it. The Early state is a fixture shape, not staging's.
- **The Early header "2 rounds · since Aug 1" has no source.** `coachHeadLine` (`data/coachhelm-views-shape.ts:119-130`) says when the newest round was, not a season round count. Fix: count the player's completed rounds since `seasonStartDate` (`data/season.ts:68`) in a new read of `golf_rounds`, or drop it.
- **"Level with the field" and "Better than the field" have no rule.** `buildFieldDayContext` (`src/lib/coachhelm/v3/field-day/field.ts:67-94`) gives the numbers and a label (`:24`), not a verdict word. Fix: set a band in the page (for example within 1.0 stroke is "Level with"), and say it is the page's rule. Or show only "−0.8 vs the field".
- **No plan.** "Treats Eli as Develop, Balanced" matches the engine defaults (`src/lib/coachhelm/v3/intent/types.ts:43-53`). But `loadIntent` makes up a default row when there is none (`src/lib/coachhelm/v3/intent/loader.ts:60-70`). So the page cannot tell "not set" from "set to Develop". The page must read `golf_coach_player_intent` itself and check that a row exists (query 8).
- **"Set a plan" and the plan sheet write through `setIntent`** (`src/app/golf/actions/v3/intent.ts:100`). That write already exists and the coach-only RLS holds. No migration.
- **Unnamed dots for the player.** Page v3's decision 4 says "the player sees the field's average and unnamed dots". Nick said yes to that text. In a field of 3 to 5 teammates, a player can still match the dots to people, since teammates can read each other's rounds (`baseline.sql:19518`). This is a risk for Nick to decide, not a rule broken. The safe choice is the mean only for the player, and dots for the coach.


---

## Visibility, figure by figure

"Server" means the delivery layer or the page keeps it from the player; RLS would let the player read the row.

| Figure | Coach | Player | Table and RLS | Enforced by |
|---|---|---|---|---|
| Read: title, value, sample, window, read word | Yes | Yes | `golf_coach_insights`: coach via team, player own (`baseline.sql:18546, 18552`) | RLS |
| Claim ladder word (Seen repeatedly …) | Yes | Never | `evidence.ladder`, `support` on the same row; player can read the row | Server: `projectInsightsForPlayer` (`player-projection.ts:19-26`) and `supportOf` (`coachhelm-engine-shape.ts:248-249`). Verified. |
| Inferred cause (Likely) | Yes | Never | `evidence.cause` | Server: `causeOf` (`coachhelm-engine-shape.ts:273-287`) |
| Team figure, closes to team | Yes | Yes, average only | `golf_player_standing` (read with the service client; player id is the only scope, `coachhelm-standing.ts:168-170`) | Server |
| Teammate names or scores | Yes | Never | `golf_rounds` is readable by teammates (`baseline.sql:19518`) | Page: field dots coach-only |
| Focus: Suggested, Accepted | Yes | Yes | `golf_player_focus_areas`: player own, coach team | RLS |
| Seen | Yes | Not drawn | `golf_insight_exposure`: coach team, player own (`20260621160000_insight_event_ledger.sql:57-69`) | Page |
| Goal and check-ins | Only coach-made or shared goals | Own | `golf_goals`: `goals_coach_view` = coach-made or `shared_with_coach` (`baseline.sql:18708`) | **RLS bypassed today**: loaded with the service client and no share filter (`src/lib/coachhelm/v3/goals/loader.ts:19-38`). Filter `creator_role='coach' or shared_with_coach` for a coach viewer. |
| Field day | Mean and dots | Mean only | `golf_rounds` | Page |
| Dismissed reads, Undo | Yes | Never | `golf_coach_insights.status='dismissed'`; player can read own | Server: new read for the coach only |
| Coach's plan (intent) | Own row only | Never | `golf_coach_player_intent`: `intent_coach_only` (`baseline.sql:19912`) | RLS. Verified. |
| Track record with this player | Yes | Never | focus areas, `golf_insight_action`, `golf_insight_outcome`: all player-readable own | Page |
| Practice reviews marked coach-visible | Yes | Yes (their own) | Not touched by this design | — |

---

## No source (fix for each)

| On the design | Fix |
|---|---|
| "Team 0.7" in the read itself | Join `golf_player_standing.team_avg` (section 1). "—" under 5 teammates. |
| "0.4 strokes a round" with those inputs | Formula gives 0.6. Fix the mock. |
| "Keep the ball in play off the tee" (focus title) | Use the focus area's `title` (the read's title). |
| "Penalty strokes are your biggest leak", "Top of your game this week" | Relabel: read title; "Top of your list". |
| "Started at 1.4 · … Oct 4" under "Focus since Oct 24" | Start the line at the focus's `started_at`, or at the goal's `started_at`, and name which. |
| "2 of 3 sessions" | "2 sessions logged" if the practice table is live; otherwise drop. Nothing stores "3". |
| "Season · 14 rounds" on Where the strokes go | "All time" until the season table is applied. |
| SG legs vs the team | Expose `vsTeam` for the four SG rows in the standing shape. No new read. |
| "and the penalties are most of it" | Drop. |
| "31 ft vs team 26 ft", "team 1 in 12", "team 49%", "team +0.31" | Use `gauge.cmp`, or a standing `team_avg` where the metric has a row; three-putts and up-and-down have none. |
| "Approach from 125 to 150 yds" | "125 to 175 yd". |
| "A hard day for everyone" | Drop the verdict word, or add a rule later. Keep "Relative to the team on the day" with the numbers. |
| "The 5 teammates who played averaged +6.4" | "{field_n − 1} teammates played; the field, you included, averaged …". |
| "Penalties in the last 10 rounds" | New read of `golf_rounds.total_penalties` for the rounds, or relabel the existing to-par strip. Show 8, as the shape does. |
| Per-hole lines ("drop, bogey 5", club per hole), "trouble right" | Show date · course · hole and the one counted path. Drop the rest. |
| "Aim / Alerts / Watching / Note" with no intent row | "Not set". Never the loader's default. |
| Track record rows' "Improved" | Verdict word, else "Coach marked improved". |
| "No reads yet: 3 more rounds" on the coach list | Export `roundsToGo`, or say "No reads yet". |
| "From Coach Reyes" | One read of the coach's name. |
| "Varsity" | Drop (no source anywhere). |
| "2 of 3 rounds", "one more full round", "after 3 full rounds" (v3 Early, Empty) | Export `roundsToGo` (floor at least 4) and use its number. |
| "The season started Aug 1" with the round count (v3 Empty) | Drop, or "in the last 90 days". |
| "2 rounds · since Aug 1" (v3 Early header) | New read: completed rounds since `seasonStartDate`. Or drop. |
| "Level with the field", "Better than the field" | A band set in the page and named as the page's rule, or numbers only. |
| Early field card "works from totals" | Drop. A total-only round is not countable and makes no field. |

---

## Staging spot checks (SELECTs for the Mac to run)

Not run from here. Run each on `ybmwektreyrwjscxlogv`, read-only. Team id `6ecdd1a6-63fe-4beb-b094-00118f334163`. Season start is `2026-08-01` in America/New_York.

**1. Team, zone and players with their lifetime cache**

```sql
select t.name, t.gender, s.timezone, s.sg_baseline
from golf_teams t left join golf_team_settings s on s.team_id = t.id
where t.id = '6ecdd1a6-63fe-4beb-b094-00118f334163';

select p.id, p.first_name||' '||p.last_name as who, m.status,
       c.rounds_played, c.penalty_strokes_per_round, c.up_and_down_percentage,
       c.three_putt_percentage, c.last_round_date
from golf_team_members m
join golf_players p on p.id = m.player_id
left join golf_player_stats_cache c on c.player_id = p.id
where m.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
order by p.last_name;
```

Look for: 5 active players. `rounds_played` is the "21 rounds" figure. Expect about a dozen each (summer hole rounds plus the two qualifiers, if the cache counts total-only rounds).

**2. Reads each player has, by state**

```sql
select p.first_name||' '||p.last_name as who, i.status, i.lifecycle_state, count(*)
from golf_coach_insights i join golf_players p on p.id = i.player_id
where i.player_id in (select player_id from golf_team_members
                      where team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' and status = 'active')
  and (i.engine_version = 'v3' or i.signature like 'v3:%')
group by 1, 2, 3 order by 1, 2, 3;
```

Look for: rows with `lifecycle_state in ('detected','matured','addressed','resolved')` and `status <> 'dismissed'` are what the file draws. `status = 'dismissed'` rows are the Undo list. Zero rows means every card shows its empty state.

**3. The top reads' evidence (comparison, window, ladder, cause, closes)**

```sql
select p.last_name, i.id, i.title, i.category, i.priority, i.created_at::date,
       i.evidence->>'metric' as metric,
       i.evidence->>'your_value' as you,
       i.evidence->>'comparison_source' as cmp_source,
       i.evidence->>'comparison_value' as cmp,
       i.evidence->>'secondary_value' as sec,
       i.evidence->>'sample_n' as n,
       i.evidence->>'window_basis' as basis,
       i.evidence->>'confidence' as conf,
       i.evidence->>'ladder' as ladder,
       i.evidence->'cause'->>'state' as cause_state,
       jsonb_array_length(coalesce(i.evidence->'cause'->'example_holes','[]'::jsonb)) as example_holes,
       jsonb_array_length(coalesce(i.evidence->'source_round_ids','[]'::jsonb)) as source_rounds,
       i.evidence->'counterfactual'->>'strokes_saved_per_round' as tour_gap,
       i.outcome_status
from golf_coach_insights i join golf_players p on p.id = i.player_id
where i.player_id in (select player_id from golf_team_members
                      where team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' and status = 'active')
  and (i.engine_version = 'v3' or i.signature like 'v3:%')
  and i.lifecycle_state in ('detected','matured','addressed','resolved')
  and i.status <> 'dismissed'
order by p.last_name, i.priority, i.created_at desc;
```

Look for: `cmp_source` (`pga_baseline` means no team tick in the read); `basis = 'lifetime'` means "All rounds"; `ladder` null means the coach sees the read word, not a ladder word; `example_holes = 0` means no "Where it happened"; `outcome_status` null means no "Improved" chip from that column.

**4. Team figures in Standing (penalties and the four SG legs)**

```sql
select p.last_name, s.metric_id, s.player_value, s.team_avg, s.team_n, s.pga_value, s.computed_at
from golf_player_standing s join golf_players p on p.id = s.player_id
where s.player_id in (select player_id from golf_team_members
                      where team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' and status = 'active')
  and s.metric_id in ('penalty_rate_per_round','sg_ott','sg_approach','sg_around_green','sg_putting')
order by s.metric_id, p.last_name;

select to_regclass('public.golf_player_standing_season') as season_table;
```

Look for: `team_n = 5` on a metric means the Team figure draws for it; under 5 it shows "—". `season_table` null confirms the "All time" label.

**5. Focus areas and the handshake**

```sql
select p.last_name, f.id, f.title, f.status, f.assigned_by, f.from_insight_id,
       f.created_at at time zone 'America/New_York' as suggested,
       f.started_at at time zone 'America/New_York' as accepted,
       f.baseline_value, f.current_value, f.target_value,
       jsonb_array_length(f.snapshots) as checkins,
       f.outcome_status, f.verdict->>'word' as verdict
from golf_player_focus_areas f join golf_players p on p.id = f.player_id
where f.player_id in (select player_id from golf_team_members
                      where team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163')
order by f.created_at desc;
```

**6. Seen: first player-feed exposure after each suggestion**

```sql
select f.id as focus_id, f.status,
       f.created_at at time zone 'America/New_York' as suggested,
       min(e.shown_at) at time zone 'America/New_York' as seen
from golf_player_focus_areas f
left join golf_insight_exposure e
  on e.insight_id = f.from_insight_id and e.player_id = f.player_id
 and e.surface = 'player_feed' and e.shown_at >= f.created_at
where f.player_id in (select player_id from golf_team_members
                      where team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163')
  and f.from_insight_id is not null
group by f.id, f.status, f.created_at;

select e.surface, (e.coach_id is null) as no_coach, count(*), min(e.shown_at)::date, max(e.shown_at)::date
from golf_insight_exposure e
where e.player_id in (select player_id from golf_team_members
                      where team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163')
group by 1, 2 order by 1, 2;
```

Look for: `seen` null means "Not yet". The second query shows whether `roster_card` rows with no coach exist, which is why the filter is on surface.

**7. Goals, and which ones a coach may see**

```sql
select p.last_name, g.id, g.metric_id, g.title, g.state, g.creator_role, g.shared_with_coach,
       g.started_at::date, g.ends_at::date, g.baseline_value, g.current_value, g.target_value,
       jsonb_array_length(g.snapshots) as checkins,
       (g.creator_role = 'coach' or g.shared_with_coach) as coach_may_see
from golf_goals g join golf_players p on p.id = g.player_id
where g.player_id in (select player_id from golf_team_members
                      where team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163')
order by p.last_name, g.created_at desc;
```

Look for: any `state in ('active','achieved')` row with `coach_may_see = false`. That is the goal the coach's Deep dive shows today against RLS.

**8. Coach intent for these players**

```sql
select p.last_name, c.full_name as coach, i.narrative_goal, i.alert_posture,
       i.highlight_categories, left(i.notes, 60) as note, i.updated_at::date
from golf_coach_player_intent i
join golf_players p on p.id = i.player_id
join golf_coaches c on c.id = i.coach_id
where i.player_id in (select player_id from golf_team_members
                      where team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163');
```

Look for: no rows means "Not set" on every file.

**9. Per-player ledger this season (shown, acted on, improved)**

```sql
with team as (select player_id from golf_team_members
              where team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' and status = 'active'),
since as (select timestamptz '2026-08-01 00:00 America/New_York' as t)
select p.last_name,
  (select count(distinct e.insight_id) from golf_insight_exposure e, since
    where e.player_id = p.id and e.surface = 'player_feed' and e.shown_at >= since.t) as reads_shown,
  (select count(*) from golf_insight_action a, since
    where a.player_id = p.id and a.created_at >= since.t) as actions,
  (select string_agg(distinct a.action_type, ', ') from golf_insight_action a, since
    where a.player_id = p.id and a.created_at >= since.t) as action_types,
  (select count(*) from golf_insight_outcome o, since
    where o.player_id = p.id and o.measured_at >= since.t and o.improvement > 0) as improved,
  (select count(*) from golf_player_focus_areas f, since
    where f.player_id = p.id and f.created_at >= since.t) as focuses
from golf_players p join team on team.player_id = p.id
order by p.last_name;
```

**10. Field day: would any round this season make a field?**

```sql
with r as (
  select r.id, r.player_id, r.team_id, r.course_id, r.course_name, r.round_date, r.score_to_par,
         coalesce(r.holes_played, 18) as holes, r.total_score, r.front_nine, r.back_nine,
         (case when r.front_nine is not null then 9 else 0 end
          + case when r.back_nine is not null then 9 else 0 end) as recorded
  from golf_rounds r
  where r.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
    and r.status = 'completed' and r.is_test = false
    and r.round_date >= '2026-08-01')
select round_date, course_id, course_name,
       count(*) as rounds, count(distinct player_id) as players,
       count(*) filter (where recorded = holes and holes in (9,18) and score_to_par is not null) as countable,
       count(*) filter (where front_nine is null and back_nine is null) as total_only,
       round(avg(score_to_par * 18.0 / holes) filter (where recorded = holes), 2) as field_mean_per18
from r group by round_date, course_id, course_name order by round_date desc;
```

Look for: a field needs `countable` rows from 3 or more distinct players on one day and course. Expect the Sep 25–26 qualifiers to show `total_only = rounds` and `countable = 0`. Also check `course_id` is not null. Drop the date filter to see whether the summer rounds made fields (they would be last season's).

Rounds with no `team_id` cannot join a field:

```sql
select count(*) filter (where team_id is null) as no_team, count(*) filter (where course_id is null) as no_course, count(*)
from golf_rounds
where player_id in (select player_id from golf_team_members
                    where team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163')
  and status = 'completed' and is_test = false;
```

**11. Per-round penalties exist for the strip?**

```sql
select p.last_name, r.round_date, r.total_penalties, sc.penalty_strokes
from golf_rounds r join golf_players p on p.id = r.player_id
left join golf_round_stats_cache sc on sc.round_id = r.id
where r.player_id in (select player_id from golf_team_members
                      where team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163')
  and r.status = 'completed' and r.is_test = false
order by p.last_name, r.round_date desc limit 40;
```

If `golf_round_stats_cache` has no `round_id` column, drop that join and keep `total_penalties`.

**12. Objects the cards depend on**

```sql
select to_regprocedure('public.golf_coachhelm_shown_reads(uuid, timestamptz)') as shown_reads_fn,
       to_regclass('public.golf_focus_area_practice_sessions') as practice_sessions,
       to_regclass('public.golf_focus_area_criteria') as practice_criteria,
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'golf_player_focus_areas'
           and column_name in ('verdict','assigned_by','criterion')) as verdict_cols;
```

**13. Player dismissals the coach feed would still show (lens drift)**

```sql
select p.last_name, f.insight_id, f.rating, f.created_at::date
from golf_insight_player_feedback f join golf_players p on p.id = f.player_id
where f.player_id in (select player_id from golf_team_members
                      where team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163')
order by f.created_at desc;
```


**14. Which of this season's rounds are countable (Early state, field card, rounds to go)**

```sql
select p.last_name, r.round_date, r.course_id, r.holes_played, r.total_score,
       r.front_nine, r.back_nine,
       (select count(*) from golf_holes h where h.round_id = r.id and h.score is not null) as holes_scored,
       (r.front_nine is not null and r.back_nine is not null) as nines_filled
from golf_rounds r join golf_players p on p.id = r.player_id
where r.player_id in (select player_id from golf_team_members
                      where team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163')
  and r.status = 'completed' and r.is_test = false
  and r.round_date >= current_date - 90
order by r.round_date desc, p.last_name;
```

A round counts only when its nines (or its recorded holes) cover `holes_played`. Rows with `nines_filled = false` count as 0 toward "rounds to go" and make no field. If no row in the last 90 days is countable, every player shows "No reads yet" with 4 or more to go.

---

## What staging will show

Predicted from the code and the sibling package's staging facts (5 active players: Owen Carter, Jackson Hale, Tyler Hayes, Ethan Park, Mason Rivers; summer hole rounds from last season; two total-only qualifiers each on Sep 25–26; one coach, "Coach (Demo)"). Queries 1–14 confirm or correct it.

| Card | Staging | Design state it maps to |
|---|---|---|
| List | 5 rows, real names. Rows with no read say "No reads yet" | The list; the Sam Whitfield row |
| Top read | Only if summer v3 reads exist (query 2). Then: lifetime, "All rounds", about a dozen rounds, and not out of date (the qualifiers are not countable, so the newest countable round is from the summer). No ladder word unless the support pass ran there (query 3). | Stage 0 feature card, with "Solid/Early read" for the coach |
| Team figure | Only on metrics where all 5 players have a value (query 4) | "—" plus the 5-teammate note; not drawn on the page |
| Closes | Anchored to the team or the Tour by the rule in section 1 | Not drawn for the Tour case |
| Plan: handshake | No focus areas expected (query 5): "No focus yet" | Stage 0 |
| Plan: goal line | No goals expected (query 7) | Not drawn; needs an empty state |
| Plan: drill | Only if the read has an attached drill | Not drawn without one |
| Where the strokes go | "All time"; SG values likely shown from the summer hole rounds (query 4); vs-team bars only where `team_n = 5` | Not Early's "—". Needs an "All time" label and a no-team state |
| Early / Empty count | "No reads yet" with 4 or more to go (floor 4, 90-day window; total-only rounds count 0) | Not "2 of 3" or "after 3 full rounds" |
| All reads | Whatever query 2 returns; Undo list likely empty | No empty state drawn |
| Field day | Hidden if the qualifiers have no nines (query 14): not countable, so no field | Page v3 "No field" state. Not the Early card, which draws from totals |
| Your plan for Eli | "Not set" (query 8) | Not drawn; needs "Not set" |
| Track record | Nothing this season (query 9) | Not drawn; needs "No focus assigned this season" |
| Evidence sheet | Comparison and rounds list if reads exist; strip empty under 3 listed rounds; "Where it happened" only with counted holes, which needs shot data | Partial |
| Lens | Same cards in player voice; no ladder words | As designed |

---

## Mock vs real

- **Names.** Eli Brandt, Jonah Okafor, Priya Natarajan, Theo Marchetti, Sam Whitfield and Maya Reyes come from the Clubhouse preview fixtures (`preview/fixtures-roster.ts:12` and the CoachHelm fixtures). None exists on staging.
- **Penalty read.** The fixtures have a counted penalty path ("5 of 7 penalties … over 4 rounds", `preview/fixtures-coachhelm-path.ts:41`) and a 21-round sample (`:126`). The design's "9 of 23" is not in them.
- **"Lonnie Poole", "Oct 26".** Lonnie Poole is a fixture course (`preview/fixtures-calendar.ts:68`). The field figures are invented but shaped like `FieldDayEntry`, except the mean excludes the player.
- **"Breakout" and the note "Pairs well with Jonah".** Sample. The note names a teammate, which is fine because the card is coach only.
- **Track record rows, "Fairway finder", "Fairways hit on par 5s".** Sample.
- **Counts.** "4 open · 1 dismissed" and "3 reads" are sample and do not follow the Board's 3 + 1 rule for the player.

## Bugs and gaps for the builder

1. **Goals reach the coach without the share check** (`src/lib/coachhelm/v3/goals/loader.ts:19-38`, used by `data/coachhelm-dive.ts:62-63` for the coach at `data/coachhelm-player.ts:194`). The file says RLS handles it; the service client skips RLS. Filter for a coach viewer.
2. **Coach Deep dive drops example holes** (`data/coachhelm-player.ts:224` reads no `exampleRoundIds`).
3. **Coach Deep dive reads no corrections** (`data/coachhelm-player.ts:219-232`).
4. **Closes uses a team average under the 5-teammate floor** (`src/lib/coachhelm/v3/themes/assemble.ts:108-125`). Label rule in the page, as in section 1.
5. **The lens must not write exposure** (`drawnLater: () => Promise.resolve([])`).
6. **Seen must filter `surface = 'player_feed'`**, never `coach_id is null`.
7. **`loadIntent`'s default row** must not be shown as the coach's plan.
8. **`coachHeadLine` counts days in UTC** (`data/coachhelm-views-shape.ts:124-125`), so after 8 PM Eastern "5 days ago" can be off by one.
9. **The "No plan" state must read the intent row itself** (`src/lib/coachhelm/v3/intent/loader.ts:60-70` fills in a default). `setIntent` (`src/app/golf/actions/v3/intent.ts:100`) already covers "Set a plan".
10. **Nothing here changes what shot tracking collects.** Every fix above is a read, a label or a shape change; none needs a migration.
