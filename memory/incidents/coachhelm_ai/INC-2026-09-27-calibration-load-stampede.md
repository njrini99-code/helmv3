# INC-2026-09-27: the insight feed read golf_confidence_calibration once per insight

- Feature: `coachhelm_ai`
- Surface: `GET /golf/dashboard` (any page that ranks the CoachHelm insight feed)
- Status: MERGED in #2080 (17343f1a6) on 2026-09-27; awaiting production deploy (production 6ee77e98e as of 2026-09-27 09:48Z)
- Risk: R1. Read path only. No schema, RLS, grant or data-shape change; ranking and calibration math unchanged.
- Signal: Sentry N+1 Query JAVASCRIPT-NEXTJS-SB (performance issue, level info, 0 users), 37 events since 2026-09-04, last 2026-09-27 01:37Z on production release 6ee77e98e. Not a Bridge (admin_events) fingerprint.

## What was wrong

`rankFeed` in `src/app/golf/actions/insight-delivery-ranking.ts` scores every
insight inside one `Promise.all`. Each score goes through
`scoreInsightWithCalibration` -> `bootstrapFromDb` -> `loadBuckets`
(`src/lib/coachhelm/v2/reasoning/confidence-calibrator.ts`). `loadBuckets`
keeps a 5-minute module cache, but fills it only after the read resolves. On a
cold serverless instance every concurrent caller missed the cache and sent its
own identical `select` on `golf_confidence_calibration`: N reads for N
insights.

## Fix

- `loadBuckets` keeps the read in flight in `inflight` and hands the same
  promise to every caller that misses the cache while it runs. The slot is
  cleared when the read settles, so a failed read is still not cached and the
  next call retries. `invalidateCalibrationCache` also clears it.

## Proof

- `src/lib/coachhelm/v2/__tests__/calibration-load-dedupe.test.ts` fails on
  origin/main b4f95df96 (`expected 8 to be 1`, `expected 2 to be 1`) and
  passes with the fix. The existing calibration bootstrap tests, the active
  feed ranking test and the calibration cron test pass unchanged.
- Replay: `replay/manifests/calibration-load-dedupe-2026-09-27.yml`.

## Verify in production

After deploy: Sentry JAVASCRIPT-NEXTJS-SB stops receiving events.
