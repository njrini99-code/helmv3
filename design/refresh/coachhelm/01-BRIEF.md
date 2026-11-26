# CoachHelm quick chat: brief (BUILD_BRIEF PR QC0 to QC6)

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 4 rows).

Design page: https://claude.ai/artifact/9coRP9KHUfDw9sPE3g1FEq (local copy `redesign/quick-chat.html`). Build contract: `05-SCREENS.md`, `06-SCREEN-SPECS.md`, `07-MOTION.md`, `08-ACCEPTANCE.md`. Fields: `TASK_FIELDS.md` (shared with the Ask lane; it wins over the page on any field). Prep only.

## 1. What Nick asked for

- 31 Oct 13:34: a CoachHelm icon in the top right corner "that drops a little chat box and it can execute tasks across the app", with visuals of the task as it runs, practice plans that ask what the coach wants first, and saving into folders.
- 14:17: "The dropdown screen looks like shit." The panel was rebuilt three ways.
- 15:10: "This all looks good I like the glass. We are really going to have to pay close attention to what fields are in each task it completes so it's filling in the correct stuff, if it needs to ask additional questions before completing task that's cool. They need to be accurate though. And there's a lot of animation and motion which I love. We just have to make sure it's smooth and buttery and not jittery or slow or choppy. After this is thought out expertly prepare for implementation."
- 15:29: "Handle any other questions they have." 15:31: "all designed screens need an emphasis on matching designs and motion and animation details and subscreen details… I want more detail than just a 500 word Md." 15:34: "Whatever you think is best idk."

## 2. What changes

1. The sparkle key in the green bar becomes the Helm key (same 44pt slot). The bar is otherwise unchanged.
2. Tapping it pours a Glass panel out of the key: a frosted frame with a lit top edge over a light veil; inside, everything sits on solid surfaces. Phone: 10pt from each side, under the bar, fixed height. Desktop: 432pt wide under the key.
3. Inside: a greeting, four start tiles for the screen the coach is on, the last thing it did today, and the Messages composer.
4. A task runs in the panel: live steps that fold, a question card when the coach's words leave a gap, then a confirm card that draws the real object (the week with the new block, the thread with the draft, the qualifier's rounds and seats, the plan's time bar and blocks), with every value it will write and who will be told.
5. Nothing writes until the coach presses the named primary. Then the object lands where it lives, a receipt shows with an 8 second Undo, and only when Undo closes are players told, shown as their faces lighting up in delivery order.
6. Closing the panel mid-task turns the key into a live pill with the current step, "Needs your OK" at confirm, and "Added" when done.

## 3. Where it lives today (main 75b4956)

- `src/clubhouse/shell/TopBar.tsx:104` renders `<AskSheetButton />` inside `.ch-topbar__actions`, after `<SearchPill />` and before `<Bell />`. The Helm key takes that slot.
- `src/clubhouse/shell/ClubhouseFrame.tsx:174` wraps the app in `<AskSheetProvider pathname search enabled={shell.askAvailable ?? false}>`; `src/clubhouse/data/shell.ts:140-175` sets `askAvailable` from the CoachHelm coach gate.
- `AskSheetBody.tsx` (useDialogLifetime, useSheetDrag, half and full detents, `.ch-asks__panel`, styles in `styles/coachhelm-ask.css`) becomes the Glass drop-down.
- The chat pieces are today's Ask ones in `src/clubhouse/screens/coachhelm/chat/` (`ActionCard.tsx`: `AskActionCard` at :22, `AskReceiptCard` at :157; `Thread.tsx` calls `pendingApproval` at :97). The quick chat uses the Ask lane's rebuilt versions (AK1 steps, AK4 confirm/receipt/Undo hold, AK9 practice brief, AK11 create flows).
- ⌘K is taken by the command layer (`shell/command/CommandLayer.tsx:120`); nothing uses ⌘J, so ⌘J / Ctrl+J toggles the panel.
- Motion: `lib/motion.ts` CH_SPRINGS smooth, settle, reveal; `tokens.css` `--ch-ease-spring-smooth` and the Reduce Motion block. `pour` {visualDuration 0.42, bounce 0} is new (QC0).

## 4. Getting the fields right

`TASK_FIELDS.md` maps every field of 20 task types to where its value comes from: fixed, from the screen, read from data, said by the coach, or asked. The rules that matter most:
- A value the coach didn't say and no read gives exactly one answer for is asked, never guessed. Names resolve to roster ids or are asked. A time zone that differs from the team's is asked once.
- Every value that will be written is on the confirm card, with an "On confirm:" line saying who is told and when.
- The receipt is built from the row read back after the write, not from what was sent.
- The qualifier always asks for rounds, squad size and coach's picks when not said, and offers only the tees saved for that course. Events send `all_day: false` whenever there's a time and carry the team zone's offset.
- Undo is honest: the write is held on the server for 8 seconds (TASK_FIELDS §3), so Undo cancels it before anything exists or anyone is told. Open commits early.

## 5. Settled calls (defaults Nick can flip)

Nick left these to the lane on 31 Oct ("Handle any other questions they have", "Whatever you think is best"). Each is built as a default that is one constant or one flag to change.

| # | Call | Set | How to flip |
|---|---|---|---|
| 1 | Panel style | Glass (Nick's own pick, 15:10) | — |
| 2 | Drop-down on phone too, or today's bottom sheet | Drop-down on phone and desktop | `QUICK_CHAT_PHONE_MODE = 'drop' \| 'sheet'` in the panel; the sheet path is today's `AskSheetBody` |
| 3 | Undo window | 8 seconds, players told after it | `UNDO_HOLD_MS` in the held-run ledger (shared with Ask) |
| 4 | Who gets the key | Coaches only for launch | the key renders only where `askAvailable` and role is coach |
| 5 | Live pill when the panel closes mid-task | On | `LIVE_PILL = true` |
| 6 | Where a plan saves before Documents folders ship | "Practice plans", passed by name; real folders once N-10 lands (fixed 4 Nov: any folder name the team uses, or a new one, passed by name; N-10 is not needed. Default stays "Practice plans" via `DEFAULT_PLAN_FOLDER`) | `DEFAULT_PLAN_FOLDER` |
| 7 | Message send | The card's "Send to 6 players" is the coach's own Send press; it goes through `sendGolfMessage` under the same 8s hold. The Ask tab keeps handing drafts to the Messages composer | `QUICK_CHAT_SEND_IN_CARD` |

## 6. Rules every PR keeps

- Behind `coachhelm_quick_chat_v1`, off in every environment. Flag off renders exactly as main (SHARED-8). Draft PRs only; nothing merged, deployed or flipped by the agent.
- No migration applied. The Undo hold's ledger change is the Ask lane's held HM1; quick chat adds none of its own (SHARED-9).
- The coach sends messages, never the app: every send or post is the coach's own press.
- Nothing changes what shot tracking collects (SHARED-10). Players never see teammates' figures (SHARED-11). Coach-only data stays coach-only.
- DESIGN_LANGUAGE: text on a solid surface, no glass behind data, flat page, no accent left-border cards, amber for failures (never red), contrast at least 4.5:1 aiming for 4.9:1, no tracked caps, no emoji, text follows iPhone Text Size.
- Motion: transform and opacity only (SVG stroke draws are the one exception), no height animation, no entrance staggers on page load, every move interruptible, a `CH_FADE_MS` crossfade under Reduce Motion (180ms today, opacity only, linear) (SHARED-6, SHARED-12).
- One dev server, one browser, at most two subagents on the Mac.

## 7. What done means

Every screen ID and state in 05 matches its design shot in light and dark at 390, 430 and 1280, and at XXL; every motion row in 07 matches its clip on the design page within one frame, and again with Reduce Motion; every criterion in 08 passes with SHARED-1 to SHARED-12; and the flag-off build is pixel-identical to main.

## Completeness pass, 4 Nov 2026

One call changed in place (call 6, folders by name). Calls this pass adds, each a default Nick can flip:

| # | Call | Default | Constant |
|---|---|---|---|
| CP-1 | A plan for a day with no practice | The quick chat adds the practice first (event confirm), then the plan | none |
| CP-2 | The quick chat and publishing | Never publishes; Open plan goes to the plan page, where Publish lives | none |
| CP-3 | Long threads | Fold past 30 turns into "Earlier in this chat · Open full chat" | `QUICK_CHAT_MAX_TURNS` 30 |
| CP-4 | A confirm card left waiting | Expires at the team zone's midnight | none |
