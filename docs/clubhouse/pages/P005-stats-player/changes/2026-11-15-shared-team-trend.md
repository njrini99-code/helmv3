# 2026-11-15 — stats-player

## 2026-11-15 — Shared Stats files changed for the team page; the player's Stats reads as before

```text
Design package: none (prod audit 2026-11-15, STATS-P-04, STATS-P-05, STATS-TS-06, NP-01; logged on P004)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only)
Held items:     none
```

### Changed

- `data/stats-weight.ts`, `screens/stats/shs-figures.ts`, `ScoringFeatureChart.tsx`, `StatsTeamIslands.tsx`, `StatsTeamPhone.tsx`,
  `TeamTrendChart.tsx` are listed by both Stats pages. Their changes are the team page's (P004
  `changes/2026-11-15-figures-agree.md`): `roundHalves` compares each player with themselves only when a `playerOf` is passed, which
  only the team loader does; `teamLineDays` and `TeamFeatureChart` draw the team's line. A player's own trend calls `roundHalves`
  without `playerOf` and reads as before.

### Why

- The changelog gate files a shared file under every page that lists it.

### Verification

- The player's Stats suites pass unchanged. (`screens/stats/__tests__/span-switch.test.tsx` changed for Home's Team scoring window, P002, not for this page.)
- Not checked in a browser or on a device in this change.
