# P004 — Changelog

## 2026-11-24 — Shared file only: the player's scoring chart hold

```text
Design package: none (a production error fix)
PR/commit: health routine, agent/health-20261124-1847
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- Nothing on Team stats. `ScoringFeatureChart.tsx` also holds
  `TeamFeatureChart`, which is unchanged; the fix is the player's chart
  ([P005](../../P005-stats-player/changes/2026-11-24-scoring-chart-hold.md)).

### Why

- The file is named by both pages.

### Verification

- `scoring-feature-chart.test.tsx`: the team hero's own cases pass unchanged.
