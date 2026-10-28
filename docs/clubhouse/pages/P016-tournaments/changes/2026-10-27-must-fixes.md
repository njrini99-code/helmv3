# 2026-10-27 — Tournaments must-fixes from the Oct 27 review

## 2026-10-27 — Desk order, under-par colour, nine-hole par, compare pool

```text
Design package: none (FIX_LIST-2026-10-27, must-fixes)
PR/commit:      fix/clubhouse-tournaments-must-fixes
Contract IDs:   none
Actions:        none
Data impact:    none (reads only; no table, RPC or migration)
Held items:     20261027100000 (the rename/course-change fix) is its own PR
```

### Changed

- The event desk's owner order (`desk-model.ts` `byTotal`) ranks a card a
  round short below every full card, however low its total, as Nick ruled
  on Oct 24. Before, a card missing a round sorted to the top on its smaller
  total.
- The desk's Team vs par row draws under par in `--ch-score-under` on
  `--ch-score-under-bg` (D-42), not the chart gain green.
- A nine-hole event round plays half the eighteen-hole par stored on the tee
  or course (`eventRoundPar`), so a 38 on a par 72 course no longer reads as
  34 under.
- The comparison pool counts GIR only on holes that were marked (`girOf`),
  gives no putt total when a scored hole has no putt count, and lists WD and
  DQ event rounds out of every figure with the reason.

### Why

- FIX_LIST-2026-10-27 items: owner sort, D-42 colour, nine-hole par,
  compare numbers.
