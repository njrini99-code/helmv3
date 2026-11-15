# 2026-11-15 — home

## 2026-11-15 — Home's hole rates come from each round's stats row

```text
Design package: none (launch readiness 2026-11-15, DF-C-16, DF-P-01; one figures helper, Batch 3)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only)
Held items:     none
```

### Changed

- `data/figure-window.ts`: the one figures helper. `figureWindowRounds` picks a
  window's rounds (newest N by date, ties by id, or the
  season from 1 August in the team's zone; eighteen holes unless asked for both
  lengths), `roundRate`, `roundCount` and
  `pooledRate` read hole rates from `golf_round_stats_cache` only, and
  `playerFigures` / `teamFigures` return a window's figures with
  `n`, `holeN`, `from` and `to`, so a label can say "Last 10 · Aug 22 to Nov 9 ·
  hole stats from 8".
- `data/leg-rows.ts`: the player's legs (fairways, greens, scrambling, putts,
  three-putts, sand) read each round's stats row, not the
  round header's `total_gir` / `total_fairways_hit` / `total_putts`, which the
  17 Oct GIR rule change left stale (DF-P-01).
- `data/home.ts` `teamForm`: the team's greens and putts read the same rows
  Stats reads (DF-C-16); the cache read covers the form's
  current and previous windows.

### Why

- My stats' table and Home's legs printed two different GIR figures for the same
  rounds: one read the stats rows, the other the
  round header.

### Verification

- `__tests__/home.test.tsx` (greens and putts come from each round's stats row),
  `__tests__/player-home.test.tsx`,
  `__tests__/home-data-completeness.test.ts`,
  `__tests__/stats-total-only.test.tsx`, `data/__tests__/figure-window.test.ts`.
- Not checked in a browser or on a device in this change.
