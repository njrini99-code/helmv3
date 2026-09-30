# P010 — Team Hub: changelog

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification log and decisions).

## 2026-09-30 — Phone tap targets

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

- **Issue.** On the phone the section tabs (40px tall, about 36px wide), the event rows (35px), Going / Maybe / Can't (30px), the icon buttons (32px) and the task tick (24px) were under Apple's 44pt minimum.
- **Fix.** The tabs are 44 tall and at least 44 wide (the strip scrolls sideways, which would clip an invisible hit area); the event rows are at least 44 tall; the reply buttons, icon buttons and tick get an invisible 44 x 44 hit area (`hub.css`).
- **Checked.** scripts/clubhouse/native.mjs at 390 and 430px (real hit testing with elementFromPoint).

## 2026-09-30 — Plan a trip in four steps, and a travelers audience (Clickables gaps 8 and 22); Untick a done task (Clickables gap 18)

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

### Plan a trip in four steps, and a travelers audience (Clickables gaps 8 and 22)

- **Issue.** Plan a trip was one form, with no link to the calendar event or who travels; New announcement could not reach a trip's travelers.
- **Fix.** Four steps (Event, Travelers, Logistics, Itinerary) with Back and Next; the event fills name, place and day, its invitees are the travelers (written with explicit adds and removes); Publish saves the trip once, so a Retry writes only the travelers. New announcement offers "<trip> travelers · N". New states CH-10210, CH-10211, CH-10312, CH-10313. The class-clash line is not built (Q-84).
- **Checked.** hub 101/101, 6 of 6 mutations caught.

### Untick a done task (Clickables gap 18)

- **Issue.** A player who ticked a task by accident could not undo it.
- **Fix.** A tick on a done task opens it again through the new `uncompleteTask` (their own assignment back to pending, as the live RLS policy allows). Optimistic; a refusal leaves it done with CH-10011 and Retry.
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

- **Attach from Documents in New announcement.** A coach picks files from the team's Documents, sees them as chips
  that come off with a tap, and the post sends their ids (`createEnrichedAnnouncement`'s `documentIds`, which
  Clubhouse had always sent as `[]`). The documents came with the page, so the list has nothing to load: a failed
  read says so with Try again (CH-10209), and a team with no documents says where they are added (CH-10311). A
  file deleted while the sheet is open is not sent. The files clear when the post lands, and are kept when it is
  refused.
- **Edit announcement in a post's More menu.** The same sheet, opened on the post: headline, message and the
  acknowledgement switch, saved through `updateAnnouncement`. Who it went to and what is attached stay as
  posted, so those fields are not shown. The post's urgency goes back as it was read (Messages posts `urgent`).
  The card shows the new words at once and the page reads again; a refused save keeps the words and says why
  (CH-10010, with Retry); the button says Saving while it is sent (CH-10406). The form starts from the post once
  per opening, and is its own instance, so a draft of a new post survives an edit.

## 2026-09-30 — Tabs from the keyboard

```text
PR/commit:      agent/clubhouse
Contract IDs:   none new
Data impact:    none
```

### Fixed (with a test that fails without the fix)

- **The tabs had no arrow keys.** They are now one Tab stop, and the arrows (wrapping), Home and End move
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

- **A failed roster read looked like an empty team.** The announcement sheet offered "Whole team · 0". The
  task sheet read "For 0 of 0" with no players and answered Assign with "Choose at least one player". The
  loader now reports `playersError`, and wherever players are chosen the sheet says the roster didn't load
  (CH-10208) and offers Try again. A team with nobody on it says so (CH-10310). A post to the whole team
  still goes through.
- **The task sheet chose its players once.** A roster that arrived after a refresh was never chosen. It now
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

- The six page docs, the manifest's actions (`status.docs` current, `status.contract` complete) and the hand
  contracts: core view, tab link, page empty state, offline, the role's controls, a player's own data, the
  replies still open, the server actions as the gate (reserved), success, forms kept, optimistic changes,
  Retry, Try again, refresh after a change, phone layout, keyboard, the loader, observability and tests.
- The loading route now shows a Clubhouse skeleton (new catalog row CH-10405, `HubSkeleton`); it used to show
  the Fairway one inside the Clubhouse shell.

### Fixed (each with a test that fails without the fix)

- **The toast's Retry skipped every follow-up.** All nine writes did their follow-up after `await x.run()`
  in a handler, and Retry re-runs only the action: after a Retry that landed, a reply, Got it or a task tick
  never showed; a file never opened; an upload never appeared; a deleted row stayed and its dialog stayed
  open; and a post, trip or task sheet stayed open with its text and its button enabled, so a second press
  posted twice. The follow-ups now live inside the actions (the sheets
  own theirs). The optimistic ticks are applied and undone there too, and a reply's way back is the last
  answer the server confirmed (kept in a ref), because a Retry runs an earlier render's action.
- **Opening a file offline** opened a blank tab and closed it again; offline it now opens nothing.
- **A Retry of an upload** showed no Uploading state, so the drop zone could be pressed again meanwhile.
- **A player was sent their teammates' read receipts** (each post's acknowledged and recipient counts, from
  the announcements read). The screen only hid them; the loader now sends a player zeros.
- **A player was offered Going, Maybe and Can't on events they could not use.** The aggregate lists every team
  event, with no reply status for one the player is not invited to (no attendance row), and the loader read
  that as "pending": an uninvited event showed as needing a reply, counted in "N need a reply", and a tap
  would have added the player to that event's list. It also listed events the server refuses (started,
  cancelled, past their deadline, or a day past an all-day start). The loader now offers only the events the
  player is invited to that still take a reply, by the rules `respondToEvent` enforces.
- **A failed Updates read showed "No team updates yet"**, and Updates that had rows were hidden behind it;
  the page empty state now needs every read, Updates included, to have answered and been empty.

### Why

- The contract pass (D-62, D-69): every category answered, every behaviour named, and every bug class the
  Calendar and Messages passes found looked for here.

### Verification

- See VERIFY.md.
