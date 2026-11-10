# Ask v2: gap against the owner's design (2026-11-07)

Survey of `agent/ch-ask-v2` (based on `origin/agent/ch-consolidate`) against `design-refresh/ask/` (`01-BRIEF`, `ASK_REDESIGN`, `05-SCREENS`, `07-MOTION`, `08-ACCEPTANCE`) and the owner's latest page `design-refresh/ask/redesign/coachhelm-ask.html`. The uncommitted diff to that page is the document wrapper only (`<html>`, `<body>`); no scene, token or "Decided" row changed.

**How to read it.** Every status is from reading source. Nothing here was seen in a browser; a DONE row means the selector, keyframe or component exists and is wired, not that it matches the design pixel for pixel. Paths are relative to `src/clubhouse/screens/coachhelm/` unless they start with `src/`. Line numbers are those of this branch's first commit; later rows in the "Built on this branch" section say what moved.

**State of play.** Ask v2 was built across the earlier `ch-ask` lane (change logs `2026-11-05-ask-design-reconcile`, `2026-11-06-ask-lane` under `docs/clubhouse/pages/P013-coachhelm/changes/`). The CoachHelm flags were retired on `ch-consolidate` (`f78315c73b`): there is no `coachhelm_ask_v2` switch any more, and none is re-added. HM1 to HM4 exist as held migrations (`supabase/migrations/20261101090000` to `090300`, listed in `supabase/migrations/HELD.md`); folders are free text on `golf_documents.folder`, so no folders table is needed and none is written.

Counts, motion rows (112): see the summary under the table.

## Decided rows (the owner's, binding)

| Decided | Status | Evidence |
|---|---|---|
| Players get their own Ask: own data, stats and visuals, no writes, PGA Tour and team averages only, hidden weekly allowance | DONE | `src/lib/coachhelm/v3/chat/player-tools.ts` (reads only, `player_id` forced), `player-allowance.ts`, `parts/Allowance.tsx`; HM3 and HM4 held |
| Artifacts save to Documents only when the coach taps Save, into a folder or a new one; a published plan also files a copy in Practice plans | PARTIAL | practice plan: `plan/PlanCard.tsx:135-226`, in-card folders and Undo. Other artifacts: `parts/Artifact.tsx:86-166` is a Modal with a Select, saves with a toast and no Undo |
| Announcements post on Post with the 8 second Undo; players are told once Undo closes; boards and polls are drafts in the Messages composer | DONE | `src/lib/coachhelm/v3/chat/create-tools.ts` (announcement on the gate, `undo-hold.ts`), `parts/HandoffCard.tsx:62-89` |
| Steps stay open while CoachHelm works, then fold to "N steps · Ns" | DONE | `parts/Steps.tsx:41-86`, `coachhelm-ask-v2.css:726-728` |

## Spec items (`ASK_REDESIGN.md` section 3)

| # | Item | Status | Evidence and what is open |
|---|---|---|---|
| 1 | Steps | DONE | `parts/Steps.tsx`; breathing dot, shimmer, drawn check, amber ring `coachhelm-ask-v2.css:33-40`; detail line per done row |
| 2 | Tool card skeleton and crossfade | DONE | `parts/ToolCard.tsx`, `parts/AnswerCard.tsx:118-133` |
| 3 | Read chips and Sources | DONE | `parts/ReadChip.tsx`, `parts/Sources.tsx`; Sources reveal is a fade, not a clip (M-ASK-23) |
| 4 | Visual kit: miss pattern, putt profile, season compare, hole strip, tap to ask | DONE | `chat/visual/blocks.tsx`, `coachhelm-ask-v2.css:150-180`; season draw-in is a rise only (M-ASK-19) |
| 5 | Artifact card, desktop pane, phone push, versions | DONE | `parts/Artifact.tsx:17-80,196-244`, `coachhelm-ask-v2.css:548-557` |
| 6 | Confirm, commit, receipt, Undo, Told | DONE | `parts/ConfirmCard.tsx`, `src/lib/coachhelm/v3/chat/undo-hold.ts`, `held-runner.ts`; "Seen by" is MISSING (a coach cannot read another user's notification rows; no RLS-safe source) |
| 7 | Follow-ups, three chips together in 260ms | PARTIAL | `parts/FollowUps.tsx`: chips and press, no entrance (M-ASK-25) |
| 8 | Composer: glass, scope line, @ menu, / jobs | DONE | `chat/Composer.tsx:171-326` (`slash`, mention picker, `ch-ak-cscope`), `src/clubhouse/data/coachhelm-slash.ts` |
| 9 | Tone: Straight, Detailed, Team talk; players Encouraging | DONE | `parts/KnowsPanel.tsx:10-16`, `src/lib/coachhelm/v3/chat/ask-knows.ts:25-34`, `player-tools.ts:111` |
| 10 | CoachHelm knows (coach-written facts only) | DONE | `parts/KnowsPanel.tsx:48-107`, `src/app/golf/actions/coachhelm-ask.ts` |
| 11 | Practice brief asks first, defaults from data, Skip, Change answers | DONE | `parts/BriefCard.tsx`, `src/lib/coachhelm/v3/chat/ask-draft-tools.ts:56` |
| 12 | Save to a folder: docked card, in-card list, New folder, flight, receipt with Undo | PARTIAL | practice plan DONE in `plan/PlanCard.tsx:194-226`; any other artifact is a Modal (`parts/Artifact.tsx:121-165`) with no flight, no receipt and no Undo |
| 13 | Task moments: calendar, focus, publish, folder | PARTIAL | calendar `parts/DraftVisual.tsx:48`; focus and publish have no player-card or avatar fan-out (M-ASK-80 to 82) |
| 14 | Messages surfaces: radius, shadows, glass composer | DONE | `coachhelm-ask-v2.css:19,279-285` (source only) |
| 15 | Create flows (11 flows plus 5 quiet ones) | PARTIAL | server DONE for all (`src/lib/coachhelm/v3/chat/create-tools.ts:126-435`); drafts are drawn for event, announcement, qualifier, task, goal, note, trip, lineup, board, poll; **static**, no motion (M-ASK-59 to 71); drill has no draft visual |

### Create flows

| Flow | Server | Draft visual | Motion |
|---|---|---|---|
| Event | DONE `create_event` | DONE week grid | PARTIAL (slot only) |
| Announcement | DONE | DONE lock preview | DONE |
| Travel | DONE `create_trip` | DONE schematic route | MISSING |
| Board | DONE `draft_board` | DONE | MISSING |
| Poll | DONE `draft_poll` | DONE | MISSING |
| Qualifier | DONE | DONE | DONE |
| Lineup / Lock | DONE `set_lineup`, `lock_lineup` (no Undo on Lock) | PARTIAL list | MISSING |
| Task | DONE | DONE ring tile | MISSING |
| Goal | DONE | PARTIAL (target only, per change log) | MISSING |
| Round note | DONE | DONE | MISSING |
| Drill | DONE `create_drill` (needs held N-00 `20261026010100`) | MISSING | MISSING |
| Block time, break, class exception, recruit, availability note | DONE (`add_blocked_time`, `add_team_break`, `save_team_term`, `create_recruit`, `set_availability_note`) | fields only (per design: "no new visual") | n/a |

## What Ask can see (design table, 9 areas)

| Area | Status | Evidence |
|---|---|---|
| Strokes gained and core stats | DONE | `agent-tools.ts` (`get_player_metrics`, `get_player_trend`, `get_team_metric_ranking`, `compare_players`); by course and by round type not read |
| Shots | DONE | `src/lib/coachhelm/v3/chat/shot-reads.ts` (`get_shot_pattern`, `get_proximity_by_band`); putts by distance `get_putting_distance_profile` |
| CoachHelm engine: root causes | DONE | `engine-reads.ts:12` `get_root_causes` |
| CoachHelm engine: team patterns | MISSING | no `get_team_patterns`; `src/lib/coachhelm/v3/team-pattern/pattern.ts` is unread by chat |
| CoachHelm engine: track record, corrections | MISSING | no chat read; modules exist under `src/lib/coachhelm/v3/track-record`, `corrections` |
| Rounds: hole by hole, course difficulty | DONE | `shot-reads.ts:188` `get_round_detail`, `engine-reads.ts:32` `get_course` |
| Practice: reviews and plans | MISSING | only the drill bank, plan format, class times (`practice-reads.ts`); no `get_practice` |
| Calendar and classes | PARTIAL | `engine-reads.ts:24` `get_calendar` leaves out `event_type='class'` and attendance; `get_class_times` reads one day |
| Documents: titles and plans | MISSING | no read of `golf_documents` |
| Qualifiers and tournaments | DONE | `get_qualifiers`, `get_tournaments` |
| Messages (stays out) | DONE | drafts only, `ask-draft-tools.ts` |
| The in-app "What Ask can see" list | PARTIAL | `parts/KnowsPanel.tsx:19-28` has no Documents row; Practice row still says "once the Practice tab is on" (flags retired) |

## Screen IDs (`05-SCREENS.md`, 315 IDs), by group

| Group | IDs | Status | Evidence |
|---|---|---|---|
| Shell, home, scope, history, settings, tone, knows, flag-off | S-ASK, .player, .scope, .history*, .settings, .tone*, .knows*, .loading, .error | DONE | `chat/Ask.tsx`, `Home.tsx`, `History.tsx`, `parts/KnowsPanel.tsx`; History has no "more" paging (.history.more) |
| Composer and menus | .composer*, .jump | PARTIAL | `chat/Composer.tsx`; jump key has no fade |
| Turn: bubble, answer, steps (7), tool cards (8), read chip, sources, follow-ups, hypothesis, answers | .turn*, .steps*, .toolcard*, .readchip*, .sources*, .followups, .hypothesis, .answer* | DONE (follow-ups PARTIAL) | `chat/Thread.tsx`, `parts/` |
| Brief (8) | .brief.q1 to .skip, .change | DONE | `parts/BriefCard.tsx` |
| Artifact (7) and Publish (6) | .artifact*, .publish* | PARTIAL | pane, push, versions DONE; "why" popover and edit are not separate surfaces |
| Save (9) | .save* | PARTIAL for non-plan artifacts | see spec item 12 |
| Plan flow (9) | .flow.plan.* | DONE | `plan/PlanCard.tsx`, `parts/ConfirmCard.tsx` |
| Task moments (17) | .moment.cal, fold, focus, pub | PARTIAL | cal DONE; fold DONE in PlanCard; focus and pub have no mock homes |
| Kit failure states (7) | .kit.* | PARTIAL | copy and chips exist (`parts/ConfirmCard.tsx:121,223,318`), no motion |
| Create flows (193) | .flow.f_event, f_annc, f_travel, f_board, f_poll, f_qual, f_lineup, f_task, f_goal, f_note, f_drill, q_* | PARTIAL | server and fields DONE; bespoke home mocks and motion open as in the create-flow table |
| Player Ask (16) | .player.* | DONE | `parts/Allowance.tsx`, `chat/Home.tsx`; request, undo, requested all present |
| Mid-desktop and chat gone | .desk-mid, .chat.gone | PARTIAL / DONE | `coachhelm-ask.css:1208-1240`, `chat/Ask.tsx:251` |

## Motion rows (`07-MOTION.md`, M-ASK-01 to 112)

Layout properties (height, grid track, width) are never animated; the house lint (`clubhouse/no-layout-motion`, `scripts/clubhouse/css-quality.mjs`) bans them, so those rows are built as transform or clip and noted "can't match as drawn" where the design animates the box.

| ID | Trigger | Element | Status | Evidence (source only) |
|---|---|---|---|---|
| M-ASK-01 | Tap Ask in the Board | Ask segmented (no slop, on release) | DONE | shared Segmented pill spring (`ui/Segmented.tsx`), thread rise `coachhelm-thread.css:47-49` |
| M-ASK-02 | Send press (Send button or Return), question non-empty | `.msg-u` bubble | PARTIAL | user turn rises on `ch-th-rise` (release beat, `coachhelm-thread.css:47`), not the settle spring on 260ms |
| M-ASK-03 | The composer has focus and text is being typed | composer caret | DONE | native textarea caret (`chat/Composer.tsx`), nothing to draw |
| M-ASK-04 | The question bubble has landed | `.msg-a` answer card (empty, mark busy) | DONE | `.msg-a` fade on base beat `coachhelm-ask-v2.css:18`; reduced branch `:79-84` via tokens zeroing |
| M-ASK-05 | A read starts (tool input-available) | `.step` row | DONE | `.step.is-in` rise6 on smooth spring `coachhelm-ask-v2.css:28`, set by `parts/Steps.tsx:77` |
| M-ASK-06 | A step row is running | `.step .dot` (8, accent) | DONE | `.step .dot` breath on `--ch-dur-reveal` (520 vs 600 drawn) `coachhelm-ask-v2.css:33`, off under reduce `:80` |
| M-ASK-07 | A step row is running | `.step .lb.shim` label | DONE | `.lb.shim` on `--ch-dur-shimmer` `coachhelm-ask-v2.css:40`, off `:80-81` |
| M-ASK-08 | A step is done (tool output-available) | `.step.done .ic path` check | DONE | check draws on live list only `coachhelm-ask-v2.css:32`, `:82` |
| M-ASK-09 | A step is done | step label and detail | DONE | colour swap is a class change, no transition (`parts/Steps.tsx`) |
| M-ASK-10 | While any step runs | `.work .sum .shim` "Working" summary | DONE | `.work .sum.is-live` shimmer `coachhelm-ask-v2.css:404`, `parts/Steps.tsx:86` |
| M-ASK-11 | Last step done, then 380ms | `.work .body` (grid rows) | DONE | fold is a `clip-path` unfold, not a height animation `coachhelm-ask-v2.css:726-728` |
| M-ASK-12 | Tap the folded steps line | `.work .sum` chevron; `.work .body` | DONE | chevron rotate `coachhelm-ask-v2.css:24-25`; body unfold `:726-727` |
| M-ASK-13 | Send press | composer Send button | PARTIAL | send/stop swap in place (`chat/Composer.tsx:87`), no 180ms icon crossfade |
| M-ASK-14 | Answer text streams | `.prose .w` words | DONE | per-word fade `coachhelm-ask-v2.css:541-545` on `--ch-dur-word` |
| M-ASK-15 | A sentence with a read chip streams | `.cite` chip | PARTIAL | chip is inline in the word stream; it takes the word fade only if wrapped as a word (`chat/Prose.tsx`) |
| M-ASK-16 | A read with a visual starts | `.vcard .sk` skeleton bars | DONE | `.sk i` shimmer `coachhelm-ask-v2.css:71`, off `:80` |
| M-ASK-17 | The read lands | `.vcard` skeleton → chart | DONE | skeleton ghost and incoming chart crossfade in `.ch-ak-swap` `parts/AnswerCard.tsx:118-133`, `coachhelm-ask-v2.css:858-860` |
| M-ASK-18 | Chart drawn the first time | bars and dots in `.vb svg` | DONE | marks grow once under `[data-live]`, never on a restored thread `coachhelm-ask-v2.css:746-750` |
| M-ASK-19 | Season read lands | season line and last season band | PARTIAL | season block rises (`coachhelm-ask-v2.css:748`); the 900ms line draw and band fade are not drawn, the chart is a range scale |
| M-ASK-20 | Miss pattern read lands | wedges and dots | DONE | wedges scale/fade `coachhelm-ask-v2.css:747` |
| M-ASK-21 | Tap a bar or dot (`.bar-hit`) | composer text | DONE | `ch-ask-fill` event fills the composer `chat/visual/blocks.tsx:8` |
| M-ASK-22 | Tap a read chip | `#pop` popover | PARTIAL | popover in 200ms with a literal `0.2s` `coachhelm-ask-v2.css:733`; position flips (`parts/ReadChip.tsx:24`) |
| M-ASK-23 | Tap "Sources" from the popover | `.srclist` well | PARTIAL | Sources well fades in (`coachhelm-ask-v2.css:738`), no height/clip reveal |
| M-ASK-24 | Tap "4 reads" | `.srclist` well | PARTIAL | same as 23 |
| M-ASK-25 | The answer finishes | three `.chip` follow-ups | MISSING | `parts/FollowUps.tsx` has no entrance; chips appear at once |
| M-ASK-26 | Press a follow-up chip | `.chip` | DONE | `data-ch-press` on chips `parts/FollowUps.tsx:17` |
| M-ASK-27 | The plan starts writing | `.acard` card; `.tile.busy` scan | DONE | tile scan `coachhelm-ask-v2.css:133,146`; card press `parts/Artifact.tsx:19`; no card rise |
| M-ASK-28 | Desktop: the plan opens | `#apanel` pane | PARTIAL | desktop pane slides in by transform on the smooth spring `coachhelm-ask-v2.css:548-557`; the chat does not reflow by a width animation (can't match as drawn: no layout motion) |
| M-ASK-29 | Phone: the plan opens | pushed plan screen | DONE | `PhoneScreen` push `parts/Artifact.tsx:218` |
| M-ASK-30 | Tap back on the pushed plan | pushed plan screen | DONE | leaving slide-out waits for the animation `parts/Artifact.tsx:199-214` |
| M-ASK-31 | Plan blocks are written | `.blk` blocks | PARTIAL | blocks of a plan are written whole; `.ch-ak-draftwords` on drafts only |
| M-ASK-32 | Writing | `.wh` write head caret | PARTIAL | write head `ch-ak-wh` exists for confirm fields `coachhelm-ask-v2.css:624`; not on a plan pane |
| M-ASK-33 | The brief card appears | `.qcard` | DONE | `.qcard` rise on settle spring `coachhelm-ask-v2.css:564` |
| M-ASK-34 | Pick an option | `.opt .bx` disc and check | DONE | `.opt .bx` fill and check stroke `coachhelm-ask-v2.css:568-573` |
| M-ASK-35 | Next | `.qtrack` panes | DONE | `.qpane.is-next/is-back` translate on the send spring `coachhelm-ask-v2.css:565-566` |
| M-ASK-36 | Next or Back | `.qvp` viewport height | PARTIAL | viewport height snaps (no layout motion allowed); panes translate |
| M-ASK-37 | Next | `.qdots i` progress dots | DONE | `.qdots i` scale and colour `coachhelm-ask-v2.css:567` |
| M-ASK-38 | Tap "Anything else?" on the last question | free line field | PARTIAL | free line opens by class swap `parts/BriefCard.tsx:99`, no 462ms height |
| M-ASK-39 | Last Next (Build the plan) | `.qcard` → `.qsum` answer pills | DONE | pills enter staggered `coachhelm-ask-v2.css:574` |
| M-ASK-40 | Reads done in a create flow | `.inf .ipl` Worked out pills | DONE | pills pop 70ms apart `coachhelm-ask-v2.css:635` |
| M-ASK-41 | The event draft is built | `.wkg` week grid: days, column highlight, busy dots, free slot | PARTIAL | open slot pulse `coachhelm-ask-v2.css:677-683` and landing; days rise, column scan and dot pops not drawn (`parts/DraftVisual.tsx:48`) |
| M-ASK-42 | Draft fields fill | `.evd .f` fields | DONE | fields fill with write head `coachhelm-ask-v2.css:621-624` |
| M-ASK-43 | Press the primary button (Add to calendar) | `.btns .p` | PARTIAL | button becomes a capsule by class (`parts/ConfirmCard.tsx:298`); no 427ms radius/width morph |
| M-ASK-44 | While the write runs | `.p.cap::after` sweep bar | DONE | `.p.cap::before` sweep `coachhelm-ask-v2.css:106,124` |
| M-ASK-45 | The write returns | flyer clone of the draft | DONE | `flyDraftHome` 462ms two-axis `chat/ask-flight.ts:23`, called `parts/ConfirmCard.tsx:127` |
| M-ASK-46 | The flyer lands | home slot | DONE | `.slot.is-landing` pop `coachhelm-ask-v2.css:681` |
| M-ASK-47 | Announcement write returns | post flies into the Messages list above the older posts | PARTIAL | announcement lands as the kit receipt; it does not fly into a Messages list (no list mock in the card) |
| M-ASK-48 | The write returns | `.conf.flash::after` edge flash | DONE | edge flash `coachhelm-ask-v2.css:108,125`, set `parts/ConfirmCard.tsx:125` |
| M-ASK-49 | Receipt in | `.receipt .ck` check disc and ring | DONE | check disc and ring `coachhelm-ask-v2.css:114-116,126` |
| M-ASK-50 | Receipt in | `.hd .dchip` Draft chip | DONE | Draft chip pop `coachhelm-ask-v2.css:642`, `parts/ConfirmCard.tsx:163` |
| M-ASK-51 | Receipt in | `.undo .drn` ring | DONE | 8s drain ring, kept under reduce `coachhelm-ask-v2.css:121,851-852` |
| M-ASK-52 | Tap Undo within 8s | `.receipt` line, Open and Undo | DONE | undone line, Undo fades `coachhelm-ask-v2.css:646-647` |
| M-ASK-53 | Undo window closes (8000 after the receipt) | `.told` row; `.coin` coins | DONE | told row and coins `coachhelm-ask-v2.css:655-657`, `parts/ConfirmCard.tsx:453` |
| M-ASK-54 | Tap Cancel on the draft | `.btns` row → `.cxl` line; draft well | PARTIAL | cancel swaps buttons for `.cxl` line `parts/ConfirmCard.tsx:306`; draft does not desaturate on a fade |
| M-ASK-55 | The event draft is built (whole sequence) | week grid then the event chip | PARTIAL | composite of 41 and 42 |
| M-ASK-56 | Fields fill to confirm (whole sequence) | fields, oncf, buttons | DONE | composite of 42; `coachhelm-ask-v2.css:621-623` |
| M-ASK-57 | The announcement draft is built | `.lockp` lock preview; `.ban` banner; Messages rows | DONE | lock fade and banner drop `coachhelm-ask-v2.css:696-698` |
| M-ASK-58 | Undo window closes on the announcement | Told coins; Got it count | PARTIAL | coins pop `coachhelm-ask-v2.css:656`; no Got it count (needs a read of acknowledgements) |
| M-ASK-59 | The trip draft is built | route line, van, flag | MISSING | trip draft is static `parts/DraftVisual.tsx:259`, `coachhelm-ask-v2.css:898`; no route draw, van or flag |
| M-ASK-60 | The trip draft fills | room pairs; uniform chips | MISSING | trip rooms and chips do not animate |
| M-ASK-61 | The board draft is built | `.board` well; tiles; bars | MISSING | board draft is static `parts/HandoffCard.tsx:62`; no tile pop or bar growth |
| M-ASK-62 | Open in Messages pressed and the write returns | board → thumbnail in the player's Messages composer | MISSING | board does not fly into the Messages composer (hands off via prefill only) |
| M-ASK-63 | The poll draft is built | poll options; "Free for 7" checks | MISSING | poll options render at once `parts/HandoffCard.tsx:70` |
| M-ASK-64 | The qualifier draft is built | `.qr` round cards; seat coins; `.sbar i` seats | DONE | round cards slide, seat bar fills `coachhelm-ask-v2.css:712-714`; coins use the shared pop |
| M-ASK-65 | The lineup card is shown first | `.lr` standings; coin flyers; tied rows | MISSING | lineup draft is a static list `parts/DraftVisual.tsx:284`; no coin flight or tied wobble |
| M-ASK-66 | Set the lineup pressed and the write returns | receipt "Lineup set · Hargrove round 1" | DONE | kit receipt (rows 48 to 50) |
| M-ASK-67 | The task draft is built | due ring; assignee coins; bell | MISSING | task ring and bell static `parts/DraftVisual.tsx:204`, `coachhelm-ask-v2.css:899-903` |
| M-ASK-68 | The goal draft is built | 8 rounds line; dots; goal band; arrow | MISSING | goal draft shows its target only (documented in change log 2026-11-06); no line or band |
| M-ASK-69 | Undo window closes on the goal | tag "Waiting" → "Accepted" | MISSING | no Waiting to Accepted tag; accept state is not read |
| M-ASK-70 | The note draft is built (straight after Worked out; no brief) | 18 hole bars; pin; note card | MISSING | note draft static `parts/DraftVisual.tsx:249`; no bars or pin |
| M-ASK-71 | The drill draft is built | green; gate tees; 8 balls; one rolling ball | MISSING | drill draft has no visual; flow writes `golf_team_drills` through the kit (`chat/create-tools.ts`) |
| M-ASK-72 | Task fields fill to confirm | fields | DONE | same fill as 42 |
| M-ASK-73 | Tap "Save draft…" | `.savecard` docked above the footer | PARTIAL | Save draft opens a Modal sheet (`parts/Artifact.tsx:121-165`), not a docked save card |
| M-ASK-74 | Tap the "Save to" row | folder list | PARTIAL | folder list is a Select, no in-card list |
| M-ASK-75 | Tap the "Save to" row again | folder list; chevron | PARTIAL | same as 74 |
| M-ASK-76 | Tap New folder, type, Create | name field; the new folder row | PARTIAL | New folder is an option plus a name field `parts/Artifact.tsx:150-157` |
| M-ASK-77 | Save pressed and the write returns | page clone → folder icon | PARTIAL | practice plans fly (`plan/PlanCard.tsx:194-202`); other artifacts do not (`parts/Artifact.tsx:112-120` toasts) |
| M-ASK-78 | The page lands in the folder | folder art; count; Draft chip | PARTIAL | squash only on the plan card (`plan/PlanCard.tsx:202`) |
| M-ASK-79 | Tap "Publish…" | `.fpick` sheet | DONE | Publish through the kit confirm in a sheet (`parts/Artifact.tsx:185-189`, `Ask.tsx`) |
| M-ASK-80 | Publish pressed and the write returns | plan → 7 player avatars and Practice plans | MISSING | no fan-out to avatars; the publish draft shows coins (`parts/ConfirmCard.tsx`) |
| M-ASK-81 | Undo window closes on publish | avatar badges | MISSING | no badge swap on Told |
| M-ASK-82 | Set focus pressed and the write returns | chip flyer → empty focus slot; avatar ping | MISSING | focus flow has no player-card mock or ping |
| M-ASK-83 | Player sends a question with the allowance used up | `.outcard`; "Request more" button | PARTIAL | out card and late button rise `coachhelm-ask-v2.css:247-249`; button uses rise6 not the pop spring |
| M-ASK-84 | Player home loads | `.allow` meter | DONE | meter drawn at its value `coachhelm-ask-v2.css:204-232` |
| M-ASK-85 | Tap Detailed in the tone control | segmented pill; sample text | PARTIAL | pill moves on Segmented spring (`parts/KnowsPanel.tsx`); no sample text |
| M-ASK-86 | Press a Worked out pill | `.ipl` | DONE | pills press `.97` `parts/ConfirmCard.tsx:171` |
| M-ASK-87 | Tap a Why chip in a plan block | `#pop` popover | DONE | same popover as 22 (`parts/ReadChip.tsx`) |
| M-ASK-88 | Press "Add to calendar" on the plan's calendar card | as M-ASK-43 to M-ASK-50 | DONE | plan card uses the kit (`plan/PlanCard.tsx`, `parts/ConfirmCard.tsx`) |
| M-ASK-89 | Told on the lineup (Undo closes), then a press on "Lock lineup" | `.lockask` card; `.p` → capsule; `.ls.in .lk` seat locks; receipt | PARTIAL | `lock_lineup` flow exists with no Undo (`chat/create-tools.ts`); no separate Lock card or lock pops |
| M-ASK-90 | Phone: tap the history button or the chat title | history sheet (74%); thread underlay | DONE | history sheet on `ui/Modal` sheet spring (`chat/History.tsx`) |
| M-ASK-91 | Close: tap outside, drag down or Esc | history sheet; underlay | DONE | Modal exit and drag |
| M-ASK-92 | Phone: tap the settings button | settings sheet (tone and CoachHelm knows) | DONE | settings sheet `Ask.tsx`, `parts/KnowsPanel.tsx` |
| M-ASK-93 | Tap Edit in CoachHelm knows | Edit what it knows sheet (phone) or rail card in place (desktop) | DONE | Knows edit in the panel (`parts/KnowsPanel.tsx:92-107`) |
| M-ASK-94 | Type @ or tap @ | @ menu above the composer | DONE | picker `coachhelm-ask.css:722` on `--ch-dur-quick` (180 vs 200) |
| M-ASK-95 | Type / at the start of the input | / menu | DONE | same picker |
| M-ASK-96 | Tap + | + key; + menu | PARTIAL | + menu opens without key rotation (`chat/Composer.tsx:381`) |
| M-ASK-97 | Close any composer menu: pick, Esc, tap outside | the open menu | PARTIAL | picker closes at once (`coachhelm-ask.css:728` down keyframe exists for the picker) |
| M-ASK-98 | Close the read chip or Why popover: tap outside, Esc, or open another | `#pop` | PARTIAL | popover removed at once |
| M-ASK-99 | Tap Expand on a tool card | expanded chart sheet (phone full height) or centred modal 720 (desktop); chart | DONE | Expand opens `ui/Modal` (`chat/visual/CoachComposition.tsx:292`) |
| M-ASK-100 | The reader scrolls more than 0.9 of a screen up while a turn streams or after one lands | jump key | MISSING | jump key appears with no fade (`coachhelm-ask-v2.css:763`) |
| M-ASK-101 | Tap the jump key | thread scroll | PARTIAL | `scrollTo` with `behavior` (`chat/Thread.tsx:119`) |
| M-ASK-102 | Send while the reader is near the bottom | thread scroll | PARTIAL | same |
| M-ASK-103 | Stop pressed while words stream | last words; Stop key; stopped line | PARTIAL | stopped line is static (`coachhelm-ask-v2.css:741`) |
| M-ASK-104 | The stream ends with no done event | dropped line; offline line in the composer | PARTIAL | dropped line is an error row (`chat/Thread.tsx:246`), no fade |
| M-ASK-105 | The server reports the held write failed (on the receipt or on return) | receipt check disc → alert disc; line; Draft chip; draft colour | PARTIAL | release failure copy and chip exist (`parts/ConfirmCard.tsx:121`); no disc morph |
| M-ASK-106 | Undo pressed after release (409) | Undo link and ring; receipt sub | PARTIAL | late Undo line exists (`parts/ConfirmCard.tsx:223,318`); no fade |
| M-ASK-107 | Execute-time re-check finds a change | capsule → primary button; On confirm line → change line; draft fields | PARTIAL | re-check changes the card in place (`parts/ConfirmCard.tsx`) |
| M-ASK-108 | Tap the history button (821 to 1279) | rail overlay; scrim | PARTIAL | tablet tier lays the evidence panel over the thread (`coachhelm-ask.css:1208-1240`); history rail is a column |
| M-ASK-109 | An artifact opens (821 to 1279) | pane overlay; scrim | PARTIAL | pane stays a column at 821 to 1279 |
| M-ASK-110 | A chat link returns 404 | notice card | DONE | `Chat not found` card (`chat/Ask.tsx:251`) |
| M-ASK-111 | The end of the history list is reached | more row skeleton; new rows | MISSING | history has no paging or more row (`chat/History.tsx`) |
| M-ASK-112 | Player opens Ask with a request already sent | requested row | DONE | `requested` row (`parts/Allowance.tsx`) |

Summary of the 112 rows at this commit: DONE 56, PARTIAL 39, MISSING 17.

## Order of work on this branch

1. Reads that existing tables support: `get_team_patterns`, `get_practice`, `get_documents`, and `get_calendar` widened to class conflicts and attendance. Registered with a progress and a past-tense label; the in-app "What Ask can see" list brought up to date.
2. Save draft for non-plan artifacts to the design's docked save card: folder list in the card, New folder, flight and squash, receipt with the 8 second Undo.
3. Motion that is missing on every answer or every draft: follow-up entrance (M-ASK-25), jump key (M-ASK-100), literal-second durations moved to named tokens, the bespoke drafts (M-ASK-59 to 71) where a transform, opacity or stroke can carry it.
4. Left PARTIAL with the reason: Seen by on the Told row (no RLS-safe source), board flight into Messages (M-ASK-62), publish and focus fan-out homes (M-ASK-80 to 82), drill draft visual, Lock card as its own surface, history paging.

No schema change is planned: folders are free text on `golf_documents.folder`, the allowance, tone and facts tables are HM2 to HM4 and already written.

## Built on this branch (after the survey)

| Row | Was | Now | Evidence |
|---|---|---|---|
| Engine: team patterns | MISSING | DONE (only while `coachhelm_team_pattern_v1` is on) | `src/lib/coachhelm/v3/chat/ask-reads.ts` `getTeamPatterns`, `agent-tools.ts` registration |
| Practice reviews and plans | MISSING | DONE for plans, practices and logged sessions; golf has no practice reviews table | `ask-reads.ts` `getPractice` |
| Documents | MISSING | DONE | `ask-reads.ts` `getDocuments` |
| Calendar and classes | PARTIAL | DONE: replies, check-ins and class conflicts | `engine-reads.ts` `getCalendar`, `ask-reads.ts` `classConflicts`, `attendanceByEvent` |
| In-app "What Ask can see" | PARTIAL | DONE | `parts/KnowsPanel.tsx` |
| Read chip names for the newer reads | (not in survey) | DONE: they read "Read" before | `src/clubhouse/data/coachhelm-chat-thread.ts` `READ_NAME` |
| Spec item 12 and M-ASK-73 to 78 for reports, lineups, recaps | PARTIAL | DONE: docked card, in-card list, flight and squash, receipt, Undo | `parts/SaveCard.tsx`, `src/app/golf/actions/coachhelm-ask-artifacts.ts` `undoAskArtifact` |
| M-ASK-25 follow-ups | MISSING | DONE | `coachhelm-ask-v2.css` (Motion that every answer and every draft owns) |
| M-ASK-100 jump key | MISSING | DONE | same block |
| M-ASK-59 trip route | MISSING | PARTIAL: route draws, flag pops; no van | same block |
| M-ASK-61, 63 board and poll | MISSING | DONE for tile and option entrances | same block |
| M-ASK-65 lineup | MISSING | PARTIAL: seats rise in order; no coin flight, no tied wobble | same block |
| M-ASK-67 task | MISSING | PARTIAL: ring sweeps, assignees pop; no bell | same block |
| M-ASK-70 note | MISSING | PARTIAL: note pops; no 18 bars or pin (the draft carries no hole data) | same block |
| Literal `0.54s`, `0.46s`, `0.71s`, `0.2s`, `0.08s`, `1.1s` | off-token | on `--ch-dur-*` tokens (the 8 second Undo window stays a literal on purpose) | `coachhelm-ask-v2.css` |

## Still open, with the reason

| Row | Reason |
|---|---|
| Seen by on the Told row | a coach cannot read another user's `notifications` rows; needs an RLS-safe aggregate (a database function), not written here |
| Track record and corrections reads | the engine modules need the Board's loaders; no cheap read exists, so not added |
| M-ASK-62 board flies into Messages | the hand-off is a prefill and a route change; there is no mock composer in the card to land in |
| M-ASK-68, 69 goal line, band, Accepted tag | the goal draft carries the target only and acceptance is not read |
| M-ASK-71 drill draft visual | no green/gate/ball visual; the flow itself exists and waits on N-00 `20261026010100` |
| M-ASK-80 to 82 publish and focus fan-out homes | the homes (avatar row, player card) are not mocked in the card |
| M-ASK-89 Lock lineup as its own card | Lock is a flow without Undo; it has no separate card or lock pops |
| M-ASK-111 history paging | History lists every chat; there is no more row |
| M-ASK-96, 97, 98, 103, 104, 105 to 109 | small fades, rotations and overlays on states that already work; not drawn |
| M-ASK-28, 36, 38, 74, 75 | the design animates height or width; the house lint bans it, so these stay transform or clip ("can't match as drawn") |
