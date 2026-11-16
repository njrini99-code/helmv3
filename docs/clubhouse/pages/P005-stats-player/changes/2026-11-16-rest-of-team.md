# 2026-11-16 — stats player

## 2026-11-16 — The coach's comparison is the rest of the team

```text
Design package: none (launch readiness 2026-11-15, DF-C-17)
PR/commit:      claude/project-thread-vledif-pa-data-23
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only)
Held items:     none
```

### Changed

- `data/stats-player.ts`: a coach's team figures beside a player (the
  scoring average, the comparison rows and the strokes-gained legs) pool
  the other players' rounds only. The player is no longer inside the
  average set against them.
- `PlayerStage.tsx`, `OverviewZones.tsx`, `StatsPlayerPhoneShs.tsx`: the
  label reads "Rest of team" where it read "Team" or "Team average".

### Why

- The average included the player, which pulled it toward them and hid
  part of the gap. Nick took the recommendation on 16 Nov.

### Verification

- `__tests__/stats-filter-data.test.tsx` and `__tests__/stats-parity.test.tsx`
  now hold the rest-of-team figures, and fail with the player included.
  Not checked in a browser or on a device.
