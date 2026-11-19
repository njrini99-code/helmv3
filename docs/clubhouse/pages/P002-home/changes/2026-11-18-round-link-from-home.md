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

## 2026-11-18 — Home's round links are fetched ahead

```text
Design package: none
PR/commit: agent/clubhouse-motion-fixes
Contract IDs: A13
Actions: none
Data impact: none
Held items: none
```

### Changed

- `CoachLatest`, `HomePhone`, `PlayerHomePhone`, `LatestRound`: the round recap
  link passes `ahead` (ui/Button), so the review is fetched as the press starts
  and while Home is idle.

### Why

- Clubhouse audit 2026-11-18 (P2): Home's round link committed 580 ms after a tap
  (pre-fix build, WebKit, coach phone), against 43 ms for a Rounds list row.

### Verification

- `ui/__tests__/button-ahead.test.tsx`; Home suites pass.
