-- =============================================================================
-- Helm Lifting Lab — Identity & Access Foundation
-- Migration: 20260625000000_helm_lifting_identity.sql
--
-- Spec: docs/lifting-lab/HELM_LIFTING_LAB_BLUEPRINT.md §1.2–§1.6
--
-- Creates:
--   * helm_lifting_coaches          (cross-sport lifting-coach identity)
--   * helm_lifting_team_links       (alias used in Blueprint §7 for team_links)
--   * helm_lifting_coach_assignments (org→sport→team coverage grants)
--   * helm_lifting_athletes          (thin per-org athlete reference)
--   * helm_lifting_org_viewers       (head-coach VIEW/EDIT grant)
--   * helm_lifting_coach_invites     (invitation ledger)
--
--   4 SECURITY DEFINER helpers:
--     helm_lifting_coach_for_org(p_org uuid) → boolean
--     helm_lifting_can_view_org(p_org uuid, p_sport text) → boolean
--     helm_lifting_can_edit_org(p_org uuid) → boolean
--     helm_lifting_is_my_athlete(p_athlete uuid) → boolean
--
--   RLS + REVOKE anon on every table and every helper.
--
-- GOLF-SAFETY GUARANTEES
--   * Purely additive: CREATE TABLE/INDEX IF NOT EXISTS, CREATE OR REPLACE
--     FUNCTION, DROP POLICY IF EXISTS + CREATE, ENABLE ROW LEVEL SECURITY.
--   * ZERO ALTER/DROP of any golf_* or baseball_* object.
--   * Soft refs to *_teams/*_players (no hard FK → no cascade into existing tables).
--   * handle_new_user is left UNTOUCHED.
--   * user_role enum NOT altered.
--   * Every SECURITY DEFINER function: SET search_path = public, pg_temp + REVOKE
--     EXECUTE FROM anon.
--   * Every new table ends with REVOKE ALL ON <table> FROM anon.
-- =============================================================================

-- ===========================================================================
-- 1. helm_lifting_coaches — the cross-sport lifting-coach identity
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.helm_lifting_coaches (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name              text,
  title                  text,
  email                  text,
  phone                  text,
  avatar_url             text,
  status                 text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'removed')),
  onboarding_completed   boolean NOT NULL DEFAULT false,
  deleted_at             timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_helm_lifting_coach_user_org UNIQUE (user_id, organization_id)
);
ALTER TABLE public.helm_lifting_coaches
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS helm_lifting_coaches_user_idx
  ON public.helm_lifting_coaches (user_id);
CREATE INDEX IF NOT EXISTS helm_lifting_coaches_org_idx
  ON public.helm_lifting_coaches (organization_id) WHERE status = 'active';

-- ===========================================================================
-- 2. helm_lifting_coach_assignments — org→sport→team coverage grants
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.helm_lifting_coach_assignments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id               uuid NOT NULL REFERENCES public.helm_lifting_coaches(id) ON DELETE CASCADE,
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sport                  text NOT NULL CHECK (sport IN ('baseball', 'golf')),
  team_id                uuid, -- SOFT ref: baseball_teams.id / golf_teams.id — no hard FK
  team_name_snapshot     text,
  is_active              boolean NOT NULL DEFAULT true,
  assigned_by_user_id    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_helm_lifting_coach_assignment UNIQUE (coach_id, sport, team_id)
);
CREATE INDEX IF NOT EXISTS helm_lifting_coach_assignments_coach_idx
  ON public.helm_lifting_coach_assignments (coach_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS helm_lifting_coach_assignments_org_idx
  ON public.helm_lifting_coach_assignments (organization_id, sport) WHERE is_active = true;

-- Alias: blueprint §7 refers to helm_lifting_team_links as the assignments table.
-- We use coach_assignments as the canonical name; team_links is a view alias.
-- (No separate table needed; coach_assignments IS the team-link table.)

-- ===========================================================================
-- 3. helm_lifting_athletes — thin per-org athlete reference
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.helm_lifting_athletes (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sport                  text NOT NULL CHECK (sport IN ('baseball', 'golf')),
  sport_player_id        uuid, -- SOFT ref: baseball_players.id / golf_players.id
  user_id                uuid REFERENCES public.users(id) ON DELETE SET NULL,
  team_id                uuid, -- SOFT ref to the sport team (current roster team)
  first_name             text,
  last_name              text,
  position               text,
  is_active              boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_helm_lifting_athlete UNIQUE (organization_id, sport, sport_player_id)
);
CREATE INDEX IF NOT EXISTS helm_lifting_athletes_org_sport_idx
  ON public.helm_lifting_athletes (organization_id, sport) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS helm_lifting_athletes_user_idx
  ON public.helm_lifting_athletes (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS helm_lifting_athletes_sport_player_idx
  ON public.helm_lifting_athletes (sport_player_id) WHERE sport_player_id IS NOT NULL;

-- ===========================================================================
-- 4. helm_lifting_org_viewers — head-coach VIEW/EDIT cross-portal grant
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.helm_lifting_org_viewers (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id                uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sport                  text NOT NULL CHECK (sport IN ('baseball', 'golf')),
  source_team_id         uuid, -- SOFT ref: the team they head
  granted_by             text NOT NULL DEFAULT 'invite_accept',
  can_edit               boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_helm_lifting_org_viewer UNIQUE (organization_id, user_id, sport)
);
CREATE INDEX IF NOT EXISTS helm_lifting_org_viewers_user_idx
  ON public.helm_lifting_org_viewers (user_id);
CREATE INDEX IF NOT EXISTS helm_lifting_org_viewers_org_idx
  ON public.helm_lifting_org_viewers (organization_id);

-- ===========================================================================
-- 5. helm_lifting_coach_invites — invitation ledger (org-scoped)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.helm_lifting_coach_invites (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email                  text NOT NULL,
  token                  uuid NOT NULL DEFAULT gen_random_uuid(),
  invited_by_user_id     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  invited_by_sport       text NOT NULL CHECK (invited_by_sport IN ('baseball', 'golf')),
  source_team_id         uuid, -- SOFT ref: inviting head coach's team
  role_title             text,
  status                 text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at             timestamptz NOT NULL DEFAULT now() + interval '14 days',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS helm_lifting_coach_invites_token_uq
  ON public.helm_lifting_coach_invites (token);
CREATE INDEX IF NOT EXISTS helm_lifting_coach_invites_email_idx
  ON public.helm_lifting_coach_invites (lower(email), status);
CREATE INDEX IF NOT EXISTS helm_lifting_coach_invites_org_idx
  ON public.helm_lifting_coach_invites (organization_id, status);

-- ===========================================================================
-- 6. SECURITY DEFINER helpers
--    Pattern: pinned search_path, TO authenticated only, REVOKE FROM anon.
-- ===========================================================================

-- 6.1 helm_lifting_coach_for_org — caller is an ACTIVE lifting coach for this org
CREATE OR REPLACE FUNCTION public.helm_lifting_coach_for_org(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.helm_lifting_coaches c
    WHERE c.organization_id = p_org
      AND c.user_id         = auth.uid()
      AND c.status          = 'active'
  );
$$;
REVOKE ALL ON FUNCTION public.helm_lifting_coach_for_org(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.helm_lifting_coach_for_org(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.helm_lifting_coach_for_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helm_lifting_coach_for_org(uuid) TO service_role;

-- 6.2 helm_lifting_can_view_org — active coach OR a viewer row for (org, uid, sport)
CREATE OR REPLACE FUNCTION public.helm_lifting_can_view_org(p_org uuid, p_sport text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (
    public.helm_lifting_coach_for_org(p_org)
    OR EXISTS (
      SELECT 1
      FROM public.helm_lifting_org_viewers v
      WHERE v.organization_id = p_org
        AND v.user_id         = auth.uid()
        AND v.sport           = p_sport
    )
  );
$$;
REVOKE ALL ON FUNCTION public.helm_lifting_can_view_org(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.helm_lifting_can_view_org(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.helm_lifting_can_view_org(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helm_lifting_can_view_org(uuid, text) TO service_role;

-- 6.3 helm_lifting_can_edit_org — active coach OR a viewer with can_edit=true
CREATE OR REPLACE FUNCTION public.helm_lifting_can_edit_org(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (
    public.helm_lifting_coach_for_org(p_org)
    OR EXISTS (
      SELECT 1
      FROM public.helm_lifting_org_viewers v
      WHERE v.organization_id = p_org
        AND v.user_id         = auth.uid()
        AND v.can_edit        = true
    )
  );
$$;
REVOKE ALL ON FUNCTION public.helm_lifting_can_edit_org(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.helm_lifting_can_edit_org(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.helm_lifting_can_edit_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helm_lifting_can_edit_org(uuid) TO service_role;

-- 6.4 helm_lifting_is_my_athlete — the athlete row resolves to the caller via
--     the sport player's user_id (athlete-self read-only EXISTS; purely additive)
CREATE OR REPLACE FUNCTION public.helm_lifting_is_my_athlete(p_athlete uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.helm_lifting_athletes a
    WHERE a.id      = p_athlete
      AND a.user_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.helm_lifting_is_my_athlete(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.helm_lifting_is_my_athlete(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.helm_lifting_is_my_athlete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helm_lifting_is_my_athlete(uuid) TO service_role;

-- ===========================================================================
-- 7. ROW LEVEL SECURITY
--    Convention: ENABLE + DROP POLICY IF EXISTS + CREATE POLICY TO authenticated.
--    service_role bypasses RLS by design. anon REVOKED at end.
-- ===========================================================================

-- 7.1 helm_lifting_coaches ------------------------------------------------
ALTER TABLE public.helm_lifting_coaches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hlc_select ON public.helm_lifting_coaches;
DROP POLICY IF EXISTS hlc_insert ON public.helm_lifting_coaches;
DROP POLICY IF EXISTS hlc_update ON public.helm_lifting_coaches;
DROP POLICY IF EXISTS hlc_delete ON public.helm_lifting_coaches;

-- A coach reads their OWN row; org viewers (any sport) may also read
CREATE POLICY hlc_select ON public.helm_lifting_coaches FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.helm_lifting_can_view_org(organization_id, 'baseball')
    OR public.helm_lifting_can_view_org(organization_id, 'golf')
  );

-- No client INSERT (seeded via accept RPC in service_role SECURITY DEFINER context);
-- explicit deny makes the intent clear and catches any accidental direct-insert paths.
CREATE POLICY hlc_insert ON public.helm_lifting_coaches FOR INSERT TO authenticated
  WITH CHECK (false);

-- A coach may update their OWN profile; no client INSERT (seeded via accept RPC)
CREATE POLICY hlc_update ON public.helm_lifting_coaches FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No client DELETE — suspension is a status UPDATE
CREATE POLICY hlc_delete ON public.helm_lifting_coaches FOR DELETE TO authenticated
  USING (false);

-- 7.2 helm_lifting_coach_assignments --------------------------------------
ALTER TABLE public.helm_lifting_coach_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hlca_select ON public.helm_lifting_coach_assignments;
DROP POLICY IF EXISTS hlca_insert ON public.helm_lifting_coach_assignments;
DROP POLICY IF EXISTS hlca_update ON public.helm_lifting_coach_assignments;
DROP POLICY IF EXISTS hlca_delete ON public.helm_lifting_coach_assignments;

CREATE POLICY hlca_select ON public.helm_lifting_coach_assignments FOR SELECT TO authenticated
  USING (
    public.helm_lifting_can_view_org(organization_id, sport)
  );

CREATE POLICY hlca_insert ON public.helm_lifting_coach_assignments FOR INSERT TO authenticated
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hlca_update ON public.helm_lifting_coach_assignments FOR UPDATE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id))
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hlca_delete ON public.helm_lifting_coach_assignments FOR DELETE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id));

-- 7.3 helm_lifting_athletes -----------------------------------------------
ALTER TABLE public.helm_lifting_athletes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hla_select ON public.helm_lifting_athletes;
DROP POLICY IF EXISTS hla_insert ON public.helm_lifting_athletes;
DROP POLICY IF EXISTS hla_update ON public.helm_lifting_athletes;
DROP POLICY IF EXISTS hla_delete ON public.helm_lifting_athletes;

CREATE POLICY hla_select ON public.helm_lifting_athletes FOR SELECT TO authenticated
  USING (
    public.helm_lifting_can_view_org(organization_id, sport)
    OR public.helm_lifting_is_my_athlete(id)
  );

CREATE POLICY hla_insert ON public.helm_lifting_athletes FOR INSERT TO authenticated
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hla_update ON public.helm_lifting_athletes FOR UPDATE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id))
  WITH CHECK (public.helm_lifting_can_edit_org(organization_id));

CREATE POLICY hla_delete ON public.helm_lifting_athletes FOR DELETE TO authenticated
  USING (public.helm_lifting_can_edit_org(organization_id));

-- 7.4 helm_lifting_org_viewers --------------------------------------------
ALTER TABLE public.helm_lifting_org_viewers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hlov_select ON public.helm_lifting_org_viewers;
DROP POLICY IF EXISTS hlov_insert ON public.helm_lifting_org_viewers;
DROP POLICY IF EXISTS hlov_update ON public.helm_lifting_org_viewers;
DROP POLICY IF EXISTS hlov_delete ON public.helm_lifting_org_viewers;

-- A viewer reads their OWN row; an active lifting coach may read all org viewers
CREATE POLICY hlov_select ON public.helm_lifting_org_viewers FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.helm_lifting_coach_for_org(organization_id)
  );

-- INSERT/UPDATE only via accept/onboarding RPC (service_role) — no direct client write
CREATE POLICY hlov_insert ON public.helm_lifting_org_viewers FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY hlov_update ON public.helm_lifting_org_viewers FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY hlov_delete ON public.helm_lifting_org_viewers FOR DELETE TO authenticated
  USING (false);

-- 7.5 helm_lifting_coach_invites ------------------------------------------
ALTER TABLE public.helm_lifting_coach_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hlci_select ON public.helm_lifting_coach_invites;
DROP POLICY IF EXISTS hlci_insert ON public.helm_lifting_coach_invites;
DROP POLICY IF EXISTS hlci_update ON public.helm_lifting_coach_invites;
DROP POLICY IF EXISTS hlci_delete ON public.helm_lifting_coach_invites;

-- Invitee (by email match on their Supabase auth email) OR active coach may read
CREATE POLICY hlci_select ON public.helm_lifting_coach_invites FOR SELECT TO authenticated
  USING (
    lower(email) = lower((SELECT u.email FROM public.users u WHERE u.id = auth.uid()))
    OR public.helm_lifting_coach_for_org(organization_id)
  );

-- HEAD coach inserts the invite; DB enforces both uid match and org membership (defense-in-depth).
CREATE POLICY hlci_insert ON public.helm_lifting_coach_invites FOR INSERT TO authenticated
  WITH CHECK (
    invited_by_user_id = auth.uid()
    AND public.helm_lifting_can_edit_org(organization_id)
  );

-- Status updates: inviting user may refresh/revoke; accept via definer RPC
CREATE POLICY hlci_update ON public.helm_lifting_coach_invites FOR UPDATE TO authenticated
  USING (invited_by_user_id = auth.uid())
  WITH CHECK (invited_by_user_id = auth.uid());

CREATE POLICY hlci_delete ON public.helm_lifting_coach_invites FOR DELETE TO authenticated
  USING (invited_by_user_id = auth.uid());

-- ===========================================================================
-- 8. GRANTS — REVOKE anon; grant authenticated (RLS-gated) + service_role
-- ===========================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'helm_lifting_coaches',
    'helm_lifting_coach_assignments',
    'helm_lifting_athletes',
    'helm_lifting_org_viewers',
    'helm_lifting_coach_invites'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
