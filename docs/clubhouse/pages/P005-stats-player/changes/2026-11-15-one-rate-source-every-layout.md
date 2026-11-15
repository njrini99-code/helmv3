# 2026-11-15 — stats-player

## 2026-11-15 — Desktop, phone and Game detail print one greens, fairways, scrambling, sand and putts figure

```text
Design package: none (launch readiness 2026-11-15, DF-C-02 P0; one figures helper, Batch 3)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only)
Held items:     none
```

### Changed

- `data/stats-weight.ts` `withRoundRates`: the shot calculator's greens, fairways, scrambling, sand saves, putts and three-putts a
  round, and the counts printed beside them, are restated from `figure-window.ts` `figureSetOver` over the same window (each round's
  stats row). Its shot-level splits (by par, by club, miss directions, putts by distance) stay its own.
- `data/stats-player.ts`: the profile's `stats` passes through it, so the phone's key figures and glance tiles (`shs-figures.ts`),
  Game detail, GameMore and the overview's "saves N in 100" line read the number the desktop comparisons read.

### Why

- DF-C-02: the same player's greens, putts and "saves N in 100" differed between the desktop comparisons (stats rows) and the phone
  tiles (the calculator), because two calculators counted the same holes under different rules.

### Screenshots

- None: no layout changed. A figure moves only where the two sources disagreed, and the test below pins which one now prints.

### Verification

- `__tests__/stats-one-rate-source.test.ts`: a calculator made to disagree with every stats row (80% greens against 50%); the
  comparisons, `stats`, the phone's key figures and glance tiles all print the stats rows' 50%.
- The 42 Stats player and parity suites (`stats-parity`, `stats-production-parity`, `stats-player`, `game-detail-floors`, ...).
- Not checked in a browser or on a device in this change.
