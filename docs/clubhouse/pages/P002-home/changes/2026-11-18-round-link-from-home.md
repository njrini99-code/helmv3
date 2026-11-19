# P002 Home — Changelog

## 2026-11-18 — Home's round links say they came from Home

```text
Design package: none
PR/commit: agent/clubhouse-motion-fixes
Contract IDs: D-41
Actions: none
Data impact: none
Held items: none
```

### Changed

- `screens/home/player-links.ts` `roundHref`: the review link carries
  `?from=home` (coach and player Home: the latest round, "Open recap"), so the
  review's Back reads Home and returns here.
- `home.test.tsx`, `player-home.test.tsx`: the expected recap href now includes
  `?from=home`.

### Why

- Clubhouse audit 2026-11-18 (P2): a round opened from coach Home said "Stats" on
  its Back.

### Verification

- `screens/rounds/__tests__/review-back-from-home.test.tsx`, `home.test.tsx`,
  `player-home.test.tsx`.
