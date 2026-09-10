<!-- markdownlint-disable MD013 -->
# Fairway coach language: the field sheet

This is the page language every coach screen follows. It replaces the
"masthead plus a stack of cards" the first v2 passes produced. Read it
before touching a coach page; the specs in `screens/*.v2.md` are inputs,
this document decides the composition.

## Why the first pass failed

Every page rendered the same way: a greeting panel, then rounded cream boxes
in a grid, each box holding either a big number with a small label or a
short list. Nothing anchored the eye, every region carried the same weight,
and the "visuals" were decoration (a smoothed four-point area chart, a strip
of blob bars). A coach could not answer the page's question faster than by
reading the numbers. That is a template, not a design.

## The idea

A coach's field sheet: the precision of a scorecard and a ledger, set in
warm cream with green as ink. Structure comes from rules, alignment and
type, not from boxes. Each page has exactly one instrument that IS the page,
and everything else is typeset around it.

## Page anatomy (every coach page, top to bottom)

1. **Masthead**, bare on the canvas. Eyebrow (date or section, uppercase
   caption), the title in `text-display`, then the **verdict**: one honest
   sentence built from the data in `text-h3` regular weight, max 64ch, with
   the names and numbers as links or mono. No plinth, no panel, no meta icons.
   Primary action and overflow menu sit on the eyebrow row, right.
2. **The stage**: the one `Surface` on the page. Full content width. It holds
   the instrument that answers the page's question, with its own header row
   (overline, title, one-line legend, the view control at the right) and, on
   desktop, a readouts column on the right separated by a vertical hairline.
   The instrument uses real rows of real data (players, holes, rounds). It is
   never a chart in a card; the axis labels and readouts are typeset as part
   of the page.
3. **The ledger row**: two or three bare columns divided by vertical
   hairlines, stacked on phone. Each column is a heading and a list of
   hairline rows. Unequal widths (5/3/4, 7/5), never equal cards.
4. **The table**: a dense, full-width `<table>` with an uppercase caption
   header over a `border-strong` rule, hairline rows, mono numerals right
   aligned, signed values colored as ink (green under, amber over), one row
   is one link. Ten rows and a "View all N" link.

Breakpoints. The rule is not a number, it is a floor: **a split is legal only
at the width where every column still holds its content whole.** A column that
clips a player's name, an event's title or an axis label has failed, whatever
breakpoint it happens at.

Two failures make that floor concrete, and both are cheap to inherit.

- **A fixed rail beside a flexible instrument may not split before `xl`
  (1280).** At 1024 a 15rem readouts column left the instrument beside it about
  70px wide, wrapped its own heading over four lines and collided the axis
  labels. The rail's width is constant, so every pixel the row loses comes out
  of the instrument. Between `md` and `xl` those readouts sit as a four-across
  band above the instrument instead.
- **A fractional split may sit lower, and still has to be measured there.** A
  7/5 or 8/4 grid shares the loss, so it can be legal at `md` — but a 5/12
  column at 768 is about 300px, which is under the floor for most real
  instruments. Capture it at that width before believing it.

Unequal column spans are the intended reading rhythm, not a requirement at
every width. The coach home's ledger runs even thirds at `xl` and takes its
5/3/4 shape only from `2xl`, because at 1280 the 3-span column clipped every
name in it. Rhythm loses to whole words.

Verify every screen at 768, 1024, 1280 and 1440, not just 1440 and phone.

Rhythm: masthead 40px above the stage, 48px between the stage and the
ledger, 40px to the table. Inside regions use 12 to 16px. Vary it; a page
whose gaps are all 24px reads as a grid of tiles.

## Materials

- Canvas is the ground. Only the stage is a `Surface`. Section heads use the
  green ruling: `h2` in `text-h3`, then a 1px `bg-accent-300` rule.
- Green is ink: under par bars, improving deltas, the primary button, the
  "now" marker, links. Never a green panel behind a number. One deep green
  element per page at most (the round score seal on round review).
- Amber (`fw-warning`) is the only other hue and it means over par or
  declining. No third data color.
- Type: `text-display` title, `text-h3` verdict, `text-eyebrow uppercase
  tracking-[0.07em]` overlines, `font-fw-mono tabular-nums` for every number
  that sits next to another number.

## Instruments (registered in `src/components/fairway/registry.ts`)

- `ScoreField`: rows of players, each a strip of their rounds on a shared
  date axis; bars rise over par (amber) and drop under par (green), avg and
  trend at the row end. Home and roster.
- `Ribbon`, `TrendChart`: a real time series with a benchmark, `markLast`.
- `StrokesGainedTornado`, `DivergingBars`: signed category comparison.
- `Filmstrip`, `DrivingDotStrip`, `GradeDots`, `ScoringHistogram`: hole
  strips for one round.
- `StandingBars`, `RailBars`, `MicroBar`: standing versus a benchmark.
- `PuttingHeatmap`, `RampMatrix`, `AdoptionHeatGrid`: matrices.

## Bans (match and rewrite)

Nested cards; identical card grids; a big number with a small label as a
tile; a panel whose only content is a list; chart-in-a-card; side stripes;
gradient text; glass by default; dot sliders; em dashes and arrows in copy;
fabricated series; a client-only breakpoint branch (CSS gates phone layouts).

## Per-page stage

| Page | Question | Stage instrument | Readouts | Ledger | Table |
|---|---|---|---|---|---|
| Home | Where does the team stand today, who needs me | `ScoreField` of every player over the window | Scoring avg, GIR, putts, rounds (with sparklines) | Today, Attention (trend segments and movers), Latest | Recent rounds |
| Roster | Who is up, who is down, what is each player's shape | `ScoreField` sorted by trend with a focus column | Roster count, needs attention, active focus | Attention actions, Focus areas | Players (sortable) |
| Rounds | What has been played and what is the pattern | Round scatter over time (score to par per round, team average line) | Rounds, avg, best, qualifier share | Leaders, Score bands | Rounds |
| Round review | What happened, hole by hole, what do I say | 18-hole strip (par, score, cumulative to par) beside the SG waterfall | Score, to par, putts, GIR | Story and notes, Where this sits | Breakdown band |
| Intelligence | Where are the leaks | Leak tornado by category | Signals count by severity | Triage queue | Signals |
| Team stats | What are our category strengths versus field | Category matrix (players by category, ramp colored) | Team averages | Leaders per category | Category detail |

## Phone

Same order, one column. The stage keeps its instrument: `ScoreField` rows
become name over strip; readouts become a 2x2 typographic grid above the
instrument; the view control becomes a `Menu`. Tables hide secondary columns
with `hidden md:table-cell` and keep the row link at 44px.
