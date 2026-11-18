# 2026-11-15 — coachhelm

## 2026-11-15 — The Board's penalty strip reads the figures helper

```text
Design package: none (launch readiness 2026-11-15, DF-P-06 P1; Batch 3)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only; the strip reads golf_round_stats_cache instead of golf_rounds.total_penalties)
Held items:     none
```

### Changed

- `data/coachhelm-file.ts` `loadFilePenalties` picks its rounds through
  `loadSeasonRounds`, a year back like "Where the strokes go",
  then `figureWindowRounds`.
- Those are completed, never a test round, practice out, countable, eighteen
  holes, and only rounds with their holes (`holeRounds`).
- It reads each round's penalty strokes from its stats row (`roundCount(...,
  'penalties')`), the source My stats and Ask read.
- It draws the newest 8 that have a figure, oldest first. A round with no stats
  row is skipped, not drawn as 0.
- The earlier fix (prod audit PL-CH-03) had already taken out test and practice
  rounds.

### Why

- DF-P-06: the strip read the last 8 rounds of any length, so a nine-hole
  round's penalties sat beside eighteens.
- A round posted as a total showed `total_penalties` 0, a zero nobody recorded,
  and the source was not the one the other penalty
  figures read.

### Screenshots

- None: no layout changed. The values drawn are the counted rounds' own.

### Verification

- `data/__tests__/coachhelm-file-penalties.test.ts`: the input holds a nine, a
  total-only round, a practice round and nine eighteens,
  one of them without a stats row. The strip is the 8 newest eighteens with
  rows, oldest first, valued from the rows.
- `coachhelm-file-loader` and `coachhelm` suites.
- Not checked in a browser or on a device in this change.
