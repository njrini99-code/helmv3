# 2026-11-16 — chart mark contrast

## 2026-11-16 — Loss bars, CoachHelm stations and early coins hold 3:1

```text
Design package: none; the charts thread's painted-pixel contrast pass on #2542 and #2541 (15 Nov 2026)
PR/commit: branch claude/project-thread-d9q2qs-contrast, stacked on #2542
Contract IDs: none changed
Actions: none changed
Data impact: none
Held items: gridlines, rails and knockout circles measure low but are decorative
```

### Changed

- `--ch-chart-loss-fill` (light) is #b06e0e, was #c58012: 3.05:1 on the chart
  track (was 2.4:1), 3.86:1 on the card and 3.1:1 from the gain fill. Every
  loss bar reads it: team putting, roster strokes gained, the CoachHelm board.
  Night is unchanged (3.17:1 on its track).
- CoachHelm's team hole: off the hole, a station steps back to 0.6 opacity (was
  0.38, 2.1:1) and a coin to 0.65 (was 0.5), both at least 3:1 on the stage's
  lightest green. A hollow early coin rings in the full feature ink instead of
  the solid coin's 55% rim, so it no longer fades into the green.

### Why

- WCAG 1.4.11: a chart mark needs 3:1 against what it sits on. Each bar prints
  its figure beside it, but the bar alone has to read too.

### Verification

- Unit: `src/clubhouse/styles/__tests__/chart-mark-contrast.test.ts`; the
  design-language token tables regenerated.
