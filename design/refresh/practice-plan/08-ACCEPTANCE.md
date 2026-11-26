# 08 · Acceptance: CoachHelm practice plans (lane 6)

> Wiring, 4 Nov 2026: see the section of that name at the end of this file.

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 84 rows).

Design page: https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5 (local `redesign/coachhelm-practice.html`). Screen IDs from `05-SCREENS.md`, values from `06-SCREEN-SPECS.md`, motion rows from `07-MOTION.md`, files and PRs from `02-PLAN.md`, figures from `03-DATA-CHECKS.md`. Started from the lane draft `redesign-package-src/acceptance/practice-builder.md`; its criteria ids (PB-STP-01 …) stay, its PR groups PB1 to PB8 are replaced by PP0 to PP9, and every open item in it is closed below.

- Shared criteria are referenced, not restated: SHARED-1 green bar, 2 flat page, 3 no accent left borders, 4 contrast and legibility, 5 XXL unclipped, 6 Reduce Motion and honest motion, 7 phone edge 16/20, 8 draft PRs behind a flag, 9 no deploy, flag flip or migration, 10 shot tracking unchanged, 11 players never see teammates' figures, 12 side-by-side match (`00-shared/ACCEPTANCE-SHARED.md`).
- Check type: (shot) screenshot pair from `capture.mjs`, (DOM) DOM or unit-dom test, (clip) recorded motion compared with the 07 row, (unit) data or server test.
- Everything sits behind `coachhelm_practice_plans_v1`, off in every environment. Saving, publishing, the builder helper and the player side also need N-00's `golf_practice_plans` flag and its held migrations, and ship with the Practice tab after slices 1 to 5 (settled call 1; 02 §0).
- Defaults marked "Default (Nick can flip)" are listed in 02 §0.1 and 04 §1.

## Part 1. Criteria per screen ID

### S-ASK.thread (screen; page `askFull`; capture `default`)
1. PB-THR-01 The Ask thread is today's `AskThread`; the green bar, tab bar and composer are unchanged (SHARED-1) (shot)
2. PB-THR-02 The coach's message is a right-aligned bubble in `--bubble-me` (#155A39 light, #1F6B45 dark) with ivory text, at least 4.9:1 in both themes (DOM contrast)
3. PB-THR-03 While a turn runs the send button is an ink Stop square; Stop ends the turn with nothing written (unit)
4. PB-THR-04 With the flag off, `buildCoachTools` returns the same keys as at 75b4956 (02 §0.2) (unit)

### S-ASK.steps (inline in the Ask turn; page `askSteps`; capture `running`, `stopped`)
1. PB-STP-01 One row per `data-progress` part the server sent; no invented future step, no percentage, no tool name, no "Thinking" [kit ①] (DOM)
2. PB-STP-02 Row 32pt tall, 20pt glyph, label 15/20; no card of its own [kit ①] (shot)
3. PB-STP-03 Active: 8pt `--ch-accent` dot breathing scale 1 to 0.6 every 1.2s, label opacity 1 to 0.55 every 1.9s (07 M-ASK-03); done: 14pt check drawing in 240ms `--ch-ease`; failed: amber ring with a bar, never red [kit ①, plan §7] (clip)
4. PB-STP-04 Done label changes in place to past tense plus one fact in secondary ink ("Checked Thursday · ...") [kit ①] (DOM)
5. PB-STP-05 New labels exist for the class times and drill bank reads ("Checking class times", "Reading your drill bank") [page "Where it lands"] (DOM)
6. PB-STP-06 While running the send button is an ink Stop square; Stop marks the active step with a dash and says "Stopped. Nothing was saved." [kit ①] (DOM)
7. PB-STP-07 Turn end folds the list to "6 steps · 9s"; a chevron reopens it; fold is a 260ms height spring then fade [plan §1.4, kit ①] (clip)
8. PB-STP-08 Reduce Motion: static dot, no shimmer, no stroke draw; fold is a `CH_FADE_MS` (180ms) crossfade [kit ①, plan §7] (clip)

### S-ASK.read-pictures (inline under each finished read; page `data-vz` cal, sg, pd, cls, dr)
1. PB-VZ-01 Well 12 radius, padding 10 12, 12.5/1.25 ink-2, 1pt `--ch-separator` inset ring; skeleton 74pt tall pulsing 1.9s while running [page `.vz`] (shot)
2. PB-VZ-02 Five pictures: Thursday lit on the week with Hargrove on Monday; strokes gained by area against the scoring baseline with a centre line and putting −0.9 in amber; make rate by distance in the app's bands (3–5, 5–10, 10–15, 15–25 ft, no 0–3) with the Tour tick (03 §3); class timeline 2:00 to 3:00 (Ava and Jade to 2:15, rotation from 2:30); three drills fanned out of the bank with "+13 more" [plan §1.4] (shot)
3. PB-VZ-03 Amber marks only where the make-rate gap is over 8 points; amber nowhere else [plan §1.4, §8] (DOM)
4. PB-VZ-04 Chart marks hold 3:1 on their track in light and dark [DESIGN_LANGUAGE §3] (DOM contrast)
5. PB-VZ-05 Skeleton crossfades to the picture in 260ms; bars and segments grow 360ms, all together (no stagger); drills fan 462ms smooth spring; Reduce Motion: picture appears whole with a `CH_FADE_MS` (180ms) fade [plan §7] (clip)

### S-ASK.intake (inline card: ask first; also the builder's New plan sheet and the quick chat)
1. PB-INT-01 One card after the calendar read, title "What should Thursday cover?" and hint "Best guesses are picked. Change any." [plan §1.3] (shot)
2. PB-INT-02 At most three groups (How long, Work on, Who); never a group the request already answered [plan §1.3, kit ⑥] (DOM)
3. PB-INT-03 Chips are 36pt pills; selected chip has accent fill and ivory label; Work on allows several [kit ⑥, plan §7] (shot, DOM)
4. PB-INT-04 Each group has one source line under it ("Your calendar has 2:00 to 5:00", "Your stats point at the first two. Hargrove starts Monday.", "9 going, 1 can't"); guesses come only from this turn's reads [plan §1.3; kit Lane 6] (DOM)
5. PB-INT-05 "Build the plan" is dim and inert until every group has an answer; with guesses ticked it is ready at once [plan §1.3] (DOM)
6. PB-INT-06 Last line names the format in use ("In your format · Fall practice sheet") and links to Practice › Plan format [plan §13] (DOM)
7. PB-INT-07 Trail shows "Waiting for your answers" while the card waits, then "Got your answers" [plan §1.3] (DOM)
8. PB-INT-08 Chip press scales .97 (110ms down, 280ms release); fill crossfades 180ms; the chip keeps its size; Reduce Motion: instant [plan §7] (clip)
9. PB-INT-09 Picking "On course, holes 1 to 6" puts holes 1 to 6 in the plan [plan §1.3] (unit)
10. PB-INT-10 Asks only what TASK_FIELDS §5.15 lists: which practice, length, focus, groups, folder [fields §5.15] (DOM)
11. PB-INT-11 The card is `chat/parts/AskFirst.tsx` (shared with the Ask lane), wrapped by `chat/plan/PlanIntake.tsx` (02 §16) (DOM)
12. PB-INT-12 A selected chip shows no check mark: fill crossfade only, the same as the Ask lane. Default (Nick can flip) (shot)

### S-ASK.intake-folded (inline: the coach's bubble)
1. PB-FLD-01 On press the card becomes the coach's bubble "3 h · short putts, lag, up and down, holes 1 to 6 · everyone" [plan §1.3] (shot)
2. PB-FLD-02 Card fades 160ms and collapses 260ms smooth; bubble arrives 260ms; Reduce Motion `CH_FADE_MS` (180ms) fades [plan §7] (clip)

### S-ASK.plan-card (inline: the plan writes itself; page `askOpen`)
1. PB-CRD-01 `draft_practice_plan` is class draft and writes nothing; it streams one `practice-plan-block` part per block, then the body [plan §9] (unit)
2. PB-CRD-02 Opens with sized skeleton rows for all six blocks (11pt bars on the well, 8pt apart) [plan §1.5; page `.blk.skel`] (shot)
3. PB-CRD-03 Write head: inset 2pt accent ring at 35%, radius 12, moving down the blocks; time first, title typing with a caret (about 300ms), then place, drills and Why rising 260ms [plan §1.5, §7; page `.blk.wh`] (clip)
4. PB-CRD-04 Day strip 8pt tall, 2pt gaps, radius 4, on the track colour; one segment per block, width by minutes, growing scaleX 360ms from the left [page `.strip`; plan §7] (shot, clip)
5. PB-CRD-05 Block row columns 54 / 1fr, gap 12, padding 12 16; time 15/1.2 weight 600 tabular with length 13 ink-3; title 16/1.3 weight 500; meta 15/1.35 ink-2 [page `.blk`] (shot)
6. PB-CRD-06 Status line "Writing block 3 of 6", last "Checking every why against the data" [plan §1.5] (DOM)
7. PB-CRD-07 Card settles 0.98 to 1 on a 260ms spring, then the foot appears: mix bar, Save to row, Save draft, Publish... [plan §1.5, §7] (clip)
8. PB-CRD-08 `validatePlan` passes before the card reads "Ready"; every drill id exists in `golf_team_drills` or `golf_drills` [plan §9; page] (unit)
9. PB-CRD-09 Reduce Motion: each block appears filled; no write head travel [plan §7] (clip)

### S-ASK.why (inline: Why panel per block; coach only)
1. PB-WHY-01 Why panel: well, radius 10, padding 8 10, 15/1.35 ink-2, label in ink weight 600; Aim, Because and up to two source chips [page `.why`; plan §6] (shot)
2. PB-WHY-02 Source chips radius 7, padding 3 8, 13/1.3 weight 600 accent on card with a 1pt separator ring; a chip opens the existing evidence panel [page `.src`; plan §1.7] (shot, DOM)
3. PB-WHY-03 Every number in a Because appears in a read envelope from this turn (`chat/claims-packet.ts`); a block that fails loses its Because and shows "Lean read" [plan §6] (unit)
4. PB-WHY-04 Warm-up, move and wrap blocks read "Routine. No claim." unless real data shaped them [plan §6; page] (DOM)
5. PB-WHY-05 Under 5 rounds in the window the block says it is a lean read ("Only 3 rounds since Oct 1, so this is a lean read"); no data, no Because [page "Thin data"] (unit)
6. PB-WHY-06 Drills come only from the team bank and the GolfHelm library; when nothing fits the card says so and offers New drill [plan §11.4] (DOM)

### S-ASK.refine (inline chips and version 2; page Mac `dskChange`)
1. PB-REF-01 Chips under the card: "Make it 2 hours", "More pressure", "Lighter before Monday", "Use Tuesday's groups" [plan §1.6] (shot)
2. PB-REF-02 A refine makes version 2, marks touched blocks "Changed", and shows "1 of 2" arrows; version 1 is one tap back [plan §1, page] (DOM)

### S-ASK.block-sheet (sheet from a block tap; page `askEdit`)
1. PB-BLK-01 Sheet with length stepper (5 to 360 minutes in steps of 5), place, coach, drill with Swap, its Why, "Ask about this block" [plan §1.7; fields §5.15] (DOM)
2. PB-BLK-02 Sheet up 462ms smooth spring, down 280ms ease; Reduce Motion `CH_FADE_MS` (180ms) fade [plan §7] (clip)
3. PB-BLK-03 Sheet hugs its content up to 84% of the screen height (`max-height: 84%`), top radius 20, grabber 36×5 radius 3 in `--ch-separator` strong, header padding 6 16 10, shadow 0 −10 30 −10 at 25% (shot, DOM)

### S-ASK.swap (inline in the block sheet; page `askSwap`)
1. PB-SWP-01 Three drills from the bank that fit the same gap, each with its own because [plan §1.7] (DOM)

### S-ASK.save-to (inline list inside the plan card; page `askSave`)
1. PB-SAV-01 "Save to [Practice plans ⌄]" row above Save draft and Publish..., defaulting to the last folder used [plan §2, kit ⑦] (shot)
2. PB-SAV-02 Tap opens the list in place inside the card (no popover, no sheet): folder icon 30×24 accent, name, count, a check on the chosen one, New folder last in accent weight 600 [plan §2; page `.fl`] (shot)
3. PB-SAV-03 New folder becomes a name field (min 120 wide, inset 1.5pt accent ring, blinking 2pt caret) with Create; Enter creates, Escape closes; the folder lands on top, chosen; the row reads "Save to Hargrove week" [plan §2, kit ⑦; page] (DOM)
4. PB-SAV-04 Folder name 1 to 60 characters [fields §5.15] (DOM)
5. PB-SAV-05 Until Documents folders exist the row shows Practice plans only [plan §2] (DOM)
6. PB-SAV-06 A folder is a name in today's `golf_documents.folder` column (1 to 60 characters, trimmed); there is no folders table and no `create_document_folder`. Default 1 (Nick can flip) (unit)

### S-ASK.saved (inline: draft receipt)
1. PB-SVD-01 Save draft is a coach press, never the model [plan §2] (DOM)
2. PB-SVD-02 Button becomes a "Saving..." capsule (280ms smooth, sweep 900ms loop); Reduce Motion `CH_FADE_MS` (180ms) crossfade [plan §7] (clip)
3. PB-SVD-03 Page drops into the folder on a 462ms arc; folder squashes 1.08 × 0.94 and settles; count changes; card edge flashes once (inset 2pt accent at 60%, fading 900ms); Reduce Motion: no flight, folder fades [plan §2, §7] (clip)
4. PB-SVD-04 Receipt: check draws 300ms with one ring 1 to 1.9 fading 620ms; "Plan saved · Documents · Hargrove week"; "Only coaches can see it. Players are told when you publish."; Open; Undo with an 8s linear draining ring [plan §2, §7] (shot, clip)
5. PB-SVD-05 Card meta becomes "Draft · Hargrove week · Thu, Nov 5" [plan §2] (DOM)
6. PB-SVD-06 Draft is listed in Documents marked "Only coaches"; a save through `saveTextDocument` passes `playerVisible: false`, so `is_public` is false (the default is player visible, 02 §6.1) [plan §11.3; fields §5.15] (unit)
7. PB-SVD-07 No player DOM, push or bell receives anything from a draft save [plan §2] (unit)
8. PB-SVD-08 Undo inside 8s removes the plan, and the folder too when it was made here and is left empty [plan §2] (unit)

### S-ASK.publish-confirm (inline confirm card; page `askPublish`)
1. PB-PUB-01 `publish_practice_plan` is in `CONFIRM_REQUIRED_TOOLS`; nothing writes before the press [plan §9, kit ③] (unit)
2. PB-PUB-02 Shows When, Where, Tells (faces and "9 players and 2 coaches, push and bell"), Files to (folder and Change), "What Jonah gets" with the exact notification, team chat switch [plan §3] (shot)
3. PB-PUB-03 "On confirm" line: it files in Documents now; the 11 people hear once Undo closes, 8 seconds later [plan §3] (DOM)
4. PB-PUB-04 Buttons Cancel (ghost) and "Publish to 11 people"; both lock after the first tap [plan §3, kit ③] (DOM)
5. PB-PUB-05 Team chat switch is today's `ui/Switch.tsx`: 40 × 23 track, 19pt thumb sliding 17pt on `--ch-ease-spring` 260ms, held thumb 1.2 × 1; Reduce Motion: thumb jumps [plan §7] (clip)
6. PB-PUB-06 The primary label is "Publish to 11 people", with the count from the audience read (02 §16) (DOM)

### S-ASK.published (inline: receipt, told, seen)
1. PB-PBD-01 "Publishing..." capsule, page drops into Practice plans, count up, card edge flash once [plan §3] (clip)
2. PB-PBD-02 Receipt "Published · Thu, Nov 5, 2:00 PM · Documents › Practice plans · shared with players", Open, Undo with the 8s ring [plan §3] (shot)
3. PB-PBD-03 The plan appears in the coach's Documents › Practice plans marked "Shared with players" [plan §3, §11.3] (DOM)
4. PB-PBD-04 No push, bell or chat card is sent before the 8s window closes; Undo inside it un-publishes with nobody told [plan §3] (unit, fake timers at 7.9s and 8.1s)
5. PB-PBD-05 After the window: "Told 11 · push and bell", each face pops 300ms spring 90ms apart in arrival order; Reduce Motion all at once [plan §3, §7] (clip)
6. PB-PBD-06 "Seen by 4 of 9 · Jonah, Eli, Sofia, Nora" updates as players open it; names on tap [plan §3; page] (DOM)
7. PB-PBD-07 Only Publish, a republish that changes a player's day, or Take down sends anything [page "Exactly what is sent"] (unit)

### S-ASK.failed, S-ASK.cancelled, S-ASK.undone (inline states, not drawn)
1. PB-FAIL-01 Failed: amber glyph, reason, "Nothing was saved.", Try again; the draft stays [kit ⑤] (shot)
2. PB-FAIL-02 Cancelled: "Cancelled. Nothing was created."; draft dims to 60% and stays readable [kit ⑤] (shot)
3. PB-FAIL-03 Undone: object animates back out in 280ms; neutral line in secondary ink [kit ⑤] (clip)

### S-ASK.evidence (sheet; capture `open`)
1. PB-EVD-01 A source chip opens the existing evidence sheet (M-ASK-13), title "Evidence", Done top right (shot)
2. PB-EVD-02 It shows the read's window, sample and figure, e.g. "Team, last 10 rounds · 86 player-rounds · 412 putts from 3 to 5 ft", and the band chart from S-ASK.read-pictures in the app's bands (03 §3) (DOM)
3. PB-EVD-03 Every figure in the sheet comes from a read envelope of this turn; nothing is recomputed on the client (unit)

### S-ASK.toast (toast; drawn on tap, no capture state)
1. PB-TST-01 Save draft… in the Mac pane footer (S-ASKD.pane) shows one toast, "Saved as a draft · Documents, coaches only", 14/18.2 weight 500, card colour on ink, padding 10 14, radius 12, centred 96 above the bottom (shot)
2. PB-TST-02 It rises 8 and fades in 260ms, holds 2.2s, fades out 200ms (M-ASK-29); it never stacks (clip)

### S-ASK.share-pdf (system print sheet; not drawn)
1. PB-PDF-01 Share PDF on the phone opens the system print sheet over S-ASK.full-plan; the page printed is S-DOC.print-coach for a coach and S-DOC.print-player for a player (DOM)
2. PB-PDF-02 No new PDF library is added; `jspdf` and `html2canvas` stay unused (Default 2, Nick can flip) (unit: package.json diff)

### S-ASKD.thread, S-ASKD.steps, S-ASKD.intake, S-ASKD.pane-v2, S-ASKD.publish (Mac; page `dskBuild`, `dskChange`)
1. PB-DSK-01 The Mac keeps today's sidebar and glass top bar (SHARED-1); the thread column and the 452 pane sit side by side at 1280 (shot)
2. PB-DSK-02 Steps and Ask first use the phone components unchanged in the thread column (DOM: same component, no desktop fork)
3. PB-DSK-03 The compact card in the thread reads "Draft · 6 blocks · 3 h" and reopens the pane (DOM)
4. PB-DSK-04 Version 2 replaces the pane body with a 120ms out, 180ms in crossfade (M-ASK-26); arrows read "2 of 2" and go back to version 1; changed blocks carry "Changed" (clip, DOM)
5. PB-DSK-05 Publish… in the pane footer scrolls the thread to the same confirm card as S-ASK.publish-confirm (DOM)

### S-DOC.print-coach, S-DOC.print-player (print pages; not drawn)
1. PB-PRN-01 `@media print` of `PracticePlanSheet`: light colours in a dark theme, no app chrome, page breaks only between blocks (unit-dom with `emulateMedia({ media: 'print' })`)
2. PB-PRN-02 The coach and player prints of one plan differ only by the Why lines and the "Coach copy" / "Player copy" label (unit: text diff)

### S-DOC.list-draft, S-DOC.list-shared (Documents rows; not drawn)
1. PB-DOC-01 After Save draft, Team Hub › Documents shows the row with an "Only coaches" chip; it is absent from every player's Documents response (DOM, unit)
2. PB-DOC-02 After Publish, the row reads "Shared with players" and players see it (DOM)
3. PB-DOC-03 The row change is one additive line in `screens/hub/parts.tsx` `Documents`, with its own P010 changelog fragment, unless N-10 owns the row by then (02 §6.3) (review)

### S-ASK.full-plan, S-ASKD.pane, S-DOC.sheet-coach, S-DOC.sheet-player (push "‹ Ask" with a dock on phone; 452 pane on Mac; page `askOpen`, `dskBuild`)
1. PB-PG-01 Page, phone full plan and PDF are one component; it stays light in dark mode [plan §12] (DOM, shot)
2. PB-PG-02 Header: team mark, "Demo University Golf / Practice plan · Coach copy", date block (THU 5 NOV), 2px ink rule under it [plan §12] (shot)
3. PB-PG-03 Title, focus line, then Time · Place · Coaches in three columns [plan §12] (shot)
4. PB-PG-04 Groups: one tinted column per group with letter disc (20 × 20, radius 6, letter 12 weight 700; 19 × 19, radius 5, letter 11 in the rotation grid) and names; light tokens `--gA` #1F6B45 on #E4EEE7, `--gB` #2F5B7E on #E3EAF2, `--gC` #654A7E on #ECE7F1 (plum; dark #B49ACB on #2B2433); disc letter white, each at least 4.9:1 [plan §12; page] (DOM contrast)
5. PB-PG-05 Rotation grid 13/1.3: stations down, turns across (2:30, 2:50, 3:10), each cell the group letter on its tint, rows split by 1pt separators; course block shows "A Hole 1 · B Hole 3 · C Hole 5"; other blocks say "Everyone" [plan §12; page `.rot`] (shot)
6. PB-PG-06 Bring is a checklist; Notes are ruled lines; footer "state · In your format · <format name> · Page 1 of 1" [plan §12] (shot)
7. PB-PG-07 Under 340pt of content width the group columns and rotation cells tighten by container query [plan §12] (shot at 320)
8. PB-PG-08 Coach copy: one short Why line per block (accent label, secondary text). No Aim, Because or source chips on paper [plan §12] (DOM)
9. PB-PG-09 Player copy: the same component with zero Why nodes in its DOM and its PDF text [plan §11.2, §12] (DOM, unit)
10. PB-PG-10 Mac pane (S-ASKD.pane) 452 wide, opens 462ms smooth; title, meta, "1 of 2" arrows, close; footer Edit in builder, Save draft..., Publish... [plan §1; kit Lane 4] (shot, clip)
11. PB-PG-11 Phone dock (S-ASK.full-plan): glass blur(24px) saturate(170%), 1pt top separator, padding 10 16 28, two equal buttons (Save draft..., Publish...); no data under the glass [page `.dock`] (shot)
12. PB-PG-12 Phone push to the full plan: incoming 100% → 0, the page behind moves 24% (`CH_UNDERLAY_SHIFT`) and dims to brightness(0.9), 462ms on `--ch-ease-spring-smooth`; Back reverses it from where it is; Reduce Motion: `CH_FADE_MS` crossfade, no slide (M-ASK-16) (clip)

### S-FMT.empty, .upload-sheet, .reading, .found, .set, .see, .undone (page `fmtUpload`, `fmtSee`)
1. PB-FMT-01 "Use the plan you already use" with Upload a plan; sheet offers Choose file, Photo library, Take a photo; accepts PDF, photo, Word, Excel [plan §13] (DOM)
2. PB-FMT-02 Reading: the file shows as a page in a well; a scan line passes down it while kit steps run: "Reading the file (1 page · 5 sections)", "Matching your sections", "Checking your past plans (6 plans · you split into 3 groups most weeks)" [plan §13] (clip)
3. PB-FMT-03 Found sections outlined on the page all at once, each with a small tag; no stagger [plan §13] (clip)
4. PB-FMT-04 "Here's your format": Header, Groups, Schedule, Bring, Notes in plain words; Try another and Use this format [plan §13] (shot)
5. PB-FMT-05 Use: Saving capsule, receipt "Your format is set · Plans from Ask and the builder now use it", See Thursday in it, 8s Undo [plan §13] (shot)
6. PB-FMT-06 Copies layout only (sections, order, schedule columns); a new plan's drills, times and groups never come from the sample [plan §13] (unit)
7. PB-FMT-07 No template editor, field mapping or toggles anywhere on the screen [plan §13.7] (DOM)
8. PB-FMT-08 `golf_practice_plan_formats` migration is held with the Practice ones and not applied (SHARED-9) [plan §13]

### S-BLD.helper, .new-sheet, .ghosts, .kept, S-BLDD.board, .inspector (page `bNew`, `bFill`, `bKeep`, `dbFill`, `dbKeep`)
1. PB-BLD-01 Header "‹ Practice"; steps Blocks / Groups / Drills / Review [plan §4] (shot)
2. PB-BLD-02 New plan sheet: "Start from" gains "Ask CoachHelm" with focus suggestions from the data ("Putts inside 6 feet", "Wedges inside 100") and the same ask first card [plan §4; page Scene 4] (DOM)
3. PB-BLD-03 Empty Blocks: the green helper card with three facts and "Fill the draft" is the screen's one feature card [page Scene 4] (shot)
4. PB-BLD-04 Per step offers: one block selected "Suggest a drill for this station", "Fit this to 20 minutes"; Groups "Group by need" or "Keep late arrivals together" each with its reason; Drills three best fits each with its because; Review "Check balance" in one line ("45 of 135 minutes on putting, the team's biggest loss") [page Scene 4] (DOM)
5. PB-BLD-05 Ghost blocks: well fill, green outline, the word "Suggested", Keep / Swap / Remove, Keep all; Keep turns a block solid with the card shadow [plan §4; page] (shot)
6. PB-BLD-06 Nothing joins the plan until kept; a suggestion never overwrites a coach-made block; suggestions live in client state only [page Scene 4, "Where it lands"] (DOM)
7. PB-BLD-07 After keep or dismiss the helper folds to "CoachHelm · 6 suggestions kept" [page Scene 4] (shot)
8. PB-BLD-08 Mac: library rail, board with proportional ghost blocks, inspector with a CoachHelm tab [plan §4] (shot)

### S-PLY.notify, .practice, .plan, .docs (page `pNotify`, `pOpen`)
1. PB-PLY-01 One push and one bell row: title "Practice plan for Thursday", body "2:00 PM · You start on the putting green with Group B", Events category so the player's own switch and Quiet mode apply [page Scene 5] (unit)
2. PB-PLY-02 Player Practice page shows their group's stops (Now, Next), focus and group; zero Why nodes in the player DOM [plan §5, §11.2] (DOM)
3. PB-PLY-03 The plan also lives in Team Hub › Documents › Practice plans for players once published [page Scene 5] (DOM)
4. PB-PLY-04 A player never sees a draft, another group's assignment reasons, or any teammate's stats from the reads (SHARED-11) [plan §5] (DOM)
5. PB-PLY-05 Players see focus, their group and their stops; no Aim and no Why anywhere in the player DOM, payload or PDF. Default 7 (Nick can flip) (DOM, unit)


### States across screen IDs (05 matrix rows)
1. PB-ST-01 Loading: skeleton picture rows and skeleton blocks, shimmer 1.9s, off under Reduce Motion [page] (shot)
2. PB-ST-02 Empty bank: the card says no drill fits and offers New drill [plan §11.4] (shot, app only)
3. PB-ST-03 Long text and XXL: block titles wrap to 3 lines, the strip keeps proportions, rotation cells tighten under 340pt; the `long` and `many` (25 players) fixtures are app only, build rules in 05 (shot)
4. PB-ST-04 Offline or stale: kit ⑤ partial. The card lists what failed and says "Check what was created before you try again."; Save and Publish are disabled with "You're offline" (DOM)
5. PB-ST-05 Desktop 1280: thread with the compact card plus the 452 pane (shot)
6. PB-ST-06 Large phone 430: page edge 20, cards fill 390, nothing else changes (SHARED-7) (shot at 430)
7. PB-ST-07 Every drawn state at XXL (`#cap-<state>-xxl`, `--xxl`) matches the page: rows grow, nothing clips (SHARED-5) (shot)

## Part 2. Per PR

| PR | Must pass | Tests it adds | Done when |
|---|---|---|---|
| PP0 flag, model, fixtures, preview, PracticePlanSheet | S-DOC.sheet-coach, S-DOC.sheet-player (PB-PG-01 to 09); S-ASK.full-plan and S-ASKD.pane statically | flag off everywhere; player model has no `why` key; sheet stays light under dark; container query at 320; group tints at 4.9:1; flag-off tool keys | `capture.mjs --id S-DOC.sheet-coach` pair matches at 390 and 452, light and dark; player DOM has zero `[data-why]` |
| PP1 steps and read pictures | S-ASK.thread, S-ASK.steps (running, stopped), S-ASK.read-pictures, S-ASKD.thread, S-ASKD.steps | progress labels for the four new reads; one fact per finished read; Stop leaves no write; bands are the app's `PUTT_DISTANCE_BUCKETS` | `askSteps` pair and M-ASK-02 to 05 and 08 clips match, with and without Reduce Motion |
| PP2 Ask first | S-ASK.intake, S-ASK.intake-folded, S-ASKD.intake | dim until answered; no group for what the request said; answers become tool input; the fold is the coach's message | intake pair and M-ASK-06, 07 clips match; answers drive the plan in a unit test |
| PP3 draft and why rule | S-ASK.plan-card, .why, .evidence, .refine, .block-sheet, .swap, .full-plan, S-ASKD.pane, S-ASKD.pane-v2 | claim audit turns an unsourced number into "Lean read"; drill ids exist; `validatePlan` before Ready; `draft_practice_plan` writes nothing (throwing spy) | `ask-writing`, `ask-card`, `ask-edit`, `ask-swap`, `ask-full`, `desk-pane`, `desk-v2` pairs and M-ASK-09 to 16, 26, 30 clips match |
| PP4 save to a folder | S-ASK.save-to, S-ASK.saved, S-ASK.toast, S-ASK.failed, S-ASK.undone, S-DOC.list-draft | `playerVisible: false`; Undo inside 8s leaves no row; nothing reaches players; Save locks after one tap | `ask-folders`, `ask-newfolder`, `ask-saving`, `ask-saved` pairs and M-ASK-17 to 23 clips match |
| PP5 publish | S-ASK.publish-confirm, S-ASK.published, S-ASK.cancelled, S-ASKD.publish, S-DOC.list-shared | `publish_practice_plan` in `CONFIRM_REQUIRED_TOOLS`; zero sends at 7.9s, one batch at 8.1s (fake timers); Documents shows Shared with players; deferred send fires once if the coach leaves | `ask-confirm`, `ask-publishing`, `ask-published`, `ask-told` pairs and M-ASK-24, 25, 28 clips match |
| PP6 print and PDF | S-DOC.print-coach, S-DOC.print-player, S-ASK.share-pdf | print media render; coach vs player text diff is only Why lines; dark prints light | both prints of one plan attached to the PR; diff shows only Why lines |
| PP7 plan format | S-FMT.empty, .upload-sheet, .reading, .found, .set, .see, .undone | layout copied, content never; `golf_practice_plan_formats` held in `HELD.md` (SHARED-9) | `fmt-*` pairs and M-FMT-01 to 05 clips match |
| PP8 builder helper | S-BLD.helper, .new-sheet, .ghosts, .kept, S-BLDD.board, .inspector | nothing applies until kept; no coach block is overwritten; suggestions live in client state only | `bld-*`, `bldd-*` pairs and M-BLD-01 to 04 clips match |
| PP9 player side | S-PLY.notify, .practice, .plan, .docs | player payload has no Why, Aim or teammate figure (SHARED-11); one push and one bell row, Events category | `ply-banner`, `ply-practice` pairs and M-PLY-01, 02 clips match |

Every PR also passes SHARED-2 to SHARED-12; `clubhouse:css` (transform and opacity only, except FLIP heights), `clubhouse:catalog --check`, `flags:check`, `clubhouse:check` (02 §0.2).

## Part 3. Side by side

1. Shots: `node capture/capture.mjs --id <ID> --state <state>` writes `screenshots/<ID>__<state>__{design,app}__{light,dark}.png` at the same width (390 × 844 phone, 1280 × 800 desktop), theme and Text Size; add `--xxl` for Text Size 1.36. The design half of every drawn state is already in `screenshots/design/`.
2. Put the two images next to each other in the PR and check the 06 redline numbers for that ID on both, within 2pt.
3. Motion: `node capture/capture.mjs --motion <M-ID>` records the design page (its Play button or motion lab) and the app at 390 wide, with and without `reducedMotion: 'reduce'`. Compare duration, curve and what moves against the 07 row, at the frame its Check column names.
4. A PR is done only when every listed screen matches within 2pt on the redline numbers and every motion row matches (SHARED-12).
5. Hooks the app must carry for the clips (`capture.mjs` MOTION table): `data-ch-send`, `data-ch-ask-first`, `data-option`, `data-ch-ask-first-submit`, `data-ch-block`, `data-ch-sheet-close`, `data-ch-swap-option`, `data-ch-stepper-minus`, `data-ch-open-plan`, `data-ch-back`, `data-ch-save-to`, `data-ch-new-folder`, `data-ch-save-draft`, `data-ch-confirm`, `data-ch-team-chat`, `data-ch-refine`, `data-ch-upload`, `data-ch-use-format`, `data-ch-see-plan`, `data-ch-fill-draft`, `data-ch-keep`, `data-ch-keep-all`, `data-ch-new-plan`, `data-ch-banner`, and `data-why` on every Why node (the player DOM test counts them), `data-ch-pane-save` (pane footer Save draft…), `data-ch-seg` (every segmented control).

## Completeness pass, 4 Nov 2026

Criteria for every state in 05's section of this name, for the decisions in 02 §C.1 to §C.9, and for the IDs that were not named in Part 1 by ID (S-BLD.ghosts, S-BLD.kept, S-BLD.new-sheet, S-BLDD.inspector, S-FMT.found, S-FMT.reading, S-FMT.see, S-FMT.set, S-FMT.undone, S-FMT.upload-sheet, S-PLY.docs, S-PLY.plan, S-PLY.practice). Same shape as Part 1: id, text, [source], (check).

1. CP-PP-01 S-BLD.new-sheet: With `coachhelm_practice_plans_v1` on, Start from offers Blank, Template, Copy a past practice and Ask CoachHelm; off, only the first three; step 1 is S-PRC.new-pick [05 C] (DOM)
2. CP-PP-02 S-BLD.ghosts: Stop while ghosts write keeps the written ghosts as ghosts and adds nothing to the draft; leaving the step drops them with no prompt [05 C] (DOM)
3. CP-PP-03 S-BLD.kept: A kept block is an ordinary draft block: it autosaves, reorders and deletes with S-PRC.bld-delete-undo [05 C] (DOM)
4. CP-PP-04 S-BLDD.inspector: With nothing selected it reads "Select a block to edit it."; with a block it shows N-00 4.5's fields for that kind on the Block tab and the CoachHelm tab beside it; a new selection crossfades in 180ms (M-CP-10) [05 C, 07 C] (DOM, clip)
5. CP-PP-05 S-FMT.upload-sheet: A file over 10 MB or of another type shows an amber line in the sheet and uploads nothing [05 C] (DOM)
6. CP-PP-06 S-FMT.reading: A file that can't be read shows "Couldn't read the file." with Try another; the uploaded row stays coach-only [05 C] (DOM)
7. CP-PP-07 S-FMT.found: Every found section is outlined in the same frame, no stagger (M-FMT-03) [07] (clip)
8. CP-PP-08 S-FMT.set: Before PM1 `20261102090000_golf_practice_plan_formats` is applied, "Use this format" is inert with "Comes with the Practice tab" and makes no network call [05 C] (DOM)
9. CP-PP-09 S-FMT.see: See Thursday in it pushes with M-ASK-16 and shows Thursday's plan in the set format [07] (clip)
10. CP-PP-10 S-FMT.undone: Undo inside 8s restores "Here's your format" and the previous format; nothing else changes (M-CP-18) [07 C] (unit, clip)
11. CP-PP-11 S-PLY.practice: The Today card shows only the player's group's stops, Now and Next during practice with a fill and ring (no stripe), and "Ended" after [05 C, N-00 4.2] (DOM)
12. CP-PP-12 S-PLY.plan: The player's plan page is the player copy of `PracticePlanSheet` with Share PDF and no link, image, Edit or Seen by; reached from the banner, bell, Home line, chat post and Documents [02 C.7] (DOM)
13. CP-PP-13 S-PLY.docs: A player sees only published plan rows in Documents, in the row's own folder; a draft row is never in the player's payload [02 C.4] (DOM, RLS test)
14. CP-PP-14 One drill bank: a new drill from the builder, Ask or the quick chat inserts into `golf_team_drills` through `createTeamDrill`; a library drill copies with `copyLibraryDrill`; no code path writes `golf_drills` [02 C.1] (unit, grep)
15. CP-PP-15 HM5 `20261101090400_golf_drills_team_bank` appears in no PR body, HELD.md row or migration folder; Ask's `create_drill` registers only when `golf_team_drills` exists [02 C.1] (grep, unit)
16. CP-PP-16 Before 010100 the drill read step says "Reading the drill library" and every New drill is inert with "Drill bank comes with the Practice tab" [02 C.1] (DOM)
17. CP-PP-17 Archiving a team drill hides it from the bank; drafts keep it; published versions keep the frozen card; Restore puts it back [N-00 §10] (unit)
18. CP-PP-18 One folder model: Ask, the builder and the quick chat pass `folder` by name to `savePracticePlanDraft`; no `folder_id`, `parent_id` or `create_folder` exists anywhere [02 C.2] (grep, unit)
19. CP-PP-19 A plan row can sit in any coach folder; Publish keeps the row's folder; the published receipt and the plan page's `?from=docs` back name that folder [02 C.2] (unit, DOM)
20. CP-PP-20 N-10's 090300 plan folder check is not applied until narrowed as 02 C.2 (Nick's call); the PR body lists it as held [02 C.2] (review)
21. CP-PP-21 N-00's `PlanPage.tsx` renders `PracticePlanSheet`; there is one plan body component, used by the plan page, Review, Ask's full plan and print [02 C.3] (grep, shot)
22. CP-PP-22 A saved draft is a Documents row with `practice_plan_id`, `is_public` false and the chip "Draft · Only coaches"; opening it shows the coach draft view with Edit [02 C.4] (DB check, DOM)
23. CP-PP-23 Publish from Ask, the plan page or Review calls `publishPracticePlan({notify: 'defer'})`; no push, bell row or chat post exists at 7.9s; one each at 8.1s; Undo inside the window leaves the plan a draft and tells no one [02 C.5] (unit, fake timers)
24. CP-PP-24 Republish tells only players whose group, stops or times changed; a wording-only change tells no one and toasts "Republished. No one was told."; Take down tells each player who had it once [02 C.5] (unit)
25. CP-PP-25 The quick chat registers no publish tool; editing after publish shows "Edits not published" and tells no one until Republish [02 C.5] (unit, DOM)
26. CP-PP-26 Push type `practice_plan` in the Events category and bell row `event_reminder` with `data.kind` practice_plan both deep-link to `/golf/dashboard/practice/plan/<id>`; the chat post sends no second push [02 C.5, §7.5, §7.6] (unit)
27. CP-PP-27 A plan for a day with no practice event runs the event confirm first; Save is off until the event commits; an all-day or cancelled practice can't take a plan (CH-17110, CH-17117) [02 C.6] (unit, DOM)
28. CP-PP-28 S-PRC.home: Large title under the green bar, This week, Up next, Segmented links, Drafts / Published / Past; restyled per the 05 build rule: no accent left border anywhere, one card style [05 C] (shot)
29. CP-PP-29 S-PRC.home-empty: No practices this week shows CH-17301 with New practice; earlier plans still list [N-00 4.18] (shot)
30. CP-PP-30 S-PRC.home-first-run: With no plan ever, one card offers Blank, a starter and Ask CoachHelm (only with the CoachHelm flag); no empty section headers [05 C] (DOM)
31. CP-PP-31 S-PRC.week: Tiles follow the team-zone week, chips No plan, Draft, Published, Updated, Done; a week across 1 Aug lists both seasons' plans [05 C, 03 C.4] (unit, shot)
32. CP-PP-32 S-PRC.past: Collapsed with its count; 20 at a time; left out when there are none [05 C] (DOM)
33. CP-PP-33 S-PRC.new-pick: Lists practices without a plan; all-day is disabled with CH-17110; a race opens the other coach's plan with its line [N-00 4.3] (DOM)
34. CP-PP-34 S-PRC.copy-past: Copy keeps blocks, stations, drills and groups, drops own-work lines and pairings, keeps only active members; empty shows its line [N-00 4.3] (unit)
35. CP-PP-35 S-PRC.template-pick: None, one and many render (fixtures `empty`, `one`, `many`); starters first [05 C] (shot)
36. CP-PP-36 S-PRC.templates: Gallery with From GolfHelm first; CH-17303 with no templates of the team's [N-00 4.18] (shot)
37. CP-PP-37 S-PRC.template-menu: Use, Duplicate, Rename, Delete (CH-17506); starters only Use and Duplicate; rename refuses a taken name [05 C] (DOM)
38. CP-PP-38 S-PRC.bld-blocks: Step bar, ribbon, mix bar and block cards with + Add block rows between; block cards are one card style with a kind glyph tile, no kind tint fill and no left edge [06 C] (shot)
39. CP-PP-39 S-PRC.bld-add-menu: Five kinds with their descriptions; the block lands at the row tapped (M-PRC-08) [N-00 4.5] (DOM, clip)
40. CP-PP-40 S-PRC.bld-block-sheet: Fields by kind; length 5 to 360 in 5s; Cancel with changes asks to discard [05 C] (DOM)
41. CP-PP-41 S-PRC.bld-block-menu: Duplicate inserts a copy below named with " 2" and moves focus to it; Move up and Move down are the touch alternative to drag [05 C] (DOM)
42. CP-PP-42 S-PRC.bld-delete-undo: Delete runs at once with an 8s Undo toast; Undo restores the block at its index with drills and grid; no CH-17507 dialog [02 C.7] (DOM, clip M-PRC-10, M-PRC-11)
43. CP-PP-43 S-PRC.bld-reorder: Phone long press 450ms lifts to 1.02; desktop grip drag; Alt+Up/Down; times recompute; VoiceOver announces the new time; `commit` on drop [N-00 4.5, 4.9] (DOM, clip)
44. CP-PP-44 S-PRC.bld-rotation: A real table filled by (g + t) mod S, spare cells Open, swap by drag or Space, Reset rotation after an edit [N-00 4.5] (unit, DOM)
45. CP-PP-45 S-PRC.bld-time-sheet: Stepper and edge drag snap to 5 with `select` per step; Shift+Up/Down; Stations change turn minutes [N-00 4.5] (DOM)
46. CP-PP-46 S-PRC.bld-ribbon: Over the end shows CH-17106 in amber with the over segment; Publish still allowed [05 C] (shot `over`)
47. CP-PP-47 S-PRC.bld-move-confirm: Changing the practice time shows CH-17509 for this practice only; players hear only on Republish [N-00 4.17] (DOM)
48. CP-PP-48 S-PRC.bld-save-status: Saving, Saved, Offline (CH-17901, body in `sessionStorage`) and Couldn't save after three failures (CH-17001); leaving with a pending save waits up to 2s; offline edits restore on return [05 C] (unit, DOM)
49. CP-PP-49 S-PRC.bld-stale: A stale save shows CH-17505 with Load latest, and Keep mine on desktop [N-00 §10] (unit)
50. CP-PP-50 S-PRC.bld-groups: Columns A to F with letter discs and tokens from 06 C (D slate, E and F neutral); arrival notes never name a class; problems inline [02 C.7, N-00 4.6] (shot, DOM)
51. CP-PP-51 S-PRC.bld-split-sheet: Split is deterministic per N-00 4.6 and confirms with CH-17508 when groups have players [N-00 4.6] (unit)
52. CP-PP-52 S-PRC.bld-move-player: Drag, keys 1 to 6, or the Move to menu move a player; counts change in place [05 C] (DOM)
53. CP-PP-53 S-PRC.bld-drills: A slot filters the bank to its area; CH-17108 when a drill runs past its turn [N-00 4.7] (DOM)
54. CP-PP-54 S-PRC.drill-bank-sheet: Search with no match shows CH-17304 and New drill prefilled with the text; an empty bank still lists GolfHelm drills [05 C] (DOM)
55. CP-PP-55 S-PRC.drill-new: Save adds the drill to `golf_team_drills` and the slot with CH-17016; before 010100 it is inert; Cancel with typed fields asks to discard [02 C.1] (unit, DOM)
56. CP-PP-56 S-PRC.bld-review: Errors block Publish with "Fix N problems to publish"; the recipient line matches the audience; Share disabled before publish [N-00 4.8] (DOM)
57. CP-PP-57 S-PRC.publish-sheet: Audience line and team chat switch; Publish locks on the first press (one run per key) [05 C] (unit)
58. CP-PP-58 S-PRC.published-toast: "Published · Told after 8s" with Undo counted to the server's `release_at`; Undo gives "Taken back. Nobody was told." [02 C.5] (unit, clip M-PRC-26, M-PRC-27)
59. CP-PP-59 S-PRC.republish-sheet: What changed list and "Only affected players" on by default with its count [N-00 4.11] (DOM)
60. CP-PP-60 S-PRC.takedown: CH-17502 copy with the count; tells once [N-00 4.11] (unit)
61. CP-PP-61 S-PRC.plan: Coach draft, coach published, player and past views; `?from=docs`, `?from=coachhelm&ret=` and `?from=calendar` set the back label [05 C] (DOM)
62. CP-PP-62 S-PRC.seen-sheet: Opened, then Not yet, with times in the team zone [N-00 4.11] (DOM)
63. CP-PP-63 S-PRC.share-menu: Copy link (CH-17018), Share image 1080 × 1350, Print; disabled on a draft; coach only [02 C.7] (DOM)
64. CP-PP-64 S-PRC.link-gate: Signed out: sign in, then back to the plan. Not on the team: redirect to Calendar and no plan data in the response [05 C] (e2e, RLS)
65. CP-PP-65 S-PRC.print: Coach copy, range board, pocket cards, drills appendix and QR print from `@media print` in the sheet's type; a draft prints with "Draft" [N-00 4.14] (shot of the print preview)
66. CP-PP-66 S-PRC.run: Now and Next, Rotate in N min, lit stop with fill and ring, Shift with "Tell players" off by default, rain switch [N-00 4.12] (DOM)
67. CP-PP-67 S-PRC.drills: Search, area chips, Your drills then GolfHelm drills; no match shows CH-17304; a player sees Team drills only [N-00 4.1] (DOM)
68. CP-PP-68 S-PRC.drill: Team: Edit, Archive, Used in N plans. Library: Copy to your bank. Archived: chip and Restore [N-00 4.1] (DOM)
69. CP-PP-69 S-PRC.groups: None, one and many render; avatars up to 8 then "+N" [N-00 4.1] (shot)
70. CP-PP-70 S-PRC.group-sheet: Roster checklist; Delete group (CH-17511) never changes plans that copied it; a taken name CH-17113 [N-00 4.1] (unit)
71. CP-PP-71 S-PRC.ply-home: Today, This week (published only), Past plans, Team drills; CH-17302 with nothing published; CH-17305 with no group [N-00 4.2] (DOM)
72. CP-PP-72 S-PRC.chat-card: After the window one plain text post with the plan link, sent as the coach, with no second push to players who got the plan push [02 §7.6] (unit)
73. CP-PP-73 S-PRC.cal-row: Shows on practice events only: Build plan or Open plan; `?new=1&event=<id>` skips step 1 [N-00 4.17] (DOM)
74. CP-PP-74 S-PRC.home-line: Coach and player Home lines name the plan's state or the player's first stop [N-00 0.1] (DOM)
75. CP-PP-75 S-PRC.link-states: Cold start, deleted, taken down, draft opened by a player and flag off each land as 05 C says, never on a blank page [05 C] (e2e)
76. CP-PP-76 S-PRC.docs-folder: Plan rows sit with files in their folder; before 090200 a folder exists only while a row names it [02 C.2] (DOM)
77. CP-PP-77 S-PRC.docs-plan-card: Draft chip "Draft · Only coaches" for coaches only; Published chip for both; Open goes to the plan page with `?from=docs` [02 C.4] (DOM)
78. CP-PP-78 S-PRC.docs-plan-menu: Open, Print, Move, Pin; no Rename or Delete on a plan row [05 C] (DOM)
79. CP-PP-79 S-PRC.docs-move: Moving a plan between folders tells no one and keeps the plan's state [02 C.2] (unit)
80. CP-PP-80 Every S-PRC.* ID passes the common rows in 05 C (loading, error, offline, role, long text, many, one, XXL, dark, Reduce Motion, keyboard, VoiceOver, 390, 430, 1280, flag off, pull to refresh, scroll restore, haptics) [05 C] (shot, DOM)
81. CP-PP-81 With `golf_practice_plans` off every Practice route redirects to Calendar, the tab is gone, and push or bell links redirect; with `coachhelm_practice_plans_v1` off no CoachHelm plan entry renders anywhere [02 C.8] (DOM, e2e)
82. CP-PP-82 Both flags ship off in every environment, overriding N-00's and N-10's `preview: true, development: true` (SHARED-8) [02 C.9] (review of flag files)
83. CP-PP-83 Contrast for every new pair in 06 C is at least 4.5:1 for text and 3:1 for marks in both themes, target 4.9 (SHARED-3) [06 C] (script)
84. CP-PP-84 Times on every S-PRC.* screen are in the team zone, a practice across a daylight saving change reads correctly, and seasons turn over on 1 Aug [03 C.4] (unit)

Per PR: CP-PP-01 to 04 with PP8; CP-PP-05 to 10 with PP7; CP-PP-11 to 13 with PP9; CP-PP-14 to 17 with PP1 and PP3; CP-PP-18 to 27 with PP4 and PP5; CP-PP-28 to 79 are checked in N-00's slices 1 to 5 and N-10's slice 4 against the restyle (the lane reviews them before PP4); CP-PP-80 to 84 in every PR.

## Wiring, 4 Nov 2026

Each check is pass or fail, against the Wiring section of 06. (unit) server or data test, (DOM) unit-dom, (db) pgTAP or a SELECT on a local stack with the held files applied.

1. W-PP-1 With `coachhelm_practice_plans_v1` off, `buildCoachTools` returns today's keys (17 reads, `show_visual`, four writes) and no surface changes; both flags are absent from `config/feature-flags.yml` today and read false [S-ASK.*, S-ASKD.*] (unit)
2. W-PP-2 The four new reads are coach-only, team-scoped, use the app's putting bands and Tour values, and count attendance as 03 §6; none writes [S-ASK.steps, .read-pictures] (unit)
3. W-PP-3 `draft_practice_plan`, `ask_practice_brief` and `suggestForBuilder` make no insert, update, delete or rpc (throwing spy); `publish_practice_plan` is in `CONFIRM_REQUIRED_TOOLS` and `publish_` is a mutation prefix [S-ASK.plan-card, .intake, S-BLD.ghosts] (unit)
4. W-PP-4 A plan for a day with no practice event cannot be saved until the event confirm commits `createGolfEvent`; an all-day or cancelled practice is refused [S-ASK.save-to, S-ASK.saved] (unit)
5. W-PP-5 Save draft calls `golf_practice_plan_save(p_event_id, p_plan_id, p_expected_version, p_title, p_step, p_body)` with `draft.body` only, then `golf_practice_plan_file_draft`; the Documents row has `is_public false`, `file_url null`, the chosen folder; nothing is sent [S-ASK.saved, S-DOC.list-draft] (unit, db)
6. W-PP-6 A player gets no draft row from `getDocuments` and no row from `golf_practice_plans` (RLS) [S-DOC.list-draft, S-PLY.docs] (db)
7. W-PP-7 Undo of a first save deletes the plan and its row by cascade; Undo of a re-save restores the previous body and folder; Undo after 10s is refused [S-ASK.undone] (unit, db)
8. W-PP-8 New drill from any surface lands in `golf_team_drills` through `createTeamDrill` (a library pick through `copyLibraryDrill`); nothing writes `golf_drills`; before 010100 New drill is inert [S-ASK.swap, S-PRC.drill-new] (unit)
9. W-PP-9 Publish runs `publishPracticePlan({notify: 'defer'})`; the row becomes `is_public true` and keeps its folder; at 7.9s there is no bell row, push or chat post; at 8.1s exactly one batch; `after()`, `onExpire` and the sweep racing give one batch [S-ASK.publish-confirm, .published, S-ASKD.publish, S-DOC.list-shared] (unit)
10. W-PP-10 Undo at 7.9s calls `golf_practice_plan_take_down` with no send: status `draft`, row `is_public false`, nobody told; at 8.1s it is refused [S-ASK.published] (unit)
11. W-PP-11 The push is type `practice_plan`, gated by `push_events` and Quiet mode through `pushDeliveryKeyFor`, opens `/golf/dashboard/practice/plan/<id>`; the bell row is `event_reminder` with `data.kind 'practice_plan'` and files under Events; one call per distinct body [S-PLY.notify] (unit)
12. W-PP-12 The team chat post goes through `sendMessage({..., createNotifications: false})` to the team channel, so no second push; with no channel or the coach not in it the switch is off [S-PRC.chat-card, S-ASK.publish-confirm] (unit)
13. W-PP-13 The live version body, the player plan payload and the player PDF hold no `why`, `coach_why`, `aim` or `because` key, no other group's stops and none of the fixture's read figures (-0.9, 71, 412, 0.8) [S-PLY.*, S-DOC.sheet-player, S-DOC.print-player] (unit, db)
14. W-PP-14 Players get Share PDF of their own copy only: no link, no image, no stored coach-copy file [S-ASK.share-pdf, S-PLY.plan] (DOM)
15. W-PP-15 `20261102090000_golf_practice_plan_formats.sql` and `20261104090000_golf_practice_plan_coach_why_and_draft_row.sql` are in `supabase/migrations/` with a HOLD row in `HELD.md`, and are not applied; every `-- VERIFY:` fails before and passes after on a local stack [S-FMT.set, S-ASK.saved] (db)
16. W-PP-16 Use this format with the table missing (42P01) reads "Comes with the Practice tab", and the upload still works [S-FMT.set] (unit)
17. W-PP-17 No read in this lane changes what shot tracking collects, stores or sends: no write to `golf_rounds`, `golf_holes`, `golf_shots` (grep and spy) [all] (unit)
18. W-PP-18 Save draft on a published plan whose title and focus changed leaves its Documents row's title, description and `updated_at` as published (folder may move); a player sees the new ones only after Republish (fixed 4 Nov review) [S-ASK.save-to, .saved, S-DOC.sheet-player] (unit + pgTAP)
