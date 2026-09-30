# P011 — Rounds: design handoff

## Package

```text
Source:   the owner's Claude Design bundle, in design/handoff/ (VERSIONS.md)
Version:  v2 (received 2026-09-29): Player - Rounds.html, Player - Rounds - Mobile.html, rounds-flow.jsx,
          rounds-course.jsx, rounds-track.jsx, rounds-review.jsx, rounds-flow.css, rounds-track.css,
          rounds-data.js
Date:     2026-09-29
Status:   approved (the owner's v2 boards are the spec, D-22; docs/clubhouse/phone/rounds.md maps each piece to
          its data and names every gap; the order and the engine seam are in docs/clubhouse/ROUNDS_PLAN.md)
```

## Design objective

Rounds is the player's third phone tab and the front door for every round the product counts: four surfaces over
one engine. The library says where the season stands and what is unfinished; the review reads one round back;
setup gets a round going in a few taps; the shot screen records every stroke fast enough to use on the course.
Where the board and the hardened engine disagree, the engine wins (phone/rounds.md, "Tracking: board to engine").

## Problems being solved

Rounds left half-finished on a phone with no way to find them; a season average nobody can trust because each
screen counted differently; a shot screen that asks for too much, or lets an impossible shot through; a coach who
cannot read a player's round without a spreadsheet.

## User goal

Player: know where the season stands, pick up the round in progress, record the next shot without a second
thought, and check a round afterwards. Coach: read a player's round, hole by hole and shot by shot.

## Visual hierarchy

- **Library** (`.ch-rd`, a container named `chrd`): the header (the season kicker, "Your rounds", New round when
  it is drawn), then the round card beside the season card, "N more unfinished rounds" when there are any, the
  search and grouping tools, and the book by month or by course. The card and the season stack below 860px, the
  book's meters hide below 1000px, and at 640px (the phone) the book drops Out · In · Tot to a date tile, the
  course and tee, and the to-par box, and a group's header drops its average and low.
- **Review** (`.ch-rv`, `chrv`): Back, the hero (kicker, course, tee facts, the score with its to par), the
  five figures, the scorecard as two captioned nines, then two columns (the picked hole's shots; the scoring
  distribution, the recap and the notes). One column below 900px; the figures wrap to three below 640px.
- **Setup** (`.ch-rsu`, `chrs`): the green band with its steps (Course, Scorecard, Track) and Back, then two columns
  (course card, open qualifier, Round details, the note; the scorecard) and the dock with the one thing stopping
  Start and Start round. One column below 860px.
- **Shot screen** (`.ch-rt`, `chrt`): the top bar (Exit, the course and tee, Scorecard), the hole strip, the hole
  hero (hole number, par, yards, shot number and the distance to the pin, the schematic map, the shot log), then
  the entry panel with the action bar (Undo, Penalty, Next shot) at its foot. A holed-out hole swaps the entry for
  the shot review.

## Components

### Reused Clubhouse primitives

`Button`, `Icon`, `Modal` (a bottom sheet on the phone), `EmptyState` (page and compact, D-71), `InlineNotice`,
`SearchField`, `Segmented`, `Checkbox`, `ScoreMark`, `Skeleton`, `SectionBoundary`, `PhoneTop`, `useChPhone`,
`usePhoneTabsHidden`, `useAction`, `useChReducedMotion`.

### New Clubhouse components

Library: `RoundsLibrary` (the container: the search, the grouping and the discard), the cards in
`parts.tsx` (`UnfinishedCard`, `SeasonCard`, `Ribbon`, `RoundRow`, `TeeSwatch`, `TypePill`), `RoundsSkeleton`, and
`LIVE_ROUNDS_WRITES` in `writes.ts` (the one place the discard action is named). Review: `RoundReview` (with
`ReviewNine` and `HoleCard`) and `ReviewLoadFailed`. Setup: `RoundSetup`, `CoursePicker`, `AddCourseSheet`,
`HoleConfig`, and `shape.ts` (the neutral contract `ChSetupPorts` and its pure rules). Shot screen:
`RoundTracking`, `ShotEntry`, `HoleReview`, the sheets (`PenaltySheet`, `EditShotSheet`, `UnsavedSheet`), the
round's own sheets (`ScorecardSheet`, `ExitSheet`, `RoundCompleteSheet`, `SubmitOverlay` in `round-sheets.tsx`),
`TrackStrip`, `HoleMap`, `ShotLog`, `Seg` and `Sec`, and `labels.ts`. Data: `rounds-shape.ts` and
`round-review-shape.ts` (pure steps shared by the loaders, the preview and the tests).

### Modified Clubhouse components

`nav.ts` gained role-scoped rebuilt patterns, so a coach's round review is rebuilt without their Rounds library
(`CH_REBUILT_PATTERNS`). The preview harnesses and fixtures are in `src/clubhouse/preview/` (`PreviewRounds`,
`PreviewSetup`, `PreviewTracking`, `fixtures-*`). Nothing else outside the foundation's v2 changes (motion,
haptics, page empty state).

## Actions affected

The live ones are in `config/clubhouse/pages/P011-rounds.json` `actions` (Discard, Try again); WIRING.md maps
those and lists the preview-only surfaces' controls, whose services are ports or the engine's hook.

## Contract categories affected

All 25 (CONTRACT.md).

## Motion intent

v2 (D-64), from the `--ch-dur-*` tokens and the v2 ease curves; nothing counts up. Rounds adds the
book row's hover lift (1px, ring turns green, quick; CH-11601, preview only), the shot log's chevron turn (base;
CH-11602), the scoring distribution's bar width (base), and the submit spinner, which stops with reduced
motion (CH-11603, and `prefers-reduced-motion` turns off the chevron, the choice buttons' fade and the spinner).
Presses are the shell's (`useChPress`); sheets and skeleton fades are the shell's.

## Haptic intent

v2 grammar (D-70): selection for opening a round, picking a hole, a course or tee, every choice in the shot entry
and going to another hole; light (press) for Continue, Submit and Start a round; medium once when a shot is
recorded (the button's own tap is replaced); warning before Discard, Undo, Delete shot and Leave without it;
success when a discard lands or a course is used; error on a failure, all from the shell's `useAction` where a
write is involved.

## Desktop

Each surface is a container query frame (`chrd`, `chrv`, `chrs`, `chrt`), so the layout follows the canvas, not
the window. The library and the review are drawn from the shell's page frame; setup and the shot screen are full
flows with their own bands and bars.

## Phone

Approved spec `docs/clubhouse/phone/rounds.md`, from `Player - Rounds - Mobile.html`. The library is the tab
root ("Rounds", no back link); the review's top bar is "Round" with "‹ Rounds" ("‹ Stats" for a coach). A new round
and the shot screen hide the tab bar (`usePhoneTabsHidden`), with the dock above the home indicator and the
distance box at 76px; sheets (penalty, change a shot, leave this shot, exit, scorecard, round complete, the picker,
Add a course) are bottom sheets that drag to close. Not yet: the iOS number pad's Done bar, and an iPhone pass.

## Accessibility

The book is one named link per round (or one named group when its review is not reachable), each month or course
a labelled region, and the ribbon one labelled image with a title on each bar. The review's card is two captioned
tables with a pressed button per hole, hit and miss marks read as Hit, Missed or Not applicable, and the hole card
is a polite live region. The figures are description lists (a term, its value, its sub-line). The strip and the map
say in words what they draw; the shot screen's choices are radio groups named for what they choose, its putt tags
are toggle buttons, its distance box is labelled by its section with `aria-invalid` and its message, and its
scorecard scrolls in a focusable, labelled region. Sheets are native dialogs that trap focus and close on Esc.
Radio groups have no arrow keys (each choice is a Tab stop).

## Data assumptions

Only data the app has. Not shown because no source exists (Q-72): course photos (no course has `image_url`, and the
handoff says there is no photography: the library, tee hero, review hero and setup card use a typographic band with
the tee swatch), "50+ stats tracked" (a plain list of what is tracked instead), a drawn hole map (no hole geometry
exists: a labelled schematic), the submit overlay's timed steps (it names the real shot count), the board's coach
notes and the recap's Focus and Keep (no source a player can see yet: the card shows the player's own posting
notes, Q-72f), a hole handicap in the shot hero (the round's holes do not carry it, Q-72g), the board's eight putt
tags (the engine's four), and per-hole length bars in the tee cards (one length bar instead, Q-72h). "Show
example" on the idle card is a board device and is left out; a round's start time is not shown (a round is set up
for a day).

## Existing backend capabilities used

Reads: `golf_rounds`, `golf_holes`, `golf_shots`, `golf_course_tees`, `golf_team_members`, `golf_players` (the
loaders); `listCourses`, `getRecentlyPlayedCourses`, `getTeamSavedCourses`, `getCourseDetail`, `getTeeWithHoles`
(`actions/course-library.ts`, supplied to setup as ports). Writes: `deleteInProgressRound` and the device's
`clearEmergencySave` (Discard); `updateShot` and `deleteShot` through `useShotTracking` (change, delete, undo);
the round's start, checkpoints, autosave and submit belong to the legacy engine and reach the shot screen as the
props its contract names. WIRING.md maps each.

## HELD requirements

### New features

None built as held.

### New data/schema

A coach's note on a round needs a column or a small table the owner approves (Q-72f); Focus and Keep need the
CoachHelm review published. None is written.

### Owner decisions

D-22 (phone), D-26 (season), D-31 (a closed qualifier is closed), D-42 (red means under par), D-53 (Stats rounds),
D-64 (motion), D-66 (navigation), D-67 (build order), D-70 (haptics), D-71 (page empty state); Q-72 is open, and
the page is built on its recommendations (a to h).

## Strokes gained on the review (2026-09-30)

A Strokes gained card under the five figures: the total large on the right, the four legs as bars either
side of zero (gain green, loss amber) on a scale the round sets, and what it is measured against ("vs Tour";
a women's team the women's Tour baseline). A nine-hole round says so. A round posted without shots has no
strokes gained and reads one line instead of a card of dashes (CH-11313). Not built: strokes gained by lie
and distance, or per hole (owner decisions pending).

## Explicit non-goals

A coach Rounds library (v2 has none), the offline recovery page (`/rounds/recover`, legacy until a board exists),
the CoachHelm filmstrip and AI review at `/rounds/[id]/review` (CoachHelm's), writing a coach's note, marking a
round as viewed, a course photo, and any schema change. The engine move (ROUNDS_PLAN step 4, #2104) is not part of
this page's build; wiring the round screens to it is.

## Fresh-build confirmation

```text
[x] No old Fairway presentation is required
[x] No old Fairway component is nested in the new screen (clubhouse:check refuses the imports)
[x] Shared reuse is non-UI/headless infrastructure only (the server actions, the loaders, useShotTracking, shot-entry-rules)
```
