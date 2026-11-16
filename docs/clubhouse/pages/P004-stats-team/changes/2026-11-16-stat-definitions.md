# 2026-11-16 — stats (team)

## 2026-11-16 — Each team figure's name opens its definition (F-07)

```text
Design package: none (launch readiness 2026-11-15, F-07; no owner board)
PR/commit:      claude/project-thread-f0tqxu
Contract IDs:   none added
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Desktop: each figure's name on the team tape (scoring average, greens,
  putts, scrambling, birdies) is a `StatTerm`: tap or click it for what it
  measures and how it is counted. The hero line ends "countable rounds only ·
  How stats are counted", which opens the whole rule.
- Phone: the names in "The round" card open the same definitions, and the
  card ends with the "How stats are counted" link.
- The shared piece is logged in
  `docs/clubhouse/changes/2026-11-16-stat-definitions.md`.

### Why

- F-07: coaches need each stat's definition and one stated rule for nine-hole
  and unfinished rounds to trust a figure against Clippd or GolfStat.

### Verification

- `src/clubhouse/__tests__/stat-definitions.test.tsx`.
