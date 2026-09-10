<!-- markdownlint-disable MD013 -->
# Rounds library — `/golf/dashboard/rounds` (coach + player)

Files: `src/components/fairway/pages/rounds/FairwayRoundsLibrary.tsx` (711), `FairwayRoundRow.tsx`, `FairwayUnfinishedBanner.tsx`, `FairwayRoundCard.tsx`.

## What the capture shows

Eyebrow "TEAM ROUNDS", h1 "The library.", five StatTiles (Rounds, Avg score, Best round, Avg to par, % under par) — two with a 90-point sparkline squeezed into 60px that reads as noise — then a full-width player Select, a full-width search Input, a grouping Segmented, then grouped Surfaces of round rows. The rounds themselves, the point of the page, start 1,400px down on a phone.

## SCREEN

- Archetype: E (chronology) with a B-style toolbar.
- Dominant object: the rounds timeline (grouped rows by date / player / course).
- Supporting: one StatStrip under the title (Rounds · Avg · Best · To par · Under par), the unfinished-round banner when present.
- Tertiary: export/print, grouping.
- Floating: dock (mobile); sticky Toolbar when stuck.
- Modal: none.

## EXISTING FAIRWAY

ViewHeader, StatStrip (replaces five StatTiles), TickerStrip (last 15 scores under the strip on desktop only), Toolbar (search + player Select + grouping Segmented + "Log round" primary), Surface with seam rows, FairwayRoundRow, StatusPill, EmptyState.

## CONTAINERS TO REMOVE

1. Five StatTiles → one StatStrip (one object, tabular, delta chips; no sparklines in cells). The scoring trend gets ONE TickerStrip beneath the strip on desktop.
2. Select + Input + Segmented stacked full-width → one Toolbar row (search left, player filter as a FilterPill/Menu, grouping Segmented right, primary "Log round").
3. One Surface per group → one matte Surface for the whole list with group headings as sticky seam headers (date, count, avg for the group) — the group Sparkline stays only if it has ≥ 6 points, otherwise a plain avg.
4. "Scoring trend · Improving" pill floating between tiles and filters → folded into the StatStrip's avg cell as the delta chip.

## COMPOSITION (desktop)

```text
ViewHeader  TEAM ROUNDS / The library. / 97 rounds · May–Aug 2026     [Log round]
StatStrip   97 rounds · 75.4 avg ↓0.7 · 68 best · +3.6 to par ↓ · 19% under par
TickerStrip ▁▃▅▂▆▃▁▄▂▅▃▂▁▃▂  (last 15 team rounds, tap → round)
Toolbar     [🔍 player or course]  [All players ▾]   [By date · By player · By course]
Surface
  ── Aug 31 · 5 rounds · 74.2 avg ──────────────────────────────
  Cole Bennett   QA Test Course     Qualifier   73  +1   →
  Tyler Hayes    QA Test Course     Qualifier   70  −2   →
  ── Aug 2 · 4 rounds · 71.8 avg ───────────────────────────────
```

Phone: StatStrip scrolls horizontally (2 visible + peek), no TickerStrip, Toolbar collapses to search + filter Sheet, rows compress to name · course · score/to-par.

## STATES

- Loading: strip skeleton + 8 row skeletons inside the surface.
- Empty: EmptyState with "Log round" and the recover link when an unfinished round exists.
- Error: InlineNotice inside the surface.

## RISKS

- Player view of the same route uses the same component with different copy; keep the branch.
- Tests pin the group Sparkline and the "Filter rounds by player" aria-label.
