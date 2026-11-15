# 2026-11-15 — stats (team)

## 2026-11-15 — The team charts tell the truth (CH-01 to CH-24)

```text
Design package: none (owner's stats and charts audit, 15 Nov 2026, section 5)
PR/commit:      claude/project-thread-szdz3m
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads `toPar`, `toParMean` and `days[].toPar` when the loader sends them; until then the charts draw strokes as before)
Held items:     the loader's to-par series (data thread, PR #2534); colours and tokens (visual-system thread)
```

### Changed

- Team trend (`StatsTeamIslands.tsx` TeamTrend): the scoring lens plots each
  week against par per 18 with par at 0, labelled Par; raw strokes stay in the
  readout (CH-01). Lines are straight and break across a week with no rounds
  (CH-15); a player's week between two empty weeks is a dot that takes the
  pointer, so a player who plays every other week stays on the chart. A
  change needs four weeks and the same players on both halves (CH-10). Each
  player's end bar prints its signed figure, and with no reference there are
  no bars (CH-20). Week names thin to a least gap, and the axis keeps to about
  five ticks (CH-21).
- Team tape (`TeamTape.tsx`): a flat series draws at mid-height, every cell of
  a figure shares one scale at least two standard errors of a week wide, weeks
  sit by date, the line breaks across empty weeks with a dot for any week
  between two empty ones, and the end dot sits outside the stretched drawing
  so it stays round (CH-06, CH-11, CH-15, CH-23).
- Figure gauges (`charts.tsx`): strokes gained and par on one fixed ±6 scale;
  putts carry no gain or loss colour (CH-13).
- Putting rings and the Team putting bars: graded on the Putting bands chart's
  rule (30 putts, the rate against the Tour), every band drawn (the bars cut
  the sixth, 25+ ft, while the note named it); the note under them uses the
  same rule (CH-18).
- Phone (`StatsTeamPhoneShs.tsx`, `ScoringFeatureChart.tsx` TeamFeatureChart,
  `ShsBlocks.tsx` Ribbon): round days sit by date; against par per 18 with a
  Par line when every day has a figure against par, strokes against the days'
  average otherwise (CH-01, CH-11).
- Round lines in the detail (`detail.tsx` RoundLine via `GameMore.tsx`,
  `RoundsExtra.tsx`): rounds by date, and the dashed average is the headline's
  pooled figure, not a mean of each round's percentage (CH-11, CH-12).
- Green diagram (`OverviewZones.tsx`): each arc's weight runs from nothing at
  0%, with no cap that hides the difference past 46% (CH-22).
- Colour means a real change: two standard errors, the rule course history
  already used (CH-05, shared `lib/stats-signal.ts`).

### Why

- The owner's stats and charts audit (15 Nov 2026) found charts that said
  "against par" over raw strokes, coloured noise as change, scaled bars from a
  min-max range or a floor, and spaced dated rounds evenly.

### Verification

- Tests: `stats/__tests__/team-trend.test.tsx`, `team-tape.test.tsx`,
  `honest-deltas.test.tsx`, `putting-rings.test.tsx`,
  `scoring-feature-chart.test.tsx`, `shs-blocks.test.tsx`, `detail.test.tsx`,
  `chart-labels.test.tsx`, `__tests__/strokes-gained.test.tsx`,
  `__tests__/stats-tape.test.tsx`.
- Screenshots: before and after in the PR description (W phone 402, C desktop
  1440).
