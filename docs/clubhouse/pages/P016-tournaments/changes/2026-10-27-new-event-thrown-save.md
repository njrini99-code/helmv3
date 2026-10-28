# 2026-10-27 — New event: a save that throws is said

## 2026-10-27 — New event form: a thrown save gets the standard error toast

```text
Design package: design/handoff v3 (unchanged)
PR/commit:      branch fix/clubhouse-coach-must-fixes
Contract IDs:   CH-6001 (reused, not new)
Actions:        createTournamentFromCalendar (unchanged)
Data impact:    none
Held items:     none
```

### Changed

- The form kept `useAction` quiet for every outcome, but it only draws an
  outcome once the save returns. A save that threw (a lost connection, a
  server error) was caught by `useAction` and then silenced, so the coach got
  no notice, toast or haptic. Now the action stays quiet only for the outcomes
  the form drew itself (the toast with Open, or the notice at the top); a
  thrown or rejected save gets the standard CH-6001 error toast with Try again
  and the error haptic.

### Why

- Review must-fix on PR 2379: nothing fails silently.

### Verification

- `tournaments-eventform.test.tsx`: a rejected save shows the CH-6001 toast,
  plays the error haptic and reports it; a refused save is still said once, by
  the page.
