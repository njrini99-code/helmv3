# CoachHelm Team board — Changelog

## 2026-11-16 — The Tour comparison no longer holds the board back (N13-13)

```text
Design package: production audit 2026-11-15 N13-13 (P2-70), F-0013
PR/commit: claude/project-thread-10vtd2-motion-2 (#2544)
Contract IDs: none
Actions: none
Data impact: none (the same reads; no read counts as shown any differently)
Held items: none
```

### Changed

- `data/coachhelm-team.ts`: the coach's board loader no longer waits for
  the standings read (the six "Team against Tour" rows) before it returns.
  The comparison is handed over as a promise, like the brief, the stories and
  the themes, so the hole, the hero and the players paint without it.
- `screens/coachhelm/team/CourseCard.tsx`: "Team against Tour · all time"
  draws its six rows in its own Suspense. While they come it shows the rows'
  shape (a busy block); a failed read still says "Couldn't load this part" in
  that place, never an empty card.
- Tests: the loader's wave tests await the comparison; two new board tests
  cover the rows arriving after the hole and a failed read.

### Why

- F-0013 measured 6 to 8 s to the board's largest paint in the WebKit lab.
  The loader awaited every read, the standings last. This is the first part
  of the #2516 split: one read moved off the critical path. The rest (hero
  and hole from the roster and rounds alone, the players' reads streaming)
  waits on a staging measurement of which read is slowest.

### Verification

- Unit (vitest): every CoachHelm test (1,880 passed), including the new
  streaming and failure cases.
- Not run: a staging measurement of largest paint before and after. Owed in
  the WebKit lab on Nick's Mac against staging's Demo University team.
