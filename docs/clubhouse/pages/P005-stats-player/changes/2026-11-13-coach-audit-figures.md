# 2026-11-13 — stats (player)

## 2026-11-13 — Figures a coach can trust (coach audit, Guilford staging)

```text
Design package: none (coach audit 13 Nov 2026, COACH_AUDIT_2026-11-13.md §8, §9)
PR/commit:      agent/coach-fix-stats
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only; one new calculator field, teePenalties / teePenaltiesPerRound)
Held items:     none
```

### Changed

- Toughest holes ranks each course's own holes: a play is grouped by course (the
  course id, else the name folded for case, spacing and a club suffix) and hole
  number, and each row names its course. It pooled hole numbers across courses, so
  "Hole 12 · Par 3" mixed a par 3, a par 4 and a par 5. A round with no course is
  left out. Production's getWorstHoleAnalysis still pools (PARITY SC11).
- Make rate by break reads 3 to 10 ft. Tap-ins are tagged "straight" by default
  and drew Straight at 100%.
- Off the tee's lead says the penalties earned off par-4 and par-5 tees
  (`teePenaltiesPerRound`, SG-4's own attribution), never every penalty.
- Left, Fairway and Right on Off the tee (desktop, phone, the fairway strip) and
  first putts by distance are rounded together, so they add to 100.
