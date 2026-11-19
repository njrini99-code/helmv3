# P003 Roster — Changelog

## 2026-11-19 — Opening a profile pushes once

```text
Design package: none
PR/commit: agent/clubhouse-native-polish
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `screens/roster/Roster.tsx`: a face or name opens the profile through
  `usePushOnce` (the shared navigation hold).

### Why

- Audit 2026-11-19: a direct `router.push` did not hold a double tap.

### Verification

- `screens/roster/__tests__/card-picks-player.test.tsx`: a second tap inside
  the hold pushes nothing more.
- `npm run clubhouse:check`. WebKit before and after numbers are in the PR body.
