# P005 — Changelog

## 2026-11-15 — The leg bars grow on the Overview's first view; windows glide

```text
Design package: none (MOTION-AND-VISUAL 3.7)
PR/commit:      worker E2 "lists": ba84d5c80
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     before/after capture of a first view; D-tier check owed
```

### Changed

- `LegBars.tsx`: on the Overview's first view in a session, each strokes-gained
  bar grows out from the zero line (a gain from its left edge, a loss from its
  right) over 360 ms on the iOS curve (`useFirstViewGrow('stats-overview',
  'x')`). Never on a revisit, under Reduce Motion, with Animations off, or on a
  page the server drew.
- A window change glides the bars, whiskers and team marks over 360 ms on the
  iOS curve (was 260 ms on ease-out).

### Why

- Spec 3.7.

### Verification

- `strokes-gained`, `stats-visuals-sg`, `overview-topar`, `chart-labels`,
  `honest-deltas` and `motion-glide` tests pass. jsdom only.
