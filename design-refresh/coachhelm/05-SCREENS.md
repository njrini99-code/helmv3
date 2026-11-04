# 05-SCREENS: CoachHelm quick chat

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 66 rows).

Design page: https://claude.ai/artifact/9coRP9KHUfDw9sPE3g1FEq · Local copy: `coachhelm/redesign/quick-chat.html` · Package: `design-refresh/coachhelm/` · Fields: `coachhelm/TASK_FIELDS.md` (wins over the page on any field) · Status: Ready to build, all calls settled as defaults Nick can flip (01-BRIEF §5).

What this is: a Helm key in the green bar's actions slot opens a Glass panel that drops out of the key. The coach types or taps a start, CoachHelm shows its steps, asks when the coach's words leave a gap, draws the real object on a confirm card, and writes only after the coach confirms. A receipt with an 8 second Undo follows, then a line saying who was told. Closing the panel mid-task turns the key into a live pill.

## How to read this file

Anchor grammar on the design page (every state is addressable, and the page sets `<body data-qc>` when it reaches it):

```
#<state>-<phone|desk>-<light|dark>[-w390|-w430][-xxl][-reduce][-shot]
```

- `phone` is a 402×874 frame unless `-w390` (390×844) or `-w430` (430×932) is given. `desk` is 1280×800.
- `-xxl` sets the page's Text Size factor `--k` to 1.36 (SHARED-5).
- `-reduce` runs every move as its Reduce Motion version. `-shot` strips the page chrome so only the device shows.
- `capture/capture.mjs` waits for `body[data-qc]` to equal `body[data-want]` before it shoots.

States the page can reach by hash: `hello`, `closed`, `steps`, `asking` (plan), `asking-qual`, `confirm-cal`, `confirm-msg`, `confirm-qual`, `confirm-plan`, `folder`, `receipt-<kind>`, `told-<kind>`, `undone-<kind>`, `failed-<kind>` (kind = cal, msg, qual, plan), `cancelled`, `stopped`, `live` (pill waiting on the coach), `live-work` (pill while a step runs), and `motion-check` (runs the six in-page motion tests).

The app side: PR QC0 adds `?qc=<state>` to the preview frame, so `/clubhouse-preview/calendar?qc=confirm-cal` opens the panel at that state over the coach Calendar with fixtures that match the page. Capture runs both at the same width, theme and Text Size.

PR ids are from 02-PLAN: QC0 plumbing, QC1 key, QC2 panel, QC3 run, QC4 task cards and finish, QC5 live pill, QC6 capture and fidelity. Ask lane PRs this rides on are named AK1, AK4, AK9, AK11a/b (see `ask/02-PLAN.md`).

Roles: coach only. A player's DOM has no key and no panel (default 3 in 01-BRIEF; SHARED-11).

## Inventory

| ID | Kind | How you get there | Design link | App route | Roles | PR |
|---|---|---|---|---|---|---|
| S-KEY | inline control in the bar's actions slot | always there for a coach with the flag on; replaces today's sparkle `AskSheetButton` | `#closed-phone-light` (idle), `#hello-phone-light` (open) | any coach screen, e.g. `/clubhouse-preview/calendar` | coach | QC1 |
| S-KEY.working | key state | a task runs with the panel open | `#steps-phone-light` | `?qc=steps` | coach | QC1 |
| S-KEY.flag | key state (9pt champagne flag) | a task waits on the coach and the panel is closed, after the live pill shrinks | not drawn as a still; flag set in the `live` play | `?qc=live` then wait 2s | coach | QC5 |
| S-LIVE | inline pill, replaces the key in place | close the panel while a task runs | `#live-work-phone-light`, `#live-phone-light` | `?qc=live-work`, `?qc=live` | coach | QC5 |
| S-PANEL | dialog: Glass frame, scrim, header, phone grab bar | tap the key; ⌘J or Ctrl+J on desktop | `#hello-phone-light`, `#hello-desk-light` | `?qc=hello` | coach | QC2 |
| S-PANEL.hello | panel contents before a request | open with no task running | `#hello-phone-light` | `?qc=hello` | coach | QC2 |
| S-PANEL.composer | composer pill at the panel's foot | always in the panel | `#hello-phone-light` (idle), `#steps-phone-light` (Stop) | `?qc=hello`, `?qc=steps` | coach | QC2 |
| S-PANEL.full | push to the full CoachHelm chat | header expand button "Open full chat" | not drawn (button drawn) | today's CoachHelm Ask screen with the same thread | coach | QC2 |
| S-RUN.request | the coach's bubble and CoachHelm's reply line | send a request or tap a start | `#steps-phone-light` (bubble), `#confirm-cal-phone-light` (reply line) | `?qc=steps` | coach | QC3 |
| S-RUN.steps | live step list, then the folded summary "N steps · 2s" | any request | `#steps-phone-light`; folded on `#confirm-cal-phone-light` | `?qc=steps` | coach | QC3 |
| S-RUN.ask-plan | question card: length, focus, who | practice plan request (always asks) | `#asking-phone-light` | `?qc=asking` | coach | QC3 |
| S-RUN.ask-qual | question card: coach's picks, tees | qualifier request whose words leave picks or tees open | `#asking-qual-phone-light` | `?qc=asking-qual` | coach | QC3 |
| S-RUN.ask-any | the same card for any flow's missing field | a required field not in the coach's words and no read gives exactly one answer (TASK_FIELDS §2 rule 3) | built from S-RUN.ask-qual | per flow fixture | coach | QC3 |
| S-TASK.cal | confirm card: week strip, day rail, the new block | "Add a team practice Thursday 3 to 5 at the range, everyone" | `#confirm-cal-phone-light` | `?qc=confirm-cal` | coach | QC4 |
| S-TASK.msg | confirm card: thread preview, draft bubble, tone chips | "Message the travel squad…" | `#confirm-msg-phone-light` | `?qc=confirm-msg` | coach | QC4 |
| S-TASK.qual | confirm card: round tiles, seats, field | "Set up the fall qualifier…" | `#confirm-qual-phone-light` | `?qc=confirm-qual` | coach | QC4 |
| S-TASK.plan | confirm card: time bar, blocks, Save to | "Make a practice plan…" after the ask | `#confirm-plan-phone-light` | `?qc=confirm-plan` | coach | QC4 |
| S-TASK.plan.folder-menu | in-card list (not a popover) | tap "Save to [folder ⌄]" | `#folder-phone-light` (menu shown mid-play) | `?qc=folder-menu` (add) | coach | QC4 |
| S-TASK.plan.new-folder | name field with Create inside the menu | menu > New folder | `#folder-phone-light` (end state shows the new folder picked) | `?qc=folder` | coach | QC4 |
| S-TASK.busy | confirm pressed: the primary turns into a busy capsule, Cancel fades | tap the named primary | not drawn as a still; mid `whole` play | `?qc=busy-cal` (add) | coach | QC4 |
| S-RCPT | receipt: check, title, line, Undo with its 8s ring, Open; the landed object above it | confirm succeeds | `#receipt-cal-phone-light` and `-msg`, `-qual`, `-plan` | `?qc=receipt-cal` | coach | QC4 |
| S-RCPT.told | the told row: coins in delivery order, "+N", line | Undo window closes | `#told-cal-phone-light`, `-msg`, `-qual`, `-plan` | `?qc=told-cal` | coach | QC4 |
| S-RCPT.undone | neutral receipt, object removed | tap Undo inside 8s | `#undone-cal-phone-light` and other kinds | `?qc=undone-cal` | coach | QC4 |
| S-RCPT.failed | amber receipt, draft kept, Try again | the write fails | `#failed-cal-phone-light` and other kinds | `?qc=failed-cal` | coach | QC4 |
| S-RUN.cancelled | card dims, "Cancelled. Nothing was created." | tap Cancel on the confirm card | `#cancelled-phone-light` | `?qc=cancelled` | coach | QC4 |
| S-RUN.stopped | step list ends, "Stopped. Nothing was saved." | tap Stop while steps run | `#stopped-phone-light` | `?qc=stopped` | coach | QC3 |
| S-OPEN | leaves the panel for the real object | tap Open on a receipt | not drawn (button drawn on S-RCPT) | lands on Calendar day, Messages thread, Qualifiers, the plan page `/golf/dashboard/practice/plan/<id>?from=coachhelm` (fixed 4 Nov: was "Documents folder"; a plan opens as its plan page, as Documents itself does, N-10 §4.10) | coach | QC4 |

Not in this lane: the CoachHelm Ask screen itself (Ask lane), the Documents screen (Practice Builder lane), the Messages composer (Messages lane), today's Calendar, Qualifiers and Documents screens S-OPEN lands on (unchanged).

## State matrices

Columns: "Drawn?" gives the anchor (light phone shown; swap `light` for `dark`, `phone` for `desk`, add `-w390`, `-w430`, `-xxl`, `-reduce`). "Rule" is what the build does, including for states the page doesn't draw. Phone 390 and 430 use the panel's own insets (10pt sides) rather than the page edge of SHARED-7, because the panel is a floating layer, not page content. Dark is `golf_theme` = dark. XXL is `--ch-type-scale` 1.36. Reduce Motion is Playwright `reducedMotion: 'reduce'` and also covers `[data-motion='off']`.

### S-KEY

| State | Drawn? | Rule |
|---|---|---|
| default (idle) | `#closed-phone-light` | 44×44 hit target in the actions slot, ivory Helm mark 24pt at stroke 1.7; disc hidden (scale .82, opacity 0). On phone it sits before the bell or the page's own action; on desktop between the search pill and the bell |
| open | `#hello-phone-light` | disc shows (scale 1, opacity 1); `aria-expanded="true"` |
| working | `#steps-phone-light` | mark turns (helmTurn 2.4s loop) while a step runs with the panel open; stops on confirm |
| needs you (flag) | live play end | 9pt champagne flag top right with a 2pt bar-colour ring, until the coach opens the panel |
| loading | not drawn | Renders at once with the bar; it never waits on data. If the flag check is still loading, show today's sparkle button (flag off path) |
| empty | n/a | none |
| error | not drawn | Flag or permission check fails: the key isn't rendered and today's bar shows, unchanged (SHARED-1, SHARED-8) |
| long text | n/a | no text |
| lots / one item | n/a | none |
| offline | not drawn | Key still opens the panel; the composer shows the offline line (S-PANEL.composer) |
| XXL | `#closed-phone-light-xxl` | Mark stays 24pt; hit target stays 44 (icons don't scale with Text Size) |
| dark | `#closed-phone-dark` | Bar is `--ch-frame` dark; mark ivory |
| Reduce Motion | `#steps-phone-light-reduce` | No turn, no disc scale; disc crossfades over `CH_FADE_MS` (180ms today) |
| phone 390 / 430 | `-w390`, `-w430` | Same 44 slot; bar layout unchanged (SHARED-1 with the key-slot mask in 08) |
| desktop 1280 | `#closed-desk-light` | In the desktop bar, 44 slot, tooltip "CoachHelm ⌘J" on hover after 600ms |
| player | not drawn | Not in the DOM |

### S-LIVE

| State | Drawn? | Rule |
|---|---|---|
| default (work) | `#live-work-phone-light` | 36pt capsule grows left out of the key slot (origin at the key's centre), spinner and the current step label |
| needs you (wait) | `#live-phone-light` | champagne dot, "Needs your OK" |
| done | not drawn as a still (in the `live` play when a commit lands with the panel closed) | check, "Added" / "Sent" / "Set" / "Saved", then shrinks back into the key after 1.8s |
| failed | not drawn | amber dot, "Didn't go through"; stays until the coach opens the panel |
| loading | n/a | It only exists during a run |
| long text | not drawn | Label is one line, max width 172pt phone / 260pt desktop, ellipsis at the end. Never pushes the bar title; the bar title always shows in full width it has today (SHARED-1) |
| XXL | `#live-work-phone-light-xxl` | Height grows with the label (36 × k up to 44), still one line |
| dark | `#live-phone-dark` | fill #06231a stays; label ivory |
| Reduce Motion | `#live-phone-light-reduce` | No scale; `CH_FADE_MS` crossfade (180ms today) in, between states and out |
| 390 / 430 / 1280 | `-w390`, `-w430`, `#live-desk-light` | Same rule; on desktop it sits in the same slot in the desktop bar |
| tap | not drawn | Tapping the pill opens the panel at the running task, and the pill turns back into the key |

### S-PANEL

| State | Drawn? | Rule |
|---|---|---|
| default | `#hello-phone-light`, `#hello-desk-light` | Phone: 10pt from each side, top 104, height 700 (fixed), radius 32, grab bar. Desktop: 432 wide, 14 from the right, top 62, height 640, radius 26. The frame is glass; everything in it sits on solid surfaces (DESIGN_LANGUAGE "no glass behind data") |
| closed | `#closed-phone-light` | Panel not in the accessibility tree; scrim gone |
| loading | not drawn | Open never waits. The thread for today loads behind the hello; if it isn't back within 300ms, the hello still shows and "Earlier today" fills in when it arrives, opacity only, no layout jump (the row's space is reserved) |
| empty | not drawn | No earlier receipts today: the "Earlier today" block is left out; tiles move up, no placeholder |
| error | not drawn | Thread fails to load: hello shows, "Earlier today" is left out, nothing else changes. Errors in a run are S-RCPT.failed or the composer line |
| long text | not drawn | Context line is one line with an ellipsis at the end |
| lots | n/a | The panel never grows; its body scrolls (S-RUN) |
| offline | not drawn | Panel opens; composer shows the offline line |
| XXL | `#hello-phone-light-xxl` | Height stays 700 / 640; content scrolls inside. Header grows taller, title still one line, context ellipsis |
| dark | `#hello-phone-dark` | Glass and scrim take the dark tokens (06) |
| Reduce Motion | `#hello-phone-light-reduce` | Opens and closes as a `CH_FADE_MS` crossfade (180ms today), no scale, no travel |
| 390 | `#hello-phone-light-w390` | Height 700 still fits (top 104 + 700 = 804 < 844); keyboard rule below wins |
| 430 | `#hello-phone-light-w430` | Same insets; height 700 |
| desktop 1280 | `#hello-desk-light` | As default |
| keyboard up (phone) | not drawn | The panel's bottom never goes under the keyboard: height = min(700, keyboard top − 104 − 8). Composer stays visible |
| close paths | n/a | Key, scrim tap, ×, Escape, ⌘J / Ctrl+J toggle, swipe up on the header or grab bar (phone). Closing never cancels a run |

### S-PANEL.hello

| State | Drawn? | Rule |
|---|---|---|
| default | `#hello-phone-light` | "What should we get done?", "You confirm everything before it happens.", four start tiles, "Earlier today" with the last receipt |
| starts per screen | not drawn | Tiles change with the screen the coach is on (Calendar: practice, message, qualifier, plan as drawn). Each tile's line names a real object from that screen; four tiles always |
| empty | not drawn | No earlier receipt: leave out "Earlier today" |
| long text | not drawn | Tile title wraps to 2 lines then ellipsis; tile line 1 line ellipsis |
| lots | not drawn | "Earlier today" shows the last receipt only; older ones live in the full chat |
| one item | as drawn | One receipt row |
| XXL | `#hello-phone-light-xxl` | Tiles grow taller; nothing clips (SHARED-5) |
| dark / Reduce Motion / 390 / 430 / 1280 | `-dark`, `-reduce`, `-w390`, `-w430`, `#hello-desk-light` | Same layout |

### S-PANEL.composer

| State | Drawn? | Rule |
|---|---|---|
| default | `#hello-phone-light` | Pill: + , field "Ask CoachHelm or tell it what to do", mic, send (off until there is text). Desktop adds the hint row "⌘J open · esc close · Saved in CoachHelm" |
| typing | in every task play | Send turns on; field grows to 4 lines then scrolls |
| running | `#steps-phone-light` | Send becomes an ink Stop square; the field stays usable for the next message (queued after the run) |
| long text | not drawn | Field grows up to 4 lines, then scrolls inside; the panel never grows |
| offline | not drawn | One line above the pill, amber icon: "You're offline. CoachHelm will send when you're back." Send stays on; message queues |
| stream error | not drawn | A run that loses its stream shows the step that was running as failed (amber) and the line "Lost the connection. Nothing was saved." with Try again; never red |
| XXL / dark / Reduce Motion / sizes | suffixes | Hint row is desktop only |

### S-RUN.request

| State | Drawn? | Rule |
|---|---|---|
| default | `#steps-phone-light` | Coach bubble right, accent fill, max 84% wide, radius 19 19 6 19 |
| reply line | `#confirm-cal-phone-light` | CoachHelm's one-paragraph line above the card, plain text on the panel's solid body |
| long text | not drawn | Bubble wraps; no max lines |
| XXL / dark / Reduce Motion / sizes | suffixes | — |

### S-RUN.steps

| State | Drawn? | Rule |
|---|---|---|
| default | `#steps-phone-light` | Present tense label on the active row with a breathing dot; done rows past tense with one fact; check draws |
| folded | `#confirm-cal-phone-light` | "3 steps · 2s" summary button; tap reopens the list in place |
| lots | not drawn | Up to 6 rows show; after that the oldest done rows fold into "N more steps" at the top |
| one item | not drawn | One row still folds to "1 step · Ns" |
| failed step | not drawn | Amber glyph and the step's own past tense failure ("Couldn't read the calendar"); run stops; nothing written |
| stopped | `#stopped-phone-light` | S-RUN.stopped |
| long text | not drawn | Label wraps to 2 lines, then ellipsis |
| XXL / dark / Reduce Motion / sizes | suffixes | Reduce Motion: static dot, no shimmer, no draw; fold is a crossfade |

### S-RUN.ask-plan

| State | Drawn? | Rule |
|---|---|---|
| default | `#asking-phone-light` | Groups How long (60 min, 90 min, 2 hours), Work on (several), Who; primary "Build the plan" dim until each group has an answer |
| answered | in the `plan` play | Card folds into the coach's bubble "90 min · putting, wedges, on course · everyone" |
| long text | not drawn | Pills wrap to new rows |
| XXL / dark / Reduce Motion / sizes | suffixes | — |

### S-RUN.ask-qual (and S-RUN.ask-any)

| State | Drawn? | Rule |
|---|---|---|
| default | `#asking-qual-phone-light` | "Two things before I set it" and the one-line reason; groups Coach's picks (None, all by score / 1 / 2) and Tees (only the tees saved for that course); "Set it up" dim until both are answered |
| answered | in the `qual` play | Folds to the bubble "1 pick · white tees" |
| one question | not drawn | Same card with one group; header "One thing before I set it" |
| names to pick | not drawn (S-RUN.ask-any) | A name that matched no roster player or more than one: the group lists the candidates by full name; never picks one (TASK_FIELDS §2 rule 2) |
| zone differs | not drawn (S-RUN.ask-any) | One group: the team zone or the coach's zone, named with their offsets (TASK_FIELDS §2 rule 1) |
| XXL / dark / Reduce Motion / sizes | suffixes | — |

### S-TASK.cal, S-TASK.msg, S-TASK.qual, S-TASK.plan

| State | Drawn? | Rule |
|---|---|---|
| building | in each task play | Visual builds while the fields resolve; unknown fields are skeleton bars on the well colour; confirm row hidden |
| default (confirm) | `#confirm-<kind>-phone-light` | Header icon, title, "Draft" chip; the visual; field rows; "On confirm:" line naming who is told and when; Cancel (ghost) and the named primary (Add to calendar, Send to 6 players, Set qualifier, Save plan) |
| field rows | per TASK_FIELDS §5.1, §5.4, §5.8, §5.15 | Every value that will be written is on the card. Read values carry their source; optional gaps read "Not set"; a required field is never "Not set" (it asks instead) |
| long text | not drawn | Title wraps 2 lines then ellipsis; message draft shows in full with a count from 1600 of 2000 characters |
| lots | not drawn | Calendar day rail shows up to 3 existing items then "+N"; message coins up to 5 then "+N"; qualifier field up to 8 avatars then "+N"; plan blocks list all, the card body scrolls with the panel |
| one item | not drawn | One player: coin row has one coin and the line reads "1 player" |
| conflict | not drawn | Calendar: an overlapping item shows on the rail in amber with "Overlaps Team lift"; the primary still reads "Add to calendar"; the overlap is a fact, not a blocker |
| XXL / dark / Reduce Motion / sizes | suffixes | Reduce Motion: visual appears whole, fields fill as crossfades |

### S-TASK.plan.folder-menu and S-TASK.plan.new-folder

| State | Drawn? | Rule |
|---|---|---|
| default | `#folder-phone-light` | List opens in place under "Save to"; current folder checked; "New folder" last |
| new folder | `#folder-phone-light` (end) | Row becomes a field with Create; Enter creates, Escape closes; the new folder is picked and the "On confirm" line updates |
| empty (no folders) | not drawn | Only "Practice plans" (default, made on first save) and New folder |
| lots | not drawn | List scrolls after 6 folders |
| long text | not drawn | Folder names one line, ellipsis; field max 60 characters (fixed 4 Nov: was 40; 60 matches the practice-plan lane, N-10 and `savePracticePlanDraft`, 1 to 60 trimmed) |
| error | not drawn | Folder create fails: field stays with the name, amber line "Couldn't make the folder", nothing else changes |
| folders not shipped | not drawn | (fixed 4 Nov: folders are names in `golf_documents.folder`, the one model for Ask, the builder and this panel, so the list does not wait for N-10.) While Save can't run (the Practice tab or its held migrations are not in), the row reads "Save to Practice plans" with no chevron and the primary is the inert "Comes with the Practice tab" (CP-QC rows in the Completeness section). Once Save runs, the list shows every folder name the team's Documents already use |

### S-TASK.busy

| State | Drawn? | Rule |
|---|---|---|
| default | mid `whole` play | Primary becomes a capsule with "Adding…" / "Sending…" / "Setting…" / "Saving…" and a sweep; Cancel fades out; both locked |
| slow | not drawn | Past 4s the label adds nothing new; the sweep keeps running; past 15s it fails as S-RCPT.failed |

### S-RCPT, S-RCPT.told, S-RCPT.undone, S-RCPT.failed

| State | Drawn? | Rule |
|---|---|---|
| receipt | `#receipt-<kind>-phone-light` | The object lands in the card (calendar dot, sent bubble "Sending in 8s", qualifier row on top of Qualifiers, plan in its folder); chip turns Added / Sent / Set / Saved; receipt row with Undo (ring drains 8s) and Open. The receipt text comes from the read-back row (TASK_FIELDS §2 rule 5) |
| told | `#told-<kind>-phone-light` | Undo fades; told row: coins light up in delivery order, "+N", line ("11 players got it on their calendar", "Delivered to 6. Seen by 2.", "11 players got a push and an email."). Plan: folder icon and "Only coaches can see it. Players are told when you publish." (fixed 4 Nov: was "Only you can see it."; a draft is `is_public` false, so every coach on the staff sees it, and the practice-plan lane says "Only coaches") |
| undone | `#undone-<kind>-phone-light` | Object leaves; neutral disc; chip "Undone"; line from TASK_FIELDS (e.g. "Undone. Nothing was added and nobody was told.") |
| failed | `#failed-<kind>-phone-light` | Amber disc, chip "Not saved", line ("Qualifiers didn't answer. Nothing was created."), Cancel and Try again; never red |
| partial | not drawn | Some parts written: amber, lists what was and wasn't created, "Check what was created before you try again."; no Try again on the parts that were written |
| reload after | not drawn | The receipt persists in the thread; after the window it shows without Undo |
| long text / XXL / dark / Reduce Motion / sizes | suffixes | Reduce Motion: object appears in place, coins all at once |

### S-RUN.cancelled and S-RUN.stopped

| State | Drawn? | Rule |
|---|---|---|
| cancelled | `#cancelled-phone-light` | Card body dims to 60% and stays readable; neutral receipt "Cancelled. Nothing was created." |
| stopped | `#stopped-phone-light` | Done steps stay; the running step reads as stopped; line "Stopped. Nothing was saved."; send returns |

### S-OPEN

| State | Drawn? | Rule |
|---|---|---|
| default | not drawn | Tap Open: the hold commits at once (TASK_FIELDS §3), the panel closes into the key, and the app routes to the object: Calendar day with the event selected, the Messages thread, Qualifiers with the new one first, and for a plan its plan page in the coach's draft view (fixed 4 Nov: was "Documents in the chosen folder"; see CP-QC-20) |
| while failed | n/a | No Open on a failed or undone receipt |

## Capture list

`capture/capture.mjs --id <ID> --state <state>` maps each ID and state above to the anchor in the "Drawn?" column and to the app's `?qc=` value. The script's `SHOTS` table is the source of truth; any state marked "not drawn" is shot on the app side only and checked against the rule in words.

## Completeness pass, 4 Nov 2026

Checked against the completeness brief: every state, size and mode, motion in and out, entry points, data, flags, handoffs to other lanes, and the extras (scroll, discard, double submit, two devices, time zone and the 1 Aug rollover, VoiceOver, haptics, share and print). Read with START_HERE's shared values, `../practice-plan/` (lane 6) and `../prerequisites/` (N-00 Practice tab, N-10 Documents). These rows add to the inventory and matrices above. Rows fixed in place above carry "(fixed 4 Nov: ...)" and are logged in the first table. The criteria for every new row are CP-QC-1 to CP-QC-32 in `08-ACCEPTANCE.md`.

### Fixed in place (log)

| File | Where | Was | Now | Why |
|---|---|---|---|---|
| 05 | S-TASK.plan.folder-menu, long text | field max 40 | 60 | `savePracticePlanDraft` takes 1 to 60, N-10 New folder takes 60 |
| 05 | S-TASK.plan.folder-menu, "folders not shipped" | the list waits for N-10's folders table | folders are names in `golf_documents.folder`; inert only while Save can't run | one folder model for Ask, the builder and this panel (practice-plan default 1) |
| 05 | Inventory S-OPEN and the S-OPEN default row | Open lands on Documents in the chosen folder | Open lands on the plan page `/golf/dashboard/practice/plan/<id>?from=coachhelm` | Documents itself opens a plan as its plan page (N-10 §4.10) |
| 05 | S-RCPT told, plan line | "Only you can see it." | "Only coaches can see it." | a draft is `is_public` false, which every coach on the staff can read (practice-plan 02 §6.3) |
| 06 | S-RCPT.told, plan variant | "Only you can see it." | "Only coaches can see it." | same |
| 08 | AC-QC-KEY-06 | `haptic('select')` | `haptic('press')` | 07 owns haptics |
| 08 | AC-QC-PLN-03 | folders wait for N-10 | folder by name; inert condition named | one folder model |
| 08 | AC-QC-PLN-04 | "Only you can see it." | "Only coaches can see it." | same as 05 |
| 08 | AC-QC-RCP-04 | the plan save is held 8s like other writes | the plan saves at once; Undo calls `undoPracticePlanDraft`; the ring still runs 8s | practice-plan default 9: a draft reaches nobody, so delete is an honest Undo |
| 08 | AC-QC-OPN-01 | plan opens Documents | plan opens its plan page | same as S-OPEN |
| 02 | Open route list | Documents folder | plan page | same |
| TASK_FIELDS | §5.14 Drill | "not buildable today" with no single bank named | one bank, N-00's `golf_team_drills`; Ask's HM5 superseded | coordinator ask, 4 Nov |
| TASK_FIELDS | §5.15 Practice plan and folders | "Open conflict" on folder ids | settled: folder by name, one plan object | coordinator ask, 4 Nov |

### Inventory additions

| ID | Kind | How you get there | Design link | App route | Roles | PR |
|---|---|---|---|---|---|---|
| S-TASK.plan.inert | confirm card state: the plan card with Save turned off | a plan request while `coachhelm_practice_plans_v1` is on and `golf_practice_plans` is off, or N-00's held 010000, 010400 or 010500 is not applied | not drawn; built from `#confirm-plan-phone-light` | `?qc=confirm-plan&practice=off` (add) | coach | QC4 |
| S-TASK.plan.needs-event | two cards in one run: S-TASK.cal for the practice, then S-TASK.plan | a plan request for a day with no practice event | not drawn; built from `#confirm-cal-phone-light` and `#confirm-plan-phone-light` | `?qc=plan-needs-event` (add) | coach | QC4 |
| S-TASK.offline | confirm card state | any confirm card while the device is offline | not drawn | `?qc=confirm-cal&net=off` (add) | coach | QC4 |
| S-RUN.earlier | fold row at the top of the panel body | the thread passes 30 turns | not drawn | `?qc=long-thread` (add) | coach | QC3 |
| S-OPEN.gone | route outcome | Open, or a later tap on an old receipt, for an object deleted since | not drawn; lands on the destination's own not-found state | per destination | coach | QC4 |

### S-PANEL.full (no matrix above)

| State | Drawn? | Rule |
|---|---|---|
| default | not drawn (the expand button is drawn) | Tap "Open full chat": the panel runs M-CLOSE into the key and today's CoachHelm Ask screen pushes in on the same thread (M-FULL). It opens scrolled to the newest turn |
| run in flight | not drawn | Expanding never cancels a run. The stream keeps running server-side and the Ask screen attaches to the same run, so the live step list continues there. The key shows S-KEY.working until the run ends (fixed 4 Nov wiring: the route stops generating when its request goes (`abortSignal: req.signal`, stream route :571) and has no resume, so the run stays alive only because the request belongs to the provider's `QuickChatSession`, which never unmounts on navigation; the Ask screen attaches by rendering from that session while the run is live, see 02 Completeness QC2) |
| confirm card waiting | not drawn | The card shows in the Ask thread with the same idempotency key. Confirming in either place commits once; the other place shows the receipt |
| `coachhelm_ask_v2` off | not drawn | The button still shows and opens today's Ask screen on the same thread. Quick chat cards show there as their read-back receipts, without Undo once the window has closed |
| back | not drawn | Back (button or edge swipe) returns to the screen the coach came from, never into the panel; the panel stays closed. The back label names that screen ("‹ Calendar") |
| thread per day | not drawn | (wiring 4 Nov: "today's thread" is the coach's newest conversation created since the team zone's midnight; conversations have no `team_id`, so a coach on two teams shares the day's thread, see 03 "Earlier today") The quick chat thread is one per coach per team-zone day. A new day starts a new thread at the team zone's midnight; the full chat lists the old one by its day |
| offline | not drawn | Button stays on; the Ask screen shows its own offline line |
| keyboard | not drawn | The expand button is in tab order after the context line and before ×; Enter or Space opens; focus lands on the Ask composer |
| desktop 1280 / XXL / dark / Reduce Motion | not drawn | Desktop is the same route change. Reduce Motion: `CH_FADE_MS` crossfade, no slide (07 M-FULL) |

### S-TASK.plan by flag and by migration

| State | Drawn? | Rule |
|---|---|---|
| `coachhelm_practice_plans_v1` off | n/a | No plan tile: the fourth start tile is the screen's next start from `quickStarts(pathname)`. A typed plan request gets one line, "Practice plans from CoachHelm aren't on for your team yet.", with no card and no write |
| S-TASK.plan.inert | not drawn | The card builds as drawn from the reads (time bar, blocks). The Save to row reads "Save to Practice plans" with no chevron. The primary is the inert "Comes with the Practice tab" (`aria-disabled`, no network call on press). No Open. The On confirm line reads "Nothing is saved yet. Plans save once the Practice tab is on." |
| both flags on, a held migration missing | not drawn | Same as S-TASK.plan.inert. The boot check reads the RPC's absence (42883 or 42P01) as inert, never as S-RCPT.failed |
| both flags on, migrations applied | `#confirm-plan-phone-light` | As drawn. Save calls `savePracticePlanDraft` with the folder by name; Undo calls `undoPracticePlanDraft`; Open goes to the plan page |
| publish asked for | n/a | The quick chat never publishes. "Publish it" answers with one line and an Open plan button; Publish lives on the plan page (N-00 §4.11), which runs the deferred send |
| panel opened inside the builder | n/a | On `…/practice/plan/<id>/edit` the plan tile reads "Help with this plan" and hands off to the builder's own helper (practice-plan S-BLD.helper): the panel closes into the key and the helper card opens. It never makes a second plan for the same event |

### S-TASK.plan.needs-event

| State | Drawn? | Rule |
|---|---|---|
| no practice that day | not drawn | A plan needs a practice event (N-00 010000: `event_id` is required). The run shows S-TASK.cal first ("Team practice", the day, the free window from the calendar read, everyone) with "On confirm: Adds the practice so the plan has a slot. Players see it on their calendar." and the primary "Add practice". The plan card builds under its receipt. Pressing "Save plan" commits the event's hold at once, as Open does (TASK_FIELDS §3), then saves the plan |
| Undo on the event first | not drawn | Undo on the event inside its 8s removes the plan card too, with "No practice, so no plan was made." |
| one practice that day | `#confirm-plan-phone-light` | No question. The field row reads "For Tue 4 Nov practice, 3:00 to 4:30 PM · from your calendar" |
| two or more that day | not drawn | S-RUN.ask-any with one group, "Which practice?", each option by time and place |
| that practice already has a plan | not drawn | The ask card offers "Open that plan" (S-OPEN) or "Start from it" (the card loads it as the draft; Save is a re-save and Undo restores the previous version). Never a second plan for one event (N-00's unique index) |
| event cancelled or all-day | not drawn | Not offered as a slot; a named one gets "That practice is cancelled" or "That practice is all day. Give it a time first." with no card |

### S-TASK.offline, two devices, roster changes, deleted objects

| State | Drawn? | Rule |
|---|---|---|
| S-TASK.offline | not drawn | The primary is disabled with one line above it, amber icon: "You're offline. Nothing was saved." Fields and Cancel stay. Back online, the primary turns on again; nothing sends by itself |
| connection lost after the press | not drawn | S-TASK.busy waits up to 15s, then S-RCPT.failed "Lost the connection. Check what was created before you try again." Try again reuses the idempotency key, so a write that did land comes back as its receipt |
| same card on two devices | not drawn | One run per idempotency key in `golf_coachhelm_action_runs`. The second press gets the first run's receipt. The other device shows it on its next focus or poll |
| Undo from the other device | not drawn | Allowed while `held_until` is in the future. Both rings count to the server's `held_until`, so they empty together |
| player removed between card and confirm | not drawn | The server re-reads the roster at commit and drops them; the told line counts only those told. If they were the only target: S-RCPT.failed "Jonah isn't on the team any more. Nothing was created." |
| coach loses the coach role mid-session | not drawn | The next action gets today's not-allowed error in the receipt; the key is gone on the next route load |
| S-OPEN.gone | not drawn | Open lands on the destination's own not-found state: the Calendar day without the event, the Messages list, the Qualifiers list, and for a plan N-00's CH-17302 copy on Practice home. The receipt keeps its text and drops Open |

### S-RUN.earlier, scroll, discard, time and the season

| State | Drawn? | Rule |
|---|---|---|
| S-RUN.earlier | not drawn | Past 30 turns the oldest fold into one row at the top of the body: "Earlier in this chat · Open full chat", which goes to S-PANEL.full. The panel never renders more than 30 turns |
| scroll restore | not drawn | Within an app session, closing and reopening keeps the scroll position and any typed text. A run that finished while closed scrolls to its receipt once. After an app reload the panel opens at the newest turn |
| discard | not drawn | Closing never discards and never asks. Typed text stays in the composer; an open confirm card stays waiting (S-KEY.flag). A card still waiting at the team zone's midnight reads "This draft expired. Nothing was created." |
| "Earlier today" | `#hello-phone-light` | "Today" is the team zone's day (`season.ts` zone, fallback America/New_York). Times on cards carry the team zone (TASK_FIELDS §2 rule 1) |
| 1 Aug rollover | not drawn | Season-scoped reads (roster, year coins, last plan's groups) use the season that holds the target date, not today's. A plan for 2 Aug asked for on 31 Jul reads the new season's roster |
| double submit | not drawn | The primary locks on the first press (S-TASK.busy); Enter on a busy primary does nothing; the idempotency key covers a double tap that reaches the server twice |
| pull to refresh, search, optimistic update, share, print | n/a | The panel is not a page and never pulls. It has no search; a name that matches nobody is S-RUN.ask-any. Nothing shows as done before the read-back row (TASK_FIELDS §2 rule 5). A plan's print and share live on the plan page (practice-plan S-DOC.print-*) |

### Entry points, accessibility and the held migration

| State | Drawn? | Rule |
|---|---|---|
| entry: key and ⌘J / Ctrl+J | `#closed-phone-light` | As S-KEY. Flag off (`coachhelm_quick_chat_v1`): main's `AskSheetButton` renders exactly as today (QC6 parity) |
| entry: push, bell, deep link | n/a | Nothing opens the panel from outside. A task's own notification opens its object (the event, the thread, the qualifier, the plan page). `?qc=` works only under `/clubhouse-preview/` |
| VoiceOver: steps | not drawn | The step list is a polite live region; each step is read once when done ("Read the calendar, done"), never per frame |
| VoiceOver: receipt and Undo | not drawn | The receipt is one polite line ("Saved. Undo for 8 seconds."). Undo's name is "Undo, N seconds left", updated every 2 seconds, not per frame |
| focus | not drawn | Open: focus on the composer. A confirm card moves focus to its title only if the coach has not typed since sending. Escape closes and focus returns to the key. Folder list: arrows move, Enter picks, Escape returns to the Save to row |
| HM1 not applied (dev or preview only) | not drawn | QC4 ships with flags off until HM1 `20261101090000_coachhelm_action_runs_hold` is applied. On a stack without it (boot check 42703 on `run_at`) writes run at once with no Undo, the receipt reads "Done. Undo isn't on here yet.", and the told row fills as delivery rows arrive (Ask parity) (fixed 4 Nov wiring: Ask parity is S-ASK.kit.no-hold, where only today's four writes (recurring practice, focus area, task, team update) run, at once, through today's card. So without HM1 the quick chat offers no event, message or qualifier task, because each tells players inside the call or straight after it and could not be taken back; a message request ends in "Open in Messages" through `messagesPrefillHref`, and the coach sends there. The plan save is not held and still works, except S-TASK.plan.needs-event, which reads "Add a practice to the calendar first".) |

### Handoffs

| From (this lane) | To | What passes | Rule |
|---|---|---|---|
| S-TASK.plan Save | practice-plan `savePracticePlanDraft` and N-00 010500 | the plan body, the folder by name, `playerVisible: false` | The same plan object and the same Documents row Ask and the builder write; same receipt copy |
| S-OPEN (plan) | N-00 plan page `plan/[planId]` (coach draft view) | plan id, `?from=coachhelm&ret=<path>` | Back label names the source screen; Edit there opens the builder |
| S-TASK.plan inside the builder | practice-plan S-BLD.helper | route context | "Help with this plan"; no second plan |
| Drill request ("add a drill to the bank") | N-00 `golf_team_drills` via `createTeamDrill` | name, area, kind, minutes and the TASK_FIELDS §5.14 fields | Before 010100: "Drill bank comes with the Practice tab", and offer it as a plan block. Never `golf_drills` |
| Folder list | Documents (N-10) | folder names from `golf_documents.folder` | Free text until N-10's 090200; names stay the link after it |
| S-PANEL.full | Ask lane screen | thread id (fixed 4 Nov wiring: the conversation id, through `conversationHref(id)`, `?view=ask&c=<id>`) | Same run, same idempotency key |
| Publish | N-00 `publishPracticePlan` with `notify: 'defer'` | none from this lane | Publish happens on the plan page; push and bell after the 8s window (practice-plan default 3) |
