# Shared pieces — Changelog

## 2026-11-27 — The chart interaction gains a press-and-read mode

```text
Design package: none (design lab pilot P3, QUEUE dsx-04)
PR/commit: claude/project-thread-2f9vkq
Contract IDs: none
Actions: none changed
Data impact: rollingMean takes optional weights; no caller changes without passing them
Held items: none
```

### Changed

- `lib/use-chart-pin.ts` takes `{ release: 'restore', hold }`: a mouse
  press reads at once, a finger held still for `hold` ms reads, lifting,
  a cancel or leaving the chart lets go, the arrow keys step like a slider
  (forward from rest starts at the first point) with a tick per step, and
  Esc stays inside the chart. The default ('keep') is unchanged for every
  existing chart.
- `lib/stats-signal.ts` `rollingMean` takes optional per-value weights.

### Why

- The scoring feature chart carried its own copy of the scrub; it now
  uses this one (P005 change of the same date).
