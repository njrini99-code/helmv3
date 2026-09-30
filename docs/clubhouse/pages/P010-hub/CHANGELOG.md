# P010 — Team Hub: changelog

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification log and decisions).

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
