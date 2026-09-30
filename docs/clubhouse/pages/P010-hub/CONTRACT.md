# P010 — Team Hub: page contract

Every behaviour Team Hub promises, by the 25 V2 categories (D-69). A contract's
number is its Bridge ID (D-68: namespace 10, category, item); `Code` is the
catalog code on the element and in the test (`docs/clubhouse/catalog/hub.md`).
Rows without a code are behaviours with no single element, recorded in
`config/clubhouse/bridge-contracts.json` by hand. The shell's contracts (P001,
namespace 1) apply here too and are named where they carry a category.
`clubhouse:check` holds this file to the registry.

## 01 — Default / core UI

Status: DEFINED

Team Hub opens on Home, or on the tab in `?tab=`, for a coach and for a player. The role is the session's: one address gives a coach the coach hub and a player the player hub. The server loader has read the page before first paint, so nothing is fetched in the browser to draw it. Not tested: that `?tab=` is read on the server so the tab is there on first paint, and that switching tabs leaves the address alone.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 100101 | — | `HUB_READY` | Team Hub opens on Home for a coach and for a player in the same frame: the role pill, the title, the team and season, and the tabs (Home, Announcements, Travel, Documents, and Tasks for a coach). A player's Home shows their RSVPs, the post waiting on them, the next trip, Updates and their tasks; a coach's shows this week's replies as counts, the newest post with its read receipts, the next trip and Updates, and a coach also gets New announcement. |
| 100102 | — | `TAB_LINK_OPENS_A_TAB` | ?tab=home\|ann\|travel\|docs\|tasks opens that tab; a tab the role does not have (tasks, for a player) or a value that is not a tab opens Home. |

## 02 — Initial loading / skeleton

Status: DEFINED

The route skeleton (CH-10405) is the Clubhouse one inside the shell and the Fairway one outside it; nothing shows for the first 150ms, then a fade (the shell's 11609). Team Hub loads no section on its own after the server render, so there are no section skeletons; a save in flight says what it is doing on its button (Uploading, Posting, Saving, Assigning).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 100201 | CH-10401 | `FILES_ARE_UPLOADING` | Files are uploading |
| 100202 | CH-10402 | `A_POST_IS_BEING_SENT` | A post is being sent |
| 100203 | CH-10403 | `A_TRIP_IS_BEING_SAVED` | A trip is being saved |
| 100204 | CH-10404 | `A_TASK_IS_BEING_ASSIGNED` | A task is being assigned |
| 100205 | CH-10405 | `TEAM_HUB_IS_LOADING` | Team Hub is loading |
| 100206 | CH-10406 | `AN_EDIT_IS_BEING_SAVED` | An edit is being saved |

## 03 — Background loading / refresh

Status: N/A — Team Hub has no realtime, polling or pull to refresh: the server reads the page once per visit, and a change that lands or a Try again reads it again (categories 14 and 15).

## 04 — Empty

Status: DEFINED

First run is the whole-page empty state, one for a coach (CH-10305, with New announcement and Plan a trip) and one for a player (CH-10306); each section has its own empty too (CH-10301 to CH-10304, CH-10307, CH-10308). A failed read is never shown as empty, and the page empty state is only for a page where every read answered and was empty, Updates included (100410). No team is CH-10309. Team Hub has no search or filter, so it has no filtered empty state.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 100401 | CH-10301 | `NO_EVENTS_NEED_A_REPLY` | No events need a reply |
| 100402 | CH-10302 | `NO_UPDATES` | No updates |
| 100403 | CH-10303 | `NO_TASKS` | No tasks |
| 100404 | CH-10304 | `NO_DOCUMENTS` | No documents |
| 100405 | CH-10305 | `A_COACH_WITH_NOTHING_POSTED` | A coach with nothing posted (v2 first run, gh-states EMPTY.hub.coach) |
| 100406 | CH-10306 | `A_PLAYER_WITH_NOTHING_FROM_THEIR_COACHES` | A player with nothing from their coaches (EMPTY.hub.player) |
| 100407 | CH-10307 | `NO_ANNOUNCEMENTS` | No announcements |
| 100408 | CH-10308 | `NO_TRIPS` | No trips |
| 100409 | CH-10309 | `NO_TEAM` | No team |
| 100410 | — | `PAGE_EMPTY_ONLY_WHEN_EVERY_READ_IS_EMPTY` | The whole-page empty state (CH-10305 for a coach, CH-10306 for a player) shows only when every section read answered and every one was empty, Updates included: a failed read, Updates too, shows its own notice with Try again instead, and an update to read is shown, never hidden behind No team updates yet. |
| 100411 | CH-10310 | `A_TEAM_WITH_NOBODY_ON_THE_ROSTER` | A team with nobody on the roster |
| 100412 | CH-10311 | `A_TEAM_WITH_NO_DOCUMENTS` | A team with no documents |
| 100413 | CH-10312 | `PLAN_A_TRIP_NO_UPCOMING_EVENTS_IN` | Plan a trip: no upcoming events in the next four months |
| 100414 | CH-10313 | `PLAN_A_TRIP_THE_TRAVELERS_STEP_WITH` | Plan a trip: the Travelers step with no calendar event |

## 05 — Validation

Status: DEFINED

Checked before anything is sent, with the message under the field and the warning haptic (focus does not move to the first invalid field: the checklist's rule is not met): a headline of at least three characters and at least one player when the audience is chosen (CH-10101, CH-10102); a trip's name, place, leaving day and a return that is not before it (CH-10103 to CH-10106); a task's name and at least one player (CH-10107, CH-10108). The drop zone has no client-side check on a file: one the server refuses says so by name (CH-10008).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 100501 | CH-10101 | `POSTING_WITH_A_HEADLINE_UNDER_THREE_CHARACTERS` | Posting or saving an edit with a headline under three characters |
| 100502 | CH-10102 | `POSTING_TO_CHOSEN_PLAYERS_WITH_NONE_CHOSEN` | Posting to chosen players with none chosen |
| 100503 | CH-10103 | `A_TRIP_WITH_A_NAME_UNDER_THREE` | A trip with a name under three characters |
| 100504 | CH-10104 | `A_TRIP_WITH_NO_DESTINATION` | A trip with no destination |
| 100505 | CH-10105 | `A_TRIP_WITH_NO_DEPARTURE_DAY` | A trip with no departure day |
| 100506 | CH-10106 | `A_RETURN_BEFORE_THE_DEPARTURE` | A return before the departure |
| 100507 | CH-10107 | `A_TASK_WITH_A_NAME_UNDER_THREE` | A task with a name under three characters |
| 100508 | CH-10108 | `A_TASK_FOR_NOBODY` | A task for nobody |
| 100509 | CH-10109 | `POSTING_OR_SAVING_AN_EDIT_WITH_NO` | Posting or saving an edit with no message (the server requires one) |

## 06 — Server / system error

Status: DEFINED

Every write has its own toast naming what failed and what to do, with Retry (CH-10001 to CH-10009); every section that fails to load has its own notice with Try again (CH-10201 to CH-10204, CH-10206, CH-10207); a crash stays in its section (CH-10205, SectionBoundary). The toast's Retry runs the whole change again, follow-ups included (101401).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 100601 | CH-10001 | `A_PLAYERS_RSVP_REPLY_FAILS` | A player's RSVP reply fails |
| 100602 | CH-10002 | `ACKNOWLEDGING_A_POST_FAILS` | Acknowledging a post fails |
| 100603 | CH-10003 | `CHECKING_OFF_A_TASK_FAILS` | Checking off a task fails |
| 100604 | CH-10004 | `A_FILE_WONT_OPEN` | A file won't open |
| 100605 | CH-10005 | `POSTING_AN_ANNOUNCEMENT_FAILS` | Posting an announcement fails |
| 100606 | CH-10006 | `SAVING_A_TRIP_FAILS` | Saving a trip fails |
| 100607 | CH-10007 | `ASSIGNING_A_TASK_FAILS` | Assigning a task fails |
| 100608 | CH-10008 | `UPLOADING_A_FILE_FAILS` | Uploading a file fails |
| 100609 | CH-10009 | `DELETING_A_POST_TASK_OR_FILE_FAILS` | Deleting a post, task or file fails |
| 100610 | CH-10201 | `RSVPS_DONT_LOAD` | RSVPs don't load |
| 100611 | CH-10202 | `UPDATES_DONT_LOAD` | Updates don't load |
| 100612 | CH-10203 | `TASKS_DONT_LOAD` | Tasks don't load |
| 100613 | CH-10204 | `DOCUMENTS_DONT_LOAD` | Documents don't load |
| 100614 | CH-10205 | `A_SECTION_CRASHES_WHILE_DRAWING` | A section crashes while drawing |
| 100615 | CH-10206 | `ANNOUNCEMENTS_DONT_LOAD` | Announcements don't load |
| 100616 | CH-10207 | `TRAVEL_DOESNT_LOAD` | Travel doesn't load |
| 100617 | CH-10208 | `THE_COACHS_ROSTER_DOESNT_LOAD` | The coach's roster doesn't load |
| 100618 | CH-10010 | `SAVING_AN_EDIT_TO_AN_ANNOUNCEMENT_FAILS` | Saving an edit to an announcement fails |
| 100619 | CH-10209 | `THE_TEAMS_DOCUMENTS_DONT_LOAD` | The team's documents don't load |
| 100620 | CH-10011 | `UNTICKING_A_DONE_TASK_FAILS` | Unticking a done task fails |
| 100621 | CH-10210 | `PLAN_A_TRIP_UPCOMING_EVENTS_DIDNT_LOAD` | Plan a trip: upcoming events didn't load |
| 100622 | CH-10211 | `PLAN_A_TRIP_WHO_IS_INVITED_TO` | Plan a trip: who is invited to the chosen event didn't load |

## 07 — Network / offline

Status: DEFINED

Every write refuses while offline before anything is sent, with the shell's toast naming what did not happen (100701); a save over 5 seconds says so once, the banner shows, and Try again on a notice while offline says so (the shell's). Team Hub has no realtime, so it has no connection-lost state of its own.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 100701 | — | `WRITES_REFUSE_OFFLINE` | Every write on the page (a reply, Got it, checking off a task, opening a file, posting an announcement, saving a trip, assigning a task, uploading a file, deleting a post, task or file) is refused while the browser is offline: nothing is sent, the shell's toast names what did not happen (CH-1903), the error haptic fires and nothing moves on; opening a file opens no blank tab. |

From the shell (P001): 10701 CH-1901, 10702 CH-1902, 10703 CH-1903, 10704 CH-1905.

## 08 — Permission / authorization

Status: DEFINED

Who may open the page: a coach or a player with `golf_clubhouse_ui` on for that role (the shell's gate); anyone else gets the Fairway Team Hub. The role decides the view: a player is never drawn a coach's controls and a coach never a player's (100801). A player's data carries only what is theirs (100802) and only the events they are invited to that still take a reply (100803). Off any team, a coach or a player gets the no-team page (CH-10309, category 04); a player whose team membership can't be read gets the route's error view and is never told they have no team (shared with every page, `routes/team.ts`; not tested here). The server actions are the gate that counts (100804, reserved: read, not run), and two of them are weaker than the screen: `deleteGolfDocument` lets any active member of the team through and `uploadGolfDocument` any signed-in user, so for those the screen and row-level security are the gate; reported, not changed here.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 100801 | — | `CONTROLS_FOLLOW_THE_ROLE` | The role from the session decides the controls: a player is never drawn New announcement, Plan a trip, Assign, the drop zone or a delete menu, and a coach is never drawn a reply button, Got it or a task box. |
| 100802 | — | `PLAYER_GETS_ONLY_WHAT_IS_THEIRS` | A player's data carries none of their teammates' read receipts (an announcement's acknowledged and recipient counts), replies, task completions, traveler lists or names, and no roster; those are in a coach's data only, where the same post reads 5 of 6. |
| 100803 | — | `REPLY_ONLY_WHERE_IT_IS_OPEN` | A player is offered Going, Maybe and Can't only on an event they are invited to that still takes a reply: an event they have no place on the invite list of (the aggregate gives it no reply status, and a reply would add them to the list), one that has started (an all-day event, a day after its stored start), one that was cancelled and one past its RSVP deadline are left off the list, by the rules respondToEvent enforces; a rules read that fails leaves the rows in place for the server to decide. |
| 100804 | — | `SERVER_ACTIONS_ARE_THE_GATE` | Every write is checked again by its server action, whatever the screen shows: createEnrichedAnnouncement, createGolfTravelItinerary, createTask, createGolfDocument, deleteAnnouncement and deleteTask refuse a caller who is not a coach of the team, and respondToEvent, acknowledgeAnnouncement and completeTask refuse a caller with no player profile or team membership; deleteGolfDocument (any active member of the team passes) and uploadGolfDocument (any signed-in user passes) do not check for a coach, so for those the screen and row-level security are the gate. Read in this pass, not run: no test here forces a refusal. |

From the shell (P001): 10801 CLUBHOUSE_GATE, 10802 ROLE_SCOPED_NAV.

## 09 — Success

Status: DEFINED

A change that lands names itself in a toast with the success haptic (100901); Got it and opening a file land without a toast, because the button turning to Acknowledged and the file opening are the confirmation. Team Hub never says a push notification went out: the design's push line is not built (Q-70).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 100901 | — | `CHANGE_LANDED` | A change that lands names itself in a toast with the success haptic (Posted, Seahawk is on Travel, Book physicals assigned to the team, Local rules.pdf shared with the team, Deleted, You're going to Team dinner, Sign travel waiver done); Got it and opening a file land without a toast, since the button turning to Acknowledged and the file opening are the confirmation. |

From the shell (P001): 10901 CHANGE_LANDED.

## 10 — Warning

Status: N/A — Team Hub has no non-blocking warnings: a mistake in a form blocks the send with its message and the warning haptic (category 05), and Delete asks first (category 11).

## 11 — Destructive

Status: DEFINED

Deleting a post, a task or a file asks first, with the warning haptic before the question, and says what goes with it: a post takes its acknowledgements, a task leaves every player's list, a file can no longer be opened and can't be brought back (CH-10501 to CH-10503, CH-10702). Nothing is optimistic: the item leaves the page only once the server has deleted it (101301). There is no Undo.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 101101 | CH-10501 | `DELETING_AN_ANNOUNCEMENT` | Deleting an announcement |
| 101102 | CH-10502 | `DELETING_A_TASK` | Deleting a task |
| 101103 | CH-10503 | `DELETING_A_FILE` | Deleting a file |

## 12 — State preservation

Status: DEFINED

A post, trip or task that fails keeps every field as typed and the sheet open; Cancel keeps a half-written form while the page stays open; a save that lands clears it (101201). Cancel on the trip and task forms works the same way; only the announcement's is tested. The active tab is not kept in the address: a reload returns to the tab in `?tab=` or to Home. A reply, Got it and a task tick made on the page stay while it is open.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 101201 | — | `FORM_KEPT_ON_FAILURE` | A post, trip or task that fails leaves its sheet open with every field as typed; nothing is cleared until the save lands, and a save that lands clears the form for the next one. Cancel keeps a half-written announcement for as long as the page stays open. |

## 13 — Optimistic UI

Status: DEFINED

A reply, Got it and a task check show at once and go back to the last answer the server confirmed when the write is refused or throws (101301, CH-10001 to CH-10003). Everything else waits for the write: posting, planning a trip, assigning, uploading and deleting. The change and its undo live inside the action, so Retry shows the change again.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 101301 | — | `CHANGES_SHOW_AT_ONCE` | A reply, Got it and a task check show at once and go back to the last answer the server confirmed if the write is refused or throws; posting, planning a trip, assigning, uploading and deleting are not optimistic: they wait for the write, and a refusal leaves everything as it was. |

## 14 — Retry / recovery

Status: DEFINED

The error toast's Retry runs the same write with the same arguments, and when it lands everything the button would have done follows (101401); Try again on a failed-read notice has the server read the whole page again (101402).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 101401 | — | `RETRY_FINISHES_THE_JOB` | The error toast's Retry runs the same write again with the same arguments, and when it lands everything the button would have done follows: the reply, Got it or task tick shows, the file opens in a tab of its own, the sheet closes and clears, the page reads again, the deleted row leaves and its dialog closes, and the drop zone reads Uploading. This holds for all nine writes: a reply, Got it, a task check, opening a file, posting, planning a trip, assigning a task, uploading, and deleting a post, a task or a file. |
| 101402 | — | `TRY_AGAIN_REREADS_THE_PAGE` | Try again on a failed-read notice has the server read the whole page again; none re-reads a section on its own. |

From the shell (P001): 11401 ROUTE_TRY_AGAIN, 11402 TOAST_RETRY.

## 15 — Data freshness / sync

Status: DEFINED

Nothing refreshes in the background: the page is as fresh as its last read. After a coach's change lands, the page reads again (101501); every date and time is resolved on the server in the team's zone.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 101501 | — | `PAGE_READS_AGAIN_AFTER_A_CHANGE` | After a coach's post, trip, task, upload or delete lands, the page reads again from the server (router.refresh). |

## 16 — Micro animation

Status: DEFINED

Team Hub adds no motion of its own (`hub.css` has no transition or animation): its sections rise once at first paint and every press, sheet and skeleton fade is the shell's (D-64).

From the shell (P001): 11601 CH-1601, 11602 CH-1602, 11603 CH-1603, 11604 CH-1604, 11605 CH-1605, 11606 CH-1606, 11607 CH-1607, 11608 CH-1608, 11609 CH-1609, 11610 CH-1610, 11611 CH-1611, 11612 CH-1612.

## 17 — Haptic

Status: DEFINED

Team Hub's own (CH-10701, CH-10702) on the v2 grammar (D-70): a tick for a tab, a reply, an audience or transport choice and a player chip, a light tap on the Write an announcement line, a warning before Delete and on a form sent with a mistake; success and error come from the shell for every save.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 101701 | CH-10701 | `A_TAB_AN_RSVP_REPLY_AN_AUDIENCE` | A tab, an RSVP reply, an audience or transport choice, a player chip, a file to attach or take off |
| 101702 | CH-10702 | `DELETE_A_FORM_SENT_WITH_A_MISTAKE` | Delete (before the question), a form sent with a mistake |

From the shell (P001): 11701 CH-1701, 11702 CH-1702, 11703 CH-1703, 11704 CH-1704, 11705 CH-1705, 11706 CH-1706.

## 18 — Accessibility

Status: DEFINED

The tabs are a real tablist, each controlling its panel; a reply is a radio group named for its event; a task's box names the task and says when it is done; each card is a section named by its heading, and a failed-read or crash notice is an alert (101801). Toasts are announced by the shell. Axe over every preview state at 1280 and 390 is reserved: it was not run in this pass (101802). Not built: arrow keys moving between tabs (Tab visits each).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 101801 | CH-10801 | `THE_SECTIONS_ARE_REAL_TABS_AN_RSVP` | The sections are real tabs (selected state, each controls its panel); an RSVP is a radio group named for its event; a task's box names the task and says when it's done |
| 101802 | CH-10802 | `NO_AXE_VIOLATIONS_IN_ANY_PREVIEW_STATE` | No axe violations in any preview state, 1280px and 390px |

From the shell (P001): 11801 CH-1801, 11802 CH-1802, 11803 CH-1803, 11804 CH-1804, 11805 CH-1805, 11806 CH-1806, 11807 CH-1807, 11808 CH-1808, 11809 CH-1809, 11810 CH-1810, 11811 CH-1811, 11812 CH-1812.

## 19 — Responsive layout

Status: DEFINED

The phone build at 820px and below (101901); the phone spec is `docs/clubhouse/phone/team-hub.md` (approved). A player reaches Team Hub from the tab bar and a coach from More, whose top bar carries a back link (the shell's `PhoneTop`; not tested here, it needs the shell's slot). That the sheets are bottom sheets on the phone is CSS and is not tested.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 101901 | — | `PHONE_LAYOUT` | At 820px and below Team Hub is the phone build, never a shrunken desktop: the page takes the phone frame, the title is read by a screen reader instead of drawn, and the same tabs, writes and sheets are there. State, writes and sheets are the desktop's. |

From the shell (P001): 11901 PHONE_CHROME.

## 20 — Keyboard / input

Status: DEFINED

The tabs are one stop in the tab order: left and right arrows (wrapping), Home and End move between them and select, and Tab goes on to the panel (102001). The reply buttons and every other control on the page are native buttons in the tab order. Esc closes a sheet and focus returns to the button that opened it (102001). No shortcuts of its own.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 102001 | — | `TABS_AND_REPLIES_WORK_FROM_THE_KEYBOARD` | The tabs are one stop in the tab order: left and right arrows (wrapping), Home and End move between them and select, and Tab goes on to the panel. The reply buttons are native buttons: Enter or Space presses them. Esc closes a sheet and focus goes back to the button that opened it. |

## 21 — Performance

Status: DEFINED

The loader reads in a few rounds and never per row (102101): the team's zone, then the team, roster, documents and updates together, then a player's aggregate and its follow-ups, or a coach's announcements, trips, tasks and this week's events together and then attendance, task completion and authors together. It is not a single pass: a player's path is several rounds deep, and `getPlayerHubSummaryData` is an aggregate of several reads of its own. Web vitals are the shell's.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 102101 | — | `LOADER_READS_IN_ROUNDS` | The server loader reads the page for either role before first paint, in a few rounds of parallel reads and never one request per row: attendance, task completion and a player's reply rules are each read once for every event or task together (in chunks of 200); a read that fails is flagged on its own section and logged, never thrown, so a partial read still renders the rest. |

From the shell (P001): 12101 CH-1954.

## 22 — Analytics

Status: DEFINED

The shell records rage, dead and slow clicks for every page. Team Hub adds no events of its own.

From the shell (P001): 12201 CH-1951, 12202 CH-1952, 12203 CH-1953.

## 23 — Logging / observability

Status: DEFINED

Failed reads are logged by name, failed writes are reported under the `hub` surface with their action, intents leave a breadcrumb and a crash reports under its own section (102301).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 102301 | — | `FAILURES_REPORTED` | A read that fails in the loader is logged through chLogServer("hub", <read>) and named on the page; a write that fails is reported through chReport under the hub surface with its action (hub.reply and the rest), at low severity when the server refused it, after a chTrail breadcrumb for the intent (hub tab <tab>, action hub.<name>); a section that crashes reports under its own surface (hub.updates and the rest). |

From the shell (P001): 12301 FAILURES_REPORTED.

## 24 — CI / automated test

Status: DEFINED

Every catalog code of kinds 0 to 5 is forced by a named test and so is every hand contract listed here (102401); `clubhouse:check` fails a catalog row of kinds 0 to 5 that no test names.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 102401 | — | `TESTS_NAME_CONTRACTS` | src/clubhouse/__tests__/hub.test.tsx names in a test title every Team Hub catalog code of kinds 0 to 5 that is not marked preview, and every hand contract on this page it proves by its Bridge ID. |

From the shell (P001): 12401 TESTS_NAME_CONTRACTS.

## 25 — Helm Bridge action

Status: N/A — the Bridge is wired later (owner, D-68). Every contract above already has its Bridge ID; the commands (open a tab, post an announcement, plan a trip, assign a task) are defined when the Bridge is.
