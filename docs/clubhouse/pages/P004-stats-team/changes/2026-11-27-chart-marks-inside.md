# P004 — Changelog

## 2026-11-27 — The team chart draws every dot and figure inside it

```text
Design package: none
PR/commit:      agent/presentation-gate-green
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- Team scoring chart: the first round day's dot is drawn whole, 6 in from the
  drawing's left edge (it was centred on the edge, half of it outside), and the
  axis figures end 2 short of the right edge, where the last figure's side
  bearing drew 1 past it.
- The gate's two known lines for this card at 390 (card-escape, light and
  dark) are removed: the same dot and figure were the finding there.

### Why

- Presentation gate, card-escape on the desk's Team stats (2 tests on main).

### Verification

- `scoring-feature-chart.test.tsx`: every dot is inside the drawing.
- Clubhouse quality, presentation gate, on this branch.
