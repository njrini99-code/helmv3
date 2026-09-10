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

## Result

Built on `agent/frost-facelift`. The composition is the four regions the spec
asks for: a bare masthead, one `Surface` holding the new page-local
`RoundShape` instrument beside a readouts column, a three-column ledger on
vertical hairlines, and the hole-by-hole table.

Files added under `src/components/golf/coachhelm/round-review/`:
`round-shape.ts` (pure logic), `RoundShape.tsx` (the instrument),
`round-review-parts.tsx` (verdict, readouts, ledger columns, table),
`RoundReviewFieldSheet.tsx` (the composition root), `HoleDetail.tsx` (the hole
panel lifted out of `ReviewHero`), `FullBreakdownPanel.tsx`. `ReviewHero.tsx`
and `FilmstripReview.tsx` are deleted. The route's `loading.tsx` was
rebuilt with them: it had been drawing the retired centred card with its
3-up mini-stat row, which is the first thing a navigation paints, so it now
mirrors the page's own masthead-and-stage loading surface. `RoundShape` is page-local: it is not
in the shared fairway barrel or registry.

### Deviations, and why

1. **The readouts' deltas do not come from the trend series.**
   `RoundReviewTrendRow` carries only `id`, `round_date` and `score_to_par`,
   so putts, greens and fairways have no comparison figure in it and three of
   the four readouts would have had to invent one. They read
   `getStatAverages(playerId)` instead — the player's own last 20 completed
   rounds (`avgScoreToPar`, `avgPutts`, `avgGirPct`, `avgFairwayPct`), fetched
   in its own effect with its own absence handling. Because the window is
   "recent rounds" and not the season, the caption says so: "1.0 worse than
   recent". When the read fails or returns nothing, every readout renders its
   number with no delta line at all.

2. **The verdict's stretch clause is reworded for grammar.**
   `{best stretch} was the round: {n} under through holes {a} to {b}` renders
   as `Holes {a} to {b} were the round: {n} under.` A stretch that is level
   rather than under par cannot honestly say "0 under", so it reads
   `The round held through holes {a} to {b}, {k} holes without a dropped
   shot.` A run shorter than two holes is not a stretch and the clause is
   dropped. Ties on run length break toward the run furthest under par, then
   the earlier start, so the sentence is deterministic.

3. **The worst three-hole window gets its own clause.** The spec requires it
   to be computed but the sentence template had no slot for it, which would
   have left it dead. It renders as `Holes {c} to {d} cost {m} shots.` only
   when the window is at least two over and is not inside the best stretch.

4. **The cost clause reads the largest opportunity, not literally
   `strokesToGain[0]`.** The stored array is not guaranteed sorted, so it is
   ranked by `potentialStrokes` first.

5. **The degraded stage reuses `RoundShape` rather than `TrendChart`.**
   `buildRoundTrendSeries` only yields points at four rounds or more and
   returns a chart series; plotting the trajectory through the same instrument
   keeps ONE instrument on the page. It draws from two rounds up. Below that,
   and while the fetch is in flight, the stage carries a skeleton and then one
   honest line — never an empty state, never a fabricated series.

6. **Scorecard-only is detected from `holeByHole.length === 0`, and the hole
   deltas are gated on the same test.** A stored review that still carries
   `momentumData` for a round whose holes were removed therefore produces no
   stretch and no cost clause, only the scorecard-only sentence.

7. **The bar scale is 30px per half, not 20px.** The box the bars and the
   cumulative line share is 88px tall so the line has real amplitude; at 20px
   the bars read as ticks inside it. The cap is the specced
   `max(3, max |scoreToPar|)`.

8. **The par row prints its label once.** "Par 4" on the first column and bare
   numerals after it, the way a scorecard prints a row header, rather than
   repeating the word eighteen times.

9. **The upper label row is desktop-only.** At phone width a date or a par
   cannot print in an eighteenth of the screen without truncating to an
   ellipsis, so only the lower row shows there, every third column.

10. **`RoundSGSummary` and `ReviewBreakdown` moved behind "Full breakdown".**
    Neither has a slot among the four regions, and both render real computed
    data, so they sit in `FullBreakdownPanel` behind the masthead's overflow
    action alongside `RoundStatsPanel` rather than being deleted or given a
    fifth inline block. `RoundStatsPanel.tsx` therefore stays imported.

11. **The masthead primary action depends on the viewer.** `Add note` for a
    coach, which opens the coach-note editor in ledger column 1 through a new
    `editSignal` prop on `CoachNotesSection`. A player cannot write a coach
    note, so their primary is `Share with coach` — the real action this page
    already had. The focus-area flow keeps its place as a secondary button
    under the story.

12. **Club names are humanized.** `golf_shots.club_type` stores `driver` /
    `non_driver`; the table printed the raw token, so `humanizeClub` maps it
    to "Driver" / "Non-driver".

13. **One test outside this screen's files had to move with the code.**
    `src/test/golf/mobile-audit-2026-09-02.test.ts` read `ReviewHero.tsx` to
    assert the hole hint did not lead with a desktop-only "Hover" verb. The
    filmstrip and its hint line are both retired, so the test now reads
    `RoundShape.tsx` and `round-review-parts.tsx` and asserts the affordance
    that replaced the sentence: a hole is a `PressTarget` in the instrument and
    a pressable row in the table. Coverage is repointed, not deleted.

### Known limitations

- `src/components/golf/dashboard/premium-components.tsx` is now reachable from
  no route. Its only importer in the repo was this page's
  `containerVariants`/`itemVariants`, and the v3 masthead uses the `m` +
  `EASE_CINEMATIC` vocabulary directly instead. `src/test/route-reachability.test.ts`
  lists it, alongside four components orphaned by other sessions' facelift
  passes (`StandingTrack`, `CommandOpening`, `BriefBand`, `TeamSignalSummary`).
  Deleting a file in the shared golf dashboard tree is outside this pass's
  ownership, so it is reported rather than removed.

- At the specced 3/12 width, `StandingBars` truncates its reference row label
  to "Fiel…" in the third ledger column. That truncation is inside
  `src/components/fairway/charts/StandingBars.tsx`, which another session owns.
- On a scorecard-only round the story column shows the stored V1 summary,
  which reads "Shot 75 (+3) at QA Test Course. 0 pars." That "0 pars" is
  generated in `src/app/golf/actions/round-review-content.ts` from holes that
  were never entered. The page renders the stored narrative faithfully; the
  fix belongs in the generator, outside this pass's files.
