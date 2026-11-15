# 2026-11-13 — calendar

## 2026-11-13 — The Calendar reads its zone formatters from the shared cache (F-0010)

```text
Design package: none (owner's browser audit, finding F-0010, S2 motion; 83 ms frame gap at 4x CPU)
PR/commit:      agent/ch-look-speed
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     the frame-gap measurement on a device
```

### Changed

- `zonedNow` (the team's day and hour on every tick) moved from `Calendar.tsx`
  to `calendar/model.ts` and reads `zonedWallTime`, which keeps its formatter
  per zone. `daylightOn` (the light of each day on the grid) keeps its formatter
  per zone too, and `sunTimes` under it. Same values.

### Verification

- `screens/calendar/__tests__/zone-formatters.test.ts` (new): a sixty-day grid
  of daylight and two hundred ticks of `zonedNow` build no formatter after the
  first call; midnight is hour 0; an unknown zone still throws.

### Not measured

- The 83 ms gap itself needs the device or Simulator run.
