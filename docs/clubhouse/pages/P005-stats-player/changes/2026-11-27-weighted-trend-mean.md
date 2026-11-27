# P005 — Changelog

## 2026-11-27 — The five-round average weighs a nine as half a round

```text
Design package: none (design lab pilot P3, QUEUE dsx-04, gap GAP-B1)
PR/commit: claude/project-thread-2f9vkq
Contract IDs: none
Actions: none changed
Data impact: the trend's average line moves only where its window holds a 9-hole round
Held items: none
```

### Changed

- The five-round average on the round trend (`RoundTrend`) and on the
  scoring feature chart (`ScoringFeatureChart`) weighs each round by its
  holes: a 9-hole round, drawn per 18 (doubled), counts as half a round.
  An 18 of 74 with nines of 38 and 40 now averages 76, which is 152
  strokes over 36 holes, where it read 76.67 before. Windows of 18-hole
  rounds draw exactly as before.
- The scoring feature chart's press, hold, scrub, haptic ticks and arrow
  keys now run on the shared chart interaction (`useChartPin`, release
  'restore') rather than a private copy. What a player feels is the same
  (a still finger reads after 120 ms, lifting restores the average, a
  quick tap reads nothing), with two alignments: the sideways move that
  starts a scrub is the shared 8 px (it was 6 px), and on a desk a mouse
  over the chart reads the round under it, as every other stats chart
  does.

### Why

- The page states the nines rule (`NINES_LINE`: a 9-hole round counts as
  half a round) and every pooled average on it follows it; the line was
  the one figure that did not, so a player with nines saw a line that
  disagreed with their scoring average (design lab gap register,
  GAP-B1).
- One scrub for every stats chart is the design lab's chart pilot (P3):
  a fix to the scrub now reaches every chart at once.

### Verified

- Unit: `meanSeries` and `rollingMean` weighted cases; the feature
  chart's hold, release, tap and drag cases; the 26 chart test files
  (300 tests) pass.
- Real-app screenshots on staging are owed from the Mac (real-data rule);
  none are claimed here.
