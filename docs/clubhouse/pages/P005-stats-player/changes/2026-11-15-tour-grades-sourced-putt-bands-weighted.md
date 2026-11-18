# 2026-11-15 — stats (player)

## 2026-11-15 — Tour grades only on sourced rows; putt bands weighted (SC-08)

```text
Design package: none (data rule; the layout does not change)
PR/commit:      claude/project-thread-5yymil (PR #2536)
Contract IDs:   none added or reworded
Actions:        none
Data impact:    reads golf_pga_standards with select('*'); no write
Held items:     supabase/migrations/20261115223000_golf_pga_standards_sources.sql (HOLD)
```

### Changed

- A putting band's Tour mark is the Tour's make rate at the distances its putts
  were from, putt by putt (`puttBandTourRate`,
  `src/lib/golf/benchmarks/putting.ts`), where the row cites a per-distance
  breakdown (PGA 3–5, 10–15 and 15–25 ft). A 3–5 ft band of 4- and 5-footers
  now reads (91.4 + 80.7) / 2 = 86.1, not the plain 3-4-5 mean of 90.5; the
  nine-band view's 15–20 and 20–25 ft read 18.3 and 12.5, not 15.4 for both.
  5–10 ft, 25+ ft and every LPGA band cite no breakdown and keep their value.
- Every Tour grade reads through `readTourStandards`
  (`src/clubhouse/data/stats-common.ts`): a row grades only when it names its
  source page (`source_url`). Until the held migration adds the column, every
  row grades as before, so nothing else moves on deploy. Once it is applied,
  an unsourced row's figure shows with no Tour mark.

### Why

- Stats and charts audit, SC-08: the Tour values rest on estimates with no
  cited page, and the 3–5 ft standard averaged 3, 4 and 5 ft equally although
  the band (over 3 ft, up to 5) holds no 3-footer when putts are logged in
  whole feet.

### Verification

- Vitest: `src/clubhouse/data/__tests__/tour-standards-sourced.test.ts`,
  `src/lib/golf/benchmarks/__tests__/putting.test.ts` and
  `src/clubhouse/__tests__/stats-parity.test.tsx` (mocked data).
- pgTAP `supabase/tests/rls/golf_pga_standards_sources.sql` 9 of 9 on the local
  stack.
- No screenshots: this cloud session has no signed-in staging state. The
  layout is unchanged; only the Tour mark's value on the putting bands moves.
