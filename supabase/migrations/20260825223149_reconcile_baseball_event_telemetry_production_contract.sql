-- Production recorded the rich-event-model migration after CREATE TABLE IF NOT
-- EXISTS skipped older live pitch/workload tables. The current CoachHelm and
-- Stat Visuals reads select the richer contract, so PostgREST rejected those
-- reads before returning any rows. Keep this strictly additive: preserve the
-- historical columns, add the fields current callers require, and only
-- backfill values whose meaning is unambiguous.

begin;

alter table public.baseball_pitch_events
  add column if not exists player_id uuid references public.baseball_players(id) on delete set null,
  add column if not exists batter_id uuid references public.baseball_players(id) on delete set null,
  add column if not exists pitch_type_classified text,
  add column if not exists is_called_strike boolean,
  add column if not exists count_state text;

-- The legacy pitch type and called-strike flag are exact predecessors of the
-- compatibility fields. `player_id` is the legacy pitcher-side identity and
-- can safely mirror `pitcher_id` locally; it has no proven batter-side
-- meaning, so it is deliberately NOT copied into batter_id.
update public.baseball_pitch_events
set pitch_type_classified = coalesce(pitch_type_classified, pitch_type)
where pitch_type_classified is null;

update public.baseball_pitch_events
set player_id = pitcher_id
where player_id is null and pitcher_id is not null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'baseball_pitch_events'
      and column_name = 'called_strike'
  ) then
    update public.baseball_pitch_events
    set is_called_strike = coalesce(is_called_strike, called_strike)
    where is_called_strike is null;
  end if;
end
$$;

alter table public.baseball_workload_events
  add column if not exists count integer,
  add column if not exists high_intent_count integer;

-- Legacy workload rows distinguish pitch and throw totals rather than a single
-- normalized count. Prefer pitch_count when both are present; high-intent has
-- no trustworthy legacy source and therefore remains NULL rather than made up.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'baseball_workload_events'
      and column_name = 'pitch_count'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'baseball_workload_events'
      and column_name = 'throw_count'
  ) then
    update public.baseball_workload_events
    set count = coalesce(count, pitch_count, throw_count)
    where count is null;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'baseball_workload_events'
      and column_name = 'pitch_count'
  ) then
    update public.baseball_workload_events
    set count = coalesce(count, pitch_count)
    where count is null;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'baseball_workload_events'
      and column_name = 'throw_count'
  ) then
    update public.baseball_workload_events
    set count = coalesce(count, throw_count)
    where count is null;
  end if;
end
$$;

comment on column public.baseball_pitch_events.batter_id is
  'Batter-side player identity for the rich event contract. Historical player_id is not backfilled because its role is ambiguous.';
comment on column public.baseball_pitch_events.player_id is
  'Legacy pitcher-side identity, retained for production-compatible administrative reads.';
comment on column public.baseball_workload_events.count is
  'Normalized workload count. Backfilled from legacy pitch_count, then throw_count when available.';
comment on column public.baseball_workload_events.high_intent_count is
  'High-intent workload count. NULL for legacy rows without a trustworthy source.';

commit;
