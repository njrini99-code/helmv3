# 2026-11-15 — coachhelm

## 2026-11-15 — Ask's figures are the one figures helper's, with hole rates from the stats rows

```text
Design package: none (launch readiness 2026-11-15, DF-P-01, DF-P-11; Batch 3)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only; one more read of golf_round_stats_cache per Ask figures call)
Held items:     none
```

### Changed

- `data/player-figures.ts`: Ask's player and team figures are `figure-window.ts` `figureSetOver` over the same window Stats cuts,
  so greens, fairways and putts come from each round's stats row (`golf_round_stats_cache`), never the round header's
  `total_gir` / `total_putts`. The second copy of the pooling and weighting is gone.
- `playerFiguresOver` and `teamFiguresOver` take the stats rows; `loadPlayersFigures` reads them once for every hole round the
  windows hold, and Ask fails the figures as a whole (null) when they cannot be read, rather than printing figures without rates.

### Why

- Ask printed greens and putts from the round header while Stats printed them from the stats rows, so the two could disagree for
  the same player and window.

### Verification

- `__tests__/player-figures-parity.test.ts` (a header that disagrees with its stats row: Ask and Stats both print the row's
  greens), `team-sg-parity`, `stats-production-parity`, `one-team-figure`, `cross-screen-figures`.
- Not checked in a browser or on a device in this change.
