# P001 Shell — Changelog

## 2026-11-19 — One left edge leaves out the week's skeleton too

```text
Design package: none
PR/commit: agent/coachhelm-desk-skeleton
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `shell.css`, "One left edge": the rule that leaves the player's
  CoachHelm week out (it centres its own column) also leaves out its
  skeleton (`main[data-ch-wait='your-week']`, `YourWeekSkeleton`).

### Why

- The skeleton must sit where the week lands. With the shared edge it
  sat left of the week on a wide screen and moved when the week arrived.
  P013's log has the rest of the change.
