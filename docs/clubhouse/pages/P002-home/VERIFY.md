# P002 — Home: verification

Only what was observed. Gates are in `docs/clubhouse/PROGRESS.md`; the per-gate checklist is
`docs/clubhouse/screens/home.md`.

## Current verification status

```text
Status:     partial
Commit/PR:  agent/clubhouse (local)
Date:       2026-09-30
```

## Static checks

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run -s typecheck:fast` | exit 0 (2026-09-30, after the page docs, the timezone fix and the countdown fix) |
| Lint | `npx eslint` on the four files changed (`home.test.tsx`, `player-home.test.tsx`, `data/home.ts`, `screens/home/Countdown.tsx`) | exit 0 |
| Doctrine scan | `checkSource` from `scripts/clubhouse/check.mjs` on `data/home.ts` and `Countdown.tsx` | no findings |
| Contract check | `checkRegistry` from `scripts/clubhouse/registry.mjs`, with the 18 new Bridge IDs merged in memory | clean for P002 (CONTRACT.md lists every P002 ID under its category, all 25 categories answered, every action's Bridge value exists) |
| Clubhouse check | `npm run -s clubhouse:check` | not run by this pass (the merge pass runs it, with `registry.mjs sync`) |
| Build | `npm run build` | not run: no `'use server'` surface changed |

## Automated tests

| Test | Contract | Result |
| --- | --- | --- |
| `src/clubhouse/__tests__/home.test.tsx` (55 cases: the real dashboard page for both roles, Coach Home, the coach loader, the phone) | every catalog row of kinds 0 to 5 for Coach Home; 20101, 20103, 20301, 20618, 20801, 20802, 20806, 21402, 21703, 21901, 22101, 22301, 22401 | pass (90/90 with `player-home.test.tsx`, 2026-09-30) |
| `src/clubhouse/__tests__/player-home.test.tsx` (35 cases: Player Home desktop and phone, its loader, the countdown) | CH-2201, CH-2202, CH-2215 to CH-2217, CH-2301, CH-2309 to CH-2313; 20102, 20103, 20301, 20803 to 20806, 21703, 21807, 21901, 22101, 22301 | pass |
| `src/clubhouse/__tests__/logic.test.ts` | the derived copy (`model.ts`: the brief, agenda details, quiet days) | not run by this pass |
| `src/clubhouse/__tests__/shell.test.tsx` | the shell contracts this page inherits (10704 and the rest) | not run by this pass |

Mutation checks (2026-09-30): 57 breakages, one at a time, across 12 Home source files and the test file (the route's role and flag branches, redirects, team source, no-team reads, the swallowed membership error; the timezone fix and its log; each loader's logging and flags; a roster read, another player's rounds and named invitees in the player's loader; the creator and fallback of the coach lookup and the `?user=` link; the other role's controls on each Home; each haptic; the countdown's plural, hidden digits and interval; the phone's clock; the phone and desktop switches; each breadcrumb and crash surface; each link). Every one made the test that guards it fail, and each file was put back byte for byte. Not mutation-checked: the shared `RefreshNotice`, `SectionBoundary` and `InlineNotice` behind 21402 (another page's tests use them, so they were not broken), the Bridge half of 22401 (it reads `bridge-contracts.json`, which this pass does not edit; the same logic was run against the merged IDs), and the Scoring window's tick (`Segmented`, shared).

## Visual verification

### Desktop

```text
Viewport:  924, 1280 and 1400px (preview) for Coach Home
Reference: design/handoff/screenshots/home-01-top and home-02-leaderboard (v1); Coach - Home.html (v2, same screen)
Result:    Coach Home matched, logged 2026-09-29 in PROGRESS.md (fidelity pass at 1280px). Player Home
           (Player - Home.html) has not been compared in a browser.
```

### Phone

```text
Viewport:     390 × 844 (preview)
Device/shell: not yet on a real iPhone (npm run ios:dev, owner)
Reference:    design/handoff/Coach - Home - Mobile.html; Player - Home - Mobile.html
Result:       both built to the approved specs and driven by tests at the phone width; not yet compared in a
              browser at 390 or 430, and the iPhone pass is open
```

## Forced states

| State | Contract | How forced | Observed result |
| --- | --- | --- | --- |
| Skeleton | 20201 | test (CH-2401), `/clubhouse-preview/home?state=loading` | busy, shaped like Coach Home |
| Empty | 20401 to 20413 | tests, `?state=empty` and `?state=noevents` | distinct from a failed read; the first-run page refuses while any section failed |
| Server failure | 20601 to 20618 | tests, `?state=failed` | a notice with Try again in the section, never an empty state; the rest of Home stays |
| Loader failure | 22101 | tests, every read failing at once, then the rounds, then the holes, the round cache, the benchmarks and the coaches | the page loads, each section flags itself, each read is logged |
| Offline | 10704 | test | Try again says so and asks nothing |
| Permission | 20801 to 20806 | tests on the real page and on each Home | the right Home for the role and flag; the session's team; no team reads nothing; a failed membership read throws; a player's payload holds no teammate name or id; the other role's controls absent |
| Retry | 21402 | tests | Try again calls `router.refresh`; a crashed section draws itself again without asking the server |
| Crash | 20605 to 20607, 20612 to 20614, 20617 | tests | contained in the section, reported at high severity under its surface |
| Bad timezone | 20618 | test (failed before the fix) | Eastern, logged, Home opens |

Validation, destructive, optimistic rollback and offline saves do not exist on Home (CONTRACT.md 05, 11, 13, 09). Not forced against a live session: any of the above. A state never observed is not verified (08_CI_PROGRESS_AND_VERIFICATION.md).

## Accessibility

```text
Keyboard:       N opens a new event and not while typing (home.test 21801, 21702); Tab reach and the full walk
                at 1280 and 390 are open.
VoiceOver:      not tried on a device. The countdown is a timer with a name, digits hidden (player-home.test 21807).
Focus:          the phone scorecard is a named focusable region (CH-2806, preview and a11y scan only).
Reduced motion: paging fades instead of sliding (CH-2601, preview only, not tested); the press and the first-paint
                reveal are the shell's (P001).
Contrast:       clubhouse:a11y (axe) not run for this pass.
Text scaling:   not checked.
Known:          a leaderboard row is an anchor with role row (CH-2803), which keeps the table readable and hides that
                it is a link from a screen reader; not tried with one.
```

## Performance

```text
Layout shift:      not measured
Request waterfall: none from the browser (nothing under screens/home fetches). The server reads in waves: Coach Home
                   timezone, then roster, team chat and week together, then rounds, then holes; Player Home timezone,
                   then week, rounds, player and team together, then holes, round cache, benchmarks and coach together.
Large list:        the leaderboard draws the whole roster; not measured
Animation:         v2 tokens only
Notes:             first-load JS and LCP are open (CH-1954)
```

## Screenshots

Evidence log. The images stay in `.helm/screenshots/clubhouse/` (never committed) and travel in the PR description; this table is the committed record of them. One row per file; the label is the file's basename, named by `npm run clubhouse:shots -- name` (convention: `.claude/rules/clubhouse.md`). Phase is before, after, baseline or evidence.

| Label | Phase | Commit | What it shows |
|---|---|---|---|

## Open verification gaps

- The iPhone pass through `npm run ios:dev` (owner), and a browser pass at 1280, 390 and 430 with a real coach and a real player account.
- Forced failures against a live session; `clubhouse:a11y` and a full keyboard walk; LCP and layout shift.
- Whether the row level security on `golf_event_attendance` returns other players' replies to a player. The screen never has a name to draw (20804), but the counts come from those rows.
- Not fixed, found in this pass: `dashboard/loading.tsx` shows the coach's desktop-shaped skeleton to a player and on a phone (Player Home's own and a phone-shaped skeleton are not built). The phone's "Today", "Tomorrow" and weekday labels compare the team-local event date with the device's date, so a viewer in another timezone than the team may see a label a day off near midnight (not tested). A page left open past midnight keeps the day it loaded. The desktop Up next in the player's week and the pagers leave no breadcrumb. The coach lookup behind Message coach sets no order on `golf_coaches`, so when the team's creating coach has no account, which other coach is named is not fixed (rare: `created_by` matches on the live teams). The first-run Invite players button (primary) gives the light tap, which no contract lists by name; the rule is in CONTRACT.md 17 (only primary buttons tap).
- Fixed 2026-09-30: a stored team timezone that is not a real zone threw in `homeClock` and failed the whole page; it now reads as Eastern and is logged (20618, the test failed before the fix). The player's countdown was named "Starts in 1 days"; it now says "1 day" (21807, the expected string in the test changed on purpose).
- `npm run knowledge:map` maps none of Home's files to a feature, so no feature doc names this page.
