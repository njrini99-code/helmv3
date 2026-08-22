# Shot Tracking test ledger

## 2026-08-22 — single-flight mutation coverage

- SHA: uncommitted; pending review and commit.
- Added regression coverage for Undo/Edit overlap and stale-shot reconciliation.
- Updated `src/lib/admin/__tests__/observe-action-result.test.ts` to guarantee
  that `shot_not_found` remains a handled warning and is not captured by Sentry.
