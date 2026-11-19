# P010 Team Hub — Changelog

## 2026-11-19 — Waiting on names its window; the trip counts as Home does

```text
Design package: none
PR/commit: agent/clubhouse-native-polish
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `screens/hub/widgets.tsx`: the phone's Waiting on row says "3 rounds in 30 days" or "None in 30 days", not a bare "0 rounds" (F-11).
- `data/hub.ts` `tripToGo` and the trip tile: the countdown's number is whole days to the departure time, as Home counts it ("1 d 08 h" is 1 day to go, singular), calendar days when no time is saved; Today and Tomorrow stay the calendar's words (F-12).

### Why

- Clubhouse audit 2026-11-19 F-11 (the rows read as never) and F-12 (Home said 1 d 08 h, Team Hub 2 days, for one trip).

### Verification

- `data/__tests__/hub-trip-to-go.test.ts`.
- `npm run clubhouse:check`. WebKit before and after numbers are in the PR body.
