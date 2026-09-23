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
-- the winner's text is ever persisted. Signature, return shape, SECURITY
-- DEFINER, and the REVOKE/GRANT pattern are unchanged — no code depends on
-- this migration; it is safe to merge before or after the owner applies it.
--
-- A (provenance): a new table, not new golf_rounds columns — this keeps the
-- addition off golf_rounds' RLS/trigger-guarded surface entirely.
-- round-recap.ts writes it best-effort through the admin (service_role)
-- client after a successful save_round_ai_recap call; a write failure
-- (including this migration not yet being applied) is logged and swallowed,
-- never blocking or throwing the recap itself.

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

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION helm_private.save_round_ai_recap(
    uuid, text, uuid
) FROM public;

-- public.save_round_ai_recap(uuid, text) — the SECURITY INVOKER wrapper that
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

ALTER TABLE public.golf_round_recap_provenance ENABLE ROW LEVEL SECURITY;

-- Read access mirrors golf_rounds (golf.sql's golf_rounds_select /
-- admin_read_all): the player who owns the round, a coach of a team they
-- play for, or an admin. player_id is denormalized onto this row (the same
-- pattern golf_round_stats_cache uses) so these policies don't need to join
-- back through golf_rounds.
CREATE POLICY "Players can view own recap provenance"
ON public.golf_round_recap_provenance FOR SELECT TO authenticated
USING (player_id IN (
    SELECT golf_players.id FROM public.golf_players
    WHERE golf_players.user_id = (SELECT auth.uid())
));

CREATE POLICY "Coaches can view team recap provenance"
ON public.golf_round_recap_provenance FOR SELECT TO authenticated
USING (player_id IN (
    SELECT gtm.player_id FROM public.golf_team_members gtm
    WHERE
        gtm.status = 'active'::public.team_member_status
        AND public.is_golf_team_coach(gtm.team_id)
));

CREATE POLICY "admin_read_all_recap_provenance"
ON public.golf_round_recap_provenance FOR SELECT TO authenticated
USING (public.is_admin());

-- No INSERT/UPDATE/DELETE policy for authenticated — only the service role
-- (round-recap.ts's admin client, which bypasses RLS) writes this table.
--
-- database.md: "Never GRANT ... TO anon or TO PUBLIC" — deliberately
-- narrower than several existing tables' baseline `GRANT ALL ... TO anon`
-- (a pre-existing Supabase-dump default this table does not inherit).
REVOKE ALL ON TABLE public.golf_round_recap_provenance FROM public, anon;
GRANT SELECT ON TABLE public.golf_round_recap_provenance TO authenticated;
GRANT ALL ON TABLE public.golf_round_recap_provenance TO service_role;
