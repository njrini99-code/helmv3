# 2026-11-15 — home

## 2026-11-15 — Team scoring: Last 10, Season, All time, and figures that say their window

```text
Design package: none (prod audit 2026-11-15, HOME-P-10, HOME-D-06, HOME-P-09, HOME-P-11, HOME-P-13, HOME-P-14, HOME-P-01, STATS-P-12)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only)
Held items:     none
```

### Changed

- `data/span.ts` `ChFormWindow`, `screens/home/HomeSpanSwitch.tsx`, `data/home.ts` `teamForm`, the dashboard page: the switch offers
  Last 10, Season (from 1 August in the team's zone) and All time, as Stats does for this figure (`?range=season`, `?range=all`).
  The rest of Home stays on the season under Last 10 and Season (HOME-P-10).
- `teamForm`: the line draws every round day the figures rest on, not the last ten, so it spans the card's dates (HOME-D-06).
- `HomePhone.tsx` `Form`: the label is "Average", and the window is said beside the dates as Stats says it ("Each player’s last 10",
  HOME-P-11). A change inside its error has no signed number, only "No clear change vs previous 10"; a clear one is "−0.9 strokes" and
  better or worse (HOME-P-09). Greens and putts do the same (HOME-P-14). Best and toughest day come from days two or more rounds rest on
  (HOME-P-13). The Rounds cell counts the rounds the row rests on; this week's count is in This week (HOME-P-14).
- `screens/home/model.ts`: several players tied at the longest quiet spell are counted ("4 of them for 50"), never one named. Home's quiet
  days read Roster's rounds and Roster's day count (`quietDaysSince`, HOME-P-01).
- `data/home.ts`: the four parts' cache is read for the parts' own rounds (practice out), and the short-game rate is named Scrambling, as
  Stats names it (STATS-P-12).

### Why

- Home's switch called its Last 10 value `season` and had no Season. The line kept ten days under a "May 29 – Oct 21" basis. "−0.8"
  sat over "No clear change". "Mason the longest at 50" while Roster showed four at 50. "Up and down 30%" against Stats' "Scrambling 33%".

### Verification

- `__tests__/home.test.tsx`, `__tests__/home-span.test.ts`, `screens/home/__tests__/form-line-ends.test.tsx`,
  `screens/home/__tests__/subline-ties.test.ts`, `screens/stats/__tests__/span-switch.test.tsx`, `data/__tests__/home-quiet-days.test.ts`.
- Not checked in a browser or on a device in this change.
