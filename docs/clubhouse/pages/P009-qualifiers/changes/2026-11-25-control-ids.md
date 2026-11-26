# P009 — Changelog

## 2026-11-25 — Every control has a permanent id (CTL-)

```text
Design package: none (Bridge PR 2, spec §4.7, owner decision D11)
PR/commit: bridge/pr2-controls
Contract IDs: none
Actions: none changed
Data impact: none
Held items: none
```

### Changed

- 66 controls on this page carry `data-ctl="CTL-P009-NNN"`, written by
  `npm run clubhouse:controls` (`clickable-map.mjs --assign`). The ledger is
  `config/clubhouse/controls/P009.json`: 36 run-time labels have a template,
  0 controls with no words got a ledger label, 7 link to an action and
  8 carry their 2026-09-30 board verdict.

### Why

- The Bridge counts taps per control, and a source line is not a stable name.
  The id is permanent; a removed control's id is tombstoned, never reused.

### Verification

- `node scripts/clubhouse/check.mjs` clean; a second `--assign` changes nothing.
