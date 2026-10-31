# 2026-10-31 — Calendar: set up a tournament from the calendar (P-5)

## 2026-10-31 — The editor opens with Track on from Tournaments

```text
Design package: P-5 steps 8-9 (handoff 4.11), never landed; recovered from
                claude/clubhouse-tournaments-from-calendar (owner, 2026-10-31:
                "make sure tournaments and all of the features we built are in
                there")
PR/commit:      agent/p5-port
Contract IDs:   none new on P006 (the P016 rows carry them)
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- The calendar route reads `setup=1`: Tournaments' "Set up from calendar"
  opens the event's editor with Track on. Anything else leaves it off.
- calendar-rounds.ts: when the tournament tables are missing, the calendar
  says so (`missing`) instead of failing, and the editor offers no
  tournament section.

### Verification

- calendar.test (159) and the P016 tests pass.
