# Clubhouse inventory C: motion and mobile/native (read-only forensic pass)

Scope: `src/clubhouse/**`, `src/clubhouse/styles/*.css`, `capacitor.config.ts`, `ios/`, `android/`, `e2e/clubhouse-*`, `playwright*.config.ts`, `scripts/phone/`, `scripts/clubhouse/`. Tree: /home/user/helmv3 (not a git checkout in this sandbox, so no SHA; contents read as found on 2026-11-27).
Legend: **V** = verified (read the file or ran a read-only count and saw output). **I** = inferred (reasoned, not observed). Counts come from `rg`/`grep`/a postcss walk over `src/clubhouse/styles/*.css` (scripts in the scratchpad, not in the repo). `__tests__` excluded from TS counts unless said.

Sources read first: `src/clubhouse/AGENTS.md`, `.claude/rules/clubhouse.md`, `docs/clubhouse/MOBILE.md`, `docs/clubhouse/SMOOTHNESS_AUDIT.md` (2026-10-06, pre-wave), `docs/clubhouse/QUEUE.md` rows pa-mot-01..10, `.claude/skills/helm-safari-performance/SKILL.md`, `scripts/phone/README.md`. Note `MOTION-AND-VISUAL` is referenced as the doctrine ("3.2", "3.12") but is not a file I opened; its rules are mirrored in `tokens.css`, `lib/motion.ts` and `__tests__/motion-gate.test.ts`, which I read.

---------------------------------------------------------------------------------------------------

## PART 1. MOTION

### 1.1 Token vocabulary (V)

`src/clubhouse/styles/tokens.css:1017-1077`, mirrored in `src/clubhouse/lib/motion.ts` (276 lines).

| Token | Value | JS mirror | Meant for |
|---|---|---|---|
| `--ch-dur-press` | 110ms | `CH_DUR.press` 0.11 / `CH_DUR_MS.press` | press down, a menu out |
| `--ch-dur-quick` | 180ms | `.quick` | fades, menu in, crossfade, Reduce Motion |
| `--ch-dur-base` | 260ms | `.base` | pill, thumb, toast in, list insert, FLIP |
| `--ch-dur-release` | 280ms | `.release` | press release, sheet out |
| `--ch-dur-marks` | 360ms | `.marks`, `CH_MARKS_MS` | chart marks glide, first-view bars |
| `--ch-dur-reveal` | 520ms | `.reveal` | push, pop, sheet in |
| `--ch-ease-ios` | cubic-bezier(.32,.72,0,1) | `CH_EASE_IOS` | everything that travels |
| `--ch-ease-out` | cubic-bezier(.22,1,.36,1) | `CH_EASE_OUT` | press down, leaving |
| `--ch-dur-busy-delay` / `-busy-min` | 150 / 300ms | `CH_BUSY` | loading: wait 150 ms, hold skeleton >= 300 ms (`lib/use-busy.ts`) |

That is the "twelve tokens" (6 durations + 2 curves + 2 busy beats = 10 named in the comment; the "twelve" in the doc counts the two Reduce-Motion/typing beats; I count 10 literal vocabulary tokens at tokens.css:1026-1037, **V**).

One spring: `CH_SPRING {mass 1, stiffness 157.9, damping 25.13}` critically damped (motion.ts:60). `CH_SPRINGS` (motion.ts:~115-135) has `smooth`, `settle`, `pop`, `reveal`, `gesture`; `smooth/settle/pop` are all `visualDuration 0.26, bounce 0` (aliases of one spring), `reveal` 0.52 s, `gesture` 0.5/1.2 s. Gesture constants: `CH_SWIPE {edge 20, commitProgress .5, commitVelocity .7 px/ms}`, `CH_SHEET {commitFraction .25, commitVelocity .4}`, `CH_RUBBER_BAND .55`. Overshoot curve `(.34,1.3,.64,1)` is gone and the gate enforces it (see 5.1).

**Retiring tokens still in use (V, ratchet `config/clubhouse/motion-ratchet.json`, 53 files):**

| Rule | Total uses | Biggest holders |
|---|---|---|
| `retired-token` (any `--ch-ease`, `--ch-ease-io`, `--ch-ease-sheet`, `--ch-ease-spring-*`, `--ch-dur-spring-*`, `--ch-dur-keyboard/msg-*/word/crossfade-rm/story-body`, ...) | **552** | shell.css 64, rounds.css 43, stats.css 35, coachhelm-ask-v2.css 33, controls.css 30, qualifiers.css 29, coachhelm-team.css 28, calendar.css 27, roster.css 21, rounds-setup.css 19 |
| `off-token-duration` (a literal ms/s in transition/animation) | **7** | coachhelm-ask-v2.css 3, auth.css 2, base.css 2 |
| `keyframes` (outside motion.css) | **48** | onboard.css 17, auth.css 15, shell.css 11, controls.css 3, messages-overlays 1, ui 1 |
| `infinite` animations | **19** | auth.css 8, messages.css 2, quick-chat.css 2, then 1 each in ask-v2, ball, thread, onboard, practice, shell, spinner |
| `paint-keyframes` (keyframe animates non-compositor prop) | **9** | onboard.css 5, shell.css 4 |

Reading: the *new-code* vocabulary is six durations and two curves, but 552 uses of retired tokens are still the dominant way CSS is written. `--ch-ease` is just `--ch-ease-out` under its old name (tokens.css:1042), so most of the 552 are an alias, not a different curve (V).

**Raw values bypassing tokens**
- CSS literals: 7 (ratchet). My grep for non-`var(--ch-dur` lines was higher (5 in base.css, 4 in qualifiers/controls/auth, ...) but those are `0s`, `var(--x, 200ms)` fallbacks or `1ms` Reduce-Motion overrides that the gate treats as on-scale (V that gate allows these; counts differ by definition).
- JS: `duration: <number>` literals 12 across 8 files (Swap.tsx 2, PhoneScreen.tsx 2, ListPresence, BellStacks, SettingsPhone, SettingsView, Onboard, motion.ts) (V). `setTimeout(..., NNN)` with a 3-4 digit literal: 38 (V count; not all are motion).
- `cubic-bezier(` string built in JS from `CH_EASE.join(',')`: Swap.tsx:53, SwipeRow.tsx:84, RouteFrame.tsx:113, section-switch.tsx:267, LandingSlot.tsx:11, QuickChatThread.tsx:38, Toast.tsx:430 (hard-coded `'cubic-bezier(.22,1,.36,1)'` fallback). Uses `CH_EASE` (the *retiring* alias) rather than `CH_EASE_OUT` (V).
- `ease-in-out ... infinite alternate` in auth.css:192,201,210,213,222 (Auth scene sway/twinkle; deliberate owner exception) (V).
- `linear` timing: used for sampled-spring curves (`chSpringCurve(...).linear`), scroll-linked, and Reduce-Motion floor (`base.css:347 transition-timing-function: linear !important`) (V).

### 1.2 Inventory of motion mechanisms (counts, V unless noted)

| Mechanism | Count | Where |
|---|---|---|
| Files importing `motion/react` in `src/clubhouse` | **51** | menu-motion, motion-glide, motion, screens/auth/*, calendar, messages, rounds, settings, stats, roster, shell/{Bell,BellStacks,ClubhouseFrame,OfflineBanner,PhoneScreen,SectionStrip,TeamSwitch,phone-chrome,section-switch}, ui/{ContextMenu,ListPresence,Menu,Peek,PickerHost,Swap,Toast} |
| `<AnimatePresence>` mentions | 126 matches in **35** files | all overlays, list presence, route/section parts |
| `mode="popLayout"` / `"wait"` | 19 in 9 files | |
| `layoutId` | 4 matches in 4 files (all are comments: Segmented.tsx:69, slide-plate.ts:~15, etc.; no live `layoutId` prop found) | replaced by `lib/slide-plate.ts` (WAAPI), V (slide-plate.ts header says layoutId "measured ... mid-frame ... 68 frames dropped of 96 at 4x CPU") |
| `layout=` prop | live: `ui/ListPresence.tsx:105 layout={flip ? 'position' : undefined}`, `ui/Toast.tsx:438 layout={!reduced}` | 2 live uses; the other 10 grep hits are the word "layout" in comments |
| `m.` components via `LazyMotion` | `ClubhouseFrame.tsx:68` `<LazyMotion features={chLoadMotionFeatures} strict>` using **domMax** ("drag and layout: the calendar's drag, the toasts' layout", ClubhouseFrame.tsx:77) | Shipping domMax for 2 features: I |
| `.animate(` (WAAPI) | 75 matches, **30** files | NavPlate, section-switch, BellStacks, Toast, Swap, RouteFrame, quick-chat/*, ask-flight, use-route-swipe, ... |
| `chSpringCurve` (sampled spring -> `linear()` easing for WAAPI) | 61 uses, 22 files; `chSupportsLinear` 18 uses, 8 files (with a cubic-bezier fallback) | the interruptible-with-velocity idiom |
| `requestAnimationFrame` | 108 matches, **57** files (not all animation loops; many are "after paint" scheduling) | |
| `useMotionValue/useTransform/useSpring` | section-switch.tsx:4,244-245, SectionStrip.tsx:5,37-38 | scroll/drag-driven values |
| View Transitions | `RouteFrame.tsx:3` imports React's `<ViewTransition>` (desktop route crossfade keyed by route), `RouteFrame.tsx:88` feature-detects `document.startViewTransition`; `shell.css` has 24 `view-transition-*` lines incl. `ch-topbar`/`ch-strip` names, `@keyframes ch-vt-out/in` (shell.css:1861,1866) | desktop only; phone does **not** use it (AGENTS.md "no view transition") |
| CSS scroll-driven animation | `animation-timeline: scroll(root block)` for the large-title -> bar title crossfade (`shell.css:3047-3060`, `@keyframes ch-lt-under` shell.css:4351), guarded by `@supports`; `large-title.tsx:82` has a JS fallback (scroll-linked opacity 36->52px) | the only scroll-linked effects (V) |
| Count-up / digit animation | **None by doctrine** ("Banned: count-ups and staggers", motion.ts header; "digits do not roll", motion-glide.ts:12). Exceptions: `@keyframes ch-rail-count` (shell.css:4236, scale .6->1 pop on the rail badge), `ch-arrive` "landing number pops (scale 0.4)" for the course view | V |
| Chart animation | `lib/motion-glide.ts` `useGlide` (360ms marks, iOS curve; WAAPI/rAF tween of geometry numbers), used by `ui/charts/Line.tsx`, `screens/stats/{LegBars,PuttBands,TeamRank,StatsTeamPhone}`, `rounds/CourseArc`, `calendar/views.tsx`; `ch-draw` keyframe for two owner-exception lines (live Ask trend, course shots); `ch-pass` ball keyframe | |
| `will-change` | CSS 12 (coachhelm-team.css 391/407/419, shell.css 1924/1935/1945/3468/3475, auth.css 111/1315/1372); JS 17 sets in 7 files, all **set at gesture start and cleared at end** (PullToRefresh.tsx:212/117, use-edge-swipe.ts:88/68, use-route-swipe.ts:251/88, phone-chrome.tsx:214/262); calendar.css:4283 states "No standing will-change (MOT-19)" | mostly disciplined; the 12 CSS ones are standing |

### 1.3 Every CSS @keyframes (V)

Definitions total **65** across 9 files: motion.css 17 (the sanctioned home), onboard.css 17, auth.css 15, shell.css 11, controls.css 3, coachhelm-thread.css 1, messages-overlays.css 1, practice.css 1, ui.css 1.

motion.css (sanctioned, `src/clubhouse/styles/motion.css`): `ch-in` (fade in), `ch-out`, `ch-slide-in`/`ch-slide-out` (Ask plan pane, translateX 100%), `ch-drawer-in` (Ask history, `translate`), `ch-drain` (Undo ring, stroke-dashoffset), `ch-fill` (story bar scaleX), `ch-th-turn` (CoachHelm wheel), `ch-working` (the one loop, opacity), `ch-draw` (stroke draw), `ch-arrive`, `ch-pass`, `ch-hold` (visibility, a "state not a movement" tap guard), `ch-spinner-turn`, `ch-check-window`/`ch-check-ink` (drawn check).

Outside motion.css (still in ratchet):
- shell.css: `ch-busy-wait`:873, `ch-title-leave-home`/`ch-title-home`:1288/1293, `ch-vt-out/in`:1861/1866 (view-transition), `ch-brand-write/rise/wheel/glint`:3950-3984 (brand intro; `ch-brand-write` animates `mask-position`, paint), `ch-rail-count`:4236, `ch-lt-under`:4351 (scroll-linked).
- controls.css: `ch-pop`:571, `ch-fade`:577, `ch-rise`:582. ui.css `ch-toast-in`:497. messages-overlays.css `ch-mss-pop`:144.
- auth.css 15 and onboard.css 17: scene and onboarding choreography (Auth: clouds drift, birds, sway, shimmer, twinkle, caret - 8 `infinite`; onboard: `chOxFlash`, `chOxWetA/B` animate `color`, 5 non-compositor decls).

Paint keyframes (V, ran postcss): `shell.css ch-brand-write` mask-position x4 (lines 3952-3957); `onboard.css chOxFlash` color (2096-2104), `chOxWetA/B` color (2150, 2156). Total 9, matches ratchet.

`animation:` declarations referencing keyframes (non-`none`): onboard.css 24, shell.css 17, auth.css 16, controls.css 13, rounds-track.css 7, messages.css 7, coachhelm-team.css 6, then 3 or fewer across live, command, coachhelm-ask, ask-studio, calendar, stats (V).

### 1.4 CSS transitions (V, postcss walk over all 70+ sheets)

543 `transition`/`transition-property` declarations. Property tally (per property, one count per listed property): `background-color` 184, `opacity` 136, `transform` 128, (`none` 62), `box-shadow` 60, `color` 45, `translate` 20, `border-color` 10, `scale` 9, `visibility` 6, `filter` 4, `stroke-dashoffset` 3, `stroke-width` 2, `text-decoration-color` 2, `flex-grow` 2, `clip-path` 2, `text-shadow` 1, `fill/stroke/outline-color/...` 1 each. **`transition: all`: 0.** **height/width/top/left/margin/padding transitions: 0.** (Gate enforcement: `e2e/clubhouse-motion-gate.spec.ts` "layout" rule, and pa-mot-04 "rows arrive and leave without a height animation".)

Flags (V):
- `box-shadow` is transitioned in 60 places (onboard 6, qualifiers 6, controls 5, shell 5, rounds-setup 4, rounds 4, ...). Plus the global baseline in `base.css:81-98` gives every `a, button, [role=button/tab/menuitem/switch], summary, input, select, textarea` a `transition` of background-color, color, border-color, **box-shadow**, opacity at `--ch-dur-quick` / `--ch-ease` (zero specificity). box-shadow repaints (not compositor); fine for small controls, but is the single largest "paint transition" class.
- `filter` transitioned 4x: calendar.css:891, rounds.css:4149, rounds.css:4492, stats.css (1). Not compositor-safe in WebKit for large areas. (I: these are small badges/dims; not inspected.)
- `flex-grow` 2 (hub.css:2450, stats.css:6756): a layout-affecting property (V that it is transitioned; the gate's layout rule scans live animations, the ratchet does not scan transition properties, so this slips past static checks).
- `clip-path` 2 (paint).
- Keyframe property tally: transform 56, opacity 47, translate 8, rotate 6, color 5 (onboard), stroke-dashoffset 2, visibility 2, mask-position 2 (+ -webkit-).

### 1.5 Purposes (grouping)

| Purpose | Mechanisms (file) | Interruptible? |
|---|---|---|
| **Press** | `lib/press.ts` pointer controller: 50 ms touch delay (`PRESS_TOUCH_DELAY_MS`), 110 ms min show (`PRESS_TAP_SHOW_MS`), 10 px slop, `data-ch-pressed`; scale 0.97 for `.ch-btn,.ch-pill,[data-ch-press]` <= 240px wide (`PRESS_MAX_WIDTH`); wash (WAAPI, in 110 / out 280 iOS curve) for rows | yes (WAAPI cancel) |
| **Hover** | CSS only, 393 `:hover` selectors, 371 inside `@media (hover: hover)`, 22 not (1.10) | n/a |
| **Enter / exit (overlay)** | `ui/Modal.tsx` + `lib/dialog-lifetime.ts` (native `<dialog>`, retained exit content), `ui/Menu.tsx`, `ContextMenu.tsx`, `Peek.tsx`, `PickerHost.tsx`, `Toast.tsx` (motion `m` + WAAPI + sampled spring), `BellStacks.tsx`, `quick-chat/*` (WAAPI), `ask-flight.ts` (FLIP arc) | mostly yes (AnimatePresence reverses; WAAPI `.cancel()` 44 sites); `chThrownExit` carries finger velocity |
| **Navigation** | phone push/pop: `PhoneScreen.tsx` (spring, 520ms reveal), `lib/nav-motion.ts` (`classifyNav`: push / pop / fade), `use-route-swipe.ts` + `edge-swipe.ts` + `use-edge-swipe.ts` (drag + spring finish), `lib/share-morph.ts` (shared figure flies), section switch `section-switch.tsx` (swap at once, owner 2026-10-22), desktop `RouteFrame.tsx` (React `<ViewTransition>` crossfade) | push is grab-able mid-flight (`grabPush`, use-route-swipe.ts:~29) |
| **Layout / FLIP** | `ui/Swap.tsx:53` WAAPI translateY FLIP; `ListPresence.tsx` motion `layout="position"`; `lib/slide-plate.ts` (segment thumb / strip pill, WAAPI translate + width); `NavPlate.tsx` | yes |
| **List** | `ui/ListPresence.tsx`: insert on base beat iOS curve, remove .96+fade over quick, siblings FLIP | yes (AnimatePresence) |
| **Chart** | `useGlide` (360ms, retargets "from where an interrupted glide starts", motion-glide.ts:~30), first-view bar grow, `ch-draw` on 2 exceptions | yes (retarget) |
| **Skeleton** | `.ch-skel` static (shell.css:878-948); `use-busy` 150/300; `ch-skel-in` fade (shell.css:557); no shimmer loop (retired `--ch-dur-shimmer` still in RETIRED regex) | n/a |
| **Gesture** | back swipe, sheet drag (`lib/sheet-drag.ts`, rubber band), pull to refresh (`PullToRefresh.tsx`), swipe row (`ui/SwipeRow.tsx`, `lib/swipe-row.ts`), calendar drag (`screens/calendar/use-time-drag.ts`, `month-dnd.tsx`, `day-timeline.tsx`), messages hold-lift (`screens/messages/hold-lift.tsx`), chart scrub (`lib/use-chart-pin.ts`) | all finish from release position; velocity-seeded |
| **Loops** | `ch-working` dots, `ch-spinner-turn`, `ch-th-turn`, Auth scene (8 infinite), messages 2, quick-chat 2 (typing/working) | n/a |

### 1.6 Interruptibility and reversibility (mixed V/I)

- **CSS keyframes (cannot be reversed mid-flight, can only be cancelled/replaced):** all 65 `@keyframes`. Those that matter at runtime on phone: `ch-in` (late content crossfade), `ch-arrive`, `ch-slide-in/out`, `ch-drawer-in` (Ask panes), `ch-pop/ch-rise/ch-fade` (controls.css), `ch-toast-in` (ui.css, though Toast also has a motion/WAAPI path), `ch-mss-pop`, `ch-hold`. `ch-drawer-in` is deliberately written on `translate` "which lib/sheet-drag.ts reads to catch it mid-flight" (motion.css, V) - the one place the keyframe is made grabbable.
- **Transitions:** 543 CSS transitions are reversible by definition (retarget from current computed value). The Reduce-Motion floor rewrites them all (1.7).
- **Springs (retarget with velocity):** `chSpring()` from `motion/react` (26 uses, 11 files): framer springs keep velocity on target change. Others use `chSpringCurve` -> a sampled `linear()` easing over WAAPI (61 uses) which **does not retarget** itself: interruption is done by reading the computed `translate`/`transform` and issuing a new animation (e.g. `NavPlate.tsx:57` stores `{anim, from, to, at, ms, ease}` so it can reconstruct the in-flight position; `Toast.tsx:405` `curve ? ... : ...`). So interrupt correctness is hand-rolled per component (I; spot-read only 3).
- **Layout animation:** just 2 live `layout` props (ListPresence.tsx:105, Toast.tsx:438). Everything else deliberately uses compositor `translate` via WAAPI because motion's layout projection "re-laid the incoming page out several times" (section-switch.tsx:284-287, V).
- **Exit coordination:** `AnimatePresence` in 35 files, `mode="popLayout"/"wait"` in 9. `onExitComplete` used once (1 file). `lib/dialog-lifetime.ts` (252 lines) owns native `<dialog>` retained-exit; Modal stays mounted so exit can run (`ContextMenu.tsx:98` "It stays mounted after it closes, so it can ease out"). `PhoneScreen` exit held by edge swipe via `EdgeExitHold` (use-edge-swipe.ts:14-18). `playbackRate`/`updatePlaybackRate`: 0 uses (no speed-matching of an interrupted WAAPI; they cancel and recreate). `commitStyles`: 1 use.
- **Overlap risks (I):** a WAAPI `forwards` fill is used in places (Toast.tsx:430, section-switch.tsx:143/267, use-route-swipe.ts:143). Fill-forwards animations keep composited state until cancelled; Safari's handling of long-lived `fill: forwards` on `translate` is a known source of stale transforms (not tested here).

### 1.7 Reduced motion handling

**The one listener (V):** `src/clubhouse/lib/reduced-motion.ts`: one module-level `MediaQueryList` (`window.matchMedia('(prefers-reduced-motion: reduce)')`) with `readers` Set; attaches on first subscribe, detaches on last. Exposes `useChReducedMotion()` (OS **or** Settings > Animations off), `useChMotionMode()` -> `'full' | 'fade' | 'off'`, and `chMotionModeNow()` for non-React code (reads `<html data-motion="off">` then the query). Hydration-safe (`useSyncExternalStore`, server snapshot false).

Grep for direct reads outside it (V): `lib/signal.ts:231` (a diagnostic `matches('(prefers-reduced-motion: reduce)')`, not a driver) and a comment in `coachhelm/chat/Ask.tsx:522` that says "ArtifactView honours prefers-reduced-motion itself" (CSS). No `useReducedMotion` from motion/react in Clubhouse code (only 1 hit, which is the lib's own name in a comment) and no `<MotionConfig reducedMotion>`; Reduce Motion is driven by `useChReducedMotion/useChMotionMode/chMotionModeNow`: **271 call sites**. pa-mot-07 note: "three direct Reduce Motion reads onto the one listener" (QUEUE:514).

Paths, by mechanism:
1. **CSS global floor:** `base.css:335-365` inside `@media (prefers-reduced-motion: reduce)`: `.ch-root *` -> `transition-property: opacity !important; transition-duration: var(--ch-dur-crossfade-rm); timing: linear; animation-duration: var(--ch-rm-animation, 1ms) !important; animation-iteration-count: 1 !important`. So Reduce Motion = every transition narrows to opacity; keyframes run in 1 ms unless the rule opts in with `--ch-rm-animation`. Scroll-linked large title is exempted (`animation-duration: auto`). `::backdrop` kept at 1ms.
2. **CSS per-component** `@media (prefers-reduced-motion: reduce)` blocks: **65** across the styles (calendar 4, controls 5, shell 8, messages-details 2, onboard/onboard-tokens, coachhelm-team/ball/thread/file, classes, stats-redesign, stat-terms, quick-chat, ...). Plus one `no-preference` opt-in block (controls.css:854).
3. **Settings > Animations off:** `[data-motion='off']` on `<html>` (ThemeScript before hydration) zeroes 15 duration tokens (`tokens.css:1426-1443`), including `--ch-dur-crossfade-rm: 0ms`; `chTween`/`chFade` in motion.ts honour it.
4. **JS modes:** 'full' / 'fade' (180 ms opacity, `chFade`, `CH_FADE_MS`) / 'off' (instant). Pages, sheets and list rows read the 3-way mode; everything else reads only the boolean ("stays instant under either", reduced-motion.ts:55-58).
5. **Gesture policy:** under Reduce Motion the back swipe is **off** and the bar's Back remains (use-route-swipe.ts header, "3.11").

So there are **5 conceptually different reduce paths** (CSS floor, 65 per-component CSS blocks, `data-motion=off` token zeroing, JS 3-way mode, gesture disablement) but **one** media-query listener for JS. Three CSS-side reads are inherently separate (CSS cannot share the JS listener) (I that this is fine).

Tests: `e2e/clubhouse-reduced-motion.spec.ts` (13 preview screens, WebKit, asserts nothing travels), `e2e/clubhouse-motion-gate.spec.ts` "reduced" rule, Playwright projects `*-reduce` (2 of 4 matrix projects), `src/clubhouse/__tests__/audit-a11y-motion.test.tsx`, `motion-approved.test.tsx` (590 lines). `MOTION_KNOWN` (e2e/clubhouse-gate/motion-known.ts, 231 lines) lists known breaks recorded 15 Nov: bell stack `div.ch-bst` / `span.ch-bst-shell` animate on first paint on every screen entry; popups and Team board still fading 180 ms under Reduce Motion; the CI step is "advisory until a week of nightly runs ... then it gates" (file header, V) - whether it gates now: **not verified**.

### 1.8 Properties animated, flagged (V)

| Concern | Finding |
|---|---|
| width/height/top/left/margin/padding | 0 CSS transitions; 0 in motion props (no `height:'auto'`/`animate={{height}}` found); WAAPI `ask-flight.ts:62` animates a transform arc built from rect deltas (scale + translate), not layout. `Segmented.tsx:69` "no layout property animated". Gate enforces "layout" rule at runtime. **Clean.** |
| `flex-grow` | transitioned in hub.css:2450 and stats.css:6756 (layout property; slips past the gate's static rules). **Gap.** |
| `box-shadow` | 60 transitions + global baseline on every control (see 1.4). Paint cost on press and hover states. |
| `filter` / blur | 4 transitioned `filter`s. No `filter: blur` keyframes (gate: paint-keyframes rule only counts 9, none blur). pa-mot-08 "no blur over scrolling content" (QUEUE:515). |
| `backdrop-filter` | ~7 non-`none` declarations via `--ch-glass-filter: blur(var(--ch-glass-blur)) saturate(var(--ch-glass-saturate))` (tokens.css:685) in shell.css:101/385 (nav rail "frost bar", topbar), onboard.css:87, messages.css:986/3521, quick-chat.css:168, messages-overlays.css (11 mentions incl. `--` vars). Topbar/phone chrome sit over scrolling content: continuous backdrop sampling while scrolling. (I on cost; `@supports not backdrop-filter` opaque fallback exists, shell.css:2036.) |
| Color keyframes | onboard.css `chOxFlash/WetA/WetB` animate `color` (5 decls), `mask-position` in shell.css brand intro (4). |
| `will-change` | 12 standing CSS declarations; 17 JS gesture-scoped. Standing ones: coachhelm-team.css:391,407,419 (Team board hole), shell.css:1924/1935/1945/3468/3475, auth.css:111/1315/1372 (scene layers). |
| `contain` / `content-visibility` | 6 `contain:`/`content-visibility` declarations in 3 files total. Very sparse for a 4k-line calendar.css (V count, I on impact). |

---------------------------------------------------------------------------------------------------

## PART 2. MOTION TEST AND PERF INFRASTRUCTURE (V)

### 2.1 Motion gate and ratchet

`src/clubhouse/__tests__/motion-gate.test.ts` (vitest + postcss):
1. **Hard zero:** no overshooting `cubic-bezier` (y outside 0..1) or `linear()` (point >1 or <0) in any CSS or TS under `src/clubhouse` (test "nothing overshoots on a curve").
2. **Ratchet (may only fall, per file)** from `config/clubhouse/motion-ratchet.json`: `paint-keyframes`, `off-token-duration`, `retired-token`, `keyframes`, `infinite`. Rewrite with `CH_MOTION_RATCHET=write npx vitest run ...` (refuses if any file went up). `motion.css` keyframes are exempt (counts forced to 0, line ~95).
3. Companion tests: `motion-vocabulary.test.ts`, `motion-durations-pinned.test.ts`, `motion-physics.test.tsx` (bounce 0 pinned on every tap-opened surface; sent bubble max .08), `motion-approved.test.tsx` (590 lines, view-transition CSS shape), `motion.test.tsx`, `coachhelm-ask-working-motion.test.ts`, `audit-a11y-motion.test.tsx`, `hover-guards.test.ts`, `pressed-sweep.test.ts`, `haptic-grammar.test.ts`, `calendar-drag-touch.test.tsx`; `shell/__tests__/` has edge-swipe, route-swipe-finish/-listeners, section-strip-motion, phone-shell-gestures, press-any-push, nav-plate-first.
4. Of 428 files in `src/clubhouse/__tests__`, 430 match motion|swipe|press|haptic text anywhere (greedy grep, treat as "motion is heavily referenced", not coverage).

What it can and cannot see: **static** (CSS text and string easings). It does not see inline transitions set from JS (`el.style.transition = 'translate ${ms}ms ...'` in SwipeRow.tsx:81/84, Toast.tsx:405), ms literals in TS (12 `duration: N`), or `flex-grow`.

### 2.2 Runtime motion gate (Playwright, WebKit 390x844)

`e2e/clubhouse-motion-gate.spec.ts` (project `motion-phone`; needs `CH_QUALITY=1`): injects a `recorder()` before page scripts that samples `document.getAnimations()` every frame, then judges (`e2e/clubhouse-gate/motion.ts`): layout props animated, finite durations in the 6-token set, first-paint (only page crossfade allowed; no stagger), reduced (only 180ms opacity fade), idle (after load + 1 s nothing runs, loops included). Then opens every popup kind on the popup lab. Watch window 2500 ms. Known breaks in `motion-known.ts` (231 lines, only shrinks). Disclaimer in header: "It cannot judge smoothness or feel: that is tier D (helm-safari-performance)".

### 2.3 Frame-timing and device tooling

- **`scripts/phone/`** (6 files): `wda-start.sh` (WebDriverAgent to 127.0.0.1:8100), `wda.py` (shot, tap, swipe, type, size, safari), `run.py <plan>` (journeys `sections`, `calendar`, `messages`, `keyboard`, `bell`, `account`), `chunk.sh <plan> [secs]` (Instruments **Animation Hitches** while driving; <= 45 s), `hitches.py` (parse trace). Requires a cabled real iPhone or Simulator; coordinates hard-coded to iPhone 16 Pro (402pt wide; `TITLE/RIGHT/WIDTH` in run.py). Not CI. Nothing in the repo records its results as a baseline (I; no committed hitch budgets seen).
- **`helm-safari-performance` skill:** instrument table (Safari MCP, Web Inspector Timelines/Frames, Simulator, real iPhone, rAF probe, screen recording + ffmpeg); doctrine: "claim only what your instrument measures"; Chromium CPU throttle and CDP traces allowed "only for what Safari cannot do".
- **`npm run clubhouse:perf`** (`scripts/clubhouse/perf-measure.mjs` + `perf-measure-run.mjs`): production build against **local** Supabase, seeded team; Playwright **Chromium** with CDP `Emulation.setCPUThrottlingRate` (default **4x**, `HELM_PERF_CPU=1` for none; perf-measure-run.mjs:44,295), rAF/probe injection, server read tracer, default viewports `1280,390`. About 12 minutes and several GB. `clubhouse:perf:check` = `perf-budget.mjs`; `clubhouse:js-budget` = `route-js-budget.mjs`; `clubhouse:profile` = react-devtools.
- **Playwright traces:** `trace: 'retain-on-failure'` in both clubhouse configs; `screenshot: 'only-on-failure'`. No `tracing.start` frame-timing capture, no `PerformanceObserver('long-animation-frame')` or `longtask` collection found in `e2e/clubhouse-*` (grep for "longtask|long-animation" not run exhaustively: I).
- **`scripts/clubhouse/a11y.mjs`:** axe `target-size` rule, engines x motion x widths x heights matrix with `CH_HEIGHTS=480,844` documented (a landscape-height hook, but see 6.x it must be invoked explicitly).

---------------------------------------------------------------------------------------------------

## PART 3. WHERE FEEDBACK MOTION IS MISSING OR THIN (Q6; mixed I)

Doctrine decisions explain most absences (V): a section switch (tab bar/sidebar) swaps at once by owner decision 2026-10-22 (mot-03, AGENTS.md), first paint is still, digits don't roll, no count-ups, no stagger. So "missing" below means *not covered by a stated owner exception*.

1. **Tab / section switch feedback on phone.** Content swaps with zero motion on the page; feedback is the pill/underline slide (`slide-plate.ts`, 260 ms) and haptic `select`. A `select` haptic is **native only** (`haptics.ts:36 isNativeApp()`), so in Safari/PWA a tab tap has pill motion only. (V on code, I on perception.)
2. **Filter apply / sort on list pages.** `ListPresence` handles insert/remove with FLIP, but filter changes in table-like screens (Roster, Qualifiers, Stats) are value swaps; chart marks glide but **digits and labels snap** (motion-glide.ts:12). A user changing a window sees the bar move and the number jump. (V that digits snap by doctrine.)
3. **Save/commit confirmation.** `Toast.tsx` has a pill ("PILL_DONE_MS") and `haptic('success')` is used 83 times (native only); `ch-check-window/ink` drawn check exists in controls. In web (non-native) a successful write is a toast with no tactile signal. Coverage of the drawn check across Save buttons: not counted (I).
4. **Buttons that are not `.ch-btn/.ch-pill/[data-ch-press]`**: press scale only applies to those (`press.ts:12 PRESSABLE`); 68 `data-ch-press*` attributes in TSX. Rows/links/cards get the wash only if they carry `data-ch-pressable` or are `button, a, [role=button]` (`PRESSED_TARGET`, press.ts:~38). A `div onClick` without role gets **no** press feedback and, being non-semantic, also no `touch-action: manipulation` (base.css:70-78 only targets `a, [role=button], [role=tab], [role=switch], label, select, summary`). (I; I did not enumerate div+onClick.)
5. **Input focus on phone:** `:focus-visible` outline only (base.css:~120); no motion; fine.
6. **Pull-to-refresh** exists but is **native-app + standalone PWA only** ("Safari keeps its own", PullToRefresh.tsx:26-33); Android WebView gets `capacitor-android` branch (inIOSApp returns false for android) so Android has none (V on the function; I on Android consequence).
7. **Hover-only affordances on desktop** are required to have tap/long-press equivalents (MOBILE.md); `Peek.tsx` phone peek only by hold (450 ms, `PEEK_HOLD_MS`) with no visible affordance hinting the hold (I).
8. **Skeleton to content** is a 180 ms crossfade only when the skeleton was shown >= 300 ms; the first-paint of server-rendered pages is intentionally still. The `MOTION_KNOWN` list shows the bell stack still animates in on **every** screen's first paint (`div.ch-bst`), contrary to "first paint is still" (V from motion-known.ts header).

---------------------------------------------------------------------------------------------------

## PART 4. MOBILE / NATIVE

### 4.1 Deployment architecture (V)

- **Capacitor 8 remote shell:** `capacitor.config.ts` `server.url = '<https://helmsportslabs.com/golf/dashboard'>` (PRODUCTION_URL, overridable only by `CAP_SERVER_URL` for local http on LAN); `webDir: 'public'` (only offline.html, icons, etc. are bundled); `errorPath: 'offline.html'` for a failed remote load; `allowNavigation` for helmsportslabs.com + subdomains. Tracked `ios/App/App/capacitor.config.json` must carry the production URL (test `src/test/lib/capacitor-config.test.ts`). **So there is no bundled web app: every launch is a network fetch**; cold start depends on network + deploy.
- **iOS:** `TARGETED_DEVICE_FAMILY = 1` (iPhone only; `project.pbxproj:348,376`). `Info.plist` orientations: iPhone **Portrait only** (`UISupportedInterfaceOrientations` = Portrait, Info.plist:76-79); iPad entries list all four (Info.plist:80-86) but are moot with device family 1 (iPad runs the iPhone app compatibility-scaled; I). `contentInset: 'never'` (edge-to-edge), `scrollEnabled: true`, `allowsLinkPreview: false`, `preferredContentMode: 'mobile'`, `appendUserAgent: 'HelmSportsLabsApp'` (server uses it for App Store 3.1.1 blocking and `isNativeApp`), `backgroundColor #E8E3D5`. Native files: `GolfBridgeViewController.swift` (`allowsBackForwardNavigationGestures = nativeSwipe` at line 94; `helmNav` message handler), `HelmHapticsPlugin.swift`, `AppDelegate/SceneDelegate`.
- **Android:** same `appendUserAgent` ("LOAD-BEARING"), `allowMixedContent false`, `AndroidManifest.xml:23 configChanges="orientation|keyboardHidden|keyboard|screenSize|...|uiMode|density"` (activity not recreated on rotation; no `screenOrientation` lock found, so Android can rotate to landscape, V on grep returning only configChanges line).
- **Plugins in config:** `Keyboard {resize: 'ionic', resizeOnFullScreen, scrollAssist, scrollPadding}`, `PushNotifications`, `SplashScreen {launchAutoHide: true, launchShowDuration: 10000, backgroundColor, showSpinner:false}`, `StatusBar {style:'LIGHT'}`. Splash hides in `hideSplashScreen()` after hydration (`CapacitorProvider.tsx:86`); comments explain launchAutoHide must stay true (10 s ceiling). Status bar synced to theme at runtime (`syncStatusBarToTheme`, CapacitorProvider.tsx:72-74).
- **PWA:** `public/manifest.json` (`display: standalone`, `orientation: portrait-primary`, `start_url /golf/dashboard`, `scope /golf/`, theme/background `#0a331f`, icons 192/512/maskable), `public/sw.js` (version stamped to commit by `scripts/stamp-sw.mjs` on Vercel builds; static cache-first, dashboard pages network-first with cache fallback, API never cached; sign-out deletes caches via `src/lib/offline/private-caches.ts`). Registered via `src/hooks/golf/use-service-worker.ts`. **Colour mismatch (V):** manifest `theme_color/background_color #0a331f` (dark green) vs native shell canvas `#E8E3D5` (linen) vs Clubhouse's light/dark themes; a PWA cold start will show the dark-green splash before a linen page (I on visible effect).
- **Standalone mode:** `PullToRefresh.inHomeScreenApp()` reads `display-mode: standalone` / `navigator.standalone`; that is the only `standalone` read in Clubhouse. No `apple-mobile-web-app-*` check done here.
- **Native-vs-web detection:** `isNativeApp()` = `Capacitor.isNativePlatform()` (`src/lib/utils/capacitor.ts:17`).
- **Haptics are native-only:** `haptic()` returns immediately when `!isNativeApp()` (haptics.ts:34). The iOS Safari / PWA user gets none (no Vibration API fallback, which iOS lacks anyway; Android Chrome PWA could use `navigator.vibrate`: I).

### 4.2 Safe areas, viewport units, keyboard, orientation, scroll

| Topic | Evidence (V) |
|---|---|
| `env(safe-area-inset-*)` | **114** occurrences in 29 CSS files (shell.css 25, coachhelm-plan 13, controls 9, messages 7, rounds-track 6, coachhelm-team 5, coachhelm-ask 5, rounds-setup 4, messages-thread 4, coachhelm 4, coachhelm-file 3, auth 3); `-bottom` 50 in 24 files; **only 8 use `-left`/`-right`** (landscape/notch). TS: 2 (`lib/safe-area.ts`). Root layout `viewportFit: 'cover'` (`src/app/layout.tsx:105`). |
| Viewport units | `dvh` **64** uses in 22 files; `svh` 2 (1 file); `lvh` 0; plain `vh` 6 in 4 files (onboard.css:270,278, messages.css:830 `min(60vh,360px)`, :2508 `min(60vh,440px)`, auth.css:1027); `100vw` 13 in 8 files; `-webkit-fill-available` 0. Plain `vh` in messages.css popovers (60vh) is the iOS large-viewport trap (does not shrink with the URL bar or keyboard). |
| `interactive-widget` | `interactiveWidget: 'resizes-content'` in root viewport export (layout.tsx:109) - Chrome/Android only; comment says iOS ignores it. |
| Keyboard (iOS app) | `@capacitor/keyboard` dynamically imported (`capacitor.ts` header comment: static import caused 400+ telemetry incidents); config `resize: 'ionic'`; CapacitorProvider writes `--keyboard-height` and `body.keyboard-open`; `--keyboard-height` consumed in 21 CSS decls / 7 files, `body.keyboard-open` 16 / 6 files; `data-fw-keyboard-aware` 4 CSS, 3 TS. |
| `visualViewport` | 24 uses: `ui/sheet-keyboard.ts:18` (`useSheetKeyboardFit`, used by Modal), PickerHost, Menu, ContextMenu, `use-popover-fit.ts`, PhoneScreen.tsx:202, quick-chat/QuickChatSession.tsx:103-172, `coachhelm/chat/Composer.tsx:137-160` (resize+scroll), `messages/thread/use-thread-layers.ts:64`. Several independent keyboard solutions (visualViewport, `--keyboard-height`, ionic resize, `interactive-widget`) coexist (I: risk of double-lift; messages thread comment says "lift comes from visualViewport ... and --keyboard-height"). |
| Orientation | Clubhouse TS: no `screen.orientation` or `orientationchange` listeners (10 grep hits are `aria-orientation` or hole orientation). CSS: 0 `@media (orientation)`; landscape handled via **`(max-height: 500px)` queries (228 occurrences, 40 sheets)** and `(max-height: 500px) and (pointer: coarse)` combos (e.g., shell.css:3085,3429). iPhone app locked portrait; Safari/PWA/Android can still go landscape. |
| Breakpoints | `max-width: 820px` 225, `min-width: 821px` 135, then 1180 (13), 1024 (11), 1100 (8), 414 (6), 600 (4); small-phone: `max-width: 360px`/`359px` 2+2, `max-width: 3xx` 25. **One** phone/desk switch at 820 (`lib/phone-query.ts`, `use-phone.ts`). |
| `overscroll-behavior` | 55 in 24 files (mostly `contain` on sheets, menus, strips). Root-level overscroll: body scroll lock `lib/overlay-scroll.ts` sets `body.position: fixed; top: -y; overflow: clip`, `html overflow hidden` (overlay-scroll.ts:20-40, "also stops iOS document rubber-banding behind fixed sheets"). `-webkit-overflow-scrolling` 2 leftovers (obsolete). |
| Scroll restoration | `RouteFrame.tsx:202-205` sets `history.scrollRestoration = 'manual'` and restores on Back/Forward itself (AGENTS.md "Back/Forward scroll restoration"). `use-deep-link-sheet.ts:26` uses `history.state.chDeep`. |
| Scroll snap | 19 CSS decls in 8 files: calendar.css:3156 `x mandatory` + `scroll-snap-stop: always` (day pager), controls.css:1369 `y proximity` (picker wheel), coachhelm-team.css:96 `x mandatory`, shell.css:3326 `x proximity` (strip). |
| `scroll-padding/-margin` | 27 CSS in 16 files, 1 TS. |
| `scroll-behavior` | 58 in 24 files (mostly resets to `auto` I assume; not read). Desktop wheel smoothing `lib/smooth-scroll.ts` (CH_SCROLL_DUR .85s, off under reduced motion). |
| Dynamic Type | `lib/dynamic-type.ts`: reads iOS `-apple-system-body` via probe span, writes `--ch-type-scale` (never < 1, capped XXL) used by `--ch-type-*` tokens (498 matching refs in 42 sheets). `text-size-adjust` 0 uses. Android font scale: handled only by rem (I). |
| Pinch zoom | Viewport allows zoom (layout.tsx comment "allows zoom for accessibility"; no `maximumScale`/`userScalable` found). |

### 4.3 Touch (V unless noted)

- **44 pt rule:** stated in MOBILE.md ("Touch targets are at least 44px"). Implemented in `base.css`/`controls.css`: `controls.css:624-671` documents that every control's **hit area reaches 44x44 on phone without changing how it is drawn** (26px segment, 30px button, 36px pill, switch 40x23 track) via a zero-specificity rule (pseudo-element expansion; 89 `inset: -Npx` declarations across styles, V count); search field 36 drawn / 44 reach (CH-1815); menu rows 44px; desk gets a 24x24 minimum (controls.css:706, F-0022). Enforcement: axe `target-size` rule in `scripts/clubhouse/a11y.mjs:213`, and `e2e/clubhouse-phone-audit.spec.ts:~100` counts `under44` / `under24` controls at 320/375/390/430 widths on 6 coach and 5 player routes (advisory `expect.soft` for overflow; whether under44 asserts: not verified). No unit test pins the 44 rule on *new* components.
- **`:active` vs pointer press:** `lib/press.ts` is a document-level pointer controller (mounted once by shell) that marks `data-ch-pressed` after 50 ms and 10 px slop; CSS reads `[data-ch-pressed]` and keeps `:active` only inside `@media (hover: hover)` (rule enforced by `pressed-sweep.test.ts` + codemod `scripts/clubhouse/pressed-hover.mjs`). 241 `:active` selectors in 35 files total. Reason: iOS paints `:active` on the first frame of a scroll (auditor B6).
- **`touch-action`:** 102 CSS decls in 22 files + 6 TS. Global `manipulation` on `a, [role=button|tab|switch], label, select, summary` (base.css:70-78), `pan-y` on Month grid and Bell cards (calendar.css:3413,3450; controls.css:1889), `none` on draggable rows/plates/scrubbers (calendar.css:2492,4291,4306; controls.css:615,1588,1681,1723; quick-chat scrim). `-webkit-tap-highlight-color` 26 in 13 files; `-webkit-touch-callout` 11 in 7 files; `user-select` 43 in 12 files.
- **Pointer cancellation / capture:** `pointercancel|touchcancel|lostpointercapture|setPointerCapture` 53 uses across TS; `touchstart/touchmove` 41; non-passive listeners (`passive: false`) only 6 (pa-mot-04: "blocking touchmove only for a real gesture").
- **Long-press / context menu:** `ContextMenu.tsx` `CTX_HOLD_MS = 500` (touchHold gives the same menu as right-click, anchored to row; yields to the OS long-press menu on Android), `Peek.tsx` `PEEK_HOLD_MS = 450` (phone peek by hold only), messages `hold-lift.tsx` (reaction bar), calendar drag lift hold (`touch-claim.ts`). Hold times differ (450 / 500 / calendar lift) - iOS's own is ~500 ms (I). Hold haptic: `haptic('press')`.
- **Swipe gestures:**
  - Edge swipe back: `shell/edge-swipe.ts` (310 lines, pure state machine), `use-edge-swipe.ts` (268, pushed `PhoneScreen`, 20 px edge, 8 px slop, 12 px away from edge, 480 ms entry settle `CH_EDGE_ENTRY_SETTLE_MS`), `use-route-swipe.ts` (315, route pages with a "copy of the page beneath"; grab mid-push), `backSwipeBlockedAt()` (edge-swipe.ts:~28-38) yields to inputs, sliders, switches, `.ch-seg`, `[data-ch-swipe-row]`, `touch-action: pan-y` elements, horizontally scrollable ancestors that can still scroll back, `[data-ch-no-back]`. iOS native swipe coordination: `window.webkit.messageHandlers.helmNav` + `window.__helmNativeSwipe`; `claimWebSwipe` posts `{webSwipe}`; **native side needs a Simulator check and App Store build** (MOBILE.md row; V that doc says so; not re-checked).
  - Pull to refresh: `PullToRefresh.tsx` (314 lines): trigger 64, hold 52, max 180, rubber band .55, spokes 8, min spin 520 ms, `haptic('commit')` at trigger; defers to `touch-claim` (calendar row hold) and to inner scrollers; native app or standalone PWA only.
  - Sheet drag: `lib/sheet-drag.ts` (408 lines): close at 25% height or 0.4 px/ms flick, UIKit rubber band (`BAND_C .55, BAND_D 100`), `FLOOR_PX 120` colour extension below the sheet, `BODY_SLOP_PX 6`, `SCROLL_GUARD_MS 100` (Vaul's guard), `CLICK_GUARD_MS 300`, text-entry exclusion.
  - Swipe row `ui/SwipeRow.tsx` (234) + `lib/swipe-row.ts`; messages thread drag-to-reveal times (`use-thread-drag-times.ts`); calendar time drag / month DnD.
- **Gesture conflict handling:** (a) `touch-claim.ts` (idle / pending / lifted; one finger owner), (b) `backSwipeBlockedAt` heuristics, (c) `touch-action` declarations, (d) `data-ch-no-back` opt-out, (e) sheet body-drag claim threshold, (f) `NativeSwipeBackBridge` in `ClubhouseShell` turns native swipe off while a `<dialog open>` or `role=dialog[data-state=open]` exists. **Gap:** conflict resolution is convention-based per gesture; there is no central arbiter and no test that composes all gestures on one screen (I; individual tests exist: phone-shell-gestures.test.tsx).
- **Haptics (V):** one grammar in `lib/haptics.ts`: `select` (UIKit selection tick, throttled 40 ms), `press` (light), `commit` (medium), `success`, `warning`, `error`, plus `hapticScrub` (start/step/end). Call counts (literal `haptic('x')`): `select` 219, `error` 92, `success` 83, `warning` 62, `press` 41, `commit` 5 = 502 call sites, 210 files import the module (556 grep lines). `commit` is intentionally rare (sheet settle, shot logged, PTR trigger). Native-only and `areHapticsEnabled()` pref-gated. No haptics on route push/pop/back swipe ("as on iOS", use-route-swipe.ts:27-28).

### 4.4 Hover dependency (V, postcss)

393 selectors contain `:hover` (excluding `:not(:hover)` and autofill). **371 are inside `@media (hover: hover)`; 22 are not** (matches `hover-guards.test.ts` BASELINE sum 3+2+1+3+1+1+1+1+2+2+2+1+1+1 = 22). 525 raw `hover: hover` text hits, 399 raw `:hover` text hits. Unguarded examples: `auth.css:1649 html[data-fw-theme='dark'] .ch-au a:where(:not(.ch-btn)):hover`, `auth.css:1652 .ch-au-back:hover` and `.ch-au-eye:hover`, `calendar.css:559 .ch-ev.is-past:hover`, `calendar.css:3885 ... .ch-cal-title:hover`, `home.css:281 .ch-h-agenda__open:hover`, `hub.css:2711 ... .ch-hb-iconbtn:hover` / `.ch-hb-reads--open:hover`, plus qualifiers 2, roster 2, rounds-setup 2, practice/messages/onboard/rounds/rounds-track/tournaments-home 1 each. Most are "a reset beside a hover" (hover-guards.test.ts comment). Sticky-hover risk after tap on iOS: low-to-moderate (I). Ratchet only falls.

### 4.5 Mobile overlays (V)

- **Not vaul in Clubhouse.** `vaul` is a dependency (`package.json:285`) used by Fairway/legacy (`src/components/ui/drawer.tsx`, `fairway/overlays/Sheet.tsx`, golf calendar EventDetailModal); `src/clubhouse` imports none (only `edge-swipe.test.tsx` mentions it). Clubhouse sheets are **custom on native `<dialog>`**: `ui/Modal.tsx` (148) + `lib/dialog-lifetime.ts` (252: `showModal()` at :173, `inert` on the surface at :194, retained exit, focus return) + `lib/sheet-drag.ts` + `lib/overlay-scroll.ts` + `ui/sheet-keyboard.ts` (`useSheetKeyboardFit`, visualViewport).
- **Detents:** `Modal` has a `detent` prop (Modal.tsx:~44-46); **snap points** beyond one open + dismiss: not found (sheet-drag.ts greps no "snap"; closes at 25%/flick; single detent) (V on grep).
- **Dimming:** `<dialog>::backdrop`; its transition is kept under Reduce Motion by an explicit exception (`base.css:~362-365`, audit A-12).
- **Scroll lock:** one lock per document with nested count (`overlay-scroll.ts`): `body{position:fixed; top:-y; overflow:clip}`, `html{overflow:hidden}`; only the desktop `.ch-canvas` scroller is locked (not phone). Restores scroll position and route on release (route check at :~20).
- **Focus:** native top layer traps focus; `fallbackFocus` prop for deleted openers; covered screens inert (PhoneScreen).
- **Keyboard-aware sheets:** Modal via `useSheetKeyboardFit`; `PhoneScreen` has keyboard-aware scroll lock (visualViewport at :202); quick chat computes `visualViewport.offsetTop + key.bottom` (QuickChatSession.tsx:103); Messages composer layers `use-thread-layers.ts`; CoachHelm Composer measures `visualViewport` resize+scroll. Each reimplements.
- **Menus/pickers:** `Menu.tsx`, `PickerHost.tsx`, `ContextMenu.tsx` (phone becomes a sheet), `use-popover-fit.ts`: portal positioning bounded by `visualViewport`.
- **Gap (I):** no real detent/snap sheet (e.g., half -> full) exists; a design needing `medium/large` detents has to be built.

### 4.6 Mobile charts (V)

- Interaction hook: `lib/use-chart-pin.ts` (179 lines) used by `ui/charts/Line.tsx` (426) and `screens/stats/{LegBars,RoundTrend,PuttBands,TeamRank,ScoreMixBar}.tsx`. Mouse hover reads nearest column; a finger dragged sideways after `SCRUB_START_PX = 8` (and mostly sideways) **scrubs**; release keeps the last column pinned; tap pins nearest; tap outside / Esc clears pin; arrow keys step; aria-live line speaks for pin or key only.
- **Where the readout is:** "in the chart's header line" above the plot, **not** a tooltip under or near the finger. So there is **no finger-offset problem by design** (finger never covers the reading) but also no on-plot crosshair/callout; the "crosshair" is the marked point/column (I on visual; Line.tsx not fully read).
- **Scrub haptics:** `hapticScrub` start/step/end ticks on each point (haptics.ts ~58+), native only.
- **Gesture conflict:** plot has `touch-action: pan-y` so vertical swipes scroll the page and cancel the scrub; horizontal edge swipe back is blocked on `touch-action: pan-y` elements by `backSwipeBlockedAt` (so a chart touching near the left edge cannot be back-swiped... only matters within 20 px of the edge: the edge path does not use this check (edge-swipe starts within edge px regardless; I)).
- Small charts: no pinch-zoom or pan; windows via segmented control; marks glide on window change (`useGlide`, 360 ms). Static accessible figures (`ChartTable.tsx`, `ChartText.tsx`).
- Long-range: Fairway chart components (`src/components/fairway/charts/*`) use motion and are separate; not in scope.

### 4.7 Device test matrix (V)

**Playwright projects**

`playwright.clubhouse.config.ts` (9 projects): `chromium-no-preference`, `chromium-reduce`, `webkit-no-preference`, `webkit-reduce` (quality/playground specs; default viewport 1280x720 Playwright default, no isMobile/hasTouch), `gate-phone` (WebKit 390x844), `gate-desktop` (Chromium 1440x900), `motion-phone` (WebKit 390x844), `pixels-phone` (WebKit 390x844), `pixels-desktop` (Chromium 1440x900). Local `next dev --webpack` fixtures only (`/clubhouse-preview/*`), `workers: 1`, `retries: 0`. Pixel baselines are not committed (`CH_VISUAL_BASELINES` required). `clubhouse-quality.spec.ts:13` sweeps widths including 768 and 1280.
`playwright.clubhouse-journeys.config.ts`: `chromium`, `webkit` at **1280x860** (write journeys; round, calendar, qualifiers, hub, settings, messages), local Supabase, nightly.
`playwright.config.ts` (root, Fairway/Baseball): chromium, `setup`, `baseball-coach`, `baseball-player`, `mobile-public/coach/player` (Desktop Chrome **with plain viewport, deliberately not isMobile**, per comment at lines 168-171); WebKit project commented out (lines 196-197).
**Touch emulation (`hasTouch/isMobile`)**: only `e2e/clubhouse-calendar-drag-touch.spec.ts:17` (390x844, touch), `e2e/golf-mobile-native.spec.ts:6`, `e2e/appstore-screenshots.spec.ts:67-68`. **All other Clubhouse phone tests are mouse-driven viewports**, so `pointerType: touch` paths (press controller 50 ms delay, edge swipe, sheet drag, scrub, hold menus) are covered mainly by vitest with synthetic events.
`e2e/clubhouse-phone-audit.spec.ts`: widths **320, 375, 390, 430** (env `PHONE_AUDIT_WIDTHS`), height 844, 6 coach + 5 player routes, horizontal-overflow `expect.soft`, target-size counts, screenshots; this is the only 320/375 coverage (and it runs under whichever project invokes it; engine tier not stated in the spec).
`scripts/clubhouse/a11y.mjs`: axe matrix engines x schemes x motion x widths x heights (CH_HEIGHTS e.g. 480 for landscape, opt-in).
Real device/simulator: `scripts/phone/` (iPhone via WebDriverAgent + Instruments hitches), documented Simulator checks; native back-swipe "needs a Simulator check and an App Store build" (MOBILE.md). Android: `docs`/`android/` exist; no Clubhouse Android emulator scripts found in `e2e` or `scripts/clubhouse` (grep "android" not exhaustive: I).

**NOT covered (V that nothing in configs/specs requests it; I that nothing elsewhere does)**
- Landscape phone (CSS has 228 `max-height:500px` rules; the only test hook is `CH_HEIGHTS=480` in a11y.mjs, opt-in, default heights 844/800).
- Tablet/iPad as a Clubhouse surface (iPad app = iPhone compatibility; Safari on iPad at 768 exists in quality sweep only at 768x600 desktop-like).
- Android WebView/Chrome (no Playwright `devices['Pixel']`, no emulator script).
- Increased text size (Dynamic Type XXL+): code exists (`dynamic-type.ts`, `type-scale.ts`), tests exist as vitest (`legacy-type-roles.test.ts`) but no browser run with `-apple-system-body` scaled; Playwright cannot set it (I).
- Slow network: no `route` delay/`offlineMode`, no CDP network throttle in Clubhouse specs (perf-measure uses CPU throttle only; offline covered by `offline-sync.test.tsx` vitest). `OfflineBanner` has motion.
- CPU throttle: only `clubhouse:perf` (Chromium, 4x CDP). **No WebKit CPU throttling exists** (Playwright cannot); nothing else.
- Touch-emulated WebKit for the gesture surfaces (see above).
- Real keyboard (iOS soft keyboard) in CI; keyboard behaviour only on Simulator/phone manual.
- Notch/Dynamic Island safe-area top/bottom in CI (viewport has no env() insets in Playwright; safe-area CSS is exercised as 0).
- Dark mode x phone x motion: a11y matrix covers schemes; motion-phone uses default light scheme (`colorScheme: 'light'` in config) (V).
- Back-forward cache, app resume (`appStateChange` listener exists at use-quiet-refresh.ts:80) untested in e2e.

---------------------------------------------------------------------------------------------------

## PART 5. RANKED WEAKNESSES (evidence)

Ranked by (user-visible impact on phone) x (likelihood) x (unverifiability).

1. **The app is a pure remote shell: no bundled shell, no precache of the web app.** Every cold start = network + SSR; the splash is a 10 s ceiling (`capacitor.config.ts` SplashScreen). A slow network is **never tested** and the feel work (all of Part 1) is irrelevant if first paint takes seconds. Evidence: capacitor.config.ts server.url, `webDir: 'public'`; no throttled-network spec. (V architecture, I impact)
2. **Touch gestures are tested mostly with a mouse in Playwright.** Only 1 Clubhouse e2e uses `hasTouch/isMobile` (clubhouse-calendar-drag-touch.spec.ts:17). Press delay, edge swipe, sheet drag, PTR, scrub, hold-menus rely on vitest synthetic events; iOS WebKit touch-sequence quirks (`:active` on scroll, touchcancel on scroll takeover) are only found on device. (V)
3. **No smoothness measurement in CI, and device tooling is manual, coordinate-hard-coded to iPhone 16 Pro, and records no committed baseline.** `scripts/phone/` + skill; `clubhouse:perf` is Chromium + 4x CPU only, 12-minute build. The "motion gate" proves what animates, explicitly "cannot judge smoothness or feel". (V)
4. **552 retired-token uses vs a 10-token vocabulary; the ratchet only counts files, not progress per surface.** shell.css 64, rounds.css 43, stats.css 35. Retirement will take sustained effort and any redesign inherits an alias-heavy codebase. (V) Also **MOTION_KNOWN is advisory** per its own header, so first-paint violations (bell stack on every screen) ship. (V header, I on gate status)
5. **Keyboard handling is five overlapping mechanisms** (Capacitor Keyboard `resize: 'ionic'`, `--keyboard-height`/`body.keyboard-open`, `visualViewport` in 9 places, `interactive-widget: resizes-content`, per-sheet `data-fw-keyboard-aware`). 24 `visualViewport` uses, each with its own math (QuickChatSession.tsx:103-172, Composer.tsx:137-160, use-thread-layers.ts:64, PhoneScreen.tsx:202, sheet-keyboard.ts:18). No test drives a soft keyboard. (V, I risk)
6. **Haptics are native-app only.** `haptics.ts:34` returns on `!isNativeApp()`; 502 call sites give nothing in Safari/PWA/Android Chrome (Android Chrome supports `navigator.vibrate`). If the Design Lab will be judged in a browser, the tactile half of the grammar is invisible. (V)
7. **Android is a second-class target with no gesture or back handling evidence.** No Capacitor `App` `backButton` handler in `src` (only `appStateChange`, `appUrlOpen`); PullToRefresh disabled on Android (`inIOSApp` false); edge swipe web path relies on `helmNav` (iOS only); activity not locked to portrait (`AndroidManifest.xml:23`), Clubhouse is "iPhone only, portrait (D-22)". Hardware/gesture back on Android will run WebView history and may fight `RouteFrame` pop animation + `scrollRestoration='manual'`. (V gaps, I behaviour)
8. **Landscape is handled by 228 `max-height: 500px` rules rather than a layout strategy, and nothing tests it.** iPhone app is portrait-locked but Safari/PWA/Android rotate. Only 8 safe-area `left/right` uses. (V)
9. **Phone/desktop is a single 820px cut.** `useChPhone()` and 225 `max-width: 820px` rules. iPad portrait (768-834 wide in Safari) falls on the phone side at 768 and the desk side at 834 (iPad Air 820 -> phone, Pro 11 834 -> desk): behaviour flips across common tablet widths. (V breakpoints, I device widths)
10. **Plain `vh` still in 4 files** (messages.css:830,2508 `min(60vh,...)` popovers; onboard.css:270,278; auth.css:1027) vs 64 `dvh`. These do not track the iOS URL bar/keyboard. (V)
11. **Press feedback covers only `button, a, [role=button], [data-ch-pressable]`.** A `div` with `onClick` and no role gets no wash, no `touch-action: manipulation` (so 300 ms-class delays are gone only via viewport meta), and fails semantics. No lint/test catches `div onClick` in Clubhouse (not searched; I). (V press.ts selectors)
12. **Box-shadow is transitioned in 60 places plus the baseline on every control**, and `filter` 4, `flex-grow` 2, `clip-path` 2: paint-class transitions that the gate (keyframes only) does not police. `flex-grow` is a layout property transitioned despite the "no layout property animated" rule. (V)
13. **`backdrop-filter` blur (~7 declarations) on top bar, nav, messages composer/header over scrolling content.** Continuous re-sampling during scroll on older iPhones; `@supports` fallback is opaque but not a perf fallback. pa-mot-08 claims "no blur over scrolling content", yet shell.css:385 (topbar `position: sticky; z-index: sticky`) uses the glass filter. (V declaration, I cost; contradiction to verify on device)
14. **Hand-rolled interruption per component.** 61 `chSpringCurve` sampled-spring WAAPI animations, 44 `.cancel()`, 0 `playbackRate`; an interrupted `translate` animation must reconstruct its current position (NavPlate.tsx:57) or snaps. Each new overlay re-solves this. (V counts, I defect rate)
15. **domMax shipped to everyone** for the calendar drag and Toast `layout` (ClubhouseFrame.tsx:77); only 2 live `layout` props. Bundle cost on a remote-loaded shell; `route-js-budget` exists but I did not read its numbers. (V, I)
16. **Reduce Motion has five parallel paths** (CSS floor, 65 per-component CSS blocks, `data-motion=off` token zeroing, JS 3-mode, gesture removal) and a pre-existing `MOTION_KNOWN` list of Reduce-Motion fades that "still fade 180 to 462 ms" (QUEUE fix-motion-doctrine row, V). The auth/onboard looping scenes (8+1 `infinite`) rely on the CSS floor to stop looping. (V)
17. **PWA manifest colour (#0a331f) disagrees with the native canvas (#E8E3D5) and Clubhouse light/dark themes;** PWA display/orientation lock `portrait-primary` conflicts with Android rotation allowed. (V values; I visible)
18. **Hold gesture timings differ (Peek 450, ContextMenu 500, calendar lift custom) and have no visible affordance.** (V constants, I UX)
19. **Pull-to-refresh and edge-swipe-back exist only where a native bridge or standalone is detected; Safari tabs rely on browser defaults**, so the same screen behaves differently between Safari (reference browser per rules) and the app. Native back-swipe wiring "needs a Simulator check and an App Store build" (MOBILE.md). (V)
20. **`contain`/`content-visibility` nearly absent (6 declarations)** while calendar.css exceeds 4,500 lines and Stats/Calendar are the heaviest pages; scroll and layout cost scale with DOM. (V count, I effect)
21. **Dynamic Type only recognised via `-apple-system-body` probe on `(pointer: coarse)`;** nothing for Android font scale or desktop browser text zoom beyond rem, and no automated check at XXL. (V code, I gap)
22. **Chart scrubbing has no on-plot indicator beyond the marked point and relies on a header line;** with `touch-action: pan-y` a diagonal drag may be taken by page scroll; 8 px start threshold (SCRUB_START_PX) vs 8 px edge slop vs 10 px press slop are three similar-but-different thresholds. (V constants, I UX)
23. **Tab/section switches are instant by owner decision** while pill motion and `select` haptic (native only) are the only feedback; in Safari the tactile layer is absent. (V)
24. **Standing `will-change` (12 CSS declarations)** on Team board hole and Auth scene layers promote layers for the page lifetime despite MOT-19 policy elsewhere. (V)
25. **Keyframe sprawl in auth/onboard (32 of 65 @keyframes, 9 paint keyframes, 9 of 19 infinite)** is exempt only by ratchet; they are the longest-running animations in the product and the only ones that animate `color`/`mask-position`. (V)

---------------------------------------------------------------------------------------------------

## PART 6. NEVER TESTED (to my reading of config, specs and scripts)

1. Real-network cold start of the Capacitor shell under 3G/offline-to-online (splash ceiling 10 s, offline.html path) on a device.
2. Any WebKit run with CPU throttle; any Android WebView run.
3. Touch-emulated WebKit run of the press controller, sheet drag, PTR, edge swipe, hold menus, chart scrub (only calendar drag is).
4. Landscape phone (iOS Safari/PWA, Android), iPad Safari at 820/834, split-view/Stage Manager widths, foldables.
5. Dynamic Type XXL / accessibility sizes, Android font scale, browser text zoom 200%.
6. Soft-keyboard open on composer/sheet/forms in an automated run (and the Capacitor `ionic` resize interplay with `visualViewport`).
7. Safe-area insets (notch, Dynamic Island, home indicator): Playwright reports 0; only the real Simulator/phone shows them.
8. Hardware/gesture back on Android; iOS native back swipe vs the web swipe (documented "needs a Simulator check").
9. App resume / bfcache / backgrounded gesture state (`appStateChange` path).
10. Haptic correctness (pattern, throttling) on a real Taptic Engine; only the grammar is unit-tested (`haptic-grammar.test.ts`).
11. Sustained-scroll frame rate with `backdrop-filter` chrome, Calendar (4.5k-line sheet) and Stats at 4x throttle in **Safari**.
12. Pointer-cancel while a WAAPI `fill: forwards` animation is mid-flight (Toast, section-switch) on iOS 17/18/26.
13. Low Power Mode (iOS throttles rAF to 30 fps and may disable some animations).
14. Reduce Motion toggled **while** a push/sheet/loop is running (the single listener updates React state; running WAAPI/keyframes are not cancelled by it: I).
15. Slow-image/slow-font paint effects on motion (font swap during entry).
16. Right-to-left and long-translation expansion of 44 pt hit areas (`inset: -Npx` pseudo-elements: 89) overlapping adjacent targets in dense rows.
17. Pixel baselines: `pixels-*` projects need baselines "from the nightly run on main"; none committed, so visual regression on phone is not a gate here (V from config comment).

---------------------------------------------------------------------------------------------------

## Contradictions and disagreements between sources

- **"Twelve tokens" vs the tokens file:** tokens.css:1026-1037 holds 6 durations + 2 curves + 2 busy beats = 10 vocabulary tokens. The motion-gate header and `lib/motion.ts` say "twelve tokens: six durations, two curves, two loading beats" (6+2+2 = 10). The "twelve" is either a stale count or includes two I could not identify. (V on the arithmetic.)
- **`MOBILE.md` "iPhone only, portrait" vs `Info.plist` iPad orientation keys and Android unrestricted rotation:** harmless on iOS (device family 1), real on Android and PWA. (V)
- **pa-mot-08 "no blur over scrolling content" (QUEUE:515) vs `shell.css:385-386` `backdrop-filter: var(--ch-glass-filter)` on the sticky top bar** (z-index sticky, selector context at shell.css:376-386). Needs a device look to see if it is the same thing. (V code; I conflict)
- **`.claude/rules/clubhouse.md`/AGENTS.md: "first paint is still"** vs `MOTION_KNOWN`: bell stack animates on every screen's first paint. (V)
- **SMOOTHNESS_AUDIT.md (2026-10-06)** predates the November wave; its counts and claims (press universal, staggered reveal) are superseded. Not used as evidence here.
- **AGENTS.md says `layoutId` replaced** and grep finds 4 hits for "layoutId", all in comments (V), consistent.

## What I could not verify
- Anything on a device or in Safari: frame rate, feel, gesture arbitration, keyboard behaviour. No browser, simulator or phone was run (read-only pass).
- Whether `MOTION_KNOWN` / the motion gate is a blocking CI check today (header says advisory; CI workflow not read).
- Whether `e2e/clubhouse-phone-audit.spec.ts` asserts under-44 targets or only records them; which engine runs it.
- `MOTION-AND-VISUAL` doc contents (cited by code, not opened); `docs/clubhouse/phone/shell-gestures.md` not opened.
- Per-component interrupt correctness (spot-read 3 files only); `Line.tsx` and `useGlide` internals only skimmed.
- Android behaviour (no emulator, `AndroidManifest.xml` read only for `configChanges`/orientation).
- Counts are text/postcss counts, not runtime; "matches" for `requestAnimationFrame` (108) and `AnimatePresence` (126) include imports and comments.

## Files of interest (absolute)
- /home/user/helmv3/src/clubhouse/styles/tokens.css (1017-1077, 1426-1443)
- /home/user/helmv3/src/clubhouse/styles/motion.css
- /home/user/helmv3/src/clubhouse/lib/motion.ts, reduced-motion.ts, press.ts, haptics.ts, sheet-drag.ts, overlay-scroll.ts, touch-claim.ts, use-chart-pin.ts, motion-glide.ts, slide-plate.ts, nav-motion.ts, dynamic-type.ts
- /home/user/helmv3/src/clubhouse/shell/{edge-swipe,use-edge-swipe,use-route-swipe,PullToRefresh,RouteFrame,PhoneScreen,section-switch}.ts(x)
- /home/user/helmv3/src/clubhouse/__tests__/motion-gate.test.ts, hover-guards.test.ts, pressed-sweep.test.ts
- /home/user/helmv3/config/clubhouse/motion-ratchet.json
- /home/user/helmv3/e2e/clubhouse-motion-gate.spec.ts, e2e/clubhouse-gate/motion-known.ts, e2e/clubhouse-phone-audit.spec.ts, e2e/clubhouse-calendar-drag-touch.spec.ts
- /home/user/helmv3/playwright.clubhouse.config.ts, playwright.clubhouse-journeys.config.ts, playwright.config.ts
- /home/user/helmv3/capacitor.config.ts, public/manifest.json, public/sw.js, ios/App/App/Info.plist, android/app/src/main/AndroidManifest.xml
- /home/user/helmv3/scripts/phone/, scripts/clubhouse/perf-measure*.mjs, scripts/clubhouse/a11y.mjs
