# 2026-10-25 — Rounds: the course page, v1 (P-7, slice 5)

## 2026-10-25 — A player's history at one course, and the ways in

```text
Design package: P-7 build plan, 3.2, 3.3, 4.2.0 to 4.2.3, 4.2.7, 4.4, 8.5.1
PR/commit:      feature/p7-course-review-stats
Contract IDs:   CH-11330, CH-11331, CH-11421
Actions:        none
Data impact:    reads only (no migration)
Held items:     none
```

### Changed

- New route `/golf/dashboard/rounds/course/[key]` (Clubhouse only; not found
  with Clubhouse off). The key is a library course id or `n-` plus the
  normalized name; a name key whose name now has one library id redirects.
  A coach reads one player of their team with `?player=`.
- `data/course-history.ts` and `course-page-shape.ts`: the light list, the
  holes of the rounds here and the last round's coach note. The page shows the
  hero (average from two 18-hole rounds, an early read under five, else last
  time), the four figures (best, last time, rounds, putts), Last time here with
  its notes, and the rounds here. The hole, stretch, comparison and arc figures
  are computed now for the next slices.
- States: "No rounds here" (CH-11330), "This player isn’t on your team"
  (CH-11331), and "Your history here didn’t load" (CH-11421), plus a skeleton
  at the page's geometry.
- Entry points: the review hero links to the history ("Your history at Finley
  · 6 rounds"; "First round at Finley" unlinked; the coach's names the
  player), and the library's By course headers are link rows. By course now
  groups as the course page does, so names that normalize the same merge.
- Nav: the route is rebuilt for both roles and pushes in on a phone with Back
  to where it came from.

### Why

- P-7 slice 5.

### Departures

- No "Message Lena" on the coach's hero yet (slice 10). No footer about test
  and in-progress rounds: the light list leaves them out, so the page cannot
  tell they exist without another read.

### Verification

- `course-page-shape.test.ts`, `course-history-states.test.ts`,
  `course-page.test.tsx`, `course-entry.test.tsx`.
