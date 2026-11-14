# P005 Stats (player) — 2026-11-13

## 2026-11-13 — Shared chart file touched for Team Stats only

```text
Design package: none (audit 2026-11-13: F-0009)
PR/commit:      agent/ch-look-coachhelm-stats
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Nothing a player sees. `screens/stats/ScoringFeatureChart.tsx` and
  `styles/stats-redesign.css` are shared with Team Stats: the team chart's
  dashed average moved from a label on its line to a key under the drawing
  (`.ch-shs-mean-label` replaced by `.ch-shs-mean-key`; P004's entry of the
  same date). The player's `ScoringFeatureChart` is unchanged.

### Verification

- The player's chart suites (`chart-resize-morph`, `stats-visuals-trend`,
  `stats-summary-cards`) run in `npm run check:changed`.
