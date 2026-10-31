# 2026-10-25 — Rounds: your history here, in round setup (P-7, slice 9)

## 2026-10-25 — What a course has been for the player, before they play it

```text
Design package: P-7 build plan, 4.6, 8.5.3, E4, E6
PR/commit:      feature/p7-course-review-stats
Contract IDs:   none new
Actions:        none
Data impact:    reads only (the player's own rounds, under RLS)
Held items:     none
```

### Changed

- `data/course-glance.ts`: each course's rounds, 18-hole average (from two),
  best, and last time with its note, grouped as the course page groups.
- `readCourseGlances` (setup-reads.ts) reads them once when New round opens,
  best-effort; a failure is reported and the block just doesn't show.
- Under the picked course: "Your history here · 6 rounds", "Average 74.2 · Best
  70 · Last time 76 on Oct 3", the player's last note there, and "See hole by
  hole" to the course page. Nothing with no rounds there.
- `/rounds/new?course=<id>` (the course page's Start a round here) opens the
  picker on that course's tees; an id the library doesn't list is ignored.

### Verification

- `course-glance.test.ts`, `round-setup-history.test.tsx`.
