# 2026-11-15 — stats-team

## 2026-11-15 — The trend, the line and scrambling read what the card says

```text
Design package: none (prod audit 2026-11-15, STATS-P-04, STATS-P-05, STATS-TS-06, NP-01)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only)
Held items:     none
```

### Changed

- `data/stats-team.ts`: the round days are every day in the window, not the last ten, so the line and its round-day mean read the
  rounds the headline averages (STATS-P-04). Scrambling's change chip is the printed rate less the printed "Previous", one
  comparison (STATS-TS-06).
- `data/stats-weight.ts` `roundHalves`: a team trend compares each player with themselves, over the players with two whole rounds in
  each half; under three such players there is no change to read (NP-01).
- `screens/stats/shs-figures.ts` `teamLineDays`: the line joins every day in the window; a one-round day is a hollow dot on it
  (STATS-P-05, spec S2.4).
- `StatsTeamPhone.tsx`, `StatsTeamIslands.tsx`: the trend's words say "same players", and say when too few of the same players are on
  both halves to read a change.

### Why

- "75.7" sat beside "Round-day avg 75.3" because the line kept the last ten days. "Down 5.5 strokes a round" set five one-player days
  against qualifier days. "33%" sat over "Previous 29%" with a "+2" chip.

### Verification

- `data/__tests__/team-trend-same-players.test.ts`, `screens/stats/__tests__/team-line-days.test.tsx`, `__tests__/strokes-gained.test.tsx`,
  the Stats and data suites.
- Not checked in a browser or on a device in this change.
