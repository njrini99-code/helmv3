# P013 — Changelog

## 2026-11-27 — A coin drawn apart keeps its tap circle inside the huddle

```text
Design package: none
PR/commit:      agent/presentation-gate-green
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- Team, Huddle: when coins are drawn apart, a pushed coin is held inside the
  same bounds the true points keep, so its 44 tap circle stays inside the
  chart. It used to be clamped to the plot's own top and right edges, and its
  circle sat past the drawing on the long-names board.
- Read: the evidence and diagnosis bands are wells in their card (a hairline
  drawn inward); the gate now reads them so. See
  `docs/clubhouse/changes/2026-11-27-gate-wells.md`.

### Why

- Presentation gate on main: card-escape on team-long (4 tests) and
  nested-surface on the Read bands (6 tests).

### Verification

- `huddle-range.test.ts`: every coin's tap circle stays within the chart.
- Clubhouse quality, presentation gate, on this branch.
