# 2026-11-15 — tournaments

## 2026-11-15 — History bars from zero, Compare better to the right

```text
Design package: none (owner's stats and charts audit, 15 Nov 2026, section 5)
PR/commit:      claude/project-thread-szdz3m
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- History on the phone (`History.tsx`, `history-model.ts` `barLength`,
  `barAxis`): each event's bar runs from a zero rule, better than the mark to
  the right and worse to the left, every bar on one shared scale with no floor;
  the subtitle says "right of the line beats" the mark. The side is a
  `data-side` attribute, not a tone class (CH-02). A bar is square where it
  meets the zero rule and rounded at its far end.
- Compare (`compare/CompareGrid.tsx` Strip): better is to the right in every
  row, so a lower-is-better row runs high to low, and each metric says
  "better to the right" (CH-14).

### Why

- The History bars ran from 14% to 100% of the track across the min-max range,
  so +5.0 against +5.4 drew as 1 against 7; Compare put the better side on the
  left for scoring and on the right for greens in one grid.

### Verification

- Tests: `tournaments/__tests__/history-model.test.ts`,
  `__tests__/tournaments-history.test.tsx`,
  `tournaments/compare/__tests__/compare-grid.test.tsx`.
- Screenshots: before and after in the PR description.
