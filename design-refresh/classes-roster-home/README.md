# Start here: Classes, Roster and coach Home build package

Nick approved all three screens on 31 Oct. This folder is everything a Claude Code agent needs to build them so they look and move exactly like the approved design. Prep only: no deploy, no migration, no flag flip.

Read in this order:

1. `redesign/clubhouse-phone-redesign.html`: the approved design page. Open it in a browser. Tabs switch screens; the control bar switches phone and desktop, light and dark, coach and player, Text Size, Reduce Motion, and the State (normal, early season, loading, empty, failed, long names, big roster). Every view has a link (see the spec, section 1).
2. `01-BRIEFS.md`: what each screen is for, what changes, what must not, and when it's done.
3. `04-FIDELITY-SPEC.md`: the exact copy rules. Token map, type, spacing, every component's numbers, every state and sub page, every tap and where it goes, every animation with its curve and its Reduce Motion version, the list of things that can't be built as drawn with the fix, and the fidelity check a PR must pass.
4. `redesign/redesign.css`: the page's own CSS, section by section, mapped to app files. Copy values from here.
5. `02-PLAN.md`: file by file and line by line against helmv3 `main` 75b4956, with the PR order, files that must not change, risks and tests.
6. `03-DATA-CHECKS.md`: every figure on the three screens, its source field and formula, and the staging spot checks.
7. `capture/capture.mjs`: screenshots of the design and the app, state by state, and side-by-side compares.

Also in the parent folder: `DESIGN_LANGUAGE.md` (the shared language), `BUILD_BRIEF.md` (PRs 1 to 12; these screens are PRs 7, 8, 9 and 10) and `CLASSES_ROSTER_HOME_IMPLEMENTATION.md` (the earlier implementation notes).

## Screenshots

`screenshots/before/` has Nick's own iPhone shots of today's screens (the Roster one is the player view) and the Stats screen as the reference for the green bar.

The rest are made on the Mac, because a headless browser can't run in the planning session:

```
npm run dev -- -p 3100
```

```
node design-refresh/classes-roster-home/capture/capture.mjs design --out design-refresh/classes-roster-home/screenshots/after
node design-refresh/classes-roster-home/capture/capture.mjs app --out design-refresh/classes-roster-home/screenshots/before
```

After each PR, shoot the branch and compare it with the design:

```
node design-refresh/classes-roster-home/capture/capture.mjs app --out design-refresh/classes-roster-home/screenshots/built --only roster
node design-refresh/classes-roster-home/capture/capture.mjs compare --a design-refresh/classes-roster-home/screenshots/built --b design-refresh/classes-roster-home/screenshots/after --out design-refresh/classes-roster-home/screenshots/compare
```

Paths assume the package sits at `design-refresh/` in the repo, as `BUILD_BRIEF.md` does; point them at wherever it is. One headless Chromium, one page at a time, so it stays light on memory. States the app has no fixture for yet (`classes?state=long`, `roster?state=early`, `long`, `big`) are listed as failed until the PR adds them.

## Nick's calls (settled 31 Oct: "Go with your picks")

- Practice rounds stay out of scoring averages, leaders and the top five.
- No Captain tag until there's a captain field.
- A plain "Injured" chip, no return date.
- Classes shows no finals, holidays or next week's travel until they have a source; only the term end and this week's events.
- Home's bar and hero are one green (shell.css 1306 to `--ch-frame`); player Home's bar changes with it.
- The desktop "Needs a look" strip goes; the leader card replaces it.

The design page (version 6) draws all six, and `04-FIDELITY-SPEC.md` section 8 records them.
