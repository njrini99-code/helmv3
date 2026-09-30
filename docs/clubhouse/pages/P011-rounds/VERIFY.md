# P011 — Rounds: verification

Only what was observed. Gates are in `docs/clubhouse/PROGRESS.md`; the per-gate checklist is
`docs/clubhouse/screens/rounds.md` (it still reads "This covers the library" and its boxes are not brought current
for Review, Setup and Tracking; see the gaps below).

## What is live, and what is preview only

| Surface | Routed | What was observed |
| --- | --- | --- |
| Library `/golf/dashboard/rounds` | yes (player, behind `golf_clubhouse_ui`) | unit tests, the dev preview, headless Chromium at 1280 and 390, axe |
| Review `/golf/dashboard/rounds/[id]` | yes (player and coach, behind the flag) | unit tests, the dev preview, headless Chromium at 1280 and 390, axe |
| Setup | **no** (preview only, `/clubhouse-preview/setup`) | unit tests against fake ports, the dev preview, real Chromium at 390 (the dock read "Finley GC · Blue · 18 holes · Par 72"), axe; never against the real ports, which do not exist yet |
| Shot screen | **no** (preview only, `/clubhouse-preview/track`) | unit tests driving the real `useShotTracking`, the dev preview with a stand-in round screen, real Chromium at 390 (a shot was recorded), axe; never behind the real engine |

Nothing about setup or the shot screen has run against a live account, a routed page, or the round engine.

## Current verification status

```text
Status:     partial
Commit/PR:  agent/clubhouse (the Rounds code is committed there; this docs pass, the manifest change and the sidecar
            are uncommitted at the time of writing)
Date:       2026-09-30
```

## Static checks

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run -s typecheck:fast` | not run in this pass (docs only) |
| Lint | `npx eslint` | not run in this pass (docs only) |
| Clubhouse check | `npm run -s clubhouse:check` | exit 1, 55 violations, every one P011's and caused by the sidecar not being merged yet: 50 "category NN names 11xxxx, which is not in bridge-contracts.json", 3 action ids not found (110901, 111401, 111402), "P011-rounds/CONTRACT.md is stale" and "CLUBHOUSE_ACTION_MAP.md is stale" (the action's component path was edited after the last sync). The 34 subtests of the check's own suite passed. Expected until the merge pass runs `registry.mjs sync`. (During this pass another session changed `bridge-contracts.json` and re-synced `generated/`; this pass touched neither.) |
| Registry and contract check | a read-only simulation of `checkRegistry` and `checkContract` with the 44 hand contracts merged into the registry in memory (a throwaway script, not committed) | 0 violations for P011; CONTRACT.md is exactly what `renderContract` writes for the merged registry; the merged records survive `syncBridge` unchanged. The real run is the merge pass's |
| Knowledge check | `npm run -s docs:check` | not run |
| Build | `npm run build` | not run: no `'use server'` file changed in this pass, and no Rounds build was run here |

## Automated tests

| Test | Contract | Result |
| --- | --- | --- |
| `src/clubhouse/__tests__/rounds.test.tsx` (40 cases) | the library's catalog rows it names (CH-11001, CH-11201 to CH-11203, CH-11301 to CH-11304, CH-11401, CH-11501, CH-11701 to CH-11703, CH-11801 to CH-11803), and by phrase hand contracts 110101, 110105 to 110108, 110413, 110619, 110801, 110901, 111301, 111401, 111402, 111501, 111811, 111902, 112301 | pass |
| `src/clubhouse/__tests__/round-review.test.tsx` (29 cases) | CH-11204 to CH-11206, CH-11305 to CH-11307, CH-11704, CH-11804, and by phrase 110102, 110105, 110109, 110619, 110801, 110802, 111402, 111501, 111502, 111811, 112301 | pass |
| `src/clubhouse/__tests__/round-setup.test.tsx` (19 cases) | CH-11007, CH-11107 to CH-11109, CH-11208 to CH-11211, CH-11309 to CH-11312, CH-11403, CH-11510, CH-11511, and by phrase 110103, 110110, 110111, 110113, 110510, 110805, 111401, 111402, 111503 | pass |
| `src/clubhouse/__tests__/round-tracking.test.tsx` (21 cases) | CH-11002, CH-11003, CH-11005, CH-11101 to CH-11104, CH-11106, CH-11308, CH-11402, CH-11502 to CH-11509, CH-11603, CH-11705, CH-11805, and by phrase 110104, 110112, 110902, 111403 | pass |
| `src/lib/golf/__tests__/shot-entry-rules.test.ts` (11 cases) | the shared rules behind CH-11101 to CH-11106 and the edit sheet's rules | pass |

The five files were run together in this pass: `npx vitest run` on them, exit 0, 5 files, 120 of 120 tests. The
mutation checks in the tracker are not re-run here: `PROGRESS.md` (2026-09-30) records 20 of 20 mutations killed on
the library, 21 of 21 on the review, 17 of 18 on setup (the survivor, the tee list's stale-read guard, is unreachable
by going back, which remounts the list) and 20 of 21 on the shot screen (the survivor, the quick pick's unit dispatch,
is equivalent: the engine derives the stored unit), at the test counts of that day (the library now has 40 cases, not 39).

**Contracts a test covers, and those it does not.** Of the 44 hand contracts (all `reserved`), 32 have a test that would
prove them once its title carries the Bridge ID: 110101 to 110113 (all of category 01), 110413, 110510, 110619, 110801,
110802, 110805, 110901, 110902, 111301, 111401 to 111403, 111501 to 111503, 111811, 111902, 112301 and 112401. **12 have no
covering test**: 110206 (the review's skeleton, not built), 110702 (offline), 110803 and 110804 (the player filter and the
server action's checks, read not run), 111201 and 111202 (a failed Start keeps the setup; a failed hole save keeps the
shots), 111809 (axe, a script), 111810 (the scorecard's focusable region), 111901 and 111903 (the phone builds), 112001
(Esc) and 112101 (the read order). None of the 44 is `implemented` yet, because no test title carries a Bridge ID (the
lead adds them). The catalog rows are the other 74 contracts; 15 of those are marked `preview` (no test is named for them):
CH-11004, CH-11006, CH-11105, CH-11207, CH-11404, CH-11405, CH-11601, CH-11602, CH-11705, CH-11706, CH-11707, CH-11806,
CH-11807, CH-11808 and CH-11901. Two notes on those: CH-11705's test column says `preview`, but the first shot-recording
test names it in its title; and CH-11601 stays `reserved` in the registry because its code string is only in `rounds.css`
(the registry scans `.ts` and `.tsx`).

A hand contract that lists more than one test file becomes `implemented` only when every listed file carries its Bridge ID.
Nine list several: 110105, 110619, 110801, 111401, 111402, 111501, 111811 and 112301 (two or three files each) and 112401
(all four). The handoff's test map (not committed) gives the phrase to tag in each file.

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
| Failure, preview only | CH-11004, CH-11006, CH-11207 | preview only | not forced by a test |
| Retry | 111401 to 111403 | tests | Discard's Retry removes the card, Start's Retry opens the round, a hole save and a submit run again |
| Offline | 110702 | not forced | **not observed**: no P011 test or browser run went offline |
| Permission | 110801, 110802, 110805 | tests | a coach renders nothing on the library; another player's or a missing round is one "not here" page; a closed qualifier can't be chosen |
| Permission, read only | 110803, 110804 | read, not run | reserved: no test forces the player filter or the server action's refusals |
| Partial read | 110619 | tests | each failed read flags only its part; the rest renders |
| Destructive | CH-11501, CH-11502, CH-11504, CH-11505, CH-11507 | tests | asks first; the card leaves only when the server has deleted it |
| Optimistic | n/a | n/a | nothing on the page is optimistic (111301) |
| Not-rebuilt notice at `/rounds/new` and `/rounds/continue/[id]` | 110105, 110109 | read from `nav.isRebuilt` and `ClubhouseFrame` | **not observed in a browser** |

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
Request waterfall: none on the client. The library loader reads in up to four passes, one after the other: the team's time
                   zone (when there is a team), the posted rounds (paged), the in-progress rounds, then their holes (112101).
                   The in-progress query does not depend on the posted list (only the ready-to-submit check does), so it
                   could start earlier; not changed.
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

## Open verification gaps

- The iPhone pass through `npm run ios:dev`, a browser pass with a real player and a real coach account (the library, the
  review and Discard against a live session), and the Chromium pass at 430px.
- `npm run build`, typecheck and lint for this pass; nothing here changed a `'use server'` surface.
- Setup and the shot screen against the real ports and the engine: none exists until the engine move (ROUNDS_PLAN step 4).
  Until then no routed page starts or continues a round for a Clubhouse player.
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
