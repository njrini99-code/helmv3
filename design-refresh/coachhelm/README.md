# Start here: CoachHelm quick chat build package (BUILD_BRIEF PR QC0 to QC6)

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (a short note, no new rows).

Nick asked on 31 Oct for a CoachHelm key in the top right that "drops a little chat box and it can execute tasks across the app". He picked the Glass panel ("I like the glass"), asked that every task fill in exactly the right fields and ask when it needs to ("They need to be accurate though"), and that the motion be "smooth and buttery and not jittery or slow or choppy". He then asked for screen-by-screen detail on design, motion and subscreens, "more detail than just a 500 word Md". This folder is that package. Prep only: no deploy, no migration applied, no flag flipped.

## Read in this order

1. `redesign/quick-chat.html`: the approved design page (also at https://claude.ai/artifact/9coRP9KHUfDw9sPE3g1FEq). Open it in Chrome. It has the live phone and desktop prototype, the four task demos (event, message, qualifier, plan), the motion lab, and a link for every state (below).
2. `01-BRIEF.md`: what Nick asked for, what changes, where it lives in today's code, how fields stay right, the seven settled calls and how to flip each, the rules every PR keeps, and what done means.
3. `TASK_FIELDS.md`: every field of every task type and where its value comes from (fixed, from the screen, read, said by the coach, or asked). Shared with the Ask lane. It wins over the page on any field.
4. `05-SCREENS.md`: every screen, subscreen, card, menu and state, each with an ID (S-KEY, S-PANEL, S-RUN.steps, S-TASK.qual, S-RCPT.told and so on), its design link, its app route and its PR. States the page doesn't draw (loading, offline, stream error, keyboard up, long text, many items, partial failure) have written build rules there.
5. `06-SCREEN-SPECS.md`: per ID, every element's box, type, colour token with light and dark hex, contrast, icon, hit area and data field.
6. `07-MOTION.md`: one row per move (M-OPEN, M-CLOSE, M-STEPS, M-LAND-cal, M-UNDO-ring and the rest): trigger, property, from and to, duration, spring or curve, delay, what interrupts it, the Reduce Motion version, the haptic and the clip that checks it. Also the never-animate list.
7. `08-ACCEPTANCE.md`: pass or fail criteria per screen ID and per PR, built on the shared `ACCEPTANCE-SHARED.md` (SHARED-1 to SHARED-12), plus the side-by-side and motion-check rules.
8. `02-PLAN.md`: the PR split QC0 to QC6 against helmv3 `main` 75b4956, file by file, the files that must not change, and what waits on the Ask lane (AK1, AK4 with its held migration HM1, AK9, AK11).
9. `03-DATA-CHECKS.md`: every value the panel shows, its source, and the preview fixture value that proves it.
10. `capture/capture.mjs`: design and app shots by ID and state, side-by-side sheets, motion clips, and the in-page motion check.

`04-FIDELITY-SPEC.md` is a one-page summary of 05 to 08 for a reviewer. `QUICK_CHAT.md` is the short history of the lane. `AGENT_KIT.md` is the coach CoachHelm kit shared with the other lanes.

Also in the parent folder: `DESIGN_LANGUAGE.md`, `BUILD_CONTRACT_STANDARD.md`, `ACCEPTANCE-SHARED.md` and `BUILD_BRIEF.md`.

## State links

Every state opens straight from the address, and the page sets `body[data-qc]` when it gets there:

```
quick-chat.html#<state>-<phone|desk>-<light|dark>[-w390|-w430][-xxl][-reduce][-shot]
```

- `phone` is 402×874; `-w390` and `-w430` draw the 390 and 430 phones. `desk` is 1280×800.
- `-xxl` sets the largest Text Size (`--k` 1.36). `-reduce` runs every move as its Reduce Motion version. `-shot` shows the device alone, for side-by-side shots.
- States: `hello`, `closed`, `steps`, `asking`, `asking-qual`, `confirm-cal`, `confirm-msg`, `confirm-qual`, `confirm-plan`, `folder`, `receipt-<kind>`, `told-<kind>`, `undone-<kind>`, `failed-<kind>` (kind is `cal`, `msg`, `qual` or `plan`), `cancelled`, `stopped`, `live`, `live-work`.
- `#motion-check` runs the six in-page motion tests: close mid-open starts where the panel is; open mid-close starts where the panel is; open holds frame rate; panel height is fixed through a whole task; only transform and opacity animate; Reduce Motion is opacity only at `CH_FADE_MS` (180ms today) or less. It writes `window.__motionCheck` and sets `body[data-motion-check]` to `pass` or `fail`.

Examples: `#confirm-qual-phone-light`, `#told-msg-desk-dark`, `#asking-qual-phone-light-w390-xxl-shot`, `#live-work-phone-dark`.

The app side, once QC0 lands: `/clubhouse-preview/calendar?qc=<state>` opens the panel at the same state over the coach Calendar, with fixtures that match the page (11 active players, Travel squad of 6, Lonnie Poole with three saved tees). `&play=<move>` runs a move from that state for clips.

## Screenshots and clips

These are made on the Mac, because the planning session can't run a browser. One headless Chromium, one page at a time, closed as it goes, so it stays light on the laptop. From the repo root, with this package at `design-refresh/coachhelm/`:

```
npm run dev -- -p 3100
```

Design only (no dev server needed), then one screen on both sides:

```
node design-refresh/coachhelm/capture/capture.mjs --side design --all
node design-refresh/coachhelm/capture/capture.mjs --id S-TASK.qual --state default
```

After each PR, shoot that PR's IDs, pair them, and check the motion:

```
node design-refresh/coachhelm/capture/capture.mjs --id S-PANEL
node design-refresh/coachhelm/capture/capture.mjs --compare
node design-refresh/coachhelm/capture/capture.mjs --motion M-OPEN
node design-refresh/coachhelm/capture/capture.mjs --motion-check
```

Shots land as `screenshots/<ID>__<state>__{design,app}__{light,dark}.png`, sheets in `screenshots/compare/`, clips as `clips/<M-ID>__{design,app}[__reduce].webm`. `--all` and `--motion all` are long; run them once before review, not after every change. Until QC0 adds `?qc=`, the app side can't reach the panel, and each app shot is listed as failed, which is the honest "before".

## Calls already made

Nick left the remaining calls to the lane on 31 Oct ("Handle any other questions they have", "Whatever you think is best idk"). Each is built as a default that one constant or flag changes (01-BRIEF §5):

- Glass panel (his pick). Drop-down on phone and desktop (`QUICK_CHAT_PHONE_MODE`).
- Undo is 8 seconds and real: the write is held on the server, players are told only after it closes (`UNDO_HOLD_MS`). This needs the Ask lane's held migration HM1, which stays unapplied until Nick says so; flags stay off until then.
- Coaches only. Live pill on when the panel closes mid-task (`LIVE_PILL`).
- Plans save to "Practice plans" until Documents folders ship (`DEFAULT_PLAN_FOLDER`). (fixed 4 Nov: plans save to any folder name, default "Practice plans"; folders are names in `golf_documents.folder` and don't wait for N-10. See 05's Completeness section.)
- A message's Send button in the card is the coach's own press, sent through `sendGolfMessage` under the same 8 second hold (`QUICK_CHAT_SEND_IN_CARD`).
- The green bar stays exactly as today's, with the Helm key in the sparkle's 44pt slot.

## Open for Nick

Nothing blocks the build. HM1 is the one step that needs his yes, and only when the lane is ready to ship.

## Completeness pass, 4 Nov 2026

This pass added rows to 05, 06, 07, 08, 02, 03, TASK_FIELDS and AGENT_KIT (each file's section of this name), and fixed rows in place, each marked "(fixed 4 Nov: ...)". The log of every in-place fix is the first table in 05's section. Criteria CP-QC-1 to CP-QC-32 are in 08.
