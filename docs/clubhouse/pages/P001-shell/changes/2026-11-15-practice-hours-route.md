# 2026-11-15 — shell

## 2026-11-15 — Practice hours sits below Calendar

```text
Design package: none (launch readiness F-03; the page itself is logged on P006)
PR/commit:      claude/project-thread-8hytxy (QUEUE lr-f03)
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `shell/nav.ts`: `/golf/dashboard/calendar/hours` is a rebuilt child of
  Calendar (Calendar stays the selected section), and on a phone it is pushed
  below Calendar with Back "Calendar" and the title "Practice hours" (a
  player's: "Your practice hours").

### Why

- The new Practice hours page (P006, F-03) opens from Calendar's More and
  goes back to it.

### Verification

- `src/clubhouse/__tests__/calendar.test.tsx` covers the More entry that
  opens the page. No test names the two new nav rows yet, and the push and
  Back have not been checked in a browser.
