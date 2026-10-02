# P011 — Rounds: verification

Only what was observed. Gates are in `docs/clubhouse/PROGRESS.md`; the per-gate
checklist is `docs/clubhouse/screens/rounds.md` (it still reads "This covers the
library" and its boxes are not brought current for Review, Setup and Tracking;
see the gaps below).

## What is live, and what is preview only

| Surface | Routed | What was observed |
| --- | --- | --- |
| Library `/golf/dashboard/rounds` | yes (player, behind `golf_clubhouse_ui`) | unit tests, the dev preview, headless Chromium at 1280 and 390, axe |
| Review `/golf/dashboard/rounds/[id]` | yes (player and coach, behind the flag) | unit tests, the dev preview, headless Chromium at 1280 and 390, axe |
| Setup `/golf/dashboard/rounds/new` | yes (player, behind `golf_clubhouse_ui`) | unit tests with the **real new-round engine** and the real setup over mocked server actions (`round-entry-wiring.test`), the page's flag gate (`round-entry-routes.test`), the dev preview (fake ports), real Chromium at 390 on the preview (the dock read "Finley GC · Blue · 18 holes · Par 72"), axe on the preview |
| Shot screen `/golf/dashboard/rounds/new` and `/rounds/continue/[id]` | yes (player, behind the flag) | unit tests with the real new-round and continue engines driving the real `RoundRuntime` (a stub `RoundTracking` in the wiring tests; the real one in `round-tracking.test`), the dev preview, real Chromium at 390 on the preview (a shot was recorded), axe on the preview |

Round entry has been run against the round engine in unit tests, and its pages against a faked Supabase. It has **not**
been seen in a browser on its routed addresses (the flag is off and was not flipped for this work), run against a live
account, or run on an iPhone.

## Current verification status

```text
Status:     partial
Commit/PR:  agent/clubhouse (draft PR #2102, stacked on #2104): round entry wiring, local commit, not pushed
Date:       2026-09-30
```

## Static checks

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run -s typecheck:fast` | exit 0 |
| Lint | `npx eslint` on every source and test file this work changed (the entry folder, the routes, the pages, `nav.ts`, `use-action.ts`, setup's `shape.ts` and `RoundSetup.tsx`, `round-sheets.tsx`, the skeleton, the fixtures and the touched tests) | exit 0, no warnings on the new files (two older warnings remain in `round-sheets.tsx`, `tabIndex` on the scorecard region, and `round-review.test.tsx`, a `role` prop on a test helper) |
| Clubhouse check | `npm run -s clubhouse:check` after `node scripts/clubhouse/registry.mjs sync` (1079 Bridge IDs, 0 new) | exit 0, 281 files |
| Knowledge check | `npm run -s docs:check` | exit 0 after `npm run knowledge:doc-inventory` regenerated `DOCUMENT_AUTHORITY_INVENTORY.md` (the files this work adds count as tracked only once committed) |
| Build | `next build --webpack` (what `npm run build` runs), with a 9 GB heap under a memory watchdog | exit 0, compiled in 6.7 min, both routes in the route table (`ƒ /golf/dashboard/rounds/new`, `ƒ /golf/dashboard/rounds/continue/[id]`). A first attempt with a 6 GB heap ran out of memory before compiling. Run on the tree before the last `useAction` edit (the gate became a ref); no `'use server'` file changed |

## Automated tests

| Test | Contract | Result |
| --- | --- | --- |
| `src/clubhouse/__tests__/rounds.test.tsx` (54 cases) | the library's catalog rows it names (CH-11001, CH-11201 to CH-11203, CH-11214, CH-11215, CH-11301 to CH-11304, CH-11315, CH-11401, CH-11501, CH-11701 to CH-11703, CH-11801 to CH-11803), and by phrase hand contracts 110101, 110105 to 110108, 110413, 110619, 110801, 110901, 111301, 111401, 111402, 111501, 111811, 111902, 112301; since 2026-10-01 also the false empties (a failed list or holes read, a finished round with an unread posted list, rounds with no score, a Try again that lands) | pass |
| `src/clubhouse/__tests__/round-review.test.tsx` (43 cases) | CH-11204 to CH-11206, CH-11216, CH-11217, CH-11305 to CH-11307, CH-11704, CH-11804, and by phrase 110102, 110105, 110109, 110619, 110801, 110802, 111402, 111501, 111502, 111811, 112301; since 2026-10-01 the missing total (never 0 strokes), the tee, player-name and team reads that failed, and the hole re-picked after a retry | pass |
| `src/clubhouse/__tests__/round-setup.test.tsx` (19 cases) | CH-11007, CH-11107 to CH-11109, CH-11208 to CH-11211, CH-11309 to CH-11312, CH-11403, CH-11510, CH-11511, and by phrase 110103, 110110, 110111, 110113, 110510, 110805, 111401, 111402, 111503 | pass |
| `src/clubhouse/__tests__/round-tracking.test.tsx` (21 cases) | CH-11002, CH-11003, CH-11005, CH-11101 to CH-11104, CH-11106, CH-11308, CH-11402, CH-11502 to CH-11509, CH-11603, CH-11705, CH-11805, and by phrase 110104, 110112, 110902, 111403 | pass |
| `src/lib/golf/__tests__/shot-entry-rules.test.ts` (11 cases) | the shared rules behind CH-11101 to CH-11106 and the edit sheet's rules | pass |
| `src/clubhouse/__tests__/round-entry.test.tsx` (38 cases) | the entry-state components (Q-81): CH-11008 to CH-11013, CH-11512 to CH-11517, CH-11708, CH-11709, CH-11902 | pass |
| `src/clubhouse/__tests__/round-entry-wiring.test.tsx` (27 cases) | the **real new-round engine** behind the real setup, over mocked server actions: CH-11007, CH-11014 to CH-11016, CH-11907, CH-11514, CH-11515, CH-11009, CH-1903, CH-11512, CH-11008, CH-11513, CH-11010, CH-11006, CH-11902, CH-11013, CH-11516, CH-11012, CH-11517, CH-11407; and by phrase 110103, 110110, 110113, 111404 | pass |
| `src/clubhouse/__tests__/round-entry-continue.test.tsx` (8 cases) | the **real continue engine**: CH-11512, CH-11513, CH-11010, CH-11902, CH-11006, CH-11518, CH-11519, CH-11516, CH-11012 | pass |
| `src/clubhouse/__tests__/round-entry-routes.test.tsx` (33 cases) | the rebuilt list and the library's links (110105, 110109), the two pages' flag gate and the loading switch (110114, flag on and off, through a faked Supabase), `useAction`'s options and its gate (a run kept from a render that saw the action pending still runs, and two calls in one tick run it once: 111404), the setup reads (`toStartForm`, `startRefusal`: CH-11014 to CH-11016, CH-11907, CH-11208 to CH-11211, CH-11311), the engine's notices (CH-11903 to CH-11908), `RoundRuntime` over a fake session (CH-11909, CH-11910, CH-11603 and 110902 once, CH-11902) | pass |

The four library, review, setup and tracking files were run together with the whole Clubhouse suite in this pass:
`npx vitest run src/clubhouse`, exit 0, 28 files, 1413 of 1413 tests (the suite also holds other pages' files).
The engine's own tests and the pages' source-text tests were run as well: `src/lib/golf/round-session`, the
`rounds/new` and `rounds/continue` client tests, `round-start-guard-signal`, `new-round-setup-restore-signal`,
`nav-registry`, `id-pages-validate-uuid`, `golf-conditional-redirect`, `error-logging` and the recover page's test,
35 files, 436 of 436, exit 0; none of the engine files was edited.

**Mutations (round entry).** Each was applied to the source, the tests that should catch it were run, and the source
was put back (a backup and restore script, not committed). All killed: a start refused as in_progress_exists drawn as a
failed start; the conflict dialog not opening after the discard question; the Start port reading the engine of an
earlier render; no in-flight guard on Save for later; engine errors drawn instead of captured (double message); one
conflict wording for both engines; the closed-qualifier sheet not opening; a qualifier round in progress not opening;
no offline check on Start; useAction gating on the render's `pending` instead of a ref (two tests); no guard on Restore; state-reported failures not picked up; the round's review not opened
after a post (equivalent after a refactor: the guard moved into the effect's deps); the player's `/rounds/continue`
pattern removed from the shell; Continue's Submit bypassing the qualifier round number; each page's flag gate (flag
on, flag off, the coach's message); a handled refusal drawing a toast; a final refusal keeping Retry. One was found
to be a real bug by the test written to kill it (the round-posted timer was lost when the router's identity changed)
and fixed. Not run: the qualifier preselect effect. One test (CH-11517) failed only when the machine was busy: the
toast stack moves into whichever dialog is open and re-creates its buttons, so a click on a button just replaced did
nothing; the test now clicks the Retry that is there until the discard has run again, and the describe that plays a
whole round has a 20 s timeout. It passed 5 of 5 under five parallel runs after that.

The earlier tracker record of mutations stands for the other files (`PROGRESS.md`, 2026-09-30): 20 of 20 on the library,
21 of 21 on the review, 17 of 18 on setup (the survivor, the tee list's stale-read guard, is unreachable
by going back, which remounts the list) and 20 of 21 on the shot screen (the survivor, the quick pick's unit dispatch,
is equivalent: the engine derives the stored unit).

**Contracts a test covers, and those it does not.** Of the 46 hand contracts, 34 are `implemented`: every test file each
lists names its Bridge ID in a title (the 32 of the contract pass, plus 110114 `ROUND_ENTRY_FOLLOWS_THE_FLAG` and 111404
`A_RETRY_RUNS_THE_ROUND_AS_IT_IS_NOW`, both proved by the round-entry tests). 110103, 110104, 110105, 110109, 110110,
110902 and 112401 gained round-entry test files. **12 stay `reserved` with no covering test**: 110206 (the review's
skeleton, not built), 110702 (offline: round entry's Start and Save for later are forced, the library's Discard and the
hole's Try again are not), 110803 and 110804 (the player filter and the server action's checks, read not run), 111201
and 111202 (a failed Start keeps the setup; a failed hole save keeps the shots), 111809 (axe, a script), 111810 (the
scorecard's focusable region), 111901 and 111903 (the phone builds), 112001 (Esc) and 112101 (the read order). The
catalog rows are the other contracts; those marked `preview` name no test: CH-11004, CH-11105, CH-11207, CH-11404,
CH-11405, CH-11601, CH-11602, CH-11705, CH-11706, CH-11707, CH-11806, CH-11807, CH-11808 and CH-11901. CH-11006 is forced
by round entry's tests and its row now names them. CH-11601 stays `reserved` in the registry because its code string is only in `rounds.css`
(the registry scans `.ts` and `.tsx`).

A hand contract that lists more than one test file becomes `implemented` only when every listed file carries its Bridge ID.

## Visual verification

### Desktop

```text
Viewport:  1280px (dev preview: /clubhouse-preview/rounds, /round, /setup, /track), logged 2026-09-30 in PROGRESS.md
Reference: design/handoff/Player - Rounds.html and the rounds-*.jsx boards
Result:    library and review: matched after the 2026-09-30 browser pass (headless Chromium; the Chrome extension was not
           connected), which fixed the hero stacking at a normal width, an under-par label on the ribbon sat on the dates,
           and the review hero's course name dark on dark green. Tracking: "desktop and 390px checked headless". Setup:
           driven in Chromium at 390; a side-by-side against the board at 1280 is not recorded. The checklist's "matches
           the reference at 924px and at 1280px or wider" box is still unticked.
```

### Phone

```text
Viewport:     390px (headless Chromium, 2026-09-30); the library, the review, setup and the shot screen were seen at 390.
              Setup and tracking were driven in real Chromium at 390: a shot was recorded on the shot screen, and the
              setup dock read "Finley GC · Blue · 18 holes · Par 72".
Device/shell: not on a real iPhone (npm run ios:dev, owner). The iOS number pad has no Done key yet (the Fairway screen
              adds a bar for it). Swipe-back with a sheet open and the haptics were not felt.
Reference:    design/handoff/Player - Rounds - Mobile.html
Result:       built to the approved spec and seen at 390; 430px is not recorded as checked; the iPhone pass is open
```

## Forced states

| State | Contract | How forced | Observed result |
| --- | --- | --- | --- |
| Skeleton | CH-11401 | test (the route skeleton) | a page-shaped skeleton that says it is loading. The review has none of its own (110206) |
| Empty | CH-11301 to CH-11312, 110413 | tests, `?state=empty`, `noseason`, setup fixtures | distinct from a failed read; the first-run page needs every read answered |
| Validation | CH-11101 to CH-11104, CH-11106 to CH-11109, 110510 | tests | one thing named beside the disabled control; nothing sent |
| Server failure | CH-11001, CH-11002, CH-11003, CH-11005, CH-11007, CH-11201 to CH-11206, CH-11208 to CH-11211 | tests, `?state=failed`, `unfinished-failed`, `failwrites`, `failcourses`, `checkpointfail`, `submitfail` | toast or notice with its code; the card stays; Try again asks again |
| Failure, preview only | CH-11004, CH-11207 | preview only | not forced by a test |
| Retry | 111401 to 111403 | tests | Discard's Retry removes the card, Start's Retry opens the round, a hole save and a submit run again |
| Offline | 110702, CH-1903 | `round-entry-wiring.test` (Start, Save for later) | round entry's Start and Save for later send nothing and say so; a browser that says offline but reaches the server goes ahead. **Not observed**: the library's Discard and the hole's Try again offline, and no browser run went offline |
| Permission | 110801, 110802, 110805 | tests | a coach renders nothing on the library; another player's or a missing round is one "not here" page; a closed qualifier can't be chosen |
| Permission, read only | 110803, 110804 | read, not run | reserved: no test forces the player filter or the server action's refusals |
| Partial read | 110619 | tests | each failed read flags only its part; the rest renders |
| Destructive | CH-11501, CH-11502, CH-11504, CH-11505, CH-11507 | tests | asks first; the card leaves only when the server has deleted it |
| Optimistic | n/a | n/a | nothing on the page is optimistic (111301) |
| Round entry: recovery | CH-11512, CH-11513, CH-11008 | `round-entry-wiring.test`, `round-entry-continue.test` (a device copy newer than the server's) | Restore writes the round once (two quick taps, one write); a failed restore stays in the dialog; Discard saved shots asks first and removes only the device copy |
| Round entry: a round already in progress | CH-11514, CH-11515, CH-11009, CH-11907 | `round-entry-wiring.test` | resume opens that round; Start a new round keeps it and starts another; Discard asks, then deletes it and starts this one; a qualifier round in progress opens instead of failing |
| Round entry: a start refused | CH-11007, CH-11014 to CH-11016, CH-1903 | `round-entry-wiring.test` | a toast with Retry (a server rejection, an unverified qualifier), none (a qualifier no longer open), or Start anyway (a completed round on that course and day); offline sends nothing, and a browser that says offline but reaches the server goes ahead |
| Round entry: Save for later and Discard fail | CH-11010, CH-11006, CH-11011 | `round-entry-wiring.test`, `round-entry-continue.test` | one toast with Retry (never the engine's own toast too); Retry saves with the round as it is now and never twice (111404); a failed Discard stays in its question with the reason |
| Round entry: reload | CH-11902 | `round-entry-wiring.test`, `round-entry-continue.test` | a save refused for a round changed elsewhere is the Reload toast and banner, with no Retry |
| Round entry: a closed qualifier | CH-11516, CH-11517, CH-11012, CH-11906, CH-11011 | `round-entry-wiring.test`, `round-entry-continue.test` | Submit opens Save as practice with the server's sentence (never CH-11005); a failed change stays on the sheet; Discard asks first and its failure is a toast with Retry |
| Round entry: submit | CH-11005, CH-11603, CH-11905, CH-11909, 110902 | `round-entry-routes.test` (a fake session), the engines | posted ticks the haptic once and opens the review after 2.5 s; a submit that could not reach the server says it is saved on this device and opens Rounds; slow after 15 s says so |
| Round entry: skeleton | CH-11407 | tests (the loading switch, the skeleton before the day and the qualifiers are read) | a page-shaped skeleton in the shell; Fairway's with the flag off |
| Round entry routes, flag on and off | 110114 | `round-entry-routes.test` | flag on: Clubhouse's screens (player); flag off and a coach: Fairway's client and the legacy message, as before |
| The rebuilt list and the library's links | 110105, 110109 | `round-entry-routes.test`, `rounds.test` | New round, Start a round and Continue are drawn for a player and never for a coach; `/rounds/recover` is rebuilt (F-02) and not linked from the Library |
| Round recovery (F-02) | CH-11017 to CH-11019, CH-11212, CH-11314, CH-11408, CH-11409, CH-11520, CH-11911 | `rounds-recover.test`, `rounds-recover-ports.test` | the device's rounds listed for the signed-in player only; Restore opens the round (or its review), Retry sync asks the sync engine, Discard asks first and clears every copy and marks the round; the recover address is rebuilt and where the engines send a failed submit |

## Accessibility

```text
Axe:            clubhouse:a11y (scripts/clubhouse/a11y.mjs, CH_A11Y_PAGES) scans 12 Rounds preview pages at 1280 and 390
                (24 scans). The pages: /clubhouse-preview/rounds, rounds?state=empty, rounds?state=failed; round,
                round?state=coach, round?state=noshots; setup, setup?state=failcourses; track, track?state=putt,
                track?state=holed, track?state=card. The first run on 2026-09-30 failed 13 of the 26 newly added entries (Hub
                and Rounds); the Rounds fixes were the season and review figures (a sub-line span straight in a dl, now a second dd), the review's
                hit and miss marks (an aria-label on an i with no role, now role="img"), and the tracking scorecard (it scrolls
                sideways with no focus, now a focusable, labelled region). Re-run: hub and rounds 40 of 40 clean (the figures
                were also checked by eye at 1280). Not scanned: the other preview states, every open sheet (the picker, Add a
                course, penalty, change a shot, leave this shot, exit, scorecard, round complete), the setup states with a
                course picked, and the tracking states not listed. 111809 stays reserved: it is a script, not a test.
Keyboard:       links and buttons are native; every sheet is a native dialog (Esc closes it, focus returns to its opener),
                but no P011 test presses Esc (112001). Not built: arrow keys inside the radio groups (each choice is a Tab
                stop) and the number pad's Done bar on iOS. A full keyboard walk at 1280 and 390 is open.
VoiceOver:      not tried on a device.
Focus:          nothing is submitted with a mistake, so there is no first-invalid-field rule to meet; the checklist's row is
                open.
Reduced motion: rounds-track.css turns off the log chevron, the choice buttons' fade and the spinner (`prefers-reduced-motion`);
                the spinner also stops through `useChReducedMotion`. Not exercised with the setting on.
Contrast:       part of the axe run above on the pages listed; nothing else checked.
Text scaling:   not checked.
```

## Performance

```text
Layout shift:      not measured
Request waterfall: none on the client. The library loader reads in two passes (rounds-reads.test, 2026-10-01; it was
                   four): the team's time zone, the posted rounds (paged) and the in-progress rounds start together, then
                   the in-progress rounds' holes (112101). The route resolves the team beside them, not before. A round's
                   review reads the round while the team resolves, then its holes, shots, tee and team together. The
                   continue page (shared with Fairway) reads the round, then its holes, shots and course yardages, then the
                   putt and approach details, which wait on the shot ids; not changed.
Large list:        the book draws every posted round (a paged read, no windowing); not measured
Animation:         the shell's tokens only
Notes:             first-load JS and LCP (CH-1954) are open
```

## Strokes gained on the review (2026-09-30)

| Check | Command | Result |
| --- | --- | --- |
| Tests | `npx vitest run src/clubhouse/__tests__/strokes-gained.test.tsx src/clubhouse/__tests__/round-review.test.tsx` | pass; the loader test answers with strokes gained only when the select names the columns |
| Clubhouse | `npm run -s clubhouse:check` | clean |
| Axe | `node scripts/clubhouse/a11y.mjs rounds` (includes `/clubhouse-preview/round?state=nosg`) | clean |
| Native-feel | `native.mjs rounds` | the hole-number buttons (30 x 28) are the known exception; nothing new |

## Owner rules of 2026-10-01 (page states)

Four new test files hold these (the library, review and setup cases that
changed are in `rounds.test`, `round-review.test` and the rows above):

- `rounds-library-states.test.tsx` (7 cases): CH-11213, a failed refresh
  keeps the last good library, for the same player only; CH-11410, a refresh
  in flight keeps the page and says it is updating.
- `rounds-return-state.test.tsx` (14 cases): CH-11912. The search and
  grouping come back per route and team; the review's Back steps back when
  it was opened from the library (desktop, phone, a modifier click, a coach,
  a blocked store, a tab with no history); a new-tab open writes no note;
  with the real RouteFrame one visit back restores the scroll and the search.
- `rounds-setup-race.test.tsx` (4 cases): rule 4 on the new-round screen,
  with the reads held open and answered out of order; the last tee choice
  wins, also over a course typed in by hand.
- `rounds-continue-loader.test.tsx` (9 cases): the continue page's loader
  over the Supabase fake. A failed round read throws (never notFound), a
  failed course-hole read with no draft yardage throws, and a draft that
  covers every hole opens as before.

Checks on the final tree:

- Tests: `npm run test:file` over the files above and `rounds.test.tsx`,
  `round-review.test.tsx`, `round-setup.test.tsx`,
  `round-entry-routes.test.tsx`, `round-entry-wiring.test.tsx`,
  `strokes-gained.test.tsx`, `stats-total-only.test.tsx`: pass.
- `npx eslint` on every file changed: exit 0.
- `npm run clubhouse:check` after `node scripts/clubhouse/registry.mjs
  sync`: nothing of P011's; it names other pages' rows still in flight.
- `npm run audit:supabase-errors`: no regression (1003, the baseline). None
  of the files changed has an unchecked read.

Mutation: the tee-race guard in `RoundSetup.loadHoles` was removed and all 4
race cases failed; it was put back. Not run on the other changes.

Observed in unit tests only, not in a browser: the Back step and the scroll
restore (the real RouteFrame is in the test; the history behaviour of
`router.back()` and the popstate window are Next's), the "Updating" mark
(the refresh is faked), and every failed read (the Supabase fake). The
continue page change is to a page file (not `'use server'`): it needs
`next build` with the stack. RouteFrame restores only within 1.5 s of the
popstate and gives up after a second if the page is not yet tall enough, so
a slow server render behind `loading.tsx` may leave the library at the top:
to be looked at on a device.

## The save line (2026-10-01, owner rule 3)

What proves CH-11901 now (`npm run test:file -- src/hooks/golf
src/lib/golf/round-session src/clubhouse/__tests__/round-save-status.test.tsx`
and the round-entry and round-tracking files: 38 files, 434 tests, pass):

- `use-shot-state-machine.sync-status.test.ts` (8 cases): a shot inside the 2 s
  an acknowledgement stays up takes "saved" down at once; the
  acknowledgement of an older snapshot after a newer shot is not "saved";
  `autoSaveSyncing` is set only by a shot whose device copy landed, cleared
  only by an acknowledgement of what is on screen, survives a held save that
  has a device copy and is dropped by one that has none, and is not carried to
  another hole; a `conflict` hold is re-sent and is "saved" only once the
  server acknowledges. Removing the effect's `AUTO_SAVE_UNSYNCED` and the
  acknowledgement guard failed the two "saved" cases; both were put back.
- Review fixes: the same file holds 5 more cases (Undo and a hole with no
  shot left drop "syncing"; a save in flight is left alone; the held-resend
  delay doubles per consecutive `busy` or `conflict` and stays flat for the
  others), `settle-within.test.ts` (3 cases), and the continue file a hung
  staleness check held as `conflict` after 8 s. Removing the two
  `AUTO_SAVE_SETTLED` dispatches failed the two Undo cases; they were put
  back.
- `use-continue-round-session.preservation.test` and `use-new-round-session.
  preservation.test`: a conflict answer is held (`conflict` when healed,
  `blocked` otherwise, and a blocked round sends nothing more). Each fails on
  the old fire-and-forget code (checked by putting it back, then removing it
  again). The continue file also holds `handleSaveShot` reporting the device
  copy (true; false when `localStorage` throws) and the journey: shot, offline,
  left, reopened, restored, reconnected, once.
- `round-save-status.test.tsx` (3 new cases): the line says "Saved on this
  phone · syncing" for a shot whose device copy landed (and never "Round
  saved"), and says nothing for a failed device copy or a renderer that
  reports none.

Not covered: the same journey on the new-round engine (its recovery path
differs), a lost response followed by a retry against the real row lock
(the whole-snapshot replace and `expected_updated_at` are read, from
migration `20260820170000`, not re-proved; no pgTAP ran), the line on a
phone, and `e2e/golf-round.spec.ts` (its offline case still has no
assertions).

## Screenshots

Evidence log. The images stay in `.helm/screenshots/clubhouse/` (never
committed) and travel in the PR description; this table is the committed record
of them. One row per file; the label is the file's basename, named by `npm run
clubhouse:shots -- name` (convention: `.claude/rules/clubhouse.md`). Phase is
before, after, baseline or evidence.

| Label | Phase | Commit | What it shows |
| --- | --- | --- | --- |
| `P011__track__player__1440__approach__after__cee8548.png` | after | cee8548 | track (player), 1440px, approach; /clubhouse-preview/track?state=approach, synthetic preview fixture |
| `P011__track__player__1440__approach__baseline__ee5976d.png` | baseline | ee5976d | track (player), 1440px, approach; /clubhouse-preview/track?state=approach, synthetic preview fixture |
| `P011__track__player__1440__approach__before__4e01c43.png` | before | 4e01c43 | track (player), 1440px, approach; /clubhouse-preview/track?state=approach, synthetic preview fixture |
| `P011__track__player__1440__putt__after__cee8548.png` | after | cee8548 | track (player), 1440px, putt; /clubhouse-preview/track?state=putt, synthetic preview fixture |
| `P011__track__player__1440__putt__baseline__ee5976d.png` | baseline | ee5976d | track (player), 1440px, putt; /clubhouse-preview/track?state=putt, synthetic preview fixture |
| `P011__track__player__1440__putt__before__4e01c43.png` | before | 4e01c43 | track (player), 1440px, putt; /clubhouse-preview/track?state=putt, synthetic preview fixture |
| `P011__track__player__1440__submit-failed__after__cee8548.png` | after | cee8548 | track (player), 1440px, submit-failed; /clubhouse-preview/track?state=submitfail, synthetic preview fixture |
| `P011__track__player__1440__submit-failed__before__4e01c43.png` | before | 4e01c43 | track (player), 1440px, submit-failed; /clubhouse-preview/track?state=submitfail, synthetic preview fixture |
| `P011__track__player__375__approach__after__cee8548.png` | after | cee8548 | track (player), 375px, approach; /clubhouse-preview/track?state=approach, synthetic preview fixture |
| `P011__track__player__375__approach__baseline__ee5976d.png` | baseline | ee5976d | track (player), 375px, approach; /clubhouse-preview/track?state=approach, synthetic preview fixture |
| `P011__track__player__375__approach__before__4e01c43.png` | before | 4e01c43 | track (player), 375px, approach; /clubhouse-preview/track?state=approach, synthetic preview fixture |
| `P011__track__player__375__putt__after__cee8548.png` | after | cee8548 | track (player), 375px, putt; /clubhouse-preview/track?state=putt, synthetic preview fixture |
| `P011__track__player__375__putt__baseline__ee5976d.png` | baseline | ee5976d | track (player), 375px, putt; /clubhouse-preview/track?state=putt, synthetic preview fixture |
| `P011__track__player__375__putt__before__4e01c43.png` | before | 4e01c43 | track (player), 375px, putt; /clubhouse-preview/track?state=putt, synthetic preview fixture |
| `P011__track__player__375__submit-failed__after__cee8548.png` | after | cee8548 | track (player), 375px, submit-failed; /clubhouse-preview/track?state=submitfail, synthetic preview fixture |
| `P011__track__player__375__submit-failed__before__4e01c43.png` | before | 4e01c43 | track (player), 375px, submit-failed; /clubhouse-preview/track?state=submitfail, synthetic preview fixture |
| `P011__track__player__390__approach__after__cee8548.png` | after | cee8548 | track (player), 390px, approach; /clubhouse-preview/track?state=approach, synthetic preview fixture |
| `P011__track__player__390__approach__baseline__ee5976d.png` | baseline | ee5976d | track (player), 390px, approach; /clubhouse-preview/track?state=approach, synthetic preview fixture |
| `P011__track__player__390__approach__before__4e01c43.png` | before | 4e01c43 | track (player), 390px, approach; /clubhouse-preview/track?state=approach, synthetic preview fixture |
| `P011__track__player__390__putt__after__cee8548.png` | after | cee8548 | track (player), 390px, putt; /clubhouse-preview/track?state=putt, synthetic preview fixture |
| `P011__track__player__390__putt__baseline__ee5976d.png` | baseline | ee5976d | track (player), 390px, putt; /clubhouse-preview/track?state=putt, synthetic preview fixture |
| `P011__track__player__390__putt__before__4e01c43.png` | before | 4e01c43 | track (player), 390px, putt; /clubhouse-preview/track?state=putt, synthetic preview fixture |
| `P011__track__player__390__submit-failed__after__cee8548.png` | after | cee8548 | track (player), 390px, submit-failed; /clubhouse-preview/track?state=submitfail, synthetic preview fixture |
| `P011__track__player__390__submit-failed__before__4e01c43.png` | before | 4e01c43 | track (player), 390px, submit-failed; /clubhouse-preview/track?state=submitfail, synthetic preview fixture |
| `P011__track__player__430__approach__after__cee8548.png` | after | cee8548 | track (player), 430px, approach; /clubhouse-preview/track?state=approach, synthetic preview fixture |
| `P011__track__player__430__approach__baseline__ee5976d.png` | baseline | ee5976d | track (player), 430px, approach; /clubhouse-preview/track?state=approach, synthetic preview fixture |
| `P011__track__player__430__approach__before__4e01c43.png` | before | 4e01c43 | track (player), 430px, approach; /clubhouse-preview/track?state=approach, synthetic preview fixture |
| `P011__track__player__430__putt__after__cee8548.png` | after | cee8548 | track (player), 430px, putt; /clubhouse-preview/track?state=putt, synthetic preview fixture |
| `P011__track__player__430__putt__baseline__ee5976d.png` | baseline | ee5976d | track (player), 430px, putt; /clubhouse-preview/track?state=putt, synthetic preview fixture |
| `P011__track__player__430__putt__before__4e01c43.png` | before | 4e01c43 | track (player), 430px, putt; /clubhouse-preview/track?state=putt, synthetic preview fixture |
| `P011__track__player__430__submit-failed__after__cee8548.png` | after | cee8548 | track (player), 430px, submit-failed; /clubhouse-preview/track?state=submitfail, synthetic preview fixture |
| `P011__track__player__430__submit-failed__before__4e01c43.png` | before | 4e01c43 | track (player), 430px, submit-failed; /clubhouse-preview/track?state=submitfail, synthetic preview fixture |
| `P011__track__player__1440__approach__after__d4367ee.png` | after | d4367ee | track (player), 1440px, approach; /clubhouse-preview/track?state=approach, synthetic preview fixture |
| `P011__track__player__1440__approach__before__d3a6483.png` | before | d3a6483 | track (player), 1440px, approach; /clubhouse-preview/track?state=approach, synthetic preview fixture |
| `P011__track__player__1440__putt__after__d4367ee.png` | after | d4367ee | track (player), 1440px, putt; /clubhouse-preview/track?state=putt, synthetic preview fixture |
| `P011__track__player__1440__putt__before__d3a6483.png` | before | d3a6483 | track (player), 1440px, putt; /clubhouse-preview/track?state=putt, synthetic preview fixture |
| `P011__track__player__1440__submit-failed__after__d4367ee.png` | after | d4367ee | track (player), 1440px, submit-failed; /clubhouse-preview/track?state=submitfail, synthetic preview fixture |
| `P011__track__player__1440__submit-failed__before__d3a6483.png` | before | d3a6483 | track (player), 1440px, submit-failed; /clubhouse-preview/track?state=submitfail, synthetic preview fixture |
| `P011__track__player__390__approach__after__d4367ee.png` | after | d4367ee | track (player), 390px, approach; /clubhouse-preview/track?state=approach, synthetic preview fixture |
| `P011__track__player__390__approach__before__d3a6483.png` | before | d3a6483 | track (player), 390px, approach; /clubhouse-preview/track?state=approach, synthetic preview fixture |
| `P011__track__player__390__putt__after__d4367ee.png` | after | d4367ee | track (player), 390px, putt; /clubhouse-preview/track?state=putt, synthetic preview fixture |
| `P011__track__player__390__putt__before__d3a6483.png` | before | d3a6483 | track (player), 390px, putt; /clubhouse-preview/track?state=putt, synthetic preview fixture |
| `P011__track__player__390__submit-failed__after__d4367ee.png` | after | d4367ee | track (player), 390px, submit-failed; /clubhouse-preview/track?state=submitfail, synthetic preview fixture |
| `P011__track__player__390__submit-failed__before__d3a6483.png` | before | d3a6483 | track (player), 390px, submit-failed; /clubhouse-preview/track?state=submitfail, synthetic preview fixture |
| `P011__mobile-overview__player__390__safari-populated__before__cbc1c0d.png` | before | cbc1c0d (working tree) | Mobile overview (player), 390px, WebKit iPhone 13; /clubhouse-preview/rounds, synthetic preview fixture; shared materials in progress |
| `P011__mobile-overview__player__390__safari-populated__after__cbc1c0d.png` | after | cbc1c0d (working tree) | Mobile overview (player), 390px, WebKit iPhone 13; /clubhouse-preview/rounds, synthetic preview fixture; shared materials in progress |

## Open verification gaps

- The iPhone pass through `npm run ios:dev`, a browser pass with a real player and a real coach account (the library, the
  review and Discard against a live session), and the Chromium pass at 430px.
- The build ran once, before the last `useAction` edit; run it again with the stacked PRs' tip.
- Round entry on its routed addresses: a browser pass with a real player account and the flag on (a round started,
  saved for later, continued, submitted, a round recovered from the device, a closed qualifier), Chromium at 390 and
  430px, and the iPhone pass through `npm run ios:dev`. The tests run the real engines but fake the server actions,
  the session and the shot screen (a stub in the wiring tests). Nothing was flipped: the flag is off in production.
- Offline on the library's Discard and the hole's Try again (110702 stays reserved; round entry's Start and Save for
  later are forced offline), a failed Start keeping every field (111201), and the qualifier preselect effect.
- `/rounds/recover` had no Clubhouse screen when this page was verified; it has one now (swap audit F-02, no board;
  see the row above). It was not run on a phone or against a real failed submit. The entry routes' `error.tsx` files
  are still Fairway's.
- Offline (110702), Esc (112001), the read order (112101), a failed Start keeping the setup (111201) and a failed hole save
  keeping the shots (111202) have no test; the review's skeleton (110206) is not built.
- Found and not fixed (see the report to the parent):
  - `rounds/[id]/loading.tsx` is Fairway's, so a Clubhouse review loads under the Fairway skeleton (110206); both
    `error.tsx` files are the shared Fairway boundary.
  - A failed team-membership read fails the whole library although only "today" depends on the team.
  - The checklist `screens/rounds.md` covers only the library, and its desktop, phone, motion and accessibility boxes are open.
  - Setup's course, tee and scorecard reads run in the browser and report nothing to Sentry; the ports must.
  - The catalog's intro and CH-11801 still say the review is not rebuilt; CH-11510 and CH-11511 (and other sheets that are not
    destructive) sit in category 11 by the confirm-kind default.
  - Q-72 is open; the page is built on its recommendations.
