# INC-2026-11-20: holding a finger still on the scoring chart threw

- Feature: `stats_analytics`
- Surface: Clubhouse Stats scoring feature chart (`ScoringFeatureChart.tsx`)
- Status: RESOLVED. Fixed in PR #2612 (2feb73e8), live in production since dpl_HoG6pCe1DUfNaRZzLCJt7R3FvjZA (ready 2026-11-25 05:17Z); 0 occurrences since; 0822e4af and rel:497ba56b resolved 2026-11-26 05:17Z by the desktop health routine (two-write, ledger rows present).
- Risk: R1. Client render path only. No schema, RLS, grant or data change.
- Signal: Bridge `0822e4af` (client error, iOS app) and reliability signal `rel:497ba56b`, 1 occurrence 2026-11-20 12:47Z.

## What was wrong

The 120 ms touch-hold timer passed `{ clientX }`, cast `as never`, into a
picker that read `e.currentTarget.getBoundingClientRect()`. Every still hold
threw; only a sideways drag worked. The cast hid the mismatch from the compiler.

## Fix

`pick` takes the chart element and the x coordinate; the `as never` cast is gone.

## Proof

- `src/clubhouse/screens/stats/__tests__/scoring-feature-chart.test.tsx` hold
  cases threw `TypeError ... (reading 'getBoundingClientRect')` on 0a42b76a8f
  and pass with the fix.
- Replay: `replay/manifests/scoring-chart-touch-hold-2026-11-24.yml`.

Backfilled 2026-11-26 by the desktop health routine: PR #2612 shipped the fix
without its incident file or release-queue item.
