# Fidelity and completeness: Ask and Quick chat

Repo `helmv3` at main `062f8a2`, read only. Packages: `design-refresh/ask/` (05-SCREENS, 06-SCREEN-SPECS E-codes, ASK_REDESIGN.md, `redesign/coachhelm-ask.html`) and `design-refresh/coachhelm/` (05/06 S-codes, QUICK_CHAT.md, TASK_FIELDS.md, AGENT_KIT.md, `quick-chat.html`).

Already filed, not repeated here: ASK-1 to ASK-28 (`lanes/ask.md`), QC-1 to QC-23 (`lanes/quick-chat.md`), QA-2 to QA-6 (`qa-staging.md`). Where a finding below deepens one of those, it says "extends".

Paths below are short forms:
- `src/clubhouse/screens/coachhelm/chat/` is `chat/`
- `src/clubhouse/shell/quick-chat/` is `qc/`
- `src/clubhouse/styles/coachhelm-ask-v2.css` is `ask-v2.css`
- `src/clubhouse/styles/quick-chat.css` is `qc.css`
- `src/lib/coachhelm/v3/chat/` is `v3chat/`

Flags:
- Ask v2 is behind `coachhelm_ask_v2`: prod false, preview true.
- Player Ask is behind `coachhelm_player_ask_v1`: prod false, preview true.
- Quick chat is behind `coachhelm_quick_chat_v1`: prod false, preview true.
- The lineup flows also need `golf_tournaments_v1`.

Every claim below is about preview, where these flags are on.

## Subpage inventory

| lane | subpage/state | phone/desktop | file:line | design ref | status |
|---|---|---|---|---|---|
| Ask | Coach Ask route (`view=ask`) | both | src/clubhouse/routes/coachhelm.tsx:93 | ask/05 S-ASK.shell | drifts (ASK-1, ASK-2, ASK-15) |
| Ask | Player Ask route | both | src/clubhouse/routes/coachhelm.tsx:80-82, :327 | ask/05 S-ASK.player | unreachable (no nav entry, FID-ASK-6) |
| Ask | Home, coach: greeting, pulse rows, suggestions | both | chat/Home.tsx:96-151 | ask/06 E-HOME | drifts (FID-ASK-27, ASK-26) |
| Ask | Home, player: focus rows | both | chat/Home.tsx:120 | coachhelm-ask.html player home | drifts (FID-ASK-27) |
| Ask | Home, scope line "· this season" | both | chat/Ask.tsx:310 | ask/06 E-HOME | matches |
| Ask | Composer idle, typing | both | chat/Composer.tsx:165-370 | ask/06 E-COMP | drifts (ASK-12) |
| Ask | Composer busy (Stop) | both | chat/Composer.tsx:165 (`busy`, `onStop`) | ask/05 S-ASK.composer.busy | matches |
| Ask | Composer paused (player out) | both | chat/Ask.tsx:379-391 | coachhelm-ask.html out state | missing in code: composer is removed (FID-ASK-12) |
| Ask | @ mention picker | both | chat/Composer.tsx:156-165, :288-293 | ask/06 E-MPOP | matches (structure) |
| Ask | / slash menu | both | chat/Composer.tsx:250-253, :463-468 | ask/05 S-ASK.composer.slash-menu | matches (structure) |
| Ask | + add menu | both | chat/Composer.tsx:368 | ask/05 S-ASK.composer.add-menu | matches (structure) |
| Ask | History list | desktop | chat/History.tsx | ask/05 S-ASK.history | drifts (ASK-15) |
| Ask | History sheet | phone | chat/History.tsx | ask/05 S-ASK.history.sheet | drifts (ASK-15) |
| Ask | Knows panel: tone segmented, facts, remove, add | desktop | chat/parts/KnowsPanel.tsx:25-83 | ask/06 E-TONE, S-ASK.knows | drifts (ASK-17, QA-6, FID-ASK-30) |
| Ask | Knows edit (add fact input) | desktop | chat/parts/KnowsPanel.tsx:61-74 | ask/05 S-ASK.knows.edit | drifts (no submit or cancel control) |
| Ask | Knows error | desktop | chat/parts/KnowsPanel.tsx:76-79 | none | drifts (FID-ASK-30) |
| Ask | Settings sheet (tone on phone) | phone | none found | ask/05 S-ASK.settings.sheet | missing in code (Knows panel mounts on desktop only) |
| Ask | Loading skeleton | both | chat/AskSkeleton.tsx | ask/05 S-ASK.loading | matches |
| Ask | Inputs failed | both | chat/States.tsx:39 | ask/05 S-ASK.error | matches |
| Ask | Thread failed | both | chat/States.tsx:54-60 | ask/05 S-ASK.error | matches |
| Ask | Unavailable (CH-13320) | both | chat/States.tsx:73-75 | ask/05 S-ASK.error | drifts (ASK-11 red) |
| Ask | No roster | both | chat/States.tsx:15 | ask/05 S-ASK.flag-off | matches |
| Ask | User bubble | both | ask-v2.css:71 | ask/06 E-USER | drifts (FID-ASK-26, ASK-24) |
| Ask | Answer card | both | chat/parts/AnswerCard.tsx | ask/06 E-CARD | drifts (FID-ASK-22) |
| Ask | Awaiting, before first step | both | chat/Thread.tsx:299-309 | ask/06 E-STEPS | drifts (FID-ASK-19) |
| Ask | Steps: live, done, waiting, stopped | both | chat/parts/Steps.tsx:195-201 | ask/06 E-STEPS | drifts (ASK-25, FID-ASK-22) |
| Ask | Tool card skeleton into chart | both | chat/parts/ToolCard.tsx | ask/06 E-SKEL, E-VCARD | drifts (FID-ASK-20) |
| Ask | Tool card expanded (composition modal) | both | chat/visual/CoachComposition.tsx:266 | ask/05 S-ASK.toolcard.expanded | drifts (ASK-4) |
| Ask | Visual: strokes gained / composition | both | chat/visual/CoachVisualArtifact.tsx:64 | ask/06 E-VCARD | drifts (QA-2, QA-4) |
| Ask | Visual: hole strip | both | chat/visual/blocks.tsx (HoleStrip) | ASK_REDESIGN §3.4 | drifts (ASK-21 colour only; signs and E match) |
| Ask | Visual: miss pattern | both | chat/visual/blocks.tsx (MissPattern) | ASK_REDESIGN §3.4 | drifts (FID-ASK-16) |
| Ask | Visual: putt profile | both | chat/visual/blocks.tsx (PuttProfile) | ASK_REDESIGN §3.4 | drifts (FID-ASK-16) |
| Ask | Visual: season compare | both | chat/visual/blocks.tsx (SeasonCompare) | ASK_REDESIGN §3.4 | drifts (FID-ASK-16) |
| Ask | Read chip and popover | both | chat/parts/ReadChip.tsx | ask/06 E-CITE | drifts (FID-ASK-17, ASK-5) |
| Ask | Sources closed and open | both | chat/parts/Sources.tsx | ask/06 E-SRCS | drifts (FID-ASK-24) |
| Ask | Follow-up chips | both | chat/parts/FollowUps.tsx | ask/06 E-CHIPS | drifts (ASK-18) |
| Ask | Hypothesis tag | both | none found | ask/05 S-ASK.hypothesis | missing in code |
| Ask | Artifact card (player report, lineup, recap) | both | chat/parts/Artifact.tsx | ask/06 E-ACARD | unreachable (FID-ASK-3) |
| Ask | Artifact pane, push in | desktop | chat/Ask.tsx:400 | ask/06 E-APANEL | unreachable, renders JSON (FID-ASK-3, ASK-1) |
| Ask | Artifact versions arrows | both | chat/parts/Artifact.tsx | ask/05 S-ASK.artifact.versions | unreachable (ASK-19 size) |
| Ask | Artifact why popover | both | chat/parts/Artifact.tsx | ask/05 S-ASK.artifact.why-popover | unreachable |
| Ask | Artifact footer: Edit, Save draft, Publish | both | chat/parts/Artifact.tsx:203-213 | coachhelm-ask.html pane footer | missing in code: Save and Publish (FID-ASK-4) |
| Ask | Save to folder card, 9 states | both | none in chat/parts | ask/06 E-SAVE, E-FPICK | missing in code (artifact path); plan path in fidelity-prac |
| Ask | Publish sheet, 6 states | both | none in chat/parts | ask/05 S-ASK.publish.* | missing in code (artifact path); plan publish via v3chat publishFlow |
| Ask | Plan reads, brief Q1-Q4, free, folded, skip | both | chat/parts/BriefCard.tsx | ask/06 E-QCARD | drifts (FID-ASK-18, FID-ASK-25) |
| Ask | Brief "Change answers" | both | chat/parts/BriefCard.tsx | ask/05 S-ASK.brief.change | drifts (reopens, never resends: FID-ASK-18) |
| Ask | Plan drafting, draft, confirm, receipt | both | v3chat/agent-tools.ts:740 (practiceDraftTool, publishFlow) | ask/06 E-PLAN | see fidelity-prac |
| Ask | Confirm card, generic | both | chat/parts/ConfirmCard.tsx | ask/06 E-CONF | drifts (FID-ASK-23) |
| Ask | Confirm: draft well with date tile | both | chat/parts/ConfirmCard.tsx | ask/06 E-EVD | missing in code (FID-ASK-1) |
| Ask | Confirm: Worked out pills | both | chat/parts/ConfirmCard.tsx (`f.source` only) | ask/06 E-INF | missing in code (FID-ASK-1) |
| Ask | Confirm: On confirm line | both | chat/parts/ConfirmCard.tsx | ask/06 E-ONCF | drifts (ASK-10 wrap) |
| Ask | Confirm: landing surface | both | chat/parts/ConfirmCard.tsx:39-51, :139-143 | ask/06 E-HS | drifts (FID-ASK-8, FID-ASK-9) |
| Ask | Confirm: busy (committing) | both | chat/parts/ConfirmCard.tsx | ask/05 S-ASK.f_*.commit | matches |
| Ask | Receipt held, with ring and Undo | both | chat/parts/ConfirmCard.tsx:249-268 | ask/06 E-RCPT | drifts (no Open: FID-ASK-10) |
| Ask | Receipt done | both | chat/parts/ConfirmCard.tsx | ask/06 E-RCPT | drifts (FID-ASK-11) |
| Ask | Receipt told | both | chat/parts/ConfirmCard.tsx:302-313 | ask/06 E-TOLD | drifts (no coins: FID-ASK-11) |
| Ask | Receipt undone | both | chat/parts/ConfirmCard.tsx | ask/05 S-ASK.f_*.undone | matches (copy) |
| Ask | Receipt cancelled | both | chat/parts/ConfirmCard.tsx | ask/06 E-CXL | matches |
| Ask | Receipt failed | both | chat/parts/ConfirmCard.tsx:271-281 | ask/05 kit.failed | drifts (no Try again: FID-ASK-10) |
| Ask | Receipt partial | both | none | ask/05 kit.partial | missing in code |
| Ask | Moment chip flip | both | chat/parts/ConfirmCard.tsx:107 | ask/05 moments cal/fold/focus/pub | drifts (FID-ASK-13) |
| Ask | f_event | both | v3chat/create-tools.ts:120 + ConfirmCard | ask/05 f_event x11, E-WK | drifts (generic: FID-ASK-1) |
| Ask | f_annc | both | none for v2 | ask/05 f_annc x11 | missing in code (FID-ASK-2) |
| Ask | f_travel | both | v3chat/create-tools.ts (tripFlow) | ask/05 f_travel, E-TRAVEL | drifts (generic: FID-ASK-1) |
| Ask | f_board | both | ask-draft-tools.ts:53-62, chat/parts/HandoffCard.tsx | ask/05 f_board, E-BOARD | drifts (text note only: FID-ASK-2) |
| Ask | f_poll | both | none (ask-draft-tools.ts:27 note) | ask/05 f_poll, E-POLL | missing in code (FID-ASK-2) |
| Ask | f_qual | both | v3chat/create-tools.ts:164 | ask/05 f_qual, E-QUAL | drifts (generic: FID-ASK-1) |
| Ask | f_lineup: tie, lock, locked, not locked | both | v3chat/create-tools.ts:387 (LINEUP_FLOWS) | ask/05 f_lineup, E-LINEUP, E-LOCKASK | drifts (generic: FID-ASK-1) |
| Ask | f_task | both | legacy create_task only | ask/05 f_task, E-TASK | missing in code for v2 (FID-ASK-2) |
| Ask | f_goal | both | v3chat/create-tools.ts (goalFlow) | ask/05 f_goal, E-GOAL | drifts (generic, no HEAD: FID-ASK-1, FID-ASK-21) |
| Ask | f_note | both | v3chat/create-tools.ts (noteFlow) | ask/05 f_note, E-NOTE | drifts (generic, no HEAD) |
| Ask | f_drill | both | none | ask/05 f_drill, TASK_FIELDS §5.14 | missing in code, fallback copy too (FID-ASK-2) |
| Ask | Block, break, term, availability, recruit | both | v3chat/create-tools.ts:386 | TASK_FIELDS §5.16-5.20 | missing in design (generic card renders) |
| Ask | Message flow in the Ask tab | both | v3chat/create-tools.ts:355-375 | TASK_FIELDS §5.4 | drifts: sends, should hand off (FID-ASK-5) |
| Ask | Handoff card "Open in Messages" | both | chat/parts/HandoffCard.tsx | ask/06 E-BOARD | drifts (no board visual) |
| Ask | Player steps, answer, drill, recap | both | chat/parts/AnswerCard.tsx | ask/05 S-ASK.player.* | drifts (shares coach card: FID-ASK-22) |
| Ask | Player allowance meter | both | chat/parts/Allowance.tsx:9-19 | ask/06 E-ALLOW | drifts (FID-ASK-15, FID-ASK-29) |
| Ask | Player allowance low | both | ask-v2.css:220 | ask/05 player.allowance-low | drifts (fill stays green: FID-ASK-15) |
| Ask | Player out card | both | chat/parts/Allowance.tsx:21-33 | ask/06 E-OUT, coachhelm-ask.html:2122 | drifts (FID-ASK-12) |
| Ask | Player request more, commit, receipt | both | chat/parts/Allowance.tsx:36-66 | ask/05 player.request.* | drifts (no confirm or ring: FID-ASK-14) |
| Ask | Player request told, undone, cancelled | both | chat/parts/Allowance.tsx:36-66 | ask/05 player.request.told/undone/cancelled | missing in code |
| Ask | Long data, one item, empty pulse | both | chat/Home.tsx | ask/05 (states) | drifts (ASK-9 long URL; no empty-pulse design) |
| QC | Key in bar, idle | phone | qc.css:347-363 | coachhelm/06 S-KEY | matches |
| QC | Key, desktop ghost | desktop | qc.css:359-366 | coachhelm/06 S-KEY | drifts (owner-noted ghost button, comment :357) |
| QC | Key working | both | qc.css:353 | coachhelm/05 S-KEY.working | matches |
| QC | Key flag dot | both | qc.css:355-358 | coachhelm/05 S-KEY.flag | matches |
| QC | Live pill: working, done | both | qc/QuickChatProvider.tsx, qc.css:374-382 | coachhelm/06 S-LIVE | drifts (QC-11, FID-QC-7) |
| QC | Live pill failed | both | none | coachhelm/06 S-LIVE | missing in code (QC-11) |
| QC | Panel open | phone | qc.css:339 | coachhelm/06 S-PANEL | matches (geometry), drifts (QC-15 radius) |
| QC | Panel open | desktop | qc.css:340 | coachhelm/06 S-PANEL | drifts (QC-16 fixed height) |
| QC | Panel hello | both | qc/QuickChatSession.tsx:213-230 | coachhelm/06 S-PANEL.hello | drifts (FID-QC-9) |
| QC | Composer | both | qc/QuickChatSession.tsx:303-328 | coachhelm/06 S-PANEL.composer | drifts (no + or mic: FID-QC-5) |
| QC | Panel full (expand) | both | qc/QuickChatSession.tsx:213-230 | coachhelm/05 S-PANEL.full | drifts (QC-10) |
| QC | Request bubble | both | qc.css:71 | coachhelm/06 S-RUN.request | drifts (FID-QC-10) |
| QC | Steps, live and done | both | qc/QuickChatSession.tsx:349-395 | coachhelm/06 S-RUN.steps | drifts (FID-QC-4) |
| QC | Steps summary fold | both | qc.css:92 | coachhelm/06 S-RUN.steps | drifts (FID-QC-11) |
| QC | Ask: plan question | both | qc/visuals/PlanTask.tsx | coachhelm/06 S-RUN.ask-plan | drifts (QC-17) |
| QC | Ask: qualifier question | both | qc/QuickChatSession.tsx | coachhelm/06 S-RUN.ask-qual | matches (structure) |
| QC | Ask: any (free) | both | qc/QuickChatSession.tsx | coachhelm/05 S-RUN.ask-any | matches (structure) |
| QC | Task: calendar | both | qc/visuals/visuals.tsx:35 | coachhelm/06 S-TASK.cal | drifts (QC-5) |
| QC | Task: message | both | qc/visuals/visuals.tsx:113 | coachhelm/06 S-TASK.msg | drifts (QC-14 tone chips) |
| QC | Task: qualifier | both | qc/visuals/visuals.tsx:152 | coachhelm/06 S-TASK.qual | drifts (FID-QC-6) |
| QC | Task: plan | both | qc/visuals/PlanTask.tsx | coachhelm/05 S-TASK.plan | drifts (QC-14 segments) |
| QC | Plan folder menu, new folder | both | qc/visuals/PlanTask.tsx | coachhelm/05 S-TASK.plan.folder-menu, .new-folder | drifts (see fidelity-prac) |
| QC | Task busy | both | qc/TaskCard.tsx | coachhelm/05 S-TASK.busy | matches |
| QC | Task: every other flow (trip, goal, note, block, break, term, avail, recruit, lineup, lock) | both | qc/TaskCard.tsx:165-174 | none | missing in design, renders as unfinished generic (FID-QC-1) |
| QC | Receipt held: ring, Undo, Open | both | qc/TaskCard.tsx:204-227 | coachhelm/06 S-RCPT | matches (structure) |
| QC | Receipt told | both | qc/TaskCard.tsx:245-249 | coachhelm/05 S-RCPT.told | drifts (no coins: FID-QC-3) |
| QC | Receipt undone | both | qc/TaskCard.tsx:252-259 | coachhelm/05 S-RCPT.undone | matches |
| QC | Receipt failed | both | qc/TaskCard.tsx:270-278 | coachhelm/05 S-RCPT.failed | drifts (QC-3) |
| QC | Receipt partial | both | qc/TaskCard.tsx:40-47 | coachhelm/05 S-RCPT partial | missing in code (FID-QC-2) |
| QC | Run cancelled | both | qc/TaskCard.tsx:152 | coachhelm/05 S-RUN.cancelled | drifts (QC-19) |
| QC | Run stopped | both | qc/QuickChatSession.tsx:385, :407 | coachhelm/05 S-RUN.stopped | drifts (FID-QC-12) |
| QC | Open (navigate to the thing) | both | qc/TaskCard.tsx:142 | coachhelm/05 S-OPEN | matches |
| QC | Earlier today rows | both | qc.css:416-423, qc/earlier-today.ts | coachhelm/05 S-PANEL.hello | drifts (QC-12) |
| QC | Stream notice (offline, error) | both | qc/QuickChatSession.tsx:296 | none | missing in design |
| QC | Error and empty fixtures | both | src/clubhouse/preview/fixtures-quick-chat.ts | coachhelm/05 | missing in code (QC-23) |

Count: 117 subpages and states.

## Feature checklist

| lane | claimed feature (source §) | built | real data | reachable | works | flag | evidence |
|---|---|---|---|---|---|---|---|
| Ask | Coach Ask thread with streamed parts (ask/02-PLAN) | yes | yes | yes | partly (ASK-1, QA-2) | ask_v2 | routes/coachhelm.tsx:93 |
| Ask | Player Ask (ask/02-PLAN player) | yes | yes | no | partly | player_ask_v1 | coachhelm-views-shape.ts:16 |
| Ask | "Ask about this" from Team and Read prefills the question (ask/05 entry points) | partly | n/a | yes | no | ask_v2 | ask-links.ts; routes/coachhelm.tsx:240 |
| Ask | Home pulse and suggestions (E-HOME) | yes | yes | yes | yes | ask_v2 | chat/Home.tsx:96-151 |
| Ask | @ mentions and / commands (E-MPOP) | yes | yes | yes | yes | ask_v2 | chat/Composer.tsx:250-315 |
| Ask | History list and sheet | yes | yes | yes | yes | ask_v2 | chat/History.tsx |
| Ask | Tone and "CoachHelm knows" (E-TONE) | yes | yes | desktop only | partly (QA-6) | ask_v2 | parts/KnowsPanel.tsx:31-41 |
| Ask | Steps with past-tense done and one fact (E-STEPS) | yes | yes | yes | partly (ASK-25) | ask_v2 | parts/Steps.tsx |
| Ask | Tool card skeleton crossfades into chart (E-SKEL) | partly | yes | yes | no crossfade | ask_v2 | parts/ToolCard.tsx |
| Ask | Read chip popover with Open in Stats (E-CITE) | partly | yes | yes | no link | ask_v2 | parts/ReadChip.tsx |
| Ask | Sources list (E-SRCS) | yes | yes | yes | yes | ask_v2 | parts/Sources.tsx |
| Ask | Follow-up chips (E-CHIPS) | yes | yes | yes | yes | ask_v2 | parts/FollowUps.tsx |
| Ask | Answer visual: strokes gained / composition | yes | yes | yes | partly (QA-2) | ask_v2 | v3chat/agent-tools.ts:721 |
| Ask | Answer visual: hole strip (§3.4) | yes | yes | yes | yes | ask_v2 | visual/blocks.tsx |
| Ask | Answer visual: miss pattern with dots by distance (§3.4) | partly | yes | yes | wedges only | ask_v2 | visual/blocks.tsx |
| Ask | Answer visual: putt profile with season tick (§3.4) | partly | yes | yes | no tick | ask_v2 | visual/blocks.tsx |
| Ask | Answer visual: season compare line and band (§3.4) | partly | yes | yes | numbers only | ask_v2 | visual/blocks.tsx |
| Ask | Hypothesis tag (ask/05) | no | - | - | - | ask_v2 | none found |
| Ask | Artifacts: player report, lineup, round recap (E-ACARD, E-APANEL) | client only | no | no | no | ask_v2 | parts/artifacts.ts:22 (no writer) |
| Ask | Artifact versions and why popover | client only | no | no | no | ask_v2 | parts/Artifact.tsx |
| Ask | Artifact Save draft to folder (E-SAVE, E-FPICK) | no | - | - | - | ask_v2 | parts/Artifact.tsx:203-213 |
| Ask | Artifact Publish (ask/05 publish x6) | no | - | - | - | ask_v2 | parts/Artifact.tsx:203-213 |
| Ask | Practice plan brief (E-QCARD) | yes | yes | yes | partly (resend) | ask_v2 + plans | parts/BriefCard.tsx |
| Ask | Practice plan draft, publish with hold | yes | yes | yes | see fidelity-prac | ask_v2 + plans | v3chat/agent-tools.ts:740 |
| Ask | Confirm card for every flow with bespoke draft visual (E-CONF, ASK_REDESIGN §3 item 15) | partly | yes | yes | generic only | ask_v2 | parts/ConfirmCard.tsx |
| Ask | Worked out pills (E-INF) | no | - | - | - | ask_v2 | parts/ConfirmCard.tsx |
| Ask | Landing surface with real neighbouring rows (E-HS) | partly | no (hard-coded) | yes | wrong day | ask_v2 | parts/ConfirmCard.tsx:39-51 |
| Ask | Server-side 8s Undo hold (TASK_FIELDS §3) | yes | yes | yes | yes | ask_v2 | api/coachhelm/v3/chat/actions/[key] |
| Ask | Open during hold commits early (TASK_FIELDS §3.4) | server yes, Ask UI no | yes | no | no | ask_v2 | parts/ConfirmCard.tsx:249-268 |
| Ask | Told row with coins and seen dots (E-TOLD) | partly | yes | yes | text only | ask_v2 | parts/ConfirmCard.tsx:302-313 |
| Ask | Failed receipt with Try again | partly | yes | yes | no retry | ask_v2 | parts/ConfirmCard.tsx:271-281 |
| Ask | Partial receipt (kit.partial) | no | - | - | - | ask_v2 | none |
| Ask | Flow: event | yes | yes | yes | partly | ask_v2 | v3chat/create-tools.ts:120 |
| Ask | Flow: announcement | no (legacy tool only) | - | - | - | ask_v2 | v3chat/create-tools.ts:386 |
| Ask | Flow: message hands off to composer (§5.4) | no (sends) | yes | yes | wrong behaviour | ask_v2 | v3chat/create-tools.ts:355-375 |
| Ask | Flow: poll | no | - | - | - | ask_v2 | v3chat/ask-draft-tools.ts:27 |
| Ask | Flow: travel | yes | yes | yes | generic | ask_v2 | create-tools.ts tripFlow |
| Ask | Flow: board PNG into composer (§5.7) | partly | yes | yes | text only | ask_v2 | ask-draft-tools.ts:53-62 |
| Ask | Flow: qualifier | yes | yes | yes | generic | ask_v2 | create-tools.ts:164 |
| Ask | Flow: lineup and separate lock | yes | yes | yes | generic | ask_v2 + tournaments | create-tools.ts:387 |
| Ask | Flow: task | no (legacy only) | - | - | - | ask_v2 | v3chat/agent-tools.ts (create_task) |
| Ask | Flow: goal | yes | yes | yes | generic | ask_v2 | create-tools.ts goalFlow |
| Ask | Flow: round note | yes | yes | yes | generic | ask_v2 | create-tools.ts noteFlow |
| Ask | Flow: drill fallback copy (§5.14) | no | - | - | - | ask_v2 | no "Drill bank comes" in src |
| Ask | Flows: blocked time, break, term, availability, recruit | yes | yes | yes | generic | ask_v2 | create-tools.ts:386 |
| Ask | Player allowance meter, low state (E-ALLOW) | partly | yes | yes | low stays green | player_ask_v1 | parts/Allowance.tsx:9-19 |
| Ask | Player out state, composer paused (E-OUT) | partly | yes | yes | wrong copy, composer gone | player_ask_v1 | chat/Ask.tsx:379-391 |
| Ask | Player request more with confirm, ring, Undo | partly | yes | yes | no confirm | player_ask_v1 | parts/Allowance.tsx:36-66 |
| Ask | Request email names the player | partly | yes | n/a | team name only | player_ask_v1 | app/golf/actions/coachhelm-ask-credits.ts:55 |
| QC | Key in every bar, working, flag (S-KEY) | yes | yes | yes | yes | quick_chat_v1 | qc.css:347-363 |
| QC | Live pill: working, done, failed (S-LIVE) | partly | yes | yes | no failed | quick_chat_v1 | QuickChatProvider.tsx |
| QC | Panel, hello, earlier today (S-PANEL) | yes | yes | yes | partly (QC-12) | quick_chat_v1 | QuickChatSession.tsx:213-230 |
| QC | Composer with +, field, mic, send (S-PANEL.composer) | partly | n/a | yes | + and mic missing | quick_chat_v1 | QuickChatSession.tsx:303-328 |
| QC | Expand to Ask (S-PANEL.full) | yes | yes | after first send | partly (QC-10) | quick_chat_v1 | QuickChatSession.tsx:213-230 |
| QC | Steps with past-tense done and one fact (S-RUN.steps) | partly | yes | yes | present tense | quick_chat_v1 | QuickChatSession.tsx:385-395 |
| QC | Asks: plan, qualifier, any (S-RUN.ask-*) | yes | yes | yes | yes | quick_chat_v1 | QuickChatSession.tsx |
| QC | Task: calendar event (S-TASK.cal) | yes | yes | yes | partly (QC-5) | quick_chat_v1 | visuals/visuals.tsx:35 |
| QC | Task: message sends under hold (S-TASK.msg, §5.4) | yes | yes | yes | yes | quick_chat_v1 | visuals/visuals.tsx:113; create-tools.ts:363 |
| QC | Task: qualifier (S-TASK.qual) | yes | partly (deadline null) | yes | partly | quick_chat_v1 | visuals/visuals.tsx:152; create-tools.ts:164 |
| QC | Task: practice plan with folder (S-TASK.plan) | yes | yes | with plans on | partly (QC-14) | quick_chat_v1 + plans | visuals/PlanTask.tsx |
| QC | Every other task a Quick chat can start | generic only | yes | yes | unfinished look | quick_chat_v1 | TaskCard.tsx:165-174 |
| QC | Receipt held, Undo, Open commits early (S-RCPT) | yes | yes | yes | yes | quick_chat_v1 | TaskCard.tsx:204-227 |
| QC | Told row with coins in delivery order (S-RCPT.told) | partly | yes | yes | text only | quick_chat_v1 | TaskCard.tsx:245-249 |
| QC | Told line built from read-back (TASK_FIELDS §2.5) | partly | partly | yes | qualifier copy fixed | quick_chat_v1 | TaskCard.tsx:56 |
| QC | Partial receipt (S-RCPT partial) | no | - | - | - | quick_chat_v1 | TaskCard.tsx:40-47 |
| QC | Failed receipt with Try again (S-RCPT.failed) | partly | yes | yes | no retry (QC-3) | quick_chat_v1 | TaskCard.tsx:270-278 |
| QC | Stopped and cancelled runs (S-RUN.stopped/cancelled) | yes | yes | yes | partly | quick_chat_v1 | QuickChatSession.tsx:385, :407 |

Count: 67 claimed features. 56 are not fully built: missing, partly built, generic only, unreachable or wrong behaviour. 11 are fully built and working.

## Findings

### FID-ASK-1 Every Ask create flow is a generic facts card: no draft visual, no Worked out pills, no date tile
- Severity: P0
- Where: Ask confirm card, every flow (event, travel, qualifier, lineup, goal, note, block, break, term, availability, recruit), phone and desktop, light and dark
- File: src/clubhouse/screens/coachhelm/chat/parts/ConfirmCard.tsx (the whole body renders `dl` facts; `.inf` only for `f.source`)
- What's wrong: The design draws a bespoke visual for each flow:
  - E-WK week grid with the new day ticked (event)
  - E-TRAVEL route and room pairs
  - E-QUAL rounds and seats
  - E-LINEUP seats, E-LOCKP lock screen
  - E-GOAL stat target, E-NOTE note card, E-TASK row
  - E-EVD draft well on a 48px date tile and 1fr text grid
  - E-INF a "Worked out" pill row for every Read-filled value

  The code renders none of them. Every flow is a list of labels and values, and a value shows its source only through `.inf` on `f.source`. `preview/fixtures-ask-flows.ts` shows the same generic card, so the preview hides the gap.
- Should be: ask/06 E-CONF, E-EVD, E-INF, E-WK, E-TRAVEL, E-QUAL, E-LINEUP, E-LOCKP, E-GOAL, E-NOTE, E-TASK; ASK_REDESIGN §3 item 15
- Fix: Add one visual slot per `proposal.visual.kind`. The server already sends `visual` for cal, qual and msg (v3chat/create-tools.ts:120, :164, :363); add kinds for the others. Reuse the Quick chat visuals (src/clubhouse/shell/quick-chat/visuals/visuals.tsx EventVisual, QualifierVisual) where the drawing is the same, and render Worked out pills from `facts[].source === 'read'` with the existing `.inf` pill.
- Confidence: high

### FID-ASK-2 Announcement, poll, task and drill flows promised for Ask are not built; board is text only
- Severity: P0
- Where: Ask create flows f_annc, f_poll, f_task, f_drill, f_board, both, both themes
- File: src/lib/coachhelm/v3/chat/create-tools.ts:386-387 (CREATE_FLOWS, LINEUP_FLOWS); src/lib/coachhelm/v3/chat/ask-draft-tools.ts:27, :53-62
- What's wrong:
  - What exists: CREATE_FLOWS = message, event, trip, qualifier, goal, note, block, break, term, avail, recruit.
  - Announcement: no v2 flow; only the legacy `create_team_announcement`, which has no hold card.
  - Poll: none. ask-draft-tools.ts:27 notes it waits on held 20261028140800.
  - Task: the legacy `create_task` only.
  - Drill: nothing at all, and no fallback copy. Grep for "Drill bank comes" finds nothing in src. The README says the drill flow "is built but stays off"; it is not.
  - Board: `draft_board` sends a text-note handoff; there's no PNG in the composer.
  - The preview fixtures render all of these flows (fixtures-ask-flows.ts f_annc, f_poll, f_drill), so the preview claims a feature the server can't produce.
- Should be: ask/05 f_annc, f_poll, f_task, f_drill, f_board (11 states each); TASK_FIELDS §4, §5.3, §5.5, §5.7, §5.10, §5.14
- Fix:
  - Add `announcementFlow` and `taskFlow` as FlowDefs calling `createEnrichedAnnouncement` and `createTask`, behind `proposeGated`.
  - Add the drill flow's §5.14 fallback answer, "Drill bank comes with the practice builder", plus an offer to add a plan block.
  - Keep poll off until 140800 is applied, and mark f_poll and f_drill in the fixtures as "not live".
  - Board: render it to a PNG `PendingAttachment` (rounds/card/draw-card.ts:313 pattern).
- Confidence: high

### FID-ASK-3 No server writes `data-artifact`, so artifact cards, pane, versions and why popover never appear
- Severity: P0
- Where: Ask artifact card and pane (player report, lineup, round recap), both, both themes
- File: src/clubhouse/screens/coachhelm/chat/parts/artifacts.ts:22 (reads `data-artifact`); src/lib/coachhelm/v3/chat/agent-tools.ts:721 (writes only `data-visual-artifact`); src/lib/coachhelm/v3/chat/restore.ts:35 (restore list has no `data-artifact`)
- What's wrong: The client groups `data-artifact` parts into versioned artifacts, but nothing on the server emits that part type, and restore wouldn't keep it if anything did. ASK-1 covers the JSON pane body. This goes further: the whole card, pane, push, versions and why-popover family (E-ACARD, E-APANEL, ask/05 artifact.*) can't be reached in any session. It works only from fixtures.
- Should be: ask/06 E-ACARD, E-APANEL; ask/05 S-ASK.artifact.* (extends ASK-1)
- Fix: Add an `artifact` tool (player_report, lineup, round_recap) that writes `{type:'data-artifact', id, data:{artifactId, version, kind, ...}}`, add `'data-artifact'` to restore.ts:35, and render the body with the existing visual blocks instead of the JSON pre at chat/Ask.tsx:400.
- Confidence: high

### FID-ASK-4 Artifact pane footer has only "Edit in builder"; Save draft and Publish are missing
- Severity: P1
- Where: Artifact pane footer, desktop, and artifact card actions, phone
- File: src/clubhouse/screens/coachhelm/chat/parts/Artifact.tsx:203-213 (Actions)
- What's wrong: The design footer is Edit in builder, Save draft… and Publish… (coachhelm-ask.html pane footer). The two sheets behind them have 9 save states (E-SAVE, E-FPICK) and 6 publish states. The code has only Edit in builder, so no save or publish states exist for artifacts.
- Should be: ask/06 E-APANEL footer, E-SAVE, E-FPICK; ask/05 S-ASK.save.*, S-ASK.publish.*
- Fix: Add the Save draft… and Publish… `Button`s. Save opens a folder picker on `saveTextDocument` with `playerVisible:false` (TASK_FIELDS §5.15). Publish goes through a FlowDef on the hold, like publishFlow (agent-tools.ts:740).
- Confidence: high

### FID-ASK-5 The Ask tab's message flow sends as the coach instead of handing off to the composer
- Severity: P1
- Where: Ask message flow, both
- File: src/lib/coachhelm/v3/chat/create-tools.ts:355-375 (messageFlow); src/lib/coachhelm/v3/chat/agent-tools.ts:731 (registered for every askV2 chat, Ask tab included)
- What's wrong: messageFlow calls `sendGolfMessage` after the hold, and it is registered for the Ask tab as well as Quick chat. TASK_FIELDS §3 (last paragraph) and §5.4 say "the Ask tab's message drafts land in the Messages composer and the coach presses Send there". Only Quick chat's card is the coach's Send. In the Ask tab, CoachHelm can now send a message the coach never typed into Messages.
- Should be: TASK_FIELDS §3 last paragraph, §5.4; coachhelm/01-BRIEF call 7
- Fix: Pass the surface into `agentTools` (the Quick chat session already has its own hook instance). Register messageFlow only for Quick chat. In the Ask tab, register a `draft_message` handoff that builds `messagesPrefillHref` in the browser, like `draft_board` (ask-draft-tools.ts:53-62).
- Confidence: high

### FID-ASK-6 Player Ask can't be reached from the player's navigation
- Severity: P1
- Where: Player CoachHelm tabs, both
- File: src/clubhouse/screens/coachhelm/coachhelm-views-shape.ts:16 (PLAYER_HELM_HREF); src/clubhouse/screens/coachhelm/views/PlayerHelmTabs.tsx
- What's wrong: Player tabs list only board, standing and deep-dive. `view=ask` for players is served (routes/coachhelm.tsx:327), but only by typing the URL. On that page Ask.tsx:343 renders tabs only when `!player`, so a player who lands there has no way back except the browser.
- Should be: ask/05 S-ASK.player (player Ask is a tab beside the board)
- Fix: Add `ask` to PLAYER_HELM_HREF when `isPlayerAskEnabled()`, and render PlayerHelmTabs on the player Ask page.
- Confidence: high

### FID-ASK-7 "Ask about this" opens a blank Ask: the `q` it sends is never read
- Severity: P1
- Where: Team panels and Root cause, "Ask about this" into Ask, both
- File: src/clubhouse/screens/coachhelm/chat/ask-links.ts (askAboutHref, askAboutReadHref build `&q=`); src/clubhouse/routes/coachhelm.tsx:240 (params have no `q`); src/app/golf/(dashboard)/dashboard/coachhelm/page.tsx:199
- What's wrong: Callers at team/panels.tsx:166 and read/ReadPage.tsx:125 pass the question in `q`. The Clubhouse route never reads `q`; only the Fairway AskSurface.tsx:140 does. The coach taps "Ask about this" and gets an empty composer with no question and no context chip.
- Should be: ask/05 entry points (composer arrives pre-filled with the insight's question)
- Fix: Read `q` in page.tsx and routes/coachhelm.tsx and pass it to `AskComposer` as the seeded text (the `fresh` and `draftKey` path at Composer.tsx:165). Keep `insight` as the context chip.
- Confidence: high

### FID-ASK-8 The event landing surface says "Wednesday" for every event
- Severity: P1
- Where: Confirm card landing surface, create_event, both
- File: src/clubhouse/screens/coachhelm/chat/parts/ConfirmCard.tsx:40 (`create_event: { app: 'Calendar', where: 'Wednesday' }`), rendered at :139-143
- What's wrong: The "where it lands" line is a hard-coded constant, not the event's date. A Friday event says "Calendar · Wednesday".
- Should be: ask/06 E-HS (the landing names the real day)
- Fix: Build `where` from `proposal.visual.date` (create-tools.ts:120 already sends it), formatted in the team zone, for example "Fri, Nov 14". Do the same for the other LANDS entries.
- Confidence: high

### FID-ASK-9 The landing surface draws only the new row, with no real neighbouring rows
- Severity: P1
- Where: Confirm card E-HS, every flow, both
- File: src/clubhouse/screens/coachhelm/chat/parts/ConfirmCard.tsx:139-160
- What's wrong: E-HS shows the new row slotting in between the real rows already in that tab (that day's events, that player's goals). The code draws the one new row alone, so there's nothing to slot in between. The Quick chat calendar visual does draw `.blk.old` neighbours (qc.css:139); Ask doesn't.
- Should be: ask/06 E-HS
- Fix: Have each FlowDef's `plan()` return up to 2 neighbouring rows from its own read (the event flow already reads the day). Render them as the Quick chat `.blk.old` rows.
- Confidence: medium

### FID-ASK-10 Ask's held receipt has no Open, and its failed receipt has no Try again
- Severity: P1
- Where: Receipt held and failed, both
- File: src/clubhouse/screens/coachhelm/chat/parts/ConfirmCard.tsx:249-268 (held: Undo only), :271-281 (failed: text only)
- What's wrong: The design held receipt is Open plus Undo, and Open commits early through POST `?now=1` (TASK_FIELDS §3.4). The Quick chat TaskCard has it (TaskCard.tsx:204-227); Ask doesn't. The failed receipt has no retry, so the coach has to retype the request. QC-3 covers this for Quick chat only.
- Should be: ask/06 E-RCPT; TASK_FIELDS §3.4
- Fix: Reuse TaskCard's Open handler (POST `/api/coachhelm/v3/chat/actions/[key]?now=1`, then navigate to `receipt.created[0].href`). Add a `Button variant="secondary"` "Try again" that resends the proposal.
- Confidence: high

### FID-ASK-11 Ask's Told row is a text line, with no coins or seen dots
- Severity: P1
- Where: Receipt told, both, both themes
- File: src/clubhouse/screens/coachhelm/chat/parts/ConfirmCard.tsx:302-313
- What's wrong: The design (E-TOLD) shows a row of 28px avatar coins in delivery order with seen dots and "+N". The code renders "Told N by push" as text.
- Should be: ask/06 E-TOLD
- Fix: Render coins from `receipt.notifications` recipients using `Avatar size="xs"` stacked at -6px (Quick chat's `.coin` pattern, qc.css:117-118), plus the `.coin.more` overflow.
- Confidence: high

### FID-ASK-12 Player out state: the composer is removed, and the card has the wrong copy and parts
- Severity: P1
- Where: Player Ask, out of allowance, both, both themes
- File: src/clubhouse/screens/coachhelm/chat/Ask.tsx:379-391; src/clubhouse/screens/coachhelm/chat/parts/Allowance.tsx:21-33
- What's wrong:
  - Design (coachhelm-ask.html:2122, E-OUT): the composer stays visible but paused, with the placeholder "Ask is paused until Monday". The out card sits in the thread and holds:
    - title "You've used this week's Ask"
    - a reason paragraph
    - a meter row "Resets Mon"
    - a keep row "Your past answers and charts still open…"
    - "Request more", which pops in about 900ms later
  - Code: PlayerOut replaces the composer dock entirely. Its title is "Ask is paused until Monday" and its second line is "Need more before Monday?". It has no meter row, no keep row and no delayed reveal.
- Should be: ask/06 E-OUT; coachhelm-ask.html:2122
- Fix: Keep `AskComposer` mounted with `blocked` and that placeholder. Move OutCard into the thread with the design's copy and the meter, keep and request rows, and reveal Request more after `--ch-dur-*` 900ms (or at once under Reduce Motion).
- Confidence: high

### FID-ASK-13 The moment chip flips to "Added" only after the 8s hold, not at the receipt
- Severity: P1
- Where: Confirm card header chip, moments cal, fold, focus and pub, both
- File: src/clubhouse/screens/coachhelm/chat/parts/ConfirmCard.tsx:107
- What's wrong: The chip shows "Added" only when `completed`, after the hold ends. The design flips it the moment the receipt appears, while the ring drains. For 8 seconds the coach sees a receipt under a chip that still reads as a proposal.
- Should be: ask/05 moments (cal/fold/focus/pub ×4)
- Fix: Flip the chip on `held || completed`, and return it on undone.
- Confidence: medium

### FID-ASK-14 Player "Request more" sends at once, with no confirm, no ring and no told row
- Severity: P1
- Where: Player request more, both
- File: src/clubhouse/screens/coachhelm/chat/parts/Allowance.tsx:36-66; src/app/golf/actions/coachhelm-ask-credits.ts:36
- What's wrong:
  - Design: a confirm card (To your coach, From you, an optional note, an "On confirm" line, then Send request), followed by a receipt with the draining ring, then told, undone and cancelled states.
  - Code: the tap inserts `ask_credit_requests` straight away with an 8s release (credits.ts:36). The UI shows "Request ready" with a plain Undo `Button` and no ring, and has no told or cancelled states.
- Should be: ask/05 player.request, commit, receipt, told, undone, cancelled
- Fix: Render the request as a ConfirmCard proposal (same E-CONF and E-RCPT parts) whose confirm calls the existing action. Use the shared receipt ring.
- Confidence: high

### FID-ASK-15 The allowance meter stays green when low
- Severity: P1
- Where: Player allowance low, both, both themes
- File: src/clubhouse/styles/coachhelm-ask-v2.css:220 (`.ch-ak-meter i.is-low` changes only width), :213 (fill `--ch-green-600`)
- What's wrong: The design's low fill is amber `--ch-chart-loss-fill`; the code's stays green-600. `.ch-ak-meter.is-low` (:226) recolours only the text to `--ch-loss`, so the text warns while the bar says fine.
- Should be: ask/06 E-ALLOW (gain fill normal, loss fill low)
- Fix: `.ch-ak-meter i { background: var(--ch-chart-gain-fill) }` and `.ch-ak-meter i.is-low { background: var(--ch-chart-loss-fill) }`.
- Confidence: high

### FID-ASK-16 Miss pattern, putt profile and season compare are missing half their drawing
- Severity: P1
- Where: Answer visuals, both, both themes
- File: src/clubhouse/screens/coachhelm/chat/visual/blocks.tsx (MissPattern, PuttProfile, SeasonCompare)
- What's wrong:
  - MissPattern draws direction wedges only. ASK_REDESIGN §3.4 adds dots by distance left.
  - PuttProfile has no season tick on each make-rate bar.
  - SeasonCompare renders two number buttons. The design draws this season's line against last season's band.
  - In each case the chart drops the comparison the answer depends on.
- Should be: ASK_REDESIGN §3.4
- Fix: Add the dot layer (r 3, `--ch-chart-*` series token) to MissPattern, a 2px tick at the season value to PuttProfile, and a line plus band SVG for SeasonCompare. Reuse the Stats sparkline band pattern, not new primitives.
- Confidence: medium

### FID-ASK-17 Read chip popover has no "Open in Stats" link
- Severity: P2
- Where: Citation popover, both
- File: src/clubhouse/screens/coachhelm/chat/parts/ReadChip.tsx (no link in the popover)
- What's wrong: E-CITE requires each read's popover to end with "Open in Stats", deep-linking to the stat the number came from. The popover shows the read only.
- Should be: ask/06 E-CITE
- Fix: Add a `Button variant="link"` "Open in Stats" pointing to the Stats route for the read's metric and player.
- Confidence: high

### FID-ASK-18 Brief card: no header icon tile, Skip and Next footer drifts, and folded "Change answers" never resends
- Severity: P2
- Where: Practice plan brief, every question and folded, both
- File: src/clubhouse/screens/coachhelm/chat/parts/BriefCard.tsx
- What's wrong:
  - The design header has a 30px icon tile; the code has none.
  - The design footer is Back, Skip and Next on every question. The code has "Skip, just build" on Q1 and Back on later questions.
  - Folded "Change answers" reopens the card, but changed answers aren't sent back, so the plan keeps the old answers.
- Should be: ask/06 E-QCARD; ask/05 brief.change
- Fix: Add the tile (the confirm card's 30px tile class), use the three-button footer, and on re-fold send the changed answers as a new user turn.
- Confidence: medium

### FID-ASK-19 The v2 thread still shows the old "Reading your program" placeholder before the first step
- Severity: P2
- Where: Answer, awaiting, both
- File: src/clubhouse/screens/coachhelm/chat/Thread.tsx:299-309
- What's wrong: The v2 path renders the legacy CoachMark plus "Reading your program" block. The design's first frame is the E-STEPS live row.
- Should be: ask/06 E-STEPS
- Fix: When `v2`, render `Steps` with a single live placeholder step instead of the legacy awaiting block.
- Confidence: medium

### FID-ASK-20 The tool card skeleton swaps for the chart with no crossfade
- Severity: P2
- Where: Tool card, both
- File: src/clubhouse/screens/coachhelm/chat/parts/ToolCard.tsx
- What's wrong: ToolCard renders a skeleton only. When data arrives, a different component mounts in its place, so the change is a hard swap. E-SKEL specifies a crossfade at the same height. Timing is the motion lane's call; this is the missing shared container.
- Should be: ask/06 E-SKEL, E-VCARD
- Fix: Keep one container at a fixed height and crossfade the skeleton into the chart with `--ch-dur-*` (CH_FADE_MS under Reduce Motion).
- Confidence: medium

### FID-ASK-21 The confirm header falls back to raw action text for goal, note, lineup and task
- Severity: P2
- Where: Confirm card header, those flows, both
- File: src/clubhouse/screens/coachhelm/chat/parts/ConfirmCard.tsx (HEAD map)
- What's wrong: HEAD has no entries for goal, note, lineup, lock or task. Those cards show the server's `action` string as the title, not the designed "New goal for Ava" style header with an icon tile.
- Should be: ask/06 E-CONF header
- Fix: Add HEAD entries (icon, sub, title template) for each FlowDef name in CREATE_FLOWS and LINEUP_FLOWS.
- Confidence: high

### FID-ASK-22 Answer card and steps spacing is off by 2px throughout
- Severity: P2
- Where: Answer card, steps, both, both themes
- File: src/clubhouse/styles/coachhelm-ask-v2.css:15, :18, :26, :32
- What's wrong:
  - Turn gap: 20 (design E-THREAD 22).
  - `.msg-a` padding 16 16 12 (design 16 18 14); radius xl 20 (22); gap 12 (14).
  - Step gap: 8 (10).
  - Step dot: `--ch-green-600` (design accent).
- Should be: ask/06 E-THREAD, E-CARD, E-STEPS
- Fix: Use the 06 values exactly, as spacing tokens or literals in this file. Set the dot to `--ch-accent`.
- Confidence: high

### FID-ASK-23 Confirm card geometry drifts on nine properties
- Severity: P2
- Where: Confirm card, both, both themes
- File: src/clubhouse/styles/coachhelm-ask-v2.css:86, :87, :91, :93, :98, :102, :106, :119
- What's wrong:
  - Header padding 12 16 8, gap 8 (design 14 16 10, gap 10).
  - Icon tile radius 8 (9).
  - Draft well margin 12 16 6 (14 16 6).
  - Fields gap 4 (5).
  - Button row padding 12 16 12 (12 16 14).
  - Capsule padding 8 16 (9 18).
  - Receipt gap 8 (10).
  - Told row margin 0 16 12 (0 16 14); padding 8 12 (10 12); radius 12 (14).
- Should be: ask/06 E-CONF, E-EVD, E-BTNS, E-RCPT, E-TOLD
- Fix: Set each to the 06 value.
- Confidence: high

### FID-ASK-24 Citation popover, sources and follow-up chip spacing drifts
- Severity: P2
- Where: Read chip popover, sources, chips, user bubble, skeleton, both
- File: src/clubhouse/styles/coachhelm-ask-v2.css:44, :59, :60, :65, :69, :71
- What's wrong:
  - Popover padding 12 12, radius 12 (design 12 14, radius 14).
  - Sources list padding 4 12, radius 12 (4 14, 12).
  - Source row padding 8 0, gap 8 (10 0, 10).
  - Chip padding 8 12 (8 14).
  - Skeleton gap 8 (9).
  - User bubble padding 8 16 (9 15).
- Should be: ask/06 E-CITE, E-SRCS, E-CHIPS, E-SKEL, E-USER
- Fix: Set each to the 06 value.
- Confidence: high

### FID-ASK-25 Artifact card, pane and brief spacing drifts
- Severity: P2
- Where: Artifact card and pane, brief card, both
- File: src/clubhouse/styles/coachhelm-ask-v2.css:126, :133, :135, :139, :140, :175, :182, :185, :194
- What's wrong:
  - Artifact card padding 12 12 12 12 (design 12 12 12 14).
  - Open padding 6 8 (6 10).
  - Pane header 12 16 8 (12 12 12 18).
  - Pane body 16 (14 18 18).
  - Pane footer 12 16 (12 18).
  - Brief header padding 12 16 12, gap 8 (13 16 11, gap 10).
  - Question h5 17 (18).
  - Option radius 12, padding 12 12 (radius 14, padding 12 13).
  - Summary pills 4 12 (5 11).
- Should be: ask/06 E-ACARD, E-APANEL, E-QCARD
- Fix: Set each to the 06 value.
- Confidence: high

### FID-ASK-26 Dark accent, card and bubble tokens don't match the Ask palette
- Severity: P2
- Where: Every Ask surface, dark
- File: src/clubhouse/styles/tokens.css:1083 (`--ch-accent` #23704a), :1082 (`--ch-text-on-accent` #f4eedd), :1022 (`--ch-green-600` #6bbb8c), :918 (`--ch-bubble-theirs-bg` #232925), :919 (`--ch-bubble-mine-fill` #1f6b45); light :181 (`--ch-text-on-accent` #ffffff)
- What's wrong:
  - Dark accent: design #7CC79B with #0E120F ink; code #23704a with #f4eedd ink.
  - Dark accent text: design #7CC79B; code #6bbb8c.
  - Dark answer card: design #191E1A; code #232925.
  - Dark user bubble: design gradient #1F4D35 to #173D2A; code flat #1f6b45.
  - Light on-accent ink: design #FFFEFB; code #ffffff.

  These tokens are shared, so check the Messages and Practice lanes before changing them. ASK-24 covers only the undefined `--ch-bubble-mine-ink`.
- Should be: ask/04-FIDELITY-SPEC dark palette; ask/06 E-CARD, E-USER, E-BTNS
- Fix: Add Ask-scoped tokens (`--ch-ask-accent`, `--ch-ask-card`, `--ch-ask-mine-a`/`-b`) under `html[data-fw-theme='dark'] [data-ui='clubhouse']`, rather than moving the global accent. Get a call from the owner if the global accent should move.
- Confidence: medium

### FID-ASK-27 Home: the greeting is 28 not 26, gaps are 2px short, and player focus rows are always amber
- Severity: P2
- Where: Ask home, coach and player, both, both themes
- File: src/clubhouse/styles/coachhelm-ask-v2.css:268, :280, :292, :326; src/clubhouse/screens/coachhelm/chat/Home.tsx:120
- What's wrong:
  - Greeting `--ch-type-28-strong` (design 26).
  - Home gap 12 (14).
  - Pulse gap 8 (10).
  - `.pulse .is-warn` is a hard-coded `#edb867`, not a token.
  - Player focus rows hard-code `is-warn` at Home.tsx:120, so the design's green second row ("on track") is always amber. The DOT map at :96 exists but isn't used there.
- Should be: ask/06 E-HOME; DESIGN_LANGUAGE (tokens only)
- Fix: Use `--ch-type-26-strong` and gaps 14 and 10. Set `.is-warn { background: var(--ch-chart-loss-fill) }`. Map the focus row's trend through `DOT`.
- Confidence: high

### FID-ASK-28 The request-more email names the team, not the player who asked
- Severity: P2
- Where: Player request more, server, n/a
- File: src/app/golf/actions/coachhelm-ask-credits.ts:55 (`subject: \`Ask: more requested (${teamName})\``)
- What's wrong: The alert says only which team asked, and the body is the optional note or a generic line. The coach can't tell which player wants more without opening another screen. The design receipt says "Sent to Coach Rivera… from Ava".
- Should be: ask/05 player.request.receipt
- Fix: Include the player's display name from the request row in the subject and body.
- Confidence: high

### FID-ASK-29 Meter and out card geometry
- Severity: P2
- Where: Player allowance meter, out card, both
- File: src/clubhouse/styles/coachhelm-ask-v2.css:197-229
- What's wrong:
  - Meter radius 16 (design 18); padding 12 16 (13 15); gap 8 (7).
  - Bar 4px tall at radius 999 (6px, radius 3).
  - Out card radius 16 (18); padding 16 (18); title 16 (18).
- Should be: ask/06 E-ALLOW, E-OUT
- Fix: Set each to the 06 value.
- Confidence: high

### FID-ASK-30 The Knows panel error is styled as the allowance meter
- Severity: P2
- Where: Knows panel error, desktop
- File: src/clubhouse/screens/coachhelm/chat/parts/KnowsPanel.tsx:76 (`className="ch-ak-meter is-low"`)
- What's wrong: The fact add or remove error borrows the meter's panel class, so it renders as a 16-radius padded meter box with loss text, not an inline error. It also gives no way to retry.
- Should be: DESIGN_LANGUAGE inline error; ask/05 S-ASK.knows.edit
- Fix: Use the shared inline error (`ch-field__error` or a `Notice`-style row) under the list.
- Confidence: high

### FID-QC-1 Every Quick chat task except event, message, qualifier and plan renders as an unfinished generic card
- Severity: P1
- Where: Quick chat task card for trip, goal, note, block, break, term, availability, recruit, lineup and lock, both, both themes
- File: src/clubhouse/shell/quick-chat/TaskCard.tsx:27-31 (WORDS has only cal, msg, qual), :64 (generic fallback icon and "CoachHelm"), :165-174 (`dl.facts`)
- What's wrong: Quick chat uses the same chat hook and tool set as Ask (QuickChatSession.tsx:42, `useCoachHelmChat`), so every CREATE_FLOW can start from it. Only cal, msg, qual and plan have a visual and copy. Every other flow shows a check-mark glyph, the sub "CoachHelm", the chip "Done", the busy text "Working…" and a bare facts list, and its told line reads "N players told." (:58). The design has none of these, and they look unfinished.
- Should be: coachhelm/05 S-TASK (one visual per task), TASK_FIELDS §5
- Fix: Either limit Quick chat's tools to the four designed tasks and hand the rest to Ask with "Open in Ask", or design and add WORDS entries and visuals for each flow, shared with FID-ASK-1. Get an owner call on which.
- Confidence: high

### FID-QC-2 A partial receipt shows as a full success
- Severity: P1
- Where: Receipt partial, both
- File: src/clubhouse/shell/quick-chat/TaskCard.tsx:40-47 (phaseOf)
- What's wrong: `phaseOf` maps `partial` to `done`. When some recipients failed, the card shows the green check and "Added". 05 S-RCPT draws an amber partial receipt that names who wasn't reached.
- Should be: coachhelm/05 S-RCPT partial; TASK_FIELDS §2.5
- Fix: Add a `partial` phase with the `.rcpt__g` amber variant (`--ch-qc-a-loss-tint` family, amber token) and the line built from failed `notifications`.
- Confidence: high

### FID-QC-3 The Told row is text only, though the coin CSS is there
- Severity: P1
- Where: Receipt told, both, both themes
- File: src/clubhouse/shell/quick-chat/TaskCard.tsx:245-249; src/clubhouse/styles/quick-chat.css:117-122, :233-234
- What's wrong: The design lights up avatar coins in delivery order, plus "+N". The code comment at TaskCard says "Can't match as drawn" and renders the text line only, while `.told .coins .coin` and `.coin.more` styles exist unused.
- Should be: coachhelm/05 S-RCPT.told
- Fix: Render up to 4 `.coin` elements from recipients (class year colour classes jr, so, fr already exist), then `.coin.more` "+N". Light them in order with the motion lane's stagger.
- Confidence: high

### FID-QC-4 Done steps keep their present-tense label and drop the fact
- Severity: P1
- Where: Run steps, done, both
- File: src/clubhouse/shell/quick-chat/QuickChatSession.tsx:385-395
- What's wrong: A done row renders `s.label` ("Checking Wednesday"). The design's done row is past tense plus one fact ("Checked Wednesday · free after 3"). Ask's Steps.tsx uses `s.done ?? s.label`; Quick chat doesn't.
- Should be: coachhelm/06 S-RUN.steps
- Fix: Render `s.done ?? s.label`, then `s.detail` in `--ch-qc-a-ink-2` after a middle dot.
- Confidence: high

### FID-QC-5 The composer has no + or mic button, though both are styled
- Severity: P1
- Where: Panel composer, both
- File: src/clubhouse/shell/quick-chat/QuickChatSession.tsx:303-328; src/clubhouse/styles/quick-chat.css:317-319, :333-334
- What's wrong: 06 S-PANEL.composer is + (36), field, mic (36), send (36). The code renders the field and send only. `.cmp__plus` and `.cmp__mic` have size, hit-area and icon rules but no elements.
- Should be: coachhelm/06 S-PANEL.composer
- Fix: Add `.cmp__plus` (opening the same add menu as Ask's Composer.tsx:368) and `.cmp__mic` (hidden where `webkitSpeechRecognition` is absent). Or, if mic is out of scope, take it out of the spec and the CSS.
- Confidence: high

### FID-QC-6 The qualifier told line is hard-coded, and its deadline is always empty
- Severity: P1
- Where: Task qualifier, receipt and visual, both
- File: src/clubhouse/shell/quick-chat/TaskCard.tsx:56 (`got a push and an email.`); src/lib/coachhelm/v3/chat/create-tools.ts:164 (`deadline: null`)
- What's wrong: The told line claims push and email whatever channels actually went out. TASK_FIELDS §2.5 says the receipt claims only what was read back. The qualifier visual's deadline field is always null, so the drawn deadline row in S-TASK.qual never shows.
- Should be: TASK_FIELDS §2.5; coachhelm/06 S-TASK.qual
- Fix: Build the line from `notifications[].channel` for every kind. Pass the qualifier's registration deadline from the input or read into `visual.deadline`.
- Confidence: high

### FID-QC-7 The live pill is 2px off on radius and padding, with the wrong type step
- Severity: P2
- Where: Live pill, both, both themes
- File: src/clubhouse/styles/quick-chat.css:374 (`.ch-qck .live`)
- What's wrong:
  - Radius `--ch-radius-lg` 16 (spec 18).
  - Padding 0 12 0 8 (spec 0 12 0 10).
  - Font `--ch-type-14-strong` (spec 13.5).
  - Background `#06231a` and spinner `#f4eedd`/`#7cc79b` (:377-381) are hard-coded hex, not tokens.

  QC-11 covers the 2px vertical offset only.
- Should be: coachhelm/06 S-LIVE
- Fix: radius 18, padding-left 10, `--ch-type-13-strong` with 13.5 via the k-scale. Move the colours to `--ch-qc-a-*` tokens.
- Confidence: high

### FID-QC-8 The panel sheet body is 12px inset, not 14
- Severity: P2
- Where: Panel body, both
- File: src/clubhouse/styles/quick-chat.css:332 (`.qc__body` padding 12 12 16)
- What's wrong: The spec is 14 14 16 inside the 6px inset sheet. The code is 12 12 16. Three rule sets assign `.qc__body` padding (:62, :289, :332) and `.qc` geometry (:50-51, :327-329, :339-340), and only the last wins, so the early values are dead code that misleads anyone editing.
- Should be: coachhelm/06 S-PANEL
- Fix: Set :332 to 14 14 16, and delete the overridden early rules :50-51, :62 padding and :289.
- Confidence: high

### FID-QC-9 The header padding, gap and mark tile don't match the spec
- Severity: P2
- Where: Panel header, both
- File: src/clubhouse/styles/quick-chat.css:52, :55, :57
- What's wrong:
  - Header padding 12 8 8 16, gap 8 (spec 18 14 12 20, gap 12).
  - A 30px avatar mark (spec: a 36px mark tile at radius 12).
  - Context line gap 4 (6).
  - Header buttons 36 (34).
- Should be: coachhelm/06 S-PANEL.hello
- Fix: Set each to the spec value, and use the 36 tile with `--ch-radius-md`.
- Confidence: high

### FID-QC-10 The request bubble and answer text are a half step too large
- Severity: P2
- Where: Request bubble, answer text, both
- File: src/clubhouse/styles/quick-chat.css:71, :72
- What's wrong:
  - Bubble padding 8 12 (spec 9 14).
  - Bubble radius 20 20 6 20 (spec 19 19 6 19).
  - Bubble type 16 (spec 15.5).
  - Answer text 16 (spec 15.5 on a 22.5 line).
- Should be: coachhelm/06 S-RUN.request
- Fix: Use the spec values; 15.5 comes from the k-scale (`--ch-qc-k`).
- Confidence: high

### FID-QC-11 Steps, step summary and task header spacing is 2px short
- Severity: P2
- Where: Steps, steps summary, task card, both
- File: src/clubhouse/styles/quick-chat.css:74, :92, :95, :96, :101, :104
- What's wrong:
  - Step gap 8 (spec 10).
  - Summary padding 4 8 (5 10 5 8).
  - Task header padding 12 12 8, gap 8 (14 14 10, gap 10).
  - Icon tile radius 8 (10).
  - Body padding 0 12 12 (0 14 12).
  - Fact gap 8 (10).
- Should be: coachhelm/06 S-RUN.steps, S-TASK
- Fix: Set each to the spec value.
- Confidence: high

### FID-QC-12 "Stopped" bleeds into earlier finished turns
- Severity: P2
- Where: Run stopped, a session with several turns, both
- File: src/clubhouse/shell/quick-chat/QuickChatSession.tsx:49 (one `stopped` for the session), :385, :407
- What's wrong: `stopped` is one boolean for the whole session and is passed to every AssistantTurn. Once set, the last step of every finished earlier turn renders with the `stopped` class (:385). Every earlier turn with no blocks (a task-only turn) also shows "Stopped. Nothing was saved." (:407), even though it finished and saved.
- Should be: coachhelm/05 S-RUN.stopped (only the stopped run)
- Fix: Store the stopped turn's id (`stoppedId`) and compare per turn.
- Confidence: medium

### FID-QC-13 Coins are 24px with 11px type, and the plan segment ink is hard-coded
- Severity: P2
- Where: Coins, plan bar, both, dark
- File: src/clubhouse/styles/quick-chat.css:117, :168, :172
- What's wrong: The coins are 24px with `--ch-type-11-strong`; the spec is 9.5 × k type on a 24 coin, and QC-21 already notes 11px coins. The plan segment ink is `color: #fff` (:168). Its dark override `.ch-qcs :root[data-theme="dark"] .pseg` (:172) can never match (extends QC-2), so on dark the white ink stays on the light dark-mode segment fills.
- Should be: coachhelm/06 S-TASK.plan; DESIGN_LANGUAGE (tokens)
- Fix: Use `--ch-qc-a-seg-ink`, defined light #fff and dark #0e120f under `html[data-fw-theme='dark'] .ch-qcs`.
- Confidence: high

### FID-QC-14 The key's accent colours are hard-coded hex
- Severity: P2
- Where: Key and anything using `--ch-qc-a-accent-text` outside the panel, both themes
- File: src/clubhouse/styles/quick-chat.css:347-348 (`--ch-qc-a-accent-text: #155a39`, dark `#7cc79b`, champ-ink `#725b2c` / `#cdbb8e`)
- What's wrong: The key scope redefines the accent text and tint as literals instead of pointing at tokens.css. They will drift from the panel scope's values and from FID-ASK-26's fix.
- Should be: DESIGN_LANGUAGE (tokens only)
- Fix: Point them at `--ch-green-700`/`--ch-accent-text` and `--ch-champagne-*` tokens.
- Confidence: high

## Decisions for the owner (from this audit)
1. FID-QC-1: should Quick chat start only the four designed tasks and hand the rest to Ask, or does every flow get a Quick chat visual?
2. FID-ASK-26: should the global dark accent move to #7CC79B (affects every lane), or should Ask get scoped tokens?
3. FID-QC-5: is the mic in scope? If not, it comes out of 06 S-PANEL.composer and the CSS.
4. FID-ASK-2: a drill flow is not buildable until the team drill bank ships (TASK_FIELDS §5.14). The README claim "built but stays off" should be corrected.
