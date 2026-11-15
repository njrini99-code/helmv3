# 2026-11-15 — one change rule and honest chart helpers

## 2026-11-15 — Shared chart pieces for the stats and charts audit (CH-03, CH-05, CH-09, CH-11, CH-15, CH-23)

```text
Design package: none (owner's stats and charts audit, 15 Nov 2026, section 5)
PR/commit:      claude/project-thread-szdz3m
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     colours and tokens (visual-system thread)
```

### Changed

- `lib/stats-signal.ts`: `SIGNAL_Z = 2`. `deltaTone` and `halvesTone` colour a
  change only past two standard errors, the rule course history already used;
  at one, a change that was pure noise was painted 32% of the time (CH-05).
  `MIN_TREND_POINTS = 4`: a trend's change needs two points a half (CH-10).
  Every page that colours a change follows it: Home, Roster, Stats, Rounds,
  Tournaments and CoachHelm.
- `lib/chart.ts`: `gappedPath` and `gappedArea` are straight segments that break
  across a gap, never a curve bridged across it (CH-15); `lonePoints`,
  `weekShares` and `dateShares` space weeks and rounds by date (CH-11);
  `parColumns` draws columns from a par line, better up, on a range with a
  minimum span (CH-09, CH-14); `zeroBars` draws bars across from a zero rule,
  negative values to the left (CH-23). `monotonePath` is kept only for Player
  Home's game line, whose look is locked.
- `ui/FormLine.tsx` `FormBars` and `ui.css` `.ch-formbars.is-dots`: the form
  strip is a dot per round on one score range (at least four rounds' spread),
  the mean a dashed rule, no bar floor (CH-03). `FormLine`'s tone follows the
  two-SE rule.
- `ui/CrhLine.tsx`: takes `dates` and spaces rounds by them (CH-11).
- `ui/charts/Line.tsx` `washOf`: the wash reads signed coordinates, so a
  segment above the plot keeps its area (CH-23).

### Why

- The owner's stats and charts audit (15 Nov 2026), section 5: one rule for
  when colour means a real change, and shared helpers so every chart draws
  better up, from zero or a stated reference, by date, and straight.

### Verification

- Tests: `lib/__tests__/stats-signal.test.ts`, `lib/__tests__/chart.test.ts`,
  `ui/__tests__/FormLine.test.tsx`, `ui/__tests__/CrhLine.test.tsx`,
  `ui/charts/__tests__/line-wash.test.ts`, and the page tests that lock the new
  rule (`__tests__/home.test.tsx`, `home-coach-parity.test.tsx`,
  `logic.test.ts`, `screens/home/__tests__/home-desk-parity.test.tsx`).
