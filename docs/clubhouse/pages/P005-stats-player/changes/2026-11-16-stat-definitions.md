# 2026-11-16 — stats (player)

## 2026-11-16 — Each figure's name opens its definition (F-07)

```text
Design package: none (launch readiness 2026-11-15, F-07; no owner board)
PR/commit:      claude/project-thread-f0tqxu
Contract IDs:   none added
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Desktop hero: "Scoring avg" and "SG / round" open their definitions;
  Handicap and Rounds stay plain text.
- Game detail, desktop and the phone's pushed sections: every figure name
  that names a stat (fairways hit, greens in regulation, scrambling, sand
  saves, putts, putts per green, three-putts, penalties, birdies) opens its
  definition, and each section's rule ends with "How stats are counted".
  Distance bands and shot splits ("From the rough", "100–125") stay plain.
- The shared piece is logged in
  `docs/clubhouse/changes/2026-11-16-stat-definitions.md`.

### Why

- F-07: coaches need each stat's definition and one stated rule for nine-hole
  and unfinished rounds to trust a figure against Clippd or GolfStat.

### Verification

- `src/clubhouse/__tests__/stat-definitions.test.tsx`.
