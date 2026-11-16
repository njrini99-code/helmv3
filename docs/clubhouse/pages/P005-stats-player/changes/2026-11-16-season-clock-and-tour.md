# 2026-11-16 — stats player

## 2026-11-16 — Season clock year, the team's Tour, window trend dates

```text
Design package: none (launch readiness 2026-11-15, DF-C-22, DF-P-13)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only)
Held items:     none
```

### Changed

- `data/stats-filter.ts` and `StatsFilter.tsx`: the filter's year is on
  the season clock (America/New_York), not UTC (DF-C-22; P004 entry
  `2026-11-16-season-clock-year.md`).
- `data/stats-player.ts`: the team's Tour from `teamTour` (DF-P-13).
- `data/stats-weight.ts`: a window carries `trendDates` (#2541). Shared
  entry: `docs/clubhouse/changes/2026-11-16-one-team-tour.md`.

### Why

- A year that turned at UTC midnight, and a Tour read two ways.

### Verification

- `data/__tests__/team-trend-whole-window.test.ts`,
  `data/__tests__/team-tour.test.ts`, `data/__tests__/one-sg-source.test.ts`.
  Not checked in a browser.
