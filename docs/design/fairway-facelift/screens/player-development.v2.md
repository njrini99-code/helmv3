<!-- markdownlint-disable MD013 -->
# My development v2 — `/coachhelm?view=development` (player) · 390 and md+

Spec only. Builds on `player-development.mobile.md` (rows, sheets and the one-implementation fix are landed). Files: `src/components/fairway/pages/coachhelm/FairwayMyDevelopment.tsx` (both hosts), `development-parts.tsx`, `FocusAreaCard.tsx`, `GoalsSection.tsx` / `FairwayGoalCard.tsx`, `CausalWhyPanel.tsx`. The coach development view (`PlayersGridView`, the coach's `FocusAreaCard role="coach"`) shares FocusAreaCard and GoalsSection; every instrument below is specified so the coach persona can mount the same one with `role="coach"`, and nothing here changes the coach composition.

## The first question

"What should I work on right now, and is it working?" Today the page opens with the goals empty state and two suggestion rows; the first real progress figure is the third section. v2 opens on the one area that matters most, with its progress, its trend and its standing as visuals.

## Data the component already receives

- `activeAreas[]`, `completedAreas[]`, `proposedAreas[]` (`FocusAreaCardData`): title, area_type, target_metric, baseline_value, current_value, target_value, target_kind, target_date, target_rounds, started_at, completed_at, outcome_status, `progressHistory[]` (at, value, note), `snapshots[]` (date, value). `focusAreaTrendSeries(fa)` already merges the two into one oldest-to-newest series.
- `standingByMetric[metric_id]` (`PlayerStanding`): player_value, team_avg, team_n, team_pct, level_avg, level_pct, pga_value, pga_delta, pga_omitted. `standingForArea(fa, standingByMetric)` already resolves an area's standing.
- `goals[]` and `achievedGoals[]` (`FairwayGoalCardData`): goal.metric_id, title, started_at, ends_at, window_days, baseline_value, current_value, target_value, state, `snapshots[]` (date, value, team_avg) plus the goal's standing.
- `suggestions[]` (`GoalSuggestionView`): metric label, unit, suggested target, window days.
- `causalRelationships[]` (`CausalRelationshipRow`): cause, effect, relationship_type, strength (0 to 1), confidence (0 to 1), mechanism, dose_response, intervention_potential (0 to 1); `buildChains` derives `CausalChain` (metrics, hops, weakest confidence).
- `playerStats` (`AreaAutoFillStats`): rounds_played, avg_score, avg_putts, fairway_pct, gir_pct, scrambling_pct, and the per-metric optionals.
- `getMetricRenderConfig(metricId)` gives label, unit, direction and scale for any metric on the page.

Everything below is built from these. No new fetches.

## Stage

One `InstrumentPanel` (tone neutral; depth base with no bezel on the phone canvas inside the DrillPanel, depth raised at md+) at the top of the body, "Your next stroke". It shows the LEAD area: the active area whose `target_metric` has the highest `intervention_potential` among causal rows where it is the cause, falling back to the area with the lowest progress percentage, then the oldest. The rule is a pure helper (`pickLeadArea`) so the coach persona can reuse it per player.

- Readout: the area's current value in its metric unit (`Readout` size lg, `delta` = current minus baseline, direction from the metric config), label = the area title, unit line "target 68.5 by Oct 1" from target_value and target_date or target_rounds.
- Verdict from the trend series: "Up 4.2 since you started, 40% of the way." / "No reading since you started; log progress or play a round." Copy is player-voice; the coach mounts the same panel with the player's name.
- Instrument 1, progress rail: `ProgressTrack` (size md, tone active) whose rail runs from the baseline (empty) to the target (full) with the current value as the fill, labelled "46.5 now · 68.5 target". Progress is the existing `progressPct` math; nothing is recomputed.
- Instrument 2, trend: `Ribbon` over `focusAreaTrendSeries(area)` with the target as the dashed benchmark and the last point marked ("Last: 47.1 · Aug 31"). `minPoints` 2; with fewer the panel shows the rail only and the honest line above, never a flat ribbon.
- Instrument 3, standing: `StandingBars` (`frame="bare"`, layout compact, `viewer_context="self"`) for the area's metric when `standingForArea` resolves: You · Team · Tour as three labelled bars. Hidden (not placeholdered) when there is no standing.
- Actions: none in the panel. Tapping the panel opens the same `FocusAreaSheet` the rows open (Log progress and Mark complete live there). "New focus area" stays the one primary in the DrillPanel chip / page header.

## Instruments

1. Lead area stage: ProgressTrack + Ribbon + StandingBars, above.
2. Progress ladder: every active area as one aligned rail row (`ProgressTrack` size sm, pct label at the right) sorted by progress ascending, in one matte `InsetGroup` under the stage. This is the existing row list with the rails aligned to one column so the eye reads the ladder, not five separate rows. Each row still opens its sheet; the row's `Sparkline` (width 56) stays when the series has two or more points.
3. Plan shape: `SegmentBar` with parts Active · Completed · Proposed (counts; tone good for Completed, neutral otherwise), `primary` = Completed, takeaway "3 of 6 areas complete". Replaces the 2×2 StatMatrix and the md+ InstrumentPanel readouts as the one plan visual at every width. Hidden below two areas total.
4. Goal trajectory: for each active goal a `TrendChart` (variant line, height 160) of `goal.snapshots` value by date, the target as the dashed benchmark line and the last snapshot marked (`marker` on the last point). The latest `snapshots[].team_avg`, when present, goes in the takeaway ("Team avg 52.1"); a second plotted series would be a `TrendChart` extension (a `secondary` series prop) and is not assumed here. The goal card's current ProgressTrack and Sparkline become this chart at md+; on the phone the card keeps the rail and the sparkline, and the chart lives in the goal's sheet (tap the row). `achievedGoals` keep their rows.
5. Why your scores move as bars: `BarCompare` (signed off) of `causalRelationships` sorted by `strength`, label "Fairways hit to GIR", value = strength as percent, `highlight` on rows where `dose_response` is true, benchmark = none. Chains render first as the existing rows (they are paths, not magnitudes); the bar list replaces the six relationship cards at md+ and sits above the rows on the phone with the same row Sheet for detail. Confidence stays in the sheet's readouts; the bar encodes strength only, so one channel means one thing.
6. Metric standing for every area: the `StandingBars` block moves from the desktop FocusAreaCard body into the row Sheet on the phone (it is already in the bare card the sheet mounts). No change in data, only where it appears.

## Composition at 390 (stage host, inside the DrillPanel)

```text
DrillPanel   ← Home   Development            [msg]  [+ New focus area]
Stage (bare) YOUR NEXT STROKE
             46.5 putts made 3 to 5 ft   ▲4.2 since start
             "Up 4.2 since you started, 40% of the way."
             ▐███████░░░░░░░░░▌ 46.5 now · 68.5 target
             ╭── Ribbon, target dashed, last point dotted ──╮
             You   ▐██████░░░░ 46.5    Team ▐████████░░ 52.1    Tour ▐█████████▌ 68.5
Your plan    SegmentBar  active 3 · completed 3 · proposed 0   "3 of 6 areas complete"
Active areas InsetGroup (ladder): icon · title · meta · ▐███░░░▌ 40% · spark ›
             …
Goals        heading + one InsetGroup: goal rows (rail + spark) ›  · "Set a goal" when empty (InlineNotice, one action)
Suggests     InsetGroup rows (landed)
Why your scores move
             BarCompare (strength %, dose-responsive highlighted)
             chains as rows › (landed)
Completed    rows (landed)
```

Seam sections with eyebrow headings; the only bordered surfaces are the InsetGroups. The sheets are unchanged (`FocusAreaSheet`, `LogProgressSheet`, `CausalDetailSheet`) plus a goal sheet using the same settle pattern.

## Composition at md+ (page host and stage host, two columns from `md`)

```text
Header ─────────────────────────────────────────── [Message coach] [+ New focus area]
┌ Stage (7) raised ──────────────────────────────┐ ┌ Your plan (5) ───────────────┐
│ 46.5 ▲4.2  "Up 4.2 since you started…"         │ │ SegmentBar + takeaway        │
│ ProgressTrack lg · Ribbon · StandingBars       │ ├──────────────────────────────┤
│                                                │ │ Goals: TrendChart per goal   │
└────────────────────────────────────────────────┘ └──────────────────────────────┘
Active areas (7): FocusAreaCard rows with aligned rails   Why your scores move (5): BarCompare then chain rows
Suggestions (7)                                           Completed (5)
```

The coach view at md+ is untouched; when the coach persona adopts these instruments it mounts the same stage per selected player.

## Primitives

`DrillPanel` / `CoachHelmShell`, `InstrumentPanel` + `Readout`, `ProgressTrack` (page-local), `Ribbon`, `StandingBars`, `SegmentBar`, `TrendChart`, `BarCompare`, `Sparkline`, `InsetGroup`, `Sheet` (+Body/Footer), `InlineNotice`, `EmptyState`, `Skeleton`, `Button`, `IconButton`. New primitives: none. `getMetricRenderConfig` supplies labels, units and directions; no per-metric copy is hand-written.

## States

- No active areas: the stage becomes the proposed area (if any) with "Accept" as its one action, else the existing empty state with "New focus area"; the ladder and SegmentBar are hidden.
- Lead area with one reading: rail only and "No reading since you started; log progress or play a round."
- No standing for the lead metric: the StandingBars block is absent; the panel does not reserve its height.
- Goals empty: `InlineNotice` with "Set a goal" (the tall EmptyState card goes; GoalsSection takes a `variant="inline"` prop the coach board does not set).
- Load error: the existing error surface, unchanged.
- Loading (stage host): the stage view's skeleton (the `Skeleton` stack the sheet pattern already uses) draws the stage block and four ladder rows.

## Mobile rules

- 44 px: the stage is one press target (opens the lead area's sheet); ladder rows are `InsetGroup.Row` buttons; nothing smaller.
- Haptics: `fwHaptic('selection')` on opening any sheet (landed in `useFocusAreaSheet`; the goal and stage taps reuse it).
- Context preservation: sheets close back to the same scroll position; the lead area's identity is derived, not stored, so it cannot drift while a sheet is open.
- Sheets: matte; heavy children (the full FocusAreaCard, the goal TrendChart) mount after settle (360 ms fallback timer, landed pattern); the stage's Ribbon is not inside a sheet.
- Reduced motion: Ribbon, SegmentBar and TrendChart snap; ProgressTrack has no motion.
- Hydration: no dates are formatted relative to now; target dates use the UTC-pinned formatter; phone and md+ are CSS-gated.

## Implementation plan

1. `development-parts.tsx`: add `pickLeadArea(activeAreas, causalRelationships)` (pure, tested), `LeadAreaStage` (InstrumentPanel + Readout + verdict + ProgressTrack lg + Ribbon + StandingBars), `PlanSegmentBar(active, completed, proposed)` replacing `DevelopmentOverviewInstrument`, `ProgressLadder` (the ActiveFocusAreaList rows with the rail column aligned via a fixed rail width), `CausalStrengthBars(relationships)`.
2. `FairwayMyDevelopment.tsx`: mount the stage first in `body`; order stage · plan · ladder · goals · suggestions · why · completed; the md+ two-column grid.
3. `GoalsSection.tsx` / `FairwayGoalCard.tsx`: `variant="inline"` empty state; goal row + goal sheet on the phone (settle pattern); TrendChart of snapshots at md+ with the team_avg series when present. Coach board keeps its current variant.
4. `CausalWhyPanel.tsx`: add the BarCompare above the rows (phone) and in place of the relationship cards (md+); the detail sheet is unchanged.
5. Tests: `pickLeadArea` (intervention potential wins, then lowest pct, then oldest); the stage readout equals the lead area's current value; the ladder is sorted ascending; SegmentBar hidden below two areas; the goals inline notice pins "Set a goal". Keep the existing pins (Log progress inside the sheet only, "Dismiss" name, "Active focus areas" label).
6. Capture both hosts at 390 and md+ (probe: one stage, N ladder rows, zero inline Log progress buttons), coachhelm suites, ratchets, tsc; record in AUDIT and `memory/features/player-coachhelm-development.md`.

## Shared instrument identities (for the coach specs)

- Score trajectory: `Ribbon`, chronological series, last point marked with a corner readout, the subject's own average dashed. Player home and player rounds use it; the coach's player pages should mount the same.
- SG facets: `StrokesGainedTornado`, four rows, x = 0 field average.
- Standing: `StandingBars` bare compact (You · Team · Tour), never a dot on a rail.
- Distribution: `BandHistogram` (score bands here, standing bands on team pages).
- Progress: `ProgressTrack`, rail from baseline (empty) to target (full); ladders align the rail column.
- Plan shape: `SegmentBar` of state counts with one primary readout.
- Causal strength: `BarCompare` of strength, dose-responsive rows highlighted; confidence only in detail.

## RESULT (capture, this branch, player, 390 and 1440)

Landed in one commit. `/my-development` redirects to `/coachhelm?view=development`, so the two hosts are one capture (new capture slug `coachhelm-development`). Phone 5,660 px to 6,878 px: the stage, the strength bars and the mechanism sentences in the rows are the additions; nothing here is a box around a number.

1. Stage: a seam section, not one InstrumentPanel. The readout block (Readout lg in the metric unit, delta since the baseline captioned "since start", the metric and target line, the verdict, the rail from baseline to target with "46.5 now · 68.5 target" at its two ends) is the press target and opens the lead area's `FocusAreaSheet`; the `Ribbon` (target dashed, `markLast`, minPoints 2, readout below) is the section's one bezel outside the button, because the Ribbon renders its own panel (a panel in a panel is a card in a card) and its table toggle cannot sit inside a button. `StandingBars` bare compact under it when the standing resolves, nothing reserved when it does not. Depth base at every width; no raised `md`+ variant. With one reading the ribbon is absent and the verdict reads "No reading since you started; log progress or play a round." (the demo lead area is in this state: current equals baseline).
2. `pickLeadArea`: highest `intervention_potential` among causal rows whose `cause_metric` or `cause` is the area's `target_metric`, then lowest progress, then oldest `started_at`, then id. Pure, tested (three cases).
3. Ladder: `ladderOrder` (progress ascending, no honest bar last, title, index) orders both branches of `ActiveFocusAreaList`, which kept its name. The row's sparkline moved to the title line so every rail spans the same column, the pct label sits at the rail's right in a fixed-width cell, and "N% there" left the meta line.
4. Plan: `PlanSegmentBar` (Active neutral, Completed good as the primary readout, Proposed caution only when any; takeaway "3 of 6 areas complete" spoken, "50% completed (3 of 6)" shown). Hidden below two areas.
5. Goals: `GoalsSection variant="inline"`: a heading line with the active count and a secondary "Set a goal"; each goal a seam row (label, "now · target · ends <date>" from the UTC-pinned end date, never a day count; rail with pct; sparkline at two or more snapshots) opening a goal Sheet (bare `FairwayGoalCard` and the goal `TrendChart` mount after settle); from `md` a `TrendChart` per goal (variant line, height 160, the target dashed, the last snapshot marked, the newest `team_avg` in the takeaway, insufficient-data below two snapshots) behind a mounted `useMediaQuery` flag (false on the server and the first client paint, so no hydration flip and no hidden chart mounted on the phone) with a "Details" action opening the same sheet. Empty: an `InlineNotice` with the same titles and "Set a goal". Recent wins are rows. The default variant (coach board, vizlab, the existing test pins) is untouched.
6. Why: chains first (rows below `md`, cards from `md`), then `CausalStrengthBars` (the shared `BarCompare`, `labelWidth` 128, short labels "Fairways to GIR", strength as percent, dose-responsive highlighted, dynamic import) at every width, then the relationship rows at every width with type, dose-responsive and the mechanism sentence clamped to two lines. The six relationship cards are gone; confidence is in the detail sheet only.
7. `md`+: row 1 stage (7) | plan and any prescribed areas (5); row 2 ladder (7) | goals and suggestions (5); why and completed full width. The spec's third 7/5 row was tried: the completed card's one-line status cluster clipped "Bounce-back after bogey" to "Bounce-ba…" at seven columns, so both sections take the column.
8. Not done: the stage host's loading skeleton (the route's `loading.tsx` for PlayerCoachHelmHome) is unchanged; the coach persona does not mount the stage yet (the helpers are exported for it).
9. Checks: 8 new tests in `development-parts.test.tsx`, 2 in `GoalsSection.test.tsx`, 1 in `CausalWhyPanel.test.tsx`; every coachhelm suite green (FairwayMyDevelopment, GoalsSection, CausalWhyPanel, FairwayGoalCard, the three FocusAreaCard suites); tsc clean; eslint clean on the changed source (the capture script's pre-existing browser-global warnings aside).
