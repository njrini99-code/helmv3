# P004-stats-team — Changelog

## 2026-11-22 — Round trend drawn at its true width (desk)

```text
Design package: premium plan 2026-11-19, batch 3 (C9, section 3.9)
PR/commit: agent/clubhouse-desk-screens
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- On a desk the round trend's drawing is as wide as the chart is
  drawn, one unit a pixel. Its tick and label text keep their size at
  every window width; with the fixed 680 box they grew and shrank
  with the card.
- The phone chart keeps its fixed 340 box.
