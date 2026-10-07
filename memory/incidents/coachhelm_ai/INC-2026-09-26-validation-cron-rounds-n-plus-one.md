# INC-2026-09-26: the hourly outcome-validation cron read golf_rounds once per ripe prediction

- Feature: `coachhelm_ai`
- Surface: `GET /api/cron/coachhelm-validation`
- Status: FIXED in f29f86d50 on branch agent/health-20260926-1747; not merged yet
- Risk: R1. Read path only. No schema, RLS, grant or data-shape change; grading logic unchanged.
- Signal: Sentry N+1 Query JAVASCRIPT-NEXTJS-SV (performance issue, 0 users), firing every hour since 2026-09-20. Not a Bridge (admin_events) fingerprint.

## What was wrong

`resolveActualValue` (`src/lib/coachhelm/v2/learning/outcome-validator.ts`)
issued one `golf_rounds` read per ripe prediction, and the cron
(`src/app/api/cron/coachhelm-validation/route.ts`) called it in a loop. On
2026-09-26 every hourly run re-checked the same 115 predictions (all
`skipped_no_round_in_closed_window`), so 115 reads per hour, about 3.7-4.3s
per run. Re-checking closed-empty windows is intended (80% of rounds are
entered on a later day than played, so a back-dated round can still fill one);
the per-prediction read is not.

## Fix

- `prefetchCandidateRounds` does one `golf_rounds` read per 100 players over
  the batch's union window (earliest creation day to latest due day).
- `validatePredictionAgainstOutcome` takes the prefetched map. Each
  prediction's own window is still applied by `selectValidationRound`, so the
  graded round is unchanged.
- A chunk read that errors or reaches `PREFETCH_ROW_CAP` (1000) is discarded;
  those players fall back to the old per-prediction read, so PostgREST
  truncation can never turn a gradeable prediction into a skip.

## Proof

- `src/lib/coachhelm/v2/learning/__tests__/outcome-validator.prefetch.test.ts`:
  4 tests, all fail on origin/main 3d163873b (`prefetchCandidateRounds is not a
  function`) and pass with the fix. They cover one read per batch,
  per-prediction windows, truncation fallback, and the all-invalid batch.
- Replay: `replay/manifests/validation-rounds-prefetch-2026-09-26.yml`.

## Verify in production

After deploy: Sentry JAVASCRIPT-NEXTJS-SV stops receiving events, and the
`coachhelm-validation` heartbeat keeps the same `skipped_*` counts.
