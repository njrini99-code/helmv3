-- STATUS: WRITTEN — HOLD — NOT APPLIED
-- Held data plan: docs/clubhouse/held/data/qualifier-db-hardening.md
--
-- D-35 (owner, 2026-09-29): close the older Qualifiers database gaps the
-- Clubhouse security review found. WRITTEN, NOT APPLIED; owner applies.
--
-- 1. coach_reasoning is the coach's note (H1). Players on the team can read
--    golf_qualifier_selections once the squad is confirmed, and signed-in
--    users could read every column, so a player's own session could select
--    coach_reasoning directly; the screens only hid it. Column grants can't
--    tell a coach from a player (both are `authenticated`), so table-level
--    SELECT is taken away, every other column is granted back, and coaches
--    read the note through golf_qualifier_selection_reasons(), which checks
--    is_team_coach on the qualifier's team (the table's own coach test).
--    Revoking the one column alone would do nothing while the table grant
--    stands.
-- 2. Entering a player (M3): the coach insert policy only checked that the
--    caller coaches the qualifier's team, so a direct insert could enter a
--    player from another team. Insert, and update (whose USING stood in for
--    its check, so an update could re-point player_id), now also require an
--    active golf_team_members row for that player on the qualifier's team,
--    as setQualifierEntrants already does.
-- 3. Removing an entry with a round (M2): the guard ran as the caller, so it
--    missed rounds the caller's RLS can't see, and it only checked
--    in_progress. It now runs as its owner (postgres, which bypasses RLS)
--    with a fixed search_path, and refuses any unfinished round (anything
--    but completed, so a draft too). Same name, same message, same 55000.
-- 4. Hardening (L4): anon loses its grants on the three qualifier tables
--    that had them (RLS already returned nothing to a signed-out caller;
--    round_courses has none), and is_team_coach / is_team_player gain
--    pg_temp on their search_path, like the is_golf_team_* helpers.
--
-- Live counts before writing (aggregates only): 224 qualifier rounds, none
-- with no team, another team's team or a status other than completed or
-- in_progress, so the trigger gap is latent; 6 selection rows, none with
-- reasoning written, so nothing has leaked.
--
-- ORDER. Apply only after the deploy that carries
-- src/lib/golf/qualifier-selection-reasons.ts is live. That reader calls the
-- function and falls back to the column while the function doesn't exist, so
-- it works on both sides of this apply; an older build selects the column
-- directly and would lose the note. Readers switched: the Clubhouse qualifier
-- loader
-- (src/clubhouse/data/qualifiers.ts) and the CoachHelm qualifying workspace
-- loader (src/lib/coachhelm/v3/qualifying/loader.ts); the detail page's
-- selection count selects player_id, not '*'. Anything else that selects
-- '*' or coach_reasoning from golf_qualifier_selections with a user's client
-- fails after this apply; none is left in src/ (service-role reads are
-- unaffected). After apply: `npm run db:types`, then the fallback can go.
--
-- ROLLBACK:
--   GRANT SELECT ON public.golf_qualifier_selections TO authenticated;
--   DROP FUNCTION public.golf_qualifier_selection_reasons(uuid);
--   restore the two entry policies' expressions (below, without the
--     golf_team_members EXISTS; update back to USING only);
--   CREATE OR REPLACE the trigger function without SECURITY DEFINER and
--     with status = 'in_progress';
--   GRANT ALL ON public.golf_qualifiers, public.golf_qualifier_entries,
--     public.golf_qualifier_selections TO anon;
--   ALTER FUNCTION public.is_team_coach(uuid) SET search_path = public;
--   ALTER FUNCTION public.is_team_player(uuid) SET search_path = public;
-- VERIFY: select 1 where not has_column_privilege('authenticated',
-- VERIFY:   'public.golf_qualifier_selections', 'coach_reasoning', 'SELECT')
-- VERIFY:   and has_column_privilege('authenticated',
-- VERIFY:   'public.golf_qualifier_selections', 'player_id', 'SELECT');
-- VERIFY: select 1 from pg_proc where oid =
-- VERIFY:   'public.golf_qualifier_selection_reasons(uuid)'::regprocedure and
-- VERIFY:     prosecdef;
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename =
-- VERIFY:   'golf_qualifier_entries'
-- VERIFY:   and policyname = 'golf_qualifier_entries_insert_coach' and
-- VERIFY:   with_check like '%golf_team_members%';
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename =
-- VERIFY:   'golf_qualifier_entries'
-- VERIFY:   and policyname = 'golf_qualifier_entries_update_coach' and
-- VERIFY:   with_check like '%golf_team_members%';
-- VERIFY: select 1 from pg_proc where oid =
-- VERIFY:   'helm_private.prevent_qualifier_entry_active_round_stranding()'
-- VERIFY:   ::regprocedure
-- VERIFY:   and prosecdef;
-- VERIFY: select 1 where not has_table_privilege('anon',
-- VERIFY:   'public.golf_qualifiers', 'SELECT')
-- VERIFY:   and not has_table_privilege('anon',
-- VERIFY:   'public.golf_qualifier_entries', 'SELECT')
-- VERIFY:   and not has_table_privilege('anon',
-- VERIFY:   'public.golf_qualifier_selections', 'SELECT');
-- VERIFY: select 1 from pg_proc where oid =
-- VERIFY:   'public.is_team_coach(uuid)'::regprocedure and proconfig::text like
-- VERIFY:   '%pg_temp%';
-- VERIFY: select 1 from pg_proc where oid =
-- VERIFY:   'public.is_team_player(uuid)'::regprocedure
-- VERIFY:   and proconfig::text like '%pg_temp%';


-- 1. coach_reasoning is coach-only -----------------------------------------

REVOKE SELECT ON TABLE public.golf_qualifier_selections FROM authenticated;
GRANT SELECT (
    qualifier_id, player_id, selection_type, selected_at, selected_by_user_id
)
ON TABLE public.golf_qualifier_selections TO authenticated;

CREATE OR REPLACE FUNCTION public.golf_qualifier_selection_reasons(
    p_qualifier_id uuid
)
RETURNS TABLE (player_id uuid, coach_reasoning text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.player_id, s.coach_reasoning
  FROM public.golf_qualifier_selections s
  JOIN public.golf_qualifiers q ON q.id = s.qualifier_id
  WHERE s.qualifier_id = p_qualifier_id
    AND public.is_team_coach(q.team_id);
$$;

ALTER FUNCTION public.golf_qualifier_selection_reasons(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.golf_qualifier_selection_reasons(
    uuid
) FROM public,
anon;
GRANT EXECUTE ON FUNCTION public.golf_qualifier_selection_reasons(
    uuid
) TO authenticated,
service_role;

-- Players get no rows; signed-in users cannot select
-- golf_qualifier_selections.coach_reasoning directly.
COMMENT ON FUNCTION public.golf_qualifier_selection_reasons(uuid) IS
'D-35: coach''s-pick reasons, for coaches of the qualifier''s team only.';

-- 2. An entry's player is on the qualifier's team ------------------------

ALTER POLICY golf_qualifier_entries_insert_coach
ON public.golf_qualifier_entries
WITH CHECK (EXISTS (
    SELECT 1
    FROM public.golf_qualifiers q
    WHERE
        q.id = golf_qualifier_entries.qualifier_id
        AND public.is_golf_team_coach(q.team_id)
        AND EXISTS (
            SELECT 1
            FROM public.golf_team_members m
            WHERE
                m.team_id = q.team_id
                AND m.player_id = golf_qualifier_entries.player_id
                AND m.status = 'active'::public.team_member_status
        )
));

ALTER POLICY golf_qualifier_entries_update_coach
ON public.golf_qualifier_entries
USING (EXISTS (
    SELECT 1
    FROM public.golf_qualifiers q
    WHERE
        q.id = golf_qualifier_entries.qualifier_id
        AND public.is_golf_team_coach(q.team_id)
))
WITH CHECK (EXISTS (
    SELECT 1
    FROM public.golf_qualifiers q
    WHERE
        q.id = golf_qualifier_entries.qualifier_id
        AND public.is_golf_team_coach(q.team_id)
        AND EXISTS (
            SELECT 1
            FROM public.golf_team_members m
            WHERE
                m.team_id = q.team_id
                AND m.player_id = golf_qualifier_entries.player_id
                AND m.status = 'active'::public.team_member_status
        )
));

-- 3. The remove-with-round guard sees every round ------------------------

CREATE OR REPLACE FUNCTION
helm_private.prevent_qualifier_entry_active_round_stranding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Runs as its owner so a round the caller's RLS can't see still counts,
  -- and any unfinished round (in progress, draft, or anything not completed)
  -- keeps its entry.
  IF EXISTS (
    SELECT 1
    FROM public.golf_rounds
    WHERE player_id = OLD.player_id
      AND qualifier_id = OLD.qualifier_id
      AND status IS DISTINCT FROM 'completed'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'This player has a saved qualifier round. Have them finish or '
        || 'explicitly discard it before removing their qualifier entry.';
  END IF;
  RETURN OLD;
END;
$$;

ALTER FUNCTION helm_private.prevent_qualifier_entry_active_round_stranding()
OWNER TO postgres;
REVOKE ALL
ON FUNCTION helm_private.prevent_qualifier_entry_active_round_stranding()
FROM public,
anon,
authenticated;

-- 4. Hardening -------------------------------------------------------------

REVOKE ALL ON TABLE public.golf_qualifiers FROM anon;
REVOKE ALL ON TABLE public.golf_qualifier_entries FROM anon;
REVOKE ALL ON TABLE public.golf_qualifier_selections FROM anon;

ALTER FUNCTION public.is_team_coach(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_team_player(uuid) SET search_path = public, pg_temp;
