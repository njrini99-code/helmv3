# Clubhouse (cross-page) — Changelog

## 2026-11-27 — Bridge signals: crashes, failed loads and sessions land right

```text
Design package: none (Bridge data findings on #2611)
PR/commit: agent/bridge-signal-fixes
Contract IDs: none new
Actions: 78 actions list the useAction names they are sent under; 4 list an outcome they already sent
Data impact: none (no migration; the columns from 20261124090000 are already in production)
Held items: none
```

### Changed

- `lib/signal.ts`: a crash caught while a page first draws comes before the
  shell configures the queue. `chSignalReport` now holds the crash's report
  with its signal and sends both once the shell configures, so the report
  carries the signal's place and gets its Bridge columns. If the shell never
  configures, the report still goes a microtask later, without a place.
- `lib/signal.ts`: a session read back from storage before the shell says who
  is signed in stays its owner's; if the shell then names someone else (a
  shared iPad), what waited moves to a new session numbered from 0.
- `ui/SectionBoundary.tsx`: reports through `chSignalReport`.
- `ui/StateSignal.tsx`, `ui/States.tsx`: a page whose one read failed (the
  danger empty) sends its state as a failure, so the Bridge stores it with
  its row and timeline, not only as a count.

### Why

- On production, crashes and failed loads were reaching the Bridge without a
  page, session or row to open (findings 2 to 5 on #2611).

### Verification

- `signal.test.ts`, `state-signal.test.tsx`, `states.test.tsx` and
  `stats-team.test.tsx`; the signal and log-error route tests.
