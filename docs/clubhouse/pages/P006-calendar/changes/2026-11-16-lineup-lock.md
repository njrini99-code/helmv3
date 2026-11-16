# 2026-11-16 — tournament lineup lock log

## 2026-11-16 — The tournament sheet sets the lineup lock time (F-05)

```text
Design package: none (launch readiness findings, 15 Nov 2026, §4 F-05); no owner board
PR/commit:      claude/project-thread-8hytxy (QUEUE lr-f05)
Contract IDs:   160181 (P016)
Actions:        createTournamentFromCalendar takes lockMinutes, set right after the create with the tiebreak
Data impact:    golf_tournaments.lock_minutes (existing column)
Held items:     none
```

### Changed

- The calendar's tournament sheet shares the event form's fields, so it gains
  "Lineup lock" under More and the "Lock the lineup by …" line. A lock time
  that doesn't save after the create says so in the toast.

### Verification

- `src/app/golf/actions/__tests__/tournaments-calendar.test.ts` (160181).
- Not yet: a real-app screenshot on staging.
