# 2026-10-24 — What changed, first (Clubhouse A+ S2, row 70)

## 2026-10-24 — The insight-first card at the top of Stats (row 70)

```text
Design package: none (Clubhouse A+ row 70, in the manner of Apple Health's
                Trends; no owner board)
PR/commit:      agent/aplus-s2
Contract IDs:   none (the card's two states have no CH code yet)
Actions:        none
Data impact:    none (reads the figures the page already loads)
Held items:     no mini chart in the card; no CH codes for its states
```

### Changed

- A card under the controls, before any figure: "What changed", with the one
  or two changes that clear their standard error, clearest first. Each line
  is the signed change in the page's gain or loss ink and the words that say
  which way ("−0.9 Scoring average, better vs previous 10").
- When there are changes to compare and none clears its error, the card reads
  "No clear change" ("Nothing has moved past its usual round-to-round spread
  vs previous 10."). With nothing to compare (the season, the qualifiers, a
  date range, too few earlier rounds) there is no card.
- Team stats reads every team figure the page draws with a change (scoring,
  strokes gained, greens, putts, scrambling, birdies), against the previous
  window.

### Why

- Row 70: say the one or two real changes in words at the top of Stats,
  through the one change rule (A1, row 93), so the card never claims more
  than the figure further down.

### Tests

- `data/__tests__/stats-insight.test.ts`: the rule, the order, "No clear
  change", no card.
- `stats-team.test.tsx` › "what changed (row 70)": desktop and phone, each line
  toned as the page tones that change, every toned figure signed.
