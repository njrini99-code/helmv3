# P012 — Classes: design handoff

<!-- clubhouse:release-audit:start -->
## Current implementation audit — 2026-10-06

Check narrow day/time controls, long class names, import warnings, partial
imports and calendar-sync refusal.

The approved boards and phone specification remain the design authority.
[all-page audit](../../ALL_PAGE_AUDIT.md#p012-classes) records current
implementation owners; source token durations do not certify smoothness,
visual fidelity or device behavior.
<!-- clubhouse:release-audit:end -->

## Package

```text
Source:   the owner's Claude Design bundle, in design/handoff/ (VERSIONS.md: Classes, player, new in v2)
Version:  v2: Player - Classes.html, Player - Classes - Mobile.html, classes.jsx, classes.css, gh-states.jsx
Date:     2026-09-29 (built 2026-09-30)
Status:   approved (the owner's v2 boards are the spec, D-22; docs/clubhouse/phone/classes.md maps each piece
          to its data and names every gap)
```

## Design objective

One calm page for a player's term: the term at a glance, every class as a row of
a timetable (the Ledger, with no cards, on desktop and on the phone),
and the week's overlaps with the team's events, so a coach can plan around class
and a player can see it. The schedule is quick to enter (a screenshot is read
and reviewed row by row) and honest about what reached the team calendar.

## Problems being solved

Coaches planning practice and travel without knowing when players are in class,
and players retyping a schedule that already exists as a screenshot or a portal
table.

## User goal

Get the term's classes onto the team calendar with as little typing as possible,
and see whether any of them meets over practice or travel this week.

## Visual hierarchy

Header (the framed page head on desktop: the term and its dates, the title, the
sync status, Import schedule and Add class), the term overview (on desktop three
figures between column rules, not a green band), then "Your classes": a ruled
list under one timetable header (P012-A1, owner 2026-10-08): the days once, each
class's days as cells under them (an ink bar as long as the meeting with its start
in the cell numeral, empty paper on a day off), today one soft light band down the
list, a team day a field-green band named in the header, an overlapped meeting an
amber notch (A2); on the phone the same cells under each name, the header sticky,
beside a side column (this week's overlaps, and what the coach sees).
Below a 1000px container the side column goes under the deck; below 640px the
deck is one column, the overview stacks (the week tile beside the credits and
the bar, the overlap count on its own row) and the two header buttons share the
row. On the phone the shell's top bar holds "Classes" with "‹ More" and the page
keeps its own header.

## Components

### Reused Clubhouse primitives

`Button`, `Icon`, `EmptyState` (page and compact, D-71), `InlineNotice`, `Modal`
(a bottom sheet on the phone), `Select`, `Segmented`, `Skeleton`,
`SectionBoundary`, `PhoneTop`, `useBackFromMore`, `useChPhone`, `useAction`.

### New Clubhouse components

`ClassesView` (the container: the classes, the calendar flags, the writes and
every sheet), the pieces in `parts.tsx` (`TermBar`, `ClassCard`, `AddTile`,
`OverlapsCard`, `CoachNote`, `SyncStatus`), `ClassForm`, `ClassDetail`,
`ImportSchedule` (with `ImportedView`), `import-read.ts` (the reader:
`screenFile`, `classifyReadError`, `readScheduleLive`), `ClassesSkeleton`,
`ClassesNoTeam`, `Classes` (the live wrapper), and `ChClassesWrites` with
`createLiveClassesWrites` in `writes.ts` (the one place the table and the server
actions are named; the preview and the tests pass their own set).

### Modified Clubhouse components

None for this page beyond the foundation's v2 changes (motion, haptics, page
empty state).

## Actions affected

All of them: the list is `config/clubhouse/pages/P012-classes.json` `actions`,
and the graph is WIRING.md.

## Contract categories affected

All 25 (CONTRACT.md).

## Motion intent

Two of its own, on the v2 tokens (D-64): a hovering class takes the Ledger row
tint at the quick duration, with no lift (CH-12601), and a scan line sweeps down
the page while a schedule is read (CH-12602; it stops when Animations is off).
Every press, sheet, toast and skeleton fade, and the first-paint rise, is the
shell's; nothing counts up.

## Haptic intent

v2 grammar (D-70): a tick for opening a class, choosing a day and switching
between a file and pasted text; a warning before the remove question and on
Discard; success when a change lands and error when one fails (the shell's
action layer) and when a file cannot be read; every other tap is silent.

## Desktop

The frame is `.ch-cl` (a container named `chcl`, at most 1240px), so the layout
follows the canvas, not the window: the deck (cards of at least 260px) beside a
320px side column, and the side column under the deck below 1000px.

## Phone

Approved spec `docs/clubhouse/phone/classes.md`: Classes opens from More (D-66);
the class's sheet, the form, the import and both questions are bottom sheets
that drag to close; the tab bar stays with More on.

**The Mobile clubhouse pass (owner, 2026-10-08: "phone too cardy, too vibe
coded"; the Coach Home board's round 3, "fewer containers, one feature card").**
The top bar stays the page's one heading (the iPhone brief). The term and its
dates are the tracked brown eyebrow under the engraved double rule, over Import
schedule and Add class. The term card is the page's one green feature card. Today,
this week's overlaps and "Your classes" are sections flush on the parchment under
the double rule, their entries rows between soft seams that deepen to the row
press tint: a class keeps only its department key in its tone, the name over the
instructor, its timetable cells under the one sticky header (A1/A2) and the room
and flags; Add a class is the last row. What the coach sees is a line
under a soft rule. A player on no team sees the calm empty page under the top bar
with no second "Classes" title. The route skeleton draws the same shapes at the
phone's width. Kept as material: the tone keys, the timetable cells, the flags, the
buttons, the notices and every sheet.

## Accessibility

The page is a `main` labelled by "Classes"; each class is one button named for
its code, name and when it meets; the card's week strip and the overview's
drawing are hidden from screen readers and their labels say the same in words;
the term overview is one labelled region; a refused save marks each field
(`aria-invalid`, a `role="alert"` message) and moves focus to the first; the
import's drop zone is a real button; "Reading your schedule…" and "Adding to
your calendar…" are `role="status"`; sheets are native dialogs that trap focus
and close on Esc.

## Data assumptions

Only data the app has. Not drawn because `golf_player_classes` has no column or
source (Q-75): the board's grade, next deadline and "Share with coach" switch,
and a "synced 2 minutes ago" line (nothing records a sync). The board's "busy
time only" is not said, because the read policy lets an active coach read the
whole class row: the note says what is true. A class's stored `color` is a free
hex, so it is never drawn; the tone follows the order the classes were added.
"Today", the week and every event time are resolved on the server in the team's
zone.

## Existing backend capabilities used

`golf_player_classes` through the RLS-scoped client (read, insert, update,
delete), `syncClassToCalendar` and `removeClassFromCalendar` (calendar-sync.ts),
`extractClassesFromScheduleImage` (schedule-image.ts) and `parseScheduleText`
(the current importer's parser, for pasted text, TXT and PDF text; PDFs are read
in the browser with PDF.js from the current importer's pinned CDN copy).
WIRING.md maps each.

## HELD requirements

### New features

None built as held. Delete all classes is built (the Fairway page has it and the
board does not draw it; the owner approved it on 2026-09-30, Q-75a): a quiet red
button under the deck, behind a question that says how many classes go and that
their calendar events go with them, in the current page's order (the calendar
first, then the rows, so a class whose events are still on the calendar keeps
its row). It is one write, and its failures are told apart: nothing deleted
(CH-12005), or half-way with what is gone, kept and off the calendar but still
saved named (CH-12006).

### New data/schema

The board's grade, next deadline and Share with coach need new columns on
`golf_player_classes`; a sync status would need a column too. None is written.

### Owner decisions

D-22 (phone), D-64 (motion), D-66 (navigation), D-67 (build order), D-70
(haptics), D-71 (page empty state). Q-75 is answered in part: (a) Delete all
classes was approved by the owner on 2026-09-30 and is built, behind the same
confirm and calendar-first order. The rest is built on its reversible choices:
(b) Add class is a sheet (a bottom sheet on the phone) rather than the board's
inline card; (c) the coach-visibility copy follows the read policy, not "busy
time only"; (d) the grade, deadline and Share switch are not drawn.

## Explicit non-goals

The board's grade, next deadline and Share with coach; a sync status line; the
board's timed "Image received, Finding classes, Matching times" steps
(animation, not progress); the review row's Edit pencil (each class is edited
from its card once imported); a coach's Classes page.

## Fresh-build confirmation

```text
[x] No old Fairway presentation is required
[x] No old Fairway component is nested in the new screen (clubhouse:check refuses the imports)
[x] Shared reuse is non-UI/headless infrastructure only (the server actions, the schedule parser and the loaders)
```
