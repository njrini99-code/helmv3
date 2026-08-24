-- Allow a completed round to be RE-TYPED without letting its scores move.
--
-- STATUS: PREPARED, NOT APPLIED. This edits a security control
-- (`guard_golf_round_lifecycle`) and adds a SECURITY DEFINER function, which
-- is R3 under memory/system/golfhelm-engineering-os.md — owner executes, and
-- `db-migration-reviewer` review is mandatory first. It is written out here so
-- it can be reviewed and applied deliberately, not applied from a chat turn.
--
-- Why this exists
-- ---------------
-- `helm_private.guard_golf_round_lifecycle` is a BEFORE trigger on
-- `golf_rounds` that rejects every UPDATE to a completed round with
-- SQLSTATE 55000 / "Completed rounds are permanent history and cannot be
-- changed." That is correct for scores and wrong for classification.
--
-- Observed 2026-08-23: Charley Robinson (Guilford) played qualifier round 3
-- of "Kentucky Qualifier Rounds (1-3)" but recorded it as a Practice round.
-- Re-typing it to Qualifier is a metadata change — not one stroke of the 76
-- moves — yet the guard refused it, and the round editor rendered the raw
-- driver string "code=55000 msg=..." to the coach. That round was moved with
-- a direct database write on 2026-08-24; this migration is what removes the
-- need to do that again.
--
-- The guard already carries two narrow, marker-gated exceptions of exactly
-- this shape (`stats_cache`, `coachhelm_terminal`). This adds a third,
-- `reclassify`, on the same terms: the marker is transaction-local, only a
-- SECURITY DEFINER function running as postgres can set it, and the row diff
-- must be EMPTY outside the three classification columns. Score, hole data,
-- status, identity and timestamps stay immutable.
--
-- Required checks (from `npm run knowledge:map`):
--   npm run typecheck
--   npm run test:rls
--   supabase db lint --schema public

begin;

create or replace function helm_private.guard_golf_round_lifecycle()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if current_user = 'postgres'
    and current_setting('helm.golf_lifecycle_write', true) = 'atomic' then
    return coalesce(new, old);
  end if;

  -- The trusted strokes-gained recalculation may refresh only its derived
  -- cache columns. It cannot alter score, identity, status, timestamps, or
  -- raw shot data.
  if tg_op = 'UPDATE'
    and old.status = 'completed'
    and current_user in ('postgres', 'service_role')
    and current_setting('helm.golf_lifecycle_write', true) = 'stats_cache'
    and (to_jsonb(new) - array[
      'strokes_gained_total',
      'strokes_gained_tee',
      'strokes_gained_approach',
      'strokes_gained_around_green',
      'strokes_gained_putting'
    ]) = (to_jsonb(old) - array[
      'strokes_gained_total',
      'strokes_gained_tee',
      'strokes_gained_approach',
      'strokes_gained_around_green',
      'strokes_gained_putting'
    ]) then
    return new;
  end if;

  -- CoachHelm terminal state is operational bookkeeping. Only the
  -- service-only SECURITY DEFINER RPC can make this exact three-column
  -- update; completed score history remains immutable.
  if tg_op = 'UPDATE'
    and old.status = 'completed'
    and current_user = 'postgres'
    and current_setting('helm.golf_lifecycle_write', true) =
      'coachhelm_terminal'
    and (to_jsonb(new) - array[
      'coachhelm_analyzed_at',
      'coachhelm_failed_at',
      'coachhelm_failure_reason'
    ]) = (to_jsonb(old) - array[
      'coachhelm_analyzed_at',
      'coachhelm_failed_at',
      'coachhelm_failure_reason'
    ]) then
    return new;
  end if;

  -- NEW: reclassification. What a round COUNTS TOWARD is not score history.
  -- Same contract as the two branches above — postgres only, transaction-local
  -- marker, and every other column must be byte-identical.
  if tg_op = 'UPDATE'
    and old.status = 'completed'
    and current_user = 'postgres'
    and current_setting('helm.golf_lifecycle_write', true) = 'reclassify'
    and (to_jsonb(new) - array[
      'round_type',
      'qualifier_id',
      'qualifier_round_number'
    ]) = (to_jsonb(old) - array[
      'round_type',
      'qualifier_id',
      'qualifier_round_number'
    ]) then
    return new;
  end if;

  if tg_op = 'INSERT' and new.status = 'completed' then
    raise exception using
      errcode = '55000',
      message = 'Completed rounds must be submitted through the protected round-submit flow.';
  end if;

  if tg_op = 'DELETE' and old.status = 'completed' then
    raise exception using
      errcode = '55000',
      message = 'Completed rounds are permanent history and cannot be deleted.';
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'completed' then
      raise exception using
        errcode = '55000',
        message = 'Completed rounds are permanent history and cannot be changed.';
    end if;

    if new.status = 'completed' then
      raise exception using
        errcode = '55000',
        message = 'Completed rounds must be submitted through the protected round-submit flow.';
    end if;

    if new.player_id is distinct from old.player_id
      or new.team_id is distinct from old.team_id
      or new.round_type is distinct from old.round_type
      or new.qualifier_id is distinct from old.qualifier_id
      or new.qualifier_round_number is distinct from old.qualifier_round_number then
      raise exception using
        errcode = '55000',
        message = 'A started round keeps its original qualifier identity. Resume or discard it instead of changing it.';
    end if;
  end if;

  return coalesce(new, old);
end;
$function$;

-- The only caller permitted to set the `reclassify` marker.
--
-- SECURITY DEFINER means this bypasses RLS, so it does its OWN authorisation
-- rather than trusting the caller: the invoking user must either own the round
-- or be a coach of the round's team. Without that check, EXECUTE for
-- `authenticated` would let any signed-in user re-type any round in the
-- database.
create or replace function public.reclassify_golf_round(
  p_round_id uuid,
  p_round_type text,
  p_qualifier_id uuid,
  p_qualifier_round_number integer
)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_round      public.golf_rounds%rowtype;
  v_updated_id uuid;
  v_is_owner   boolean := false;
  v_is_coach   boolean := false;
begin
  if p_round_type not in ('practice', 'tournament', 'qualifier') then
    raise exception using
      errcode = '22023',
      message = 'Unsupported round type.';
  end if;

  select * into v_round from public.golf_rounds where id = p_round_id;
  if not found then
    return null;
  end if;

  select exists (
    select 1 from public.golf_players gp
    where gp.id = v_round.player_id and gp.user_id = auth.uid()
  ) into v_is_owner;

  select public.is_golf_team_coach(v_round.team_id) into v_is_coach;

  if not (v_is_owner or coalesce(v_is_coach, false)) then
    raise exception using
      errcode = '42501',
      message = 'You do not have permission to change this round.';
  end if;

  if p_round_type = 'qualifier' and p_qualifier_id is null then
    raise exception using
      errcode = '22023',
      message = 'A qualifier round must be attached to a qualifier.';
  end if;

  perform set_config('helm.golf_lifecycle_write', 'reclassify', true);

  update public.golf_rounds
     set round_type             = p_round_type,
         qualifier_id           = case when p_round_type = 'qualifier' then p_qualifier_id else null end,
         qualifier_round_number = case when p_round_type = 'qualifier' then p_qualifier_round_number else null end
   where id = p_round_id
  returning id into v_updated_id;

  return v_updated_id;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.reclassify_golf_round(uuid, text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reclassify_golf_round(uuid, text, uuid, integer) TO authenticated;

commit;
