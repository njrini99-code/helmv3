# 2026-10-31 — Home: the leaderboard is a client module

## 2026-10-31 — Leaderboard.tsx declares 'use client'

```text
Design package: none (main CI after #2422)
PR/commit:      claude/fix-leaderboard-client
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `screens/home/Leaderboard.tsx` starts with `'use client'`: since F-0034 its
  rows call `usePressPrefetch`, a hook from a client module. Only client
  components (CoachHome, HomePhone) render it, so nothing changes on screen.

### Why

- `client-boundary.test.ts` (unit shard 4) failed on main after #2422: a module
  without the directive imported a hook from a `'use client'` module.

### Verification

- client-boundary, home and row-link-pending tests pass.
