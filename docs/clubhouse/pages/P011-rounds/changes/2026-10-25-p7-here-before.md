# 2026-10-25 — Rounds: here before, and a round under this one (P-7, slice 11)

## 2026-10-25 — The review remembers the course

```text
Design package: P-7 build plan, 4.5.2 (compare overlay), 4.5.4, 7.2
PR/commit:      feature/p7-course-review-stats
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The hole card says the player's earlier plays of the hole at this course,
  from two ("Here before: 4.8 average · 6 times"; the coach's "Lena here
  before"), with "Hole 14 at Finley" to the course page at that hole.
- Under the arc, a choice of None, Average here or Best here · 70 (each only
  past its floor, and not drawn at all with only None). The other round is a
  dashed line with its label at the end and a legend under the control; the
  slider adds it ("…, best here plus 1 through 14"). The choice is kept on this
  device (`ch.rv.compare`).

### Verification

- `review-ghost.test.tsx`; the floors in `round-history-shape.test.ts`.
