# 2026-11-16 — coachhelm

## 2026-11-16 — Standing's lifetime rows are "Rounds on file", not "All time"

```text
Design package: none (launch readiness 2026-11-15, DF-P-05)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added; the Standing window paragraph in CONTRACT.md reworded
Actions:        none
Data impact:    none (reads only; one count of the player's test rounds)
Held items:     20261024151000 (the season table) still held; this is the label
                the page shows until it is applied
```

### Changed

- `data/coachhelm-standing-shape.ts`: the lifetime table's window is labelled
  "Rounds on file". Its cache rows are every round on file, its approach rows
  every round on file, and its pressure rows the last 90 days (the Pressure
  group already says so), so "All time" was not true of the page.
- `data/coachhelm-standing.ts`: on the lifetime table, a head count of the
  player's `is_test` rounds. When there is one, the hero says "test rounds
  included", because that table's refresh counts them until the OD-01 chain
  is applied. A failed count is logged and the page says nothing.
- `views/Standing.tsx`: the hero meta carries that line.
- The coach file's link reads "Full standing, rounds on file".

### Why

- On staging (a copy of production, read 16 Nov) the season table and the
  OD-01 helpers are not there, so every Standing page reads the lifetime
  table, and three players with a stats row have test rounds on file.

### Verification

- `coachhelm-standing.test.tsx` (two DF-P-05 cases) and
  `coachhelm-standing-shape.test.ts`. Not checked in a browser or on a device.
