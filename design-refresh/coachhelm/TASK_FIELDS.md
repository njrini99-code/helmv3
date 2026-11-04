# CoachHelm task fields: what every task writes, and when it must ask

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 15 rows).

One field spec for both CoachHelm lanes: the Ask tab (lane 4, `ask/ASK_REDESIGN.md` §3 item 15) and the top bar quick chat (lane 5, `coachhelm/QUICK_CHAT.md`). Both lanes build on the same `CreateFlow` engine and the same server tools, so this file is the single source for which columns a task fills, where each value comes from, and when the flow stops to ask. If a design page and this file disagree, this file wins and the design page gets fixed.

Read against helmv3 at `75b4956`, read only. Every claim carries a file:line. Paths are repo-relative; `BASE` is `supabase/migrations/20260527000000_prod_public_baseline.sql`. Migration status comes from `supabase/migrations/HELD.md`, which is newer than several file headers that still say HOLD. The live database was not queried.

Nick, 15:10: "We are really going to have to pay close attention to what fields are in each task it completes so it's filling in the correct stuff, if it needs to ask additional questions before completing task that's cool. They need to be accurate though."

## Contents

1. How to read a matrix
2. Seven rules every task follows
3. The Undo hold (how 8 seconds is made real)
4. Status of every flow
5. Flow matrices: Event, Recurring practice, Announcement, Message draft, Poll, Travel, Board, Qualifier, Lineup, Task, Goal, Focus area, Round note, Drill, Practice plan and folders, Blocked time, Team break, Term, Availability note, Recruit
6. Where the Ask design must change to match the data
7. Server work the flows need (ordered)
8. Tool limits that must match the action limits

---

## 1. How to read a matrix

Each flow has one table. The "Fill" column uses five words, and the confirm card shows the same source on every value so the coach can see where it came from (the Ask lane's "Worked out" pills).

| Fill | Meaning | Card shows |
|---|---|---|
| Fixed | Set by the tool every time. The coach never sees a choice. | Nothing, or a plain line when it matters ("Players can see this") |
| Context | Taken from the server session: team, coach, the screen the coach is on. Never from the model. | Nothing |
| Read | Worked out from a read tool, and only when the read gives exactly one answer. | A pill naming the source: "Wed Nov 4 · 4:00 PM · Calendar and classes" |
| Coach | The coach's own words, resolved (dates in the team zone, names to roster ids). | The value, plain |
| ASK | Required, not in the coach's words, and no read answers it with one value. The flow stops and asks before the draft. | A question in the brief card |

"Not set" on the card means an optional field left empty on purpose. A required field is never "Not set".

## 2. Seven rules every task follows

1. **One time zone.** Resolve the team zone with the calendar's own function (`resolveTeamTimeZone`, `src/lib/calendar/availability.ts:670-699`, reads `golf_team_settings.timezone`, falls back to `America/New_York`). Today the chat reads `golf_teams.timezone` instead (`src/lib/coachhelm/v3/chat/context.ts:46,113`), and 5 of 10 production teams have no settings row (`availability.ts:662`). When the two disagree, the flow asks once and the answer is saved to the team setting. Dates go out as `YYYY-MM-DD`, times as `HH:MM` 24 hour, and every timed write carries the offset for that date (DST included).
2. **Players by roster id only.** Names go through `resolveRosterPlayerByName` (`context.ts:202-222`; `find_player`, `read-tools.ts:1526-1536`): exact full name, then unique first name, then unique prefix, then unique substring. A null means ASK with the candidates shown. Never pick one. If the roster read failed (`ctx.roster_failed`, `context.ts:56`), "the team" or "everyone" is an ASK, not a guess.
3. **Never ask what a read answers, never guess what it doesn't.** This is the Ask lane's rule (§3 item 15) made strict: a Read fill needs exactly one result. Zero or two or more results is an ASK.
4. **Every value written is on the card.** Including defaults that matter ("Squad: 5, coach picks 1" is never silent). The "On confirm:" line names exactly who is told, how (bell, email, push), and that it waits until Undo closes.
5. **The receipt only claims what was read back.** After the write, read the row back and build the receipt from it. This catches the qualifier's silent course failure (`qualifier-actions.ts:236-242`) and any field the action drops.
6. **Coach-only data stays coach-only.** Availability notes, recruit contact details, coach's pick reasons and lineup reasoning never go into a player-visible field, message, task or event description.
7. **Nothing changes what shot tracking collects.** Flows only read stored shots.

## 3. The Undo hold (how 8 seconds is made real)

Every reader found the same thing: no write that tells players can be taken back after the server call, because the bell, email and push fire inside the call or in `after()` straight after it.

| Flow | Where the telling happens |
|---|---|
| Event with replies on | `after(() => fanOutEventInvitation)`, `calendar-events.ts:515`; bell rows `rsvp.ts:266-283` |
| Recurring series with replies on | `after()`, whole active team, `recurring-events.ts:982-1012` |
| Announcement | inside the call, `announcements.ts:619-678` |
| Task | awaited inside the call, `tasks.ts:461-516` |
| Focus area | awaited inside the call, `development.ts:478` (fixed 4 Nov wiring: `notifyPlayerOfProposedFocus` at :495 on 03d9087) |
| Qualifier | inside the call, `qualifier-actions.ts:286-330` |
| Goal | inside the call, `goals.ts:290-292` |
| Round note | inside the call, `round-coach-note.ts:86` |

So the Undo window holds the call itself, on the server:

1. Confirm records the plan in the action ledger (`recordProposal`, `agent-tools.ts:400-437`) with status `held` and `run_at = now + 8s`, and returns at once. (fixed 4 Nov wiring, 03d9087: the proposal is written by `proposeGated` (`agent-tools.ts:317`) through `recordProposal` (`action-runs.ts:96`) as `proposed`; the coach's press reaches `executeGated` (`agent-tools.ts:372-437`), where AK4's `holdForExecution` moves the row to `held` with `run_at` instead of claiming it at once.) The ledger needs `run_at` and the statuses `held` and `cancelled`, which it doesn't have today (status CHECK at `20260725170000_coachhelm_action_runs_and_ui_parts.sql:62`): that is the Ask lane's held migration HM1 (`ask/02-PLAN.md`), written and not applied. Until it is applied the flags stay off and writes behave as today, never with a fake Undo. The receipt shows with the draining ring.
2. The confirm request schedules `after(async () => { await wait(until run_at); claimForExecution(...) })`. `claimForExecution` refuses a row whose status is `cancelled`.
3. Undo sets the row to `cancelled` (coach-scoped, only while `run_at` is in the future). Nothing was written and nobody was told, so there is nothing to take back.
4. Open during the window commits early: it sets `run_at = now`, runs the write, then navigates. Closing the panel or the app does not cancel, because the hold lives on the server.
5. A sweeper runs overdue `confirmed` rows (fixed 4 Nov wiring: `held`, the status HM1 adds; there is no `confirmed`) on the next chat request, in case `after()` died. The plan's idempotency key keeps it to one run.
6. When the window closes the receipt's ring finishes and the Told row appears, built from the read-back.

One mechanism for every flow, quiet writes included, so there is one code path to test. It also means no new delete actions are needed for Undo (qualifier, term and goal have none today). Polls and the Ask tab's message drafts are different: they land in the Messages composer and the coach presses Send there, so there is nothing to hold. The quick chat's message card is the one exception: its "Send to N players" button is the coach's own Send press, and the send goes through `sendGolfMessage` under the same 8 second hold, so Undo returns it to a draft before anyone gets it (quick chat 01-BRIEF §5, call 7).

## 4. Status of every flow

| Flow | Lane | Server path today | Status |
|---|---|---|---|
| Event (one-off) | Ask, quick chat | `createGolfEvent`, `calendar-events.ts:537` | Ready, with fixes in §7 (all-day default, offset) |
| Recurring practice | Ask (existing tool) | `create_recurring_practice`, `agent-tools.ts:721-876` | Fix first: DST, first date, whole-team fan-out |
| Announcement | Ask | `create_team_announcement`, `agent-tools.ts:707-719` | Ready; drop "later" and "linked trip" |
| Message draft | Ask, quick chat | `messagesPrefillHref`, `prefill.ts:49-62` | Needs `conversationId` on the prefill |
| Poll | Ask | `sendGolfPoll` (coach sends) | Needs a poll prefill; delete broken until 140800 |
| Travel | Ask | `createGolfTravelItinerary`, `travel.ts:295` | Ready (rooms and gear are text) |
| Board for a player | Ask | none | Needs PNG into the composer |
| Qualifier | Ask, quick chat | `createGolfQualifier`, `qualifier-actions.ts:349` | Ready with fixes; drop exemptions and tie rule |
| Lineup | Ask | `golf_tournament_set_entries` RPC | Ready; add roster check; lock is its own step |
| Task | Ask | `create_task`, `agent-tools.ts:693-706` | Ready with fixes (priority, key, category) |
| Goal | Ask | `createGoal`, `goals.ts:312` | Ready; eight stats only |
| Focus area | Ask (existing tool) | `create_focus_area`, `agent-tools.ts:663-691` | Ready; return the id |
| Round note | Ask | `saveRoundCoachNote`, `round-coach-note.ts:101` | Ready; the player always sees it |
| Drill | Ask | none for coaches | Not buildable until the team drill bank ships |
| Practice plan and folders | Ask, quick chat | none (plans not built) | Waits on N-00 and N-10; folder rule needs a call |
| Blocked time | Ask | `addCoachBlockedTime`, `calendar-blocked-time.ts:154` | Ready |
| Team break | Ask | `addTeamBreak`, `class-status.ts:205` | Ready |
| Term | Ask | `saveTeamTerm`, `class-status.ts:200` | Ready |
| Availability note | Ask | `setPlayerAvailabilityCoachNote`, `team-management.ts:594` | Ready |
| Recruit | Ask | `createRecruit`, `recruiting.ts:340` | Ready |

No CoachHelm write tool exists yet beyond the four in `CONFIRM_REQUIRED_TOOLS` (`agent-tools.ts:102-107`). Every other flow needs a new tool that calls the action named here, behind the same `proposeGated` / `executeGated` gate.

---

## 5. Flow matrices

### 5.1 Event (one-off) · `golf_events` · `createGolfEvent`

Input `GolfEventInput` `calendar-events.ts:222-258`, zod `:198-221`. CHECK end ≥ start only (`20260610070000:27-29`); no CHECK on type or status.

| Field | Column | Req | Default today | Fill | Validation |
|---|---|---|---|---|---|
| Title | `title` | yes | none | Coach; else propose "Team practice" style from the type, editable | 1-200 |
| Type | `event_type` | yes | none | Coach mapped to `practice, tournament, qualifier, meeting, travel, other`. ASK when two fit, or "block off" could mean the coach's own busy time (5.16) | never `class` (generated by class sync) |
| Date | `start_time` | yes | none | Coach, in the team zone. ASK if relative and ambiguous, or in the past | `YYYY-MM-DD` |
| Start | `start_time` | timed: yes | none | Coach, or Read: the one slot every invitee is free (`checkScheduleConflicts`, `calendar-events.ts:1660`) | `HH:MM` |
| End | `end_time` | timed: yes | null; forced null if before start (`:419-424`) | Coach, or a stated length. ASK otherwise; the code supplies no length | ≥ start |
| End date | `end_time` | no | = date | Coach (multi-day) | ≥ date |
| All day | `all_day` | always send | **action default true** (`:371`) | Fixed: `false` whenever a time exists; `true` only on "all day" or dates without times | |
| Offset | drives `start_time` | always send | **UTC when omitted** (`:48-52`) | Context: team zone offset on that date | |
| Where | `location` | no | null | Coach. Read may suggest past team locations; never fill silently | ≤500 |
| Course | `course_id` | no | omitted | Read only on one exact course name match | `courseName` is dropped (`:384`) |
| Notes | `description` | no | null | Coach | ≤5000 |
| Mandatory | none | | | Do not offer: `isMandatory` is accepted and dropped (`:213`, insert `:373-402`) | |
| Invitees | `golf_event_attendance` rows | no | none | Coach names to roster ids; "team" = active roster | non-roster ids silently dropped (`rsvp.ts:211-227`) |
| Ask for replies | `requires_rsvp` | | false | Fixed false unless the coach asks for replies | decides every notification |
| Reply by | `rsvp_deadline` | no | null | Coach, only with replies on; ASK once if replies on and none given | wall time with offset |
| Cap | `max_attendees` | no | null | Coach | int > 0 |
| Request id | `id` | | new uuid | Fixed per intent, kept across retries (`:412`) | repeat returns the row |
| Status | `status` | | action writes `confirmed` (`:401`) | Fixed | |
| Team, creator | `team_id`, `created_by` | | | Context | |

Tells: invitees get bell, email and push only when `requires_rsvp` (`calendar-events.ts:513-515`). Reminders are not a per-event field: the hourly cron reminds RSVP events at the team's leads (default 24 h and 1 h, `src/app/api/cron/event-reminders/route.ts:279,295`). The card says "Reminders 24 h and 1 h before (team setting)" only when replies are on.

Ask when: type ambiguous; timed with no start, or no end or length; date relative and ambiguous or past; a name returns null; a meeting with no invitees (players can't see it, `20261018120000:159-171`); replies on with no deadline (once); the free-slot read is partial (say incomplete, never "free"); no free slot in 7:00-19:00; a new location string; team zones disagree; a tracked tournament (different path, `tournaments-calendar.ts:366`).

### 5.2 Recurring practice · `create_recurring_practice` → `createRecurringEvent`

Tool zod `agent-tools.ts:725-747`; planner `practice-planner.ts:99-326`; action `recurring-events.ts:1121`.

| Field | Fill | Note |
|---|---|---|
| Days | Coach (`weekdays`, 0 = Sunday) | weekly only |
| How many | Coach (`count` 1-26). ASK when no end is given | the tool requires it (`agent-tools.ts:735-741`) |
| First date | Coach, else Read: next matching day **in the team zone** | today it uses server UTC (`practice-planner.ts:82-88`) and can land on the wrong day near midnight |
| Time, length | Coach; ASK if missing | |
| Time zone | Context: pass `timeZone`, not only one offset | today only the first date's offset is passed (`:270-281`), so every date after a clock change is an hour off |
| Invitees | Coach; "team" = roster | today no ids means the whole roster (`:120-123`); the card must say so |
| Replies | Fixed off unless asked | with replies on, today the series tells **every active team member**, not just invitees (`recurring-events.ts:982-1012`). Fix before offering replies on a series |

Idempotency key today ignores invitees, location and replies (`practice-planner.ts:226-237`): add them.

### 5.3 Announcement · `create_team_announcement` → `createEnrichedAnnouncement`

Planner `action-planners.ts:324-371`; execute `:373-421`; action `announcements.ts:741` (impl `:254-713`).

| Field | Column | Req | Fill | Validation |
|---|---|---|---|---|
| Title | `title` | yes | Coach, or a short title the flow writes and shows | tool 1-120 (action allows 200) |
| Message | `body` | yes | Coach, shown word for word | tool ≤2000 (action allows 10000) |
| Urgency | `urgency` | | Fixed `normal`; Coach "urgent" → `urgent`. Never send `high` or `low` (Clubhouse shows `high` as Urgent, `model.ts:289`; only `urgent` passes the class push hold, `announcements.ts:667`) | |
| Got it | `requires_acknowledgement` | | Coach ("make sure they read it"), else false | |
| To | `golf_announcement_recipients` | | Fixed null = whole team; Coach names to roster ids | every id must be on the active roster (`:300-310`) |
| Files, tasks | | | Not exposed (`documentIds: []`, `inlineTasks: []`) | |
| Send later | `publish_at` | | **Not supported**: no write path sets it; the action stamps now (`:350`) | |
| Linked trip | none | | **Not supported**: put trip details in the body | |
| Team | `team_id` | | Context, from the cookie at execute time (`:277`). If the coach switched teams since the card, refuse and re-plan | |

Tells: bell, email and push to every recipient, inside the call. The card's "On confirm:" line must say all three (today's receipt says only "In-app … sent", `action-planners.ts:414`).

Ask when: no clear title or body; the audience is a group word ("the travel squad") that isn't named players; the coach asks for later (say it goes out on Confirm); the body is over 2000.

### 5.4 Message draft · lands in the composer, the coach sends

`messagesPrefillHref({players, draft, title})` (`src/clubhouse/screens/messages/prefill.ts:49-62`), read once by `takePrefill` (`:65-86`; `Messages.tsx:182-213`). Send is the coach's, through `sendGolfMessage` (`src/app/actions/messages.ts:808`).

| Field | Fill | Rule |
|---|---|---|
| Thread | One player: Read from the roster id. A named group or team chat: Read only when exactly one conversation **the coach is in** has that title (case-insensitive, trimmed). Else ASK | needs new `ChPrefill.conversationId`: today a prefill can't open an existing group (`prefill.ts:20-26`) |
| Recipients (new thread) | Coach names to roster ids | players with no account can't be messaged (`Messages.tsx:189-203`); say so |
| Group name (2+ players, new) | Coach; ASK if none | today, a title that matches an existing group with different members **adds the new players to the oldest such group** (`messages.ts:989`). The flow must check first and warn |
| Draft | Coach's words, drafted and editable | ≤2000: the prefill cuts silently at 2000 (`prefill.ts:52,80`) though Send allows 5000 |
| Notify anyway | Fixed false; the coach chooses in the composer | |

Build the href in the browser only (`prefill.ts:54-60`); a server-built key opens an empty composer with no error. If the coach already has an unsent draft in that thread, it silently wins (`Messages.tsx:207-208`): the flow must say "You already had a draft there".

Ask when: the group title matches 0 or 2+ of the coach's threads; "the team" (team chat, new group, or announcement?); a name is not found or has no account; a new group with no name; a draft over 2000.

Quick chat: the card shows the thread, every recipient and the whole draft, and its primary is "Send to N players". That press is the coach's Send. It is held 8 seconds like every other write (§3), then sent through `sendGolfMessage` with the coach as the sender; Undo inside the window puts it back to a draft. Every rule above still applies (thread match, account check, 2000 cap, the coach's own unsent draft).

### 5.5 Poll · lands in the group's composer, the coach posts

`PollDraft {question, options[], multi, closesAt}` (`src/lib/golf/message-polls.ts:89-94`); send `sendGolfPoll` (`src/app/golf/actions/message-polls.ts:175`).

| Field | Fill | Validation |
|---|---|---|
| Group | as 5.4; must be a group thread (`polls.tsx:598-600`) | |
| Question | Coach | 1-140 after whitespace collapse |
| Choices | Coach, or Read (e.g. nights everyone is free), shown for the coach to edit | 2-6, each 1-60, no duplicates ignoring case |
| More than one answer | Coach ("pick all that work" → true), else false | |
| Closes | Coach, in the team zone; ASK if vague | future, ≤30 days |
| Anonymous | Not supported: every member can see who voted (`20261024090000:99-105`). Say so | |

Needs a poll prefill (the sheet keeps drafts in memory only, `polls.tsx:573-583`). Deleting a poll fails on production until held `20261028140800` is applied (HELD.md:267); apply it before polls go live.

### 5.6 Travel · `golf_travel_itineraries` · `createGolfTravelItinerary`

Action `travel.ts:295` (impl `:171-293`, zod `:28-51`).

| Field | Column | Req | Fill | Validation |
|---|---|---|---|---|
| Trip | `event_name` | yes | Coach, or the linked event's title | 1-200 |
| Where | `destination` | yes | Coach | 1-200 |
| How | `transportation_type` | yes | Coach; ASK if not said | `bus, van, flight, carpool` (DB allows `other`, the action refuses it) |
| Leave date | `departure_date` | yes | Coach, team zone; ASK if vague | |
| Leave time | `departure_time` | no | Coach, or Read: back-timed from the first tee time and drive time, shown as a pill | `HH:MM` |
| Leave from | `departure_location` | no | Coach | ≤500 |
| Back | `return_date`, `return_time` | no | Coach | the flow checks return ≥ leave (the action doesn't) |
| Flights | `flight_info` `{text}` | no | Coach | ≤1000 |
| Hotel | `hotel_name`, `_address`, `_phone`, `_confirmation` | no | Coach, or Read from the last trip to the same place (pill) | every team member can read the confirmation number (`BASE:17300-17306`); say so on the card |
| Check-in, check-out | none | | Do not fill: accepted and dropped (`travel.ts:223`) | |
| Rooms | `room_assignments` `{text}` | no | Coach; the pairing visual writes plain lines ("Sam + Alex") | ≤2000, free text |
| Uniform | `uniform_requirements` | no | Coach | ≤1000 |
| Gear | `gear_list text[]` | no | Coach or Read (last trip), sent as an array | the action splits a string on commas; never let one item hold a comma |
| Notes | `notes` | no | Coach | ≤5000 |
| Event link | `event_id` | no | Read only when exactly one team event matches name and dates; else ASK | travelers are that event's invitees |
| Travelers | `golf_event_attendance` on the event | no | Coach names; needs a linked event | via `updateGolfEvent` add/remove (`hub/writes.ts:132`) |

Tells: nobody (`travel.ts:262`); players see it as unseen travel in their badge. Ask when: no transport; vague departure; return before departure; 0 or 2+ events match; travelers named but no event.

### 5.7 Board for a player · lands in the player's composer as an image

No path today: attachments are files the coach picks (`PendingAttachment.file: File`, `src/lib/storage/attachments.ts:94-104`); the prefill carries text only. New code renders the board to a PNG `File` in the browser (the round card already does, `rounds/card/draw-card.ts:313`) and seeds it into the composer as a `PendingAttachment`. The coach presses Send; the normal upload runs. Image ≤10 MB. Thread rules as 5.4. Do not use the unused `kind='travel'|'practice'|'event'` messages (no renderer exists).

Fill: Player (Coach, roster id); visuals (Coach or Read: rounds to use, lead with the open focus area); note (Coach, optional). Ask when the player is ambiguous or has no account.

### 5.8 Qualifier · `golf_qualifiers` · `createGolfQualifier`

Zod `qualifier-actions.ts:33-76`; writes in order: qualifier row (`:175-205`), round courses best effort (`:212-243`), entries (`:246-283`), notifications (`:286-330`). Copy the Clubhouse caller's shape (`src/clubhouse/screens/qualifiers/QualifierForm.tsx:99-117`).

| Field | Column | Req | Fill | Validation |
|---|---|---|---|---|
| Name | `name` | yes | Coach. ASK if none; never invent one | 1-200 |
| About | `description` | no | Coach | ≤2000 |
| Starts | `start_date` | yes | Coach, team zone; or Read: two free days (pill). ASK if vague | |
| Ends | `end_date` | no | Coach, only from a range | ≥ start |
| Entry deadline | `entry_deadline` | no | Coach | ≤ start; display only |
| Rounds | `num_rounds` | yes | Coach. **ASK if not said; never default to 1.** If 1, confirm it (as `model.ts:609-611`) | 1-50 |
| Course per round | `golf_qualifier_round_courses.course_id`, `course_name` | no | Read only on one name match (`listCoursesStrict` + saved courses, `writes.ts:110-122`); else ASK with a short list | one row per round |
| Tees per round | `tee_id` | no | Read only from **that course's** non-draft tees, one match or one tee; else ASK | no FK: a wrong tee is stored silently |
| Rules | `rules` | no | Coach. A counting or tie wish goes here as text only | ≤5000 |
| Squad size | `selection_slots_total` | DB default 5 | Coach. **ASK if not said**: 5 is a silent guess about who travels. "5 spots" means this field | 1-12 |
| Coach's picks | `selection_slots_coach_pick` | DB default 1 | Coach. **ASK if not said**. "Exempt" players map here only if the coach agrees | 0 ≤ picks ≤ squad |
| Spots available | `spots_available` | | Leave empty: legacy, nothing reads it | |
| Players | `golf_qualifier_entries.player_id` | ≥1 | Coach names, or "everyone" = active roster; confirm if that includes injured or away players | must be active roster |
| Holes | none | | Fixed 18 by the server (`:1007`) | |
| Status, state, team, creator | | | Fixed / Context | |

Not fields, so the flow never asks for them: exemptions (none exist), tie rule (the server ranks: full cards above short ones, then to par, then strokes, `ranking.ts:82-94`; a tie at the cut always waits for the coach, `service.ts:313-321`), counting rule (every completed round is summed; no best N of M, `loader.ts:78-110`), visibility (the whole team sees it on insert, `BASE:19459`).

Tells: every entrant with an account gets bell, email and push inside the call. The card says "On confirm: N players get a push and an email once Undo closes". The email always says "1 round" today (`:309`): fix before launch. Read the round courses back before the receipt claims them (`getQualifierRoundCourses`, `:429`).

Ask when: rounds not said (or 1); squad size or coach's picks not said; a course matches 0 or 2+, or the tee isn't said and there are several; different courses per round with no mapping; a name matches 0 or 2+; vague start; the coach mentions exemptions, a drop round, best N of M or a tie-break (say it's not a field; offer coach's picks or Rules text).

### 5.9 Lineup · `golf_tournament_set_entries`, then a separate lock

Action `setTournamentEntries(id, entries, version)` (`tournaments.ts:357`; RPC `20261024100200:440-489`). Lock `lockTournamentLineup(id)` (`:361`; RPC `:494-527`). Flags `golf_tournaments_v1` and `golf_clubhouse_ui` (`tournaments.ts:57`).

| Field | Fill | Validation |
|---|---|---|
| Tournament | Context (on screen), else Read by name and date; ASK on 0 or 2+ | |
| Version | Read just before writing, always passed | `stale` if another coach changed it |
| Player | Coach names, or Read from qualifier standings; **the flow must restrict to the active roster itself** (no check in the RPC, action or RLS) | |
| Role | Coach: `lineup`, `alternate`, `individual`; ASK if unclear | |
| Slot | Coach's order, or Read from standings order; ASK if neither | 1-9, unique, required for `lineup`; lineup count ≤ `players_per_team` |
| Reasoning | Coach | ≤500; coach-only; survives entry removal |

A tie for the last spot always waits for the coach. Lock is its own confirm, never part of "set the lineup": its card says it can't be undone after the hold and that substitutions only work if the event allows them (`:530`). The lineup also locks itself when the first round goes live (`:645-647`). Nobody is told (`:53-56`).

### 5.10 Task · `create_task` → `createTask`

Tool `agent-tools.ts:693-706`; planner `action-planners.ts:211-293`; action `tasks.ts:541`.

| Field | Column | Fill | Validation |
|---|---|---|---|
| Title | `title` | Coach | 1-160 |
| Details | `description` | Coach | ≤600 |
| Due | `due_date` | Coach in team zone, or Read from the calendar (pill). "No due date" shown if none; ASK once if a deadline was implied | `YYYY-MM-DD` |
| Priority | `priority` | Fixed `normal`; Coach "high" or "low". **Send `low`, `normal` or `high` only**: the tool sends `medium` today, a third spelling (`action-planners.ts:265`) | no CHECK |
| Category | `category` | Coach mapped to the UI's categories; ASK if the word isn't one. The tool never sends it today, so its tasks show under no filter (`tasks.ts:340-345`) | |
| Assignees | `golf_task_assignments` | Coach names, or Read (players on the matching focus area, pill). Today no ids = whole roster (`action-planners.ts:221-224`); the card must name the count | on the team |
| Reminder | `golf_task_reminders` + `reminder_at` | Coach; ASK for a time if only a day is given | team-zone offset |
| Repeat | `createRecurringTask` (`tasks.ts:802`) | Coach | |

Tells: bell and email to every assignee inside the call; push only from the reminder cron. Idempotency key is title + due date only today (`action-planners.ts:250`): add assignees, or "same task for Alex" reports already done. Ask when: a name tie; the team when the roster read failed; ambiguous due date; reminder day without a time; an unknown category; a duplicate open task (`get_open_tasks`).

### 5.11 Goal · `golf_goals` · `createGoal` (coach for a player)

Action `src/app/golf/actions/v3/goals.ts:312`. No coach-side UI caller exists today.

| Field | Fill | Validation |
|---|---|---|
| Stat | Coach mapped to one of eight: `sg_total, sg_ott, sg_approach, sg_around_green, sg_putting, gir_pct, scrambling_pct_sand, penalty_rate_per_round` (`window-metric-ids.ts:16-25`). ASK if ambiguous ("short game") | anything else is refused |
| Title | Fixed "<stat label>, <N>-day goal" (`GoalSheet.tsx:134`) | sent to the player |
| By when | Coach; ASK if missing | 7-365 days |
| Target | Coach, or Read: the engine's suggestion (`suggestGoalTarget`), with the source shown | must beat the server-measured baseline |
| Target source | `manual` or `midpoint` to match | |
| Baseline | Never filled: the server measures it | |
| Player | Coach name to roster id | active member |
| Team | Context, passed explicitly (the action takes it as input, `:127-129`) | |
| Mode | Coach: "assign" or "required" → `mandatory` (auto-accepted), else `suggested`. ASK if "give Sam a goal" | |

Tells: push "New goal from your coach" inside the call. "Team goal" is an ASK: the same goal for each player (each is told) or a season team goal (N-01, not built). The player-to-team database binding is not in production (HELD.md:353-354), so the action's own check is the only guard: keep it.

### 5.12 Focus area · `create_focus_area` → `createFocusArea`

Tool `agent-tools.ts:663-691`; action `development.ts:515`.

| Field | Fill | Validation |
|---|---|---|
| Player | Coach name to roster id | active member |
| Title | Coach | 1-120 |
| Area | Read from the words ("putting" → `putting`); ASK if unclear | 8-value enum |
| Metric | Read only when `resolveFocusTargetMetric` resolves it; else free text, flagged | ≤60 |
| Current | Read: the player's metric with its window shown. Never invented | |
| Target | Coach; ASK if a metric was given without one | must point the right way |
| By date or over rounds | Coach, never both | rounds 1-60 |
| From insight | Context (the insight on screen) | same player and team |
| Status | Fixed `proposed` | |

Tells: bell and email to the player inside the call. Return the new id from the action (today it returns none, `:490`). Ask when: a name tie; metric without target; both date and rounds; an active area on the same metric exists (the guard fails open on a read error, `:245-252`, so pre-check).

### 5.13 Round note · `golf_round_reviews.coach_notes` · `saveRoundCoachNote`

Action `round-coach-note.ts:101`.

| Field | Fill | Validation |
|---|---|---|
| Round | Context (on screen), else Read by player, date and course; ASK on 0 or 2+ | completed, not a test |
| Note | Coach, verbatim; tidy only if asked. Read may propose the hole and what happened from stored shots | 1-2000 |
| Visibility | **None exists: the player always sees it** (`CoachNote.tsx:13-17`; player RLS reads every column, `BASE:20127`) | |

The card says "Sam will see this note". Tells: the player, inside the call. An existing note is overwritten with no history: ASK "replace or add to it?" and show the old note. Ask when the round isn't completed (can't save).

### 5.14 Drill · not buildable today · lands in `golf_team_drills` (N-00 010100, held) once applied

`golf_drills` has no `team_id` and coaches have read-only access (`BASE:18633`). The team drill bank `golf_team_drills` is planned in held `20261026010100` (N-00 §8.3) and not in the repo. Until it ships, the flow says it can't save a new drill yet and offers to put the drill into a practice plan block. Planned fields when it ships: `name` 1-80, `area` (`putting, short_game, bunker, approach, tee, course, fitness, mental`), `kind` (`skill, random, pressure`), `minutes` 1-180, `players` (`solo, pairs, group`), `equipment`, `setup`, `goal`, `scoring`, `levels`, `tags`, `media_url`; archive, not delete.

(fixed 4 Nov: one drill bank for every surface. A new drill from the builder, the Ask tab or the quick chat lands in N-00's `golf_team_drills` through `createTeamDrill` (or `copyLibraryDrill` for a GolfHelm library drill), and nothing writes `golf_drills`. The Ask lane's HM5 `20261101090400_golf_drills_team_bank`, which would have added `team_id` and write policies to `golf_drills`, is superseded and not written; `create_drill` registers only when `golf_team_drills` exists. The fields above are 010100's columns and CHECKs. Before 010100 the reply is "Drill bank comes with the Practice tab" and the drill goes into a plan block instead, and the drill-bank read step reads "Reading the drill library" over `golf_drills`.)

### 5.15 Practice plan and folders · waits on N-00 and N-10

Built today: documents only. `saveTextDocument(teamId, title, content, options)` (`documents.ts:521`) saves markdown with category `practice_plan`, and **defaults to visible to players** (`is_public: true`, `:480`): any save before N-00 must pass `playerVisible:false`. A folder is just text on the document (`golf_documents.folder`); there is no folder table, so an empty folder can't exist. Move or rename with `updateGolfDocument` (`:1605`). Nobody is told.

Planned (N-00 §8, N-10, held, not in the repo): `golf_practice_plans` with `title` 1-80, `status` draft or published, `body` `PlanBodyV2` (focus ≤140, notes ≤2000, place ≤80, groups ≤6, blocks ≤40 per variant, each block 5-360 minutes in steps of 5, stations, course blocks with holes 1-18), `golf_practice_plan_save(...)`, a publish RPC, and `golf_document_folders(team_id, name 1-60)`.

What the flow asks (lane 6's brief card, `practice-plan/COACHHELM_PRACTICE_PLAN.md`): which practice (Context or Read: the next practice), length (Read from the event), focus (Read: open focus areas, pill), groups (Read: last plan's groups), folder (Read: last used; ASK when the coach names a new one). Publishing confirms the recipient count; notifications wait for the hold.

~~Open conflict, flagged for lane 6 and the Documents lane, not for Nick today: the CoachHelm practice design saves drafts into any folder by `folderId`, while N-10's planned check forces every plan into "Practice plans", N-00 files only published plans, and documents point at folders by name. Default until settled: plans save to "Practice plans", the coach can add a second location later, and the flow passes the folder by name.~~ (fixed 4 Nov: settled. One folder model: a folder is the name in `golf_documents.folder` (1 to 60 characters, trimmed, default "Practice plans"); there are no folder ids, no nesting and no `create_folder`. Ask AK9, the quick chat plan task and the builder all save through practice-plan's `savePracticePlanDraft({..., folder})`, which writes N-00's plan through `golf_practice_plan_save` and one Documents row with `practice_plan_id` and `is_public` false, so all three make the same plan object in the same place. A plan row may sit in any coach folder; publishing keeps its folder. N-10's `golf_document_folders` (090200) is optional later and keeps the name as the link. N-10's 090300 check must be narrowed so plans can live outside "Practice plans" (practice-plan 02 Completeness section; a shared call for Nick). Drafts are filed, coach-only, as practice-plan settled call 3.)

### 5.16 Blocked time · `golf_coach_blocked_time` · `addCoachBlockedTime`

Action `calendar-blocked-time.ts:154` (zod `:43-59`). Coach-only; players never see it; nobody is told.

| Field | Fill | Validation |
|---|---|---|
| Title | Coach; propose "Busy" | 1-200 |
| Dates | Coach, team zone | the action checks no format and no order: the flow checks both |
| Times | Coach; none means all day | the flow checks end > start |
| Repeats | Coach, weekly with an end date (`serializeRecurrenceRule`, as `extras.tsx:219`); ASK for the end | |
| Request id | Fixed uuid per intent | |

Ask when "block off" could also be a team event (5.1).

### 5.17 Team break · `golf_class_exceptions` · `addTeamBreak`

Action `class-status.ts:205`. UI flag `class_awareness_v1`.

| Field | Fill | Validation |
|---|---|---|
| First and last day | Coach | last ≥ first, at most 21 days; a longer break is an ASK (split it) |
| Label | Coach ("Fall break") | ≤60 |
| Kind | Fixed `off` | |
| Player | Fixed null (team-wide). One player's "no class Friday" is only the player's to write | |
| Team | Context, sent as `ctx.team_id` (the action trusts the input) | |

Nobody is told. Breaks and terms do not free time in "find a time" today (the calendar engine never reads them); only `golf_team_class_day` (today −7 to +14) does. The card must not promise a freed slot. Ask when: over 21 days; no term covers the dates; one player named.

### 5.18 Term · `golf_team_terms` · `saveTeamTerm`

Action `class-status.ts:200`.

| Field | Fill | Validation |
|---|---|---|
| Name | Coach ("Fall 2026") | 1-40 |
| Classes start, classes end, exams end | Coach; ASK for any missing. Never inferred from a school calendar | classes 27-200 days; exams 0-21 days after; no overlap with another term |
| Time zone | Context; ASK if it differs | |

There is no delete action for a term; the hold makes one unnecessary for Undo.

### 5.19 Availability note · `golf_player_availability_coach_notes`

Action `setPlayerAvailabilityCoachNote` (`team-management.ts:594`). Coach-only by design.

| Field | Fill | Validation |
|---|---|---|
| Player | Coach name to roster id | |
| Note | Coach, verbatim; never adds a reason the coach didn't give | 1-280 |
| Status word | separate action (`setPlayerAvailability`): `available, injured, away`. ASK whether to set it when the note gives a reason but no status | |

The write overwrites any note: show the existing note and confirm. If the words hold a medical detail, confirm the coach wants it stored. It never goes anywhere a player can see.

### 5.20 Recruit · `golf_recruits` · `createRecruit`

Action `recruiting.ts:340`. Coach-only; nobody is told.

| Field | Fill | Validation |
|---|---|---|
| First, last name | Coach (first required) | ≤120 |
| Grad year | Coach; ASK if a grade was given instead | 2020-2040 |
| Email, phone | Coach; the flow checks the email shape (the action doesn't) | ≤254 / ≤40 |
| Hometown, state | Coach; state as two capital letters | ≤120 / 2 |
| Notes | Coach | ≤5000 |
| Status | Coach (`recruiting, watched, offered, committed`), else `recruiting` | |
| Next step, date | Coach | real date |
| Request id | Fixed uuid | |

Ask when: the first name already exists in the team's recruits (possible duplicate); an unknown status word; a grade instead of a year. Recruits are often minors: their details never leave the recruiting screens.

---

## 6. Where the Ask design must change to match the data

These rows in `ask/ASK_REDESIGN.md` §3 item 15 promise something the data can't hold. Lane 4 should change the copy and the questions; each line gives the replacement.

| Flow | Design says | Data says | Change to |
|---|---|---|---|
| Event | Works out "reminder" | No per-event reminder; the team's 24 h and 1 h apply to RSVP events only | Drop the reminder pill; show "Reminders 24 h and 1 h before (team setting)" when replies are on |
| Announcement | Asks "now or later"; works out "linked trip" | No scheduled send; no trip link | Drop "later"; put trip details in the body |
| Travel | Room pairs slide together; gear chips | Rooms and gear are plain text | Keep the visual; write rooms as lines and gear as an array |
| Qualifier | Asks "exemptions"; works out "tie rule"; gold ring for exempt | No exemptions, no tie rule field | Ask rounds, squad size and coach's picks; drop the gold ring or show it on coach's picks |
| Lineup | Lands "Locked lineup"; lock pops into each seat | Lock can't be undone; separate RPC | Land "Lineup set"; lock is a second card the coach confirms |
| Goal | Asks "whether the player accepts" | Mode is `mandatory` or `suggested` | Ask "Assign it, or suggest it?" |
| Round note | Asks "share now or keep private" | No visibility field; the player always sees it | Drop the question; card says the player will see it |
| Drill | Lands in the drill bank | Coaches can't create drills | Show "Drill bank comes with the Practice tab" and offer a plan block (fixed 4 Nov: was "practice builder"; Ask and practice-plan say "Practice tab") |
| Poll | Lands in the team chat composer | Needs a poll prefill; delete broken until 140800 | Keep, behind both |
| Board | Shrinks into the composer | No image prefill | Keep, behind the PNG attachment work |
| Every flow | "Invites wait until Undo closes" | Only true with the server hold in §3 | Build §3 first |

## 7. Server work the flows need (ordered)

1. **Undo hold** in the action ledger (§3): `run_at`, `held`, `cancelled`, `after()` runner, sweeper, Open commits early. Needs the Ask lane's held migration HM1; until it is applied the flags stay off.
2. **One team time zone** for chat and calendar; ask and save when they disagree.
3. **Event create:** always send `allDay` and the offset from the tool; stop relying on the action defaults.
4. **Recurring practice:** pass `timeZone`; compute the first date in the team zone; send invitees explicitly; limit the RSVP fan-out to invitees (`recurring-events.ts:1010-1012`); widen the idempotency key.
5. **Task:** priority to `low | normal | high`; send category; add assignees to the idempotency key.
6. **Focus area:** return the new id.
7. **Qualifier:** pass `numRounds` to the email (`qualifier-actions.ts:309`); return an error when a round course write fails; check the tee belongs to the course.
8. **Lineup:** roster check in `golf_tournament_set_entries`; a clear error for a missing slot.
9. **Messages:** `ChPrefill.conversationId`; poll prefill; PNG attachment prefill; a signal when the coach's own draft wins; refuse the "add to oldest same-titled group" case.
10. **Polls:** apply held `20261028140800` before polls go live.
11. **Announcements:** tool limits to match the action (or keep the tighter ones and say so); receipt names email and push.
12. **New tools** for qualifier, lineup, goal, round note, travel, blocked time, break, term, availability note, recruit, each behind `CONFIRM_REQUIRED_TOOLS`.
13. **Waits on other lanes:** team drill bank (N-00 §8.3), practice plans (N-00), folders (N-10).

Every item above is code in helmv3 behind the CoachHelm flags. Nothing here is a deploy, a migration to production or a flag flip. The one schema change (HM1) is written as a held file and not applied.

## 8. Tool limits that must match the action limits

| Flow | Field | Tool | Action | DB | Use |
|---|---|---|---|---|---|
| Announcement | title | 120 | 200 | none | 120, and say so |
| Announcement | body | 2000 | 10000 | none | 2000, and say so |
| Message | draft | prefill 2000 | 5000 | none | 2000 |
| Task | title | 160 | none | none | 160 |
| Focus area | title | 120 | none | none | 120 |
| Event | title | | 200 | | 200 |
| Qualifier | name | | 200 | | 200 |
| Round note | note | | 2000 | none | 2000 |
| Availability note | note | | 280 | 280 | 280 |
| Poll | question / option | | 140 / 60 | trigger | 140 / 60 |

The composer counts against the tighter limit and shows the count from 80 percent.

## Completeness pass, 4 Nov 2026

What this pass settled for the task fields, for both CoachHelm lanes. Fixes made in place above are §5.14 (one drill bank) and §5.15 (one folder model).

| Flow | Field or rule | Settled value | Source |
|---|---|---|---|
| Drill | where a new drill lands | `golf_team_drills` (N-00 010100) through `createTeamDrill`; library drills copy with `copyLibraryDrill` | N-00 §8.3, §8.15 |
| Drill | HM5 `20261101090400_golf_drills_team_bank` | superseded; not written; Ask AK11e waits on 010100 | coordinator, 4 Nov |
| Drill | before 010100 | "Drill bank comes with the Practice tab"; offer the drill as a plan block; nothing is written | §6 row "Drill" |
| Drill | archive | `archiveTeamDrill`, never delete; drafts keep the reference | N-00 §10 |
| Practice plan | folder | name only, 1 to 60 trimmed, default "Practice plans", any coach folder allowed | practice-plan default 1 |
| Practice plan | reserved names | "Team" can't be made as a new folder; "Practice plans" is always listed, so typing it picks it | N-10 CH-10162 |
| Practice plan | the plan object | one `golf_practice_plans` row per practice event, saved by `golf_practice_plan_save`; one Documents row with `practice_plan_id` | N-00 010000, 010400, 010500 |
| Practice plan | event | required. No practice that day: the event flow (§5.1) runs first, and Save commits its hold early | N-00 010000 (`event_id` NOT NULL) |
| Practice plan | draft visibility | `is_public` false; "Only coaches can see it. Players are told when you publish." | practice-plan 02 §6.3 |
| Practice plan | draft Undo | the save runs at once; Undo deletes a new plan or restores the previous version on a re-save; ring 8s, server allows 10s | practice-plan default 9 |
| Practice plan | publish | only on the plan page or the Ask publish card, through N-00 `publishPracticePlan` with `notify: 'defer'`; push, bell and chat text after the 8s window; the quick chat has no publish tool | practice-plan default 3 |
| Practice plan | republish | tells only affected players; a wording-only change tells no one; take down tells once | N-00 §4.11, §10 |
| Every flow | idempotency | one run per key; a second device's press returns the first run's receipt | §3 |
| Every flow | roster at commit | re-read at commit; removed players dropped; an empty target fails the write | §2 rule 2 |
| Every flow | day and season | the team zone's day; season-scoped reads use the season of the target date (1 Aug rollover) | §2 rule 1 |
