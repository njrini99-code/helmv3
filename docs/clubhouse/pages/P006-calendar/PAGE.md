# P006 — Calendar

The team's schedule for a coach, and a player's view of it. Coaches plan and take attendance; players
see the team's events, reply to the ones they are invited to, and see only their own classes.

## Identity

```text
Page ID:            P006
Page Name:          Calendar
Route:              /golf/dashboard/calendar (coach and player); ?view=day|week|month|agenda,
                    ?date=YYYY-MM-DD, ?event=<id>, ?new=1 (&with=<player>, &type=<type>)
Bridge Namespace:   6 (Bridge IDs 6ccii, D-68; catalog codes CH-6xxx)
Roles:              coach, player
Implementation Root: src/clubhouse/screens/calendar
Manifest:           config/clubhouse/pages/P006-calendar.json
```

## Purpose

### Primary user

A college golf coach planning the week: practices, qualifiers, tournaments, meetings and travel, with
every player's classes in view so that nothing is scheduled on top of one. A player uses the same page
to see what is coming and to answer the coach.

### Job to be done

Put the right event on the calendar at a time when the people invited can be there, know who has
answered and who came, and never have to open a class list to find out who is busy.

### Primary action

Coach: publish an event (New event). Player: answer an event they are invited to (Going, Maybe, Can't
make it).

### Secondary actions

Move to another day, week or month, or to the agenda; open an event and see its responses (coach),
edit or cancel it, take attendance, attach a file from Documents, review a schedule overlap and pick
one of the suggested open times; choose whose schedule to show (coach); add busy time of your own
(coach); add the calendar to Apple, Google or Outlook; copy an event's link.

### Information hierarchy

1. The grid for the chosen days: events by time, classes and busy time in their slots, the now line on
   today, overlaps marked.
2. The panel beside it: today and what needs attention (Summary), or the open event with its facts,
   responses and files.
3. The tools: New event, the view switch, the people filter, Today, and the More menu.

### User should notice first

What is on today and what needs the coach's attention this week (an overlap, replies still pending);
for a player, the events waiting on their reply.

### User should never have to think about

Which timezone a time is in (the team's, stated beside the count), whether a class is in the way (it is
marked, and the editor warns before anything is published), what a player is allowed to see (the server
decides, and a player's browser is never sent a teammate's reply or class), or whether a change landed
(each says so, or says what did not happen, and keeps what was typed).

### Success looks like

A coach adds a week of practices, sees that one collides with a class, moves it to a suggested open time
and publishes, in a couple of minutes, and every failure along the way told them exactly what did not
happen.

## Semantic features

Canonical IDs from `memory/registry.yml`:

```text
- calendar_events (memory/features/calendar-events.md)
```

## Design authority

```text
Package:          design/handoff/ (v2; VERSIONS.md). v1 files kept where records cite them.
Desktop reference: design/handoff/Coach - Calendar.html, cal-views.jsx, cal-inspector.jsx,
                  cal-editor.jsx (v1: Calendar.html, screenshots calendar-01..12)
Phone spec:       docs/clubhouse/phone/calendar.md (approved, D-22), from
                  design/handoff/Coach - Calendar - Mobile.html, m-cal.jsx
Status:           approved
```

## Related pages

### Enters from

The sidebar (both roles) and the phone tab bar (coach; a player opens it from More, D-66); Home's New
event (`?new=1`) and its phone quick chips (`?new=1&type=`); Roster's Plan 1:1 (`?new=1&with=<player>`,
D-52); Messages' Schedule (`?new=1`, D-47); Team Hub's Create event (`?new=1`) and each event in its
reply list (`?date=&event=`); the shell's next-event card (`?event=<id>`).

### Exits to

The files attached to an event, which open in a new tab from Documents; a calendar app, through the
`webcal:` link Add to calendar app hands out. Calendar has no link into another Clubhouse screen.

## Ownership

```text
Design:          the owner (Claude Design)
Implementation:  src/clubhouse/screens/calendar, on the existing server actions
Data:            calendar_events: golf_events, golf_event_attendance, golf_player_classes,
                 golf_coach_blocked_time, golf_event_documents, golf_calendar_feeds,
                 golf_team_settings (timezone)
```

## Current status

```text
Design:         approved
Implementation: in_progress (desktop and phone built; gates in PROGRESS.md)
Contract:       complete (CONTRACT.md: all 25 categories answered)
Bridge:         reserved (IDs recorded; nothing is sent until the Bridge is wired, D-68)
Data:           existing (no held plans)
Verification:   partial (VERIFY.md)
Docs:           current
```
