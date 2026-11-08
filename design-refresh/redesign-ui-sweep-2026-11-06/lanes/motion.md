# Motion and interaction audit: the nine redesign lanes (MOT)

Read-only audit of `njrini99-code/helmv3` at main `062f8a2`, 2026-11-06. Sources: each lane's `design-refresh/<lane>/07-MOTION.md`, RUBRIC H2 / H3 / H19, `styles/tokens.css:840-889` and `:1290-1360`, `lib/motion.ts`, `lib/reduced-motion.ts`. Owner bar: Apple-smooth and accurate, keep Lenis, Text Size scales, Reduce Motion is a 180ms opacity fade (`CH_FADE_MS`), the page behind a push slides 24%, and there is **no first-paint motion: motion answers the user's action only.** Where a 07-MOTION row asks for first-paint motion (Team fly-in, Stats grow-once, Read draw-ins), the owner's later decision wins and the row is flagged.

Coverage note: classes-roster-home has no 07-MOTION.md (code cites "classes-roster-home 07 M-CRH-46", but no M-CRH row exists anywhere under `design-refresh/`). Those rows are judged against the shared rules. Ask v2 (`coachhelm-ask-v2.css`) is behind `coachhelm_ask_v2` (off everywhere, file header line 1). Its findings land when the flag turns on.

---

## Motion system: one set of rules for every lane

Each rule names the file in `src/clubhouse/` that already does it best, so fixes reuse it instead of writing new motion.

1. **Tokens only.** No literal `ms`, `s` or `cubic-bezier` in lane CSS or TSX. The scale is press 110, quick 180, base 260, release 280, reveal 520, plus the sampled springs. A sampled spring curve plays **only at the duration it was sampled for**: `--ch-ease-spring-smooth` goes with `--ch-dur-spring-smooth`, and `chSpringCurve(kind)` with its own `.ms`. Never pair a spring curve with a different duration.
   Best: `styles/tokens.css:840-889` plus `:1271-1287`, and `lib/motion.ts` (`CH_DUR`, `chSpringCurve`). Best user of them: `lib/slide-plate.ts:57-68`, whose curve and duration come from one call.
2. **Transform and opacity only.** No `width`, `height`, `left`, `top`, `margin`, `padding` or `grid-template-*` in a transition, a keyframe, WAAPI or a per-frame React render. A value change that moves a mark is a transform from its old box.
   Best: `screens/stats/LegBars.tsx:79-93`: `spanTransform` / `shiftTransform` glide bars on transform while `left`/`width` stay at the target.
3. **Enter and exit.** Every sheet, drawer, push, menu and inspector has both an enter and an exit. It animates from its origin, can be interrupted from where it is, and keeps its content while it leaves.
   - Sheets and drawers: `lib/dialog-lifetime.ts` (rise held for two frames, exit from the live transform, thrown exits keep their velocity, `retainContent`), through `ui/Modal.tsx` / `ui/FormSheet.tsx`.
   - Pushed screens: `shell/PhoneScreen.tsx` plus `lib/nav-motion.ts` (24% underlay `CH_UNDERLAY_SHIFT`, dim, edge-swipe).
   - Menus: `ui/Menu.tsx:180-184` (`CH_POP`, `transformOrigin` from the anchor).
   - Content swaps: `ui/Swap.tsx`, with `resize="instant"` (see MOT-09).
4. **Press feedback on everything tappable.** Keys up to 240 wide scale (`.ch-btn`, `[data-ch-press]`). Rows and cards tint through `[data-ch-pressed]`, landing after `--ch-dur-press-delay` (50ms) and clearing at once.
   Best: `lib/press.ts` (controller) and `styles/home.css:3240-3256` (`a.ch-hm-next[data-ch-pressed]::after`, opacity tint, 50ms delay, press duration).
5. **Reduce Motion means a 180ms opacity fade; Animations off means instant.** Pages and sheets read `useChMotionMode()` (`'full' | 'fade' | 'off'`), never the boolean `useChReducedMotion()`. Under `'fade'` the transform is dropped and opacity fades over `CH_FADE_MS`. Under `'off'` nothing moves. The spinner keeps turning under Reduce Motion (H19 / OQ-18).
   Best: `lib/dialog-lifetime.ts:136-145` (fade out where it stands under `fade`, finish at once under `off`) and `styles/shell.css:2014-2025` (view-transition crossfade). WAAPI or `!important` is needed while the base.css floor stands (MOT-01).
6. **Route and tab transitions are shell-owned.**
   - Phone drill-in: push 462 on the smooth spring, with the underlay at −24% and dimmed. Back: pop. Section tab: instant.
   - Desktop drill-in: crossfade with a 120 out / 180 in gap. Sub-view switch: dim plus rise from the dimmed opacity (`use-view-switch.ts`).
   - No lane writes its own push.
   Best: `shell/RouteFrame.tsx`, `lib/nav-motion.ts`, `styles/shell.css:1940-2025`, `screens/coachhelm/use-view-switch.ts` with `styles/coachhelm.css:1062-1080`.
7. **No first-paint motion, no staggers, no draw-ins on scroll.** Chart marks are drawn at rest. They glide only when the user changes the window, never on a refresh. Digits never roll.
   Best: `lib/motion-glide.ts` (`useGlide` returns the target on first paint). Its React-state-per-frame driver should hand off to transforms (MOT-07).
8. **Gestures carry velocity and rubber-band.**
   Best: `lib/sheet-drag.ts` (`rubberBand`, `FLICK_PX_PER_MS`, `chThrownExit`), `lib/swipe-row.ts`, `shell/PullToRefresh.tsx:20-22`.
9. **One skeleton.** `.ch-skel` with `--ch-dur-shimmer`, inside a `main[aria-busy='true'][aria-label^='Loading']` so the route hold and fade apply. Its shape is the final layout's (an aspect-ratio box for an SVG, not a fixed px height).
   Best: `styles/shell.css:853-866` plus `styles/base.css:280-294`.
10. **Scroll-linked state** comes from an IntersectionObserver sentinel, or failing that a passive, rAF-throttled listener. No per-scroll React state.
    Best existing: `shell/large-title.tsx:100-125` (passive and rAF-throttled). For the stuck state, an IO sentinel is the target.

---

## Coverage table: every subpage and interaction

Verdict key: **OK** matches spec and system. **Mismatch** is built but off spec or token. **Missing**: the spec asks for motion and the code hard-cuts. **Banned**: the motion breaks the owner's no-first-paint rule or H2. **RM**: the Reduce Motion or Animations-off path is wrong. MOT-n links to the finding.

| Subpage | Interaction | What 07-MOTION.md specifies | What the code does (file:line, ms, easing, properties) | Verdict |
|---|---|---|---|---|
| All lanes, phone | Drill-in push | 462 smooth spring, underlay −24%, dim | `lib/nav-motion.ts` playPush, `shell.css:1952-1985`, `tokens.css:1345-1347` (462, `--ch-vt-parallax:-24%`, brightness .9) | OK |
| All lanes, phone | Back pop and edge swipe | Reverse of push, velocity carried | `shell.css:1980-1985`, `shell/use-edge-swipe.ts:99-136` (`chSpringCurve` with velocity, `hold`) | OK |
| All lanes | Page change under Reduce Motion | 180 opacity crossfade | `shell.css:2014-2025` (`--ch-dur-vt-fade` 180) | OK |
| All lanes, phone | Section tab switch | Instant | `shell.css:1940-1946` (`data-ch-tab`: new page no animation, old hidden) | OK |
| All lanes, desktop | Sidebar rail fold | none (shell) | `shell.css:4047` `width`, `:4111-4113` `margin`/`padding`, `:4121-4140` `grid-template-columns`, all 462 smooth | Banned, MOT-10 |
| All sheets (Modal, FormSheet) | Open / close / drag | Rise 462 smooth, close 280 ease, drag 1:1 with rubber band, RM 180 fade | `lib/dialog-lifetime.ts:17-30` rise, `:148-164` exit **260** CH_EASE, `lib/sheet-drag.ts:15-32,254` | Mismatch (exit 260, not 280), MOT-37 |
| All menus (ui/Menu) | Open / close | `CH_POP` 180 from the anchor, RM fade | `ui/Menu.tsx:180-184` origin from anchor, `chTween('quick', reduced)` gives **0ms** under RM | RM, MOT-22 |
| Toasts (ui/Toast) | In / out | M-MSG-25: in 496 pop, out fade | `ui/Toast.tsx:369` framer `y: 6` (main thread), `:390` RM 0ms | Mismatch / RM, MOT-38 |
| All keys | Press | 110 down / 280 up, scale about 6px | `lib/press.ts` WAAPI `scale` | OK |
| Route skeletons | Hold 300, then fade in | base hold + fade | `base.css:285-294` keyed on `aria-label^='Loading'` | OK where labelled; Team and File not labelled, MOT-27 |
| Home (coach and player) | Team legs bars | no row (no CRH spec); owner: none on paint | `home.css:4806`, `:5341` `scaleX(0)→1` 280 `--ch-ease` on every mount | Banned, MOT-04 |
| Home | Latest round pager | Swap slide 12px | `screens/home/LatestRound.tsx:77` `chSwap(dir, reduced)` base 260; RM gives 0ms | RM, MOT-22 |
| Home | Next card / rows press | Tint | `home.css:3240-3256`, `:3268`, `:3298` press 110 after a 50 delay | OK (reference) |
| Roster | Face card press (phone) | Tint | `roster.css:280-282` `[data-ch-pressed]{transform:translateY(0)}`: no tint, no scale | Missing, MOT-30 |
| Roster | Face card hover (desktop) | none | `roster.css:271-277` lift −2px over base | OK (in hover media) |
| Roster | Spread coins move / hover | none | `roster.css:2545` translate 520; `:2561` avatar 180 `--ch-ease-spring` (overshoot about 10%) | Mismatch, MOT-39 |
| Roster | Peek popover | none | `screens/roster/RosterPeek.tsx:89` `chTween('base', reduced)`, RM 0 | RM, MOT-22 |
| Roster | Email chip in | none | `roster.css:1031` scale .92→1, 180 | OK |
| Roster / Classes | Segmented thumb | M-LNS-05 / M-MSG-03a: thumb slides | `lib/slide-plate.ts:62-68` translate **and non-uniform scale(w,h)**; RM instant (`:51`) | Mismatch, MOT-24 |
| Classes | Import "reading" scan | none | `classes.css:1023-1031` 1.9s infinite, fixed `translateY(130px)` travel | Mismatch, MOT-44 |
| Classes | Class awareness popover | fade 180 | `class-awareness.css:180` in only, no exit | Missing exit, MOT-41 |
| Ask | New answer turn | fade | `coachhelm-ask-v2.css:17` `0.26s` literal | Mismatch, MOT-25 |
| Ask | Step row in | M-ASK-02 260 smooth | `:27` `0.26s` + `--ch-ease-spring-smooth` (curve sampled for 462) | Mismatch, MOT-26 |
| Ask | Active step dot | 1.2s loop | `:32` `0.6s ease-in-out infinite alternate` | Mismatch / RM, MOT-16 |
| Ask | Step done tick | 240 | `:31` `0.24s` literal | Mismatch, MOT-25 |
| Ask | Work chevron | 260 | `:23` `0.26s` literal | Mismatch, MOT-25 |
| Ask | Confirm capsule sweep | 900 linear | `:103` `0.9s linear infinite` literal | Mismatch / RM, MOT-16 |
| Ask | Receipt ring | 620 | `:113` `0.62s` literal | Mismatch, MOT-25 |
| Ask | Undo drain ring | 8000 linear, "a timer, not motion" | `:118` `8s`; RM floor makes it 1ms, so the ring reads empty while Undo still works | RM, MOT-20 |
| Ask | Brief card rise | M-ASK-33 settle | `:485` on mount; replays on every remount of a thread holding a brief | Banned, MOT-28 |
| Ask | Brief pane next / back | send spring | `:486-487` OK; RM uses `--ch-dur-rm-fade` **120**, not 180 (`:498`) | RM, MOT-01 |
| Ask | Brief progress dots | settle | `:489` transitions **`width`** | Banned, MOT-17 |
| Ask | Summary pills | M-ASK: none staggered | `:496` delay `index × press/2.75` (about 40ms each) | Banned (stagger), MOT-29 |
| Ask, desktop | Artifact side pane | 462 in / 280 ease out | `:473-474` smooth spring both ways; the 452px aside reflows the chat column at once | Mismatch, MOT-33 |
| Ask / Practice, phone | Artifact or full-plan push (M-ASK-16, M-ASK-30) | Push as PhoneScreen, 462, −24% underlay, edge swipe | `chat/parts/Artifact.tsx:77` CSS keyframe `ch-ak-slide-in` (`:470-474`): no underlay, no dim, no edge swipe, close mid-open jumps | Mismatch, MOT-14 |
| Ask | Streaming words | M-ASK-14 320 | `:463-466` `--ch-dur-word` | OK |
| Ask | Press on buttons and cards (M-ASK-27) | scale .97, 110 / 280 | v2 CSS has 0 pressed rules; `data-ch-press` only on FollowUps, BriefCard `.p`, Artifact `.acard`; `.opt`, `.receipt .lk`, `.conf .btns .s` have nothing | Missing, MOT-31 |
| Ask (v1) | History drawer | slide from left, drag | `History.tsx` `useDialogLifetime(direction:'left')` + `useSheetDrag` | OK |
| Ask (v1) | Composer picker | pop 180 | `coachhelm-ask.css:717-735` in only | Missing exit, MOT-41 |
| Team | Hole fly-in (M-TEAM-01 to 04) | 1900 once a session | `team/team-motion.ts:13-90` rAF writes `cx`/`cy` and `strokeDashoffset` every frame; stations hidden (`.pre`) until the ball arrives | Banned, MOT-03 |
| Team | Station tap halo (M-TEAM-05) | fill + stroke-width 260 | `coachhelm-team.css:276-281` | OK |
| Team | Station pulse (M-TEAM-06) | 2400 × 2, scale 1.7 | `:297-300` `2.4s` literal; ring is the uncapped `10+|v|×22` halo × 1.7 | Mismatch, MOT-21 |
| Team | Station chips (M-TEAM-07) | bg 260 | `:345` | OK |
| Team | Bar rows FLIP (M-TEAM-08) | 520 `--spring` | `team-motion.ts:93-111` duration `CH_DUR.reveal` (520) with a curve sampled for `c.ms` (462) | Mismatch, MOT-26 |
| Team | Bar fills (M-TEAM-09) | scaleX 520 spring | `:436-441` `transform` over `--ch-dur-reveal` + `--ch-ease-spring-smooth` (462 curve) | Mismatch, MOT-26 |
| Team | Spot content in (M-TEAM-10, 12) | 300 ease, 6pt | `team-motion.ts:114-128` 280, 6px; RM fade 180 | OK |
| Team | Course trend draw / dots (M-TEAM-13 to 15) | 900 draw, dots 55ms apart | `team-motion.ts:131-144`; deep link `?station=course` (`TeamBoard.tsx:161`) plays it on first paint; dot stagger | Banned, MOT-19 |
| Team, phone | Read / player / course sheets (M-TEAM-18 to 22) | 462 / 280 / RM 180 | `TeamBoard.tsx:380-382` `ui/Modal` | OK |
| Team, desktop | Inspector (M-TEAM-24, 25) | 462 in / 280 out | `coachhelm-team.css:1897-1902` OK, but `TeamBoard.tsx:384-386` passes `openPanel` (null on close), so the panel slides out empty | Mismatch, MOT-12 |
| Team | Story open / close (M-TEAM-29, 30) | 462 rise / 280 down | `:1885-1888` keyframe on mount; close is `setOpen(null)` (`Stories.tsx:286`), an unmount with no exit | Missing exit, MOT-34 |
| Team | Story body (M-TEAM-31) | 420 spring | `:1890-1895` | OK |
| Team | Story progress + hold (M-TEAM-32) | 5200 linear, hold pauses bar and timer | bar pauses (`:1847-1849`); timer `Stories.tsx:124-129` restarts a full 5200 on release | Mismatch (accuracy), MOT-11 |
| Team | Working on new row (M-TEAM-28) | 520 `--spring-o` on the write's answer only | `Cards.tsx:143` + `coachhelm-team.css:1902` on every mount of any proposed row | Banned, MOT-05 |
| Team | Assign spinner / assigned tick (M-TEAM-26, 27) | spinner 700, tick 360 | `.spin` (`:1231-1238`) and `.assigned` (`:1225-1229`) are unused; `parts.tsx:436` shows text only | Missing, MOT-36 |
| Team | Row press (M-TEAM-38) | scale .97 | `.tapp` `:76-82` rows scale (house rule: rows tint, not scale) | Mismatch, MOT-40 |
| Team | Loading sweep (M-TEAM-39) | 1400 | `:1423` `1.4s` literal; skeleton `main` has no `aria-label` | Mismatch, MOT-27 |
| Team, desktop | Board / Ask / Team sub-tab switch | crossfade (view switch) | `TeamBoard.tsx:360` no `{...sw.enter}`; no `.ch-htb[aria-busy]` dim | Missing, MOT-13 |
| Read | Press on buttons and chips (M-READ-01) | .97, 110 / 280 | `coachhelm-read.css:359-364` | OK |
| Read | Board → read push (M-READ-02, 03) | 462 | route push | OK |
| Read | Where bars (M-READ-04) | scaleX 360 | `read/cards.tsx:75-81` `useInViewOnce` sets `pre`, draws when 35% in view; `css:477` | Banned, MOT-06 |
| Read | Missed dots / path nodes (M-READ-05, 06) | 360 | `css:552-561`, `:602` same in-view gating | Banned, MOT-06 |
| Read | Assign spinner (M-READ-08) | 700 linear infinite | `css:388` `.7s` literal; stops under RM | RM, MOT-18 |
| Read | Assigned tick (M-READ-09) | 360 | `css:393` 280 | Mismatch, MOT-25 |
| Read | Host ring after assign (M-READ-10) | inset 2px ring, 900 | `cards.tsx:408` opacity .7→1, 280; `.flash` (`css:830-842`) unused | Mismatch, MOT-35 |
| Read | ⋯ More (phone sheet M-READ-11, 12) | 462 / 260 | `ReadPage.tsx:184` `ui/Modal` | OK |
| Read, desktop | ⋯ More popover (M-READ-13, 14) | scale .96 from the ⋯, 220 in / 120 out | same `ui/Modal`: a centred dialog, not from the ⋯ | Mismatch, MOT-32 |
| Read | Skeleton pulse (M-READ-20) | 1.6s | `css:873` `1.6s ease-in-out` literal | Mismatch, MOT-27 |
| Read | Scroll shade (M-READ-24) | under the bar | `css:122-126` sticky `top:110px` literal | Mismatch, MOT-42 |
| Stats | Detail push (M-STATS-01 to 05) | 462 | `use-stats-detail.ts` → PhoneScreen | OK |
| Stats | Window thumb (M-STATS-07) | 360 `--ch-ease-spring` | Segmented: settle 417 | Mismatch (minor), MOT-24 |
| Stats | Figure crossfade (M-STATS-09) | 260 | `shs-motion.tsx:63-110` `cloneNode(true)` ghost; RM inline 180 overridden by the floor | RM / perf, MOT-01, MOT-23 |
| Stats | Five-round line morph (M-STATS-10) | 360, ease-out cubic | `ui/charts/Line.tsx:276` `useGlide` 260 `CH_EASE`, React state per frame | Mismatch, MOT-07 |
| Stats | SG bars glide | B9 glide | `stats/SgBars.tsx:60-66` `left`/`right`/`width` per frame | Banned, MOT-07 |
| Stats | Team rank dots / whiskers | B9 glide | `stats/TeamRank.tsx:85-86` `left`/`width` per frame | Banned, MOT-07 |
| Stats, team phone | Legs bars | B9 glide | `stats/StatsTeamPhone.tsx:405` `left`/`width` per frame | Banned, MOT-07 |
| Stats | Player leg bars | B9 glide | `stats/LegBars.tsx:79-93` transform | OK (reference) |
| Stats | Grow once (M-STATS-12 to 15) | scaleX / scaleY / ring 360 on first view | `shs-motion.tsx:15-38` + `stats-redesign.css:1887-1911`, 280 | Banned, MOT-02 |
| Stats | Stuck switch shade (M-STATS-11) | 180 linear | `shs-motion.tsx:44-62` scroll listener → setState; sticky `top: var(--ch-phone-topbar-h)` (`stats-redesign.css:43`) | Mismatch, MOT-15 |
| Stats, team | Chosen leg plate | none | `stats.css:4733-4746` `translate: 4px + i×44px` (assumes 44px rows) | Mismatch (accuracy), MOT-43 |
| Stats | Skeleton sheen (M-STATS-24) | 1.9s | `stats-redesign.css:956` `1.9s` literal | Mismatch (token), MOT-27 |
| Lenses / file | List → file push (M-LNS-01, 02) | 462 | route push | OK |
| Lenses / file | Row press (M-LNS-03, 14) | tint 50ms after the finger | `coachhelm-file.css:126,149,278` `transition-delay: var(--ch-dur-press)` = **110** | Mismatch, MOT-30 |
| Lenses / file | Lens fold (M-LNS-04, 10) | height 462 (spec) | `file/PlayerFile.tsx:71` WAAPI `height` + `marginTop:-24px` | Banned, MOT-08 |
| Lenses / file | Lens thumb (M-LNS-05) | 417 settle | Segmented | OK (scale distortion, MOT-24) |
| Lenses / file | Shared cards swap (M-LNS-06) | old 180 / new 260 | `ui/Swap.tsx:91-99` frame `height` 180 on 4-5 Swaps at once | Banned, MOT-09 |
| Lenses / file | Read / plan sheets (M-LNS-07 to 09) | 462, rubber band | `IntentSheet.tsx:60` `ui/Modal` | OK |
| Lenses / file | Step tick, chips (M-LNS-16, 22) | 260 / 180 | `coachhelm-file.css:113` `0.26s`, `:172` `0.18s` + spring-smooth, `:245` `0.18s` | Mismatch, MOT-25 |
| Lenses / file | Skeleton (M-LNS-25) | 1900 | `coachhelm-file.css:253` `1.9s` literal; `FileSkeleton.tsx:22` no `aria-label` | Mismatch, MOT-27 |
| Practice plan | Plan card day strip (M-ASK-11) | scaleX 360 as the plan writes | `coachhelm-plan.css:61` 280 on every mount (history, reload) | Banned, MOT-28 |
| Practice plan | Folder list open (M-ASK-17) | 260, 6px rise | `plan/PlanCard.tsx:433` `{menu && …}` hard cut both ways | Missing, MOT-35 |
| Practice plan | Save chevron | rotate | `coachhelm-plan.css:414` 180 | OK |
| Practice plan | Block / swap / evidence / upload sheets (M-ASK-13, M-FMT-01) | 462 / 280 | `PlanCard.tsx:528-681`, `PlanFormat.tsx:233` `ui/FormSheet` | OK |
| Practice plan | Swap name crossfade, Changed chip (M-ASK-14, 15) | 120 out / 180 in | no transition in `coachhelm-plan.css` | Missing, MOT-35 |
| Practice plan | Press on blocks, rows, folder rows (M-ASK-27) | .97 | `coachhelm-plan.css`: 0 pressed rules, 0 hover rules | Missing, MOT-31 |
| Practice (player) | Practice segmented | thumb | `PlayerPractice.tsx:68` Segmented | OK |
| Quick chat | Key press (M-KEY-press) | opacity 200 / scale 260 | `quick-chat.css:25,350` `0.2s` (no easing) / `0.26s` literals | Mismatch, MOT-16 |
| Quick chat | Panel open (M-OPEN) | 742 pour from the key | `shell/quick-chat/useQcMotion.ts:32-35` origin from key, `chSpringCurve('pour')` | OK |
| Quick chat | Scrim (M-SCRIM) | open 240 linear / close 200 linear | `useQcMotion.ts:36` 260 CH_EASE; `:55` 220 sheet curve | Mismatch, MOT-25 |
| Quick chat | Close (M-CLOSE) | 220 | `useQcMotion.ts:51` `220` literal | Mismatch (token), MOT-25 |
| Quick chat | Content rise (M-CONTENT) | 30ms stagger (sanctioned) | `useQcMotion.ts:38-40` | OK |
| Quick chat | Working wheel (M-KEY-work) | 2400 a turn | `quick-chat.css:31,356` `2.4s` literal, infinite in the bar | Mismatch, MOT-16 |
| Quick chat | Step band (M-STEPS-band) | 1900 | `quick-chat.css:90` `1.9s` + permanent `will-change: transform` | Mismatch, MOT-45 |
| Quick chat | Tile press (M-TILE) | 110 / 280 | `quick-chat.css:295-296` `0.28s` / `0.11s` literals | Mismatch, MOT-25 |
| Quick chat | Reduce / Animations off | RM: `CH_FADE_MS`; off: instant | `.is-reduce` rules with `0.18s` (`:27,128,352`); no `[data-motion='off']`; `useChReducedMotion` treats off as fade | RM, MOT-16 |
| Quick chat | Live pill spinner (M-LIVE-state) | turns (H19) | `quick-chat.css:41,378` stops under `.is-reduce` | RM, MOT-18 |
| Messages | Thread push (M-MSG-01a, 02) | 462 | `MessagesPhone.tsx:197-248` PhoneScreen | OK |
| Messages, desktop | Details pane (M-MSG-20b) | 462 | `messages.css:4073-4077` grid track swap with no transition | Missing, MOT-35 |
| Messages | Hold-lift, menu, reaction bar (M-MSG-10, 11) | 471 / 496 / 462 | `hold-lift.tsx:59-71` | OK |
| Messages | Lift copy CSS | 471 | `messages.css:4764` `--ch-dur-reveal` (520) + `--ch-ease-spring-lift` (471 curve) | Mismatch, MOT-26 |
| Messages | Reaction popover | 160 / 471 | `MessagesView.tsx:1450-1453` `chTween('quick', reduced)`, RM 0 | RM, MOT-22 |
| Messages | Seen-by faces (M-MSG-17a) | 496 pop | `seen-by.tsx:112` pop spring (bounce .35, about 6.8% overshoot) on a data arrival | Mismatch, MOT-39 |
| Messages | Poll custom rows | M12 | `messages.css:4016-4021` `grid-template-rows` 260 | Banned, MOT-17 |
| Messages | Edit flash (M-MSG-07c) | 260 | `MessagesView.tsx:1981` `260` + bezier literal | Mismatch, MOT-25 |
| Messages | Typing dots (M-MSG-30) | 1200 | `messages.css:4155` token | OK |
| Messages | Skeleton (M-MSG-31) | 1400 pulse | `messages.css:4179` `--ch-dur-sweep` (900) | Mismatch, MOT-27 |
| Messages | Details / hover bar under RM | 180 fade | `messages.css:5402`, `:5704`, `:5811` no `!important`, so the floor makes them 1ms | RM, MOT-01 |

---

## Findings (worst first)

### MOT-01 The Reduce Motion floor turns every lane's CSS 180ms fade into a hard cut
- Severity: P1
- Lane: all nine (systemic); measured in Messages, Ask, Stats, Quick chat
- Where: every screen under iOS Reduce Motion, phone and desktop, light and dark
- File: `src/clubhouse/styles/base.css:303-311` (`.ch-root * { transition-duration: 1ms !important; animation-duration: 1ms !important; animation-iteration-count: 1 !important }`). Lane fades it overrides:
  - `messages.css:5402`, `:5704`, `:5811` (`var(--ch-fade-ms, var(--ch-dur-quick))` without `!important`)
  - `coachhelm-ask-v2.css:476-477`, `:498`
  - `quick-chat.css:27,128,352` (`0.18s linear`)
  - `screens/stats/shs-motion.tsx:86` (inline `animationDuration = 180ms`)
- What's wrong: An `!important` stylesheet duration beats any normal or inline declaration, so each lane's own Reduce-Motion crossfade plays in 1ms. Only WAAPI (dialog-lifetime, team-motion, useQcMotion) and the two `!important` Team rules (`coachhelm-team.css:1909`, `:1916`) actually fade. Separately:
  - `--ch-fade-ms` is defined nowhere.
  - `--ch-dur-crossfade-rm` (180) is defined only inside the Animations-off block (`tokens.css:1306`) and never used.
  - Ask uses `--ch-dur-rm-fade` (120) instead of 180.
- Should be: RUBRIC H19; owner decision 2 / OQ-15 (Reduce Motion becomes a 180ms opacity fade); `lib/motion.ts` `CH_FADE_MS`.
- Fix:
  1. Define `--ch-dur-crossfade-rm: 180ms` on `[data-ui='clubhouse']` root (not only under `data-motion='off'`).
  2. Narrow the floor so it exempts opacity-only fades: `transition-property: opacity` or a `[data-ch-rm-fade]` opt-out.
  3. Replace `--ch-fade-ms` and `--ch-dur-rm-fade` in lanes with `--ch-dur-crossfade-rm`.
  4. Move Stats' ghost fade to WAAPI like `dialog-lifetime.ts:139`.
- Confidence: high

### MOT-02 Stats cards grow their bars, rings and marks the first time they scroll into view
- Severity: P1
- Lane: Stats
- Where: S-STATS / S-TEAMSTATS summary and detail cards, phone (SHS), light and dark
- File: `src/clubhouse/screens/stats/shs-motion.tsx:15-38` (`useGrowOnce`: `.is-waiting` until 25% in view); `src/clubhouse/styles/stats-redesign.css:1887-1911` (`[data-ch-grow]` `scaleX(0)`, `[data-ch-grow-y]` `scaleY(0)`, ring `stroke-dashoffset: var(--ch-ring-c) !important`, opacity 0 → 280ms `--ch-ease`)
- What's wrong: Every card above the fold draws in on first paint, and every card below draws in as it scrolls up, over 280ms. That is the draw-in the owner banned. It also prints zero-length bars in the first frame of each card.
- Should be: owner decision (no first-paint motion; motion answers the user only); H2 / Q-153. 07 M-STATS-12 to 15 are superseded.
- Fix: Delete `useGrowOnce` and the `.is-waiting` rules; marks render at rest. Keep the window-change glide (`useGlide`) as the only chart motion.
- Confidence: high

### MOT-03 Team hole fly-in runs on first paint and hides the stations for up to about 2.2s
- Severity: P1
- Lane: Team view
- Where: S-TEAM.hole, first visit in a session, phone and desktop
- File: `src/clubhouse/screens/coachhelm/team/team-motion.ts:13-90` (`useFlyIn`); `src/clubhouse/styles/coachhelm-team.css:267-275` (`.stn.pre { transform: scale(.3); opacity: 0 }`)
- What's wrong:
  1. The ball flies 1900ms after `fonts.ready` + 250ms, while each station stays invisible until the ball passes it. Putting is hidden about 1710ms + 250ms + font wait.
  2. It is driven by rAF, writing SVG `cx`/`cy` attributes and `strokeDashoffset` every frame on the main thread. That is not compositor motion: it competes with hydration and Lenis.
  3. The Animations-off guard reads `useChReducedMotion()` inside the first layout effect, which still holds the server snapshot (`showAnimations` default on). The code covers that gap for the OS query (`window.matchMedia`) but not for `data-motion='off'`, so a hard load with Animations off can still fly.
  4. Stations pop on `--ch-ease-spring` (`cubic-bezier(.34,1.3,.64,1)`, about 10% overshoot) on data-sized circles.
- Should be: owner decision (no first-paint motion); H2. 07 M-TEAM-01 to 04 are superseded.
- Fix: Remove `useFlyIn`, the `.pre` state and the `.ball`. Draw the flight path and stations at rest. If the owner wants the flight kept, run it only on an explicit "Play" tap, as the design page has, through WAAPI `offset-path`.
- Confidence: high

### MOT-04 Both Homes grow the team-legs bars on every mount
- Severity: P1
- Lane: Classes/Roster/Home
- Where: Coach Home and Player Home (CRH on), phone and desktop
- File: `src/clubhouse/styles/home.css:4806` and `:5341` (`animation: ch-hm-leg-grow var(--ch-dur-release) var(--ch-ease) both`, keyframe `:4841-4845` `scaleX(0)`)
- What's wrong: A 280ms grow from zero plays on first paint and on every return to Home (tab switch, Back), because a CSS animation restarts whenever the element mounts. It also plays on a quiet refresh that remounts the block.
- Should be: owner decision (no first-paint motion); H2 (chart draw-ins).
- Fix: Delete the `animation` declarations and `@keyframes ch-hm-leg-grow`; the bars render at rest. The reduce-motion blocks at `:4846-4858` then go too.
- Confidence: high

### MOT-05 Team "Working on" proposed rows pop in with an overshoot on every mount
- Severity: P1
- Lane: Team view
- Where: S-TEAM.working, phone and desktop
- File: `src/clubhouse/screens/coachhelm/team/Cards.tsx:143` (`className="wk is-new"` for every `proposed` row, including server rows with `read.assigned === 'proposed'`); `src/clubhouse/styles/coachhelm-team.css:1896-1903` (`ch-htb-wk` scale .94 → 1 over 520ms on `--ch-ease-spring`, overshoot to about 1.03)
- What's wrong: The pop is meant for the moment a write answers (M-TEAM-28). Instead it plays on first paint and on every remount for any row already proposed in the data, and it springs past its mark on a data row.
- Should be: owner decision; 07 M-TEAM-28 (on the write's answer only); "Must never animate … anything on a data refresh".
- Fix: Add `is-new` only for ids in a "just proposed this session" set (`fa.assigned[read.id]` set by the tap), and drop it after the animation ends. Use `--ch-ease-spring-smooth` (no overshoot) or a fade.
- Confidence: high

### MOT-06 Read "Where it shows up" bars, missed dots and path nodes draw in when scrolled into view
- Severity: P1
- Lane: Root cause (Read)
- Where: S-READ.where, S-READ.why, phone and desktop
- File: `src/clubhouse/screens/coachhelm/read/cards.tsx:75-81` (`useInViewOnce` → `'fun' + (seen ? '' : ' pre')`); `src/clubhouse/lib/use-in-view.ts:9-32`; `src/clubhouse/styles/coachhelm-read.css:471-489` (`.fun.pre .fbar { scaleX(0) }` → 360ms `--ch-dur-marks`), `:547-561` (`.dots.pre i.f` scale .4, opacity 0)
- What's wrong: The server render ships every bar at `scaleX(0)` and the dots at opacity 0. They draw when 35% of the card enters the viewport, which is first paint for an above-the-fold card. With JS slow or failing, the funnel stays empty.
- Should be: owner decision (no first-paint or scroll-reveal motion); H2.
- Fix: Drop `useInViewOnce` and the `.pre` classes; render at rest. Remove the `useInViewOnce` hook if this is its last user (it is: see the grep in this audit).
- Confidence: high

### MOT-07 Stats glides SG bars, rank dots and team legs by `left`/`width`, re-rendering React every frame
- Severity: P1
- Lane: Stats
- Where: S-STATS SG legs, S-TEAMSTATS rank and legs, on a window change, phone and desktop
- File:
  - `src/clubhouse/screens/stats/SgBars.tsx:60-66` (`[left|right]: '50%', width: …%` from `drawn`)
  - `src/clubhouse/screens/stats/TeamRank.tsx:85-86` (`left`, `width`)
  - `src/clubhouse/screens/stats/StatsTeamPhone.tsx:405` (`left`/`right`, `width`)
  - driver `src/clubhouse/lib/motion-glide.ts:47-58` (rAF → `setShown` each frame for 260ms)
  - `src/clubhouse/ui/charts/Line.tsx:276`
- What's wrong: Each window tap re-renders every chart component about 16 times and lays out each bar per frame (H2: animating `width`/`left`). Several charts glide at once on Stats, on the main thread, during the same frames as the WindowCrossfade clone (MOT-23). The line morph runs 260ms `CH_EASE`, where M-STATS-10 asks for 360ms ease-out cubic.
- Should be: H2 (transform and opacity only); system rule 2; 07 M-STATS-10.
- Fix: Do what `LegBars.tsx:79-93` already does: keep `left`/`width` at the target and glide with `spanTransform`/`shiftTransform`. Better, compute the transform once and run one WAAPI animation per mark instead of `useGlide` state. Set the line morph to 360ms.
- Confidence: high

### MOT-08 Player file lens fold animates `height` and `margin-top` for 462ms
- Severity: P1
- Lane: Coach vs player (lenses / player file)
- Where: S-FILE.lens flip, phone and desktop
- File: `src/clubhouse/screens/coachhelm/file/PlayerFile.tsx:46-90` (`Fold`: `el.animate([{height:'0px', marginTop:'-24px'}, {height:`${h}px`, marginTop:'0px'}], spring 462)`)
- What's wrong:
  - It relayouts the whole file below the fold every frame for 462ms. It runs at the same moment as four or five `Swap` height transitions (MOT-09) on the shared cards.
  - `-24px` is a literal that assumes the card gap and goes wrong when the gap token changes.
  - The spec row M-LNS-04 itself asks for height, which conflicts with H2.
- Should be: H2; system rule 2.
- Fix:
  1. Fold with a FLIP: fade the leaving card (180) and translate the cards below by `-h` → 0 on the smooth spring, using `useRowFlip`'s pattern from `team-motion.ts:93-111`.
  2. Or take the lens-only cards out of flow (`position:absolute`) while fading.
  3. Raise the spec conflict to the owner.
- Confidence: high

### MOT-09 `ui/Swap` eases the frame's `height` on every swap; the lenses fire five at once
- Severity: P1
- Lane: Coach vs player (and every lane that uses Swap)
- Where: S-FILE.lens and any `Swap` with the default `resize="ease"`, phone and desktop
- File: `src/clubhouse/ui/Swap.tsx:76-116` (`el.style.transition = 'height var(--ch-dur-quick) var(--ch-ease)'`); users `screens/coachhelm/file/PlayerFile.tsx:250-261`
- What's wrong: A height transition on a block frame reflows everything after it for 180ms (H2). The file explains `resize="instant"` exists because of exactly this (F-0007) but keeps `ease` as the default. The lens flip stacks five such frames plus MOT-08.
- Should be: H2; system rule 2.
- Fix: Make `resize="instant"` the default. Where a height change must read, translate the following siblings by the delta (FLIP) instead of animating `height`.
- Confidence: high

### MOT-10 Desktop sidebar fold animates `width`, `margin`, `padding` and `grid-template-columns`
- Severity: P1
- Lane: all lanes (shell, desktop)
- Where: rail fold / unfold, desktop 1440, light and dark
- File: `src/clubhouse/styles/shell.css:4047` (`.ch-sidebar { transition: width 462 spring-smooth }`), `:4111-4113` (`.ch-brand` margin + padding), `:4115` (`gap`), `:4121-4140` (`.ch-brand__fold` `grid-template-columns` 1fr → 0fr)
- What's wrong: Every frame of the 462ms spring relayouts the sidebar and the page column beside it. `lib/rail-fold.ts` already has to pause the page's size readers (`data-ch-rail-moving`) and drop backdrop blur because of it. This is the exact H2 grep hit (`transition:.*width`).
- Should be: H2; system rule 2.
- Fix: Keep the rail at its full width and clip it with `clip-path: inset(0 calc(100% - var(--ch-rail-w)) 0 0)`, or `translateX` the label column. Slide the page column with `translate` and settle the real `--ch-sidebar-w` once at the end (one layout). Fade the brand word instead of a 0fr track.
- Confidence: high

### MOT-11 Team story timer restarts a full 5200ms after a press-and-hold while the bar resumes mid-way
- Severity: P1
- Lane: Team view
- Where: S-TEAM.story, phone
- File: `src/clubhouse/screens/coachhelm/team/Stories.tsx:124-129` (`setTimeout(next, STORY_MS)` re-armed on every `held` change); `src/clubhouse/styles/coachhelm-team.css:1844-1849` (`animation-play-state: paused`)
- What's wrong: Hold for 2s at 3s into a story, then release. The CSS bar resumes from about 58% and fills at about 5.2s of elapsed bar time. The JS timer starts again from 0 and advances only 5.2s after release, so the bar sits full for about 3s before the story moves on. The longer the hold, the larger the drift. This is not "accurate".
- Should be: 07 M-TEAM-32 ("release resumes from the same point"); owner: motion "accurate".
- Fix: Drive the advance from the bar's own `animationend` (or WAAPI `finished`) instead of a separate timer; pause by `animation.pause()`. Under Reduce Motion keep the no-auto-advance path.
- Confidence: high

### MOT-12 Desktop Team inspector slides out empty
- Severity: P1
- Lane: Team view
- Where: S-TEAM.inspector close (× / Esc), desktop
- File: `src/clubhouse/screens/coachhelm/team/TeamBoard.tsx:384-386` (`<Inspector open={!!openPanel}>{openPanel}</Inspector>`); `src/clubhouse/screens/coachhelm/team/Inspector.tsx:28`; `src/clubhouse/styles/coachhelm-team.css:1893-1896` (out 280ms)
- What's wrong: `openPanel` becomes `null` on close, so the content is gone in the first frame and a blank 420px panel slides away for 280ms. The phone sheet doesn't do this because `ui/Modal` retains content through `dialog-lifetime.ts` `retainContent`.
- Should be: 07 M-TEAM-25; system rule 3 (keeps its content while it leaves).
- Fix: Keep the last non-null panel in a ref (as `useDialogLifetime(...).retainContent` does) and render it until `transitionend`.
- Confidence: high

### MOT-13 Team sub-tab switches hard-cut on desktop, while Board, Ask and Standing crossfade
- Severity: P1
- Lane: Team view (vs Root cause / Ask / Coach views)
- Where: CoachHelm sub-tabs Board ↔ Team ↔ Ask, desktop
- File: `src/clubhouse/screens/coachhelm/team/TeamBoard.tsx:360` (`<main className="ch-htb …" aria-busy={sw.pending}>`, no `{...sw.enter}`); enter and dim rules exist only for `.ch-hl` (`styles/coachhelm.css:1062`, `:1078-1080`) and `.ch-ask` (`styles/coachhelm-ask.css:1100-1102`, `:1393`)
- What's wrong: Leaving Team, the board isn't dimmed during the wait. The next view then starts its rise at `--ch-enter-from` (about .55), which shows a dip. Arriving at Team, the new board appears in one frame. The other sub-views get the dim plus 180ms rise. Two transition styles on one tab bar.
- Should be: system rule 6; owner 2026-10-29 ("the transition in the CoachHelm tabs and subtabs is not good").
- Fix: Spread `{...sw.enter}` on the Team `<main>` and add `.ch-htb[aria-busy='true']:not([aria-label^='Loading'])` dim and `.ch-htb[data-ch-enter]:not(.is-phone) > *` enter rules, matching `coachhelm.css:1062-1080`.
- Confidence: high

### MOT-14 Ask's phone artifact / full-plan push is a hand-rolled CSS slide, not the shell push
- Severity: P1
- Lane: Ask, Practice plan creation
- Where: S-ASK.full-plan, S-FMT.see, phone
- File: `src/clubhouse/screens/coachhelm/chat/parts/Artifact.tsx:77` (`.ch-ak-push`); `src/clubhouse/styles/coachhelm-ask-v2.css:470-474` (`ch-ak-slide-in` / `-out`, smooth spring both ways)
- What's wrong:
  - The page beneath doesn't draw back by 24% or dim.
  - There is no edge-swipe Back.
  - The exit uses the in-spring instead of a 280 ease.
  - A Back mid-entry jumps: a keyframe with no `from` restarts from the underlying value, not where the slide had got to.
  - Under Reduce Motion it fades 120ms, not 180.
  - Every other lane's push (Stats, Messages, Roster, Read, File) uses PhoneScreen or the route push.
- Should be: 07 M-ASK-16 / M-ASK-30 ("as a push"); system rule 6; owner (page-behind slide 24%).
- Fix: Render the phone artifact in `shell/PhoneScreen.tsx` (underlay, dim, edge swipe and interruptible spring come with it). Delete `ch-ak-slide-*`.
- Confidence: high

### MOT-15 Stats sticky window switch ignores the safe area, and its stuck shade is per-scroll React state
- Severity: P1
- Lane: Stats
- Where: S-STATS.stuck, phone (standalone or native shell with a notch)
- File: `src/clubhouse/styles/stats-redesign.css:41-47` (`position: sticky; top: var(--ch-phone-topbar-h, 0px)` = 50px); `src/clubhouse/screens/stats/shs-motion.tsx:44-62` (`useStuck`: window scroll → rAF → `setStuck(scrollY > 1)`)
- What's wrong:
  - Every other phone sticky sits at `calc(var(--ch-phone-topbar-h) + env(safe-area-inset-top))`: `classes.css:2153`, `roster.css:3034`, `shell.css:2534`, `calendar.css:3933`. With a 47-59px inset, the stuck switch slides 47-59px under the green bar.
  - "Stuck" means `scrollY > 1`, not that the switch has reached the bar, so the shade appears the moment the page moves.
- Should be: 07 M-STATS-11 (shade once the switch reaches the bar); system rule 10.
- Fix: `top: calc(var(--ch-phone-topbar-h) + env(safe-area-inset-top))`. Drive `.is-stuck` from an IntersectionObserver on a 1px sentinel above the switch, with `rootMargin` equal to the bar height.
- Confidence: medium (the overlap depends on the shell reporting a non-zero inset)

### MOT-16 Animations off doesn't stop the hard-coded loops in Quick chat, Ask, Read and the file
- Severity: P1
- Lane: Quick chat, Ask, Root cause (Read), Coach vs player
- Where: Settings > Animations off, phone and desktop
- File:
  - Quick chat (no `[data-motion='off']` rule anywhere in the file): `quick-chat.css:31,356` (`2.4s infinite`), `:40,377` (`0.9s infinite`), `:79` (`1.2s infinite`), `:90` (`1.9s infinite`), `:111` (`1.6s infinite`), `:113` (`1s steps(1) infinite`)
  - Ask: `coachhelm-ask-v2.css:32` (`0.6s infinite alternate`), `:70` (`1.2s infinite`), `:103` (`0.9s infinite`), `:130` (`1.1s infinite`)
  - Read: `coachhelm-read.css:873` (`1.6s infinite`) is covered by `:1107`
  - File: `coachhelm-file.css:253` (`1.9s infinite`)
- What's wrong:
  - Animations off works by zeroing the `--ch-dur-*` tokens (`tokens.css:1292-1324`). Literal durations ignore that, so these loops keep moving with Animations off. That is a rubric H19 fail ("anything still moves").
  - Quick chat's `.is-reduce` comes from `useChReducedMotion()`, which also covers Animations off, so Animations off still fades 180ms (`quick-chat.css:27,128,352`) instead of swapping at once.
- Should be: H19; system rule 5 (`'off'` is instant).
- Fix:
  1. Replace the literals with tokens: `--ch-dur-shimmer`, `--ch-dur-typing`, `--ch-dur-sweep`, or new `--ch-dur-spin`.
  2. Have Quick chat read `useChMotionMode()` and set `is-reduce` only for `'fade'` and `is-off` for `'off'`.
  3. Add `[data-motion='off'] .ch-qcs *, .ch-qck * { animation: none; transition: none }`.
- Confidence: high

### MOT-17 `width` and `grid-template-rows` transitions in Ask's brief dots and Messages' poll composer
- Severity: P1
- Lane: Ask, Messages
- Where: S-ASK brief (dots), S-MSG.poll-composer (custom rows), phone and desktop
- File: `src/clubhouse/styles/coachhelm-ask-v2.css:489` (`.qdots i { transition: width 417 settle }`); `src/clubhouse/styles/messages.css:4016-4021` (`.ch-ms-pollf__custom { transition: grid-template-rows 260 }`)
- What's wrong: Both are exact H2 grep hits. The poll one opens 0fr → 1fr and reflows the composer sheet each frame. The dot one relayouts the dot row on a spring that overshoots, so the width bounces past its mark.
- Should be: H2.
- Fix: Dots: fixed-size dots, with the active pill drawn by `transform: scaleX()` from a centred origin. Poll: show the rows at full height and fade plus `translateY(-6px)` them in, moving the content below with a FLIP. Or open instantly, as M-TEAM-17 does for Show more.
- Confidence: high

### MOT-18 Lane spinners stop turning under Reduce Motion
- Severity: P1
- Lane: Root cause (Read), Team view, Quick chat
- Where: Assign / Proposing / live pill under iOS Reduce Motion
- File:
  - `src/clubhouse/styles/coachhelm-read.css:388` (`ch-spinner-turn .7s infinite`) with `:1101-1105` (1ms) and the base floor `iteration-count: 1`
  - `src/clubhouse/styles/coachhelm-team.css:1237` (`spin .7s infinite`) with `:1683-1689`
  - `src/clubhouse/styles/quick-chat.css:41,378` (`.is-reduce .live__spin { animation: none }`)
- What's wrong: The floor exempts only `.ch-spinner` (`base.css:312-318`). These lane spinners get one 1ms turn and then sit still, which reads as stuck. The specs say "spinner still", but OQ-18 / H19 is the newer owner rule.
- Should be: H19 ("the spinner stops" is a fail); OQ-18.
- Fix: Use `ui/Spinner.tsx` (`.ch-spinner`) in all three places, or add the class so the floor's exemption applies.
- Confidence: high

### MOT-19 Team Course trend draws and staggers its dots, including on first paint from a deep link
- Severity: P1
- Lane: Team view
- Where: S-TEAM.course, phone and desktop; `?station=course`
- File: `src/clubhouse/screens/coachhelm/team/team-motion.ts:131-144` (`useTrendDraw`: line 900ms `cubic-bezier(.3,.7,.2,1)` literal; dots `delay: 120 + i * 55`; labels `delay: 760`); `src/clubhouse/screens/coachhelm/team/TeamBoard.tsx:161` (`initialStation`)
- What's wrong: The effect runs on mount of `CourseCard`. A board opened with `station=course` therefore draws the line and staggers 11 dots on first paint, for about 1090ms. Even on a tap it is a stagger (banned in D-64), with a literal easing and literal delays.
- Should be: owner decision; D-64 "no staggers" (`tokens.css:840`); H2.
- Fix: Draw the trend at rest. If any motion is kept on the Course tap, use one 260 fade of the card (M-TEAM-12) and no per-dot delay.
- Confidence: high

### MOT-20 Ask's Undo ring empties at once under Reduce Motion while Undo is still live
- Severity: P1
- Lane: Ask (and Quick chat receipt)
- Where: S-ASK.saved / published receipt, Reduce Motion
- File: `src/clubhouse/styles/coachhelm-ask-v2.css:118` (`ch-ak-drain 8s linear forwards`); base floor `base.css:308-309`
- What's wrong: The spec says the ring is "a timer, not motion" and stays the same under Reduce Motion (coachhelm 07 M-UNDO-ring). The floor shortens the drain to 1ms, so the ring shows empty and implies the window has closed, while the server still accepts Undo for 8s.
- Should be: coachhelm 07 M-UNDO-ring; ask 07 M-ASK-23.
- Fix: Mark the ring `.ch-spinner`-style exempt: `animation-duration: 8s !important` under reduce. Or draw it from the same JS clock as the server window.
- Confidence: high

### MOT-21 Team station pulse ring scales the uncapped halo by 1.7, over the header and labels
- Severity: P1
- Lane: Team view
- Where: S-TEAM.hole station select, phone
- File: `src/clubhouse/styles/coachhelm-team.css:285-300` (`.pulse` `scale(1)→scale(1.7)` over `2.4s` × 2, `transform-box: fill-box`); radius from `TeamHole.tsx` (`10 + |v|×22`, see AUDITOR_BRIEF §1)
- What's wrong: At v = −3.9 the halo radius is about 96, so the pulse ring reaches about 163 units: wider than the hole. It sweeps over the header figure and the labels twice per tap, and since the SVG is `overflow: visible` it can leave the card. The 2.4s duration is a literal.
- Should be: brief §1 (clamp data-driven sizes); 07 M-TEAM-06; tokens.
- Fix: Clamp the halo radius (the team-lane fix) and clamp the pulse to `min(1.7, (R+12)/R)`. Use `--ch-dur-live`-class tokens.
- Confidence: high

### MOT-22 Framer and WAAPI fades pass `reduced` as "duration 0" instead of the 180ms fade, and Animations off still fades
- Severity: P2
- Lane: Messages, Classes/Roster/Home, all lanes (ui/Menu, Toast, Peek)
- Where: Reduce Motion and Animations off, phone and desktop
- File:
  - `chTween(…, reduced)` (`lib/motion.ts:41-43` returns `duration: 0` when reduced): `ui/Menu.tsx:184`, `screens/messages/MessagesView.tsx:1453`, `:1524`, `screens/messages/seen-by.tsx:77,282`, `screens/messages/polls.tsx:177-178`, `screens/roster/RosterPeek.tsx:89`, `screens/home/LatestRound.tsx:77` (`chSwap`), `ui/Toast.tsx:390`, `shell/OfflineBanner.tsx:65`, `shell/TeamSwitch.tsx:135`
  - The reverse case, an Animations-off fade: `screens/coachhelm/team/team-motion.ts:122`, `screens/coachhelm/file/PlayerFile.tsx:175`, `shell/quick-chat/useQcMotion.ts:26-29`, `screens/messages/hold-lift.tsx:65`
- What's wrong: Under Reduce Motion, menus, popovers, toasts and the round pager appear in one frame instead of fading over 180ms. Under Animations off, the second group still fades 180ms because it reads the boolean `useChReducedMotion()` (OS reduce **or** Animations off).
- Should be: system rule 5; `chFade(mode)` (`lib/motion.ts:50-52`).
- Fix: Replace `chTween(x, reduced)` with `reduced ? chFade(mode) : chTween(x)` using `useChMotionMode()`, as `shell/AccountSheet.tsx:83,163` and `shell/Bell.tsx:168` already do.
- Confidence: high

### MOT-23 Stats window crossfade clones the whole sheet DOM on every window tap
- Severity: P2
- Lane: Stats
- Where: S-STATS / S-TEAMSTATS window change, phone
- File: `src/clubhouse/screens/stats/shs-motion.tsx:63-110` (`getSnapshotBeforeUpdate` → `this.el.cloneNode(true)` of `.ch-shs-sheet`, appended `position:absolute; inset:0`, 260ms literal `XFADE_MS`)
- What's wrong:
  - A deep clone of every card (SVG charts included) is built and painted over the live page during the same frames as the `useGlide` re-renders (MOT-07). That doubles the layers being composited on a phone.
  - The ghost covers the new content at its own height, so a shorter new window shows ghost content past its end for 260ms.
  - Under Reduce Motion the inline 180ms is overridden to 1ms (MOT-01).
- Should be: 07 M-STATS-09; H2 (smooth).
- Fix: Crossfade only the figure blocks, keyed by window (a `Swap` with `resize="instant"` on each figure), not a clone of the sheet. Use `CH_DUR.base` and not a literal.
- Confidence: medium

### MOT-24 The segmented thumb slides by a non-uniform scale and jumps under Reduce Motion
- Severity: P2
- Lane: all lanes with Segmented (Stats window, lenses, Roster, Messages, Practice)
- Where: any segment change with unequal widths ("Coach view" vs "As Eli sees it"), phone and desktop
- File: `src/clubhouse/lib/slide-plate.ts:62-68` (`translate(dx,dy) scale(w0/w1, h0/h1)` on `.ch-seg__pill`); reduced path `:51` (`return` with no animation)
- What's wrong:
  - Scaling the pill by width ratio stretches its corner radius and its `--ch-seg-on-shadow` during the move. A 1.6× ratio draws visibly oval ends mid-slide; the iOS thumb keeps its radius.
  - Under Reduce Motion the thumb jumps, with no 180ms crossfade.
  - Stats asks for 360ms `--ch-ease-spring` (M-STATS-07); the control gives 417 settle.
- Should be: 07 M-LNS-05, M-STATS-07, M-MSG-03a; system rule 5.
- Fix: Animate `translate` plus an inner `clip-path: inset(… round var(--ch-radius))` (or `width` on a `will-change: transform` pseudo replaced by two end caps), so the radius is constant. Under reduced, crossfade the old and new pill over `CH_FADE_MS`.
- Confidence: high

### MOT-25 Literal durations and easings across Ask, the file, Quick chat, Read and Messages
- Severity: P2
- Lane: Ask, Coach vs player, Quick chat, Root cause (Read), Messages
- Where: listed below, all phone and desktop
- File:
  - `coachhelm-ask-v2.css:17,23,27,31,113` (`0.26s`, `0.24s`, `0.62s`)
  - `coachhelm-file.css:113` (`0.26s`), `:172` (`0.18s`), `:245` (`0.18s`, `var(--ch-hf-ease)`)
  - `quick-chat.css:25,350` (`opacity 0.2s` with **no easing**, `0.26s`), `:126` (`0.2s ease`), `:295-296` (`0.28s` / `0.11s`)
  - `shell/quick-chat/useQcMotion.ts:12` (`90`), `:36` (scrim 260 where M-SCRIM is 240 linear), `:51` (`220`), `:55` (scrim close 220 sheet where M-SCRIM is 200 linear)
  - `screens/messages/MessagesView.tsx:1981` (`260`, `"cubic-bezier(.22,1,.36,1)"`)
  - `screens/coachhelm/team/team-motion.ts:8` (`EASE` string)
  - `coachhelm-read.css:393` (assigned tick 280, where M-READ-09 is 360)
- What's wrong: Literals don't follow Animations off (MOT-16) or the D-64 scale. Several also differ from their own spec rows (Quick chat scrim, Read tick).
- Should be: H2 ("a duration off the tokens"); system rule 1.
- Fix: Use `var(--ch-dur-*)` and `var(--ch-ease*)` in CSS, and `CH_DUR` / `CH_EASE` / `CH_FADE_MS` in TS. Add `--ch-dur-scrim-in: 240ms` and `--ch-dur-scrim-out: 200ms` if Quick chat's M-SCRIM values stand.
- Confidence: high

### MOT-26 Spring curves are played at durations they weren't sampled for
- Severity: P2
- Lane: Ask, Team view, Coach vs player, Messages
- Where: listed below
- File:
  - `coachhelm-ask-v2.css:27` (`0.26s` + `--ch-ease-spring-smooth`, sampled for 462)
  - `coachhelm-file.css:172` (`0.18s` + spring-smooth)
  - `coachhelm-team.css:440` (`--ch-dur-reveal` 520 + spring-smooth 462), `:1168`, `:1389`
  - `team-motion.ts:107` (520 with `chSpringCurve('smooth').linear`, whose natural length is `c.ms`)
  - `messages.css:4764` (`--ch-dur-reveal` 520 + `--ch-ease-spring-lift`, sampled for 471)
- What's wrong: A `linear()` spring is a sampled position-over-time curve. Squeezing 462ms of physics into 180 or 260ms makes it snap. Stretching it to 520 makes it drag, and the motion no longer matches the springs in the rest of the app.
- Should be: `tokens.css:860-868` (the smooth spring for a one-shot entry pairs `--ch-ease-spring-smooth` with `--ch-dur-spring-smooth`); system rule 1.
- Fix: Pair each curve with its own `--ch-dur-spring-*`, or use `c.ms` from `chSpringCurve`. Where a 260 tween is wanted, use `--ch-ease`.
- Confidence: high

### MOT-27 Every lane writes its own skeleton shimmer; two lane skeletons skip the route hold and fade
- Severity: P2
- Lane: Team view, Coach vs player, Ask, Quick chat, Root cause (Read), Stats, Messages
- Where: loading states, phone and desktop
- File:
  - Cadences: Team `coachhelm-team.css:1423` (1.4s); Read `coachhelm-read.css:873` (1.6s pulse); Ask `coachhelm-ask-v2.css:70` (1.2s); Quick chat `quick-chat.css:111` (1.6s); File `coachhelm-file.css:253` (1.9s literal); Stats `stats-redesign.css:956` (1.9s literal); Messages `messages.css:4179` (900ms pulse, where M-MSG-31 is 1400). The shared one is `shell.css:853-866` (`--ch-dur-shimmer` 1.9s).
  - Missing `aria-label^='Loading'`, so `base.css:285-294` doesn't apply: `screens/coachhelm/team/TeamBoardSkeleton.tsx:33,46` and `screens/coachhelm/file/FileSkeleton.tsx:22`.
- What's wrong: Seven different sheen speeds across one app. The Team and File skeletons show on the first frame of a navigation, with no 300ms hold and no fade, so a fast load flashes them. The Team skeleton's hole is `height: 300` (`TeamBoardSkeleton.tsx:39`) while the real hole is a width-scaled SVG (`TeamHole.tsx:35` viewBox), so the page shifts when it lands at any width other than the one measured.
- Should be: system rule 9; 07 M-TEAM-39, M-LNS-25, M-MSG-31.
- Fix: Use `.ch-skel` / `.ch-skel--feature` everywhere and add `aria-label="Loading …"` to both `<main>`s. Give the hole skeleton `aspect-ratio: H.w / H.h`.
- Confidence: high

### MOT-28 Plan cards and Ask brief cards replay their entry on every mount
- Severity: P2
- Lane: Practice plan creation, Ask
- Where: Ask thread with a plan card or brief, reopened or reloaded, phone and desktop
- File: `src/clubhouse/styles/coachhelm-plan.css:61-62` (`.ch-cp-strip i { animation: ch-cp-seg 280 both }` from `scaleX(0)`); `src/clubhouse/styles/coachhelm-ask-v2.css:485` (`.qcard { animation: ch-ak-rise 417 settle }`)
- What's wrong: The strip grows and the brief card rises whenever the thread mounts, including history and reload. That is first-paint motion on content the coach is only reading. M-ASK-11 means the strip to grow as the plan is written, once.
- Should be: owner decision; 07 M-ASK-11 / M-ASK-33.
- Fix: Gate both on the `fresh` prop that `PlanCard` already receives (`PlanCard.tsx:108,139`) and on a "new this session" flag for the brief.
- Confidence: high

### MOT-29 Ask summary pills stagger by index
- Severity: P2
- Lane: Ask
- Where: S-ASK brief summary, phone and desktop
- File: `src/clubhouse/styles/coachhelm-ask-v2.css:496` (`animation-delay: calc(var(--ch-i) * var(--ch-dur-press) / 2.75)`, about 40ms steps)
- What's wrong: An entrance stagger. Quick chat's 30ms content stagger is the only one sanctioned (`lib/motion.ts:10-12`).
- Should be: D-64 (`tokens.css:840`, "No count-ups and no staggers").
- Fix: Drop the delay; all pills fade together over base.
- Confidence: high

### MOT-30 Press tints are missing or late on Roster face cards and Player-file rows
- Severity: P2
- Lane: Classes/Roster/Home, Coach vs player
- Where: phone, light and dark
- File: `src/clubhouse/styles/roster.css:280-282` (`.ch-rs-face[data-ch-pressed] { transform: translateY(0) }`: no tint, no scale outside canopy); `src/clubhouse/styles/coachhelm-file.css:126,149,278` (`transition-delay: var(--ch-dur-press)` = 110ms)
- What's wrong:
  - A phone face card gives no visible answer to a press. Only the desktop canopy variant (`roster.css:2153-2155`) tints.
  - Player-file rows and cards wait 110ms before tinting, where the system and M-LNS-03 say 50ms (`--ch-dur-press-delay`). A quick tap therefore often shows nothing.
- Should be: 07 M-LNS-03 / M-LNS-14; system rule 4.
- Fix: `background: var(--ch-ledger-row-press)` on the phone face rule. Switch the file rules to `transition-delay: var(--ch-dur-press-delay)`.
- Confidence: high

### MOT-31 Ask v2 and Practice plan controls have no press or hover states
- Severity: P2
- Lane: Ask, Practice plan creation
- Where: brief options `.opt`, receipt link `.lk`, confirm secondary, plan blocks, `.saverow`, folder rows `.fr`; phone and desktop
- File: `src/clubhouse/styles/coachhelm-ask-v2.css` (0 `[data-ch-pressed]`, 0 `:active`, 0 `:hover`); `src/clubhouse/styles/coachhelm-plan.css` (0 pressed, 0 hover, 0 focus-visible rules in 1573 lines); `data-ch-press` only at `chat/parts/FollowUps.tsx:17`, `BriefCard.tsx:88`, `Artifact.tsx:13`
- What's wrong: Most tappable surfaces in both lanes answer a finger with nothing until the tap completes, and desktop rows have no hover. The global `:focus-visible` ring (`base.css:110`) is the only state they get.
- Should be: 07 M-ASK-27 (every button and tappable card scales .97); system rule 4.
- Fix: Add `data-ch-press=".97"` to cards and keys. Add a `[data-ch-pressed]` tint (`--ch-ledger-row-press`, 50ms delay) to rows, and `@media (hover:hover)` hover tints to match `messages.css` rows.
- Confidence: high

### MOT-32 Read desktop "More" opens a centred dialog, not a popover from the ⋯
- Severity: P2
- Lane: Root cause (Read)
- Where: S-READ-DESK.more, desktop
- File: `src/clubhouse/screens/coachhelm/read/ReadPage.tsx:184-203` (`<Modal …>` on both phone and desktop)
- What's wrong: The spec wants a popover scaling from .96 at the ⋯ (220 in, 120 out). Desktop gets a full dialog rising from the centre, so the motion comes from the wrong origin.
- Should be: 07 M-READ-13 / M-READ-14; H2 ("a menu growing from the wrong corner").
- Fix: Use `ui/Menu.tsx` anchored to the ⋯ on desktop; keep `Modal` on phone.
- Confidence: high

### MOT-33 Ask's desktop artifact pane pushes the chat column in one frame
- Severity: P2
- Lane: Ask
- Where: S-ASKD.pane open / close, desktop
- File: `src/clubhouse/styles/coachhelm-ask-v2.css:134` (`.ch-ak-pane { width: 452px; flex: none }`), `:473-474` (slide in / out on the smooth spring)
- What's wrong: The pane slides on transform, but the chat column beside it narrows by 452px on the first frame. The text reflows and jumps under the reader while the pane is still off-screen. Closing waits the full spring and then widens the column at once. Both directions use the in-spring; exits should be the 280 ease.
- Should be: system rule 3; 07 M-ASK-28 to 30.
- Fix: Overlay the pane (`position: absolute` with a shadow) during the slide and commit the column width at the end. Or slide the chat column by `translateX` in step and commit once. Exit on `--ch-dur-release` / `--ch-ease`.
- Confidence: medium

### MOT-34 Team story viewer closes with no exit
- Severity: P2
- Lane: Team view
- Where: S-TEAM.story close (×, Done, last timer, story action), phone
- File: `src/clubhouse/screens/coachhelm/team/Stories.tsx:118,163,286-291` (`onClose` → `setOpen(null)` unmounts); `src/clubhouse/styles/coachhelm-team.css:1885-1888` (rise on mount only)
- What's wrong: The full-screen green viewer disappears in one frame. The rise is a CSS keyframe, so a close mid-rise can't reverse from where it is (M-TEAM-30).
- Should be: 07 M-TEAM-29 / M-TEAM-30; system rule 3.
- Fix: Render the viewer through `useDialogLifetime(open, { direction: 'bottom' })` (as `History.tsx` does), which gives an exit, retargeting and the RM fade.
- Confidence: high

### MOT-35 Spec'd crossfades and opens that hard-cut
- Severity: P2
- Lane: Practice plan creation, Messages, Root cause (Read)
- Where: listed below
- File:
  - `screens/coachhelm/plan/PlanCard.tsx:433` (`{menu && <div className="flist">…}`: folder list, M-ASK-17)
  - `styles/coachhelm-plan.css` has no rule for the swap name or Changed chip (M-ASK-14, 15)
  - `styles/messages.css:4073-4077` (desktop details column appears with no transition, M-MSG-20b)
  - `screens/coachhelm/read/cards.tsx:408` (an opacity .7 → 1 blink instead of the 2px gain ring over 900ms; `.flash` at `coachhelm-read.css:830-842` is unused, M-READ-10)
- What's wrong: Each of these is a jump-cut where the spec has a timed open or crossfade.
- Should be: the rows named.
- Fix: Folder list: `Swap` or a WAAPI fade + 6px rise, with a FLIP for the rows below. Messages details: slide the 300px pane by `translateX(100%)` → 0 inside a fixed track, not by animating the grid. Read: add `.flash` to the host card on assign.
- Confidence: high

### MOT-36 Dead keyframe references in the Team CSS (ported design-page rules)
- Severity: P2
- Lane: Team view
- Where: n/a (dead or broken CSS)
- File: `src/clubhouse/styles/coachhelm-team.css`:
  - `:531` `animation: fadein` (keyframe is `ch-htb-fadein`)
  - `:998` `animation: popin` (`ch-htb-popin`)
  - `:1228` `animation: draw` (`ch-htb-draw`): `.assigned path` stays at `stroke-dashoffset: 24`, an invisible tick
  - `:1237` `spin`, which works only if Tailwind's global `spin` keyframe is emitted
  - `:1331` `storyin` (`ch-htb-storyin`)
- What's wrong: These selectors (`.fadein`, `.wk.pop`, `.assigned`, `.spin`, `.sto-anim`) aren't rendered by any Team TSX, which is why nothing visibly breaks today. As a result M-TEAM-26 / 27 (spinner, drawn tick) aren't built. The live Assign shows "Assigning…" text only (`screens/coachhelm/parts.tsx:436`). Anyone reusing these classes gets a missing tick.
- Should be: 07 M-TEAM-26 / 27; brief ("design-page CSS ported verbatim").
- Fix: Delete the five dead blocks. Build the Assign state with `ui/Spinner` and a `stroke-dashoffset` tick on `--ch-dur-marks`.
- Confidence: high

### MOT-37 Sheet exits run 260 CH_EASE where the lanes specify 280
- Severity: P2
- Lane: all sheet users (Team, Read, Lenses, Practice, Messages)
- Where: every `ui/Modal` / `ui/FormSheet` close, phone
- File: `src/clubhouse/lib/dialog-lifetime.ts:164` (`duration: CH_DUR.base * 1000, easing: 'cubic-bezier(.22,1,.36,1)'` literal)
- What's wrong: Team (M-TEAM-20), Messages (M-MSG-16c) and Ask (M-ASK-13) all set the sheet close at 280 `--ch-ease`. The shared exit is 20ms shorter and spells the curve as a literal.
- Should be: 07 M-TEAM-20, M-MSG-16c; system rule 1.
- Fix: `CH_DUR.release * 1000` with `bezier(CH_EASE)`.
- Confidence: high

### MOT-38 Toast exit moves with framer `y`, on the main thread
- Severity: P2
- Lane: all lanes (shared toast; Read M-READ-25, Lenses M-LNS-27, Messages M-MSG-25)
- Where: toast dismiss, phone and desktop
- File: `src/clubhouse/ui/Toast.tsx:369` (`{ opacity: 0, y: 6, scale: 0.98 }`)
- What's wrong: `lib/motion.ts:139-141` explains that framer's `x`/`y`/`scale` run on the main thread and that a transform string goes to the compositor. The toast still uses `y`/`scale`, so a busy frame (a route landing) stalls it. Under RM it is instant (MOT-22).
- Should be: `lib/motion.ts` presets note; system rule 2.
- Fix: `transform: 'translateY(6px) scale(.98)'`, as `CH_POP.exit` does.
- Confidence: medium

### MOT-39 Overshooting springs on data marks and avatars
- Severity: P2
- Lane: Messages, Classes/Roster/Home, Team view
- Where: seen-by faces arriving, roster coin hover, Team stations
- File: `src/clubhouse/screens/messages/seen-by.tsx:112` (`chSpring('pop')`, bounce .35, peak about 1.068, on a server "seen" event); `src/clubhouse/styles/roster.css:2561` (`--ch-ease-spring` peak about 1.1 on the avatar, 180ms); `src/clubhouse/styles/coachhelm-team.css:270`, `:370` (stations on `--ch-ease-spring`, 520)
- What's wrong: A face that pops past its size when someone else reads a message is motion on data, not on the user's action. `--ch-ease-spring` (`cubic-bezier(.34,1.3,.64,1)`) overshoots well past the 0.1-bounce cap in `lib/motion.ts:58-60`.
- Should be: `lib/motion.ts:55-65` (bounce 0 to 0.1 outside Messages' user actions); owner (motion answers the user).
- Fix: Faces from the server: fade 180 at size. Roster hover: `--ch-ease`. Stations: no entrance at all (MOT-03).
- Confidence: medium

### MOT-40 Team rows scale on press, against the house rule that rows tint
- Severity: P2
- Lane: Team view
- Where: bar rows, read rows, roster rows, course rows, phone
- File: `src/clubhouse/styles/coachhelm-team.css:76-82` (`.tapp[data-ch-pressed] { transform: scale(.97); stroke-width: 1.5 }`, back over 280 `--ch-ease`)
- What's wrong: `lib/press.ts:9-13` ("Rows, links, tabs, switches and cards do not scale … a whole row shrinking read as rubbery", owner 2026-10-01). Team rows full-width-scale by .97, about 11px at 358 wide, which goes past the 6px key rule. The spec row M-TEAM-38 asks for it, which conflicts with the owner rule.
- Should be: `lib/press.ts` rule; system rule 4.
- Fix: Replace with a `--ch-ledger-row-press` tint after `--ch-dur-press-delay`. Keep `.97` only on `.btn` keys and story tiles (`data-ch-press-scale=".97"`).
- Confidence: medium (spec and house rule conflict; owner to confirm)

### MOT-41 Popovers with an entry but no exit (class awareness, Ask picker)
- Severity: P2
- Lane: Classes/Roster/Home, Ask
- Where: class-awareness popover, Ask composer picker, phone and desktop
- File: `src/clubhouse/styles/class-awareness.css:180-189` (`ch-ca-in` 180 on mount only); `src/clubhouse/styles/coachhelm-ask.css:717-735` (`ch-ask-pick-in` / `-down` on mount only)
- What's wrong: Both fade or pop in and then vanish in one frame on dismiss.
- Should be: system rule 3; `CH_POP.exit`.
- Fix: Mount them through `ui/Menu`'s `AnimatePresence` with `CH_POP`, or keep them mounted for a 180 `CH_POP.exit`.
- Confidence: high

### MOT-42 Read scroll shade sits at a fixed `top: 110px`
- Severity: P2
- Lane: Root cause (Read)
- Where: S-READ phone, under the green bar, any Text Size or safe-area inset
- File: `src/clubhouse/styles/coachhelm-read.css:122-126` (`.shade { position: sticky; top: 110px }`)
- What's wrong: The bar's real height is `--ch-phone-topbar-h + env(safe-area-inset-top)` and changes with the inset and the large title. A literal 110 sits the shade mid-content on one device and under the bar on another.
- Should be: 07 M-READ-24; system rule 10.
- Fix: `top: calc(var(--ch-phone-topbar-h) + env(safe-area-inset-top))`, or use the bar's own `data-scrolled` edge (`shell/large-title.tsx:105`), which every other lane uses.
- Confidence: medium

### MOT-43 Stats team "chosen leg" plate assumes 44px rows and drifts under Text Size
- Severity: P2
- Lane: Stats
- Where: S-TEAMSTATS legs, phone, at larger iPhone Text Size
- File: `src/clubhouse/styles/stats.css:4733-4746` (`translate: 0 calc(4px + i × 44px)`, "nothing is measured")
- What's wrong: Rows grow past 44px when Text Size raises the 15 or 17 type, or when a label wraps. The plate then slides to the wrong row, about 8-12px off per row from row 2 down. Accurate at the default size only.
- Should be: H4 (text follows iPhone Text Size); owner ("accurate").
- Fix: Slide the plate with `useSlidePlate` (`lib/slide-plate.ts`), which measures the chosen row.
- Confidence: medium

### MOT-44 Classes import scan travels a fixed 130px over a box of any height
- Severity: P2
- Lane: Classes/Roster/Home
- Where: ImportSchedule "reading" state, phone and desktop
- File: `src/clubhouse/styles/classes.css:1015-1031` (`translateY(-34px → 130px)` over `--ch-dur-shimmer`, infinite; `background: #efe6d2` above it has no dark override)
- What's wrong: The sweep stops 130px down whatever the page height, so on a tall schedule it never reaches the bottom. It loops forever while reading, with no off-screen pause.
- Should be: system rules 1 and 9.
- Fix: Translate by `100cqh` of a container (`container-type: size`), or use `.ch-skel`'s sheen over the page thumbnail.
- Confidence: medium

### MOT-45 Quick chat step band keeps `will-change: transform` on for as long as a step runs
- Severity: P2
- Lane: Quick chat
- Where: S-RUN.steps active step, phone and desktop
- File: `src/clubhouse/styles/quick-chat.css:90` (`.step.active .step__l::after { … animation: ch-qc-band 1.9s infinite; will-change: transform }`)
- What's wrong: An infinite band on the active step plus a permanent compositor layer, while the 2.4s key wheel (`:31`) turns in the bar at the same time. Neither pauses when the panel is closed or scrolled off. Two loops plus a promoted layer for the whole run cost battery on a phone.
- Should be: system rule 1; battery (infinite loops only where they mean "working").
- Fix: Drop `will-change` (a transform animation promotes the layer on its own). Pause both loops with `animation-play-state: paused` when the panel is hidden (`.ch-qcs:not(.is-open)`).
- Confidence: medium

---

## Counts

P0 0 · P1 21 (MOT-01 to MOT-21) · P2 24 (MOT-22 to MOT-45) · 45 findings.

## Summary (worst first)

1. Reduce Motion is broken app-wide. The `base.css:303` floor forces every CSS fade to 1ms, so Messages, Ask, Stats and Quick chat cut instead of fading 180ms. Lane spinners stop, and Ask's Undo ring reads as expired (MOT-01, 18, 20).
2. The owner's "no first-paint motion" is broken in five lanes: Stats grow-once, the Team fly-in and pop-in rows, Home leg bars, Read draw-ins, and the Plan strip and brief replays (MOT-02 to 06, 19, 28).
3. Layout is being animated: the sidebar width and grid, the lens fold height, Swap height, Stats bars by `left`/`width` at 60 React renders a second, Ask dots `width`, and the poll `grid-template-rows` (MOT-07 to 10, 17).
4. Accuracy bugs:
   - Team story timer drifts after a hold.
   - Inspector slides out empty.
   - The Stats sticky switch hides under the bar on notched phones.
   - The leg plate drifts under Text Size.
   (MOT-11, 12, 15, 43)
5. Transitions differ between lanes: Team tabs hard-cut while the other CoachHelm views crossfade, Ask hand-rolls its own phone push, and each lane writes its own skeleton sheen and literal durations, which Animations off can't stop (MOT-13, 14, 16, 25, 27).
