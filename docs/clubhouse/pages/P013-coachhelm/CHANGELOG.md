# P013 — CoachHelm: changelog

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification log and decisions).

## 2026-09-30 — Phone tap targets

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

- **Issue.** The player rows in the phone list were 38px tall.
- **Fix.** They are at least 44 tall (`coachhelm.css`).
- **Checked.** scripts/clubhouse/native.mjs at 390 and 430px.

## 2026-09-30 — Assign as focus on a strength (Clickables gap 12)

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

### Assign as focus on a strength (Clickables gap 12)

- **Issue.** Assign was hidden on a strength, though the board draws it on Theo's card; contract 130806 had been written from the code, not the board.
- **Fix.** CoachHelm offers Assign as focus on a strength (a keep-doing focus); 130806 is reworded (Q-80, kept by the owner).
- **Checked.** coachhelm 112/112; the old hide fails the reworded test.

## 2026-09-30 — CoachHelm for coach and player, and the V2 page docs

```text
Design package: design/handoff/ v2 (Coach - CoachHelm.html, Player - CoachHelm.html, the Mobile board)
PR/commit:      agent/clubhouse, 8476314a7 (the build); the docs were written afterwards and not yet committed
Contract IDs:   130101 to 132301 (28 hand contracts, all reserved; 18 covered by a test, 8 partly, 2 not), plus the
                catalog's 32 (CH-13xxx, Bridge IDs 130201 to 131806)
Actions:        4 (ACT-P013-*)
Data impact:    none (reads through the delivery actions and existing tables; the three writes are the Fairway
                Brief's)
Held items:     none
```

### Changed

- The page: one route, `/golf/dashboard/coachhelm`, is the coach's board (program pulse, By player, the chosen
  player's focus with Assign as focus, Dismiss and Undo) and the player's board (one focus, Also worth knowing,
  Working, no write), desktop and phone, behind `golf_clubhouse_ui`. The loaders, the catalog (13xxx) and the
  phone spec came with it.
- The six page docs, the manifest's actions (`status.docs` current, `status.contract` complete) and the hand
  contracts: core view, the focus and the player order, the generator-only rule, the route skeleton, failed
  reads never drawn as empty, a failed gate lookup, offline, the role's controls, each side's own reads, the
  server actions as the gate (reserved: read, not run), the flag, when Assign is offered, success, the proposal,
  the existing-focus outcome, state kept, Retry, Try again, Undo, freshness, axe (reserved: not a unit test),
  the phone layout, the loader's rounds and observability.
- **The Fairway drills.** `?view=development`, `profile` and `standing` (where /my-development,
  /my-game-profile, /my-standing and the focus-area cards send people) show the shell's "not rebuilt yet"
  page (CH-1301) instead of the one-focus board, which they used to land on as if it were the view they asked
  for. `?view=insights` stays the board. The guard is `VIEWS_NOT_REBUILT` in `routes/coachhelm.tsx`, and the page
  passes `?view=` to the route (Q-76).

### Why

- The contract pass (D-62, D-69): every category answered, every behaviour named, and every bug class the
  earlier passes found looked for here: a failed read shown as empty, a Retry that skips its follow-ups, a control
  drawn for the wrong role.
- Q-76 (open): falling through to the Fairway page for those views was rejected because it would draw Fairway
  inside the Clubhouse frame; rebuilding Development first, then Profile and Standing, is recommended.
- Q-77 (open): a coach's Assign as focus makes a proposal the player accepts. Accept and Decline are built on
  the player's side in Stats Development (CH-5003, CH-5004, CH-5404); this board still has none.

### Found, not fixed

- A coach's gate lookup failure draws "Nothing is flagged in the pulse right now." beside the roster notice: the
  loader returns an empty pulse with no error (130608).
- `?view=deep-dive`, a Fairway view, draws the board and not the not-rebuilt page (130104).
- `docs/clubhouse/phone/coachhelm.md`, "Open questions for the owner", predates the `?view=` guard and the Stats
  Accept and Decline.

### Verification

- See VERIFY.md.
