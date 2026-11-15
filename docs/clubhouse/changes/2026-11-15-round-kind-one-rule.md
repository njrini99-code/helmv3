# 2026-11-15 — round kind

## 2026-11-15 — One reading of a round with no type

```text
Design package: none (launch readiness 2026-11-15, DF-C-18 P2; Batch 3)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only)
Held items:     none
```

### Changed

- `data/round-scope.ts` adds `roundKindOf` and `countsInAverages`. A round with no type is a scoring round with no named kind. A type
  the app does not know reads as practice, as before.
- `season.ts` `countsForScoring`, `rounds-shape.ts` `inAverages` and the round review's record chips (`round-history-shape.ts`) all
  call `countsInAverages`, instead of three copies of the rule.
- Home's latest rounds (`home.ts`): a round with no type now has no kind. Before, it was marked practice. The row still never folds
  into an event's row.
- Stats' pressure gap (`stats-figures.ts`) reads `roundKindOf`. A round with no type stays on neither side, and the comment says why.

### Why

- DF-C-18: one round with no type was a scoring round in the averages, a practice round on Home, and left out of the pressure gap.
  Each reader had its own rule.

### Screenshots

- None: no layout or figure changed. Home's row marking was invisible, and the averages and the gap read as they did.

### Verification

- `data/__tests__/round-kind-one-rule.test.ts`: the kinds, the averages rule and the rounds list's copy agree. The pressure gap puts
  tournament and qualifier rounds against practice, with two no-type rounds on neither side.
- `cross-screen-figures` and every suite that reads `countsForScoring`, `inAverages` or `pressureGap`.
- Not checked in a browser or on a device in this change.
