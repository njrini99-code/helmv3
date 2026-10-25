# 2026-10-25 — Rounds: how the course plays, and the round here (P-7, slice 7)

## 2026-10-25 — The course against the player's others, and its average arc

```text
Design package: P-7 build plan, 4.2.5, 4.2.6, 7.2
PR/commit:      feature/p7-course-review-stats
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `HowItPlays.tsx`: one sentence ("Finley plays 1.6 shots harder for you than
  your other courses", or about the same, or what it needs), the sample line,
  and the rows past their floors: the nines, par 3s, 4s and 5s, the most costly
  and the best three-hole stretch (each picks its hole on the map), and
  qualifiers against practice.
- `CourseArc.tsx`: the average running score to par here on the stage, with
  ScoreFlow's scales (`flowGeometry`), the spread band from five rounds, and
  Best and Last as optional overlays. A slider synced with the map ("Hole 14,
  average plus 1.9 through 14").
- Averages to par read at one decimal everywhere on the page ("+3.0", not "+3").
- `HoleMap.tsx` is back in the repo's quote style.

### Departures

- The rows' values stay in ink; the plan colours them past one standard error.

### Verification

- `course-arc.test.tsx`.
