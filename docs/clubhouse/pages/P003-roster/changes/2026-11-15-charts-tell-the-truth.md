# 2026-11-15 — roster

## 2026-11-15 — Form dots on one range, the profile line by date (stats and charts audit, CH-03, CH-05, CH-11)

```text
Design package: none (owner's stats and charts audit, 15 Nov 2026, section 5)
PR/commit:      claude/project-thread-szdz3m
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (the roster player carries `trendDates` beside `trend`)
Held items:     none
```

### Changed

- Leaders (`RosterLeaders.tsx`): the form strip is a dot per round on one
  score range shared by the list (`FormRange`), at least four rounds' spread
  wide, with the player's mean as a dashed rule; no bar floor (CH-03).
- Profile (`RosterProfileCrh.tsx`, `ui/CrhLine.tsx`): the scoring line spaces
  rounds by date (CH-11).
- Attention: "Scoring … worse" is said only past two standard errors of the
  change (CH-05).

### Why

- The form bars ran from a 30% floor across each player's min-max range, so a
  five-stroke gap filled a third of the strip, and the profile line spaced a
  week and a month off the same.

### Verification

- Tests: `ui/__tests__/FormLine.test.tsx`, `ui/__tests__/CrhLine.test.tsx`,
  `__tests__/logic.test.ts` (roster attention).
- Screenshots: before and after in the PR description.
