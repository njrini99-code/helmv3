# 2026-10-24 — Same-day rounds each get a place on the charts (Clubhouse A+ S2)

## 2026-10-24 — Two rounds on one day no longer stack on one point (review of #2361)

```text
Design package: none (Clubhouse A+ review of #2361, row 119 follow-up)
PR/commit:      agent/aplus-s2
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `slotPositions` (`ui/charts/Line.tsx`), which spaces every Line and the
  Stats round trends by real time, keeps each point in a slot of its own: no
  two points are closer than half the even gap, scaled into the plot with the
  rest. A line with no such gap is spaced exactly by time, as before.
- The pointer, a finger's scrub and a tap (`useChartPin`) can now reach the
  second of two same-day rounds; before, the nearest-point read always found
  the first.

### Why

- Points carry only a date, so two rounds on one day had the same time and
  were drawn on one spot: one hid the other from the eye and the pointer.

### Tests

- `line-time.test.tsx`: same-day rounds keep their order and a gap of at
  least half the even one; Line draws three places for three rounds.
- `use-chart-pin.test.tsx`: a pointer swept across the plot reads all three.
