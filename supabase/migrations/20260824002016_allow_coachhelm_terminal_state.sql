-- A completed scorecard is immutable history, but CoachHelm's terminal
-- processing markers are operational metadata, not scoring data.  The
-- lifecycle guard therefore permits only this server-only RPC to update its
-- three terminal-state columns.  Every other completed-round mutation stays
-- rejected by helm_private.guard_golf_round_lifecycle.

begin;

create or replace function public.record_round_coachhelm_terminal_state(
    p_round_id uuid,
    p_analyzed_at timestamptz,
    p_failed_at timestamptz,
    p_failure_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  updated_round_id uuid;
begin
  -- The marker is transaction-local and is accepted by the lifecycle trigger
  -- only when this privileged function is executing as postgres.
  perform set_config('helm.golf_lifecycle_write', 'coachhelm_terminal', true);

  update public.golf_rounds
  set
    coachhelm_analyzed_at = p_analyzed_at,
    coachhelm_failed_at = p_failed_at,
    coachhelm_failure_reason = p_failure_reason
  where id = p_round_id
    and status = 'completed'
  returning id into updated_round_id;

  return updated_round_id;
end;
$$;

revoke all on function public.record_round_coachhelm_terminal_state(
    uuid, timestamptz, timestamptz, text
)
from public, anon, authenticated;
grant execute on function public.record_round_coachhelm_terminal_state(
    uuid, timestamptz, timestamptz, text
)
to service_role;

create or replace function helm_private.guard_golf_round_lifecycle()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
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
  -- service-only privileged RPC above can make this exact three-column
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
$$;

revoke all on function helm_private.guard_golf_round_lifecycle()
from public, anon, authenticated;

comment on function public.record_round_coachhelm_terminal_state(
    uuid, timestamptz, timestamptz, text
)
is
'Service-only terminal metadata writer for completed-round CoachHelm
processing.';

comment on function helm_private.guard_golf_round_lifecycle()
is
'Blocks direct completed-round mutation except protected atomic submission,
trusted derived strokes-gained refresh, and service-only CoachHelm terminal metadata.';

commit;
