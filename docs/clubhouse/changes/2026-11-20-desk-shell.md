# Clubhouse shared — Changelog

## 2026-11-20 — Desktop shell and page head (premium plan, batch 2)

```text
Design package: premium plan 2026-11-19, batch 2
PR/commit: agent/clubhouse-desk-shell
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- D17a: the sidebar's current row is a calm selection. It is the
  frame's ivory at 11% (`--ch-nav-sel-bg`), the label at 600 and
  the icon in ivory, with no shadow. It was the ivory card.
- D1: the page canvas, the sidebar, a dialog's or sheet's body and
  anything marked `data-ch-scroll` show the system's thin overlay
  scrollbar for a fine pointer. Other scrollers keep no bar.
- G1b: on a desk a reading sheet (`.ch-sheet`) keeps its ivory card,
  so section titles and notes sit on paper. Player Home is held as
  built and keeps its flush sheet.
- G1b: the shared Section is a card on a desk, in the card anatomy.
  Its one sheet goes flat inside it. A Section holding a Surface, an
  empty card or several sheets keeps its head for batch 3.
- C-01: browserslist is Safari and iOS Safari 16.4.
