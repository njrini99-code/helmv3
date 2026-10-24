# 2026-10-24 — Stats and data honesty (Clubhouse A+ lane C, logged by S2)

## 2026-10-24 — Lane C: one change rule, honest zeros, shared scales, real time

```text
Design package: none (Clubhouse A+ phase 2, lane C; merged in 719649416)
PR/commit:      ed11c04b4, 067ba5364, 6c717720a, c206123b1, be55af1e2,
                f724166bb, f51bec0a0, e7915a1ea, a31be1ec9, 2e89b5b4c
Contract IDs:   none
Actions:        none
Data impact:    reads only (the season's zone from golf_team_settings.timezone)
Held items:     the SQL readers that use CURRENT_DATE (C10); Fairway's own
                ranking (owner decision A)
```

### Changed

- Row 93 (A1): change words and tones on Game detail's comparison, the Deep
  dive, Momentum and the phone trend use the one noise-tested rule; "Steady"
  reads "No clear change".
- Row 98 (A2): a value that prints as zero gets no gain or loss tone (Ask's
  legs, the form ribbon, the team trend's ends).
- Row 101 (A7): Player Home's legs and Coach Home's greens hold to the rate
  floors; the Tour bar is neither "level" nor an early read.
- Row 102 (B5): shared chart scales say their ends, under the leg cards and in
  the form lines' column header.
- Row 119: dated charts space their points by real time.
- Row 120 (AX-17): every Line, round trend and leg bar chart carries its
  figures as a table after its summary.
- Row 115 (decision 10): the qualifier board ranks complete cards first.
- Rows 104 and 116 (decision 9): every season read turns on 1 August in the
  team's time zone.

### Why

- The A+ plan's Stats and data-honesty rows; lane C stalled before logging
  them, so they are logged here.

### Tests

- Named in each commit; the season zone in `data/__tests__/season.test.ts` and
  `stats-team.test.tsx`.
