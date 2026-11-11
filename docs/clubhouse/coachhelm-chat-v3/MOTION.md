# CoachHelm chat v3: every movement (10 Nov 2026)

`SPEC.md` beside this file is the states and content; this is how each one arrives, changes and leaves. One table per
moment. Columns: trigger; what moves; property; from and to; duration and easing (a token or a named spring, never a
raw value); delay or stagger; what interrupts it and how; Reduce Motion; haptic; why this motion exists. A motion
that cannot answer "why" is not in this file, and is not built.

## The benchmark

The owner's bar (10 Nov): "insanely good. Like ChatGPT, Claude interface but better". What they do, what ours does,
and why that is equal or better. "Measured" means in WebKit through the harness; the rest is built and watched.

| Moment | ChatGPT / Claude | Ours | Why equal or better |
| --- | --- | --- | --- |
| Send | The bubble appears at the bottom; the page scrolls it up | The bubble leaves the thing touched (field, start, follow-up) and takes the top of a fresh page in one spring (MO-3-4) | Shows where the question came from; the answer then grows into space that is already there |
| The wait | A pulsing dot or a shimmering "Thinking" | Never a bare "Thinking": the wait names what is being done; real work raises the activity island (MO-4-I1 to I9) | Says a fact, and the fact is an engine event |
| Tool use | A collapsed "Searched…" line that can be expanded after the fact | The island: each step alive, then done with what it found, faces and a tally joining as they are read; a finished step opens its read while the rest continues and while the answer streams | The work is legible and usable while it happens, not only afterwards |
| Text arriving | Words appear in bursts; the page follows the last line | **Smoothed reveal (chosen 10 Nov, `chat/reveal.ts`)**: the stream fills a backlog and a frame clock releases it in whole words at a rate that follows the backlog (cleared in about 200 ms, never slower than 40 characters a second); each word fades in once; nothing is held once the stream ends. The text never moves once painted and nothing follows (Rule P); half-written markdown is held back | Measured below: words land one at a time every 10 to 20 ms instead of 5 to 21 at a time every 80 ms, at the same frame cost |
| Scroll while streaming | Auto-follow that the reader fights | The page does not move; a Latest key appears only when there is more below | The reader keeps their place by doing nothing |
| A chart | Renders when ready, pushing text | Complete at first paint, in its own place; only its frame fades (Q-153) | No skeleton to disbelieve, no growth to wait for |
| Acting in the app | Not offered, or a tool result as text | A preview card, Confirm, an honest 8 s hold with a ring that is the server's clock, Undo, then the receipt on the card (Moment 7) and the row landing in the page (Moment 8) | Product-only; nothing is written until the coach has seen it |
| Stop / failure | Stop leaves a cut sentence; errors are a red banner | Stop is silent and says so on the turn; a failure keeps what arrived and says what to do in one amber line | The turn is the record of what happened |
| Reduce Motion | Mostly unchanged | Every arrival is a fade, loops stop, the island's ring is still, the plate takes its size at once | Designed, not defaulted |

**The reveal, measured** (WebKit, phone 390x844, through the harness; "burst" paints each 50 ms flush as it arrives):

| Stream | Reveal | Frames | Slowest frame | Over 25 ms | Frames in which words landed | Words per landing, median (max) | Gap between landings, median / p95 / max | Variation per 100 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Long answer, real pace (390 words, 7.1 s) | burst | 713 | 19 ms | 0 | 80 | 5 (7) | 80 / 99 / 324 ms | 0.58 |
| same | smoothed, run 1 | 684 | 149 ms | 5 | 362 | 1 (8) | 19 / 40 / 242 ms | 0.33 |
| same | smoothed, run 2 | 709 | 16 ms | 0 | 374 | 1 (2) | 20 / 40 / 70 ms | 0.30 |
| Lumpy, worst pace (179 words in bursts of 6 to 22, 1.4 s pauses) | burst | 407 | 15 ms | 0 | 14 | 12 (21) | 88 / 1479 / 1479 ms | 1.67 |
| same | smoothed | 404 | 12 ms | 0 | 133 | 1 (4) | 10 / 61 / 811 ms | 1.29 |

Chosen: smoothed. It turns a stream that lands in clumps into one that is read as it is written, and on an uneven
connection it fills almost half of each stall with words that had already arrived. Run 1's slow frames (one of
149 ms) did not recur in run 2 or in the lumpy run and came while other captures were compiling on the same machine;
they are recorded here because they were seen, and the budget below is the test that will catch them if they are
the reveal's. `setRevealMode('burst')` is the way back.

**Frame budget, stated:** while a long answer streams with a chart on the page, no frame over 33 ms and no more than
1 in 100 over 25 ms on the phone viewport in WebKit; the island's open and fold lay nothing out (transforms on five
layers). Measured 11 Nov, the whole-team turn (`isl-team`, real pace, phone, light on, smoothed reveal): 730 frames, median
10 ms, p95 11 ms; the 50 frames after the island opened and after it folded peaked at 13 ms and 12 ms with none over
25 ms. One frame of 42 ms elsewhere in that turn, so the budget's "none over 33 ms" was missed once in that run;
which change caused it is not established.

## The grammar

**What motion is for here.** Four jobs, and only these: where something came from (the question out of the field,
the reads out of the work line), what it belongs to (the chip to its sentence, the receipt to its card), what just
changed (a row to done, a draft to saved), and what happens if the coach does nothing (the ring).

**Values.** All from `src/clubhouse/styles/tokens.css` and `src/clubhouse/lib/motion.ts`.

| Name | Token / constant | Value | Used for |
| --- | --- | --- | --- |
| quick | `--ch-dur-quick`, `CH_FADE_MS` | 180 ms, `--ch-ease` | small fades; every Reduce Motion fade |
| base | `--ch-dur-base` | 260 ms, `--ch-ease` | a row, a notice, a foot row arriving |
| word | `--ch-dur-word` | 320 ms, `--ch-ease` | a burst of streamed words |
| press | `--ch-dur-press` / `--ch-dur-release` | 110 ms down to 0.97, 280 ms back | every pressable (`data-ch-press`, `ui/Button`) |
| smooth | `--ch-ease-spring-smooth` / `chSpring('smooth')` | 462 ms, no bounce | sheets, panels, the evidence panel, the shared push |
| settle | `--ch-ease-spring-settle` | 417 ms | a card or row coming to rest |
| pop | `--ch-ease-spring-pop` | 496 ms, one small overshoot | small things arriving: the stop glyph, a badge, the check disc |
| send | `--ch-ease-spring-send` | 700 ms | the thread making room |
| launch | `--ch-ease-spring-launch` | 812 ms, one soft overshoot | the question rising |
| pour | `--ch-ease-spring-pour` | 742 ms | quick chat out of the key |
| sheet | `--ch-ease-sheet` + `--ch-dur-keyboard` | 480 ms | anything that rides the iOS keyboard |
| shimmer | `--ch-dur-shimmer` | 1.9 s loop | a running read's label; one turn of the mark |
| breath | `--ch-dur-reveal`, alternate | 520 ms each way | the live dot |
| live | `--ch-dur-live` | 2.8 s | the mark on a row that just landed |
| sweep | `--ch-dur-sweep`, `--ch-ease-io` | 900 ms a pass | a button working |
| underlay | `CH_UNDERLAY_SHIFT` | 24% | the scrim behind quick chat; the page behind a push |

No new token is requested. Thresholds that are not motions (300 ms hold-back, 400 ms minimum life, 1.2 s, 6 s, 20 s)
are named constants in `src/clubhouse/screens/coachhelm/chat/turn-timing.ts`.

**Rules.**

- Transform and opacity only. Two documented exceptions, both paint-only on a mark under 24px with no layout: the
  countdown ring's `stroke-dashoffset`, and a check's `stroke-dashoffset` as it draws. The label shimmer moves
  `background-position` on clipped text (paint-only, existing). Nothing animates width, height, top, left, margin,
  padding, grid or `clip-path`.
- A height change is one frame, and happens only where nothing being read sits below it, or because the coach tapped.
- Everything is interruptible. A script motion is a WAAPI effect that reads the node's current transform and opacity
  before it starts (the quick chat hook's `hold()`), or is added with `composite: 'add'` (the thread's glide), so a
  second trigger continues from the frame on screen. A CSS transition reverses from its current value by itself.
  Nothing queues; nothing snaps.
- Related things move together; a consequence follows its cause by one beat (120 ms, `--ch-dur-press` rounded: the
  constant `BEAT_MS` in `turn-timing.ts`). No decorative stagger.
- Speed first: nothing that will last under 300 ms is shown; anything shown stays long enough to be read (SPEC,
  Moment 4).
- Reduce Motion (`useChMotionMode() === 'fade'`): every arrival is an opacity fade at `CH_FADE_MS`; nothing
  travels, nothing scales; loops stop (the dot is still, the mark does not turn, the shimmer is off); the ring still
  drains (it is information). `data-motion='off'`: no fades either.
- Haptics (`lib/haptics.ts`, iPhone app only): send `press`; Stop none (an existing decision, CH-13421: Stop is silent); Confirm `press` (the Button's own); the
  hold beginning: none; saved `success`; Undo `warning`; a failed write or turn `error` (once per failure); a chip or
  the work line `select`. Never on a token, a read, or an answer finishing.

**Check for every row:** `document.getAnimations()` in the preview lists the running effects; each must name only
`transform`, `opacity` (or the two exceptions). The harness URL for each moment is in the build report.

---

## Moment 1. Summoning and dismissing quick chat (QUICK-CHAT builds)

The geometry and the retarget logic are `design-refresh/coachhelm/07-MOTION.md` rows M-KEY-press, M-OPEN, M-SCRIM,
M-CONTENT, M-CLOSE, M-RETARGET, M-LIVE, M-LIVE-out, M-FULL: kept as written. v3 adds or changes:

| ID | Trigger | What moves | Property | From > to | Duration, easing | Delay | Interrupted by | Reduce Motion | Haptic | Why |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MO-1-1 (M-OPEN) | Key tap, Cmd/Ctrl+J | panel | `transform: scale`, origin the key's centre; `opacity` | scale(.5) > none; 0 > 1 | pour 742 ms; opacity 90 ms linear | none | a close: MO-1-4 from the live frame (M-RETARGET) | opacity only, quick | `press` on the tap | It comes out of the key the coach pressed, so they know where it lives and where it will go back to |
| MO-1-2 | same frame | scrim over the page | `opacity` | 0 > 0.24 | smooth 462 ms | none | reverses from its value | quick | none | The page stays readable at 24%: the coach keeps their place; the chat is over it, not instead of it |
| MO-1-3 | same frame (iPhone) | panel's rest frame; composer | `transform: translateY` | the panel rests where the keyboard will leave it; if the keyboard height is unknown it rides `--keyboard-height` | sheet 480 ms (the keyboard's own curve) | none | the keyboard dismissing: same curve, reversed | panel placed at once | none | The keyboard and the panel are one arrival. A panel that settles and is then shoved up by the keyboard is two motions for one act |
| MO-1-4 (M-CLOSE) | scrim tap, Escape, key, Back | panel; scrim | `transform: scale`; `opacity` | live > scale(.5), 0 | 220 ms `--ch-ease-sheet` (as M-CLOSE) | none | an open: MO-1-1 from the live frame | opacity, quick | none | It returns to the key |
| MO-1-5 | drag down on the panel (phone) | panel | `transform: translateY` then MO-1-4 | follows the finger 1:1 from the grab point; release past 30% of its height or faster than 0.5 px/ms closes, else returns | return: settle 417 ms with the release velocity | none | a second touch takes over from the live frame | follows the finger; return is instant | `commit` when it closes by drag | Direct manipulation: the panel is a thing the coach can put away |
| MO-1-6 | panel opens with a context | context chip | `opacity`, `transform: translateY` | 0 > 1; 6px > 0 | base 260 ms | with M-CONTENT | none | quick | none | It arrives with the composer it belongs to: it is part of what will be sent |
| MO-1-7 | remove key on the chip | chip | `opacity`, `transform: scale` | 1 > 0; 1 > .9 | quick 180 ms | none | none | quick | `select` | It leaves from where it was; nothing else in the composer moves (its row keeps its height until the next send) |

## Moment 2. The empty start

| ID | Trigger | What moves | Property | From > to | Duration, easing | Delay | Interrupted by | Reduce Motion | Haptic | Why |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MO-2-1 | Ask opens on the home | nothing | none | Drawn at rest at first paint | none | none | n/a | same | none | A screen the coach opens ten times a day does not perform for them. The route's own arrival is the only motion |
| MO-2-2 | press on a start | the row | `transform: scale` | 1 > .97 > 1 | press 110 / 280 ms | none | release | none | `press` on the tap | The app's press |
| MO-2-3 | first send (a start, or typed) | everything on the home except the source of the question | `opacity` | 1 > 0 | quick 180 ms | none | none; the thread replaces it when it ends | removed at once | none | The home steps back for the question; it does not slide away, because it is not going anywhere the coach can follow |
| MO-2-4 | same frame | the question | MO-3-4 with the tapped row's label (or the field's text) as its source rect | | | | | | | The question is visibly the thing the coach just touched |

## Moment 3. Composing and sending

| ID | Trigger | What moves | Property | From > to | Duration, easing | Delay | Interrupted by | Reduce Motion | Haptic | Why |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MO-3-1 | first character / field empties | send key | `opacity` | .4 <> 1 | quick 180 ms (CSS transition) | none | reverses | at once | none | The key is always in its place; only its readiness changes. (Messages hides its key; Ask's composer keeps `+`, `@` and the key as a fixed row, so nothing in the capsule shifts as the coach types) |
| MO-3-2 | a line is added or removed | field | none | height changes in one frame; the thread's floor padding changes in the same frame | none | none | n/a | same | none | Layout does not animate. The capsule grows upward over empty floor, so nothing being read moves |
| MO-3-3 | Send | send key's arrow, then the stop glyph | arrow: `transform: translateY`, `opacity`; glyph: `transform: scale`, `opacity`; the disc's two fills cross: `opacity` | arrow 0 > -14px, 1 > 0; accent disc 1 > 0 over the ink disc; square scale(.4) > 1, 0 > 1 | arrow 200 ms `CH_ARROW_EASE`; discs quick 180 ms; square pop 496 ms | square after the arrow has left: 1 beat | Stop pressed mid-change: MO-3-6 from the live values | glyphs swap at once | `press` | The arrow leaves in the direction the question goes. The key is the stop key from the frame of the tap: that is the moment its meaning changes |
| MO-3-4 | Send | the question bubble | `transform: translate scale`, origin its lower right; fill `opacity` | from the source rect (the field's text, a start's label, a follow-up chip) to its place at the top of the page; scale .96 > 1; the sent fill 0 > 1 | travel: launch 812 ms; fill 160 ms `CH_FILL_EASE` | none | a second send: the first bubble keeps its effect; the thread's glide adds (MO-3-5) | fades in place, quick | none (the key carried it) | Where it came from. The same hand as Messages' send: the words become the bubble and rise on the launch spring; here they rise to the top of an open page |
| MO-3-5 | Send | the thread (every earlier page) | `transform: translateY`, `composite: 'add'` | the distance the scroll position just jumped > 0 | send 700 ms | none | a second send adds a second glide on top; a touch on the thread cancels the glide at its live offset (the scroll position is already final, so nothing jumps) | no glide: the scroll position is set and the new page fades in, quick | none | The scroll position changes in one frame (Rule P); the glide shows the old pages going up and away instead of vanishing. The page clears for the answer |
| MO-3-6 | turn ends (done, stopped, failed) | stop glyph, then the arrow | glyph `transform: scale`, `opacity`; arrow `transform: translateY`, `opacity`; discs cross back | square 1 > .4, 1 > 0; arrow 8px > 0, 0 > 1 | square `--ch-dur-msg-key-out` 160 ms; arrow pop 496 ms | arrow after the square: 1 beat | a send in that window: MO-3-3 from the live values | swap at once | none | The exact reverse. The arrow comes back up from below, ready to leave again |
| MO-3-7 | keyboard rises or falls (iPhone) | composer; thread floor | `transform: translateY` (composer); the floor padding is set once | 0 <> -keyboard height | sheet 480 ms (`--ch-dur-keyboard`) | none | reverses on the same curve | at once | none | The composer rides the keyboard as one piece (Messages MOT-SEND-1). The thread does not re-scroll: the page is anchored at its top, and the top does not move |
| MO-3-8 | field refuses (offline, paused) | nothing | none | the toast is the shell's | | | | | `error` (existing) | No shake. A shake blames the coach for the network |

## Moment 4. Waiting and reading

| ID | Trigger | What moves | Property | From > to | Duration, easing | Delay | Interrupted by | Reduce Motion | Haptic | Why |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MO-4-1 | 150 ms after send | assistant turn's first row (mark, name) | `opacity` | 0 > 1 | quick 180 ms | 150 ms from the tap (the bubble is past the row's place by then) | the first event arriving sooner: the row is shown at once | same fade | none | The turn exists because the question was sent; it arrives after the question, as a reply does |
| MO-4-2 | the turn is live | the mark's wheel | `transform: rotate` | one spoke (45 deg) per cycle, then a hold | shimmer 1.9 s per cycle, phase shared across marks (existing `CoachMark`) | none | the turn ending: it finishes the current spoke and stops there (never snaps back) | no turn | none | The one sign that work is happening. It turns like a hand on a wheel, a spoke at a time, not like a spinner |
| MO-4-3 | 1.2 s with nothing to show | work line words ("Sending", "Reading your question") | `opacity` | 0 > 1 | base 260 ms | none | a read row or the first word: the words cross to the next state (MO-4-9) | quick | none | Words appear only when the wait is long enough to wonder about, and only say what is known |
| MO-4-4 | 6 s, 20 s | work line words | `opacity` (cross) | old 1 > 0, new 0 > 1 | quick 180 ms each, in sequence | none | as MO-4-3 | at once | none | The sentence changes; nothing new appears and nothing moves |
| MO-4-5 | a read has been running 300 ms | its row | `opacity`, `transform: translateY` | 0 > 1; 6px > 0 | settle 417 ms | none; reads that started in the same flush arrive in the same frame | finishes | opacity, quick | none | A row rises into the list from the direction the list grows. Rows that start together are one event |
| MO-4-6 | a row is running | its live dot; its label | dot `transform: scale`; label `background-position` (clipped shimmer) | dot 1 <> .6; shimmer one pass | breath 520 ms each way; shimmer 1.9 s | none | the row finishing: MO-4-7 | dot still, no shimmer | none | The live dot is the sign for "still happening" everywhere in the chat |
| MO-4-7 | `read_finished` (done), no sooner than 400 ms after the row appeared | the dot, the check, the detail | dot `opacity`; check `stroke-dashoffset`; label to the past tense and secondary ink at once; detail `opacity` | dot 1 > 0; check draws; detail 0 > 1 | dot quick 180 ms; check base 260 ms `--ch-ease`; detail base 260 ms | detail 1 beat after the check starts | finishes | check and detail appear | none | The dot becomes the check in the same place: the same mark changes state. The detail follows the check because it is what the read found |
| MO-4-8 | `read_finished` (failed) | the dot, the amber ring | `opacity` (cross) | dot 1 > 0; ring 0 > 1 | quick 180 ms | none | finishes | at once | none (the turn goes on; a failed turn is the `error` haptic's job) | No shake, no flash. It states a fact and the answer deals with it |
| MO-4-9 | first word of the answer | the read list; the work line | rows `opacity`; then the list is removed in one frame; summary `opacity` | rows 1 > 0; summary 0 > 1 | rows 140 ms (`--ch-dur-msg-time`); summary quick 180 ms | summary with the rows' fade; the first words paint when the rows are gone (at most 140 ms after they arrived) | a tap on the work line during the fade: the list stays open | list removed at once; summary appears | none | The reads fold into the line that counts them. Nothing is under the list, so removing it moves nothing; the answer starts under the name, where it will stay |
| MO-4-10 | tap the work line (a folded turn) | the read list | `opacity`, `transform: translateY` | 0 > 1; -4px > 0 (it comes out of the line above it) | base 260 ms | none; the answer below moves down in one frame (the coach asked) | a second tap: reverses, then the list is removed | quick | `select` | The coach's own act may move the text; the list comes from the line that summarised it |
| MO-4-11 | a read starts after the answer has begun | work line | `opacity` (cross) | summary > running label (live dot before it) > new summary | quick 180 ms each way | 300 ms hold-back as MO-4-5 | as MO-4-3 | at once | none | A late read is said in the one place status lives; the text is not touched |

### The activity island (supersedes MO-4-5 to MO-4-11 in Ask; they stand for quick chat's inline list)

| ID | Trigger | What moves | Property | From > to | Duration, easing | Delay | Interrupted by | Reduce Motion | Haptic | Why |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MO-4-I1 | the island is earned (2 steps, or 1 still running at 600 ms) | the island, one line; the phone's scope line | island `opacity`, `transform`; scope line `opacity` | 0 > 1, -6px and 0.9 > rest; scope 1 > 0 | spring pop; scope quick 180 ms | none | finishes | fade | none | It drops out of the bar it hangs from. The scope line gives its place to the thing now doing the reading |
| MO-4-I2 | open (by itself for a big job on an empty page; or a tap) | the plate's middle and bottom cap; the clip over the steps; the list (counter-move); the open shadow; the chevron | `transform: scaleY`, `translateY` (four layers on one clock); shadow `opacity`; chevron `rotate` | one line > the steps' measured height; 0 > 1; 0 > 180 deg | spring smooth 462 ms; shadow and chevron base 260 ms | an island that arrives open is drawn as one line for one frame first, so it is seen to open | a tap or a height change mid-move: all four retarget from where they are, still equal | size at once; list fades | `select` on a tap, none by itself | A shape change, never a height animation: nothing is laid out, and the steps stay where they are while the edge passes over them |
| MO-4-I3 | a step joins | its row; the plate | row `opacity`, `translateY` 6px > 0; plate as I2 to the new height | | settle 417 ms; plate spring smooth | none; steps that start together arrive together | finishes | fade | none | The list grows from the direction it grows in; the plate follows its content, it does not lead it |
| MO-4-I4 | a step is running | its ring | `transform: rotate` | one turn | sweep 900 ms, linear, for as long as it runs | none | the step finishing: I5 | no turn; the open ring is the sign | none | The ring is the step's own clock hand. One animation for the mark's whole life, so it never restarts |
| MO-4-I5 | a step finishes (**the signature beat**) | the ring, the check, the mark | ring `stroke-dashoffset` (the documented stroke exception, as the hold's ring) closes while still turning; check draws inside it; the mark swells once; 600 ms later the ring steps back to 45% | open > closed; check 0 > drawn; scale 1 > 1.16 > 1 | ring base 260 ms; check base 260 ms; swell word 320 ms `--ch-ease-io` | check and swell one quick (180 ms) after the ring starts to close | finishes | check and closed ring appear | none per step (a held success haptic is the turn's) | The thing that was working becomes the thing that is done, in the same place. No swap, no pop-in of a different icon |
| MO-4-I6 | a face or name is found; the tally grows | the face; the digits | face `opacity`, `scale` 0.5 > 1; digits change in place (tabular) | | spring pop | each on its own event | finishes | fade | none | What the work touches is shown as it is touched. Digits never roll or re-fade: a count is read, not watched |
| MO-4-I7 | the line's words change | the new words | `opacity`, `translateY` 3px > 0 | | base 260 ms | none; " and 2 more" changes in place without a new fade | the next change | quick fade | none | A change of activity is a new line arriving, not letters swapping |
| MO-4-I8 | first word of the answer; or a tap, Escape, a press elsewhere | I2 reversed; the list | list `opacity` 1 > 0, then the plate | | list quick 180 ms; plate spring smooth | none | a tap: reverses from where it is | size at once | `select` on a tap | It gets out of the way of the words in the frame they begin |
| MO-4-I9 | 6 s after the work finished, or the next send | the island; the scope line; the turn's line | island `opacity`, `scale` > 0.96; scope 0 > 1; the summary on the turn's line 0 > 1 | | quick 180 ms each | the summary after the island has gone | opening it: it stays | fades | none | The summary goes home to its turn, where it is the way back |
| MO-4-I10 | work is live and the light is switched on (`setWaitLight`; off by default until the owner has seen both) | one soft band across the island's line | `transform: translateX` on its own layer, clipped to the line | off the left edge > off the right | live 2.8 s per pass, `--ch-ease-io`, resting a fifth of the pass at each end | none | the work ending: the band is removed with the live state | not drawn; the still form is the open ring | none | The wait has life without a second spinner: light crosses the thing that is working. It is a transform, where the older shimmer on the words is paint |

Rejected: a pill that changes width with its words (every label change would be a layout or a second morph: the
plate keeps the column's width, as the owner's reference does); animating `height` or `clip-path` (not on the
compositor in WebKit); a progress bar or a percentage (there is no honest total); a step list that stays open over
the streaming answer (it would cover the words being read); rolling digits; a shimmer on step labels (paint, and a
second sign for "running" beside the ring); pushing the thread down to make room (the first words would move).

## Moment 5. The answer arriving

| ID | Trigger | What moves | Property | From > to | Duration, easing | Delay | Interrupted by | Reduce Motion | Haptic | Why |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MO-5-1 | a burst of text is drawn (the hook flushes at most every 50 ms) | the new words of that burst, as one inline group | `opacity` | 0 > 1 | word 320 ms, `--ch-ease` | none; no per-word ticker | the next burst is its own group; a group never restarts | no fade; text is drawn a sentence at a time | none | Ink settling. A burst is one event, so it arrives as one; the fade softens the pop of a line appearing without ever moving a word. Opacity only: the line boxes are final the frame they are laid out |
| MO-5-2 | no text for 400 ms, turn live | the live dot after the last word | `opacity` in; then `transform: scale` | 0 > 1; 1 <> .6 | quick 180 ms; breath 520 ms each way | none | words arriving: the dot is removed in that frame (the words take its place) | still dot | none | "What the last line looks like while the next word is pending": the same sign as a running read. It is joined to the last word, so it never wraps to a line of its own |
| MO-5-3 | a chip's marker completes | the chip | `opacity` | as its burst (MO-5-1) | word 320 ms | none | none | none | none | A chip is a word in the sentence. It does not pop: a pop would pull the eye out of the sentence it supports |
| MO-5-4 | a visual part arrives | its frame | `opacity` | 0 > 1 | base 260 ms | none | none | quick | none | The marks are drawn in place (Q-153): readable from the first frame at any opacity above zero. The fade says "this just arrived"; nothing inside it moves |
| MO-5-5 | the answer passes the fold, or the coach scrolls up | Latest key | `opacity`, `transform: translateY` | 0 > 1; 6px > 0 | quick 180 ms | none | reaching the bottom: reverses | opacity | none | It rises from the composer it sits over. Its live dot (breath) says the answer is still being written below |
| MO-5-6 | tap Latest | the thread's scroll position | scroll (the one place scroll moves; not a transform) | to the end | `scrollTo({ behavior: 'smooth' })`; instant under Reduce Motion | none | any touch on the thread | instant | `select` | The coach asked to go there |
| MO-5-7 | `done` | mark; work line; foot row; follow-ups | mark finishes its spoke (MO-4-2); foot `opacity`; follow-ups `opacity`, `transform: translateY` | foot 0 > 1; follow-ups 0 > 1, 6px > 0, all three together | foot quick 180 ms; follow-ups settle 417 ms | follow-ups 1 beat after the foot | a send: follow-ups are removed with the page change | all appear, quick | none | The turn settles in the order a reader needs: the answer is finished (mark rests), here is what it stands on (foot), here is what you might do next (follow-ups) |
| MO-5-8 | `text_discard` | the withdrawn words | `opacity` | 1 > 0, then removed | quick 180 ms | none | new words: they wait for the removal | removed at once | none | Words that are taken back fade; they are not yanked |
| MO-5-9 | a link part arrives | its row | `opacity` | 0 > 1 | base 260 ms | none | none | quick | none | As a visual: it arrived, it is still |

Streaming is the measured case. Target: a 600-word answer at the worst-case pace (bursts every 50 ms) streams in
WebKit with no frame over 25 ms attributable to the thread, no layout animation, and no running effect other than
`opacity` on the newest groups, the dot and the mark. Finished groups hold no effect (`animation-fill-mode:
backwards`, so a finished fade leaves nothing running), and a settled turn is re-drawn as plain text with no groups.

## Moment 6. Evidence

| ID | Trigger | What moves | Property | From > to | Duration, easing | Delay | Interrupted by | Reduce Motion | Haptic | Why |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MO-6-1 | tap a chip, or "3 reads" | the chip | `transform: scale`; tint at once | press .97; selected tint on | press 110 / 280 ms | none | release | tint only | `select` | The chip stays selected while its evidence is open: the figure and its source are tied |
| MO-6-2 | same tap (phone) | evidence sheet; scrim | `transform: translateY`; `opacity` | 100% > detent; 0 > 1 | smooth 462 ms (the shared `Modal`) | none | drag or close: reverses from the live frame (shared sheet) | opacity, quick | none | The app's sheet. Evidence is a look underneath, so it rises over the thread and the thread stays where it was |
| MO-6-3 | same tap (desktop) | evidence panel | `transform: translateX`, `opacity` | 24px > 0; 0 > 1 | smooth 462 ms | none | close: reverses from the live frame | opacity, quick | none | It arrives from the side it lives on. The thread's width does not change (1440 and wider), so no line of the answer re-wraps |
| MO-6-4 | another chip while open | the panel's content | `opacity` | old 1 > 0, new 0 > 1 | quick 180 ms, in sequence | none | a third chip: the fade-out continues from its value; only the last content lands | at once | `select` | The same place, a different read: a swap, not a second arrival |
| MO-6-5 | close | sheet or panel; chip | reverse of MO-6-2 / MO-6-3; the chip's tint off at once | | down: release 280 ms `--ch-ease` (shared) | none | reopen: from the live frame | opacity, quick | none | Back to the sentence: focus returns to the chip |

## Moment 7. A task, end to end

| ID | Trigger | What moves | Property | From > to | Duration, easing | Delay | Interrupted by | Reduce Motion | Haptic | Why |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MO-7-1 | the proposal part arrives | the card, whole | `opacity`, `transform: translateY` | 0 > 1; 8px > 0 | settle 417 ms | 1 beat after the sentence that introduces it has painted (so it reads as following from it) | finishes | opacity, quick | none | The card comes out of the answer: it rises from under the sentence that proposed it. One piece, because the plan arrived as one piece |
| MO-7-2 | `decision_needed` | the card's buttons | none | Live in the same frame. If the proposal came first, the buttons were drawn disabled and become enabled at once | none | none | n/a | same | none | A button that fades in after its card invites a tap that misses. It is there or it is not |
| MO-7-3 | press on the primary | the primary | `transform: scale` | .97 and back (`ui/Button`) | press 110 / 280 ms | none | release | none | `press` | The app's press |
| MO-7-4 | Confirm tapped | Cancel; the primary's label; the sweep | Cancel `opacity`; label `opacity` (cross); sweep `transform: translateX` | Cancel 1 > 0 (keeps its box); "Add to calendar" > "Adding…"; sweep -100% > 250%, repeating | Cancel 160 ms; label quick 180 ms; sweep 900 ms a pass `--ch-ease-io` | label after Cancel | the response: MO-7-5 | fades quick; sweep is a still bar at 35% | (the press) | The button the coach pressed is the thing that is working. Its width does not change, so nothing in the card shifts |
| MO-7-5 | the held receipt arrives | the button row leaves; the receipt row arrives in its place; the badge | row `opacity` (cross, same box height reserved); ring `opacity`; badge `transform: scale` | buttons 1 > 0; receipt 0 > 1; ring drawn full; badge "Draft" > "Holding", scale .7 > 1 | quick 180 ms each, in sequence; badge pop 496 ms | none | Undo at any point from the first frame the row is visible | at once | none | The receipt takes the place of the buttons that caused it. Nothing below the card moves: the row's height is the button row's |
| MO-7-6 | the hold | the ring; the seconds | ring `stroke-dashoffset` (exception); the number changes at once each second | full > empty over exactly the time left when it arrived | linear, the server's time left (8 s at most) | none | Undo: MO-7-7. "Save now and open": MO-7-9. Leaving and returning: redrawn from the time left | the ring still drains (it is information, not decoration); the number as normal | none | This is what happens if the coach does nothing, drawn as time. Linear because it is a clock. The number makes it readable at a glance and to someone who cannot see a ring drain |
| MO-7-7 | Undo | the ring; the line; the badge; the draft | ring `opacity`; line `opacity` (cross); badge pop; draft `opacity` | ring stops at its value, 1 > 0; "Not saved yet…" > "Undoing…" > "Undone. Nothing was saved…"; badge > "Undone"; draft 1 > .55 | quick 180 ms each; badge pop 496 ms | none | a failed Undo: the line crosses to "Couldn't undo that. Try again." and the ring resumes from the server's time left | at once | `warning` on the tap | Stopping the clock is the act; the ring freezing where it was is the proof it was stopped in time |
| MO-7-8 | the ring reaches zero and no result within 300 ms | the line | `opacity` (cross) | > "Saving…" | quick 180 ms | 300 ms | the result: MO-7-9 | at once | none | Shown only if the wait is real |
| MO-7-9 | the final receipt (saved) | ring > check; badge; "Open"; the draft's place | check disc `transform: scale`, `opacity`; check `stroke-dashoffset`; badge pop; "Open" `opacity`; the pending place becomes solid (`opacity` cross) | disc scale(.6) > 1 where the ring was; check draws; badge > "Added"; Undo 1 > 0, Open 0 > 1 in the same box | disc pop 496 ms; check base 260 ms `--ch-ease`; others quick 180 ms | check 1 beat after the disc | none | all appear, quick | `success` | The ring becomes the check: the countdown ends in the thing it was counting down to. It is the only overshoot in the card, on the moment the write is real |
| MO-7-10 | the receipt names who was told | the "Told" line | `opacity`, `transform: translateY` | 0 > 1; 6px > 0 | base 260 ms | 1 beat after the check | none | quick | none | A consequence of the save, so it follows it. One line, one fact: no per-player animation the data cannot back |
| MO-7-11 | a failed write | ring or buttons > amber mark and reason; Try again | `opacity` (cross) | | quick 180 ms | none | none | at once | `error` | No shake. The reason and the way to recover arrive together, in the card |
| MO-7-12 | Cancel, or superseded by a new question | buttons; the draft; the line | buttons `opacity` 1 > 0; draft `opacity` 1 > .55; line 0 > 1 | | quick 180 ms | none | none | at once | none | The draft steps back; it is not removed (it is the record of what was offered) |
| MO-7-13 | a card drawn from a stored thread | nothing | none | at rest | | | | | | Coming back is not an event |

The old staged fill (`.conf.is-fill`: fields rising 260 ms apart, the write-head bar, worked-out pills popping 70 ms
apart) is removed: it staged data that had already arrived and held the Confirm button back by over a second.
The draft's flight to its row (`ask-flight.ts`, M-ASK-45) is kept for MO-7-9 only where the card shows the row it
lands in, and runs on smooth.

## Moment 8. The action landing in the screen (QUICK-CHAT builds)

| ID | Trigger | What moves | Property | From > to | Duration, easing | Delay | Interrupted by | Reduce Motion | Haptic | Why |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MO-8-1 | the hold begins, on the thing's home page | the pending row in the page behind | `opacity`, `transform: scale` | 0 > 1; .98 > 1 | settle 417 ms | 1 beat after MO-7-5 | Undo: MO-8-4 | opacity, quick | none | The page shows where it will be before it is saved, in the pending look, so the saved row is not a surprise |
| MO-8-2 | saved | the panel; the row | panel: MO-1-4 (unless the composer has text or focus moved to it since Confirm); row: pending look > real (`opacity` cross), then the mark | mark tint 0 > 1 in quick 180 ms, holds, then 1 > 0 | mark out: live 2.8 s `--ch-ease` | the mark starts as the panel passes half way | reopening the chat: the mark keeps running | mark appears and fades by opacity (it is opacity already) | `success` (MO-7-9's; not a second one) | "The page behind is the proof." The chat gets out of the way of what it made, and the eye is led to it once |
| MO-8-3 | saved, row off screen | the page's scroll position | scroll | to the row, centred | smooth scroll; instant under Reduce Motion | before the panel closes | a touch | instant | none | The proof has to be on screen to be proof |
| MO-8-4 | Undo | the pending row | `opacity`, `transform: scale` | 1 > 0; 1 > .98 | quick 180 ms | none | none | opacity | (MO-7-7's) | It leaves the way it came |
| MO-8-5 | "Open" on an Ask receipt | route push; the row | the shared push (462 ms smooth, page behind -24%); then MO-8-2's mark | | | mark starts when the push ends | Back: the shared reverse | crossfade quick | `press` | One way of landing, wherever it started |

## Moment 9. Coming back

| ID | Trigger | What moves | Property | From > to | Duration, easing | Delay | Interrupted by | Reduce Motion | Haptic | Why |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MO-9-1 | quick chat reopened the same day | the panel (MO-1-1); the thread inside it | thread: none | at rest, at the bottom of its last page | | | | | | The conversation is where the coach left it; only the panel moves |
| MO-9-2 | "Open in Ask" | panel MO-1-4; Ask pushes in (M-FULL) | shared push | | 462 ms smooth | same frame | Back reverses the push; the panel stays closed | crossfade quick | `press` | The chat grows from a panel into the full screen without the thread changing under the coach |
| MO-9-3 | a saved thread opens in Ask | the conversation column | `opacity` (the view switch's dim, existing) | .5 > 1 when the thread lands | quick 180 ms | none | another chat chosen: the last choice wins | same | `select` | The switch is acknowledged at the tap; the thread arrives at rest |

## Moment 10. When it goes wrong

| ID | Trigger | What moves | Property | From > to | Duration, easing | Delay | Interrupted by | Reduce Motion | Haptic | Why |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MO-10-1 | the turn fails or is stopped | the turn notice | `opacity`, `transform: translateY` | 0 > 1; 6px > 0 | base 260 ms | none | none | opacity, quick | `error` once (none for Stop: the coach did it) | It arrives at the end of the turn it belongs to. What arrived before it does not move, dim or disappear |
| MO-10-2 | same frame | the mark; the live dot; the work line | mark finishes its spoke; dot removed; work line crosses to the summary or to nothing | | quick 180 ms | none | none | at once | none | Everything that said "still happening" stops saying it at once |
| MO-10-3 | the device comes back online | the notice's sub-line; Try again | `opacity` (cross) "Back online."; the button enables at once | | quick 180 ms | none | going offline again: crosses back | at once | none | The change is said where the coach is looking; nothing retries by itself |
| MO-10-4 | Try again | the notice, and whatever the failed attempt drew | `opacity` | 1 > 0, then removed; the turn's first row stays and its mark turns again | quick 180 ms | none | none | removed at once | `press` | The page does not move: the question is where it was, the turn restarts under it |
| MO-10-5 | a card's Confirm was lost | the card's button row | `opacity` (cross) | busy > the sentence and Try again | quick 180 ms | none | none | at once | `error` | The draft is still the draft; only its foot changes |

## Moment 11. The player's Ask

No motion of its own. Every row above applies to a player's turn except Moment 7 and Moment 8, which a player never
reaches. `ST-11.out`'s card keeps its existing arrival (rise, base) and "Request more" follows it by the existing
delay.

## What is deliberately not animated

| Thing | Why it is still |
| --- | --- |
| Text after it is painted | Reading. No slide, no typewriter, no follow-scroll |
| The thread's scroll position while an answer streams | Rule P. The only scroll motions are the coach's own, MO-3-5's glide (a transform over a scroll position already set) and MO-5-6 |
| Heights (field, list, card, panel) | Layout is not a motion. One frame, where nothing read sits below, or on the coach's tap |
| Charts, bars, dots, lines, the anatomy figure | Q-153: drawn in place |
| Numbers, including the seconds in the ring | No count-ups. A second ticks |
| The home when Ask opens | A place visited ten times a day does not perform |
| A restored thread, a returned card | Coming back is not an event |
| A failed read, a refused send, a failed write | No shake, no flash, no red. A fact and a way on |
| Follow-ups relative to each other | One thought, one arrival |
| The draft's fields | The plan arrives whole |
| The page behind quick chat, beyond its scrim | It is the coach's place; it holds still so they can find it again |

## How each moment is checked

For every row: the harness URL for the moment (build report), then in WebKit

1. `document.getAnimations().map(a => [a.effect.target.className, Object.keys(a.effect.getKeyframes()[0] ?? {}),
   a.effect.getTiming().duration])` at three points in the moment: only `transform`, `opacity`, the two exceptions;
2. a frame sequence at 60 fps across the moment: the first and last frames match the states in SPEC.md, and no frame
   shows a position between two layout states (no layout animation);
3. the interrupt named in the row, fired mid-motion: the next frame continues from the last, within one frame;
4. Reduce Motion: the same sequence shows only opacity changes of at most `CH_FADE_MS`;
5. largest Text Size and dark: nothing clips, contrast holds;
6. streaming only: frame times over 600 words at worst-case pace.
