# P004 — Changelog

## 2026-11-27 — The scoring mix's par segment holds 3:1, and the bogey mark has room

```text
Design package: none; Nick's ask (27 Nov 2026): "more depth more modern premium look", "color contrast has been an issue"
PR/commit: branch clubhouse-depth-contrast (local, not pushed)
Contract IDs: none changed
Actions: none changed
Data impact: none
Held items: before and after pictures still owed
```

### Changed

- `stats.css` (shared with P005): the scoring mix's par segment is edged in
  `--ch-border-control` (3:1 or better on the card by day and at night), not
  the ledger hairline (1.3:1).
- `--ch-chart-bogey` (day) is #a87d40, was #b3884a: 3.46:1 on the card (was
  3.00:1); its numeral in ink-950 holds 5.0:1. The page's cards lift with the
  deeper card elevation (shared entry:
  `docs/clubhouse/changes/2026-11-27-depth-and-contrast.md`).

### Why

- WCAG 2.2 SC 1.4.11 asks 3:1 for graph marks. Par is a quiet fill on a quiet
  card, so its edge has to carry the segment.

### Verification

- `src/clubhouse/styles/__tests__/chart-mark-contrast.test.ts`: bogey on the
  card, ink-950 on bogey, and the par edge is the control border.
