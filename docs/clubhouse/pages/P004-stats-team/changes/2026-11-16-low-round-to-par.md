# 2026-11-16 — stats team

## 2026-11-16 — The season's low round is the lowest against par

```text
Design package: none (launch readiness 2026-11-15, DF-C-13)
PR/commit:      claude/project-thread-vledif-pa-data-23
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only)
Held items:     none
```

### Changed

- `data/stats-team.ts`: the season bests' low round is the round with the
  lowest score against par, with the lower score breaking a tie. A season
  with no to-par on any round still picks the lowest gross score.

### Why

- A 70 on a par-70 course was named ahead of a 71 on a par-72, and Team
  rounds' "Best" already picks by to-par, so the two pages disagreed.

### Verification

- `data/__tests__/most-improved.test.ts` has a case that fails with the
  gross pick. Not checked in a browser or on a device.
