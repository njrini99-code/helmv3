# P013-coachhelm — Changelog

## 2026-11-20 — Full-height sheet selector split (premium plan, batch 2)

```text
Design package: premium plan 2026-11-19, batch 2
PR/commit: agent/clubhouse-desk-shell
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- The rule that runs a short CoachHelm sheet to the foot of the window
  now names the Monday brief and the Track record in two selectors
  instead of one `:is()` list. Batch 2 made `.ch-hl` a shared shell
  class, and the class-owner check read the list as this page anchoring
  the brief's `.ch-hmb`. Nothing renders differently.
