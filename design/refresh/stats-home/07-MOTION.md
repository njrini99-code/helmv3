# 07 · Motion: My stats, Team Stats, Home "Your game"

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 36 rows).

One row per interaction. Every value is read off the design page (`redesign/stats-and-home-phone.html`): its CSS transitions and keyframes (`redesign/stats-phone.css`) and its script (`push`, `pop`, `xfade`, `drawHero` with `tween`, `scrubTo`, `watchCards`, `onScroll`, the Try again handler). Where this file and `04-FIDELITY-SPEC.md` §7 disagree, this file wins; the differences are listed at the end and 04 §7 points here. Screen IDs are from `05-SCREENS.md`.

`capture.mjs --motion <M-ID>` records the row's clip on the design page and in the app at 393 × 852, once with motion and once with `reducedMotion: 'reduce'`, and names the files `screenshots/motion/<M-ID>__{design,app}__{motion,reduce}.webm`. The Check column names the frame to compare.

## Motion tokens

| Page token or value | Value | App token | Notes |
|---|---|---|---|
| `--spring-smooth` | `linear(0,.0418,…,.9988,1)`, 30 stops (CSS line 7 of `stats-phone.css`) | `--ch-ease-spring-smooth` | No overshoot. A fixed `linear()`: it settles exactly at its duration, 462ms. |
| `--spring` | `cubic-bezier(.34,1.3,.64,1)` | `--ch-ease-spring` | Small overshoot: peaks at 1.03 at 67% of the duration, rests at 360ms. Window chip only. |
| `--ease` | `cubic-bezier(.22,1,.36,1)` | `--ch-ease` | Ease out. |
| `ease` in script | `t => 1 − (1 − t)^3.2` | none: write it inline in the scoring chart component | Hero chart morph only. |
| Push duration | 462ms | the push duration Classes and Roster use (`--ch-dur-vt-push` in the Classes plan) | Same value on every pushed page. |
| Reduce Motion fade | 120ms `linear` for the push, 120ms `--ease` for crossfades (the design page) | `CH_FADE_MS` from `lib/motion.ts`, 180ms today, opacity only. The build uses it, not 120 | SHARED-6; START_HERE shared values win. |
| Push dim | `rgb(20 18 12 / .10)` | `--ch-push-dim` | |
| Underlay shift | −24% | `CH_UNDERLAY_SHIFT` (0.24) | |

Rules for every row:

- Animate transform and opacity only, plus SVG attributes the page tweens itself (`d`, `cy`, `stroke-dashoffset`). Never width, height, top, left or margin, with one exception the page has: the window chip's `width`, which the app writes as `transform: scaleX` on a fixed-width chip or keeps as width behind `will-change` (builder's call; the clip must match).
- Nothing moves on re-render, data refresh or Try again's landing (SHARED-6).
- Haptic "select" is `haptic('select')` from `lib/haptics` (the page's `haptic()` stands in for it).
- Under Reduce Motion the page sets every CSS transition and animation to 0s (`.ph[data-rm] *`), then adds back only the push crossfade; the script's figure crossfade (`xfade`) runs at the same length. The page draws both at 120ms; the build uses `CH_FADE_MS` (180ms today) for both. So any opacity fade not listed with its own Reduce Motion value is instant. That is stricter than SHARED-6 and matches it: nothing travels, scales or rotates.

## Rows

| ID | Screen | Trigger and threshold | Element(s) | Property | From → to | Duration | Curve or spring (token) | Delay / stagger | Interruptible | Reduce Motion | Haptic | Check (clip, frame) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-STATS-01 | S-STATS → any detail; S-TEAMSTATS → any detail | Tap a summary card (release inside the card, 10px slop), or Enter / Space on a focused card; also a glance tile and an "Open a part" row | Detail page `#phPush` (app: the stats detail layer) | transform | `translateX(100%)` → `translateX(0)` | 462ms | `--ch-ease-spring-smooth` | none | Yes: Back or Escape mid-push reverses from the current position (retarget, no jump) | `CH_FADE_MS` opacity 0 → 1 (180ms today; page 120ms), no travel | select, on tap | `push`: frames at 0, 116, 231, 462ms; detail left edge at 100%, 32%, 5%, 0 of the width (computed from the `linear()` stops) |
| M-STATS-02 | same | same as 01, same frame | Summary scroller `#phScroll` | transform | `translateX(0)` → `translateX(-24%)` | 462ms | `--ch-ease-spring-smooth` | none, in step with 01 | Retargets with 01 | none, static (stays at 0) | none | `push`: summary left edge at −94pt on the last frame |
| M-STATS-03 | same | same as 01 | Shade `.shade` over the summary, and the detail's edge shadow `-10px 0 28px rgb(0 0 0/.10)` | opacity | 0 → 1 (shade colour `--ch-push-dim`) | 462ms | `--ch-ease` | none | Retargets with 01 | not drawn (`display: none`) | none | `push`: summary pixel at x 40 darkens by the dim, last frame |
| M-STATS-04 | any detail → its summary | Back button (44pt), Escape, retap the current section in the switcher (`history.go(-level)`) | `#phPush`, `#phScroll`, `.shade` | transform, opacity | 01, 02 and 03 reversed: `0` → `100%`, `-24%` → `0`, shade 1 → 0; `visibility: hidden` after 462ms | 462ms | `--ch-ease-spring-smooth` (shade `--ch-ease`) | none | Yes: a tap on a card mid-pop pushes again from the current position | `CH_FADE_MS` opacity 1 → 0 (180ms today; page 120ms) | none | `pop`: frames 0, 231, 462ms; summary scroll position unchanged |
| M-STATS-05 | any detail | Left-edge swipe starting at x < 24, horizontal past 10px slop | `#phPush`, `#phScroll`, `.shade` | transform, opacity | follows the finger 1:1 (summary at −24% × (1 − progress)); release completes or returns by the existing pop's own distance and speed thresholds | remaining distance on the 462ms spring | `--ch-ease-spring-smooth` from the release position | none | Yes, reversible until release | swipe still pops, as a `CH_FADE_MS` crossfade on release (no follow) | none | **Not drawn on the page** (it has no touch swipe). Build: the app's existing edge-swipe pop that Classes and Roster details use, unchanged. Clip `swipe` in the app only, compared with the Classes clip |
| M-STATS-06 | S-STATS (scoring chart) | Press on the feature chart and drag (pointer capture, `touch-action: pan-y` so a vertical drag still scrolls) | Scrub rule, ring, dots, hero figure | rule opacity; dot `r`; ring opacity; figure text | rule 0 → 1; nearest dot r 3.6 → 6 (newest stays 5); ring r 10 shows at once; figure, sub and context swap to that round's score, "+2 · −1.3 SG" and "Oct 3 · Tournament" | rule 120ms; the rest instant | linear | none | Each move picks the nearest round; release, `pointercancel` or Escape restores the average (rule fades out 120ms, text swaps back instantly) | rule shows and hides instantly; the rest as with motion | select, each time the nearest round changes | `scrub`: press at 60% width, hold 300ms, drag to 20%; compare the figure and ring at each round crossed |
| M-STATS-07 | S-STATS, S-TEAMSTATS (`S-STATS.window`) | Tap a window segment that isn't selected (retapping the selected one does nothing) | Chip `.thumb` | transform, width | from the old segment's x and width to the new one's | 360ms | `--ch-ease-spring` `cubic-bezier(.34,1.3,.64,1)` | none | Yes: a second tap mid-slide retargets from the current x and width | instant (the page sets the chip with no transition) | select, on tap | `window`: tap "20" from "10"; chip x at 0, 90, 180, 360ms |
| M-STATS-08 | same | same as 07 | Segment labels: each segment has two layers, the 500-weight label `span` in `--ch-ink-600` and a 600-weight `::after` copy in `--ch-seg-on-ink` | opacity | new segment: `span` 1 → 0, `::after` 0 → 1; old segment the reverse | 200ms | `--ch-ease` | none | Retargets | instant | none | `window`: label frame at 100ms |
| M-STATS-09 | S-STATS and any open detail; S-TEAMSTATS | same as 07 | Every figure block that changes with the window: hero figures, What changed, At a glance, part cards, the open detail's panels (`xfade`: a ghost copy fades out over the new content fading in) | opacity | old 1 → 0, new 0 → 1, in place | 260ms | `--ch-ease` `cubic-bezier(.22,1,.36,1)` | none; every block at once | A second window tap mid-fade starts a new crossfade from the current frame; the earlier ghost is removed | `CH_FADE_MS` (180ms today; page 120ms) | none (07 has it) | `window`: hero figure at 0, 130, 260ms; no number ever shows an in-between value |
| M-STATS-10 | S-STATS (scoring chart) | same as 07 | Five-round average line `#hAvg`, its area `#hArea`, round dots `cy` | SVG `d`, `cy` | each point from its position on the old line (interpolated at the new x) to its new position | 360ms | `t ⇒ 1 − (1 − t)^3.2` | none | A new window mid-morph starts from the current shape | none: the new chart appears with the `CH_FADE_MS` crossfade of 09 | none | `window`: line midpoint at 0, 90, 180, 360ms |
| M-STATS-11 | S-STATS, S-TEAMSTATS (`S-STATS.stuck`) | Page scrolled more than 1pt and the switch has reached the bar (`is-stuck`) | Bar shade `.gbar::before`, 14pt tall, `rgb(0 0 0/.10)` to clear, under the bar | opacity | 0 → 1 (and back at scroll 0) | 180ms | linear | none | Reverses from the current opacity | instant | none | `stuck`: scroll 320; shade frame at 90ms |
| M-STATS-12 | every summary card and detail card with a chart | The card is 25% in view the first time (IntersectionObserver `threshold: .25`, then unobserved) | Horizontal bars and rails `.grow` (SG mini rows, glance-free bars, compare bars, `.hb` bars, Home You vs Tour) | transform | `scaleX(0)` → `scaleX(1)` from the bar's zero edge | 360ms | `--ch-ease` | none (each card on its own entry) | Not interrupted; never replays on scroll back, window change or re-render | none, static: drawn at rest | none | `grow`: load `#stats-light-full`, scroll to Strokes gained; bar width at 0, 180, 360ms |
| M-STATS-13 | same | same as 12 | Vertical marks `.rv`: round ticker bars, Home sparks' area, score mix | transform | `scaleY(0)` → `scaleY(1)`, origin bottom (`transform-box: fill-box`) | 360ms | `--ch-ease` | none | as 12 | none, static | none | `grow`: ticker bar height at 180ms |
| M-STATS-14 | S-STATS (Goals card), S-STATS.goals | same as 12 | Goal ring fill `.rf` | `stroke-dashoffset` | full circumference → `circumference × (1 − progress)` | 360ms | `--ch-ease` | none | as 12 | none, static | none | `grow`: ring arc at 180ms |
| M-STATS-15 | same as 12 | same as 12 | Soft marks `.fadein`: chart areas, Tour ticks, labels inside charts | opacity | 0 → 1 | 360ms | `--ch-ease` | none | as 12 | none, static | none | `grow` |
| M-STATS-16 | every summary card | Press (`:active`) | The card's surface: `box-shadow: inset 0 0 0 999px --ch-press-wash` over the card shadow. No scale (CH-1606) | box-shadow; transform (fixed 4 Nov) | none → wash; and (fixed 4 Nov: START_HERE's shared Press value wins over CH-1606 for tappable cards, as DESIGN_LANGUAGE's Summary to detail pattern says "press 0.97") `scale(1)` → `scale(0.97)` with `data-ch-press-scale=".97"`, the same opt-in Classes uses (M-CRH-01) | wash in at once, fades over 280ms on release; scale down 110ms (`--ch-dur-press`), release 280ms (`--ch-dur-release`) | `--ch-ease` | scale after the app's 70ms touch delay, none with a mouse | Moving off the card past 10px cancels the press, fades the wash and releases the scale from its current value; no tap fires | wash in and out instantly; no scale | none | `press`: hold 200ms, release; scale 0.970 ± 0.005 at 180ms after pointerdown; wash gone and scale 1.000 by 280ms after release |
| M-STATS-17 | Scoring feature card, Team scoring feature card | Press | The card | filter (plus the M-STATS-16 scale, fixed 4 Nov) | `brightness(1)` → `brightness(.94)` | instant in and out (the page sets no filter transition); the scale runs as M-STATS-16 | — | none | as 16 | same | none | `press` on the feature card |
| M-STATS-18 | detail rows: Every round `.rrow`, Open a part `.lrow` | Press | Row background | background-color | none → `--ch-press-wash` | 120ms in and out | ease (CSS default) | none | as 16 | instant | none | `press` on a round row |
| M-STATS-19 | SG rows `.drow`, team rows `.prow`, glance tiles `.gc` | Press | Row or tile background | background | none → `--ch-press-wash` | instant (no transition on these) | — | none | as 16 | same | none | `press` on a glance tile |
| M-STATS-20 | filter button | Press | `.fbtn` | transform | `scale(1)` → `scale(.97)` | instant in and out | — | none | Release restores | none, static (no scale) | none | `press` on the filter button |
| M-STATS-21 | S-STATS.sg, S-TEAMSTATS.tgame, S-TEAMSTATS.tplayers (`S-STATS.sg-pin`, `S-TEAMSTATS.pin`) | Tap a row: pins it; tap again: unpins; tap another: moves the pin | Range whisker `.whisk` on the row's rail; row wash | opacity; background | whisker 0 → .9; row takes the press wash and keeps it while pinned | 200ms | ease (CSS default) | none | A tap mid-fade retargets | instant | none | `pin`: whisker opacity at 100ms |
| M-STATS-22 | S-STATS.scoring, .tee, .approach, .putting (`S-STATS.how`) | Tap "How this is measured" | Chevron; text block | transform; `hidden` | chevron `rotate(0)` → `rotate(90deg)`; text shows at once (no height animation) | chevron 200ms; text instant | `--ch-ease` | none | Retargets | chevron instant; text instant | none | `how`: chevron at 100ms |
| M-STATS-23 | any summary (`loading`) and S-HOMEGAME | The page enters loading (first load or Try again) | `.is-loading` (sheet, lip, switch) | opacity | 0 → 1 | 260ms | `--ch-ease` | none | Replaced by the page when data lands | none, static | none | `loading`: frame at 130ms |
| M-STATS-24 | same | While loading | Sheen `.skel::before` on every bar | transform | `translateX(-100%)` → `translateX(100%)`, repeats | 1.9s per sweep, infinite | linear | none (all bars in phase) | Stops when the page lands | stopped and hidden | none | `loading`: sheen position at 0 and 950ms |
| M-STATS-25 | S-ALL.retry | Tap Try again (44pt hit) | The page | — | failed → loading (M-STATS-23, 24) → loaded; the loaded page lands with no animation and no grow-once replay for cards already seen | page shows after the data returns (the design page waits 900ms) | — | none | A second Try again while loading does nothing | same, no fade | select, on tap | `retry`: no frame of the landed page differs from a cold load's final frame |
| M-STATS-26 | any detail by link (`?tab=rounds`, `?tab=dev`, `?tab=game`, `#gm-<part>`, `#sd-…`, refresh) and S-HOMEGAME.leg | Arrival on a detail URL | The detail | — | appears already in place, no slide, no fade | 0 | — | — | — | same | none | `deeplink`: the first painted frame is the final frame |
| M-STATS-27 | any detail after a keyboard push | Push by Enter or Space | Focus | focus | moves to the back button | after 80ms (0 under Reduce Motion) | — | — | — | 0ms | none | DOM test, not a clip |
| M-HOME-01 | S-HOMEGAME.leg | Tap a leg | Navigation to My stats with the part detail open | — | same as M-STATS-26: no slide; one Back reaches the Stats summary with M-STATS-04 | 0 | — | — | — | same | select | `homeleg` |

## Must never animate on this lane

- Numbers: no count-up anywhere. The page's source had a `countTo` (480ms) and it is not used; every figure is set as text (`setNum`) and changes only through the M-STATS-09 crossfade.
- Entrance staggers: none. Cards don't slide or fade in on load; only their marks grow once (12 to 15).
- Re-render and data refresh: nothing moves. Grow-once marks don't regrow on window change, refresh, Try again or scrolling back.
- Cards and rows never scale on press (CH-1606). Only the filter button scales. (fixed 4 Nov: START_HERE's shared values table wins: tappable summary cards, the feature cards included, scale to 0.97 as M-STATS-16; rows, glance tiles, SG rows, team rows, Every round rows and Home legs never scale and take the wash only.)
- No blur on scroll. The stuck switch sits on the page colour with no backdrop blur and no hairline; only the 14pt bar shade fades.
- The sticky switch and bar don't move on scroll; the bar title does not cross-fade (there is no large title on Stats).
- Deep-link arrival never slides or fades.
- Detail panels don't animate their height; "How this is measured" opens instantly.
- The review highlight on the design page (`.spot`, a 1.4s ring when a review note is clicked) is page chrome, not app UI. Don't build it.
- `rrow.enter` (`rowin`, 260ms) exists in the page's CSS and is unused; don't build it.

## Interrupt cases worth a test

1. Back during a push: tap a card, press Back at 200ms. The page reverses from where it is; no jump to 100% and no second slide.
2. Push during a pop: Back, then tap the same card at 200ms. It pushes again from the current position.
3. Window change during the crossfade: tap "20" then "Season" 100ms apart. One ghost at a time; the final frame shows Season's figures; no figure shows Last 20's value at the end.
4. Window change during the chart morph: the line starts from its current shape, never snaps back to Last 10 first.
5. Scrub during a morph: pressing the chart cancels the morph at its current frame and scrubs on the new window's points.
6. Scrub then scroll: a vertical drag on the chart scrolls the page (`pan-y`) and ends the scrub with the average restored.
7. Push while a card's marks are mid-grow: the detail opens; the summary's marks finish behind it and don't replay on Back.
8. Try again twice: the second tap during loading does nothing; no second skeleton fade.
9. Window tap while loading: ignored (the switch is `inert`).
10. Escape while scrubbing ends the scrub only; a second Escape pops the detail (if one is open).
11. Reduce Motion toggled while a detail is open: the next pop is the `CH_FADE_MS` crossfade.
12. Edge swipe released at 30%, slowly: the detail returns to 0 on the spring; the summary returns to −24%.

## Where this file differs from 04 §7

- Window chip under Reduce Motion: instant, not a crossfade. The page sets the chip with no transition under Reduce Motion; the chip doesn't travel, so there is nothing to crossfade.
- Card press: `inset 0 0 0 999px` box-shadow wash, fading out over 280ms (04 said a background wash). Rows `.drow`, `.prow` and glance tiles have no fade; round rows fade over 120ms.
- Feature press brightness is instant (04 implied the 280ms of the wash).
- Edge swipe: not drawn on the page; the build rule is the app's existing pop (04 described it as if drawn).
- Pinned rows don't dim the other rows (04 §6 hinted at a dim); only the whisker shows.

## Completeness pass, 4 Nov 2026

### Every ID, in and out

Each 05 ID with the rows that bring it in and take it out, so nothing is left without a transition. "House push" is M-STATS-01 to 05; "arrival" is M-STATS-26.

| ID | In | Out (Back, swipe, Escape, close) | Reduce Motion |
|---|---|---|---|
| `S-STATS`, `S-TEAMSTATS` | section change from the switcher (Classes M-CRH-11, unchanged); route arrival from another screen with no transition of this lane; loading → loaded with no motion (M-STATS-23, 24) | section change (M-CRH-11) | as those rows |
| `S-STATS.coach` | today's route push from Roster, Team players, PlayerPeek, Messages (the app's `nav-motion` push, 462ms, `--ch-vt-parallax` −24%; Classes M-CRH-12) | today's route pop | `CH_FADE_MS` crossfade |
| `S-STATS.scoring`, `.sg`, `.tee`, `.approach`, `.short`, `.putting`, `.rounds`, `.goals`; `S-TEAMSTATS.tscore`, `.tgame`, `.tplayers` | house push from their card, glance tile or Open a part row (M-STATS-01 to 03); arrival (M-STATS-26, 29) | house pop (M-STATS-04, 05); section retap pops (M-STATS-04) | `CH_FADE_MS` crossfade |
| `.sg` to a part by Open a part | M-STATS-37 (instant replace, no stack) | house pop to the summary | same (instant) |
| `S-STATS.stuck`, `.window`, `.custom`, `.scrub`, `.sg-pin`, `.how`; `S-TEAMSTATS.pin` | M-STATS-11, 07 to 10, 36, 06, 21, 22 | the same rows reversed | as those rows |
| `S-STATS.filter`, `S-TEAMSTATS.filter`, `S-TEAMSTATS.peek`, `S-STATS.goals-sheets`, `S-STATS.share` | M-STATS-30 (today's sheet in) | M-STATS-30 (today's sheet out, swipe, scrim, Escape) | opacity `CH_FADE_MS` |
| `S-STATS.switcher` | today's strip open (Classes M-CRH-08, 09) | M-CRH-10 | as M-CRH-08 to 10 |
| `S-STATS.round`, `S-TEAMSTATS.player`, the coach head's Message, All N rounds | M-STATS-28 (route push from a detail) | M-STATS-29 (route pop back onto the detail) | crossfade |
| `S-HOMEGAME` | part of player Home's first paint; marks grow once (M-STATS-12, 13); loading (M-STATS-23, 24) | none (it is a card) | static |
| `S-HOMEGAME.leg` | M-HOME-01 (no slide) | M-HOME-03 | same |
| `S-ALL.retry` | M-STATS-25 | — | same |
| `S-STATS.filter-empty`, `S-TEAMSTATS.filter-empty`, `S-STATS.updating` | M-STATS-35 | M-STATS-35 | instant |
| `S-STATS.detail-loading` | M-STATS-34 | lands as M-STATS-26 | same |
| `S-STATS.return` | M-STATS-29 | house pop | same |
| `S-STATS.refresh` | M-STATS-32 | — | settles at once |
| `S-STATS.denied` | none: the page lands as the summary or today's page with no motion | — | — |
| `S-HOMEGAME.season-start` | none (a state of the card) | — | — |

### Rows

| ID | Screen | Trigger and threshold | Element(s) | Property | From → to | Duration | Curve or spring (token) | Delay / stagger | Interruptible | Reduce Motion | Haptic | Check (clip, frame) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-STATS-28 | S-STATS.rounds → S-STATS.round; S-TEAMSTATS.tplayers → S-TEAMSTATS.player; S-STATS.coach Message; All N rounds | Tap an Every round row, a second tap on a pinned player, Message, All N | the route change (`RouteFrame` view transition); the open detail is part of the outgoing page | transform, filter | the app's `nav-motion` push: new page `translateX(100%)` → 0, old page → `--ch-vt-parallax` −24% and `brightness(0.9)` | 462ms | `--ch-ease-spring-smooth` (`--ch-ease-vt-push`) | none | as the app's route push today | `CH_FADE_MS` crossfade | select | `route`: app only; frame 231 shows the detail moving at −24% under the new page |
| M-STATS-29 | the same, coming back; any history Back onto a Stats URL with a detail hash | Back on the round page, the player page, Messages, or the browser | route pop, then the detail | transform | the route pop reversed; the detail is already in place underneath (no second slide), scrolled where it was; the summary under it at its scroll | 462ms (route pop only) | `--ch-ease-spring-smooth` | none | as the route pop | `CH_FADE_MS` crossfade | none | `return`: the last frame equals the detail's frame before it left, scroll within 1pt |
| M-STATS-30 | S-STATS.filter, S-TEAMSTATS.filter, S-TEAMSTATS.peek, S-STATS.goals-sheets, S-STATS.share | Tap the filter, a Players row, Set a goal, a proposal, Add focus area, Share | today's `ui/Modal` sheet and scrim | transform; scrim opacity | today's sheet motion, unchanged: in `translateY(102%)` → 0 over 462ms on the smooth spring; out by ✕, scrim tap, Escape or Back 280ms `--ch-ease`; swipe down follows the finger (Classes M-CRH-13, 16, 18, 19 hold the numbers) | as Classes | as Classes | none | as Classes | opacity only over `CH_FADE_MS` | none | regression clip only: the app's sheet clip before and after this lane is the same; focus returns to the opener on close |
| M-STATS-31 | S-STATS.switcher | Tap "My stats ⌄" / "Stats ⌄" | today's section strip | as Classes M-CRH-08 to 10 | unchanged | unchanged | unchanged | none | unchanged | unchanged | none | regression only |
| M-STATS-32 | S-STATS, S-TEAMSTATS summaries; player Home | Pull at scroll 0 in the iPhone app (today's 64px trigger) | the page sheet and the spinner on the green | transform; spinner rotation | today's pull (Classes M-CRH-42); new figures land with no motion at all | as M-CRH-42 | K1 | none | as M-CRH-42 | settles at once; spinner still | `commit` once at the trigger | app clip: no card fades, grows or crossfades when the refreshed data lands |
| M-STATS-33 | S-STATS.updating (failed or offline) | The fetch for the new window fails | window chip and labels | transform, width; label opacity | back from the tapped segment to the segment whose figures are on screen | 360ms chip, 200ms labels | `--ch-ease-spring` chip; `--ch-ease` labels | none | a new tap during the return retargets | instant | none | `updating-failed`: chip x back at the old segment by 360ms; no figure changes |
| M-STATS-34 | S-STATS.detail-loading | Arrival on a detail URL before data | pushed bar and detail skeleton | opacity | skeleton 0 → 1 as M-STATS-23; the bar shows at once | 260ms skeleton; bar 0 | `--ch-ease` | none | replaced by the detail the frame data lands (no slide, no fade: M-STATS-26) | skeleton static, sheen off | none | `detail-loading`: first frame shows the bar; the landed frame equals a warm arrival's frame |
| M-STATS-35 | S-STATS.filter-empty, S-TEAMSTATS.filter-empty, S-STATS.updating | The window or filter changes to no rounds; the note's busy delay passes | the empty card; the note | opacity | old figures crossfade out and the card in, as M-STATS-09; the note shows and hides instantly | 260ms (card); note 0 | `--ch-ease` | the note waits today's busy delay | as M-STATS-09 | `CH_FADE_MS` | none | `filterempty`: card opacity at 130ms |
| M-STATS-36 | S-STATS.custom | A custom range is set or cleared in StatsFilter | the sixth segment and the chip | transform (chip only) | the segment appears or goes with no motion; the switch scrolls to show it instantly; the chip moves as M-STATS-07 | 360ms chip | `--ch-ease-spring` | after the filter sheet's close starts | retargets as M-STATS-07 | instant | select | `custom`: app only |
| M-STATS-37 | S-STATS.sg → a part | Tap an Open a part row (or Enter on it) | the open detail's content and bar title | — | the part's page replaces the SG page in place, as the design page does (`push()` with a detail already open swaps the content and sets its scroll to 0); the summary behind doesn't move; history `replaceState` of the hash | 0 (instant swap) | — | none | Back right after pops to the summary (M-STATS-04) | same | select | `openpart`: the frame after the tap shows the part at its top; the summary pixel at x 40 is unchanged; on Back, focus lands on that part's summary card (the page's `pop()` focuses `[data-go]` of the detail it closes) |
| M-STATS-38 | every control in this lane | Keyboard focus arrives | focus ring (06) | outline | none → ring | instant | — | none | — | same | none | DOM test |
| M-HOME-02 | S-HOMEGAME legs | Press on a leg | the leg's background | background-color | none → `--ch-press-wash` | 120ms in and out (as M-STATS-18) | ease | none | moving 10px cancels; no navigation | instant | none | `press` on `leg-0`, app only |
| M-HOME-03 | S-STATS (reached from Home) → player Home | Back after M-HOME-01, from the Stats summary (OS back gesture, browser Back), or Home in the switcher | the page change | opacity | a section change, never a slide: as Classes M-CRH-11; Home lands at the scroll it left | as M-CRH-11 | as M-CRH-11 | as M-CRH-11 | as M-CRH-11 | `CH_FADE_MS` | none | `homeback`: app only; Home's scroll within 1pt |
| M-HOME-04 | S-HOMEGAME retry | Try again in the card's partial-failure notice | the card body only | opacity | notice → Home skeleton legs (M-STATS-23, 24) → loaded legs with no motion; nothing outside the card moves | 260ms skeleton | `--ch-ease` | none | a second tap while loading does nothing | static | select | `homeretry`: hero and card y unchanged on every frame |

Interrupt cases added:

13. Double tap on a card: the second tap lands on the inert summary and does nothing; one detail, one history entry.
14. Window tap, then Back on a detail before the fetch lands: the pop runs; the figures still crossfade once when the data lands, on the summary.
15. Pull to refresh while a window fetch is in flight: one read wins (the newer); figures land once with no motion.
16. A sheet open over a detail, then the edge swipe: the swipe goes to the sheet's own dismiss, never pops the detail under it.
17. Back during M-STATS-28 (the route push to a round): the app's route pop retargets; the detail is unchanged under it.
