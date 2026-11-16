# 2026-11-15 — stats (player)

## 2026-11-15 — The player charts tell the truth (CH-04 to CH-19)

```text
Design package: none (owner's stats and charts audit, 15 Nov 2026, section 5)
PR/commit:      claude/project-thread-szdz3m
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (each per-round point now carries its date, `ChSeriesPoint.at`, and the series its window figures, `ChSeries.avg`)
Held items:     colours and tokens (visual-system thread)
```

### Changed

- Scoring hero (`ScoringFeatureChart.tsx`): par sits inside the range on both
  sides, so a player under par in every round still sees the line (CH-16);
  rounds sit by date (CH-11); the five-round average is straight segments
  (CH-15).
- Phone ribbons (`ShsBlocks.tsx` Ribbon): score, greens and putts lines space
  rounds by date (CH-11).
- "What changed" (`shs-figures.ts`, `StatsPlayerPhoneShs.tsx`): rates draw as a
  length from zero; scoring and putts as dots on one span centred on the
  change, better to the right, and the header says so (CH-04, CH-14).
- Against before (`ShsBlocks.tsx` AgainstBefore): an arrow only for a clear
  change, the signed figure otherwise; the dumbbell runs better to the right
  for a lower-is-better figure (CH-19, CH-14).
- Score ticker (`MiniCharts.tsx`): a lower score sits higher on one range at
  least a round's spread wide, every mark one size, and "best" only when it is
  the only best (CH-04, CH-09).
- Round lines in the detail (`detail.tsx`): rounds by date; the dashed average
  is the headline's pooled figure (CH-11, CH-12).
- Colour means a real change: two standard errors (CH-05, shared).

### Why

- The owner's stats and charts audit (15 Nov 2026) found a clipped par line, a
  dumbbell and arrows that disagreed with the colour, bars scaled from a
  min-max range, and dated rounds spaced evenly.

### Verification

- Tests: `stats/__tests__/scoring-feature-chart.test.tsx`,
  `shs-blocks.test.tsx`, `shs-figures.test.ts`, `mini-charts.test.ts`,
  `mini-rails.test.tsx`, `detail.test.tsx`, `score-change-chip.test.ts`,
  `stats-summary-figures.test.ts`, `__tests__/stats-player.test.tsx`,
  `__tests__/stats-parity.test.tsx`.
- Screenshots: before and after in the PR description (W phone 402, C desktop
  1440).
