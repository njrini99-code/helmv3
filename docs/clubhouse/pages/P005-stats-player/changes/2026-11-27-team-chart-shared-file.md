# P005 — Changelog

## 2026-11-27 — No change to the player's chart (shared file)

```text
Design package: none
PR/commit:      agent/presentation-gate-green
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- None on this page. `ScoringFeatureChart.tsx` also holds the team chart,
  whose first dot and axis figures now draw inside it (see P004's
  `2026-11-27-chart-marks-inside.md`). The player's `ScoringFeatureChart` is
  unchanged.

### Why

- The file is shared with P004, so the changelog gate asks both pages.

### Verification

- `scoring-feature-chart.test.tsx` passes for both charts.
