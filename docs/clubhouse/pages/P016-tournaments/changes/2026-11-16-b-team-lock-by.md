# 2026-11-16 — B team and lock-by log

## 2026-11-16 — A B team in the lineup builder, and an honest lock time (launch readiness F-05)

```text
Design package: none (launch readiness findings, 15 Nov 2026, §4 F-05); no owner board. Shared primitives only: Segmented (the one toggle), Section, Select, TourChip
PR/commit:      claude/project-thread-8hytxy (QUEUE lr-f05)
Contract IDs:   160180, 160181, 160981, 160482 (CH-16382)
Actions:        setTournamentEntries takes an optional squad; createTournamentFromCalendar takes lockMinutes; updateTournament is sent lockMinutes
Data impact:    loadTournamentLineup reads the event's B entries (squad B), tolerant of the held migration; the edit form reads lock_minutes
Held items:     supabase/migrations/20261116091000_golf_tournament_b_team.sql (Risk MEDIUM, see HELD.md)
```

### Changed

- Lineup builder: once the event can hold a B team, a Team switch (A team,
  B team) shows the B spots and the B alternate, with "The B team plays as
  individuals: its scores never count in the team's record." A B player is
  saved as an individual of squad B with their spot, so every team score
  leaves the B team out (D-92). The head adds "B team 3 of 5".
- Before the held migration the switch is not shown, and a B entry sent
  anyway is refused with "A B team arrives with the next update. Nothing was
  saved."
- The head's lock chip reads "Lock by Tue 7:50 AM", not "Locks": nothing
  locks a lineup at that time; it locks itself when round 1 starts. Past the
  time, CH-16382 says so and the chip turns amber.
- Event form, under More: "Lineup lock" (10 or 30 minutes, 1 or 2 hours, or
  the day before round 1's first tee). The line under the rounds reads "Lock
  the lineup by …, an hour before the first tee. It locks itself when round 1
  starts." Edit opens on the saved value (it used to show 10 whatever was
  saved, and did not send it).

### Why

- Coaches enter a B team at many events; it must never count in the team's
  record. The old "Locks …" chip promised an automatic lock that does not
  exist.

### Verification

- `src/clubhouse/__tests__/tournaments-b-team.test.tsx`,
  `src/app/golf/actions/__tests__/tournaments-b-team.test.ts`,
  `src/app/golf/actions/__tests__/tournaments-calendar.test.ts` (lock time),
  `src/clubhouse/screens/tournaments/__tests__/edit-model-ties.test.ts`,
  `src/clubhouse/screens/tournaments/fields/__tests__/rounds-model.test.ts`.
- pgTAP `supabase/tests/rls/golf_tournament_b_team.sql`: written, not run.
- Not yet: a real-app screenshot on staging.
