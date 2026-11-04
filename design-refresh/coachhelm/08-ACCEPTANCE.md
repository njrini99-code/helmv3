# CoachHelm quick chat: acceptance

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 32 rows).

> Wiring, 4 Nov 2026: see the section of that name at the end of this file (W-QC-1 to W-QC-15).

Design page: https://claude.ai/artifact/9coRP9KHUfDw9sPE3g1FEq (local copy `redesign/quick-chat.html`). Screen IDs and states: `05-SCREENS.md`. Element values: `06-SCREEN-SPECS.md`. Motion rows: `07-MOTION.md`. Fields: `TASK_FIELDS.md` (wins over the page on any field). Figures: `03-DATA-CHECKS.md`. Where this file and 04 disagree, this file wins (BUILD_CONTRACT_STANDARD).

This file replaces the draft `redesign-package-src/acceptance/quick-chat.md`. The draft's IDs (S-QC.key, S-QC.panel and so on) are renamed to 05's, its values are brought up to the current page (the panel now scales out of the key rather than unclipping a capsule; content rises 30ms apart; close is 220ms), and its open items are settled as defaults Nick can flip (01-BRIEF §5): Glass only; drop-down on phone and desktop; Undo 8 seconds held on the server; coaches only; live pill on; plans save to "Practice plans" until folders ship; the message card's Send is the coach's own press under the same hold.

How to read a criterion: each is a fact a reviewer marks pass or fail. "Check" says how: **S** a screenshot pair from `capture.mjs --id <ID> --state <state>`, **D** a DOM or unit test, **U** a server test, **C** a motion clip from `capture.mjs --motion <M-ID>`. "(add)" means the state is not in capture.mjs's SHOTS table yet: add a row.

## Shared criteria

SHARED-1 to SHARED-12 (`ACCEPTANCE-SHARED.md`) apply to every PR in this lane and are not repeated. Lane notes on five of them:

- SHARED-1 (bar unchanged). The Helm key replaces the sparkle in the same 44pt slot, and the live pill grows out of it. The bar pixel diff against main masks the 44×44 key slot, and on `live` and `live-work` the pill's box. Every other pixel of the bar band is unchanged.
- SHARED-2 (no gradients). The page's primary button, send button and header mark are flat (fixed 3 Nov). The only gradients are the moving sheens on the active step label and on skeleton bars; they are motion, not a surface, never sit under readable text at rest, and stop under Reduce Motion.
- SHARED-5 (XXL). The page's `-xxl` sets `--k` 1.36, the same factor as `--ch-type-scale` 1.36, so the side-by-side XXL shots compare like for like. The panel's height doesn't grow with Text Size; its body scrolls.
- SHARED-6 (Reduce Motion). The panel's content rise (8pt, 30ms apart) is the one stagger 07 lists. It runs on the coach's tap, never on page load, and is gone under Reduce Motion. Every Reduce Motion fade in this lane is the shared `CH_FADE_MS` from `lib/motion.ts` (180ms today, opacity only, linear), not 120ms; START_HERE's shared values table wins over any lane file.
- SHARED-7 (page edge). The panel is a floating layer, so its own 10pt side inset applies on phone, not the 16/20 page edge. Cards inside keep the panel body's own padding (06).

## Common states

Every screen ID below is checked in these states unless its own section says "n/a". Phone 402 is the page's default frame; the app is shot at 390 and 430 as well.

| State | Design anchor suffix | Rule |
|---|---|---|
| default | `-phone-light` | As drawn, fixture `default` (03) |
| dark | `-phone-dark` | Dark tokens, 06 |
| XXL | `-xxl` | Nothing clips or overlaps (SHARED-5); the panel stays its fixed height |
| Reduce Motion | `-reduce` | 07 Reduce Motion column |
| phone 390 | `-w390` | Same panel insets; height 700 fits (104 + 700 < 844) |
| phone 430 | `-w430` | Same |
| desktop | `-desk-light`, `-desk-dark` | 432 panel under the key |
| player | n/a on the page | No key, no panel, no live pill in a player's DOM (SHARED-11) |

## Per screen

### S-KEY (and .working, .flag)

- AC-QC-KEY-01. The key is a 44×44 button in the bar's actions slot where `AskSheetButton` is today (`TopBar.tsx:104`): on phone before the bell or the page's own action, on desktop between the search pill and the bell. Check: D (DOM order), S `closed`.
- AC-QC-KEY-02. The mark is the 24pt Helm wheel, stroke 1.7, round caps, in the bar's icon ink; at least 3:1 on the bar in both themes (SHARED-4, non-text). Check: D (computed size and contrast), S.
- AC-QC-KEY-03. Open: the ivory disc shows inset 4, radius 18, and the key has `aria-expanded="true"`, `aria-controls` the panel, and the label "CoachHelm". Check: D, S `hello`.
- AC-QC-KEY-04. Working (S-KEY.working): the wheel turns on a 2.4s loop while a step runs with the panel open, stops at confirm, and doesn't turn under Reduce Motion. Check: C `M-KEY-work`, D.
- AC-QC-KEY-05. Needs you (S-KEY.flag): a 9pt champagne flag at top 7, right 7 with a 2pt bar-colour ring shows after the live pill shrinks while a task waits; it clears when the panel opens. Check: C `M-KEY-flag`, S `live` then 2s (add `flag`).
- AC-QC-KEY-06. Press gives `haptic('press')` (fixed 4 Nov: was `select`; 07 Haptics, which owns haptics, says `press`, light impact, and notes that today's key fires `select`). Check: D (spy).
- AC-QC-KEY-07. Flag off, or the coach gate not passed: today's sparkle `AskSheetButton` renders and the bar is byte for byte main (SHARED-1, SHARED-8). Flag check still loading: the sparkle shows; the key never waits on data. Check: D, S against main.
- AC-QC-KEY-08. Player: no key node in the DOM, and no quick chat request in the network log (SHARED-11). Check: D as the demo player.
- AC-QC-KEY-09. XXL: the mark stays 24pt and the hit target 44 (icons don't scale with Text Size). Check: S `closed-…-xxl`.

### S-LIVE

- AC-QC-LIV-01. Closing the panel while a run is going turns the key into a 36pt capsule (radius 18, fill #06231a, 1px champagne ring at 28%) that grows left from the key's centre, with an 18pt spinner and the current step label, 13.5pt semibold, one line. Check: C `M-LIVE`, S `live-work`.
- AC-QC-LIV-02. At confirm the pill shows the champagne dot and "Needs your OK"; after a write lands with the panel closed it shows the check and "Added", "Sent", "Set" or "Saved", then shrinks into the key after 1.8s. Check: S `live`, C `M-LIVE`.
- AC-QC-LIV-03. A failed write shows an amber dot and "Didn't go through", and stays until the panel opens. Never red. Check: D (add fixture `live-failed`).
- AC-QC-LIV-04. The label is one line, max 172pt wide on phone and 260 on desktop, ellipsis at the end. The bar title keeps the width it has today at 390, 430 and 1280; the pill never covers it. Check: D (bounding boxes with the longest step label from the fixtures), S `live-work-…-w390`.
- AC-QC-LIV-05. Tapping the pill opens the panel at the running task and the pill becomes the key again. Check: D.
- AC-QC-LIV-06. Reduce Motion: no scale or width spring; the pill crossfades in, between labels and out over `CH_FADE_MS` (180ms today); the spinner stops. Check: C `M-LIVE` reduce.
- AC-QC-LIV-07. With `LIVE_PILL = false`, closing mid-task leaves the key with its flag instead. Check: D.

### S-PANEL

Frame
- AC-QC-PNL-01. Phone: left and right 10, top 104, height 700 (fixed), radius 32, a 36×5 grab bar at 35% ink-3, 8pt above the header. Check: D (computed box), S `hello`.
- AC-QC-PNL-02. Desktop: 432 wide, right 14, top 62, height 640, radius 26, no grab bar. Check: D, S `hello-desk`.
- AC-QC-PNL-03. Glass: the frame's fill and blur, the lit top edge and the two-layer shadow are the page's `--a-pglass`, `--a-pglass-hi` and `--a-pshadow` values in each theme (06). The scrim is `--a-veil` alone, with no blur (06 fix f), so nothing fades a blurred layer. Check: D (computed style).
- AC-QC-PNL-04. The glass is only the frame and the header: the scrolling body is a solid card sheet 6pt in from the frame's sides, radius 20, so every step, reply line, greeting, tile, card and receipt sits on solid; the composer pill is solid. A DOM walk finds no text below the header whose nearest background has alpha under 1. The header's title and context line meet SHARED-4 over the worst backdrop 06 lists. Check: D, S.
- AC-QC-PNL-05. The panel's height never changes from open to close through a whole task, at every width and at XXL; content scrolls inside it. Check: D (ResizeObserver over the `whole` play records 0px), the page's motion check test 4.
- AC-QC-PNL-06. Phone with the keyboard up: height is `min(700, keyboardTop − 104 − 8)` and the composer stays visible. Check: D (visualViewport stub).
- AC-QC-PNL-07. Closes on the key, a scrim tap, ×, Escape, ⌘J or Ctrl+J (toggles), and a swipe up on the header or grab bar on phone. Closing never cancels a run or a held write. Check: D (each path), U (a held run still commits after close).
- AC-QC-PNL-08. It's a dialog: `role="dialog"`, labelled "CoachHelm", focus moves to the composer field on open and back to the key on close, and Tab stays inside while it's open. Check: D.
- AC-QC-PNL-09. `QUICK_CHAT_PHONE_MODE = 'sheet'` renders today's `AskSheetBody` bottom sheet on phone and the drop-down on desktop, with no other change. Check: D.

Header (part of S-PANEL)
- AC-QC-PNL-10. Padding 18 14 12 20, gap 12; mark tile 36×36, radius 12, flat #155a39 with a lit top edge, 22pt mark; "CoachHelm" 17/1.2 weight 600, −0.01em. Check: S, D.
- AC-QC-PNL-11. Context line 13/1.2 ink-2, one line with an ellipsis, a 6pt accent dot with a 3pt tint ring, text from `lookingAt(pathname, search)` ("Looking at Calendar · week of 3 Nov"). Check: D, S.
- AC-QC-PNL-12. Expand ("Open full chat") and × are 34pt round buttons with a 16pt icon, each with a 44×44 hit area. Expand opens today's CoachHelm Ask screen on the same thread with the shared route push (incoming 100% → 0, page behind to −24%, 462ms smooth spring; M-FULL), while the panel folds into the key. Check: D (hit-test box), S, C `M-FULL` in the app only.

States: loading never blocks the open (the hello shows at once; "Earlier today" fades in when it arrives into reserved space); no earlier receipt leaves the block out; a thread load error leaves it out and nothing else changes. Check: D (fixtures `loading`, `empty`, `error`; add).

### S-PANEL.hello

- AC-QC-HEL-01. "What should we get done?" 24/1.15 weight 600, −0.025em, balanced; under it "You confirm everything before it happens." 14.5/1.35 ink-2. Check: S `hello`.
- AC-QC-HEL-02. Four start tiles in two columns, gap 10, each min height 104, padding 12 12 13, radius 16, solid tile fill with a 1px ring; icon square 34×34 radius 11 on the accent tint (year colours are for class years only, 06 fix b); arrow 15pt ink-3 at top 12, right 12; title 15/1.25 weight 600; line 13/1.3 ink-2. Check: S, D.
- AC-QC-HEL-03. The tiles come from `quickStarts(pathname)`: always four, each line names a real object already loaded on that screen, no new fetch (03 §1). Calendar shows practice, message, qualifier and plan as drawn. Check: D (one test per screen), U (no request fires on open).
- AC-QC-HEL-04. Tile press scales to 0.97 in 110ms and back in 280ms on `cubic-bezier(0.22, 1, 0.36, 1)`; a tap starts the same run as typing its request. Check: C `M-TILE`.
- AC-QC-HEL-05. "Earlier today": label 13pt weight 500 ink-2; one row, padding 10 12, radius 14, 24pt tinted check, title 14.5 weight 500, line 12.5 ink-2 naming who was told, time 12.5 ink-3 in tabular figures. Only the latest receipt shows. Check: S, D.
- AC-QC-HEL-06. Long text: tile titles wrap to two lines then ellipsis; tile lines are one line with ellipsis. Check: S `hello-…-xxl`.

### S-PANEL.composer

- AC-QC-CMP-01. Pill radius 26, padding 5, solid tile fill: + (36pt, well) left; field 16pt with the placeholder "Ask CoachHelm or tell it what to do"; mic (36pt, ink-3) and send (36pt, flat accent) right. Every button has a 44×44 hit area. Check: S, D.
- AC-QC-CMP-02. Send is off (well fill, ink-3) until there is text. The field grows to four lines, then scrolls inside; the panel doesn't grow. Check: D.
- AC-QC-CMP-03. While steps run, send is an ink Stop square (11pt, radius 3) labelled "Stop"; the field stays usable and a new message queues after the run. Check: D, S `steps`.
- AC-QC-CMP-04. Desktop only: the hint row "⌘J open · esc close · Saved in CoachHelm", 12pt ink-3 with 11pt keycaps. Check: D (absent on phone), S `hello-desk`.
- AC-QC-CMP-05. Offline: one line above the pill with an amber icon, "You're offline. CoachHelm will send when you're back."; send stays on and the message queues. Check: D (add fixture `offline`).
- AC-QC-CMP-06. Stream lost mid-run: the running step turns amber and the line "Lost the connection. Nothing was saved." shows with Try again. Never red. Check: D (add fixture `stream-error`).

### S-RUN.request

- AC-QC-REQ-01. The coach's bubble sits right, accent fill, max 84% of the body width, radius 19 19 6 19, text wraps with no line limit. Check: S `steps`.
- AC-QC-REQ-02. CoachHelm's reply line is plain text on the panel body's solid surface above the card, one paragraph. Check: S `confirm-cal`.

### S-RUN.steps

- AC-QC-STP-01. Only steps the server announced are drawn (Ask AK1). Labels name the real object in present tense while running ("Checking Thursday on the team calendar") and past tense with the one fact the tool returned when done ("Checked Thursday · lift ends at 2:45"). No tool names, no "Thinking", no percentages. Check: D, U (the stream's step parts).
- AC-QC-STP-02. Rows are at least 32pt, 20pt glyph column, gap 10, label 15/1.3; active row has an 8pt accent dot breathing on 1.2s and a sheen across its label; done rows go ink-2 and their check draws in 240ms. Check: C `M-STEPS`, S `steps`.
- AC-QC-STP-03. When the card is ready the list folds to "N steps · Ns" (count and wall time, whole seconds); a tap reopens it in place. Check: C `M-STEPS-fold`, D.
- AC-QC-STP-04. More than six rows: the oldest done rows fold into "N more steps" at the top. One step still folds to "1 step · Ns". Check: D (add fixtures).
- AC-QC-STP-05. A failed step shows its own past-tense failure in amber ("Couldn't read the calendar"), the run stops and nothing is written. Check: D, U.
- AC-QC-STP-06. Reduce Motion: static dot, no sheen, no draw; the fold is a `CH_FADE_MS` crossfade (180ms today). Check: C `M-STEPS` reduce.

### S-RUN.ask-plan, S-RUN.ask-qual, S-RUN.ask-any

- AC-QC-ASK-01. A flow stops and asks before any draft whenever a required field isn't in the coach's words and no read gives exactly one answer; zero or two or more matches is an ask, never a pick (TASK_FIELDS §2 rule 3). Check: U per flow.
- AC-QC-ASK-02. Plan (always asks): How long (60 min, 90 min, 2 hours), Work on (Putting, Wedges, Driving, On course; several), Who (Everyone, Travel squad, Pick players); 36pt pills; "Build the plan" dim until each group has an answer. Check: S `asking`, D.
- AC-QC-ASK-03. Qualifier, when picks or tees aren't in the coach's words: "Two things before I set it" with one line of reason; Coach's picks (None, all by score / 1 / 2) and Tees listing only the tees saved for that course (Lonnie Poole: White, Blue, Black); "Set it up" dim until both are answered. One gap: "One thing before I set it" with one group. Check: S `asking-qual`, U (tee options read from the course).
- AC-QC-ASK-04. Names resolve to roster ids only; a name matching no one or several lists the candidates by full name. Check: U, D (add fixture `ask-name`).
- AC-QC-ASK-05. A chat zone different from the team's zone asks once, naming both with their offsets, and saves the answer (TASK_FIELDS §2 rule 1). Check: U.
- AC-QC-ASK-06. Answering folds the card into the coach's bubble ("90 min · putting, wedges, on course · everyone"; "1 pick · white tees"). Check: C `M-ASK`.

### S-TASK.cal, S-TASK.msg, S-TASK.qual, S-TASK.plan (confirm cards)

Common to all four
- AC-QC-TSK-01. Card radius 16, solid card fill, 1px ring; header padding 14 14 10 with a 32pt icon tile (radius 10), title 17/1.25 weight 600, line 13 ink-2, and a "Draft" chip. Check: S `confirm-<kind>`.
- AC-QC-TSK-02. Every value that will be written is on the card as a field row (label column 84, rows at least 44pt on the well), Read values carry their source, optional gaps read "Not set", and a required field is never "Not set". Check: D against TASK_FIELDS §5.1, §5.4, §5.8, §5.15.
- AC-QC-TSK-03. While the card builds, unknown fields are skeleton bars and the confirm row is hidden; each field resolves with a 6pt rise in 260ms. Check: C `M-TASK-in`, `M-VISUAL-<kind>`.
- AC-QC-TSK-04. Footer under a hairline: an "On confirm:" line naming who is told and when, then Cancel (ghost) and the named primary, min height 44, radius 12. Primaries: "Add to calendar", "Send to 6 players", "Set qualifier", "Save plan". Never a bare "Confirm". Check: S, D.
- AC-QC-TSK-05. Long and many: title wraps two lines then ellipsis; calendar rail shows three items then "+N"; message coins five then "+N"; qualifier field eight then "+N"; plan blocks list all and the body scrolls. Check: D (add fixture `lots`).

S-TASK.cal
- AC-QC-CAL-01. Week strip Mon 3 to Sun 9 Nov with Thu 6 lit; day rail shows what is there ("Team lift until 2:45"); the new block from 3:00 to 5:00. Check: S `confirm-cal`, C `M-VISUAL-cal`.
- AC-QC-CAL-02. Fields: title "Team practice", Thu 6 Nov 3:00 to 5:00 PM, the range, All 11 active. "On confirm: 11 players see it on their calendar. No RSVP asked." Check: D (fixture).
- AC-QC-CAL-03. `all_day` is false whenever there is a time, and each timed write carries the team zone's offset for that date. The end time is in the coach's words or asked. Check: U.
- AC-QC-CAL-04. An overlap shows on the rail in amber, "Overlaps Team lift"; the primary still reads "Add to calendar". Check: D (add fixture `conflict`).

S-TASK.msg
- AC-QC-MSG-01. The real thread (Travel squad · 6 players) shows small with its last message; the draft is an outlined bubble; tone chips Plain, Warmer and Shorter redraft in place. Check: S `confirm-msg`, C `M-VISUAL-msg`.
- AC-QC-MSG-02. The thread resolves only when exactly one conversation the coach is a member of has that title; otherwise it asks. Check: U.
- AC-QC-MSG-03. The draft caps at 2000 characters with a count from 1600. "You already had a draft there" shows when the coach has an unsent draft in that thread. Check: D.
- AC-QC-MSG-04. "Sends as you to 6 players in Travel squad, after an 8 second Undo." The message goes out only from the coach's own press of "Send to 6 players", through `sendGolfMessage`, under the held run. CoachHelm never sends on its own, and with `QUICK_CHAT_SEND_IN_CARD = false` the button hands the draft to the Messages composer instead. Check: U, D.

S-TASK.qual
- AC-QC-QUA-01. Three round tiles: Mon 10, Tue 11 and Wed 12 Nov, Lonnie Poole, white tees; seats "4 by score · 1 your pick" with the pick in champagne; field of 11. Check: S `confirm-qual`, C `M-VISUAL-qual`.
- AC-QC-QUA-02. Rounds, squad size and coach's picks are asked when not said; rounds never default. "Next week" resolves in the team zone. Check: U.
- AC-QC-QUA-03. "On confirm: 11 players get a push and an email once Undo closes." Check: D.

S-TASK.plan, .folder-menu, .new-folder
- AC-QC-PLN-01. The 90 minute bar splits into blocks in proportion (Putting 20, Wedges 30, 9 holes 40) with the block list under it; Tue 4 Nov, 3:00 PM from the calendar's free window. Check: S `confirm-plan`, C `M-VISUAL-plan`.
- AC-QC-PLN-02. "Save to [folder ⌄]" opens a list in place, not a popover: current folder checked, New folder last; New folder turns into a field with Create; Enter creates, Escape closes; the "On confirm" line updates. Check: S `folder`, C `M-FOLDER-menu`, `M-FOLDER-new`.
- AC-QC-PLN-03. While Save can't run (the Practice tab flag `golf_practice_plans` off, or N-00's held 010000, 010400 and 010500 not applied), the row reads "Save to Practice plans" with no chevron and the primary is inert. Once Save runs, the list shows the team's folder names from `golf_documents.folder`; the save always passes the folder by name (`DEFAULT_PLAN_FOLDER` "Practice plans" when the coach picks none). (fixed 4 Nov: folders no longer wait for N-10; one folder model across Ask AK9, the builder and this panel.) Check: D, U.
- AC-QC-PLN-04. The save passes `playerVisible: false`; the receipt says "Only coaches can see it. Players are told when you publish." (fixed 4 Nov: was "Only you can see it."; drafts are visible to the team's coaches) No player is told on save. Check: U.
- AC-QC-PLN-05. Folder create fails: the field keeps the name and shows "Couldn't make the folder" in amber. Check: D (add).

### S-TASK.busy

- AC-QC-BSY-01. Pressing the primary turns it into a capsule reading "Adding…", "Sending…", "Setting…" or "Saving…" with a 3pt sweep on a 0.9s loop; Cancel fades out; both lock after the first press. Check: C `M-CONFIRM`, D (a double tap sends one request).
- AC-QC-BSY-02. Past 15s with no answer it fails as S-RCPT.failed. Under Reduce Motion the sweep stops and shows as a still bar. Check: D (fake timers).

### S-RCPT, S-RCPT.told, S-RCPT.undone, S-RCPT.failed

- AC-QC-RCP-01. The object lands where it lives (calendar dot, sent bubble "Sending in 8s", the qualifier row at the top of Qualifiers, the plan in its folder) in 462ms on the smooth curve; the card edge flashes once; the chip turns Added, Sent, Set or Saved. Check: C `M-LAND-<kind>`, `M-WON`, `M-CHIP`.
- AC-QC-RCP-02. Receipt row: grid 26 / 1fr / auto, gap 10; 24pt accent disc whose 13pt check draws in 300ms after 100ms while one ring scales 1 to 1.9 and fades in 620ms; title 15/1.25 weight 600; line 13.5 ink-2; Open and Undo as 44pt text buttons. Check: S `receipt-<kind>`, C `M-RCPT`.
- AC-QC-RCP-03. The receipt is built from the row read back after the held run executes, never from what was sent. Check: U.
- AC-QC-RCP-04. Undo is real (TASK_FIELDS §3, Ask AK4 with HM1): confirm records the run as `held` with `run_at = now + UNDO_HOLD_MS` (8000); nothing is written, pushed, belled or emailed before then; Undo inside the window marks it `cancelled` and nothing exists; Open commits early; a reload during the window shows Undo with the time left from the server's `held_until`, not a client timer. (fixed 4 Nov: the plan kind is not held. A plan draft reaches nobody, so it saves at once through the practice-plan lane's `savePracticePlanDraft` and Undo calls `undoPracticePlanDraft`, the practice-plan lane's default 9; the ring still runs 8s. One plan save path for Ask, the builder and this panel.) Check: U (fake timers at 7.9s and 8.1s for cal, msg and qual; for plan, Undo at 7.9s leaves no plan and no Documents row), D.
- AC-QC-RCP-05. The Undo ring is 22pt, stroke 2.4, and drains linearly over the time left; it is the only countdown. Check: C `M-UNDO-ring`.
- AC-QC-RCP-06. Told (S-RCPT.told): when the window closes Undo fades and a well row (radius 12, padding 9 12) slides in; coins light up in delivery order from the notification rows' `created_at`; a green dot shows only where the data records "seen"; "+N" counts the rest; lines "11 players got it on their calendar", "Delivered to 6. Seen by 2.", "11 players got a push and an email." Under Reduce Motion the coins show at once. Check: S `told-<kind>`, C `M-TOLD`, U (order and seen from rows).
- AC-QC-RCP-07. Undone: the object leaves in 280ms, neutral disc, chip "Undone", the line from TASK_FIELDS ("Undone. Nothing was added and nobody was told."). Check: S `undone-<kind>`, C `M-UNDO`.
- AC-QC-RCP-08. Failed: amber disc and chip "Not saved", the flow's own line ("Qualifiers didn't answer. Nothing was created."), Cancel and Try again; the draft stays. Red appears nowhere in the panel; loss is `--ch-loss` (#9A5700 light, #E7AE57 dark). Check: S `failed-<kind>`, C `M-FAIL`, D (no red token in the panel's computed colours).
- AC-QC-RCP-09. Partial: amber, lists what was and wasn't created, "Check what was created before you try again.", and no Try again on parts already written. Check: D (add fixture `partial`).
- AC-QC-RCP-10. After the window, a reload shows the receipt in the thread without Undo. Check: D.

### S-RUN.cancelled and S-RUN.stopped

- AC-QC-END-01. Cancel: the card body dims to 60% and stays readable (its text still meets SHARED-4 at that opacity, or 06 lists the fix); a neutral receipt "Cancelled. Nothing was created." Nothing is written. Check: S `cancelled`, C `M-CANCEL`, U.
- AC-QC-END-02. Stop: done steps stay, the running step reads as stopped (a 10×2 dash), "Stopped. Nothing was saved.", and send comes back. Nothing is written. Check: S `stopped`, C `M-STOP`, U.

### S-OPEN

- AC-QC-OPN-01. Open commits the held run at once, closes the panel into the key, and routes to the object: the Calendar day with the event selected, the Messages thread, Qualifiers with the new one first, the plan page for a plan (fixed 4 Nov: was "Documents in the chosen folder"). No Open on failed or undone receipts. Check: D (router spy), U (commit before the window ends).

## Motion

Every row in 07 is matched by its clip (SHARED-12) and its Reduce Motion clip (SHARED-6). On top of those:

- AC-QC-MOT-01. Open (M-OPEN): the panel scales from 0.5 to 1 with its origin on the key's centre on the `pour` spring (visualDuration 0.42, bounce 0), opaque by 90ms; header, body and composer rise 8pt in 280ms, 30ms apart, starting 60ms in. The key's disc fades and grows in; the scrim fades in. Check: C.
- AC-QC-MOT-02. Close (M-CLOSE): from wherever the panel is, to scale 0.5 and opacity 0 in 220ms on `cubic-bezier(0.32, 0.72, 0, 1)`, content fading first. Check: C.
- AC-QC-MOT-03. Retarget (M-RETARGET): a tap mid-open closes from the current scale, and a tap mid-close opens from it, with no jump (scale difference under 0.06 between the last frame before and the first after). Check: the page's motion check tests 1 and 2, ported to the app.
- AC-QC-MOT-04. Frame rate: on the Mac at 390, the open runs with no more than one frame over 25ms. Check: motion check test 3.
- AC-QC-MOT-05. Only transform and opacity animate. The step check, the receipt check and the Undo ring are SVG stroke draws and are the only paint allowed. Check: motion check test 5 (Web Animations and CSS animation names logged over a whole task).
- AC-QC-MOT-06. Reduce Motion: every move is opacity only, linear, and `CH_FADE_MS` (180ms today) or less; loops stop (key turn, spinner, sweep, sheen, breathing dot). Check: motion check test 6.
- AC-QC-MOT-07. Nothing animates on data refresh or re-render: a refetch of the thread or the roster while a card is shown moves nothing. Check: D (count running animations across a forced refetch).
- AC-QC-MOT-08. `pour` is added to `CH_SPRINGS` in `lib/motion.ts` with `--ch-ease-spring-pour` in `tokens.css`; no other spring is added. Check: D.

The page's in-page check (`#motion-check`, six tests) passes 6 of 6 in Chrome on the design page, and QC6 ports the same six tests to `e2e/clubhouse/quick-chat-motion.spec.ts` against the app.

## Per PR

| PR | Must pass | Tests it adds | Done when |
|---|---|---|---|
| QC0 Plumbing | AC-QC-MOT-08; SHARED-8 | flag `coachhelm_quick_chat_v1` read; preview `?qc=<state>` and `&play=<move>` reach every 05 state; fixtures match 03 | every app anchor in capture.mjs opens its state; flag off is pixel-identical to main |
| QC1 Helm key | S-KEY (AC-QC-KEY-01 to 09) | coach-only render; flag-off and loading fall back to the sparkle; haptic | `closed`, `hello` key pairs match on phone and desktop, both themes; bar diff clean outside the key slot |
| QC2 Panel | S-PANEL, S-PANEL.hello, S-PANEL.composer; AC-QC-MOT-01 to 04, 06, 07 | no translucent background under text; fixed height; every close path; dialog focus; keyboard height; offline line | `hello` pairs at 390, 430, 1280, XXL, dark; `M-OPEN`, `M-CLOSE`, `M-RETARGET`, `M-SCRIM`, `M-CONTENT`, `M-TILE`, `M-SEND` clips match with and without Reduce Motion |
| QC3 Run | S-RUN.request, S-RUN.steps, S-RUN.ask-*, S-RUN.stopped | only announced steps; Stop writes nothing; ask on zero or several matches; zone ask; tees from the course | `steps`, `asking`, `asking-qual`, `stopped` pairs and `M-STEPS`, `M-STEPS-fold`, `M-ASK`, `M-STOP`, `M-KEY-work` clips match |
| QC4 Task cards and finish | S-TASK.*, S-TASK.busy, S-RCPT.*, S-RUN.cancelled, S-OPEN; AC-QC-MOT-05 | per-flow field tests from TASK_FIELDS §5.1, §5.4, §5.8, §5.15 and §8; held run at 7.9s and 8.1s; read-back receipts; told order and seen from rows; Open commits early | `confirm-*`, `folder`, `receipt-*`, `told-*`, `undone-*`, `failed-*`, `cancelled` pairs and every `M-VISUAL-*`, `M-LAND-*`, `M-CONFIRM`, `M-WON`, `M-CHIP`, `M-RCPT`, `M-UNDO-ring`, `M-TOLD`, `M-UNDO`, `M-FAIL`, `M-CANCEL`, `M-FOLDER-*`, `M-GROW` clip match. Needs AK4 and the held HM1; ships with flags off until HM1 is applied on Nick's yes |
| QC5 Live pill | S-LIVE, S-KEY.flag | pill follows the run; never covers the bar title; `LIVE_PILL` off path | `live`, `live-work` pairs and `M-LIVE`, `M-KEY-flag` clips match |
| QC6 Capture and fidelity | everything above; SHARED-12 | the six motion tests in `e2e/clubhouse/quick-chat-motion.spec.ts`; flag-off parity across every coach screen | `capture.mjs --all --compare` and `--motion all` sheets in the PR; motion check 6 of 6 on the app |

Every PR also keeps SHARED-1 to SHARED-12, lists any held migration as held in its body (SHARED-9), and stays a draft (SHARED-8).

## Side by side

1. Shots: `node design-refresh/coachhelm/capture/capture.mjs --id <ID> --state <state>` shoots the design anchor and the app's `?qc=` route at the same width, theme and Text Size into `screenshots/<ID>__<state>__{design,app}__{light,dark}.png`; `--compare` pairs them into `screenshots/compare/`.
2. Redline numbers checked on both images, within 2pt: panel side inset 10 and top 104 (phone), width 432, right 14 and top 62 (desktop); radius 32 and 26; body sheet inset 6 and radius 20; header padding 18 14 12 20; mark tile 36; greeting 24pt; tile min height 104, radius 16 and gap 10; task card radius 16 and icon tile 32; field row 44; primary height 44; composer radius 26 and buttons 36; receipt disc 24; Undo ring 22; live pill height 36. Every other value is in 06's redlines.
3. Accepted differences: the page's phone frame chrome (status bar art, device outline) and anything outside the device in `-shot` mode. Nothing inside the app area.
4. Motion: `--motion <M-ID>` records the page's play and the app's `&play=` at 390, then again with `reducedMotion: 'reduce'`, into `clips/<M-ID>__{design,app}[__reduce].webm`. Duration, curve or spring, and what moves match within one frame at 60fps.
5. A PR is done when every ID it touches matches on the redline numbers in light, dark and XXL, every motion row it touches matches in both modes, and the motion check passes.

## Completeness pass, 4 Nov 2026

One criterion for every state 05's Completeness section adds, plus the screen IDs that had no criterion by ID (S-PANEL.full, S-TASK.plan.folder-menu, S-TASK.plan.new-folder). Check letters as above: S shot, C clip, D DOM or fixture, U unit or server test.

S-PANEL.full
- CP-QC-1. "Open full chat" runs M-CLOSE and pushes today's Ask screen on the same thread id, scrolled to the newest turn (07 M-FULL). Check: D (router spy, thread id), C `M-FULL`.
- CP-QC-2. Expanding while a run streams never cancels it: the Ask screen attaches to the same run and the step list continues; S-KEY.working shows until it ends. Check: D, U (no abort on the stream).
- CP-QC-3. A confirm card left waiting shows in the Ask thread with the same idempotency key; confirming in either place writes once and the other shows the receipt. Check: U.
- CP-QC-4. With `coachhelm_ask_v2` off the button opens today's Ask screen on the same thread. Check: D.
- CP-QC-5. Back returns to the screen the coach came from with its name on the back label; the panel stays closed. The expand button sits in tab order after the context line and before ×. Check: D, keyboard walk.

S-TASK.plan.folder-menu
- CP-QC-6. The list opens in place under Save to with the team's folder names from `golf_documents.folder` (coach scope, drafts counted), the last used first, the current one checked, New folder last; it scrolls after 6. Arrows move, Enter picks, Escape returns focus to the Save to row. Check: S `folder`, D (fixture `lots`), keyboard walk.

S-TASK.plan.new-folder
- CP-QC-7. The name is 1 to 60 characters after trimming; Enter creates, Escape closes; the new name sits first, chosen, with count "new", and exists only once the save writes it. Check: D, U.
- CP-QC-8. A name equal to an existing folder (ignoring case) shows "There's already a folder called X. Pick it above."; "Team" shows "Team is used by Documents. Pick another name." (N-10 CH-10162); Create is blocked in both. Check: D (add fixtures `dup-folder`, `reserved-folder`).
- CP-QC-9. Undo inside the window removes the plan and its Documents row, and the new folder name is gone from `listPlanFolders`. Check: U.

S-TASK.plan by flag
- CP-QC-10. `coachhelm_practice_plans_v1` off: no plan tile (the fourth tile is the next start for the screen) and a typed plan request gets the one line with no card and no write. Check: D, U (no tool registered).
- CP-QC-11. S-TASK.plan.inert: the card builds, Save to has no chevron, the primary reads "Comes with the Practice tab", is `aria-disabled`, and a press makes no network call; no Open. Check: S (add `confirm-plan&practice=off`), D (network spy).
- CP-QC-12. A missing N-00 RPC or table (42883, 42P01) shows S-TASK.plan.inert, never S-RCPT.failed. Check: U.
- CP-QC-13. With both flags on and the migrations applied, Save calls `savePracticePlanDraft` with the folder by name and `playerVisible: false`; the result is the same `golf_practice_plans` row and the same Documents row (`practice_plan_id`, `is_public` false) that Ask and the builder write. Check: U, DB check on the preview stack.
- CP-QC-14. The quick chat registers no publish tool; "publish it" answers with one line and Open plan. Check: U (tool list), D.
- CP-QC-15. On `…/practice/plan/<id>/edit` the plan tile reads "Help with this plan" and hands off to the builder's helper; no second plan is made for that event. Check: D.

S-TASK.plan.needs-event
- CP-QC-16. A day with no practice event shows S-TASK.cal first with "Add practice"; the plan card builds under its receipt; pressing "Save plan" commits the event's hold before the plan save. Check: U (order of writes), C `M-CP-QC-needs-event`.
- CP-QC-17. Undo on the event inside its window removes the plan card with "No practice, so no plan was made." and nothing is saved. Check: U, C `M-CP-QC-needs-event.undo`.
- CP-QC-18. One practice that day: no question, the practice row names it with "from your calendar". Two or more: one "Which practice?" group. A practice that already has a plan: "Open that plan" or "Start from it", never a second plan. Cancelled or all-day practices are not offered. Check: D (fixtures), U.

Drill bank
- CP-QC-19. "Add a drill to the bank" writes `golf_team_drills` through N-00's `createTeamDrill` with the TASK_FIELDS §5.14 fields; before 010100 the reply is "Drill bank comes with the Practice tab" with the offer of a plan block. Nothing ever writes `golf_drills`. Check: U.

S-OPEN
- CP-QC-20. Open on a plan receipt routes to `/golf/dashboard/practice/plan/<id>?from=coachhelm&ret=<path>` (the coach's draft view) with M-CP-QC-open-plan; the plan page's back label names the source screen. Check: D (router spy), C `M-CP-QC-open-plan`.
- CP-QC-21. S-OPEN.gone: Open for a deleted object lands on that destination's not-found state (for a plan, CH-17302 copy on Practice home), and the receipt drops Open. Check: D (fixture `deleted`).

Network, devices and roster
- CP-QC-22. S-TASK.offline: the primary is disabled with "You're offline. Nothing was saved."; back online it turns on and nothing sends by itself. Check: D (`net=off`), C `M-CP-QC-offline`.
- CP-QC-23. A lost connection after the press ends in S-RCPT.failed within 15s with "Lost the connection. Check what was created before you try again."; Try again reuses the idempotency key and returns the landed row if the write went through. Check: U.
- CP-QC-24. The same card confirmed on two devices makes one run; the second device gets the first run's receipt (M-CP-QC-elsewhere, no flight). Check: U, C.
- CP-QC-25. Undo works from either device while `held_until` is in the future; a reopened or second view's ring starts at the server's time left (M-CP-QC-ring-resume). Check: U, C.
- CP-QC-26. A player removed before commit is dropped and the told line counts only those told; if they were the only target, S-RCPT.failed names them and nothing is created. Check: U.

Thread, time and input
- CP-QC-27. S-RUN.earlier: past 30 turns the oldest fold into "Earlier in this chat · Open full chat" and the newest turn's scroll position does not move. Check: D (fixture `long-thread`).
- CP-QC-28. Close and reopen keeps scroll and typed text; nothing asks to discard; a card still waiting at the team zone's midnight reads "This draft expired. Nothing was created." Check: D, U (fake clock).
- CP-QC-29. "Earlier today" and the thread's day follow the team zone; season-scoped reads use the season of the target date (a 2 Aug plan asked for on 31 Jul reads the new roster). Check: U (fixtures across the zone and 1 Aug).
- CP-QC-30. The primary locks on the first press; a second tap or Enter does nothing and the server sees one run. Check: D, U.
- CP-QC-31. VoiceOver: steps are read once each when done (polite live region); the receipt is one polite line; Undo's name carries the seconds left, updated every 2 seconds. Check: D (aria), manual on device.
- CP-QC-32. With HM1 absent (dev or preview only), writes run at once, the receipt reads "Done. Undo isn't on here yet." and no Undo shows; with `coachhelm_quick_chat_v1` off every coach screen renders as main; no push, bell or link outside `/clubhouse-preview/` opens the panel. Check: U (boot check 42703), D (flag-off parity).

Per PR: CP-QC-1 to 5 go with QC2; CP-QC-27 to 29 and 31 with QC3; CP-QC-6 to 26, 30 and 32 with QC4.

## Wiring, 4 Nov 2026

Checks for 06 "Wiring, 4 Nov 2026" (QW1 to QW4). Each names the screen IDs it proves. The Ask lane's W-ASK checks cover the shared hold and receipts; these cover what the quick chat adds.

W-QC-1. S-KEY: with `coachhelm_quick_chat_v1` off the bar renders `AskSheetButton` and `AskSheetProvider` exactly as main; on, `shell.quickChat` is true only for a coach with CoachHelm on (`askOn`), and a player's bar has no Helm key node.
W-QC-2. S-LIVE, S-PANEL: start a task on Calendar, close the panel and go to Roster and then Messages: the pill keeps following the run and the stream request is not aborted (no `streamErrored` turn in `golf_coachhelm_chat_messages`); the session component is mounted once, not per path.
W-QC-3. S-PANEL.full: "Open full chat" goes to `?view=ask&c=<id>` built by `conversationHref`; mid-run the Ask screen shows the live steps from the provider's session and, at run end, the same turn from its own loader, with one saved turn, not two.
W-QC-4. S-PANEL.hello: "Earlier today" shows the last receipt of the coach's newest conversation created since the team zone's midnight (coach in Pacific, team in Eastern); with none today the block is left out and nothing jumps.
W-QC-5. S-PANEL.composer, S-TASK.offline: the offline line uses the exported `subscribeOnline` from `AskSheetBody.tsx` (grep finds no new copy); offline, the primary is disabled and nothing sends when the device comes back.
W-QC-6. S-TASK.cal, S-RCPT.told: an event with RSVP off writes no `notifications` row and sends no push; its Told row shows the attendance count ("11 players see it on their calendar"); with RSVP on, invitees' bell rows appear only after the window.
W-QC-7. S-TASK.msg: "Send to N players" writes one `golf_messages` row with the coach as sender only after 8s; Undo at 7.9s leaves no row and returns the draft; two releases for one run key leave one row (same `client_message_id`).
W-QC-8. S-RCPT.told (message): "Seen by" counts only members whose `golf_conversation_read_marks` mark is at or after the message; a member who read the thread before the send is not counted.
W-QC-9. S-TASK.qual: the qualifier email and push go out after the window, never on the press; a forced failure of the round-course write shows the partial receipt "Tees weren't saved. Set them on the qualifier."
W-QC-10. S-TASK.plan, S-TASK.plan.inert: before N-00 010500 and lane 6 090000 run, the plan card is inert with no network call; after, Save writes at once through `savePracticePlanDraft`, Undo inside 10s removes it, and no second save path exists in `QC/` (grep for `golf_documents` inserts finds none).
W-QC-11. S-TASK.plan.needs-event: for a day with no practice, the event card comes first; Save before the event's window ends commits the event early (`?now=1`) and then saves; Undo on the event leaves no plan.
W-QC-12. 05 HM1 row: on a stack without HM1 (42703 on `run_at`) the quick chat offers no event, message or qualifier task; a message request ends in "Open in Messages"; today's four writes run at once with "Done. Undo isn't on here yet."
W-QC-13. S-RCPT, S-RCPT.failed: the success receipt is decided by a read-back of the domain row; a forced `updateTag` error after a committed insert still shows success, and a refused insert shows the amber failed line with nobody told.
W-QC-14. S-RCPT.told: the Told route returns counts and roster ids for the coach's own team only; a coach calling it with another coach's run key gets 404.
W-QC-15. S-OPEN, S-OPEN.gone: Open inside the window commits early and lands on the destination named in 06 QW4; an object deleted since lands on the destination's not-found state and the receipt drops Open.
