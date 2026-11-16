# 2026-11-16 — stats team

## 2026-11-16 — The filter's year and Last 10 read the season clock

```text
Design package: none (launch readiness 2026-11-15, DF-C-22)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only)
Held items:     none
```

### Changed

- `data/stats-filter.ts` and `StatsFilter.tsx`: the year a filter's dates
  are written against comes from `filterYear()`, on America/New_York (the
  clock seasons turn on), not the UTC year. On New Year's Eve evening in
  the US the chips, count line and basis still say the old year.
- `data/season.ts`: `lastTenFloor` counts twelve months back from today on
  the same clock, as `seasonStartDate` does. An evening read in the US no
  longer starts Last 10 a day late.

### Why

- The server read UTC and the phone read UTC, so both agreed with each
  other but not with the coach's own calendar near midnight.

### Verification

- `data/__tests__/team-trend-whole-window.test.ts` (DF-C-22 case) and
  `__tests__/round-scope.test.ts` (midnight UTC case) fail on the old code.
  Not checked in a browser or on a device.
