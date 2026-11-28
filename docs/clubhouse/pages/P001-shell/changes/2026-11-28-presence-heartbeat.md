# P001-shell — Changelog

## 2026-11-28 — Clubhouse sends the presence heartbeat again

```text
Design package: Clubhouse error tracking gaps (Fairway vs Clubhouse comparison)
PR/commit: agent/clubhouse-tracking-gaps (#2674)
Contract IDs: none new
Actions: none
Data impact: updates the signed-in user's last seen, as the Fairway shell did
Held items: none
```

### Changed

- `ClubhouseFrame` calls `usePresence()` after it tags the session, so a
  coach or player using Clubhouse updates their last seen again.
- `shell.test.tsx` covers the heartbeat; `team-switch.test.tsx` mocks it.

### Why

Fairway's shell sent this heartbeat. Retiring Fairway on Nov 15 stopped it, so
golf last seen went stale.
