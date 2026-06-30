-- =============================================================================
-- 20260624000030_baseball_staff_capabilities.sql
--
-- Wave 1 / packet: staff-roles
--
-- Extends baseball_team_coach_staff with granular per-staff capability flags
-- and adds a staff-invitation table so a head coach (or a staffer who has been
-- granted can_invite_staff) can invite additional coaches to their team with a
-- pre-assigned role + capability set.
--
-- GUARDRAILS HONORED:
--   * ADDITIVE ONLY  — ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS /
--     CREATE INDEX IF NOT EXISTS / DROP POLICY IF EXISTS then CREATE POLICY /
--     CREATE OR REPLACE FUNCTION. No DROP COLUMN, no DROP TABLE, no destructive
--     UPDATE/DELETE, no data-losing rename. Safe to run on a live DB.
--   * RLS enabled on the new table with explicit policies. No GRANT to anon.
--   * Sport-prefixed names only (baseball_*), matching existing conventions:
--       baseball_team_coach_staff (coach_id, team_id, role, is_primary, ...)
--       baseball_coaches.user_id = auth.uid()
--       is_baseball_primary_coach(team_id) helper (already in prod baseline).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Capability columns on baseball_team_coach_staff
--    12 core boolean capabilities (DEFAULT false) + a jsonb bag for extras.
-- -----------------------------------------------------------------------------
ALTER TABLE public.baseball_team_coach_staff
  ADD COLUMN IF NOT EXISTS can_manage_roster   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_practice  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_lifting   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_academics   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_imports   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_stats     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_invite_staff     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_settings  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_medical     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_message_team     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_calendar  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_head_coach        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS capabilities         jsonb   NOT NULL DEFAULT '{}'::jsonb,
  -- Lifecycle + display columns the read path (teams.ts getStaffSettingsData),
  -- removeStaff write (status='removed'), and the accept-invite RPC all depend
  -- on. The prod baseline shipped baseball_team_coach_staff with only
  -- {id,team_id,coach_id,role,is_primary,created_at}, so these MUST be added
  -- here or the explicit-column select rejects with "column does not exist".
  ADD COLUMN IF NOT EXISTS status               text    NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS title                text;

COMMENT ON COLUMN public.baseball_team_coach_staff.can_manage_roster  IS 'Add/remove/edit team roster members.';
COMMENT ON COLUMN public.baseball_team_coach_staff.can_manage_practice IS 'Create/edit practice plans and sessions.';
COMMENT ON COLUMN public.baseball_team_coach_staff.can_manage_lifting  IS 'Manage strength & conditioning / lifting programs.';
COMMENT ON COLUMN public.baseball_team_coach_staff.can_view_academics  IS 'View player academic records.';
COMMENT ON COLUMN public.baseball_team_coach_staff.can_manage_imports  IS 'Run data imports (rosters, stats, etc).';
COMMENT ON COLUMN public.baseball_team_coach_staff.can_manage_stats    IS 'Enter/edit team and player statistics.';
COMMENT ON COLUMN public.baseball_team_coach_staff.can_invite_staff    IS 'Invite and manage other staff for the team.';
COMMENT ON COLUMN public.baseball_team_coach_staff.can_manage_settings IS 'Edit team settings/configuration.';
COMMENT ON COLUMN public.baseball_team_coach_staff.can_view_medical    IS 'View player medical/injury information.';
COMMENT ON COLUMN public.baseball_team_coach_staff.can_message_team    IS 'Send team-wide messages/announcements.';
COMMENT ON COLUMN public.baseball_team_coach_staff.can_manage_calendar IS 'Create/edit team calendar and events.';
COMMENT ON COLUMN public.baseball_team_coach_staff.is_head_coach       IS 'Marks the staffer as a head coach (implicit full authority).';
COMMENT ON COLUMN public.baseball_team_coach_staff.capabilities        IS 'Extensibility bag for additional/granular capability flags beyond the core booleans.';
COMMENT ON COLUMN public.baseball_team_coach_staff.status               IS 'Staff membership lifecycle: active | removed (soft-remove, never hard-deleted).';
COMMENT ON COLUMN public.baseball_team_coach_staff.title                IS 'Optional free-text staff title shown in the roster (e.g. "Pitching Coach").';

-- -----------------------------------------------------------------------------
-- 2. Authorization helper: may the current auth.uid() invite/manage staff for
--    the given team?  True when the user is the team's primary coach, OR is a
--    staffer flagged is_head_coach, OR is a staffer with can_invite_staff.
--    SECURITY DEFINER + locked search_path so RLS recursion is avoided and the
--    function is safe to reference from policies. NOT granted to anon.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.baseball_can_invite_staff(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.is_baseball_primary_coach(p_team_id)
    OR EXISTS (
      SELECT 1
      FROM public.baseball_team_coach_staff tcs
      JOIN public.baseball_coaches c ON c.id = tcs.coach_id
      WHERE c.user_id = auth.uid()
        AND tcs.team_id = p_team_id
        AND (tcs.is_head_coach = true OR tcs.can_invite_staff = true)
    );
$$;

REVOKE ALL ON FUNCTION public.baseball_can_invite_staff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.baseball_can_invite_staff(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.baseball_can_invite_staff(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. baseball_staff_invitations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.baseball_staff_invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid NOT NULL REFERENCES public.baseball_teams(id)   ON DELETE CASCADE,
  email        text NOT NULL,
  role         text,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  invited_by   uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL,
  token        text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at  timestamptz,
  accepted_by_user_id uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.baseball_staff_invitations
  ADD COLUMN IF NOT EXISTS accepted_by_user_id uuid;

COMMENT ON TABLE public.baseball_staff_invitations IS
  'Pending invitations for additional coaching staff, with a pre-assigned role and capability set. Managed by a team head coach or a staffer with can_invite_staff.';
COMMENT ON COLUMN public.baseball_staff_invitations.accepted_by_user_id IS
  'Auth user id that accepted the staff invitation; added before 0050 RLS policies reference it.';

-- Indexes + unique token.
CREATE UNIQUE INDEX IF NOT EXISTS baseball_staff_invitations_token_key
  ON public.baseball_staff_invitations (token);
CREATE INDEX IF NOT EXISTS baseball_staff_invitations_team_id_idx
  ON public.baseball_staff_invitations (team_id);
CREATE INDEX IF NOT EXISTS baseball_staff_invitations_email_idx
  ON public.baseball_staff_invitations (lower(email));
CREATE INDEX IF NOT EXISTS baseball_staff_invitations_status_idx
  ON public.baseball_staff_invitations (status);

-- -----------------------------------------------------------------------------
-- 4. RLS — only head coach / can_invite_staff may manage their team's invites.
--    No GRANT to anon. authenticated only.
-- -----------------------------------------------------------------------------
ALTER TABLE public.baseball_staff_invitations ENABLE ROW LEVEL SECURITY;

-- Manage (ALL): an authorized staffer for the team can create/read/update/delete
-- invitations belonging to that team.
DROP POLICY IF EXISTS baseball_staff_invitations_manage ON public.baseball_staff_invitations;
CREATE POLICY baseball_staff_invitations_manage
  ON public.baseball_staff_invitations
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (public.baseball_can_invite_staff(team_id))
  WITH CHECK (public.baseball_can_invite_staff(team_id));

-- Invitee read: intentionally NOT created here. An earlier draft used
-- auth.jwt() ->> 'email' which can lag up to the JWT TTL (~1 hour) after an
-- email change, allowing a former email owner to read invitations addressed to
-- the old address. The authoritative invitee-select policy is created in
-- migration 20260624000050 using an auth.users subquery instead.
-- Guard: ensure no stale jwt()-based policy survives a re-run.
DROP POLICY IF EXISTS baseball_staff_invitations_invitee_select ON public.baseball_staff_invitations;
