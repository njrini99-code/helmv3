# 2026-11-15 — stats (player)

## 2026-11-15 — Scorecard-only strokes gained leaves every average (SC-07, awaits the owner's approval)

```text
Design package: none (the existing sgPolicy switch; its words already ship)
PR/commit:      claude/project-thread-5yymil (PR #2536), its own commit
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none written; reads golf_shots to tell measured rounds from estimated ones
Held items:     none (owner approves the commit in review)
```

### Changed

- `sgPolicy.estimated` (`src/clubhouse/data/stats-sg-mix.ts`) is `exclude`:
  a round whose strokes gained was estimated from the scorecard keeps its
  score, putts and greens but gives no strokes gained to any figure, floor or
  trend. Where the window had any, the figure says how many rounds were left
  out ("2 rounds without shots left out").

### Why

- Stats and charts audit, SC-07: `sg_estimate_from_holes` credits 1.75 minus
  the putts on a hole, a 31.5-putt baseline that is not on the Tour scale, so
  mixing it into an average moves it by strokes no shot earned. The owner
  decides; reverting this one commit puts `include` back.

### Verification

- Vitest: `src/clubhouse/data/__tests__/sg-mix.test.ts` (both settings on
  Team stats and Ask's team read) and the Clubhouse, CoachHelm and golf action
  suites (mocked data).
- No screenshots: this cloud session has no signed-in staging state.
