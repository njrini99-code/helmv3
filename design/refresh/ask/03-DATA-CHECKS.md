# Data checks: CoachHelm Ask

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 14 rows).

Status count across 188 checked figures and labels: OK 44, PLUMB 30, DERIVE 71, MISSING 43. Six rows carry a split status (for example "OK / MISSING"), counted here by their first value. A tag in brackets names the PR or held migration that closes the gap. The takeaway: about a quarter of the page reads straight from today's data, close to 40 percent needs new derivation (mostly AK6 and AK7), and the 43 MISSING rows need a fallback or a held migration (HM2 to HM5) before they can show real values.

Checked against helmv3 `main` 75b4956 by reading code, migrations and `src/lib/types/database.ts` only. No query was run, no flag was read from a live environment, and nothing was pushed, deployed or migrated. Nothing here changes what shot tracking collects, stores or sends (SHARED-14). Every figure on screen must trace to a row here (SHARED-13); a figure with no row doesn't ship.

Design: `coachhelm-ask.html` in this folder. Its script holds the fixture model: `SRC` (the reads each scene cites, line 1959 on, extended at 2330), `SC` (scenes), `FL` (the 11 create flows), `QS` (the practice brief), `PL` (7 player coins: JO, TH, JB, EL, MA, AN, SA) and the 64-shot miss set (seeded, line 1913). "Where" names the design state that draws the figure as a state link: `#h-live?play=<key>&stage=<stage>` for scenes and `#h-make?play=f_<flow>&stage=<stage>` for flows. Stages: steps, reads, worked, brief, brief-done, draft, confirm, adding, receipt, told, undone, cancelled, done.

Paths are under `src/clubhouse/` unless they start with `src/`. `RT` is `src/lib/coachhelm/v3/chat/read-tools.ts`, `AT` is `agent-tools.ts` beside it. New reads are the ones planned in `02-PLAN.md` (AK6, AK7). Plan PR numbers are in brackets.

Statuses:
- OK: an existing read or loader returns it today, in the shape drawn.
- PLUMB: the field is stored and already read somewhere, but Ask's read or part doesn't carry it yet. Carry it; no new query.
- DERIVE: computed from stored columns by a new read or a trusted-code rule. A new query of existing columns, no migration.
- MISSING: no source as drawn. The fix or fallback is given. Some wait on a held migration (named).

Note, 3 Nov: the design page from version 12 draws every fix in this file. Where a row's claim quotes old copy (Important, scheduled send, the trip link, "7 players and 2 coaches", "3 to 6 ft", "0 = team average", a qualifier exemption, a private round note), that is what the earlier drawing said; the build follows the row's fix, which v12 now shows. The task and drill rows keep the coach's own words as written.

## The short version

- The core of every answer is there. Roster, focus areas, qualifier standings, round scores, hole scores, strokes gained per round and the four existing writes are read today.
- Most of the new figures are DERIVE from `golf_shots`, `golf_holes` and `golf_rounds`. Shots store `miss_direction` (8 values), `distance_to_hole_before/after`, `lie_before/after`, `putt_distance_feet` and `putt_made`. The miss pattern is drawn from direction and distance left only, never a map position.
- Five copy claims are wrong against the code and change on the design page: "3 to 6 ft" (Stats uses 3 to 5), "0 = team average" for strokes gained (the baseline is the expected-strokes baseline), Normal announcements with "No push" (every announcement pushes), "now or later" for announcements (no scheduled send) and "7 players and 2 coaches" as recipients (players only).
- The design's step counters ("38 rounds so far" ticking up) break SHARED-11 (no count-up numbers) and the server doesn't know a running count. Done rows show the final figure only.
- The player meter fill is drawn at 38%. The client only ever gets a bucket, so the fill is fixed per bucket.
- "Seen by" counts come from `notifications.read_at` on the bell row a write creates. Travel creates no notification, so its Told row can't say "Seen by". (fixed 4 Nov wiring: a coach can't read players' `notifications` rows (`notifications_select_own`, baseline, `user_id = auth.uid()`), so the receipt route `GET /api/coachhelm/v3/chat/actions/[key]` reads them with the admin client, filtered to the run's own row id in `data` (for an announcement `data.announcement_id`, `announcements.ts:631`) and the run's coach, and returns only counts and roster ids. An event with RSVP off notifies nobody (`src/lib/calendar/rsvp.ts:268`, `calendar-events.ts:513`), so its Told row counts `golf_event_attendance` rows and says "on their calendar", never "Seen by". Messages use `golf_conversation_read_marks` (applied 25 Oct).)
- Things the data can't hold: per-event reminders, announcement scheduling and trip links, qualifier exemptions, round-note visibility and hole pins, a team drill bank, task due times, poll anonymity and "close when all answer", drive distance for travel, range bookings.

---

## 1. Home

| # | Figure or label (fixture) | Where | Source today | Status | Fix or fallback |
|---|---|---|---|---|---|
| H1 | Scope "Varsity · this season" | home | team name from `loadAskCoachHelm` (`data/coachhelm-chat.ts:116`); range from `ASK_RANGES` (`data/coachhelm-chat-shape.ts:244`) | PLUMB | Scope line joins team name and the composer range |
| H2 | "Since Monday" pulse, three lines | home | program pulse (`src/lib/coachhelm/v3/chat/program-pulse.ts`, `pulseToFindings`, chat-shape 53) | OK | Lines come from pulse items, not the fixture's wording |
| H3 | "Pinehurst qualifier on Nov 6, lineup not set" | home | pulse plus tournaments (behind `golf_tournaments_v1`) | PLUMB | Line only where Tournaments is on |
| H4 | Four suggestions with tags | home | `buildAskSuggestions` and `ASK_STARTERS` (chat-shape 101, 231) | PLUMB | Starters gain a tag field; wording from the starter list |
| H5 | Player: "Approach from 125 to 150, set by Coach Reyes" | home, viewer=player | `golf_player_focus_areas.title`, `assigned_by` to the coach's name | DERIVE [AK10a] | Player loader reads own focus areas |
| H6 | Player: "Putting gained strokes at Hilltop" | home, viewer=player | player projection of insights (`src/lib/coachhelm/delivery/player-projection.ts`) | DERIVE [AK10a] | Only observed facts, never a guessed cause |
| H7 | Player meter "Ask this week · Plenty left · resets Monday" | home, viewer=player | none | MISSING [AK10b, HM4] | Bucket from `ask_usage_weekly`; hidden until HM4 |
| H8 | Meter fill 38% | home, viewer=player | none | MISSING | Fixed fill per bucket (plenty, low, out); no proportional fill |

## 2. Putts scene (`play=putts`)

| # | Figure or label (fixture) | Where | Source today | Status | Fix or fallback |
|---|---|---|---|---|---|
| P1 | Scope "Varsity · last 30 days" | steps | as H1 | PLUMB | |
| P2 | "7 active players, all with rounds" | steps | `ctx.roster` (`context.ts:130`); players without rounds from the pulse (`noRoundsFrom`, chat-shape 220) | PLUMB | Detail string from the roster read's envelope |
| P3 | "38 rounds · 1,412 putts" | steps | none for the team or a window: `get_putting_distance_profile` reads the per-player stats cache with no window (RT 537, `golf_player_stats_cache`) | DERIVE [AK6] | Count rounds in window (practice rounds excluded) and sum `golf_holes.putts` |
| P4 | Counter "{k} rounds so far" ticking | steps | none | MISSING | Breaks SHARED-11 and the server has no running count; show the final detail only |
| P5 | "3 to 6 feet", 71% against 84% | steps to done | none | DERIVE [AK6] | Band changes to 3 to 5 ft (`PUTT_DISTANCE_BUCKETS`, `src/lib/golf/putt-distance-buckets.ts:27`); make rate from `golf_shots.putt_made` by `putt_distance_feet` |
| P6 | Chart bands 0-3, 3-6, 6-10, 10-15, 15 and out | done | none | MISSING as drawn | Use the Stats buckets 0-3, 3-5, 5-10, 10-15, 15-25, 25+ so Ask and Stats agree |
| P7 | Bar values 96, 71, 49, 29, 12 with season ticks 97, 84, 52, 28, 11 | done | none | DERIVE [AK6] | Same putting read, window and season |
| P8 | "3 to 6 ft: 76 of 107 made" (chip popover) | done | none | DERIVE [AK6] | Made and attempts per bucket |
| P9 | Season "Since Aug 1 · 94 rounds", "231 of 275" | done | none | DERIVE [AK6] | Season turns over 1 August (SHARED-13) |
| P10 | "Computed 8:02am today" | done | envelope `as_of` (`sourceLine`, `data/coachhelm-chat-thread.ts:76`) | OK | |
| P11 | By player: Eli "10 misses of 19", Theo "9 of 18", others "12 of 70"; "19 of the 31 misses" | done | none | DERIVE [AK6] | Coach only; never in a player answer (SHARED-12) |
| P12 | "Inside 3 feet and past 10 feet the team is level" | done | none | DERIVE [AK6] | Claim must match the bucket read; audited like any figure |
| P13 | "To test" note | done | composition `note` kind `hypothesis` (`visuals/composition.ts:28`) | OK | |
| P14 | Three follow-up chips | done | `followUpsFor` (chat-thread 282) | PLUMB | Chips come from the turn's reads, not fixed text |
| P15 | Read chips "Putts · 30 days", "Putts · season", "By player" and "3 reads" | done | `data-evidence` with `ref` (AT 249-256) | PLUMB [AK2] | Chip name from the read and window |

## 3. Jonah scene (`play=jonah`)

| # | Figure or label (fixture) | Where | Source today | Status | Fix or fallback |
|---|---|---|---|---|---|
| J1 | "Found Jonah Okafor" | steps | `find_player`, `resolveRosterPlayerByName` (`context.ts:202`) | OK | |
| J2 | "Junior · 8 rounds this fall" | steps | `golf_players.graduation_year`; round count from `golf_rounds` | DERIVE [AK7] | Class word from graduation year and the season; count from rounds this season |
| J3 | SG approach "−0.9 a round" over last 8 rounds | done | `get_player_trend` `sg_approach` (`ROUND_TREND`, RT 395-402) returns the series | PLUMB | Mean of the series in trusted code, carried as a measurement |
| J4 | SG legs: tee +0.2, approach −0.9, around +0.1, putting −0.3 | done | `show_visual` `sg_anatomy` from `get_player_metrics` (stats cache, its own window) | DERIVE [AK7] | For "last 8 rounds", average `golf_rounds.strokes_gained_*` over the same 8 rounds |
| J5 | Axis "0 = team average · strokes a round"; popover "Baseline: Team average" | done | metric method `sg_per_round_vs_broadie_baseline` (`metrics-catalog.ts`) | MISSING as worded | "0 = scoring baseline". A team-average line is a separate figure |
| J6 | "64 shots from 125 to 150 yd" | steps | none | DERIVE [AK6] | `get_shot_pattern`: approach shots with `distance_to_hole_before` 125 to 150 yd (unit converted) |
| J7 | "34 of 64 missed short or short right" | done | none | DERIVE [AK6] | Count `miss_direction` in (short, short_right) |
| J8 | "20 of 64 finished inside 25 feet" | done | none | DERIVE [AK6] | `distance_to_hole_after` ≤ 25 ft |
| J9 | Miss pattern: 8 wedges (long 4, long_right 3, right 8, short_right 16, short 18, short_left 4, left 3, long_left 2) and dots by distance left | done | none | DERIVE [AK6] | Wedge counts by direction; dot radius from distance left; no map position |
| J10 | Green dots "no miss logged" (6) | done | `miss_direction` null | DERIVE [AK6] | Counted separately, shown as such |
| J11 | "Approach is his open root cause", "Medium · 64 shots", "Since Oct 4" | steps, popover | `golf_coach_insights.evidence.cause`, `evidence.confidence`, `created_at` | PLUMB [AK7] | `get_root_causes` reads stored evidence without recording exposures |
| J12 | Hypothesis "short and short right often points at contact" | done | composition note `hypothesis` | OK | Model text, no figure |

## 4. Trend scene (`play=trend`)

| # | Figure or label (fixture) | Where | Source today | Status | Fix or fallback |
|---|---|---|---|---|---|
| T1 | "8 rounds, Sep 6 to Oct 20", per-round to par 3.4, 2.9, 3.8, 2.1, 2.6, 1.8, 2.2, 1.5 | steps, done | `get_team_rounds` (RT 1240) gives per-player counts and averages | DERIVE [AK7] | Team average to par per team event date (tournament rounds; practice excluded) |
| T2 | "+2.5 a round this fall" | done | none | DERIVE [AK7] | Mean of T1 |
| T3 | Last fall "+3.6", "9 rounds, Sep to Oct 2025" | done | none | DERIVE [AK7] | `compare_seasons` over the same definition |
| T4 | Usual range "+3.1 to +4.1" | done | none | DERIVE [AK7] | Mean plus or minus one standard deviation; method in the envelope note |
| T5 | "Last four rounds all under last fall's usual range" | done | none | DERIVE [AK7] | Checked against T4 in trusted code |
| T6 | "Latest +1.5 at Hilltop R2" | popover | tournament name needs `golf_tournaments_v1`; else `golf_rounds.course_name` | PLUMB | Fallback to the course name |
| T7 | Round date labels Sep 6 ... Oct 20 | done | `golf_rounds.round_date` | OK | |

## 5. Plan scene (`play=plan`)

| # | Figure or label (fixture) | Where | Source today | Status | Fix or fallback |
|---|---|---|---|---|---|
| PL1 | "Free 3:00 to 5:30 PM, no class conflicts" | steps | events from `get_upcoming_events` (RT 1028); classes from `src/lib/calendar/conflicts.ts`, `golf_class_exceptions` | DERIVE [AK7] | `get_calendar` free window in the team zone (`resolveTeamTimeZone`) |
| PL2 | "Range: Lake Course, booked" | popover | none (no booking table) | MISSING | Show the last practice event's `golf_events.location`; drop "booked" |
| PL3 | Focus "Jonah: approach 125 to 150", "Eli, Theo: short putts" | steps | `get_focus_areas` (RT 972), `golf_player_focus_areas.title` | OK | |
| PL4 | "Short putts slipped this month" | brief | none | DERIVE [AK6] | From the putting read (P5) against the season |
| PL5 | Brief Q1 "2 hours 30 · Your usual" | brief | none | DERIVE [AK9] | CoachHelm knows fact (HM2) or median length of past practice events; else no "usual" tag |
| PL6 | "Tuesday is free from 3:00 to 5:30" | brief | as PL1 | DERIVE [AK7] | |
| PL7 | Q2 options tagged "Focus area", "Slipped this month" | brief | as PL3, PL4 | DERIVE [AK9] | Each tag names its read |
| PL8 | "All 7 players are free Tuesday" | brief | classes and events | DERIVE [AK7] | |
| PL9 | Q4 "Range and practice green · Booked Tuesdays" | brief | none | MISSING | "Where you practised last Tuesday" from event location |
| PL10 | "Matched drills from your bank: Distance ladder, Gate drill, 3-6-9"; popover "Your team's saved drills" | steps | `golf_drills` is one global library (no `team_id`); focus areas carry `drill_ids` | PLUMB | Word it "From the drill library" until HM5; drills attached to focus areas first |
| PL11 | "5 blocks, 2h 30m, two groups" | steps | none (plans are N-00, held) | DERIVE [AK5] | From the drafted artifact |
| PL12 | Block text "10 balls each to 125, 135 and 145 ... 6 of 10" | artifact | `golf_drills.description` (free text) | PLUMB | Drill text as written; the planner adds no figure the drill doesn't state |
| PL13 | Groups "A: Jonah, Theo, Josie", "B: Eli, Maya, Ana, Sam" | artifact | focus areas | DERIVE [AK5] | Grouped by focus area in trusted code |
| PL14 | Why chips on blocks | artifact | read refs | PLUMB [AK2] | |
| PL15 | Version "1 of 1" | artifact | none | DERIVE [AK5] | `data-artifact` versions in the thread; stored versions with N-00 |
| PL16 | Event draft: TUE 3, "Practice · approach and short putts", 3:00 to 5:30 PM, location, "7 players · RSVP on" | draft | planner for `create_event` (AK11a) over `createGolfEvent` fields (`golf_events` title, start/end, location, `requires_rsvp`) | OK | |
| PL17 | "Plan attached from Documents" | draft | `golf_event_documents` exists | PLUMB | Only once the plan is saved (needs N-00 nullable `file_url`) |
| PL18 | "Reminder · Not set" | draft | no per-event reminder | MISSING | "Reminders 24 h and 1 h before (team setting)" when RSVP is on |
| PL19 | "On confirm: 7 players get an invite once Undo closes" | confirm | RSVP fan-out (`calendar-events.ts:515`); with RSVP off players get no notification (AT 722 description) | DERIVE [AK4] | The line follows the RSVP choice |
| PL20 | Week grid with existing events and the open slot | draft | as PL1 | DERIVE [AK7] | |
| PL21 | Receipt "Added to calendar · Tue Nov 3, 3:00 PM" | receipt | receipt from the plan | OK | |
| PL22 | Told "7 players got it", "Delivered to 7. Seen by 2." | told | bell rows (`notifications`) for the event | DERIVE [AK4] | Delivered = rows written; seen = `notifications.read_at` |
| PL23 | Save folders "Practice plans 12, Fall 2026 8, Player reports 5, Qualifiers 3" | receipt (save) | `golf_documents.folder` is free text; Hub groups it (`data/hub.ts` `folders()`) | PLUMB | Counts by folder today; folder rows with N-10 |
| PL24 | "Plan saved · Documents · November", location chip | receipt (save) | none | MISSING [AK9] | Waits on N-10 folders and N-00 plan save, both held (fixed 4 Nov: waits on N-00 only; "November" is the free-text `golf_documents.folder` name, practice-plan default 1) |
| PL25 | Publish "7 players are notified", "Delivered to 7. Seen by 3.", "Filed in Practice plans" | told (publish) | none | MISSING [AK9] | Waits on N-00 publish; Told from bell rows as PL22 |

## 6. Task moments (`#h-moments`)

| # | Figure or label (fixture) | Source today | Status | Fix or fallback |
|---|---|---|---|---|
| M1 | Focus: "For Jonah Okafor", "Junior · 8 rounds this fall" | as J1, J2 | DERIVE | |
| M2 | Existing chip "Lag putting · Since Sep 12" | `golf_player_focus_areas.title`, `started_at` | OK | |
| M3 | "Jonah sees it on his Home" | `createFocusArea` notifies inside the call (`development.ts:478`) | OK | Told after the hold (AK4) |
| M4 | Folder moment counts and squash | as PL23 | PLUMB | |
| M5 | Publish fan-out badges | as PL25 | MISSING | |

## 7. Player scene (`play=player`, viewer=player)

| # | Figure or label (fixture) | Where | Source today | Status | Fix or fallback |
|---|---|---|---|---|---|
| PY1 | Scope "My rounds · this fall" | steps | session player | PLUMB [AK10a] | |
| PY2 | "Approach costs you about 0.9 a round over your last 8 rounds" | done | own `golf_rounds.strokes_gained_approach` | DERIVE [AK10a] | Player tool forces `player_id` to the session |
| PY3 | "Baseline: Team average" | popover | as J5 | MISSING as worded | "Scoring baseline"; team average only as a named-free benchmark (SHARED-12) |
| PY4 | "64 shots", "34 of 64" short or short right, miss pattern | done | as J6 to J10 | DERIVE [AK6] | Own shots only |
| PY5 | "Coach Reyes already has this as your focus area" | done | focus area `assigned_by` to the coach's display name | PLUMB | |
| PY6 | Drill card "Distance ladder · From your coach's drill bank · 30 min" | done | `golf_player_focus_areas.drill_ids` to `golf_drills` (`title`, `duration_min`) | PLUMB | "From your coach's plan" (no team bank until HM5) |
| PY7 | Ladder 125, 135, 145 with "10 balls" each; "target is 6 of 10" | done | `golf_drills.description` is free text | MISSING as structured | Show the drill's description text; no tiles unless the drill stores them |
| PY8 | No teammate name anywhere | all | player toolset allowlist | DERIVE [AK10a] | DOM and network test (SHARED-12) |

## 8. Limit scene (`play=limit`, viewer=player)

| # | Figure or label (fixture) | Where | Source today | Status | Fix or fallback |
|---|---|---|---|---|---|
| LM1 | "You've used this week's Ask", reason text, "Resets Mon" | done | none | MISSING [AK10b, HM4] | Bucket `out` and the reset day from `week_start` in the team zone |
| LM2 | Empty meter | done | none | MISSING [HM4] | Fixed fill per bucket (H8) |
| LM3 | "Your past answers and charts still open" | done | player history needs HM3 | MISSING [HM3] | Until HM3, say "Your stats and rounds are all still there" only |
| LM4 | Composer "Ask is paused until Monday" | done | none | MISSING [HM4] | From the bucket |
| LM5 | "To: Helm Sports Labs support" | draft | none in server config | MISSING [AK10b] | `ASK_CREDITS_TO` in server config |
| LM6 | "From: Jonah Okafor · Varsity" | draft | session player and team name | OK | |
| LM7 | "I ran out of this week's Ask and would like more." | draft | fixed copy | OK | |
| LM8 | "One email goes to Helm Sports Labs once Undo closes. Your coach isn't emailed." | confirm | Resend ops transport (`src/lib/admin/digest/transport.ts`) | DERIVE [AK10b] | One per player per week (`ask_credit_requests` unique) |
| LM9 | "Sent. You'll hear back here." | told | none | MISSING | No reply channel exists; say "Sent to Helm Sports Labs" only |

## 9. Recap scene (`play=recap`, viewer=player)

| # | Figure or label (fixture) | Where | Source today | Status | Fix or fallback |
|---|---|---|---|---|---|
| RC1 | "2 rounds, Oct 19 and 20" | steps | `get_recent_rounds` (RT 820) | OK | |
| RC2 | "73 (+1)" | done | `golf_rounds.total_score`, `score_to_par` | OK | |
| RC3 | "4 birdies" | done | `golf_holes.score` against `par` | DERIVE [AK6] | `get_round_detail` |
| RC4 | "Round 2 was your best of the fall" | done | own rounds this season | DERIVE | Lowest to par this season |
| RC5 | "Strokes gained +1.1 vs team" | popover | `golf_rounds.strokes_gained_total` and a team mean for the same event | DERIVE | Team mean only, no names |
| RC6 | "Gained strokes on the greens for the first time in a month" | done | `golf_rounds.strokes_gained_putting` series | DERIVE | |
| RC7 | Hole strip 18 holes, under par on 4, 11, 16; over on 2, 7, 13 | done | `golf_holes.score - par` | DERIVE [AK7] | Red only under par |
| RC8 | "Birdies on 4, 11 and 16 came after approaches inside 15 feet" | done | `golf_shots.distance_to_hole_after` on those holes | DERIVE [AK6] | |
| RC9 | "Hilltop Invitational, round 2" | popover | tournament name behind `golf_tournaments_v1`; else course name | PLUMB | |
| RC10 | Chip "Share with Coach Reyes" | done | none | MISSING | Player Ask has no writes; replace with a read follow-up |

## 10. Tone and CoachHelm knows (history panel)

| # | Figure or label (fixture) | Source today | Status | Fix or fallback |
|---|---|---|---|---|
| K1 | Tone Straight, Detailed, Team talk | none (no column) | MISSING [AK8, HM2] | Defaults to Straight; control hidden until HM2 |
| K2 | "Practice runs 2h 30m on weekdays", "Team goal: under +2 a round by spring" | none | MISSING [AK8, HM2] | Coach-written facts table; nothing inferred is saved |
| K3 | Conversation list and groups | `groupConversations` (chat-shape 149) | OK | |

---

## 11. Create flows

### 11.1 Event (`play=f_event`)

| # | Figure or label (fixture) | Where | Source today | Status | Fix or fallback |
|---|---|---|---|---|---|
| E1 | "Practice Tue, film Thu, qualifier Fri" | steps | `golf_events` next week | DERIVE [AK7] | `get_calendar` |
| E2 | "Everyone is free Wednesday after 3:30" | reads | classes (`golf_team_class_day`, `golf_class_exceptions`) | DERIVE [AK7] | |
| E3 | Counter "{k} of 7 players" | reads | none | MISSING | Final figure only (SHARED-11) |
| E4 | Pill "Wed Nov 4 · 4:00 PM · Calendar and classes" | worked | as E1, E2 | DERIVE | One slot only; two or more is a question (TASK_FIELDS rule 3) |
| E5 | Pill "45 minutes · Your usual meeting" | worked | past `golf_events` of the same type | DERIVE | No past meetings: ask |
| E6 | Pill "Reminder 1 hour before · Your default" | worked | no per-event reminder | MISSING | Drop; show the team reminder line when RSVP is on |
| E7 | Q "Seniors only · Josie and Sam" | brief | `golf_players.graduation_year` | DERIVE | |
| E8 | Q "Clubhouse film room · Where you met last time" | brief | last meeting's `golf_events.location` | DERIVE | |
| E9 | Draft "4:00 to 4:45 PM", "7 players · RSVP on" | draft | `createGolfEvent` fields | OK | |
| E10 | Told "Delivered to 7. Seen by 2." | told | bell rows and `read_at` | DERIVE [AK4] | |

### 11.2 Announcement (`play=f_annc`)

| # | Figure or label (fixture) | Where | Source today | Status | Fix or fallback |
|---|---|---|---|---|---|
| A1 | "Leaves Sun Nov 8 from the Clubhouse lot" | steps | `get_team_travel` (RT 1165), `golf_travel_itineraries.departure_*` | OK | |
| A2 | "Travel posts went out as Important", "3, all Important", "Got it asked on all 3" | steps, popover | `golf_announcements.urgency`, `requires_acknowledgement` | DERIVE | "Important" isn't a value: Clubhouse shows `high` and `urgent` as Urgent (`screens/messages/model.ts:290`). Say "Urgent" |
| A3 | Pill "Title: Bus to Hargrove · Your words" | worked | coach's words | OK | |
| A4 | Pill "7 players and 2 coaches" | worked | `golf_announcement_recipients` holds players only | MISSING | "7 players" |
| A5 | Pill "Linked to the Hargrove trip" | worked | no link column | MISSING | Trip details go in the body |
| A6 | Q "Normal: in Messages only / Important: pushes / Urgent: push and email" | brief | every announcement pushes and emails (`announcements.ts:643-678`); email only while `HELM_CUSTOMER_EMAIL_ENABLED` is on | MISSING as drawn | Two options, Normal and Urgent; both say "Bell, push and email" |
| A7 | Q "Tomorrow at 8 AM" | brief | no write path sets `publish_at` | MISSING | Drop "later"; it posts on Post |
| A8 | Lock screen preview, "No push" for Normal | draft | title and body | OK / MISSING | Preview OK; "No push" removed |
| A9 | Confirm "Post to 7 players" | confirm | recipient count | OK | |
| A10 | Told "Seen by 4. 2 tapped Got it." and Got it "2 of 7" | told | `notifications.read_at`; `golf_announcement_acknowledgements` | DERIVE / OK | |

### 11.3 Travel (`play=f_travel`)

| # | Figure or label (fixture) | Where | Source today | Status | Fix or fallback |
|---|---|---|---|---|---|
| TR1 | "Nov 9 to 10 · round 1 Monday 8:30 AM" | steps | `golf_tournaments` dates, `golf_tournament_rounds.first_tee_at` (behind `golf_tournaments_v1`) | PLUMB | Else the calendar's tournament event |
| TR2 | "212 miles · about 3 h 40" | brief | none | MISSING | Drop the distance; ask how they're getting there without it |
| TR3 | "Two vans, Hampton Inn Ridgeway, 4 rooms, 9 items", "2 nights" | steps, popover | last trip's `transportation_type`, `hotel_name`, `room_assignments`, `gear_list`, departure and return dates | DERIVE | Match last trip by destination or event name |
| TR4 | Pill "Leave Sun Nov 8 · 7:00 AM · Tee times" | worked | none for drive time | DERIVE | From last trip's `departure_time`, labelled "Last year's trip", not "Tee times" |
| TR5 | Q rooms "By class · Last year" | brief | `room_assignments` (json), `graduation_year` | DERIVE | |
| TR6 | Q uniform "Green Monday, white Tuesday · Last year" | brief | `uniform_requirements` (text) | OK | |
| TR7 | Draft "7 players, 2 coaches" | draft | roster and team staff (Hub loader) | DERIVE | |
| TR8 | Told "7 players see the trip in Hub", "Delivered to 7. Seen by 3." | told | `createGolfTravelItinerary` (`travel.ts:295`) sends no notification | MISSING | Told says "In Hub for the team. Nobody is notified." |

### 11.4 Board for a player (`play=f_board`)

| # | Figure or label (fixture) | Where | Source today | Status | Fix or fallback |
|---|---|---|---|---|---|
| B1 | Jonah's SG and miss pattern | steps | as J3 to J10 | DERIVE | |
| B2 | Pill "His focus: approach 125 to 150 · Focus areas" | worked | `golf_player_focus_areas` | OK | |
| B3 | Q options: strokes gained, miss pattern, this fall against last, Tuesday's drill | brief | AK6, AK7 reads; drill as PY6 | DERIVE | |
| B4 | Board image in Jonah's composer | receipt | `ChPrefill` has no attachment (`screens/messages/prefill.ts:21-27`) | MISSING [AK11c] | PNG attachment prefill |
| B5 | "Your message to Jonah" thread | receipt | direct thread in `golf_conversations`; prefill has no `conversationId` | PLUMB [AK11c] | |
| B6 | "Nothing is sent until you tap Send in Messages" | told | prefill rule (prefill.ts header) | OK | |

### 11.5 Poll (`play=f_poll`)

| # | Figure or label (fixture) | Where | Source today | Status | Fix or fallback |
|---|---|---|---|---|---|
| PO1 | "Mon free after 5:30, Wed after 5, Thu after 6" | steps, brief | events and classes | DERIVE [AK7] | |
| PO2 | "Saturday is packing for Hargrove" | reads | trip departure the next day | DERIVE | "The night before travel" |
| PO3 | Pill "Team chat · Varsity" | worked | team conversation in `golf_conversations` | PLUMB [AK11c] | |
| PO4 | Pill "Names show on votes · Your last 2 polls" | worked | `PollDraft` has `question, options, multi, closesAt` only (`src/lib/golf/message-polls.ts:89`) | MISSING | Drop the pill |
| PO5 | Q close "Tomorrow at noon" / "Leave it open" | brief | `closesAt` set or null | OK | |
| PO6 | Q close "When all 7 answer" | brief | no such rule | MISSING | Drop the option |
| PO7 | "Nothing is posted until you tap Send in team chat" | told | prefill rule | OK | Poll prefill is AK11c; delete needs held `20261028140800` |

### 11.6 Qualifier (`play=f_qual`)

| # | Figure or label (fixture) | Where | Source today | Status | Fix or fallback |
|---|---|---|---|---|---|
| Q1 | "Nov 16 to 17 · 5 spots" | steps | `golf_tournaments.start_date`, `end_date`, `players_per_team` (behind `golf_tournaments_v1`) | PLUMB | |
| Q2 | "Entries 5 players" | popover | `golf_tournament_entries` | PLUMB | |
| Q3 | "36 holes over 2 days, ties on the last 18" | steps | `get_qualifiers` (RT 1431): `num_rounds`, dates; tie rule is the tournament's `golf_tournaments.tiebreak` | OK / PLUMB | Tie rule shown as a pill from the tournament; not written to the qualifier |
| Q4 | "Thu Nov 12 and Fri Nov 13 · Free on the calendar" | worked | events and classes | DERIVE [AK7] | |
| Q5 | Q rounds "2 rounds, 36 holes · Your usual" | brief | `num_rounds` of past qualifiers | DERIVE | |
| Q6 | Q exempt "Josie, from Hilltop", "Last spring you exempted a winner" | brief | no exemption field | MISSING | Ask squad size and coach's picks (`selection_slots_total`, `selection_slots_coach_pick`) |
| Q7 | Spot bar filling a seat per spot; gold ring for exempt | draft | `spots_available`, `selection_slots_total` | OK / MISSING | Gold ring only on coach's picks |
| Q8 | Told "{n} players got it on their calendar" | told | `createGolfQualifier` notifies (`qualifier-actions.ts:286-330`) | DERIVE [AK4] | Seen from `read_at` |
| Q9 | Fall results Josie +3, Jonah +5, Theo +6, Eli +8, Maya and Ana +9 tied, Sam +12 | popover | `golf_qualifier_entries.total_to_par`, `is_tied`, `position` | OK | |

### 11.7 Lineup (`play=f_lineup`, behind `golf_tournaments_v1`)

| # | Figure or label (fixture) | Where | Source today | Status | Fix or fallback |
|---|---|---|---|---|---|
| L1 | "Oct 26 to 27 · 7 players, 36 holes" | steps | `get_qualifiers` | OK | |
| L2 | "Spot 5 is a tie at +9" | reads | `is_tied`, `total_to_par` | OK | |
| L3 | Pill "Josie, Jonah, Theo, Eli · Qualifier top 4" | worked | `position` | OK | |
| L4 | Q "Maya · better over her last 5 rounds", "Ana · better at Hargrove last year" | brief | `golf_rounds` last 5; rounds on the same `course_id` last year | DERIVE | |
| L5 | Draft "MON 9 · Hargrove Invitational · round 1" | draft | `golf_tournament_rounds` | PLUMB | |
| L6 | "Locks when Undo closes"; lands "locked" | confirm, receipt | `golf_tournament_set_entries` then a separate `golf_tournament_lock_lineup(p_id)` that can't be undone | MISSING as drawn | Land "Lineup set"; Lock is a second card without Undo |
| L7 | Told "5 players know they're in. Alternates told too." | told | no notification found in the set-entries path read for this plan | MISSING | Verify in AK11d; until then Told says "Nobody is told until you publish the lineup" |

### 11.8 Task (`play=f_task`)

| # | Figure or label (fixture) | Where | Source today | Status | Fix or fallback |
|---|---|---|---|---|---|
| TK1 | "Both on short putts, 3 to 6 ft" | steps | focus area titles (coach-written text) | OK | Shown as the coach wrote it |
| TK2 | "Film at 4:00, no practice" | steps | `golf_events` | DERIVE [AK7] | |
| TK3 | Pill "Due Thu Nov 5 · 4:00 PM · Before film" | worked | `golf_tasks.due_date` is a date (baseline 10900) | MISSING (time) | "Due Thu Nov 5"; no time of day |
| TK4 | Q reminder "Wed at 7 PM" / "Thu at 8 AM" | brief | `golf_tasks.reminder_at`, `golf_task_reminders.scheduled_for` | OK | |
| TK5 | "They both open Clubhouse most evenings" | brief | no read of app opens | MISSING | Drop the line |
| TK6 | Q repeat "Every week until Hargrove" | brief | `golf_tasks.recurrence_rule` | OK | End date from the trip |
| TK7 | Draft "Eli Navarro, Theo Lindqvist" | draft | `golf_task_assignments` | OK | |
| TK8 | Told "Eli and Theo got the task", "Seen by Theo" | told | task notifications inside `createTask` (`tasks.ts:461-516`); `read_at` | DERIVE [AK4] | |

### 11.9 Goal (`play=f_goal`)

| # | Figure or label (fixture) | Where | Source today | Status | Fix or fallback |
|---|---|---|---|---|---|
| G1 | "−0.9 a round over 8 rounds" | steps | as J3 | PLUMB | |
| G2 | "His best 30 days this fall was −0.4" | reads | `golf_rounds.strokes_gained_approach` | DERIVE | Best rolling 30-day mean this season |
| G3 | Pill "Approach strokes gained" | worked | `sg_approach` is a windowed goal metric (`src/lib/coachhelm/v3/goals/window-metric-ids.ts`) | OK | |
| G4 | Pill "Starts at −0.9" | worked | `golf_goals.baseline_value` (`createGoal` computes it, `v3/goals.ts:235`) | OK | Use the action's baseline, which may differ from G1's window |
| G5 | Q "To −0.5 in 30 days / −0.3 in 45 days / even by spring" | brief | `target_value`, `window_days`, `ends_at` | OK | Targets must pass `checkGoalTarget` |
| G6 | Q "Should Jonah accept it?" | brief | `coach_assignment_mode` (mandatory or suggested) | MISSING as worded | "Assign it, or suggest it?" |
| G7 | Chart: last 8 rounds, goal band, arrow | draft | as G1 | DERIVE | |
| G8 | Told "Jonah accepted it" | told | `player_accepted_at` | OK | |

### 11.10 Round note (`play=f_note`)

| # | Figure or label (fixture) | Where | Source today | Status | Fix or fallback |
|---|---|---|---|---|---|
| N1 | "Hole by hole, 74 (+2)" | steps | `golf_rounds.total_score`, `score_to_par`; `golf_holes` | OK / DERIVE | `get_round_detail` |
| N2 | "Hole 13 · 6 on a par 4" | popover | `golf_holes.score`, `par` | OK | |
| N3 | "Tee shot missed left, bunker", "Approach short, 31 ft left" | steps | `golf_shots.miss_direction`, `lie_after`, `distance_to_hole_after` | DERIVE [AK6] | |
| N4 | 18 bars by hole | draft | `golf_holes` | DERIVE [AK7] | |
| N5 | Q "Share it with Theo now? / Keep it for me" | brief | no visibility field; the player always sees `coach_notes` | MISSING | Drop the question; card says Theo will see it |
| N6 | Pin on hole 13 | draft | `coach_notes` is one text field, no hole | MISSING | Note text starts "Hole 13:"; the pin is drawn from that prefix |
| N7 | Existing note | draft | `saveRoundCoachNote` replaces `coach_notes` (`round-coach-note.ts`) | PLUMB | Read and show the existing note; append; Undo restores |
| N8 | Told "Theo can see it on his round", "Seen by Theo" | told | `notifyCoachCommented`; `golf_round_reviews.player_viewed_at` | PLUMB | |

### 11.11 Drill (`play=f_drill`, built off)

| # | Figure or label (fixture) | Where | Source today | Status | Fix or fallback |
|---|---|---|---|---|---|
| D1 | "Gate drill is saved at 4 ft" in "your drill bank" | steps | `golf_drills` global library | PLUMB | "In the drill library" until HM5 (fixed 4 Nov: until N-00 `golf_team_drills` 010100 is applied; then the bank first, the library second, as the practice-plan lane reads them) |
| D2 | Pills "Putting, 3 to 6 ft", "15 minutes", "Make 8 in a row" | worked | `category`, `duration_min`, `description` | OK | The band is the drill's own text |
| D3 | Q "Who can see it?" | brief | no visibility column | MISSING [HM5] | HM5 adds `player_visible` (fixed 4 Nov: dropped. `golf_team_drills` has no visibility column; the bank is coach-only and players see a drill only inside a published plan. The draft states that as a fixed line instead) |
| D4 | Lands in the drill bank | receipt | no insert policy for coaches | MISSING [HM5] | Flow off until HM5 (fixed 4 Nov: lands in `golf_team_drills`; flow off until N-00 010100) |
| D5 | Told "Nobody is told" | told | fixed | OK | |

Quiet flows (block time, team break, term, availability note, recruit) draw no figures beyond the coach's own values and use the fields in `../coachhelm/TASK_FIELDS.md` §5.16 to §5.20.

---

## 12. Preview fixtures the engine can't produce as drawn

These fixture values are kept in `preview/fixtures-ask-v2.ts` for the design states, but the build must not draw them from live data until the fix lands:
1. The 3 to 6 ft band and its figures (P5 to P8, P11). Fixture moves to 3 to 5 ft once the design page is updated.
2. "0 = team average" on strokes gained (J5, PY3).
3. Step counters (P4, E3).
4. The 38% meter fill (H8).
5. Announcement "Important", "No push", "later" and "linked trip" (A2, A4 to A8).
6. Travel distance and Told seen counts (TR2, TR8).
7. Qualifier exemption, the gold ring and "Last spring you exempted a winner" (Q6, Q7).
8. Locked lineup and alternates told (L6, L7).
9. Task due time and "open Clubhouse most evenings" (TK3, TK5).
10. Round note share choice and pin (N5, N6).
11. "Your team's saved drills" and drill visibility (PL10, D1, D3).
12. Poll anonymity and close-on-all (PO4, PO6).
13. Range bookings (PL2, PL9) and "You'll hear back here" (LM9).

## 13. Rules the figures follow

- Practice rounds stay out of averages, leaders and team figures (SHARED-13). Seasons turn over 1 August.
- Distances convert by `distance_unit_before/after` before banding.
- Every DERIVE figure is computed in trusted code and carried in an envelope with window, sample and `as_of`, so the read chip can name it and the claim audit can check it.
- A player answer carries only the player's own figures, plus team average and PGA Tour figures with no names (SHARED-12).


## Completeness pass, 4 Nov 2026

Data behind the IDs and rules added in 05 §Completeness pass, 4 Nov 2026. Same columns as section 11. Status counts at the top of this file are unchanged; these 14 rows are counted here only (OK 3, PLUMB 4, DERIVE 3, MISSING 4).

| # | Figure or label (fixture) | Where | Source today | Status | Fix or fallback |
|---|---|---|---|---|---|
| CP-D1 | Stopped and dropped answer lines | S-ASK.turn.stopped, .turn.dropped | the stream's end reason (client abort, or socket closed with no `done`) | PLUMB [AK1] | No server change; the client records which |
| CP-D2 | "That chat isn't available..." | S-ASK.chat.gone | `coachhelm_conversations` read by id and owner | OK | 404 for any chat not the viewer's, with no title |
| CP-D3 | History pages of 30 | S-ASK.history.more | `groupConversations` (K3) | PLUMB [AK8] | Cursor on `updated_at` then id; today's list loads all rows |
| CP-D4 | "Last season" history group | history | `updated_at` against the latest 1 August | DERIVE [AK8] | SHARED-11 turnover |
| CP-D5 | Held ring time on a second device | S-ASK.kit.* receipt | `run_at` on the run row | MISSING [HM1] | No ring without HM1 (S-ASK.kit.no-hold) |
| CP-D6 | Release failed, with the flow's line | S-ASK.kit.release-failed, flow `.failed` | run row `status` and `error_code` | MISSING [HM1] | HM1 adds the held and failed path; today's runs fail before the receipt |
| CP-D7 | "Too late to undo" | S-ASK.kit.undo-late | DELETE result 409 `already_released` | MISSING [HM1, AK4] | Route returns 409 when `run_at <= now()` |
| CP-D8 | Partial names ("Invites didn't reach Theo and Eli") | flow `.partial` | per-recipient results of the fan-out | DERIVE [AK11a] | Names only by roster id; "2 players" when names can't be resolved |
| CP-D9 | Change line on recheck ("Eli is no longer on the roster...") | S-ASK.kit.recheck | execute-time re-read of roster, team and slot (02 §14) | PLUMB [AK11a] | The re-check already runs; it now returns which field changed |
| CP-D10 | Quiet flow fields | S-ASK.flow.q_* | TASK_FIELDS §5.16 to §5.20 | OK | |
| CP-D11 | "Requested this week" | S-ASK.player.requested | `ask_credit_requests` unique per player and week | MISSING [HM4] | Player Ask doesn't ship without HM4 |
| CP-D12 | Drill bank write and name check | S-ASK.flow.f_drill.* | `golf_team_drills` (N-00 20261026010100, held) | PLUMB [AK11e] | Flow off until that migration runs; HM5 superseded |
| CP-D13 | Plan's practice event | plan calendar card shown or not | `practice_event_id` from `ask_practice_brief` | DERIVE [AK9] | No event that day: the calendar card shows |
| CP-D14 | Folder names in Save | S-ASK.save.folder-list | `golf_documents.folder` (free text) | OK | N-10's folders table later adds empty folders; names stay the key |
