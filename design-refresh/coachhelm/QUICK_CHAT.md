# CoachHelm quick chat from the top bar (lane 5)

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (a short note, no new rows).

This file is the short history. The build package is `README.md` in this folder; start there. Design page: https://claude.ai/artifact/9coRP9KHUfDw9sPE3g1FEq (local copy `redesign/quick-chat.html`). Prep only: no deploys, migrations or flag flips. Nothing here changes what shot tracking collects.

## How it got here

- 31 Oct 13:34: Nick asked for a CoachHelm key in the top right that drops a chat box and runs tasks across the app, with visuals, asking first on practice plans, and saving into folders.
- 14:17: "The dropdown screen looks like shit." The panel was rebuilt in three directions (Glass, From the bar, Sheet).
- 15:10: Nick picked Glass ("I like the glass"), asked that every task fill the right fields and ask when it needs to, and that the motion be smooth, never jittery, slow or choppy. From the bar and Sheet were dropped from the page.
- 15:28 to 15:33: he left the remaining calls to the lane and asked for screen, subscreen and motion detail. That is files 05 to 08.

## Where it lives in today's Clubhouse

- `shell/TopBar.tsx:104`: the Helm key takes `AskSheetButton`'s 44pt slot, after the search pill and before the bell. The bar is otherwise unchanged.
- `shell/AskSheetBody.tsx` becomes the Glass drop-down; same chat hook, saved threads and `lookingAt()` context line.
- Coaches only. Full detail with line numbers: `01-BRIEF.md` §3 and `02-PLAN.md`.

## Settled (defaults Nick can flip, 01-BRIEF §5)

Glass panel; drop-down on phone and desktop; Undo 8 seconds, held on the server so nothing is written or told until it closes (needs the Ask lane's held migration HM1, unapplied); coaches only; live pill on; plans save to "Practice plans" until Documents folders ship (fixed 4 Nov: to any folder by name, default "Practice plans"; 05 Completeness section); a message's Send in the card is the coach's own press, sent under the same hold.

## Where the detail is

| Need | File |
|---|---|
| Every field each task writes, and when it asks | `TASK_FIELDS.md` |
| Every screen and state | `05-SCREENS.md` |
| Sizes, type, colours, contrast | `06-SCREEN-SPECS.md` |
| Every move | `07-MOTION.md` |
| Pass or fail | `08-ACCEPTANCE.md` |
| PRs QC0 to QC6 | `02-PLAN.md` |
| What it shows and where from | `03-DATA-CHECKS.md` |
| Shots, clips, motion check | `capture/capture.mjs` (commands in `README.md`) |

## Completeness pass, 4 Nov 2026

4 Nov: completeness pass. Folders are names (not N-10 folder ids), a plan needs a practice event, the quick chat never publishes, and the plan kind saves at once with a real Undo. Details: 05's section of this name.
