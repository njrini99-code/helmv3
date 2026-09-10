# Round review (coach) v2 spec

<!-- Synthesized by the facelift design panel (three concepts, one judge) on 2026-09-10. -->

## Round review (coach), final spec

### Purpose
This is the coach's post-round instrument, not a scorecard. It has to answer, in order: what happened, how it happened (strokes gained, hole by hole, category by category), and what to do about it. It also has to survive the round the owner was actually looking at when he called it basic: a scorecard-only round with no holes and no computed strokes gained, which the code itself documents as 46% of the live set (`RoundStatReport.tsx:234`).

### First question
"What did this round actually come down to, and is that part of a trend or a one-off?"

### What already works and stays untouched
Verified in the live code, not assumed from the mockups:
- `RoundSGSummary` already renders first, above the score hero, with the comment "ahead of the score/filmstrip hero so the accuracy-forward number is the first thing a reader sees" (`FilmstripReview.tsx:449-458`). This spec keeps that ordering. Reversing it would undo a documented decision, so it is named here rather than silently changed.
- "The story" / "What to do next" / "Coach notes" already render as one bordered `Surface` with hairline seam rows, not three cards (`FilmstripReview.tsx:487-493`).
- "Where this sits" already renders as one bordered `Surface` of `StandingBars` seam rows, not four cards (`FilmstripReview.tsx:513-529`).
- `ReviewHero` (green score panel + `Filmstrip` + tap-to-open shot path) is a genuinely designed instrument already, not a generic card. It stays, with two edits below.
- `RoundStatReport.tsx` (the numbered stat document with denominators and sample sizes) is an explicit **non-goal**. It is shared with `/golf/dashboard/stats` and is a live tile-grid pattern, but it is owned by the `stats-polish` lane and used by another route; this spec does not edit its internals. It is reframed (moved behind a Sheet), never rewritten.

### What is actually broken (verified, not assumed)
- `ReviewBreakdown.tsx`'s `Section` helper (line 40) is `rounded-fw-md border border-border-subtle bg-surface p-4 shadow-soft ... hover:-translate-y-0.5` in a `grid md:grid-cols-2`, this is the literal hard-banned identical-card-grid, appearing five times, with a Front/Back block that nests THREE card layers (Section > half-row > `BreakdownMetric`). This is the one component on this screen a coach can point to and say "you just put basic cards down." It is round-review-only (no shared consumer), so it is safe to fully rewrite.
- Two live em dashes in user-facing copy: `ReviewHero.tsx:212` (`` `${headline}, ${breakdown}.` ``, the per-hole SG sentence) and `FilmstripReview.tsx:360` ("Season standing isn't available yet, it fills in...").
- Every instrument in the current build (`RoundSGSummary`, `Filmstrip`, the whole breakdown) goes empty on a scorecard-only round. Nothing on the page survives that case except plain text. That gap gets a fix below, not just an honest-empty notice.

### Winner and synthesis
Three concepts were scored 1-10 on thought, visuals, architecture, coachUtility, feasibility (see scores). The averages (Editorial-ledger 7.4, Data-visual 7.8, Spatial-workspace 7.4) are close, so three concrete constraints break the tie in favor of **Data-visual**:
1. The registry pins this screen's chronology to `Filmstrip` (`bestFor: 'a round hole by hole'`, `examples: ['Round review']`) and names this screen as the example for `GradeDots` and `StandingBars` too. The spatial-workspace concept deletes the Filmstrip and imports `ResizableWorkspace` (archetype D, status `new`, `avoidFor: 'mobile (renders center-only by default)'`) into this archetype C/E screen, the one move that fights the registry instead of using it.
2. `RoundStatReport.tsx` is shared with `/stats` and owned by another live lane; the data-visual concept's plan to merge it with `ReviewBreakdown` is the one part of that concept this spec does NOT take.
3. Data-visual keeps the existing page skeleton and adds instruments in place, the shape that is actually deliverable by one engineer in a week.

Grafts onto the data-visual spine:
- **From Editorial-ledger**: the numbered mono-index device (`01`, `02`, ...) for the rewritten breakdown region, so it reads as one flat ledger instead of a card grid, without inventing a masthead or touching anything else.
- **From Spatial-workspace**: moving the always-resting `RoundStatReport` behind an explicit, named action (a `Sheet`) instead of a permanent trailing card, the clean way to de-clutter a shared component without editing its internals.
- **New, not in any concept** (the blind spot the probe capture exposes): every instrument in all three concepts goes empty on a scorecard-only round. A season-trajectory `TrendChart`, reading OTHER rounds rather than this round's holes, is promoted from "nice chart" to load-bearing: it is the only new instrument that renders fully regardless of whether this round has holes or SG. It is gated only on round count (≥4 completed rounds, per `TrendChart`'s own `avoidFor`), never on this round's own data.

New primitives used: exactly two, `ScoringHistogram` and `DrivingDotStrip`, both already scoped by the data-visual concept, at the two-primitive cap. `Meter`/`RingGauge` were considered for a GIR%/FIR% headline gauge and dropped: `RingGauge`'s registry entry says `avoidFor: ['hero']`, and `Meter` needs a real "good" band (`avoidFor: 'no band or target to measure against'`), FIR% has none, and a GIR% gauge would just repeat what the new per-par/per-lie heat rows already show with more context. Nothing was invented to fill a slot that didn't need filling.

### 1440 grid (top to bottom)

**R0, ViewHeader** (unchanged component, two additions)
- `meta`: existing "CoachHelm AI" `StatusPill` PLUS a second `StatusPill` reading `round.round_type` ("Qualifier"/"Tournament"/"Practice"), verified real: `golf_rounds.round_type` exists (`supabase/migrations/20260824030000_allow_completed_round_reclassify.sql:175`, values `practice|tournament|qualifier`), already returned by the page's `select('*')`, just missing from the `RoundData` TS interface (one-line type addition).
- `secondaryActions`: a new ghost `Button` "Full breakdown" (opens the Sheet in R7). `ViewHeaderProps.secondaryActions` already exists ("clustered left of the primary action"), no primitive change needed.

**R1, Strokes Gained headline** (`RoundSGSummary`, unchanged): SG total hero `Readout` + `StrokesGainedTornado`, first, as it is today. Source: `round.strokes_gained_{total,tee,approach,around_green,putting}`. Omitted when `hasAnySG` is false (unchanged behavior).

**R2, Score & holes** (`ReviewHero`, one internal edit): green panel keeps score + to-par + `GradeDots` unchanged. The plain "Mix: 1 birdie · 9 pars..." text line is replaced by `ScoringHistogram` (NEW primitive #1): five horizontal bars (eagle/birdie/par/bogey/double+), width = count/max, green→amber tone. Source: `review.scoringDistribution.{eagles,birdies,pars,bogeys,doublePlus}.length`, the exact counts `buildMixLine` already reads (`buildReviewViewModel.ts:100-120`), same `totalScored === 0` gate. `Filmstrip` (unchanged) + the open-hole shot-path/PuttingZoom/shot-list block (unchanged) stay exactly as built. One copy fix: `formatHoleSgNarrative`'s em dash becomes a colon ("Lost 2.1 strokes here: 1.1 off the tee, 1.0 putting.").

**R3, Season trajectory** (NEW standalone section, bare band, no wrapping Surface, matches the "Where this sits"/"Round breakdown" bare-band convention): `TrendChart`, y = score-to-par, x = round date, last ~10-12 completed rounds, a `marker` on this round's point (tone success/danger by comparison to the trailing average), `benchmark` = the player's own trailing average score-to-par (computed client-side from the same fetched rows). Gated on `rounds.length >= 4` (registry `avoidFor: 'fewer than 4 points'`); omitted below that, never an empty chart shell. Source: NEW server action `getRoundReviewTrend(playerId, roundId)` added to `round-review-system.ts` (co-located with this file's existing access-verified actions, reusing its own auth pattern, never touching the separate `stats-data.ts`/`getPlayerRoundOptions`, which is shared elsewhere), selecting `id, round_date, score_to_par` from `golf_rounds` where `player_id = playerId AND status = 'completed'`, ordered by `round_date desc`, limited to 12, the exact verified query shape of `getPlayerRoundOptionsImpl` (`stats-data.ts:2267-2273`). Fetched in its OWN `useEffect` with its OWN loading flag in `page.tsx`, in parallel with the existing round/review/standing effects, never chained onto them (the exact mistake AUDIT perf row 15 already fixed once).

**R4, The story / What to do next / Coach notes** (unchanged Surface, unchanged content). One copy fix, in the sibling section below.

**R5, Where this sits** (unchanged Surface, unchanged content). Copy fix: "Season standing isn't available yet. It fills in once enough rounds are logged." (period, not em dash).

**R6, Round breakdown** (`ReviewBreakdown.tsx`, full rewrite, the actual card-grid removal): one bare band, `border-t border-b border-border-subtle`, NO per-row rounded/border/shadow/hover, a flat list of numbered rows (`01`-padded mono index eyebrow, matching the exact visual convention `RoundStatReport.tsx`'s own `Section` already uses, so the family resemblance is free and no shared file is touched):
  - **01 Off the tee**, `DrivingDotStrip` (NEW primitive #2): 18 dots, filled accent-500 (fairway hit), amber offset left/right (miss, biased by direction), warm-300 ring (par-3 / no fairway target). Source: `review.holeByHole[].fairwayHit` (boolean|null) + `.driveMiss` run through the existing `directionWord()` helper (`buildReviewViewModel.ts:124`), mapped to `'left'|'right'|null` (short/long/other misses render centered, not biased, an honest simplification, stated here). Mono annotation line underneath from the existing `buildDrivingPenaltyLines` text (unchanged function), demoted from a standalone bulleted list to a caption.
  - **02 Approach**, two `RampMatrix` heat rows (existing primitive, reused, not new): (a) cols `[Par 3, Par 4, Par 5]`, rows `[GIR%]`/`[FW%]` from `roundStats.girPctPar3/4/5` and `roundStats.fairwayPctPar4/5` (FW% has no Par-3 cell, renders the existing dash convention); (b) cols `[Fairway, Rough, Sand]`, row `[GIR%]` from `roundStats.girPctFromFairway/Rough/Sand`. This is the literal "GIR based on lie" / "FW% par4 vs par5" / "GIR par3/4/5" ask from the coach report already quoted in `RoundStatsPanel.tsx`'s own header comment, shown as heat cells here instead of only inside the Sheet's tile grid. Banded with the SAME `rampBandForValue([25,50,75])` helper `buildPuttingRamp` already uses (`buildReviewViewModel.ts`), one banding rule, not a new one.
  - **03 Front / back**, `DivergingBars` (existing primitive) replaces the 3-layer nested-card block. Rows: `{label:'Front 9', delta: frontScore - frontPar}`, `{label:'Back 9', ...}`, `display` via the canonical `formatToPar` (already re-exported from `buildReviewViewModel.ts:79`). `frontPar`/`backPar` computed from the `holes` prop already passed to `FilmstripReview` (`{hole_number, par}`), holes 1-9 vs 10-18. One mono caption line per half underneath carrying putts/GIR/fairways (`Front 9: 39 (+3) · 15 putts · 2/4 GIR · 1/4 fairways`, colon + middle-dot, no em dash), built from the existing `HalfStats`/`FrontBackRow` data already computed by `buildFrontBackRows`.
  - **04 Short game**, `RailBars` (existing, `shortGameRows`, unchanged data/logic), re-homed into the flat row, wrapper card removed.
  - **05 Putting**, existing `RampMatrix` (`puttingRamp`, by distance) beside the existing `PuttHeatmap` (by start position, via `useRoundPutts`, NOTE: this is `golf/coachhelm/v3/PuttHeatmap`, a distinct pre-existing component from the registry's `PuttingHeatmap` primitive, which is `avoidFor: ['one round']`; the distinction is called out here so it doesn't read as a new registry violation), unchanged internal `lg:grid-cols-2` composition, wrapper card removed.
  - **06 Momentum**, `TickerStrip` (existing, `momentum`, unchanged), re-homed.
  Whole-section gate (`showBreakdown`) extended with two new honest-empty predicates (`hasDrivingDotData`, `hasApproachHeatData`) alongside the existing four, so a truly scorecard-only round still hides the entire section rather than showing empty heat cells.

**R7, Full breakdown** (moved, not rewritten): `RoundStatsPanel` → `RoundStatReport` now renders inside a `Sheet` (existing primitive: `side="right"`, `mobileSide="bottom"`, `material="matte"`, `title="Full breakdown"`), opened by the R0 header button, instead of always resting inline at the page's end. `RoundStatReport.tsx` itself is untouched, same numbered categories, same `MetricCell` tiles, same `BreakMatrixTable`, it is reframed as an on-demand document, not a permanent trailing card, and stays byte-identical to what `/golf/dashboard/stats` renders.

**R8, Footer**: unchanged ghost "All stats" link.

### 390 flow
Same region order top to bottom, one column throughout:
- R0: title collapses into the AppShell top bar per `ViewHeader`'s existing mobile convention; both `StatusPill`s move to the eyebrow row; "Full breakdown" becomes a full-width seam row directly under the title (opens the same Sheet as a bottom sheet via `mobileSide="bottom"`).
- R1-R2: `InstrumentCluster`'s and `ReviewHero`'s existing stacked mobile behavior, unchanged. `ScoringHistogram` stacks full-width under the score numeral.
- R3: `TrendChart` at reduced height, fewer x-axis tick labels (existing `ChartFrame` responsive convention), omitted below 4 rounds, same as desktop.
- R4-R5: unchanged (already single-column).
- R6: the numbered rows stack full-width; `DrivingDotStrip`'s 18 dots wrap or compress to fit 390px (no horizontal scroll, dots shrink before they scroll, matching `Filmstrip`'s own narrow-viewport floor behavior); the two `Approach` `RampMatrix` tables each get their own `overflow-x-auto` (never the page); Putting's `RampMatrix`+`PuttHeatmap` pair stacks to one column (existing `lg`-gated behavior, unchanged).
- R7: Sheet opens as a full bottom sheet, large detent, `RoundStatReport`'s own existing phone layout, unchanged.

### Data mappings (every field, with source)
- `round.score_to_par`, `total_score`, `page.tsx` `RoundData`, `select('*')` on `golf_rounds` (existing).
- `round.round_type`, same `select('*')` row; add to the `RoundData` TS interface (currently selected but undeclared).
- `round.strokes_gained_{total,tee,approach,around_green,putting}`, existing, unchanged, feeds R1 (`RoundSGSummary`) exactly as today.
- `review.scoringDistribution.{eagles,birdies,pars,bogeys,doublePlus}`, existing `RoundReviewContent` field (`round-review-system.ts:144-151`), already consumed by `buildMixLine`; `ScoringHistogram` reads the same arrays' `.length`.
- `review.holeByHole[].fairwayHit`, `.driveMiss`, existing `HoleBreakdown` fields (`round-review-system.ts:104-126`), already flowing into `review.holeByHole`; NOT currently reaching `FilmstripHole` (`buildFilmstripHoles` drops them, `buildReviewViewModel.ts:161-168`), `DrivingDotStrip` reads `review.holeByHole` directly, bypassing `FilmstripHole`, so the shared `modules/types.ts` type is never touched.
- `roundStats.girPctPar3/4/5`, `.fairwayPctPar4/5`, `.girPctFromFairway/Rough/Sand`, existing `GolfStats` fields (`golf-stats-calculator-shots.ts:152-153,175-177,190-199`), already fetched by `page.tsx`'s `loadRoundStats` via `getDetailedStats(playerId, roundId)` and already passed to `RoundStatsPanel`, R6's Approach heat rows are a second, round-review-local consumer of the SAME already-fetched `roundStats`, no new fetch.
- `holes[].par` (front/back par sums), existing `FilmstripReview` prop (`{hole_number, par, yardage, score}`, sourced from `round.holes`/`golf_holes`), already passed down; new helper sums holes 1-9 / 10-18.
- `review.frontBackSplit` → `HalfStats` (`score, putts, gir, girTotal, fairways, fairwayTotal`), existing, already computed by `buildFrontBackRows`; reused for R6-03's caption line.
- Season trajectory rows, NEW: `getRoundReviewTrend(playerId, roundId)` in `round-review-system.ts`, `golf_rounds` select `id, round_date, score_to_par` where `player_id = playerId AND status = 'completed'`, ordered desc, limit 12 (verified-identical query shape to `stats-data.ts`'s `getPlayerRoundOptionsImpl`).
- `standing`, `coachNotes`, `promoteSuggestion`, `isCoachViewer`, all existing props, unchanged.

### Files to edit
- `src/app/golf/(dashboard)/dashboard/rounds/[id]/review/page.tsx`, add `round_type` to `RoundData`; add `fullBreakdownOpen` state + the R7 `Sheet` wrapper around `RoundStatsPanel` (remove its current inline render spot); add the R3 trend fetch effect (own loading flag, parallel to existing effects); add the R0 header `secondaryActions` button + second `StatusPill`.
- `src/components/golf/coachhelm/round-review/ReviewHero.tsx`, swap the plain mix-line text for `ScoringHistogram`; fix the one em dash in `formatHoleSgNarrative`.
- `src/components/golf/coachhelm/round-review/FilmstripReview.tsx`, fix the "Where this sits" em dash; thread the new `roundStats` prop down into `ReviewBreakdown` for R6's Approach heat rows (it is already fetched in `page.tsx`, just not currently passed to this component).
- `src/components/golf/coachhelm/round-review/buildReviewViewModel.ts`, add `buildFrontBackDiverging(split, holes)` (front/back par sums → `DivergingRow[]`) and `buildDrivingDotStripData(holeByHole)` (fairwayHit/driveMiss → dot states). Pure functions, fixture-testable like every other adapter in this file.
- `src/components/golf/coachhelm/round-review/ReviewBreakdown.tsx`, full rewrite: remove the `Section` card wrapper entirely; flat numbered `01`-`06` bare-band ledger as specified in R6.
- `src/app/golf/actions/round-review-system.ts`, add `getRoundReviewTrend(playerId, roundId)`, reusing this file's existing access-verification pattern.
- `src/components/golf/coachhelm/round-review/RoundStatsPanel.tsx`, no internal change; it now renders as `Sheet.Body` content instead of an inline `Surface`.

### Files to create
- `src/components/fairway/modules/ScoringHistogram.tsx` (+ its type in `modules/types.ts`), NEW primitive #1: `{buckets: {label, count, tone}[]}`, five horizontal bars.
- `src/components/fairway/modules/DrivingDotStrip.tsx` (+ its type in `modules/types.ts`), NEW primitive #2: `{holes: {n, fairwayHit: boolean|null, missSide: 'left'|'right'|null}[]}`, 18 dots.
- Both registered in `src/components/fairway/registry.ts` (archetype C, `bestFor`/`avoidFor` per this spec) so the next agent finds them before reinventing either.

### Tests
- `buildReviewViewModel.test.ts`, add cases for `buildFrontBackDiverging` (par sum from mixed-par-3/4/5 front/back, missing holes) and `buildDrivingDotStripData` (par-3 no-target holes, left/right/short/long miss mapping, null `fairwayHit`).
- `ReviewBreakdown.tsx` gets its own new test file mirroring `RoundStatReport.test.tsx`'s honest-empty-state pattern: every one of the six rows renders nothing (not an empty shell) when its source data is absent, and the whole section is omitted when all six are.
- Existing `ReviewHero.test.ts`, `RoundSGSummary.test.tsx`, `round-review-shots.test.ts`, `shot-strokes-gained.test.ts` stay green untouched (nothing in R1/R2's existing logic changes, only the mix-line render swap and one string literal).

### Risks (named, not hidden)
- `DrivingDotStrip`'s left/right bias is a simplification (short/long/unparsed misses render centered), stated in-spec so it is a deliberate, documented honesty choice, not a silent gap.
- R6's Approach heat rows and R3's trend chart both introduce a second consumer of already-fetched data (`roundStats`, and a NEW small query respectively), neither adds a redundant fetch of data already in hand, but both need the same honest-empty discipline the rest of this file already has (no fabricated 0% cells, no empty chart shell).
- The trend fetch must run in its own effect, parallel to the existing ones, or it reintroduces the exact AUDIT perf row 15 regression this page already paid down once.
- `ReviewBreakdown.tsx`'s rewrite touches a component with existing snapshot/behavior tests indirectly exercised through `FilmstripReview`, verify `showBreakdown`'s honest-empty gating still holds for the scorecard-only probe-capture round specifically (score 75, no holes) before calling this done.
