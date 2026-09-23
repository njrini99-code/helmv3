-- Package 8, repair plan §14.10: revision-keyed recap provenance + the cheap
-- half of single-flight protection for round-recap.ts's LLM path.
--
-- B-cheap (single-flight): save_round_ai_recap's UPDATE gets an
-- `AND ai_recap IS NULL` guard. Two concurrent generateRoundRecap() calls for
-- the same round previously both persisted successfully — whichever RPC call
-- committed second silently overwrote the first (last-write-wins), after both
-- had already spent a full, separately-billed LLM call. This does not stop
-- the double LLM spend (that needs a lock taken BEFORE the LLM call, deferred
-- — see the evidence-contract doc), but it stops the silent overwrite: only
-- the winner's text is ever persisted. The return shape gains a `persisted`
-- field (true iff THIS call's UPDATE actually won the race) so a caller that
-- lost can re-read the winner's text instead of reporting its own, discarded
-- generation as what's stored. Signature, SECURITY DEFINER, and the
-- REVOKE/GRANT pattern are unchanged — no code depends on this migration; it
-- is safe to merge before or after the owner applies it.
--
-- A (provenance): a new table, not new golf_rounds columns — this keeps the
-- addition off golf_rounds' RLS/trigger-guarded surface entirely.
-- round-recap.ts writes it best-effort through the admin (service_role)
-- client after a successful save_round_ai_recap call; a write failure
-- (including this migration not yet being applied) is logged and swallowed,
-- never blocking or throwing the recap itself.
--
-- ROLLBACK: additive only — no existing column, row, or grant is removed or
-- narrowed from any table other than golf_round_recap_provenance itself
-- (net-new). To fully revert: DROP TABLE public.golf_round_recap_provenance;
-- then re-apply the prior CREATE OR REPLACE FUNCTION
-- helm_private.save_round_ai_recap body from 20260825233000 (drops the
-- `AND ai_recap IS NULL` guard and the `persisted` return field). Do not
-- revert the function alone while the table still exists — round-recap.ts's
-- code already tolerates either function shape, so reverting is only ever a
-- safety valve, not something normal operation depends on.
--
-- VERIFY: SELECT 1 WHERE position('ai_recap IS NULL' IN pg_get_functiondef('helm_private.save_round_ai_recap(uuid,text,uuid)'::regprocedure)) > 0; -- noqa: LT05
-- VERIFY: SELECT 1 WHERE position('''persisted''' IN pg_get_functiondef('helm_private.save_round_ai_recap(uuid,text,uuid)'::regprocedure)) > 0; -- noqa: LT05
-- VERIFY: SELECT 1 WHERE (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.golf_round_recap_provenance'::regclass); -- noqa: LT05
-- VERIFY: SELECT 1 WHERE NOT has_table_privilege('anon', 'public.golf_round_recap_provenance', 'SELECT'); -- noqa: LT05
-- VERIFY: SELECT 1 WHERE NOT has_table_privilege('authenticated', 'public.golf_round_recap_provenance', 'INSERT'); -- noqa: LT05
-- VERIFY: SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'golf_round_recap_provenance'; -- noqa: LT05

CREATE OR REPLACE FUNCTION helm_private.save_round_ai_recap(
    p_round_id uuid,
    p_recap text,
    p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_player_id uuid;
  v_recap text;
  v_persisted boolean;
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Sign in to save a round recap.';
  END IF;

  v_recap := btrim(coalesce(p_recap, ''));
  IF char_length(v_recap) < 30 OR char_length(v_recap) > 400 THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'Round recap must be between 30 and 400 characters.';
  END IF;

  SELECT player_id
  INTO v_player_id
  FROM public.golf_rounds
  WHERE id = p_round_id
    AND status = 'completed'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0002', message = 'Completed round not found.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.golf_players
    WHERE id = v_player_id
      AND user_id = p_actor_user_id
  ) AND NOT coalesce(public.verify_coach_owns_player(v_player_id, p_actor_user_id), false) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'You do not have access to this round.';
  END IF;

  PERFORM set_config('helm.golf_lifecycle_write', 'round_recap', true);

  -- MUST-1 (single-flight, cheap half): a concurrent call that already won
  -- the race already set ai_recap, so this call's UPDATE now touches zero
  -- rows instead of overwriting the winner's text. The FOR UPDATE row lock
  -- above already serializes the two calls at the DB level; this clause is
  -- what makes the loser's write a no-op rather than a silent clobber.
  UPDATE public.golf_rounds
  SET ai_recap = v_recap,
      ai_recap_generated_at = now()
  WHERE id = p_round_id
    AND ai_recap IS NULL;

  v_persisted := FOUND;

  -- `persisted: false` tells the caller its own text was NOT what ended up
  -- stored (it lost the race) — round-recap.ts re-reads the winner's
  -- ai_recap in that case instead of returning/caching its own discarded
  -- generation, and skips writing provenance for a recap it didn't produce.
  RETURN jsonb_build_object('success', true, 'persisted', v_persisted);
END;
$$;

REVOKE ALL ON FUNCTION helm_private.save_round_ai_recap(
    uuid, text, uuid
) FROM public;

-- public.save_round_ai_recap(uuid, text) — the SECURITY DEFINER wrapper that
-- calls the function above with auth.uid() — is unchanged: same signature,
-- same REVOKE/GRANT (authenticated only, never anon or PUBLIC).

CREATE TABLE IF NOT EXISTS public.golf_round_recap_provenance (
    round_id uuid PRIMARY KEY REFERENCES public.golf_rounds (
        id
    ) ON DELETE CASCADE,
    player_id uuid NOT NULL REFERENCES public.golf_players (
        id
    ) ON DELETE CASCADE,
    source text NOT NULL,
    call_log_id uuid REFERENCES public.golf_coachhelm_llm_calls (
        id
    ) ON DELETE SET NULL,
    claim_packet_engaged boolean NOT NULL DEFAULT false,
    -- The player's rounds_played (golf_player_stats_cache) at the moment this
    -- recap was generated. golf_player_stats_cache is a live, mutable,
    -- separately-recomputed cache (unlike golf_rounds' own score/shot data,
    -- which is permanent post-completion) — a recap's season-comparison lede
    -- can go stale relative to CURRENT stats even though the round it
    -- describes never changes. This column makes that staleness queryable
    -- ("this recap was generated over N rounds; the player now has M > N")
    -- without any new invalidation machinery. Whether to act on it (i.e.
    -- regenerate) is an owner product/cost decision, out of scope here.
    stats_rounds_played_at_generation bigint,
    generated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT golf_round_recap_provenance_source_check
    CHECK (source IN ('llm', 'deterministic'))
);

COMMENT ON TABLE public.golf_round_recap_provenance IS
'One row per generated golf_rounds.ai_recap: which path produced it '
'(llm vs deterministic fallback), the golf_coachhelm_llm_calls row for '
'the llm path (full audit trail: evidence, citations, cost), whether '
'the typed claim packet gate was engaged, and the season-stats '
'snapshot the prose was generated against. Written best-effort by the '
'service role from round-recap.ts; a write failure never blocks or '
'throws the recap.';

CREATE INDEX IF NOT EXISTS golf_round_recap_provenance_player_id_idx
ON public.golf_round_recap_provenance (player_id);

-- Supports the FK's ON DELETE SET NULL lookup and any future admin query
-- joining a recap's provenance row back to its full LLM call audit trail.
CREATE INDEX IF NOT EXISTS golf_round_recap_provenance_call_log_id_idx
ON public.golf_round_recap_provenance (call_log_id);

ALTER TABLE public.golf_round_recap_provenance ENABLE ROW LEVEL SECURITY;

-- Read access mirrors golf_rounds exactly by re-running the caller's OWN
-- golf_rounds RLS inside the EXISTS subquery, rather than re-deriving the
-- player/coach/admin access rules here a second time (the earlier draft of
-- this policy set keyed coach access on the PLAYER's current team, which
-- diverges from golf_rounds_select's own rule — that policy checks the
-- ROUND's team_id, e.g. a coach who staffed the team the round was played
-- under, even if the player has since moved teams). Any principal who can
-- SELECT the referenced golf_rounds row (owning player, coach via
-- is_golf_team_coach/is_golf_team_player on the round's own team_id, or
-- admin via admin_read_all) can read its provenance row.
DROP POLICY IF EXISTS "Recap provenance visible via round access"
ON public.golf_round_recap_provenance;
CREATE POLICY "Recap provenance visible via round access"
ON public.golf_round_recap_provenance FOR SELECT TO authenticated
USING (EXISTS (
    SELECT 1 FROM public.golf_rounds r
    WHERE r.id = golf_round_recap_provenance.round_id
));

-- No INSERT/UPDATE/DELETE policy for authenticated — only the service role
-- (round-recap.ts's admin client, which bypasses RLS) writes this table.
--
-- database.md: "Never GRANT ... TO anon or TO PUBLIC" — deliberately
-- narrower than several existing tables' baseline `GRANT ALL ... TO anon`
-- (a pre-existing Supabase-dump default this table does not inherit).
-- `authenticated` is included in this REVOKE too: Supabase's default ACL for
-- new tables in `public` grants authenticated full rights (arwdDxtm) at
-- CREATE TABLE time, before the GRANT SELECT below — omitting authenticated
-- here would leave INSERT/UPDATE/DELETE silently still granted underneath
-- the later, narrower-looking GRANT SELECT.
REVOKE ALL ON TABLE public.golf_round_recap_provenance FROM public,
anon,
authenticated;
GRANT SELECT ON TABLE public.golf_round_recap_provenance TO authenticated;
GRANT ALL ON TABLE public.golf_round_recap_provenance TO service_role;
