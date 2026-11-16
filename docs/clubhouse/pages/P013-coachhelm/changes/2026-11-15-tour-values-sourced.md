# 2026-11-15 — CoachHelm

## 2026-11-15 — The board's Tour values follow the sourced-row rule (SC-08)

```text
Design package: none (data rule; no visible change until the held migration)
PR/commit:      claude/project-thread-5yymil (PR #2536)
Contract IDs:   none added or reworded
Actions:        none
Data impact:    reads golf_pga_standards with select('*'); no write
Held items:     supabase/migrations/20261115223000_golf_pga_standards_sources.sql (HOLD)
```

### Changed

- `tourBaselineOf` (`src/clubhouse/data/coachhelm.ts`) reads the Tour through
  the shared `readTourStandards` (stats-common) instead of its own copy, still
  telling a failed read apart ("Tour comparison unavailable"). A Tour value
  whose row names no source page (`source_url`) is no benchmark on the board.
  Before the held migration adds the column every row counts, as today.

### Why

- Stats and charts audit, SC-08: one rule for every Tour grade, so Stats and
  CoachHelm can never grade the same figure differently.

### Verification

- Vitest: `src/clubhouse/data/__tests__/tour-standards-sourced.test.ts` (the
  CoachHelm case) and the existing CoachHelm loader tests (mocked data).
