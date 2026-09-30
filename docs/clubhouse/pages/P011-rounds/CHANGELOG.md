# P011 — Rounds: changelog

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification log and decisions). Every entry is
dated 2026-09-30: the tracker and git show no earlier Rounds work.

## 2026-09-30 — V2 page docs and the contract pass (docs only)

```text
Design package: design/handoff/ v2 (Player - Rounds.html, Player - Rounds - Mobile.html, rounds-*.jsx)
PR/commit:      agent/clubhouse (uncommitted at the time of writing)
Contract IDs:   110101 to 112401 (44 hand contracts, all reserved), on top of the 74 catalog contracts already minted
Actions:        2 (ACT-P011-DISCARD, ACT-P011-TRY-AGAIN)
Data impact:    none
Held items:     none
```

### Changed

- The six page docs, the manifest (`status.docs` current, `status.contract` complete, the two actions) and a sidecar of
  the 44 hand contracts for the registry: the core views (library, review, setup, shot screen), controls that are not
  drawn until their screen is rebuilt, the unfinished and not-counted rounds, search and grouping, the first-run rule,
  the setup's blocker and start form, the nine-hole rule, the distance unit, the qualifier rules, partial reads, offline,
  who may open what, the discard's server gate, success, state kept on failure, Retry and Try again, totals and the
  review's honesty, a stale tee read, axe, the focusable scorecard, the phone builds, Esc, the read order, logging and
  the tests. 32 name a covering test, 12 have none (VERIFY.md lists them).
- The docs say plainly which surfaces are routed (the library and the review) and which are preview only (setup and
  the shot screen, behind `ChSetupPorts` and the round screen's props until the engine move).

### Found, not fixed

- With the flag on, `/rounds/new` and `/rounds/continue/[id]` show the shell's not-rebuilt notice, so a Clubhouse player
  cannot start or continue a round until the engine move (the library correctly draws no control that leads there).
- `rounds/[id]/loading.tsx` is Fairway's, so a Clubhouse review loads under the Fairway skeleton (110206); both
  `error.tsx` files are the shared Fairway boundary.
- A failed team-membership read fails the whole library although only "today" depends on the team.
- The library loader's four reads run one after the other by design (the ready-to-submit check needs the posted list);
  the in-progress query itself does not, so it could start earlier. Noted, not changed.
- Stale prose: the catalog's intro and CH-11801 say the review is not rebuilt; CH-11705's test column says `preview`
  although the tracking test names it; the checklist covers only the library; PROGRESS's "not yet: linking a coach's
  Stats rounds to the review" is done (`StatsPlayer.tsx` links it); `phone/rounds.md` says the card and the season stack
  below 640px, the CSS stacks them below 860px; `ROUNDS_PLAN.md` promises a coach's note, "mark as viewed" and a hole
  handicap that Q-72f and Q-72g left out.
- The tracker's row counts for the shot screen (33) and setup (20) do not match the catalog diffs (32 and 17).

### Why

- The contract pass (D-62, D-69): every category answered, every behaviour named, and every claim checked against the code
  (the review's access rules, what `rebuiltHref` hides, what the loaders read and in which order).

### Verification

- See VERIFY.md.

## 2026-09-30 — Accessibility: axe now scans Rounds (3443098a0)

```text
Design package: design/handoff/ v2 (no board state)
PR/commit:      agent/clubhouse (3443098a0)
Contract IDs:   none new (111809, 111810 and 111811 are recorded in the contract pass above)
Actions:        none
Data impact:    none
Held items:     none
```

### Added

- 12 Rounds preview pages in `CH_A11Y_PAGES` (the library: default, empty, failed; the review: default, coach, no shots;
  setup: default, failed courses; tracking: default, putt, holed, card), scanned at 1280 and 390.

### Fixed (found by axe; the existing tests still pass, 171 of 171 across Hub, the review, the library and tracking)

- **The season and review figures put a sub-line `<span>` straight in a `<dl>`.** The sub-line is now a second `<dd>`,
  styled `dd + dd`.
- **The review's hit and miss marks were `<i aria-label>` with no role.** They are now `role="img"` and read as Hit,
  Missed or Not applicable.
- **The tracking scorecard scrolls sideways with no way to focus it.** It is now a focusable, labelled region
  (`role="region"`, `tabIndex 0`, "Scorecard").

### Why

- `clubhouse:a11y` had never scanned Team Hub, Rounds or Classes; the first run failed 13 of the 26 new entries.

### Verification

- Re-run: hub and rounds 40 of 40 clean at 1280 and 390 (`PROGRESS.md`).

## 2026-09-30 — A new round's setup, preview only (28737755c, fe3c388e8)

```text
Design package: design/handoff/ v2 (rounds-flow.jsx Setup, Picker, HoleConfig; rounds-course.jsx AddCourse)
PR/commit:      agent/clubhouse (28737755c, fe3c388e8)
Contract IDs:   none by hand (catalog rows below; Bridge IDs 110xxx to 111xxx already minted)
Actions:        none registered (preview only)
Data impact:    none
Held items:     none
```

### Added

- `screens/rounds/setup/`: the green band with its steps, the course card, the open qualifier, Round details (type,
  date, holes, which qualifier round), the scorecard (par and yardage per hole, edited holes marked, Front 9 or Back 9),
  the dock with the one thing stopping Start, the course picker (recent, team and library courses, search, tees with
  length, par, rating and slope, draft tees shown but not playable) and Add a course (four steps; the round's own
  course, saved and offered to the library when asked, Q-72h).
- It draws against a neutral contract (`ChSetupPorts`: list courses, list tees, a tee's holes, start), so the engine
  move (ROUNDS_PLAN step 4) only supplies the ports. Every read has its loading and didn't-load state with Try again;
  Start goes through `useAction` with its follow-up inside, so Retry opens the round.
- 17 catalog rows: CH-11007, CH-11107 to CH-11109, CH-11208 to CH-11211, CH-11309 to CH-11312, CH-11403 to CH-11405,
  CH-11510, CH-11511. `round-setup.test.tsx` (19 cases, mutation-checked: 17 of 18 killed; the survivor is equivalent).
  Preview `/clubhouse-preview/setup`.

### Fixed

- **The setup's class prefix was `ch-rs`, which is Roster's, and hid the page on the phone.** It is now `ch-rsu`.
- A new round hides the phone tab bar (`usePhoneTabsHidden`); the date and holes fields stack at 390.

### Why

- Q-72h: a player's "Add a course" is the round's own course (the library's add is coach only), saved by default, and
  the picker's tee cards draw one length bar, not per-hole bars.

### Verification

- See VERIFY.md (real Chromium at 390: the dock read "Finley GC · Blue · 18 holes · Par 72"; axe at 1280 and 390).

## 2026-09-30 — The shot screen, preview only (db0cc6c9c)

```text
Design package: design/handoff/ v2 (rounds-track.jsx, rounds-track.css; the Mobile board's tracking frames)
PR/commit:      agent/clubhouse (db0cc6c9c)
Contract IDs:   none by hand (catalog rows below)
Actions:        none registered (preview only)
Data impact:    none
Held items:     none
```

### Added

- `screens/rounds/track/`: the hole strip, the hole hero with its schematic map and shot log, the live entry (club, putt
  read, result, tee miss, the approach miss grid, putt tags, distance with quick picks, the one-thing-missing hint, the
  plausibility confirm and block, the 15-stroke limit, Undo with its question, Penalty), the holed-out review (saving,
  failed with Try again, change a shot, back to the next hole), and the sheets (penalty, change or delete a shot, leave a
  hole with a result unrecorded). The round's own sheets (Exit with a discard that asks again, Scorecard, Round complete,
  Submitting) are `round-sheets.tsx`, driven by props.
- All logic is the shared `useShotTracking` (the Fairway screen's, moved unchanged; a fresh-context review found no
  must-fix) and `shot-entry-rules` (gained the confirm key, the putt-tag toggle and the edit derivation;
  `editedShotIssues` moved there). Where the board and the engine disagree the engine wins (`phone/rounds.md`, "Tracking:
  board to engine").
- 32 catalog rows: CH-11002 to CH-11006, CH-11101 to CH-11106 (a new validation section), CH-11207, CH-11308, CH-11402,
  CH-11502 to CH-11509, CH-11602, CH-11603, CH-11705 to CH-11707, CH-11805 to CH-11808, CH-11901.
  `round-tracking.test.tsx` (21 cases driving the real hook, mutation-checked: 20 of 21 killed; the survivor is
  equivalent). Preview `/clubhouse-preview/track` with a stand-in round screen.

### Why

- ROUNDS_PLAN "Avoid a third copy": the handlers move into one shared hook before a second screen calls them.

### Verification

- See VERIFY.md (desktop and 390 checked headless; a shot recorded in real Chromium at 390; axe at 1280 and 390).

## 2026-09-30 — A round's review, at /rounds/[id] (4255c15d3, 85ee9559a, 01f228b45)

```text
Design package: design/handoff/ v2 (rounds-review.jsx)
PR/commit:      agent/clubhouse (4255c15d3, with the catalog fix 85ee9559a and the browser-pass fixes 01f228b45)
Contract IDs:   none by hand (catalog rows below)
Actions:        none
Data impact:    none
Held items:     none
```

### Added

- `RoundReview`, `ReviewLoadFailed`, the loader `loadRoundReview` (pure steps in `round-review-shape.ts`) and the route
  `ClubhouseRoundReviewRoute`, for the player who played the round and a coach of their team: the hero, the five figures,
  the card (tap a hole or step for its shots), the scoring distribution, the AI recap and the player's notes. Access
  matches the legacy page; anyone else and a missing round get the same "This round isn't here" (CH-11307); a failed
  membership check says it didn't load rather than "not found"; a round in progress goes to be continued.
- `nav.ts` gained role-scoped rebuilt patterns, so a coach's review is rebuilt without their Rounds library; the
  library's rounds now open their review.
- 8 catalog rows: CH-11204 to CH-11206, CH-11305 to CH-11307, CH-11704, CH-11804. `round-review.test.tsx` (29 cases,
  mutation-checked: 21 of 21 killed after three sharper tests). Preview `/clubhouse-preview/round`.

### Fixed

- The catalog named the wrong test file for the review's rows (85ee9559a).
- Browser pass: the review hero's course name was dark on dark green.

### Why

- Q-72e: the board's review is the round page, so it lives at `/rounds/[id]`; the AI deep review at
  `/rounds/[id]/review` stays with CoachHelm. Q-72f: the card shows the player's own posting notes, and Focus and Keep are
  left out.

### Verification

- See VERIFY.md.

## 2026-09-30 — The library, for players (c8a7302ba, 8835b6794, e04be28ce, 01f228b45)

```text
Design package: design/handoff/ v2 (Player - Rounds.html, rounds-flow.jsx Library)
PR/commit:      agent/clubhouse (c8a7302ba; the plan and Q-72 in 8835b6794 and e04be28ce)
Contract IDs:   none by hand (catalog rows below)
Actions:        none registered then (ACT-P011-DISCARD and ACT-P011-TRY-AGAIN are in the contract pass above)
Data impact:    none
Held items:     none
```

### Added

- `screens/rounds/` (`RoundsLibrary`, `parts`, `writes`, `RoundsSkeleton`), the loader `loadRoundsLibrary` (pure steps in
  `rounds-shape.ts`) and the route `ClubhouseRoundsRoute`; `/golf/dashboard/rounds` rebuilt for players (coaches keep the
  Fairway page). The round in progress (the hole strip from `golf_holes`, the next hole, ready to submit per legacy R8),
  every other unfinished round listed with Discard, the season (countable 18-hole rounds since August 1, the rule Home
  and Stats use), the ribbon, search, and grouping by month or by course.
- Discard is `deleteInProgressRound` then `clearEmergencySave`, with a confirmation and a Retry that finishes the job.
  New round, Continue and a round's review are not drawn until those screens are rebuilt (`nav.rebuiltHref`).
- 17 catalog rows: CH-11001, CH-11201 to CH-11203, CH-11301 to CH-11304, CH-11401, CH-11501, CH-11601, CH-11701 to
  CH-11703, CH-11801 to CH-11803. The catalog `catalog/rounds.md` (page 11), the manifest P011, the checklist
  `screens/rounds.md`, the plan `ROUNDS_PLAN.md` and Q-72. `rounds.test.tsx` (38 cases then, mutation-checked: 20 of
  20 killed after two added tests). Preview `/clubhouse-preview/rounds`.

### Fixed (browser pass, 01f228b45)

- **The hero stacked at a normal desktop width and its hole strip grew 100px cells.** It now stacks below 860px and cells cap
  at 44px.
- **An under-par score label on the ribbon sat on the dates.**
- **The phone ribbon's labels were about 5px.** It now draws the last ten rounds on a narrower canvas.

### Why

- Q-72a to d: no course photos, "50+ stats tracked" becomes a plain list, the hole map is a labelled schematic, and the
  submit overlay names the real shot count. Round entry reuses the hardened engine, so one engine and two renderers until
  the flag flips.

### Verification

- See VERIFY.md.
