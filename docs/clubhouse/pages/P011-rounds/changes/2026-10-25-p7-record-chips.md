# 2026-10-25 — Rounds: record chips on the review (P-7, slice 4)

## 2026-10-25 — The records a round holds

```text
Design package: P-7 build plan, 4.5.1, 4.5.6 and M11
PR/commit:      feature/p7-course-review-stats
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `RecordChips.tsx`: up to two chips under the course name ("Season low",
  "Best at Finley", "Fewest putts this season · 27"), from the stage 3 history,
  measured against the current history. A labelled list of plain text; the
  filled, half or hollow glyph is the tier and is hidden from a screen reader.
  Stage colours on the phone hero, page ink on the desktop canopy.
- They settle in only straight from Post round, with the round card, and are
  still under reduced motion.
- The scorecard's Tot column drops its 2 px transparent left border for a 2 px
  inline-start padding.

### Why

- P-7 slice 4.

### Verification

- `record-chips.test.tsx`.
