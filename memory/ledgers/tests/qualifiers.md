# Qualifiers test ledger

## 2026-08-23 — atomic qualifier round-cap creation

- `src/app/golf/actions/__tests__/create-qualifier-round-count.test.ts`
  proves a multi-round qualifier carries `num_rounds` in the initial database
  insert and rejects a missing cap, so no successful creation can depend on a
  later best-effort update or a silent default.
- `src/components/fairway/pages/qualifiers/__tests__/FairwayNewQualifier.submit.test.tsx`
  proves coaches must acknowledge a one-round cap while normal qualifier and
  roster submissions still reach the server action.
- `src/test/golf/actions/qualifier-save-write-integrity.test.ts` proves an
  invalid edit value is rejected instead of being silently clamped to one.
- `src/app/golf/actions/__tests__/golf-save-partial-round.test.ts` and
  `src/test/golf/components/FairwayNewRoundEntry.test.tsx` prove an open
  cap-reached state reports exact `submitted/cap` progress in setup instead of
  disappearing or being mislabeled as a completed qualifier.
- The production migration was exercised in a rolled-back subtransaction: a
  cap reduction below an already recorded qualifier round was rejected, and
  the live qualifier state remained unchanged.

## 2026-08-22 — manual-only qualifier completion

- `src/lib/golf/__tests__/qualifier-lifecycle.test.ts` proves that an
  `upcoming` qualifier may automatically start after a submitted round, but no
  lifecycle state can automatically become `completed`.

## 2026-08-22 — superseded date-based lifecycle behavior

- The historical date-boundary rule is intentionally not retained: schedule
  dates are never a close condition under the manual-only lifecycle contract.

## 2026-08-23 — terminal qualifier identity RPC regression suite

- Added a direct authenticated RLS regression suite for persisted
  round-submission identity, covering stale qualifier metadata, duplicate
  legacy numbers, a manually closed qualifier, malformed/oversized numbers,
  and cross-player denial.
- The Continue Round source regression also verifies that a legacy
  missing-number scorecard opens the constrained chooser instead of failing
  final submission with no recovery path.
- The suite is pending execution on a database-enabled runner; local Docker is
  unavailable on this machine, and no production database was touched.
