-- =============================================================================
-- 20260625000040_baseball_staff_display_scope_columns.sql
--
-- Adds the roster-display + scope columns required by the staff-settings read
-- model (src/lib/baseball/staff-settings.ts lines 185-192 and 210-211).
--
-- Gaps filled:
--   1. baseball_team_coach_staff: ADD COLUMN IF NOT EXISTS
--        bio text, phone text,
--        visible_to_players boolean NOT NULL DEFAULT true,
--        scope_player_ids uuid[], scope_group_ids uuid[]
--   2. baseball_staff_invitations: ADD COLUMN IF NOT EXISTS
--        invitee_name text, message text,
--        invited_by_coach_id uuid REFERENCES baseball_coaches(id) ON DELETE SET NULL
--
-- ADDITIVE ONLY. No DROP COLUMN, no destructive DML, no renames. Safe to run
-- on the live shared DB. NOT applied here — ships as a migration file only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. baseball_team_coach_staff — roster-display + scope columns
-- -----------------------------------------------------------------------------
ALTER TABLE public.baseball_team_coach_staff
  ADD COLUMN IF NOT EXISTS bio                text,
  ADD COLUMN IF NOT EXISTS phone              text,
  ADD COLUMN IF NOT EXISTS visible_to_players boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS scope_player_ids   uuid[],
  ADD COLUMN IF NOT EXISTS scope_group_ids    uuid[];

COMMENT ON COLUMN public.baseball_team_coach_staff.bio                IS 'Optional public-facing biography shown to players in the roster directory.';
COMMENT ON COLUMN public.baseball_team_coach_staff.phone              IS 'Contact phone for the staff member (staff-only visibility).';
COMMENT ON COLUMN public.baseball_team_coach_staff.visible_to_players IS 'When false the staff member is hidden from the player-facing roster directory.';
COMMENT ON COLUMN public.baseball_team_coach_staff.scope_player_ids   IS 'Explicit player-id allowlist for scoped staff (NULL = all team players).';
COMMENT ON COLUMN public.baseball_team_coach_staff.scope_group_ids    IS 'Strength-group ids the staff member is scoped to (NULL = all groups).';

-- -----------------------------------------------------------------------------
-- 2. baseball_staff_invitations — read-model columns required by InvitationRow
-- -----------------------------------------------------------------------------
ALTER TABLE public.baseball_staff_invitations
  ADD COLUMN IF NOT EXISTS invitee_name text,
  ADD COLUMN IF NOT EXISTS message      text;

-- invited_by_coach_id with FK — add conditionally to avoid duplicate FK error.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'baseball_staff_invitations'
      AND column_name  = 'invited_by_coach_id'
  ) THEN
    ALTER TABLE public.baseball_staff_invitations
      ADD COLUMN invited_by_coach_id uuid
        REFERENCES public.baseball_coaches(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.baseball_staff_invitations.invitee_name       IS 'Display name of the invitee (optional, for the invitation UI).';
COMMENT ON COLUMN public.baseball_staff_invitations.message            IS 'Optional personal message included in the invitation email.';
COMMENT ON COLUMN public.baseball_staff_invitations.invited_by_coach_id IS 'Coach who created this invitation (typed FK; legacy invited_by column kept for back-compat).';

-- ============================================================================
-- END migration 20260625000040_baseball_staff_display_scope_columns.sql
-- ============================================================================
