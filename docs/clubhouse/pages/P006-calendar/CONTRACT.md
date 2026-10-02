# P006 — Calendar: page contract

Every behaviour Calendar promises, by the 25 V2 categories (D-69). A contract's
number is its Bridge ID (D-68: namespace 6, category, item); `Code` is the
catalog code on the element and in the test (`docs/clubhouse/catalog/calendar.md`).
Rows without a code are behaviours with no single element, recorded in
`config/clubhouse/bridge-contracts.json` by hand. The shell's contracts (P001,
namespace 1) apply here too and are named where they carry a category.
`clubhouse:check` holds this file to the registry.

The page serves two roles from one address. A coach plans the team's schedule, sees every rostered
player's classes and takes attendance; a player sees the team's events, replies to the ones they are
invited to and sees only their own classes (D-1). Category 08 says which role gets what, and how each
gate is proved.

## 01 — Default / core UI

Status: DEFINED

Calendar opens on the week that holds today, with the team's events on a grid and the day's panel beside it (60101). The address decides the view, the day and the open event, and anything that is not real falls back (60102). Other pages open New event through `?new=1` and its seeds (60103). Every time is in the team's zone (60104). On the phone the same data is Day, Month and List (61901). The page opens at the top (10101). Open, not built: v2 also draws a whole-page first-run state for a team that has never scheduled anything (D-71); an empty range still draws the grid, and the panel says there is nothing on the team calendar today (60402).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 60101 | — | `CALENDAR_READY` | Calendar opens on the week that holds today, for a coach and for a player: the month, the count of team events this week and the team's zone, the week grid, and beside it the day's panel (today's events, what needs attention, where the data comes from); a coach also gets New event. On the phone the week opens as Day. |
| 60102 | — | `ADDRESS_HOLDS_VIEW_DAY_AND_EVENT` | The address decides what is shown: ?view=day\|week\|month\|agenda, ?date=YYYY-MM-DD and ?event=<id> are read on the server, so the right window and the open panel are there on first paint and a state can be linked. A value that is not real (an unknown view, an impossible date such as 2026-02-30) falls back to the week and to today, an event that is no longer in the loaded range says so (CH-6305), and changing the view or the day rewrites the address. |
| 60103 | — | `SEEDS_FROM_OTHER_PAGES` | ?new=1 opens New event once for a coach and drops itself from the address; &with=<player> makes it a meeting with only that player invited (a player the Calendar does not list invites nobody, never the team); &type= picks the new event's type from those a coach can create and ignores anything else. |
| 60104 | — | `TIMES_ARE_THE_TEAMS_ZONE` | Every time is resolved on the server in the team's timezone (Eastern time until the team sets one, and the page says so): a timed event is filed under its local day and hour, one that runs past midnight ends at 24, and an all-day event keeps its stored dates, one entry for each day of a span. |

From the shell (P001): 10101 CH-1904, 10102 SHELL_READY, 10103 TEAM_SWITCH_READS_EVERY_SCREEN_AGAIN.

## 02 — Initial loading / skeleton

Status: DEFINED

The route skeleton (60201) has the page's own shape: the header, the toolbar, the week grid and the panel. Every section that loads on its own has a skeleton: calendar-app links (60202), an event's files (60203), the documents to attach (60204) and attendance (60205). v2 timing: nothing for 150ms, then a fade (the shell's motion).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 60201 | CH-6401 | `CALENDAR_IS_LOADING` | Calendar is loading |
| 60202 | CH-6402 | `CALENDAR_APP_LINKS_ARE_LOADING` | Calendar-app links are loading |
| 60203 | CH-6403 | `AN_EVENTS_FILES_ARE_LOADING` | An event's files are loading |
| 60204 | CH-6404 | `DOCUMENTS_ARE_LOADING` | Documents are loading (attach) |
| 60205 | CH-6405 | `ATTENDANCE_IS_LOADING` | Attendance is loading |

From the shell (P001): 10201 CH-1401.

## 03 — Background loading / refresh

Status: DEFINED

The page does not subscribe to changes. The server reads it when it opens and again after a change lands (`router.refresh`) or when Try again is pressed. Stepping inside the loaded window is instant and rewrites the address without a request (60302); going past the window loads the next one and marks the page busy, and a save in flight reads Publishing…, Saving…, Cancelling…, Removing… or Attaching… on a button that cannot be pressed twice (60301). The screen follows the server when it sends a different view or day (60303). Not built: pull to refresh, and a periodic re-read while the page is open; "Checked" says how old the data is (61501).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 60301 | CH-6406 | `CHANGING_VIEW_OR_WEEK_OR_A_SAVE` | Changing view or week, or a save in flight |
| 60302 | — | `STEPS_INSIDE_THE_WINDOW_STAY_LOCAL` | Stepping or jumping to a day, week or month inside the loaded window changes the view in place and rewrites the address with no request; going past the window asks the server for the next one and marks the page busy while it loads (D-8). |
| 60303 | — | `SCREEN_FOLLOWS_THE_SERVER` | When the server renders a different view or day than the one it sent before (a step past the window), the screen follows it instead of holding what was there. |

## 04 — Empty

Status: DEFINED

First-run and filtered empties are distinct, and a failed read is never shown as empty. An empty range still draws the grid and the panel says there is nothing on the team calendar today (60402). The agenda says its range is empty, and for the chosen players when the filter is on (60401). A coach with no overlaps and no replies waiting, and a player who is caught up, are told so (60406). An event with no files (60403); a team with no documents to attach (60404); a day with nothing on it on the phone (60408). An opened event that has left the loaded range says so and offers Today (60405). Signed in with no team is the v2 page empty state, with its own words for a coach and a player (60407).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 60401 | CH-6301 | `NOTHING_IN_THE_AGENDAS_RANGE` | Nothing in the agenda's range |
| 60402 | CH-6302 | `NOTHING_ON_THE_TEAM_CALENDAR_TODAY` | Nothing on the team calendar today |
| 60403 | CH-6303 | `AN_EVENT_HAS_NO_FILES` | An event has no files |
| 60404 | CH-6304 | `THE_TEAM_HAS_NO_DOCUMENTS_TO_ATTACH` | The team has no documents to attach |
| 60405 | CH-6305 | `AN_OPENED_EVENT_LEFT_THE_LOADED_RANGE` | An opened event left the loaded range |
| 60406 | CH-6306 | `NOTHING_NEEDS_ATTENTION_THIS_WEEK` | Nothing needs attention this week |
| 60407 | CH-6307 | `SIGNED_IN_WITH_NO_TEAM` | Signed in with no team (coach or player) |
| 60408 | CH-6308 | `A_DAY_WITH_NOTHING_ON_IT` | A day with nothing on it (phone Day view) |
| 60409 | CH-6309 | `A_COACH_WHOSE_TEAM_HAS_NEVER_SCHEDULED` | A coach whose team has never scheduled anything (D-71) |

## 05 — Validation

Status: DEFINED

Checked before anything is sent, with the warning haptic. An event needs a title (60501, the title field takes focus) and must end after it starts (60502; all-day events skip the time check). Busy time needs a name (60503) and an end after its start (60504). Nothing else is free text: type, date, repeat, scope and invitees are choices, and the title, place and notes have length limits.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 60501 | CH-6101 | `AN_EVENT_WITH_NO_TITLE` | An event with no title |
| 60502 | CH-6102 | `AN_EVENT_THAT_ENDS_BEFORE_IT_STARTS` | An event that ends before it starts |
| 60503 | CH-6103 | `BUSY_TIME_WITH_NO_NAME` | Busy time with no name |
| 60504 | CH-6104 | `BUSY_TIME_THAT_ENDS_BEFORE_IT_STARTS` | Busy time that ends before it starts |

## 06 — Server / system error

Status: DEFINED

Every change has its own toast naming what failed and what to do (60601 to 60612), and every section that fails to load has its own notice with Try again (60613 to 60621, 60624). A crash stays in its section: the calendar view (60622) and the detail panel (60623) each sit in a SectionBoundary. A write that goes through the shell's save hook gets Retry, which sends the same write again and finishes the job (61401). Three failures have no Retry because there is nothing to send again: copying a link (60604, 60612) and an Undo that fails (60609); removing a file has none either, and its toast says to try again in a moment (60608). Making a new calendar-app link has no Retry either (60626): the server deletes the old link before it makes the new one, so a failure can leave either state, and the links are read again so the row shows what exists. Removing a link has one (60627). A server refusal written for a person is shown as the toast's reason (a reply's lock: the deadline passed, the event started or was cancelled); one written for a developer is replaced by the toast's own hint. Open, not fixed: a create whose answer is lost on the way back may have landed, and Retry then creates it a second time (no write here carries an idempotency key).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 60601 | CH-6001 | `PUBLISHING_OR_SAVING_AN_EVENT_FAILS` | Publishing or saving an event fails |
| 60602 | CH-6002 | `CANCELLING_AN_EVENT_FAILS` | Cancelling an event fails |
| 60603 | CH-6003 | `CREATING_A_CALENDAR_APP_LINK_FAILS` | Creating a calendar-app link fails |
| 60604 | CH-6004 | `COPYING_A_CALENDAR_APP_LINK_FAILS` | Copying a calendar-app link fails |
| 60605 | CH-6005 | `REMOVING_BUSY_TIME_FAILS` | Removing busy time fails |
| 60606 | CH-6006 | `ADDING_BUSY_TIME_FAILS` | Adding busy time fails |
| 60607 | CH-6007 | `ATTACHING_A_FILE_FAILS` | Attaching a file fails |
| 60608 | CH-6008 | `REMOVING_A_FILE_FAILS` | Removing a file fails |
| 60609 | CH-6009 | `UNDO_ON_A_REMOVED_FILE_FAILS` | Undo on a removed file fails (refused, or the call throws) |
| 60610 | CH-6010 | `A_PLAYERS_REPLY_FAILS` | A player's reply fails (or is locked) |
| 60611 | CH-6011 | `SAVING_ATTENDANCE_FAILS` | Saving attendance fails |
| 60612 | CH-6012 | `COPYING_AN_EVENT_LINK_FAILS` | Copying an event link fails |
| 60613 | CH-6201 | `TEAM_EVENTS_DONT_LOAD` | Team events don't load |
| 60614 | CH-6202 | `THE_COACHS_BUSY_TIME_DOESNT_LOAD` | The coach's busy time doesn't load |
| 60615 | CH-6203 | `CLASS_SCHEDULES_DONT_LOAD` | Class schedules don't load |
| 60616 | CH-6204 | `REPLIES_DONT_LOAD` | Replies don't load (summary) |
| 60617 | CH-6205 | `REPLIES_DONT_LOAD_2` | Replies don't load (an event) |
| 60618 | CH-6206 | `CALENDAR_APP_LINKS_DONT_LOAD` | Calendar-app links don't load |
| 60619 | CH-6207 | `AN_EVENTS_FILES_DONT_LOAD` | An event's files don't load |
| 60620 | CH-6208 | `THE_TEAMS_DOCUMENTS_DONT_LOAD` | The team's documents don't load (attach) |
| 60621 | CH-6209 | `ATTENDANCE_DOESNT_LOAD` | Attendance doesn't load |
| 60622 | CH-6210 | `THE_CALENDAR_VIEW_CRASHES` | The calendar view crashes |
| 60623 | CH-6211 | `THE_DETAIL_PANEL_CRASHES` | The detail panel crashes |
| 60624 | CH-6212 | `THE_TEAMS_TIMEZONE_DOESNT_LOAD` | The team's timezone doesn't load |
| 60625 | CH-6213 | `THE_ROSTER_DOESNT_LOAD` | The roster doesn't load |
| 60626 | CH-6013 | `MAKING_A_NEW_CALENDAR_APP_LINK_FAILS` | Making a new calendar-app link fails |
| 60627 | CH-6014 | `REMOVING_A_CALENDAR_APP_LINK_FAILS` | Removing a calendar-app link fails |

From the shell (P001): 10601 CH-1001, 10602 CH-1201, 10603 CH-1202, 10604 CH-1203, 10605 CH-1204, 10606 CH-1205, 10607 CH-1206, 10608 CH-1207, 10609 CH-1208, 10610 CH-1002, 10611 CH-1003.

## 07 — Network / offline

Status: DEFINED

Offline and slow saves are the shell's: nothing is sent offline (10703), a save over 5 seconds says so once (10702), the banner (10701), Try again while offline (10704). Removing a file, and Undo on that, are not routed through the shell's save hook, so they carry the same rule themselves: offline, nothing is sent, the file stays, and the toast says nothing was changed (60701).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 60701 | — | `FILE_REMOVAL_REFUSES_OFFLINE` | Removing a file from an event, and Undo on that, send nothing while the browser is offline: the file stays where it was, the error haptic fires, and the toast says nothing was changed (the shell's CH-1903 wording). |

From the shell (P001): 10701 CH-1901, 10702 CH-1902, 10703 CH-1903, 10704 CH-1905.

## 08 — Permission / authorization

Status: DEFINED

The route decides who reaches the page, the loader decides what a player's browser is sent, and every write is checked again by its server action and by row-level security. Hiding a control from a player is a courtesy and never the gate (60806).

Who opens it. A signed-in coach or player who has a team. With no session the page sends the visitor to login and the route renders nothing; a coach or player with no team gets the no-team page and nothing is read; a player whose team membership cannot be read gets the route error view with Try again and is never told they have no team (60805). With the Clubhouse off for the caller the page is the existing Fairway calendar (the shell's 10801).

What a coach has. Everything: New event, the N key and `?new=1` with its seeds, editing, moving and cancelling any event of the team (a series by scope), attendance, the people filter, overlaps, attaching and removing files, busy time, and both calendar-app links.

What a player has. The team's events with their times, places, notes and files; the reply on an event they are invited to (60807); their own classes and nothing of a teammate's (60802); and the calendar-app sheet with their own schedule link (60804). A player never has a planning tool (60801), never a teammate's reply, because the browser is sent only the player's own place on each invite list and own answer (60803), and never a coach's busy time (60808). Attendance marks are a coach's: the screen does not ask for them for a player.

The server, read in this pass and not run (60806). `createGolfEvent`, `updateGolfEvent` and `deleteGolfEvent` refuse anyone who is not a coach ("Only coaches can create team events", and the same for update and delete) and an event of another team ("Access denied"). The three series actions look up the caller's coach row ("Coach not found"), and `editRecurringEvent` and `deleteRecurringEvent` act only on events the caller created ("Not authorized"), so a second coach on the team can edit or cancel one event but not a series by scope, though the screen offers the scopes to every coach. `addCoachBlockedTime` and `deleteCoachBlockedTime` work on the caller's own coach row only. `markAttendance` needs a coach on the event's team's staff ("Only this team's coaches can record attendance"). `createCalendarFeed` refuses a team link to a player ("Only coaches can create team feeds"). `respondToEvent` needs an active member of the event's team, refuses class meetings, and refuses a reply after the deadline, after the start and on a cancelled event. `attachDocumentToEvent` and `detachDocumentFromEvent` are for the event's team coaches through row-level security ("Only this team's coaches can detach documents"). A class read relies on row-level security to give a player only their own classes (not re-read in this pass); the loader filters again (60802).

Open, not this page's to fix. The baseline migration's `golf_event_attendance_select_team` policy lets any active player on the team read every reply on the team's events (not re-read against the live database), and `getAttendanceReport` returns a whole event's attendance to an active team player. So 60803 is what this page guarantees (it never asks for a teammate's reply and never sends one to a player's browser), not what the database enforces.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 60801 | — | `PLAYER_HAS_NO_PLANNING_TOOLS` | A player is never given a planning tool: no New event (button, N key or an editor from ?new=1), no Add busy time or Overlaps in More, no people filter, no responses, attendance, Edit event, Cancel event, Attach or Remove file, and no schedule-overlap marks. The same address for a coach has all of them. Hiding them is a courtesy; every write is checked again by its server action (60806). |
| 60802 | — | `PLAYER_READS_ONLY_THEIR_OWN_CLASSES` | The loader gives a player only their own classes (another player's class, and one whose owner cannot be resolved, are dropped before they reach the browser) and only themselves as a person; a coach gets every rostered player's classes, each with its owner. |
| 60803 | — | `PLAYER_GETS_ONLY_THEIR_OWN_REPLY` | A player's data carries, for each event, only their own place on the invite list and their own reply, never a teammate's id or answer, and the screen still finds what they owe from it. A coach's data carries every invitee and every reply. |
| 60804 | — | `PLAYER_IS_NOT_OFFERED_THE_TEAM_LINK` | In Add to calendar app a player is offered only My schedule; the team link is a coach's, because createCalendarFeed refuses it to anyone else. |
| 60805 | — | `ROUTE_STOPS_WITHOUT_A_SESSION_OR_TEAM` | With no session the route renders nothing (the page sends the visitor to login); a coach or player with no team gets the no-team page (CH-6307) and nothing is read; a coach is loaded as a coach with their own id and a player as that player with no coach id; a player whose team membership cannot be read throws to the route error view and is never told they have no team. |
| 60806 | — | `SERVER_ACTIONS_ARE_THE_GATE` | Every write is checked again by its server action and by row-level security, whatever the screen shows: creating, editing and cancelling an event and adding or removing busy time are for a coach, attendance for a coach on the event's team, a team calendar link for a coach, a reply for an active member of the event's team, and attaching or detaching a file for the event's team coaches. Read in this pass, not run: no test here forces a refusal. |
| 60807 | — | `REPLY_IS_FOR_INVITED_PLAYERS` | A player is offered the reply (Going, Maybe, Can't make it) only on an event whose invite list they are on that has not started and is not cancelled; once it starts the panel says replies are closed. |
| 60808 | — | `BUSY_TIME_IS_THE_COACHS_OWN` | Busy time is read only for a coach and only their own rows (coach_id is the signed-in coach), and is never read for a player. |

From the shell (P001): 10801 CLUBHOUSE_GATE, 10802 ROLE_SCOPED_NAV, 10803 TEAM_SWITCH_IS_A_HEAD_COACHS.

## 09 — Success

Status: DEFINED

A change that goes through the shell's save hook names itself in a toast and fires the success haptic (60901; the mechanism is the shell's 10901): Published, Moved or Saved, Cancelled, Team schedule link ready, Busy time added, Removed, Attached, the player's reply, and the number of attendance marks saved. A copied link also toasts with the success haptic. Removing a file toasts Removed with Undo (61302).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 60901 | — | `CHANGE_LANDED` | A change that goes through the shell's useAction and lands names itself in a toast with the success haptic: Published, Moved or Saved, Cancelled, link ready, Busy time added, Removed, Attached, the player's reply, and the attendance marks saved. |

From the shell (P001): 10901 CHANGE_LANDED.

## 10 — Warning

Status: DEFINED

Two warnings, and neither blocks anything. While a coach picks who to invite and when, the editor names who is busy at that time and marks each name (61001). A coach's event that collides with a class or another event is marked on the grid and in the agenda and offers Review (61002). A player sees neither.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 61001 | — | `EDITOR_WARNS_OF_CLASHES` | While a coach chooses who to invite and when, the editor names who is busy at that time ("Jonah is busy at this time.", and "Busy at this time" beside each name) against classes and other team events. It is a warning and never blocks Publish. |
| 61002 | — | `OVERLAPS_ARE_FLAGGED_FOR_THE_COACH` | For a coach, a timed team event whose invitee has a class or another team event at the same time is marked: its block and its row are named with "schedule overlap", and its panel offers Review. A player is shown none of it. |

## 11 — Destructive

Status: DEFINED

Cancelling an event asks first (61101) and says what happens. One event is a soft cancel: everyone invited is told, replies and attendance are kept, and the event stays on the calendar marked cancelled. A series asks which events, and "This and following" and "All in series" go through `deleteRecurringEvent`, which deletes the events (everyone invited is told, and the replies and attendance go with them); the question says so, and until 2026-09-30 it promised the soft cancel for those scopes too. Removing busy time asks first (61102). Both fire the warning haptic. Removing a file does not ask: it is undone with Undo (61302). Closing the editor with unpublished changes asks before anything is lost (61201).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 61101 | CH-6501 | `CANCEL_EVENT` | Cancel event (event menu) |
| 61102 | CH-6502 | `REMOVE_BUSY_TIME` | Remove busy time |
| 61103 | CH-6504 | `NEW_LINK` | New link (a calendar-app link) |
| 61104 | CH-6505 | `REMOVE` | Remove (a calendar-app link) |

## 12 — State preservation

Status: DEFINED

A publish, save or busy-time add that fails keeps the editor or sheet open with everything as typed (61202). Closing the editor with changes asks first (61201). Attendance marks that did not save stay Unsaved and the button offers the rest (61203). The view and the day live in the address (60102); the open event does not, so a reload keeps the week and not the panel. The people filter and the jump panel are local to the open page and are not kept. Open, not fixed: the editor sets its fields again whenever the page re-reads while it is open (its effect depends on the people list, which is a new array after a re-read), so a Retry that lands from an earlier toast while a coach is typing would reset the form. Read in the code, not reproduced.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 61201 | CH-6503 | `CLOSING_THE_EVENT_EDITOR_WITH_CHANGES` | Closing the event editor with changes |
| 61202 | — | `FORM_KEPT_ON_FAILURE` | A publish, save or busy-time add that fails leaves the editor or sheet open with every field as typed; nothing is cleared until the write lands. |
| 61203 | — | `ATTENDANCE_MARKS_KEPT_ON_A_PARTIAL_SAVE` | Saving attendance saves each changed mark on its own: the marks that saved show as Saved, the ones that did not stay Unsaved, and the button offers to save what is left ("Save attendance · 1"). |

## 13 — Optimistic UI

Status: DEFINED

A player's reply shows the moment it is tapped and goes back to the last confirmed answer if the server refuses (61301). Removing a file takes it off the list at once and puts it back if the server refuses (61302). Nothing else is optimistic: an event waits for its write and the editor stays open until it lands, and attendance marks are local until Save.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 61301 | — | `REPLY_SHOWS_AT_ONCE` | A player's reply shows as chosen the moment they tap it and goes back to the last answer the server confirmed if the write is refused (CH-6010); the page reads again when it lands. |
| 61302 | — | `FILE_REMOVAL_SHOWS_AT_ONCE_WITH_UNDO` | Removing a file from an event takes it off the list at once and offers Undo. A refusal brings the file back (CH-6008); Undo attaches it again and reads the list again; an Undo that is refused or throws is reported and told to attach the file again from Documents (CH-6009). |

## 14 — Retry / recovery

Status: DEFINED

The failure toast's Retry runs the same write again with the same arguments and, when it lands, does everything the button would have done: the editor or sheet closes, the panel clears, the page reads again, the new link shows, the new file shows and the reply shows as chosen (61401; until 2026-09-30 it only re-sent the write, see the changelog). Try again on a page notice has the server read the page again, and inside a section it reads only that section (61402). Attendance offers Retry too; it sends every changed mark again, including the ones that had saved, which is harmless because each mark is an upsert.

What this is proved on. The Retry tests run in jsdom, where a toast can be clicked while a dialog is open. In a browser a native modal dialog makes everything outside it inert, and the toasts are outside it, so a Retry raised by a failure inside a dialog (the editor, the two confirms, the busy time, file and calendar-app sheets, and every panel sheet on the phone) is probably not clickable until the dialog closes; the button that failed is still there to press again. This was not verified in a browser. The fix is in the shell's Toast and Modal, not in this page, and it affects every page's Retry.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 61401 | — | `RETRY_FINISHES_THE_JOB` | The error toast's Retry runs the same write again with the same arguments, and when it lands everything the button would have done follows: the editor or sheet closes, the panel clears, the page reads again, the new link shows in place of Create link, the new file shows, and a reply shows as chosen. This holds for publishing or saving an event, cancelling an event, creating a calendar-app link, removing busy time, adding busy time, attaching a file and a player's reply. |
| 61402 | — | `TRY_AGAIN_REREADS` | Try again on a page notice (busy time, classes, timezone, replies) has the server read the page again; Try again inside a section (calendar-app links, an event's files, documents, attendance) reads only that section and leaves the rest of the page as it was. |

From the shell (P001): 11401 ROUTE_TRY_AGAIN, 11402 TOAST_RETRY.

## 15 — Data freshness / sync

Status: DEFINED

"Checked 2:40 PM" in Sources is the hour the server read the data (61501). The page does not subscribe to changes: another coach's edit, or a player's reply, shows on the next read, which is the page opening again or a re-read after a change of your own. The now line and "today" follow the browser's clock in the team's zone.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 61501 | — | `CHECKED_TIME_IS_THE_SERVERS` | "Checked 2:40 PM" in Sources is the hour, in the team's zone, at which the server read the data; it is not the browser's clock. |

## 16 — Micro animation

Status: DEFINED

Calendar's own motion (61601 to 61603): an event lifts and takes a ring, the Find a time band follows the pointer in 15-minute steps, and the now line moves down the grid. The shell's: v2 press, reveal, sheets and pushes (11601 to 11612, D-64). All three are checked in the browser preview and none has a test.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 61601 | CH-6601 | `HOVERING_OR_SELECTING_AN_EVENT` | Hovering or selecting an event |
| 61602 | CH-6602 | `DRAGGING_THE_TIME_BAND_IN_FIND_A` | Dragging the time band in Find a time |
| 61603 | CH-6603 | `THE_CURRENT_TIME` | The current time |

From the shell (P001): 11601 CH-1601, 11602 CH-1602, 11603 CH-1603, 11604 CH-1604, 11605 CH-1605, 11606 CH-1606, 11607 CH-1607, 11608 CH-1608, 11609 CH-1609, 11610 CH-1610, 11611 CH-1611, 11612 CH-1612.

## 17 — Haptic

Status: DEFINED

Calendar's own haptics (61701 to 61703) on the v2 grammar (D-70): selection for opening and choosing, the warning pattern for a form with a problem and for closing the editor with changes, success when a link is copied. Success on a landed change and error on a failed one come from the shell's save hook (60901). The shell's own are 11701 to 11706.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 61701 | CH-6701 | `OPENING_AN_EVENT_A_DAY_OR_A` | Opening an event, a day or a panel item; changing view, week or players; each Find a time step |
| 61702 | CH-6702 | `A_FORM_WITH_A_PROBLEM_OR_CLOSING` | A form with a problem, or closing the editor with changes |
| 61703 | CH-6703 | `A_LINK_IS_COPIED` | A link is copied |

From the shell (P001): 11701 CH-1701, 11702 CH-1702, 11703 CH-1703, 11704 CH-1704, 11705 CH-1705, 11706 CH-1706, 11707 CH-1707.

## 18 — Accessibility

Status: DEFINED

Calendar's own (61801 to 61804): each event is a button named with its title and time and, when it has one, "schedule overlap"; the detail panel is a polite live region and form errors are tied to their field; changing the people filter is announced; axe runs at 1280 and 390 (`clubhouse:a11y`), with one known exception, the 7-day week at 390px, which the phone build replaces. The shell's skip link, landmarks and dialog behaviour (11801 to 11811).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 61801 | CH-6801 | `EACH_EVENT_IS_A_BUTTON_NAMED_WITH` | Each event is a button named with its title and time, and "schedule overlap" when it has one; each day header opens the day |
| 61802 | CH-6802 | `THE_DETAIL_PANEL_IS_A_POLITE_LIVE` | The detail panel is a polite live region; form errors are tied to their field |
| 61803 | CH-6803 | `CHANGING_THE_PLAYER_FILTER_IS_ANNOUNCED` | Changing the player filter is announced ("Showing 2 players") |
| 61804 | CH-6804 | `NO_AXE_VIOLATIONS_IN_ANY_PREVIEW_VIEW` | No axe violations in any preview view and state, 1280px and 390px. One known exception, listed in the scan: the 7-day week at 390px squeezes overlapping events under 24px until the phone Calendar is designed |

From the shell (P001): 11801 CH-1801, 11802 CH-1802, 11803 CH-1803, 11804 CH-1804, 11805 CH-1805, 11806 CH-1806, 11807 CH-1807, 11808 CH-1808, 11809 CH-1809, 11810 CH-1810, 11811 CH-1811, 11812 CH-1812, 11813 CH-1813, 11814 CH-1814.

## 19 — Responsive layout

Status: DEFINED

At 820px and below Calendar is the phone build (61901): Day with a week strip, the day's agenda, classes in their slots and the now line; Month as a compact grid; List; an event opens in a sheet and New event is the full editor as a sheet. Below a 860px container the desktop reflows without a horizontal page scroll. The phone spec is `docs/clubhouse/phone/calendar.md` (approved, D-22); its differences from the board are Q-67.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 61901 | — | `PHONE_LAYOUT` | At 820px and below Calendar is the phone build, never a shrunken desktop: Day with a week strip, Month and List; an event opens in a sheet and New event is a sheet. State, writes and dialogs are the desktop's. |

From the shell (P001): 11901 PHONE_CHROME.

## 20 — Keyboard / input

Status: DEFINED

On the desktop N opens New event (coach), T goes to today, the arrows step a day, week or month, and Esc closes the panel; none fires while typing or with a dialog open (62001). The Find a time band moves a quarter hour with the left and right arrows and an hour with Shift (read in the code, not tested). The shell's edge swipe and browser back pop a pushed screen (12001).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 62001 | — | `KEYBOARD_SHORTCUTS` | On the desktop N opens New event (coach), T goes to today, the left and right arrows step a day, week or month (not in the agenda), and Esc closes the open panel. None of them fires while typing in a field or with a dialog open. |

From the shell (P001): 12001 CH-1906.

## 21 — Performance

Status: DEFINED

One loader for the whole screen, in three rounds of reads and no request from the browser at first paint (62101). The browser reads more only for the sections a person opens (calendar-app links, an event's files, the documents to attach, attendance), each once per opening. Web vitals are the shell's (12101). Not measured: layout shift, and the cost of drawing a busy month.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 62101 | — | `LOADER_READS_IN_THREE_ROUNDS` | The server loader reads each table once for the whole screen, in three rounds and never per event or per player: the team's zone, name and roster; then events, class schedules and (for a coach) their busy time together; then every event's replies, one read for each 200 events. A read that fails is flagged and logged, never thrown. |

From the shell (P001): 12101 CH-1954.

## 22 — Analytics

Status: DEFINED

The shell records rage, dead and slow clicks for every page (12201 to 12203). Calendar adds no events of its own.

From the shell (P001): 12201 CH-1951, 12202 CH-1952, 12203 CH-1953.

## 23 — Logging / observability

Status: DEFINED

Loader reads log through `chLogServer("calendar", <read>)` and are named on the page; failed writes and sections are reported through `chReport` and each intent leaves a `chTrail` breadcrumb (62301). Handled failures are low severity and a crash is high.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 62301 | — | `FAILURES_REPORTED` | A read that fails in the loader is logged through chLogServer("calendar", <read>) and named on the page; a write that fails is reported through chReport under the calendar surface with its action (calendar.saveEvent and the rest), after a chTrail breadcrumb for the intent; a section that cannot load reports under its own surface (calendar.subscribe, calendar.files, calendar.attendance). |

From the shell (P001): 12301 FAILURES_REPORTED.

## 24 — CI / automated test

Status: DEFINED

Every catalog code of kinds 0 to 5 that is not marked preview is forced by a named test, and every hand contract on this page is named by its Bridge ID in a test title (62401). The calendar model (weeks, months, lanes, overlaps, open times) is checked in `logic.test.ts`.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 62401 | — | `TESTS_NAME_CONTRACTS` | src/clubhouse/__tests__/calendar.test.tsx names in a test title every Calendar catalog code of kinds 0 to 5 that is not marked preview, and every hand contract on this page it proves by its Bridge ID; the calendar model checks are in logic.test.ts. |

From the shell (P001): 12401 TESTS_NAME_CONTRACTS.

## 25 — Helm Bridge action

Status: N/A — the Bridge is wired later (owner, D-68). Every contract above already has its Bridge ID; the commands (open New event, go to today, step to the next week, reply to an event) are defined when the Bridge is.
