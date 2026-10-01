# P003 — Roster: changelog

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification log and decisions).

## 2026-09-30 — Schedule 1:1 on desktop (Clickables gap 4); View insights in the row menu (Clickables gap 16)

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

### Schedule 1:1 on desktop (Clickables gap 4)

- **Issue.** The desktop Roster panel had no way to plan a 1:1, which the phone had.
- **Fix.** Schedule 1:1 opens Calendar's editor with only that player invited (`calendar?new=1&with=<id>`, D-52).
- **Checked.** roster + stats-player 124/124, 2 of 2 mutations caught.

### View insights in the row menu (Clickables gap 16)

- **Issue.** The List view's row menu had no way to CoachHelm's read of a player.
- **Fix.** The menu starts with View insights, which opens CoachHelm on that player (an id not on the board opens the most pressing player).
- **Checked.** roster + coachhelm 178/178, 2 of 2 mutations caught.

## 2026-09-30 — V2 page docs (copied from Messages); eight fixes found while writing them

```text
Contract IDs:   30406 (new: CH-3306, no team) and 22 behaviour contracts without a code (30101 to 32401), all with a test
Actions:        12 (ACT-P003-*)
Data impact:    none
Held items:     roster-availability (data)
```

### Changed

- The six page docs, the manifest's actions, and the 22 behaviour contracts (core view, deep link, refresh, safe
  export, offline, the coach-only gate, private notes, refused changes, success, note kept, layout kept, note reads
  back, optimistic decisions, Approve all retry, Try again, toast Retry, Remove's warning, note on leaving the field,
  the loader, failures reported, the tests).
- A route adapter, `src/clubhouse/routes/roster.tsx`, so the role check, the team and the no-team state have a seam a
  test can reach. The page calls it for a coach with the flag on.
- The catalog gains CH-3306, and `docs/clubhouse/screens/roster.md` now says the loader reads in two parallel rounds.

### Fixed

- The toast's Retry did not finish the change on screen. It re-ran only the server call, so a retried removal left
  the player listed and the dialog open, a retried approval put the request back in the list (and Approve then failed
  as already processed), and a retried note save left the note marked unsaved. What a change does on screen now
  happens inside its action.
- Try again after a failed read still showed "No players yet": the screen kept the players and requests from its first
  render and ignored the page the server sent back. By the same code an approved player would not appear until a
  reload. The list now follows the server's page, with only the changes made since laid on top.
- A saved note read back as the old text when the player was opened again. Saving now updates the roster the screen
  holds.
- Remove player fired no warning haptic (D-70 and the phone spec both ask for one). It does now.
- A coach with no team saw Home's empty state, whose text is about Home. Roster has its own (CH-3306).
- On desktop, pressing Approve on a second request while the first was still being decided did nothing and said
  nothing. Every Approve and Decline now waits until the decision in flight has answered, as on the phone.
- The CSV export wrote a player's name as typed. A name that starts with `=`, `+`, `-` or `@` (or a tab or a return)
  could be read by a spreadsheet as a formula; it is now written as text.
- Esc inside the Remove or Invite dialog also closed the player panel behind it. It now closes only the dialog.

### Why

- D-62 and D-69: every page gets the Messages contract, and writing the contract against the code found these five
  places where the code did not keep it.

### Verification

- `npx vitest run src/clubhouse` 536/536; each new test fails with the code it guards broken (VERIFY.md).
- `npx eslint` and `npm run -s typecheck:fast` exit 0.

## 2026-09-29 — Phone build, v2 motion, haptics and page empty state

- The phone list, pushed profile, join requests sheet and ⋯ sheet on the approved design (D-50 to D-59), Approve all
  (D-55), the Calendar 1:1 seed (D-52) and the Stats `tab` parameter (D-53).
- v2 motion (D-64), v2 haptics (D-70) and the page empty state for "No players yet" (D-71); Roster moved under More on
  the phone (D-66).

## 2026-09-29 — Desktop build

- Desktop Roster on the Clubhouse loader, with the join requests, Needs a look, cards and list, the player panel, the
  coach's note, Export and Invite, and the full state catalog (CH-30xx to CH-38xx).
