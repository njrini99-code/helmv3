# P012 — Classes

A player's class schedule by term, put on the team calendar so a coach can plan practice and travel
around class: the term at a glance, every class as a card, this week's overlaps with the team's events,
and the sheets to add, edit, import and remove a class.

## Identity

```text
Page ID:            P012
Page Name:          Classes
Route:              /golf/dashboard/classes (player only; a coach keeps the Fairway page at this address)
Bridge Namespace:   12 (Bridge IDs 12ccii, D-68; catalog codes CH-12xxx)
Roles:              player
Implementation Root: src/clubhouse/screens/classes
Manifest:           config/clubhouse/pages/P012-classes.json
```

## Purpose

### Primary user

A college golfer who has to tell the team when they are in class. Coaches are not users of this page: they
see a player's classes on the calendar, and Clubhouse has no coach Classes page.

### Job to be done

Get the whole term's schedule onto the team calendar without typing every class, and see at a glance
whether any class meets over practice or travel this week.

### Primary action

First run: Import schedule (a screenshot, a PDF, a TXT file or pasted text, reviewed before anything is
saved). After that: Add class.

### Secondary actions

Open a class (when, where, its next meetings), Edit and Remove it, Import schedule again, Retry sync when a
class did not reach the calendar, and Try again on a failed read.

### Information hierarchy

1. The term overview: the term and its week, the credits by class, how far through the term today is, and how
   many overlaps with the team there are this week.
2. The deck: every class as a card in the order the week unfolds, flagged when it overlaps the team, is not on
   the calendar, or has no meeting days or time.
3. The side column: this week's team events that meet a class, and what the coach can see.

### User should notice first

Whether anything overlaps practice or travel this week, and whether any class is not on the calendar.

### User should never have to think about

Whether a save reached the calendar (the page says so and flags the class when it did not), whether a Retry
adds a class twice (it never does), or whether a class in another term counts against this term's overlaps
(it does not).

### Success looks like

A player screenshots their schedule, checks the rows, taps Import, and the classes are on the calendar for
the rest of the term before they have closed the sheet.

## Semantic features

Canonical IDs from `memory/registry.yml`:

```text
- calendar_events (memory/features/calendar-events.md; observability key academics_classes)
```

## Design authority

```text
Package:          design/handoff/ (v2; VERSIONS.md)
Desktop reference: design/handoff/Player - Classes.html, classes.jsx, classes.css, gh-states.jsx
Phone spec:       docs/clubhouse/phone/classes.md (approved), from design/handoff/Player - Classes - Mobile.html
Status:           approved
```

## Related pages

### Enters from

The sidebar (School, for a player) and the More sheet on the phone (D-66).

### Exits to

Settings, only from the no-team page ("Open team settings", `?section=team`). Classes has no other link: a class
opens its own sheet, and the calendar shows the class events the sync writes.

## Ownership

```text
Design:          the owner (Claude Design)
Implementation:  src/clubhouse/screens/classes, on the table and the server actions the current Classes page
                 uses (one write path per behaviour): golf_player_classes through the RLS-scoped client, then
                 syncClassToCalendar and removeClassFromCalendar
Data:            calendar_events: golf_player_classes (the player's own rows), golf_events (the team's events,
                 and the class events the sync writes, tagged [class:<id>]), golf_team_settings (timezone)
Legacy:          src/app/golf/(dashboard)/dashboard/classes/LegacyClassesPage.tsx is the current page, moved
                 unchanged, for coaches and everyone outside the Clubhouse
```

## Current status

```text
Design:         approved
Implementation: in_progress (desktop and phone built for players; gates in PROGRESS.md)
Contract:       complete (CONTRACT.md: all 25 categories answered; the 29 hand contracts are reserved until
                their tests carry the Bridge IDs, VERIFY.md)
Bridge:         reserved (IDs recorded; nothing is sent until the Bridge is wired, D-68)
Data:           existing (no held plan; Delete all, and the board's grade, next deadline and Share with coach,
                need an owner decision, Q-75)
Verification:   partial (VERIFY.md: axe clean at 1280 and 390, seen by eye; no iPhone pass, no real-account pass,
                no build)
Docs:           current
```
