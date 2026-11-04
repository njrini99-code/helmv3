# 2026-11-03 — Stats (player): redesign plumbing behind its flag

## 2026-11-03 — PR 4a: the flag, the detail route and the practice default

```text
Design package: design-refresh/stats-home (02-PLAN, Completeness pass)
PR/commit:      agent/stats-pr4a-plumbing
Contract IDs:   S-STATS (plumbing only)
Actions:        none
Data impact:    none with the flag off; with it on, practice rounds leave the
                default figures
Held items:     none
```

### Changed

- New flag `clubhouse_stats_redesign_v1`, off in every environment; read once in
  routes/stats.tsx and passed as `shs`.
- `countsForScoring` and `course_id` in data/season.ts; the loaders' practice
  default behind the flag, pressure gap and by-type row uncut.
- Missed short reads the calculator's figure behind the flag (miss-split.ts).
- Unused so far: detail-route.ts, use-stats-detail.ts, StatsDetailScreen.tsx
  (with DetailHero), `GameDetail` `only`, `RoundLine` `refLine`.

### Verification

- Not run: the owner deferred testing to the end of the build.
