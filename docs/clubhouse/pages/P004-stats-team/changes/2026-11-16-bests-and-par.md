# 2026-11-16 — stats team

## 2026-11-16 — Season bests ignore the filter; par is read honestly

```text
Design package: none (launch readiness 2026-11-15, DF-C-20, DF-C-21)
PR/commit:      claude/project-thread-vledif-pa-data-23
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only)
Held items:     none
```

### Changed

- `data/stats-team.ts` (DF-C-20): the season bests read the season's
  countable rounds, practice out, whatever the filter. They read the
  filtered basis before, so a Practice or All time filter could make a
  practice round the low round while the caption said the filter does not
  apply.
- `data/stats-team.ts` and `StatsTeamIslands.tsx` (DF-C-21): the trend
  chart's par line is each round's score less its to-par, averaged over the
  rounds with both. The average score less the average to-par read two
  different sets of rounds when a round had no to-par.

### Why

- Both figures said something the rounds behind them did not.

### Verification

- `data/__tests__/team-trend-whole-window.test.ts` has a case for each;
  both fail on the old code. Not checked in a browser or on a device.
