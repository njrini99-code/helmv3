# P005 — Stats (player): verification

Only what was observed. Gates are in `docs/clubhouse/PROGRESS.md`; the per-gate
checklist is `docs/clubhouse/screens/stats-player.md`.

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
| Registry and contract check | `registry.mjs` `checkRegistry` run in memory with the new Bridge IDs merged (and the two new catalog rows minted), and this CONTRACT.md compared with what `registry.mjs sync` writes | no violations for P005 |
| Pure checks | `checkServerOnlyImports`, `checkCatalog` and `checkSource` from `scripts/clubhouse/check.mjs`, run in memory on `src/clubhouse` and the catalogs | no violations in any Stats file (0 server-only imports, 0 catalog violations) |
| Clubhouse check | `npm run -s clubhouse:check` | not run in this pass (it follows the registry sync) |
| Knowledge check | `npm run -s docs:check` | not run in this pass |
| Build | `NODE_OPTIONS=--max-old-space-size=8192 npm run build` | not run in this pass; last recorded exit 0 on 2026-09-29, before the phone build |

## Automated tests

| Test | Contract | Result |
| --- | --- | --- |
| `src/clubhouse/__tests__/stats-player.test.tsx` (53 cases, each named by the codes it forces) | every catalog row that names it (CH-4309, 5001 to 5307, 5401, 5402, 5701, 5801 to 5803, 5807, 5901, 5902) and all 19 hand contracts | pass (`npx vitest run src/clubhouse/__tests__/stats-player.test.tsx`, 53/53, 2026-09-30) |
| `src/clubhouse/__tests__/stats-team.test.tsx` | the routes' team side (40801, 40802) and the shared charts | pass (42/42, 2026-09-30) |

The route and the loader are tested directly: `ClubhouseStatsRoute` is called with the session and the team
mocked and the loaders' call arguments are read, and `loadPlayerProfile` runs for real on a fake Supabase
client with the shot-level read faked. Each test added in this pass was mutation-checked: the code it guards
was broken, the test failed, and the code was restored. Checked: 50803 (`?player=` trusted for a player, the
viewer changed, the roster read for a player), 50804 (the status filter, the shape check), 50611 (the throw),
CH-5208 (the tour guess), 50805 (the empty detail read as zeros; the wrong id), 50103 (the wrap), 52101 (an
extra read), 50104 (the bare Message link), CH-5901 and CH-5902 (the offline guard, the slow timer, the
breadcrumb, the phone's switch), CH-1903 (a write that skips `useAction`), CH-5402 (never busy), 50901 (the
status, the refresh), 51202 (a tab reset), 50101 and 50102 (the hero figure, the window parse), 52001 (the form's
submit, a roving tab), 50806 (the coach flag) and 52401 (a catalog row no test names). 28 checks.

## Visual verification

### Desktop

```text
Viewport:  924, 1280 and 1400px (preview)
Reference: design/handoff/screenshots/stats-player-01..14 (v1); Coach - Stats.html (v2, same screen)
Result:    matched, logged 2026-09-29 in PROGRESS.md (every tab and state: early, self, failed). Not
           re-checked after the v2 motion and navigation changes, or after this pass (whose visible changes
           are the Message link's address and the offline and slow notices).
```

### Phone

```text
Viewport:     built to the approved spec (docs/clubhouse/phone/stats-player.md); no browser capture is
              recorded yet
Device/shell: not yet on a real iPhone (npm run ios:dev, owner)
Reference:    design/handoff/Coach - Stats - Mobile.html, board "Player · approach"
Result:       built to the approved spec; the browser pass at 390 and 430 and the iPhone pass are open
```

## Forced states

| State | Contract | How forced | Observed result |
| --- | --- | --- | --- |
| P005__filter__coach__390__populated__after__cca081c.png | after | cca081c (working-tree after) | WebKit iPhone 13; Phoneplayerstatsfilter44×44px target withremainingcontrolsvisible |
| P005__overview__coach__390__populated__before__cbc1c0d.png | before | cbc1c0d (working-tree before) | WebKit iPhone 13; Baseline phone player stats before page spacing and material repairs |
| P005__overview__coach__390__populated__after__cbc1c0d.png | after | cbc1c0d (working-tree after) | WebKit iPhone 13; Layered overview and strokes gained panels,16px rhythm and readable captions |
| Skeleton | CH-4401 | the route's loading.tsx (Team stats' shape); test on Team stats | busy skeleton; a profile's first paint moves it |
| Empty | 50401 to 50405 | `?state=early` (preview), tests | each tab or section says what is missing; an early read names what will move |
| Validation | 50501 | test | message under the field, the field focused, the warning tick, nothing sent |
| Server failure | 50601 to 50611 | tests (each read forced with its logged name, four tab crashes, the save, the share); preview `?state=failed` | toast or notice with its code; the text is kept |
| Offline | CH-5901, 10703 | tests | the switch is refused with nothing requested; a focus area is refused and the text is kept |
| Slow | CH-5902 | test | one notice after 5 seconds, naming both windows |
| Permission | 50801 to 50806 | tests | see below |
| Destructive | none | N/A: nothing is deleted | |
| Optimistic rollback | none | N/A: nothing is optimistic | |

Permission, as observed in tests: a player's address with `?player=` of someone else, of nobody, or of junk
loads the player's own id in the player view and never the team; a coach's `?player=` loads against the
session's team; another team's player, a junk id, and a pending or removed member give "That player isn't on
your team" (the junk id without any read); a player with no team gives "You aren't on a team yet"; a failed
player or membership read raises the route error view; a refused shot-level read shows "didn't load".

Not forced against a live session: every state above was forced against a fake Supabase client and rendered
in jsdom, or in the preview, never against a live session (Q-4, the owner's live pass).

Not tested: the server action `createFocusArea` refusing a caller who is not a coach (read from the action;
it is shared and has its own tests elsewhere).

## Accessibility

```text
Keyboard:       the window switch moves with the arrow keys; Enter in the focus-area field proposes; each
                section tab is one Tab stop chosen with Enter or Space (stats-player.test 52001). Not built:
                arrow-key movement between tabs. Esc closes the sheet (the shell's Modal, shell.test).
VoiceOver:      the coach's Message and Share have names; not tried on a device.
Focus:          the focus-area field takes focus when its name is missing (CH-5101).
Reduced motion: the motion gate is open: the earlier evidence was against the old timings, so every box
                starts again (checklist, motion). The tab underline slide is off when motion is reduced.
Contrast:       clubhouse:a11y (axe, WCAG 2.2 AA) recorded 0 violations on every tab and state at 1280
                and 390 on 2026-09-29 (14 pages); rerun open after the phone build.
Text scaling:   not checked.
```

## Performance

```text
Layout shift:      not measured for the profile; the route skeleton is Team stats' shape, so a profile's
                   hero (taller) moves what the skeleton drew
Request waterfall: a test now holds the shape (52101): the team, player and membership together, then the
                   rounds, shot detail, benchmarks, focus areas and goals together, then the round figures once
Large list:        not measured
Animation:         v2 tokens only
Notes:             first-load JS and LCP after the v2 reveal are open (D-27, CH-1954)
```

## Strokes gained pass (2026-09-30)

| Check | Command | Result |
| --- | --- | --- |
| Tests | `npx vitest run src/clubhouse/__tests__/strokes-gained.test.tsx src/clubhouse/__tests__/stats-player.test.tsx` | 57 + 60 cases pass; 25 mutations of the new behaviour, 25 caught |
| Clubhouse | `npm run -s clubhouse:check` | clean |
| Native-feel | `CH_BASE=http://localhost:3107 node scripts/clubhouse/native.mjs stats-player` | no new findings; the five Game detail chips at 36px were already reported |
| Axe | `node scripts/clubhouse/a11y.mjs stats-player` | clean (1280 and 390px) |
| Look | the preview at 1280 and 390px, read by eye | hero chip, phone panel and round rows draw as built |

## Parity pass (2026-09-30)

| Check | Command | Result |
| --- | --- | --- |
| Tests | `npx vitest run src/clubhouse` (once) | 30 files, 1531 tests pass (exit 0). stats-parity.test has 44 cases; the stats-player, strokes-gained and player-home tests were updated where the contract moved (the window's round ids go to `getDetailedStats`; the nine-band curve; the grouped table) |
| Mutations | `scratchpad/sg-build/mutate.py muts_parity.py` | 33 mutations of the new behaviour (figures, floors, edges, the window's ids, the Tour basis, states, colours, the phone), 32 caught; the survivor is a second guard behind a first (a player's team pool is cut by `teamWin` and by `teamRate`) |
| Types | `npm run -s typecheck:fast` | exit 0 |
| Lint | `npx eslint` on the changed data, screen, fixture and test files | exit 0 |
| Clubhouse | `npm run -s clubhouse:check` | no source, test or catalog-use violation; the registry is out of date with the thirteen new catalog rows and P014's (the lead's sync) |
| Native-feel | `CH_BASE=http://localhost:3107 node scripts/clubhouse/native.mjs stats-player` (390 and 430px) | exit 0, clean. First run found the Game detail chips' hit area clipped to 36px by the nav padding; `.ch-gd__nav` padding is now `4px 14px 6px` and the shell's 44px `.ch-pill::after` reaches |
| Axe | `node scripts/clubhouse/a11y.mjs stats-player` (1280 and 390px) | exit 0, 16 pages clean; the phone runs open each section's More detail (`a11y.mjs` has five new entries) |

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

Evidence log. The images stay in `.helm/screenshots/clubhouse/` (never
committed) and travel in the PR description; this table is the committed record
of them. One row per file; the label is the file's basename, named by `npm run
clubhouse:shots -- name` (convention: `.claude/rules/clubhouse.md`). Phase is
before, after, baseline or evidence.

| Label | Phase | Commit | What it shows |
| --- | --- | --- | --- |

## 2026-10-02 — Mobile design fidelity verification

- WebKit iPhone 13 previews at 375, 390 and 430 CSS pixels: populated page has no horizontal document overflow; roster status notes and stats figure labels remain inside their columns.
- Before/after captures at 390 show the shared sheet gradient, inset highlight and layered shadow. The captures use deterministic preview fixtures, not a live customer session.
- At 390, empty and failed coach states retain their explanatory copy and controls. Roster player populated/empty, Team Hub player populated and Player Stats early-read states were checked where applicable.
- Physical iPhone Safari performance and real account data remain unverified. Failed fixtures also logged AdminLoggerClient event-send failures in the local development browser; no production data was changed.

## 2026-10-02 — Intuitive improvement verification

- WebKit measured the coach player-profile filter at 44×44px at 390 and captured
  the retained figure/window layout.
- Fixture actions do not touch production. These checks do not establish
  intended-user discoverability, physical iPhone performance or durable
  live-data outcomes.

## Open verification gaps

- The iPhone pass through `npm run ios:dev` (owner), and a browser pass at 390 and 430.
- A browser pass with a real coach account and a real player account (owner, Q-4).
- `clubhouse:a11y` rerun for the phone profile and every state.
- Forced states against a live session; the shot-level refusal against a real other-team coach.
- Layout shift for the profile, and a profile-shaped loading state (a loading.tsx cannot read the address).
- Found and fixed 2026-09-30: a failed player or membership read showed "That player isn't on your team"; a
  pending or removed member opened as Active; the Message button opened the bare inbox; the window switch
  was not refused offline; a junk `?player=` reached the database; an unknown tour graded a women's team
  against the men's D1. Each has a test that fails with the fix taken out (checked).
- v2 draws Stats with no rounds ever as a whole-page empty, "No stats yet" (D-71); not built, owner decision.
