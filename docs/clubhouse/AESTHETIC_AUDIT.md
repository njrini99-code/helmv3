# Clubhouse aesthetic audit

The owner's targeted aesthetic audit
(`GolfHelm_Targeted_Aesthetic_Audit_and_Implementation_Guide.md`, 2026-10-01)
run on branch `agent/swap-audit` (PR #2111). The brief is the guide's section 3:
a calm green-and-cream Clubhouse, strong readability, restrained depth, glass
and shadow only where they explain layering, behavior unchanged. The order is
the guide's section 11, one screen family at a time: capture, critique, validate
against the live preview and the source, three changes at most, fix in the
canonical component or token, capture the same states again.

Every record keeps two verdicts apart, as the guide's section 9 asks.
**Measured** means a number from the rendered page (computed contrast, a box, a
hit test). **Design judgment** means a call about composition that a number does
not settle. Owner decisions stand: the ivory ladder and role depth (Q-142), the
12px phone floor (Q-141), the boards in `design/handoff/`, red only for under
par (D-42). Where the audit argues with one, it is an owner question in
`PROGRESS.md` (Q-147 to Q-152) and is not built.

## How it was run

- **Screens.** The `/clubhouse-preview/<screen>` routes: the real components on
  the handoff's synthetic fixtures (fictional people), so a before and an after
  show identical data. A manifest entry names the real route in `route` and the
  preview URL in `fixture`. The preview shows the coach and player variants
  where the page has both; the Messages preview is coach-only (the player's
  inbox is not captured).
- **Capture.** `scripts/clubhouse/aesthetic-capture.mjs` (Playwright, Chromium,
  local dev server, 2x density, reduced motion, fonts ready, dev badge hidden,
  no zoom): 375, 390 and 430 wide for the phone layout and 1440x1000 for the
  desktop. Files are named and filed by `scripts/clubhouse/shots.mjs`
  (`P###__surface__role__viewport__state__phase__sha7.png`, in
  `.helm/screenshots/clubhouse/`, never committed) and listed in each page's
  VERIFY.md "Screenshots". The sha7 is the commit the code was at: `baseline` is
  the whole app before the audit (`ee5976d`); `before` is recaptured when a
  family starts, so a shared change made for an earlier family is not credited
  to a later one; `after` is the code commit of the family.
- **Geometry report** (in each manifest entry): horizontal overflow, text
  clipped without an ellipsis, elements past the viewport edge (a scroller's
  children excepted), touch targets whose hit area is under 44px (`MOBILE.md`; a
  `::before` that enlarges the target counts, found by hit test), and initials
  running under the next coin.
- **Tools.** Free tools only, nothing paid, only these synthetic captures
  uploaded. See "External tools" below. Sakaax ux-pilot needs `/plugin`, which a
  session cannot run, so its audit role was done with Playwright screenshots and
  computed styles; injected-CSS experiments in Playwright stood in for VisBug.

## Result

| Family | Page | Built | Left as an owner question | Code commit | Before and after |
| --- | --- | --- | --- | --- | --- |
| Messages list | P007 | M-L1 ink ramp, M-L2 unread rows, M-L3 placeholders | Q-148 chips, Q-149 group discs | `ba75b0a24` | `ee5976d` baseline, `ba75b0a` after |
| Messages thread | P007 | M-T1 avatar initials floor | none | `f724065db` | `ba75b0a` before, `f724065` after |
| Home | P002 | H-1 stacked coins, H-2 latest-round stats | Q-150 conflict marker | `4e01c43d8` | `f724065` before, `4e01c43` after |
| Shot tracking | P011 | S-1 phone gutters and strip bleed | Q-151 strip chips, map digits | `cee8548a0` | `4e01c43` before, `cee8548` after |
| Calendar | P006 | C-1 shared-column events, C-2 audience coins | none | `2b0486765` | `cee8548` before, `2b04867` after |
| Qualifiers | P009 | nothing (no defect found) | Q-148 chips | none | `ee5976d` baseline, `2b04867` before |
| CoachHelm | P013 | CH-1 metric label leading | Q-148 chips | `6f5f08123` | `2b04867` before, `6f5f081` after |
| Contrast sweep | P002, P006, P007, P011, P013 | X-1 segmented labels, X-2 week labels, X-3 event times, X-4 shot strip and options | Q-152 past-event fade | `d4367ee` | `d3a6483` before, `d4367ee` after (390 and 1440) |

The shared changes (M-L1, M-L3, M-T1 in `tokens.css`, `controls.css`, `ui.css`)
reach every page. They are one decision, Q-147, and each is one rule to revert.
A page-by-page change is in that page's CHANGELOG.md.

## Messages list (P007)

Primary task: find the right conversation and see what is new. Attention order:
who or what group, unread activity and a preview, the time.

### M-L1 The phone ink ramp has no step (built)

- **Issue and source.** The guide's section 7.1: check whether every element is
  nearly the same gray. Own measurement.
- **Measured.** Tertiary text was raised to `#5f5c55` to hold 4.5:1 on the
  darker phone page (a comment in `tokens.css` says so), which left it 1.1
  contrast points under secondary `#55524b`: 7.4 and 6.3 on a card. A preview, a
  time and a caption read as one gray. The desktop ramp is 7.4 against 5.3.
- **Design judgment.** One more step in the ramp lets the name, the preview and
  the time read as three things.
- **Live inspection.** Confirmed on the preview at 390px (computed colors
  above). 27 rules read `--ch-ink-600` directly and `--ch-text-secondary` reads
  it too, so the change is one token.
- **Change and token.** `tokens.css`, phone block: `--ch-ink-600: #46433d`, 9.3
  against tertiary's 6.3. Desktop unchanged.
- **Confidence.** Confirmed (the measurement); likely (that it improves the
  screen, see the pair).
- **Before and after.** `P007__list__coach__390__default__baseline__ee5976d.png`
  and `P007__list__coach__390__default__after__ba75b0a.png` (375, 430 and 1440
  likewise).
- **Regression checks.** `messages.test.tsx` 66 of 66; every later family was
  recaptured as `before` after this change; no contrast fell (every text token
  on the phone is at least as dark).
- **Verdict.** Accepted.

### M-L2 Unread rows barely differ from read rows (built)

- **Measured.** Unread name 600 against read 500; unread preview 7.4:1 against
  read 6.3:1; the time in green and a count badge. After M-L1 the preview step
  is larger; the name is 700 and the unread preview `--ch-ink-700` (11.1:1)
  against a read preview at 6.3:1 and a name at 500.
- **Design judgment.** The cue never relied on color alone (weight and the badge
  carry it); it needed more weight than 100 units.
- **Change.** `messages.css`: `.ch-ms-row.is-unread` name 700, preview
  `--ch-ink-700` (phone and desktop rail).
- **Pair.** The two unread rows (Varsity team, Jonah Okafor) against the two
  read ones, same list.
- **Verdict.** Accepted (design judgment; revertible in two declarations).

### M-L3 The search placeholder fails 4.5:1 (built)

- **Measured.** Placeholder `#8f8b81` (`--ch-ink-400`) on the phone page
  `#ede8dc`: 2.78:1 (the field is darker still). The composer's placeholder
  already used tertiary. `.ch-search`, `.ch-input` and `.ch-textarea` shared the
  rule.
- **Change.** `controls.css`: those placeholders use `--ch-text-tertiary`: 5.5:1
  on the phone page, 6.3:1 on a card, and still lighter than typed text (16:1).
  Every search and input in Clubhouse takes it.
- **Not changed.** Other placeholder rules (`auth.css`, `onboard.css`,
  `settings.css`, Ask's composer, Calendar's event title) have their own colors
  and were not measured in this pass.
- **Verdict.** Accepted.

### Rejected or deferred (Messages list)

- **The thread title ring on first paint (rejected, a capture artifact).** The
  pushed thread's title shows a green outline in a fresh load: programmatic
  focus after navigation shows `:focus-visible` when nothing was tapped. A tap
  does not show it. The harness now blurs the focused element before a resting
  capture.
- **Phone filter chip selected state (owner question, Q-148).** Selected and
  unselected fills are within 1.0 to 1.07 in contrast; a shadow and a green 600
  carry the difference. Qualifiers' pills (mint tint and ring) and CoachHelm's
  chips (solid green) are clearer. All three are the owner's boards.
- **Group disc weight (owner question, Q-149).** A group is a solid green disc
  (board `.m-grp`), so the heaviest mark on the screen can belong to a read
  group while the unread person has the faintest.
- **Touch targets (passed).** The 34px chips and the 34px send button are
  enlarged to 44px by `::before`; the hit test confirms.

## Messages thread (P007)

Primary task: read the exchange and send with confidence. Attention order:
message text, the speaker, the composer.

### M-T1 Avatar initials under the phone's 12px floor (built)

- **Measured.** A thread's 30px coin draws its initials at 10.2px (34% of the
  coin); Q-141 and the phone audit (`HIGH_FIDELITY_AUDIT.md`) say no coach text
  is under 12px. A scan of the seven families at 390px found no other text under
  12px except the tab labels (11.5px, a recorded exception) and the shot map's
  SVG numbers (7.5px, Q-151). Home's 24px stack coins also draw 10px initials; a
  coin that small has no room for 12px, so it takes the 42% rule below.
- **Change.** `ui.css`, phone: font-size is the larger of 34% of the coin and
  the smaller of 12px and 42% of it. A 30px coin takes 12px; a 24px coin takes
  10px (it had 8px); 44px coins are unchanged. Shared by every phone page.
- **Verdict.** Accepted. The thread's other states passed: message text is 17px
  at 16:1, sender names 8:1, the composer is a 44px field with a visible green
  focus edge, outgoing and incoming bubbles differ by fill and tail.
- **Not tested.** The keyboard-open state (Chromium has no soft keyboard),
  pending and failed sends (the preview does not produce them), a long link.

## Home (P002)

Primary task: see what matters now and the next useful action. Coach order: the
brief, today's next event, the week, the latest round, the leaderboard. Player
order: the next event, the post-a-round action, the week.

### H-1 Stacked coins hide their initials (built)

- **Measured.** The coach hero's five coins (24px, 7px overlap) put the last
  stroke of four initials under the next coin by 1.6 to 3.3px (Range measurement
  on the rendered glyphs; "TM" reads "TN"). The geometry report flagged TM, SA,
  AL, JO at 375, 390 and 430 before and nothing after.
- **Change.** `home.css`: the overlap is 4px.
- **Verdict.** Accepted.

### H-2 The latest round's stats float 171px to 234px below the scorecard (built, design judgment)

- **Measured.** At 1440x1000 the stats row is pinned to the sheet's bottom:
  171px under the scorecard for the coach and 234px for the player, 38% and 46%
  of the column, because the week beside it runs longer.
- **Design judgment.** A stats row that summarizes the scorecard reads as part
  of it; a gap in the middle reads as missing content. The space is still there
  (at the bottom of the sheet); filling it is new content, not styling.
- **Change.** `home.css`: `.ch-h-round__foot` has `margin-top: 4px` instead of
  `auto`.
- **Verdict.** Revised: better cohesion, the emptiness remains. One rule to
  revert if the owner prefers the pinned row.

### Deferred (Home)

- **The icon-only conflict triangle (owner question, Q-150).** Its tooltip does
  not show on touch; a word beside it is copy.
- **The hero brief's emphasis (rejected).** The brief is 16px secondary ink at
  6.5:1 on desktop, and the phone hero's text is 5.1 to 7.6:1 (computed from its
  alpha over the hero green, not sampled); making it louder would be a taste
  change with no measured fault.

## Shot tracking (P011)

Primary task: record a shot, see progress, keep the round. The screen is
player-only. Order: the hole and distance, the shot result, the next action.

### S-1 The phone's gutters never applied (built)

- **Measured.** At 390px `.ch-rt` has padding 28px and its cards are 335px wide;
  the strip (margin -12px, `border-radius: 0`, drawn to bleed) runs from x16 to
  x374. The board (`rounds-track.css`) has padding `0 12px` at the phone width,
  which would put the cards at 366px and the strip edge to edge.
- **Cause.** The phone rule `.ch-rt { padding: 4px 12px 0 }` is inside
  `@container chrt`, and `.ch-rt` is itself the container named `chrt`. A
  container query never matches its own container, so the rule never ran. The
  board's container is outside `.rt`.
- **Change.** `RoundTracking.tsx` wraps the screen in `.ch-rt-q`;
  `rounds-track.css` moves `container-type` and `container-name` to it. Desktop
  is unchanged (checked at 1440).
- **Verdict.** Accepted: confirmed, and it is the highest-impact single change
  of the audit (the first phone screen of a round).

### Deferred (Shot tracking)

- **The strip's 34px chips and the map's 7.5px shot numbers (owner question,
  Q-151).** The 34px chip is the board's; `MOBILE.md` says 44px; the chips
  cannot enlarge their hit area without overlapping each other.
- **The checkpoint-failed capture (dropped).** `?state=checkpointfail` renders
  the same as the putt step, so it shows nothing; the submit-failed overlay
  replaced it. It reads "The round didn't submit. It's saved on this device."
  with a Try again button: the save status is explicit and true.
- **Not tested.** Large values, repeated taps, landscape and short-height
  layouts, and save, exit, reload and resume against real data: the change is a
  wrapper and a stylesheet, but those checks belong to a run on the local stack.

## Calendar (P006)

Primary task: see the week, find an event, add one. Order: today and the
selected day, event title and time.

### C-1 Events that share a column are unreadable (built)

- **Measured.** At 1440 the week view lays a three-way overlap in 29px of text.
  15 labels were under half visible, titles such as "Short-game block" at 27%
  and "1:1 with Jonah" at 23% ("Sh...", "Te...").
- **Change.** `views.tsx` adds `ch-ev--lane` to a block that shares its column
  and gives it the start time only; `calendar.css` gives it 5px padding and a
  three-line wrapped title (a short one keeps its row, drops the time). The full
  range stays in the button's accessible name and the side panel. Under half
  visible: 15 to 4 (a qualifier chip, two location lines in wide blocks, one
  35px lane).
- **Verdict.** Accepted. `calendar.test.tsx` 83 of 83.

### C-2 The audience coins hide their initials (built)

- **Measured.** 26px coins, 8px overlap, 9px initials running 20px into the
  coin. The same defect as H-1.
- **Change.** `calendar.css`: the overlap is 5px. **Verdict.** Accepted.

### Passed

Class and busy blocks hold 5.2:1 and 5.95:1; today and the selected day are
different (a filled disc and a raised card); the phone day view is legible.

## Qualifiers (P009)

Primary task: see who is qualifying and why. The desktop leaderboard (rank,
player, rounds, total, to par, status) is aligned and legible, the top-score and
travel-cut lines explain the cut, red is only under par. No measured fault in
the geometry report or the contrast probes. The phone row is 117px tall (the
board's stats well; about 3.5 rows a screen) and repeats a "Qualifying" badge on
each row; both are the board's and neither is wrong. Nothing built. The filter
pills are the clearer selected state of the three (Q-148).

## CoachHelm (P013)

Primary task: see which players need attention and why. Order: the signal, the
evidence, the action.

### CH-1 A two-line metric label touches itself (built)

- **Measured.** `.ch-hl-ev__l` is 12.5px at line-height 1.0; "Downhill penalty
  vs level putts (distance-controlled)" wraps to two lines at 286px and the
  lines touch (a 25px box for two lines).
- **Change.** `coachhelm.css`: line-height 1.3. No logic, data or
  `src/lib/coachhelm` file changed.
- **Verdict.** Accepted.

### Rejected (CoachHelm)

- **"Clipped h2" in the geometry report (false positive).** A visually hidden
  1x1 heading ("By player"); the harness now ignores elements under 2px.
- **The Program pulse card's empty space (rejected).** It is a reserved height
  (197px) so nothing below moves when the rows land (`PAGE_PERFORMANCE.md`).

## External tools

All free, nothing paid, only the synthetic preview captures (fictional people,
no emails) uploaded. A background run of a general-purpose agent did the
browsing; it checked each image before upload.

| Tool | Result | Verdict |
| --- | --- | --- |
| UX360 design critique | Its AI never answered on any of the seven images ("The AI did not answer this time"; the critique endpoint returned 503, with no budget wording, on the first try and one retry). The measured checks ran on all seven. | Measured checks accepted, below; no AI opinion to weigh. |
| Blur Test (free roast) | Three roasts an hour is the cap, so 3 of 7 were run: dashboard 81, shot tracking 82, CoachHelm 68 out of 100. The $5 credit offer was not touched. The site says it stores uploads; three result pages exist (blurtest.com/roast/b133c16e-b5db-435d-b95a-a2f7c28477b9, c31cf800-e0cd-41ab-bab0-343c86a9a344, d1fb4472-395f-4344-8ff3-f10bde234620). | Mostly rejected, below. |
| Pixelait | Skipped: no free account was signed in and the Chrome extension was not connected; no account created. | Not run. |
| Sakaax ux-pilot | Needs `/plugin`, which a session cannot run. | Done by hand with Playwright screenshots, computed styles and the sweep. |
| VisBug | Not installed; injected CSS in Playwright tried the stack overlaps and the footer. | Substituted. |

UX360's measured checks, each confirmed or not against the live computed style
(the guide's section 5A step 5):

- **Messages list: search placeholder 2.5:1.** Confirmed, and it is M-L3.
- **Messages thread: nothing reads as a heading (the largest text 3% above
  body).** Rejected: a chat has no headings; the title is 17px 600 and the
  messages are 17px 400, by design.
- **Dashboard: weekday labels 3.7:1.** Confirmed at 4.1:1 computed on the
  gradient (UX360 sampled the anti-aliased glyph); X-2.
- **Dashboard: scorecard "Par" and "35" 3.8:1.** Rejected: computed `#6b6860` on
  `#eeebe2` is 4.7:1; the lower figure is the sampled glyph color. It is close
  to the line; the sweep did not flag it.
- **Calendar: four failures on class and busy rows.** Confirmed: they are the
  past-event fade (3.6:1, 2.3:1), Q-152; the times on the week view's class and
  busy blocks are X-3.
- **Shot tracking, qualifier leaderboard, CoachHelm:** nothing to fix. The sweep
  did find the shot strip (X-4); UX360 did not.

Blur Test's opinions, none of them measured:

- **Dashboard.** "The Latest round scorecard dominates; collapse it." Rejected
  (the board's composition; H-2 changed only the stats row). "No legend for the
  circles and squares." Noted, not built (golf's own notation; a legend is new
  content). "Calendar dots and sidebar icons too small to tap." Rejected: a
  desktop render, and the guide's own caution on touch advice.
- **Shot tracking.** "The 142 yards hero is strong." Agreed, nothing to do.
  "Result buttons equal weight and cramped; no selected state." Rejected: the
  screen is before a selection, and the options are equal choices; it also
  misread "Shot 2" as sitting on a dark header.
- **CoachHelm.** "Program pulse dominates with four equal alerts." Rejected: the
  overview is the page's first job and its height is reserved on purpose. "The
  player pills are small and the last is cropped." Rejected: a horizontal
  scroller that shows its edge on purpose. "Dark Eli against outline Jonah reads
  as favoritism." Rejected: it is selected against unselected (Q-148 is the chip
  language). "The bell's 3 duplicates '3 players'." Rejected: speculation.

Two AI tools agreeing is not proof, and here one never answered: no change rests
on an AI opinion alone.

## Contrast sweep (cross-family)

UX360's measured checks (above) found three contrast failures that this audit's
first probes had missed: they had looked at the elements the screenshots
suggested, not at every text node. A sweep was added: for every text node on the
seven families at 390 and 1440, the computed color is composited over its
backgrounds (gradients and opacity included) and compared with 4.5:1 (3:1 for
large text). It is a computed number, not a pixel sample. It handles vertical
gradients only, so one horizontal-gradient result (a "Practice green" line on
Home's player timeline) was dropped as a false positive, and disabled controls
are exempt (the "Next shot" button reads 1.5:1 at rest, by design).

### X-1 Segmented labels on the well (built, measured)

- **Measured.** The unselected label of every segmented control is `#6f6a5f` on
  the well's gradient: 4.1:1 at 12.5px to 13px (Messages on desktop, the
  Calendar view switcher on phone and desktop, CoachHelm Board and Ask,
  CoachHelm's views, Home's Last 5 and Last 20).
- **Change.** `controls.css`: `.ch-seg__b` uses `--ch-text-secondary` (5.4:1 on
  the well). The selected label is still green 600.
- **Verdict.** Accepted: one shared rule, five pages. **Confidence.** Confirmed.

### X-2 Home's weekday labels (built, measured)

- **Measured.** Tertiary ink on the week strip's gradient: 4.1:1 at 11.5px;
  UX360 sampled 3.7:1 (`#706d65` on `#e0dbcf`).
- **Change.** `home.css`: `.ch-h-day__d` uses secondary ink. **Verdict.**
  Accepted.

### X-3 Event times on class and busy blocks (built, measured)

- **Measured.** The time line of a week-view block is faded to 0.82: 3.6:1 on a
  class block and 4.0:1 on a busy block.
- **Change.** `calendar.css`: on those two types it keeps its own color (5.2:1
  and 6.0:1). **Verdict.** Accepted.

### X-4 The shot strip and result options (built, measured)

- **Measured.** The par over a hole not yet played (ivory at 0.5) is 3.8:1 on
  the strip's green; "Thru" is 4.3:1; a result option's note ("not fringe") and
  the rare options are `#8a857a` on the well, 3.2:1.
- **Change.** `rounds-track.css`: the strip labels are 0.66 (4.5:1 or more); the
  note and rare options use tertiary ink (4.7:1).
- **Verdict.** Accepted.

### Past events fade to 2.3:1 to 3.6:1 (owner question, Q-152)

- **Measured.** Every past row of the phone Calendar sits at opacity 0.55 (title
  3.6:1, times and place 2.3:1); the board does the same for the agenda (0.5)
  and Home's timeline (0.45). UX360 measured the same on the Calendar phone
  image.
- **Not built.** The recession is the owner's board, a deliberate state.
  Recommended in Q-152: fade the row's surface, keep the text at 4.5:1, and let
  the "now" line carry the split.

## Not tested

- A real iPhone, the installed app, Safari, the keyboard-open state, zoom and
  text enlargement. Everything above is Chromium on a desktop with phone-width
  viewports.
- The Messages player inbox (the preview has no player variant), pending and
  failed message states, hover and press states, motion, and any state the
  preview routes do not render.
- Shot tracking's save, exit, reload and resume against real data.
