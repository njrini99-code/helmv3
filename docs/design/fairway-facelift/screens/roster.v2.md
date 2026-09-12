# Roster (coach), /golf/dashboard/roster v2 spec

<!-- Synthesized by the facelift design panel (three concepts, one judge) on 2026-09-10. -->

## Roster (coach), /golf/dashboard/roster: final spec

## Purpose

Give a coach, at a desk on a 1440 laptop in the afternoon (or on a phone on the range later), one instrument that answers "how is my team doing" before it answers "who is on my team." Today the screen is a StatMatrix strip, an avatar list, and a spreadsheet-like table: three separate numeral clusters that repeat each other (the capture shows "8 Players" beside "8 Active focus," where the second number is actually a count of open focus areas, not of players, coincidentally equal). This spec replaces that with a stage that plots the whole roster against a real baseline, a ranked ledger that says who to talk to first and why, a board whose own kpi band finally carries the team totals as honest ratios, and a drill that surfaces a real player/team/tour comparison instead of a bare "Goals: 3 active" line.

## First question

How is my team doing right now, against a real baseline, and who do I need to talk to first.

## Winner and synthesis

Winner: Concept 1, "Editorial instrument panel." Its region order (masthead, stage, toolbar, board, inspector) is the only one of the three that both answers the owner's complaint and keeps every pinned test/copy string intact, because it keeps MatrixBoard's `expand` band rather than swapping to `onRowSelect` (Concept 3's approach). `MatrixBoardProps` documents that a row's `expand` and `onRowSelect` are mutually exclusive, so Concept 3 would have to delete the `expand` band and, with it, the pinned `", expandable row"` aria-label and the desktop-band/phone-Sheet split `roster.md` already specified, forcing a full rewrite of `FairwayCoachRoster.test.tsx`'s row-selection assertions for a screen with eight rows. Concept 3 also puts an 8-row daily scan inside `ResizableWorkspace`, an archetype-D workspace shell built for multi-pane triage-and-drill work, when the registry files this screen (via MatrixBoard) as archetype B, an operational board; the mismatch shows up as real cost (a persistent rail that duplicates board rows, a `renderMobile` tax to own the phone layout, an `InsightPanel` action vocabulary that does not cover "Message"/"Open profile" without a wrapper) for a benefit an 8-player team does not need.

Two grafts fix Concept 1's own flagged weaknesses and add the strongest single idea from the losing concepts:

1. Concept 1's stage centers the diverging plot on the team's own mean SG:Total. Every player in the current data is already below zero (-3.62 to -6.60); a mean-centered plot would paint the least-bad player green on "the good side" while the whole roster bleeds strokes against the field, which is the same hero-metric dishonesty dressed as a chart. `StandingBars`' own docstring is explicit that SG metrics are diverging against a *field* zero by definition. This spec centers the plot on zero (using `METRIC_RENDER_CONFIG.sg_total`'s real `[-2, 2]` domain as the floor, widened only if a real value exceeds it) and draws the team mean as a secondary tick, not the axis.
2. Concept 2's single strongest, best-verified finding: `standingByPlayer` (team average, team percentile, team_n, PGA/LPGA reference value) is already fetched per player in `roster/page.tsx` and today collapsed to one caption string, the rest of the object thrown away. Threading those fields onto `RosterPlayer` turns the row inspector's weakest moment ("Goals: 3 active") into a real `StandingBars` instrument with zero new queries. This is grafted into Concept 1's inspector region.

Declined explicitly (not by omission): Concept 3's `ResizableWorkspace`, persistent triage rail, and `InsightPanel` swap for `RowDetail`, for the reasons above. Concept 2's per-row `RankCell` and per-cell `DivergingBars`-in-a-board-cell, because the stage now carries the team-wide visual read the rank/mini-bars were trying to add at row level, and stacking a second, much narrower `DivergingBars` instance inside a ~90px board column compounds the same label-width risk the stage plot has to fix anyway. Concept 2's `RingGauge` pair for focus/rounds coverage, because the registry lists `RingGauge`'s own `avoidFor` as `"hero"` and two rings in a header block reads exactly as that.

## Regions

### 1. Masthead

Unchanged. `ViewHeader`: eyebrow "Roster," title "Your players.", the existing dynamic description, `FairwayInvitePlayerButton` as the one primary action. No data changes; no visual changes. This is the one canonical page-title pattern and none of the three concepts touched it.

### 2. Join requests

Unchanged. `FairwayJoinRequests` (built on `InlineNotice`), rendered only when `joinRequests.length > 0`. Zero footprint otherwise.

### 3. Performance stage (new region, replaces the header `Surface`)

The team-wide verdict, on hairline seams, not a card. Two panes on a 12-column band with one vertical hairline at column 7/8.

**Left pane (cols 1-7): the plot.** `DivergingBars`, one row per player with a non-null `sg_total`, zero-centered (the component's existing fixed center marker already IS zero; no change needed there). Label: last name. Delta: the player's real, signed `sg_total` (never inverted). Display: `formatSgTotal(sg_total)` (reused from `FairwayPlayerCard.tsx`, unchanged). Domain (`max`): `Math.max(METRIC_RENDER_CONFIG.sg_total.default_scale.max, ...players.map(p => Math.abs(p.sg_total ?? 0)))`, i.e. the metric's own real `2.0` floor, widened only for a genuine outlier, so eight tightly-clustered bars never fake a broken-chart full-width read. A secondary thin tick (new `referenceTick` prop, see Primitives) marks the team's own mean SG:Total on every row's rail, distinct from the fixed zero baseline. Caption above the plot, plain sentence, no em dash: "SG:Total against the field average of zero. Team average −4.87 across 7 of 8 players with a number." (the 8th, a player with no rounds, is honestly excluded and counted, never rendered as a false zero).

Rows are computed from the full `players` array, not the toolbar's filtered/sorted `board`, so a coach mid-search or mid-filter still sees the whole team's shape, not a partial one that looks smaller than it is. Rows are ordered by `sg_total` ascending (worst first), so the plot's top-to-bottom order roughly matches the ledger's own priority order beside it.

**Right pane (cols 8-12): the verdict and ledger.** This is a visual restyle of the existing `AttentionPanel`, not a rewrite: its heading ("Who needs your attention," pinned by `FairwayCoachRoster.test.tsx`), its verdict figure (`needsAttention.length`, mono, ink, unchanged), its sentence, its capped list, its "+N more" link, and its three honest empty-state branches (no roster / no rounds yet / "Roster's covered," all regex-pinned) are reused verbatim. What changes is presentation: each row in the capped list gains a two-digit mono priority numeral (01, 02, 03, the row's real triage rank) and the player's `FairwayYearBadge`, matching the board row's own year badge so the same player reads identically in both places. "Add focus area" button text is unchanged (pinned).

Hairline rules above (against the masthead/join-requests) and below (against the toolbar); no `Surface` wrapper anywhere in the band.

### 4. Toolbar

Unchanged from the current, already-fixed build: `Toolbar` bare frame, sticky matte-to-frost, `SearchField`, sort `Segmented`/phone Sort-Sheet button, `FilterPill` "Needs attention" with its existing count, export `IconButton`. No `appliedChips` addition in this pass (Concept 1's proposal to repurpose that slot as a permanent status line is scoped out; it would need a nod to the Toolbar owner and isn't needed to answer the owner's complaint).

### 5. Roster board

`MatrixBoard`, same six columns (`COLUMNS` unchanged: player, avg, trend, SG:Total, focus, signal), same row content, same `expand` band mechanism (kept, not replaced, per the winner-selection rationale above). What changes: `kpis` (currently `kpis={[]}`) is now populated with the four roster-health totals, reframed so two of them read as honest ratios instead of the false-twin bare counts visible in the capture:

- `{ label: 'Players', value: rosterHealth.totalPlayers }` (unchanged, an absolute headcount)
- `{ label: 'With focus area', value: '${rosterHealth.playersWithActive} of ${rosterHealth.totalPlayers}' }` (was: `rosterHealth.activeAreas`, a count of open AREAS, not players; the capture's "8 Active focus" next to "8 Players" was this exact confusion)
- `{ label: 'Completed', value: rosterHealth.completedAreas }` (unchanged, an absolute closed count, not a ratio worth reframing)
- `{ label: 'With recent rounds', value: '${rosterHealth.playersWithRounds} of ${rosterHealth.totalPlayers}' }`

These render in MatrixBoard's own existing kpi band (top strip inside the board's bordered frame), so the page carries one numeral cluster for team totals, not two.

### 6. Row inspector

`RowDetail`, rendered in MatrixBoard's inline `expand` band on desktop and the same content inside the existing phone `Sheet` (the `host` prop split is unchanged). New content, in order: a bare, compact `StandingBars` row first (player vs. team vs. field/tour for `sg_total`, using the same `METRIC_RENDER_CONFIG.sg_total` for `direction`/`metric_label`/`scale`, and the newly-threaded `team_avg`/`team_n`/`team_pct`/`pga_value`/`pga_omitted`/`is_womens` fields, with `viewer_context="coach"`); then the existing Goals count and `FairwayIntentControl`, now paired with a small `Readout` for handicap ("74.7 avg off a 2.1 handicap"); then "Open profile" as the block CTA (band: inline right; sheet: `Sheet.Footer`, both unchanged from today).

## Desktop grid (1440)

Inside the existing `mx-auto w-full max-w-[1200px]` container:

- Row 1: Masthead, full width, ~120px.
- Row 2: Join requests, full width, 0px or ~56px, conditional.
- Row 3: Performance stage, 12-col grid, `py-6`, `border-t`/`border-b` hairlines against the neighboring rows: cols 1-7 the plot (labels at `labelWidth=96`, reused from the same 96px the file already uses for its Sparkline track, so the plot's label column and the board's trend column read at one consistent scale), a `border-l border-border-subtle` at col 7/8 with left padding on the right pane, cols 8-12 the verdict and ledger.
- Row 4: Toolbar, sticky under the stage's bottom hairline.
- Row 5: MatrixBoard, full width, kpi band as its own top strip inside the board's frame, then the header row, then 8 player rows, each row's `expand` band opening the inspector in place beneath it.

## Phone flow (390)

1. Top bar with collapsed title; masthead description below it.
2. Join requests banner, conditional, full width.
3. Performance stage, single column, horizontal hairlines between blocks (not the desktop's vertical one): plot first (`labelWidth=64` so a longer last name still fits inside the narrower rail), then the verdict figure and sentence, then the ranked ledger capped at 3 with the "+N more" link.
4. Toolbar: search on its own line; "Needs attention" pill and "Sort · Name" button on the next line (unchanged, already fixed per `REVIEW.md`).
5. Board: kpi band as 2x2 (now showing "4 of 8" style ratios in the same cells the audit's phone pass already sized); rows compress to identity, avg+arrow, signal, plus the overflow menu (unchanged 940px behavior); a row tap opens the existing `Sheet` with the extended `RowDetail` (`StandingBars` in its documented `layout="compact"` mode, Goals+handicap+intent, "Open profile" pinned in `Sheet.Footer`).

## Primitives

**Existing, used as-is:** `ViewHeader`, `InlineNotice` (via `FairwayJoinRequests`), `Toolbar`, `SearchField`, `FilterPill`, `IconButton`, `Button`, `MatrixBoard`, `PlayerIdentity`, `Sparkline`, `SignalChip`, `TrendGlyph`, `FairwayYearBadge`, `FairwayIntentControl`, `FairwayPlayerActionsMenu`, `Readout`, `StandingBars`, `Sheet`, `EmptyState`.

**One extended existing primitive (not a new component, well under the two-new budget):** `DivergingBars` (`src/components/fairway/modules/DivergingBars.tsx` + its `DivergingBarsProps` in `types.ts`) gains three additive, backward-compatible props:

- `labelWidth?: number` (default `40`, matching today's hardcoded `grid-cols-[40px_1fr_42px]`; mirrors the precedent already set by `RailBarsProps.labelWidth`).
- `goodDirection?: 'higher' | 'lower'` (default `'lower'`, preserving every existing caller's current color mapping exactly: positive delta stays on the right in `fw-warning`, negative stays on the left in `accent-500`). Passing `'higher'` flips ONLY which side's color reads as good, never the geometry or the sign: a positive delta still renders on the right, now in `accent-500`; a negative delta still renders on the left, now in `fw-warning`. The printed `display` value is always the honest signed number regardless of this prop; nothing is ever inverted to force a bar in one direction.
- `referenceTick?: { value: number; label?: string }`: draws one additional thin tick (distinct from the existing fixed zero-line marker) at the given value's position on every row's rail, for a single shared reference like a team mean.

Also fixed in the same file: rows are keyed by `${index}-${row.label}` instead of the bare `row.label`, so two players sharing a last name no longer collide as React keys.

**New primitives created: zero.**

## Explicit declines (stated, not omitted)

- No `ResizableWorkspace`, no persistent triage rail, no `InsightPanel` swap for `RowDetail` (Concept 3). The screen is an 8-row daily scan (archetype B), not a multi-pane workspace (archetype D); the workspace's own cost (deleting MatrixBoard's `expand` band, rewriting the pinned `expandable row` aria-label tests, a `renderMobile` phone tax, wrapping `InsightPanel`'s narrower action vocabulary for "Message"/"Open profile") isn't worth its benefit at this roster size.
- No per-row `RankCell` column and no `DivergingBars`-in-a-board-cell for SG:Total (Concept 2). The stage now carries the team-wide visual read those additions were reaching for; stacking a second, much narrower diverging-bar instance inside a ~90px board column would need the exact same label-width fix the stage plot needs, twice.
- No `RingGauge` pair for focus/rounds coverage (Concept 2). The registry's own entry lists `avoidFor: 'hero'` for `RingGauge`; two rings in a header block is that case.
- No new permanent `Toolbar.appliedChips` status line (Concept 1's own flagged risk). Scoped out of this pass; the slot's documented contract is an applied-filter recall line, and repurposing it isn't needed to answer the owner's complaint.

## Typography, color, motion (kept minimal, no new tokens)

Typography: `font-fw-mono tabular-nums` for every number this pass touches (the plot's per-player deltas, the verdict figure, the ledger's priority numerals, the kpi band's four values, the drill's `StandingBars` rows), matching every existing number already on this screen. No new type role.
Color: one accent job. `accent-500` marks the good side of zero on the plot (and, via `goodDirection`, on the drill's `StandingBars`); `fw-warning`/`fw-warning-ink` marks the side to watch, matching the ledger's existing reason-text color and the board's existing `SignalChip` watch tone. No new hue.
Motion: none new. `DivergingBars`' existing width transitions, `MatrixBoard`'s existing row-expand accordion, `Toolbar`'s existing sticky-to-frost blend, and `StandingBars`' documented no-entrance-animation behavior are all reused unchanged, all already reduced-motion-safe.

## Implementation plan

**Files to edit (no new files needed):**

1. `src/components/fairway/pages/roster/FairwayCoachRoster.tsx`: replace the header `Surface` (StatMatrix + `AttentionPanel`) with the stage band (plot left, restyled `AttentionPanel` right, hairlines instead of a card); compute the plot's rows from `players` (unfiltered), not `board`; pass the four kpi values (two reframed as ratio strings) into `MatrixBoard`'s `kpis` prop instead of `[]`; extend `RowDetail` with the `StandingBars` row and the handicap `Readout`; add the priority numerals and `FairwayYearBadge` to `AttentionPanel`'s list rows.
2. `src/components/fairway/pages/roster/FairwayPlayerCard.tsx`: extend the exported `RosterPlayer` interface with additive optional fields: `sg_team_avg?: number | null`, `sg_team_n?: number`, `sg_team_pct?: number | null`, `sg_pga_value?: number | null`, `sg_pga_omitted?: boolean`, `sg_is_womens?: boolean`.
3. `src/app/golf/(dashboard)/dashboard/roster/page.tsx`: alongside the existing `standingTierByPlayer` loop (around the `standingByPlayer.get(pid)?.get('sg_total')` read), also read and pass through `team_avg`, `team_n`, `team_pct`, `pga_value`, `pga_omitted`, `is_womens` from the same already-fetched `PlayerStanding` row onto each player's payload. No new query; `loadPlayersStandingMap` is unchanged.
4. `src/components/fairway/modules/types.ts`: extend `DivergingBarsProps` with `labelWidth?`, `goodDirection?`, `referenceTick?` as specified above.
5. `src/components/fairway/modules/DivergingBars.tsx`: implement the three new props (color-mapping flip only, never a geometry/sign inversion) and fix the row key to `${index}-${row.label}`.
6. `src/components/fairway/pages/roster/FairwayCoachRoster.test.tsx`: add coverage for the stage plot (renders a bar per player with a real `sg_total`, honestly excludes/counts the one without), the reframed kpi band (asserts "4 of 8"-style text, not the old bare `activeAreas` count), and the drill's new `StandingBars` row and handicap readout; leave the existing pinned assertions ("Who needs your attention," "Add focus area," the `", expandable row"` aria-label pattern, "Needs attention" filter, "Roster's covered" regex) untouched and passing unmodified, since the `expand`-band mechanism and that copy are both kept verbatim.
7. `docs/design/fairway-facelift/screens/roster.md` and `roster.mobile.md`: update the written screen spec to describe the stage band, the reframed kpi band, and the drill's `StandingBars` row, so the docs this component's own header comment points at stop drifting from the code (the same drift class `AUDIT.md` already tracks for this screen).

**Data plumbing summary (source, for every field this pass adds or moves):**

- `sg_team_avg`/`sg_team_n`/`sg_team_pct`/`sg_pga_value`/`sg_pga_omitted`/`sg_is_womens`: already fetched in `roster/page.tsx` via `loadPlayersStandingMap(playerIds)` into `standingByPlayer`, currently read only as `standingByPlayer.get(pid)?.get('sg_total')` to build a single caption string (`teamCohortText`) and then discarded; this pass threads the rest of that same object onto `RosterPlayer`.
- The plot's and drill's domain/label/direction (`[-2, 2]`, "SG: Total," `higher_better`): `METRIC_RENDER_CONFIG.sg_total` in `src/lib/coachhelm/v3/standing/metric-config.ts:35`, one source of truth instead of a second hardcoded copy.
- The kpi band's four values: `computeRosterHealth` in `roster-health.ts` (already computed, already passed into this component today; only the render target moves from the old header `StatMatrix` to `MatrixBoard.kpis`, and two of the four are reformatted as ratio strings from fields already on the same object).
- Everything else (avg_score, recent_scores, rounds_count, active_focus_areas, active_goals, graduation_year, recent_trend/signal, handicap): unchanged, all already on `RosterPlayer` per `FairwayPlayerCard.tsx`, all already rendered somewhere on this screen today.

**Estimated effort:** about 3.5 engineer-days: 1 day for the `DivergingBars` prop extension and its own tests, 1 day for the stage band's layout and the `AttentionPanel` restyle, 0.5 day for the kpi-band reframing, 1 day for the standing-field threading (`page.tsx` + `RosterPlayer` + the drill's `StandingBars` wiring) and its tests.

## Open risks (carried forward honestly)

- The stage plot's row order (worst SG:Total first) and the ledger's priority order (declining-and-uncoached first) are two independent sorts that will usually, but not always, agree; if a design review finds the mismatch confusing, the fallback is to sort the plot by the same priority the ledger uses rather than by raw SG:Total.
- `DivergingBars`' label column, even with the new `labelWidth` override, is a fixed pixel value, not a responsive one; a genuinely long last name at the phone width may still need a smaller `labelWidth` than the 64px specified here. Worth a real check against the roster's longest name before shipping.
- Threading six new optional fields onto `RosterPlayer` widens a type already imported by several files (per `FairwayCoachRoster.tsx`'s own comment about `FairwayPlayerCard.tsx` staying a shipped, if unrendered-here, component); confirm no other consumer's exhaustive prop-shape test breaks on the addition.
