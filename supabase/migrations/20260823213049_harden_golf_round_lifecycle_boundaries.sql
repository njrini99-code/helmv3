-- A client must never be able to turn a saved scorecard into an unrecoverable
-- state. The round actions and atomic RPCs remain the normal write path; these
-- triggers are an independent boundary for direct PostgREST writes, stale app
-- versions, and a second browser tab.
--
-- This deliberately follows the two preceding lifecycle migrations:
--   20260819200000 preserves a player's history on account deletion.
--   20260823000000 makes qualifier round identity durable and unique.
-- Do not bypass either migration in production; the existing duplicate active
-- qualifier slot must be resolved deliberately before the unique index applies.

begin;

create schema if not exists helm_private;
revoke all on schema helm_private from public, anon, authenticated;

-- SECURITY DEFINER alone is not a trustworthy lifecycle bypass: both atomic
-- RPCs use it. Mark only their own transaction while they execute, and make
-- their function bodies preserve the qualifier identity they were given.
do $$
declare
  fn_definition text;
  partial_round_type text := 'round_type = COALESCE(p_round_data->>''round_type'', round_type)';
begin
  select pg_get_functiondef(p.oid) into fn_definition
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'save_partial_round_atomic';
  if fn_definition is null or position(partial_round_type in fn_definition) = 0 then
    raise exception 'save_partial_round_atomic changed; refusing unsafe lifecycle patch';
  end if;
  fn_definition := regexp_replace(
    fn_definition,
    E'\nBEGIN\n',
    E'\nBEGIN\n  PERFORM set_config(''helm.golf_lifecycle_write'', ''atomic'', true);\n',
    1, 1, ''
  );
  fn_definition := replace(
    fn_definition,
    partial_round_type,
    'round_type = case when qualifier_id is not null then ''qualifier'' else coalesce(p_round_data->>''round_type'', round_type) end'
  );
  execute fn_definition;

  select pg_get_functiondef(p.oid) into fn_definition
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'submit_round_atomic';
  if fn_definition is null then
    raise exception 'submit_round_atomic not found';
  end if;
  fn_definition := regexp_replace(
    fn_definition,
    E'\nBEGIN\n',
    E'\nBEGIN\n  PERFORM set_config(''helm.golf_lifecycle_write'', ''atomic'', true);\n',
    1, 1, ''
  );
  execute fn_definition;
end;
$$;

create or replace function helm_private.reject_completed_round_child_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  target_round_id uuid;
begin
  -- submit_round_atomic is SECURITY DEFINER and executes as postgres. It is
  -- the sole terminal writer and remains able to atomically replace its child
  -- graph. Every ordinary browser/API role is blocked after completion.
  if current_user = 'postgres'
    and current_setting('helm.golf_lifecycle_write', true) = 'atomic' then
    return coalesce(new, old);
  end if;

  target_round_id := case when tg_op = 'INSERT' then new.round_id else old.round_id end;
  if exists (
    select 1 from public.golf_rounds
    where status = 'completed'
      and id in (target_round_id, case when tg_op = 'UPDATE' then new.round_id else null end)
  ) then
    raise exception using
      errcode = '55000',
      message = 'This round is already completed and its saved shots cannot be changed.';
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function
helm_private.reject_completed_round_child_mutation()
from public, anon, authenticated;

drop trigger if exists golf_holes_reject_completed_round_mutation
on public.golf_holes;
create trigger golf_holes_reject_completed_round_mutation
before insert or update or delete on public.golf_holes
for each row
execute function helm_private.reject_completed_round_child_mutation();

drop trigger if exists golf_shots_reject_completed_round_mutation
on public.golf_shots;
create trigger golf_shots_reject_completed_round_mutation
before insert or update or delete on public.golf_shots
for each row
execute function helm_private.reject_completed_round_child_mutation();

create or replace function helm_private.reject_completed_round_detail_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  old_shot_id uuid;
  new_shot_id uuid;
begin
  if current_user = 'postgres'
    and current_setting('helm.golf_lifecycle_write', true) = 'atomic' then
    return coalesce(new, old);
  end if;
  old_shot_id := case when tg_op = 'INSERT' then null else old.shot_id end;
  new_shot_id := case when tg_op = 'DELETE' then null else new.shot_id end;
  if exists (
    select 1
    from public.golf_shots s
    join public.golf_rounds r on r.id = s.round_id
    where r.status = 'completed' and s.id in (old_shot_id, new_shot_id)
  ) then
    raise exception using
      errcode = '55000',
      message = 'This round is already completed and its saved shot details cannot be changed.';
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function
helm_private.reject_completed_round_detail_mutation()
from public, anon, authenticated;

drop trigger if exists putt_details_reject_completed_round_mutation
on public.putt_details;
create trigger putt_details_reject_completed_round_mutation
before insert or update or delete on public.putt_details
for each row
execute function helm_private.reject_completed_round_detail_mutation();

drop trigger if exists approach_miss_details_reject_completed_round_mutation
on public.approach_miss_details;
create trigger approach_miss_details_reject_completed_round_mutation
before insert or update or delete on public.approach_miss_details
for each row
execute function helm_private.reject_completed_round_detail_mutation();

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

drop trigger if exists golf_rounds_guard_lifecycle on public.golf_rounds;
create trigger golf_rounds_guard_lifecycle
before insert or update or delete on public.golf_rounds
for each row execute function helm_private.guard_golf_round_lifecycle();

create or replace function helm_private.prevent_active_round_stranding()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'golf_qualifier_entries' and exists (
    select 1 from public.golf_rounds
    where player_id = old.player_id
      and qualifier_id = old.qualifier_id
      and status = 'in_progress'
  ) then
    raise exception using
      errcode = '55000',
      message = 'This player has a saved qualifier round. Have them finish or explicitly discard it before removing their qualifier entry.';
  end if;

  if tg_table_name = 'golf_qualifiers' and exists (
    select 1 from public.golf_rounds
    where qualifier_id = old.id and status = 'in_progress'
  ) then
    raise exception using
      errcode = '55000',
      message = 'This qualifier has saved in-progress rounds. Close it only after players finish or explicitly discard those rounds.';
  end if;

  if tg_table_name = 'golf_team_members' and exists (
    select 1 from public.golf_rounds
    where team_id = old.team_id
      and player_id = old.player_id
      and status = 'in_progress'
  ) then
    raise exception using
      errcode = '55000',
      message = 'This player has a saved in-progress round. Have them finish or explicitly discard it before removing them from the team.';
  end if;

  if tg_table_name = 'golf_teams' and exists (
    select 1 from public.golf_rounds
    where team_id = old.id and status = 'in_progress'
  ) then
    raise exception using
      errcode = '55000',
      message = 'This team has saved in-progress rounds. Finish or explicitly discard them before deleting the team.';
  end if;

  return old;
end;
$$;

revoke all on function helm_private.prevent_active_round_stranding()
from public, anon, authenticated;

drop trigger if exists golf_qualifier_entries_prevent_active_round_stranding
on public.golf_qualifier_entries;
create trigger golf_qualifier_entries_prevent_active_round_stranding
before delete on public.golf_qualifier_entries
for each row
execute function helm_private.prevent_active_round_stranding();

drop trigger if exists golf_qualifiers_prevent_active_round_stranding
on public.golf_qualifiers;
create trigger golf_qualifiers_prevent_active_round_stranding
before delete on public.golf_qualifiers
for each row
execute function helm_private.prevent_active_round_stranding();

drop trigger if exists golf_team_members_prevent_active_round_stranding
on public.golf_team_members;
create trigger golf_team_members_prevent_active_round_stranding
before delete on public.golf_team_members
for each row
execute function helm_private.prevent_active_round_stranding();

create or replace function
helm_private.prevent_active_team_member_deactivation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status = 'active' and new.status is distinct from 'active' and exists (
    select 1 from public.golf_rounds
    where team_id = old.team_id
      and player_id = old.player_id
      and status = 'in_progress'
  ) then
    raise exception using
      errcode = '55000',
      message = 'This player has a saved in-progress round. Have them finish or explicitly discard it before removing them from the team.';
  end if;
  return new;
end;
$$;

revoke all on function
helm_private.prevent_active_team_member_deactivation()
from public, anon, authenticated;

drop trigger if exists golf_team_members_prevent_active_round_deactivation
on public.golf_team_members;
create trigger golf_team_members_prevent_active_round_deactivation
before update of status on public.golf_team_members
for each row
execute function helm_private.prevent_active_team_member_deactivation();

drop trigger if exists golf_teams_prevent_active_round_stranding
on public.golf_teams;
create trigger golf_teams_prevent_active_round_stranding
before delete on public.golf_teams
for each row
execute function helm_private.prevent_active_round_stranding();

comment on function helm_private.guard_golf_round_lifecycle()
is
'Blocks direct completion, deletion, mutation, and qualifier retargeting
outside the protected round RPCs.';
comment on function helm_private.prevent_active_round_stranding()
is
'Prevents destructive team or qualifier changes that would strand an
in-progress player round.';

commit;
