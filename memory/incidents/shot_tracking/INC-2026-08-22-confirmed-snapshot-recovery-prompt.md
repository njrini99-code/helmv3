# INC-2026-08-22 — confirmed scorecard shown as unsaved recovery

- Feature: `shot_tracking` (also affects the Golf Round Lifecycle feature)
- Status: released — production health verification passed; recurrence observation pending
- Risk: R2 — active player completion workflow
- First seen: 2026-08-22
- Last seen: 2026-08-22
- Repair SHA: `48b41e1c4d8c86f12f5a2becd11454f5bd3899e2`

## User impact

After iOS backgrounded an 18-hole scorecard, players could reopen the final
summary and receive a full-screen "Recover Unsaved Progress?" drawer. The
drawer was a duplicate local copy, but it intercepted the submit action and
made a completed scorecard look unsafe.

## Confirmed root cause and invariant

The `pagehide` and `visibilitychange` handlers wrote an emergency local copy
after the server had already acknowledged the same scorecard. On the next
Continue Round mount, recovery relied only on the fallback timestamp: because
the local write occurred after `updated_at`, it was declared newer and shown.

Invariant: a local fallback is recoverable only if it contains progress not
already durably stored by the server. A newer timestamp is never sufficient
evidence by itself. Once all holes are checkpointed, closing or backgrounding
the final summary must leave the round resumable through Continue Round and
must not add a recovery blocker.

## Repair

- Canonicalize and compare local and server progress, excluding only
  server-generated shot IDs and object-key ordering.
- Clear an emergency save only through the timestamp it has acknowledged, so
  a newer concurrent fallback is retained.
- Skip final-scorecard page-hide backups after all holes are server
  checkpointed; unfinished rounds remain in Continue Round until submission.

## Customer data remediation

Under explicit owner direction, two affected 18-hole in-progress rounds were
completed from their already-persisted hole data. Their round totals,
qualifier-entry aggregates, and player-stat caches were recalculated and
read back successfully. The qualifier lifecycle was not changed.

## Verification

- `src/lib/utils/emergency-save.test.ts`: 6 tests passed.
- `src/app/golf/actions/__tests__/golf-schemas.test.ts`: 25 tests passed.
- `npm run typecheck` and ESLint passed.
- Repository-wide preflight remains blocked by an unrelated unchecked
  Supabase-read baseline (1050 vs 1049); no database reads were added here.
- A local full build is environment-blocked by generated-output disk
  exhaustion after source compilation; production will use a fresh builder.
- Production deployment `dpl_Dyi1PUxGBTjoQvoZAza25wwRhZP4` built successfully
  from the repair state and is aliased to `https://helmsportslabs.com`.
  Its health check returned HTTP 200 with a healthy database.
