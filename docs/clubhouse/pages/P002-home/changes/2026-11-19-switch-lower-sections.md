# P002 Home — Changelog

## 2026-11-19 — Home's lower sections draw a frame after a switch

```text
Design package: none
PR/commit: agent/clubhouse-verify-switch
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `HomePhone.tsx` (coach, phone): Team scoring and the team's game, which end
  the page well below its first screen, render a frame after a section
  switch's first frame is on screen (`useArrivalPainted`). Hydration and a
  return by Back draw them at once. Nothing seen changes.

### Why

- F-23 (audit 2026-11-19): the switch to Home's worst frame was 54–77 ms in
  WebKit on the production build.

### Verification

- W phone, production build, 5 runs from Messages: Home's worst frame went
  from 54–77 ms to 33–54 ms (2 of 5 runs over 50 ms; it was 5 of 5). Team
  scoring is on the page once settled. Back to Home restores the scroll to
  700, with the heading still.
- No visible change, so no screenshots.
