# CoachHelm Lenses: build package

The coach's view of one player and the player's own CoachHelm, redesigned as one file per player with a lens to see it as the player does. Decided by Nick on Oct 31 ("All four on Lenses").

Prep only. No deploys, migrations or flag flips. Build behind `coachhelm_player_file_v1`, off everywhere. Nothing here needs a migration.

First, on its own: PR 0 in `02-PLAN.md` section 13 fixes a live leak where the coach's Deep dive can show a player's private goals.

## Start here

The build contract is 05 to 08, under `../ACCEPTANCE-SHARED.md` (SHARED-1 to 12). Where an older file differs, 05 to 08 win. Read in this order:

1. `01-BRIEF.md`: the problem, the four decided changes, what must not change, done when.
2. `redesign/coachhelm-lenses.html`: open it in a browser. It is the drawing, and it runs: tap rows, flip the lens, open sheets and the More menu, press Play on each motion, switch state, theme, device and text size. A hash such as `#file-phone-lens-dark` lands on a state (05 "Page hash tokens").
3. `05-SCREENS.md`: every screen and subscreen with an ID (S-LIST, S-FILE and its rail, lens, focus, undo, read, plan, more and toast, S-BOARD and its focus and read), how you get there, the page link and preview route, and a state matrix for each.
4. `06-SCREEN-SPECS.md`: redlines per screen: token map, type roles, every size and gap, hit areas, light and dark values.
5. `07-MOTION.md`: M-LNS-01 to 28, one row per motion with trigger, property, duration, curve, interrupt rule, Reduce Motion and haptic, plus what never animates.
6. `08-ACCEPTANCE.md`: pass or fail criteria per screen, per motion and per PR, and the side by side check.
7. `02-PLAN.md`: file by file plan against today's code (PR 0 to PR 6), with fixtures and preview routes. Section 13 is the final word where it differs from the sections above it.
8. `03-DATA-CHECKS.md`: where every figure comes from, what's real on staging, and what has no source yet.
9. `04-FIDELITY-SPEC.md`: the first spec. Kept for its reasoning; 05 to 08 replace its values, motion and capture steps.

Also read `../DESIGN_LANGUAGE.md` for the house rules this package follows. Where it and today's app primitives disagree on motion, 07 says which wins and why.

## Files

| File | What it is |
|---|---|
| `05-SCREENS.md` to `08-ACCEPTANCE.md` | The build contract (above) |
| `redesign/coachhelm-lenses.html` | The design page, standalone (v6, same as the published page) |
| `redesign/redesign.css` | The page's CSS pulled out, each block mapped to its app home |
| `capture/capture.mjs` | Playwright script: stills by screen ID and state, motion clips by M-LNS ID, side by side sheets |
| `capture/contrast.js`, `capture/contrast-table.md` | The contrast check and its results for every text and non-text pair in 06, light and dark |
| `screenshots/` | Where the script writes |

## Commands (on the Mac, from the helmv3 repo root)

```
node <package>/capture/capture.mjs --list
node <package>/capture/capture.mjs --id S-FILE --state default
node <package>/capture/capture.mjs --id S-FILE.read
node <package>/capture/capture.mjs --motion M-LNS-04
node <package>/capture/capture.mjs --compare
```

The app side needs the app running in dev (`npm run dev -- -p 3100`) with the preview routes from `02-PLAN.md`; the design side needs nothing. One browser, one page at a time, phone 402 (plus 390 and 430 where a state asks) and desktop 1280, to keep memory low. `--theme` and `--side` shoot one theme or one side. 08 Part 4 says what to do with the output.

## Decided calls

- One file per player replaces the chip strip card and the separate Deep dive and Standing coach pages.
- "As {first name} sees it" lens for coaches.
- The coach's plan for the player is coach only, in its own words.
- Players see the team average, never teammates by name.
- Reduce Motion is the app's 180ms fade, `CH_FADE_MS` (SHARED-6).
- Players compare against the PGA Tour and team averages only, no teammate dots (Nick, Oct 31; spec 8 G).
- Every other open call was settled as a default Nick can flip: spec section 10.
- The coach's plan is edited in a sheet on the file with the existing `setIntent` (spec 8 K).
