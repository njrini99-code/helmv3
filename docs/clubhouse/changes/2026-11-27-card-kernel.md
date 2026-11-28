# Shared pieces — Changelog

## 2026-11-27 — The card kernel, and chart pins that follow their round

```text
Design package: none (design lab pilot P1, QUEUE dsx-02; design-lab/05-research-report-review.md)
PR/commit: claude/project-thread-2f9vkq
Contract IDs: none
Actions: none changed
Data impact: none
Held items: none
```

### Changed

- New `ui/Card.tsx` and `styles/card.css` (loaded by the shell): one card
  composed from named parts (header with eyebrow, title, meta, icon and
  actions; metric with unit and delta; visual; body; footer), with kinds
  (metric, entity, chart, comparison, alert, list), option F's green title
  bar and the feature card as attributes, a pressable mode (one button or
  link named by its face, the card press scale, an outline focus ring), and
  loading, empty and failed states built in. Forced colours keep the edge
  with a real border. No screen uses it yet; Roster's top cards move onto
  it after #2610 merges.
- `ui/Surface.tsx` exports its nesting guard so a Card inside a Surface
  (or a Card) is flagged in development.
- `lib/use-chart-pin.ts` takes `ids`: a pin follows its datum, and drops
  when that datum leaves, instead of staying on an index. The round trend
  and the scoring feature chart pass round ids.
- Preview only: `/clubhouse-preview/card-lab` shows today's Roster leader
  cards beside the kernel.

### Why

- Option F is drawn per page today (negative margins and doubled selectors
  in each stylesheet), so every new screen redoes it and drifts. Nick, 27
  Nov: "I want the cards to be better. Read the whole report. Upgrade
  components."
- A refresh that adds a round before a pinned one moved the pin to another
  round (the report's datum-identity point, confirmed in the code).
