# 08. CoachHelm read: acceptance

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 27 rows).
> Wiring, 4 Nov 2026: see the section of that name at the end of this file.

Design page: https://claude.ai/artifact/SUL5hLtah5MmBd2dkU8mTK (version 5, 3 Nov; local `redesign/coachhelm-read.html`). Flag: `coachhelm_read_v1`, off everywhere. Prep only: draft PRs, nothing merged, deployed, flipped or migrated.

Three parts, in the shape `BUILD_CONTRACT_STANDARD.md` sets for 08: Part 1 is pass/fail criteria per screen ID in `05-SCREENS.md`, Part 2 is what each PR (CR0 to CR6) must pass, Part 3 is how to prove the build matches the design.

How to read a criterion:
- Each one is checkable on a screenshot, in a DOM or unit test, or in a clip. The bracket says where the value comes from.
- Values come from 06 (per-screen specs), motion from 07 (`M-READ-nn`), data from 03, wiring from 02. Where 06 and 04 differ, 06 wins; 06 §14 lists the three corrections.
- "Design" gives the anchor to paste after the design page URL. "Capture" gives the `capture.mjs --state` name from 05's capture table.
- Shared criteria are referenced, never restated, by their number in `ACCEPTANCE-SHARED.md` (`00-shared/` in the zip): SHARED-1 green bar, 2 flat page and 16px lip, 3 no accent left borders, 4 contrast, tabular figures and "—", 5 XXL unclipped, 6 Reduce Motion and honest motion, 7 phone edge 16/20, 8 draft PRs behind a flag, 9 no deploy, flip or migration, 10 shot tracking unchanged, 11 players never see teammates' figures, 12 side-by-side match.
- Reduce Motion on this lane is an opacity crossfade of `CH_FADE_MS` from `lib/motion.ts` (180ms today), the package rule in SHARED-6. It applies to every M-READ row below.
- k is the Text Size factor (`--ch-type-scale`, 1 at default, 1.353 at XXL from `lib/dynamic-type.ts` MAX_SCALE; SHARED-5 rounds it to 1.36).

## Part 1. Criteria per screen ID

### S-DIVE.why (today's Deep dive Why section; fix only)
Design: not drawn. App: `/clubhouse-preview/coachhelm-views?view=deep-dive&state=engine&q=in-slope`, player viewer.
1. For a player viewer on a `hypothesis` cause, `diagnosisFor` (`data/coachhelm-dive-shape.ts`) returns zero drivers. The Why section shows "Not traced yet" and no arm count or percentage. DOM test. [02 §14]
2. For a coach viewer, `diagnosisFor` output deep-equals main at 75b4956 for every existing fixture. Unit test. [02 §14]
3. Nothing else on today's Deep dive changes: a screenshot at 390 light equals main pixel for pixel outside the Why section. [01]

### S-READ-BOARD (summary card on a host board)
Design: `#board-approach-coach-phone-light-shot` (also `-penalties-`, `-putts-`, `-player-`, `-dark`, `-xxl`, `-w430`). Capture: `default`, `penalties`, `putts`, `player`, `player-penalties`, `player-putts`, `w430`, `xxl`.
1. One card on `--ch-feature-bg`: radius 16, padding 18/16/16, flat fill with no radial light (fixed 4 Nov: SHARED-2; was "radial light top right at 7% white"), shadow 0 10 24 −14 at 55% deep green. [06 §2]
2. Rows top to bottom:
   - "{first} · {area}" (coach) or "{area}" (player) with the stance chip
   - headline 23 × k / 1.18 / 600, −0.018em
   - lede 15 × k / 1.42 in `--ch-feature-ink-2`
   - hero number 44 / 0.9 / 500, wdth 92, −0.04em, on one line; the note sits beside it, or under it when less than 150pt fits
   - ladder, cause line with tier chip, worth line
   - footer 13.5 × k / 1.3 with count, rounds, firmness and "Through Oct 24"
   - "Open the read" row with chevron. [06 §2]
3. Worth line reads "Worth about 0.6 a round, closed to the team average" plus "estimated". With no stored anchor it reads "Worth about 0.3 strokes a round". With no strokes estimate the line is absent from the DOM. [06 §2; 03]
4. Coach tier text is one of Counted, Likely, Not traced. Player text is one of Seen in your shots, Where, Not traced, and a player's likely line carries no count. DOM test per viewer. [02 §6.1]
5. The whole card is one tab stop, `role="link"`, and opens on Enter and Space. `variant="sheet"` has no Open row and no press. [02 §6.1, §6.3]
6. Contrast on the feature card, light / dark: ink 11.30 / 10.78, secondary 8.84 / 8.44, stance chip 5.61 / 5.35, counted chip 5.64 / 5.38, tier chip 8.09 / 7.71. `capture/contrast.py` output equals `capture/contrast-table.txt`. [06 §2; SHARED-4]
7. `toChReadSummary` and `toChReadDetail` return the same title, value, ladder and worth for the same row. Unit test. [02 §6.3]
8. The card holds no write. Any write sits in `S-READ-BOARD.actions`. [02 §6.1]
9. Motion: press M-READ-01; ladder band M-READ-07 once on first view; tap opens `S-READ` with M-READ-02. [07]

### S-READ-BOARD.actions (row under the card, coach only)
Design: `#board-approach-coach-phone-light-shot`, row under the card. Capture: `default`.
1. Row 12 under the card, gap 10. Assign as focus: flex 1, min-height 46, padding 0 16, radius 13, label 15.5 × k / 600. More: hugs its label, same height and radius, inset 1px `--ch-separator` ring. [06 §2]
2. Contrast: Assign label on accent 7.29 / 9.44; More label on page 8.15 / 8.45. [06 §2]
3. Absent from the player DOM, not hidden. DOM test as a demo player. [SHARED-11]
4. Assign calls `useFocusActions(writes).assign.run(target)` with the same args `FocusActions` sends today. Spy test. [02 §4.6]
5. Assign runs M-READ-08 while the write runs, then M-READ-09 and M-READ-10 on success. More opens `S-READ.more` (M-READ-11). [07]

### S-READ-BOARD.dismissed
Design: `#board-approach-coach-phone-light-dismissed-shot`. App: `?screen=board&state=dismissed` (added by CR4).
1. Card and row are replaced by the notice: "Insight dismissed. It no longer shows on your board or on {first}'s. Undo brings it back." Archive icon 16 in secondary, Undo as a ghost button 36 tall, radius 10, hit area 4 above and below. CH-13901. [06 §2, §12]
2. Out M-READ-15, Undo M-READ-16. Heights snap. [07]
3. Coach only. A player never reaches this state. [05]

### S-READ-BOARD.loading
Design: `#board-approach-coach-phone-light-loading-shot`. Capture: `loading` with `--id S-READ-BOARD`.
1. Feature outline 330 tall, radius 16, on `--ch-feature-bg`; action outline 46 tall, radius 13, on `--ch-well-bg-flat`. Coach only for the action outline. [06 §2]
2. Pulse M-READ-20 (1.6s, opacity 1 → .55 → 1); stops under Reduce Motion. Content arrives with M-READ-21. [07]
3. Only the card and its row belong to this lane. The host's own list loads as it does today. [05]

### S-READ (pushed read page and its green bar, phone)
Design: `#read-approach-coach-phone-light-shot` (also `-dark`, `-xxl`, `-w430`, `-reduce`, other reads and viewers). Capture: `default`, `player`, `w430`, `xxl`, `reduce`.
1. Bar: 44 status band plus 48 bar on `--ch-frame` (SHARED-1). Back label 17 × k / 400 in `--champ` (8.13 / 10.89), the player's first name for a coach and "CoachHelm" for a player. Title 17 × k / 600 in `--nav-ink` (12.03 / 16.12), one line, the area name. ⋯ button 44 × 44. [06 §3]
2. Lip under the bar is today's 16pt (SHARED-2; the page draws 18, listed in 06 §14).
3. Card order: `S-READ.head`, `.where`, `.why`, `.sure`, `.moved`, `.rounds`, `.do`. DOM order test. [06 §3]
4. Sheet gap 20, padding 6/16/60 (20 sides at 430, SHARED-7). Card radius 16, 1px `--ch-card-ring` plus shadow. Header padding 16/16/12, title 17 × k / 1.3 / 600, meta 14 × k / 1.3. Body padding 0/16/16. [06 §3]
5. Exactly one `.ch-hr-feat` in the DOM. Instrument Sans only; no element uses `SerifText`. Tabular figures on every number. [06 §0; SHARED-4]
6. A card whose data is absent is not in the DOM: no empty card, no zero, no "—" card. Absent-card test per card. [02 §4]
7. Rows are at least 52 tall, padding 10/16, hairline inset 16. Every control has a 44 hit area, or 36 visible with 4 above and below where 06 says so. [06 §3, §12]
8. Contrast on card, light / dark: body 17.08 / 14.34, secondary 9.77 / 10.25, tertiary and chevrons 6.61 / 6.99, secondary on well 8.96 / 10.87, tertiary on page 5.85 / 7.80, loss figures 5.57 / 8.53, gain figures 7.42 / 8.45, accent links 8.15 / 8.45. Marks on track at least 3:1: loss 3.15 / 5.52, neutral 4.49 / 4.86, gain 5.15 / 4.50. [06 §0; SHARED-4]
9. No rendered sentence contains he, she, him, her or his. Unit test over all three fixture players. [02 §3.11]
10. Every figure maps to a row in `03-DATA-CHECKS.md`. A figure with no stored source is absent. [01; SHARED-11]
11. Back pops with M-READ-03. Scrolling past 8px shows today's shade under the bar (M-READ-24). Nothing else in the bar moves. [07]
12. XXL: every card grows, nothing clips at 390, ladder labels drop under the track. [SHARED-5]

### S-READ.head (feature card at the top of the read)
Design: `#read-approach-coach-phone-light-shot`, top card. Capture: `default`, `player`.
1. Same box, type and contrast as S-READ-BOARD 1, 2 and 6, without the Open row and without the cause line. [06 §4]
2. Ladder is an SVG in the DOM (no chart library): track x 14 to 286, band at 55% opacity, ticks y 24 to 42 in ink-2, labels at y 58 as text 12.5 × min(k, 1.2) with the value on a second line at 1.15em, "you" label at y 14. [06 §4]
3. Player sees "You" on the ladder and no cause line. [05]
4. M-READ-07 draws the band once on first view; it never redraws on refresh or theme change. [07]

### S-READ.nopool (ladder without the team pool)
Design: `#read-approach-coach-phone-light-nopool-shot`. App: `&state=teampooloff`. Capture: `nopool`.
1. The "Team pool" tick draws only when the read's `comparison.lines` holds a `team_pool` line and `READ_CALLS.teamPoolOnLadder` allows it. Otherwise the ladder shows the player and the Tour only. [02 §14 item 5]
2. "Team pool" and "team average" never appear in one card unless the worth anchor is the team average. [04 §5]
3. Team pool note shows counts only ("164 approaches · 8 teammates"). No teammate name, id or figure is in the DOM or the payload. Payload test as a demo player. [06 §4; SHARED-11]

### S-READ.stale (out of date)
Design: `#read-approach-coach-phone-light-stale-shot`, gallery `#state-out-of-date`. App: `&state=stale`. Capture: `stale`.
1. Stance chip reads "Out of date". Title and hero turn `--ch-feature-ink-2`. The CH-13903 sentence sits under the lede: margin-top 12, padding-top 12, hairline at 14% parchment. [06 §4]
2. No Assign anywhere on the page; the What to do card shows the CH-13906 notice in its place. [06 §10]
3. Both viewers. [05]

### S-READ.where (Where it shows up)
Design: `#where-approach-coach-phone-light-shot`. Capture: `default`, `player`.
1. Header badge "Observed, not a cause". One step per stored narrowing step: label 15 × k / 1.25 / 500, count right in 600 on one line, bar 12 tall, radius 6, on `--ch-chart-track`, note 14 × k / 1.35 under it. [06 §5]
2. Bar length is that step's count over the first step's (`n / steps[0].n`). The last step with a bar uses the loss fill; earlier steps use the flat fill. DOM test. [06 §5]
3. The miss shape is a words-only last row ("Miss shape · 9 of 12 short, 8 of 11 right"). There is never a fourth bar. [02 §14 item 1]
4. A step whose count did not parse shows its statement and no bar (`funnelunparsed`). A stopped narrowing ends on the last passed step with "Not narrowed further: …" (`funnelstopped`). [02 §4.1]
5. Footer "Each step only shows when its count clears the engine's floor." plus how many passed, only when `stopped_at` is null. [06 §5]
6. No narrowing stored (`nofunnel`): the card is absent. A player sees it while `READ_CALLS.playerFunnel` is true. [02 §3.6]
7. Bars draw with M-READ-04, once per mount at 35% visible; scrolling away and back does not restart them. Nothing in the card reacts to a tap. [07]

### S-READ.why (Why CoachHelm thinks so)
Design: `#why-approach-coach-phone-light-shot`, `#why-penalties-coach-phone-light-shot`. Capture: `default`, `penalties`, `player`, `player-penalties`.
1. Stepper of three for a coach, two for a player ("Not traced yet", "Seen in your shots"). Segments 6 tall, gap 4, labels under. [06 §6]
2. Likely, coach (approach): two dot rows, 14 dots, gap 5, misses filled amber, "{failures} of {n} missed · {pct}%". Verdict box shows the slice alone ("Misses gather on long par 4s · 12 of 16"), never a miss shape. Chip "Likely". [06 §6]
3. Likely, player: verdict box "Not traced yet." with the observed sentence. The payload has no `arms`, `verdict`, `range` or `rung` key (`JSON.stringify` test). [02 §3.5; SHARED-11]
4. Counted (penalties): path nodes 38 joined by 2pt lines, hit node amber, ring contrast 5.12 / 6.65, up to 5 hole chips. Line "On average a penalty hole cost about 1.4 strokes (across 14)": absolute value, one decimal, "cost" only when negative, absent when null, not attached to the path. Chip "Counted". [06 §6; 02 §14 item 4]
5. Path icons come from the fixed map (driver, iron, wedge, water, OB, bunker, green). Any other word draws a plain dot. [06 §6]
6. Hole chips: min-height 36 built with a hit area 4 above and below; each opens that round's review at that hole with M-READ-26. [06 §6; 07]
7. Missed dots draw with M-READ-05, path nodes and connectors with M-READ-06, both once. [07]
8. Shot records not read (`loadfailed`): "Shot records could not be read this run". Legacy row with no engine cause (`legacy`): today's drivers list in this card's markup. Eli as likely (`eli-likely`) draws the likely layout for penalties. [02 §4.2]

### S-READ.countdown (Why, not traced yet)
Design: `#why-putts-coach-phone-light-shot`, gallery `#state-not-enough-yet-count-down`. Capture: `putts`, `player-putts`.
1. Ten segments 10 tall. "6 of the 10 missed downhill putts it needs, over 3 rounds", then "Nothing new is asked. It fills as Jonah plays." (player: "It fills as you play."). [06 §6]
2. No arm counts, no verdict, no Assign target that implies a cause. [02 §14]

### S-READ.gap (Why, a shot tag too thin to trace)
Design: gallery `#state-not-traced-a-shot-tag-is-thin-data-gap`. App: `&state=gap` (added by CR2). Capture: `gap`.
1. Have 4, still needed 10: a ring 54 across, 6pt stroke, 4 of 14 filled in green on the sunk track from the top, beside "Approach miss direction" and "4 tagged, 10 more to go. Tag it when you enter the round. Nothing else changes." [06 §6; 04 §6]
2. Shown only for reads with a shot path to trace. Nothing in the state asks for a new field or changes what shot tracking collects. [SHARED-10]

### S-READ.sure (How sure)
Design: `#sure-approach-coach-phone-light-shot`. Capture: `default`, `player`.
1. Header word 20 × k / 1.1 / 600 ("Solid read", "Fair read", "Thin read"). Three bars 8 tall, radius 4, 12 apart: Sample, Recent, Shot record, each with its count right-aligned in words. Fill contrast 5.15 / 4.50. [06 §7]
2. Coach Sample reads "28 of the 30 approaches it needs". Player Sample reads "28 approaches", no target. [02 §14 item 2]
3. Recent ("Most rounds in the last 45 days") is in the DOM only when `confidence_factors.factors_measured` is true; otherwise the row is absent, never derived from round dates. [02 §14 item 3]
4. Shot record reads "26 of 28 holes. Miss direction is thin". Checked list follows with ticks 16 × 16 in `--ch-gain`. [06 §7]
5. Rung and range sit in a well with a "Coach only" chip (8.96 / 10.87), coach only, absent from the player DOM and payload. [06 §7; SHARED-11]

### S-READ.sure.corrections (answer row at the foot of How sure)
Design: `#sure-approach-coach-phone-light-shot`. Capture: `default`, `player`.
1. In the DOM only when `coachhelm_corrections_v1` is on. Top hairline, padding-top 12, prompt 14 × k / 500 in secondary. [06 §7]
2. Coach chips: Not this, Wrong cause, Already on it, Show later, Good read. Player chips: Not this, Good read. DOM test per viewer. [05]
3. Chips 36 tall with a hit area 4 above and below, padding 0 12, radius 999, gap 6, 14 × k / 500. Selected chip: accent on 12% accent, 45% accent ring, 6.73 / 6.68. [06 §7]
4. Press M-READ-01. [07]

### S-READ.sure.reasons (Not this, opened)
Design: `#sure-approach-coach-phone-light-notthis-shot`. App: `&state=notthis` (added by CR2). Capture: `notthis`.
1. Reasons panel on the well, padding 10, radius 12, gap 6: It's wrong, Not important, Already known, No reason. Chips on `--ch-card-bg`. [06 §7]
2. Opens with M-READ-17 (180ms fade, height snaps). A second tap on Not this closes it at once. [07]

### S-READ.sure.answered
Design: `#sure-approach-coach-phone-light-answered-shot`. App: `&state=answered` (added by CR2). Capture: `answered`.
1. Answer line "Your answer: Not this, it's wrong." in secondary, 14.5 × k / 1.35, with Change in accent (36 plus 4 hit area). [06 §7]
2. Chips swap to the line with M-READ-18. Change brings the chips back with the answer selected. [07]
3. The write goes through today's corrections write with the same args. Spy test. [02]

### S-READ.sure.answerfail
Design: `#sure-approach-coach-phone-light-answerfail-shot`. App: `&state=answerfail` (added by CR2). Capture: `answerfail`.
1. Notice "That answer didn't save. Try again." with Try again (36 plus 4), CH-13971. Notice text 15.66 / 15.20 on the well. [06 §7, §12]
2. Chips stay as they were. Try again re-sends the same answer once. [05]

### S-READ.moved (How it has moved)
Design: `#moved-approach-coach-phone-light-shot`. Capture: `default`, `penalties`.
1. Header meta "Last change". Slope chart from the stored from and to values only, labelled "Before" and "Now", no dates: points at x 40 and 260, Tour dash 1.2 wide from x 30 to 270, start dot r 5 with a 2.5 ring, end dot r 6. Max width 300 on desktop. [06 §8]
2. Change sentence margin 6, 15 × k / 1.35 / 500, in loss or gain ink. Trend chip "Approach strokes gained −0.42 a round · Slipping" with no break after the dot. Penalties uses its own category theme. [06 §8; 02 §14]
3. The player sees the same card for their own trend only. [05; SHARED-11]
4. Themes failed (`themesfailed`): the notice sits inside this card. [02 §4.4]

### S-READ.moved.notrend
Design: `#moved-approach-coach-phone-light-notrend-shot`. App: `&state=notrend` (added by CR2). Capture: `notrend`.
1. "No trend yet" in CH-13383 wording, no chart, no zero. [06 §8]

### S-READ.rounds and S-READ.rounds-all
Design: `#rounds-approach-coach-phone-light-shot`, `#rounds-approach-coach-phone-light-allrounds-shot`. App: `&state=allrounds` (added by CR2). Capture: `default`, `allrounds`.
1. Up to 4 rows, then "Show all 9", or "Show newest 8 of N" when more than 8 rounds back the read. Row: date and course, a subline with a dot per counted hole (at most 5) and "{n} counted holes" (or "Counted in the read"), score and to par, chevron. [06 §9; 02 §14 item 6]
2. Show all expands in place to the stored rounds (8 at most), "Show fewer" folds it, with no navigation and no history entry (M-READ-19, heights snap). [07]
3. A round row opens that round's review with M-READ-26. [07]
4. Loss dot on card 3.92 / 7.12 (non-text, at least 3:1). [06 §9; SHARED-4]

### S-READ.partfail (one part failed)
Design: `#read-approach-coach-phone-light-partfail-shot`, gallery `#state-didn-t-load-one-part`. App: `&state=roundsfailed`. Capture: `partfail`.
1. Banner under the headline: "Part of this read didn't load. The rounds behind it are missing. Everything else is here." CH-13208. [06 §12]
2. The Rounds card shows "The rounds behind this read didn't load" inside it (CH-13281). Every other card renders. [02 §4.5]
3. Two or more failed parts are said once under the headline with one Try again. [02 §7.5]

### S-READ.do (What to do)
Design: `#do-approach-coach-phone-light-shot`, `#do-approach-player-phone-light-shot`. Capture: `default`, `player`.
1. Drill tile: icon well 40, radius 12, icon 20 in `--ch-gain` on 13% gain; title 16 × k / 1.3 / 600; meta 14 × k; body 15 × k / 1.45. No drill (`nodrill`): "No drill assigned." [06 §10]
2. Two target tiles 8 apart, radius 12, well: label 13 × k (8.96 / 10.87), value 17 × k / 600 tabular (15.66 / 15.20). No strokes estimate (`nostrokes`) removes the Worth tile. [06 §10]
3. Plan line 12 under the tiles, or "Not part of a focus area or goal yet." (player adds "Your coach can make it one."). Plans failed (`plansfailed`): the notice in this card. [02 §4.6]
4. Coach: Assign as focus (46 tall, radius 13, label 7.29 / 9.44) and More, as `S-READ-BOARD.actions`. Player: no Assign and no More in the card's DOM. [06 §10; SHARED-11]
5. Link chips (built 36 tall with a 4pt hit extension, accent on well 7.48 / 8.96): "Message {first}", coach only, opens today's compose to that player with no prefill (06 §14). "Ask CoachHelm about this" is absent while `askAboutReadHref` does not exist. "Add to practice plan" is absent while `practiceHref` is null. [02 §4.6, §4.7]
6. `assignStateOf` renders the same branch as `FocusActions` for dismissed, note (CH-13904), assigned, proposed, unknown, stale, declined. Unit test per branch. [02 §4.6]
7. Duplicate (`duplicate`) shows Assigned with today's toast. Verdict variant (`verdict`) matches its preview fixture. [02 §4.6]

### S-READ.assigning
Design: `#do-approach-coach-phone-light-assigning-shot`. App: `&state=assigning` (added by CR2). Capture: `assigning`.
1. Button keeps its size; spinner 18 × 18, 2pt border, right side clear, plus "Assigning…" (CH-13403 wording). Button is disabled. [06 §10]
2. Spinner turns once per 700ms, linear (M-READ-08). Under Reduce Motion the ring stays still beside "Assigning…" (loops stop). [07]
3. A failed write (`failwrites` during the write) stops the spinner and returns the button with the CH-13001 notice; no tick, no ring, no haptic (07 interrupt case 8).

### S-READ.assigned
Design: `#assigned-approach-coach-phone-light-shot`. App: `&state=assigned`. Capture: `assigned`.
1. Chip "Assigned as Priya's focus": flex 1, min-height 46, radius 13, `--ch-gain` on 12% gain (6.16 / 6.68), tick 20 × 20 stroke 2.2. [06 §10]
2. Stance chip reads Assigned. Both target tiles unchanged. No verdict and no target added. Plan line "Focus area · Active · from this read." [06 §10]
3. Tick draws with M-READ-09 (stroke 24 → 0, 360ms) and the success haptic; the card rings once with M-READ-10. Neither runs again on refresh. [07]

### S-READ.proposed
Design: `#do-approach-coach-phone-light-proposed-shot`. App: `&state=proposed`. Capture: `proposed`.
1. Assigned chip plus, 10 under it, "{first} sees it as a proposal and accepts it to start." (CH-13601) in secondary 14 × k / 1.4. Coach only. [06 §10]

### S-READ.declined
Design: `#do-approach-coach-phone-light-declined-shot`. App: `&state=declined`. Capture: `declined`.
1. Notice where the button was: "{first} declined this as a focus. Propose again sends it back as a new proposal." (CH-13907) with Propose again at 46. Coach only. [06 §10, §12]

### S-READ.noassign
Design: `#do-approach-coach-phone-light-noassign-shot`. App: `&state=failwrites`. Capture: `noassign`.
1. CH-13207 notice where the button was. Dismiss in More still works. Coach only. [06 §10]

### S-READ.dismissed
Design: `#read-approach-coach-phone-light-dismissed-shot`. App: `&state=dismissed` (added by CR2). Capture: `dismissed`.
1. Notice at the top of the page with Undo (CH-13901). Stance chip reads Dismissed. Coach only. [05; 06 §12]
2. Dismiss fires the warning haptic, then M-READ-15. Undo runs M-READ-16. Dismiss again only after it settles (07 interrupt case 4).

### S-READ.more (phone action sheet)
Design: `#read-approach-coach-phone-light-more-shot`, `#read-approach-player-phone-light-more-shot`, `-xxl-more`, `-w430-more`. App: `&state=more` (added by CR2). Capture: `more`, `player-more`, `xxl-more`, `w430-more`.
1. Dim black 40% over the screen; a tap on it closes. Sheet 8 from left, right and bottom on every width; groups radius 14 on 94% card with 20px blur, 8 apart. [06 §11]
2. Title row padding 13/16, the read's title, 13 × k / 1.35 in secondary (9.77 / 10.25), two lines then ellipsis. [06 §11]
3. Coach rows, 57 tall with a top hairline, 19 × k / 1.2: Dismiss this read in `--ch-flag` (6.48 / 7.06), Message {first}, Ask CoachHelm about this, Copy a link to this read in accent (8.15 / 8.45). The Ask row is absent while `askAboutReadHref` does not exist (fixed 4 Nov). Player rows: Ask and Copy only; Dismiss and Message are absent from the DOM. Cancel in its own group, 19 × k / 600. [06 §11; SHARED-11]
4. Ask is absent from the sheet while `askAboutReadHref` does not exist (same rule as the Do card). [02 §4.7]
5. At XXL rows grow from 57 and nothing clips. [SHARED-5]
6. Opens with M-READ-11 (dim 260ms, sheet 462ms spring). Closes with M-READ-12; the next state draws 470ms after Cancel, 300ms after an action. Tap the dim mid-open and the sheet lowers from where it is (07 interrupt case 3). Reduce Motion: `CH_FADE_MS` fade in and out, no travel. [07]
7. Focus moves into the sheet on open and back to ⋯ on close; Esc closes it on a keyboard. [06 §11]

### S-READ.copied
Design: not drawn. Build rule: today's Clubhouse toast "Link copied" for 2.4s (M-READ-25).
1. Copies the read's link (`readHref` with the flag's on value). Clipboard spy test.

### S-READ.cleared, .contradicted, .underreview (gallery states)
Design: gallery `#state-cleared`, `#state-contradicted-coach-only-for-a-day`, `#state-under-review`. App: `&state=cleared|contradicted|underreview`. Capture: `cleared`, `contradicted`, `underreview`.
1. Cleared: "Cleared {date}" with the recheck's numbers and no actions. [02 §7.5]
2. Contradicted: shown to a coach at once and to a player only after a day. Unit test on the clock. [02 §7.5]
3. Under review: a chip on the headline after a coach marks Wrong cause. [02 §7.5]

### S-READ.loading, .failed, .gone (whole page)
Design: `#read-approach-coach-phone-light-loading-shot`, `#read-penalties-coach-phone-light-failed-shot`, `#read-approach-coach-phone-light-gone-shot`. Capture: `loading`, `failed`, `gone`.
1. Loading: outlines at final heights in final order (feature 360, then 250, 270, 240), radius 16. Pulse M-READ-20, content in with M-READ-21; no staggered card entrance. [06 §12; 07]
2. Failed: one error card, "This read didn't load" / "Nothing was lost. Check the connection and try again.", Try again primary 46, code line CH-13866 (fixed 4 Nov wiring: was CH-13860, taken in the catalog) in mono tertiary (6.61 / 6.99). [06 §12]
3. Gone: "This read is no longer open" / "It was cleared or dismissed after this link was made. {first}'s open reads are on the board." (player: "Your open reads are on your CoachHelm."), Back ghost 46 to the player or to CoachHelm, CH-13861. [06 §12]
4. New codes stay inside CH-13861 to CH-13869 (fixed 4 Nov wiring: CH-13860 is taken; the failed card is CH-13866). [02 §3.10]
5. `notonteam` (CH-13311), `scopefailed` (CH-13209) and `off` render the same screens as today's `CoachPlayerPage`. [02 §3.3]

### S-READ.long
Design: `#read-putts-coach-phone-light-long-shot`. Capture: `long`.
1. The longest real name and a long title wrap in titles and never truncate. Only the bar title ends in an ellipsis, and only where it would meet the back label. [06 §3; SHARED-5]

### Pictures off (`words`)
App only. Capture: `words`.
1. With `READ_CALLS.pictures` false, no `svg` under `.ch-hr-*`, and every figure is still present as text. [02 §3.6]

### Flag off
1. Every read link opens today's Deep dive address byte for byte. Board, Deep dive and Standing screenshots equal main at 75b4956. [02 §13; SHARED-8]

### S-READ-DESK (desktop, three columns)
Design: `#read-approach-coach-desk-light-shot` (1440 × 900). Capture: `desk`, `desk-player`, `desk-penalties`, `desk-putts`, `desk-loading`, `desk-failed`, `desk-gone`, `desk-partfail`, `desk-long`, `desk-1280`.
1. Today's sidebar 232 and glass bar 58 unchanged (SHARED-1). Body grid 250 / minmax(0, 1fr) / 320, gap 20, padding 22/24. Each column scrolls on its own; cards keep their natural height. [06 §13]
2. Middle: headline, Where, Why, What to do. Right: How sure, How it has moved, Rounds. Ladder at most 340 wide, slope at most 300. [06 §13]
3. Breakpoints: three columns from 1180; 821 to 1179 the right column moves under the middle; 820 and below is the phone layout. No horizontal scroll at 1280 or 1024. [06 §13]
4. Crumbs "CoachHelm › Priya Natarajan › Approach" (coach), "CoachHelm › Approach" (player), 14.5 / 500, current crumb 600 primary. Bar buttons padding 8/12, radius 10, well: Ask about this read (absent while `askAboutReadHref` does not exist; fixed 4 Nov), Message {first} (coach only), ⋯. [06 §13]
5. Loading: the rail stays and the middle and right columns show outlines. Failed and gone: one card in the middle column, right column empty. Part failed: banner at the top of the middle column. [05]
6. Long: crumbs and rail rows wrap; the glass bar stays 58 with the crumb truncating first. [05]

### S-READ-DESK.rail
Design: `#read-approach-coach-desk-light-shot`, left column.
1. Reads grouped Off the tee, Approach, Around the green, Putting, Course and scoring; empty groups hidden. Group heads 13.5 / 600 secondary. Rows 14.5 / 500 with subline 13 and value 14 / 600 tabular; 9 × 9 stance dot. [06 §13]
2. Open row on 9% accent: ink 14.81 / 12.08, secondary 8.47 / 8.64. The open row has `aria-current="page"`. [06 §13]
3. Coach gets a segmented switcher 34 tall (Priya, Eli, Jonah) and the tier word on rows. A player gets neither; no other player's name or id is in the DOM. [06 §13; SHARED-11]
4. A rail click replaces the address (no new history entry) and crossfades the middle and right columns with M-READ-23; two quick clicks give one crossfade to the last choice. [07]
5. Cleared reads show as one line each, up to 3, then "N more cleared". [02 §5]

### S-READ-DESK.more (popover)
Design: `#read-approach-coach-desk-light-more-shot`. App: `&state=more` at 1440 (added by CR3). Capture: `desk-more`.
1. 250 wide, right 24, top 62 (4 under the bar), padding 6, radius 14, 94% card with blur 24, ring plus 0 18 40 −16 at 35% black. Items 14.5 / 500, padding 11/12, radius 9, 37 tall. [06 §13]
2. Coach: Dismiss this read (`--ch-flag`), Copy a link, Close. Player: Copy a link, Close. [06 §13; SHARED-11]
3. Opens with M-READ-13 (220ms, scale .96 → 1 from top right); closes with M-READ-14 on Close, Esc, a click outside or an item. A second click on ⋯ closes it at once. [07]

### S-READ-DESK.jump
Design: the studio's Play buttons on the desktop view.
1. A deep link or a rail row that lands on a card scrolls it to the top (`block: start`), then rings it with M-READ-22 (inset 2px `--ch-gain`, 900ms). Under Reduce Motion the scroll is instant and the ring fades in over `CH_FADE_MS`. [07]

### Motion, across the lane
1. Every row M-READ-01 to M-READ-26 matches 07: trigger, what moves, from and to, duration, curve, interrupt behaviour and Reduce Motion behaviour. [07; SHARED-12]
2. Nothing on 07's "Never animates" list moves: no count-up, no stagger, no motion on re-render, data refresh, theme or Text Size change, no height animation, no shimmer sweep. [07; SHARED-6]
3. Under `reducedMotion: 'reduce'` (system setting or the page's own switch) no transform transition runs, opacity transitions use `CH_FADE_MS` (180ms today), and the skeleton pulse stops. `CH_FADE_MS` and `reduced-motion.test.tsx` are not changed by this lane. [07]
4. `classifyNav` is scoped to `/golf/dashboard/coachhelm` with views read, player, deep-dive, standing and profile: board to read is a push, read to board a pop, read to read a fade; any other page is unchanged. [02 §7.1]
5. All 8 interrupt cases in 07 pass in a Playwright test. [07]
6. The drawn −30% underlay is listed under "Can't match as drawn" and the shared 24% is built. [07]

## Part 2. Per PR

Every CR PR also:
- is a draft, behind `coachhelm_read_v1` (off), with nothing merged, deployed, flipped or migrated (SHARED-8, SHARED-9);
- leaves `coachhelm_team_pool_v1` in `config/feature-flags.yml` unchanged (at 75b4956: default false, production true, preview true), and lists under "Pre-deploy checks" confirming that production value and the `HELM_COACHHELM_TEAMS` canary before the first deploy (Nick, 31 Oct; 02 §14);
- passes `clubhouse:catalog -- --check`, `clubhouse:css`, `flags:check`, `npm test`, lint, typecheck and `playwright.clubhouse.config.ts`, with a fragment under `docs/clubhouse/pages/P013-coachhelm/changes/` (02 §0);
- leaves every file in 02 §1 out of the diff, and meets SHARED-1 to SHARED-12;
- puts its Part 3 pairs and clips in the description.

CR0. Player leak fix (alone, flag independent)
- Must pass: S-DIVE.why 1 to 3.
- Adds: dive-shape unit tests for coach and player viewers.
- Done when: a player on today's Deep dive sees no arm numbers for a likely read and the coach Deep dive is unchanged.

CR1. Plumbing, flag, headline, skeleton, preview
- Must pass: S-READ 1, 2, 5, 9, 10, 11; S-READ.head 1 to 4; S-READ.nopool 1 to 3; S-READ.loading/.failed/.gone 1 to 5; Pictures off 1; Flag off 1.
- Also: `coachhelm_read_v1` added as release, owner golf/coachhelm, false in every environment, registry regenerated. `readHref(player, insight, on = false)` off returns today's address byte for byte; on returns `?view=read&player=&insight=` or `?view=read&insight=`. `?view=read` without `insight` redirects to Deep dive. The player read uses the session id, never `?player=`. One feed call per page view and a `player_feed` exposure for the shown read only. [02 §3.1 to §3.4]
- Adds: `coachhelm-read-route.test.tsx`, `coachhelm-read-view.test.ts` (readHref, loader deep-equality, exposure spy, ladder gating, player payload keys, pronouns, pictures off); the preview route with the 02 §3.9 states.
- Done when: the route branches by flag, flag-off screenshots equal 75b4956, and S-READ, S-READ.head, .nopool, .loading, .failed and .gone match the design at 390 and 430, light and dark.

CR2. Read page, phone cards and their states
- Must pass: S-READ 3, 4, 6, 7, 8, 12; S-READ.where 1 to 7; S-READ.why 1 to 8; S-READ.countdown, .gap; S-READ.sure 1 to 5; S-READ.sure.corrections, .reasons, .answered, .answerfail; S-READ.moved 1 to 4 and .notrend; S-READ.rounds 1 to 4; S-READ.partfail 1 to 3; S-READ.do 1 to 7; S-READ.assigning, .assigned, .proposed, .declined, .noassign, .dismissed; S-READ.more 1 to 5 and 7; S-READ.copied.
- Also: adds the preview states `notthis`, `answered`, `answerfail`, `more`, `allrounds`, `notrend`, `dismissed`, `assigning` and `gap` to the 02 §3.9 list. Motion rows that ship here are drawn at rest; their animation lands in CR5.
- Adds: one absent-card test per card, funnel share test, why state tests, corrections chips per viewer, `assignStateOf` against `FocusActions`, write spies (assign, corrections), one-feature-card test, left-border CSS test (SHARED-3), player DOM test for Assign, More rows, Message and the Coach only well.
- Done when: every card and state matches the design for approach, penalties and putts, coach and player, and Assign, Dismiss and Undo behave as on today's coach Deep dive.

CR3. Desktop three columns
- Must pass: S-READ-DESK 1 to 6; S-READ-DESK.rail 1 to 5; S-READ-DESK.more 1 to 3; M-READ-13, M-READ-14, M-READ-23.
- Adds: column order per viewport, rail group order, replace-not-push, `aria-current`, no horizontal scroll at 1280 and 1024, popover rows per viewer; the `more` preview state at desktop width.
- Done when: the `desk*` captures at 1440 × 900 match the design, coach and player, light and dark, and `desk-1280` has no horizontal scroll.

CR4. Summary card export and hand-off
- Must pass: S-READ-BOARD 1 to 9; S-READ-BOARD.actions 1 to 5; S-READ-BOARD.dismissed 1 to 3; S-READ-BOARD.loading 1 to 3.
- Adds: summary-equals-detail test, keyboard test, player cause-line test, `?screen=board&state=dismissed`. The R10 one-sheet agreement is written in the PR description; `CoachBoard.tsx` and `PlayerBoard.tsx` stay out of the diff.
- Done when: board card captures per read, coach and player, match the design's board card, and the action row is absent for a player.

CR5. Motion and the remaining states
- Must pass: M-READ-01 to M-READ-12, M-READ-15 to M-READ-22, M-READ-24 to M-READ-26 (13, 14 and 23 ship in CR3); Motion 1 to 6; S-READ.stale 1 to 3; S-READ.cleared/.contradicted/.underreview 1 to 3; S-READ.long 1; S-READ.more 6; S-READ.dismissed 2; S-READ.assigning 2 and 3; S-READ.assigned 3; S-READ-DESK.jump 1.
- Adds: `native-nav.test.tsx` cases (push, pop, fade, unrelated unchanged), the 8 interrupt tests, a reduce-motion Playwright assertion, one unit test per state. The `classifyNav` change is its own commit with a `docs/clubhouse/changes/` fragment.
- Done when: every M-READ clip matches the design in both motion settings, and every state matches its anchor or gallery card.

CR6. Tests and capture
- Must pass: Part 3 for every screen ID, state and motion row above.
- Adds: `test.describe('CoachHelm read')` in `e2e/clubhouse-quality.spec.ts` at 390×844, 430×932 and 1280×800 in both motion settings (Back returns to the board at the same scroll, one feature card, flag off renders the board); hooks `data-ch-hr-page`, `data-ch-hr-card="where|why|sure|moved|rounds|do"`, `data-ch-hr-open`, `data-ch-hr-assign`, `data-ch-hr-rail`, `data-ch-hr-more`; the route in `a11y.mjs` and `aesthetic-capture.mjs`.
- Done when: every capture state in 05 has a pair (or is listed as app only), every M-READ row has its clips, and the Playwright block is green.

## Part 3. Side by side

1. Screens. For each screen ID and capture state:
   ```
   node capture/capture.mjs --id <ID> --state <state>
   ```
   It writes `screenshots/<ID>__<state>__design__{light,dark}.png` and `…__app__{light,dark}.png` at the width, Text Size and motion setting the state fixes (05, "Capture states"). Gallery states (`gap`, `cleared`, `contradicted`, `underreview`) shoot the gallery card on the design side. App-only states skip the design side and say so. `--id all` runs every ID with its default states. The old modes (`design`, `app`, `compare --only`, `clips`) still work.
2. Put each pair side by side in the PR and check 06's redline numbers on both, within 2pt:
   - bar 44 + 48; lip 16 (built; the page draws 18); first card 6 under the lip
   - page edge 16 (20 at 430); card gap 20; card radius 16; bottom padding 60
   - feature padding 18/16/16; hero number 44 on one line
   - rows 52; Assign 46, radius 13; chips 36; funnel bars 12; why dots 14; path nodes 38; sure bars 8
   - sheet 8 from the edges, groups radius 14, rows 57
   - desktop: sidebar 232, glass bar 58, columns 250 / fill / 320 with 20 gaps, switcher 34, popover 250
3. Motion. For each row:
   ```
   node capture/capture.mjs --motion <M-READ-nn>
   ```
   It records the design page's Play and the app with Playwright `recordVideo` at 390 wide (1440 for desktop rows) and repeats with `reducedMotion: 'reduce'`. Compare duration, curve or spring, and what moves, within one frame at 60fps (SHARED-12). Rows marked "today's" in 07 compare against main, not the design page.
4. List every pair and clip as matches, fixed, or "Can't match as drawn" with two options. Today's list: the −30% underlay (built at 24%) and the 18pt lip (built at 16). A PR is done only when every listed screen matches within 2pt and every motion row matches.

## Completeness pass, 4 Nov 2026

One pass or fail criterion for each state that had none or only a group line, and for every state added in 05's Completeness pass section. The PR each belongs to is in brackets.

1. CP-READ-1 (S-READ.contradicted) [CR5]. A coach sees the "Contradicted" chip (amber, never red, 5.62 / 5.34) and the notice "The newer rounds point the other way." with the conflicting read as a 44 link row to its own read. A player sees neither until `COACH_FIRST_MS` has passed; before that the read draws as plain open. Unit test on the clock both sides of the day.
2. CP-READ-2 (S-READ.underreview) [CR5]. After a coach answers Wrong cause, the headline shows the plain "Under review" chip (6.54 / 6.29). The player also sees "Your coach is checking this read. It stays visible but is not on your focus." The coach sees their answer in the corrections row.
3. CP-READ-3 (S-READ.cleared) [CR5]. With `coachhelm_recheck_v1` on, a cleared read shows "Cleared {date}" (5.66 / 5.39), the recheck's sentence, no Do card, no Assign, and More with Copy only. With the flag off it opens as `gone`.
4. CP-READ-4 (S-READ.failed) [CR1]. With the read query failing, one error card shows "This read didn't load", Try again primary 46 and CH-13866 (fixed 4 Nov wiring: was CH-13860); Try again shows the skeleton then the page (M-READ-34) and is disabled while loading. Player wording is the same.
5. CP-READ-5 (S-READ.gone) [CR1]. Coach: "{first}'s open reads are on the board." with Back to the player; player: "Your open reads are on your CoachHelm." with Back to CoachHelm; CH-13861 on both. A write that answers gone swaps the page for this card in 180ms.
6. CP-READ-6 (S-READ.notyours) [CR1]. A player opening another player's insight id gets the gone card in player words, and the network log shows no request for that player's rounds, shots or read. A coach opening a player not on their team gets today's CH-13311 screen.
7. CP-READ-7 (S-READ.off) [CR1]. With `coachhelm_read_v1` off, every entry (Team sheet link, Lenses row, board card, copied link) opens today's Deep dive address byte for byte.
8. CP-READ-8 (S-DIVE.why with the flag off) [CR0]. With `coachhelm_read_v1` off, a player's Deep dive Why section has no arm counts for a likely cause and no `arms`, `verdict`, `range` or `rung` in the payload.
9. CP-READ-9 (cold start) [CR1]. Opening a read link as the first page shows no push; Back goes to the player's file (coach) or CoachHelm (player) with M-READ-03 motion.
10. CP-READ-10 (from Team and Lenses) [CR5]. "Open the full read" in the shared read sheet closes the sheet and pushes the page together (M-READ-38); Back returns to Team or the file at the same scroll with the sheet closed.
11. CP-READ-11 (821 to 1179) [CR3]. At 1024 × 768: rail 250 and middle column, right-column cards under the middle ones, no horizontal scroll; at 1180 three columns.
12. CP-READ-12 (S-READ.partfail) [CR2]. The banner (CH-13208) sits 12 under the headline as a §12 notice; the Rounds card shows CH-13281; Try again reloads only that part (M-READ-33).
13. CP-READ-13 (S-READ.dismissed) [CR2]. The notice (CH-13901) is a §12 notice at the top with Undo at 44 hit height; the stance chip reads "Dismissed".
14. CP-READ-14 (S-READ.copied) [CR2]. Copy puts `readHref` on the clipboard and today's toast reads "Link copied" for 2.4s; no new toast component ships.
15. CP-READ-15 (S-READ.nopool) [CR1]. With no team pool line, with `READ_CALLS.teamPoolOnLadder` off, or with fewer than 5 in the pool, the Team row is absent and no line explains it. The Team and Lenses sheets follow the same rule (their CP-TEAM-19, CP-LNS-6).
16. CP-READ-16 (S-READ.long) [CR5]. With the longest fixture name at k 1.36 nothing clips; the bar title ellipsizes only where it would meet the back label.
17. CP-READ-17 (moved, countdown, gap, stale, cleared, contradicted, underreview, nopool) [CR5]. Each draws at rest: the first and last frames of a 1s clip match (M-READ-29, 31, 32, 36).
18. CP-READ-18 (proposed, declined, noassign) [CR2]. At rest on paint; after Propose again succeeds the row crossfades in 180ms and success feedback fires once.
19. CP-READ-19 (S-READ.sure.answerfail) [CR2]. The notice "That answer didn't save. Try again." (CH-13971) appears under the chips with no motion; the chips stay pressable.
20. CP-READ-20 (Ask and Practice) [CR2]. "Ask CoachHelm about this" (chip, More row, desk bar button) and "Add to practice plan" are absent from the DOM until their hrefs exist and their flags are on.
21. CP-READ-21 (Message) [CR2]. "Message {first}" opens today's compose to that player with an empty body.
22. CP-READ-22 (double submit) [CR2]. Two quick Assign taps send one write and one success feedback.
23. CP-READ-23 (two devices) [CR2]. A read assigned elsewhere opens as `assigned` or `proposed`; one dismissed elsewhere opens as `gone`.
24. CP-READ-24 (dates, rollover) [CR1]. A round dated 2026-10-31 shows as 31 Oct at UTC−10 and UTC+13. With the clock at 1 Aug, "this season" counts read "—" until a new-season round exists; "last {n} rounds" windows don't change.
25. CP-READ-25 (keyboard and screen reader) [CR3]. Tab order is back, title, bar buttons, then cards; the board card is one tab stop; Esc closes More and the popover and focus returns to ⋯; every focus ring shows (8.15 / 8.45 on card).
26. CP-READ-26 (feature card) [CR4]. The board card and headline are flat `--ch-feature-bg` with no radial light or gradient (SHARED-2).
27. CP-READ-27 (S-READ-BOARD hosts) [CR4]. Not drawn in Team; with `coachhelm_player_file_v1` on, the Lenses feature card is the top read on the player file and board (pending Nick's call; see report).


## Wiring, 4 Nov 2026

Pass or fail checks for the wiring in 06's section of the same name, checked against helmv3 `main` 03d9087. Each names the screen IDs it covers and the PR it belongs to in brackets. Shot tracking: nothing in this lane changes what shot tracking collects, stores or sends; W-READ-20 proves it.

1. W-READ-1 (S-DIVE.why) [CR0]. A unit test on `toChDeepInsight(raw, 'player')` for a likely cause (`causality_level` not `observed_sequence`) gives `diagnosis: null`, and the serialized player payload holds no `drivers`, no cause sentence and no reason. The same row as `'coach'` keeps them. The player's Why words match 03d9087 except the drivers list (whyOf already says "Not traced yet").
2. W-READ-2 (S-READ.why, S-READ.where) [CR1]. A player's read payload (the props sent to the client) holds no `arms`, `verdict`, `range` or `rung` key anywhere, and no figure from another player's rows. The `why` text arrives already filtered by `writeUpFor` on the server.
3. W-READ-3 (S-READ, S-READ.off) [CR1]. With `coachhelm_read_v1` off, `readHref(p, id, false)` equals today's `coachPlayerHref('deep-dive', p) + '&insight=' + id` for a coach and `diveReadHref(id)` for a player, byte for byte, and `?view=read` renders today's board. With it on, `readHref(p, id, true)` gives `?view=read&player=…&insight=…` (coach) and `?view=read&insight=…` (player). A unit test covers all four.
4. W-READ-4 (S-READ) [CR1]. One read view makes one feed call (`getInsightsForCoach` or `getInsightsForPlayer`). The player view records exactly one `player_feed` exposure row, for the read shown (`drawnLater: () => [insightId]`); the coach view records the same `coach_feed` set Deep dive records today, once. A test counts rows in `golf_insight_exposure`.
5. W-READ-5 (S-READ.notyours) [CR1]. A player with another player's insight id gets the gone card and the server makes no query for that player's rounds. A coach with a player not on their team gets CH-13311 before any feed call.
6. W-READ-6 (S-READ.gone, S-READ.failed) [CR1]. An id not on the list gives `read: null` and CH-13861. A thrown feed gives CH-13866 (never CH-13860, which the catalog gives Standing); Try again calls `router.refresh()` once and is disabled while it runs.
7. W-READ-7 (S-READ-BOARD, S-READ.do) [CR2]. Assign on the board card and on the Do card call the same `useFocusActions(...).assign` with the same `ChFocusTarget` that `FocusActions` builds for the same insight; a table test of `assignStateOf` against `FocusActions` branches (open, proposed, assigned, declined, stale, missing) gives the same state for each. A duplicate shows Assigned and "{first} already has a focus on this".
8. W-READ-8 (S-READ-BOARD, S-READ.do) [CR2]. Assign, Dismiss and Undo are absent from a player's DOM. A coach's Assign is set only after the action succeeds; failure shows toast CH-13001 and the row stays as it was. Dismiss failure CH-13002, Undo failure CH-13003.
9. W-READ-9 (S-READ-BOARD) [CR2]. Two quick taps on Assign send one request (network log) and fire one haptic and one toast.
10. W-READ-10 (S-READ.do) [CR2]. After Assign, the player gets one bell row of type `dev_plan_assigned` linking to `/golf/dashboard/stats?tab=dev`, and one email only when their `email_task_reminders` is on. No push is sent, and Dismiss and Undo send nothing. Accept or decline by the player sends the coach nothing (today's behaviour, unchanged).
11. W-READ-11 (S-READ.sure) [CR2]. With `coachhelm_corrections_v1` on, the coach read loads corrections (a new `readCorrections` call with `role: 'coach'`) and shows the coach's last answer; the player read shows only Not this and Good read. With the flag off no chips draw and no error shows.
12. W-READ-12 (S-READ.copied) [CR2]. Copy writes the absolute `readHref(..., true)` address; the toast reads "Link copied". A refused clipboard shows "Couldn't copy the link" and saves nothing.
13. W-READ-13 (S-READ, More) [CR2]. "Message {first}" opens `/golf/dashboard/messages?player={id}` with an empty body. "Ask CoachHelm about this" is absent while `askAboutReadHref` returns null (Ask not shipped or `coachhelm_ask_v2` off). "Add to practice plan" is absent from the DOM.
14. W-READ-14 (S-READ-BOARD) [CR4]. With Read on and Lenses off, the player's top focus card and the coach Deep dive head draw the read card; with Lenses on, Lenses' feature card draws and this card does not; Team never draws it. With Read off both hosts match 03d9087.
15. W-READ-15 (S-READ-BOARD, S-READ) [CR1]. No client module imports `isFlagEnabled`; `readOn` and `fileOn` arrive as props from the route.
16. W-READ-16 (S-READ.do) [CR2]. The plan line on a coach read shows only a goal that the coach made or the player shared (Lenses L0 filter in `readPlans`); a test with a private player goal finds it in neither the coach payload nor the DOM.
17. W-READ-17 (S-READ-DESK) [CR3]. A rail tap swaps the read with `replace` and records exposure only for the read shown.
18. W-READ-18 (S-READ, S-READ-BOARD) [CR2]. After Assign or Dismiss, the page payload refreshes through the action's `revalidatePath`; a second device sees the change on its next load. No realtime channel is opened (network log shows none).
19. W-READ-19 (S-READ.back) [CR1]. Back with no history goes to `playerFileHref(player, undefined, fileOn)`: the Lenses file when `coachhelm_player_file_v1` is on, today's Deep dive when off; a player goes to CoachHelm.
20. W-READ-20 (all screens) [CR1]. No new query against `golf_shots` and no write to any shot table appears in the lane's diff; `supabase/migrations/` gains no file from this lane.
