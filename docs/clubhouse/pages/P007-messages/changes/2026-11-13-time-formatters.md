# 2026-11-13 — messages

## 2026-11-13 — Messages builds each date formatter once (F-0010)

```text
Design package: none (owner's browser audit, finding F-0010, S2 motion)
PR/commit:      agent/ch-look-speed
Contract IDs:   none changed (every label reads as it did)
Actions:        none
Data impact:    none
Held items:     the frame-gap measurement (below)
```

### Changed

- The time helpers built a new `Intl.DateTimeFormat` on every call: about
  eight labels cost sixty-two constructions, once per bubble, rail row and
  day separator in the first frame after a route switch. Each kind
  (day parts, 12 and 24 hour clock, weekday long and short, month and day) is
  now built once per zone and reused. An unknown zone still throws, and is
  never stored.
- The rail's time (`railTime`) reads through the same helpers.

### Verification

- `screens/messages/__tests__/model-time-formatters.test.ts` (new): no
  formatter is built after the first sweep however many labels follow; the
  count is bounded by kinds and zones; zones stay apart; every label is
  unchanged.

### Not measured

- Presented-frame gaps (183 ms worst on Messages at 4x throttle) need the
  device or Simulator run. Calendar (`zonedNow`, `daylightOn`) and Home
  (`DayCard` `minutesOf`, `sunsetExtra`) also build formatters per call and
  can take the same cache once the Messages result is measured.

### Also (follow-up in the same PR)

- The announcement letterhead's date (`letterDate`) builds its three
  formatters once per zone, through the shared cache (`lib/zone-format.ts`,
  logged in `docs/clubhouse/changes/2026-11-13-zone-formatters.md`).
  `screens/calendar/__tests__/zone-formatters.test.ts` covers it.
