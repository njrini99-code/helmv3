# P001 Shell — Changelog

## 2026-11-19 — A section's stylesheet is in place before the first switch

```text
Design package: none
PR/commit: agent/clubhouse-heading-jump
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `ClubhouseShell` mounts `useWarmStyles` (`shell/use-warm-styles.ts`).
  When the thread is idle, it puts in place the stylesheet of each page
  fetched ahead, so a first switch draws its page styled in its first
  frame. The shared entry is
  `docs/clubhouse/changes/2026-11-19-warm-section-styles.md`.

### Why

- F-26 (audit 2026-11-19): the player's Rounds and Team Hub headings
  moved down 30 and 60 px after a switch's first frame, because the
  page was drawn before its stylesheet applied.

### Verification

- Tier W, player phone, production build on staging. Before: Rounds
  moved +30 px in 3 of 4 runs and Team Hub +60 px in 2 of 4. After:
  6 of 6 runs with no move and no frame with a sheet still loading.
  The fix stops a movement, so it has no still screenshots.
