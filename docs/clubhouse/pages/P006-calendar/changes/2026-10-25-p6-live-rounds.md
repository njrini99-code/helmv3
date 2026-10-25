# 2026-10-25 — Live rounds (P-6): events say who is on the course

## 2026-10-25 — An event with players on the course (slice 4)

```text
Design package: build plan P-6 (handoff 4.34.6) with the 2026-10-25 changelog and recheck applied; Live rounds has no page of its own (P016 is Tournaments)
PR/commit:      claude/clubhouse-live-rounds (slice 4)
Contract IDs:   CH-16640, CH-16641
Actions:        none (reads only)
Data impact:    The coach's calendar route loads the team's live lanes beside the calendar (Promise.all); the events read adds `course_id` to its existing select. A player's calendar is unchanged
Held items:     none
```

### Changed

- A practice, qualifier or tournament event with players on the course (the
  event's day, the same course when both name
  one, the same kind of round) gets "Live · n on the course" in the coach's peek
and inspector: a 44 px row that opens
  the live view for the event. The week grid marks the block with a 6 px static
dot (named "n on the course").
- Matching is by round kind, day and course because `golf_events` has no
  qualifier id. "Happening now" is read as the
  event's day being the lanes' day.

### Why

- From the schedule a coach wants to know that practice has started (plan
  section 4.8).

### Verification

- `screens/calendar/__tests__/live-events.test.tsx` and the existing calendar
  tests; tsgo clean. No screenshots.
