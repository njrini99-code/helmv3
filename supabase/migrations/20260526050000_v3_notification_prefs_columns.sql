-- W42 — extend golf_player_notification_state with per-category prefs.
--
-- One purpose: add jsonb `prefs` column keyed by category id (see
-- Part XXII) → { push: bool, email: bool, in_app: bool } + a
-- top-level `quiet_mode` boolean override.
--
-- jsonb (not a normalized child table) so the surface can read/write
-- the whole prefs object in one round-trip + adding new categories
-- doesn't require migrations.
--
-- Default value seeds the in-plan defaults so a fresh row already
-- has working prefs.
--
-- VERIFIED 2026-05-26 against prod project qmnssrrolpinvwjjnufo:
--   columns 'prefs' and 'quiet_mode' do not yet exist (safe to add).
--
-- ROLLBACK:
--   ALTER TABLE public.golf_player_notification_state DROP COLUMN IF EXISTS prefs;
--   ALTER TABLE public.golf_player_notification_state DROP COLUMN IF EXISTS quiet_mode;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='golf_player_notification_state'
      AND column_name='prefs'
  ) THEN
    ALTER TABLE public.golf_player_notification_state
      ADD COLUMN prefs jsonb NOT NULL DEFAULT '{
        "round_review_ready":           {"push": true,  "email": false, "in_app": true},
        "coach_assigned_goal":          {"push": true,  "email": false, "in_app": true},
        "goal_achieved":                {"push": true,  "email": false, "in_app": true},
        "goal_missed":                  {"push": false, "email": false, "in_app": true},
        "new_insight":                  {"push": false, "email": false, "in_app": true},
        "composite_insight":            {"push": true,  "email": false, "in_app": true},
        "weekly_digest":                {"push": false, "email": true,  "in_app": false},
        "coach_commented":              {"push": true,  "email": false, "in_app": true},
        "engine_suggested_goal":        {"push": false, "email": false, "in_app": true},
        "standing_percentile_changed":  {"push": false, "email": false, "in_app": false}
      }'::jsonb;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='golf_player_notification_state'
      AND column_name='quiet_mode'
  ) THEN
    ALTER TABLE public.golf_player_notification_state
      ADD COLUMN quiet_mode boolean NOT NULL DEFAULT false;
  END IF;
END $$;
