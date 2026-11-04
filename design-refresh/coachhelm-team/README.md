# CoachHelm Team (the hole): build package

The coach's CoachHelm team board, redesigned as a golf hole: where the team gives back strokes to Tour, who loses each spot, and every open read about it. Nick on Oct 31: "I love this. Fix the white space in the desktop version. Other than let's polish and rip it."

Prep only. No deploys, migrations or flag flips. Build behind `coachhelm_team_board_v1` (new, off everywhere). Nothing here needs a migration.

## Start here

Read in this order:

1. `01-BRIEF.md`: the problem, what changes, what must not change, the settled calls, done when.
2. `redesign/coachhelm-team.html`: open it in a browser. It is the drawing, and it runs: tap the spots on the hole, open reads and players, assign a focus, open stories, press Play on each motion, switch data state, theme, phone size, text size and desktop size. Add a capture link hash (for example `#putt-spot-dark`) to land on a state.
3. `04-FIDELITY-SPEC.md`: every value, state, tap and motion as numbers, plus the side by side check.
4. `05-SCREENS.md`: every screen, sheet, subscreen and inline state, with its ID, design link, preview route and state matrix.
5. `06-SCREEN-SPECS.md`: per screen, every element's box, type, colour token (light and dark hex), contrast ratio, icon, hit area and data field, closed by a redline.
6. `07-MOTION.md`: one row per interaction: trigger, what moves, values, duration, spring or curve, stagger, interrupts, Reduce Motion, haptics, and the clip that proves it.
7. `08-ACCEPTANCE.md`: pass or fail criteria per screen and per PR, and the side by side check. Shared criteria are `SHARED-n` in the zip's `ACCEPTANCE-SHARED.md`.
8. `02-PLAN.md`: file by file plan against today's code, PR by PR, with fixtures and preview routes.
9. `03-DATA-CHECKS.md`: where every figure comes from, the loader caps, what's real on staging, and what has no source yet.

Where 05 to 08 and `04-FIDELITY-SPEC.md` disagree, 05 to 08 win.

Also read `../DESIGN_LANGUAGE.md` for the house rules this package follows.

## Files

| File | What it is |
|---|---|
| `redesign/coachhelm-team.html` | The design page, standalone |
| `redesign/redesign.css` | The device CSS pulled out, each block mapped to its app component |
| `capture/capture.mjs` | Playwright script: design shots, app shots, side by side pairs, motion clips |
| `screenshots/` | Where the script writes (after, before, built, compare, clips) |

## Commands (on the Mac, from the helmv3 repo root)

Set the package path once:

```
PKG=<path to>/clubhouse-handoff/design-refresh/coachhelm-team
```

One screen, design and app side by side (needs the app running, below). Screen IDs and states are in `05-SCREENS.md`:

```
node $PKG/capture/capture.mjs --id S-TEAM.course --state course-all-spot
```

That writes `screenshots/<ID>__<state>__{design,app,compare}__{light,dark}.png`. `--id 'S-TEAM*'` runs every screen. One motion row, design and app, with and without Reduce Motion (motion IDs are in `07-MOTION.md`):

```
node $PKG/capture/capture.mjs --motion M-TEAM-01
```

Design shots only (no app needed):

```
node $PKG/capture/capture.mjs design --out $PKG/screenshots/after
```

App shots and clips need the app running in dev with the preview routes from `02-PLAN.md`:

```
npm run dev -- -p 3100
```

Then, in a second terminal:

```
node $PKG/capture/capture.mjs app --out $PKG/screenshots/built
node $PKG/capture/capture.mjs compare --a $PKG/screenshots/built --b $PKG/screenshots/after --out $PKG/screenshots/compare
node $PKG/capture/capture.mjs clips --out $PKG/screenshots/clips
```

Add `--only desk` (or `read`, `early`, any shot name prefix) to run part of the list. The script runs one headless browser and one page at a time, closing as it goes, to keep memory low.

No screenshots ship in this package yet: the place it was drawn had no browser. The first `design` run fills `screenshots/after`.

## Decided

- The board is the hole; one green feature card per view.
- Every open read per player, up to the Board's caps, replaces the one-read pill strip.
- Assign as focus stays a proposal the player accepts.
- One shared evidence sheet with Lenses (spec 8 B).
- Reduce Motion is a 180ms fade (spec 8 A).
- Huddle trails from each player's first 10 rounds this season, for players with 20 or more (spec 8 D).
- The app's words and rounding win over the drawing: one decimal, Solid, Early and Thin read, the five track record levels, hollow under 5 rounds on file, "This week" (spec 8 H to R).
- PR order: 0a (count only drawn reads as shown), 0 (flag and read-only loader), then 1 to 7 (`02-PLAN.md` section 0).
- A fifth tab, Course, for course, scoring and pressure reads plus the team's scoring history. Nick, Oct 31: "I like having 5th tab with course stuff like reads and perf history and the 4 open reads are good" (spec 8 U).
- Up to 4 open reads per player: 3 needs work, 1 working (Nick, same message).

## Defaults Nick can flip

Nick, Oct 31: "Handle any other questions they have." Each of these is decided and built in, and each flips in one place.

| Default | Flip it in | Spec |
|---|---|---|
| CoachHelm opens on the hole, named Team | `TEAM_BOARD_FIRST_VIEW = 'hole'` in `team-board/flag.ts`, set to `'board'` | 8 Z |
| The Course tab's shape: weekly to-par trend, courses played, team against Tour on par 3s, 4s, 5s, penalties, doubles and the first hole; 3 reads and 4 courses before Show more | `COURSE_TAB` in `team-board/flag.ts`; `COURSE_READS_SHOWN` and `COURSES_SHOWN` in `team-board/course-shape.ts` | 8 U, X |
| "Last 4 weeks" shows only with 6 or more weeks of rounds | `LAST4_MIN_WEEKS` in `course-shape.ts` | 8 X |
| Courses grouped by `course_id`, named by the newest `course_name` | `course-shape.ts` | 8 X |
| Course reads show the app's own titles and folding, no Tour row for single-hole reads | `deliverReads` as is; `TourRow` hides on a null benchmark | 8 Y |
| Text contrast floor 4.9:1; loss text on loss chips uses `--ch-loss-on-tint`; the selected chip is a .10 fill with a .18 ring | `coachhelm-team.css` | 8 AA |
