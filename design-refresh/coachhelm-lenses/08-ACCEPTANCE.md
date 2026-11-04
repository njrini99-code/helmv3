# 08. CoachHelm Lenses: acceptance

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 23 rows).
> Wiring, 4 Nov 2026: see the section of that name at the end of this file.

Design page: [CoachHelm Lenses](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe), version 6 (3 Nov; local `redesign/coachhelm-lenses.html`) · Package: design-refresh/coachhelm-lenses/ · Status: ready to build (Nick 31 Oct, "All four on Lenses"); prep only, behind `coachhelm_player_file_v1`, off everywhere.

Screen IDs and state ids: `05-SCREENS.md`. Values: `06-SCREEN-SPECS.md`. Motion rows: `07-MOTION.md`. Figures: `03-DATA-CHECKS.md`. Where this file and `04-FIDELITY-SPEC.md` disagree, this file wins. This file replaces the draft `redesign-package-src/acceptance/lenses.md`; its screen IDs (S-FILE.feat, S-FILE.evidence, S-FILE-DESK…) and motion IDs (M-LENS-01 to 16) are retired in favour of 05 and 07.

How to read a criterion: each is a fact a reviewer marks pass or fail. Check: **S** a screenshot pair from `capture.mjs`, **D** a DOM, unit or shape test, **C** a motion clip pair. Sources in brackets: 02 = `02-PLAN.md` (§13 is the final word over earlier sections), 03, 06, 07.

## Shared criteria

SHARED-1 to SHARED-12 (`ACCEPTANCE-SHARED.md`, 3 Nov numbering) apply to every PR here and are not repeated. Lane notes:

- SHARED-6: every Reduce Motion fade is `CH_FADE_MS` (180ms), including this lane's lens fold, pill and rail swap. The package's earlier 120ms is withdrawn (07 "Settled"). Swap and Try again change at once under Reduce Motion.
- SHARED-2: the feature card is a flat fill (the page's radial light was removed 3 Nov). The only gradients are today's segmented chip shade (lens control, view strip, picked plan picks) and today's `.ch-btn--primary`, both unchanged components.
- SHARED-5: XXL is `--ch-type-scale` 1.36 on both sides (the app's own cap is 1.353).
- SHARED-11 on this lane: players compare against the PGA Tour and the team average only (Nick, 31 Oct: "They see against pga tour and team averages"). No teammate dot, name, id or individual figure on the player's board, in the lens, or in either payload.

## Common states

Every screen ID is checked in these states unless its own list says otherwise. The state ids are 05's; `capture.mjs --state` takes them.

| State | Rule |
|---|---|
| `default` | As drawn, fixture `accepted` |
| `loading` | Each card keeps its title with three skeleton bars (06 §13); the sheen is today's `.ch-skel` (M-LNS-25); taps on reads do nothing |
| `empty`, `failed`, `early`, `long` | As 06 §13 |
| `many`, `one`, `stale` | As 05's matrices (not drawn; app only) |
| `xxl` | Nothing clips (SHARED-5) |
| `reduce` | 180ms fades only (SHARED-6) |
| `w390`, `w430` | Page edge 16 / 20 (SHARED-7) |
| `desk` | 1280 × 800 |
| dark | every shot in both themes |

## Part 1. Criteria per screen ID

### S-LIST (lane 1's screen; the push only)
1. Every "By player" row is a link to `playerFileHref(id)` with `data-ch-hf-open`; nothing else on lane 1's screen changes (pixel diff against lane 1's own build). D, S [02 §2.1]
2. A tap tints the row after 50ms (no scale) and pushes the file per M-LNS-01; Back and the edge swipe return per M-LNS-02. C [07]
3. With the flag off the row goes where it goes today. D [SHARED-8]

### S-FILE (coach's file on one player, phone)
1. Pushed bar: back "CoachHelm" in `--ch-champagne-300`; title the player's full name, centred, one line with ellipsis, columns 120 / 1fr / 120; More 44 × 44 on the right (SHARED-1). S [06 §1.1]
2. Card order: feature, plan, last round in context, all reads, where the strokes go, your plan for {first}, track record. D [06 §3]
3. Lens control at 104 from the screen top, 42 tall, sticky; feature card top at 170; cards 24 apart; page edge 16 (20 at 430). S [06 §3 redline]
4. Exactly one `.ch-hf-feat` in the DOM. No `.ch-hf-*` element has a left border wider than 1pt, or an inset shadow drawing one (SHARED-3). D
5. Coach-only cards carry the 16 lock glyph in the title and "Only you" or "This season" in the meta, never a coloured edge. S [06 §3.7, §3.8]
6. Every figure maps to a source in 03; a figure with no source is left out or shows "—". D [03 "No source"]
7. One page view makes one `getInsightsForCoach` call and records one `coach_feed` exposure set (spy). D [02 §2.3]
8. Old links, flag on: `?view=deep-dive&player=X` redirects to `?view=player&player=X&at=reads` keeping `&insight=`; `standing` and `profile` redirect to `at=sg`; `from=file` does not redirect. Flag off: every address renders as at 75b4956. D [02 §2.2]
9. `at=reads&insight=Y` opens with the reads card in view and `S-FILE.read` open on Y; the scroll is set before first paint, never smooth (M-LNS-28). D, C
10. States: `loading`, `empty` (one "No rounds yet" card, then your plan and track record), `failed` (one card, `role="alert"`, no lens control), `early`, `long`, `many` (all reads listed, no inner scroll, up to 30), `one`, `stale` (RefreshNotice in the failed card only), `nofield` (no field card). S, D [05 S-FILE matrix]
11. Contrast, light / dark: ink on card 17.08 / 14.34, secondary 9.77 / 10.25, tertiary 6.61 / 6.99, loss figure 5.57 / 8.53, gain figure 7.42 / 8.45, accent link 8.15 / 8.45; chips loss 4.99 / 7.35, gain 6.26 / 6.83, plain 8.43 / 8.44, accent 6.84 / 6.83. `node capture/contrast.js` reproduces `capture/contrast-table.md`. D [06 §0]

Feature card (06 §3.2):
12. Flat `--ch-feature-bg` (#0B3A25 / #123D29), radius 16, padding 20, gap 12; no gradient. S, D
13. Who line "{first}'s top read · {area}" with a 28 avatar; title 26 × k / 1.15 / 600, wrapping with no line cap. S
14. Comparison cells {first}, Team, Tour, 64.6 tall at k = 1. Team comes from `golf_player_standing.team_avg` and shows only when `team_n ≥ 5`, else "—" and the paragraph says "to the Tour". The fixture 1.1 / 0.7 / 0.3 reads "worth 0.6 strokes a round". D, S [03 §1]
15. Evidence chips: sample, window, firmness ("Seen repeatedly" for a coach), white 10%, 8.39 / 7.99. S
16. The whole card opens `S-FILE.read` on the top read (`data-ch-hf-read="top"`); a press tints white 5% after 50ms and never scales; pressing a button inside it tints nothing but the button (M-LNS-14). D, C

Plan card (06 §3.3):
17. Title "{first}'s plan". Three steps, dots 14 with a 2pt line at y 6; reached dots and lines `--ch-chart-gain-fill`. S
18. "Shown to {first}" is the first `golf_insight_exposure` row with `surface = 'player_feed'` and `shown_at >= created_at` (limit 1); with no source insight the step shows "Not yet", never a tick. D [02 §3]
19. Goal chart 72 tall, one vertex per snapshot from the accepted date, dashed goal line, labels 12pt unstretched (viewBox from the measured width). S, D
20. Practice line "{first} logged {n} sessions this week" with no target; absent with `coachhelm_focus_area_practice_log` off; no drill, no drill well. D [02 §13 item 5]

Last round in context (06 §3.4):
21. Present only with `coachhelm_team_pattern_v1` on and `field_n ≥ 3` (coach) or `field_n ≥ 5` (lens); otherwise absent from the DOM. `state=fieldfew` (a field of 4): coach card present, lens card absent. D [03 §6]
22. Copy: "{n} teammates played; the field, {first} included, averaged +{mean}", with n = `field_n − 1`; head by band: Better / Level (within 1.0) / Behind; no "hard day" verdict. D
23. Coach: teammate dots 14 at every field size, including 3 and 4, with no ids or names in the DOM. Figure 40 × k, tabular. S, D

All reads (06 §3.5):
24. Title "All reads", meta "{n} open · {m} dismissed"; rows in `orderDive` order with stance chip and firmness; titles up to two lines. Once assigned, the read's chip reads "Assigned". D, S
25. A row tap (`data-ch-hf-read="<id>"`) opens `S-FILE.read` on that read. D

Where the strokes go (06 §3.6):
26. Four rows; bars from the centre against the PGA Tour, label column 108, figure column 46, track 22; team tick 3 wide only when `team_n ≥ 5`, with the key; no tick and no key below that. S, D
27. Note: "Against the Tour, off the tee costs {first} 0.9 a round; against the team, 0.7." then the source's window label and round count (03 §3; "All time" today). Total-only rounds give "—" per row and the "needs hole-by-hole scores" note. D
28. Bars are drawn at rest on first paint (07 "Never animates"). C

Your plan for {first} and track record (06 §3.7, §3.8):
29. Read with the session client from `golf_coach_player_intent`; no row shows "Not set yet…" and Set a plan, never `loadIntent`'s default. D [03 §7]
30. Track record: three wells; outcome rows with chips; all-null outcomes read "Not measured yet" with the open count, never zeros; a delta shows only when `n_rounds_after ≥ 3`. D [02 §5.2]
31. Neither card, nor any of their fields, is in a player's payload or DOM; RLS `intent_coach_only` unchanged. D [SHARED-11]

### S-FILE.rail (desktop)
1. Today's sidebar and glass top bar (SHARED-1); rail 300 with a right hairline; file head avatar 52, name 30 × k one line, the line under it in `--ch-text-secondary`; lens control 300 wide; More 36. S [06 §4]
2. Left column feature, plan, strokes; right column field, reads, your plan, track record; columns 1.12fr / 1fr, gap 20. S, D
3. Rail rows show name and class year until lane 1's loader supplies the top read; the selected row holds the pressed tint. S
4. Picking another player swaps the file column with `CH_ROUTE` (M-LNS-20); the rail itself doesn't move; a second pick mid-swap wins. C
5. Reduce: a 180ms fade. C

### S-FILE.lens ("As {first} sees it")
1. The lens control is today's Segmented with "Coach view" and "As {first} sees it"; the thumb rides `CH_SPRINGS.settle` 417 (M-LNS-05); select haptic. C, D
2. The pill "Previewing {first}'s screen" shows only in the lens, sticky at 158 (phone) or 12 (desktop), glass, 16.44 / 14.98. S
3. Lens card set and order equal `S-BOARD`'s for the same fixture (feature, what's working, plan, field, strokes, also worth knowing); screenshot of the lens body matches the `S-BOARD` body for the same data within 2pt, pill aside. S
4. After the fold ends, the DOM holds no your plan, track record, "Seen repeatedly", Wrong cause, Already on it, Show later, Dismiss, Undo, teammate dots, or the coach's dismissed rows. D
5. No player render contains the coach's plan words, "Track record" or any teammate name (fixture with distinct teammate names). D
6. Toggling calls no write and no fetch (spy every `writes` entry); Accept and Decline render `aria-disabled` and call nothing. D [02 §7]
7. Lens data never calls `getInsightsForPlayer` (mock throws) and records no exposure; its list matches `getInsightsForPlayer`'s ids for the fixture; the payload has no `ladder`, `q` or `shrink` field. D [02 §7]
8. Lens state is client only, resets per player and on Back, and is not in the URL; scroll position is kept on toggle. D
9. Motion: lens-only cards fold on height over 462 smooth with opacity 180 out / 260 in (M-LNS-04); shared cards change with today's Swap (M-LNS-06); the pill folds and rises 6pt (M-LNS-10). Two quick flips leave exactly one copy of each shared card. C, D
10. Reduce: the whole file fades over 180, nothing folds or rises, the scroll position is kept. C

### S-FILE.focus
1. Coach actions by stage: no focus "Assign as focus" (light) and "Message {first}" (ghost); Suggested and Shown "Sent to {first}" done and disabled; Accepted "{first} accepted it"; Declined back to "Assign as focus". S [06 §6]
2. Plan card by stage as 06 §6; Declined reads "Declined" in `--ch-loss` with the unreached ring and no tick, meta "Declined {date}". S, D
3. Assign calls today's `useFocusActions` with the read as target; while in flight the button reads "Assigning" and is disabled; one success haptic; failure shows today's toast CH-13001; a duplicate shows "{first} already has a focus on this". D
4. After a successful Assign, the Suggested step fills: line 260, dot 180, tick 260 starting 120 after the dot (M-LNS-16). Shown and Accepted fill at rest on a later load, never animated. C
5. Reduce: steps appear filled, no fill motion; the card swap is instant. C

### S-FILE.undo
1. Dismiss (sheet footer) calls `dismissInsight`; the sheet closes, then the read's row swaps to "Dismissed: {title}" with Undo (M-LNS-18). D, C
2. Undo (`data-ch-hf-undo`, 44 tall, `--ch-accent`) calls `reactivateInsight(id, lifecycle, 'dismiss')` and the row swaps back (M-LNS-19). D
3. On reload, the coach's dismissed reads come from `golf_coach_insights` with `status='dismissed'` (03 §4); a player route never ships them. D
4. In-flight words "Dismissing", "Undoing"; failures CH-13002, CH-13003. D

### S-FILE.read (evidence sheet)
1. Phone: hugs content up to 86%; radius 20 20 0 0; grabber 36 × 5 at 7; head padding 14 20 8; body 4 16 and today's safe-area bottom; section cards on `--ch-grouped-bg`, 16 apart, padding 14, radius 12 (fixed 4 Nov: was wells on `--ch-card-bg`; the shared read sheet, 06 Completeness pass). Desktop: centred dialog 480, radius 20, no grabber, footer bottom 16. S [06 §8]
2. Close X is a 34 circle with a 44 hit area (fixed 4 Nov: was 32; shared sheet). D
3. Wells: The comparison ({first}, Team only with a team pool, `coachhelm_team_pool_v1` on and `team_n ≥ 5` (fixed 4 Nov: flag and pool named, as Read S-READ.nopool), Tour; bar 10 tall); Penalties in the last 8 rounds from `golf_rounds.total_penalties` (other reads: "Score to par, last 8 rounds"); Where it happened (date, hole, course, penalty count and score only); Why we think this, with "{n} rounds · {window} · {firmness} · as of {date}". D [03 §9]
4. Corrections are today's CorrectionChips (`coachhelm_corrections_v1`), unchanged: "Is this read right?", the five coach kinds; Not this opens the four reasons; an answer reads "Your answer: {kind}." with Change; `recordCoachHelmCorrection` runs on the tap. D [06 §8.1]
5. Correction chips and Change get a 44 hit area inside `.ch-hf-sheet` only; the component's own CSS file is unchanged. D
6. Footer: Dismiss (secondary) and Assign as focus (today's primary), or "{first}'s focus" done when a focus exists. D
7. Open and close per M-LNS-07 and 08; drag per M-LNS-09 with today's thresholds; Esc and the scrim close. C, D
8. Reduce: 180ms fades. C

### S-FILE.plan (your plan sheet, coach only)
1. Same frame as `S-FILE.read`; head "Only you" with a lock over "Your plan for {first}". S
2. Aim this season (one of Breakout, Develop, Maintain, Bubble, Rehab), How often CoachHelm flags {first} (one of Aggressive, Balanced, Conservative, Silent, with the hint line), Watching (several), Note; no emoji, no pill colours. S, D [03 §7]
3. Picks (`data-ch-hf-pick`) 36 tall with a 44 hit area, radius 10; picked uses `--ch-seg-on-bg`. S
4. With no row (`nointent`) it opens on Develop and Balanced, nothing watched, empty note. D
5. Save plan (`data-ch-hf-intent-save`) calls `setIntent`; "Saving" while in flight; the sheet closes and the card swaps (M-LNS-21); failure shows today's toast with the next free CH-13xxx (fixed 4 Nov wiring: CH-13760). Cancel, scrim, X and swipe down (`data-ch-sheet-close`) save nothing. With unsaved picks, scrim, swipe and Esc first ask "Discard changes?" in the footer (CP-LNS-9); Cancel and X discard at once (fixed 4 Nov). D, C
6. Never rendered for a player, in the lens, or in any player payload. D

### S-FILE.more
1. Today's `ui/Menu`, 232 wide, glass, radius 14; items "Open {first}'s profile" (users icon) and "Message {first}" (message icon), icons in `--ch-accent`. S [06 §10]
2. Opens from its corner per `CH_POP` (M-LNS-11), closes on pick, Esc, outside tap or scroll (M-LNS-12); 8pt edge clamp; flips up near the bottom. C, D
3. Profile opens `/golf/dashboard/roster?player=<id>`, the Roster lane's profile deep link (fixed 4 Nov: was "today's Roster profile"; see CP-LNS-23); Message opens today's compose to that player. D
4. XXL: rows grow to 34 × 1.36 = 46, width stays 232. S

### S-FILE.toast
1. Today's `useToast`, unchanged; the words and codes in 06 §11. D
2. `state=failwrites` makes Assign, Dismiss, Undo, Save plan fail with the matching toast; nothing on the page changes. D

### S-BOARD (the player's own CoachHelm)
1. Root bar unchanged; today's Board · Standing · Deep dive strip, Board picked; "Your week" with "{n} rounds · refreshed {date}". S [06 §12]
2. Phone order: feature, what's working, plan, field, strokes, also worth knowing. Desktop: feature, plan, strokes | what's working, field, also worth knowing, no rail. D, S
3. Feature card in the player's words: kicker by stage, "You" in the comparison, "Solid read" chip. S
4. What's working: one strength (`WORKING_MAX` 1), meta "Top strength". D [03 §5]
5. Also worth knowing: at most 2 rows (the Board's 3 findings counting the focus, minus the focus, `NEEDS_MAX`), the card note "{n} more read(s) in the Deep dive" from `moreReadsLine`; no dismissed row. D [03 §4]
6. Field card: present only when `field_n ≥ 5` (`state=fieldfew` has no field card and no field in the payload); the player's own mark and the field mean only; `dots` is null in the payload at every team size and the DOM has no `.ch-hf-dots i` for another player (`Object.keys` test). D [SHARED-11]
7. Insights come from `getInsightsForPlayer` (the real exposure). Standing and Deep dive stay as they are. D
8. No page HTML or response holds another player's id, name or figure (fixture with distinct teammate names, signed in as a demo player). D [SHARED-11]

### S-BOARD.focus
1. Suggested and Shown: kicker "Coach {name} suggests this as your focus" (name from `golf_coaches.full_name`; a failed read gives "Your coach"), Accept and Decline live (`acceptFocusArea`, `declineFocusArea`). D [02 §8]
2. Accepted: "Your focus since {date}", disabled. Declined: back to "Top of your list"; the plan line reads "You declined this on {date}". S
3. "Accepting", "Declining" while in flight; one success haptic; failure toasts as 06 §11. Swap per M-LNS-17. D, C

### S-BOARD.read
1. The evidence sheet in the player's words: "You", "Why CoachHelm thinks this", read word "Solid read", corrections Not this and Good read only, no footer. D, S

## Part 2. Motion rows

Every row in 07 (M-LNS-01 to 28) is checked with a clip pair at 390 and again with `reducedMotion: 'reduce'` (C). Pass when the app matches the row's duration and curve within one frame at 60fps, moves only the listed properties, and never runs anything on the "Never animates" list. Rows 03, 14, 22, 24 and 28 are DOM checks rather than clips. Rows 27 (toast) and 20 (rail swap) are not drawn on the page: compare against today's toast and `CH_ROUTE` instead.

## Part 3. Per PR

Every PR also passes `clubhouse:catalog -- --check`, `clubhouse:css`, `flags:check`, `npm test`, lint, typecheck and `playwright.clubhouse.config.ts`; adds a changelog fragment; keeps 02 §1's untouched files out of the diff; carries the `data-ch-hf-*` hooks from 05; is a draft PR behind the flag (SHARED-8); and meets SHARED-1 to SHARED-12.

PR 0. Private goals leak (alone)
- Must pass: today's coach Deep dive shows only goals the coach made or the player shared (`creator_role` coach or `shared_with_coach` true), read with the session client.
- Adds: a unit test that a private player goal never reaches a coach's shape.
- Done when: the test passes and the coach Deep dive matches 75b4956 otherwise.

PR 1. Shell, route, feature, reads, strokes, evidence sheet, preview route
- Must pass: S-LIST 1 to 3; S-FILE 1 to 16, 24 to 28; S-FILE.rail 1 to 5; S-FILE.focus 1, 3; S-FILE.undo 1 to 4; S-FILE.read 1 to 8; S-FILE.more 1 to 4; S-FILE.toast 1, 2; M-LNS-01 to 03, 07 to 09, 11 to 15, 18 to 20, 22, 24 to 28.
- Also: `coachhelm_player_file_v1` added as a release flag, false everywhere, registry regenerated; the preview route `/clubhouse-preview/coachhelm-player-file` with every state id in 05.
- Adds: `coachhelm-file-route.test.tsx` (redirects, `at`, `insight`), `coachhelm-file.test.ts` (one feed call, card failures, strokes shape), `coachhelm-file.test.tsx` (order, one feature card, chips, write arguments, corrections by role, left-border lint), one Playwright block at 390 × 844, 430 × 932 and 1280 × 800 in both motion settings.
- Done when: old links land on the matching card, `at` and `insight` open the right card or sheet, Assign, Dismiss and Undo behave as on today's Deep dive, and every S and C pair for these IDs is in the PR.

PR 2. Plan card with the handshake
- Must pass: S-FILE 17 to 20; S-FILE.focus 2, 4, 5; M-LNS-16.
- Adds: handshake unit tests (proposed, seen, accepted, declined, no insight), the Shown query chain test, goal vertex count, practice flag test; Playwright `nofocus`, `suggested`, `seen`, `declined` at 390 and 1280.
- Done when: the handshake matches the focus area's dates and Shown comes only from `player_feed` exposures after `created_at`.

PR 3. Last round in context
- Must pass: S-FILE 21 to 23; S-BOARD 6.
- Adds: field shape tests (coach dots at 3, 4 and 10, player `dots` null at every size, card null below 3 for the coach and below 5 for the player and lens, no ids in `Object.keys`), loader-off test; Playwright `nofield`.
- Done when: a player payload holds no teammate value at any team size and the coach card matches the design.

PR 4. Coach-only cards
- Must pass: S-FILE 29 to 31; S-FILE.plan 1 to 6; M-LNS-21, 23.
- Adds: intent null and session-client tests, player-shape exclusion test, track "Not measured yet" and delta tests; Playwright `nointent`.
- Done when: your plan and track record render for the coach as drawn and never reach a player's client.

PR 5a. Move the player-feed shaping
- Must pass: no screen change; `getInsightsForPlayer` returns the same ids, order and exposure count before and after; `shapePlayerFeed` makes zero `golf_insight_exposure` inserts.
- Adds: the contract test beside the insight-delivery tests. Reviewed by the owner of `insight-delivery.ts`.
- Done when: the contract test passes and the moved helpers carry no exposure write.

PR 5b. The lens
- Must pass: S-FILE.lens 1 to 10; M-LNS-04 to 06, 10.
- Adds: toggle-writes-nothing spy, lens DOM after the fold, firmness word, Working exclusion from the coach view, Accept no-op, `getInsightsForPlayer` throw mock, payload field test; Playwright toggle at 390 and 1280 in both motion settings.
- Done when: the lens matches the player's own board for the same fixture and writes nothing.

PR 6. Your week
- Must pass: S-BOARD 1 to 8; S-BOARD.focus 1 to 3; S-BOARD.read 1; M-LNS-17.
- Adds: player order, live Accept and Decline, "Your coach" fallback, the no-teammate-string HTML test; Playwright `viewer=player` at 390 and 1280.
- Done when: the player's board matches the design with live Accept and Decline and no teammate name or figure in its HTML or responses.

## Part 4. Side by side

1. For each screen ID and state the PR touches, run `node capture/capture.mjs --id <ID> --state <state>`. It shoots the design page and the app preview at the same width, theme and Text Size and writes `screenshots/<ID>__<state>__{design,app}__{light,dark}.png`. `--theme light` or `--theme dark` shoots one; `--side app` shoots only the build; leave `--state` off to shoot every state of the ID; join states with `+` (`--state long+desk`). States the page doesn't draw shoot the app side only and say so. `--list` prints every ID, state, page hash and fixture route. One browser, one dev server (SHARED-9).
2. Put each pair next to each other in the PR and check 06's redline numbers on both, within 2pt. The ones to check first: bar 98 and lip 16; lens control at 104, 42 tall; feature card at 170; page edge 16 (20 at 430); card gap 24; card head 50; feature padding 20; comparison cells 64.6; rows 64; plan dots 14; strokes track 22 with label column 108; field figure 40; sheet radius 20, max 86%, grabber 36 × 5 at 7; pill at 158; rail 300 and head avatar 52 on desktop.
3. For each motion row, run `node capture/capture.mjs --motion <M-ID>`. It records the design page and the app with Playwright `recordVideo` at 390 wide, then again with `reducedMotion: 'reduce'`, into `screenshots/<M-ID>__{design,app}__{full,reduce}.webm` (M-LNS-07's desktop dialog adds `__desk`; rows that share a clip get copies of one recording). `--motion all` runs every row; the six DOM-test rows (03, 09, 14, 22, 24, 28) are listed as skips. `--compare` then puts each still pair on one sheet in `screenshots/compare/`. Compare duration, curve and what moves; the reduced clips show 180ms fades only.
4. Check the player lens against `S-BOARD` for the same fixture by eye and with criterion S-FILE.lens 3.
5. List every pair and clip in the PR as matches, fixed, or can't match as drawn with the reason. Known ones: the page squashes the goal chart's labels (`preserveAspectRatio="none"`), the build doesn't (06 §3.3); the page's device is 402, so the 20pt edge at 430 is checked on the app shot alone; the toast and the rail swap are not drawn. A PR is done only when every listed screen matches within 2pt and every motion row matches.

## Completeness pass, 4 Nov 2026

One pass or fail criterion for every state added in 05's Completeness pass section, and for the shared read sheet. Check letters as above (S screenshot, D DOM, C clip). The PR each belongs to is in brackets.

1. CP-LNS-1 (S-FILE.off) [1]. With `coachhelm_player_file_v1` off, every entry (list row, roster profile, peek, notification, old links) goes where it goes today, with no redirect. D
2. CP-LNS-2 (player on a coach URL) [1]. A player opening `?view=player&player=X` gets their own S-BOARD with the query dropped by replace, and the network log shows no request for X. D
3. CP-LNS-3 (bad player id) [1]. A `player=` not on the coach's team opens today's not-on-team screen (CH-13311). D
4. CP-LNS-4 (S-FILE.read.gone) [1]. `insight=` that is gone, or another player's, opens the sheet with the gone card (CH-13861) and Close; the file under it draws; no figures of that read load. D, C
5. CP-LNS-5 (shared sheet, content) [1]. The evidence sheet matches the shared read sheet table below: grouped ground, section cards, close 34, head, chips, ladder at rest, cards, links, footer 44. The same fixture read in the Team sheet gives the same DOM order. D, S
6. CP-LNS-6 (shared sheet, Team row) [1]. The Team row draws only with a team pool, `coachhelm_team_pool_v1` on and 5 or more in the pool. D
7. CP-LNS-7 (shared sheet, links) [1]. "Open the full read" is present only with `coachhelm_read_v1` on and pushes Read (M-LNS-32); Ask is absent until Ask exports its href. D, C
8. CP-LNS-8 (gathering, no Tour, stale, part failed) [1]. Each draws as the contract says, at rest (M-LNS-31); stale and gathering show no Assign. D
9. CP-LNS-9 (S-FILE.plan.discard) [4]. With unsaved picks, a scrim tap, a swipe down or Esc keeps the sheet open and shows "Discard changes?" with Keep editing and Discard; with no changes they close at once; Cancel and X always discard at once. D, C
10. CP-LNS-10 (1024 to 1179) [1]. At 1100 × 800: rail 300 and one file column in phone order, no horizontal scroll; at 1180 two columns. S
11. CP-LNS-11 (821 to 1023) [1]. At 900 × 800: no rail; the list fills the main area and a row pushes the file (M-LNS-33); Back returns to the list. S, C
12. CP-LNS-12 (Back and restore) [1 (lens reset: 5b)]. Back to the list keeps its scroll; re-entering a file starts on "As you see it" at the top; Back from Read or Stats returns to the same scroll and lens. D
13. CP-LNS-13 (two devices, deleted mid-session) [1]. Assign made elsewhere shows on next load with no second write; a plan saved on two devices shows the later save; a read removed mid-session opens as gone. D
14. CP-LNS-14 (contrast on section cards) [1]. Every text on the sheet's section cards meets 4.5:1 in both themes (ink 17.08 / 14.34, ink-2 9.77 / 10.25, ink-3 6.61 / 6.99 on `--ch-card-bg`); chart marks meet 3:1. D
15. CP-LNS-15 (1 Aug rollover, dates) [1]. With the clock at 1 Aug and no new-season rounds the file is `empty`, with plan and track record still drawn; a round dated 2026-10-31 shows as 31 Oct at UTC−10 and UTC+13. D
16. CP-LNS-16 (keyboard and screen reader) [1 (lens keys: 5b)]. Tab order is bar, lens control, cards in order; the lens is a radio group with arrow keys; Esc closes the top sheet or menu and focus returns to the opener; the sheet is `role="dialog"` with `aria-labelledby` on its title. D
17. CP-LNS-17 (double submit) [1 (Save plan: 4)]. Two quick taps on Assign or Save plan send one write. D
18. CP-LNS-18 (rail data) [1]. The rail's rows come from `loadFileRoster`; when it shows each player's top read it takes it from Team's CT0 loader under CT0a's drawn-only rule, so no exposure is recorded for a read the rail doesn't draw. Until then the second line is the class year. D
19. CP-LNS-19 (motion parity) [1]. The sheet's open, close, drag and scrim clips match Team's M-TEAM-18 to 21 frame for frame. C
20. CP-LNS-20 (Stats link) [1]. "Full standing" goes to Stats with `&from=file` and no redirect back; each card names its window. D
21. CP-LNS-21 (pull to refresh, cold start) [1]. Refresh swaps cards in place with no chart redraw and the lens kept; a cold start shows the file with no push. C
22. CP-LNS-22 (`playerFileHref`) [1]. With `on` true it returns `/golf/dashboard/coachhelm?view=player&player=<id>` with `at` and `insight` when given and encoded ids; with `on` false (or omitted) it returns today's deep-dive or standing address byte for byte. A player session on a file URL gets their own CoachHelm and no request for that player. Unit test (02 Completeness pass). D
23. CP-LNS-23 (profile link) [1]. "Open {first}'s profile" goes to `/golf/dashboard/roster?player=<id>`; with the Roster lane's PR 8 in, it lands per their CP-7 and CP-21, and browser Back from the Roster list returns to the file at the same scroll. D


## Wiring, 4 Nov 2026

Pass or fail checks for the wiring in 06's section of the same name, checked against helmv3 `main` 03d9087. Each names the screen IDs it covers and its PR in brackets (0 is the goals fix, 5a the feed move). Shot tracking: nothing in this lane changes what shot tracking collects, stores or sends; W-LNS-20 proves it.

1. W-LNS-1 (S-FILE.plan, S-FILE, S-BOARD) [0]. A unit test gives `readPlans(…, coach viewer)` a player's private goal (`creator_role: 'player'`, `shared_with_coach: false`) and a goal on another team: neither reaches the coach's `ChDivePlan`, the file's plan card or today's coach Deep dive payload. The player's own `readPlans` still returns both of their goals.
2. W-LNS-2 (S-FILE, S-FILE.off) [1]. With `coachhelm_player_file_v1` off, `?view=deep-dive&player=X` renders today's `CoachPlayerPage`, `?view=player` renders the board, and `playerFileHref(id, at, false)` equals today's deep-dive, standing (`card: 'sg'`) and `&insight=` addresses byte for byte. With it on, the old addresses redirect to `?view=player&player=X&at=…` keeping `insight`, and `from=file` does not redirect.
3. W-LNS-3 (S-FILE) [1]. One file view makes one `getInsightsForCoach` call (spy) and records one `coach_feed` exposure set, the same rows Deep dive records today.
4. W-LNS-4 (S-FILE.lens) [5b]. Building and toggling the lens calls neither `getInsightsForPlayer` (module mock throws) nor any write, and adds no `golf_insight_exposure` row; the lens payload holds no `intent`, `track`, cause, `dots`, ladder, `q` or shrink field.
5. W-LNS-5 (S-FILE.focus) [2]. Shown to {first} comes only from a `player_feed` exposure on the focus's `from_insight_id` at or after the focus's `created_at`; with no `from_insight_id` it shows a dash. Opening the file as a coach never makes the step tick (W-LNS-4).
6. W-LNS-6 (S-FILE, S-FILE.read) [1]. Assign on the feature card and in the sheet sends the same `ChFocusTarget` as `FocusActions` on the old board for the same read (spy); "Assigned" shows only after success; failure CH-13001; duplicate shows "{first} already has a focus on this"; two quick taps send one request.
7. W-LNS-7 (S-FILE.undo, S-FILE.read) [1]. Dismiss calls `dismissInsight` (`insights-feed.ts:681`) and Undo `reactivateInsight(id, lifecycle, 'dismiss')` (790); failures CH-13002 and CH-13003 leave the row as it was.
8. W-LNS-8 (S-FILE.plan) [4]. Save plan calls `setIntent` once with the picks and the note (at most 2000 characters); "Saving" while in flight; success closes the sheet and the card shows the saved values with no `router.refresh()` and no new exposure row; failure shows CH-13760 with the picks kept.
9. W-LNS-9 (S-FILE intent and track cards) [4]. `loadFileIntent` reads with the session client (admin import mocked to throw); no row gives "No plan set", never `loadIntent`'s default. No shape built for a player or the lens contains `intent` or `track`.
10. W-LNS-10 (S-FILE field card, S-BOARD) [3]. The coach's field card carries `dots` as numbers only (`Object.keys` has no id or name) at any field size; a player's and the lens's card has `dots: null` and is null when `field_n` is under 5; with `coachhelm_team_pattern_v1` off the loader is not called.
11. W-LNS-11 (S-FILE SG card) [1]. Vs team only when every row has `team_n >= 5`, otherwise vs Tour with the meta saying so; reads lifetime standing while the season table migration is held.
12. W-LNS-12 (S-FILE.read) [1]. The evidence sheet is Team's `ReadPanel`, imported, with nothing of Lenses' own inside it; a player's Why never shows a likely cause (Read CR0). "Open the full read" is absent with `coachhelm_read_v1` off; "Ask about this" absent while `askAboutHref` returns null.
13. W-LNS-13 (S-FILE.read.gone) [1]. An `insight=` not on this player's list opens the gone card (CH-13861) and loads no figures of that read; a `player=` off the team gives CH-13311 before any feed call.
14. W-LNS-14 (S-BOARD.focus) [6]. Accept calls `acceptFocusArea(id)` and Decline `declineFocusArea(id)` through today's `ProposalRow`; failures show CH-13004 and CH-13005 with the buttons kept; neither sends the coach a notification; the coach's handshake shows Accepted or Declined on next load.
15. W-LNS-15 (S-BOARD) [6]. The player's page HTML contains no string from a fixture teammate's name or id; the coach name failing gives "Your coach".
16. W-LNS-16 (S-FILE.more) [1]. "Open {first}'s profile" links `/golf/dashboard/roster?player={id}`; "Message {first}" links `/golf/dashboard/messages?player={id}` with an empty body; the menu is absent from every player DOM.
17. W-LNS-17 (S-FILE.rail) [1]. A rail tap swaps the file with `replace` and records one `coach_feed` set for the new player; the rail records no `roster_card` exposure.
18. W-LNS-18 (S-FILE.focus) [1]. After Assign, the player gets one `dev_plan_assigned` bell row and, only with `email_task_reminders` on, one email; no push.
19. W-LNS-19 (S-FILE, S-BOARD) [1]. No client module imports `isFlagEnabled`; `on` values for `playerFileHref` and `readHref` come from the server.
20. W-LNS-20 (all screens) [1]. The lane's diff adds no query against `golf_shots`, no write beyond the six listed actions, no realtime channel and no file under `supabase/migrations/`.
21. W-LNS-21 (S-FILE) [5a]. After the feed move, `getInsightsForPlayer` returns the same ids in the same order and records the same exposure rows as before for the existing fixtures; `shapePlayerFeed` writes nothing.
