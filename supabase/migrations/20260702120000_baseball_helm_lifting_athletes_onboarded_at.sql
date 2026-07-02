-- ============================================================================
-- DB-GATED — NOT APPLIED (Task C: Lift Lab entry + onboarding; flagged
-- db_gated in the PR description).
--
-- Adds the durable "has this athlete completed the Lift Lab first-run tour"
-- signal for the player-facing Lift Lab entry (src/app/baseball/(dashboard)/
-- dashboard/lift). helm_lifting_athletes has no existing jsonb/prefs column
-- to piggyback on (checked src/lib/types/database.ts + the identity
-- migration, 20260625000000_helm_lifting_identity.sql) — this adds a single
-- nullable timestamptz instead of introducing a new jsonb blob.
--
-- Until this migration is applied, the app degrades to localStorage
-- (keyed per-athlete-id) as the onboarded signal — see
-- src/components/baseball/performance/lift-onboarding/onboarding-storage.ts
-- and the graceful-degrade read in
-- src/lib/baseball/read-models/player-lift.ts (getPlayerLiftOnboardingState).
-- A PostgREST "column does not exist" / "function does not exist" response
-- is treated as "no durable signal yet", never thrown to the caller.
--
-- SELF-WRITE GAP: the existing hla_update RLS policy
-- (supabase/migrations/20260625000000_helm_lifting_identity.sql) only allows
-- helm_lifting_can_edit_org (i.e. a lifting COACH/editor), not the athlete
-- themselves — helm_lifting_is_my_athlete is deliberately read-only today
-- ("athlete-self read-only EXISTS; purely additive" per that migration's own
-- comment). Widening hla_update to add a second permissive USING clause for
-- `user_id = auth.uid()` would let a player self-edit the WHOLE row (name,
-- position, team_id, is_active, sport_player_id — the table already carries
-- a blanket table-level UPDATE grant to `authenticated`, so RLS is the only
-- gate), which is a materially bigger widening than "let me mark my own
-- onboarding flag." Instead this migration adds a narrow SECURITY DEFINER
-- RPC, helm_lifting_mark_athlete_onboarded(p_athlete_id), that re-uses the
-- existing helm_lifting_is_my_athlete() ownership check and only ever
-- touches the onboarded_at column — no RLS/GRANT surface change at all.
--
-- Depends on 20260625000000_helm_lifting_identity.sql already being applied
-- (helm_lifting_athletes + helm_lifting_is_my_athlete()) — true everywhere
-- this repo's Lift Lab is live, since fromUntyped(..., 'helm_lifting_athletes')
-- reads/writes already run in production code paths today.
--
-- Per remediation instructions: writing this file is allowed, applying it
-- to the live database is NOT — apply only via the normal migration
-- pipeline after review.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Column — nullable, no default (never backfilled: a null onboarded_at is
--    the honest "hasn't seen the tour yet" state for every existing row).
-- ----------------------------------------------------------------------------
ALTER TABLE public.helm_lifting_athletes
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

-- ----------------------------------------------------------------------------
-- 2. helm_lifting_mark_athlete_onboarded — SELF-ONLY write RPC.
--    Re-uses helm_lifting_is_my_athlete(p_athlete_id) (defined in
--    20260625000000_helm_lifting_identity.sql) as the ownership check so this
--    migration introduces zero new authorization logic, only a scoped write
--    path. Idempotent: COALESCE keeps the FIRST onboarded_at timestamp if
--    called more than once (e.g. a retry, or "retake the tour" re-completing
--    the flow). Returns NULL (no error) when the caller doesn't own
--    p_athlete_id, or the athlete row can't be found — the server action
--    treats NULL exactly like "not persisted yet" and keeps localStorage as
--    the fallback signal.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.helm_lifting_mark_athlete_onboarded(p_athlete_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_onboarded_at timestamptz;
BEGIN
  IF p_athlete_id IS NULL OR NOT public.helm_lifting_is_my_athlete(p_athlete_id) THEN
    RETURN NULL;
  END IF;

  UPDATE public.helm_lifting_athletes
  SET onboarded_at = COALESCE(onboarded_at, now())
  WHERE id = p_athlete_id
  RETURNING onboarded_at INTO v_onboarded_at;

  RETURN v_onboarded_at;
END;
$$;

REVOKE ALL ON FUNCTION public.helm_lifting_mark_athlete_onboarded(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.helm_lifting_mark_athlete_onboarded(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.helm_lifting_mark_athlete_onboarded(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helm_lifting_mark_athlete_onboarded(uuid) TO service_role;
