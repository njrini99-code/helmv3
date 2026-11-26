# 07. CoachHelm read: motion

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 15 rows).

One row per interaction. Values were read off the design page's CSS and script (version 4) and its own Motion table (`#motion`). Where the page's studio skips a move the table describes (the Dismiss crossfade and the reasons fade), the table is the design and the row says so. Where this file and `04-FIDELITY-SPEC.md` §8 disagree, this file wins.

Tokens (all exist today or come with PR 1):

| Token | Value | Where |
|---|---|---|
| `--ch-ease` | `cubic-bezier(.22, 1, .36, 1)` | `tokens.css` |
| `--ch-ease-spring-smooth` | `linear(0, .006, .025 2.8%, .101 6.1%, .539 18.9%, .721 25.3%, .849 31.5%, .937 38.1%, .968 41.8%, .991 45.7%, 1.006 50.1%, 1.015 55%, 1.017 63.9%, 1.001)`, 462ms; within 1% of rest at about 211ms, a 1.7% overshoot peaking near 295ms, at rest by 462ms | `tokens.css` |
| `CH_FADE_MS` | 180ms today, `linear` | `lib/motion.ts:45`, pinned by `reduced-motion.test.tsx`; every Reduce Motion crossfade on this lane reads it; leave it untouched |
| `CH_UNDERLAY_SHIFT` | 24% | `lib/motion.ts` (shared; the page draws 30%) |

## Reduce Motion: `CH_FADE_MS` (180ms today)

Every Reduce Motion crossfade on this lane uses `CH_FADE_MS` from `lib/motion.ts`, 180ms today (owner decision, 24 Oct), pinned by `reduced-motion.test.tsx`. That is the package rule (DECISIONS and SHARED-6, 3 Nov) and the same as Lenses' 07. Where this file or the design page says 120ms for Reduce Motion, read it as `CH_FADE_MS`. No lane-local duration. In CSS use PR 1's `--ch-dur-crossfade-rm` token, which BUILD_BRIEF sets to the `CH_FADE_MS` value. The setting is read from the system (`prefers-reduced-motion`) and from Settings > Animations, as today.

## Motion table

| ID | Screen | Trigger | Element(s) | Property | From → to | Duration | Curve or spring | Delay / stagger | Interruptible | Reduce Motion | Haptic | Check |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-READ-01 | S-READ-BOARD, every button, chip and switcher | pointer down; cancelled when the pointer moves more than 10px (a scroll) | `.ch-hr-feat` (board card), `.ch-hr-btn`, correction chips, desktop switcher buttons | transform | `scale(1)` → `scale(.97)`, back to `scale(1)` on release | 110ms down, 280ms up | `--ch-ease` | none | yes: release mid-press retargets from the current scale | none, static (no scale) | none | clip `press`, frame at 110ms shows 0.97 |
| M-READ-02 | S-READ-BOARD → S-READ | tap release on the board card, or Enter or Space on it | read view; board view; dim layer | transform, opacity, box-shadow | read `translateX(100%)` → `0`; board `0` → `translateX(-24%)` (`CH_UNDERLAY_SHIFT`); dim `opacity 0` → `.1` (black); read casts `-12px 0 30px -18px rgba(0,0,0,.4)` | 462ms | `--ch-ease-spring-smooth` | press (M-READ-01) finishes its 110ms first; push starts on release | yes: Back mid-push reverses from the current position | read and board crossfade, opacity only, `CH_FADE_MS` linear; no dim, no shadow, no travel | none | clip `push`, frames 0, 231, 462 |
| M-READ-03 | S-READ → host | Back tap, or the back gesture where the app has one today | as M-READ-02 | as M-READ-02 | the reverse of M-READ-02 | 462ms | `--ch-ease-spring-smooth` | none | yes: a tap on the board mid-pop is ignored until it settles; Back again is ignored | `CH_FADE_MS` crossfade | none | clip `pop` |
| M-READ-04 | S-READ.where | the card first enters the viewport with 35% of it visible (IntersectionObserver, once per mount) | every `.ch-hr-fbar` | transform | `scaleX(0)` → `scaleX(n / steps[0].n)`, origin left | 360ms | `--ch-ease` | none: all bars grow together | yes: scrolling away mid-draw lets it finish; it never restarts | bars drawn at their final length, no animation | none | clip `funnel`, frame at 360ms equals the static shot |
| M-READ-05 | S-READ.why (likely) | the card first enters the viewport, 35% visible, once | missed dots `.ch-hr-dots i.f` | transform, opacity | `scale(.4)`, `opacity 0` → `scale(1)`, `opacity 1` | 360ms | `--ch-ease` | none: all together | finishes; never restarts | drawn at rest | none | clip `cause-likely` |
| M-READ-06 | S-READ.why (counted) | as M-READ-05 | path nodes `.ch-hr-pn .nd`; connectors `.ch-hr-pn::after` | transform, opacity | nodes `scale(.7)`, `opacity 0` → `1`; connectors `scaleX(0)` → `1` from the left | 360ms | `--ch-ease` | none: nodes and lines together | finishes; never restarts | drawn at rest | none | clip `cause-path` |
| M-READ-07 | S-READ.head, S-READ-BOARD | the card first enters the viewport, once | ladder band `rect.anim` | opacity | `0` → `.55` | 360ms | `--ch-ease` | none | finishes | drawn at rest | none | clip `push` (band visible by the end) |
| M-READ-08 | S-READ.do, S-READ-BOARD.actions | tap Assign as focus | button content | content swap, then spinner rotate | label → spinner + "Assigning…"; spinner `rotate(0)` → `rotate(360deg)` | spinner 700ms per turn while the write runs | `linear`, infinite | none | no: the button is disabled while the write runs | label "Assigning…" with a still spinner ring (loops stop) | none | clip `assign`, first 200ms |
| M-READ-09 | S-READ.assigned | Assign write succeeds | Assigned chip tick `path` | stroke-dashoffset | `24` → `0` | 360ms | `--ch-ease` | starts when the chip mounts | finishes | tick shown complete | success (`UINotificationFeedbackGenerator .success`, as today's FocusActions) | clip `assign`, tick done 360ms after the chip appears |
| M-READ-10 | S-READ.do, S-READ-BOARD | Assign write succeeds | the host card (`#cdo` or the board card) | box-shadow ring, opacity | inset 2px `--ch-gain` ring (`--ch-feature-gain` on the feature card): opacity `0` → `1` at 30% → `0` | 900ms | `--ch-ease` | starts with the chip | finishes | no ring | none | clip `assign` |
| M-READ-11 | S-READ.more | tap ⋯ on the green bar | dim; sheet | opacity; transform | dim `0` → `1` (black 40%); sheet `translateY(calc(100% + 24px))` → `0` | dim 260ms; sheet 462ms | dim `--ch-ease`; sheet `--ch-ease-spring-smooth` | none | yes: Cancel or a dim tap mid-rise retargets from the current position | dim and sheet fade together, `CH_FADE_MS` linear, no rise | none | clip `more` |
| M-READ-12 | S-READ.more | Cancel, a tap on the dim, or an action row | dim; sheet | opacity; transform | the reverse of M-READ-11 | dim 260ms; sheet 462ms | as M-READ-11 | the next state draws after the sheet is down: 470ms after Cancel, 300ms after an action | yes: ⋯ again mid-lower retargets upward | `CH_FADE_MS` fade; next state draws at once | Dismiss: warning (`.warning`) before the sheet lowers, as today | clip `more` |
| M-READ-13 | S-READ-DESK.more | click ⋯ in the glass bar | popover | opacity, transform | `opacity 0`, `scale(.96)` → `opacity 1`, `scale(1)`, origin top right | 220ms | `--ch-ease` | none | yes: a second click closes it at once | `opacity 0` → `1`, `CH_FADE_MS` linear | none | clip `desk-more` |
| M-READ-14 | S-READ-DESK.more | Close, Esc, a click outside, or an item | popover | opacity | `1` → `0` | 120ms | `--ch-ease` | none | finishes | instant | none | clip `desk-more` |
| M-READ-15 | S-READ.dismissed, S-READ-BOARD.dismissed | Dismiss this read (after M-READ-12) | the card's place: card out, notice in | opacity | card `1` → `0` while the notice `0` → `1`; height snaps (does not animate) | 260ms | `--ch-ease` | none | Undo mid-fade reverses from the current opacity | `CH_FADE_MS` crossfade | warning, before (see M-READ-12) | clip `dismiss`. The studio swaps without the fade; the page's Motion table is the design |
| M-READ-16 | S-READ.dismissed | Undo | notice out, card in | opacity | the reverse of M-READ-15 | 260ms | `--ch-ease` | none | Dismiss again is only reachable after it settles | `CH_FADE_MS` crossfade | none | clip `dismiss` |
| M-READ-17 | S-READ.sure.reasons | tap Not this | reasons panel | opacity | `0` → `1`; height snaps | 180ms | `--ch-ease` | none | a second tap on Not this closes it at once | instant | none | clip `corrections`. Studio swaps without the fade; table is the design |
| M-READ-18 | S-READ.sure.answered | pick a reason or another chip; the write succeeds | chips out, answer line in | opacity | crossfade `1` → `0` / `0` → `1` | 180ms | `--ch-ease` | none | Change mid-fade reverses | instant | none | clip `corrections` |
| M-READ-19 | S-READ.rounds-all | Show all 9, Show fewer | extra rows | none | rows appear and go in place; height snaps; no navigation, no history entry | 0 | none | none | n/a | same | none | DOM test |
| M-READ-20 | S-READ.loading, S-READ-BOARD.loading | page or card is loading | skeleton outlines | opacity | `1` → `.55` → `1` | 1.6s loop | `ease-in-out` | none: all outlines pulse together | the loop ends when content arrives | none, static outlines | none | clip `loading` |
| M-READ-21 | S-READ, S-READ-BOARD | content replaces the skeleton | skeleton out, cards in | opacity | crossfade `0` → `1` | 180ms | `--ch-ease` | none: no staggered card entrance | n/a | `CH_FADE_MS` crossfade | none | clip `loading` |
| M-READ-22 | S-READ-DESK | a deep link or a rail row lands on a card | the card | box-shadow ring | scroll to the card (`block: start`), then an inset 2px `--ch-gain` ring `0` → `1` at 30% → `0` | scroll at the browser's smooth speed, ring 900ms | `--ch-ease` | ring starts when the scroll ends | a new jump cancels the ring and starts again | instant scroll, ring shown without fading for 900ms | none | clip `desk-jump` |
| M-READ-23 | S-READ-DESK.rail | rail row click or switcher change | middle and right columns | opacity | old `1` → `0`, new `0` → `1` | 260ms | `--ch-ease` | none, no slide | a second click retargets to the newest choice | `CH_FADE_MS` crossfade | none | clip `desk-swap` |
| M-READ-24 | S-READ (green bar) | page scroll past 8px | 14px shade under the bar | opacity | `0` → `1` | today's | today's | none | scroll-linked | today's | none | unchanged from today (SHARED-1) |
| M-READ-25 | S-READ.copied | Copy a link to this read | today's toast | today's | today's | today's | today's | none | today's | today's | none | not drawn; uses today's toast |
| M-READ-26 | S-READ.why, S-READ.rounds | hole chip or round row tap | today's push to the round review | as M-READ-02 | as M-READ-02 | 462ms | `--ch-ease-spring-smooth` | none | as M-READ-02 | `CH_FADE_MS` crossfade | none | today's round review push, unchanged |

## Never animates on this lane

- No count-up on any figure (hero number, counts, percentages).
- No entrance stagger: cards, steps, dots, nodes and rows all appear together.
- No motion on re-render, data refresh, theme change or Text Size change. A chart that drew once does not draw again; a second scroll into view does not restart M-READ-04 to M-READ-07.
- No height animation (Dismiss, Undo, reasons, Show all: heights snap).
- No blur or shadow change on scroll. The glass bar's blur is static.
- No parallax, no shimmer sweep (the skeleton breathes, it doesn't sweep).
- Nothing in the green bar moves except the back label and title swapping with the push.

## Interrupt cases worth a test

1. Tap the board card, then Back before 462ms: the read slides back from where it was, without a jump (M-READ-02 → M-READ-03).
2. Press a button and drag 12px: the press releases (M-READ-01), no tap fires.
3. Open More, then tap the dim within 200ms: the sheet lowers from its current height (M-READ-11 → M-READ-12).
4. Dismiss, then Undo within 260ms: the card fades back from the current opacity (M-READ-15 → M-READ-16).
5. Scroll the Where card into view, away and back: the bars draw once only (M-READ-04).
6. Switch players on the desktop twice quickly: one crossfade to the last choice, never two stacked (M-READ-23).
7. Turn Reduce Motion on with the read open: the next push is a `CH_FADE_MS` fade and the funnel on a fresh mount is drawn at rest.
8. Assign while offline: the spinner stops, the button returns with the CH-13001 notice; no tick, no ring, no success haptic; today's `useFocusActions` error feedback, if it has one, fires as it does today (fixed 4 Nov: "no haptic" read as a rule against today's error feedback; Lenses 07 lists "error on failure").

## Can't match as drawn

- Underlay shift: the page draws the board at −30%; the shared `CH_UNDERLAY_SHIFT` is 24%. Build 24% (option 1); option 2 is a lane override to 30%, which would make this push differ from every other push in the app. Recommend option 1.
- Push on a query-only change: `classifyNav` strips the query, so `?view=read` would fade, not push. PR 5 scopes `classifyNav` to `/golf/dashboard/coachhelm` with views read, player, deep-dive, standing and profile (02 §7.1), agreed with the Lenses lane.

## Completeness pass, 4 Nov 2026

Rows for the 05 IDs and states that had no motion row, and for the states added in 05's Completeness pass section. Most of them hold still on purpose; a row says so, so the build doesn't invent motion. Same columns as above.

| ID | Screen | Trigger | Element(s) | Property | From → to | Duration | Curve or spring | Delay / stagger | Interruptible | Reduce Motion | Haptic | Check |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-READ-27 | S-DIVE.why | open today's Deep dive | Why section | none | unchanged from today | today's | today's | none | n/a | today's | none | screenshot equals main at 75b4956 apart from the removed arms |
| M-READ-28 | S-READ.sure.answerfail | the answer write fails | chips stay; notice line appears under them | none | appears in place | 0 | none | none | n/a | same | today's error feedback, if any, from the corrections write | clip `answer`, failing fixture |
| M-READ-29 | S-READ.moved, .moved.notrend | page paint, scroll into view | slope chart, change sentence, trend chip; or the "No trend yet" line | none | drawn at rest; no line draw, no point pop | 0 | none | none | n/a | same | none | `moved`, `notrend`: frame 0 equals the last frame |
| M-READ-30 | S-READ.proposed, .declined, .noassign | page paint; Assign or Propose again succeeds | Do card footer row | opacity (only after a write) | at rest on paint; after a write, the button crossfades to the row `0` → `1` | 180ms | `--ch-ease` | none | finishes | same 180 fade | success on Propose again, as M-READ-09 | clip `assign` on `declined` fixture |
| M-READ-31 | S-READ.stale, .cleared, .contradicted, .underreview | page paint | stance chip, notice, greyed title | none | drawn at rest | 0 | none | none | n/a | same | none | `stale`, `cleared`, `contradicted`, `underreview` |
| M-READ-32 | S-READ.countdown, .gap | Why card first enters the viewport | the ten segments or the ring | none | drawn at rest; filled segments and the ring's arc show at their value | 0 | none | none | n/a | same | none | `putts`, `gap` |
| M-READ-33 | S-READ.partfail | Try again in the banner or the Rounds card | that card's body | opacity | notice out, skeleton breathes (M-READ-20), then content in (M-READ-21) | as M-READ-20, 21 | as those | none | a second tap does nothing while loading | as those | none | clip `retry` on `roundsfailed` |
| M-READ-34 | S-READ.failed | Try again | whole page | opacity | error card → skeleton (M-READ-20) → cards (M-READ-21) | as M-READ-20, 21 | as those | none | button disabled while loading | as those | none | clip `retry` on `failed` |
| M-READ-35 | S-READ.gone, .notyours | page paint, or a write answers gone | the error card in place of the page | opacity (after a write only) | `0` → `1` crossfade over the old page | 180ms | `--ch-ease` | none | finishes | same | none | `gone`, `notyours` |
| M-READ-36 | S-READ.nopool, .long | page paint | ladder; titles | none | at rest; M-READ-07's band still fades once | as M-READ-07 | as M-READ-07 | none | n/a | as M-READ-07 | none | `teampooloff`, `long` |
| M-READ-37 | S-READ (cold start or deep link) | the page is the first page of the session | read view | none | no push: first paint as a page; Back from here pushes back to the label's place as a normal reverse (M-READ-03) with that page as the underlay | 0 on open; Back 462ms | Back `--ch-ease-spring-smooth` | none | as M-READ-03 | `CH_FADE_MS` crossfade on Back | none | clip `cold` (add) |
| M-READ-38 | S-READ from Team or Lenses | "Open the full read" in the shared read sheet | the sheet, then the push | sheet closes (Team M-TEAM-20, Lenses M-LNS-08) at the same time as the push starts (M-READ-02) | as those | 462ms | `--ch-ease-spring-smooth` | none | Back mid-push reverses (M-READ-03); the sheet stays closed | `CH_FADE_MS` crossfade, sheet gone at once | none | clip `fromteam` (add) |
| M-READ-39 | every screen | Tab, Shift Tab | focus ring | none | shows at once | 0 | none | none | n/a | same | none | DOM test |
| M-READ-40 | S-READ at 821 to 1179 | rail row click | middle column | as M-READ-23 | as M-READ-23 | as M-READ-23 | as M-READ-23 | none | as M-READ-23 | as M-READ-23 | none | clip `rail` at 1024 (add) |
| M-READ-41 | S-READ (refresh) | pull to refresh, or new data on focus | changed figures | none | swap in place; no chart redraws (Never animates) | 0 | none | none | n/a | same | none | DOM: no `.anim` class added on refresh |
