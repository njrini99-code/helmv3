# P007 — Changelog

## 2026-11-27 — The first-run card keeps the phone's page edge

```text
Design package: none
PR/commit:      agent/presentation-gate-green
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- Phone, first run (MSG-701): the page keeps its own 16 each side (and the
  notch's side when the phone is on its side). The inbox's page rule zeroes its
  sides, because the cards and the search row carry the edge, and it beat
  MSG-701's padding, so the first-run card ran from glass to glass.

### Why

- Presentation gate, page-edge on messages-empty at 390 (2 tests on main).

### Verification

- Clubhouse quality, presentation gate, on this branch.
