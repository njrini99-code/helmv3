-- Completed rounds are immutable score history. Their strokes-gained columns
-- are the one exception: they are derived cache values, computed only by the
-- server-side recalculation RPC after a round is submitted. Keep that narrow
-- path working without reopening a generic completed-round update route.

begin;

do $$
declare
  fn_definition text;
begin
  select pg_get_functiondef(p.oid) into fn_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'recalculate_round_strokes_gained';

  if fn_definition is null
    or position('UPDATE golf_rounds SET strokes_gained_total' in fn_definition) = 0 then
    raise exception 'recalculate_round_strokes_gained changed; refusing unsafe stats-cache patch';
  end if;

  fn_definition := regexp_replace(
    fn_definition,
    E'\nBEGIN\n',
    E'\nBEGIN\n  PERFORM set_config(''helm.golf_lifecycle_write'', ''stats_cache'', true);\n',
    1, 1, ''
  );
  execute fn_definition;
end;
$$;

create or replace function helm_private.guard_golf_round_lifecycle()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'postgres'
    and current_setting('helm.golf_lifecycle_write', true) = 'atomic' then
    return coalesce(new, old);
  end if;

  -- The service-only SG recalculation is allowed to refresh exactly its five
  -- derived columns. No scores, identity fields, status, timestamps, or raw
  -- shot data may change through this exception.
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

comment on function helm_private.guard_golf_round_lifecycle()
is
'Blocks direct completion, deletion, mutation, and qualifier retargeting
outside protected round RPCs; permits only service-derived strokes-gained
cache refreshes.';

commit;
