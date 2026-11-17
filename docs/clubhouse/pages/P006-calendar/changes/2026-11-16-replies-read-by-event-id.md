# 2026-11-16 — calendar replies read by event id log

## 2026-11-16 — Replies are read by the shown events' ids

```text
Design package: none (speed review before the next deploy, 16 Nov 2026); no owner board
PR/commit:      perf/calendar-rsvp-and-exposure-reads (#2562)
Contract IDs:   62101 (P006)
Actions:        none
Data impact:    none (reads only; golf_event_attendance by event_id)
Held items:     none
```

### Changed

- Nothing a coach or player sees. The replies under each event now load by
  the ids of the events shown instead of through a join on the event filtered
  by team and window, which walked every team's replies (836ms mean on
  production for about 20 rows; about 10ms now). The practice plans start
  beside the events, so a load makes no extra round trip.

### Verification

- `src/clubhouse/__tests__/calendar.test.tsx` (62101) and
  `calendar-parity.test.tsx`; EXPLAIN ANALYZE on production as a coach,
  read-only: 253ms and 21,349 buffers before, 9.7ms and 168 after.
