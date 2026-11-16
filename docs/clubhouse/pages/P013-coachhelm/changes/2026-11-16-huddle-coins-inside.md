# 2026-11-16 — P013

## 2026-11-16 — The huddle keeps every coin's tap circle inside the chart (TEAM-1)

```text
Design package: none
PR/commit:      agent/ch-p0-gate
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

On a wide range the huddle's data padding is only a few points, so a coin at the top or right edge put its
44 tap circle past the chart's box (1 past on the stress board). The range now widens at its high end until every
coin's circle fits. The gate's known TEAM-1 lines are removed.
