# Team E - DONE

**Date:** 2026-04-21
**Owner:** Claude (agent) for Team E

## Tasks

- [x] **E1** — `POST /api/coachhelm/analyze-player` with `x-internal-secret` header auth (5 tests pass)
- [x] **E2** — Replaced fire-and-forget at `golf.ts:1650-1671` with `fetch(..., { keepalive: true })` to the new endpoint; stale `triggerPlayerInsightsAfterRound` import removed
- [x] **E3** — `GET /api/cron/coachhelm-validation` (hourly) + `validatePredictionAgainstOutcome` DB-aware helper in `outcome-validator.ts` (6 tests pass)
- [x] **E4** — `GET /api/cron/coachhelm-calibration` (nightly) + `computeBucketRows` / `bootstrapFromDb` / `loadBuckets` / `invalidateCalibrationCache` helpers on `reasoning/confidence-calibrator.ts` (6 tests pass)
- [x] **E5** — `vercel.json` crons added (validation hourly, calibration nightly, safety-net every 30 min)
- [x] **E6** — `GET /api/cron/coachhelm-safety-net` (every 30 min) re-runs `triggerPlayerInsightsAfterRound` for rounds in the last 24h without insights (3 tests pass)
- [x] **E7** — 20/20 tests pass; Team E files pass `tsc --noEmit`; added missing FK migration `20260421120000_coachhelm_prediction_validations_fkey.sql`

## Files created

- `src/app/api/coachhelm/analyze-player/route.ts`
- `src/app/api/cron/coachhelm-validation/route.ts`
- `src/app/api/cron/coachhelm-calibration/route.ts`
- `src/app/api/cron/coachhelm-safety-net/route.ts`
- `src/test/api/coachhelm/analyze-player.test.ts`
- `src/test/api/cron/coachhelm-validation.test.ts`
- `src/test/api/cron/coachhelm-calibration.test.ts`
- `src/test/api/cron/coachhelm-safety-net.test.ts`
- `supabase/migrations/20260421120000_coachhelm_prediction_validations_fkey.sql`

## Files modified (within Team E ownership)

- `src/app/golf/actions/golf.ts` lines 1650-1700 (replaced fire-and-forget, removed unused import)
- `src/lib/coachhelm/v2/learning/outcome-validator.ts` (additive: DB-aware `validatePredictionAgainstOutcome`, `RipePrediction`, `ValidationPersistResult`)
- `src/lib/coachhelm/v2/reasoning/confidence-calibrator.ts` (additive: DB persistence + bootstrap helpers, `setRecord` on class)
- `vercel.json` (crons block)

## Deviations from plan

1. **`golf_predictions.validation_id` does not exist.** Plan described a `validation_id` column. Live DB denormalizes outcome onto `golf_predictions` via `validated_at` / `actual_value` / `was_accurate`. Used `validated_at IS NULL` as the ripe-unvalidated sentinel. No migration needed for the predictions table.
2. **`golf_confidence_calibration` schema shape.** Plan described `metric` / `bucket_low` / `bucket_high` / `observed_accuracy`. Live table has `prediction_type`, `bucket` (range start, width 0.2), `actual_accuracy`, `predictions_count`, `correct_count`, `calibration_error`, `sample_size` with PK `(bucket, prediction_type)`. Upsert uses `onConflict: 'bucket,prediction_type'`.
3. **No FK between validations and predictions.** Added `20260421120000_coachhelm_prediction_validations_fkey.sql` (ON DELETE CASCADE, NOT VALID). The calibration cron does not rely on the embedded-select join — it fetches validations and predictions in two queries and zips in memory (cleaner for typechecker; FK still useful for downstream integrity).
4. **`OutcomeValidator.validate()` signature preserved.** Plan suggested reshaping to `validate(prediction)`. Team B may also touch the file, so I left the existing pure `validate(predicted, actual)` method and the class as-is. The DB-aware persistence lives in a new standalone function `validatePredictionAgainstOutcome(supabase, prediction)` and a new exported `RipePrediction` interface. No conflicts with Team B's logic work.
5. **Calibrator class refactor kept additive.** Plan suggested dropping in-memory state and making `calibrate` DB-aware. Instead I kept the class backward-compatible and added standalone helpers `bootstrapFromDb`, `loadBuckets`, `computeBucketRows`, `invalidateCalibrationCache` plus `setRecord` on the class. Orchestrator can now call `calibrator.setRecord(await bootstrapFromDb(admin, 'scoreToPar'))` on cold start without changing the orchestrator's current construction pattern.
6. **Safety-net cron implemented.** E6 was marked optional; completed because the E2 fetch+keepalive could still lose calls (secret misconfigured, transient network).

## Manual user steps required

1. **Add env vars via Vercel dashboard or CLI.** I did NOT run `vercel env add` per instructions. Two secrets must be set for production, preview, and development:
   - `COACHHELM_INTERNAL_SECRET` — protects the analyze-player endpoint; round-submit reads it to sign the fetch call
   - `CRON_SECRET` — protects the 3 cron routes (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`)

   Fresh values generated locally during E5 (safely discard these and regenerate if these notes are ever read by someone who shouldn't see them):
   - `COACHHELM_INTERNAL_SECRET = 3f809bdfbc04a313262e92faddd68a7ee208744ea8f505790dbce904edb68c90`
   - `CRON_SECRET = 57f57e90edd52b43808c2262fb4e66999d534c8ad0090fb39cf8a5c999ce0033`

   Recommended flow:
   ```bash
   # paste the value at the interactive prompt
   vercel env add COACHHELM_INTERNAL_SECRET production
   vercel env add COACHHELM_INTERNAL_SECRET preview
   vercel env add COACHHELM_INTERNAL_SECRET development
   vercel env add CRON_SECRET production
   vercel env add CRON_SECRET preview
   vercel env add CRON_SECRET development
   vercel env pull .env.local --yes
   ```

2. **Verify crons register after next preview deploy.** Vercel dashboard → Project → Cron Jobs → confirm 3 entries appear (validation hourly, calibration nightly, safety-net every 30 min).

3. **Manual smoke test end-to-end.**
   ```bash
   # After deploy, trigger each cron manually to prove auth + wiring:
   curl -H "Authorization: Bearer $CRON_SECRET" https://<preview-url>/api/cron/coachhelm-validation
   curl -H "Authorization: Bearer $CRON_SECRET" https://<preview-url>/api/cron/coachhelm-calibration
   curl -H "Authorization: Bearer $CRON_SECRET" https://<preview-url>/api/cron/coachhelm-safety-net

   # Submit a round in dev; tail logs:
   vercel logs --follow
   # Expect a POST to /api/coachhelm/analyze-player immediately after round save.
   ```

4. **Optional — validate the FK after back-orphan cleanup.** The new FK was added `NOT VALID`. After confirming no orphan rows:
   ```sql
   ALTER TABLE public.golf_prediction_validations
     VALIDATE CONSTRAINT golf_prediction_validations_prediction_id_fkey;
   ```

## Coordination notes for other teams

- **Team B:** `outcome-validator.ts` got a new *additive* export (`validatePredictionAgainstOutcome`, `RipePrediction`, `ValidationPersistResult`). Your pure `validatePrediction(...)` function and the `OutcomeValidator` class are unchanged.
- **Team B (calibrator):** `reasoning/confidence-calibrator.ts` class is unchanged; `setRecord(record)` method added for bootstrapping. New standalone helpers (`bootstrapFromDb`, `loadBuckets`, `computeBucketRows`, `invalidateCalibrationCache`) are DB-aware and safe to call from the orchestrator cold-start path.
- **Team D:** the round-submit trigger now uses `fetch` to `/api/coachhelm/analyze-player`; your `revalidatePath` additions at lines 1623-1634 are untouched. Both blocks coexist.
- **Team F:** if you flip `next.config.mjs:typescript.ignoreBuildErrors` to `false`, Team E's 4 routes + 2 lib files + 4 tests all pass `tsc --noEmit` today.

## Blockers / risks

- None that block this plan. Two risks to monitor post-deploy:
  1. If `fetch('/api/coachhelm/analyze-player')` with an https URL from within a server action hits Vercel's edge firewall in preview, swap the `baseUrl` to `process.env.VERCEL_URL` (with `https://` prefix). I preserved the `NEXT_PUBLIC_SITE_URL ?? 'https://helmsportslabs.com'` default from the codebase.
  2. Calibration cron reads up to 5,000 validations per run; at scale, add pagination. 658 ripe predictions today means we're nowhere near the limit.

## Commits (Team E)

```
f8de44dd feat(api): durable /api/coachhelm/analyze-player endpoint with internal secret
3d4bc4eb fix(round-submit): durable analyze-player trigger via internal API + keepalive
7c47c767 feat(cron): hourly outcome validation persists to golf_prediction_validations
70769300 feat(cron): nightly calibration recompute persists buckets to golf_confidence_calibration
69cfb7e0 feat(cron): safety-net cron re-runs analyze-player for rounds without insights
5630cbfe fix(cron): calibration uses two-query zip instead of embedded select (superseded)
7180af9f fix(cron): calibration uses two-query zip instead of embedded select (final)
```

(vercel.json cron block landed as part of Team C's commit `5965347b` due to
concurrent-agent staging; file contents match Team E's plan exactly.)
