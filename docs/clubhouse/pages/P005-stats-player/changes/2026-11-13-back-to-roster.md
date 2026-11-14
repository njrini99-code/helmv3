# 2026-11-13 — a player opened from Roster goes back to Roster

```text
Design package: none (coach audit, 13 Nov 2026, §8 #7)
PR/commit:      agent/coach-fix-roster
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The player page's back link reads "Roster" and goes there when the address
  carries `from=roster` (`statsBackLink`, in `stats/links.ts`); otherwise it is
  "Team stats", as before. Roster's profile links carry it.
