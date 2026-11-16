# 2026-11-15 — tournaments

## 2026-11-15 — Compare draws only on rounds that count in a score

```text
Design package: none (launch readiness 2026-11-15, DF-P-07; one figures helper, Batch 3)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only; front_nine and back_nine added to the pool's rounds read)
Held items:     none
```

### Changed

- `data/tournaments.ts` `poolRoundCounts`: a GolfHelm round enters the
  comparison pool only when it counts in a score by the rule
  every Stats figure uses (`isScoreCountable`: 9 or 18 holes all scored, or an
  18-hole total). A linked event round marked WD or DQ
  stays whatever its length, so its evidence can say why; every figure already
  leaves it out by its status.

### Why

- DF-P-07: a round of 10 to 17 holes was read as 18 (`holes_played <= 9 ? 9 :
  18`), so a 14-hole 58 read −14 to par and pulled
  every average it entered.

### Verification

- `data/__tests__/tournaments-compare-pool.test.ts`: a full 18, a 9 and an
  18-hole total count; a 14-hole card (declared 14 or 18)
  does not; a WD or DQ event round stays.
- Not checked in a browser or on a device in this change.
