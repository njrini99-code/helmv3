# P005-stats-player — Changelog

## 2026-11-20 — Short game detail cards (look-09)

```text
Design package: Nick's request of 20 Nov (iPhone screenshot of Short game), DESIGN_LANGUAGE.md law 6 (picture first; on phone a chart or grouped list over a table)
PR/commit: claude/project-thread-jn6rm7
Contract IDs: none
Actions: none
Data impact: none (same GolfStats fields, no stat math changed)
Held items: none
```

### Changed

- Inside the pushed Short game detail (the Stats redesign), "Up and down by
  where the green was missed" is the page's grouped rows instead of a four
  column table: each miss direction has its rail, its rate, the makes behind
  it ("6 of 10") and its share of misses. A tick marks the player's own up and
  down rate over every chance ("All chances, 38%"); a rail at or above it is
  green, below it amber.
- "Finish after the chip" uses the same rows (figure with its unit, rail on
  the longest finish) instead of the older compare bars.
- The figure table ("Strokes to hole out from around the green") is redrawn:
  a quiet footnote header, 44pt rows on row hairlines, the "All lies" summary
  column as one rounded well with firmer figures, and the "All distances"
  total row in the figure weight under a firmer rule. Any detail table that
  passes `keyCol` or a `total` row gets the same drawing.
- A closed "More detail" (the older desktop Game detail) keeps its tables.
