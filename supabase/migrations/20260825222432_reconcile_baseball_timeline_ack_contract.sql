-- Reconcile the two live shapes of baseball_timeline_event_acks.
--
-- Production predates the timeline-ack migration and requires team_id,
-- player_id, acked_by, and acked_at. A fresh local replay created the intended
-- user_id / acknowledged_at shape instead. The server action was written for
-- the latter, so an acknowledgement in production could fail before persisting.
--
-- Keep both identifier/timestamp aliases during the compatibility window. The
-- action writes both, they are backfilled from their counterpart here, and the
-- canonical RLS policy binds the two actor columns to auth.uid(). No history is
-- deleted and the migration fails rather than weakening constraints if an
-- existing row cannot be reconciled.

begin;

alter table public.baseball_timeline_event_acks
  add column if not exists team_id uuid,
  add column if not exists player_id uuid,
  add column if not exists acked_by uuid,
  add column if not exists acked_at timestamptz,
  add column if not exists user_id uuid,
  add column if not exists acknowledged_at timestamptz;

alter table public.baseball_timeline_event_acks
  alter column acked_at set default now(),
  alter column acknowledged_at set default now();

update public.baseball_timeline_event_acks a
set
  team_id = coalesce(a.team_id, e.team_id),
  player_id = coalesce(a.player_id, e.player_id),
  acked_by = coalesce(a.acked_by, a.user_id),
  user_id = coalesce(a.user_id, a.acked_by),
  acked_at = coalesce(a.acked_at, a.acknowledged_at),
  acknowledged_at = coalesce(a.acknowledged_at, a.acked_at)
from public.baseball_player_timeline_events e
where e.id = a.timeline_event_id
  and (
    a.team_id is null
    or a.player_id is null
    or a.acked_by is null
    or a.user_id is null
    or a.acked_at is null
    or a.acknowledged_at is null
  );

do $$
begin
  if exists (
    select 1
    from public.baseball_timeline_event_acks
    where team_id is null
       or player_id is null
       or acked_by is null
       or user_id is null
       or acked_at is null
       or acknowledged_at is null
  ) then
    raise exception using
      message = 'Cannot reconcile baseball_timeline_event_acks: one or more rows lack a required compatibility value',
      hint = 'Repair the orphaned acknowledgement rows before rerunning this migration.';
  end if;
end
$$;

alter table public.baseball_timeline_event_acks
  alter column team_id set not null,
  alter column player_id set not null,
  alter column acked_by set not null,
  alter column user_id set not null,
  alter column acked_at set not null,
  alter column acknowledged_at set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'baseball_timeline_event_acks_team_id_fkey') then
    alter table public.baseball_timeline_event_acks
      add constraint baseball_timeline_event_acks_team_id_fkey
      foreign key (team_id) references public.baseball_teams(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'baseball_timeline_event_acks_player_id_fkey') then
    alter table public.baseball_timeline_event_acks
      add constraint baseball_timeline_event_acks_player_id_fkey
      foreign key (player_id) references public.baseball_players(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'baseball_timeline_event_acks_acked_by_fkey') then
    alter table public.baseball_timeline_event_acks
      add constraint baseball_timeline_event_acks_acked_by_fkey
      foreign key (acked_by) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'baseball_timeline_event_acks_user_id_fkey') then
    alter table public.baseball_timeline_event_acks
      add constraint baseball_timeline_event_acks_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'baseball_timeline_event_acks_timeline_event_id_acked_by_key') then
    alter table public.baseball_timeline_event_acks
      add constraint baseball_timeline_event_acks_timeline_event_id_acked_by_key
      unique (timeline_event_id, acked_by);
  end if;
end
$$;

create index if not exists idx_baseball_timeline_acks_user_event
  on public.baseball_timeline_event_acks (user_id, timeline_event_id);

alter table public.baseball_timeline_event_acks enable row level security;

drop policy if exists baseball_timeline_acks_select on public.baseball_timeline_event_acks;
drop policy if exists baseball_timeline_acks_insert on public.baseball_timeline_event_acks;
drop policy if exists baseball_timeline_acks_update on public.baseball_timeline_event_acks;
drop policy if exists baseball_timeline_acks_delete on public.baseball_timeline_event_acks;

create policy baseball_timeline_acks_select
  on public.baseball_timeline_event_acks for select to authenticated
  using (
    (
      user_id = (select auth.uid())
      and acked_by = (select auth.uid())
    )
    or exists (
      select 1
      from public.baseball_player_timeline_events e
      where e.id = baseball_timeline_event_acks.timeline_event_id
        and public.is_baseball_team_coach_v2(e.team_id)
    )
  );

create policy baseball_timeline_acks_insert
  on public.baseball_timeline_event_acks for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and acked_by = (select auth.uid())
    and exists (
      select 1
      from public.baseball_player_timeline_events e
      where e.id = baseball_timeline_event_acks.timeline_event_id
        and e.team_id = baseball_timeline_event_acks.team_id
        and e.player_id = baseball_timeline_event_acks.player_id
        and (
          public.is_baseball_team_coach_v2(e.team_id)
          or (
            e.visibility <> 'staff_only'
            and e.player_id = (
              select p.id
              from public.baseball_players p
              where p.user_id = (select auth.uid())
              limit 1
            )
          )
        )
    )
  );

create policy baseball_timeline_acks_update
  on public.baseball_timeline_event_acks for update to authenticated
  using (user_id = (select auth.uid()) and acked_by = (select auth.uid()))
  with check (user_id = (select auth.uid()) and acked_by = (select auth.uid()));

create policy baseball_timeline_acks_delete
  on public.baseball_timeline_event_acks for delete to authenticated
  using (user_id = (select auth.uid()) and acked_by = (select auth.uid()));

revoke all on public.baseball_timeline_event_acks from anon;

comment on table public.baseball_timeline_event_acks is
  'Per-user acknowledgement of a player timeline event. The legacy acked_* and canonical acknowledged_* columns are synchronized by the server action during the compatibility window.';

commit;
