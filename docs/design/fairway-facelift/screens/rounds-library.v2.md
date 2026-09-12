# Rounds library (coach), /golf/dashboard/rounds v2 spec

<!-- Synthesized by the facelift design panel (three concepts, one judge) on 2026-09-10. -->

## Rounds library (coach), final spec

`/golf/dashboard/rounds`, coach role. File of record: `src/components/fairway/pages/rounds/FairwayRoundsLibrary.tsx`.

## Purpose

Replace the five equal StatMatrix boxes and the bare month-grouped ledger with a ranked instrument reading of the season plus a chronology that carries its own visual language, so a coach opens the page and reads a verdict, a cockpit, a spread, and a leaderboard before scrolling into the rows. Answers the owner directly: three distinct visual instruments (a swept dial, a diverging-bar spread, a rank list) instead of a card stack, a stage (the gauge cluster) instead of a KPI row, and a named region hierarchy (Masthead, Cockpit, Spread, Toolbar, Ledger, Leaders, Footer) instead of "basic cards down."

## First question

Is the team trending better this season, and who is actually leading it right now.

## Winner and synthesis

Winner: concept 1 (Editorial instrument panel). It scores highest on totals (41/50 vs 38 for concept 2, 35 for concept 3) because it is the only one of the three that ships zero schema changes, breaks no pinned test, and introduces at most one new primitive, while still answering "visuals/thought/architecture" with a ranked InstrumentCluster, a borderless DivergingBars spread, and a sticky leaderboard rail that none of the other concepts have. Concept 2's trend chart and strokes-gained tornado are the more ambitious visual set but require a `playerSelectFields` schema change in two query branches, deliberately break the pinned group-Sparkline test, and will render `insufficient-data` often on real rosters (the concept's own risk list admits this), that is not a four-day build. Concept 3's two-pane workspace is the boldest architecture but converts the row from a `Link` to a `<button>` (breaks every existing navigation-by-click test/flow), asks `ResizableWorkspace` to fight the ledger's own sticky month headers for the first time, and, tellingly, given the owner's exact complaint, leaves the five-box StatMatrix completely untouched.

Grafted from concept 2: a new row-level instrument (`MicroBar`, the one new primitive this spec adds) so the dominant object on the page, the ledger itself, still bare text and a pill today, carries a real visual per row, not just borrowed rail/leaderboard chrome above it. Corrected from the original pitch: it must not encode the same number the `StatusPill` already shows (raw score-to-par). It encodes the round's score-to-par against **that player's own season average score-to-par**, a fact nothing else on the row states, and it reuses the exact per-player memo the leaders rail already needs, so it costs nothing extra to compute.

Not grafted from concept 2: the TrendChart/StrokesGainedTornado/RailBars-distribution stack. Adding a second full chart of the same score series duplicates the seam header's own Sparkline (the file's own comment already forbids this: "NO separate scoring-trend chart... each month's own sticky seam header already carries a Sparkline... the ONE trend chart for the page"), and the SG tornado needs a schema change out of scope for this pass.

Not grafted from concept 3: the two-pane workspace/inspector. Real architectural idea, too large a behavior change (Link→button, keyboard row nav, a second selection state) for one engineer in a week on a screen that already has a working, tested click-through-to-detail flow.

## Verified data (every field, with source)

- `RoundLibraryRound`: `total_score`, `score_to_par`, `round_date`, `round_type`, `course_name`, `course_city`/`course_state`, `holes_played`, `total_putts`, `total_fairways`/`total_fairways_hit`, `total_gir`/`total_gir_possible`, `player.first_name`/`last_name`/`avatar_url`, interface at `FairwayRoundsLibrary.tsx:100-125`; selected server-side by `playerSelectFields` at `rounds/page.tsx:57-76`.
- `RoundStats` (`totalRounds`, `avg`, `best`, `avgToPar`, `underParPct`, `trend`), interface `FairwayRoundsLibrary.tsx:128-135`, computed at `rounds/page.tsx:192-227`.
- `scoreDelta` (last-minus-first of the whole chronological scored series), `FairwayRoundsLibrary.tsx:466-488` (`chronoScored`, `scoreSeries`, `seriesDelta`).
- `filterCounts.practice`/`qualifier`/`tournament` by `round_type`, existing memo, `FairwayRoundsLibrary.tsx:350-364`.
- `playerName()`, `FairwayRoundsLibrary.tsx:199-204`.
- `honestRange()`, `FairwayRoundsLibrary.tsx:214-238`.
- New client memo, `playerSeasonStats` (per-player avg `score_to_par` over the full `rounds` array, min 2 scored rounds to qualify): built the same way `playerOptions` already is (`FairwayRoundsLibrary.tsx:311-321`), just aggregating `score_to_par` instead of collecting names. Powers both the leaders rail leaderboard and every row's `MicroBar`. No new fetch.
- New client memo, `typeAvgToPar` (avg `score_to_par` per round type over `scopedRounds`, a type with 0 rounds in scope omitted): a small reduction over the same `scopedRounds` array already computed at `FairwayRoundsLibrary.tsx:336-347`.
- New tiny helper, `firstMonthLabel(rounds)`: mirrors `honestRange`'s own date parsing (`FairwayRoundsLibrary.tsx:214-238`) but returns only the earliest month's short label, for the masthead verdict sentence.
- Explicitly deferred (do NOT add to the plan): `strokes_gained_tee/approach/around_green/putting/total` exist on `golf_rounds` (confirmed `src/lib/types/database.ts:542-546`) but are not in `playerSelectFields`. Any per-round strokes-gained figure is a separate follow-up ticket, not part of this week's build.

## Regions (1440 desktop)

Grid: the existing content column stays `mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-6 md:px-6`. Regions stack in that column; the Ledger+Leaders row is the one place it splits into two tracks: `grid grid-cols-[minmax(0,1fr)_320px] gap-6` (ledger takes the remaining flexible width, the rail is fixed at 320px). No two adjacent regions share the same visual shape (bordered gauge deck → borderless hairline strip → bare toolbar row → matte ledger surface beside a raised spotlight card and a bare rank list).

### 1. Masthead, stage, named "Masthead"

Purpose: the one h1, now carrying a verdict instead of a label.
Visual: `ViewHeader` eyebrow "Team Rounds", H1 built from `firstMonthLabel` + `scoreDelta`, honest fallback to "The library." + the existing meta line when starved.
Data mapping: `rounds.length` -> round count; `firstMonthLabel(rounds)` -> start label; `stats.trend != null && scoreDelta !== null` -> gate (same 6-scored-round threshold `stats.trend` already uses); `scoreDelta` -> the shot count and direction word.
Copy template (not starved): "{totalRounds} rounds since {firstMonthLabel}. {abs(round(scoreDelta))} shot{s} {better|worse|even} than where the season started." (starved): "The library." + unchanged meta line.
Primitives: `ViewHeader` (existing, unchanged import).
Desktop: full width, row 1.
Phone: unchanged, `ViewHeader`'s own large-title-collapses-into-top-bar behavior.

### 2. Cockpit gauge cluster, stage, named "Cockpit"

Purpose: replace the five equal StatMatrix boxes with one ranked instrument: a focal dial, a two-item readout rail, a four-up footer of counts.
Visual: `InstrumentCluster` `balance="focal"`.
`primary`: `RadialGauge` `size="md"` `title="% under par"` `overline="SEASON"` `readoutLabel="of scored rounds"` `value={starved ? undefined : stats.underParPct/100}` `awaiting={starved}` `samples={stats?.totalRounds}` `minSamples={3}` `unit="rounds"`. No `benchmark` is passed (there is no honest comparison value in memory for it), which means the dial's tone resolves to `accent` (green) whenever it has a real reading and dims to the built-in honest awaiting state below 3 scored rounds. This is `RadialGauge`'s own verified behavior (`RadialGauge.tsx`: `onGoodSide` defaults `true` with no `benchmark`), not a fabricated "gaining" claim.
`secondary` (two `InstrumentPanel depth="base" padding="md"` panels, the exact composition already shipped in `FairwayEffectiveness.tsx:647-663`, which is the registry's own cited example for this primitive and proves multiple `InstrumentPanel`s inside one `InstrumentCluster` is the established idiom, not a violation of the registry's "avoid more than one per screen" note):

- `Readout size="lg" label="Avg score" value={stats.avg}` with `delta={{ value: scoreDelta, direction: scoreDelta<0?'up':scoreDelta>0?'down':'flat' }}` (Readout's own built-in `delta` slot, `Readout.tsx:100-102`; no separate `DeltaChip` needed).
- `Readout size="lg" label="Avg to par" unit="strokes" display={avgToParDisplay}` with `delta={{ value: toParDelta, direction: ... }}`.
Starved (<3 rounds): both readouts render `state="awaiting"` instead, the exact honesty convention `Readout` already ships.
`tertiary` (four `InstrumentPanel depth="base" padding="md"` panels, `Readout size="sm"`, no delta): "Rounds" = `stats.totalRounds`, "Best round" = `stats.best`, "Practice" = `filterCounts.practice`, "Tournament" = `filterCounts.tournament`.
Data mapping: `stats.underParPct`, `stats.avg`, `stats.avgToPar`, `stats.best`, `stats.totalRounds` from `RoundStats` (`rounds/page.tsx:192-227`); `scoreDelta`/`toParDelta` from `FairwayRoundsLibrary.tsx:487-488`; `filterCounts.practice`/`.tournament` from `FairwayRoundsLibrary.tsx:350-364`.
Primitives: `InstrumentCluster`, `RadialGauge`, `InstrumentPanel`, `Readout` (all existing, all already exported from `@/components/fairway`).
Desktop: full width; `balance="focal"` gives the dial column roughly 2fr against the ~1fr stacked rail; the tertiary row spans full width, 4-up.
Phone: `InstrumentCluster`'s own documented tier: dial first (full width), the two rail panels stack below it, the tertiary row stays 2-up in one grouped hairline ledger (never four separate full-width cards), this is already built into the primitive (`InstrumentCluster.tsx`, `TERTIARY_PHONE_GROUP`), zero new work.

### 3. By-type breakdown strip, section, named "Spread"

Purpose: a borderless footnote answering "where does the team actually lose or gain strokes, by round type." Earns a shape none of its neighbors have: no card, no surface, one hairline only.
Visual: eyebrow "AGAINST PAR, BY TYPE" over `DivergingBars` with 1-3 rows (Practice / Qualifier / Tournament), each `{ label, delta, display }` where `delta` = that type's avg `score_to_par` over `scopedRounds` and `display` = the signed 1-decimal string ("+3.6" / "-1.2"). A type with zero rounds in scope is omitted from `rows`, never shown as 0. `max` = the largest `|delta|` among the rendered rows.
Data mapping: new `typeAvgToPar` memo over `scopedRounds` (`FairwayRoundsLibrary.tsx:336-347`), grouped by `round_type`.
Primitives: `DivergingBars` (existing; `rows: DivergingRow[]`, `max: number` per `modules/types.ts:153-154`).
Desktop: full width, one top hairline (`border-t border-border-subtle pt-4`), no surrounding `Surface`.
Phone: identical, full width, same compact rows.

### 4. Toolbar, toolbar, named "Toolbar"

Purpose: search, player scope, round-type pills, Month/Week grouping. Unchanged.
Visual/primitives/desktop/phone: byte-for-byte the existing `Toolbar` composition at `FairwayRoundsLibrary.tsx:634-729` (`Input`, `Select`, `FilterPill`, `Segmented`, `Menu`). No edits to this region.

### 5. Ledger, stage, named "Ledger"

Purpose: the dominant object, unchanged in structure, now carrying one more honest visual per row.
Visual: unchanged `Surface` with sticky seam group headers (`FairwayRoundsLibrary.tsx:770-823`) and `FairwayRoundRow` lines, PLUS each row gains a `MicroBar` (new primitive, see below) beside the existing score/`StatusPill` cluster: `value = round.score_to_par - playerSeasonStats[playerName].avgToPar`, `domain=6`, `goodDirection="low"`, rendered only when that player has ≥2 scored rounds in `playerSeasonStats` (honesty gate; otherwise the row renders exactly as it does today, no bar).
Data mapping: `round.score_to_par` (`RoundLibraryRound`, `FairwayRoundsLibrary.tsx:108`); `playerSeasonStats` new memo (see Verified data above).
Primitives: `Surface`, `Sparkline`, `FairwayRoundRow` (edited to accept and render `MicroBar`), `EmptyState` (all existing) + `MicroBar` (new).
Desktop: left track of the 2-column row, `minmax(0,1fr)`.
Phone: full width, single column; `MicroBar` renders at a narrower fixed width (28px) beside the to-par pill, matching the row's existing mobile-condensed pattern.

### 6. Leaders rail, rail, named "Leaders"

Purpose: sticky companion context that survives the ledger scroll: the single best round in the current filtered scope, and a coach-only leaderboard by season avg score-to-par.
Visual: top, one `Elevated level="raise"` card: eyebrow "BEST OF THE SCOPE", course name, `Avatar` + player name, mono score + `StatusPill` to-par, date, the best (lowest `score_to_par`) round over `filteredRounds` (same computation the per-group `bestId` already does at `FairwayRoundsLibrary.tsx:436-443`, just over the whole filtered set instead of one group). Below a hairline: up to 5 rows, each `RankCell` (`{rank, of}`) + `Avatar size="sm"` + truncated name + right-aligned mono avg `score_to_par`, from `playerSeasonStats`, ranked ascending (lower avg-to-par first). If fewer than 2 qualifying players exist in the current scope (e.g. the coach has filtered to one player), the leaderboard sub-section renders one plain line, "Only one player in this view," instead of a one-row leaderboard, honest, no new component.
Data mapping: `filteredRounds` (`FairwayRoundsLibrary.tsx:366-373`); `playerSeasonStats` new memo.
Primitives: `Elevated`, `StatusPill`, `Avatar`, `RankCell` (all existing).
Desktop: right track, fixed 320px, `lg:sticky` with `top-[calc(var(--golf-mobile-header-offset)+var(--fw-hub-subnav-offset,0px))]`, the exact same CSS custom-property chain the ledger's own seam headers already use at `FairwayRoundsLibrary.tsx:773` (a static CSS `top: calc()`, not the JS `IntersectionObserver` `rootMargin` string-math that caused the Toolbar's route-error regression documented in REVIEW.md, different code path, verified safe). Vertical clearance for the floating "Ask CoachHelm" pill is already reserved page-wide by `dashboard/layout.tsx:88` (`md:pb-24` on the coach branch); no new clearance code needed, just confirm it in QA.
Phone: collapses to one tappable seam row directly above the ledger's first group header ("Best: {name}, {score} ({toPar}) at {course}") that opens a `Sheet` (bottom, detents) containing the same spotlight + leaderboard.

### 7. Footer, footer, named "Footer"

Purpose: honest manual pagination with a printed footnote.
Visual: unchanged "Show 30 more" `Button`, paired with a small tabular-mono footnote to its left: "Showing {visibleCount} of {totalGroupedRounds}" (both already computed, `FairwayRoundsLibrary.tsx:415-464`).
Primitives: `Button` (existing).
Desktop: centered within the ledger's `1fr` track only, does not span under the rail.
Phone: unchanged.

## Player-role fork (this file is shared coach/player)

`userRole === 'player'`: the Leaders rail region is not rendered at all (no spotlight, no leaderboard: ranking teammates is not meaningful for a player looking at their own rounds). The Ledger+Leaders grid collapses to a single column (`grid-cols-1`, no `320px` track) so the ledger simply runs full width. The Cockpit and Spread regions render unchanged (they already show a player's own stats/breakdown by round type). `MicroBar` on player rows compares the row's score-to-par against the player's own season average (the same `playerSeasonStats` memo, just always resolving to "self" since a player's `rounds` prop already contains only their own rounds).

## 390 phone flow (top to bottom)

1. `ViewHeader` collapsed title (verdict sentence truncates to the AppShell top bar per its existing behavior).
2. Cockpit: dial full width, two rail readouts stacked below it, tertiary counts 2-up in one grouped ledger (existing `InstrumentCluster` mobile tier, zero new code).
3. Spread: `DivergingBars`, full width, 1-3 compact rows.
4. `Toolbar`: search + filter-`Sheet` trigger, Month/Week folds into overflow `Menu` (unchanged).
5. One tappable "Best: ..." seam row (the collapsed Leaders rail) opening the spotlight+leaderboard `Sheet` on tap.
6. Ledger: sticky seam headers, rows each with `MicroBar` at 28px, unchanged otherwise.
7. Footer: "Show 30 more" + the showing-count footnote.

## Removals

- The five equal bordered `StatMatrix` cells (`FairwayRoundsLibrary.tsx:560-606`), replaced by the `InstrumentCluster`.
- Nothing reintroduces the already-removed desktop `TickerStrip` band; the dial and `DivergingBars` are new analytical instruments answering different questions, not that chart again.
- Nothing else is removed: `Toolbar`, the ledger `Surface`, `FairwayRoundRow`'s existing content, and month seam headers are reused unchanged; only their neighbors' shapes change.

## New primitives (1 of 2 allowed)

`MicroBar`, a small zero-centered inline bar for one signed stat inside a dense table/ledger row.
Props: `{ value: number; domain: number; goodDirection: 'low' | 'high'; width?: number /* default 40 */; height?: number /* default 6 */; label: string /* aria, e.g. "1.2 shots better than his average" */ }`.
Renders a sunken rail (`bg-surface-sunken`, same sunken-rail language `RailBars` already uses) with a fill growing from center toward `value`'s side, colored `accent-500` when `value` is on the good side of zero per `goodDirection`, `fw-warning` otherwise. File: `src/components/fairway/modules/MicroBar.tsx`, exported from `src/components/fairway/index.ts` and registered in `registry.ts` (category `data-viz`, archetypes `['B','E']`, `bestFor: ['a signed per-row stat inside a dense ledger/table row']`, `avoidFor: ['a standalone chart (use DivergingBars)']`, `replaces: ['a bare number with no visual scale']`).

## Registry documentation follow-up (not blocking, do in the same PR)

`RadialGauge`, `InstrumentPanel`, `InstrumentCluster`, `Readout` are tagged `material: 'green'`, `archetypes: ['C']` in `registry.ts`, which is stale: `instrument-panel.module.css` was already "repointed from a frosted-glass bezel to a calm, content-first matte card" and its base/raised backgrounds are `var(--fw-color-surface)`, the identical cream token the ledger's own `Surface` uses. There is no color clash mounting these on archetype E. Add `'E'` to each entry's `archetypes` array so the registry matches what the code already does.

## Files to edit

- `src/components/fairway/pages/rounds/FairwayRoundsLibrary.tsx`: replace the `StatMatrix` block (lines ~552-606) with the `InstrumentCluster` composition; add the `Spread` region (`DivergingBars`) below it; add the `playerSeasonStats` and `typeAvgToPar` memos and the `firstMonthLabel` helper; change the masthead H1 to the verdict template; wrap the Ledger+Leaders regions in the `grid-cols-[minmax(0,1fr)_320px]` row (collapsing to one column for `userRole === 'player'`); add the Footer's "Showing N of M" line.
- `src/components/fairway/pages/rounds/FairwayRoundRow.tsx`: add the `MicroBar` beside the score/`StatusPill` cluster, gated on the player having ≥2 scored rounds in `playerSeasonStats` (passed down as a prop, computed once in the parent).
- `src/components/fairway/registry.ts`: add `'E'` to `RadialGauge`/`InstrumentPanel`/`InstrumentCluster`/`Readout` archetypes; add the new `MicroBar` entry.
- `src/components/fairway/index.ts`: export `MicroBar` and its prop type.

## Files to create

- `src/components/fairway/modules/MicroBar.tsx` (the new primitive).
- `src/components/fairway/modules/__tests__/MicroBar.test.tsx` (fill direction, aria-label, reduced-motion no-op since it has no animation to guard).

## Data plumbing

No new fetch, no schema change, no new query branch. `playerSeasonStats` and `typeAvgToPar` are pure client `useMemo`s over data already in `rounds`/`scopedRounds`, following the exact pattern `playerOptions` and `filterCounts` already use in this file. `firstMonthLabel` is a pure function mirroring `honestRange`'s own date parsing.

## Tests

- `FairwayRoundsLibrary.test.tsx`: update any assertion tied to the removed `StatMatrix` markup/labels to the new `InstrumentCluster` region; the pinned "Filter rounds by player" aria-label and the group `Sparkline` are untouched by this spec (neither the `Toolbar` nor the seam headers are edited), so those existing assertions should keep passing unmodified, re-run to confirm.
- `FairwayRoundRow.test.tsx`: add a case for the row's `MicroBar` present/absent (qualifying vs. <2-round player), and confirm the existing Link/navigation assertions are untouched (this spec never turns the row into a button).
- New `MicroBar.test.tsx` as listed above.

## Effort

4 days for one engineer: cockpit cluster + spread (day 1), leaders rail + best-of-scope + leaderboard memo (day 2), `MicroBar` primitive + row wiring + player-role fork (day 3), polish, registry doc fix, tests, phone Sheet for the collapsed rail (day 4).

## Result (shipped 2026-09-10)

Shipped as specified. All seven regions built: Masthead verdict sentence,
Cockpit `InstrumentCluster` (focal `RadialGauge` + two-item `Readout` rail +
four-up tertiary), borderless `DivergingBars` Spread, unchanged Toolbar,
Ledger with per-row `MicroBar`, coach-only Leaders rail (desktop sticky +
phone collapsed `Sheet`), and Footer with the "Showing N of M" footnote.

**New primitive**: `MicroBar` (`src/components/fairway/modules/MicroBar.tsx`),
exported from the `modules`/root barrels, registered in `registry.ts`
(`category: 'data-viz'`, `archetypes: ['B', 'E']`, `status: 'new'`). Covered
by `src/components/fairway/modules/__tests__/MicroBar.test.tsx` (fill
direction/color for both `goodDirection` values, a zero value's flat rail,
the `role="img"`/`aria-label` contract, and a reduced-motion no-op check —
the primitive draws a static fill with no animation to guard).

**Deviations from the literal spec text, with reasons**:

- The Cockpit's two secondary `Readout` delta lines are gated on the SAME
  6-scored-round `hasScoreTrend`/`hasToParTrend` honesty threshold the old
  "Scoring trend" pill used (not merely "not starved"), rather than passing
  `delta` unconditionally as the spec's inline snippet showed. The spec's own
  opening paragraph frames this Cockpit as replacing that gated pill, and the
  file's established honesty convention (documented in its own header
  comment before this pass) already drew that exact line — passing a delta
  unconditionally would have shown a trend arrow off as few as 3 scored
  rounds, weakening that convention rather than replacing it 1:1.
- The Footer's "Showing N of M" footnote is gated on `hasMoreRows` (shown
  only alongside the "Show 30 more" button), rather than always-on. The spec
  describes it as "paired with the unchanged Button," and the Button itself
  has always been conditional — pairing the footnote to a state that isn't
  showing would be inventing a new always-visible UI element the spec never
  asked for.
- The Leaders rail's leaderboard "current scope" narrows on the coach's
  player Select only, not the free-text search (which also matches course
  names and would otherwise reshape the player ROSTER by an unrelated
  field). The spec's own example ("the coach has filtered to one player")
  names the Select, not the search box.
- `MicroBar`'s two responsive sizes (28px phone / 40px desktop, per spec) are
  two gated instances (`md:hidden` / `hidden md:inline-flex`) rather than a
  single instance with a responsive width prop — the same pattern this file
  already uses for the Month/Week Segmented-vs-Menu split, and simpler than
  plumbing a breakpoint-aware prop through a primitive whose fill math is
  already percentage-based (the pixel width only sets the rail's own size).
- The Sheet's phone trigger uses the Fairway `Button` (`variant="secondary"`)
  wrapping one pre-composed flex span, not a bare `<button>` — the repo's
  `helm/no-raw-button` lint rule flagged the raw element; `Button`'s
  `secondary` variant (matte surface + hairline + hover tint) already reads
  as the intended quiet tappable row.

**Verification**: `eslint` clean on every changed/new file (0 errors,
0 warnings after the Button fix). Targeted vitest
(`src/components/fairway/pages/rounds src/app/golf/(dashboard)/dashboard/rounds
src/components/fairway/charts src/test/static`): 400/401 passing; the one
failure (`fairway-facelift-ratchets.test.ts`'s registry-coverage ratchet) is
two OTHER concurrently-shipped components (`ScoringHistogram`,
`DrivingDotStrip`) missing their own registry entries — not this file's
`MicroBar`, which was added and passes. Tree-wide `tsc --noEmit`: zero errors
in any file this task touched (the errors present in the run belong to other
agents' concurrent work in this shared worktree — `FairwayCoachDashboard.tsx`/
`.test.tsx`, `buildReviewViewModel.ts`). Both pinned tests named in this spec
(`FairwayRoundsLibrary.test.tsx`'s honest-meta-line assertion and the
group-`Sparkline` coverage) pass unmodified.

**Captures**: `ui-intelligence/facelift/captures/coach/rounds__desktop__full.png`
(+ `__fold.png`) and `rounds__phone__full.png` (+ `__fold.png`), both
re-captured after the rebuild and reviewed frame-by-frame — verdict masthead,
dial + rail + tertiary cockpit, diverging Spread, per-row `MicroBar` at both
widths, the sticky desktop Leaders rail, and the phone collapsed "Best: …"
row all render as specified with no layout overflow or pill-flow regression.

**Left undone**: nothing from this spec's scope. The registry documentation
follow-up for `RadialGauge`/`InstrumentPanel`/`InstrumentCluster`/`Readout`
(adding `'E'` to their `archetypes`) shipped in the same pass, as the spec
allowed ("not blocking, do in the same PR").
