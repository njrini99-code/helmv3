# P003 — Roster: changelog

## 2026-10-02 — Roster: room for complete player status

```text
Design package: design/handoff/ (owner's mobile boards and depth.css)
PR/commit:      codex/clubhouse-design-fidelity (working tree)
Contract IDs:   none changed
Actions:        none changed
Data impact:    none
Held items:     physical iPhone Safari and signed-in production data verification
```

The phone roster now uses the shared sheet gradient and layered lighting. Rows
have a 72px minimum with room for wrapping status text; long attention notes
remain visible instead of ending in an ellipsis. Content and skeleton gutters
use the same 16px rhythm.

Verification: WebKit iPhone 13 populated layouts at 375, 390 and 430, plus
empty/failed states at 390. Before/after screenshots and practical limits are
recorded in VERIFY.md.

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification
log and decisions).

## 2026-10-01 — The saved-view effect lists its setter (CI lint ratchet)

```text
PR/commit:      agent/swap-audit (PR #2111 CI fix)
Design package: none
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

- **Issue.** CI's lint ratchet failed by one `react-hooks/exhaustive-deps`
  warning: the effect in `Roster.tsx` that restores the faces/list view from
  local storage called `setView` but had an empty dependency list.
- **Fix.** `[setView]`. `setView` is the `useState` setter that
  `useChSessionState` returns, and React keeps a setter's identity stable, so
  the effect still runs once on mount. Nothing a coach sees changes, so there's
  no screenshot.
- **Checked.** eslint on the file is clean; the warning total is back to the
  baseline of 59.

## 2026-10-01 — The player's Roster, read-only (owner, Q-130)

```text
PR/commit:      agent/swap-audit: 0672d5738
Design package: design/handoff/ (v2): Coach - Roster.html and Coach - Roster - Mobile.html, as the owner asked
                ("the same thing as coach except they can't click"); no player board exists
Contract IDs:   30804, 30805, 30806, 30617, 30618, 30407, 30408, 31807 (catalog CH-3210, CH-3211, CH-3307, CH-3308,
                CH-3807); 30801's meaning updated
Actions:        ACT-P003-PLAYER-VIEW, ACT-P003-PLAYER-TRY-AGAIN
Data impact:    none (two RLS-scoped reads, golf_teams and the team's active golf_team_members with golf_players, on
                tables a player already reads; no schema change)
Held items:     none
```

- **Issue.** With Clubhouse on, a player on `/roster` got the not-rebuilt notice.
- **Fix.** A player gets the coach's layout as plain text (`TeamRoster`,
  `TeamRosterPhone`): name, class year and handicap of the active members, no
  scores, notes, requests, invite, export or player panel, and no card or row is a link
  or a button (CH-3807). A separate loader (`data/roster-player.ts`) reads only
  the team's name and season and the active members. `/roster/[id]` goes to the list
  for a player. Roster is a sidebar entry under Team for a player and a row in the
  phone More sheet. Catalog CH-3210, CH-3211, CH-3307, CH-3308, CH-3807; contracts
  30804 to 30806; 30801's meaning now says the coach's roster is a coach's.
- **Checked.** roster-player.test 19/19, with the loader's selects, tables and
  filters asserted and 2 of 2 mutations caught (an extra column, a button around a
  name); five existing assertions that a player gets NotRebuilt on `/roster`, or
  that the player sidebar has no Team section, were changed on purpose; the
  Clubhouse suite 2515/2515; `clubhouse:check` clean; a browser pass at 1280 and
  390 (cards, list, phone rows). Not exercised: a signed-in player against the
  database (the loader is tested over a fake client).

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
