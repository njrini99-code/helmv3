# 2026-11-05 — P006

## 2026-11-05 — New event keeps its size; Today counts a new event at once

```text
Design package: none
PR/commit:      agent/clubhouse-open-items
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

Clear and Select all no longer resize or move the New event dialog: Find a time
stays on a desk at one height, and says why it is empty when no one is invited or
the event has no time to find. A phone's sheet scrolls and keeps its old behavior.

The Today card read the loaded events while the grid drew the published one, so
it said "Nothing on the team calendar today" beside a new block. It now reads
what the grid draws.
