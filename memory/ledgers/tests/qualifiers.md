# Qualifiers test ledger

## 2026-08-22 — manual-only qualifier completion

- `src/lib/golf/__tests__/qualifier-lifecycle.test.ts` proves that an
  `upcoming` qualifier may automatically start after a submitted round, but no
  lifecycle state can automatically become `completed`.

## 2026-08-22 — superseded date-based lifecycle behavior

- The historical date-boundary rule is intentionally not retained: schedule
  dates are never a close condition under the manual-only lifecycle contract.
