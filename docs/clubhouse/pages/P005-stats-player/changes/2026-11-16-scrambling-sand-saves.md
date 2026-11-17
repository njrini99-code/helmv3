# 2026-11-16 — stats player

## 2026-11-16 — Scrambling counts sand saves

```text
Design package: none (coach request, Ben, 2026-11-16)
PR/commit:      claude/scrambling-counts-sand-saves
Contract IDs:   none added or reworded
Actions:        none
Data impact:    scrambling figures move once held migration 20261116200000 is applied (backfills round caches)
Held items:     supabase/migrations/20261116200000_golf_scrambling_counts_sand_saves.sql
```

### Changed

- `OverviewZones.tsx`: the Scrambling definition says sand saves count.

### Why

- A coach asked for sand saves inside the scrambling percentage, with Sand
  saves still its own stat. A hole with a greenside-bunker visit is now a
  scrambling chance, and a sand save a scramble made, counted once per hole.

### Verification

- `stats-golden.test.ts` (G1 now 5 of 8), `stats-production-parity.test.ts`,
  and pgTAP `golf_scrambling_counts_sand_saves.sql`. Not checked in a browser
  or on a device.
