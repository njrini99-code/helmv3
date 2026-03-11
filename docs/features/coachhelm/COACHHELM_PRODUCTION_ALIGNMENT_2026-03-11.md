# CoachHelm Production Alignment

Date: March 11, 2026

This document records the live CoachHelm contract after the March 11, 2026 production alignment pass.

## What changed

- Internal CoachHelm persistence now uses the Supabase service role for writes that are not valid under player-session or coach-session RLS.
- Coach insight inserts now use the live `golf_coach_insights` contract:
  - `content` for body text
  - recommendations stored in `metadata.recommendation`
  - team-wide insights use `insight_type = 'team_trend'`
- Prediction writes now use the live `golf_predictions` contract:
  - `confidence_interval_low` / `confidence_interval_high`
  - `predicted_low` / `predicted_high`
  - `prediction_context`
  - `confidence_factors`
  - `key_drivers`
  - `input_features`
- Shot dispersion patterns now persist as `pattern_type = 'contextual'` with `metadata.pattern_subtype = 'shot_dispersion'`.
- Post-round CoachHelm generation now runs in-band after round submission, logs failures to `error_logs`, and records generation attempts in `golf_insight_generation_log`.
- Coach enable/disable checks now read `golf_coachhelm_settings` by `coach_id`, which matches live RLS.

## Live database objects CoachHelm now depends on

- `golf_coach_insights`
- `golf_patterns_v2`
- `golf_predictions`
- `golf_validations`
- `golf_insight_generation_log`
- `golf_coachhelm_settings`
- `golf_team_coachhelm_settings`
- `golf_causal_relationships`
- `golf_confidence_calibration`

## Production migration applied

Migration file:

- `supabase/migrations/20260311192653_coachhelm_production_alignment.sql`

Applied to production on March 11, 2026. The migration:

- backfills `golf_coachhelm_settings.user_id` and `team_id`
- creates `golf_causal_relationships`
- creates `golf_confidence_calibration`
- enables RLS and service-role policies for both new tables

## Verification notes

Direct database verification after migration confirmed:

- `golf_causal_relationships` exists
- `golf_confidence_calibration` exists
- `golf_coachhelm_settings` no longer has null `user_id` rows for coach-backed records

This pass does not backfill historical CoachHelm insights, patterns, predictions, or validations. The next real round submission or manual CoachHelm generation will populate the repaired pipeline.
