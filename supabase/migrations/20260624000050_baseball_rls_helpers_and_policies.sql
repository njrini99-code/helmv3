-- ============================================================================
-- Migration: 20260624000050_baseball_rls_helpers_and_policies.sql
-- Packet: schema-rls (BaseballHelm Wave 1)
-- Purpose: Capability-aware RLS helper functions + (re)definable RLS policies
--          for the new baseball_* tables introduced by migrations
--          20260624000010..0040 (staff capabilities, import lineage,
--          timeline/acks, practices, lifting/performance, AI attribution).
--
-- SAFETY CONTRACT (CLAUDE.md hard rules):
--   * ADDITIVE ONLY. No DROP TABLE/COLUMN, no destructive UPDATE/DELETE.
--   * Functions: CREATE OR REPLACE. Policies: DROP POLICY IF EXISTS then CREATE
--     POLICY (re-runnable). RLS ENABLED on every referenced table.
--   * Elevated helpers pin search_path = pg_catalog, public.
--   * EXECUTE granted to authenticated + service_role ONLY. NEVER to anon.
--   * Every table policy block is guarded with to_regclass() so this file is
--     safe to (re)run even if a sibling migration has not yet landed. It is
--     designed to be applied AFTER 20260624000010..0040.
--
-- This file is WRITTEN, NOT APPLIED.
-- ============================================================================

-- ============================================================================
-- SECTION 1 — HELPER FUNCTIONS (capability-aware, elevated)
-- ============================================================================
-- These reuse the existing baseball membership pattern:
--   get_my_coach_id()  -> baseball_coaches.id  for auth.uid()
--   get_my_player_id() -> baseball_players.id  for auth.uid()
-- which already exist in the baseline. We do not weaken or redefine them.

-- Sport-prefixed alias the new RLS policies reference for the current player id.
-- (Mirrors get_my_player_id() so the baseball policy set is self-describing.)
CREATE OR REPLACE FUNCTION public.get_my_baseball_player_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT id FROM public.baseball_players WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Is the current user any staff member of this team?
-- Head coaches are NOT a separate concept here: a head coach has a
-- baseball_team_coach_staff row (with is_head_coach/is_primary set), so a single
-- staff-membership probe covers them. The head-coach identity now lives on
-- baseball_team_coach_staff.is_head_coach (added by the 0030 staff-capabilities
-- migration), NOT on a baseball_teams.head_coach_id column — that column does
-- not exist in the prod baseline, and referencing it here would make every
-- caller throw `column t.head_coach_id does not exist` at query time.
CREATE OR REPLACE FUNCTION public.is_baseball_team_staff(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.baseball_team_coach_staff tcs
    WHERE tcs.team_id = p_team_id
      AND tcs.coach_id = public.get_my_coach_id()
  );
$$;

-- Capability check: does the current user's staff membership on this team grant
-- the named capability? Resolution order (most-permissive wins):
--   1. Primary coach (is_primary = true)                  -> all capabilities
--   2. Head coach (baseball_team_coach_staff.is_head_coach) -> all capabilities
--   3. Dedicated boolean capability column == true  (e.g. can_manage_imports)
--   4. capabilities jsonb membership (key == true   OR value in a text[] array)
-- The is_head_coach flag, the boolean capability columns, and the capabilities
-- jsonb are all added by the 0030 migration. We resolve the head-coach case from
-- the staff row's jsonb (probe (2)) rather than a baseball_teams.head_coach_id
-- column — that column does NOT exist in the prod baseline, so probing it here
-- would throw `column ... head_coach_id does not exist` for every non-primary
-- staffer. The to_jsonb()/row probe below tolerates the absence of any of these
-- optional columns (returns false), so this is correct whether or not 0030 has
-- been applied yet.
CREATE OR REPLACE FUNCTION public.has_baseball_staff_capability(
  p_team_id uuid,
  p_capability text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_coach_id uuid := public.get_my_coach_id();
  v_staff    jsonb;
BEGIN
  IF v_coach_id IS NULL OR p_capability IS NULL THEN
    RETURN false;
  END IF;

  -- (1) primary coach -> full capability set (cheap dedicated check).
  IF public.is_baseball_primary_coach(p_team_id) THEN
    RETURN true;
  END IF;

  -- Pull the staff row as jsonb so we can probe optionally-present columns
  -- (is_head_coach, status, the capability booleans, capabilities) without a
  -- hard schema dependency (correct pre- and post-0030).
  SELECT to_jsonb(tcs.*)
    INTO v_staff
    FROM public.baseball_team_coach_staff tcs
   WHERE tcs.team_id = p_team_id
     AND tcs.coach_id = v_coach_id
   LIMIT 1;

  IF v_staff IS NULL THEN
    RETURN false;
  END IF;

  -- Suspended/removed staff hold no capabilities.
  IF (v_staff ? 'status') AND (v_staff->>'status') IN ('suspended', 'removed', 'invited') THEN
    RETURN false;
  END IF;

  -- (2) head coach -> full capability set. Resolved from the staff row's
  -- is_head_coach flag (NOT a nonexistent baseball_teams.head_coach_id column).
  IF (v_staff ? 'is_head_coach') AND (v_staff->>'is_head_coach') = 'true' THEN
    RETURN true;
  END IF;

  -- (3) dedicated boolean capability column (e.g. can_manage_imports).
  IF (v_staff ? p_capability) AND (v_staff->>p_capability) = 'true' THEN
    RETURN true;
  END IF;

  -- (4) capabilities jsonb: support both {"can_manage_imports": true} object
  --     form and ["can_manage_imports", ...] array form.
  IF (v_staff ? 'capabilities') AND v_staff->'capabilities' IS NOT NULL THEN
    IF jsonb_typeof(v_staff->'capabilities') = 'object'
       AND (v_staff->'capabilities'->>p_capability) = 'true' THEN
      RETURN true;
    END IF;
    IF jsonb_typeof(v_staff->'capabilities') = 'array'
       AND (v_staff->'capabilities') ? p_capability THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- Two-arg form used by the RLS contract: can the current user view this player
-- on this team? True when the user is the player themselves, OR is team staff
-- whose player_scope/position_scope (if any) admits the player. When no scope
-- is configured on the staff row, any team staff may view (team-wide default).
CREATE OR REPLACE FUNCTION public.can_view_baseball_player(
  p_team_id uuid,
  p_player_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_coach_id uuid := public.get_my_coach_id();
  v_staff    jsonb;
  v_scope    jsonb;
BEGIN
  -- Player can always view their own player row.
  IF p_player_id = public.get_my_baseball_player_id() THEN
    RETURN true;
  END IF;

  IF v_coach_id IS NULL THEN
    RETURN false;
  END IF;

  -- Primary coach sees all team players (cheap dedicated check).
  IF public.is_baseball_primary_coach(p_team_id) THEN
    RETURN true;
  END IF;

  -- Must be team staff to view any other player.
  SELECT to_jsonb(tcs.*)
    INTO v_staff
    FROM public.baseball_team_coach_staff tcs
   WHERE tcs.team_id = p_team_id
     AND tcs.coach_id = v_coach_id
   LIMIT 1;

  IF v_staff IS NULL THEN
    RETURN false;
  END IF;
  IF (v_staff ? 'status') AND (v_staff->>'status') IN ('suspended', 'removed', 'invited') THEN
    RETURN false;
  END IF;

  -- Head coach sees all team players. Resolved from the staff row's
  -- is_head_coach flag (NOT a nonexistent baseball_teams.head_coach_id column).
  IF (v_staff ? 'is_head_coach') AND (v_staff->>'is_head_coach') = 'true' THEN
    RETURN true;
  END IF;

  -- Honor an explicit player_scope (uuid[] of player ids) when present.
  IF (v_staff ? 'player_scope') AND v_staff->'player_scope' IS NOT NULL
     AND jsonb_typeof(v_staff->'player_scope') = 'array'
     AND jsonb_array_length(v_staff->'player_scope') > 0 THEN
    RETURN (v_staff->'player_scope') ? p_player_id::text;
  END IF;

  -- Honor an explicit position_scope (text[]) against the player's position.
  IF (v_staff ? 'position_scope') AND v_staff->'position_scope' IS NOT NULL
     AND jsonb_typeof(v_staff->'position_scope') = 'array'
     AND jsonb_array_length(v_staff->'position_scope') > 0 THEN
    RETURN EXISTS (
      SELECT 1 FROM public.baseball_players bp
      JOIN public.baseball_team_members btm ON btm.player_id = bp.id
      WHERE bp.id = p_player_id
        AND btm.team_id = p_team_id
        AND (v_staff->'position_scope') ? bp.primary_position
    );
  END IF;

  -- No narrowing scope configured -> team-wide staff visibility.
  RETURN true;
END;
$$;

-- One-arg convenience form (task signature): derive the player's team, then
-- defer to the two-arg authority function above.
CREATE OR REPLACE FUNCTION public.can_view_baseball_player(p_player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    p_player_id = public.get_my_baseball_player_id()
    OR EXISTS (
      SELECT 1
      FROM public.baseball_team_members btm
      WHERE btm.player_id = p_player_id
        AND public.can_view_baseball_player(btm.team_id, p_player_id)
    );
$$;

-- Re-affirm the existing membership helper (task signature: team uuid) so the
-- baseball policy set is self-contained and re-runnable. Body is identical to
-- the baseline definition — this neither weakens nor changes existing behavior.
CREATE OR REPLACE FUNCTION public.is_baseball_team_member(team_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.baseball_team_members btm
    JOIN public.baseball_players bp ON bp.id = btm.player_id
    WHERE btm.team_id = team_uuid
      AND bp.user_id = auth.uid()
      AND btm.status = 'active'
  );
END;
$$;

-- Scoped-group check used by lifting assignment policies: may the current
-- staff member manage lifts for this group/player? (can_manage_lifting + scope.)
CREATE OR REPLACE FUNCTION public.can_manage_baseball_lift_group(
  p_team_id uuid,
  p_player_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.has_baseball_staff_capability(p_team_id, 'can_manage_lifting')
     AND (
       p_player_id IS NULL
       OR public.can_view_baseball_player(p_team_id, p_player_id)
     );
$$;

-- Grants: authenticated (app) + service_role (cron). NEVER anon.
REVOKE ALL ON FUNCTION public.get_my_baseball_player_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_baseball_team_staff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_baseball_staff_capability(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_baseball_player(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_baseball_player(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_baseball_team_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_baseball_lift_group(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_my_baseball_player_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_baseball_team_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_baseball_staff_capability(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_baseball_player(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_baseball_player(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_baseball_team_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_baseball_lift_group(uuid, uuid) TO authenticated, service_role;

-- ============================================================================
-- SECTION 2 — RLS POLICIES FOR NEW / CHANGED TABLES (0010..0040)
-- ============================================================================
-- Each block is wrapped in a to_regclass guard so missing siblings are skipped
-- rather than erroring. All policies are TO authenticated; service_role bypasses
-- RLS by design (used for cron / AI writes).

-- ----------------------------------------------------------------------------
-- baseball_import_runs  (audited import lineage — staff/admin only)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_import_runs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_import_runs ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "baseball_import_runs_select" ON public.baseball_import_runs';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_import_runs_insert" ON public.baseball_import_runs';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_import_runs_update" ON public.baseball_import_runs';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_import_runs_delete" ON public.baseball_import_runs';

    EXECUTE $p$CREATE POLICY "baseball_import_runs_select" ON public.baseball_import_runs
      FOR SELECT TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))$p$;
    EXECUTE $p$CREATE POLICY "baseball_import_runs_insert" ON public.baseball_import_runs
      FOR INSERT TO authenticated
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))$p$;
    EXECUTE $p$CREATE POLICY "baseball_import_runs_update" ON public.baseball_import_runs
      FOR UPDATE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))$p$;
    EXECUTE $p$CREATE POLICY "baseball_import_runs_delete" ON public.baseball_import_runs
      FOR DELETE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))$p$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- baseball_player_external_ids  (staff manage; player reads own row)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_player_external_ids') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_player_external_ids ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "baseball_player_external_ids_select" ON public.baseball_player_external_ids';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_player_external_ids_insert" ON public.baseball_player_external_ids';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_player_external_ids_update" ON public.baseball_player_external_ids';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_player_external_ids_delete" ON public.baseball_player_external_ids';

    EXECUTE $p$CREATE POLICY "baseball_player_external_ids_select" ON public.baseball_player_external_ids
      FOR SELECT TO authenticated
      USING (
        public.has_baseball_staff_capability(team_id, 'can_manage_imports')
        OR player_id = public.get_my_baseball_player_id()
      )$p$;
    EXECUTE $p$CREATE POLICY "baseball_player_external_ids_insert" ON public.baseball_player_external_ids
      FOR INSERT TO authenticated
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))$p$;
    EXECUTE $p$CREATE POLICY "baseball_player_external_ids_update" ON public.baseball_player_external_ids
      FOR UPDATE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))$p$;
    EXECUTE $p$CREATE POLICY "baseball_player_external_ids_delete" ON public.baseball_player_external_ids
      FOR DELETE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))$p$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- baseball_stat_uploads  (CHANGED — tighten to staff/import capability)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_stat_uploads') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_stat_uploads ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "baseball_stat_uploads_select" ON public.baseball_stat_uploads';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_stat_uploads_insert" ON public.baseball_stat_uploads';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_stat_uploads_update" ON public.baseball_stat_uploads';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_stat_uploads_delete" ON public.baseball_stat_uploads';

    EXECUTE $p$CREATE POLICY "baseball_stat_uploads_select" ON public.baseball_stat_uploads
      FOR SELECT TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))$p$;
    EXECUTE $p$CREATE POLICY "baseball_stat_uploads_insert" ON public.baseball_stat_uploads
      FOR INSERT TO authenticated
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))$p$;
    EXECUTE $p$CREATE POLICY "baseball_stat_uploads_update" ON public.baseball_stat_uploads
      FOR UPDATE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))$p$;
    EXECUTE $p$CREATE POLICY "baseball_stat_uploads_delete" ON public.baseball_stat_uploads
      FOR DELETE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))$p$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- baseball_team_coach_staff  (CHANGED — staff read; primary/inviter write)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_team_coach_staff') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_team_coach_staff ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "baseball_team_coach_staff_select" ON public.baseball_team_coach_staff';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_team_coach_staff_insert" ON public.baseball_team_coach_staff';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_team_coach_staff_update" ON public.baseball_team_coach_staff';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_team_coach_staff_delete" ON public.baseball_team_coach_staff';

    -- Read: any active team staff (or the staffer's own row).
    EXECUTE $p$CREATE POLICY "baseball_team_coach_staff_select" ON public.baseball_team_coach_staff
      FOR SELECT TO authenticated
      USING (
        public.is_baseball_team_staff(team_id)
        OR coach_id = public.get_my_coach_id()
      )$p$;
    -- Write (role/capability/scope): only primary coach or can_invite_staff.
    EXECUTE $p$CREATE POLICY "baseball_team_coach_staff_insert" ON public.baseball_team_coach_staff
      FOR INSERT TO authenticated
      WITH CHECK (
        public.is_baseball_primary_coach(team_id)
        OR public.has_baseball_staff_capability(team_id, 'can_invite_staff')
      )$p$;
    EXECUTE $p$CREATE POLICY "baseball_team_coach_staff_update" ON public.baseball_team_coach_staff
      FOR UPDATE TO authenticated
      USING (
        public.is_baseball_primary_coach(team_id)
        OR public.has_baseball_staff_capability(team_id, 'can_invite_staff')
      )
      WITH CHECK (
        public.is_baseball_primary_coach(team_id)
        OR public.has_baseball_staff_capability(team_id, 'can_invite_staff')
      )$p$;
    EXECUTE $p$CREATE POLICY "baseball_team_coach_staff_delete" ON public.baseball_team_coach_staff
      FOR DELETE TO authenticated
      USING (
        public.is_baseball_primary_coach(team_id)
        OR public.has_baseball_staff_capability(team_id, 'can_invite_staff')
      )$p$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- baseball_staff_invitations  (primary/inviter write; inviter or invitee read)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_staff_invitations') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_staff_invitations ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.baseball_staff_invitations ADD COLUMN IF NOT EXISTS accepted_by_user_id uuid';

    EXECUTE 'DROP POLICY IF EXISTS "baseball_staff_invitations_select" ON public.baseball_staff_invitations';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_staff_invitations_insert" ON public.baseball_staff_invitations';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_staff_invitations_update" ON public.baseball_staff_invitations';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_staff_invitations_delete" ON public.baseball_staff_invitations';

    -- Read: team inviter/staff with invite cap, OR the invitee (email/accepted).
    EXECUTE $p$CREATE POLICY "baseball_staff_invitations_select" ON public.baseball_staff_invitations
      FOR SELECT TO authenticated
      USING (
        public.is_baseball_primary_coach(team_id)
        OR public.has_baseball_staff_capability(team_id, 'can_invite_staff')
        OR accepted_by_user_id = auth.uid()
        OR lower(email) = lower((SELECT u.email FROM auth.users u WHERE u.id = auth.uid()))
      )$p$;
    EXECUTE $p$CREATE POLICY "baseball_staff_invitations_insert" ON public.baseball_staff_invitations
      FOR INSERT TO authenticated
      WITH CHECK (
        public.is_baseball_primary_coach(team_id)
        OR public.has_baseball_staff_capability(team_id, 'can_invite_staff')
      )$p$;
    -- Update: managers may revoke/edit; invitee may accept (claim) their own.
    EXECUTE $p$CREATE POLICY "baseball_staff_invitations_update" ON public.baseball_staff_invitations
      FOR UPDATE TO authenticated
      USING (
        public.is_baseball_primary_coach(team_id)
        OR public.has_baseball_staff_capability(team_id, 'can_invite_staff')
        OR lower(email) = lower((SELECT u.email FROM auth.users u WHERE u.id = auth.uid()))
        OR accepted_by_user_id = auth.uid()
      )
      WITH CHECK (
        public.is_baseball_primary_coach(team_id)
        OR public.has_baseball_staff_capability(team_id, 'can_invite_staff')
        OR accepted_by_user_id = auth.uid()
      )$p$;
    EXECUTE $p$CREATE POLICY "baseball_staff_invitations_delete" ON public.baseball_staff_invitations
      FOR DELETE TO authenticated
      USING (
        public.is_baseball_primary_coach(team_id)
        OR public.has_baseball_staff_capability(team_id, 'can_invite_staff')
      )$p$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- baseball_player_timeline_events  (staff scoped; player sees player_visible)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_player_timeline_events') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_player_timeline_events ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "baseball_player_timeline_events_select" ON public.baseball_player_timeline_events';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_player_timeline_events_insert" ON public.baseball_player_timeline_events';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_player_timeline_events_update" ON public.baseball_player_timeline_events';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_player_timeline_events_delete" ON public.baseball_player_timeline_events';

    -- Read: STAFF (a coach with team visibility) see all visibilities for their
    -- players; the PLAYER sees their own events EXCEPT staff_only. Vocabulary
    -- matches 0040's CHECK (team / staff_only / player_only). The staff branch is
    -- gated on get_my_coach_id() so a player cannot use can_view's self-check to
    -- read their own staff_only rows.
    EXECUTE $p$CREATE POLICY "baseball_player_timeline_events_select" ON public.baseball_player_timeline_events
      FOR SELECT TO authenticated
      USING (
        (
          public.get_my_coach_id() IS NOT NULL
          AND public.can_view_baseball_player(team_id, player_id)
        )
        OR (
          player_id = public.get_my_baseball_player_id()
          AND visibility <> 'staff_only'
        )
      )$p$;
    -- Writes: STAFF only (coach-gated). System/AI writes via service_role.
    EXECUTE $p$CREATE POLICY "baseball_player_timeline_events_insert" ON public.baseball_player_timeline_events
      FOR INSERT TO authenticated
      WITH CHECK (public.get_my_coach_id() IS NOT NULL AND public.can_view_baseball_player(team_id, player_id))$p$;
    EXECUTE $p$CREATE POLICY "baseball_player_timeline_events_update" ON public.baseball_player_timeline_events
      FOR UPDATE TO authenticated
      USING (public.get_my_coach_id() IS NOT NULL AND public.can_view_baseball_player(team_id, player_id))
      WITH CHECK (public.get_my_coach_id() IS NOT NULL AND public.can_view_baseball_player(team_id, player_id))$p$;
    EXECUTE $p$CREATE POLICY "baseball_player_timeline_events_delete" ON public.baseball_player_timeline_events
      FOR DELETE TO authenticated
      USING (public.get_my_coach_id() IS NOT NULL AND public.can_view_baseball_player(team_id, player_id))$p$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- baseball_event_acknowledgements  (own rows; staff read all team rows)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_event_acknowledgements') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_event_acknowledgements ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "baseball_event_acknowledgements_select" ON public.baseball_event_acknowledgements';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_event_acknowledgements_insert" ON public.baseball_event_acknowledgements';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_event_acknowledgements_update" ON public.baseball_event_acknowledgements';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_event_acknowledgements_delete" ON public.baseball_event_acknowledgements';

    EXECUTE $p$CREATE POLICY "baseball_event_acknowledgements_select" ON public.baseball_event_acknowledgements
      FOR SELECT TO authenticated
      USING (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.baseball_events e WHERE e.id = event_id AND public.is_baseball_team_staff(e.team_id))
      )$p$;
    EXECUTE $p$CREATE POLICY "baseball_event_acknowledgements_insert" ON public.baseball_event_acknowledgements
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid())$p$;
    EXECUTE $p$CREATE POLICY "baseball_event_acknowledgements_update" ON public.baseball_event_acknowledgements
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid())$p$;
    EXECUTE $p$CREATE POLICY "baseball_event_acknowledgements_delete" ON public.baseball_event_acknowledgements
      FOR DELETE TO authenticated
      USING (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.baseball_events e WHERE e.id = event_id AND public.is_baseball_primary_coach(e.team_id))
      )$p$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- baseball_practices  (staff manage; players read published)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_practices') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_practices ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "baseball_practices_select" ON public.baseball_practices';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_practices_insert" ON public.baseball_practices';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_practices_update" ON public.baseball_practices';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_practices_delete" ON public.baseball_practices';

    EXECUTE $p$CREATE POLICY "baseball_practices_select" ON public.baseball_practices
      FOR SELECT TO authenticated
      USING (
        public.is_baseball_team_staff(team_id)
        OR (status = 'published' AND public.is_baseball_team_member(team_id))
      )$p$;
    EXECUTE $p$CREATE POLICY "baseball_practices_insert" ON public.baseball_practices
      FOR INSERT TO authenticated
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_practice'))$p$;
    EXECUTE $p$CREATE POLICY "baseball_practices_update" ON public.baseball_practices
      FOR UPDATE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_practice'))
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_practice'))$p$;
    EXECUTE $p$CREATE POLICY "baseball_practices_delete" ON public.baseball_practices
      FOR DELETE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_practice'))$p$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- baseball_practice_blocks  (inherits practice visibility)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_practice_blocks') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_practice_blocks ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "baseball_practice_blocks_select" ON public.baseball_practice_blocks';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_practice_blocks_insert" ON public.baseball_practice_blocks';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_practice_blocks_update" ON public.baseball_practice_blocks';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_practice_blocks_delete" ON public.baseball_practice_blocks';

    EXECUTE $p$CREATE POLICY "baseball_practice_blocks_select" ON public.baseball_practice_blocks
      FOR SELECT TO authenticated
      USING (
        public.is_baseball_team_staff(team_id)
        OR (
          public.is_baseball_team_member(team_id)
          AND EXISTS (
            SELECT 1 FROM public.baseball_practices p
            WHERE p.id = baseball_practice_blocks.practice_id
              AND p.status = 'published'
          )
        )
      )$p$;
    EXECUTE $p$CREATE POLICY "baseball_practice_blocks_insert" ON public.baseball_practice_blocks
      FOR INSERT TO authenticated
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_practice'))$p$;
    EXECUTE $p$CREATE POLICY "baseball_practice_blocks_update" ON public.baseball_practice_blocks
      FOR UPDATE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_practice'))
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_practice'))$p$;
    EXECUTE $p$CREATE POLICY "baseball_practice_blocks_delete" ON public.baseball_practice_blocks
      FOR DELETE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_practice'))$p$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- baseball_practice_attendance  (staff manage; player reads own)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_practice_attendance') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_practice_attendance ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "baseball_practice_attendance_select" ON public.baseball_practice_attendance';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_practice_attendance_insert" ON public.baseball_practice_attendance';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_practice_attendance_update" ON public.baseball_practice_attendance';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_practice_attendance_delete" ON public.baseball_practice_attendance';

    EXECUTE $p$CREATE POLICY "baseball_practice_attendance_select" ON public.baseball_practice_attendance
      FOR SELECT TO authenticated
      USING (
        public.has_baseball_staff_capability(team_id, 'can_manage_practice')
        OR player_id = public.get_my_baseball_player_id()
      )$p$;
    EXECUTE $p$CREATE POLICY "baseball_practice_attendance_insert" ON public.baseball_practice_attendance
      FOR INSERT TO authenticated
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_practice'))$p$;
    EXECUTE $p$CREATE POLICY "baseball_practice_attendance_update" ON public.baseball_practice_attendance
      FOR UPDATE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_practice'))
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_practice'))$p$;
    EXECUTE $p$CREATE POLICY "baseball_practice_attendance_delete" ON public.baseball_practice_attendance
      FOR DELETE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_practice'))$p$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- baseball_exercises  (global readable by staff; team rows scoped; lifting cap)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_exercises') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_exercises ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "baseball_exercises_select" ON public.baseball_exercises';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_exercises_insert" ON public.baseball_exercises';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_exercises_update" ON public.baseball_exercises';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_exercises_delete" ON public.baseball_exercises';

    -- Global rows readable by any authenticated user; team rows readable by
    -- that team's staff or members.
    EXECUTE $p$CREATE POLICY "baseball_exercises_select" ON public.baseball_exercises
      FOR SELECT TO authenticated
      USING (
        is_global = true
        OR (team_id IS NOT NULL AND public.is_baseball_team_staff(team_id))
        OR (team_id IS NOT NULL AND public.is_baseball_team_member(team_id))
      )$p$;
    -- Writes only on team rows by staff with can_manage_lifting (no anon-global edits).
    EXECUTE $p$CREATE POLICY "baseball_exercises_insert" ON public.baseball_exercises
      FOR INSERT TO authenticated
      WITH CHECK (
        team_id IS NOT NULL
        AND public.has_baseball_staff_capability(team_id, 'can_manage_lifting')
      )$p$;
    EXECUTE $p$CREATE POLICY "baseball_exercises_update" ON public.baseball_exercises
      FOR UPDATE TO authenticated
      USING (
        team_id IS NOT NULL
        AND public.has_baseball_staff_capability(team_id, 'can_manage_lifting')
      )
      WITH CHECK (
        team_id IS NOT NULL
        AND public.has_baseball_staff_capability(team_id, 'can_manage_lifting')
      )$p$;
    EXECUTE $p$CREATE POLICY "baseball_exercises_delete" ON public.baseball_exercises
      FOR DELETE TO authenticated
      USING (
        team_id IS NOT NULL
        AND public.has_baseball_staff_capability(team_id, 'can_manage_lifting')
      )$p$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- baseball_lift_assignments  (staff scoped write; player reads own)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_lift_assignments') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_lift_assignments ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "baseball_lift_assignments_select" ON public.baseball_lift_assignments';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_lift_assignments_insert" ON public.baseball_lift_assignments';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_lift_assignments_update" ON public.baseball_lift_assignments';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_lift_assignments_delete" ON public.baseball_lift_assignments';

    EXECUTE $p$CREATE POLICY "baseball_lift_assignments_select" ON public.baseball_lift_assignments
      FOR SELECT TO authenticated
      USING (
        public.has_baseball_staff_capability(team_id, 'can_manage_lifting')
        OR player_id = public.get_my_baseball_player_id()
      )$p$;
    EXECUTE $p$CREATE POLICY "baseball_lift_assignments_insert" ON public.baseball_lift_assignments
      FOR INSERT TO authenticated
      WITH CHECK (public.can_manage_baseball_lift_group(team_id, player_id))$p$;
    EXECUTE $p$CREATE POLICY "baseball_lift_assignments_update" ON public.baseball_lift_assignments
      FOR UPDATE TO authenticated
      USING (public.can_manage_baseball_lift_group(team_id, player_id))
      WITH CHECK (public.can_manage_baseball_lift_group(team_id, player_id))$p$;
    EXECUTE $p$CREATE POLICY "baseball_lift_assignments_delete" ON public.baseball_lift_assignments
      FOR DELETE TO authenticated
      USING (public.can_manage_baseball_lift_group(team_id, player_id))$p$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- baseball_lift_results  (player writes own; strength/head coach read scoped)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_lift_results') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_lift_results ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "baseball_lift_results_select" ON public.baseball_lift_results';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_lift_results_insert" ON public.baseball_lift_results';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_lift_results_update" ON public.baseball_lift_results';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_lift_results_delete" ON public.baseball_lift_results';

    -- Player reads own loads; staff with can_manage_lifting read scoped results.
    -- Other players cannot read others' loads.
    EXECUTE $p$CREATE POLICY "baseball_lift_results_select" ON public.baseball_lift_results
      FOR SELECT TO authenticated
      USING (
        player_id = public.get_my_baseball_player_id()
        OR public.can_manage_baseball_lift_group(team_id, player_id)
      )$p$;
    -- Player logs own results; staff may also enter on behalf (scoped).
    EXECUTE $p$CREATE POLICY "baseball_lift_results_insert" ON public.baseball_lift_results
      FOR INSERT TO authenticated
      WITH CHECK (
        player_id = public.get_my_baseball_player_id()
        OR public.can_manage_baseball_lift_group(team_id, player_id)
      )$p$;
    EXECUTE $p$CREATE POLICY "baseball_lift_results_update" ON public.baseball_lift_results
      FOR UPDATE TO authenticated
      USING (
        player_id = public.get_my_baseball_player_id()
        OR public.can_manage_baseball_lift_group(team_id, player_id)
      )
      WITH CHECK (
        player_id = public.get_my_baseball_player_id()
        OR public.can_manage_baseball_lift_group(team_id, player_id)
      )$p$;
    EXECUTE $p$CREATE POLICY "baseball_lift_results_delete" ON public.baseball_lift_results
      FOR DELETE TO authenticated
      USING (
        player_id = public.get_my_baseball_player_id()
        OR public.can_manage_baseball_lift_group(team_id, player_id)
      )$p$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- baseball_readiness_checkins  (player owns; staff read with can_view_readiness)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_readiness_checkins') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_readiness_checkins ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "baseball_readiness_checkins_select" ON public.baseball_readiness_checkins';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_readiness_checkins_insert" ON public.baseball_readiness_checkins';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_readiness_checkins_update" ON public.baseball_readiness_checkins';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_readiness_checkins_delete" ON public.baseball_readiness_checkins';

    EXECUTE $p$CREATE POLICY "baseball_readiness_checkins_select" ON public.baseball_readiness_checkins
      FOR SELECT TO authenticated
      USING (
        player_id = public.get_my_baseball_player_id()
        OR (
          public.has_baseball_staff_capability(team_id, 'can_view_readiness')
          AND public.can_view_baseball_player(team_id, player_id)
        )
      )$p$;
    -- Only the player writes their own check-ins.
    EXECUTE $p$CREATE POLICY "baseball_readiness_checkins_insert" ON public.baseball_readiness_checkins
      FOR INSERT TO authenticated
      WITH CHECK (player_id = public.get_my_baseball_player_id())$p$;
    EXECUTE $p$CREATE POLICY "baseball_readiness_checkins_update" ON public.baseball_readiness_checkins
      FOR UPDATE TO authenticated
      USING (player_id = public.get_my_baseball_player_id())
      WITH CHECK (player_id = public.get_my_baseball_player_id())$p$;
    EXECUTE $p$CREATE POLICY "baseball_readiness_checkins_delete" ON public.baseball_readiness_checkins
      FOR DELETE TO authenticated
      USING (player_id = public.get_my_baseball_player_id())$p$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- baseball_coach_insights  (CHANGED — staff read team; players read explicit
--   player_visible only. AI writes via service_role. Defensive RLS only:
--   we do not weaken any existing policy; we (re)assert the staff/player split
--   if the column set supports it.)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_has_player_visible boolean;
  v_has_team_id        boolean;
BEGIN
  IF to_regclass('public.baseball_coach_insights') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_coach_insights ENABLE ROW LEVEL SECURITY';

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'baseball_coach_insights'
        AND column_name = 'player_visible'
    ) INTO v_has_player_visible;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'baseball_coach_insights'
        AND column_name = 'team_id'
    ) INTO v_has_team_id;

    -- Only (re)assert SELECT if the table is team-scoped, so we never touch an
    -- unexpected shape. Write policies are left to the owning packet to avoid
    -- weakening existing behavior.
    IF v_has_team_id THEN
      EXECUTE 'DROP POLICY IF EXISTS "baseball_coach_insights_staff_select" ON public.baseball_coach_insights';
      IF v_has_player_visible THEN
        EXECUTE $p$CREATE POLICY "baseball_coach_insights_staff_select" ON public.baseball_coach_insights
          FOR SELECT TO authenticated
          USING (
            public.is_baseball_team_staff(team_id)
            OR (
              player_visible = true
              AND EXISTS (
                SELECT 1 FROM public.baseball_players bp
                WHERE bp.id = baseball_coach_insights.player_id
                  AND bp.user_id = auth.uid()
              )
            )
          )$p$;
      ELSE
        EXECUTE $p$CREATE POLICY "baseball_coach_insights_staff_select" ON public.baseball_coach_insights
          FOR SELECT TO authenticated
          USING (public.is_baseball_team_staff(team_id))$p$;
      END IF;
    END IF;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- baseball_academic_eligibility  (CHANGED — academic standing / GPA / eligibility
--   / credits are PRIVATE academic details. The baseline staff SELECT policy
--   (baseball_acad_elig_select_coach) gated on a pure membership check
--   (is_baseball_team_coach), which leaked GPA + eligibility to ANY staff — a
--   pitching/hitting/strength coach with no academic remit. Tighten the staff
--   read to require the can_view_academics capability AND player visibility, the
--   same defense-in-depth posture readiness uses. The player self-read policy
--   (baseball_acad_elig_select_player) and the write policies are left untouched.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_academic_eligibility') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_academic_eligibility ENABLE ROW LEVEL SECURITY';

    -- Replace the membership-only staff read with a capability-gated one. The
    -- eligibility row's team_id may be NULL (player-grain row), so authorize via
    -- every team the player belongs to: staff on that team need can_view_academics
    -- AND scope-level visibility of the player. Head/primary coaches pass through
    -- has_baseball_staff_capability's full-authority short-circuit.
    EXECUTE 'DROP POLICY IF EXISTS "baseball_acad_elig_select_coach" ON public.baseball_academic_eligibility';
    EXECUTE $p$CREATE POLICY "baseball_acad_elig_select_coach" ON public.baseball_academic_eligibility
      FOR SELECT TO authenticated
      USING (
        (
          team_id IS NOT NULL
          AND public.has_baseball_staff_capability(team_id, 'can_view_academics')
          AND public.can_view_baseball_player(team_id, player_id)
        )
        OR EXISTS (
          SELECT 1
          FROM public.baseball_team_members btm
          WHERE btm.player_id = baseball_academic_eligibility.player_id
            AND public.has_baseball_staff_capability(btm.team_id, 'can_view_academics')
            AND public.can_view_baseball_player(btm.team_id, baseball_academic_eligibility.player_id)
        )
      )$p$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- baseball_player_stats  (CHANGED — existing team-scoped policy retained; the
--   new import_run_id/match_confidence columns inherit it. We intentionally do
--   NOT redefine its policies here to avoid widening existing access.)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_player_stats') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_player_stats ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- ============================================================================
-- END — RLS helpers + policies. ADDITIVE. RLS-complete. NOT applied to any DB.
-- ============================================================================
