# P003 — Changelog

## 2026-11-28 — A long name breaks inside its word on the phone roster

```text
Design package: none
PR/commit:      agent/roster-long-name-wrap
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- Phone and desk roster rows: a name with a word wider than its column breaks
  inside that word and ends in the two-line clamp's ellipsis, as the season
  card's name already does. It was cut off at the column's right edge.

### Why

- Since #2670 a phone-width layout keeps the phone's 15px callout, as an
  iPhone draws it. At 15px, "Featherstonehaugh-" in the long-name fixture is
  144px wide in the row's 138px column on a 390 phone, so the nightly
  presentation gate on main found it clipped (text-clip, light and dark).

### Verification

- Clubhouse quality, presentation gate, on this branch.
