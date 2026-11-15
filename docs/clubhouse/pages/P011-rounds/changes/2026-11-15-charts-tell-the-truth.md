# 2026-11-15 — rounds

## 2026-11-15 — Month spark from par, one putts direction, a straight arc

```text
Design package: none (owner's stats and charts audit, 15 Nov 2026, section 5)
PR/commit:      claude/project-thread-szdz3m
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     the month spark's under-par colour (visual-system thread)
```

### Changed

- Month spark (`parts.tsx` MonthSpark, `monthSparkBars`, shared `parColumns`):
  each round is a column from a par line, under par up and over par down, on
  one range at least ten strokes wide; a nine-hole round is read per 18 (CH-09).
- Putts (`parts.tsx` `puttsShare`): the season bar and each round's meter both
  run as putts per 18 against one 40-putt scale, so the same measure never runs
  two ways on one page (CH-14).
- Course arc (`CourseArc.tsx`): straight segments hole to hole, and a labelled
  level each side of E on a round step for the range (CH-15, CH-22).
- Course history (`course-history-shape.ts`): "plays harder or easier" is said
  past two standard errors, the app's one `SIGNAL_Z` (CH-05).

### Why

- The month spark grew taller for a better month from a min-max range, the two
  putts bars ran opposite ways unlabelled, and the arc curved between holes
  with only "E" to read it by.

### Verification

- Tests: `rounds/__tests__/better-is-up.test.tsx`,
  `rounds/__tests__/course-arc.test.tsx`,
  `stats/__tests__/chart-labels.test.tsx`,
  `data/__tests__/course-history-shape.test.ts`.
- Screenshots: before and after in the PR description.
