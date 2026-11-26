# CoachHelm practice plans: build package

CoachHelm builds a practice plan from Ask and inside the Practice builder: it asks what the coach wants, reads the team's numbers with a picture for each read, writes the plan block by block with a Why for each, then saves to a folder and publishes with a confirm step. Players get only their group's part. Lane 6, decided by Nick on 31 Oct; final polish 3 Nov.

Prep only. No deploys, migrations or flag flips. Build behind `coachhelm_practice_plans_v1`, off everywhere. Saving, publishing, the builder helper and the player side also wait on the Practice tab (N-00) and its held migrations.

## Start here

The build contract is 05 to 08, under `../../redesign-package-src/ACCEPTANCE-SHARED.md` (SHARED-1 to 12). Where an older file differs, 05 to 08 win. Read in this order:

1. `01-BRIEF.md`: the problem, what changes, what must not change, done when.
2. `redesign/coachhelm-practice.html`: open it in a browser. It is the drawing, and it runs: phone and Mac prototypes for Ask, the format flow, the builder and the player, a Play button for each scene, a motion lab with every interaction, and a live contrast table. A hash such as `#cap-ask-card-dark` lands on one state; add `-xxl` for XXL Text Size and `-rm` for Reduce Motion.
3. `05-SCREENS.md`: every screen, subscreen, sheet, toast and inline state with an ID (S-ASK, S-ASKD, S-DOC, S-FMT, S-BLD, S-BLDD, S-PLY), how you get there, its page link, its preview route, roles and PR, and a state matrix for each.
4. `06-SCREEN-SPECS.md`: measured redlines by component first, then every element of every screen: box, type role, colour token and hex in light and dark, contrast and touch area. It ends with what this pass fixed.
5. `07-MOTION.md`: one row per motion (M-ASK, M-FMT, M-BLD, M-PLY) with trigger, element, property, values, duration, curve, interrupt rule, Reduce Motion, haptic and the frame to check, plus what never animates and the interrupt tests.
6. `08-ACCEPTANCE.md`: pass or fail criteria per screen, per state, per motion and per PR, and the side by side check.
7. `02-PLAN.md`: the file-by-file plan against today's code, PP0 to PP9, with the defaults in §0.1.
8. `03-DATA-CHECKS.md`: where every figure comes from, what is real, what has no source yet.
9. `04-FIDELITY-SPEC.md`: page tokens to app tokens, every contrast pair, components to app files, and where the build differs from the page on purpose.

`COACHHELM_PRACTICE_PLAN.md` is the 31 Oct plan. Keep it for its reasoning; the files above replace its values.

## Files

| File | What it is |
|---|---|
| `01` to `08` | The brief, plan, data checks, fidelity spec and the build contract |
| `redesign/coachhelm-practice.html` | The design page, standalone, the same as the published page |
| `coachhelm-practice.html` | The older 31 Oct copy of the page. Use the one in `redesign/` |
| `capture/capture.mjs` | Playwright: stills by screen ID and state, motion clips by motion ID, side by side sheets |
| `capture/extract.js` | Reads the page's computed styles for every capture state (the source of 06 and the contrast table) |
| `capture/contrast-table.md` | Every measured text and background pair, light and dark |
| `screenshots/design/` | Design stills for every drawn state, light and dark (`<ID>__<state>__design__<theme>.png`) |

## Commands (on the Mac, from the helmv3 repo root)

```
node <package>/capture/capture.mjs --list
node <package>/capture/capture.mjs --id S-ASK.plan-card --state ready
node <package>/capture/capture.mjs --id S-ASK.plan-card --theme dark --xxl
node <package>/capture/capture.mjs --motion M-ASK-11
node <package>/capture/capture.mjs --all --side design
```

The app side needs the app running in dev (`npm run dev -- -p 3100`) with the preview routes from `02-PLAN.md` §2.5. The design side needs nothing. One browser and one page at a time, to keep memory low on the laptop.

## Decided calls

- Nick's four: ships with the Practice tab after slices 1 to 5; players don't see Why lines; a draft is coaches only in Documents; drills come only from the team bank and the GolfHelm library.
- Fifteen defaults Nick can flip are listed in `04-FIDELITY-SPEC.md` §6. The first twelve have their reasons in `02-PLAN.md` §0.1, and the last three in 04 itself.
- Anything that pushes, posts, deploys, applies a migration or flips a flag waits for Nick.
