# P011 Rounds — Changelog

## 2026-11-19 — A switch to Rounds draws its first screen of rows first

```text
Design package: none
PR/commit: agent/clubhouse-verify-switch
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `TeamRounds.tsx` (coach, phone): the frame that shows Rounds after a section
  switch draws the first 10 rows (`FIRST_SCREEN_ROWS`, `firstScreenRows`), and
  the rest of the window, with "Show earlier rounds", a frame after that frame
  is on screen (`useArrivalPainted`, as coach Stats already does). Hydration and
  a return by Back draw every row at once, so the scroll lands where it was.
  Nothing seen changes: the cut is below the first screen.

### Why

- F-23 (audit 2026-11-19): the switch's worst frame was 54–79 ms in WebKit on
  the production build, every run. 665 of the page's 848 nodes sat below a
  screen and a half.

### Verification

- W phone, production build, 5 runs from Messages: Rounds' worst frame went
  from 52–67 ms to 48–50 ms (0 of 5 runs over 50 ms; it was 5 of 5). In the
  first frame, 10 rows; settled, 40 rows and "Show earlier". Back from a review
  draws 40 rows in its first frame, and the scroll restores to 700 with the
  heading still.
- `screens/rounds/__tests__/team-rounds-first-screen.test.ts`.
- No visible change, so no screenshots.
