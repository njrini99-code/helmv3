# 2026-11-16 — stats team

## 2026-11-16 — A change chip is the change as printed

```text
Design package: none (launch readiness 2026-11-15, DF-C-15)
PR/commit:      claude/project-thread-vledif-pa-data-23
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only)
Held items:     none
```

### Changed

- `data/stats-team.ts`: each figure's change is rounded to the digits it is
  printed at before the page reads it, so the chip's sign, arrow, colour
  and words follow the number on the chip.

### Why

- A change of 0.04 printed as "0.0" could still carry an up arrow, a colour
  and "up" in its words.

### Verification

- `data/__tests__/most-improved.test.ts` covers `printedDelta`. Not checked
  in a browser or on a device.
