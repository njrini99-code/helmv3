# 2026-10-23 — Chart defects (Clubhouse A+ WP-2)

## 2026-10-23 — Eleven chart faults that each misled (A8)

```text
Design package: none (Clubhouse A+ handoff, section 5, A8)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

1. Ask's trend (`chat/Evidence.tsx`): a lower-is-better metric is drawn
   with lower values higher and says "Lower is better"; the axis uses
   `niceTicks`, so its labels are round numbers.
2. RoundTrend: strokes gained ticks a half stroke apart print one decimal
   (`tickDigits`), so two ticks never read "+1".
3. The zero line and the gauge's zero mark name the women's Tour for a
   women's team (`sgBaseline(tour).zero` and `.mark`).
4. FigureGauge: the bar fills at most its own half; the end value is
   labelled, with "≥" when the value is past it.
5. Putts by round reads lower as better.
6. The green's bold label is the side most misses finish on, by the same
   test as its colour.
7. The Rounds library's month spark reads to par per 18 holes.
8. A putting ring under 10 putts keeps a fixed early fill, not its rate.
9. Chart tick text (`.ch-tick`, `.ch-ax`, `.ch-th-ax`) carries `ch-num`
   for tabular numbers; no new `font-variant-numeric` declaration.
10. The team phone trend's Mean weighs each round day by its whole rounds
    (`days[].n`).
11. The score trend's par line is drawn only when every round in view
    shares one par. The unused `ScoreLine` and its two tests are removed.

### Why

- Each one misled: a better score drawn lower, "+1, +1, +0" ticks, the
  women's Tour called "Tour", a gauge past its track, putts coloured as if
  more were better, and a month of nine-hole rounds reading as great golf.

### Verification

- New `screens/stats/__tests__/round-trend.test.ts`,
  `charts-gauge.test.tsx`, `chart-labels.test.tsx` and
  `screens/coachhelm/chat/__tests__/evidence-direction.test.tsx`.
