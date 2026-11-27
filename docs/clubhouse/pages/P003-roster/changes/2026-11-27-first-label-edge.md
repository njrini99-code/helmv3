# P003 — Changelog

## 2026-11-27 — The first column label starts on the row's 16

```text
Design package: none
PR/commit:      agent/presentation-gate-green
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- Desk roster: the first sortable label (Player) starts on the row's 16, over
  the names. Its key's 6 of padding, pulled back by a negative margin, drew the
  key 10 from the card's edge. The other labels keep their padding.

### Why

- Presentation gate, row-inset on the desk roster (4 tests on main).

### Verification

- Clubhouse quality, presentation gate, on this branch.
