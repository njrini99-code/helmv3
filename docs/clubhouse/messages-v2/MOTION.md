# Messages v2 motion spec

Source: the `MOT` tables, the spring cards, the `anim()` engine, the demos
(`DEMO`/`PLAYS`) and the motion-check (`MCASES`) in
`design-refresh/messages/redesign/clubhouse-messages.html`. SPEC.md is the
layout; this file is every movement. IDs `MOT-<area>-<n>` are the artifact's
table rows in order (49 rows). `MOT-SPR-*` are the seven springs. `MOT-X-*` are
motions the artifact only draws in code (not in its tables). `MOT-KB-*` and
`MOT-R-*` are the keyboard and Reduce Motion rules. Test notes quote the
artifact: each row's "Replay" key (the hash-free demo that plays it) and the
motion-check case that covers it (MC-01..MC-11, listed at the end).

**Post-survey rule.** Rows carrying "Default per Q-nn" are overridden by that
default (QUESTIONS.md). Gates that shape the build (GAP.md Part G): TSX
`duration: N` literals outside {0, .11, .18, .26, .28, .52} and CSS `Nms` /
`cubic-bezier(` outside tokens.css fail `clubhouse:check`, so every duration
below needs a named constant or token; the app's `chSpringCurve` numbers, not
the artifact's solver, are the targets.

House rules (artifact, "Motion system"): no count-ups (a vote or reaction count
changes at once while its bar or badge moves); no staggers (rows that arrive
together move together; the typing-dots wave is one looping element); only
transforms and opacity move (the one layout animation is the desktop details
column, MOT-DET-2); interrupts never jump (a new motion starts from where the
node is now); owner rule B7: an arrival has its full height from the first frame
and the thread above never jumps.

Engine rule (`anim`): under Reduce Motion a motion with an opacity keyframe
becomes a 120 ms linear crossfade between its first and last opacity; a motion
without opacity (or with `rd: null`) does not play. See MOT-R. "Replay" below
means the artifact's Play/Replay key of that name.

## Springs (MOT-SPR)

framer `visualDuration` and `bounce`; stiffness = omega^2, damping = 2 *zeta*
omega, mass 1, where omega = 2 pi / (1.2 * visualDuration) and zeta = 1 - bounce
(min .05). This is `chSpring`'s own conversion (`src/clubhouse/lib/motion.ts`
`physics()`), so the numbers can be passed straight in. SwiftUI
`.spring(duration, bounce)` duration = 1.2 x visualDuration. "Settles" = the
artifact's solver (1/2000 s steps, rest at |x-1| < .001 and |v| < .02); smooth
is pinned to 462 ms by the design language. The app's own `chSpringCurve`
(SETTLED ruling 29) reads settle 417, reveal 921, send 700, pop 496, lift 471,
smooth 462 ms and is the number the build must hit; launch is new:
`chSpringCurve('launch')` measures 812 ms (the solver says 828), so derive the
0.62 x sideways time (503 ms) and the 70% receipt delay (568 ms) from 812.

| ID | Name | In `CH_SPRINGS`? | visualDuration / bounce | stiffness | damping | Settles (page solver) | Peak | SwiftUI | Used for |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MOT-SPR-1 | smooth | yes | 0.26 / 0 | 406 | 40.3 | 462 ms (pinned) | 1.000 | 0.31, 0 | Push, sheets, bars and rows moving together. The design language's 462 ms curve. CSS `linear()` sampled curve provided in the artifact (`SMOOTH_LINEAR`). |
| MOT-SPR-2 | settle | yes | 0.26 / 0.1 | 406 | 36.2 | 427 ms | 1.001 | 0.31, 0.1 | Things returning to rest: a held bubble, times sliding back. |
| MOT-SPR-3 | reveal | yes | 0.52 / 0 | 101 | 20.1 | 941 ms | 1.000 | 0.62, 0 | Content opening out: a reply leaving the typing bubble, the jump glide. |
| MOT-SPR-4 | send | yes (added for Messages) | 0.42 / 0.12 | 155 | 21.9 | 713 ms | 1.003 | 0.50, 0.12 | The thread making room for your message (Nov 7 narrowed this: it no longer carries the bubble). |
| MOT-SPR-5 | launch | NO (new) | 0.5 / 0.2 | 110 | 16.8 | 828 ms (app curve 812) | 1.015 | 0.60, 0.2 | Your bubble rising out of the field: one soft overshoot as it lands. |
| MOT-SPR-6 | pop | yes | 0.25 / 0.35 | 439 | 27.2 | 540 ms | 1.067 | 0.30, 0.35 | Small things arriving: reaction badges, the send key, typing dots, Seen faces. |
| MOT-SPR-7 | lift | yes | 0.28 / 0.15 | 350 | 31.8 | 487 ms | 1.006 | 0.34, 0.15 | A held bubble lifting, menus unfolding from it. |

The chapter heading says "Six springs" and lists seven (smooth, settle, reveal
in Clubhouse; send, launch, pop, lift new/added). Only `launch` is missing from
`lib/motion.ts` today (Q-04).

Curves used outside the springs: `--ch-ease` = `cubic-bezier(0.22, 1, 0.36, 1)`
(house ease-out); `--ch-ease-spring` = `cubic-bezier(0.34, 1.3, 0.64, 1)`
(CSS-only springs: thumb, switch knob, + rotate); iOS keyboard curve
`cubic-bezier(0.32, 0.72, 0, 1)` 480 ms.

## Conversation list and navigation (MOT-LIST)

| ID | Trigger | What moves | Spring / timing | Reduce Motion | Test note |
| --- | --- | --- | --- | --- | --- |
| MOT-LIST-1 | Tap a row or pin (phone) | Default per Q-26: the list moves to -24% (`CH_UNDERLAY_SHIFT`, shell-wide) unless the owner approves 30% for every page. Push into a conversation. "Thread slides in 100% > 0; the list moves to -30% and dims to 0.9. The tapped face flies into the header on the same curve." Code: new page `translateX(100%) > none`; old page `none > translateX(-30%)` fill forwards; old page's dim layer (`rgb(0 0 0 / .10)`) opacity 0 > 1; the tapped avatar is cloned, positioned absolutely over the app at z 45 and animated `translate(dx, dy) scale(w2/w1)` to the header face (which is hidden until it lands, then the clone is removed). The old page is `inert` and hidden when the push ends. | smooth (462 ms) | Crossfade 120 ms (no avatar flight) | Replay `open`. MC-07 (back pressed mid-push). |
| MOT-LIST-2 | Back key | "The same move in reverse, from wherever it is." Page below `-30% > none` (live start), dim 1 > 0, top page `none > translateX(100%)` fill forwards then removed; any flying avatar clones removed; overlays closed at once. | smooth | Crossfade 120 ms | Replay `open`. MC-07: both pages are sampled; no teleport when Back lands 170 ms into a push; the page underneath must stay showing. |
| MOT-LIST-3 | Scrolling the list | "Top bar: unchanged from today: the green bar, the Messages switcher and the bell never move with the list; the sheet's lip stays put as rows scroll under it." | None | None | Replay `list` (scrolls the list 120 px and back). |
| MOT-LIST-4 | Tap All / Unread / Groups | "The paper thumb slides in its well. Rows that stay glide to their new places together; rows that leave fade." Code: thumb CSS `transform .36s cubic-bezier(.34,1.3,.64,1)` (the table calls it `--ch-ease-spring`, 360 ms); the list is replaced; each surviving row animates `translateY(oldTop - newTop) > none` on smooth; new rows fade `opacity 0 > 1` on smooth. No stagger. | Thumb 360 ms `--ch-ease-spring`; rows smooth | Thumb jumps; rows crossfade 120 ms | Replay `filter` (Unread, Groups, All). |
| MOT-LIST-5 | Someone types in a conversation you can see in the list | "The preview line swaps to three dots while someone writes, and hides after 5 s without a keystroke." Dots: `translateY(0 > -3px > 0)` and opacity .4 > 1 > .4, 1.2 s loop, delays 0 / .16 / .32 s. | 1.2 s loop | Dots pulse in place (artifact CSS: held still at opacity 1, the later SHARED-6 rule) | Replay `list`; hash `#rowtyping`. |

## Thread (MOT-THR)

| ID | Trigger | What moves | Spring / timing | Reduce Motion | Test note |
| --- | --- | --- | --- | --- | --- |
| MOT-THR-1 | Scroll under the desktop bar | "On desktop the conversation's glass bar shows its hairline only when messages are under it. Opacity only." (`::after` opacity; phone bars have no hairline.) | 200 ms | Same | Replay `scrollglass`. |
| MOT-THR-2 | Scroll the thread | "Floats under the bar while you scroll and fades a second after you stop." CSS `opacity .25s` on the pill; `is-on` toggled by scroll; removed after 1000 ms. `.linked` (within 20 px of a day marker) has `transition: none` and its opacity follows the scroll (k = near / 20). | 180 ms in, 250 ms out | Same | Replay `scrollglass`; hash `#datepill`. |
| MOT-THR-3 | Drag the thread left (phone) | "The thread follows your finger at 60%, up to 58 px, then springs back." The 58 is `58 * k` (grows with Text Size); the drag locks to x after 8 px; release: `translateX(from) > none` composite add on settle. Pointer targets button/textarea/option are ignored. | settle | Follows the finger; returns at once | Replay `times`; hash `#times`. |
| MOT-THR-4 | A message arrives | "A new message has its full height from the first frame. Only transforms move, so the thread above never jumps (owner rule B7)." Rerender keeps the bottom if within 60 px: the whole list animates `translateY(delta) > 0` composite add on the given spring. | send | Appears with a 120 ms fade | Replay `reply`. MC-02. |

## Typing and sending (MOT-SEND)

| ID | Trigger | What moves | Spring / timing | Reduce Motion | Test note |
| --- | --- | --- | --- | --- | --- |
| MOT-SEND-1 | Focus the field (phone) | "Tapping the field slides the iOS keyboard up. The composer rides on it and the thread moves up by the same amount, so the latest message stays just above the field. In the app the real keyboard drives this through `--keyboard-height`." Code: composer and jump `translate: 0 -kb-lift` via CSS transition; thread floor padding grows by the lift; if you were at the latest message the list animates `translateY(d) > 0` composite add on 480 ms. | 480 ms `cubic-bezier(0.32, 0.72, 0, 1)`, iOS's keyboard curve | Keyboard fades in 120 ms; composer moves at once | Replay `type`. |
| MOT-SEND-2 | Tap Send | "Sending never drops the keyboard; the send key doesn't take focus from the field." | None | None | Replay `send`. |
| MOT-SEND-3 | Tap the thread or go back | "Tapping the thread or going back drops it on the same curve, and the thread follows it down." | Same curve | Fades out 120 ms | Replay `send` (ends with a blur). |
| MOT-SEND-4 | First character typed / field empties | "The green key springs in with the first character and shrinks away when the field empties. Scale 0.4 > 1. No key while the field is empty." Code: `scale(.4) opacity 0 > none`; out = reverse with fill forwards, then hidden. | pop | Swaps at once | Replay `type`. |
| MOT-SEND-5 | Typing a long message | "A line at a time up to six lines, then it scrolls. The height changes without animating, so only transforms move." | Instant | Same | Replay `type` (types a 3-sentence message). |
| MOT-SEND-6 | Send (text) | "Words become the bubble": "The typed words fade where they sat as the green fill comes up under them, 150 ms. The arrow leaves the send key upward." Code (`flyText`): a clone of the new bubble flies as one piece; it starts as plain text exactly where it sat in the field (transparent fill, field ink), the green fill (`--a-sent-t`) and light ink come up in 160 ms `cubic-bezier(.3,0,.5,1)`; the tail grows in (`opacity 0, scale .3` held to 15%, then `1`) over pop + 60 ms; the real bubble stays hidden (`opacity 0`) until the flight lands, then the copy is removed (nothing is drawn twice). The send arrow: `translate 0 -14px`, opacity 1 > 0, 200 ms `cubic-bezier(.4,0,.9,.3)`. | 150-160 ms fill; arrow 200 ms | Fades in place, 120 ms | Replay `send`. MC-01, MC-02. |
| MOT-SEND-7 | Send (text, file, poll) | "Bubble rises": "Up on its own spring with one soft overshoot; sideways on the house curve in 62% of the launch time (503 ms at 812), so the path curves into the right edge. Scale 0.92 > 1 on pop, from its lower left so the words stay put." Code: vertical `translate 0 sy > 0` on `launch` (812 ms by `chSpringCurve`); horizontal `translateX(sx > 0)` for `round(launch.ms * 0.62)` on `--ch-ease`; scale `.92 > 1` (text flight clone: `.96 > 1`) origin `0% 100%` on `pop`; non-text bubbles (file, poll) also opacity .6 > 1 over 150 ms linear; when several bubbles send at once each is delayed `(count-1-n) * 40 ms` and offset `-8 px` per step. `sy` = field bottom to bubble bottom; `dx` = `fieldLeft - 9 - bubbleLeft`. | launch; x `--ch-ease` | Fades in place, 120 ms (`launch` opacity 0 > 1) | Replay `send`, `file`. MC-01 (send twice 140 ms apart: first bubble, older message and second bubble must not teleport), MC-02. |
| MOT-SEND-8 | Bubble has landed | "Delivered rises 4 px into place only after the bubble lands; the field's placeholder fades back last." Code: receipt `translate 0 4px, opacity 0 > 1`, 260 ms `--ch-ease`, delay = 70% of launch (580 ms); only on the last sent bubble; the field (textarea) `opacity 0 > 1` 220 ms linear, delay 140 ms. | 260 ms, after 70% of launch (568 ms at 812) | Appears | Replay `send`. |
| MOT-SEND-9 | Send (thread makes room) | Note from the survey: `useThreadMakeRoom` today deliberately CANCELS a running move so it stays on the compositor (thread-v2.tsx:207; 2026-11-07 shell-motion change); `composite: 'add'` (a second send stacks) changes that on purpose, MC-01 is the test. "Everything above glides up by the bubble's height on the same spring." The list `translateY(delta) > 0` composite add; delta is clamped to the scroller height; a second send while gliding adds on top. | send | Moves at once | Replay `send`. MC-01, MC-02. |
| MOT-SEND-10 | Receipt changes | "The receipt under your latest message crossfades." Delivered > Seen (DM) after ~1.6 s in the demo; group faces added one by one (every 1.1 s in the demo) pop in (MOT-TEAM-2). | 180 ms | 120 ms | Replay `send` (ends before the receipt flips). |
| MOT-SEND-11 | Someone starts typing | "Grows from its tail corner; the dots wave in one loop." Bubble `scale(.5) opacity 0 > none` from `0% 100%`; skipped when you are scrolled away from the bottom (the list only makes room, on `pop`). | pop | Fades in; dots pulse | Replay `reply`; hashes `#typing`, `#grouptyping`. |
| MOT-SEND-12 | The reply arrives | "The message grows out of the typing bubble's corner at the typing bubble's size." Code: the typing row is replaced; the new bubble animates `scale(sc) opacity 0 > scale(sc + (1-sc)*.35) opacity 1 at 35% > none`, `sc` = min(typingW/bubbleW, typingH/bubbleH) clamped .45-1, origin from the bubble's corner. If you are scrolled away: no reveal; the jump key count updates (MOT-JMP-2). | reveal | Crossfade 120 ms | Replay `reply` (file, then text). MC-02: a reply landing 120 ms into your own rise must not make the first bubble or older messages jump. |

Other send details drawn in code, same moment: a second send while the first
rises adds a second composite glide (`composite: 'add'`); editing a message
flashes `opacity .4 > 1` over 260 ms `--ch-ease` (MOT-X-9); the field's
`autogrow` re-pins the bottom if you were within 24 px.

## Hold, lift, blur (MOT-HOLD)

| ID | Trigger | What moves | Spring / timing | Reduce Motion | Test note |
| --- | --- | --- | --- | --- | --- |
| MOT-HOLD-1 | Pointer down on a bubble (phone) | "The bubble sinks to 0.97 while held." `scale(.97)` fill forwards; a release or a move over 8 px (scaled) before the timer returns it `scale .97 > none` live. | 110 ms down, 280 ms release, `--ch-ease` | No scale | Replay `hold`. MC-03. |
| MOT-HOLD-2 | 450 ms elapsed | "At 450 ms (today's hold time) the bubble lifts over the blurred thread, moving up if the menu needs room. Haptic: medium impact." Code: the row is cloned into an overlay at the same place, origin = bubble centre; `translateY(0) scale(s0) > translateY(shift) scale(1.02)` fill forwards, `s0` = the live press scale (clamped .9-1); the real row is `visibility: hidden`. (Ruling 22: the app's haptic is `haptic('press')`, light; Q-02.) | lift | Appears in place | Replay `hold`, `holdseen`. MC-03 (let go 90 ms into the lift), MC-04 (hold again while it settles: continues from the live frame; the held bubble must not teleport or blink). |
| MOT-HOLD-3 | Lift | "Reaction bar: Grows from the bubble's top corner." `scale(.5) opacity 0 > none`, origin `100% 100%` (mine) / `0% 100%` (theirs). | pop | Fade 120 ms | Replay `hold`, `react`. |
| MOT-HOLD-4 | Lift | "Menu: Unfolds from the bubble's bottom edge, 0.8 > 1." `scale(.8) opacity 0 > none`, origin `100% 0` / `0 0`. | lift | Fade 120 ms | Replay `hold`, `holdseen`. MC-03 samples "menu". |
| MOT-HOLD-5 | Lift | "A 14 px blur and a scrim fade in. The blur is set once and never animated." Only the layer opacity animates (0 > 1). | smooth | Scrim only | Replay `hold`. |
| MOT-HOLD-6 | Scrim tap / Escape / pick | "The bubble settles back; the bar and menu shrink toward it." Bar `opacity 1 > 0, scale .6`, menu `scale .85`, both 160 ms live; scrim opacity 1 > 0, 280 ms `--ch-ease`; the lifted copy returns `transform > none` (live start) on settle; on end the real row is shown again and focus returns to the bubble. Reopening while the last close is still running reuses the live lift transform and scrim opacity. | settle | Fade 120 ms | Replay `hold`. MC-03, MC-04. |

## Reactions (MOT-RX)

| ID | Trigger | What moves | Spring / timing | Reduce Motion | Test note |
| --- | --- | --- | --- | --- | --- |
| MOT-RX-1 | A reaction is added | "Scale 0.4 > 1 from the bubble's corner, with one small overshoot." Origin `0% 100%` on your bubble, `100% 100%` on theirs; only for the badge just added. | pop | Appears | Replay `react` (Love via the lift). |
| MOT-RX-2 | Count changes | "The number changes at once; only the badge moves. No count-up." | None | Same | Replay `react`. |
| MOT-RX-3 | Double-tap / double-click | "Toggles Like on the message under your finger." The press is the same `scale .97` as MOT-HOLD-1, then the badge pops. | pop | Appears | Replay `dbl`. |

## Polls (MOT-POLL)

| ID | Trigger | What moves | Spring / timing | Reduce Motion | Test note |
| --- | --- | --- | --- | --- | --- |
| MOT-POLL-1 | Tap a choice | "The ring fills and the check draws." Check disc `scale .6 > 1`; the check path's `stroke-dashoffset 20 > 0` over 260 ms `--ch-ease`. | pop; check 260 ms `--ch-ease` | Check appears | Replay `vote`. MC-08. |
| MOT-POLL-2 | Any vote | "Every bar scales to its new share together (scaleX, not width). Counts change at once." Fill `scaleX(old) > scaleX(new)`, origin left, all options at once; the poll element, if it was mid-motion, continues from its live frame. | smooth | At once | Replay `vote`. MC-08 (vote, then change it 100 ms later: the three fills must not jump). |
| MOT-POLL-3 | You vote for a choice | "Your avatar pops into the choice's stack." `scale .4 opacity 0 > none`. | pop | Appears | Replay `vote`. |
| MOT-POLL-4 | See votes | "The sheet rises on phone and scales up in place on desktop. Down is 280 ms `--ch-ease`." Phone `translateY(105%) > none` (or from the live position if a previous sheet is still leaving); desk `scale .94 opacity 0 > none`; scrim opacity 0 > 1 on smooth. Close: scrim 1 > 0 and sheet `translateY(105%)` (desk `scale .96`, opacity 0), 280 ms `--ch-ease`, from the live frame. | smooth | Fade 120 ms | Replay `votes`. MC-05 (close mid-rise, reopen: the sheet picks up exactly where the old one is). |

## Team channel and Seen by (MOT-TEAM)

| ID | Trigger | What moves | Spring / timing | Reduce Motion | Test note |
| --- | --- | --- | --- | --- | --- |
| MOT-TEAM-1 | Layout | "The name sits inside the first bubble of a run and the face beside the last. Static." | None | None | Replay `team`. |
| MOT-TEAM-2 | Someone reads your message | "Up to five faces in a paper pill under your latest message. New faces pop in as people read." New face `scale .4 opacity 0 > none`. | pop | Appears | Replay `seen`. |
| MOT-TEAM-3 | Open Seen by | "Seen with times, then Not seen yet with 'Hasn't opened this chat'." Same sheet motion as MOT-POLL-4. | smooth | Fade 120 ms | Replay `seen`, `holdseen`. |

## Attach menu (MOT-ATT)

| ID | Trigger | What moves | Spring / timing | Reduce Motion | Test note |
| --- | --- | --- | --- | --- | --- |
| MOT-ATT-1 | Tap + | "Rotates 45 degrees." Code: CSS `transform .3s cubic-bezier(.34,1.3,.64,1)` on the icon (the table names `pop`; ~300 ms). | pop | Swaps | Replay `attach`. |
| MOT-ATT-2 | Tap + | "Grows from the + button, 0.4 > 1." `scale(.4) opacity 0 > none`, origin `18px 100%`. Close: 160 ms `opacity 1 > 0, scale .7`; reopening while closing resumes from the live frame (`lift`). | lift | Fade 120 ms | Replay `attach`. MC-06 (close and reopen fast, then closed at once). |
| MOT-ATT-3 | A file is picked | "The picked file rises 12 px above the field." Chip `translateY(12px) opacity 0 > none`. The same for reply and edit chips. | smooth | Appears | Replay `file`. |

## Details and mute (MOT-DET)

| ID | Trigger | What moves | Spring / timing | Reduce Motion | Test note |
| --- | --- | --- | --- | --- | --- |
| MOT-DET-1 | Tap the header (phone) | "Details push in like a conversation." Same as MOT-LIST-1 without an avatar flight. | smooth | Crossfade 120 ms | Replay `details`. |
| MOT-DET-2 | Tap the header (desktop) | Default per Q-27: implement as drawn with one owner-approved exception to `clubhouse/no-layout-motion` recorded in the css baseline; if declined, slide the panel by transform and let the thread snap width. "The 300 px column itself opens on the smooth spring, so the thread narrows with it and stays on the latest message. The one layout animation in Messages: a column can't appear by transform without the thread snapping width. Close mid-open and it turns around where it is." Code: CSS `transition: grid-template-columns 462ms <smooth linear()>` on the canvas grid (a CSS transition retargets from where it is); the panel content is pinned to its right edge; the thread is re-pinned to the latest message every frame for `462 + 40` ms. | smooth | Opens at once; panel crossfades 120 ms | Replay `details`. MC-10 (close at 150 ms, reopen at 120 ms later, close again: details panel, latest message and composer boxes must not teleport). |
| MOT-DET-3 | Choose a mute length | "A menu with For 8 hours, For a week and Until I turn it on. The quick action turns green." Menu `scale .8 opacity 0 > none` from its anchor, out by 160 ms fade; the quick action `scale .92 > none` on pop. | lift | Fade 120 ms | Replay `mute`. |

## Empty states and new message (MOT-EMP)

| ID | Trigger | What moves | Spring / timing | Reduce Motion | Test note |
| --- | --- | --- | --- | --- | --- |
| MOT-EMP-1 | Open with no conversations | "A still card. Nothing loops on an empty screen." | None | None | Replay `empty-first`. |
| MOT-EMP-2 | Pick a person | "A picked name becomes a green token, 0.8 > 1, then the conversation opens." Token `scale .8 opacity 0 > none`; 520 ms wait (200 ms under Reduce Motion); then the thread page fades in over 220 ms (desktop pane swap); other suggestions dim to .35 as you type (180 ms). | pop | Appears | Replay `empty-new`. |
| MOT-EMP-3 | Tap a starter | "Tapping a starter fills the field. It never sends by itself." The composer pill does `scale .98 > 1` on pop. | None | None | Replay `empty-fresh`. |

## Jump to latest (MOT-JMP)

| ID | Trigger | What moves | Spring / timing | Reduce Motion | Test note |
| --- | --- | --- | --- | --- | --- |
| MOT-JMP-1 | Scrolled a screen away | "Once you're a screen above the latest, it scales in from 0.6." `scale(.6) opacity 0 > none`; away again = 160 ms `opacity 1 > 0, scale .8`, then hidden. | pop | Fade 120 ms | Replay `jump`. MC-09 (away and back within 90 ms: the key must not blink or gap). |
| MOT-JMP-2 | New message while away | "The count badge appears and updates at once." Badge `scale .4 > 1` the first time it appears. | pop | Appears | Replay `jump`. |
| MOT-JMP-3 | Tap the key | "Scrolls to the latest on a spring, not a jump cut." JS scroll glide sampled from the `reveal` curve (941 ms in the artifact) toward the live bottom (computed from layout only, not `scrollHeight`, which a running glide inflates); a wheel, touch or pointerdown on the thread stops it. | reveal | At once | Replay `jump`. |

## Motions drawn in the artifact's code only (MOT-X)

| ID | Trigger | What moves | Timing | Reduce Motion | Source |
| --- | --- | --- | --- | --- | --- |
| MOT-X-1 | Date pill near a day marker | Opacity follows the scroll: `k = min(1, near / 20)`; transitions off while `.linked` | scroll-linked | same | `onScroll` `PILL_GAP` |
| MOT-X-2 | Segmented thumb | `translateX((100% + 4px) * i)` | 360 ms `cubic-bezier(.34,1.3,.64,1)` | none (jumps) | `.segw__thumb` |
| MOT-X-3 | Desktop hover bar | opacity 0 > 1, `translateY(4px) scale(.96)` > none | opacity 160 ms; transform 220 ms `--ch-ease` | none | `.hoverbar` |
| MOT-X-4 | Toast | In: `translateY(-8px) scale(.96) opacity 0 > none` on pop. Out after 1.7 s: opacity 200 ms. A newer toast fades the old in 120 ms. | pop / 200 / 120 | fade | `toast()` |
| MOT-X-5 | Sheet open/close | See MOT-POLL-4; scrim fade on smooth in, 280 ms `--ch-ease` out; reopen while leaving picks up the live scrim opacity and sheet position | smooth / 280 ms | fade | `openSheet`, `closeSheet` |
| MOT-X-6 | Sheet drag (phone) | Follows the finger from the grabber or header; release past one third of the sheet height or faster than 0.5 px/ms closes (280 ms `--ch-ease` from where it is; ruling 24: a flick uses `chThrownExit`); otherwise settles on smooth; pulling up rubber-bands `-sqrt( \| dy \| ) * 2.2`; scrim opacity =`1 - dy / height` | gesture + smooth / 280 ms | none | `wireSheetDrag` |
| MOT-X-7 | Switch (poll form) | Knob `translateX(18px)` 320 ms `cubic-bezier(.34,1.3,.64,1)`, track colour 250 ms | 320 / 250 ms | none | `.mute-sw` |
| MOT-X-8 | Row context menu | Same as MOT-DET-3's menu | lift / 160 ms | fade | `popMenu` |
| MOT-X-9 | Edit saved | Edited bubble `opacity .4 > 1` | 260 ms `--ch-ease` | n/a | `send()` edit branch |
| MOT-X-10 | Delete message | Row `opacity 1 > 0, scale .92` 180 ms fill forwards, then the list re-renders and glides on smooth | 180 ms + smooth | n/a | `menuAction` delete |
| MOT-X-11 | Desktop conversation switch | Thread content `opacity 0 > 1, translateY(6px) > 0`, 260 ms; the selected rail row updates | 260 ms `--ch-ease` | n/a | `openConv` |
| MOT-X-12 | New message form | Desktop: form fades 200 ms; phone: push (MOT-LIST-1) | 200 ms / smooth | n/a | `startNew` |
| MOT-X-13 | Interrupt carry | While a row re-renders, anything still moving (`.b`, `.poll`, `.typing`, reaction badge, seen face) continues from its live frame on the new element on its own spring (`CARRY`). Interrupts never jump. | spring of origin | n/a | `snapCarry`/`playCarry` |
| MOT-X-14 | Press feedback (demo) | `scale .97` 110 ms down, 280 ms release | `--ch-ease` | none | `pressOn` |
| MOT-X-15 | Skeleton pulse | opacity 1 > .55, 1.4 s ease-in-out infinite | loop | stops | `.sk__av, .sk__l` |
| MOT-X-16 | Caret blink (To field) | `steps(1)` 1 s | loop | n/a | `.to .caret` |
| MOT-X-17 | Desktop selected-row / press wash | no animation (background change) | none | none | `.cv:active, .cv.is-sel` |

## Keyboard and Reduce Motion (MOT-KB, MOT-R)

- MOT-KB-1 Real keyboard (not the artifact's fake): `keyboardWillShow` sets
  `--keyboard-height` and `body.keyboard-open`; composer and jump rise by that
  height on 480 ms `cubic-bezier(0.32, 0.72, 0, 1)`; the list follows by the
  same amount; the latest message stays above the field if you were at the
  bottom; keyboard down reverses on the same curve. Phone only; desktop has
  none.
- MOT-KB-2 Keys light on press (`is-down` 120 ms) and show a key pop: DEVICE
  SIMULATION, do not build.
- MOT-R-1 Under Reduce Motion: zero motion except 120 ms crossfades (the
  artifact: `duration: 120, easing: linear`). The shared app helper is
  `CH_FADE_MS = 180` (0.18 s, `lib/motion.ts`), and ruling 25 says call the
  shared helper; the HTML says 120 (Q-05).
- MOT-R-2 Loops stop: typing dots hold still at opacity 1 (keeps the 3:1 mark),
  skeleton pulse stops, caret keeps blinking.
- MOT-R-3 Hold: the press scale is skipped; the lift appears in place.
- MOT-R-4 Jump / springScroll: scroll jumps at once (`S.reduce || |to - from| <
  2`).
- MOT-R-5 Desktop details column: opens at once, panel crossfades 120 ms
  (`wsMotion` sets transition none).
- MOT-R-6 Send: the new bubble crossfades `opacity 0 > 1` (launch spring's 120
  ms rule); no flight, no clone, no arrow motion; the thread moves at once; the
  receipt appears.

## Acceptance cases: the artifact's own motion check (`#motion-check`)

The check runs every interrupt and overlap case through the real engine in a
real browser, samples the on-screen box of each moving thing every frame and
fails a case on any teleport (a one-frame speed spike: displacement > 10 px
and > 3 x the larger neighbouring speed, floor .05), a flicker (gone for a
frame, or
an opacity blink > .45 and > 3 x its neighbours), or, under Reduce Motion, any
glide (two consecutive frames each moving > .5 px). It must run in a HEADED
browser at 60 Hz or better (SETTLED: headless containers drop frames and fail 2
or 3 cases that the page passes; the page's own run was 11 of 11 clean in Chrome
156 on the Mac). The build must pass the equivalent for its own components.

| Case | Device | Covers | What is sampled |
| --- | --- | --- | --- |
| MC-01 Send twice, 140 ms apart | phone | MOT-SEND-6, 7, 9 | first bubble, older message, second bubble, 1400 ms |
| MC-02 A reply lands while yours is still rising | phone | MOT-SEND-7, 9, 12, MOT-THR-4 | your bubble, older message, 2000 ms (reply at 120 ms) |
| MC-03 Hold, then let go mid-lift | phone | MOT-HOLD-2, 4, 6 | held bubble, menu, 1100 ms (open, close at 90 ms) |
| MC-04 Hold again while it settles | phone | MOT-HOLD-2, 6 | held bubble, 1400 ms (open, close at 420 ms, reopen 70 ms later) |
| MC-05 Votes sheet: close mid-rise, reopen | phone | MOT-POLL-4, MOT-X-5 | the sheet, 1500 ms |
| MC-06 Attach: close and reopen fast | phone | MOT-ATT-1, 2 | attach menu, 900 ms |
| MC-07 Back pressed mid-push | phone | MOT-LIST-1, 2 | conversation list page, thread page, 1200 ms (back at 170 ms) |
| MC-08 Vote, then change it 100 ms later | phone | MOT-POLL-1, 2 | the three option fills, 1100 ms |
| MC-09 Jump key: away and back quickly | phone | MOT-JMP-1 | the key, 900 ms |
| MC-10 Desktop details: close mid-open, reopen | desktop | MOT-DET-2 | details panel, latest message, composer, 1500 ms |
| MC-11 Reduce Motion: send and a reply | phone | MOT-R-6 | your bubble, 1400 ms; no glides, no gaps |

Row count check: MOT table rows 5 + 4 + 12 + 6 + 3 + 4 + 3 + 3 + 3 + 3 + 3 = 49;
springs 7; extras MOT-X 17; keyboard/reduce 8.
