# 2026-10-30 — Home: earlier reads and press prefetch

## 2026-10-30 — Home starts its slow reads sooner; the leaderboard prefetches on press (F-0032, F-0034)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0032, F-0034;
                fix plan PR 7)
PR/commit:      claude/audit-fix-07-speed (#2418)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- dashboard/page.tsx: the marks hint read starts beside the other Home reads
  (marksHint().then(...)) for coach and player Home, instead of after them
  (F-0032, step 1).
- Leaderboard.tsx: rows prefetch on press (usePressPrefetch), so the player
  page is warm by the time the tap lands (F-0034).

### Why

- The audit timed Home’s cold open and the leaderboard tap; both waited on
  work that could start earlier.

### Verification

- home-route-parallel and home-prefetch tests (new): red on main, green after.
  Timings to re-measure in the re-grade (fix plan §6).
