# P004 — Stats (team): verification

Only what was observed. Gates are in `docs/clubhouse/PROGRESS.md`; the per-gate checklist is
`docs/clubhouse/screens/stats-team.md`.

## Current verification status

```text
Status:     partial
Commit/PR:  agent/clubhouse (local; the contract pass of 2026-09-30 is not committed yet)
Date:       2026-09-30
```

## Static checks

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run -s typecheck:fast` | exit 0 (2026-09-30, after the contract pass) |
| Lint | `npx eslint` on the changed Stats files and both Stats test files | exit 0 |
| Registry and contract check | `registry.mjs` `checkRegistry` run in memory with the new Bridge IDs merged, and this CONTRACT.md compared with what `registry.mjs sync` writes | no violations for P004 |
| Pure checks | `checkServerOnlyImports`, `checkCatalog` and `checkSource` from `scripts/clubhouse/check.mjs`, run in memory on `src/clubhouse` and the catalogs | no violations in any Stats file (0 server-only imports, 0 catalog violations) |
| Clubhouse check | `npm run -s clubhouse:check` | not run in this pass (it follows the registry sync) |
| Knowledge check | `npm run -s docs:check` | not run in this pass |
| Build | `NODE_OPTIONS=--max-old-space-size=8192 npm run build` | not run in this pass; last recorded exit 0 on 2026-09-29, before the phone build |

## Automated tests

| Test | Contract | Result |
| --- | --- | --- |
| `src/clubhouse/__tests__/stats-team.test.tsx` (42 cases, each named by the codes it forces) | every catalog row that names it (CH-4001, 4201 to 4210, 4301 to 4308, 4401, 4402, 4701, 4702, 4703, 4801, 4802, 4805, 4901, 4902) and all 13 hand contracts | pass (`npx vitest run src/clubhouse/__tests__/stats-team.test.tsx`, 42/42, 2026-09-30) |
| `src/clubhouse/__tests__/stats-player.test.tsx` | CH-4309 (the no-team page state, catalogued here), and the profile's contracts | pass (53/53, 2026-09-30) |
| `src/clubhouse/__tests__/logic.test.ts` | the window math, weighted rates, tour choice and week bucketing | not re-run in this pass |

Each test added in this pass was mutation-checked: the code it guards was broken, the test failed, and the
code was restored. Checked: 40501 (the name written as text), 40901 (the file name, the toast, the tick),
40801 (a player given the team), 40802 (the roster filter by team and by status), 40102 (the window read from
the address and written back with scroll off), 41201 (the leg and player reset on a window change), 41401 (Try
again doing nothing), 41901 (the phone view never taking over), 42001 (a grid row that does not focus its
player), 42101 (a second team read; the benchmarks read after the rounds), 42301 (the team read not logged),
40101 (Season bests removed), CH-4402 (the page never busy) and 42401 (a catalog row no test names). 20 checks.
The three assertions in 40801 on the frame's route list (`isRebuilt`) were added after that run and are not
mutation-checked: the code they read is the shell's `nav.ts`, which this pass does not touch.

## Visual verification

### Desktop

```text
Viewport:  924, 1280 and 1400px (preview)
Reference: design/handoff/screenshots/stats-team-01..05 (v1); Coach - Stats.html (v2, same screen)
Result:    matched, logged 2026-09-29 in PROGRESS.md (every section, lens, leg and player focus, and the
           empty, failed, partial, crash and loading states). Not re-checked after the v2 motion and
           navigation changes, or after this pass (whose only visible change is the CSV export's cells).
```

### Phone

```text
Viewport:     built to the approved spec (docs/clubhouse/phone/stats-team.md); no browser capture is
              recorded yet
Device/shell: not yet on a real iPhone (npm run ios:dev, owner)
Reference:    design/handoff/Coach - Stats - Mobile.html, board "Team stats"
Result:       built to the approved spec; the browser pass at 390 and 430 and the iPhone pass are open
```

## Forced states

| State | Contract | How forced | Observed result |
| --- | --- | --- | --- |
| Skeleton | 40201 | `/clubhouse-preview/stats?state=loading`, test | skeleton in Team stats' shape, busy |
| Empty | 40401 to 40409 | `?state=empty`, tests | distinct from a failed read; Show the season |
| Validation | 40501 | test | a name that starts with = + - or @ is written as text |
| Server failure | 40601 to 40611 | tests (each read forced with its logged name, five section crashes, the export); `?state=failed`, `partial`, `crash` | notice or toast with its code; the rest of the page stands |
| Offline | 40701 | test (CH-4901) | nothing requested, the switch stays, the error tick |
| Slow | 40702 | test (CH-4902) | one notice after 5 seconds, naming both windows |
| Permission | 40801, 40802 | tests | a player gets their profile and no team read; the team is the session's |
| Destructive | none | N/A: nothing is deleted | |
| Optimistic rollback | none | N/A: nothing is optimistic | |

Not forced against a live session: every state above was forced against a fake Supabase client and rendered
in jsdom, or in the preview, never against a live session (Q-4, the owner's live pass). A state never observed
is not verified (08_CI_PROGRESS_AND_VERIFICATION.md).

Not tested: the old address /golf/dashboard/stats/team sending a non-coach to /stats (it is in the Fairway
page, which the test does not import); only the Clubhouse frame's side of it is.

## Accessibility

```text
Keyboard:       the window switch moves with the arrow keys, a leg card takes Enter, and a grid row takes
                focus and marks its player (stats-team.test 42001). The full Tab walk was recorded on the
                checklist on 2026-09-29; it is not a test. This page has no dialog, so no Esc.
VoiceOver:      the phone's scoring line and player rows read as sentences (tested as accessible names,
                CH-4805); not tried on a device.
Focus:          no pushed screens on this page.
Reduced motion: the motion gate is open: the earlier evidence was against the old timings, so every
                box starts again (checklist, motion). The busy dim and the focus fades use the quick token.
Contrast:       clubhouse:a11y (axe, WCAG 2.2 AA) recorded 0 violations across 105 pages on 2026-09-29,
                before the phone build; rerun open.
Text scaling:   not checked.
```

## Performance

```text
Layout shift:      CLS 0.0001 at 924px and 0 at 1280px on load (recorded 2026-09-29, before the phone build);
                   the route skeleton lands the header, first card and trend card in place from 924 to 1600px
Request waterfall: none beyond the necessary, and now a test (42101): team and roster together, the
                   benchmarks started before the rounds return, then the round figures and putts once each
Large list:        not measured
Animation:         v2 tokens only
Notes:             client code 17.7 to 11.8 KB minified after the server/island split (recorded 2026-09-29);
                   first-load JS with domMax and LCP after the v2 reveal are open (D-27, CH-1954)
```

## Strokes gained pass (2026-09-30)

| Check | Command | Result |
| --- | --- | --- |
| Tests | `npx vitest run src/clubhouse/__tests__/strokes-gained.test.tsx src/clubhouse/__tests__/stats-team.test.tsx` | 57 + 43 cases pass; 25 mutations of the new behaviour, 25 caught |
| Clubhouse | `npm run -s clubhouse:check` | clean (registry synced: 6 new Bridge IDs across P004, P005, P011) |
| Native-feel | `CH_BASE=http://localhost:3107 node scripts/clubhouse/native.mjs stats-team` | clean at 390 and 430px |
| Axe | `node scripts/clubhouse/a11y.mjs stats-team` | clean, 12 pages (1280 and 390px) |
| Look | the preview at 1280 and 390px, read by eye | six cards in a row, the phone panel's bars and total row draw as built |

## Round filter pass (2026-09-30, with Holes)

| Check | Command | Result |
| --- | --- | --- |
| Tests | `npx vitest run src/clubhouse/__tests__/stats-filter.test.ts stats-filter-data.test.tsx stats-filter-ui.test.tsx stats-weight.test.ts` | 135 pass (exit 0): the address and the order rounds are selected in (35), what both loaders read and count under a filter, for 9 holes and Both too, with strokes gained per 18 and a player's read never reaching other players' rounds (33), the screens, desktop and phone (56), the weights and the calculator's restated counts (11) |
| Tests | the same four plus `stats-team`, `stats-player`, `stats-parity`, `strokes-gained`, `logic` | 9 files, 389 tests pass (exit 0). The contract moved in the last five (the loaders take a filter, the window summary carries whole-round counts); setup only, no expectation weakened |
| Tests | `npx vitest run src/clubhouse` (once) | 34 files: 1702 pass, 10 fail, all in `classes`, `coachhelm` and `recruiting` tests, which other sessions' uncommitted work in this checkout changes; none in Stats |
| Mutations | `scratchpad/sg-build/mutate.py muts_filter.py`, `muts_holes.py`, `muts_holes2.py` | 72 mutations of the filter (67 caught, the 5 survivors fixed with tests), then 86 of the Holes behaviour (76 caught; 9 survivors fixed with tests and re-run, all caught) and 9 more for the review fixes, all caught. The one mutant left is equivalent: a player's team pool is already the player alone |
| Types | `npm run -s typecheck:fast` | exit 0 on this work; the last run (exit 1) reports one error, in `hub.test.tsx`, which another session is changing |
| Lint | `eslint` on the 33 changed files | exit 0 (one existing warning in the preview page, `role` on a Messages preview) |
| Clubhouse | `npm run -s clubhouse:check` | exit 1 for registry drift only: the new catalog rows have no Bridge ID and the generated files and CONTRACT.md are stale (the lead's sync), and other pages' own gaps. No Stats source, test or catalog-use violation |
| Axe | `node scripts/clubhouse/a11y.mjs stats-team stats-player` | exit 0, 50 pages clean (1280 and 390px), including the filtered, no-match, early-read and nine-hole states and the filter sheet open |
| Native-feel | `CH_BASE=http://localhost:3107 node scripts/clubhouse/native.mjs stats-team stats-player` (390 and 430px) | clean on the second run. The first run had one `page.tap` timeout opening a Game detail chip at 430px while other sessions' tests were running; the chips and the filter's chips and Clear were within 44 x 44 in both. Nothing here sets a height on `.ch-seg__b` or `.ch-pill` |
| Look | not done | no browser or iPhone pass (owner) |

## Screenshots

Evidence log. The images stay in `.helm/screenshots/clubhouse/` (never committed) and travel in the PR description; this table is the committed record of them. One row per file; the label is the file's basename, named by `npm run clubhouse:shots -- name` (convention: `.claude/rules/clubhouse.md`). Phase is before, after, baseline or evidence.

| Label | Phase | Commit | What it shows |
|---|---|---|---|

## Open verification gaps

- The iPhone pass through `npm run ios:dev` (owner), and a browser pass at 390 and 430.
- A browser pass with a real coach account (owner, Q-4).
- `clubhouse:a11y` rerun for the phone view and every state; a keyboard walk on the phone.
- Forced states against a live session.
- LCP, layout shift on the phone, and first-load JS (the merge pass, D-27).
- The redirect of a non-coach from /golf/dashboard/stats/team (Fairway page, not tested).
- Found and fixed 2026-09-30: the CSV export wrote a name that starts with = + - or @ as a formula. It is
  written as text now (40501), and the test fails with the fix taken out (checked).
- v2 draws Stats with no rounds ever as a whole-page empty, "No stats yet" (D-71); not built, owner decision.
