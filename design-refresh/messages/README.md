# Start here: Messages build package (BUILD_BRIEF PR 11)

Nick reviewed the Messages design on 31 Oct ("Dude this looks great. Make sure the motion is pristine") and asked that the build look and move exactly like it ("what is the point of redesigning it if it's not gonna actually look like that"). This folder is everything a Claude Code agent needs to build it to match. Prep only: no deploy, no migration, no flag flip.

Read in this order. The build contract (05 to 08, written 3 and 4 Nov to `../BUILD_CONTRACT_STANDARD.md`) comes first and wins wherever an older file differs. `SETTLED-4NOV.md` lists the 30 calls made while writing it and the page changes in versions 13 to 15; 06, 07 and 08 cite it by number:

- `05-SCREENS.md`: every screen ID (`S-MSG…`), how you get there, its design link and app route, roles, PR, and a state matrix per ID.
- `06-SCREEN-SPECS.md`: every element measured off the page: box, type, token with light and dark hex, contrast, icon, 44pt hit area, data field, and a redline per screen.
- `07-MOTION.md`: one row per motion (`M-MSG-01` to `33`): trigger, what moves, from and to, spring or curve and its token, interrupt rule, Reduce Motion version, the check.
- `08-ACCEPTANCE.md`: pass or fail criteria per screen and per PR, and the side-by-side method.

Then:

1. `redesign/clubhouse-messages.html`: the approved design page. Open it in Chrome. It holds a live phone and desktop prototype (tap, type, send, hold, react, vote, attach, open details), the motion lab with a Replay button per animation, the bubble anatomy, a live contrast table, the code map and the research. Every state has its own link (below).
2. `01-BRIEF.md`: what Messages is for, what changes, what must not, and when it's done.
3. `04-FIDELITY-SPEC.md`: the exact copy rules. Token map, type, spacing, every component's numbers, safe areas, the states and sub pages, every tap, hold and swipe, every animation with its spring, trigger, interrupt rule and Reduce Motion version, the things that can't be built as drawn with the fix for each, and the fidelity check a PR must pass.
4. `redesign/redesign.css`: the page's CSS. Part 1 is the base, part 2 the Clubhouse fit and today's top bar, which win where they overlap. Copy values from here.
5. `redesign/prototype.js`: the page's script. The motion code (live-start, carry, spring scroll, hold hand-off, sheet drag) is the reference for every interrupt rule. The spec's section 10 indexes it by line.
6. `02-PLAN.md`: file by file against helmv3 `main` 75b4956, with the PR split, what to keep, restyle or delete in each component, files that must not change, risks and tests.
7. `03-DATA-CHECKS.md`: every field on every Messages screen, where it comes from, and the few things the design draws that have no source yet.
8. `capture/capture.mjs`: screenshots of the design and the app, state by state, side by side, plus motion clips and the design's own motion check.

Also in the parent folder: `DESIGN_LANGUAGE.md` (the shared language), `BUILD_BRIEF.md` (PRs 1 to 12; Messages is PR 11, built on PR 1's tokens and PR 7's class-year avatars).

## State links

Each state opens straight from the address:

```
clubhouse-messages.html#<state>-<phone|desk>-<light|dark>[-reduce][-xxl][-w430][-shot]
```

- `reduce` turns on Reduce Motion, `xxl` sets the largest Text Size (scale 23/17 = 1.353, `lib/dynamic-type.ts`), `w430` draws the 430 pt phone.
- `shot` frames the device alone at the app's own size (390×844, 430×932 or 1440×900) with no safe areas, the way the app renders in a desktop browser. Use it for side-by-side shots.
- `#motion-check` runs the page's own interrupt test in the browser (11 cases). Version 13 passes all 11 in headed Chrome 156 on the Mac (`screenshots/reference/motion-check-v13-chrome-11-of-11.png`). Run it headed at 60 Hz or better: headless Chromium on a loaded machine drops frames and fails two or three cases on any version.

The 34 states (page version 15): `inbox`, `unread`, `rowtyping`, `longinbox`, `loading`, `rowmenu`, `pinlimit`, `thread`, `team`, `typing`, `grouptyping`, `times` (phone only), `failed`, `long`, `datepill`, `jump`, `toast`, `attach`, `file`, `reply` (the reply chip above the field), `edit`, `pollnew`, `hold`, `holdseen`, `react`, `seen`, `poll`, `votes`, `details`, `groupdetails`, `mute`, `empty`, `new`, `fresh`. Which screen ID each belongs to is in `05-SCREENS.md`. `-w1280` (with `-shot`) frames the desktop at 1280 x 800.

Examples: `#thread-phone-light`, `#votes-desk-dark`, `#hold-phone-light-xxl`, `#details-desk-light-shot`.

## Screenshots and clips

`capture/capture.mjs` takes the IDs from 05 and 07. On the Mac, from the repo root, with the package at `design-refresh/messages/` and one dev server running (`npm run dev -- -p 3100`):

```
node design-refresh/messages/capture/capture.mjs --list
node design-refresh/messages/capture/capture.mjs --id all --side design
node design-refresh/messages/capture/capture.mjs --id S-MSG.thread --state thread-phone-w430
node design-refresh/messages/capture/capture.mjs --motion M-MSG-07
node design-refresh/messages/capture/capture.mjs motion
```

Shots land in `screenshots/<ID>__<state>__{design,app}__{light,dark}.png`, clips in `clips/<M-ID>__{design,app}[__reduce].webm`. A state is `<route>-<phone|desk>[-w430|-xxl|-w1280]`. Clips need Playwright's ffmpeg once (`npx playwright install ffmpeg`). Until PR 11a adds the preview fixture (`?state=design&view=<route>`, and `&play=<demo>` for clips), the app side can only shoot `inbox` and `thread`; the rest are listed as not reachable yet, which is the honest "before". The older `design`, `app`, `compare` and `clips` modes still work. One headless Chromium, one page at a time, closed as it goes, so it stays light on the laptop's memory.

`screenshots/before/` and `screenshots/after/` hold the first shots from version 6 of the page; `screenshots/reference/` has the motion check passing. Replace them with `--id all`.

## Calls already made

- Nick, 31 Oct: no Announcement row and no Camera row in the + menu (Photos, File, Poll); pins sync across devices, as its own held PR 11h (`pin-sync/PIN-SYNC.md`); typing is tracked, so dots show on rows and pins and groups name the typer; `send`, `pop` and `lift` are signed off "as long as it's smooth" (they must pass the motion check).

- The top bar stays exactly as today's app (Nick, 31 Oct: "the top bar doesn't match my actual app"; the page was fixed to match).
- A reaction is the opposite colour of its bubble, your own with the champagne ring (owner, 8 Oct).
- An arrival has its full height at once; the thread above never moves except by transform (owner rule B7, 31 Oct).
- The sent bubble is flat green with a lit top edge and a shadow in place of today's gradient, because text can't sit on a gradient; Nick approved the page with it.
- Hold opens at 450 ms with 10 px slop, today's timing. Swipe right to reply stays.
- No count-ups and no staggers (design language).

## Open for Nick (none blocks the build)

Nothing. Every call is answered or settled as a default he can flip (pin sync defaults D1 to D9 in `pin-sync/PIN-SYNC.md` section 3).

