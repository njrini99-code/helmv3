# CoachHelm quick chat: data checks

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 10 rows).

Every value the quick chat shows, where it comes from, and the preview fixture value that proves it shows right. Field-by-field rules for what each task writes are in `TASK_FIELDS.md` (it wins). This file covers what the panel *shows*. Read against helmv3 at 75b4956. Nothing new is read for display; if a value can't be traced, it doesn't ship (SHARED-11).

Fixture (QC0, `fixtures-quick-chat.ts`), matching the design page: team Varsity, coach on Calendar, today Mon 3 Nov, 11 active players (initials JO, MR, EP, CB, SW, DO, LH, TR, BC, AK, NV), Travel squad thread with 6 members, course Lonnie Poole with 3 saved tees (white, blue, black), folders Practice plans plus two others.

## 1. Panel chrome

| Shown | Source | Fixture |
|---|---|---|
| Context line "Looking at Calendar · week of 3 Nov" | `lookingAt(pathname, search)` in `shell/AskSheet.tsx:36` (today's chip text) (fixed 4 Nov wiring: three arguments, `lookingAt(pathname, search, trail)` with `trail` from `useCrumbTrail()`, `AskSheet.tsx:36-47`) | Calendar, week of 3 Nov |
| Start tiles (4) | new `quickStarts(pathname)`: fixed copy per screen; each tile's second line names a real object read from the screen's own loader already on the client (no new fetch) | Calendar: "Thursday at 3, at the range", "Friday's bus time", "3 rounds next week", "It asks what you want first" |
| Earlier today | the latest `data-action-receipt` part in today's conversation (`golf_coachhelm_chat_*`), its title, audience line and time (fixed 4 Nov wiring: today's conversation is the coach's newest row from `GET /api/coachhelm/v3/chat/conversations` (`listConversations`, `lib/coachhelm/v3/chat/persistence.ts:57`) created since the team zone's midnight; the receipt is the last `data-action-receipt` in that row's `ui_parts` from `getConversation` (:66). Conversations carry no `team_id`, so a coach on two teams sees one thread for the day, a gap noted in the wiring section) | "Moved Team lift to 2:00 PM · Mon 3 Nov · 11 players told · 9:12 AM" |
| Offline line | `navigator.onLine` via today's `subscribeOnline` (fixed 4 Nov wiring: exported from `shell/AskSheetBody.tsx:22`, where it is private today) | offline toggle in preview |

## 2. Steps and asks

| Shown | Source | Fixture |
|---|---|---|
| Step labels | the stream's announced steps (Ask AK1), present tense while running, past tense with the one fact the tool returned | "Checked Thursday · lift ends at 2:45", "Found 11 active players", "Read your roster · 11 active", "Found Lonnie Poole · 3 tees saved" |
| "N steps · Ns" | count of steps and wall time from first step start to last step end, rounded to whole seconds | 3 steps · 2s |
| Ask card options | the flow's missing fields (TASK_FIELDS §5.x "ASK"); tee options only from the course's saved tees; names only from the roster | picks None / 1 / 2; tees White / Blue / Black |

## 3. Task cards

| Card | Shown | Source | Fixture |
|---|---|---|---|
| Event | week strip, the target day, day rail items | team calendar for that week (the same loader the Calendar screen uses) | Mon 3 to Sun 9 Nov; Thu 6 lit; "Team lift until 2:45" |
| Event | title, date, start and end, place, who | TASK_FIELDS §5.1 (end time must be in the coach's words or asked) | "Team practice", Thu 6 Nov, 3:00 to 5:00 PM, the range, All 11 active |
| Event | "On confirm" audience | roster count for the invitees; RSVP line only when replies are on | "11 players see it on their calendar. No RSVP asked." |
| Message | thread title, member count, last message | conversation where the coach is a member and the title matches exactly once (TASK_FIELDS §5.4) | Travel squad · 6 players |
| Message | draft | the coach's words drafted; ≤2000 characters | "Bus leaves the field house at 6:15 Friday. Bags on by 6. Lunch is covered, so no need to bring one." |
| Message | "Sends as you to 6 players in Travel squad, after an 8 second Undo." | member count minus the coach | 6 |
| Qualifier | title, rounds with date, course and tee | coach's words plus the ask (TASK_FIELDS §5.8); dates from "next week" in the team zone | Fall qualifier; Mon 10, Tue 11, Wed 12 Nov; Lonnie Poole · white |
| Qualifier | seats "4 by score · 1 your pick" | squad size and coach's picks (asked when not said) | top 5, 1 pick |
| Qualifier | field | active roster | 11 players |
| Plan | time bar and blocks | the coach's answers (length, focus, who) and the free window read from the calendar | 90 min · Tue 4 Nov, 3:00 PM; three blocks |
| Plan | "Save to" folder | ~~Documents folders (N-10) or "Practice plans" by name until then~~ (fixed 4 Nov wiring: practice-plan `listPlanFolders(teamId)` over `golf_documents.folder`, as the Completeness rows below; N-10 is not needed) | Practice plans |

## 4. Finish

| Shown | Source | Fixture |
|---|---|---|
| Receipt title and line | the read-back row after the held run executes (TASK_FIELDS §2 rule 5), never the sent payload | "Added to calendar · Thu 6 Nov, 3:00 to 5:00 PM"; "Qualifier set · Fall qualifier · starts Mon 10 Nov"; "Plan saved · Documents · Practice plans" |
| Undo ring | `held_until` on the receipt minus now (server time, not a client timer started on click) | 8s |
| Told coins, order and "seen" | notification rows for that run (bell, push, email) by `created_at`; `seen` only where the table records it (messages read receipts) | event 11, no seen; message 6 delivered, 2 seen; qualifier 11 push and email (fixed 4 Nov wiring: the fixture event asks no RSVP, so no notification row exists for it (`lib/calendar/rsvp.ts:268` returns early, `calendar-events.ts:513` fans out to nobody); its 11 coins are the `golf_event_attendance` rows `sendEventInvitations` writes inline, and the line reads "11 players see it on their calendar". With RSVP on, the bell rows come from the deferred fan-out. Message: "delivered" is the `golf_messages` row and the thread's member count (there is no per-device delivery row); "seen" is a member whose `golf_conversation_read_marks` mark (applied `20261025010000`) is at or after the message's `created_at`. Qualifier: push from `sendBulkPushNotification`'s counts (`qualifier-actions.ts:315-316`), email only while `isCustomerEmailEnabled()`. Players' `notifications` rows are not readable by the coach (`notifications_select_own`), so counts come from the AK4 `GET …/actions/[key]` route's admin read) |
| "+N" | told count minus the 5 coins shown | +6 (11), +1 (6) |
| Live pill label | the current step's label, or Needs your OK / Added / Sent / Set / Saved / Didn't go through | "Checking Thursday on the team calendar" |

## 5. Things the page fixes compared with the earlier draft

- One roster: every task reads the same 11 active players (an earlier version said 9 for the event and 11 for the qualifier).
- "Next week" from Mon 3 Nov is Mon 10 to Wed 12 Nov; the qualifier and its receipt say so.
- The event's end time is in the coach's own words ("3 to 5"), so nothing is inferred.
- The qualifier no longer claims nobody is messaged: it says 11 players get a push and an email once Undo closes (`qualifier-actions.ts:286-330` tells them inside the call, which is why the call is held).

## Completeness pass, 4 Nov 2026

Where each value shown by the new rows (05 Completeness section) comes from. Same columns as above.

| Shown | Source | Fixture |
|---|---|---|
| Folder names and counts in Save to | practice-plan `listPlanFolders(teamId)`: `golf_documents` grouped by `folder`, coach scope, drafts counted; last used first | "Practice plans 4", "Qualifier prep 2", "Team rules 3" |
| Duplicate folder line | the same list, compared ignoring case after trimming | `dup-folder`: typing "qualifier prep" |
| Practice row on the plan card | `golf_events` for the team on that day with type practice (start, end, zone); exactly one, or ask | Tue 4 Nov, 3:00 to 4:30 PM |
| "That practice already has a plan" | `golf_practice_plans.event_id` (N-00 010000), coach scope | `plan-exists` |
| Inert state | boot check: `golf_practice_plan_save` present (010500) and both flags on | `practice=off` |
| Told line after a roster change | delivery rows written at release, counted; never the card's count | `roster-change`: 10 of 11 |
| "Earlier today" day | team zone from `season.ts` (fallback America/New_York) | coach in Pacific, team in Eastern |
| Season for reads | the season holding the target date (seasons turn over 1 Aug) | plan for 2 Aug asked on 31 Jul |
| Undo time left | the run's `held_until` from the server (HM1) | reopen at 5s: 3s left |
| Drill bank step label | `golf_team_drills` present: "Reading the drill bank"; absent: "Reading the drill library" over `golf_drills` | both |
