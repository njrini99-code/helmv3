# 2026-11-07 — shared

## 2026-11-07 — The sliding plate no longer scales

```text
Design package: design-refresh/redesign-ui-sweep-2026-11-06
PR/commit:      agent/numbers-one-source
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

`useSlidePlate` moves a plate with a translate and its width. The scale it used
squashed the segmented pill's corners mid-glide. It serves Segmented, the section
strip, the hole map, Team Hub's tabs and the Stats tabs.
