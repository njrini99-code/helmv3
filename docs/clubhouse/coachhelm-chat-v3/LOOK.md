# CoachHelm chat: the look, in three directions

Owner, 11 Nov, on the Ask preview: "It looks sloppy and ai and shit. Make it
premium and unique and beautiful.
Attention to detail. It's basic and crappy." (OWNER_DECISIONS 29.) This file is
the design work that answers it: one
turn of the chat drawn three ways for him to choose from. Nothing here changes
the real chat; the directions are
static previews at
`/clubhouse-preview/coachhelm-ask-look?frame=work|answer|task|hold`
(add `&long=1` for
the whole thread on one tall page).

Status, 11 Nov: the owner dropped directions B and C. Their preview code and
styles are deleted; the preview draws direction A only and no longer reads
`dir`. The B and C sections below stay as the record of what was compared.

## Why the current screen reads as generic

Avatar, name and a grey paragraph; a green bubble; white cards with a soft
shadow; a big number in a box with a pill
under it; grey bar tracks with a coloured fill; book-icon citation chips; a
stock composer. Each piece is the common
LLM-chat template in a green theme. The other CoachHelm pages each have one idea
a person remembers (the golf hole on
Team, the read card, the class binders). The chat has none.

## Candidate ideas

1. **The yardage book.** The answer is a leaf from a caddie's book: the hole
   drawn in plan with the strokes read off
   it, and the sources pencilled in the margin.
2. **The scorecard.** The answer is the player's card: one ruled grid whose
   columns are his rounds, and a task that is
   not official until the coach signs it.
3. **The big board.** The answer goes up on the tournament scoreboard: deep
   green, ivory slats, numerals on plates.
4. **The green-reading book.** Contour lines and a fall line carry the answer,
   the figure sits at the pin.
5. **The hole in profile.** One side-on drawing of a hole whose ground rises
   where he gains and falls into a bunker
   where he loses.
6. **Club stationery.** The answer as a note on the club's letterhead: engraved
   rules, a signed foot, no pictures.

## The three chosen, and why the others lost

- **A, the yardage book** (1). The drawing-led direction. It is the only one
  where the picture is the data: plan
  above, soundings below on one shared axis from tee to green. It takes idea 5's
  best part (loss as depth) without
  bending a ground line through four unrelated numbers, which would imply values
  between the parts of the game that
  do not exist.
- **B, the scorecard** (2). The grid-led direction. No pictures at all: every
  figure, the trend and the four parts
  of the game share one set of columns, the way a card does. It also gives the
  task card the one ritual golf already
  has for "this is now official": signing the card.
- **C, the big board** (3). The material-led direction. The only dark one, and
  the natural home of the owner's own
  reference for the activity panel (a dark green panel), so the panel and the
  answer are one object.

Lost:

- **The green-reading book** (4): the contours would be decoration. Strokes
  gained by part of the game has no slope,
  so the lines could not be read as data, and the Read page already owns the
  green-read card.
- **The hole in profile** (5): charming once, a gimmick on the tenth answer, and
  it interpolates between categories.
  Its honest core (loss drawn as depth below a baseline) lives on in A's soundings.
- **Club stationery** (6): handsome and quiet, but with no drawing and no grid
  it is the current screen with better
  type. It would not survive "could this be another product's chat?".

A and B are both light and both "paper", so they are held apart on purpose: A
never draws a table grid around a
figure and B never draws a picture. C is held apart by material.

## What every direction shares

- **The mark is a golf ball.** At rest it is a whole ball sitting on the green
  of the activity panel. Thinking, its
  shell thins and its dimples drift out past its edge. No wheel, sparkle, robot
  or wand anywhere.
- **The activity panel is the owner's picture** (11 Nov): a deep green rounded
  panel, a ringed tick for done, a ring
  that turns for active, a solid dim disc for waiting, a chevron that folds it.
  After the work it folds to one line.
- **The coach's question is an ivory slip**, not a green bubble.
- **Controls are the real ones**: `Segmented`, `Button`, `IconButton`, `Badge`,
  `Icon`. The composer is one ivory
  bar; the send key (`IconButton` primary) becomes the stop key (`IconButton`
  ink) while the model works.
- **Colour doctrine holds**: losses amber, gains green, red only on a pin flag.
  One figure is large; every other
  number is a row figure.

## A. The yardage book

> The answer is a leaf from a caddie's yardage book: the hole drawn in plan, the
> strokes sounded off it, the sources
> pencilled in.

- A paper leaf (`--ch-chart-paper`) under a running head with a printed double
  rule. On a desk the leaf opens as a
  two-page spread either side of a gutter seam.
- The signature: **plan and soundings on one axis.** The hole is drawn tee to
  green (rough, fairway, fringe, green,
  sand, trees, pin). Each part of the game is a station on it, and directly
  beneath, on the same x, a stem rises above
  the team baseline for strokes gained or drops below it for strokes lost.
  Approach is the deep one. Position on a
  common scale, labelled at the mark, no legend.
- The trend is ink on ruled paper with only the first and last round named.
- Sources are raised pencil numerals after what they support, and the same
  numerals as rows at the foot.
- The task card is a **pin sheet**: the same leaf, with the putt the focus is
  about drawn the way a pin sheet draws a
  green (cup, fall line, the 4 to 6 foot band above it).

## B. The scorecard

> The answer is the player's card: one ruled grid whose columns are his rounds,
> the figure that matters ringed in
> pencil, and a task that is not official until the coach signs it.

- Card stock (`--ch-card-bg`) under one heavy printed rule, a total box for the
  headline figure, and one grid: a
  label column, eight rounds, a total column, with the two printed column rules
  running through every row.
- The signature: **everything shares the card's columns.** The score-to-par
  numerals sit in their round's cell and
  the same numbers are drawn as a line through those cells. Each part of the
  game is a row of eight ticks about the
  baseline, with its average in the total column. The answer (−0.9) is ringed in
  pencil.
- Sources sit where a card names its scorer and marker.
- The task card has an **attest line**: an X and a rule. Confirm signs it;
  during the hold the coach's name is on the
  line and the ring counts down while the ink dries.

## C. The big board

> The answer goes up on the tournament scoreboard: deep green, ivory type, and
> every figure on its own plate.

- One flat deep green board (`--ch-feature-bg`) with champagne hairlines for its
  rails. It is the view's one feature
  card. The activity panel is the same board before the plates go up, in the
  same place and shape, so the work and
  the answer are one object.
- The signature: **plates.** The headline figure is three number plates. Each
  part of the game is an ivory name, a
  stroke drawn from the baseline in gold or mint, and its figure on a plate. The
  trend is eight plates hanging on
  five rails, one rail a stroke, the highest plate the best round.
- The task card is the board with each field on an ivory slat, and an ivory sill
  under it so the real green Confirm
  and the real Undo sit on paper.

## Motion (written, not built)

Transform and opacity only; SVG stroke for the small spinner, tick and rings.
Reduce Motion: every move below becomes
a `CH_FADE_MS` (180 ms) opacity change and the two loops stop on their rest frame.

Shared by all three:

| Moment | What moves | How far | How long | Easing |
| --- | --- | --- | --- | --- |
| Mark, thinking (loop) | Dimple rings leave in turn: inner, outer, spray. Each ring scales out from the centre and fades; the shell fades and shrinks under them | inner ring scale 1 to 1.0 (holds), outer 1 to 1.17, spray 1 to 1.49; ring opacity 1 to 0.72 to 0.34; shell opacity 1 to 0.22, scale 1 to 0.8 | 1200 ms out, 1200 ms back (`--ch-dur-typing` each way), rings 160 ms apart (`--ch-dur-typing-step`) | `--ch-ease-typing` |
| Mark, pulse | The whole mark | scale 1 to 1.06 to 1 | 2.8 s (`--ch-dur-live`) | `--ch-ease-typing` |
| Mark, work ends | Spray and outer ring return, shell closes | to scale 1, opacity 1 | `--ch-dur-spring-settle` (417 ms) | `--ch-ease-spring-settle` |
| Panel arrives | The panel | rises 8px, opacity 0 to 1 | `--ch-dur-base` (260 ms) | `--ch-ease` |
| Row, waiting to active | The dim disc fades out as the ring fades in at the same centre; the label lifts from the dim to the bright ink | disc opacity 0.55 to 0, scale 1 to 0.6; ring opacity 0 to 1 | `--ch-dur-quick` (180 ms) | `--ch-ease` |
| Row, active (loop) | The ring's arc | one turn | `--ch-dur-sweep` (900 ms), linear | linear |
| Row, active to done | The arc closes into the full ring (stroke dash 70 to 100), then the tick draws (stroke length 0 to 1); the label settles to the done ink | in place | 180 ms close, then 260 ms tick | `--ch-ease` |
| A step is never shown done before the one above it | order follows the real tool events | | | |
| Panel folds | The rows fade out and the panel's lower edge follows (a clip, the panel itself scales on y from its top edge with the content counter-scaled); the ball lands | rows opacity 1 to 0, 6px up | `--ch-dur-spring-smooth` (462 ms) | `--ch-ease-spring-smooth` |
| First words | Each word | opacity 0 to 1, no travel | `--ch-dur-word` (320 ms) a word, streamed as it arrives | `--ch-ease` |
| A card arrives | The card | rises 12px, opacity 0 to 1, drawn complete (Q-153: no draw-in) | `--ch-dur-base` | `--ch-ease` |
| Confirm pressed | The key | scale 0.97 | 110 ms down, 280 ms release | `--ch-ease` |
| Hold ring | The arc empties clockwise (stroke dash 100 to 0); the numeral swaps each second with a 180 ms crossfade | full circle | 8 s, linear | linear |
| Undo | Ring and line fade, Confirm returns | opacity | `--ch-dur-quick` | `--ch-ease` |
| Send to stop | The arrow fades to the square in the same key; the key's fill crossfades green to ink | in place | `--ch-dur-quick` | `--ch-ease` |

Per direction:

- **A.** The leaf arrives as one card. The figure, the plan and the stems are
  drawn at rest. The one allowed live
  moment (playbook §3, a visual arriving in a live answer): the four stems drop
  or rise from the baseline to their
  ends, tee to green, 80 ms apart, 260 ms each on `--ch-ease` (scaleY from the
  baseline); never on a restored thread.
  A source mark pressed: scale 0.97, and its row at the foot washes for 180 ms.
- **B.** The card arrives as one card. Live moment: the pencil ring draws round
  the figure (stroke length 0 to 1,
  `--ch-dur-reveal` 520 ms, `--ch-ease-io`) after the card has landed. On
  Confirm the coach's name fades in on the
  attest line (opacity, 260 ms) and the ring starts.
- **C.** The panel does not leave: its rows fade and the board's content fades
  in under the same head. Live moment:
  plates drop onto their rails, left to right, 80 ms apart, each 8px down and
  opacity 0 to 1 on
  `--ch-ease-spring-pop` (496 ms). On Confirm the sill's keys crossfade to the
  ring and Undo.

The still frame of the panel mid-motion (one done, one turning, one waiting) is
the `frame=work` capture of each
direction.

## What each direction would need added

Nothing below was hard-coded as a new colour: every colour, radius, shadow and
type step in
`styles/coachhelm-ask-look.css` is a token. What the preview had to draw by
hand, and should become shared before a
build:

| Need | Used today | Proposed |
| --- | --- | --- |
| A row that opens (sources), on paper and on the green | hand-built `button` rows (`.ch-look-a-src__row`, `.ch-look-b-src__cell`, `.ch-look-c-src button`) | `ui/LinkRow` (title, meta, chevron, 44px, `tone="paper" \| "feature"`) |
| A fold header (the panel's head, the board's "3 steps") | hand-built `button` | `ui/Disclosure` with a `feature` tone |
| The composer's field | a bare `textarea` in `.ch-look-cmp`, as the real chat's own CSS does | `ui/Composer` |
| A source mark (A) | `.ch-look-a-mark`, a raised numeral button | `ui/NoteMark`; colour token `--ch-pencil: var(--ch-champagne-ink)` |
| Sand on a drawing (A) | `--ch-chart-paper` fill, `--ch-champagne-500` line | `--ch-chart-sand` (light `#efe6d2`, dark `#2b2619`) |
| The card's heavy rule (B) | `2px solid var(--ch-text-primary)` | `--ch-rule-heavy: 2px` |
| A plate (C) | `--ch-on-green-plate`, `--ch-print-ink`, `--ch-board-double-shadow` (the score mark's) | `--ch-plate-bg`, `--ch-plate-ink`, `--ch-plate-shadow` with those values |
| Keys on the green (C) | avoided: the keys sit on an ivory sill | none if the sill stays; otherwise `Button` `onGreen` |
| Gain and loss ink on an ivory plate that holds in dark (C) | not available, so plates carry ink numerals only and the bar carries the colour | `--ch-plate-gain`, `--ch-plate-loss` |

Raw numbers that are layout, not tokens (all in the stylesheet): the large
figures (64, 52 and 44px, free above 40),
their tight leading and tracking, SVG label sizes in drawing units, the 44px row
and reach heights, the hold ring's
36px, and the charts' scales (54 drawing units a stroke in A, 13px a stroke in
B, 84px a stroke and 12px a rail in C).

## Weakest points, stated plainly

- **A.** The plan is one drawn hole reused for every strokes-gained answer. It
  is an illustration of "tee to green",
  not Jonah's course, and an answer with no tee-to-green shape (a lineup, a
  travel question) needs another drawing or
  falls back to the plain leaf. The pin sheet has the same limit: each task kind
  needs its own small drawing.
- **B.** It is a table on a phone, which DESIGN_LANGUAGE law 6 warns against. It
  reads because the cells hold marks
  rather than 32 numbers, but it is the densest of the three and the least
  "visual first".
- **C.** It is the heaviest. A long answer is a tall slab of green, plates are
  still numbers in boxes (made on
  purpose, but boxes), and stacking two such answers in one thread breaks "one
  feature card per view".

## Ranking

1. **A, the yardage book.** The only direction where the signature is a picture
   that is also the chart, it is the
   airiest, it sits closest to the pages already approved (the hole on Team, the
   read card), and it is the one a
   person would not mistake for another product.
2. **C, the big board.** The most striking first impression and the best home
   for the owner's activity panel. Second
   because of its weight over a long thread.
3. **B, the scorecard.** The most exact and the best task card (the signature
   line). Third because its idea is a
   grid, and a grid is the least felt of the three.

A sensible blend if he likes parts of each: A for answers, B's attest line for
the task card, C's plates only for
the one headline figure.
