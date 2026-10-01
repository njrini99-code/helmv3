# P011 — Rounds: changelog

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification
log and decisions). The first Rounds work is dated 2026-09-30: the tracker and
the history show none earlier.

## 2026-10-01 — Page performance: the library and the review, and why the next hole still waits

Owner, 2026-10-01: "Everything page transition and load needs to be extremely
smooth and accurate." Standard: `docs/clubhouse/PAGE_PERFORMANCE.md`.

```text
PR/commit:      agent/swap-audit: b4842d7de (reads), 8e305ae26 (the saving
                note); the round engines are not changed
Design package: none
Contract IDs:   none changed
Data impact:    none; no write, no cache, no new read
Held items:     none
```

- **Library.** Four serial waves became two (`rounds-reads.test`): the team's
  time zone, the posted rounds and the in-progress card start together, then
  that card's holes. The route resolves the team beside them, not before. The
  completed list reaches the cards only for the "already submitted" check.
- **Review.** The round is read while the team resolves (the team says who is
  looking, not which round), then its holes, shots, tee and team in one wave.
  A viewer with no standing is still "this round isn't here"; the round read
  that ran beside it is that viewer's own RLS read and is dropped unseen.
- **Saving a hole.** "Saving hole N" holds its row from the tap (so nothing
  moves) and shows only once the wait passes a base beat (260ms): a hole that
  saves at once no longer flashes a status.
- **Switching and prefetching.** The library's search and grouping are on the
  page's own data, so they are instant; every row and card is a `<Link>`, so
  Next prefetches the review and the continue page up to their `loading.tsx`.
  No fuller prefetch or cache: a review changes when a round is edited, and the
  edit has no way to clear a client cache.
- **Not changed: the continue page** (`rounds/continue/[id]/page.tsx`, shared
  with Fairway) reads the round, then its holes, shots and course yardages,
  then the putt and approach details, which need the shot ids. Embedding the
  details in the shots read would save one wave, but it is the loader both UIs
  trust with a saved scorecard, so it is left for its own change.

### Why "Complete hole" still waits for the server

Question: can the engine move on to the next hole while the hole's save
finishes in the background? Decision: not without a change to both engines and
the shared shot hook that cannot be shown safe from the existing tests, so it
is not done. The evidence, in the order a change would meet it:

- **What is already safe.** The hole is on the device before any network call
  (`emergencySave` in `handleHoleComplete`), and every save sends the whole
  scorecard (`buildPartialRoundData` reads `completedHoleStatsRef`), so a slow
  or failed save of hole N is carried by the next successful one. By the code
  (not exercised on a device), the next hole's pill is already enabled while
  hole N saves (the engine sets the score locally at the tap and `TrackStrip`
  allows the frontier), so a player is not locked in; the engine's own
  comments (B8) expect it.
- **The engine says to wait.** `persistCompletedHole` opens with "keep the
  player on the hole until this complete snapshot is acknowledged", and
  `handleHoleComplete` moves on (`setCurrentHoleIndex`, the finish prompt,
  `activeProgressHoleRef`, clearing `pendingHoleCheckpointRef`) only after the
  acknowledgement, in `use-new-round-session.ts` and `use-continue-round-
  session.ts`. Moving on at the tap would have to replace each of those.
- **A save in flight is not single-flight.** Between attempts the checkpoint
  loop drops `serverSaveInProgressRef` and sleeps 250ms times the attempt. A
  shot on hole N+1 in that gap sends its own save. With the round's id that is
  safe (every attempt reads the live lock token), but a round that was started
  offline has no id until a save lands, and two saves then both create:
  a second in-progress round. An advance needs one queue across holes, which
  does not exist.
- **One slot for the failure.** `pendingHoleCheckpointRef` holds one hole's
  retry intent and the next `handleHoleComplete` overwrites it. A `hole_invalid`
  answer (a hole the server refuses, which no retry fixes) must send the player
  back to hole N; Retry lives in hole N's review, and the shot hook clears the
  failed status when the hole changes, so a failure on an earlier hole would be
  seen only as a banner.
- **The finish prompt.** `allHolesScored` is decided after the acknowledgement;
  advancing early must still hold the finish and the submit until every hole is
  acknowledged, or the submit races a checkpoint still in flight for the
  round's lock token.
- **Tests.** The guard order is pinned by source-text tests
  (`new-round-client.discard-race.test`, `continue-round-client.*`) and by the
  35 preservation tests; a change needs its own fault-injection tests (offline
  start, slow save, `hole_invalid`, discard during a save, restore) in both
  engines and in Fairway, which shares them.
- **What it would take.** A per-round save queue (one in flight, the next
  coalesced), a list of unsynced holes in place of the single slot, a status
  that says "on this device" for hole N while the player is on hole N+1 (the
  CH-11901 chip already separates device from saved), a failure path that
  returns to the hole, and the finish held until the queue drains. That is a
  design of its own, with the owner's rule 12 (active rounds are durable) as
  its test; it is recommended after the owner has seen the numbers on a phone.

## 2026-10-01 — Round recovery (swap audit F-02)

```text
PR/commit:      agent/swap-audit
Catalog:        CH-11017 to CH-11019, CH-11212, CH-11314, CH-11408,
                CH-11409, CH-11520, CH-11911
Contract IDs:   110209, 110210, 110415, 110629 to 110632, 110712, 111120
Data impact:    none (reads and writes what Fairway's recovery does)
```

- **Issue.** With the flag on, a player could not reach round recovery. The
  engines sent a submit that could not reach the server to `/rounds`, and the
  Library reads server rounds only, so a round saved only on the device was
  invisible and could not be restored.
- **Fix.** `/rounds/recover` is rebuilt for a player. The screen lists the
  rounds the device holds for the signed-in player (recovery journal,
  failed-submit queue, the old database, the emergency save; one card per
  round) and offers Restore (or Submit round for a finished round whose
  submit failed), Retry sync for queue rounds, and Discard after a question.
  The engines' `recover` route is that screen, with `?from=submit`. Restore is
  Fairway's recovery, ported; Discard is the round engines' discard (the
  Library's for a round the server holds), then every device copy and the
  discard mark the round screens and the queue's drain honour. A queued round
  with no round id leaves the player's current new-round draft alone.
- **Changed with it.** CH-11905's toast no longer says to continue from
  Rounds. The rebuilt-routes test now expects recover to be rebuilt.
- **Checked.** rounds-recover.test (the screen, the address, the page, the
  phone) and rounds-recover-ports.test (the scan for the signed-in player
  only, Restore, Retry sync, Discard). Not run: a phone, or a real failed
  submit.

## 2026-09-30 — Strokes gained on a round's review (CH-11313)

```text
PR/commit:      agent/clubhouse
Contract IDs:   none new (catalog CH-11313)
Data impact:    none (reads columns that already exist; no migration)
```

- **Issue.** The review showed the score, the card and the shots but not the
  round's strokes gained, though `golf_rounds` stores the total and the four
  legs.
- **Fix.** The loader selects `strokes_gained_total`, `_tee`, `_approach`,
  `_around_green` and `_putting`, and the player's team gender (a `teamId` on
  the player viewer, the coach's own team) for the baseline. A Strokes gained
  card sits under the figures, on desktop and the phone: the total, then a bar
  per leg either side of zero on a scale the round sets (its largest value
  rounded up, at least 1), "vs Tour" (the women's Tour baseline for a women's
  team), "9 holes" first for a nine-hole round. A round with none reads one
  line, "No strokes gained for this round. It is worked out from shots tracked
  hole by hole." (CH-11313); a leg with no value is a dash.
- **Checked.** strokes-gained.test (the loader only shapes strokes gained when
  the select names the columns, the card, the no-strokes-gained line, the
  women's and nine-hole labels); mutations caught: a dropped column, the card
  always hidden.

## 2026-09-30 — Round entry over the round engine: /rounds/new and /rounds/continue/[id]

```text
PR/commit:      agent/clubhouse (draft #2102, stacked on #2104)
Contract IDs:   110114 and 111404 (hand); CH-11014 to CH-11016, CH-11407, CH-11518, CH-11519 and CH-11903 to CH-11910 (catalog, 14 minted)
Actions:        5 new (ACT-P011-START, -SAVE-FOR-LATER, -DISCARD-ROUND, -SAVE-AS-PRACTICE, -SUBMIT-ROUND)
Data impact:    none (no migration; the engine and the server actions it calls are not edited)
Held items:     none
```

- **Issue.** Setup, the shot screen and the round-entry states were built, and
  #2104 moved the round engines into `src/lib/golf/round-session/`, but no route
  drew them. A Clubhouse player opening `/rounds/new` or `/rounds/continue/[id]`
  got the shell's not-rebuilt notice, and the library, Home and CoachHelm drew
  no New round, Start a round, Continue or Post a round control, so a player
  with the flag on could not start or continue a round.
- **Fix.** Both pages branch on `isClubhouseFor('player')` and render
  `ClubhouseNewRoundRoute` and `ClubhouseContinueRoundRoute`; flag off (and a
  coach on `/rounds/new`) keeps Fairway's client exactly as it was. Both
  addresses are in the shell's rebuilt list for a player (`nav.ts`), so every
  link to them is drawn. `NewRound` runs `useNewRoundSession` and
  `ContinueRound` runs `useContinueRoundSession`; `RoundRuntime` draws the shot
  screen and every sheet from one normalised session. Every engine outcome has a
  Clubhouse state: a saved round to recover (CH-11512, Restore guarded against a
  second tap), a round already in progress (CH-11514, resume or start a new one
  after a discard question), a qualifier round in progress that opens
  (CH-11907), a start refused (CH-11007 Retry, CH-11014 none, CH-11015 Retry,
  CH-11016 Start anyway), offline refusals (CH-1903), a reload (CH-11902),
  engine notices (CH-11903 to CH-11908), a closed qualifier that opens Save as
  practice (CH-11516, CH-11012) and its Discard (CH-11517, CH-11011), Save for
  later and Discard failures with Retry (CH-11010, CH-11006), a slow submit
  (CH-11909), a finish sheet closed with every hole in (CH-11910), the qualifier
  round number question (CH-11518, CH-11519) and the route skeleton (CH-11407).
  A Retry runs the action against the round as it is now and never twice
  (111404): each action holds its own in-flight ref and reads the latest engine
  through a ref, because the toast's closure carries an older render.
  `useAction` gained `quiet`, `retry` and `offline`, and its gate against a
  second run is a ref instead of the render's `pending` (shared by every
  Clubhouse screen); `SubmitOverlay` gained Go back and the slow line.
- **Checked.** `typecheck:fast` exit 0; `eslint` on the changed files exit 0;
  `vitest run src/clubhouse` 28 files, 1413 of 1413; the engine and page tests
  (35 files, 436) exit 0, unedited; `next build --webpack` exit 0 (9 GB heap);
  `clubhouse:check` exit 0 after `registry.mjs sync`; `docs:check` exit 0 after
  `knowledge:doc-inventory`. New tests drive the real engines over mocked server
  actions (`round-entry-wiring`, `round-entry-continue`) and the pages with the
  flag on and off (`round-entry-routes`); 19 mutations of the wiring were run
  (18 killed, one equivalent after a refactor), and the test written to kill one
  of them found a real bug (a lost post timer). Existing Rounds, CoachHelm, Home
  and review tests were updated in place for the now-drawn links, not weakened.
  **Not checked:** a browser on the routed addresses (the flag was not flipped),
  a live account, an iPhone, `/rounds/recover` (still Fairway's, nothing links
  to it).

## 2026-09-30 — Phone tap targets

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

- **Issue.** The review's previous and next hole (30px), the unfinished round's
  discard (38px), the shot screen's pills (36px) and setup's Back (34px) were
  under 44pt on the phone.
- **Fix.** Each gets an invisible 44 x 44 hit area without changing how it is
  drawn (`rounds.css`, `rounds-track.css`, `rounds-setup.css`). Left as they
  are: the nine-across hole strip and the scorecard's hole cells (nine 44pt
  columns do not fit in 390pt, and the whole column picks the hole).
- **Checked.** scripts/clubhouse/native.mjs at 390 and 430px.

## 2026-09-30 — Round entry states (Q-81); A tap on a score picks the hole (Clickables gap 7); Cancel on Add a course (Clickables gap 24)

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

### Round entry states (Q-81)

- **Issue.** The live round flow has four states the /rounds boards do not draw:
  a saved round to recover, a round already in progress on the same course and
  day, a reload, and a qualifier that closed during the round.
- **Fix.** RecoveryDialog, InProgressConflictDialog, ReloadBanner and
  RoundErrorBanner, SaveAsPracticeSheet and the Save for later / Discard failure
  toasts, as Clubhouse components; Discard now asks first everywhere. Engine
  wiring waits on #2104 (stacked, Q-81). Preview /clubhouse-preview/entry.
- **Checked.** round-entry 38/38, 57 mutations killed. Not viewed in a browser.

### A tap on a score picks the hole (Clickables gap 7)

- **Issue.** In the round review's card only the hole number picked a hole.
- **Fix.** A tap on a score picks that hole too, with the select haptic (pointer
  only; the hole number stays the keyboard control; Tot picks nothing).
- **Checked.** round-review 31/31, the mutation caught.

### Cancel on Add a course (Clickables gap 24)

- **Issue.** Closing Add a course dropped the coach out of the course picker.
- **Fix.** Cancel goes back to the picker it was opened from, as on the board
  (preview only until #2104).
- **Checked.** round-setup 20/20, the mutation caught.

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

- The six page docs, the manifest (`status.docs` current, `status.contract`
  complete, the two actions) and a sidecar of the 44 hand contracts for the
  registry: the core views (library, review, setup, shot screen), controls that
  are not drawn until their screen is rebuilt, the unfinished and not-counted
  rounds, search and grouping, the first-run rule, the setup's blocker and start
  form, the nine-hole rule, the distance unit, the qualifier rules, partial
  reads, offline, who may open what, the discard's server gate, success, state
  kept on failure, Retry and Try again, totals and the review's honesty, a stale
  tee read, axe, the focusable scorecard, the phone builds, Esc, the read order,
  logging and the tests. 32 name a covering test, 12 have none (VERIFY.md lists
  them).
- The docs say plainly which surfaces are routed (the library and the review)
  and which are preview only (setup and the shot screen, behind `ChSetupPorts`
  and the round screen's props until the engine move).

### Found, not fixed

- With the flag on, `/rounds/new` and `/rounds/continue/[id]` show the shell's
  not-rebuilt notice, so a Clubhouse player cannot start or continue a round
  until the engine move (the library correctly draws no control that leads
  there).
- `rounds/[id]/loading.tsx` is Fairway's, so a Clubhouse review loads under the
  Fairway skeleton (110206); both `error.tsx` files are the shared Fairway
  boundary.
- A failed team-membership read fails the whole library although only "today"
  depends on the team.
- The library loader's four reads run one after the other by design (the
  ready-to-submit check needs the posted list); the in-progress query itself
  does not, so it could start earlier. Noted, not changed.
- Stale prose: the catalog's intro and CH-11801 say the review is not rebuilt;
  CH-11705's test column says `preview` although the tracking test names it; the
  checklist covers only the library; PROGRESS's "not yet: linking a coach's
  Stats rounds to the review" is done (`StatsPlayer.tsx` links it);
  `phone/rounds.md` says the card and the season stack below 640px, the CSS
  stacks them below 860px; `ROUNDS_PLAN.md` promises a coach's note, "mark as
  viewed" and a hole handicap that Q-72f and Q-72g left out.
- The tracker's row counts for the shot screen (33) and setup (20) do not match
  the catalog diffs (32 and 17).

### Why

- The contract pass (D-62, D-69): every category answered, every behaviour
  named, and every claim checked against the code (the review's access rules,
  what `rebuiltHref` hides, what the loaders read and in which order).

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

- 12 Rounds preview pages in `CH_A11Y_PAGES` (the library: default, empty,
  failed; the review: default, coach, no shots; setup: default, failed courses;
  tracking: default, putt, holed, card), scanned at 1280 and 390.

### Fixed (found by axe; the existing tests still pass, 171 of 171 across Hub, the review, the library and tracking)

- **The season and review figures put a sub-line `<span>` straight in a
  `<dl>`.** The sub-line is now a second `<dd>`, styled `dd + dd`.
- **The review's hit and miss marks were `<i aria-label>` with no role.** They
  are now `role="img"` and read as Hit, Missed or Not applicable.
- **The tracking scorecard scrolls sideways with no way to focus it.** It is now
  a focusable, labelled region (`role="region"`, `tabIndex 0`, "Scorecard").

### Why

- `clubhouse:a11y` had never scanned Team Hub, Rounds or Classes; the first run
  failed 13 of the 26 new entries.

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

- `screens/rounds/setup/`: the green band with its steps, the course card, the
  open qualifier, Round details (type, date, holes, which qualifier round), the
  scorecard (par and yardage per hole, edited holes marked, Front 9 or Back 9),
  the dock with the one thing stopping Start, the course picker (recent, team
  and library courses, search, tees with length, par, rating and slope, draft
  tees shown but not playable) and Add a course (four steps; the round's own
  course, saved and offered to the library when asked, Q-72h).
- It draws against a neutral contract (`ChSetupPorts`: list courses, list tees,
  a tee's holes, start), so the engine move (ROUNDS_PLAN step 4) only supplies
  the ports. Every read has its loading and didn't-load state with Try again;
  Start goes through `useAction` with its follow-up inside, so Retry opens the
  round.
- 17 catalog rows: CH-11007, CH-11107 to CH-11109, CH-11208 to CH-11211,
  CH-11309 to CH-11312, CH-11403 to CH-11405, CH-11510, CH-11511.
  `round-setup.test.tsx` (19 cases, mutation-checked: 17 of 18 killed; the
  survivor is equivalent). Preview `/clubhouse-preview/setup`.

### Fixed

- **The setup's class prefix was `ch-rs`, which is Roster's, and hid the page on
  the phone.** It is now `ch-rsu`.
- A new round hides the phone tab bar (`usePhoneTabsHidden`); the date and holes
  fields stack at 390.

### Why

- Q-72h: a player's "Add a course" is the round's own course (the library's add
  is coach only), saved by default, and the picker's tee cards draw one length
  bar, not per-hole bars.

### Verification

- See VERIFY.md (real Chromium at 390: the dock read "Finley GC · Blue · 18
  holes · Par 72"; axe at 1280 and 390).

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

- `screens/rounds/track/`: the hole strip, the hole hero with its schematic map
  and shot log, the live entry (club, putt read, result, tee miss, the approach
  miss grid, putt tags, distance with quick picks, the one-thing-missing hint,
  the plausibility confirm and block, the 15-stroke limit, Undo with its
  question, Penalty), the holed-out review (saving, failed with Try again,
  change a shot, back to the next hole), and the sheets (penalty, change or
  delete a shot, leave a hole with a result unrecorded). The round's own sheets
  (Exit with a discard that asks again, Scorecard, Round complete, Submitting)
  are `round-sheets.tsx`, driven by props.
- All logic is the shared `useShotTracking` (the Fairway screen's, moved
  unchanged; a fresh-context review found no must-fix) and `shot-entry-rules`
  (gained the confirm key, the putt-tag toggle and the edit derivation;
  `editedShotIssues` moved there). Where the board and the engine disagree the
  engine wins (`phone/rounds.md`, "Tracking: board to engine").
- 32 catalog rows: CH-11002 to CH-11006, CH-11101 to CH-11106 (a new validation
  section), CH-11207, CH-11308, CH-11402, CH-11502 to CH-11509, CH-11602,
  CH-11603, CH-11705 to CH-11707, CH-11805 to CH-11808, CH-11901.
  `round-tracking.test.tsx` (21 cases driving the real hook, mutation-checked:
  20 of 21 killed; the survivor is equivalent). Preview
  `/clubhouse-preview/track` with a stand-in round screen.

### Why

- ROUNDS_PLAN "Avoid a third copy": the handlers move into one shared hook
  before a second screen calls them.

### Verification

- See VERIFY.md (desktop and 390 checked headless; a shot recorded in real
  Chromium at 390; axe at 1280 and 390).

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

- `RoundReview`, `ReviewLoadFailed`, the loader `loadRoundReview` (pure steps in
  `round-review-shape.ts`) and the route `ClubhouseRoundReviewRoute`, for the
  player who played the round and a coach of their team: the hero, the five
  figures, the card (tap a hole or step for its shots), the scoring
  distribution, the AI recap and the player's notes. Access matches the legacy
  page; anyone else and a missing round get the same "This round isn't here"
  (CH-11307); a failed membership check says it didn't load rather than "not
  found"; a round in progress goes to be continued.
- `nav.ts` gained role-scoped rebuilt patterns, so a coach's review is rebuilt
  without their Rounds library; the library's rounds now open their review.
- 8 catalog rows: CH-11204 to CH-11206, CH-11305 to CH-11307, CH-11704,
  CH-11804. `round-review.test.tsx` (29 cases, mutation-checked: 21 of 21 killed
  after three sharper tests). Preview `/clubhouse-preview/round`.

### Fixed

- The catalog named the wrong test file for the review's rows (85ee9559a).
- Browser pass: the review hero's course name was dark on dark green.

### Why

- Q-72e: the board's review is the round page, so it lives at `/rounds/[id]`;
  the AI deep review at `/rounds/[id]/review` stays with CoachHelm. Q-72f: the
  card shows the player's own posting notes, and Focus and Keep are left out.

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

- `screens/rounds/` (`RoundsLibrary`, `parts`, `writes`, `RoundsSkeleton`), the
  loader `loadRoundsLibrary` (pure steps in `rounds-shape.ts`) and the route
  `ClubhouseRoundsRoute`; `/golf/dashboard/rounds` rebuilt for players (coaches
  keep the Fairway page). The round in progress (the hole strip from
  `golf_holes`, the next hole, ready to submit per legacy R8), every other
  unfinished round listed with Discard, the season (countable 18-hole rounds
  since August 1, the rule Home and Stats use), the ribbon, search, and grouping
  by month or by course.
- Discard is `deleteInProgressRound` then `clearEmergencySave`, with a
  confirmation and a Retry that finishes the job. New round, Continue and a
  round's review are not drawn until those screens are rebuilt
  (`nav.rebuiltHref`).
- 17 catalog rows: CH-11001, CH-11201 to CH-11203, CH-11301 to CH-11304,
  CH-11401, CH-11501, CH-11601, CH-11701 to CH-11703, CH-11801 to CH-11803. The
  catalog `catalog/rounds.md` (page 11), the manifest P011, the checklist
  `screens/rounds.md`, the plan `ROUNDS_PLAN.md` and Q-72. `rounds.test.tsx` (38
  cases then, mutation-checked: 20 of 20 killed after two added tests). Preview
  `/clubhouse-preview/rounds`.

### Fixed (browser pass, 01f228b45)

- **The hero stacked at a normal desktop width and its hole strip grew 100px
  cells.** It now stacks below 860px and cells cap at 44px.
- **An under-par score label on the ribbon sat on the dates.**
- **The phone ribbon's labels were about 5px.** It now draws the last ten rounds
  on a narrower canvas.

### Why

- Q-72a to d: no course photos, "50+ stats tracked" becomes a plain list, the
  hole map is a labelled schematic, and the submit overlay names the real shot
  count. Round entry reuses the hardened engine, so one engine and two renderers
  until the flag flips.

### Verification

- See VERIFY.md.
