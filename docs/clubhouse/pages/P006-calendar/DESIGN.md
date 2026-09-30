# P006 — Calendar: design handoff

## Package

```text
Source:   the owner's Claude Design bundles, in design/handoff/ (VERSIONS.md)
Version:  v2 (2026-09-29): Coach - Calendar.html, Coach - Calendar - Mobile.html, m-cal.jsx
          v1: Calendar.html, cal-views.jsx, cal-inspector.jsx, cal-editor.jsx, cal-data.js,
          screenshots calendar-01..12 (the desktop reference the built screen was compared with)
Date:     2026-09-29 (desktop), 2026-09-30 (phone, built from the v2 board)
Status:   approved (the desktop as drawn; the phone board is the spec, D-22)
```

The design draws the coach. There is no player board: a player gets the same page with the permissions
they already have (D-1), which is a decision of the build, not a drawing.

## Design objective

A calm week at a glance that answers "is anyone in the way?" before the coach publishes: classes and
busy time drawn in their slots, overlaps marked, and a panel that turns the marks into a next step.

## Problems being solved

Coaches keeping the team schedule in one place and the class schedules in another, discovering a clash
after the players have been told; replies that come back in messages and texts; attendance on paper.

## User goal

Plan an event that everyone invited can attend, and know afterwards who answered and who came.

## Visual hierarchy

The masthead (month or week, the count of team events, the zone), the toolbar (step, view, people,
legend), the grid on a lit sheet, and the panel beside it. On the phone: the month and a Day, Month or
List switch, the week strip and the day's agenda; an event opens in a sheet.

## Components

### Reused Clubhouse primitives

`Avatar`, `Badge`, `Button`, `IconButton`, `Modal` (a sheet on the phone), `Menu`, `InlineNotice`,
`EmptyState` (section and page, D-71), `SectionBoundary`, `Skeleton`, `SearchField`, `Segmented`,
`PillGroup`, `Toast`, `PhoneTop`, `PhoneIconAction`, `useChPhone`.

### New Clubhouse components

`Calendar` (the live container), `TimeGrid` (day and week), `MonthView`, `AgendaView` (`views.tsx`);
`Summary`, `EventDetail`, `ClassDetail`, `Attendance`, `Overlap`, `Lanes` (`inspector.tsx`);
`EventEditor` with its Find a time band, `CancelEvent`, `SubscribeSheet` (`editor.tsx`); `BusyDetail`,
`BusySheet`, `EventFiles`, `FilePicker` (`extras.tsx`); `CalendarPhone` with its `DayView` and
`MonthGrid`; `CalendarSkeleton`, `CalendarNoTeam`; the pure model in `model.ts`.

### Modified Clubhouse components

None for this page beyond the foundation's v2 changes (motion, haptics, page empty state).

## Actions affected

All of them: the list is `config/clubhouse/pages/P006-calendar.json` `actions`, and the graph is
WIRING.md.

## Contract categories affected

All 25 (CONTRACT.md).

## Motion intent

An event lifts and takes a green ring on hover or selection (180ms) and shrinks about 6px when pressed
(110ms, released in 280ms) (CH-6601); the Find a time band follows the pointer in 15-minute steps and the
overlapped lanes turn amber as it passes (CH-6602); the now line moves down the grid (CH-6603).
Everything uses the v2 tokens (D-64). Not tested here: all three are marked preview in the catalog.

## Haptic intent

v2 grammar (D-70): selection for opening an event, a day or a panel item, changing the view, the week or
the people, and each Find a time step (CH-6701); the warning pattern for a form with a problem and for
closing the editor with changes (CH-6702); success when a change lands or a link is copied (CH-6703);
error when a change fails.

## Desktop

The grid and the panel side by side (`.ch-cal-body`); below a 860px container the canvas reflows
without a horizontal page scroll. The keys are N (New event), T (today), the arrows (previous and
next) and Esc (close the panel).

## Phone

Approved spec `docs/clubhouse/phone/calendar.md`: Day (the week strip and the day's agenda with classes
and the now line), Month (a compact grid, competition days dark), List (the desktop agenda), an event in
a sheet (the desktop panel), and New event as a sheet (the full desktop editor). The coach's top bar is
the tab root with New event (D-66); a player reaches Calendar from More and has Add to calendar app.
Differences from the board are Q-67.

## Accessibility

Each event is a button named with its title and time and, when it has one, "schedule overlap"; each day
header opens the day; the panel is a polite live region; the editor's fields are tied to their errors;
the people filter announces how many players are shown; dialogs trap focus and close on Esc. The known
axe exception is the 7-day week at 390px, which the phone build replaces.

## Data assumptions

Only data the app has. Not shown because no source exists: a Workout type (practices stand in, D-11),
Message invitees (Q-67). Print week (More, the browser's print with the shell and tools dropped) and
Duplicate (Event actions, New event seeded from the event) were built 2026-09-30 (CLICKABLES gaps 9 and 15).

## Existing backend capabilities used

`createGolfEvent`, `updateGolfEvent`, `deleteGolfEvent` (a soft cancel), `respondToEvent`,
`addCoachBlockedTime`, `deleteCoachBlockedTime` (`golf.ts`); `createRecurringEvent`,
`editRecurringEvent`, `deleteRecurringEvent` (`recurring-events.ts`); `getAttendanceReport`,
`markAttendance` (`attendance.ts`); `getEventDocuments`, `attachDocumentToEvent`,
`detachDocumentFromEvent` (`event-documents.ts`); `getDocuments` (`documents.ts`); `getCalendarFeeds`,
`createCalendarFeed` (`calendar-feeds.ts`). WIRING.md maps each.

## HELD requirements

### New features

None.

### New data/schema

None.

### Owner decisions

D-1 (a player's Calendar), D-8 (the URL holds the state), D-9 (overlaps come from the loaded data),
D-11 (types are the database's), D-22 (the phone board is the spec), D-47 and D-52 (the `?new=1` and
`&with=` seeds), D-64 (motion), D-66 (Calendar is a coach tab; a player opens it from More), D-70
(haptics), D-71 (page empty state), Q-67 (phone differences).

## Explicit non-goals

Two-way sync with a calendar app (the links are one-way), a Workout type, Message
invitees, and a first-run page empty state for a team that has never scheduled anything (D-71 names it;
it is not built yet, and an empty range still draws the grid).

## Fresh-build confirmation

```text
[x] No old Fairway presentation is required
[x] No old Fairway component is nested in the new screen (clubhouse:check refuses the imports)
[x] Shared reuse is non-UI/headless infrastructure only (the server actions and the recurrence helpers)
```
