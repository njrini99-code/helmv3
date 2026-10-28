# 2026-10-27 — Live round split on the desk's own width

## 2026-10-27 — The live panel becomes a sheet when its columns do not fit

```text
Design package: none (FIX_LIST-2026-10-27, must-fixes)
PR/commit:      fix/clubhouse-tournaments-must-fixes
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The live round's panel sits beside the lanes only while the desk itself is
  944px wide (560px of lanes, the 360px panel and the gap). The desk measures
  its own width in a layout effect and keeps it in its own state
  (`useNarrow(deskWidth)` in `use-live-view.ts`), so a narrow window with the
  sidebar open gets the sheet, not squeezed lanes, and never paints the panel
  for a frame before it folds.
- The one-line lane draws only at 668px of container width, the room its
  columns, gaps and padding take; at 640px it clipped.

### Why

- FIX_LIST-2026-10-27 item: live layout overflow on desktop.
