# P010 — Team Hub: changelog

## 2026-10-08 — the radio groups take programmatic focus

Every Hub radio group (an RSVP's reply, Send to, Event, and Getting there in
the trip sheet and the trip editor) takes `tabIndex={-1}`. The checked radio is still the one Tab stop and the group
still routes the arrow keys, Home and End (D7); the group itself is now
focusable, as `jsx-a11y/interactive-supports-focus` requires of an element
that handles keys, without adding a Tab stop.

## 2026-10-08 — premium pass: the lit pass, the plate, the edited page and findings (P010-A1 to A3, D1 to D9, D14)

- A1: the next trip is the page's one paper object. On desktop it keeps the paper (the room's light as `--ch-light-paper`), a rim on its sun-facing edges and a contact shadow with a long falloff leaning away from the sun (`--ch-light-*`, never on the facts), joined to its stub by a dashed perforation with two notches; its eyebrow is the page's one gilt (`--ch-ledger-eyebrow`). Later trips stay flat rows. On the phone the approved flush entry keeps everything but gains the perforated rule and notches between the facts and the plan. More contrast drops the rim and shadow for a plain border.
- A2: the latest announcement is a lacquered plate on the phone (a rim on its sun-facing edges, a pressed headline, the Display-P3 green where the screen has it, light theme only); on desktop the flush entry's headline is debossed.
- A3: the Announcements tab is an edited page: the newest at 36px, older posts at 22px with their date in the left margin; on desktop the coach's right margin holds the read count of the post in view, pinned while the page scrolls (only the count the page already has). On the phone an older post folds to its title and first line until tapped.
- D1 a done task strikes its title only, not the ring's fraction. D2 the tab is in the URL (`?tab=`, replaced in place). D3 the coach preview's Updates are coach-shaped. D4 the big pass doesn't repeat Departs and Stay beside its plan, and the plan and the pass's lines share one 96px label column. D5 failure titles are ink (the shell's D5-1). D6 the head's one primary follows the tab (New announcement, Plan a trip, Assign a task; none on Documents, whose drop zone is its primary, or on a tab whose read failed); the in-panel Plan a trip and Assign duplicates are gone. D7 every radio group is one Tab stop and the arrow keys, Home and End walk it (an RSVP's arrows move without sending; Space chooses). D8 "Needs your acknowledgement". D9 an RSVP row's line keeps time and place; the date tile says the day (the full date is still read). D14 the tab underline glides on the base spring.

## 2026-10-08 — dark: Clubhouse at night

Team Hub follows GolfHelm's dark theme ("Clubhouse at night"). Row rules, the pass's perforation, task checkboxes, RSVP and read tracks become ivory hairlines; the tab underline and Going in the RSVP bar take the light green; ivory type on a filled green (RSVP choice, task tick, upload mark, audience choice, step) takes the on-green ink; the featured announcement is unchanged. Light mode is unchanged.

## 2026-10-08 — phone: Mobile clubhouse pass

Phone Team Hub follows the owner's "Mobile clubhouse pass" board (carried from
Coach Home), with no cards:

- the page opens under the engraved double rule, the role chip beside the team
  line set as the engraved eyebrow, then a coach's New announcement and the tabs
  on a hairline;
- RSVPs, Updates, tasks and folders are sections on their own double rule, the
  heading in the 19px bold sans, their rows on soft seams (the event's line, an
  update and a file press with the Ledger tint, never a scale);
- the latest announcement ("Latest", or "Needs your reply") is the screen's one
  green feature card, with Got it as an ivory key and the reads bar in
  champagne;
- a trip is an entry with its facts between two hairlines and its plan under
  them, the boarding-pass card and its notches gone; announcements are entries
  ruled apart; the drop zone and the reply segments keep their material.

The phone route skeleton has its own shape in the loaded page's classes: for a
player the head, the tabs, the first section heading and its first row land with
0px shift (WebKit 390). The skeleton can't know the role, so a coach's tabs
still move down by the New announcement key (50px).

## 2026-10-08 — The tab strip runs edge to edge; the skeleton takes the role's shape; curly apostrophes

On a phone the tab strip's hairline now runs edge to edge and all five of a
coach's tabs fit from 375px: the strip bleeds past the page's gutters but kept a
100% width cap that held it 40px short, which cut Tasks at 390. The route
skeleton draws the signed-in role's opening (a coach's New announcement under
the role chip) and tab count, from the shell's role, so the page lands where it
stood for either role: 0px at 390 (a coach's tabs moved 52px before). Every line
the page writes, its toasts and the no-team page included, takes the curly
apostrophe, and a title a toast quotes sits in curly quotes (Posted “Waiver”)
(states audit b8, held by `copy-apostrophes.test.ts`).

## 2026-10-08 — One notice when several reads fail; tab empties flush; one New announcement

With more than one read failed, the page says so once under its head, naming the
parts, with one Try again that reads the page again (the shell's CH-1209); each
failed section keeps only its title under its heading. One failed read keeps its
own notice and Try again. The tabs' empties (announcements, trips, documents)
lose their card and sit flush at the panel's edge like Tasks', and their titles
drop the full stop (states audit c5, b8). A coach's first-run page no longer
repeats New announcement under the head's: the empty offers Plan a trip (b9).

## 2026-10-07 — A file row presses with a tint

A file row's tint now eases (quick), and on desktop a press deepens it to the
row press tint over the press beat.

## 2026-10-07 — Tabs that move

The tabs' underline is now one bar that slides to the chosen tab on the press
(CH-10602), where an inset rule used to jump. The panel renders just behind it
and fades in with a 6px rise while the old one fades out (CH-10603, the shared
`Swap`). With reduced motion both are instant.

## 2026-10-07 — The Ledger: Team Hub sits flush on the canvas

On desktop RSVPs, Updates, tasks and document folders lose their card: each is
a heading over an engraved rule with its rows on soft seams, and Home's two
columns part on a soft vertical rule. The latest announcement, the page's lead,
keeps a gilt rule in the gutter instead of a card, its headline in forest ink
on the section edge; in their own tab announcements are ruled apart. A trip is
an entry rather than a boarding-pass card: its name in the heading sans, not
the serif, and its plan beside it on a soft column rule. A section that didn't
load keeps its notice a step under the rule. The composer line, the drop zone,
the reply segments and the date chips keep their material. The route skeleton
lays its bars flush, and its head and tab strip now match the loaded heights
(158 and 34px), so nothing moves on load at 1440 or 1100 (WebKit). The phone is
unchanged.

## 2026-10-07 — Digits in serif titles

Data-fed serif titles set their digits in the sans (shared `SerifText`; see the
cross-page log), so a name or title with figures reads cleanly.

## 2026-10-07 — Serif titles, readable RSVP bars

Team Hub reads like a club bulletin. The page title, card titles (RSVPs,
Updates), the latest announcement's headline and the trip name are set in the
display serif; body, data and controls stay sans. The coach's RSVP bars widen
from 110 to 180px at 8px tall, so the going, maybe, can't and no-reply split
reads at a glance beside its line.

## 2026-10-06 — Display type relaxed

The owner found the display type too compact. Display headings on this page
widen (width axis 88 → 96) and the tightest tracking eases to -0.026em, as on
every Clubhouse page. Layout and content are unchanged.

<!-- clubhouse:release-audit:start -->

## 2026-10-08 — Server-action imports follow the golf.ts split

```text
PR/commit:      #2176, agent/phase-7
Design package: none
Contract IDs:   none changed
Data impact:    none
Held items:     none
```

The screen's imports and test mocks now point at the files that own the server
actions (calendar-events.ts) after `golf.ts`, `insights.ts` and `admin-data.ts` were split
by domain. No behavior change.

## 2026-10-06 — Whole-app release audit

Reconciled page purpose, design acceptance, contract status, wiring and
verification against the current flagged implementation. Indexed 11 mapped
actions and 14 overlay/control call sites in the [all-page
audit](../../ALL_PAGE_AUDIT.md#p010-hub). Approved handoffs and contract IDs
are preserved; runtime gaps stay explicit.
<!-- clubhouse:release-audit:end -->

## 2026-10-02 — Intuitive improvement: distinguish pending choices from confirmed changes

```text
Design package: owner's mobile boards; Intuitive Software Design IMPROVE mode
PR/commit:      codex/clubhouse-design-fidelity (working tree after cca081c)
Contract IDs:   100208–100210, 101301; CH-10408–CH-10410
Actions:        existing event reply, acknowledgment and task state; none added
Data impact:    no endpoint or schema changes; local fixtures and mocked writes for verification
Held items:     intended-user validation, physical Safari and real-account read-back
```

The Hub now owns an action gate and pending state for each event reply, post
acknowledgment and task, so tab changes and older toast Retries share the same
lock. Completing and reopening a task share one gate.
Sending/Acknowledging/Saving names the current object; only that object locks,
while another can save independently. Acknowledgment retains the featured post
until its write answers. Refusal restores prior state and Retry preserves the
requested action; a task reopened earlier in the visit also restores that last
confirmed state after a failed completion. No write endpoint or role rule
changed. Nine added regression cases verify independent saves,
duplicate/opposite-action prevention, rollback, acknowledgment Retry, the
reopened-task edge case, tab remounts, quiet stale Retry contention and retaining
a confirmed acknowledgment after a later stale Retry refuses. The full Hub
file passes 144/144 tests (exit 0, 37.46 s, one worker).

Evidence and practical limits: `VERIFY.md` and the scoped intuitive
secondary-screen report.

## 2026-10-02 — Team Hub: restore card material and consistent phone gutters

```text
Design package: design/handoff/ (owner's mobile boards and depth.css)
PR/commit:      codex/clubhouse-design-fidelity (working tree)
Contract IDs:   none changed
Actions:        none changed
Data impact:    none
Held items:     physical iPhone Safari and signed-in production data verification
```

RSVP, task, announcement and travel cards use the shared layered sheet gradient
and shadow. Phone card headings and lists have consistent 16px gutters and more
room between sections; tabs keep their existing horizontal scrolling and touch
areas. The duplicate desktop heading is visually hidden by phone CSS before
hydration, avoiding its first-paint jump under the shell title. Existing data
and role permissions are unchanged.

Verification: WebKit iPhone 13 populated layouts at 375, 390 and 430, plus
empty/failed states at 390. Before/after screenshots and practical limits are
recorded in VERIFY.md.

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification
log and decisions).

## 2026-10-01 — A trip can be edited and deleted (swap audit §14 D2)

```text
PR/commit:      agent/swap-audit (#2111): 12f07da99, 9fb7ad0b9
Design package: none (a More menu on the trip row; phone sign-off Q-133)
Contract IDs:   CH-10013, CH-10504 (new); CH-10009, CH-10103 to CH-10106 widened to trips
Actions:        hub.editTrip, hub.delete (trips)
Data impact:    reuses updateGolfTravelItinerary and deleteGolfTravelItinerary; ChHubTrip carries the raw departure time, return date and return time
Held items:     none
```

- **Issue.** Team Hub could only create a trip; a mistyped one could not be
  fixed or removed with Clubhouse on.
- **Fix.** Edit trip (every field, dates and times included; only changed
  values are sent) and Delete trip (asks first; expenses and budgets go with
  it). Expenses, budgets, CSV, recurring tasks and document versions stay
  Fairway-only (Q-130).
- **Checked.** `hub-trip-manage.test.tsx`, `hub.test.tsx`.

## 2026-09-30 — Attendance and task counts read every row (swap audit F-21)

```text
PR/commit:      agent/clubhouse (release train #2110)
Design package: none (swap audit fix, no visual change)
Contract IDs:   none (behaviour of existing counts)
Actions:        none
Data impact:    `attendanceFor` and `assignmentsFor` in `data/hub.ts` page with `fetchAllRowsResult` ordered by id. No schema change.
Held items:     none
```

- **Issue.** The reads asked for `.limit(2000)` and `.limit(5000)`, but
  PostgREST returns at most 1000 rows, so a large team's RSVP lists and task
  done/total counts were cut short with no error. CI's row-cap rule caught it on
  #2110.
- **Fix.** Both reads page through every row. A failed page still returns the
  existing error state.
- **Checked.** `hub-paged-reads.test.ts` 2/2 (2500 attendance rows, 1800
  assignments); hub 129/129; `check-row-cap-limits`, `audit:paginated-reads` and
  `audit:supabase-errors` pass.

## 2026-09-30 — Files that didn't attach, only files players can open, and a traveler's class during a trip (Q-82, Q-83, Q-84)

```text
PR/commit:      agent/clubhouse
Design package: none (owner-approved 2026-09-30: Q-82, Q-83, Q-84; the class row is the board's "Eli has CHEM 102 lab")
Contract IDs:   CH-10012, CH-10110, CH-10212, CH-10314, CH-10315, CH-10407, minted by the sync
Actions:        ACT-P010-TRAVELER-CLASSES (new); ACT-P010-POST-ANNOUNCEMENT now reads `attachmentsError`
Data impact:    `getTravelerClassConflicts` (travel.ts, new) reads the chosen travelers' classes through the availability layer; `createEnrichedAnnouncement` returns an optional `attachmentsError`; the trip builder's events read `end_time` and `all_day`. No schema change.
Held items:     none
```

### The post says when its files did not attach (Q-82)

- **Issue.** `createEnrichedAnnouncement` discarded the error from its
  `golf_announcement_documents` insert, so a post whose attachments failed said
  "Posted" and the coach believed players had the files.
- **Fix.** The action returns `attachmentsError` beside the announcement id
  (`success` stays true, so every other caller is unchanged, and the failure is
  logged). The sheet closes, the page reads again, and one error toast says
  `Posted "Waiver" without its files`, that the files didn't attach and that
  players can still open them in Documents (CH-10012). It has no Retry: the post
  exists, and a replay would post it twice. No "Posted" toast beside it; error
  haptic.
- **Checked.** announcement-attachments 2/2 (3 of 3 mutations caught); hub
  129/129; the phone build is the same sheet.

### New announcement offers only files players can open (Q-83)

- **Issue.** A coach-only document could be attached to an announcement, as in
  Fairway's composer; players then saw an attachment they could not open.
- **Fix.** `ChHubFile` carries `isPublic` (`is_public === true`, so a missing
  value is coach-only). The attach list offers only those files, hides a folder
  with none, and says how many were left out (CH-10314). When every file is
  coach-only there is no attach button and the line says why; the post still
  goes with none. A file chosen and then made coach-only while the sheet is open
  comes off its chip and is not sent. The Documents tab still lists every file
  to a coach.
- **Checked.** hub 129/129 (the loader marks `isPublic` only for `true`).

### Plan a trip warns when a traveler has a class during the trip (Q-84)

- **Issue.** The board's trip builder warns "Eli has CHEM 102 lab Mon
  3:00–4:15"; Clubhouse did not read class schedules, so a coach could take a
  player out of a class without knowing.
- **Fix.** The Travelers step, and the Itinerary summary once the dates are
  typed, show the warning row (CH-10110): one line per traveler with a class
  (three at most, the rest counted), "They'd miss it to travel." The read is a
  coach's and is scoped three ways: staffed on the team, every traveler on its
  active roster, and only the chosen travelers asked about, for the trip's days
  (the event's own span until a departure and return are typed; a departure or
  return time narrows the first or last day). It asks the availability layer the
  Calendar's conflict check asks, so terms, synced meetings, academic breaks and
  the team's zone are decided once; only `{ playerId, title, days, time }`
  reaches the page. A check that could not run says so with Try again and never
  reads as "no classes" (CH-10212, CH-10315); it runs only after the travelers
  settle (CH-10407), drops an answer for travelers no longer on screen, and
  never blocks Publish. The trip builder's events now carry the days they run,
  and an all-day event's day is no longer read a day early west of UTC.
- **Checked.** travel-class-conflicts 16/16 (12 of 13 mutations caught; the
  survivor drops a `.in('player_id', …)` narrowing that the roster check just
  below it makes harmless); hub 129/129, 45 of 45 mutations of the page's code
  caught.

## 2026-09-30 — Phone tap targets

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

- **Issue.** On the phone the section tabs (40px tall, about 36px wide), the
  event rows (35px), Going / Maybe / Can't (30px), the icon buttons (32px) and
  the task tick (24px) were under Apple's 44pt minimum.
- **Fix.** The tabs are 44 tall and at least 44 wide (the strip scrolls
  sideways, which would clip an invisible hit area); the event rows are at least
  44 tall; the reply buttons, icon buttons and tick get an invisible 44 x 44 hit
  area (`hub.css`).
- **Checked.** scripts/clubhouse/native.mjs at 390 and 430px (real hit testing
  with elementFromPoint).

## 2026-09-30 — Plan a trip in four steps, and a travelers audience (Clickables gaps 8 and 22); Untick a done task (Clickables gap 18)

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

### Plan a trip in four steps, and a travelers audience (Clickables gaps 8 and 22)

- **Issue.** Plan a trip was one form, with no link to the calendar event or who
  travels; New announcement could not reach a trip's travelers.
- **Fix.** Four steps (Event, Travelers, Logistics, Itinerary) with Back and
  Next; the event fills name, place and day, its invitees are the travelers
  (written with explicit adds and removes); Publish saves the trip once, so a
  Retry writes only the travelers. New announcement offers "<trip> travelers ·
  N". New states CH-10210, CH-10211, CH-10312, CH-10313. The class-clash line is
  not built (Q-84).
- **Checked.** hub 101/101, 6 of 6 mutations caught.

### Untick a done task (Clickables gap 18)

- **Issue.** A player who ticked a task by accident could not undo it.
- **Fix.** A tick on a done task opens it again through the new `uncompleteTask`
  (their own assignment back to pending, as the live RLS policy allows).
  Optimistic; a refusal leaves it done with CH-10011 and Retry.
- **Checked.** hub 96/96, 2 of 2 mutations caught; uncomplete-task 3/3.

## 2026-09-30 — Attach from Documents, and Edit an announcement (Clickables gaps 5 and 11)

```text
Design package: none (the board draws neither control; CLICKABLES.md rows 5 and 11)
PR/commit:      agent/clubhouse
Contract IDs:   100618 (CH-10010), 100619 (CH-10209), 100412 (CH-10311), 100206 (CH-10406), minted by the sync
Actions:        ACT-P010-EDIT-ANNOUNCEMENT (new); ACT-P010-POST-ANNOUNCEMENT now sends `documentIds`
Data impact:    none (the page already reads the team's documents; `ChHubAnnouncement` now carries `urgency`)
Held items:     none
```

### Added

- **Attach from Documents in New announcement.** A coach picks files from the
  team's Documents, sees them as chips
  that come off with a tap, and the post sends their ids
  (`createEnrichedAnnouncement`'s `documentIds`, which
  Clubhouse had always sent as `[]`). The documents came with the page, so the
  list has nothing to load: a failed
  read says so with Try again (CH-10209), and a team with no documents says
  where they are added (CH-10311). A
  file deleted while the sheet is open is not sent. The files clear when the
  post lands, and are kept when it is
  refused.
- **Edit announcement in a post's More menu.** The same sheet, opened on the
  post: headline, message and the
  acknowledgement switch, saved through `updateAnnouncement`. Who it went to and
  what is attached stay as
  posted, so those fields are not shown. The post's urgency goes back as it was
  read (Messages posts `urgent`).
  The card shows the new words at once and the page reads again; a refused save
  keeps the words and says why
  (CH-10010, with Retry); the button says Saving while it is sent (CH-10406).
  The form starts from the post once
  per opening, and is its own instance, so a draft of a new post survives an
  edit.

## 2026-09-30 — Tabs from the keyboard

```text
PR/commit:      agent/clubhouse
Contract IDs:   none new
Data impact:    none
```

### Fixed (with a test that fails without the fix)

- **The tabs had no arrow keys.** They are now one Tab stop, and the arrows
  (wrapping), Home and End move
  between them and select; Tab goes on to the panel (102001, reworded).

## 2026-09-30 — A roster that didn't load (CH-10208, CH-10310)

```text
Design package: design/handoff/ v2 (no board state; the sheets' own error and empty lines)
PR/commit:      agent/clubhouse
Contract IDs:   none new (catalog rows CH-10208, CH-10310; Bridge IDs on the next sync)
Actions:        none new
Data impact:    none (the loader's existing roster read now reports its failure)
Held items:     none
```

### Fixed (each with a test that fails without the fix)

- **A failed roster read looked like an empty team.** The announcement sheet
  offered "Whole team · 0". The
  task sheet read "For 0 of 0" with no players and answered Assign with "Choose
  at least one player". The
  loader now reports `playersError`, and wherever players are chosen the sheet
  says the roster didn't load
  (CH-10208) and offers Try again. A team with nobody on it says so (CH-10310).
  A post to the whole team
  still goes through.
- **The task sheet chose its players once.** A roster that arrived after a
  refresh was never chosen. It now
  starts fully chosen, like the first one.

## 2026-09-30 — V2 page docs and the contract pass

```text
Design package: design/handoff/ v2 (Coach - Team Hub.html, Player - Team Hub.html, the Mobile board)
PR/commit:      agent/clubhouse (uncommitted at the time of writing)
Contract IDs:   100101 to 102401 (19 hand contracts, one reserved), plus CH-10405 (Bridge ID 100205)
Actions:        10 (ACT-P010-*)
Data impact:    none
Held items:     none
```

### Changed

- The six page docs, the manifest's actions (`status.docs` current,
  `status.contract` complete) and the hand
  contracts: core view, tab link, page empty state, offline, the role's
  controls, a player's own data, the
  replies still open, the server actions as the gate (reserved), success, forms
  kept, optimistic changes,
  Retry, Try again, refresh after a change, phone layout, keyboard, the loader,
  observability and tests.
- The loading route now shows a Clubhouse skeleton (new catalog row CH-10405,
  `HubSkeleton`); it used to show
  the Fairway one inside the Clubhouse shell.

### Fixed (each with a test that fails without the fix)

- **The toast's Retry skipped every follow-up.** All nine writes did their
  follow-up after `await x.run()`
  in a handler, and Retry re-runs only the action: after a Retry that landed, a
  reply, Got it or a task tick
  never showed; a file never opened; an upload never appeared; a deleted row
  stayed and its dialog stayed
  open; and a post, trip or task sheet stayed open with its text and its button
  enabled, so a second press
  posted twice. The follow-ups now live inside the actions (the sheets
  own theirs). The optimistic ticks are applied and undone there too, and a
  reply's way back is the last
  answer the server confirmed (kept in a ref), because a Retry runs an earlier
  render's action.
- **Opening a file offline** opened a blank tab and closed it again; offline it
  now opens nothing.
- **A Retry of an upload** showed no Uploading state, so the drop zone could be
  pressed again meanwhile.
- **A player was sent their teammates' read receipts** (each post's acknowledged
  and recipient counts, from
  the announcements read). The screen only hid them; the loader now sends a
  player zeros.
- **A player was offered Going, Maybe and Can't on events they could not use.**
  The aggregate lists every team
  event, with no reply status for one the player is not invited to (no
  attendance row), and the loader read
  that as "pending": an uninvited event showed as needing a reply, counted in "N
  need a reply", and a tap
  would have added the player to that event's list. It also listed events the
  server refuses (started,
  cancelled, past their deadline, or a day past an all-day start). The loader
  now offers only the events the
  player is invited to that still take a reply, by the rules `respondToEvent`
  enforces.
- **A failed Updates read showed "No team updates yet"**, and Updates that had
  rows were hidden behind it;
  the page empty state now needs every read, Updates included, to have answered
  and been empty.

### Why

- The contract pass (D-62, D-69): every category answered, every behaviour
  named, and every bug class the
  Calendar and Messages passes found looked for here.

### Verification

- See VERIFY.md.
