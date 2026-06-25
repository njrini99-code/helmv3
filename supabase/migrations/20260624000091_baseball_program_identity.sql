-- ============================================================================
-- 20260624000091_baseball_program_identity.sql
--
-- Wave 4 / packet: settings-os (program-identity completeness follow-up)
--
-- v4 §Program Settings lists program-identity fields that must be editable.
-- Most already exist on baseball_teams (name, logo_url, primary_color,
-- secondary_color) or were added by 20260624000090 (program_type,
-- competition_level, region_state, timezone, season_label).
--
-- This migration adds the THREE remaining program-identity fields that had no
-- column anywhere:
--   * public_profile_mode    — how the program's public profile is exposed
--   * player_account_policy   — the program's stance on player self-accounts
--   * default_team_id         — the program's default team (multi-team orgs)
--
-- ADDITIVE ONLY: ADD COLUMN IF NOT EXISTS. No data is dropped, no existing
-- column is altered, no destructive writes. NOT APPLIED here — additive .sql
-- under supabase/migrations only.
-- ============================================================================

ALTER TABLE public.baseball_teams
  ADD COLUMN IF NOT EXISTS public_profile_mode text NOT NULL DEFAULT 'private'
    CHECK (public_profile_mode IN ('private', 'unlisted', 'public')),
  ADD COLUMN IF NOT EXISTS player_account_policy text NOT NULL DEFAULT 'invite_only'
    CHECK (player_account_policy IN ('invite_only', 'approval_required', 'open_join')),
  ADD COLUMN IF NOT EXISTS default_team_id uuid
    REFERENCES public.baseball_teams(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.baseball_teams.public_profile_mode IS
  'Program public profile exposure (v4 §Program Settings): private (no public profile), unlisted (link-only), public (discoverable). Defaults private — branding never leaks without an explicit opt-in.';
COMMENT ON COLUMN public.baseball_teams.player_account_policy IS
  'Program player-account policy (v4 §Program Settings): invite_only | approval_required | open_join. Distinct from the per-feature player-access toggles in baseball_program_settings; this is the program-level stance.';
COMMENT ON COLUMN public.baseball_teams.default_team_id IS
  'For multi-team orgs (showcase/academy/club), the default team a coach lands on. NULL = the team itself. Self-referential FK, ON DELETE SET NULL so removing a team never orphans the pointer.';

-- Helpful partial index for resolving an org's default team quickly.
CREATE INDEX IF NOT EXISTS idx_baseball_teams_default_team
  ON public.baseball_teams (default_team_id)
  WHERE default_team_id IS NOT NULL;
