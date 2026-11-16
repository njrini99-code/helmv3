# 2026-11-16 — departed players

## 2026-11-16 — Players who left are not counted as invited

```text
Design package: none (launch readiness 2026-11-15, DF-C-06)
PR/commit:      claude/project-thread-vledif-pa-data-23
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only); held SQL for the player-side counts
Held items:     20261116090000_golf_event_attendance_counts_roster_only.sql
```

### Changed

- A player who has left the team keeps their attendance rows. Team Hub's
  RSVPs, Home's Waiting on and week, and Calendar now count only today's
  roster as invited, going or unanswered (`attendanceFor` in `data/hub.ts`,
  `data/home.ts`, `data/home-queue.ts`, `data/calendar.ts`). Whether the
  coach invited anyone at all still reads every row.
- Without the roster, Team Hub's counts and Home's Waiting on read as
  unknown, never a count that may hold a departed player.
- A player's counts come from `golf_event_attendance_counts`; the held
  migration above makes it count today's roster too.

### Why

- "N of M going" counted departed players: on staging (refreshed from
  production) 66 events on one team and 41 on another carry such a row. On
  the coach's Home the unnamed invitee also dropped "N of M going".

### Verification

- `data/__tests__/departed-players-not-counted.test.ts`, which fails on the
  code before this change; the new SQL body run read-only on staging. Not
  checked in a browser or on a device.
