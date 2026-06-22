-- P2-22: transactional external-round ingest.
--
-- The Arccos adapter previously inserted a round, then its holes, then its shots
-- as THREE separate client round-trips. A failure on the holes/shots step left
-- the already-inserted round row orphaned (a "completed" partial round with no
-- holes/shots). Later syncs dedup on golf_rounds.notes = 'arccos:<id>', so they
-- SKIP that orphan forever — and CoachHelm then analyzes an incomplete round.
--
-- This RPC inserts the round + holes + shots inside ONE function body, which
-- Postgres runs as a single transaction. If ANY insert raises, the whole unit
-- (including the round) rolls back — so a partial round can never be persisted.
-- The function resolves shot.hole_id from the freshly-inserted holes by
-- hole_number, mirroring the client-side hole-id map it replaces.
--
-- service_role ONLY: the cron writes via the admin (service-role) client; this
-- function never runs in a user session, so it does not call auth.uid() and is
-- not granted to anon/authenticated.

create or replace function public.ingest_external_round_atomic(
  p_round jsonb,
  p_holes jsonb,
  p_shots jsonb
) returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
  set statement_timeout to '30s'
  set lock_timeout to '15s'
as $$
declare
  v_round_id      uuid;
  v_hole          jsonb;
  v_shot          jsonb;
  v_hole_id       uuid;
  v_hole_number   int;
  v_hole_id_map   jsonb := '{}'::jsonb;  -- { "<hole_number>": "<hole_id>" }
  v_shots_inserted int := 0;
  v_holes_inserted int := 0;
begin
  if p_round is null or jsonb_typeof(p_round) <> 'object' then
    raise exception 'ingest_external_round_atomic: p_round must be a json object';
  end if;

  -- ---- Round (single row) -------------------------------------------------
  insert into golf_rounds (
    player_id, round_date, course_name, course_city, course_state,
    tees_played, total_score, total_putts, total_fairways, total_fairways_hit,
    total_gir, total_gir_possible, total_penalties, holes_played,
    weather_conditions, round_type, status, notes
  ) values (
    (p_round->>'player_id')::uuid,
    (p_round->>'round_date')::date,
    p_round->>'course_name',
    p_round->>'course_city',
    p_round->>'course_state',
    p_round->>'tees_played',
    nullif(p_round->>'total_score','')::int,
    nullif(p_round->>'total_putts','')::int,
    nullif(p_round->>'total_fairways','')::int,
    nullif(p_round->>'total_fairways_hit','')::int,
    nullif(p_round->>'total_gir','')::int,
    nullif(p_round->>'total_gir_possible','')::int,
    nullif(p_round->>'total_penalties','')::int,
    nullif(p_round->>'holes_played','')::int,
    p_round->>'weather_conditions',
    coalesce(p_round->>'round_type', 'practice'),
    coalesce(p_round->>'status', 'completed'),
    p_round->>'notes'
  )
  returning id into v_round_id;

  -- ---- Holes (capture hole_number -> hole_id) -----------------------------
  if p_holes is not null and jsonb_typeof(p_holes) = 'array' then
    for v_hole in select * from jsonb_array_elements(p_holes) loop
      insert into golf_holes (
        round_id, hole_number, par, yardage, score, putts, fairway_hit, gir
      ) values (
        v_round_id,
        (v_hole->>'hole_number')::int,
        nullif(v_hole->>'par','')::int,
        nullif(v_hole->>'yardage','')::int,
        nullif(v_hole->>'score','')::int,
        nullif(v_hole->>'putts','')::int,
        nullif(v_hole->>'fairway_hit','')::boolean,
        nullif(v_hole->>'gir','')::boolean
      )
      returning id, hole_number into v_hole_id, v_hole_number;
      v_hole_id_map := v_hole_id_map || jsonb_build_object(v_hole_number::text, v_hole_id);
      v_holes_inserted := v_holes_inserted + 1;
    end loop;
  end if;

  -- ---- Shots (resolve hole_id by hole_number) -----------------------------
  if p_shots is not null and jsonb_typeof(p_shots) = 'array' then
    for v_shot in select * from jsonb_array_elements(p_shots) loop
      v_hole_id := nullif(v_hole_id_map->>(v_shot->>'hole_number'), '')::uuid;
      insert into golf_shots (
        round_id, hole_id, hole_number, shot_number, club_type, shot_type,
        lie_before, result, shot_distance, distance_to_hole_before,
        distance_to_hole_after, is_penalty, penalty_type
      ) values (
        v_round_id,
        v_hole_id,
        (v_shot->>'hole_number')::int,
        nullif(v_shot->>'shot_number','')::int,
        v_shot->>'club_type',
        v_shot->>'shot_type',
        v_shot->>'lie_before',
        v_shot->>'result',
        nullif(v_shot->>'shot_distance','')::numeric,
        nullif(v_shot->>'distance_to_hole_before','')::numeric,
        nullif(v_shot->>'distance_to_hole_after','')::numeric,
        coalesce(nullif(v_shot->>'is_penalty','')::boolean, false),
        v_shot->>'penalty_type'
      );
      v_shots_inserted := v_shots_inserted + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'success', true,
    'round_id', v_round_id,
    'holes_inserted', v_holes_inserted,
    'shots_inserted', v_shots_inserted
  );
end;
$$;

-- service_role only — the ingest cron is the sole caller (admin client).
revoke all on function public.ingest_external_round_atomic(jsonb, jsonb, jsonb) from public;
revoke all on function public.ingest_external_round_atomic(jsonb, jsonb, jsonb) from anon;
revoke all on function public.ingest_external_round_atomic(jsonb, jsonb, jsonb) from authenticated;
grant execute on function public.ingest_external_round_atomic(jsonb, jsonb, jsonb) to service_role;
