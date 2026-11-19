# P006 Calendar — Changelog

## 2026-11-19 — The More menu's Practice hours pushes once

```text
Design package: none
PR/commit: agent/clubhouse-native-polish
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `screens/calendar/Calendar.tsx`: the Practice hours item pushes through `usePushOnce`, so it starts the shared navigation hold.

### Why

- Audit 2026-11-19: menu items that called `router.push` directly did not hold a double tap.

### Verification

- The Calendar suite.
- `npm run clubhouse:check`. WebKit before and after numbers are in the PR body.
