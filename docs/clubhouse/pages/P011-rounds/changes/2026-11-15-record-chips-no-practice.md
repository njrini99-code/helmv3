# 2026-11-15 — rounds

## 2026-11-15 — Round review record chips read scoring rounds only

```text
Design package: none (launch readiness 2026-11-15, DF-C-12 P1; Batch 3)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only; round_type added to the history list read)
Held items:     none
```

### Changed

- `data/round-history.ts` reads each listed round's `round_type`, and `round-review.ts` passes the reviewed round's.
- `data/round-history-shape.ts`: the record chips ("Career low", "Season low", "Best at …", "2nd best", "Fewest putts", "Best front
  or back nine") compare only rounds that count in a score and are not practice. These are the rounds Stats, Home and the Roster read.
- A practice round under review gets no chip.
- The totals they compare were already canonical (front plus back, `deriveRoundTotal`) at the audited commit, so nothing changed there.

### Why

- DF-C-12: a 68 in practice blocked the player's real season low, and a low practice round could be called "Season low".

### Screenshots

- None: no layout changed. A chip appears or not where practice rounds decided it before.

### Verification

- `data/__tests__/round-history-shape.test.ts`: a practice 68 neither blocks the scoring 72's "Career low" nor earns a chip of its
  own.
- `__tests__/history-canonical-totals.test.ts`: the review rows are now scoring rounds (the fixture had defaulted them to practice).
- `record-marks`, `record-marks-putts-staging` and the review loader suites.
- Not checked in a browser or on a device in this change.
