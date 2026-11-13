# 2026-11-13 — stats (team)

## 2026-11-13 — Shared stats detail code: tee shots on one row (no team change)

```text
Design package: none (owner, 12 Nov 2026)
PR/commit:      agent/tee-grid-one-row
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Nothing on team stats. The shared files changed (`GameMore.tsx`,
  `detail.tsx`, `stats.css`) are mapped to this page too. They draw the
  player's Off the tee detail, which team stats does not render (only
  `StatsPlayer` and `StatsPlayerPhoneShs` mount `GameDetail`). See P005's
  fragment of the same date: "Where tee shots finish" is one row (Left, Center,
  Right), and approaches keep the 3×3 grid.
