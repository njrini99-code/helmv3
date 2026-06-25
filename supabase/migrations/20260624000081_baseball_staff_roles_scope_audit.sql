-- =============================================================================
-- 20260624000081_baseball_staff_roles_scope_audit.sql
--
-- Wave 11 / packet: staff-roles  (V11 — 26_final_auth_lifting_current_app_v11)
--
-- Brings baseball_team_coach_staff + baseball_staff_invitations in line with the
-- V11 "Capability Model" + "Role Taxonomy" + "Staff Invite Flow" spec:
--
--   1. NEW capability columns on baseball_team_coach_staff:
--        can_manage_lineups, can_view_readiness, can_modify_availability,
--        can_view_private_notes, can_message_players, can_export_reports
--      (the 5 missing V11 caps + the renamed can_message_players; the legacy
--       can_message_team column is KEPT for back-compat and back-filled forward).
--   2. NEW scope columns on baseball_team_coach_staff:
--        staff_role, player_scope, position_scope, group_scope
--      (title + status already shipped in 0030).
--   3. NEW scope columns on baseball_staff_invitations:
--        staff_role, title, position_scope, group_scope, player_scope.
--   4. NEW audit table baseball_staff_audit_events (+ RLS, no anon) capturing
--        invite_accepted / role_changed / capabilities_changed / staff_removed.
--   5. AUDIT triggers: a row-change trigger on baseball_team_coach_staff emits a
--        role_changed / capabilities_changed event; the accept RPC (re-emitted
--        below) emits invite_accepted.
--   6. RE-EMIT baseball_accept_staff_invite so it materializes the NEW capability
--        columns from the stored invitation jsonb AND writes the invite_accepted
--        audit event.
--
-- GUARDRAILS HONORED:
--   * ADDITIVE ONLY — ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS /
--     CREATE INDEX IF NOT EXISTS / CREATE OR REPLACE FUNCTION /
--     DROP TRIGGER IF EXISTS then CREATE TRIGGER. No DROP COLUMN, no destructive
--     DML, no data-losing rename. Safe to run on the live shared DB.
--   * RLS enabled on the new table; REVOKE anon; authenticated-only policies.
--   * SECURITY DEFINER helpers keep their pinned search_path.
--   * NOT APPLIED here — ships as a migration file only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. New V11 capability columns on baseball_team_coach_staff.
-- -----------------------------------------------------------------------------
ALTER TABLE public.baseball_team_coach_staff
  ADD COLUMN IF NOT EXISTS can_manage_lineups       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_readiness       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_modify_availability  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_private_notes   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_message_players      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_export_reports       boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.baseball_team_coach_staff.can_manage_lineups      IS 'Build / publish lineups and batting orders.';
COMMENT ON COLUMN public.baseball_team_coach_staff.can_view_readiness      IS 'View readiness / soreness / wellness summaries (V11 — replaces can_view_medical for the readiness board).';
COMMENT ON COLUMN public.baseball_team_coach_staff.can_modify_availability IS 'Set player availability / limitations / return-to-play status.';
COMMENT ON COLUMN public.baseball_team_coach_staff.can_view_private_notes  IS 'Read staff-only private notes.';
COMMENT ON COLUMN public.baseball_team_coach_staff.can_message_players     IS 'Message players / send team messages (V11 rename of can_message_team).';
COMMENT ON COLUMN public.baseball_team_coach_staff.can_export_reports      IS 'Export performance / team reports.';

-- Forward back-fill: anyone who held the legacy can_message_team keeps the
-- renamed capability. Non-destructive (the old column is preserved). Idempotent
-- (only flips false->true). Guarded so a fresh DB without the legacy column does
-- not error.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'baseball_team_coach_staff'
      AND column_name = 'can_message_team'
  ) THEN
    UPDATE public.baseball_team_coach_staff
    SET can_message_players = true
    WHERE can_message_team = true AND can_message_players = false;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Scope columns on baseball_team_coach_staff.
-- -----------------------------------------------------------------------------
ALTER TABLE public.baseball_team_coach_staff
  ADD COLUMN IF NOT EXISTS staff_role     text,
  ADD COLUMN IF NOT EXISTS player_scope   jsonb,
  ADD COLUMN IF NOT EXISTS position_scope text[],
  ADD COLUMN IF NOT EXISTS group_scope    uuid[];

COMMENT ON COLUMN public.baseball_team_coach_staff.staff_role     IS 'Canonical V11 staff role (head_coach, pitching_coach, strength_coach, ...). Free-text legacy role kept in the role column.';
COMMENT ON COLUMN public.baseball_team_coach_staff.player_scope   IS 'jsonb { player_ids?: uuid[], exclude_player_ids?: uuid[] }. NULL = all team players.';
COMMENT ON COLUMN public.baseball_team_coach_staff.position_scope IS 'Position codes the staffer is scoped to. NULL/empty = all positions.';
COMMENT ON COLUMN public.baseball_team_coach_staff.group_scope    IS 'Lift / player group ids the staffer is scoped to. NULL/empty = all groups.';

-- -----------------------------------------------------------------------------
-- 3. Scope columns on baseball_staff_invitations (so an invite carries the
--    role + scope to materialize on accept).
-- -----------------------------------------------------------------------------
ALTER TABLE public.baseball_staff_invitations
  ADD COLUMN IF NOT EXISTS staff_role     text,
  ADD COLUMN IF NOT EXISTS title          text,
  ADD COLUMN IF NOT EXISTS position_scope text[],
  ADD COLUMN IF NOT EXISTS group_scope    uuid[],
  ADD COLUMN IF NOT EXISTS player_scope   jsonb;

COMMENT ON COLUMN public.baseball_staff_invitations.staff_role IS 'Canonical V11 staff role the invitee will be granted on accept.';

-- -----------------------------------------------------------------------------
-- 4. baseball_staff_audit_events — append-only audit of staff lifecycle.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.baseball_staff_audit_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id          uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  staff_id         uuid REFERENCES public.baseball_team_coach_staff(id) ON DELETE SET NULL,
  subject_coach_id uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL,
  actor_coach_id   uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL,
  action           text NOT NULL
                     CHECK (action IN ('invite_accepted', 'role_changed',
                                       'capabilities_changed', 'staff_removed')),
  previous_role    text,
  new_role         text,
  detail           jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.baseball_staff_audit_events IS
  'Append-only audit log of staff lifecycle events (invite accepted, role/capability change, removal). Readable by team head coach / can_invite_staff only.';

CREATE INDEX IF NOT EXISTS baseball_staff_audit_events_team_id_idx
  ON public.baseball_staff_audit_events (team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS baseball_staff_audit_events_subject_idx
  ON public.baseball_staff_audit_events (subject_coach_id);

ALTER TABLE public.baseball_staff_audit_events ENABLE ROW LEVEL SECURITY;

-- Read: only a team's head coach / can_invite_staff may read its audit log
-- (matches the spec "Audit logs: admin/head coach" visibility rule). Reuses the
-- existing SECURITY DEFINER authority helper from migration 0030.
DROP POLICY IF EXISTS baseball_staff_audit_events_select ON public.baseball_staff_audit_events;
CREATE POLICY baseball_staff_audit_events_select
  ON public.baseball_staff_audit_events
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.baseball_can_invite_staff(team_id));

-- No INSERT/UPDATE/DELETE policy for authenticated: audit rows are written ONLY
-- by SECURITY DEFINER triggers / RPCs (which bypass RLS), never by clients.
-- This makes the log effectively append-only and tamper-resistant.

REVOKE ALL ON TABLE public.baseball_staff_audit_events FROM anon;

-- -----------------------------------------------------------------------------
-- 5a. Audit trigger on baseball_team_coach_staff — emit role / capability change.
--     SECURITY DEFINER so it can insert into the audit table regardless of the
--     writer's RLS. Pinned search_path. Only fires on a meaningful delta.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.baseball_log_staff_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_caps_changed boolean;
BEGIN
  -- Resolve the acting coach (NULL for system / self-accept paths).
  SELECT c.id INTO v_actor FROM public.baseball_coaches c WHERE c.user_id = auth.uid();

  -- Removal (status flipped to 'removed').
  IF NEW.status = 'removed' AND COALESCE(OLD.status, 'active') <> 'removed' THEN
    INSERT INTO public.baseball_staff_audit_events
      (team_id, staff_id, subject_coach_id, actor_coach_id, action, previous_role, new_role)
    VALUES
      (NEW.team_id, NEW.id, NEW.coach_id, v_actor, 'staff_removed',
       OLD.staff_role, NEW.staff_role);
    RETURN NEW;
  END IF;

  -- Role change.
  IF NEW.staff_role IS DISTINCT FROM OLD.staff_role
     OR NEW.role IS DISTINCT FROM OLD.role THEN
    INSERT INTO public.baseball_staff_audit_events
      (team_id, staff_id, subject_coach_id, actor_coach_id, action, previous_role, new_role,
       detail)
    VALUES
      (NEW.team_id, NEW.id, NEW.coach_id, v_actor, 'role_changed',
       COALESCE(OLD.staff_role, OLD.role), COALESCE(NEW.staff_role, NEW.role),
       jsonb_build_object(
         'previous_role_text', OLD.role,
         'new_role_text', NEW.role));
  END IF;

  -- Capability change (any of the core boolean flags differs).
  v_caps_changed :=
       NEW.can_manage_roster      IS DISTINCT FROM OLD.can_manage_roster
    OR NEW.can_manage_practice    IS DISTINCT FROM OLD.can_manage_practice
    OR NEW.can_manage_lifting     IS DISTINCT FROM OLD.can_manage_lifting
    OR NEW.can_manage_lineups     IS DISTINCT FROM OLD.can_manage_lineups
    OR NEW.can_view_academics     IS DISTINCT FROM OLD.can_view_academics
    OR NEW.can_manage_imports     IS DISTINCT FROM OLD.can_manage_imports
    OR NEW.can_manage_stats       IS DISTINCT FROM OLD.can_manage_stats
    OR NEW.can_invite_staff       IS DISTINCT FROM OLD.can_invite_staff
    OR NEW.can_manage_settings    IS DISTINCT FROM OLD.can_manage_settings
    OR NEW.can_view_readiness     IS DISTINCT FROM OLD.can_view_readiness
    OR NEW.can_modify_availability IS DISTINCT FROM OLD.can_modify_availability
    OR NEW.can_view_medical       IS DISTINCT FROM OLD.can_view_medical
    OR NEW.can_view_private_notes IS DISTINCT FROM OLD.can_view_private_notes
    OR NEW.can_message_players    IS DISTINCT FROM OLD.can_message_players
    OR NEW.can_export_reports     IS DISTINCT FROM OLD.can_export_reports
    OR NEW.can_manage_calendar    IS DISTINCT FROM OLD.can_manage_calendar;

  IF v_caps_changed THEN
    INSERT INTO public.baseball_staff_audit_events
      (team_id, staff_id, subject_coach_id, actor_coach_id, action, detail)
    VALUES
      (NEW.team_id, NEW.id, NEW.coach_id, v_actor, 'capabilities_changed',
       jsonb_build_object(
         'before', jsonb_build_object(
           'can_manage_roster', OLD.can_manage_roster,
           'can_manage_practice', OLD.can_manage_practice,
           'can_manage_lifting', OLD.can_manage_lifting,
           'can_manage_lineups', OLD.can_manage_lineups,
           'can_view_academics', OLD.can_view_academics,
           'can_manage_imports', OLD.can_manage_imports,
           'can_manage_stats', OLD.can_manage_stats,
           'can_invite_staff', OLD.can_invite_staff,
           'can_manage_settings', OLD.can_manage_settings,
           'can_view_readiness', OLD.can_view_readiness,
           'can_modify_availability', OLD.can_modify_availability,
           'can_view_medical', OLD.can_view_medical,
           'can_view_private_notes', OLD.can_view_private_notes,
           'can_message_players', OLD.can_message_players,
           'can_export_reports', OLD.can_export_reports,
           'can_manage_calendar', OLD.can_manage_calendar),
         'after', jsonb_build_object(
           'can_manage_roster', NEW.can_manage_roster,
           'can_manage_practice', NEW.can_manage_practice,
           'can_manage_lifting', NEW.can_manage_lifting,
           'can_manage_lineups', NEW.can_manage_lineups,
           'can_view_academics', NEW.can_view_academics,
           'can_manage_imports', NEW.can_manage_imports,
           'can_manage_stats', NEW.can_manage_stats,
           'can_invite_staff', NEW.can_invite_staff,
           'can_manage_settings', NEW.can_manage_settings,
           'can_view_readiness', NEW.can_view_readiness,
           'can_modify_availability', NEW.can_modify_availability,
           'can_view_medical', NEW.can_view_medical,
           'can_view_private_notes', NEW.can_view_private_notes,
           'can_message_players', NEW.can_message_players,
           'can_export_reports', NEW.can_export_reports,
           'can_manage_calendar', NEW.can_manage_calendar)));
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.baseball_log_staff_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.baseball_log_staff_change() FROM anon;

DROP TRIGGER IF EXISTS baseball_log_staff_change_trg ON public.baseball_team_coach_staff;
CREATE TRIGGER baseball_log_staff_change_trg
  AFTER UPDATE ON public.baseball_team_coach_staff
  FOR EACH ROW
  EXECUTE FUNCTION public.baseball_log_staff_change();

-- -----------------------------------------------------------------------------
-- 6. RE-EMIT baseball_accept_staff_invite — materialize NEW capability columns
--    from the stored invitation jsonb (honoring the can_message_team ->
--    can_message_players alias) + the role/scope + write the invite_accepted
--    audit event. Supersedes the 000062 definition (CREATE OR REPLACE).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.baseball_accept_staff_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_email      text;
  v_coach_id   uuid;
  v_invite     public.baseball_staff_invitations%ROWTYPE;
  v_caps       jsonb;
  v_msg        boolean;
  v_staff_id   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;

  SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = v_uid;

  SELECT c.id INTO v_coach_id
  FROM public.baseball_coaches c
  WHERE c.user_id = v_uid;

  IF v_coach_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_coach');
  END IF;

  SELECT * INTO v_invite
  FROM public.baseball_staff_invitations
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF v_invite.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_pending');
  END IF;
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;
  IF v_email IS NULL OR lower(v_invite.email) <> v_email THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_email');
  END IF;

  v_caps := COALESCE(v_invite.capabilities, '{}'::jsonb);
  -- can_message_players honors the legacy can_message_team alias from the bag.
  v_msg := COALESCE((v_caps ->> 'can_message_players')::boolean, false)
        OR COALESCE((v_caps ->> 'can_message_team')::boolean, false);

  INSERT INTO public.baseball_team_coach_staff AS tcs (
    team_id, coach_id, role, status, staff_role, title,
    position_scope, group_scope, player_scope,
    can_manage_roster, can_manage_practice, can_manage_lifting, can_manage_lineups,
    can_view_academics, can_manage_imports, can_manage_stats, can_invite_staff,
    can_manage_settings, can_view_readiness, can_modify_availability,
    can_view_medical, can_view_private_notes, can_message_players,
    can_export_reports, can_manage_calendar,
    can_message_team, capabilities
  )
  VALUES (
    v_invite.team_id, v_coach_id, COALESCE(v_invite.staff_role, v_invite.role),
    'active', v_invite.staff_role, v_invite.title,
    v_invite.position_scope, v_invite.group_scope, v_invite.player_scope,
    COALESCE((v_caps ->> 'can_manage_roster')::boolean, false),
    COALESCE((v_caps ->> 'can_manage_practice')::boolean, false),
    COALESCE((v_caps ->> 'can_manage_lifting')::boolean, false),
    COALESCE((v_caps ->> 'can_manage_lineups')::boolean, false),
    COALESCE((v_caps ->> 'can_view_academics')::boolean, false),
    COALESCE((v_caps ->> 'can_manage_imports')::boolean, false),
    COALESCE((v_caps ->> 'can_manage_stats')::boolean, false),
    COALESCE((v_caps ->> 'can_invite_staff')::boolean, false),
    COALESCE((v_caps ->> 'can_manage_settings')::boolean, false),
    COALESCE((v_caps ->> 'can_view_readiness')::boolean, false),
    COALESCE((v_caps ->> 'can_modify_availability')::boolean, false),
    COALESCE((v_caps ->> 'can_view_medical')::boolean, false),
    COALESCE((v_caps ->> 'can_view_private_notes')::boolean, false),
    v_msg,
    COALESCE((v_caps ->> 'can_export_reports')::boolean, false),
    COALESCE((v_caps ->> 'can_manage_calendar')::boolean, false),
    v_msg,  -- keep legacy column in sync
    v_caps
  )
  ON CONFLICT (team_id, coach_id) DO UPDATE SET
    role                    = EXCLUDED.role,
    status                  = 'active',
    staff_role              = EXCLUDED.staff_role,
    title                   = EXCLUDED.title,
    position_scope          = EXCLUDED.position_scope,
    group_scope             = EXCLUDED.group_scope,
    player_scope            = EXCLUDED.player_scope,
    can_manage_roster       = EXCLUDED.can_manage_roster,
    can_manage_practice     = EXCLUDED.can_manage_practice,
    can_manage_lifting      = EXCLUDED.can_manage_lifting,
    can_manage_lineups      = EXCLUDED.can_manage_lineups,
    can_view_academics      = EXCLUDED.can_view_academics,
    can_manage_imports      = EXCLUDED.can_manage_imports,
    can_manage_stats        = EXCLUDED.can_manage_stats,
    can_invite_staff        = EXCLUDED.can_invite_staff,
    can_manage_settings     = EXCLUDED.can_manage_settings,
    can_view_readiness      = EXCLUDED.can_view_readiness,
    can_modify_availability = EXCLUDED.can_modify_availability,
    can_view_medical        = EXCLUDED.can_view_medical,
    can_view_private_notes  = EXCLUDED.can_view_private_notes,
    can_message_players     = EXCLUDED.can_message_players,
    can_export_reports      = EXCLUDED.can_export_reports,
    can_manage_calendar     = EXCLUDED.can_manage_calendar,
    can_message_team        = EXCLUDED.can_message_team,
    capabilities            = EXCLUDED.capabilities
  WHERE tcs.is_primary IS NOT TRUE AND tcs.is_head_coach IS NOT TRUE
  RETURNING tcs.id INTO v_staff_id;

  UPDATE public.baseball_staff_invitations
  SET status              = 'accepted',
      accepted_at         = now(),
      accepted_by_user_id = v_uid
  WHERE id = v_invite.id
    AND status = 'pending';

  -- Audit: invite accepted (actor = subject = self-accept).
  INSERT INTO public.baseball_staff_audit_events
    (team_id, staff_id, subject_coach_id, actor_coach_id, action, new_role, detail)
  VALUES
    (v_invite.team_id, v_staff_id, v_coach_id, v_coach_id, 'invite_accepted',
     COALESCE(v_invite.staff_role, v_invite.role),
     jsonb_build_object('invitation_id', v_invite.id));

  RETURN jsonb_build_object('ok', true, 'team_id', v_invite.team_id);
END;
$$;

REVOKE ALL ON FUNCTION public.baseball_accept_staff_invite(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.baseball_accept_staff_invite(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.baseball_accept_staff_invite(text) TO authenticated;
