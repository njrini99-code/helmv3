<!-- markdownlint-disable MD013 -->
# Round detail (coach and player), v3 — the field sheet

`/golf/dashboard/rounds/[id]`, distinct from the deeper `/review` engine that
lives at `[id]/review` (that route has its own spec,
`docs/design/fairway-facelift/screens/round-review.v2.md`, and its own real
data — `golf_rounds.strokes_gained_*` — which this page's props do not carry
today; see Risks). This spec supersedes `round-detail.md` and
`round-detail.v2.md` in full: v2 was an InstrumentPanel-era synthesis (three
stacked `InstrumentPanel`s, later reduced to two) written before
`docs/design/fairway-facelift/LANGUAGE.md` existed. It never adopted the
field-sheet doctrine — bare canvas, one Surface, one instrument — and is
retired wholesale, not merged.

Entry point: `src/app/golf/(dashboard)/dashboard/rounds/[id]/page.tsx`.
Component: `src/components/fairway/pages/rounds/FairwayRoundDetail.tsx`
("the post-round RECAP surface", its own docblock, lines 1-48).

## The question

What happened in this round, hole by hole, and what do I tell this player
next.

## Masthead

Bare on the canvas, per `LANGUAGE.md:27-31`. No `InstrumentPanel`, no green
plinth around the score — the ONE deep-green element this page is allowed
(`LANGUAGE.md:57-58`, "the round score seal on round review") is a small
seal, not a panel.

- **Eyebrow**: `Round · {dateLabel}` — unchanged, real
  (`FairwayRoundDetail.tsx:422`, `dateLabel` from `formatDateOnly`,
  `FairwayRoundDetail.tsx:258`).
- **Title row**: a small green score seal (rounded-full, ~44px,
  `bg-accent-800`, `text-on-accent`, `font-fw-mono`, the raw total-score
  digit only, no label) sits to the left of the title text
  `{dayOfWeek} at {shortCourse}` (unchanged derivation,
  `FairwayRoundDetail.tsx:255-259`). Seal source: `derivedTotals.total`
  (`deriveRoundTotalsFromHoles(holes, round)`,
  `src/lib/golf/round-total.ts:127-156`, called at
  `FairwayRoundDetail.tsx:279-280`). When `total` is null the seal is
  omitted entirely (no "–" badge) and the title stands alone.
- **Verdict sentence** (`text-h3` regular weight, one sentence, matches
  `LANGUAGE.md:30`):

  Template (viewer is a coach viewing a teammate's round, player id
  available — see newFields): `"{PlayerName} shot {total} ({toPar}), a
  {gradeLabel} round."` — `PlayerName` links to
  `/golf/dashboard/roster/{player_id}`.

  Template (viewer owns the round): `"You shot {total} ({toPar}), a
  {gradeLabel} round."` — no link, "You" is never a link.

  Field sources: `total`/`toPar` as above (`toPar` formatted via
  `formatToPar`, `src/lib/golf/format-to-par.ts`, already imported at
  `FairwayRoundDetail.tsx:87`); `gradeLabel` from
  `gradeLabel(gradeDotsForDelta(scoreToPar))`
  (`src/components/fairway/modules/logic.ts:26-35`, the five real bands
  "Rough day" / "Grinding" / "Solid" / "Sharp" / "Career day").

  **Missing facts**:
  - `total == null` (no score logged): `"{Subject} hasn't posted a score
    for this round yet."` — no parenthetical, no grade clause, no seal.
  - `total != null`, `scoreToPar == null` (score known, par incomplete):
    `"{Subject} shot {total}."` — drop the parenthetical and the grade
    clause (mirrors the existing `gradeScore != null` gate,
    `FairwayRoundDetail.tsx:510-512`).
  - Coach viewing a teammate but `player_id` is unavailable to this
    component today (see newFields): render the name as plain text, never
    a dead link.

- **Facts line** (`font-fw-mono text-caption text-text-tertiary`, mirrors
  `FairwayCoachDashboard.tsx:330-337`): `{roundTypeLabel(round.round_type)}
  · {holesPlayed} holes` — unchanged sources
  (`FairwayRoundDetail.tsx:186-200`, `:260`). Qualifier round number is
  NOT repeated here; it lives once, in the ledger's "This entry" column.
- **Actions**: unchanged — primary `Button` "Open full review" linking to
  `reviewHref` (`` `/golf/dashboard/rounds/${round.id}/review` ``,
  `FairwayRoundDetail.tsx:242`), overflow `Menu` with "All stats" and (when
  `canChangeType`) "Change round type" (`FairwayRoundDetail.tsx:421-442`).

## The stage

**One new page-local instrument, "Hole Field"** — no registered primitive
combines par, score and cumulative-to-par along a hole axis the way this
page's job requires (`Filmstrip` renders ball-flight art keyed to
degenerate shot data, not a par/score/cumulative encoding — see Risks;
`GradeDots` is a single 0-5 aggregate, not a strip, per
`src/components/fairway/modules/types.ts:184`; `ScoringHistogram` is
hard-restricted to a dark accent-800/900 panel per its own registry entry,
`registry.ts:217`). `DrillPanel` is deliberately NOT reused for the
per-hole expansion below it: read in full
(`src/components/fairway/modules/DrillPanel.tsx`), it renders its own
`rounded-fw-lg border ... bg-surface` shell with a card shadow
(`[box-shadow:var(--fw-shadow-card)]`) and a hardcoded `<span
aria-hidden>←</span>` back-arrow glyph — a second bordered card and an
arrow glyph on the one page whose doctrine is exactly one `Surface` and no
arrows in copy. Its own registry examples (`registry.ts:95-99`) are
Signals and a roster row inside a `MatrixBoard`, not a bare field-sheet
page. The per-hole detail below is a bare hairline band instead (see
"What a mark links to").

One `Surface elevation="border" padding="none"` wraps the whole instrument
(the only Surface on the page). Header row inside it: overline "This
round · by hole", title "Hole field", one-line legend "Bars rise over par
in amber and drop under par in green. The line under them is the running
score to par." No view control — there is nothing to switch (one round,
one player).

Three stacked bands share one x-axis (hole index 1..`holesPlayed`,
evenly spaced 0-100%, a vertical rule between hole 9 and hole 10 marking
the turn — the same turn-marker convention the current `Scorecard` table
already draws, `FairwayRoundDetail.tsx:1063-1070`):

1. **Bars** (top band, 80px). One 6px bar per hole at its hole's x
   position: rises above the 50%-height baseline in `bg-fw-warning`
   (amber) when `score > par`, drops below in `bg-accent-500` (green)
   when `score < par`, a flat 3px tick in `bg-text-tertiary/70` when even
   — the identical palette and Bar geometry `ScoreField.tsx:136-193`
   already uses, just keyed by hole index instead of date fraction and
   without the `nudge` (holes never share a date). Height = `min(HALF, |d|
   / cap * HALF)` where `d = score - par` and `cap = clamp(2, 5, max(|d|)
   across this round's holes)` (same clamp shape as `scoreFieldCap`,
   `ScoreField.tsx:49-53`, tightened because a single-hole swing rarely
   exceeds a few strokes). Source: `holes[i].par`, `holes[i].score`
   (`RoundHoleRow`, `FairwayRoundDetail.tsx:98-108`). A hole missing par
   or score is skipped — a blank gap, never a zero-height mark — mirroring
   the existing `filmstripHoles` filter (`FairwayRoundDetail.tsx:320-328`).
   Entrance: the same staggered `scaleY` reveal `ScoreField`'s `Bar`
   already uses (`ScoreField.tsx:157-165`, `EASE_CINEMATIC`,
   `DURATION.short`, capped step), left to right.
2. **Cumulative to par** (middle band, 28px, hairline above and below).
   One polyline, own min-max vertical scale (NOT the bars' par-relative
   scale — its position on screen is not comparable to the bars' height;
   only its shape is the signal, and the legend line above says so).
   Source: the same cumulative array the page already computes —
   `reviewStats.momentumData` when present, else recomputed from
   `holes` (`FairwayRoundDetail.tsx:367-386`) — drawn with the exact
   normalization `PulseTrace` already uses
   (`FairwayRoundDetail.tsx:945-957`) and colored by
   `TREND_COLOR[classifyTrend(latest - first, {goodDirection:'down'})]`
   (`classifyTrend`/`TREND_COLOR` from `charts/TrendChip`, already
   imported `FairwayRoundDetail.tsx:83`, used today at
   `FairwayRoundDetail.tsx:966-968`). **Gated at ≥4 scored holes**
   (mirrors `TrendChart`'s own registered `avoidFor: 'fewer than 4
   points'`, `registry.ts:202`); below that the band is omitted
   entirely, never an empty line.
3. **Process marks** (bottom band, 24px, hairline above). Two stacked
   dots per hole: fairway hit above, GIR below, the exact `HitMark`
   shape convention already in this file (filled dot = hit, hollow ring
   = miss, faint dot = not applicable — par-3 fairways —
   `FairwayRoundDetail.tsx:1347-1366`). Source:
   `holes[i].fairway_hit`, `holes[i].gir` (`RoundHoleRow:103-104`).

Below the three bands, hole-number ticks (1, 9, 10, 18 at minimum,
matching the strip's own existing "1 2…9 | 10…18" convention described in
`round-detail.md:32-34`).

**What a mark links to**: every hole's column (all three bands, one hit
target) is a button, not a navigation link — clicking or focusing it sets
local `selectedHole` state, which opens a bare hairline band directly
beneath the hole-number ticks, still inside the stage's one `Surface`
(padding is already `none`, so a full-width band under the ticks is a
natural extra seam, not a second container): an overline "Hole {n}", then
five label/value pairs in one row — Par, Score, To par, Putts, Penalty
strokes (all real, `RoundHoleRow`), `font-fw-mono tabular-nums` — and a
plain text "Close" control at the row's right edge (no icon, no arrow
glyph). Clicking the SAME hole again, or "Close", clears `selectedHole`;
clicking a DIFFERENT hole replaces the band's content in place — no shot
data, no new read. This is the wiring the v2 spec found unused
(`Filmstrip`'s `activeHole`/`onScrub`, `FairwayRoundDetail.tsx:535`,
confirmed dead), now finally connected, and it is the SAME `selectedHole`
state the table's rows drive (see below) — clicking a table row and
clicking a stage column do the same thing.

**Degrades**:
- **No holes** (`hasHoles` false, `orderedHoles.length === 0`,
  `FairwayRoundDetail.tsx:315`): the Surface holds ONE `InlineNotice`
  — the exact existing copy, `"Scorecard only. Enter holes to unlock the
  breakdown."` (`FairwayRoundDetail.tsx:572`) — no bands, no ticks.
- **1-3 holes** (this page has exactly one "row" — the round itself,
  never many rows like `ScoreField`'s players — so its degrade axis is
  hole count, not row count): bands 1 and 3 render for whatever holes
  exist; band 2 (the cumulative line) is omitted below 4 scored holes,
  per its own gate above.
- **≥4 holes**: full three-band instrument.

**Why this beats a table**: the existing page already has a literal
per-hole record (the scorecard, kept below as "The table"). What a table
of 18 rows cannot show at a glance is the SHAPE of the round — a steady
grind versus one blow-up hole versus a strong finish — and whether the
damage was earned or unlucky. The bars show where; the cumulative line
shows the shape; the process dots show whether the coach should talk
about outcome or about swing. A coach reads that in one look at the strip
instead of reconstructing it by scanning 18×5 cells.

## Readouts

Three, in the stage's right column at `md`+ (per `LANGUAGE.md:34-35`),
one row above the stage on phone (per `LANGUAGE.md:97-98`, adapted —
three items, not the language's default four-cell 2×2). None repeat a
per-hole mark, and none repeat the masthead SEAL specifically: the seal
already prints `derivedTotals.total` as the page's one raw-score numeral
(`FairwayRoundDetail.tsx:279-280`), so it is not read a second time here
as a bare "Score" readout — these three are the round totals the seal
does not already carry. Readout 1 (To par) DOES repeat the masthead
VERDICT SENTENCE's `({toPar})` parenthetical one section up — that
repeat is kept, not an oversight: `LANGUAGE.md:30` requires the verdict
sentence carry its numbers inline in prose, so the fact reads once as
language there and once as a numeral here, the same duplication pattern
the ledger and table already use elsewhere on this page (a fact stated
in prose, then again as a scannable figure) — it is the seal (a bare,
context-free numeral standing for the whole round) that composition
bans from repeating, not every fact repeating across regions.

1. **To par** — source `derivedTotals.scoreToPar`
   (`src/lib/golf/round-total.ts:127-156`, called
   `FairwayRoundDetail.tsx:279-280`). Delta semantics: negative is better
   (green ink), positive is worse (amber ink), zero is even (neutral) —
   the exact `DeltaChip` direction rule already coded
   (`FairwayRoundDetail.tsx:492-501`, including its own comment about
   golf's lower-is-better convention).
2. **Putts** — source `round.total_putts`
   (`RoundDetailRound`, `FairwayRoundDetail.tsx:118`, read at `:293`).
   Delta semantics: fewer is better, stated as a caption ("fewer is
   better"), not a colored delta — no season/team baseline exists in
   today's props to compare against (see newFields).
3. **GIR** — source `girPct`, derived from `round.total_gir` /
   `round.total_gir_possible` (`FairwayRoundDetail.tsx:285-287`). Delta
   semantics: higher is better, same caption-only treatment, same
   no-baseline caveat.

**Degrade, each independent of the others**: when a readout's source
value is null (`scoreToPar`, `round.total_putts`, or `girPct`), its mono
numeral renders `–` with no tone and no delta glyph; the caption
("fewer is better" / "higher is better") still prints for Putts/GIR even
at `–` — it states a general direction, not a claim about this round's
number. This mirrors the seal's own null handling above (`totalScore ==
null` omits the seal entirely; these three readouts are per-field, so
one can show `–` while the others show real values).

## The ledger row

Three bare columns, 12-column grid, widths 5/4/3, `divide-x
divide-border-subtle` on `lg` (`LANGUAGE.md:39-42`). None repeats a number
the stage or the readouts already show.

**Breakdown** (5/12) — rows, no links (data only, this column states
facts, it does not navigate). The stage and the table both gate on
`hasHoles`/per-nine hole counts; this column must too, or a scorecard-only
or partially-logged round prints a fabricated par sum instead of an honest
gap — the exact failure the table's own Pen column already guards against
one section below (see there: "shown as `0` when logged, `–` only when
null"), so this column follows the identical rule instead of contradicting
it:
- Front nine: `frontNineTotal` (`FairwayRoundDetail.tsx:282`, `–` when
  null) vs the front nine's par sum — shown ONLY when `front.length > 0`
  AND every hole in `front` (`holes.filter(h => h.hole_number <= 9)`) has
  a non-null `par`; otherwise print `frontNineTotal` alone, no "vs par"
  clause. Mirrors `ScorecardNine`'s own `holes.length === 0` guard
  (`FairwayRoundDetail.tsx:1101`), which today only runs inside the
  `hasHoles` branch — this ledger column has no such gate and must add
  one, since it renders whether or not the stage/table do. New
  client-side derivation over the `holes` prop already in hand, no server
  change.
- Back nine: same, `backNineTotal` (`:283`) vs the back-nine par sum,
  guarded independently on `back.length > 0` and back's own hole `par`
  completeness — a round can have a complete front and a partial or
  missing back, or the reverse.
- Fairways: `fwHit`/`fwPoss`/`fwPct` (`FairwayRoundDetail.tsx:289-291`) —
  already null-honest (round-level columns, independent of `holes`).
- Penalty strokes: sum of `holes[i].penalty_strokes`
  (`RoundHoleRow.penalty_strokes`, `FairwayRoundDetail.tsx:105`) — a REAL
  field that no current variable sums, new client-side arithmetic over
  data already in props, not a new data source — but shown ONLY when
  `holes.some(h => h.penalty_strokes != null)`; a `holes` array that is
  empty (scorecard-only round) or entirely null on this field renders
  `–`, never a fabricated `0` (an actually-recorded zero still reads
  `0`, the same null-vs-zero rule the table's Pen column states below).

**Story & next** (4/12) — a list of hairline rows:
- The AI recap, quoted verbatim (prop `aiRecap`,
  `FairwayRoundDetailProps:139-140`, sourced from `golf_rounds.ai_recap`
  via `generateRoundRecap`, `page.tsx:201-211`). No link.
- Up to two areas for improvement (`reviewStats.areasForImprovement`,
  `FairwayRoundDetail.tsx:389-394`), area name plus its recommendation.
  No link.
- When there are no areas, up to two recommendations
  (`reviewStats.recommendations`, `:395-399`), same fallback the current
  code already applies (`:670-675`). No link.
- Degrade: no review row, or a review row with neither areas nor
  recommendations — the negation of the app's own existing gate
  `hasReview && hasNextWork` (`FairwayRoundDetail.tsx:401-402, 655`),
  i.e. render this line whenever that gate is false, NOT "`hasReview`
  and `hasNextWork` both false" (a stricter, wrong reading that would
  suppress the line for a review row that exists but is empty — exactly
  the case this bullet names): one quiet line, "No review yet. It
  appears once CoachHelm scores this round." — never a fabricated
  placeholder.

**This entry** (3/12) — rows:
- Round type: `roundTypeLabel(round.round_type)`
  (`FairwayRoundDetail.tsx:186-200`). No link.
- Qualifier: only when `currentQualifierId != null`
  (`FairwayRoundDetailProps:161`) — "Qualifier round
  {currentQualifierRoundNumber ?? '–'}" links to
  `/golf/dashboard/qualifiers/{currentQualifierId}` (real route,
  `src/app/golf/(dashboard)/dashboard/qualifiers/[id]/`). Gated on the
  qualifier id, not on `round_type` text — a round can carry
  `qualifier_id` independent of its `round_type` string
  (`page.tsx:60-62`).
- Change round type: only when `canChangeType`
  (`FairwayRoundDetailProps:159`) — this row does not navigate; it
  toggles the existing inline `RoundTypeEditor`
  (`typeEditorOpen` state, `FairwayRoundDetail.tsx:247, 449-461`),
  already real, already wired.

## The table

The literal scorecard, restructured from today's transposed layout
(holes as columns, metrics as rows,
`FairwayRoundDetail.tsx:1049-1229`) into a flat table where **rows are
holes** — this is what lets a table row and a stage column point at the
same thing.

Columns, left to right: **Hole** (left, mono numeral, `hole_number`),
**Par** (right, mono, `finite(h.par)`), **Score** (right, mono, colored
ink — green under par, amber over, neutral even, the identical tone rule
`ScorecardHoleRow` already computes, `FairwayRoundDetail.tsx:1240-1247`),
**To par** (right, mono, signed via `formatToPar(score - par)`),
**Putts** (right, mono, `finite(h.putts)`), **FW** (center, `HitMark`
dot, `hidden md:table-cell`), **GIR** (center, `HitMark` dot, `hidden
md:table-cell`), **Pen** (right, mono, `penalty_strokes`, `hidden
md:table-cell`, shown as `0` when logged, `–` only when null — matches
the app's existing null-vs-zero convention). Caption: uppercase
"Scorecard" over a `border-strong` rule, per `LANGUAGE.md:44-46`. A rule
between hole 9 and hole 10 marks the turn, same as the stage.

**Row link**: clicking or tapping a row sets the SAME `selectedHole`
state the stage's columns set — it highlights that hole's mark in the
strip above and opens the same inline hairline band. It is not a route
navigation; there is nowhere else for a single hole to go.

**Row source**: rows are `orderedHoles` (`holes` sorted by
`hole_number`, `FairwayRoundDetail.tsx:309-312`) — ONE row per hole
actually present, not a count to generate rows from. `holesPlayed`
(`round.holes_played ?? 18`, `:260`) is a descriptive fact (shown in the
masthead's facts line), not a row generator: a round with 9 real holes
and `holes_played === 18` renders 9 rows, never 9 real rows plus 9
fabricated dash rows to reach 18. Typically 18 rows when the round is
complete. **No "view all" link** — this table always renders the whole
round; there is no larger superset to page into, so the generic
per-page-table convention ("Ten rows and a View all N link",
`LANGUAGE.md:46`) does not apply here and is deliberately omitted rather
than faked with a disabled link.

## Phone

Same order, one column (`LANGUAGE.md:95-100`):

1. Masthead collapses into the `AppShell` top bar (unchanged
   `ViewHeader` convention, `registry.ts:54-58`). Seal + title stack;
   verdict sentence beneath; facts line beneath.
2. Readouts become a three-across typographic row above the stage (To
   par / Putts / GIR) — adapted from `LANGUAGE.md:97-98`'s default 2×2,
   which is sized for four cells; the score seal already stacked into
   the masthead in step 1 above covers the total, so it is not a fourth
   cell here either.
3. The stage: an identity/legend row sits above the strip (mirrors
   `ScoreField`'s own phone pattern, `LANGUAGE.md:97`); the three bands
   keep their percentage-based x positions (the same `dateFraction`-style
   math `ScoreField.tsx:39-46` already uses, keyed by hole index instead
   of date), so the strip stays full width and crisp with no horizontal
   scroll at 390px — bars simply sit closer together.
4. Ledger stacks single column, horizontal hairlines between columns
   instead of vertical (`LANGUAGE.md:41-42`), same order: Breakdown,
   Story & next, This entry.
5. The table is replaced by the EXISTING phone per-hole row strips
   (`ScorecardHoleRow`, `FairwayRoundDetail.tsx:1235-1313`, already
   correct per its own comment — "NOT the desktop table squeezed into a
   scroll box", `FairwayRoundDetail.tsx:1091-1092`) — kept, not deleted,
   PLUS one additive `onClick` per strip that sets the SAME
   `selectedHole` state. Without this the hairline band has no phone
   path at all: item 4 above removes the table (the band's other
   trigger), and the stage's own hole hit targets are `w-3`
   (`ScoreField.tsx:175`, 12px) — far under the 44px row link
   `LANGUAGE.md:100` requires on phone. Each `<li>` is already a
   full-width row at a comfortable tap height, so the strip itself is
   the 44px target; the band's "Close" control gets an explicit 44px hit
   area too.

**CSS-gated, confirmed**: the phone rows are already gated by a plain
Tailwind class, `md:hidden` (`FairwayRoundDetail.tsx:1114`), and the
desktop table portion by `hidden … md:block`
(`FairwayRoundDetail.tsx:1146`) — no JS breakpoint check. The whole
component was read in full for this spec and contains zero
`useMediaQuery` / `window.innerWidth` / `matchMedia` calls (verified by
search), so there is no hydration flip to introduce or preserve.

## What this deletes

- `InstrumentPanel tone="accent"` score hero block
  (`FairwayRoundDetail.tsx:473-528`) — replaced by the masthead's green
  score seal and verdict sentence.
- `Filmstrip` ball-flight strip (call site `FairwayRoundDetail.tsx:535`;
  component `src/components/fairway/modules/Filmstrip.tsx`) — replaced
  by the Hole Field stage instrument.
- `StatMatrix label="Breakdown"` (`FairwayRoundDetail.tsx:536-569`) —
  redistributed into the masthead seal (score), the readouts (To par /
  Putts / GIR) and the ledger's Breakdown column (Front / Back / Fairways
  / Penalty).
- The local `ScoringDistribution` component and its `InstrumentPanel`
  wrapper plus "View as table" toggle (call site
  `FairwayRoundDetail.tsx:594-620`, definition `:714-910`) — the Hole
  Field's own bar colors already show the outcome mix; a second
  chart-in-a-card restating the same 18 holes is redundant.
- The Pulse `InstrumentPanel` and `PulseTrace` component (call site
  `FairwayRoundDetail.tsx:622-648`, component `:931-1040`) — folded into
  the Hole Field as its cumulative-to-par band; `PulseTrace`'s
  normalization math is reused in place, not thrown away.
- The desktop transposed `Scorecard`/`ScorecardNine` table markup
  (`FairwayRoundDetail.tsx:1146-1226`, the `md:block` half only) —
  replaced by the holes-as-rows dense table. The phone half
  (`ScorecardHoleRow`, `:1235-1313`) is kept.
- `RxCard title="Areas to work on"` (`FairwayRoundDetail.tsx:655-678`) —
  folded into the ledger's Story & next column as hairline rows.
- `docs/design/fairway-facelift/screens/round-detail.v2.md` as an
  implementation plan — its `InstrumentPanel`/`InstrumentCluster`/
  `StandingBars` synthesis is superseded wholesale by this spec.

## Risks

- **New primitive, not a registered one.** "Hole Field" is page-local
  and unproven; it reuses `ScoreField`'s Bar math and `PulseTrace`'s
  normalization rather than inventing new visual language, but it is
  still new code with no existing test coverage, higher risk than
  reusing a registered component outright.
- **`newFields` — `round.player_id` is not threaded into
  `FairwayRoundDetailProps`.** `RoundDetailRound`
  (`FairwayRoundDetail.tsx:111-126`) and the full props interface
  (`:136-169`) carry no player id, only `playerName` (a string). The
  server page has it (`roundData.player_id`, `page.tsx:128` and
  elsewhere) but never passes it into the serializable `round` object
  built at `page.tsx:417-432`. Needed for exactly one thing: the
  verdict sentence's player-name link when a coach views a teammate's
  round. Loader change: add `player_id` to the object at
  `page.tsx:417-432` and to `RoundDetailRound`. Until then, the name
  renders as plain text, never a link.
- **`newFields` — no season/team baseline for Putts or GIR.** The
  readouts state direction ("fewer is better" / "higher is better") but
  carry no numeric comparison, because no team- or season-average read
  reaches this component today. A real comparison would need a new
  server read — `getPlayerStandingForReview` or `getTeamComparison`,
  both cited as real, already-used actions in
  `docs/design/fairway-facelift/screens/round-detail.v2.md:78,88` — but
  wiring one is explicitly out of scope for this spec; nothing here
  invents a benchmark number to fill that gap.
- **Cumulative-line noise on very few holes.** Gated at ≥4 scored holes
  (mirrors `TrendChart`'s registered `avoidFor: 'fewer than 4 points'`,
  `registry.ts:202`) specifically so a 1-3 hole partial round never
  shows a dramatic-looking line built from almost no data.
- **Removing the ball-flight Filmstrip trades away a shipped visual.**
  On this app's actual data, `golf_shots` is populated-but-degenerate
  for these rounds (`FairwayRoundDetail.tsx:22-33`), and the page
  already passes `Filmstrip` only `{n, par, score}` — no shots — so
  today it renders as an empty turf illustration with a ring-tone, not
  a real ball-flight reconstruction. The loss from removing it is
  aesthetic, not informational. Flagged so it is not restored by reflex
  during implementation.
- **`ScoringHistogram` cannot be used on the matte stage.** Its
  registry entry restricts it to a dark `accent-800/900` panel
  (`registry.ts:217`, `avoidFor: 'a light/cream surface'`). If a future
  pass wants a bucketed scoring-mix visual, it has to live inside the
  green seal, never on this page's Surface.
- **Partial hole data must never render a fabricated mark.** A hole
  missing `par` or `score` is skipped in the Hole Field (a gap, not a
  zero-height bar), matching the exact filter the current
  `filmstripHoles` derivation already applies
  (`FairwayRoundDetail.tsx:320-328`) — this spec must not regress that.
