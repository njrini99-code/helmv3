# 2026-10-24 — CoachHelm: Momentum can say which way

## 2026-10-24 — The engine keeps the change's own error

```text
Design package: none (review of #2361, should-fix 1)
PR/commit:      agent/clubhouse-aplus-phase2
Contract IDs:   none
Actions:        none
Data impact:    golf_player_genome.vector gains an optional `se` on
                scoring_trend (jsonb, additive); rows fill on the nightly run
Held items:     none
```

### Changed

- The genome's scoring_trend stores the change's standard error, from each
  window's own spread over its rounds (Welch).
- Momentum tests the change against that error, so it can read Improving or
  Regressing. A row stored before has no `se` and keeps the conservative
  fallback, so it reads "No clear change" until the nightly run refreshes it.

### Why

- The fallback took each window at six rounds at most at the pooled spread,
  about 2.1 strokes, against a change capped at ±2: the word could never move.

### Verification

- `genome/__tests__/scoring-trend-se.test.ts`; `coachhelm-profile.test.tsx`
  adds rows with an `se`; the genome dimension and persistence suites pass.
