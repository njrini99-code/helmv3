# P004 — Changelog

## 2026-11-27 — The Scoring average card reads its trend at a glance

```text
Design package: none; Nick's ask (27 Nov 2026, screenshot of the team Scoring average card): "What about this can you redesign it"
PR/commit: branch clubhouse-depth-contrast (local, not pushed)
Contract IDs: CTL-P004-030, CTL-P004-031, CTL-P004-032 unchanged
Actions: none changed
Data impact: none (the same window, figures and standard error)
Held items: real device screenshots (this environment can't run a browser); before and after drawn from the tokens instead
```

### Changed

- The card's chart (`TeamFeatureChart`) is a trend preview: one line and its
  round-day dots, the newest a size up, and the first and last dates under
  them. The gradient fill, the gridlines, the y-axis numbers and the dashed
  "Round-day avg" line are gone from the card, and no other number is drawn:
  the newest round day (73.4) would have sat under the 73.6 headline.
- The preview's scale spans at least 4 strokes, centred on the days (the span
  the old axis drew, 72 to 76). Without axis numbers, a 1.7-stroke drift drawn
  edge to edge read as a big change beside "No clear change". Under par sits higher, as on every Clubhouse score chart; the words
  "Lower scores sit higher" (or "Par · under par sits higher" with par's dash)
  sit under the drawing.
- The tap-through (`TeamScoringDetail`) is unchanged: it keeps the axis, the
  grid and the round-day average as its reference line.
- No clear change: the pill now says "No clear change" in neutral ink and the
  signed figure follows it in plain text ("−0.9 vs previous 10"). A clear
  change keeps its arrow and tone in the pill ("↓ 0.9 lower", "than the 10
  before"). Same words as Home (W27); only which part is boxed moved.
- The feature card's window ("Each player’s last 10") takes its own row under
  the title, so "Scoring average" stays on one line at 390.

### Why

- At 390 the title broke over two lines beside the window.
- "Round-day avg 73.9" under a 73.6 headline was a second average beside the
  headline, the reading W26, F-0009 and STATS-P-04 each flagged.
- A boxed "−0.9" beside "No clear change" read as a result and then its denial
  (the same reading PL-HOME-02 and CONS-20 fixed on Home).
- Apple's HIG: a preview chart needs no gridlines or axis labels; the detail
  view has them. Hole19 and Arccos lead with the number and a bare trend line.

### Verification

- `src/clubhouse/screens/stats/__tests__/team-line-days.test.tsx`: only the
  two dates as words, no second average or grid, the key's words, lower sits
  higher, a small spread draws as a small move.
- `src/clubhouse/screens/stats/__tests__/scoring-feature-chart.test.tsx`: par
  key against par; strokes with no par line.
- `src/clubhouse/screens/stats/__tests__/shs-change-chip.test.tsx`: the flat
  and the clear chip.
- Contrast on the card (unchanged tokens): line 5.87:1 day, 5.6:1 night;
  dates (ink-3) 6.76:1 day, 6.45:1 night; key (ink-2) 8.84:1.
