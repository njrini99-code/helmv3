# 2026-11-16 — stats team

## 2026-11-16 — The team trend holds every week of the window

```text
Design package: none (launch readiness 2026-11-15, DF-C-10)
PR/commit:      claude/project-thread-vledif-pa-data-23
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only)
Held items:     none
```

### Changed

- `data/stats-team.ts`: the weekly line, the players' lines, the leg lines
  and the newer-half-vs-older-half verdicts read every week of the window
  the page is filtered to, not its last ten weeks.
- `StatsTeamIslands.tsx`: the trend chart labels at most ten weeks, counted
  back from the latest, so a full season's dates do not overlap.

### Why

- On a full season the fall dropped off the chart, and the verdicts read
  the back of the season only.

### Verification

- `data/__tests__/team-trend-whole-window.test.ts`, which fails with the
  ten-week cap. Not checked in a browser or on a device.
