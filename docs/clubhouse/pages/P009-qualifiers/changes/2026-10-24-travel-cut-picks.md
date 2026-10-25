# 2026-10-24 — Qualifiers: the pick places are the coach's

## 2026-10-24 — Between the lines, the travel cut says the coach chooses

```text
Design package: none (review of #2361)
PR/commit:      agent/clubhouse-aplus-phase2
Contract IDs:   CH-09908
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Before confirm, a player below the top-score line and above the travel cut
  reads "Travel cut: In the coach's pick places: your coach chooses who fills
  them.", drawn like a tie, not "Inside". Those places are the coach's picks,
  not ranked places (the rule `selectionOutcomeFor` applies after confirm).
- The stray caption JSDoc above `ChQLineGap` is gone.

### Verification

- `qualifiers.test.tsx` (Q-114 case): the player between the lines, and a
  player inside on score still "Inside by 6 strokes".
