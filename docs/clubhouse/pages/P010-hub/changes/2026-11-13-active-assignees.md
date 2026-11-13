# 2026-11-13 — Team Hub counts only active players' task assignments

## 2026-11-13 — "0/11", not "0/12"

```text
Design package: none (coach audit, 13 Nov 2026, §7 #4)
PR/commit:      agent/coach-fix-roster
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `assignmentsFor(…, active)` leaves out the assignments of a player who is not
  on the active roster. Every task read "0/12" and "24 of 72 player assignments
  done" while Guilford has 11 active players. When the roster read fails, every
  assignee is counted, as before.
- Not changed: the "rounds in 30 days" window. It is exactly 30 days counting
  today (an earlier fix: a `>=` on today − 30 had read 31 days), and the audit
  found the count right for that window. Home's own Waiting on (`home-queue.ts`)
  still counts every assignee.
- `hub.test.tsx`'s assignment fixture now names its roster players, as every
  real row does.
