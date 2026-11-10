# 2026-11-07 — shared

## 2026-11-07 — A named duration for a chart's marks settling

```text
Design package: design-refresh/stats/redesign/clubhouse-stats.html
PR/commit:      agent/ch-stats-v2
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

`lib/motion.ts` gains `CH_MARKS_MS` (360), the script-side twin of
`--ch-dur-marks`. The Stats scoring line's morph on a window change reads it, and
the Stats window cross-fade reads `CH_DUR.base`, instead of literals. No value
changed.
