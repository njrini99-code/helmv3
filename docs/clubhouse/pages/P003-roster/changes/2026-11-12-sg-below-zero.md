# P003 Roster — 2026-11-12

## 2026-11-12 — The page head says once why the cards' strokes gained sits below zero

```text
Design package: none (owner decision Q1, 12 Nov 2026)
PR/commit:      agent/preview-fixes
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `screens/roster/Roster.tsx`: when any player has a strokes gained figure, the
  head's line ends with `sgBaseline(tour).whyNamed` ("Strokes gained is measured
  against PGA Tour pros, so below zero is normal for nearly everyone else."):
  once for the page, not on each card.
- `data/roster.ts`: `sgTour`, the team's tour, beside `sgVs`. The phone roster
  shows strokes gained only when sorted by it and has no head line, so it is
  unchanged.

### Why

- Q1: keep the PGA Tour baseline and say what it means, once and quietly, so a
  coach does not read every negative as broken numbers. The sentence and where
  it goes: `docs/clubhouse/changes/2026-11-12-sg-below-zero.md`.

### Verification

- `src/clubhouse/lib/__tests__/sg-below-zero.test.ts`; the page's own suites
  pass unchanged.
