# 2026-10-27 — Polish pass: Stats

## 2026-10-27 — "Better than", no flat glyph, captions wrap

```text
Design package: none (production polish pass;
                doctrine in .claude/rules/clubhouse.md)
PR/commit:      agent/clubhouse-polish
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- "What changed" lines said "better vs previous 10"; the rest of the app says
  "Better than previous 10". They now read "better than previous 10"
  (`data/stats-insight.ts`, shared by team and player Stats).
- The strokes gained change chip, the KPI tape and the desktop lead drew a minus
  glyph before a value with no clear change, so "– −1.3" read as a double minus.
  No glyph without a clear change (`screens/stats/charts.tsx` SgChangeChip,
  `TeamTape.tsx`, `StatsTeamIslands.tsx`).

### Why

- One phrasing across the app; a sign must mean a sign. The "No clear change"
  caption and figure strip fixes this pass first carried are dropped: the visual
  pass (#2391) fixed the same spots.

### Verification

- `data/__tests__/stats-insight.test.ts`, `__tests__/stats-team.test.tsx`,
  `__tests__/stats-player.test.tsx` (269 Stats tests pass). WebKit at 390 and
  1280.
