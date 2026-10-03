# P006 — Calendar: changelog

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification log and decisions).

## 2026-10-01 — Aesthetic audit: events that share a column wrap their title

```text
PR/commit:      agent/swap-audit (#2111): 2b0486765
Design package: none (owner's aesthetic audit guide, 2026-10-01)
Contract IDs:   none new
Actions:        none
Data impact:    none; visual only
Held items:     none
```

- **Issue.** In the week view a three-way overlap leaves 29px of text, and the
  one-line title showed "Sh..." and "Te..." (15 labels under half visible at
  1440). The audience coins' initials ran under the next coin (26px coins, 8px
  overlap).
- **Fix.** `views.tsx` marks a block that shares its column (`ch-ev--lane`) and
  gives it the start time only; `calendar.css`: that block has 5px padding and
  wraps its title to three lines, a short one keeps its row and drops the time
  (the range stays in the button's name and the side panel); the audience stack
  overlaps 5px. Under half visible: 15 to 4.
- **Not done, on purpose.** An overlap of four or more events is still narrow; a
  cascade layout is a redesign.
- **Contrast pass (`d4367ee`).** The unselected labels of the view switcher were
  4.1:1 on the well (shared `.ch-seg__b`, secondary ink now); the time on a
  class or busy block faded to 3.6:1 and 4.0:1 and keeps its own color (5.2:1,
  6.0:1). Past rows stay faded (0.55, 2.3:1 to 3.6:1): Q-152.
- **Verification.** Before and after at 375, 390, 430 and 1440, coach and
  player. `calendar.test.tsx` 83 of 83.

## 2026-10-01 — Page pass: the week stays on screen while the next one loads

PAGE_PERFORMANCE.md rules 4, 8 and 11. The audit found every failed read
already has its notice; empty copy only draws on loaded data.

```text
PR/commit:      agent/swap-audit (#2111)
Design package: none
Contract IDs:   none new (CH-6010, CH-6401 unchanged)
Actions:        respondToEvent (unchanged)
Data impact:    none
Held items:     none
```

- **No blank phone page while busy.** The phone skeleton's rule hid every
  child of a busy `.ch-cal`. The live page is busy during a step outside the
  loaded window, or a Try again, so a phone went blank until the payload
  landed. The rules now target `.ch-cal--skel` only; the live page dims.
- **Quick steps.** A second Next or Previous tap before the new window lands
  steps on from where the first was headed, so the last choice wins. The
  title keeps labelling the week on screen until then.
- **Honest reply.** A player's RSVP that never reached the server (the send
  threw) goes back to the last confirmed reply. Before, it stayed showing as
  sent.
- **Left as is:** the player filter lives in component state and is lost on
  Back (view and date are in the URL).

## 2026-10-01 — A repeating event keeps its time across a clock change (CAL-05)

```text
PR/commit:      agent/swap-audit (#2111)
Design package: none
Contract IDs:   none new
Actions:        calendar create and series edit (unchanged calls; the editor now also sends the IANA zone)
Data impact:    none to existing rows; new series rows store each occurrence's own offset
Held items:     none
```

- **Issue.** A series took one UTC offset at save time, so every occurrence
  after the 1 Nov change landed an hour off (3 PM became 2 PM).
- **Fix.** With the series' zone, each occurrence (and each one a rule change
  appends) takes that zone's offset on its own date. Without one, the single
  offset applies as before. Existing series are not rewritten.
- **Checked.** `recurring-events.test.ts` CAL-05 (Chicago, 22 Oct to 5 Nov);
  calendar suites 158 tests.

## 2026-10-01 — Only invited players are notified about a new event (Q-108)

```text
PR/commit:      agent/swap-audit (#2111)
Design package: none (the editor already says "Attendees will be notified")
Contract IDs:   none new
Actions:        calendar create (unchanged call)
Data impact:    none; createGolfEvent's after() fan-out (bell, email, push) reads only the invited, active players
Held items:     none
```

- **Issue.** Creating an event told every active player on the team, invited
  or not, while the editor promised only attendees would hear.
- **Fix.** The fan-out reaches only the invited players still on the active
  roster; an event with no invitees notifies nobody (owner, 2026-10-01).
- **Checked.** `golf-events.test.ts` 24/24, including the no-invitee and
  one-invitee cases.

## 2026-10-01 — A calendar link can be replaced or removed (swap audit §14 D3)

```text
PR/commit:      agent/swap-audit (#2111): 40419c193, 279d7ed6f
Design package: none (sheet rows in the existing Add to calendar app grammar)
Contract IDs:   CH-6013, CH-6014, CH-6504, CH-6505
Actions:        calendar.regenerateFeed, calendar.removeFeed
Data impact:    reuses regenerateCalendarFeed and deleteCalendarFeed; no schema change
Held items:     none
```

- **Issue.** The feed URL is a bearer link, and Clubhouse could only read and
  create one: a leaked link could not be rotated or revoked.
- **Fix.** New link and Remove under each link, each asking first and saying
  the current link stops working. A failed replacement re-reads the links and
  offers no Retry (the server deletes the old link first).
- **Checked.** `calendar-feed-manage.test.tsx`; calendar suites green.

## 2026-09-30 — Duplicate, Print and the jump panel's Close (Clickables gaps 9, 15, 21); Compare schedules on a class (Clickables gap 17)

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

### Duplicate, Print and the jump panel's Close (Clickables gaps 9, 15, 21)

- **Issue.** The board draws Duplicate, Print and a Close on the jump panel; none existed.
- **Fix.** Event actions › Duplicate (coach) opens New event seeded from the event and publishes a new one; More › Print week (day, month or agenda by view) prints the view with the shell dropped; the jump panel has its own Close.
- **Checked.** calendar 74/74, 5 of 5 mutations caught.

### Compare schedules on a class (Clickables gap 17)

- **Issue.** A coach looking at a player's class had no way to set it against the team's schedule.
- **Fix.** A class's detail ends with Compare schedules: New event on the class's day with only its player invited, so Find a time compares the two.
- **Checked.** calendar 75/75, the mutation caught.

## 2026-09-30 — The editor keeps what was typed through a page re-read

```text
PR/commit:      agent/clubhouse
Contract IDs:   none new (60103's editor)
Data impact:    none
```

### Fixed (with a test that fails without the fix)

- **A re-read wiped the editor.** The editor seeded its fields whenever the team list changed identity, and
  every page re-read brings it in a new array. A refresh that landed while the editor was open (one still in
  flight from deleting busy time, or a Retry elsewhere) cleared the title and reset the type. It now seeds
  once per opening.

## 2026-09-30 — The first-run page (D-71, CH-6309)

```text
Design package: design/handoff/ v2 (gh-states EMPTY.calendar)
PR/commit:      agent/clubhouse (1f51b49c1; renumbered from CH-6308, which the phone Day view already owned)
Contract IDs:   60409 (CH-6309)
Actions:        none new (Create event opens the existing editor)
Data impact:    one read added: a coach's head count of the team's events, in the same round as the window's events
Held items:     none
```

### Added

- `CalendarFirstRun`: a coach whose team has never scheduled anything gets the v2 page empty state and
  Create event instead of an empty month. Once anything exists, an empty range keeps CH-6301. A player
  never gets it, and neither does a count that failed or an events read that failed.

### Fixed

- The first-run row reused CH-6308, the phone Day view's empty day; `clubhouse:check` reported the code
  catalogued twice. It is CH-6309 now, with its own Bridge ID.

## 2026-09-30 — V2 page docs and contracts, proven by tests; Retry finishes the job; a player's data trimmed

```text
Design package: design/handoff/ v2 (Coach - Calendar.html, Coach - Calendar - Mobile.html)
PR/commit:      agent/clubhouse (this change)
Contract IDs:   60101 to 62401 (85 on this page: 55 from the catalog, 30 new behaviour contracts without a code; 29 implemented,
                60806 reserved)
Actions:        21 (ACT-P006-*)
Data impact:    none
Held items:     none
```

### Changed

- The six page docs, the manifest's 21 actions, and the 30 behaviour contracts (the address, the seeds, the team's zone,
  the loaded window, offline file removal, the role gates, success, the two warnings, kept state, the two optimistic
  changes, Retry and Try again, the checked time, the phone layout, the keys, the loader's rounds, failures reported
  and the tests).
- The catalog: CH-6305 now names its test; CH-6009 says the Undo may also throw, and what it says offline.

### Fixed

- The toast's Retry now finishes the job. Seven writes did their follow-up in the button's handler after
  `await action.run()`, so a Retry that landed sent the write and left the page as it was: publishing or saving an
  event (the editor stayed open, the panel and the grid did not update), cancelling an event, creating a calendar-app
  link (Create link stayed, and pressing it again made a second link), removing busy time, adding busy time (pressing
  Add again made a duplicate), attaching a file, and a player's reply (the choice went back to what it was and the page
  did not re-read). Each follow-up now lives inside the action passed to `useAction`, guarded by
  `normalise(res).success` (61401). The reply keeps the last confirmed answer in a ref, because the Retry runs an
  earlier render's action.
- A player's browser was sent every invitee's id and reply for every event, though the screen never showed them (the
  database lets a team player read them anyway). The loader now sends a player only their own place on each invite
  list and their own reply (60803).
- Add to calendar app offered a player a Team schedule link that the server refuses ("Only coaches can create team
  feeds"), a button that could only fail. A player is now offered only My schedule (60804).
- Undo on a removed file did not catch a thrown error (no toast, nothing reported) and tried to send while offline. It
  now reports, says "Couldn't put … back" (CH-6009), and sends nothing offline (60701).
- The Cancel event question promised "Replies and attendance are kept, and the event stays on the calendar marked cancelled" for a series too, but This and following and All in series call `deleteRecurringEvent`, which deletes the events and their replies and attendance. The question now says what those scopes do (61101).
- `?date=2026-02-30` was accepted and rolled forward; the loader now takes only a real date (60102).
- The loader read a coach's busy time after the replies, a fourth round for no reason; it now reads it with the events
  (62101).

### Why

- D-62 and D-69: every page answers all 25 categories and proves each behaviour by a test that names it. The Retry class
  of bug was found on Qualifiers the same day (Retry re-ran only the write).

### Verification

- `npx vitest run src/clubhouse/__tests__/calendar.test.tsx` 67/67; `npm run -s typecheck:fast` exit 0; eslint exit 0.
- Mutation-checked: 37 changes to the guarded code, all caught (VERIFY.md).

### Found, not fixed

- Shell, not this page: the toasts sit outside a native modal dialog, which a browser makes inert, so a Retry (and the announcement of an error toast) raised by a failure inside a dialog is probably not reachable until the dialog closes. Not verified in a browser; the jsdom tests do not see it. It affects every page's Retry.
- A create whose answer is lost on the way back can be created twice by Retry (no idempotency key on
  `createGolfEvent`, `addCoachBlockedTime` or `createCalendarFeed`).
- The editor sets its fields again whenever the page re-reads while it is open. Not reproduced. (Reproduced and fixed since, above.)
- Cancelling a series by scope deletes the events (with their replies and attendance) instead of soft-cancelling them as one event does; whether it should soft-cancel is the owner's call. Editing or cancelling a series by scope is limited to the coach who created it (`Not authorized` for a second coach), though the screen offers the scopes to every coach.
- Attendance's Retry sends every changed mark again, including those that had saved; harmless, each is an upsert.
- `getAttendanceReport` and the attendance select policy let an active team player read a whole event's attendance;
  the Clubhouse never asks for it for a player.
- The v2 first-run page empty state for a team that has never scheduled anything (D-71) is not built. (Built since: CH-6309, above.)

## 2026-09-30 — V2 phone build

- `CalendarPhone` on the owner's v2 phone board (Day, Month, List, the event in a sheet, New event as a sheet); the
  container, its writes and its dialogs are shared with the desktop. New catalog row CH-6308. Gaps in Q-67.

## 2026-09-30 — `?new=1&type=`

- The editor opens on a type named in the address, for the phone Home's quick chips.

## 2026-09-29 — Desktop build

- Desktop Calendar on the existing server actions (week, day, month and agenda; the panel; the editor with Find a
  time; attendance; busy time; files; calendar-app links; the player's view) and the state catalog (CH-60xx to CH-68xx).
