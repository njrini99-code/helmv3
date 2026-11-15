# 2026-11-15 — stats-player

## 2026-11-15 — My stats' bests, per-round lines and compare card read the stats rows the table reads

```text
Design package: none (launch readiness 2026-11-15, DF-P-01; one figures helper, Batch 3)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only)
Held items:     none
```

### Changed

- `data/stats-figures.ts`: `personalBests`, `perRoundSeries` and `windowCompare` take each round's stats row and read greens,
  fairways and putts from it through the one helper (`figure-window.ts` `roundRate`, `roundCount`, `pooledRate`), never the round
  header's `total_gir` / `total_fairways_hit` / `total_putts`.
- `data/stats-player.ts`: the stats-row read covers the previous window's rounds too, so the compare card's "previous" column
  reads the same source as its "last" one.

### Why

- My stats printed two GIR figures for the same rounds: the table read the stats rows, the compare card the round header, which
  the 17 Oct GIR rule change did not rewrite.

### Verification

- `__tests__/stats-parity.test.tsx` (a header that predates the GIR rule reads its row), `__tests__/stats-filter-data.test.tsx`
  (the compare card's earlier window reads its rows; bests list 18 and 9 holes apart on the rows), the Stats player suites.
- Not checked in a browser or on a device in this change.
