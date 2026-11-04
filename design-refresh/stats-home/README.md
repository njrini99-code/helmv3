# Start here: My stats, Team Stats and Home "Your game" build package

The phone Stats redesign. This folder is everything a Claude Code agent needs to build it so it looks, behaves and moves exactly like the design page. Prep only: no deploy, no migration, no flag flip.

Read in this order:

1. `redesign/stats-and-home-phone.html`: the design page. Open it in a browser. The control bar switches screen (My stats, Team Stats, Home), light and dark, data (full, 2 rounds, none), state (loading, didn't load), long names, Text Size and Reduce Motion. Tap any card to push its detail. Every view has a link (05 gives each one).
2. `01-BRIEFS.md`: what each screen is for, what changes, what must not, and when it's done.
3. `05-SCREENS.md`: every screen, detail, sheet and inline state as an id (S-STATS, S-STATS.sg, S-STATS.window, S-TEAMSTATS.pin, S-HOMEGAME.leg and the rest: 30 in all), each with its design link, app route and the step that reaches it, then a state matrix per id (default, loading, empty, failed, few, long, lots, one, offline, XXL, dark, Reduce Motion, 390, 430, desktop) saying which are drawn, which the app has, and which need a fixture.
4. `06-SCREEN-SPECS.md`: per id, measured off the design page: every box top to bottom (x, y, size, padding, radius, gap), every text node with its type, line and overflow rule, colour token, app token and contrast in light and dark, every mark with its 3:1 check, icons and hit areas, the data each figure reads, and a numbered redline to check first. Then every drawn state the same way, and what isn't drawn with the rule to build it.
5. `07-MOTION.md`: every movement as a row (M-STATS-01 to 27, M-HOME-01): trigger and threshold, element, property, from and to, duration, curve token, delay, what happens when interrupted, the Reduce Motion version, haptic, and the frame to check. Then what never animates and 12 interrupt cases.
6. `08-ACCEPTANCE.md`: 113 numbered checks (layout, type, colour, data, mechanics, motion, states, hit areas), then per PR what it must pass, the tests and fixtures it adds, the `data-ch` hooks capture needs, and when it is done.
7. `04-FIDELITY-SPEC.md`: the token map, component numbers, routes and what can't be built as drawn. Where 04 and 05 to 08 differ, 05 to 08 win (04 says so at each place).
8. `redesign/stats-phone.css`: the page's own phone CSS (base, then the redesign layer; later rules win). Copy values from here.
9. `02-PLAN.md`: the overrides first, then file by file against helmv3 `main` 75b4956: routing and deep links, new pieces, every file, where today's content goes, conflicts, tests, the PR split (4a plumbing, 4b player, 4c polish, 5 team, 6 Home).
10. `03-DATA-CHECKS.md`: every figure, its source and formula, the 13 formula problems found, what the page changed to match the data, and the staging checks.
11. `capture/capture.mjs` with `capture/screens.json`: side-by-side stills by screen id and state, and motion clips and frames by 07 row.

Also in the parent folder: `DESIGN_LANGUAGE.md`, `BUILD_CONTRACT_STANDARD.md` (the SHARED-1 to 12 checks every PR passes), `BUILD_BRIEF.md` (these screens are PRs 4, 5 and 6) and the Classes, Roster and Home package (`classes-roster-home/`), which shares the bar, the segmented and the push.

## Screenshots

- `screenshots/before/`: Nick's iPhone shots of today's screens.
- `screenshots/after/`: the design page, 82 stills taken with `capture.mjs` and named the same way (`<ID>__<state>__design__<theme>.png`): every drawn screen id in light and dark, plus every drawn state (loading, didn't load, none, 2 rounds, long names, XXL, Reduce Motion, 430) of S-STATS, S-TEAMSTATS, S-HOMEGAME, S-STATS.sg and S-TEAMSTATS.tplayers. Full length at 393pt unless the id is a scroll state. `capture-log.txt` lists the ids that are app only or today's and not redrawn.

On the Mac, from the helmv3 repo root, with the app running (`npm run dev -- -p 3100`):

```
node design-refresh/stats-home/capture/capture.mjs --list
```

```
node design-refresh/stats-home/capture/capture.mjs --id S-STATS.sg --state default
node design-refresh/stats-home/capture/capture.mjs --id S-STATS --state all
node design-refresh/stats-home/capture/capture.mjs --id all --state default
```

Stills land in `screenshots/<ID>__<state>__{design,app}__{light,dark}.png`. Pair them up:

```
node design-refresh/stats-home/capture/capture.mjs --compare
```

Motion, one 07 row or all of them (video plus the frames 07 names, with and without Reduce Motion):

```
node design-refresh/stats-home/capture/capture.mjs --motion M-STATS-01
node design-refresh/stats-home/capture/capture.mjs --motion all --no-video
```

Options: `--side design|app`, `--theme light|dark`, `--length top`, `--base <url>`, `--out <dir>`. Each run writes `capture-log.txt` with what was saved, skipped and failed. A state with no app fixture yet is skipped, not failed, until the PR that needs it adds it.

Paths assume the package sits at `design-refresh/` in the repo, as `BUILD_BRIEF.md` does. One headless Chromium, one page at a time, so it stays light on memory.

## Nick's calls

- **Page head: settled 31 Oct, "Keep as drawn".** No large title on Stats; section names (Overview, Your game, Rounds, Development) stay on the page, an exception to DESIGN_LANGUAGE law 1 for Stats only.
- Still open, built with the recommended default unless he says otherwise: detail pages longer than drawn so nothing is removed (yes), Home sparks to 10 rounds (yes). See `02-PLAN.md`, "Calls for Nick".
