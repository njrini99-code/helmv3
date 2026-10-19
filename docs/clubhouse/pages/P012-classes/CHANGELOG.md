# P012 — Classes: changelog

## 2026-10-18 — Pickers and controls: class times, saving

```text
Design package: none (complete-and-elevate plan, lane L2)
PR/commit:      uncommitted (agent/clubhouse-complete)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, L2 pickers and controls)

- The browser's own date and time inputs are gone. A class's Starts and Ends (a time already off the quarter hour still shows as chosen) shows the value as the app writes it ("Thu 15 Oct 2026", "3:30 PM") and opens a month (dates) or a list by the quarter hour (times): a popover under the field on desktop, a bottom sheet on the phone. On desktop the field stays typable ("10/15", "oct 15", "tomorrow", "fri"; "3p", "1530") and says "Try 10/15, oct 15 or tomorrow." when it can't read what was typed. Today carries a dot, the chosen day is the segmented control's lit chip, days outside the range are off, and arrows, PageUp and PageDown, Home and End and Enter work in the grid. The saved value is the same `yyyy-mm-dd` / `HH:mm` string as before.
- Add class, Save changes, Remove and Remove all stays lit while it works (Button's `busy`: aria-busy and no second press) instead of going unlit like a button that is unavailable.

## 2026-10-18 — Wave 8: Delete all classes on the column edge

```text
Design package: none (wave-7 premium details review)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, premium details)

- Desktop: "Delete all classes" ends on the column's edge
  (`.ch-btn--flush-end`); the phone's full-width row is unchanged.

## 2026-10-18 — Wave 7: only the meetings the player is on

```text
Design package: none (wave-7 player journey review)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    reads only (the player's own attendance rows)
Held items:     works before and after 20261017102000 (HELD.md)
```

### Fixed (2026-10-18, meeting privacy)

- Decision B, as the player's Calendar has it: the week's team events hold a
  meeting only when the player is on its invite list, so no class is said to
  meet over a teammate's 1:1 and its title is never on the page. When their
  own rows don't load, D2-8 decides from the counts; when that fails too,
  every meeting is left out (`classes.ownInvites`, `classes.meetingInvites`).

## 2026-10-18 — Wave 6: class form and import

```text
Design package: none (wave-6 coach workflow review)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, wave 6)

- Class form samples start "e.g." (course code, credits, name, instructor,
  building, room), so a refused save never sits under what looks like a
  value. Credits, Instructor, Building, Room and Notes carry the shared
  Optional tag (`.ch-field__opt`).
- Add a class opens on the course code on desktop; Edit and the phone keep
  the heading first.

### Added (2026-10-18, wave 6)

- Import review: Start over asks first (CH-12504) once the review holds three
  or more classes or one came off.
- Import result: a class that can't be on the calendar yet is a chip button
  that opens its form (`onEdit` from `ClassesView`).

### Verification (2026-10-18, wave 6)

- WebKit (Playwright, dev preview; 320, 390, 1280): Add a class focuses the
  course code at 1280 and the heading on the phone; five Optional tags; a
  three-class review asks "Start over?" before it lets go.

## 2026-10-18 — Wave 5: pending labels end in “…”

```text
Design package: none (wave-5 feedback review)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, pending labels)

- "Saving…" / "Adding…" in the class form, "Removing…"
  (CH-12501), "Deleting…" (CH-12503), "Importing…" and
  "Syncing…" while those run.

## 2026-10-18 — Wave 4: phone text follows Dynamic Type

```text
Design package: none (wave-4 Dynamic Type pass)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, Dynamic Type)

- Phone text in `classes.css` (term bar, Today, the class cards, overlaps,
  the class, form and import sheets) moves from fixed px to
  `calc(N * var(--ch-type-k))`, px line heights included. The import review's
  day tabs (a fixed 52 by 46 tile), its summary figures and the timetable
  header's event chip stay fixed.

### Verification (2026-10-18, Dynamic Type)

- WebKit (Playwright, dev preview, 390): every Classes preview state is
  pixel-identical to before at the default size. At XXL this sheet's change
  takes unscaled text from 80 to 7 on `classes` (the event chip, and shared
  buttons and the section title); no overflow or overlaps.

## 2026-10-18 — Wave 3: the head on the shared line, 44px phone actions

```text
Design package: none (wave-3 design review, items 5, 14)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, page-head line)

- On desktop the page head sits on the shared line: the main takes
  `--ch-page-gutter` (40px) at its sides and `--ch-page-head-top` (34px) above
  the head (tokens.css), and keeps its own max width, so at 1280 and below the
  title holds still between tabs. The term line is 2px shorter than the eyebrow,
  so the top adds 2px.
- Phone: Import schedule and Add class are 44px tall where they were 36px; the
  loading shape matches.

### Verification (2026-10-18, page-head line)

- `npm run test:file` on `classes.test.tsx`.
- WebKit (Playwright, dev preview): every full-head tab title (Home, Hub, Stats,
  Calendar, Settings, Qualifiers, Rounds, Classes, CoachHelm) at y 156 (156.9 on
  Rounds) at 1280 and 1440, and at x 284 at 1280; at 1440 a page narrower than
  the canvas still centres (Home x 320, Settings 340, CoachHelm 290). Loading
  states keep the loaded head line. At 1024 the same line holds where a page's
  narrow layout does not take over (Settings keeps its 16px); at 390 every main
  keeps its phone padding.
- `clubhouse:check`, `typecheck:fast` and eslint pass. `clubhouse:css` exits 1
  on five `shell.css` findings (lines 3743 to 3822) from earlier work, none in
  this change.

## 2026-10-18 — Wave 3: whole words in the week strip, one-line times

```text
Design package: none (wave-3 design review, items 10, 11)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, week chips and Today times)

- A team event's chip in the week strip wraps between words only, where it
  cut "Pinehurst" to "Pinehur / st". On the phone the chip's side inset is
  3px and its face a narrower cut (wdth 92) at the same 11px, so the word
  fits (`classes.css`).
- Today's time column is 112px (was 104px), so "10:10–11:25 AM" keeps one
  line where "10:10–" wrapped alone. A range across noon still wraps
  (`classes.css`).

### Verification (2026-10-18, week chips and Today times)

- WebKit at 390: "Pinehurst" 50.5px at 11px set in a 49px box before the
  narrower cut; the chip now reads "Pinehurst / qualifier". Today's time is
  108px wide at 600 14px tabular. The 1280 chip is unchanged (147px, one
  line). With the narrower title column "Intermediate Macroeconomics"
  (229.5px) wraps in the 226px column, as a longer title does.
- `npm run test:file` on `classes.test.tsx` and `classes-parity.test.ts`.

## 2026-10-18 — Polish: the desktop skeleton draws Your classes' head

```text
Design package: none (wave-2 states review row 21)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, loading)

- Desktop skeleton (CH-12401): Your classes' heading and the week's days
  once over the rows, on the loaded page's classes; the rows are the loaded
  rows' 94.4px on their seams (no gap), and the term overview's block is its
  loaded 146px (`ClassesSkeleton.tsx`, the skeleton rules in `classes.css`).
- A team event's name under its day is drawn only when it loads, so a week
  with one moves the rows down by its line (about 23px) when it lands.

### Verification (2026-10-18, loading)

- WebKit (Playwright, dev server, preview fixtures) at 1280, skeleton vs
  loaded: the heading 444 vs 444, the days' row 485 vs 485, the first row 515
  vs 538 (was about 456; the preview's week has a team event).
- `npm run test:file` on the page's tests, `clubhouse:check`,
  `typecheck:fast` and eslint.

## 2026-10-18 — Polish: no team opens Golf profile

```text
Design package: none (wave-2 states review; no new pattern)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, states review)

- No team (CH-12305): Open team settings goes to `?section=golf`, where a
  player joins a team (CH-8302). `?section=team` has no player section, so
  it fell back to Account.

### Verification (2026-10-18, states review)

- `npm run test:file` on classes.test, `clubhouse:check`, `typecheck:fast`
  and eslint pass.

## 2026-10-17 — Polish: aligned Today titles and overlap codes

```text
Design package: none (polish review rows; no new pattern)
PR/commit:      uncommitted (Clubhouse polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Today: the time column is a fixed width with tabular figures, so every
  row's title starts at the same x (it was `auto`, 82 to 96px)
  (`classes.css`).
- Overlaps: a class's department key holds a four-letter width and its time
  draws tabular figures, so the code beside it lines up row to row
  (`classes.css`).
- Tabular figures come back on 9 rules in `classes.css` whose `font` shorthand
  reset `.ch-num` (counts, times, scores and facts in rows); display
  numerals keep their proportional figures.

### Verification

- `npm run test:file` on the page's tests, `clubhouse:check`,
  `typecheck:fast` and eslint pass. `clubhouse:css` reports five findings,
  all in `shell.css`, which this change does not touch. The WebKit pass is
  the coordinator's.

## 2026-10-17 — Parity with production: large photos, coach-only meetings

```text
Design package: none (no visible change)
PR/commit:      uncommitted (Calendar and Classes production-parity audit)
Contract IDs:   120511 (CH-12111) wording, 120516 wording
Actions:        none
Data impact:    reads golf_event_attendance_counts (held migration 20261017102000) or, until then,
                golf_event_attendance, only when the week has a meeting
Held items:     supabase/migrations/20261017102000_golf_event_attendance_players_own_rows.sql (HELD.md)
```

### Fixed

- Import refused any photo over 12 MB on disk before it was downscaled. The
  current importer takes it (it downscales first, and the vision action's
  ceiling is on what is sent). `screenFile` now refuses only a PDF or TXT over
  12 MB; a photo is measured once it is ready to send, and only one still past
  the action's ceiling (a format the browser cannot downscale) is refused
  (CH-12111, same copy).
- The week's team events a class is checked against included a meeting that
  invites no one, which the player's Calendar never shows (D2-8): a class could
  be said to meet over a coach's parent call, by its title. The loader now
  leaves such meetings out, by the invite count (`golf_event_attendance_counts`,
  or the attendance rows until that function is deployed); a failed read
  leaves every event in and is logged (`meetingInvites`).

### Verification

- `src/clubhouse/__tests__/classes-parity.test.ts` (D2-8 with and without the
  function, and a failed read) and the updated reader and import cases in
  `classes.test.tsx`. No screenshots: nothing visible changed.

## 2026-10-15 — Ink that holds at night

Dark mode: the day picker, the add and review marks and the ready icon now take
`--ch-on-fill-*` / `--ch-forest-*` ink, which match the day's palette in light
and stay light at night (they went dark on dark). Light is unchanged. Shared
change: docs/clubhouse/CHANGELOG.md.

## 2026-10-12 — A section root on the phone (no "‹ More")

The phone shell's section strip replaced the tab bar and the More sheet
(docs/clubhouse/phone/section-strip.md). Classes's phone top bar no longer
draws a "‹ More" back link: its title is a start title (`PhoneTop start`),
which the shell turns into the section switcher. The page's action, where it
has one, is unchanged. Shared change: docs/clubhouse/CHANGELOG.md.

## 2026-10-11 — The timetable bar's depth is a token; it no longer glides

Presentation only. The meeting bar's small green glow is `--ch-elevation-mark`
(shared entry in `docs/clubhouse/CHANGELOG.md`). Its
width transition is removed (the CSS gate allows no new layout motion and the
bar carries a clash flag a scale would squash), so a
change of times now redraws the bar at its new length at once instead of gliding
there. The drawn bar is unchanged.

## 2026-10-10 — Readable timetable marks

Presentation only. A team event's chip in the timetable header wraps to two
lines instead of clipping to "Pine…"; a meeting's bar is an
8px green capsule (still as long as the meeting) instead of a 6px black mark,
and it glides when the times change.

## 2026-10-08 — Premium pass (backlog)

- **One timetable (A1):** "Your classes" takes one row of days (Mon to Fri; the
  weekend only when a class meets then). Each class's days are cells under it:
  an ink bar as long as the meeting, its start in the cell numeral; a day off is
  empty paper. Today is one soft light band down the list. Replaces the 25
  raised day keys (D7). The header and cells stay drawing (aria-hidden); each
  class still names when it meets (CH-12801).
- **Overlaps where they happen (A2):** a day a team event meets a class is a
  field-green band down the list, named in the header; the overlapped meeting
  carries an amber notch. The side list names each class by its department key
  (D1, no checkbox-like square).
- **A read that shows its work (B1):** no reading state for the first 150ms;
  once shown it holds 450ms; the rows found arrive one a beat, each tagged "Read
  clearly", "Check the time" or "Check the days", under "Reading N classes · M
  to check". Reduced motion and Animations off show them at once. One success
  haptic when the imported classes are on the calendar. The read is still one
  server answer: true streaming needs a streamed server action (not built).
- **Findings:** a one-credit class is tone only on the term bar (D4); the sync
  spinner stills under Animations off (D5); the empty state says "we’ll read it
  so you can check each class" (D6); "This week" no longer collides with "Today"
  (D9); the eyebrow is not tracked.
- Not here: 44pt phone buttons (D2) and the red failure titles (D3) are the
  shared Button and notice (shell builder).

## 2026-10-08 — States and native feel

The states audit's Classes findings and the owner's native-feel pass, verified
in WebKit at 390x844 with touch.

- **Loading:** on the phone the skeleton holds the loaded geometry, measured at
  390: the head and its actions, the term's card, Today and its rows, the week's
  overlaps and what your coach sees (the rail comes first on the phone), then
  the classes, so nothing moves when the page lands. On the desktop the deck's
  placeholders are the Ledger's ruled rows, without the radius they kept from
  the card era.
- **Press:** the overlaps line on the term's card deepens its wash when pressed.
- **A failed read keeps the head (owner decision):** when the classes do not
  load (CH-12201) the head keeps Import schedule and Add class, desktop and
  phone; before, it offered neither. Delete all classes still waits for the
  classes (CH-12503). The add sheet cannot check a new class against classes
  that did not load, and claims no overlap either way. Contract 120407 and the
  catalog row say so.
- **Copy:** every string the page writes takes the curly apostrophe, as the
  shell's offline line now does: the no-team page (CH-12305, "You aren’t on a
  team yet"), the import's offline state (CH-12901, "You’re offline"), "Couldn’t
  update", "Your classes didn’t load", "This can’t be undone", the import's
  states and results and the write wrappers' refusals. The catalog's quotes
  match (CH-12002 and CH-12005 quote the shell's "you’re offline"), and the
  copy-apostrophes guard covers Classes. The reader's own sentence (CH-12113,
  CH-12114) is shown as the server sent it.

## 2026-10-08 — Phone: Mobile clubhouse pass

The owner's phone review ("phone too cardy, too vibe coded"; the Coach Home
"Mobile clubhouse pass" board, round 3: "fewer containers, one feature card"),
carried to Classes. Phone only: each new rule sits inside
`@media (max-width: 820px)`.

- **Head:** the top bar stays the page's one heading (the iPhone brief); the
  term and its dates are the tracked brown eyebrow under the engraved double
  rule, over Import schedule and Add class.
- **One feature card:** the term card ("Week 8 of 17 · 13 credits · 5 classes"
  and the overlaps row) is the page's green feature card.
- **No stacked cards:** Today, this week's overlaps and "Your classes" are
  sections under the double rule, their entries rows between soft seams. A class
  was a tinted card; it is a row that keeps only its department key in its tone,
  the name over the instructor, its week of day keys (the days it meets raised,
  today ringed green), and the room and flags. Add a class is the last row; what
  the coach sees is a line under a soft rule. The deck is wrapped in the shared
  Section on the phone too, so "Your classes" heads it.
- **No team:** the page had a 400-weight "Classes" title at the desktop's edge
  under the bar's own "Classes"; on the phone the calm empty page sits under the
  bar, at the phone's edge, and the title only names the page for a screen
  reader.
- **Loading:** `ClassesSkeleton` draws a phone shape beside the desktop one; the
  stylesheet shows the one for the width.

Kept as material: the tone keys, the day keys, the flags, the buttons, the
notices and every sheet. No motion, copy, behaviour or catalog code changed.

## 2026-10-07 — A class row answers the press

On the desktop Ledger a class now deepens to the row press tint over the press
beat, never a lift or a scale (CH-12601). The contract no longer calls CH-12602
reserved.

## 2026-10-07 — Classes takes the page head; each class a ledger row

On desktop, Classes opens on the framed page head, and the term, the classes
and the week's overlaps sit on the canvas:

- **Head:** the term and its dates are the eyebrow over "Classes", with Import
  schedule and Add class on the right. The calendar sync shows as a hairline
  chip when it has something to say.
- **Term:** the green banner becomes three figures between soft column rules
  (the week, the credits bar with a small tone key per class, and this week's
  overlaps in amber), then the term line in a shallow well, closed by a soft
  rule.
- **Classes:** a "Your classes" section. Each class is a row that keeps only
  its department key in the class's tone, then the name over the instructor and
  room, then its meeting days as keys. The days line up down the list, so the
  rows read as the week. Add a class is the last row, and Delete all classes
  stays under the list. Hovering a class tints its row, as Home's leaderboard
  does, with no lift (CH-12601).
- **Side column:** this week's overlaps and what the coach sees sit past a soft
  column rule beside the classes again. Delete all classes had taken the second
  column and pushed them under the deck.
- **Kept:** the tone keys, the day keys, the term line's well and the flags.

The route skeleton (`ClassesSkeleton`) opts into the same head at the loaded
head's height. Its head measured 0px of shift in WebKit at 1440 and 1100, and
its deck placeholders are rows. Below a 1000px page the side column goes under
the classes. The phone is unchanged: every new rule sits inside the desktop
media query, and the phone renders the same elements (the skeleton and the
no-team page only gain the canopy attributes, which style nothing there).

## 2026-10-07 — Timeline labels

The banner timeline's start and end labels move from 11px at 4.0:1 to 12px in
the muted on-green ink.

## 2026-10-07 — Solid semester banner, serif title

The semester banner is solid field green with no large gradient (which banded)
and no deep cast shadow; its type takes the warm ivory used on green. The
Classes title is set in the display serif.

## 2026-10-06 — Smooth scroll and materials

Jumping to a class eases through the shared smooth scroll helper and stays
instant with reduced motion.

<!-- clubhouse:release-audit:start -->
## 2026-10-06 — Whole-app release audit

Reconciled page purpose, design acceptance, contract status, wiring and
verification against the current flagged implementation. Indexed 6 mapped
actions and 6 overlay/control call sites in the [all-page
audit](../../ALL_PAGE_AUDIT.md#p012-classes). Approved handoffs and contract
IDs are preserved; runtime gaps stay explicit.
<!-- clubhouse:release-audit:end -->

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification
log and decisions).

## 2026-10-06 — PDF import errors keep their cause

```text
PR/commit:      #2146 (agent/deps-lint-tooling)
Design package: none
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

The two PDF-import errors in `import-read.ts` now attach the underlying error as
`cause` (ESLint 10 `preserve-caught-error`), so Sentry shows why the PDF reader
failed. The messages people see are unchanged.

## 2026-10-02 — Floating class cards

The owner’s material correction removes the decorative left accent from class
cards and uses shared soft elevation instead of local outline/shadow overrides.
Class content and actions are unchanged. The stylesheet parses; WebKit desktop
layout was inspected without horizontal overflow. Physical Safari is unverified.

## 2026-10-01 — Phone: today first, one heading, the term in a line (iPhone brief)

From the owner's "GolfHelm iPhone Layout and Native Experience Repair" brief,
§10.

```text
PR/commit:      agent/swap-audit (#2111)
Design package: none (owner brief; docs/clubhouse/phone/classes.md updated)
Contract IDs:   CH-12308 (new)
Actions:        none
Data impact:    none
Held items:     none
```

- **One "Classes".** The phone top bar is the page's only heading; `main` is
  labelled "Classes" directly.
- **Today first.** `TodayClasses` lists what meets today by start time: time,
  name, and room · code, each opening its class. With nothing today it names
  the next class day (CH-12308).
- **The term, compact.** One line on the green card, plus an overlaps row that
  scrolls to the overlap cards (only when there are overlaps). The credit bar
  and the term line, whose Today marker collided with the warning, stay on
  desktop.
- **Overlaps before the deck** on the phone; the course code on a card is
  metadata, and the name leads.
- Not verified on a real iPhone.

## 2026-09-30 — Delete all classes (Q-75a)

```text
PR/commit:      agent/clubhouse
Contract IDs:   catalog CH-12005, CH-12006, CH-12503 and CH-12704 (Bridge IDs are minted by the registry sync)
Data impact:    none (the same table and server action as Remove; no migration)
```

### Delete all classes (Q-75a)

- **Issue.** The current Fairway Classes page has "Delete all classes" and the
  Clubhouse page did not, so clearing a semester's schedule was one removal at a
  time. The owner approved building it on 2026-09-30.
- **Fix.** A quiet red "Delete all classes" button under the deck (a full-width,
  44px row on the phone) with the warning haptic first, behind a question that
  says how many classes go, that their calendar events go with them, and how
  many are from another term (CH-12503). It is one write, `writes.removeAll`, in
  the current page's order: the calendar first for every class, then one delete
  of the rows that came off it, scoped to the player; a class whose calendar
  removal failed keeps its row. A failure says which part: nothing was deleted
  (CH-12005), or it stopped half-way, with the classes that are gone dropped
  from the list, the ones kept and the ones off the calendar but still saved
  named, and the latter flagged "Not on your calendar" (CH-12006). A row is
  reported deleted only when the delete returned it or a read-back shows it
  gone, so a failed delete or a row a policy hid is never called deleted. Retry
  repeats the same classes and finishes the job (a class already gone counts as
  removed). The button is off while a save, an import, a remove, a calendar sync
  or a delete-all is running, and is not drawn with no classes or when they
  didn't load. The question stays open after a failure, counts what is left, and
  cannot be closed while its delete runs.
- **Checked.** `classes.test.tsx` 125/125 with 16 new cases (the control, the
  question and its counts, the silent confirm, the two failure toasts and their
  Retry, the off states, and the live writes: order, scope, read-back, a thrown
  call); each behaviour mutation-checked (15 mutations, each caught; see
  VERIFY.md); axe clean at 1280 and 390 on the question, the half-way toast and
  the nothing-deleted toast, and the phone button measured 358 x 44. Not seen on
  an iPhone.

## 2026-09-30 — Classes for players, the review fixes and the page docs

```text
Design package: design/handoff/ v2 (Player - Classes.html, Player - Classes - Mobile.html)
PR/commit:      agent/clubhouse (the page: c1925eba2; these page docs are uncommitted at the time of writing)
Contract IDs:   120101 to 122401 (29 hand contracts, all reserved until their tests carry the Bridge IDs), plus the
                46 catalog IDs 120201 to 121805 (CH-12001 to CH-12902)
Actions:        6 (ACT-P012-*)
Data impact:    none (the same table and server actions as the current page; no migration)
Held items:     none (Delete all and the board's grade, deadline and Share with coach wait on Q-75)
```

### Added

- Classes for players, desktop and phone: the term overview, a card for every
  class, this week's overlaps with the team's events, and the sheets to add,
  edit, import (a screenshot, PDF, TXT file or pasted text, reviewed before
  anything is saved) and remove a class. Coaches keep the current page at the
  same address (`LegacyClassesPage.tsx`, unchanged).
- The six page docs, the manifest's actions (`status.docs` current,
  `status.contract` complete) and the hand contracts: the core view, a class's
  card and sheet, first run only on an answered read, the import's duplicate
  check, term-scoped checks, a hidden update and an empty sync as failures,
  offline, the page's role, the server actions as the gate (reserved: read, not
  run), success and the import result, forms kept, Retry, Try again, the
  calendar (not waited on, from the class's own term, no-time classes taken off
  it, flags held for the visit), axe, phone layout, keyboard, the loader,
  observability and tests.

### Fixed (each with a test that fails without the fix; mutation-checked, as reported in PROGRESS.md)

- **An import sent next Monday as every class's start.** A class in next term,
  or one imported before its term began, failed to sync ("Could not determine
  semester dates"), and its Retry repeated the same start. Each class's start
  now comes from its own term (`syncStartFor`); a class with no start gets the
  term's whole window; every Retry replays the stored start.
- **The sheet stayed locked while the calendar sync ran.** A save is done when
  the row is stored: the sheet is free, "Class added" shows, and the sync is its
  own action that the save starts without waiting for.
- **The import said the classes were on the calendar when some had no days.**
  The result now counts only those that can be, names the rest and why ("PHIL
  150 (no meeting days)"), and says "Adding them to your calendar…" while it
  runs.
- **A class with days but no time got a phantom 08:00 to 09:00 block.** The
  server fills in that time, so such a class is now taken off the calendar
  instead of synced, and its card, sheet and the import result say "no time
  set".
- **Importing a schedule again duplicated the classes that had no term.** The
  duplicate check now reads a class with no term as the current term's, the way
  the page and the calendar sync do.
- **The duplicate and overlap checks compared other terms.** They now count only
  the classes of the term in question, and this week's team overlaps only the
  current term's.
- **CH-12002's row promised a toast the busy case never shows.** A class saved
  while another sync is still running is flagged with no toast, and the row now
  says so.
- **A Retry after a lost answer could insert a second row.** A new class's row
  id is made when the sheet opens and travels with every attempt; a
  duplicate-key answer on it means the row is already stored, so the save
  updates it.
- Also fixed: a class in next term lists its next meetings from its term's first
  day; a weekend day an import saved can be taken off in the form; a coach's
  loading skeleton is Fairway's, because a coach gets the Fairway page.

### Owner questions

- **Q-75** (open; the reversible choices are built): Delete all (recommended:
  build it behind the same confirm and calendar-first order), Add class as a
  sheet rather than the board's inline card, coach-visibility copy that follows
  the read policy, and the grade, next deadline and Share with coach that have
  no column.

### Why

- The contract pass (D-62, D-69): every category answered, every behaviour
  named, and every bug class the earlier pages' passes found looked for here;
  and the review of the first build, whose fixes are above.

### Verification (2026-09-30)

- See VERIFY.md.
