# 2026-11-16 — lineup roster count log

## 2026-11-16 — The lineup builder states the roster count (launch readiness F-05)

```text
Design package: none (launch readiness findings, 15 Nov 2026, §4 F-05); no owner board. One more TourChip in the meta row
PR/commit:      claude/project-thread-8hytxy (QUEUE lr-f05)
Contract IDs:   160781 (CH-16981)
Actions:        none
Data impact:    loadTournamentLineup reads the roster limit (src/lib/golf/roster-limit.ts, tolerant of the held migration 20261115250000)
Held items:     supabase/migrations/20261115250000_golf_roster_limits.sql
```

### Changed

- Beside "x of y set" the lineup builder shows the Roster header's count:
  "Roster 8 of 9", or "Roster 10 of 9, 1 over" in amber (CH-16981). With the
  limit off there is no chip.

### Why

- The coach picks the lineup from the roster; when the roster is over its
  limit they should see it where they pick, not only on Roster.

### Verification

- `src/clubhouse/__tests__/roster-limit.test.tsx` (LineupBuilder block).
- Not yet: a real-app screenshot on staging.
