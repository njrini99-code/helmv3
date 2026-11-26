# P005 — Changelog

## 2026-11-25 — The stats files both pages share are numbered under P004

```text
Design package: none (Bridge PR 2, spec §4.7, owner decision D11)
PR/commit: bridge/pr2-controls
Contract IDs: none
Actions: none changed
Data impact: none
Held items: none
```

### Changed

- The controls in the stats files P004 and P005 share (`StatsFilter`,
  `WindowSwitch`, `DeskPane`, `ShsBlocks`, `SummaryCard`, `StatsDetailScreen`,
  `ScoringFeatureChart`, `routes/stats.tsx`) carry `CTL-P004-*` ids: a file
  claimed by both pages' root goes to the lower page id. P005's own screens
  are numbered `CTL-P005-*` in the next change.

### Why

- An id is permanent, so the tie is settled once, explicitly, in
  `clickable-map.mjs` `pageOf`.
