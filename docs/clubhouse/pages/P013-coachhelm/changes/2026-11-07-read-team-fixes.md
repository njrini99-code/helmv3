# 2026-11-07 — P013

## 2026-11-07 — Read and Team: four owner fixes

```text
Design package: none
PR/commit:      agent/ch-read-team
Contract IDs:   CH-13281, CH-13382 (read page now says them as catalogued)
Actions:        none new
Data impact:    none; one more read of golf_rounds, no schema change
Held items:     none
```

- TEAM-S1: the Tour bar is the Tour figure the read states. No bar when the
  units differ, and no other comparison is called Tour. The gauge agrees.
- READ-S1: the engine's confidence bookkeeping no longer reaches a coach,
  from new rows or stored ones, on the read, Deep dive or Fairway's tooltip.
  How sure reads "27 approaches. Enough for a solid read."
- READ-S2: a read stored with no round ids lists the rounds of its window, by
  the engine's rule. A failed read of them is CH-13281, never "no rounds". Each
  row links to its review.
- READ-S4: the skeleton is in the page's columns at both widths, and the page
  crossfades in over it in 180ms, in opacity, not under reduced motion. The
  coach's team read runs beside the feed.
