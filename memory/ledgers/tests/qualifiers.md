# Qualifiers test ledger

## 2026-08-22 — manual-only qualifier completion

- `src/lib/golf/__tests__/qualifier-lifecycle.test.ts` proves that an
  `upcoming` qualifier may automatically start after a submitted round, but no
  lifecycle state can automatically become `completed`.

## 2026-08-22 — superseded date-based lifecycle behavior

- The historical date-boundary rule is intentionally not retained: schedule
  dates are never a close condition under the manual-only lifecycle contract.

## 2026-08-23 — terminal qualifier identity RPC regression suite

- Added `supabase/tests/rls/golf_round_submit_identity.sql` with direct
  authenticated RPC coverage for stale qualifier metadata, duplicate legacy
  numbers, a manually closed qualifier, malformed/oversized numbers, and
  cross-player denial.
- The Continue Round source regression also verifies that a legacy
  missing-number scorecard opens the constrained chooser instead of failing
  final submission with no recovery path.
- The suite is pending execution on a database-enabled runner; local Docker is
  unavailable on this machine, and no production database was touched.
