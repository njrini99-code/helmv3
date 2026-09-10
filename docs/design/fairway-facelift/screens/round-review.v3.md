<!-- markdownlint-disable MD013 -->
# Round review, v3 (the field-sheet pass)

Supersedes `round-review.v2.md`. The v2 build shipped in the old idiom: a
smoothed season chart inside its own bordered card, a story panel whose only
content is two sentences, and four same-size boxes each holding a set of
standing bars. Read `LANGUAGE.md` first; this spec applies it.

## The question

Where did this round get won and lost, and what do I say to the player about
it tomorrow.

## Masthead

Bare on the canvas, no plinth.

- Eyebrow: `ROUND REVIEW · {round type label}` when `buildRoundTypeLabel`
  returns one, else `ROUND REVIEW`, then the course and date from
  `buildCourseDateLine`.
- Title, `text-display`: the player's name.
- Verdict, `text-h3` regular, max 64ch, built from real fields:
  `{score} ({to par}) at {course}. {best stretch} was the round: {n} under
  through holes {a} to {b}. {worst category} cost {x} strokes.`
  - Best and worst stretch come from `momentumData` (rolling score to par per
    hole): the longest run of non-positive hole deltas, and the single worst
    three-hole window. Both are computed, never guessed.
  - The cost clause comes from `strokesToGain[0]` (`category`,
    `potentialStrokes`).
  - Scorecard-only round (`holes.length === 0`): the sentence collapses to
    `{score} ({to par}) at {course}. Scorecard only, so there is no
    hole-by-hole read yet.` and nothing after it is invented.
- Facts line, mono caption: putts, fairways hit over attempts, greens over
  attempts, penalties, each omitted when its source is null.
- Actions on the eyebrow row: `Add note` primary, overflow Menu with
  `Full breakdown`, `Open scorecard`, `Recompute`.

## The stage

The single Surface. Its instrument is **Round shape**, a new page-local
instrument (`round-review/RoundShape.tsx`), NOT a card holding a chart.

- One column per hole across the full width, 18 (or `holes.length`) columns,
  percentage width, no SVG scaling.
- Each hole is a bar off a par baseline: height `|scoreToPar| / cap * 20px`
  where `cap = max(3, max |scoreToPar|)`. Over par rises in `bg-fw-warning`,
  under par drops in `bg-accent-500`, par is a 2px neutral tick on the line.
  Eagle or better takes `bg-accent-700` so it reads deeper than a birdie.
- A cumulative line crosses the same box: `momentumData.rollingScoreToPar`
  plotted as a 1.5px `stroke-accent-700` polyline on its own scale, with the
  finishing value labelled at the right edge in mono. This is the whole point
  of the instrument: the bars say what happened on each hole, the line says
  where the round actually turned.
- Under each column, two hairline rows: the par (`text-eyebrow`) and the hole
  number. Below those, a fairway tick (`DrivingDotStrip`'s vocabulary: filled
  green hit, amber miss biased to the logged side, hollow ring for a par 3)
  and a GIR tick. Both rows are omitted entirely when every value is null.
- Each column is a 44px-tall `PressTarget` that opens the existing
  `FilmstripReview` hole detail for that hole. Selection is a green underline
  under the column, never a card popping open elsewhere.
- The front and back nines are separated by one vertical hairline at hole 9,
  labelled `OUT {front.score}` and `IN {back.score}` from `frontBackSplit`.
- Degraded: with no holes, the stage instead plots the player's season
  trajectory (`getRoundReviewTrend`) with THIS round marked and labelled, and
  says in one line under the header that the hole read unlocks when holes are
  entered. No fabricated hole bars, ever.
- Readouts column to the right on lg (`15rem`, vertical hairline, ruled full
  height, same shape as the home): Score with its to-par, Putts, Greens in
  regulation, Fairways. Each with its delta versus the player's own season
  average from the trend series, and "better" meaning lower for score and
  putts, higher for the other two.

## The ledger row

Three bare columns divided by vertical hairlines, `5 / 4 / 3` on lg.

1. **The story** (5). The narrative from `buildNarrative` as running text, the
   coach note below it under a hairline with its `Add note` affordance inline.
   No panel, no card: type on the canvas.
2. **Where it went** (4). `strokesToGain` as rows: category, a `MicroBar`
   whose length is `potentialStrokes` against the largest item, and the signed
   strokes in mono. This is the only place the strokes-to-gain numbers appear.
3. **Against the field** (3). Standing rows, not four boxes: for each of the
   four categories that have data (`keyStats` plus the season trend), one row
   of `StandingBars` with the player, the team and the PGA benchmark on a
   shared scale, its label above and its delta caption below. When strokes
   gained was not computed for the round, this column carries a single honest
   line saying so and nothing else.

No column repeats a number the stage shows.

## The table

`Hole by hole`, full width, one row per hole, hidden entirely when there are
no holes.

Columns: Hole (mono, w-12), Par, Score (mono, signed ink), To par, Putts,
Fairway (hit, miss left, miss right, or a dash for a par 3), GIR, Drive
(club and distance, `hidden lg:table-cell`), Approach (club and distance,
`hidden lg:table-cell`), Note (`synthesizeHoleNote`, `hidden md:table-cell`).
The row is the same `PressTarget` as the stage column, so clicking either
opens the same hole detail. Uppercase caption header over a `border-strong`
rule, hairline rows, mono numerals right aligned.

## Phone

Same order, one column.

- The stage keeps the bars and the cumulative line at full width. The par and
  hole rows drop to hole numbers every third column. The readouts become a 2x2
  typographic grid above the instrument.
- The ledger columns stack with horizontal hairlines between them.
- The table keeps Hole, Score, To par, Putts and hides the rest with
  `hidden md:table-cell`. Rows stay 44px.
- Every branch is CSS-gated. The only client state is the selected hole.

## What this deletes

- The green `ROUND SCORE` seal panel in `ReviewHero.tsx` as a standalone
  block: the score moves into the masthead facts and the readouts column. One
  deep green element per page is spent on the cumulative line's end label.
- The `Season trajectory` bordered card (it becomes the degraded stage).
- The `The story / Coach notes` Surface (it becomes ledger column 1).
- The four `Where this sits` Surfaces (they become ledger column 3's rows).
- `RoundStatsPanel.tsx` if nothing else imports it after this pass.

## Risks

- `momentumData` is empty for a scorecard-only round; the degraded stage
  covers that and must be tested with the QA Test Course round (18 holes with
  no shot rows) and with a Pebble Beach round (full shots).
- `strokesToGain` can be empty; column 2 then carries one honest line.
- The cumulative line and the bars share a box but not a scale. The line gets
  its own right-edge label so the reader is never asked to read it off the
  bars' axis.
