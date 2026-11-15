# 2026-11-12 — home

## 2026-11-12 — Team scoring's line names its days and marks its best and toughest

```text
Design package: none (owner's preview walk, 11 Nov 2026)
PR/commit:      agent/preview-fixes-ui
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (the form carries each point's day and round count)
Held items:     none
```

### Changed

- The line has its first and last days under its ends. Its best and toughest
  days, the lowest and highest team average, are marked on it and named in a
  line below ("Best day 73.4 · Oct 13", "Toughest day 74.6 · Sep 2"). A marked
  day that rests on one round says so ("· 1 round").
- A change under its standard error is no longer the card's boldest figure. It
  is set in plain weight and tertiary ink beside "No clear change vs previous
  10".
  A clear change keeps its gain or loss colour.
- `ChTeamForm` gains `lineDays` and `lineCounts`, filled by `teamForm` from the
  same round days the line already reads. With neither (an older fixture), the
  card draws no labels.

### Why

- Preview walk W3: "A chart with no axis, no dates, no values and no marked
  points: a green area with a V in it", and the bold "−0.8" sat over "No clear
  change".

### Verification

- WebKit on `/clubhouse-preview/home` at 1920 and 390: labels inset with the
  plot, both marks drawn, the change in quiet type.
- `screens/home/__tests__/form-line-ends.test.tsx` (4 cases) with
  `home.test.tsx`: 80 passed.
