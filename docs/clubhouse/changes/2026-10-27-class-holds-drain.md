# 2026-10-27 — Class awareness: held pushes drain with the flag off

## 2026-10-27 — Turning class_awareness_v1 off never strands a held push

```text
Design package: review handoff of 2026-10-27 (must-fix item 4a); no new design
PR/commit:      fix/clubhouse-cal-must-fixes
Contract IDs:   none new
Actions:        releaseMyHeldPushes (Deliver now) runs with the flag off too
Data impact:    flag off: the minute job releases rows already held, no beat
Held items:     none
```

### Changed

- `class_awareness_v1` now gates only new holds (the gate in
  `src/lib/notifications/push.ts`). The minute job
  (`/api/cron/class-holds-release`) runs whatever the flag says, so rows held
  before the flag went off still go out when their class ends. With the flag
  off it runs as a drain (`runClassHoldRelease(..., { beat: false })`): no
  heartbeat, so `golf_push_hold_put` keeps answering `job_stale` and
  `golf_class_holds_live` stays false, and the database never reads holding as
  live while the app holds nothing. Its answer says `flag: 'off'`.
- Deliver now (`releaseMyHeldPushes`) no longer answers `released: 0` with the
  flag off: it delivers what the player has held.
- This revises the 2026-10-25 note ("With class_awareness_v1 off nothing
  runs") for the release side only: with the flag off nothing new is held and
  the send path is unchanged.

### Why

- Review must-fix: with the flag turned off, held pushes had no way out (the
  job returned before releasing and Deliver now returned 0).

### Verification

- `src/app/api/cron/class-holds-release/__tests__/route.test.ts`,
  `src/app/golf/actions/__tests__/release-my-held-pushes.test.ts` and
  `src/lib/notifications/__tests__/class-hold.test.ts` (the drain: no beat,
  release and safety net still run; a missing function reads as unavailable).
