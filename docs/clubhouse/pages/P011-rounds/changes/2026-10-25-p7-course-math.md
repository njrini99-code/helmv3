# 2026-10-25 — Rounds: the course and round-review math (P-7, slice 1)

## 2026-10-25 — Pure modules for the course page and the review

```text
Design package: P-7 build plan (course page and round review stats)
PR/commit:      feature/p7-course-review-stats
Contract IDs:   none yet (no UI in this slice)
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `data/course-key.ts`: a course is grouped by library id, then by normalized
  name (a name-only round joins the one id its name maps to); its page key and
  address. Named `groupCourseRounds` so it is not confused with the course
  picker's `groupCourses` (setup/shape.ts).
- `data/stats-extra.ts`: bounce-back, putts per green hit, the closing three,
  big numbers, play order from the start hole, and the player's usual for each,
  said only past its floor.
- `data/course-history-shape.ts`: a hole's average and tint (red family under
  par, amber over, level inside one standard error), the costly and best
  three-hole stretches, how the course plays against the player's others, and
  the average running score.
- `data/record-marks.ts`: up to two record chips against the current history,
  and the same-tees rule for drawing one round over another.
- `round-insights.ts`: `turningStretch`, where the round turned.

### Why

- P-7 slice 1: the numbers first, tested, before any screen draws them.

### Verification

- Five new test files, 27 tests. `POOLED_HOLE_SD` (0.9) is inferred, as the
  plan says; re-estimate it from data after launch.
