# 2026-10-24 — Standing covers this season, and each row says how many rounds it stands on

## 2026-10-24 — Standing's window and row counts (Clubhouse A+ rows 104, 105, 121)

```text
Design package: none (Clubhouse A+ lane notes, rows 104, 105 and 121; owner decision 9)
PR/commit: agent/aplus-standing (draft PR opened by the lead)
Contract IDs: none (no new state; the hero and the rows carry the window and the count)
Actions: none
Data impact: reads golf_player_standing_season (held migration 20261024151000); falls back to golf_player_standing until it is applied
Held items: 20261024150000 (refresh queue), 20261024151000 (season table); owner applies
```

### Changed

- The hero names the window first: "This season from Aug 1 · 14 rounds · Refreshed Oct 24". The count is the season's own (the most rounds any row stands on), not the lifetime cache.
- Each row ends its comparison line with its own round count ("12 rounds").
- The Pressure group says "this season" instead of "over the last 90 days" when the rows are this season's.
- The lifetime scoring average is no longer stated under "This season" (it is still the projections' base).
- Until the season table is deployed the page reads the lifetime table and says "All time", with no row counts.
- A saved round now refreshes the player's teams' season Standing within minutes (the dirty pass, every 5 minutes, after a 3-minute quiet period), instead of the next night.

### Why

- Owner decision 9: "Standing window (B13.1): this season (from 1 August, team time zone), labelled". The rows mixed lifetime cache values, a 90-day pressure window and all-time approach proximity under no label (row 104). Standing had no per-row count (row 105) and went stale until the nightly run (row 121).

### Verification

- `coachhelm-standing.test.tsx` (season rows, the lifetime fallback, last season's rows dropped, a failed season read, the hero and row counts on screen) and `coachhelm-standing-shape.test.ts`.
- Screenshots (before and after, 390 px, player): not taken in this change; owed before the gate moves.
