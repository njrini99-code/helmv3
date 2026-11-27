# P004 — Changelog

## 2026-11-27 — The shared trend average weighs a nine as half a round

```text
Design package: none (design lab pilot P3, QUEUE dsx-04, gap GAP-B1)
PR/commit: claude/project-thread-2f9vkq
Contract IDs: none
Actions: none changed
Data impact: the trend's average line moves only where its window holds a 9-hole round
Held items: none
```

### Changed

- The shared stats files this page draws from (`round-trend.ts`,
  `ScoringFeatureChart`) changed with P005's entry of the same date: the
  five-round average weighs a 9-hole round as half a round, and the
  feature chart's press and scrub run on the shared chart interaction.
  The team's own charts are unchanged.

### Why

- One nines rule for every figure on the stats pages (`NINES_LINE`).
