# P004 — Changelog

## 2026-11-27 — The Scoring average card draws each round day as a bar from par

```text
Design package: none; Nick's ask (27 Nov 2026, after the trend preview): "Now I want it completely redesigned"
PR/commit: branch clubhouse-depth-contrast (local, not pushed)
Contract IDs: CTL-P004-030, CTL-P004-031, CTL-P004-032 unchanged
Actions: none changed
Data impact: none (the loader already sends each round day's score against par; the preview's sample days now carry it too)
Held items: real device screenshots (this environment can't run a browser); before and after drawn from the component's SVG output
```

### Changed

- When every round day has a score against par (CH-01), the card's chart
  (`TeamFeatureChart`) draws each day as a bar from par. A bar's length is the
  day's strokes against par per 18: a day over par hangs below the line, a day
  under par rises above it in the gain fill. The newest day is drawn at full
  strength; older days are quieter. A one-round day is an outline (W26).
- Par is a solid line named "Par" at its left end, in a gutter no bar crosses.
  The only other words in the drawing are the first and last dates; the key
  under it reads "Each bar is a round day, against par".
- The depth spans at least 3 strokes, so a team within a stroke of par never
  fills the drawing.
- Days stand in even slots. The strokes line keeps CH-11's date spacing; a
  bar's width carries no time, and an even slot keeps every day the same mark.
- On a card at least 600 wide (a desk, an iPad), the figure and the bars sit
  side by side: the figure in a 280 column, the bars beside it. A phone keeps
  one column.
- With a day missing par, the card keeps the strokes line, now always in
  strokes ("Lower scores sit higher"); its par drawing moved to the bars.
- The tap-through (`TeamScoringDetail`) is unchanged.

### Why

- Each round day is its own result, and the eye compares lengths from one
  zero faster than it reads a line's slope (Apple HIG, Charts: bars for values
  that stand alone, lines for continuous change). Bars from par are true to one
  another, so +2.8 to +1.4 draws as half, and a small change draws small beside
  "No clear change".
- Apple Health's highlight cards and Arccos's rebuilt Scoring Average both lead
  with the figure and give the trend one plain picture.
- At 1280 the previous preview ran 936 wide under a figure that used a third of
  the row.

### Verification

- `src/clubhouse/screens/stats/__tests__/team-par-bars.test.tsx`: square at
  par and rounded at the data end both ways; over par below, under par above in
  the gain fill; lengths in proportion; the preview's newest bar half its
  first; the 3-stroke floor; par at the top or bottom; newest and one-round
  marks; a level-par stub; even slots; 2 px between crowded bars; no number in
  the drawing; the spoken label.
- `src/clubhouse/screens/stats/__tests__/scoring-feature-chart.test.tsx`: bars
  against par; strokes with no par drawing when a day lacks par.
- `src/clubhouse/__tests__/stats-team.test.tsx`: the detail's reading is
  against par now that the preview's days carry par.
- Contrast on the card, every fill opaque and mixed on the card's green: older
  bars over par 3.76:1 day, 3.65:1 night; older bars under par 3.40:1, 3.29:1;
  the newest bar 11.3:1 and 10.8:1 (ink) or 5.87:1 and 5.60:1 (gain fill); par's
  line and its word 6.76:1 and 6.45:1.
