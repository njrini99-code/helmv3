# CoachHelm Lenses: fidelity spec

> Read 05 to 08 first (3 Nov). `05-SCREENS.md`, `06-SCREEN-SPECS.md`, `07-MOTION.md` and `08-ACCEPTANCE.md` are the build contract, with `../ACCEPTANCE-SHARED.md` over them. Where this file differs from them, they win. Two changes matter most: Reduce Motion is the app's 180ms fade (`CH_FADE_MS`, SHARED-6), not 120ms; and the feature card is flat green with no corner highlight (SHARED-2).

The design page is the drawing. This file turns it into numbers, states, taps and motion a builder can match one for one, and the check that proves the build matches. Where this file and the page disagree, the page wins and this file is the bug. Where the page and the app's own tokens disagree, this file says which wins (section 8).

Source of truth for every value: `redesign/coachhelm-lenses.html` (the page) and `redesign/redesign.css` (its CSS pulled out, with each block mapped to its app home). Values below are copied from those files, not retyped from memory.

Read with: `../DESIGN_LANGUAGE.md` (house rules), `02-PLAN.md` (files and selectors), `03-DATA-CHECKS.md` (where each number comes from).

## 1. Capture links

Every state on the page has a link. Open the page with a hash and it lands on that exact state, ready to screenshot. The capture script uses the same hashes.

Shape: `#<screen>-<token>-<token>...`

- screen: `list` (coach CoachHelm list on phone), `file` (one player's file, coach side), `board` (the player's own CoachHelm)
- device: `phone` (default) or `desktop`
- theme: `light` (default) or `dark`
- lens: `lens` (coach on the file, flipped to "As Eli sees it")
- overlays: `sheet` (a read's evidence), `intent` (the coach's plan sheet)
- focus stage: `nofocus`, `suggested`, `seen`, `accepted` (default accepted on file and board)
- data state: `loading`, `early`, `empty`, `failed`, `long`, `nofield`, `nointent` (default normal)
- type size: `larger` (k 1.18), `xxl` (k 1.36)
- motion: `reduce`

Examples:

| Link | What it shows |
|---|---|
| `#file` | Coach, phone, light, Eli's file, focus accepted |
| `#file-lens` | Same file flipped to As Eli sees it, preview pill showing |
| `#file-sheet-dark` | Penalty read's evidence sheet open, dark |
| `#file-intent` | Your plan for Eli sheet open |
| `#file-early` | Early season: 2 rounds, progress 2 of 3, no reads yet |
| `#file-desktop` | Desktop: sidebar, glass top bar, player rail, two column file |
| `#board-suggested` | Player's own CoachHelm with a suggested focus to accept |
| `#board-xxl` | Player board at XXL text |
| `#file-long-xxl` | Long name and long course name at XXL, checks every ellipsis |

The caption under the device on the page always shows the current hash.

## 2. Tokens: page name to app name

The page uses short `--a-*` names so it can run on its own. In the app, use the app token on the right. Never paste a hex into a component.

| Page token | Light | Dark | App token |
|---|---|---|---|
| `--a-page` | #f2f0e9 | #0e120f | grouped background (DESIGN_LANGUAGE §3 `bg.grouped`) |
| `--a-card` | #fffefb | #191e1a | card surface |
| `--a-well` | #f6f4ee | #141815 | flat well |
| `--a-ink` | #1c1b18 | #f1ecdf | text primary |
| `--a-ink-2` | #46433d | #d0c9b8 | text secondary |
| `--a-ink-3` | #5f5c55 | #ada697 | text tertiary |
| `--a-gain` | #14613d | #7cc79b | gain |
| `--a-loss` | #9a5700 | #e7ae57 | loss (amber, never red) |
| `--a-accent` | #155a39 | #7cc79b | accent |
| `--a-sep` | rgb(28 27 24 / .10) | rgb(241 236 223 / .10) | separator |
| `--a-ring` | rgb(28 27 24 / .07) | rgb(255 255 255 / .06) | card ring |
| `--a-shadow` | ring + `0 1px 2px rgb(28 25 18/.05), 0 8px 20px -12px rgb(28 25 18/.12)` | ring + `inset 0 1px 0 rgb(255 255 255/.04)` | card shadow |
| `--a-frame` | #0a331f | #08150e | `--ch-frame` |
| `--a-frame-ink` | #f4eedd | same | `--ch-on-green-ink` |
| `--a-frame-icon` | rgb(240 233 214 / .86) | same | `--ch-on-green-ink-soft` |
| `--a-champ` | #dccda6 | same | `--ch-champagne-300` (pushed bar back button) |
| `--a-feat` | #0b3a25 | #123d29 | `--ch-green-800` under `--ch-feature-bg` |
| `--a-feat-1` / `-2` | #f4f1e8 / #d3d9cb | same | feature card text 1 and 2 |
| `--a-feat-gain` / `-loss` | #8fd3aa / #edb867 | same | feature card gain and loss |
| `--a-glass` | rgb(253 251 247 / .86) | rgb(22 27 23 / .86) | glass (preview pill, desktop top bar) |
| `--a-scrim` | rgb(28 30 24 / .28) | rgb(0 0 0 / .5) | sheet scrim |
| `--a-press` | rgb(28 27 24 / .05) | rgb(241 236 223 / .06) | row press |
| `--c-gain` `--c-loss` `--c-neutral` `--c-track` | #1f6b45 #b86f0c #6b675f #ebe5d8 | #4fa877 #e09a35 #a39d90 #2c322d | chart marks (track is the new `--ch-chart-track`) |

Contrast: every text pair above was picked at 4.9:1 or better on its own surface in both themes. Feature card secondary text #d3d9cb on #0b3a25 is the tightest pair; check it in the fidelity run (section 9), floor 4.5:1.

## 3. Type, spacing, shape

All sizes follow iPhone Text Size: every size below is `calc(Npx * var(--ch-type-k))` in the app (`--k` on the page). Line heights are unitless so they scale too.

| Role | Size / weight / line | Colour |
|---|---|---|
| Large title (CoachHelm, Your week, desktop name) | as today's `.lt` large title | ink |
| Context line under title | 15 / 400 / 1.33 | ink-2 |
| Card title `h4` | as today's card title, inside the card | ink |
| Card right label `small` | 15 / 400 / 1.33, one line, ellipsis | ink-2 |
| Row title / sub | row title as today; sub 15 / 400 / 1.33, one line, ellipsis | ink / ink-2 |
| Feature card who line, kicker | 15 / 500 / 1.3 | feat-2, name feat-1 600 |
| Feature body | 15 / 400 / 1.42 | feat-2, bold feat-1 600 |
| Evidence chips on feature | 13 / 600 / 1.3, pad 4 9, radius 7, bg white 10% | feat-1 |
| Field figure | 40 / 500 / 1, stretch 92%, tracking -0.04em, tabular | gain (level: ink) |
| Sheet title | 22 / 600 / 1.2, tracking -0.02em | ink |
| Well heading `h5` | 15 / 600 / 1.3 | ink |
| Axis and small labels | 13 / 400 | ink-3 |
| Segmented label | 14 / 500 / 1.1 | ink-2, selected per today's Segmented |
| Correction and pick buttons | 14 / 500, min height 36, pad 0 12, radius 10 | ink |

Numbers that line up (scores, strokes, counts, dates in wells) use `font-variant-numeric: tabular-nums`.

Spacing and shape:

- Page edge 16px on phone, 20px at 414pt and wider (owner rule, Oct 24).
- Card radius 16, overflow hidden. Card header padding as today's card. Card note (`.card__n`) 12 16 16 with a hairline above.
- Rows: min height 64, pad 10 16, gap 12, hairline inset 16 from the left. Icon tile 28 square, radius 8.
- Feature card: radius 16, pad 20, gap 12, flat green, no highlight (the corner radial was removed for SHARED-2; 06 §3.2).
- Wells: radius 12, pad 14, inset shadow `0 1px 2px rgb(28 25 18/.06)`. Drill well pad 12.
- Sheet: radius 20 20 0 0 on phone, max height 86%, grab handle 36 by 5 at 7 from the top. Desktop: centred 480 wide, radius 20, no grab. Header pad 14 20 8. Body pad 4 16 34, gap 16. Footer pad 12 16 34 (desktop 16), hairline above, two buttons that share the width.
- Close button 32 round on well.
- Preview pill: radius 999, pad 8 14 8 10, solid `--ch-card-bg` with its ring (glass withdrawn 3 Nov: never behind data; 06 §5), sticky under the segmented (phone top 158, desktop top 12).
- No accent left border on anything. Coach-only cards are marked with the lock glyph and "Only you" in the header, never with a coloured edge.

## 4. Components

Each item says what it is built from. Reuse first; new parts are marked new.

- Top bar, list: today's green bar with the CoachHelm switcher and bell. Unchanged.
- Top bar, pushed file: today's pushed bar (`.ch-pbar`). Back reads "CoachHelm" in champagne 300, title is the player's name centred, one line with an ellipsis, columns 120 / 1fr / 120 so the title stays centred with a long name. More button on the right.
- Lens control: today's `Segmented`, two options, "Coach view" and "As {first name} sees it". Sticky at the top of the file. Not shown in the failed state.
- Preview pill (new): "Previewing {first name}'s screen" with the eye glyph. Only in the player lens.
- Feature card: today's feature card on `--ch-feature-bg`, tappable as a whole (opens the read's evidence), press scale 0.97. Holds the top read: who line, kicker, comparison, body, evidence chips, actions. Coach actions: Assign as focus (primary) and Evidence. Player actions with a suggested focus: Accept and Decline.
- Plan card: focus handshake (Suggested, Seen, Accepted) as three steps with dots, goal line, drill well. Title "{first name}'s plan" for the coach, "Your plan" for the player.
- Where the strokes go: strokes gained by category, one bar per row against the PGA Tour (0 on the axis, labelled Tour), with a 3px ink tick at the team average on each row and a key below. Same on both sides.
- All reads (coach) / Also worth knowing (player): rows, each pushes or opens that read's evidence. Dismissed reads leave an Undo row.
- What's working (player only): the player's strengths.
- Last round in context: field figure, field dots, teammates line. Title of the figure says the result in words (section 8, rule F).
- Your plan for {first name} (coach only, new card): the coach's aim, alert level, what they're watching, note. Edit plan opens the plan sheet.
- Track record with {first name} (coach only): past focuses and how they went, three wells.
- Evidence sheet: comparison gauge (player, team, tour), last 10 rounds strip, where it happened, why we think this, is this right (corrections), footer for the coach.
- Plan sheet (new): Aim this season, How often CoachHelm flags {first name}, Watching (pick several), Note. Cancel and Save plan.

Card order:

| Where | Order |
|---|---|
| Coach phone file | feature, plan, field, reads, strokes, what's working (player lens only), your plan (coach only), track record (coach only) |
| Player phone board | feature, what's working, plan, field, strokes, also worth knowing |
| Coach desktop | left: feature, plan, strokes. right: field, reads, what's working (player lens), your plan, track record |
| Player desktop | left: feature, plan, strokes. right: what's working, field, also worth knowing |

## 5. States and sub pages

Every state below has a capture link (section 1) and needs a preview route in the app so the capture script can land on it without real data. Preview route (02-PLAN 2.8): `/clubhouse-preview/coachhelm-player-file?state=<state>&lens=coach|player&viewer=player`, served by `src/app/clubhouse-preview/[screen]/page.tsx`, fixtures in `preview/fixtures-coachhelm-player-file.ts`. Page names map to plan names: normal is `accepted` (or `full`), nofocus is `noplan`, suggested is `proposed`, the player board is `viewer=player`. The plan's extra states (readsfailed, sgfailed, teamsmall, fieldfew, declined, nogoal, practiceoff, intentfailed, trackempty and the rest) get captured too once built; they have no drawing of their own and follow the nearest drawn state.

| State | What the builder shows | Link |
|---|---|---|
| normal | Everything as drawn, 21 rounds, refreshed Oct 30 | `#file` |
| loading | Each card keeps its title; body is skeleton lines (12px tall, title line 22px at 70%), pulsing to 0.55 opacity over 1.6s. Feature card skeleton on white 16%. Taps on reads do nothing. | `#file-loading` |
| early | Staging's shape: 2 rounds, both totals only, which don't count. Feature card: "No reads yet" with progress "0 of 4 rounds that count" (four 28 by 6 bars, done ones in feat-gain). The floor is 4 full rounds in the last 90 days (`ABSOLUTE_MIN_ROUNDS`, `roundsToGo`). Strokes shows a dash for each category. Reads say "No reads yet". No field card (a total-only round makes no field). Header "Last round Sep 26". | `#file-early` |
| empty | No rounds. One empty card: "No rounds yet", reads start after 4 full rounds in the last 90 days. Coach still sees Your plan and Track record. | `#file-empty` |
| failed | One failed card with the amber warning icon and Try again. No lens control. Try again shows loading then the data. | `#file-failed` |
| long | Long first and last name and long course name. Bar title, row titles, card right labels: one line, ellipsis. Read titles: two lines. | `#file-long` |
| nofield | No field data for the last round. Field card is hidden; everything else shows. | `#file-nofield` |
| nointent | Coach hasn't set a plan. Your plan card says so with Set a plan; the sheet opens on Develop and Balanced, nothing watched. | `#file-nointent` |
| focus none / suggested / seen / accepted | Plan card dots fill in order. Coach footer reads Assign as focus until assigned, then "{first name}'s focus" disabled. | `#file-nofocus`, `#file-suggested`, `#file-seen`, `#file` |

Sub pages: the evidence sheet and the plan sheet are the only two. The old Deep dive and Standing coach pages are gone; their links redirect to the file (see `02-PLAN.md`).

## 6. Mechanics: every tap

The `data-ch-*` hooks are what the capture script clicks. Keep them in the build.

| Tap | Who | Result | Server call | Hook |
|---|---|---|---|---|
| Player row on the CoachHelm list | coach | Pushes that player's file | none (route `?view=player&player=<id>`) | `data-ch-hf-open` |
| Back | coach | Pops to the list; lens resets to Coach view | none | today's back |
| Coach view / As {first name} sees it | coach | Lens switch (section 7) | none | `data-ch-lens="coach"`, `data-ch-lens="player"` |
| Feature card or Evidence | both | Opens the evidence sheet for the top read | none | `data-ch-hf-read="top"` |
| A row in All reads | coach | Opens that read's evidence sheet | none | `data-ch-hf-read="<id>"` |
| Assign as focus (sheet or feature) | coach | Sheet closes if open, then handshake fills Suggested then Seen | `createFocusAreaFromInsightV2` | `data-ch-hf-assign` |
| Dismiss (sheet footer) | coach | Sheet closes; read folds out of All reads; Undo row appears | `dismissInsight` | `data-ch-hf-dismiss` |
| Undo | coach | Undo row fades out 180ms; read returns | `reactivateInsight` | `data-ch-hf-undo` |
| Correction button | coach gets five, player gets two | Picked button turns accent; one answer per read | `recordCoachHelmCorrection` (flag `coachhelm_corrections_v1`) | today's Corrections component |
| Accept | player | Buttons fold, card swaps, coach's plan card reads Accepted | `acceptFocusArea` | `data-ch-hf-accept` |
| Decline | player | Focus declined, card swaps to the read | `declineFocusArea` | `data-ch-hf-decline` |
| Edit plan / Set a plan | coach | Opens the plan sheet (see 8 K) | none | `data-ch-hf-intent-edit` |
| Aim, Alerts pick | coach | Single pick | none until save | `data-ch-hf-pick` |
| Watching pick | coach | Toggle, several allowed | none until save | `data-ch-hf-pick` |
| Save plan | coach | Sheet closes; Your plan card swaps | `setIntent` | `data-ch-hf-intent-save` |
| Cancel, scrim, close X, swipe down | both | Sheet closes, nothing saved | none | `data-ch-sheet-close` |
| Message (track record) | coach | Opens today's Messages compose to that player | none | today's link |
| Try again | both | Loading then data | refetch | `data-ch-hf-retry` |

Corrections: the coach gets Not this, Wrong cause, Already on it, Show later, Good read. The player gets Not this and Good read on their own reads. This matches today's code; the page was corrected to say so.

Lens rules: the player lens shows exactly what the player's own board would show for the same data. It never shows the coach's plan, track record, the coach's Seen repeatedly confidence label, Wrong cause, or any teammate by name. The smoke test checks for these words in every player render.

## 7. Motion

> Superseded by `07-MOTION.md` (M-LNS-01 to 28), which has every value, curve, interrupt and Reduce Motion rule. Use this section only for the reasoning.

App values only (`src/clubhouse/lib/motion.ts`, `tokens.css`). Smooth spring is `--ch-ease-spring-smooth` over `--ch-dur-spring-smooth` 462ms. Ease is `--ch-ease` `cubic-bezier(0.22, 1, 0.36, 1)`.

| Motion | Values |
|---|---|
| Push file in | New page from translateX 100% to 0, old page 24% left (`CH_UNDERLAY_SHIFT` 0.24) with brightness 0.9, 462ms smooth spring. Pop is the reverse. |
| Row press before push | Row press colour, about 160ms, then push |
| Lens switch | Segmented thumb as today's Segmented. Cards this lens hides fold out: height to 0, opacity to 0, margin-top to -24px, 360ms smooth spring. Shared cards dim to 0.35 over 180ms ease, words change, back to 1 over 180ms. Cards this lens shows fold in the same way. Preview pill rises from 6px below with opacity, 260ms smooth spring. Scroll position is kept. |
| Sheet open (phone) | Scrim 0 to 1 over 300ms ease; sheet from translateY 100% over 462ms smooth spring |
| Sheet open (desktop) | Scrim as phone; sheet from opacity 0 and scale 0.96, 462ms smooth spring |
| Sheet close | Scrim and sheet together over 280ms ease (desktop to scale 0.97) |
| Bars in the sheet | Grow from 0 once on open, 360ms ease, 18ms stagger |
| Strokes bars | Grow from 0 once when the file first appears, 360ms ease, 40ms stagger |
| Press | Scale to 0.97 over 110ms, back over 280ms ease (buttons, picks, tappable cards) |
| Assign handshake | Press, then each step dot fills, 420ms spring, about 900ms apart |
| Accept | Press 110ms, action buttons fade 160ms, card swaps with 260ms ease fade from 0.4 |
| Accepted tick on the coach side | 320ms |
| Card swap after a save | New card fades from 0.4 to 1 over 260ms ease |
| Skeleton pulse | Opacity to 0.55 and back, 1.6s ease-in-out, repeating |

Reduce Motion: every motion above becomes the app's 180ms opacity fade (`CH_FADE_MS`, SHARED-6), pushes and sheets included. No slides, scales, folds or bar growth. Skeletons stop pulsing. Animations off in Settings (`[data-motion='off']`): everything is instant. See 8 A.

## 8. Decisions and things that can't be built as drawn

- A. Reduce Motion length: settled at 180ms, `CH_FADE_MS`, by SHARED-6 (3 Nov). The rest of this item is the earlier reasoning, kept for the record: 120ms, as DESIGN_LANGUAGE §8 sets and the read redesign lane uses. Today's app ships `CH_FADE_MS` = 180ms (Nick's Oct 24 decision for page and sheet fades, `lib/motion.ts:37-45`). Building this package at 120 means passing 120 here, not changing `CH_FADE_MS` for the whole app; the app-wide change belongs with the DESIGN_LANGUAGE rollout. Default, Nick can flip.
- B. Back button colour. The page used #d9c08a in v2; the app's pushed bar uses `--ch-champagne-300` #dccda6. Fixed on the page to #dccda6.
- C. Chart colours. DESIGN_LANGUAGE §3 chart marks (#1f6b45, #b86f0c and dark pairs) differ from today's `--ch-chart-gain` #155a39 and `--ch-chart-loss` #744a06. This package uses the DESIGN_LANGUAGE marks, as the stats package does. Only `--ch-chart-track` is a new token.
- D. Spring curve. The page uses the app's exact smooth spring `linear()` curve. Browsers without `linear()` fall back to `--ch-ease`.
- E. Segmented. The lens control is today's Segmented with no new styling. If its thumb motion differs from the page, today's Segmented wins.
- F. Field card title. This is the page's own rule, not the engine's: "Better than the field" when `relative` is 1.0 or more better, "Level with the field" within 1.0, "Behind the field" when 1.0 or more worse. Numbers come straight from `FieldDayEntry`: `field_mean` and `relative` include the player, so the copy says "the field, Eli included, averaged" and the teammate count is `field_n − 1`. No "hard day" verdict: nothing computes one. No card when `field_n < 3` or the loader is off (it runs only with `coachhelm_team_pattern_v1`, as its own comment says).
- G. Players compare against the PGA Tour and team averages only (Nick, Oct 31: "They see against pga tour and team averages"). No teammate dots, named or unnamed, anywhere on the player's side or in the lens. Field card for the player: the field average and their own mark. Coaches see teammate dots when there are 5 or more others.
- H. Coach's plan is coach only, shown in its own words (Nick, Oct 31). The player lens and the player's board never read `golf_coach_player_intent`.
- I. Figures with no source today are listed in `03-DATA-CHECKS.md`. Each one is either built from data that exists, or hidden until it exists. None is drawn with made up numbers.
- J. Staging has thin data (5 players, 2 totals-only rounds each), so staging shows the early state. Normal state is checked on preview routes with fixtures.
- K. The plan sheet writes with `setIntent` (`src/app/golf/actions/v3/intent.ts:100`), the same action the Roster peek uses today. No migration; coach-only RLS (`intent_coach_only`) holds. This overrides 02-PLAN 5.1, which only linked out. "Not set" is read from the intent row itself, never from `loadIntent`'s made-up default.
- L. Copy that had no source is fixed on the page (v4): closes reads 0.6 (the formula's answer for 1.1, 0.7, 0.3); the focus title is the read's own title; "Top of your list", not "Top of your game"; the goal line starts at the focus's accepted date; "2 sessions logged this week", no target; strokes gained says "All rounds", not "Season"; no team figure on the putting and up-and-down rows (Tour from `gauge.cmp`); approach band is 125 to 175 yd; "Varsity" dropped.
- M. "Shown to {first}" replaces "Seen" on the handshake. It is the first `golf_insight_exposure` row with `surface = 'player_feed'` after the focus was made: the read was drawn on the player's CoachHelm, not tapped. The lens never writes exposure (`drawnLater: () => Promise.resolve([])`), so a coach preview can't fake it.
- N. Evidence sheet strip: "Penalties in the last 8 rounds" from `golf_rounds.total_penalties` (column exists) for the last 8 countable rounds. This overrides 02-PLAN 9, which fell back to to-par per 18. For a read whose metric has no per-round column, use the to-par strip and title it "Score to par, last 8 rounds". Hole lines show date, hole, course, penalty count and score only.
- O. Team figure on the feature card comes from `golf_player_standing.team_avg` and draws only when `team_n >= 5`; below that it reads "—" and the closes sentence says "to the Tour" instead of "to the team's average".
- P. The desktop rail's top read per player needs lane 1's board loader; until it lands the rail shows name and class year. Track record will mostly read "Not measured yet" today (outcome values are almost all empty).
- Q. One read sheet. Lane 1 plans `ReadSheet.tsx`, this plan `EvidenceSheet.tsx`. Agree on one before either lands.
- R. Strokes card. Bars are strokes gained against the Tour, the engine's own baseline, all rounds. The team tick is the team's average on the same leg (`vsTeam` from the standing shape, 02-PLAN 13). The note says both: "Against the Tour, off the tee costs Eli 0.9 a round; against the team, 0.7." With fewer than 5 teammates, no tick and no team sentence.

## 9. Fidelity check

> Superseded by `08-ACCEPTANCE.md` Part 4. The capture script now takes `--id`, `--state` and `--motion` (`node capture/capture.mjs --list` shows them all), shoots desktop at 1280 by 800 on both sides, and no longer has the `design`, `app` and `clips` modes below. The pass rules in step 6 still hold.

Run on the Mac. One phone (402 by 874) and one desktop (1496 by 816 in the app, 1280 by 800 device on the page), light and dark. Keep it light on memory: one browser, one page at a time.

1. Start the app in dev with the preview routes on.
2. `node capture/capture.mjs design` takes the page at each capture link into `screenshots/design/`.
3. `node capture/capture.mjs app` takes the same states from the preview routes into `screenshots/app/`.
4. `node capture/capture.mjs compare` writes side by side pairs into `screenshots/compare/`, page on the left, app on the right.
5. `node capture/capture.mjs clips` records the motions (open, lens, sheet, assign, accept), with and without Reduce Motion, on both sides.
6. Look at every pair. A pair passes when card order, titles, text, colours, spacing and type match, nothing is cut off at XXL, and both themes pass contrast (4.5:1 floor, 4.9:1 target). A clip passes when timing and order match and Reduce Motion is a plain fade.
7. Check the player lens by eye against the player's board for the same fixture: they must match.
8. List every pair that fails with what differs, fix, rerun just those.

Done when every pair and clip passes and the list in step 8 is empty.

## 10. Calls settled without Nick (defaults he can flip)

Nick said on Oct 31 to handle the remaining questions. Each of these follows his rules and earlier picks:

1. Players compare against Tour and team only, no dots (his answer, applied everywhere).
2. Reduce Motion is the app's 180ms `CH_FADE_MS` (8 A, settled by SHARED-6).
3. Strokes card shows Tour bars with a team tick (8 R).
4. The coach's plan is edited in a sheet on the file with `setIntent` (8 K).
5. The field card stays behind `coachhelm_team_pattern_v1`, as its loader says.
6. Penalty strip from `golf_rounds.total_penalties`, last 8 rounds (8 N).
7. "Shown to {first}" on the handshake (8 M).
8. The player keeps today's Board, Standing and Deep dive tabs; removing them wasn't asked.
9. One read sheet shared with lane 1: whichever of `ReadSheet` and `EvidenceSheet` lands first, the other imports it.
10. The private goals fix ships first and alone (02-PLAN 13, PR 0).
