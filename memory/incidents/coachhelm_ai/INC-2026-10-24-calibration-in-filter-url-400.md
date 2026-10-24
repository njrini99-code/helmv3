# INC-2026-10-24: the calibration cron put 633 ids in one `.in()` and PostgREST rejected the URL

- Feature: `coachhelm_ai`
- Surface: `GET /api/cron/coachhelm-calibration` (nightly 03:40 UTC)
- Status: FIX IN PR #2360 (14f8a808a); not merged, not deployed
- Risk: R1. Read path only. No schema, RLS, grant or data-shape change; bucket math unchanged.
- Signal: Bridge `07cd1dea` ("cron.calibration.fetchPredictions failed: Bad Request", error, extra.predictionIdsCount 633) and `05dde3b3` ("Cron failed: coachhelm-calibration"), both first seen 2026-10-24 03:40:43Z, 1 each. background_job_logs coachhelm-calibration failed 2026-10-24 03:40Z after completed runs every night 10-19..10-23.

## What was wrong

`handleCalibration` (`src/app/api/cron/coachhelm-calibration/route.ts`) loads the
90-day `golf_prediction_validations`, then fetches their parent predictions with
one `.in('id', predictionIds)`. Every id goes into the query string. The
validation table grew from 29 rows (the comment's figure) to 661, so the 90-day
window held 633 distinct ids, about 24 KB of URL, and PostgREST answered 400
"Bad Request" (code null) before Postgres ran. The cron returned 500 and wrote
no calibration buckets, so CoachHelm confidence calibration stops refreshing.

## Fix

- The predictions lookup runs per `chunkIds(predictionIds)` slice (200 ids,
  `src/lib/supabase/chunk-ids.ts`), concatenating the rows; any chunk error
  still fails the run loudly with the same log line.

## Proof

- `src/test/api/cron/coachhelm-calibration.test.ts` "chunks the predictions
  lookup so 633 ids never build a URL PostgREST rejects (07cd1dea)" fails on
  origin/main f30a6d509 (`expected 500 to be 200`) and passes with the fix.
- Replay: `replay/manifests/calibration-in-chunk-2026-10-24.yml`.

## Verify in production

After deploy: the next 03:40 UTC coachhelm-calibration heartbeat is
`completed` with buckets written, and `07cd1dea` / `05dde3b3` do not recur.
