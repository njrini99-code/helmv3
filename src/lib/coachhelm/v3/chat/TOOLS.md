# CoachHelm chat tools: inventory and the new list

Written before the rebuild's tools were built, so a reviewer can check that nothing a coach could ask before is lost.
"Screen loader" is the function under `src/clubhouse/data` the Clubhouse screen calls for the same figure. The chat
library may not import `src/clubhouse`, so the route hands those loaders in (`screen-loaders.ts`).

## 1. What exists today

Source of a figure: **screen** = the Clubhouse loader, injected; **adapter** = Stats' calculation through an adapter
written for Ask (`loadPlayersFigures`, `loadPlayerPuttBands`, `loadTeamStrokesGained`); **cache** =
`golf_player_stats_cache`; **own** = computed inside the chat library; **rows** = rows handed to the model.

### Reads, coach (Ask tab; quick chat and the practice helper get the same reads)

| Tool | Question it answers | Figure comes from | Screen loader for the same figure |
|---|---|---|---|
| find_player | which roster player is "Eli" | roster in context | none needed: the roster is in the prompt |
| get_team_overview | how many players, who has rounds | own, `golf_rounds` paged | Team Stats `loadTeamStats` (activeCount, grid rounds) |
| get_player_metrics | one player's stats for a window | adapter for scoring, putts, greens, fairways, SG; cache for putt makes, scrambling, sand saves, three-putts, penalties | Stats `loadPlayerProfile` (`comparisons`, `win`) |
| compare_players | 2 to 6 players side by side | same split | `loadPlayerProfile` per player |
| get_team_metric_ranking | rank the roster on one metric | adapter or mean of cache values | Team Stats `loadTeamStats` (`grid`) |
| get_player_weakest_areas | where a player trails the team | adapter + cache, own peer mean | `loadPlayerProfile` (`comparisons`: you, team, Tour) |
| get_player_trend | round by round on one metric | own, newest N full rounds, practice NOT excluded | `loadPlayerProfile` (`rounds`, `extra.series`) |
| get_recent_rounds | a player's last N rounds | adapter round ids, then rows | `loadPlayerProfile` (`rounds`) |
| get_round_stats | per-round stats for a player | rows from `golf_round_stats_cache` | `loadPlayerProfile` (`rounds`) |
| get_putting_distance_profile | make rate by distance, one player | adapter (Stats' bands) | `loadPlayerProfile` (`puttBands`) |
| get_shot_pattern | misses, lies; mode putting | own, `golf_shots`, last N days | approach: none with free bands; putting: `puttBands` |
| get_proximity_by_band | distance left by approach band | own, last N days | `loadPlayerProfile` (`extra.approach`) for Stats' bands |
| get_team_putting_profile | team putting by distance | own, rounds x 7 days | Team Stats `loadTeamStats` (`putting`) |
| get_team_strokes_gained | team SG by area | adapter | Team Stats `loadTeamStats` (`legTotals`, `figures`) |
| get_team_rounds | team rounds and averages by type | own, `.limit(600)` per slice | Rounds `loadTeamRounds` |
| get_season_scoring | scoring this season, team and players | own copy of Roster's rule (parity test) | Roster `loadRoster` (`players[].avg`, `teamAvg`) |
| compare_seasons | this season against last | own | none |
| get_round_detail | one round hole by hole | own, `golf_rounds` + `golf_holes` | Round `loadRoundReview` (not injected yet) |
| get_course | a course's holes with team scoring | own | none: the Course page's `loadCourseHistory` is one player's history at a course (a player id, the Rounds page's course key and a window), and no screen draws the team's scoring by hole for a course id. It stays the chat's own read, inside `get_reference` topic course |
| get_qualifiers | qualifiers and standings | own second implementation of the board (`rankStandings`) | Qualifiers `loadQualifierList`, `loadQualifierDetail` (`board`) |
| get_qualifier_entries | who entered which qualifier | rows | `loadQualifierDetail` |
| get_tournaments, get_tournament_notes | tournaments, results, notes (flag `golf_tournaments_v1`) | own, stored results | Tournaments `loadTournamentsHome` (injected as `ScreenLoaders.tournaments`; notes stay a direct read) |
| get_benchmarks | level, team average and Tour for a metric | `golf_pga_standards`, `golf_player_standing.team_avg` (a third team average) | `loadPlayerProfile` (`comparisons.team`, `.bench`) |
| get_metric_definitions, get_golf_reference | what a stat means; golf knowledge | catalogue, generated reference | none |
| get_player_insights, get_root_causes, get_team_patterns | CoachHelm's open signals and causes | direct | none (events of the engine, not screen figures) |
| get_focus_areas, get_focus_practice, get_goals | focus areas, their practice, goals | direct | none |
| get_open_tasks | outstanding tasks | direct | none |
| get_upcoming_events, get_calendar, get_class_times, get_team_travel, get_attendance_summary | schedule, replies, classes, trips, attendance | direct, own sums | none (allowed: events, tasks, documents read directly) |
| get_practice, get_drill_bank, get_plan_format | practices, plans, drills, the plan format | direct | none |
| get_documents, get_team_season_settings | document titles; season settings | direct | none |
| query_team_data | the long tail: 22 allowlisted tables, 200 rows | rows | none |
| summarise_data | arithmetic over rows already read | server arithmetic | none |
| show_visual | a visual from reads already made | figures copied from the reads | none |

### Tasks (each shows a card first; nothing is written before Confirm)

create_recurring_practice, create_focus_area, create_task, create_team_announcement (the four on production);
create_event, create_trip, create_qualifier, create_goal, add_round_note, add_blocked_time, add_team_break,
save_team_term, set_availability_note, create_recruit, publish_artifact (Ask) / send_message (quick chat),
set_lineup and lock_lineup (flag), create_drill, publish_practice_plan.

Drafts that write nothing and hand the coach a card: draft_practice_plan, write_artifact, draft_message, draft_poll,
draft_board, ask_practice_brief; find_thread resolves a Messages thread for them.

### Player (reads only)

get_player_metrics, get_player_trend, get_putting_distance_profile, get_recent_rounds, get_shot_pattern,
get_round_detail, get_season_scoring, compare_seasons, get_focus_areas, get_upcoming_events, get_my_reads,
get_benchmarks, get_metric_definitions, get_golf_reference, summarise_data, show_visual. Every `player_id` is
overwritten with the caller's own; a round is checked for ownership; the schedule carries only the caller's reply.

### Where two readers could give two numbers (verified in code)

1. Team average, three ways: Team Stats' pooled figure; the ranking's mean of cache values; `golf_player_standing.team_avg`.
2. Putt makes, scrambling, sand saves, three-putts and penalties from the stats cache, not from what Stats draws.
3. Putting by distance, four readers and four windows.
4. `get_player_trend` keeps practice rounds; the last-10 window and `get_recent_rounds` drop them.
5. Season scoring, qualifier standings and team round averages are second implementations.
6. Audit correction: `get_qualifiers` does mark its 900-row cap as partial (`read-tools.ts`, the envelope's
   `coverage`); the audit could not confirm it.

## 2. The new list

One reader per kind of question. A figure a screen draws comes from that screen's loader for the same window; where
no screen draws it, the read is direct through the session client and says so in `source`.

### Reads

| New tool | Replaces | Source |
|---|---|---|
| get_player_stats | get_player_metrics, compare_players, get_player_weakest_areas, get_player_trend, get_recent_rounds, get_round_stats, get_putting_distance_profile, get_proximity_by_band (Stats' bands), get_benchmarks (team and Tour beside each figure), get_shot_pattern mode putting | **screen**: Stats `loadPlayerProfile`, 1 to 6 players, one window. Sections on request: rounds (the window's rounds with per-round figures), putting (bands), approach (bands), holes (toughest, opening hole, pressure). The gaps to the team are computed and ordered. |
| get_team_stats | get_team_overview, get_team_metric_ranking, get_team_strokes_gained, get_team_putting_profile, the team half of get_season_scoring | **screen**: Team Stats `loadTeamStats`: the team's figures, the per-player grid ranked on the asked column, team putting bands, bests. Putts, greens and fairways per player (no grid column on the screen) come from Stats' own calculation, `loadPlayersFigures`. |
| get_rounds | get_team_rounds, the round lists | **screen**: Rounds `loadTeamRounds`: counts and averages per player computed here from the screen's list and its `countable` mark, the season line, and the newest rounds as a list. Filters: players, type, dates. |
| get_round | get_round_detail | the Round page's `loadRoundReview` (injected as `ScreenLoaders.roundReview`), with the per-par, putts and penalties tallies counted from the page's holes. A player's round is checked as their own before the page is asked. |
| get_shots | get_shot_pattern (approach), get_proximity_by_band with free bands | direct (`golf_shots`): only what no screen draws. Putting by distance is no longer here. |
| get_season | get_season_scoring, compare_seasons | **screen**: Roster `loadRoster` for this season; last season's comparison is direct (no screen draws it). |
| get_qualifiers | get_qualifiers, get_qualifier_entries | **screen**: Qualifiers `loadQualifierList`, and `loadQualifierDetail` for one board. |
| get_tournaments | get_tournaments, get_tournament_notes | the Tournaments season home (`loadTournamentsHome`, injected), each player's rounds added up; the notes are a direct read (flag `golf_tournaments_v1`). |
| get_schedule | get_upcoming_events, get_calendar, get_class_times, get_team_travel, get_attendance_summary | direct: events between two dates with replies, check-ins and class conflicts; trips; attendance totals. |
| get_coachhelm | get_player_insights, get_root_causes, get_team_patterns, get_focus_areas, get_focus_practice, get_goals, get_open_tasks, (player) get_my_reads | direct. |
| get_practice | get_practice, get_drill_bank, get_plan_format | direct. |
| get_reference | get_metric_definitions, get_golf_reference, get_benchmarks (standards), get_course, get_documents, get_team_season_settings | catalogue, reference, direct. |
| query_team_data | itself | unchanged allowlist, scope and 200-row bound. The column dictionary moves out of the description: `describe: true` returns it. |
| summarise_data | itself | unchanged. |
| show_visual | itself | unchanged: figures copied from the reads. |
| find_thread | itself | direct. |

Dropped with nothing lost: `find_player` (the roster, with ids, is in the team block of the prompt).

### Tasks (one tool each; names unchanged, they are in stored conversations and the ledger)

create_event, create_recurring_practice, create_focus_area, create_task, create_team_announcement, create_trip,
create_qualifier, create_goal, add_round_note, add_blocked_time, add_team_break, save_team_term,
set_availability_note, create_recruit, create_drill, publish_practice_plan, publish_artifact (Ask and the practice
helper), send_message (quick chat), set_lineup and lock_lineup (flag).

Drafts (write nothing; return a card): write_artifact, draft_practice_plan, ask_practice_brief, draft_message,
draft_poll, draft_board. Quick chat has no write_artifact, draft_message or draft_poll, as today.

### Surfaces

| Surface | Tools |
|---|---|
| ask, practice_helper | all reads, all tasks except send_message, all drafts (one list, so one cached prefix) |
| quick_chat | all reads, all tasks with send_message in place of publish_artifact, draft_practice_plan, ask_practice_brief, draft_board |
| player | get_player_stats, get_rounds (their own Rounds page, `my-rounds.ts`), get_round, get_shots, get_season, get_schedule, get_coachhelm, get_reference, summarise_data, show_visual, find_in_app; own id forced, own rounds only, no team figures beyond what the player's own Stats page shows |

Count as built: 38 of this file's own on Ask (41 with the tournaments flag) against 67 (71) before; 35 on quick chat; 9 for a player.
Registered for CONTEXT on top, always after every tool above so the cached order before them never moves: `find_in_app`,
`save_note`, `remove_note` (end of the reads), `send_event_reminder`, `record_attendance` (end of the tasks); the player gets
`find_in_app` only. That makes 43 on Ask (46 with the flag), 40 on quick chat, 10 for a player
(16 before; `get_rounds` is not offered to a player, whose rounds come from their own Stats page).
Tool definitions plus policy, characters / 4: 26,063 before. The whole cached prefix is now 19,876 on Ask (tools 11,349, this
file's rules 1,707, KNOWLEDGE's golf block and data map 6,820), 19,384 on quick chat, 7,497 for a player (tournaments flag off).
`__tests__/registry-size.test.ts` holds two ceilings: 12,000 for this file's own tools and rules (11,836 on Ask) and 21,000 for
the whole prefix. Which read answers which question is no longer in the rules: the data map's reader guide says it and is
checked against this registry (`knowledge/__tests__/data-map.test.ts`), so a new or renamed read tool must be added to
`knowledge/data-map.source.ts` and the map regenerated (`npm run coachhelm:data-map`).

## 3. App actions that already have a task tool

Since 11 Nov 2026 every task's card is built by the server (`card-truth.ts`): who is reached by id, the words sent,
what is replaced, who can see it and how it is undone, and `commit` refuses a card the world has moved under. The
fields and the rule are in `engine/CONTRACT_NOTES.md`, "PLANS". A new task follows the same rule: intent in, truth out.

For whoever adds task tools: these actions are covered. Do not add a second tool for any of them. Each is on the
contract (`plan` writes nothing, `commit` runs after Confirm and the Undo window) in `tasks.ts`, built from the flows
in `create-tools.ts`, `practice-draft.ts`, `action-planners.ts` and `practice-planner.ts`.

| Action in the app | Tool | Server action it wraps |
|---|---|---|
| Add one event to the calendar (practice, tournament, qualifier day, meeting, travel day, other), with invites and RSVP | `create_event` | `createGolfEvent` |
| Add a repeating practice with every date listed | `create_recurring_practice` | `createRecurringEvent` |
| Block the coach's own time | `add_blocked_time` | `addCoachBlockedTime` |
| Add a team break from class | `add_team_break` | `addTeamBreak` |
| Save a school term | `save_team_term` | `saveTeamTerm` |
| Add a trip (transport, dates, hotel, rooms, uniform, gear) | `create_trip` | `createGolfTravelItinerary` |
| Set up a qualifier (rounds, squad, coach picks, field) | `create_qualifier` | `createGolfQualifier` |
| Give a player a goal on one of eight stats | `create_goal` | `createGoal` |
| Give a player a focus area | `create_focus_area` | `createFocusArea` |
| Assign a task to players | `create_task` | `createTask` |
| Send a team announcement | `create_team_announcement` | `createEnrichedAnnouncement` |
| Add a coach note to a round | `add_round_note` | `saveRoundCoachNote` |
| Set a coach-only availability note on a player | `set_availability_note` | `setPlayerAvailabilityCoachNote` |
| Add a recruit | `create_recruit` | `createRecruit` |
| Add a drill to the team drill bank | `create_drill` | `createTeamDrill` |
| Publish a saved practice plan (and post it in Team chat) | `publish_practice_plan` | `publishPracticePlan` |
| Publish a written piece to Documents | `publish_artifact` (Ask, practice helper) | `saveTextDocument` |
| Send a message to a thread | `send_message` (quick chat only) | `sendGolfMessage` |
| Set a tournament lineup | `set_lineup` (flag `golf_tournaments_v1`) | `setTournamentEntries` |
| Lock a tournament lineup, no Undo | `lock_lineup` (same flag) | `lockTournamentLineup` |
| Remind players about an event | `send_event_reminder` (CONTEXT's, `tasks/event-tasks.ts`) | `sendEventReminderToPlayers` |
| Mark who came to an event | `record_attendance` (CONTEXT's, `tasks/event-tasks.ts`) | `markAttendance` |

Drafts that write nothing and hand the coach a card (read tools, not tasks): a practice plan (`draft_practice_plan`,
after `ask_practice_brief`), a long document (`write_artifact`), a message, poll or board opened in Messages
(`draft_message`, `draft_poll`, `draft_board`), with `find_thread` to find the thread.

Not covered by any tool here (so open to a new one, if it passes the brief's tests): editing or moving an existing
event, replying to an RSVP for a player, recording a round or a score, selecting qualifier picks, completing or
closing a task, editing a goal or a focus area, saving a practice plan draft, uploading a document, changing
settings, and everything a player does.

Every tool in the registry is passed through `strictInput` (`strict-input.ts`) when it is listed, so a new tool only
needs an ordinary zod object for its input: optional fields, bounds and defaults are fine, and the model is shown the
strict form of it.
