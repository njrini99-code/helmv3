# 2026-10-25 — Rounds: what the round says (P-7, slice 3)

## 2026-10-25 — Four round figures against the player's usual

```text
Design package: P-7 build plan, 4.5.3 and 8.5.2
PR/commit:      feature/p7-course-review-stats
Contract IDs:   none new
Actions:        none
Data impact:    reads only (no migration)
Held items:     none
```

### Changed

- The review reads `course_id` and the start hole with the round, then a stage
  3 (`data/round-history.ts`): the player's light list of rounds and the holes
  of the few the history needs (the usual's last 20 and this course's rounds).
  `round-history-shape.ts` turns them into the usual, the record marks, the
  course, each hole's "here before" and the two ghosts. Later slices draw the
  last four. A failed read is logged and leaves the review as it was.
- "What the round says" (`RoundSays.tsx`) follows the arc: bounce-back, putts
  per green hit, the closing three (named in play order) and big numbers. Each
  has its usual when it is past its floor, words when it cannot be said, and an
  info button that opens its definition in place. The values carry no colour.
- The arc's turning stretch is found in play order when the round started on
  another hole.

### Why

- P-7 slice 3.

### Departures

- The definitions open in place under the tile (a disclosure), not in a floating
  popover: Clubhouse's tooltip is pointer-only, and this works on touch.
- On phone the 2 × 2 grid has hairlines between rows only.

### Verification

- `round-history-shape.test.ts` and `round-says.test.tsx`. Server time is not
  measured yet (end batch).
