# Clubhouse cross-page changes

## 2026-11-06 — Redesign sweep: one source for the numbers (SYS-7, QA-1/2/3)

- `data/figure-window.ts` is the one place a figure's rounds and strokes
  gained are worked out: Team view, Roster and Stats call it. A cross-page test
  holds them to the same count and legs for the same window.
- Figures name their window. Team view and Roster read the season, Home the
  last 10; the labels say so.
- Ask's tables hold players only, and a failed visual falls back to its table.
