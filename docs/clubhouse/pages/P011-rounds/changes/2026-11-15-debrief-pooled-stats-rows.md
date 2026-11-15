# 2026-11-15 — rounds

## 2026-11-15 — Debrief's moved number pools rates and skips unrecorded putts

```text
Design package: none (launch readiness 2026-11-15, DF-P-08; one figures helper, Batch 3)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only; one golf_round_stats_cache read for the earlier rounds)
Held items:     none
```

### Changed

- `data/round-debrief.ts`: the earlier rounds' greens, fairways and putts come
  from each round's stats row
  (`golf_round_stats_cache`, `cachedPutts`), as Stats reads them, never the
  round header. A row that does not read leaves those
  figures out; score to par still stands.
- `data/round-debrief-shape.ts` `movedNumber`: a putt count of 0 is "not
  recorded", for this round and the earlier ones; greens and
  fairways say the average pooled over the earlier rounds' chances (made over
  chances), with the spread still each round's own.

### Why

- DF-P-08: an earlier round with 0 putts counted as a round holed in no putts
  and dragged the average down; greens and fairways
  said a mean of each round's percentage, so a nine weighed as much as an 18.

### Verification

- `data/__tests__/round-debrief-shape.test.ts` (zeros skipped; 38 of 90 greens
  is 42%, never the 37% mean of percentages),
  `data/__tests__/round-debrief.test.ts` (the loader reads the stats rows),
  `__tests__/display-rounding.test.ts`.
- Not checked in a browser or on a device in this change.
