# Design: The round card (P011, phone first)

Status: draft. No owner board exists for this piece. It was written first, as `.claude/rules/clubhouse.md` asks, and
the build follows it. It extends [rounds.md](rounds.md) (a round's review); the engine, its saves and the offline queue
are untouched.

## What it is

A real golf scorecard for a posted round, rendered from the data the review already loaded: the course, tees,
rating and slope, the date, the holes played, par and score by hole, putts, fairways and greens where they were
tracked, Out, In and Total, and the strokes gained by leg. It is the thing a player keeps: shared as an image or
printed on one page.

It sits directly under the review's hero. The interactive scorecard further down ("Scorecard and shots") stays: that
one is for reading shots, this one is the artifact.

## Phone (390 wide)

- One paper card on the canvas, 16px gutters, no full-screen monolith. Head: course, then date and type, then tees with
  rating and slope. The score and its to par sit at the head's right.
- Eighteen holes become two bands of nine, Out above In. Each band is a table: Hole, Par, Score, then Putts, FIR and GIR
  where tracked, then a total column. Nine columns of 28px, a 40px label column and a 38px total column fit the 334px
  inside the card with no sideways scroll.
- A nine-hole round has one band. A round with holes missing shows those holes as an em dash, says "Thru 14 of 18
  holes", and a nine that is not whole shows an em dash for its subtotal rather than a short sum.
- Marks are the scorecard grammar, outlines so they survive a black and white printer: a circle is a birdie, a double
  circle an eagle or better, a square a bogey, a double square a double bogey or worse. Red is for under par only;
  squares are ink.
- Under the paper, outside it: Share card (44px). Print is desktop only (a phone prints through the share sheet).
- Strokes gained sits in a strip at the paper's foot: Total, then the four legs. Gains are green, losses amber.
  A round with no strokes gained has no strip.
- A round posted as a total, or whose holes failed to load, has no card: the page already says so and a card of
  dashes would be a worse answer.

## The moment

Arriving from Post round, the card settles in once: one movement on the smooth spring (no count-up, no stagger). The
submit path has already fired the success haptic; the card fires none. One quiet line under it names the round using
figures the page already shows: the best hole, the putts, and the leg that gained most when the hero line does not
already say so. Reduced motion and Animations off: no movement. A reload does not replay it.

## Keep

- Share card opens a sheet with the picture and two switches (Strokes gained, Putts and greens) so a player can share a
  plain card. The image is drawn on a canvas from the card's data, 1200px wide, in the house type, on this device only:
  no server, no public link. The picture says whose round it is (the player's name before the date) and where it came
  from: a quiet foot inside the frame with Golfhelm in the brand green and the team's name when it is known.
- Where the browser can share files, the button says Share and opens the share sheet; where it cannot, it says Save
  image and downloads a PNG named for the course and date. Closing the share sheet is not a failure.
- Print (desktop): the page prints only the card, on one page, ledger rules kept, in ink on white whatever the theme.
