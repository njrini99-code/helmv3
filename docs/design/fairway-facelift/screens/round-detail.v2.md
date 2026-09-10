# Round detail (coach) v2 spec

<!-- Synthesized by the facelift design panel (three concepts, one judge) on 2026-09-10. -->

# Round detail (coach), final spec
`/golf/dashboard/rounds/[id]`

## Purpose

This is the post round recap surface, archetype E (chronology), pinned by `docs/design/fairway-facelift/screens/round-detail.md`. The dominant object is the round score instrument. Everything else answers three follow on questions in ranked order: is that score good against something real, how did the round move, what happened hole by hole. The owner's complaint, "it's so basic, where are the visuals, the thought, the architecture," is answered by three distinct visual languages beyond the score readout (a line chart, a ball flight strip with an inline drill, a segmented bar plus sparkline cockpit cluster), one architectural correction the codebase's own registry already flags as owed (three stacked `InstrumentPanel`s where the registry says to avoid more than one), and one new always available comparison (a real You/Team/Tour standing row) that renders even on the exact scorecard only round in the current capture.

## First question

"What did this player shoot today, is that good, and how does it fit the bigger picture." The score answers the first half. A real standing comparison and a rounds trajectory answer the second half without needing a single hole of data, which matters because the round in the current capture has none.

## Winner and synthesis

Three concepts were scored 1 to 10 on thought, visuals, architecture, coachUtility, feasibility.

| Concept | thought | visuals | architecture | coachUtility | feasibility | total |
|---|---|---|---|---|---|---|
| 1. Editorial instrument panel | 8 | 7 | 8 | 5 | 9 | 37 |
| 2. DATA VISUAL | 9 | 8 | 7 | 9 | 6 | 39 |
| 3. Spatial architecture (resizable workspace) | 8 | 7 | 6 | 6 | 5 | 32 |

Winner: Concept 2, DATA VISUAL. The deciding factor is coachUtility measured against the actual round in the capture, which has zero holes logged. On that round, Filmstrip, the scorecard, the scoring distribution bar and the pulse trace all render nothing, because they are correctly gated on `hasHoles`. Concept 1's whole ranked hierarchy of instruments lives behind that same gate, so on the exact round the owner judged, its spine still collapses to four blocks: masthead, one accent panel, one notice, one ledger. Concept 2's two headline additions, a real standing comparison and a rounds trajectory, are the only proposed instruments that read from `golf_rounds` and cross round history alone, so they are the only ones that make the empty round look designed rather than basic. Concept 2 also introduces zero new primitives, every component it names is already canonical in the registry.

The graft: Concept 2's region order and its two new instruments (standing anchor, trajectory) form the spine. Two things move over from the other two concepts because they are cheaper and stronger than anything Concept 2 proposed for the same job:

- From Concept 1: the InstrumentPanel over use fix. The page currently mounts three `InstrumentPanel`s stacked full width (the hero, the Scoring Distribution wrapper, the Pulse wrapper) against the registry's own `InstrumentPanel` entry, which lists `avoidFor: ["more than one per screen"]`. Distribution and Pulse merge into one `InstrumentCluster` (already canonical, already built for exactly "one primary readout plus supporting readouts") so only the hero's `tone="accent"` panel remains a true standalone instrument; the other two read as one ranked cockpit composition instead of two more repeats of the hero's shape. Also from Concept 1: the typeset verdict (the AI recap's first sentence set large, the rest continuing at body weight) and the `StatMatrix` breakdown's `variant="plain"` swap (it already supports `inset | matte | plain`, no new code), which removes the sunken well that competed with the hero panel's own fill.
- From Concept 3: exactly one wire up, not the resizable workspace or Spine. `Filmstrip` already exposes `activeHole`/`onScrub` (confirmed unused today, the component mounts bare at `FairwayRoundDetail.tsx:535`). Wiring it to an inline `DrillPanel` under the strip is the legitimate, cheap version of Concept 3's idea: `DrillPanel`'s own registry entry is "selected evidence in context, inline expansion under a row," which is exactly archetype F living correctly inside an archetype E page, not a second architecture replacing it. It uses only the already honest per hole layer (par, score, putts, fairway hit, gir, penalty strokes), so it needs no new server read and cannot reintroduce the fabricated shot data problem `FairwayRoundDetail.tsx:22-33` already had to fix once. `ResizableWorkspace` and `Spine` are left out: `round-detail.md` pins archetype E, Concept 3's own risk list flags the archetype deviation, and `Spine` is registered for archetype A only.

## What survives an empty round

This is the test the owner's actual capture applies, stated explicitly so nobody has to guess at implementation time.

| Region | Renders with zero holes and a fresh review row | Renders with hole data |
|---|---|---|
| Masthead | yes, unchanged | yes |
| Verdict Stage (score, delta, grade, typeset verdict) | yes, unchanged, this already renders on the capture | yes |
| Verdict Stage's GIR standing row | yes, IF `round.total_gir`/`total_gir_possible` are populated (they are independent of `golf_holes`); if null, the row is omitted, never a placeholder | yes |
| Trajectory (TrendChart) | yes, IF the player has 4 or more prior scored rounds; below that, omitted entirely, never an empty chart card | yes |
| Filmstrip plus inline DrillPanel | no, folds into the existing `InlineNotice` | yes |
| BreakdownRail (StatMatrix) | no, same InlineNotice | yes |
| Scorecard table | no, same InlineNotice | yes |
| OutcomeCluster (Distribution plus Pulse) | no | yes |
| AreasLedger | only if a review row with real areas exists | yes |

So the honest floor on the worst case round is: masthead, verdict stage with its score and (when the fields exist) a real standing bar, a trajectory line chart when there is round history, one InlineNotice, and the ledger when a review exists. That is a minimum of two distinct visual instruments (the verdict cluster and the trend line) even with nothing hole level logged, against zero today. On any round with hole data it is six.

## Desktop composition (1440)

Unchanged outer shape: `mx-auto max-w-[1100px]`, `px-4 md:px-6`, single content column, `flex flex-col gap-10`. No 12 column shell, no `ResizableWorkspace`. Region order top to bottom:

1. Masthead, `role="toolbar"`, `ViewHeader` unchanged.
2. Verdict Stage, `role="stage"`, the dominant object.
3. Trajectory, `role="section"`, the across rounds context.
4. Chronology: Filmstrip plus inline DrillPanel plus BreakdownRail, `role="section"`, gated on `hasHoles`, else one `InlineNotice`.
5. Scorecard, `role="section"`, gated on `hasHoles`.
6. Outcome Cluster (Distribution plus Pulse), `role="section"`, gated on `hasHoles`.
7. Areas Ledger, `role="section"`, gated on `hasReview && hasNextWork`.
8. Sticky phone only CTA, hidden at `md` and up.

## Region by region

### 1. Masthead

Unchanged. `ViewHeader` with `eyebrow="Round · {dateLabel}"`, `title=heroTitle`, `description=contextLine`, `primaryAction` the "Open full review" button, and the overflow `Menu` (All stats, Change round type). Source: `FairwayRoundDetail.tsx:421-442`, untouched. REVIEW.md rows 18, 19, 31, 32, 33 already mark the eyebrow, context line, panel layout and InlineNotice copy for this route done; not re-litigated here.

### 2. Verdict Stage

Visual: the existing `InstrumentPanel depth="raised" tone="accent" padding="lg"`, two columns at `md` and up. Left column, fixed width, unchanged: `Readout size="hero"` (the score), `DeltaChip` (score to par), `GradeDots`. Right column, changed: the AI recap's first sentence is set large in `font-fw-display` at roughly 28px, line height 1.2 (the one enlarged moment beyond the numeral itself); the remainder of the recap continues underneath at `text-body-lg`/`text-text-secondary`, same paragraph, no second box; then a hairline, then one stacked `StandingBars` row for GIR, `frame="bare" size="sm" layout="compact"`, the exact stacking pattern already shipped in `StrokesGainedInstrument` (`src/components/golf/coachhelm/v3/.../StandingDrill.tsx`, the SG rows on Spine's own accent gradient), just one row instead of four, and on the panel's cream bezel rather than a dark gradient, so no `className="text-text-on-accent"` override is needed here.

Data mapping:
- `totalScore`, `scoreToPar`, `gradeScore`, unchanged, from `deriveRoundTotalsFromHoles(holes, round)` and `gradeDotsForDelta`, `FairwayRoundDetail.tsx:279-300`.
- `aiRecap`, unchanged, `golf_rounds.ai_recap` via `generateRoundRecap`, `page.tsx:201-211`, quoted verbatim.
- GIR row `player_value`, `girPct`, already computed at `FairwayRoundDetail.tsx:285-287` from `round.total_gir`/`total_gir_possible`. Row omitted entirely when `girPct` is null; never a zero.
- GIR row `team_avg`, `pga_value`, `pga_omitted`, from a NEW read, `getPlayerStandingForReview(playerId)` (`src/app/golf/actions/round-review-system.ts:1351`, already used by the `/review` route, returns `Record<string, PlayerStanding>`). Read `standingByMetric['gir_pct']`. `gir_pct` is a real, registered metric id (`src/lib/coachhelm/v3/metrics/registry.ts:76`, `direction: 'higher_better'`, `unit: 'percent'`). This is the ONLY metric used for the anchor row on purpose: `scoring_average` and `fairway_pct`/`putts_per_round` are NOT registered metric ids in `METRIC_IDS` (verified against the full list; only `sg_*`, `putts_made_*_pct`, `putt_miss_bias_*`, `approach_proximity_*`, `scrambling_pct_*`, `penalty_rate_per_round`, `big_number_rate`, `scoring_par_3/4/5`, `gir_pct`, `practice_tournament_delta`, `opening_hole_delta` exist), so there is no verified benchmark path for those without inventing one. If the read fails or `standingByMetric['gir_pct']` is absent, the whole GIR row is omitted, matching the page's existing degrade pattern for the review read at `page.tsx:249-255`.
- `StandingBars` itself already handles the cold start case (team under five active players drops the team marker) and `pga_omitted` (drops the tour marker) with no new gating code required; both are documented behavior of the primitive.

### 3. Trajectory

Visual: `TrendChart` (`src/components/fairway/charts/TrendChart.tsx`), `variant="line"`, height 220. This is a new instrument on this page. Gated: renders only when the player has 4 or more prior scored rounds (registry: `TrendChart` `avoidFor: ["fewer than 4 points"]`); below that, the whole region is omitted, never an empty chart card.

Data mapping:
- `data: TrendPoint[]`, from a NEW read, `getTrendAnalysis(playerId)` (`src/app/golf/actions/stats-data.ts:1827`, returns `TrendAnalysisResponse`, `trends.score` per `stats-data-types.ts:101-113`). Map each point's date to `x` and its score to par to `y` (confirm the exact property name on `TrendDataPoint` at implementation, the type exists and the shape is `{x,y,marker?}` on the `TrendChart` side, already verified at `TrendChart.tsx:36-49`).
- `marker` on the point matching `round.round_date`, tone `success` if this round beat the rolling average, `neutral` if it matched, `danger` if it missed. Rolling averages come from the same `TrendAnalysisResponse.rollingAverages`.
- `benchmark: {value, label}`, OPTIONAL. Source: a NEW read, `getTeamComparison(playerId, teamId)` (`src/app/golf/actions/stats-data.ts:2174`, `teamAverages.scoringAverage`, confirmed field at `stats-data-types.ts:166-175`). `teamId` for this call is the round's OWN team, already read and in scope at `page.tsx:332` as `roundTeamId` (this closes a real gap: `resolveCoachTeamIdWithCookie` only runs for a coach viewer, `page.tsx:128`, so a player viewing their own round would otherwise never resolve a team; `roundTeamId` is available regardless of viewer role). When `roundTeamId` is null, the benchmark dash is simply omitted; the line and marker still render.

### 4. Chronology: Filmstrip, inline DrillPanel, BreakdownRail

Gated together on `hasHoles`, unchanged gate, else the existing `InlineNotice title="Scorecard only. Enter holes to unlock the breakdown."`.

Visual: `Filmstrip` (unchanged 18 hole ball flight strip), now with `activeHole`/`onScrub` wired to local state (`const [selectedHole, setSelectedHole] = useState<FilmstripHole | null>(null)`). When a hole is selected, a `DrillPanel` mounts directly beneath the strip: `chip="Hole {n} · Par {p}"`, `backLabel="All holes"`, `onBack={() => setSelectedHole(null)}`, body is an `InsetGroup` of rows built from that hole's own row in `orderedHoles` (score vs par pill, putts, FW/GIR `HitMark`, penalty strokes when greater than zero, and this hole's rolling to par from `pulseSeries` at that index). No shot level data, no new server read, no honesty risk. Directly under that (or directly under the strip when nothing is selected): `StatMatrix label="Breakdown" columns={5} variant="plain"`, same five items as today (Front, Back, GIR, Fairways, Putts), one prop changed from the default `variant="inset"` to `variant="plain"`, which drops the sunken well in favor of hairline seams only, so it no longer competes visually with the Verdict Stage's own fill.

Data mapping: unchanged from today, `FairwayRoundDetail.tsx:320-328` (`filmstripHoles`) and `:536-568` (the five `StatMatrix` items, `frontNineTotal`/`backNineTotal`/`girPct`/`fwPct`/`puttsPerHole`, all already derived).

### 5. Scorecard

Unchanged. `Surface padding="none" elevation="border"` wrapping the existing front/back nine table, `FairwayRoundDetail.tsx:576-591`.

### 6. Outcome Cluster

Visual: one `InstrumentCluster balance="even"` (`src/components/fairway/instrument/InstrumentCluster.tsx`, `lg:grid-cols-[3fr_2fr]`). `primary` = the existing `ScoringDistribution` instrument, unchanged internals (segmented bar, legend, the "View as table" toggle). `secondary` = `[the existing Pulse InstrumentPanel]`, only present when `pulseSeries.length > 1`, exactly today's gate; when absent, `InstrumentCluster` renders the primary alone at full width (`hasRail` false disables the grid split), which degrades cleanly with no extra code.

Data mapping: unchanged, `distribution` counts at `FairwayRoundDetail.tsx:331-346`, `pulseSeries` at `:367-386`.

### 7. Areas Ledger

Visual: `RxCard` replaced with a plain section header, "Areas to work on," over `InsetGroup` rows. Each row: a small `text-accent-700` index numeral (01, 02, the one deliberate extra accent use on the page beyond the hero and the DeltaChip's good direction tone) plus the area name in `font-fw-sans font-semibold`, plus the recommendation underneath in `text-text-secondary`, separated by the `InsetGroup`'s own hairline seams (`src/components/fairway/surfaces/inset-group.tsx`, confirmed real, already exported from `@/components/fairway`). Gated identically to today: `hasReview && hasNextWork`.

Data mapping: unchanged, `areas`/`recommendations` at `FairwayRoundDetail.tsx:389-400`, real and never fabricated.

### 8. Sticky phone CTA

Unchanged, `FairwayRoundDetail.tsx:685-689`.

## Phone flow (390)

The phone capture in the repo today (`round__phone__fold.png`) predates the fixes REVIEW.md rows 19, 20 and 33 already mark done (it still shows a double eyebrow, a mono delta glyph, and a sunken recap well); this spec builds from the live source code, not that stale capture, and does not re-litigate rows 31, 32 or 49.

Flow, top to bottom, one column, no new sheets or drawers required for this pass:

1. Masthead collapses into the `AppShell` top bar, unchanged.
2. Verdict Stage stacks: numeral, delta, grade dots, then the typeset verdict (large first sentence, then the continuing prose), then a hairline, then the one GIR `StandingBars` row (already responsive at `frame="bare"`).
3. Trajectory: same `TrendChart`, height drops to 160, `ResponsiveContainer` already handles the narrow width; same 4 round floor gate.
4. Filmstrip: unchanged horizontal snap strip; tapping a column opens the SAME inline `DrillPanel` below it (not a separate Sheet, its `InsetGroup` body is short, a Sheet would be one tap too many for four or five rows), then the BreakdownRail `StatMatrix` (already 2 by N on phone via its own responsive grid).
5. Scorecard: unchanged phone per hole row strips (`ScorecardHoleRow`).
6. Outcome Cluster: `InstrumentCluster`'s own stacking, primary (Distribution) then the rail below it, unchanged behavior.
7. Areas Ledger: `InsetGroup`'s native full width seam rows, 44px minimum row height.
8. Sticky CTA: unchanged.

## Primitives

Existing, used as is: `ViewHeader`, `InstrumentPanel`, `Readout`, `DeltaChip`, `GradeDots`, `Filmstrip`, `StatMatrix`, `Surface`, `InlineNotice`, `RxCard` (removed from this page, kept elsewhere), `Menu`, `IconButton`, `Button`.

Existing, newly used on this page: `StandingBars` (`src/components/fairway/charts/StandingBars.tsx`), `TrendChart` (`src/components/fairway/charts/TrendChart.tsx`), `InstrumentCluster` (`src/components/fairway/instrument/InstrumentCluster.tsx`), `DrillPanel` (`src/components/fairway/modules/DrillPanel.tsx`), `InsetGroup` (`src/components/fairway/surfaces/inset-group.tsx`). All five are already exported from `@/components/fairway` and already used elsewhere in the app (StandingBars on `/review` and the standing drills, TrendChart and InstrumentCluster on Player Stats, DrillPanel on Roster and Signals, InsetGroup on the event sheet and settings), so this spec adds zero unproven primitives.

New primitives: zero required. One optional, small, page local component if time allows: a sticky mini score readout that appears once the Verdict Stage scrolls out of view (the player's initial, a small `Readout size="sm"` of the same total score, the same `DeltaChip`), reusing `Toolbar`'s own IntersectionObserver sentinel pattern rather than introducing a new one. Kept unexported and un-registered in `registry.ts` for this pass; only worth promoting to a shared primitive if a second sticky status consumer appears elsewhere. This is explicitly the lowest priority item in the plan, drop it first if the week runs short.

## Removals

- `RxCard`'s rounded, accent tinted card for "Areas to work on." Replaced by hairline seam rows (`InsetGroup`) with the accent moved onto a small index numeral instead of the whole card.
- `StatMatrix`'s default `variant="inset"` (sunken well) for the Front/Back/GIR/Fairways/Putts breakdown, a second warm fill competing with the Verdict Stage's own accent fill. Replaced by `variant="plain"`, a one prop change, already supported by the component.
- The Scoring Distribution `InstrumentPanel` and the Pulse `InstrumentPanel` as two separate, full width, equal weight boxes stacked one after another. Merged into one `InstrumentCluster`, so the ranking (Distribution as the primary story, Pulse as its flanking corroboration) is visible in the layout, not just in scroll order. This also directly answers the registry's own `InstrumentPanel` `avoidFor: ["more than one per screen"]` note, which this page currently violates three times over (hero, Distribution, Pulse).
- `Filmstrip` mounted with no selection wiring (`activeHole`/`onScrub` both unused, `FairwayRoundDetail.tsx:535`). Replaced by wired selection driving an inline `DrillPanel`.
- The plain, undersized prose treatment for `aiRecap` beside the score. Replaced by a typeset verdict, first sentence large, rest continuing, so the recap reads as the page's headline claim rather than a caption.

Nothing else changes. The masthead, the context line, the hero's two column layout, the InlineNotice copy, and the Scorecard table are already correct per REVIEW.md and are not touched.

## Known gaps, stated rather than hidden

- The GIR standing row's tour marker depends on `getPlayerStandingForReview` actually returning a `gir_pct` entry with a real `pga_value` for every player; if that action's cohort computation has its own gaps for a given player, the row must render with `pga_omitted` true rather than a fabricated number, matching the primitive's own documented behavior.
- The trend benchmark line is genuinely optional; a player with no resolvable team (an independent or a data gap on `round.team_id`) sees the trajectory line and this round's marker with no dashed team reference, which is correct, not a bug.
- The sentence split for the typeset verdict must not cut a decimal or an abbreviation mid word. Use a boundary of sentence ending punctuation followed by whitespace, with a lookahead requiring the next character to be uppercase, and a minimum lede length of 20 characters: `/^(.+?[.!?])\s+(?=[A-Z])(.+)$/s`, falling back to rendering the whole recap as one undivided block when the regex does not match or the lede is under 20 characters. "7.5 strokes gained" never matches at the first period because the character after "7." is not a space; "Jr." followed by a short continuation never produces a nonsense lede because of the length floor.
- `page.tsx` is already fully sequential today (round read, then a blocking LLM call for the recap, then holes, then review, then up to three qualifier reads, in that literal order, confirmed by reading the file). Every new read this spec adds lands on top of that unless it is parallelized; see the implementation plan.

## Implementation plan

### Files to edit

- `src/app/golf/(dashboard)/dashboard/rounds/[id]/page.tsx`
  - Add the two required new reads, `getTrendAnalysis(roundData.player_id)` and `getPlayerStandingForReview(roundData.player_id)`, and the one optional read, `getTeamComparison(roundData.player_id, roundTeamId)` when `roundTeamId` exists (already read at line 332, currently only used for the qualifier query, move that read earlier so it is available to gate the trend benchmark too).
  - Parallelize: the holes read, the review read, `generateRoundRecap`, `getTrendAnalysis`, and `getPlayerStandingForReview` all depend only on `id` and `roundData.player_id`, both known immediately after the initial round read. Wrap them in one `Promise.all`, each still wrapped in its own try/catch or `.error` check so a failure in one degrades that region only, exactly the pattern already used for the review read (`page.tsx:249-255`) and the qualifier reads. This is a named, required step, not an optional nicety: it is what keeps three additional reads from making an already slow, LLM blocking route slower, the exact class of problem `docs/design/fairway-facelift/REVIEW.md` row 31 already flagged on this route.
  - Thread the new data down as new `FairwayRoundDetailProps` fields: `trend: {points, benchmark} | null`, `girStanding: {teamAvg, pgaValue, pgaOmitted} | null`, `roundTeamId: string | null`.
- `src/components/fairway/pages/rounds/FairwayRoundDetail.tsx`
  - Accept the three new props above.
  - Add the sentence split helper and use it in the Verdict Stage's right column.
  - Add the GIR `StandingBars` row under the hairline in the Verdict Stage.
  - Add the `Trajectory` region (new `TrendChart`), gated on `trend != null && trend.points.length >= 4`.
  - Add `selectedHole` state, wire it to `Filmstrip`'s `activeHole`/`onScrub`, and mount the inline `DrillPanel` when a hole is selected.
  - Change the breakdown `StatMatrix` call to add `variant="plain"`.
  - Replace the `ScoringDistribution` plus `Pulse` sibling panels with one `InstrumentCluster balance="even"` wrapping them as `primary`/`secondary`.
  - Replace the `RxCard` Areas block with a plain header plus `InsetGroup` rows.
  - Optional, lowest priority: add the local, unexported sticky mini readout component and its sentinel.

### Files to create

None required. The optional sticky mini readout can stay as a local function inside `FairwayRoundDetail.tsx`; split it into its own file only if the team prefers smaller files, not required by this spec.

### Tests

- `src/components/fairway/pages/rounds/FairwayRoundDetail.test.tsx`: add cases for the sentence split helper (a decimal like "7.5 strokes gained" does not split, an ordinary two sentence recap does, a one sentence recap renders undivided), the GIR standing row's presence/absence when `girStanding` is null versus populated, the `Trajectory` region's gate at 3 versus 4 points, `Filmstrip` selection opening and closing the `DrillPanel` with the right hole's data, and the `InstrumentCluster` rendering Distribution alone when `pulseSeries.length <= 1`.
- `src/components/fairway/pages/rounds/__tests__/FairwayRoundDetail.round-type.test.tsx`: unchanged, still pins "Open full review," the round type editor, and coach note flows per the existing risk note in `round-detail.md`.
- A small server side test or manual check that the new `Promise.all` in `page.tsx` still throws on a genuine holes read failure (unchanged behavior, `page.tsx:230-237`) while degrading, not throwing, on a failure in any of the three new additive reads.
