# 2026-10-27 — Polish pass: Stats

## 2026-10-27 — "Better than", no flat glyph, captions wrap

```text
Design package: none (production polish pass before launch; doctrine in .claude/rules/clubhouse.md)
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
- Desktop KPI tape captions were cut off ("No clear change vs previ…"); the words
  wrap under the figure (`styles/stats.css` `.ch-tp__d`).

- Phone player Stats: the figure strip's third column, the trend in words, ran
  past its column ("No clear change" is 118px in a 103px third) and ended 4px from
  the screen's edge at 375. The strip now gives the words 1.2 parts to the
  figures' 0.9 each, and the words wrap at a larger Text Size
  (`styles/stats.css` `.ch-stm-overview .ch-stm-figs.is-three`).
- Desktop player head: a no-break space ahead of each dot, so a wrapped line never
  starts with "· Charlotte, NC" (`screens/stats/StatsPlayer.tsx`).

### Why

- One phrasing across the app; a sign must mean a sign; a caption that ends in an
  ellipsis hides the comparison it names.

### Verification

- `data/__tests__/stats-insight.test.ts`, `__tests__/stats-team.test.tsx`,
  `__tests__/stats-player.test.tsx` (269 Stats tests pass). WebKit at 375, 390 and 1280.
