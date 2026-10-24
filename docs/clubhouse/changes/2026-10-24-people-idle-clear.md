# 2026-10-24 — Palette People: cleared on the idle timeout too

## 2026-10-24 — The palette's People list is emptied when the frame unmounts

```text
Design package: none (Clubhouse A+ Round 1, S3 item 6; decision 16 follow-up)
PR/commit:      agent/aplus-s3
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     RLS for the People read checked while signed in as a real coach
                and player (unchanged, still open)
```

### Changed

- CommandLayer empties the in-memory People list (`clearPeople`) when it
  unmounts, and drops any People reply still on its way, so a late reply
  cannot refill it.

### Why

- Sign-out ends in a full page load, which empties memory. The idle timeout
  (`useSessionActivity`, src/lib/auth/session-activity.ts) signs out and goes to
  login with a client navigation, so the module kept the coach's names until
  the next sign-in. Login sits outside the dashboard layout, so the frame, and
  CommandLayer with it, unmounts on that navigation. The shared session hook is
  left alone.

### Verification

- command-layer.test › people: unmounting empties the list; a reply that lands
  after unmount never refills it. Both fail without the change.
