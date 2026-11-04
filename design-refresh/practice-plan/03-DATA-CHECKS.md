# Data checks: CoachHelm practice plans (lane 6)

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 32 rows).

These checks were made against helmv3 `main` 75b4956 on Nov 3 2026, by reading code and migrations only. No query was run. The SELECTs in "Staging spot checks" are read-only, for the Mac to run on staging.

Staging is the Supabase project PROSP DATA (`ybmwektreyrwjscxlogv`), with Demo University Golf as team `6ecdd1a6-63fe-4beb-b094-00118f334163` in America/New_York; its season started Aug 1 2026. The design is `coachhelm-practice.html` in this folder, with its data models `P`, `GROUPS`, `ROT`, `PLAN1`, `PLAN2`, `STEPS`, `INTAKE` and `FOLDERS`, plus its publish and format scenes. The build plan is `02-PLAN.md` beside this file, and the PR ids (PP0 to PP9) are from it.

Paths are under `src/clubhouse/` unless they start with `src/` or `supabase/`.

## The short version

- **The page's plan is the coach's object, not data.** Block times, minutes, the mix bar, groups, the rotation, the course starts, Bring and Notes come from the plan body the draft tool builds. The answers and the reads shape it, but none of it is a stored figure. What needs a source is the figures *the reads* show: the step pictures, the intake hints and the Because lines.
- **Strokes gained by area over "last 10 team rounds" has a real source, but no read.** `golf_rounds.strokes_gained_tee / approach / around_green / putting` is set per round by trigger from `calculate_round_strokes_gained` (baseline 257, 350-358).
  - No chat tool averages it across the team. `get_player_metrics` is one player from `golf_player_stats_cache`. PP1 adds `get_team_strokes_gained`.
  - Total-only rounds, like the Sep 25–26 qualifiers on staging, have no shots, so their SG is null. They must be left out and counted in the coverage note.
  - The baseline is the expected-strokes model (`sg_per_round_vs_broadie_baseline`), so "against the Tour line" changes to "against the scoring baseline".
- **Putting by distance doesn't match the app's bands.** The page draws 0–3, 3–6, 6–10 and 10–20 ft. The app has 0-3, 3-5, 5-10, 10-15, 15-25 and 25+ (`metrics-catalog.ts:232-243`).
  - 0-3 ft has no attempts column and is never charted (read-tools 563-575).
  - The Tour figures on the page (99, 84, 55, 25) are not the app's. The app's are 3-5 ft 90.5 (men) / 86.0 (women), 5-10 ft 62.2 / 55.0, 10-15 ft 35.7 / 30.0, 15-25 ft 15.4 / 12.0 (`cohort-baselines.ts`, from `golf_pga_standards`).
  - There is no team read. PP1 adds `get_team_putting_profile` over `golf_shots`. "412 putts from 3 to 6 ft" becomes a count of 3 to 5 ft attempts.
- **Class times have a real, applied source.** `golf_team_class_day` was applied on 2026-10-25 (HELD.md 231, "hold discharged"). It is coach-checked, and the chat route's session client can call it. It shows only players who share class status. A player who turned sharing off looks like a player with no classes, which is the safe way round.
- **The drill bank is `golf_drills` only.** It is global, with no `team_id` and only a SELECT policy. "12 putting drills, 4 short game" is a count by `category`. The team bank (`golf_team_drills`, N-00 010100) is held. "+13 more" is just 16 − 3.
- **"9 going, 1 can't" doesn't fit a 9-player plan.** It needs a 10th rostered player who declined.
  - The source is `golf_event_attendance` for the Thursday event.
  - `getUpcomingEvents` counts only `accepted` and `declined`, but the status CHECK also allows `attending`, `not_attending`, `tentative`, `maybe`, `excused` and `unexcused`, so today's read undercounts.
- **No source until N-00 is applied:**
  - "6 plans published / 3 groups most weeks"
  - "Seen by 4 of 9"
  - "Published Wed, Nov 4, 9:14 PM"
  - the plan's own Documents row
  - All of these need N-00's held tables. Hide rules are in "No source".
- **The folder counts are real today.** They are `golf_documents` grouped by the free-text `folder`, coach scope. A new folder has no row until the save writes one, so it can't show 0 after a save (default 1).
- **"Told 11" is 9 players plus 2 coaches.**
  - Told is the bell rows and push sends the deferred send writes. Their source is the action run's `result.notify.told`, written by PP5.
  - Staging has one coach, so it would say "Told 6" at most: 5 players and 1 coach, before any fixture change.
- **The 240 KB file has a real source:** `golf_documents.file_size`, in bytes, from the upload. "1 page · 5 sections" comes from PP7's parse, which is model output checked by a schema. It isn't stored until the held formats table exists.
- **Visibility.**
  - A player's copy holds no Why, Aim, Because, source chip or read figure, and no teammate's figure. Their own group's member names are not figures and are shown.
  - Two leak paths need care:
    1. a coach-copy file stored on a published plan, which a player could download (`is_public`)
    2. the Ask thread's read pictures, which name players ("Ava and Jade are in class until 2:15"). They are coach-only, because the Ask thread is coach-only.
  - Default 7 removes Aim from the player view.
- **On staging the plan will be thin:**
  - 5 players: Owen Carter, Jackson Hale, Tyler Hayes, Ethan Park and Mason Rivers
  - one coach, "Coach (Demo)"
  - summer hole rounds and total-only qualifiers; no Thursday Nov 5 practice event or Hargrove tournament as far as the code shows (unchecked)
  - possibly no class rows and an unknown drill count
  - The fixture has to carry the design's data. See "What the fixture must add".

---

## Formula findings

### 1. Calendar step, length guess and "Hargrove starts Monday"

**Page:** "Thu, Nov 5 · 2:00 to 5:00 PM · Lakeside · Hargrove starts Monday". The length hint is "Your calendar has 2:00 to 5:00", with the guess 3 h ticked. The course block's Because is "Hargrove Invitational starts Monday", with source chip "Calendar · Mon, Nov 9".

**Rows**
- Practice: `golf_events` (`team_id`, `title`, `event_type`, `start_time`, `end_time`, `location`, `status`, `requires_rsvp`), read by `get_upcoming_events` (agent-tools 639 → read-tools 1028). It drops `event_type = CLASS_EVENT_TYPE` and cancelled events. The Ask lane's AK7 plans `get_calendar`.
- Tournament: `golf_tournaments` (`team_id`, `name`, `start_date`, `end_date`, `course_id`; `20261024100000_golf_tournaments.sql:111`), read by `get_tournaments`, which is behind `golf_tournaments_v1` (agent-tools about 603). With that flag off, a tournament exists only as a `golf_events` row, if one was made.

**Figures**
- "2:00 to 5:00 PM": `start_time` and `end_time`, which are timestamptz, formatted in `golf_teams.timezone`. Nov 1 2026 is the US DST change, so a fixture across that date must use the zone, not a fixed offset.
- "3 h": `end_time − start_time` in minutes, rounded to the nearest option (2 h, 2 h 30, 3 h). With no practice event on the day, there is no guess, no hint, and the length group asks without a tick.
- "Hargrove starts Monday": the next tournament with `start_date` within 7 days of the practice date. With no tournament, there is no "On course" option and no Because mention.
- "Lakeside": `golf_events.location`, as stored. The sheet's "Lakeside Golf Club" is the same field.

**Check:** spot check A.

### 2. Strokes gained by area (step picture `sg`, Because of the putting rotation)

**Page:** "Last 10 team rounds": Off the tee +0.2, Approach −0.4, Around the green −0.3, Putting −0.9, with putting in amber. The Because reads "Putting costs the team 0.9 strokes a round against the Tour line... Last 10 team rounds". The chipping station reads "Around the green −0.3 a round".

**Rows:** `golf_rounds` (`player_id`, `round_date`, `round_type`, `status`, `is_test`, `strokes_gained_tee`, `strokes_gained_approach`, `strokes_gained_around_green`, `strokes_gained_putting`). The SG columns are set by trigger when a round completes (baseline 350-358), from `golf_shots` through `calculate_round_strokes_gained` (257).

**Formula (PP1 `get_team_strokes_gained`)**
1. Roster: `ctx.roster` (active members).
2. Team round dates: the 10 most recent distinct `round_date` values among completed, non-test rounds of roster players with `round_type` in `TEAM_ROUND_TYPES` (practice, qualifier, tournament; read-tools 1211).
3. Player-rounds: every such round on those dates. The design's evidence line "86 player-rounds" is this count. At most 10 dates × 9 players = 90.
4. Per area: the mean of non-null SG over the player-rounds. `sample_size` is the player-rounds with SG for that area, and the coverage note names how many had none ("12 rounds were totals only").
5. Amber: the area with the most negative mean, when it is below 0.

**Findings**
- SG is per round **against the expected-strokes baseline**, not a Tour average. The Because changes to "Putting costs the team 0.9 strokes a round against the scoring baseline", the same as the Ask lane's correction 7.
- Total-only rounds have null SG. With no shots there are no strokes gained. On staging, the Sep 25–26 qualifiers would be among the last 10 dates, but they add nothing.
- Hide rule: fewer than 5 player-rounds with SG gives no picture and a lean envelope. The Because then says "Only N rounds since <first date>, so this is a lean read". With 0 rounds there is no Because, and the block falls back to "Lean read".

**Check:** spot check B.

### 3. Putting by distance, three-putts and "412 putts" (step picture `pd`)

> **Fixed on the page, 3 Nov.** The design page now draws the app's bands with the men's Tour anchors: 3 to 5 ft 78/90.5, 5 to 10 ft 55/62.2, 10 to 15 ft 31/35.7, 15 to 25 ft 13/15.4. Strokes gained says "against the scoring baseline" (§2). The team figures are still sample numbers; the build reads them as below. The three-putt Tour value is still unread, so the page line "Tour line 0.5" stays sample text until the build reads `three_putts_per_18`.

**Page:** the bands 0–3 ft 96/99, 3–6 ft 71/84, 6–10 ft 38/55 and 10–20 ft 17/25 (team/Tour), amber where the gap is over 8, and "0.8 three-putts a round" with "Tour line 0.5". The evidence sheet says "Team, last 10 rounds · 86 player-rounds · 412 putts from 3 to 6 ft". The Because lines are "71% from 3 to 6 ft; Tour line 84%" and "71% from 3 to 6 feet across 412 putts; the Tour line is 84%".

**Rows**
- `golf_shots` (`round_id`, `shot_type = 'putting'`, `putt_distance_feet`, `putt_made`) on the same rounds as §2. `putt_details.distance_feet` and `made` are a second store, written by the round submit RPC; use `golf_shots` as the stats page does, and check the two agree (spot check C).
- Three-putts: `golf_holes.putts >= 3` on the same rounds.
- Tour: `cohortAnchor(metric, gender)` in `src/lib/coachhelm/v3/counterfactual/cohort-baselines.ts`, which reads `golf_pga_standards` (men's verified 2026-06-06, women's LPGA ShotLink 2024).
- Tour three-putts: `TOUR_THREE_PUTT_METRIC = 'three_putts_per_18'` (`src/lib/coachhelm/v3/generators/insight-angles/load-angle-data.ts:47`). The value was not read here.

**Findings**
- The page's bands don't exist. The picture uses 3-5, 5-10, 10-15 and 15-25 ft (`PUTT_DISTANCE_BUCKETS`). 0-3 ft can be counted from `golf_shots`, but it has no Tour anchor in `cohort-baselines.ts`, so it is drawn without a tick or left out. Default: left out, to match `get_putting_distance_profile`.
- The Tour values change, so the gap and the amber change:

  | Band | Tour (men's) | Tour (women's) | Page draws |
  |---|---|---|---|
  | 3-5 ft | 90.5 | 86.0 | 84 (for 3–6) |
  | 5-10 ft | 62.2 | 55.0 | 55 (for 6–10) |
  | 10-15 ft | 35.7 | 30.0 | 25 (for 10–20) |
  | 15-25 ft | 15.4 | 12.0 | (none) |

- Gender: `cohortAnchor` takes the team's cohort gender. Which column the engine uses to resolve it was not traced. Spot check D reads `organizations.program_type` (`mens`, `womens` or `both`). With `both`, the men's value applies, as `cohortAnchor`'s fallback does. Mark this unverified.
- "412 putts" becomes the 3-5 ft attempts count. "86 player-rounds" is §2's count.
- Thin: a band under 10 attempts is drawn but marked thin, the same rule as read-tools 575. A band with 0 attempts is not drawn.
- The amber rule "gap over 8 points" uses Tour − team. It is computed in code, not by the model.

**Check:** spot check C.

### 4. Class times (step picture `cls`, warm-up note)

**Page:** "Ava and Jade are in class until 2:15", a timeline from 2:00 to 3:00 with the rotation from 2:30, and the warm-up note "Runs to 2:30 so Ava and Jade, in class until 2:15, make every turn."

**Rows:** RPC `golf_team_class_day(p_team_id, p_on)` (`20261025070100_golf_class_blocks_functions.sql`, **applied**). It is a coach-checked definer and answers one object per active player: `tracked`, `holds`, `onCourse`, `offToday`, `away` and `blocks` (`data/class-day-shape.ts:30-71`). Classes live in `golf_player_classes` (`days`, `start_time`, `end_time`, `team_id`), with terms in `golf_team_terms`.

**Findings**
- The chat route passes `createClient()` (route 329) as `sb`, so the coach check sees the coach. The tool must not use the admin client.
- "In class until 2:15" is the last class block that overlaps the practice start, in the class zone. That zone is the term's, else the team's (`classTimeZone`).
- **Sharing:** `tracked` is false both for a player with no schedule and for one who turned sharing off. There is no `shared` key (shape header). A Why never names an untracked player.
- Hide rule: when the RPC is unavailable (`PGRST202`, `42883`), `class_awareness_v1` is off, or no term covers the date, there is no class step, no picture and no class mention in any Because. The warm-up stays "Routine. No claim."

**Check:** spot check E (reads the tables, because the RPC needs a coach session).

### 5. Drill bank (step picture `dr`, drill names on the plan)

**Page:** "12 putting drills, 4 short game", with Clock drill, Lag ladder and 25 in a row fanned out and "+13 more". The blocks use Clock drill 3–6 ft, Lag ladder 20–40 ft, Up and down 20 yd and the pressure finish.

**Rows:** `golf_drills` (baseline 9472: `id`, `slug`, `title`, `category`, `tags`, `description`, `duration_min`, `difficulty`, `video_url`, `impacts_metric_id`), read today by `src/app/golf/actions/v3/practice-rx.ts:42` and `team-practice-rx.ts:63`. The seed was `supabase/migrations_archive/pre_20260527/20260422100001_drill_library_seed.sql`.

**Findings**
- The counts are `count(*) group by category`. The page's category words ("putting", "short game") must match the stored values; spot check F lists them.
- "+13 more" = total in the shown categories − 3.
- The drill titles in the plan come from `title`. The page's "Clock drill 3–6 ft" may not be a stored title, and its band must change to 3 to 5 ft (§3).
- `golf_drills` has no team column, so "your drill bank" is the GolfHelm library until N-00's `golf_team_drills` (010100) is applied. The step label should say "Reading the drill library" until then. Default (Nick can flip).
- Hide rule: 0 drills gives "No drills in the bank yet". The plan uses no drill names, and New drill is inert (no write policy).

**Check:** spot check F.

### 6. Who: "9 going, 1 can't"

**Rows:** `golf_event_attendance` (`event_id`, `player_id`, `status`; CHECK baseline 9502: pending, accepted, declined, tentative, attending, not_attending, maybe, excused, unexcused) for the Thursday event, and the roster.

**Findings**
- The page's plan has 9 players in groups. "9 going, 1 can't" means a roster of 10 with one declined. The fixture must add the tenth (default 10: they are in no group and are not told).
- `getUpcomingEvents` counts only `accepted` and `declined` (read-tools 1066-1080). The new read counts:
  - going: accepted, attending
  - can't: declined, not_attending, excused, unexcused
  - not yet: pending, tentative, maybe. The hint becomes "9 going, 1 can't, 2 haven't said".
- Hide rule: when the event has no attendance rows (`requires_rsvp` false), the hint says "10 on the roster" and every rostered player is a guess.
- "Tuesday's groups" comes from N-00's groups table (010200, held) or the last published plan. With neither, that option is not offered, and the guess is "Everyone, split into 3".

**Check:** spot check A (attendance part).

### 7. Intake work guess

**Page:** "Your stats point at the first two. Hargrove starts Monday." The first two are short putts and lag.

**Formula:** the two options tied to the largest gaps in this turn's envelopes:
- short putts: the 3-5 ft gap from §3
- lag: three-putts per round against the Tour, and the 15-25 ft gap
- up and down: SG around the green from §2
- on course: a tournament within 7 days (§1)

The source line's words come from code. Its numbers, if any, pass the claim audit.

**Hide rule:** with no SG and no putting envelope, nothing is ticked and there is no source line.

### 8. Past plans: "6 plans · you split into 3 groups most weeks"

**Rows:** N-00's plans table (010000, held), filtered to status published, for the team. "3 groups most weeks" is the most common group count across their bodies.

**No source at 75b4956.** Hide rule: until N-00 is applied, the step reads "No past plans yet" and the guesses come only from this turn's reads. The legacy Fairway practice Rx saves markdown to `golf_documents` with `category = 'practice_plan'` (`plan-markdown.ts`). Those documents are not plan bodies and must not be counted.

### 9. Folders and counts (Save to list)

**Page:** Practice plans 4, Hargrove Invitational 2, Fall 2026 season 11, Short game 3, and the new folder "Hargrove week" at 0.

**Rows:** `golf_documents` (`team_id`, `folder`, `is_public`, `category`, `updated_at`), grouped by `folder` for the team, coach scope (drafts included). `data/hub.ts` `folders()` (897) shows the Hub's grouping, where null is "Team".

**Findings**
- The counts count **all documents** in the folder, not only plans. That matches the Hub. Default: all documents, the same as the Hub.
- A new folder exists only in client state until the save writes the first row, so it shows 0 before the save and 1 after.
- Null folder rows are "Team" in the Hub, but they are not a choice in the Save list. Default: not listed.
- A player's Hub view counts only `is_public` rows, so a coach and a player see different counts for the same folder. That is expected.

**Check:** spot check G.

### 10. Publish: audience, Told, Seen, published time

**Page:** "9 players and 2 coaches, push and bell", "Publish to 11 people", "Told 11", "Seen by 4 of 9 · Jonah, Eli, Sofia, Nora", and "Published Wed, Nov 4, 9:14 PM".

**Rows**
- Audience: the players in groups (the plan body) and the team's coaches (`golf_team_coach_staff` joined to `golf_coaches`).
- Told: `golf_coachhelm_action_runs.result.notify.told[]`, written by PP5 when it inserts the bell rows into `notifications` (`type 'event_reminder'`, `data.kind = 'practice_plan'`) and sends the push.
- Seen: N-00's opens table (010000) and record-open RPC (010600). **No source at 75b4956.**
- Published time: N-00's plan `published_at`. **No source at 75b4956.**

**Findings**
- Told counts each person once, when their bell row is written and their push is accepted by the send call. It does not count the device's delivery: Expo receipts are not read back.
- A push held by class awareness (`holdOrPass`) is counted as told, with a hold mark (02 §7.5).
- "Seen by N of 9" counts players only. Coaches are left out.
- Hide rules:
  - no opens table: there is no Seen row
  - no `told` yet: "Telling 11…" until the send records
  - a send error for some people: "Told 10 · 1 didn't go through", amber, with the names on tap

### 11. Figures built from the plan body

| Figure | Source | Note |
|---|---|---|
| block times and minutes, day strip | plan body | sums to the chosen length; checked by `validatePlan` |
| mix bar "Skill 40, Random 80, Pressure 15" | `mixMinutes(body)` | leaves out routine blocks (30 + 10 + 5 = 45), so 135 of 180 |
| "0 of 3 h planned" (builder) | body minutes / the event length | |
| "45 of 135 minutes on putting, the team's biggest loss" | body minutes, plus §2's largest loss | the "biggest loss" half needs §2's envelope in the same call |
| groups A, B and C, the rotation ROT, "A Hole 1 · B Hole 3 · C Hole 5" | body (`autoGrid`, `splitEvenly`) | the names come from the roster |
| Bring "Alignment sticks · 6, Tee pegs · 1 bag, Chipping balls · 2 buckets…" | N-00 `bringList(body)` | **no source for equipment**: `golf_drills` has no equipment column. Hide rule: Bring lists only what the coach typed; else it is empty ruled lines |
| notification "2:00 PM · You start on the putting green with Group B" | body and the team zone | "the putting green" is an area, not the station's name ("Green, back"). The body needs an `area` per station (02 §7.5); without one the copy falls back to the station's name |
| second option "Tuesday, Nov 10 3:00 to 5:30 PM" | the next practice event in `golf_events` | the same read as §1 |

### 12. Plan format: "Fall practice sheet.pdf · 1 page · 240 KB", "1 page · 5 sections"

**Rows**
- The file: `golf_documents.file_size` (integer, bytes), `file_type` and `title` from the upload (`uploadTeamDocument`, `screens/hub/upload.ts:18`). 240 KB is `file_size / 1024`, rounded.
- Pages and sections: PP7's parse (model output, validated). They are stored in `golf_practice_plan_formats.sections` (held). **No source at 75b4956.**

**Findings**
- The page count is not stored anywhere. It comes from the parse, or is 1 for a photo.
- Hide rule: until the table is applied, the parse can run and show "Here's your format", but "Use this format" is inert. The footer "In your format · …" shows only when a row exists.

### 13. Thin data, lean read and the evidence sheet

**Page:** "Under 5 rounds... 'Only 3 rounds since Oct 1, so this is a lean read'", with the evidence sheet "Team, last 10 rounds · 86 player-rounds · 412 putts from 3 to 6 ft".

**Rule:**
- Lean when §2 has under 5 player-rounds with SG, or §3's band behind a Because has under 10 attempts. The wording takes N and the first date from the envelope.
- The evidence sheet shows the envelope's window, `sample_size` and coverage note, using the existing evidence part. It never shows a number that isn't in the envelope.

---

## Visibility, figure by figure

| Figure or item | Coach in Ask | Coach sheet / PDF | Player page / player PDF | Notification |
|---|---|---|---|---|
| step pictures (SG, putting, class, drills, calendar) | yes | no | **never** | no |
| intake hints ("9 going, 1 can't", stats line) | yes | no | never | no |
| Aim | yes | no (no Aim on paper) | **no** (default 7) | no |
| Because / Why line | yes (Because, with chips) | yes (one Why line) | **never**: not in the DOM, the payload or the PDF | no |
| source chips, evidence sheet | yes | no | never | no |
| "Lean read", "Routine. No claim." | yes | no | never | no |
| class times naming players | yes (coach-only thread) | only inside a Why line | never | no |
| title, date, time, place, coaches | yes | yes | yes | time only |
| focus line | yes | yes | yes | no |
| groups and members' names | yes, all groups | yes, all groups | their own group only, and their group's stops | their group letter |
| other groups' stops and rotation | yes | yes | **no** (default 7) | no |
| Bring, Notes | yes | yes | yes | no |
| Told / Seen with names | yes | no | never | no |
| folder names and counts | yes | footer only | Hub counts of public rows | no |
| any read figure about a teammate | coach only | inside a coach Why line only | **never** | never |

RLS doesn't enforce the player rows. They are enforced on the server:
- `loadPlayerPlan` returns `toPlayerPlan(...)` only (02 §11)
- `golf_documents.is_public` gates the file
- no coach-copy file is stored for a published plan, because a player can fetch any `is_public` file through `getPreviewUrl` (`documents.ts` 1249; role check at 266 and 864)

---

## No source (fix for each)

| Figure | Why | Fix | Hide rule until fixed |
|---|---|---|---|
| team SG by area | no team read | PP1 `get_team_strokes_gained` (§2) | under 5 player-rounds with SG: no picture, lean read |
| team putting by band, 412 putts | no team read; the page's bands and Tour values are wrong | PP1 `get_team_putting_profile` with the app's bands and `cohortAnchor` (§3) | band under 10 attempts: thin; 0: not drawn |
| three-putts per round, "Tour line 0.5" | no team read; the Tour value is not read here | the same PP1 read; Tour from `three_putts_per_18` | no Tour value: drawn without a tick |
| "6 plans · 3 groups most weeks" | N-00 plans not applied | N-00 010000 | "No past plans yet" |
| "Tuesday's groups" | N-00 groups not applied | N-00 010200 | option not offered |
| Seen by N of 9 | N-00 opens not applied | N-00 010000, 010600, 010700 | no Seen row |
| published time, plan in Documents | N-00 010400 to 010600 not applied | N-00 | Publish inert ("Comes with the Practice tab") |
| team drill bank | `golf_drills` has no team column | N-00 010100 (~~or the Ask lane's HM5~~ (fixed 4 Nov: HM5 superseded; `golf_team_drills` only, section C.1)) | library only; label says "drill library" |
| Bring equipment | no equipment column on drills | N-00 team drills with equipment, or coach-typed | coach-typed or empty lines |
| plan format sections, page count | no table | PM1 (held, 02 §14) | Use inert; no footer format line |
| "the putting green" in the notification | no `area` on stations | add `area` to N-00's body type | falls back to the station's name |
| "Clock drill 3–6 ft" | no such band; the title may not exist | use stored titles and 3 to 5 ft | (n/a) |

---

## Staging spot checks (SELECTs for the Mac to run)

Read-only. `:team` = `'6ecdd1a6-63fe-4beb-b094-00118f334163'`. Run on PROSP DATA (`ybmwektreyrwjscxlogv`) with a read-only role.

**A. Roster, coaches, the Thursday practice, attendance, Hargrove**
```sql
-- roster (expect 5 on staging; the design needs 10)
select tm.status::text, p.id, p.first_name, p.last_name
from golf_team_members tm join golf_players p on p.id = tm.player_id
where tm.team_id = :team order by p.last_name;

-- coaches on the team (expect 1; the design needs 2)
select gc.id, gc.full_name
from golf_team_coach_staff s join golf_coaches gc on gc.id = s.coach_id
where s.team_id = :team;

-- team zone
select name, timezone from golf_teams where id = :team;

-- practice events Nov 1 to Nov 14 in the team's zone (the design needs Thu Nov 5 2:00-5:00 PM)
select id, title, event_type, location, status, requires_rsvp,
       start_time at time zone t.timezone as local_start,
       end_time   at time zone t.timezone as local_end
from golf_events e join golf_teams t on t.id = e.team_id
where e.team_id = :team and e.event_type <> 'class'
  and e.start_time >= '2026-11-01' and e.start_time < '2026-11-15'
order by e.start_time;

-- attendance by status for those events
select a.event_id, a.status, count(*)
from golf_event_attendance a join golf_events e on e.id = a.event_id
where e.team_id = :team and e.start_time >= '2026-11-01' and e.start_time < '2026-11-15'
group by 1, 2 order by 1, 2;

-- tournaments in the next weeks (the design needs Hargrove Invitational starting Mon Nov 9)
select id, name, start_date, end_date from golf_tournaments
where team_id = :team and start_date between '2026-11-01' and '2026-11-30';
```
Check `CLASS_EVENT_TYPE`'s value in `src/lib/calendar/class-events.ts` before running. `'class'` above is assumed.

**B. Last 10 team round dates and SG coverage**
```sql
with roster as (
  select player_id from golf_team_members where team_id = :team
), rounds as (
  select r.* from golf_rounds r
  where r.player_id in (select player_id from roster)
    and r.status = 'completed' and r.is_test = false
    and r.round_type in ('practice','qualifier','tournament')
), dates as (
  select distinct round_date from rounds order by round_date desc limit 10
)
select r.round_date, r.round_type, count(*) as player_rounds,
       count(r.strokes_gained_putting) as with_sg,
       round(avg(r.strokes_gained_tee)::numeric, 2)          as sg_tee,
       round(avg(r.strokes_gained_approach)::numeric, 2)     as sg_app,
       round(avg(r.strokes_gained_around_green)::numeric, 2) as sg_atg,
       round(avg(r.strokes_gained_putting)::numeric, 2)      as sg_putt
from rounds r where r.round_date in (select round_date from dates)
group by 1, 2 order by 1 desc;
```
Expect the Sep 25–26 qualifiers with `with_sg = 0`. If every date has `with_sg = 0`, staging can't draw the SG picture.

**C. Putts by band on the same rounds, and three-putts**
```sql
with roster as (select player_id from golf_team_members where team_id = :team),
dates as (
  select distinct round_date from golf_rounds
  where player_id in (select player_id from roster) and status = 'completed' and is_test = false
    and round_type in ('practice','qualifier','tournament')
  order by round_date desc limit 10
),
rs as (
  select id from golf_rounds
  where player_id in (select player_id from roster) and status = 'completed' and is_test = false
    and round_date in (select round_date from dates)
)
select case
         when s.putt_distance_feet < 3  then '0-3'
         when s.putt_distance_feet < 5  then '3-5'
         when s.putt_distance_feet < 10 then '5-10'
         when s.putt_distance_feet < 15 then '10-15'
         when s.putt_distance_feet < 25 then '15-25'
         else '25+' end as band,
       count(*) as attempts,
       round(100.0 * avg(case when s.putt_made then 1 else 0 end), 1) as make_pct
from golf_shots s
where s.round_id in (select id from rs) and s.shot_type = 'putting' and s.putt_distance_feet is not null
group by 1 order by min(s.putt_distance_feet);

-- three-putts per round on the same rounds
select round(count(*) filter (where h.putts >= 3)::numeric / nullif(count(distinct h.round_id), 0), 2) as three_putts_per_round
from golf_holes h where h.round_id in (select id from rs);

-- do golf_shots and putt_details agree on distance and make?
select count(*) as shots, count(pd.shot_id) as with_detail,
       count(*) filter (where pd.made is distinct from s.putt_made) as made_mismatch
from golf_shots s left join putt_details pd on pd.shot_id = s.id
where s.round_id in (select id from rs) and s.shot_type = 'putting';
```
The band edges (lower bound inclusive) must be checked against `putt-distance-buckets.ts`, so the counts match the Stats page.

**D. Cohort gender for the Tour line**
```sql
select o.id, o.name, o.type::text, o.program_type::text
from golf_teams t join organizations o on o.id = t.organization_id where t.id = :team;
```
That `organizations` is the table name and `program_type` the column is assumed from the baseline enums.

**E. Class rows for Thursday**
```sql
select p.first_name, c.class_name, c.days, c.start_time, c.end_time
from golf_player_classes c join golf_players p on p.id = c.player_id
where c.team_id = :team order by p.first_name, c.start_time;

select id, label, classes_start, classes_end, time_zone from golf_team_terms where team_id = :team;
select player_id, status_enabled from golf_player_classes where team_id = :team;  -- the sharing flag column added by 070000
```
The `golf_team_terms` column names are assumed from `ChClassTerm`; check them against `20261025070000_golf_class_awareness_tables.sql`. The RPC itself needs a coach session (`select golf_team_class_day(:team, '2026-11-05')` as the demo coach).

**F. Drill library**
```sql
select category, count(*) from golf_drills group by 1 order by 2 desc;
select id, slug, title, category, duration_min from golf_drills
where title ilike any (array['%clock%','%lag%','%25 in a row%','%up and down%']);
```

**G. Folders and practice-plan documents**
```sql
select coalesce(folder, '(none)') as folder, count(*) as docs,
       count(*) filter (where is_public) as public_docs,
       count(*) filter (where category = 'practice_plan') as plan_docs
from golf_documents where team_id = :team group by 1 order by 2 desc;

select id, title, file_type, file_size, round(file_size / 1024.0) as kb, folder, is_public
from golf_documents where team_id = :team and category = 'practice_plan' order by created_at desc limit 10;
```

**H. Policies and ledger shape**
```sql
select policyname, cmd, roles, qual from pg_policies where tablename in ('golf_documents', 'golf_drills', 'notifications');
select column_name, data_type from information_schema.columns
where table_name = 'golf_coachhelm_action_runs' order by ordinal_position;
select pg_get_constraintdef(oid) from pg_constraint where conname like 'golf_coachhelm_action_runs%status%';
select to_regclass('public.golf_practice_plans') as n00_plans,
       to_regclass('public.golf_team_drills') as n00_drills,
       to_regclass('public.golf_practice_plan_formats') as formats;  -- all three expected null
```

---

## What staging will show (flag on, before any fixture)

| Surface | On staging | Design state it maps to |
|---|---|---|
| calendar step | probably no Thursday Nov 5 practice (check A); the step says "Nothing on Thursday" and the length group has no tick | intake with no guess (not drawn) |
| SG picture | likely lean or empty: summer hole rounds may have shots, the Sep qualifiers don't (check B) | lean read |
| putting picture | depends on summer shot data (check C); bands 3-5 … 15-25 | lean or thin bands |
| class times | 5 players; only if classes and a term exist and sharing is on (check E); else no step | no class step |
| drill bank | the global library count (check F) | drill picture, or "No drills in the bank yet" |
| who | "5 on the roster" (no RSVP rows) | |
| groups | 5 players split 2/2/1 or 3/2 | not drawn (the page has 9) |
| Save / Publish | inert: "Comes with the Practice tab" (N-00 not applied) | |
| folders | whatever `golf_documents` holds (check G) | |
| Told | n/a until N-00; it would be at most 6 (5 players + 1 coach) | |
| plan format | upload works; "Use this format" inert (PM1 held) | |

## What the fixture must add

The preview fixture (`preview/fixtures-practice-plan.ts`, PP0) carries the design's data in code. Staging isn't changed by this lane. If Nick wants staging to show the design, these rows would need seeding, which is a separate decision and is not in the plan:
- **Players:**
  - 4 more, for 9 in groups: the design's Sofia, Maya, Lena, Eli, Jonah, Owen, Nora, Ava and Jade. Staging already has Owen Carter; the rest use new names or rename none.
  - 1 more rostered player with a declined RSVP: "9 going, 1 can't".
- **Coaches:** a second one on `golf_team_coach_staff` (Coach Rivera). The demo coach plays Coach Lin.
- **Events:** a practice event Thu Nov 5 2026, 2:00–5:00 PM America/New_York at "Lakeside Golf Club", `requires_rsvp` true with 9 accepted and 1 declined, and a Tue Nov 10 3:00–5:30 PM practice for the builder's second option.
- **Tournament:** "Hargrove Invitational" starting Mon Nov 9 2026 (`golf_tournaments`, with `golf_tournaments_v1` on, or a `golf_events` tournament row).
- **Rounds:** 10 team round dates with shot-tracked rounds for the roster (about 86 player-rounds), so SG and putting bands have data. That means about 412 putts at 3 to 5 ft for the page's figure. The page's figures (−0.9, 71%) will not come out exactly. The fixture in code is the source for the side-by-side shots; staging is for the "real data" check only.
- **Classes:** a term covering Nov 5, and classes for two players (Ava, Jade) ending 2:15 PM Thursday, with sharing on.
- **Documents:** rows in the folders Practice plans (4), Hargrove Invitational (2), Fall 2026 season (11) and Short game (3), and a 240 KB PDF "Fall practice sheet.pdf" for the format scene.
- **Drills:** library rows matching Clock drill, Lag ladder, 25 in a row and Up and down (check F), with 12 putting and 4 short game, or the page copy changes to the real counts.

## Mock vs real

| Page element | Real at 75b4956 | Real after PP1–PP5 | Real after N-00 | Mock (fixture only) |
|---|---|---|---|---|
| calendar line, length guess | ✓ (`golf_events`) | ✓ | ✓ | |
| Hargrove | ✓ with `golf_tournaments_v1` | ✓ | ✓ | |
| SG by area | rows ✓, read ✗ | ✓ | ✓ | page values |
| putting by band, Tour tick | rows ✓, read ✗, bands differ | ✓ (app bands) | ✓ | page bands and values |
| class times | ✓ (applied RPC) | ✓ | ✓ | |
| drill bank | ✓ (library) | ✓ | ✓ team bank | page counts |
| 9 going, 1 can't | rows ✓, read undercounts | ✓ | ✓ | 10th player |
| 6 plans / 3 groups | ✗ | ✗ | ✓ | ✓ |
| folders and counts | ✓ | ✓ | ✓ | page counts |
| Told 11 | ✗ | ✓ (needs N-00 to publish) | ✓ | ✓ |
| Seen by 4 of 9 | ✗ | ✗ | ✓ | ✓ |
| 240 KB, 1 page, 5 sections | size ✓, parse ✗ | size ✓ | parse ✓ with PM1 | ✓ |
| mix bar, strip, groups, rotation | (body) | ✓ | ✓ | |
| Bring | ✗ | coach-typed only | ✓ if team drills carry equipment | ✓ |

## Bugs and gaps for the builder

1. `getUpcomingEvents` (read-tools 1028) counts only `accepted` and `declined`, while the attendance CHECK has nine statuses. Every RSVP count CoachHelm reports today misses `attending` and `not_attending`. This is not this lane's file to fix (Ask lane or a separate fix), but PP1's read must count all of them.
2. `get_putting_distance_profile` silently skips 0-3 ft because the cache has no attempts column. That is correct, and the comment explains it. The design draws 0–3 ft, so the design changes.
3. The design's Tour putting values don't match `cohort-baselines.ts`. The page, the fixture and any copy must use the real ones.
4. The SG baseline wording ("Tour line") is wrong for SG. Use "scoring baseline".
5. `golf_drills` has no team column and no write policy. "Your drill bank" and New drill can't be real until N-00 010100.
6. `saveTextDocument` defaults to player-visible (`documents.ts` 480). Any plan saved through it must pass `playerVisible: false`. Default 9 avoids it entirely after N-00.
7. The notification's "the putting green" needs an `area` on stations, which N-00's body doesn't have.
8. The coach count: "2 coaches" counts `golf_team_coach_staff` rows. Whether a staff row without a user account counts was not checked.
9. Whether the coach's Hub counts already include `is_public = false` rows (spot check G against `data/hub.ts` 897) was not checked; the Save list must match the Hub.

## Completeness pass, 4 Nov 2026

Read against the same code (75b4956) and the held N-00 and N-10 files in `../prerequisites/`. These rows cover the figures on the S-PRC.* screens (05's section of this name) and settle the drill bank and folder sources the coordinator asked for. Same table shape as §11.

### C.1 The one drill bank (settles §5)

| Figure | Source | Note |
|---|---|---|
| "Your drills" list, drill counts by area, the drill step picture | `golf_team_drills` (N-00 010100) for the team, `archived_at` null, grouped by `area` | once 010100 is applied; Ask's HM5 (`golf_drills.team_id`) is superseded and never read |
| "GolfHelm drills" | `golf_drills` (baseline 9472), read only | the library; a coach copies with `copyLibraryDrill` |
| a new drill from the builder, Ask or the quick chat | insert into `golf_team_drills` through `createTeamDrill` | one bank for every surface; nothing writes `golf_drills` |
| "Used in 4 plans" | count of the team's plan bodies and frozen versions naming the drill id | N-00 §4.1 |
| drill names on a published plan | the frozen card in the version (010600) | never re-read from the bank |
| before 010100 | `golf_drills` only; step label "Reading the drill library"; New drill inert | §5 finding 4 kept |

### C.2 The one folder model (settles §9)

| Figure | Source | Note |
|---|---|---|
| folder names and counts in Save to, the builder's Save row, the quick chat list | `listPlanFolders(teamId)`: `golf_documents.folder` grouped, coach scope | counts all documents, as the Hub (§9) |
| the folder a plan sits in | its Documents row's `folder` (010400 links it by `practice_plan_id`) | any coach folder; publishing keeps it |
| empty folder | none until N-10's 090200; a folder exists while one row names it | Undo of the only row removes the name |
| reserved names | "Team" (null folder in the Hub) can't be made; "Practice plans" is always listed | N-10 CH-10162 |
| Documents back link from a plan | the row's `folder`, slugged as N-10 does | not always `practice-plans` (02 C.2) |

### C.3 Figures on the S-PRC.* screens

| Figure | Source | Note |
|---|---|---|
| This week tiles: day, time, chip | `golf_events` `event_type = 'practice'`, not cancelled, team-zone week; chip from the plan's `status` and `published_version` vs the draft's version | "Updated" when the draft is newer than the live version |
| "Team time this week: 14 h 30 scheduled" | sum of timed practice and qualifier event lengths in the team-zone week | omitted when none (N-00 4.1) |
| plan row: "2:00 Warm-up · 2:15 Short game rotation" | the first two blocks of the body, start = event start + block offset | team zone |
| "Seen by 9 of 11" | N-00 opens table (010000) and the version's audience | hidden before 010600 |
| "Edits not published" | draft version > published version | N-00 4.1 |
| Past plans count "(12)" | plans with event start before today in the team zone | 20 at a time |
| ribbon "2 h 45 of 3 h" and overrun | body minutes against the event length | CH-17106 past the end |
| mix bar | `mixMinutes(body)` (§11) | routine blocks left out |
| rotation grid | `(g + t) mod S` per N-00 4.5 | stations by turn |
| arrival warning | the player's class end from the class-times read, never the class name | N-00 owner call V1-4 |
| group cards: "8 players", "Used in 6 plans" | `golf_practice_groups` (010200) members; plan bodies naming the group id | |
| template card "Session · 3 h" | `golf_practice_templates` (010300) body length | starters from `starters.ts` |
| player Today card | the published version's lines for this player (010600 `golf_practice_plan_lines`) | only their group's stops (default 7) |
| player Team drills | drills in the team's live versions this season | season from `seasonStartDate`, 1 Aug in the team zone |
| Copy a past practice list | `listCopyablePlans`, newest first, same series first | drops own-work lines and pairings |

### C.4 Time, season and people

| Case | Rule | Check |
|---|---|---|
| team zone | every time on these screens is formatted in the team zone (`season.ts`, fallback America/New_York); block starts are minutes from the event's start instant, so a daylight saving change inside a practice reads correctly | unit: a practice across 1 Nov 2026 |
| 1 Aug rollover | Past plans and Team drills group by the season that holds the event date; a plan for 2 Aug is a new-season plan even when drafted in July | unit: 31 Jul and 1 Aug fixtures |
| player leaves after publish | loses the version, lines and the Documents row; struck through in the draft until the next save | N-00 §10 |
| player joins after publish | sees "Everyone" (CH-17305); listed as not in a group in Groups (CH-17105) | N-00 §10 |
| plan's event deleted | plan, versions, lines, opens and the Documents row cascade; links land on Practice home with CH-17302 copy | N-00 §10 |
| two coaches at once | every save carries the version; the second gets CH-17505 | N-00 §10 |

### C.5 Spot check to add

H. `select folder, count(*) from golf_documents where team_id = $1 and category = 'practice_plan' group by folder;` (read-only) shows whether any team already keeps plan documents outside "Practice plans", which is what N-10's 090300 check would refuse.
