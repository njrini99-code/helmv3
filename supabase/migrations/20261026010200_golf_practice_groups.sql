-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- N-00 v2 Practice, slice 0.
-- WHY: Saved groups a coach reuses across plans ("Travel five", "Freshmen"). A plan copies a saved group's members; it never links to it live.
-- WHO: Coaches of the team (public.is_golf_team_coach), all four commands. Every member must be an active member of the team, checked on insert and update. Players have no access.
-- ORDER: After 20261026010000.
-- RISK: New table and one helper function. No triggers.
-- ROLLBACK: DROP TABLE IF EXISTS public.golf_practice_groups CASCADE; DROP FUNCTION IF EXISTS public.golf_practice_players_on_team(uuid, uuid[]);
-- VERIFY: SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace = 'public'::regnamespace AND relname = 'golf_practice_groups' AND relrowsecurity;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'golf_practice_groups' HAVING count(*) = 4;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'golf_practice_players_on_team' AND prosecdef AND 'search_path=""' = ANY (proconfig);
-- VERIFY: SELECT 1 WHERE NOT has_table_privilege('anon', 'public.golf_practice_groups', 'SELECT') AND NOT has_table_privilege('authenticated', 'public.golf_practice_groups', 'TRUNCATE');

SET lock_timeout = '3s';

-- True when the caller coaches p_team and every id is an active member of it. Used inside the policies below,
-- as the caller, so it reads golf_team_members with the same result whoever calls it.
CREATE OR REPLACE FUNCTION public.golf_practice_players_on_team(p_team uuid, p_players uuid[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_golf_team_coach(p_team)
     AND NOT EXISTS (
       SELECT 1 FROM pg_catalog.unnest(p_players) AS pid
       WHERE NOT EXISTS (
         SELECT 1 FROM public.golf_team_members m
         WHERE m.team_id = p_team AND m.player_id = pid AND m.status = 'active'::public.team_member_status
       )
     );
$$;

CREATE TABLE IF NOT EXISTS public.golf_practice_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.golf_teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  player_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT golf_practice_groups_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  CONSTRAINT golf_practice_groups_size CHECK (cardinality(player_ids) <= 30)
);

CREATE UNIQUE INDEX IF NOT EXISTS golf_practice_groups_team_name_uniq
  ON public.golf_practice_groups (team_id, lower(btrim(name)));

ALTER TABLE public.golf_practice_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS golf_practice_groups_select ON public.golf_practice_groups;
CREATE POLICY golf_practice_groups_select ON public.golf_practice_groups
  FOR SELECT TO authenticated USING (public.is_golf_team_coach(team_id));

DROP POLICY IF EXISTS golf_practice_groups_insert ON public.golf_practice_groups;
CREATE POLICY golf_practice_groups_insert ON public.golf_practice_groups
  FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()) AND public.golf_practice_players_on_team(team_id, player_ids));

DROP POLICY IF EXISTS golf_practice_groups_update ON public.golf_practice_groups;
CREATE POLICY golf_practice_groups_update ON public.golf_practice_groups
  FOR UPDATE TO authenticated
  USING (public.is_golf_team_coach(team_id))
  WITH CHECK (public.golf_practice_players_on_team(team_id, player_ids));

DROP POLICY IF EXISTS golf_practice_groups_delete ON public.golf_practice_groups;
CREATE POLICY golf_practice_groups_delete ON public.golf_practice_groups
  FOR DELETE TO authenticated USING (public.is_golf_team_coach(team_id));

REVOKE ALL ON FUNCTION public.golf_practice_players_on_team(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golf_practice_players_on_team(uuid, uuid[]) TO authenticated, service_role;
REVOKE ALL ON public.golf_practice_groups FROM anon;
REVOKE ALL ON public.golf_practice_groups FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.golf_practice_groups TO authenticated;
GRANT ALL ON public.golf_practice_groups TO service_role;
