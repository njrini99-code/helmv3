# P006 — Calendar: wiring map

## Entry point

```text
Route:                   /golf/dashboard/calendar
Page:                    src/app/golf/(dashboard)/dashboard/calendar/page.tsx (no session -> login; isClubhouseFor -> Clubhouse, else Fairway)
Clubhouse route adapter: src/clubhouse/routes/calendar.tsx#ClubhouseCalendarRoute (session, team; no team -> CalendarNoTeam, CH-6307;
                         reads view, date, event, new, with and type from the address)
Server loader:           src/clubhouse/data/calendar.ts#loadCalendar (team, roster, events, classes, replies and, for a coach, their own
                         busy time; three rounds of reads; each failed read logs through chLogServer('calendar', …) and never throws)
Screen:                  src/clubhouse/screens/calendar/Calendar.tsx (the live container) -> TimeGrid | MonthView | AgendaView and the
                         panel (Summary | EventDetail | Attendance | Overlap), or CalendarPhone with the panel in a Modal (useChPhone, 820px)
Skeleton:                src/clubhouse/screens/calendar/CalendarSkeleton.tsx (CH-6401), through loading.tsx and ClubhouseSwitch
Route error view:        src/app/golf/(dashboard)/dashboard/calendar/error.tsx (the shell's RouteErrorBoundary, 106xx)
```

## End-to-end graph

```text
UI (Calendar, TimeGrid, MonthView, AgendaView, EventDetail, Attendance, Overlap, EventEditor, CancelEvent, SubscribeSheet,
    BusySheet, BusyDetail, EventFiles, FilePicker, CalendarPhone)
↓
Action (the useAction objects in editor.tsx, extras.tsx and inspector.tsx: whatever follows a landed write lives inside the action, 61401)
↓
Client controller: useAction (offline refusal CH-1903, slow notice CH-1902, chReport + error toast with Retry + haptic);
                   EventFiles.detach, which does the same by hand (60701)
↓
Server actions: src/app/golf/actions/golf.ts, recurring-events.ts, attendance.ts, event-documents.ts, documents.ts, calendar-feeds.ts
↓
Data: golf_events, golf_event_attendance, golf_player_classes, golf_coach_blocked_time, golf_event_documents, golf_documents,
      golf_calendar_feeds, golf_team_settings
↓
Read-back: router.refresh() re-runs the loader; there is no realtime subscription
↓
Contract outcomes: CONTRACT.md (Bridge IDs 6ccii, catalog CH-6xxx)
↓
Bridge: recorded, not wired (D-68)
↓
Tests: src/clubhouse/__tests__/calendar.test.tsx, and the calendar model in logic.test.ts
```

## Actions

Each action's record is in `config/clubhouse/pages/P006-calendar.json` (`actions`), and the whole list is readable
in `docs/clubhouse/generated/CLUBHOUSE_ACTION_MAP.md`. Offline, every write that goes through `useAction` is refused
before anything is sent (the shell's 10703, CH-1903); file removal and its Undo do the same by hand (60701). A `*`
marks an action a player cannot use (60801): the control is not drawn, and the server refuses it as well (60806).

| Action | Control | Handler | Service | Data | Contracts |
| --- | --- | --- | --- | --- | --- |
| ACT-P006-PUBLISH-EVENT* | New event › Publish event (Enter in the form) | `submit` › `save` (`calendar.saveEvent`) | `createGolfEvent`, or `createRecurringEvent` when it repeats | golf_events, golf_event_attendance | no title 60501 · time 60502 · clash 61001 · fails 60601 · lands 60901 · retry 61401 · kept 61202 |
| ACT-P006-EDIT-EVENT* | Edit event / Review new time › Save changes or Move event | `submit` › `save` | `updateGolfEvent`, or `editRecurringEvent` for a series scope | golf_events, golf_event_attendance | as above · discard 61201 · overlap 61002 |
| ACT-P006-CANCEL-EVENT* | Event actions › Cancel event › Cancel event | `cancel` (`calendar.cancelEvent`) | `deleteGolfEvent` (a soft cancel), or `deleteRecurringEvent` for a series scope (it deletes the events; the question says so) | golf_events | confirm 61101 · fails 60602 · lands 60901 · retry 61401 |
| ACT-P006-REPLY | Your reply: Going, Maybe, Can't make it (player) | `pick` › `reply` (`calendar.rsvp`) | `respondToEvent` | golf_event_attendance | invited only 60807 · at once 61301 · fails or locked 60610 · retry 61401 |
| ACT-P006-LOAD-ATTENDANCE* | Attendance | effect on `Attendance` | `getAttendanceReport` | golf_event_attendance | loading 60205 · fails 60621 |
| ACT-P006-SAVE-ATTENDANCE* | Mark all present, the marks, Save attendance | `save` (`calendar.attendance`) | `markAttendance` for each changed mark | golf_event_attendance | fails 60611 · partial 61203 · lands 60901 |
| ACT-P006-ADD-BUSY-TIME* | More › Add busy time › Add busy time | `save` (`calendar.addBusy`) | `addCoachBlockedTime` | golf_coach_blocked_time | name 60503 · time 60504 · fails 60606 · lands 60901 · kept 61202 · retry 61401 |
| ACT-P006-REMOVE-BUSY-TIME* | Remove busy time (or Remove the series) › Remove | `remove` (`calendar.deleteBusy`) | `deleteCoachBlockedTime` | golf_coach_blocked_time | confirm 61102 · fails 60605 · lands 60901 · retry 61401 |
| ACT-P006-LIST-EVENT-FILES | Files, on an open event | effect on `EventFiles` | `getEventDocuments` | golf_event_documents, golf_documents | loading 60203 · none 60403 · fails 60619 |
| ACT-P006-LIST-DOCUMENTS* | Attach | effect on `FilePicker` | `getDocuments` | golf_documents | loading 60204 · none 60404 · fails 60620 |
| ACT-P006-ATTACH-FILE* | Attach › a document › Attach | `attach` (`calendar.attachFile`) | `attachDocumentToEvent` | golf_event_documents | fails 60607 · lands 60901 · retry 61401 |
| ACT-P006-REMOVE-FILE* | ✕ beside a file | `detach` | `detachDocumentFromEvent` | golf_event_documents | at once 61302 · fails 60608 · offline 60701 |
| ACT-P006-UNDO-REMOVE-FILE* | Undo in the Removed toast | the toast action in `detach` | `attachDocumentToEvent` | golf_event_documents | fails 60609 · offline 60701 |
| ACT-P006-LIST-CALENDAR-LINKS | More › Add to calendar app | effect on `SubscribeSheet` | `getCalendarFeeds` | golf_calendar_feeds | loading 60202 · fails 60618 |
| ACT-P006-CREATE-CALENDAR-LINK | Create link (the team link is a coach's) | `create` (`calendar.createFeed`) | `createCalendarFeed` | golf_calendar_feeds | player 60804 · fails 60603 · lands 60901 · retry 61401 |
| ACT-P006-COPY-CALENDAR-LINK | Copy link | `copy` | the clipboard | — | fails 60604 |
| ACT-P006-COPY-EVENT-LINK | Event actions › Copy link | `copyLink` | the clipboard | — | fails 60612 |
| ACT-P006-DUPLICATE-EVENT | Event actions › Duplicate (coach) | `onDuplicate` → `EventEditor` seeded with `copyOf` | `createGolfEvent` (on Publish) | golf_events, golf_event_attendees | the New event contracts: name 60503 · lands 60901 |
| ACT-P006-COMPARE-SCHEDULES | Class detail › Compare schedules (coach) | `onFind` → `EventEditor` seeded with the day and the class's player | `createGolfEvent` (on Publish) | golf_events | the New event contracts |
| ACT-P006-PRINT | More › Print week (Print day, month, agenda) | `window.print` | the browser | — | none (the print rules in calendar.css and shell.css) |
| ACT-P006-NAVIGATE | Previous, Next, Today, the view switch, the title's date panel, a day header, a month cell | `go`, `step`, `goToday` | `loadCalendar` through the page, past the window | golf_events and the other loader tables | address 60102 · window 60302 · follows 60303 · busy 60301 · keys 62001 · fails 60613 |
| ACT-P006-OPEN-EVENT | An event on the grid, in the agenda, in Summary, or by `?event=` | `open` | — | — | address 60102 · left the range 60405 |
| ACT-P006-SEED-NEW-EVENT* | `?new=1` (`&with=`, `&type=`) from another page | `initialNew`, `initialWith`, `initialType` | — | — | seeds 60103 |
| ACT-P006-REVIEW-OVERLAP* | Review (event panel, Summary), then Review new time or Keep as is | `Overlap`, `ctx.onEdit(event, proposal)` | — | — | overlap 61002 |

## Components

| Path | Purpose | States |
| --- | --- | --- |
| `screens/calendar/Calendar.tsx` | The live container: view, day and panel state, the keys, the window logic, the failed-read notices, the dialogs | 60101, 60302, 60303, 62001, 60613 to 60615, 60622, 60623, 60624 |
| `screens/calendar/views.tsx` | `TimeGrid`, `MonthView`, `AgendaView`, `eventTitle` | 60401, 61002 |
| `screens/calendar/inspector.tsx` | `Summary`, `EventDetail`, `PlayerReply`, `ClassDetail`, `Attendance`, `Overlap`, `Lanes` | 60402, 60405, 60406, 60610, 60611, 60616, 60617, 60621, 60807 |
| `screens/calendar/editor.tsx` | `EventEditor` with `FindTime`, `CancelEvent`, `SubscribeSheet` | 605xx, 60601, 60602, 60603, 60604, 60618, 61001, 61101, 61201 |
| `screens/calendar/extras.tsx` | `BusyDetail`, `BusySheet`, `EventFiles`, `FilePicker` | 60503, 60504, 60605 to 60609, 60619, 60620, 61102, 61302 |
| `screens/calendar/CalendarPhone.tsx` | The phone: `DayView`, `MonthGrid`, the List | 61901, 60408 |
| `screens/calendar/model.ts` | The pure model: dates, lanes, overlaps, open times, busy-time expansion | logic.test.ts |
| `screens/calendar/CalendarSkeleton.tsx` | Route skeleton | 60201 |
| `screens/calendar/CalendarNoTeam.tsx` | No team | 60407 |

## Hooks

| Path | Type | Used by |
| --- | --- | --- |
| `src/clubhouse/lib/use-action.ts` (`useAction`, `normalise`, `isOffline`) | Clubhouse | every write, and the offline check in `EventFiles` |
| `src/clubhouse/lib/use-phone.ts` (`useChPhone`) | Clubhouse | Calendar, Modal |
| `src/clubhouse/lib/use-now.ts` (`useNow`) | Clubhouse | Calendar (the now line and "today") |
| `src/clubhouse/lib/haptics.ts`, `track.ts`, `press.ts` | Clubhouse | throughout |
| `src/hooks/useRSVP.ts` (`readRsvpLockCode`, `rsvpLockMessage`) | shared, not UI | `PlayerReply` (the reply's lock words) |

## Services / server actions

| Name | Path | Existing/New/Held | Purpose |
| --- | --- | --- | --- |
| createGolfEvent, updateGolfEvent, deleteGolfEvent (a soft cancel), respondToEvent | actions/golf.ts | Existing | events and replies |
| addCoachBlockedTime, deleteCoachBlockedTime | actions/golf.ts | Existing | the coach's busy time |
| createRecurringEvent, editRecurringEvent, deleteRecurringEvent (the last two act only on events the caller created, CONTRACT.md 08) | actions/recurring-events.ts | Existing | series |
| getAttendanceReport, markAttendance | actions/attendance.ts | Existing | attendance |
| getEventDocuments, attachDocumentToEvent, detachDocumentFromEvent | actions/event-documents.ts | Existing | an event's files |
| getDocuments | actions/documents.ts | Existing | the documents to attach |
| getCalendarFeeds, createCalendarFeed | actions/calendar-feeds.ts | Existing | calendar-app links |

## Data resources

### DATA-CALENDAR

```text
Tables:   golf_events, golf_event_attendance, golf_player_classes, golf_coach_blocked_time, golf_team_settings,
          golf_teams, golf_team_members
RPCs:     none from this page
Realtime: none
Cache:    none; router.refresh() re-runs the loader
RLS:      the loader reads through the request's RLS client (no service role); a coach reads every rostered player's classes,
          a player only their own, and busy time is read by coach_id
Read path:  loadCalendar, on the server, in three rounds: the team (zone, name, roster); events, classes and busy time; replies
Write path: the server actions above
```

### DATA-EVENT-FILES

```text
Tables:   golf_event_documents, golf_documents
Read path:  getEventDocuments (an event's files), getDocuments (the team's documents to attach)
Write path: attachDocumentToEvent, detachDocumentFromEvent (coaches of the event's team)
```

### DATA-CALENDAR-LINKS

```text
Tables:   golf_calendar_feeds
Read path:  getCalendarFeeds
Write path: createCalendarFeed (the team link only for a coach)
```

## Held dependencies

None. Data is existing and no held plan is listed.

## Impact notes

- The server actions are shared with Fairway's calendar and with Team Hub (`respondToEvent`). A change to one changes
  both UIs.
- The toast's Retry runs the action of the render that showed the failure, so anything that follows a landed write
  (closing a dialog, moving the panel, `router.refresh()`, re-reading a list) has to live inside the function passed
  to `useAction`, guarded by `normalise(res).success`, never in the button's handler (61401). `PlayerReply` keeps the
  last confirmed answer in a ref for the same reason.
- `loadCalendar` trims a player's data (60802, 60803). A new field on `ChCalEvent` has to be decided for a player in
  the loader, not on the screen.
- The `Calendar` container serves the phone as well: a change to a dialog or a write changes both layouts.
- `ChCalendarData.today` and `nowHour` are the server's reading of the team's zone; the browser's clock only moves the
  now line (61501).
