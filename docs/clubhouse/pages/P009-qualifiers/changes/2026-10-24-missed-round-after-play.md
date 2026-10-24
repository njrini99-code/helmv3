# 2026-10-24 — "Missed a round" waits for the event to end (Clubhouse A+ S2)

## 2026-10-24 — A card a round short is flagged only once the qualifier is complete (decision 10, review of #2361)

```text
Design package: none (Clubhouse A+ review of #2361, owner decision 10)
PR/commit:      agent/aplus-s2
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     Fairway's live board and the workspace still rank on what is in (owner decision A)
```

### Changed

- During play, a card with fewer rounds in than the most anyone has shows its
  pace, "1 of 3 rounds", instead of "Missed a round · 1 of 3 rounds". The
  phone row's spoken label drops ", missed a round" the same way.
- Once the qualifier is completed the card carries "Missed a round · 1 of 3
  rounds", as before.
- The order is unchanged: complete cards first, by total to par, then total
  strokes, then more rounds played; a card a round short below them, and
  never tied with a complete card.

### Why

- The flag fired while the event was still on (`model.ts` `rankRows`, and
  `sampleNote`), so a player who simply hadn't played round two yet read as
  having missed it.

### Tests

- `qualifiers.test.tsx`: decision 10 on a completed and an in-progress board
  (same order, flagged only when completed), and a short card level with a
  complete one is never tied in either.
- `qualifiers-premium.test.tsx`: the live board's phone row and note give the
  pace.
