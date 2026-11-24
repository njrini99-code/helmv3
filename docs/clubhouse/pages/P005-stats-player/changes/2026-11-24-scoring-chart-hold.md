# P005 — Changelog

## 2026-11-24 — A finger held on the scoring chart reads the round

```text
Design package: none (a production error fix)
PR/commit: health routine, agent/health-20261124-1847
Contract IDs: CH-11, CH-15, CH-16 (unchanged), MOB-STATS-4
Actions: none
Data impact: none
Held items: none
```

### Changed

- `ScoringFeatureChart`: a touch held for 120 ms reads the nearest round. `pick` takes the chart and the finger's x instead of a
  pointer event, and the `as never` cast that hid the missing `currentTarget` from the compiler is gone.

### Why

- Production error 0822e4af (2026-11-20, the iOS app): the hold's timer passed `{ clientX }` where the code read
  `e.currentTarget`, so every still hold threw before it read a round. Only a sideways drag worked.

### Verification

- `scoring-feature-chart.test.tsx` "a finger held still reads the round under it": both cases threw the production TypeError
  before the fix and pass after it. Nothing drawn at rest changes, so there are no before and after stills.
