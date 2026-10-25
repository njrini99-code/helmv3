# 2026-10-25 — Rounds: the review's arc is a slider (P-7, slice 2)

## 2026-10-25 — Keyboard and VoiceOver on the arc, and where the round turned

```text
Design package: P-7 build plan, 4.5.2 and 7.2
PR/commit:      feature/p7-course-review-stats
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `ScoreFlow` was `role="img"` and could only be picked with a pointer. It is
  now a slider over the holes: arrows move a hole, Page Up and Page Down move
  three, Home and End go to the ends. Its value is the picked hole and it reads
  "Hole 14, par 4, made 6, plus 3 through 14". A keyboard pick keeps focus and
  does not scroll the page; a click still scrolls to the hole card.
- The stretch that turned the round (`turningStretch`) is a band behind the
  line, gold for strokes lost and green for strokes back, with 1 px edges and
  its sentence at the top ("Lost 3 on 13 to 15"). When it holds the worst hole
  it replaces that hole's label. The sentence leads the zone's note, and a
  visually hidden summary follows the chart ("Out in 37, plus 1. …").
- `flowGeometry` holds the arc's scales, for the course page's average arc.

### Why

- P-7 slice 2: the accessibility fix ships on its own.

### Verification

- `score-flow-slider.test.tsx`: slider attributes, keys, band and label, and the
  worst-hole label rule.
