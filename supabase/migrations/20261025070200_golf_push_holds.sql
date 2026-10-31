-- STATUS: WRITTEN — HOLD — NOT APPLIED. Awaits the owner (supabase/migrations/HELD.md).
-- Apply after 20261025070100. Apply: npm run db:apply -- <this file>
--
-- Clubhouse P-10 held pushes ("While you were in class"), shared with D-89
-- ("While you played", reason 'playing', routed to the 4.33 plan: it uses this
-- table and release job, not a table of its own). One row per push that would have
-- been sent during a class block. The release job (Vercel cron, plan section 8.8)
-- claims due users, sends one summary per user, and marks the outcome. With the
-- 2026-10-25 review fixes (Must 1, 2, 3; Should 2, 3, 4, 5, 10, 20; S-2, S-14).
--
--   golf_push_holds                    the table (players read their own; writes by service_role)
--   golf_push_hold_heartbeat           one row: when the release job last ran (Must 1)
--   golf_class_hold_dirty              teams whose class data changed (Should 5)
--   golf_push_holds_beat(source)       step 0 of every tick
--   golf_class_holds_live(at)          re-created: true only while the heartbeat is fresh (Should 14)
--   golf_push_hold_put(...)            decide-and-hold; returns {held, release_at | why, due_waiting}
--   golf_push_holds_cancel(id, user)   tombstone for a put that timed out (Should 4)
--   golf_push_holds_claim(...)         claim users with due rows, then all of their due rows
--   golf_push_holds_claim_failed(...)  the safety net's own claim (Should 3)
--   golf_push_holds_claim_user(...)    one user's open rows, by reason (Deliver now, inline release)
--   golf_push_holds_mark(...), _unclaim(...)   record outcomes, give rows back
--   golf_push_holds_reconcile(now, full)       move releases earlier, expire; dirty teams only
--   golf_push_holds_cleanup(keep)      delete released rows older than 14 days
--   golf_push_holds_release_mine()     player's Deliver now: due now
--   golf_class_hold_mark_dirty()       never-raising AFTER trigger on five tables
-- Also re-creates golf_my_class_day with its 'held' block (the 070100 body, in full,
-- with the last key filled in; migrations cannot reference each other's text).
--
-- A hold needs a live release job (Must 1): golf_push_hold_put answers
-- why = 'job_stale' and holds nothing when the heartbeat is more than 3 minutes
-- old or missing, which covers a stopped or missing cron and preview deployments
-- (Vercel crons do not run there). Rows held before a stop are not lost: they go
-- out when the job returns, on the player's next push (inline release), or on
-- Deliver now.
--
-- Tables locked while this runs: golf_player_classes, golf_event_attendance (CREATE
-- TRIGGER takes SHARE ROW EXCLUSIVE, which blocks writes for an instant; the
-- lock_timeout below gives up instead of queueing behind a long transaction).
-- golf_class_exceptions, golf_team_terms and golf_player_class_settings are new in
-- 070000 and get the same trigger. Everything else here is new.
--
-- Risk: LOW-MEDIUM. New tables and functions; no existing push path changes until
-- the app ships the gate behind the class_awareness_v1 flag.
-- pgTAP: supabase/tests/rls/golf_push_holds.sql
--
-- ROLLBACK: supabase/rollbacks/20261025070200_golf_push_holds.rollback.sql
-- ROLLBACK: order: drop the five triggers, the twelve functions, golf_my_class_day and golf_class_holds_live back to their 070100 bodies, then the three tables; before 070100.
-- VERIFY: select 1 where to_regclass('public.golf_push_holds') is not null and to_regclass('public.golf_push_hold_heartbeat') is not null and to_regclass('public.golf_class_hold_dirty') is not null and (select relrowsecurity from pg_class where oid = 'public.golf_push_holds'::regclass) and (select relrowsecurity from pg_class where oid = 'public.golf_push_hold_heartbeat'::regclass) and (select relrowsecurity from pg_class where oid = 'public.golf_class_hold_dirty'::regclass);
-- VERIFY: select 1 where not has_table_privilege('authenticated', 'public.golf_push_holds', 'truncate') and not has_table_privilege('authenticated', 'public.golf_push_hold_heartbeat', 'select') and not has_table_privilege('authenticated', 'public.golf_class_hold_dirty', 'select') and not has_table_privilege('anon', 'public.golf_push_holds', 'select') and has_table_privilege('authenticated', 'public.golf_push_holds', 'select') and not has_table_privilege('authenticated', 'public.golf_push_holds', 'insert');
-- VERIFY: select 1 where not has_function_privilege('authenticated', 'public.golf_push_hold_put(uuid, uuid, text, text, text, text, text, jsonb, uuid, uuid, timestamptz, text)', 'execute') and has_function_privilege('service_role', 'public.golf_push_hold_put(uuid, uuid, text, text, text, text, text, jsonb, uuid, uuid, timestamptz, text)', 'execute') and has_function_privilege('service_role', 'public.golf_push_holds_claim(uuid, integer, timestamptz, text)', 'execute') and has_function_privilege('service_role', 'public.golf_push_holds_claim_failed(uuid, integer, timestamptz)', 'execute') and has_function_privilege('service_role', 'public.golf_push_holds_claim_user(uuid, uuid, text, boolean)', 'execute') and has_function_privilege('service_role', 'public.golf_push_holds_cancel(uuid, uuid)', 'execute') and has_function_privilege('service_role', 'public.golf_push_holds_beat(text)', 'execute') and has_function_privilege('service_role', 'public.golf_push_holds_reconcile(timestamptz, boolean)', 'execute');
-- VERIFY: select 1 where has_function_privilege('authenticated', 'public.golf_push_holds_release_mine()', 'execute') and not has_function_privilege('anon', 'public.golf_push_holds_release_mine()', 'execute') and has_function_privilege('authenticated', 'public.golf_my_class_day(date)', 'execute') and (select count(*) from pg_trigger where tgname = 'golf_class_hold_mark_dirty' and not tgisinternal) = 5;

SET lock_timeout = '3s';

-- 1. Held pushes ------------------------------------------------------------

create table if not exists public.golf_push_holds (
    id                uuid primary key default gen_random_uuid(),
    user_id           uuid not null references auth.users(id) on delete cascade,
    reason            text not null,
    notification_type text not null,
    group_key         text not null,
    dedupe_key        text,
    title             text not null,
    body              text not null,
    data              jsonb not null default '{}'::jsonb,
    conversation_id   uuid references public.golf_conversations(id) on delete cascade,
    message_id        uuid references public.golf_messages(id) on delete cascade,
    expires_at        timestamptz,
    held_at           timestamptz not null default now(),
    release_at        timestamptz not null,
    claimed_at        timestamptz,
    claim_token       uuid,
    released_at       timestamptz,
    outcome           text,
    -- A retry counter capped at 3 by the claim functions, so smallint is plenty.
    -- squawk-ignore prefer-bigint-over-smallint
    attempts          smallint not null default 0
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'golf_push_holds_reason') then
    alter table public.golf_push_holds
      add constraint golf_push_holds_reason check (reason in ('class', 'playing'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'golf_push_holds_group') then
    alter table public.golf_push_holds
      add constraint golf_push_holds_group check (group_key in
        ('announcements', 'events', 'coach_dm', 'group', 'tasks', 'coachhelm', 'other'));
  end if;
  -- Must 2: with no pre-class window a class hold lasts at most 4 hours.
  if not exists (select 1 from pg_constraint where conname = 'golf_push_holds_window') then
    alter table public.golf_push_holds
      add constraint golf_push_holds_window check (
        release_at > held_at
        and release_at <= held_at + case reason
          when 'class' then interval '4 hours'
          else interval '10 hours' end
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'golf_push_holds_outcome') then
    alter table public.golf_push_holds
      add constraint golf_push_holds_outcome check (
        (released_at is null and outcome is null)
        or (released_at is not null and outcome in
            ('summarized', 'sent_alone', 'read_in_app', 'expired', 'failed', 'cancelled', 'no_device'))
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'golf_push_holds_text_len') then
    alter table public.golf_push_holds
      add constraint golf_push_holds_text_len
      check (char_length(title) <= 200 and char_length(body) <= 1000);
  end if;
end $$;

create unique index if not exists golf_push_holds_open_dedupe
  on public.golf_push_holds (user_id, dedupe_key)
  where released_at is null and dedupe_key is not null;
create index if not exists idx_golf_push_holds_due
  on public.golf_push_holds (release_at)
  where released_at is null;
create index if not exists idx_golf_push_holds_user_open
  on public.golf_push_holds (user_id, release_at)
  where released_at is null;
create index if not exists idx_golf_push_holds_released
  on public.golf_push_holds (released_at)
  where released_at is not null;
create index if not exists idx_golf_push_holds_message
  on public.golf_push_holds (message_id)
  where message_id is not null;
create index if not exists idx_golf_push_holds_conversation
  on public.golf_push_holds (conversation_id)
  where conversation_id is not null;

alter table public.golf_push_holds enable row level security;

drop policy if exists golf_push_holds_select_own on public.golf_push_holds;
create policy golf_push_holds_select_own on public.golf_push_holds
  for select to authenticated
  using (user_id = (select auth.uid()));
-- No insert, update or delete policies: only service_role writes.

revoke all on public.golf_push_holds from anon, authenticated;
grant select on public.golf_push_holds to authenticated;
grant all on public.golf_push_holds to service_role;

-- 2. Heartbeat: is the release job alive? (Must 1) ---------------------------

create table if not exists public.golf_push_hold_heartbeat (
    id       boolean primary key default true,
    beat_at  timestamptz not null default now(),
    source   text,
    constraint golf_push_hold_heartbeat_one_row check (id)
);

alter table public.golf_push_hold_heartbeat enable row level security;
-- No policies: only service_role reads and writes it.

revoke all on public.golf_push_hold_heartbeat from anon, authenticated;
grant all on public.golf_push_hold_heartbeat to service_role;

-- 3. Dirty teams: what reconcile re-checks (Should 5) ------------------------

create table if not exists public.golf_class_hold_dirty (
    team_id    uuid primary key references public.golf_teams(id) on delete cascade,
    marked_at  timestamptz not null default now()
);

alter table public.golf_class_hold_dirty enable row level security;
-- No policies: only the trigger below (definer) and service_role touch it.

revoke all on public.golf_class_hold_dirty from anon, authenticated;
grant all on public.golf_class_hold_dirty to service_role;

-- Marks the changed team dirty, and only while open class holds exist, so the
-- hot tables pay one indexed existence check per row otherwise. It never raises:
-- a bookkeeping trigger must not be able to break a class edit or an RSVP.
create or replace function public.golf_class_hold_mark_dirty()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row    record;
  v_json   jsonb;
  v_team   uuid;
  v_player uuid;
begin
  begin
    if not exists (
      select 1 from public.golf_push_holds h where h.released_at is null and h.reason = 'class'
    ) then
      return null;
    end if;

    if tg_op = 'DELETE' then v_row := old; else v_row := new; end if;
    v_json := to_jsonb(v_row);

    if tg_table_name in ('golf_class_exceptions', 'golf_team_terms') then
      v_team := (v_json ->> 'team_id')::uuid;
    else
      v_player := (v_json ->> 'player_id')::uuid;
      -- golf_player_classes.team_id is nullable: fall back to the player's class team.
      if tg_table_name = 'golf_player_classes' then
        v_team := (v_json ->> 'team_id')::uuid;
      end if;
      if v_team is null and v_player is not null then
        v_team := public.golf_class_player_team(v_player);
      end if;
    end if;

    if v_team is not null then
      insert into public.golf_class_hold_dirty as d (team_id, marked_at)
      values (v_team, now())
      on conflict (team_id) do update set marked_at = excluded.marked_at
        where d.marked_at < excluded.marked_at - interval '20 seconds';
    end if;
  exception when others then
    null;
  end;
  return null;
end $$;

revoke all on function public.golf_class_hold_mark_dirty() from public, anon, authenticated;

drop trigger if exists golf_class_hold_mark_dirty on public.golf_class_exceptions;
create trigger golf_class_hold_mark_dirty
  after insert or update or delete on public.golf_class_exceptions
  for each row execute function public.golf_class_hold_mark_dirty();

drop trigger if exists golf_class_hold_mark_dirty on public.golf_team_terms;
create trigger golf_class_hold_mark_dirty
  after insert or update or delete on public.golf_team_terms
  for each row execute function public.golf_class_hold_mark_dirty();

drop trigger if exists golf_class_hold_mark_dirty on public.golf_player_class_settings;
create trigger golf_class_hold_mark_dirty
  after insert or update or delete on public.golf_player_class_settings
  for each row execute function public.golf_class_hold_mark_dirty();

drop trigger if exists golf_class_hold_mark_dirty on public.golf_player_classes;
create trigger golf_class_hold_mark_dirty
  after insert or update or delete on public.golf_player_classes
  for each row execute function public.golf_class_hold_mark_dirty();

drop trigger if exists golf_class_hold_mark_dirty on public.golf_event_attendance;
create trigger golf_class_hold_mark_dirty
  after insert or update or delete on public.golf_event_attendance
  for each row execute function public.golf_class_hold_mark_dirty();

-- 4. Heartbeat write: step 0 of every tick -----------------------------------

create or replace function public.golf_push_holds_beat(p_source text default null)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_at timestamptz := now();
begin
  insert into public.golf_push_hold_heartbeat as hb (id, beat_at, source)
  values (true, v_at, left(p_source, 60))
  on conflict (id) do update set beat_at = excluded.beat_at, source = excluded.source;
  return v_at;
end $$;

-- Replaces the 070100 stub: holding is live only while the release job's heartbeat is fresh
-- (the same 3-minute rule golf_push_hold_put applies), so `holds` in the class payload, the
-- composer placeholder and Notify anyway promise a hold only when one will happen.
create or replace function public.golf_class_holds_live(p_at timestamptz default now())
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.golf_push_hold_heartbeat hb
    where hb.id and hb.beat_at >= p_at - interval '3 minutes'
  )
$$;

-- 5. Decide and hold ----------------------------------------------------------
-- Answers jsonb: { held: true, release_at, due_waiting } or
-- { held: false, why, due_waiting }. `why` is one of: reason, job_stale,
-- not_in_class, no_conversation, no_team, other_team, expires_first, cancelled.
-- due_waiting counts this user's open class rows already due: the gate releases
-- them first (inline release, Should 20) so a stopped job does not strand them.
-- Callers fail open on any error. The gate makes the hold id; on a timeout it
-- cancels by that id, and a put that commits late conflicts on the tombstone and
-- inserts nothing (Should 4).
create or replace function public.golf_push_hold_put(
    p_user_id uuid,
    p_hold_id uuid,
    p_notification_type text,
    p_group_key text,
    p_dedupe_key text,
    p_title text,
    p_body text,
    p_data jsonb,
    p_conversation_id uuid,
    p_message_id uuid,
    p_expires_at timestamptz,
    p_reason text default 'class'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_due       integer;
  v_beat      timestamptz;
  v_release   timestamptz;
  v_conv_team uuid;
  v_conv_seen boolean;
  v_player    uuid;
  v_n         integer;
  v_id        uuid := coalesce(p_hold_id, gen_random_uuid());
  v_outcome   text;
begin
  select count(*) into v_due
  from public.golf_push_holds h
  where h.user_id = p_user_id and h.reason = 'class'
    and h.released_at is null and h.release_at <= now();

  if p_reason is distinct from 'class' then
    -- D-89 adds its own decision for 'playing'.
    return jsonb_build_object('held', false, 'why', 'reason', 'due_waiting', v_due);
  end if;

  select hb.beat_at into v_beat from public.golf_push_hold_heartbeat hb where hb.id;
  if v_beat is null or v_beat < now() - interval '3 minutes' then
    return jsonb_build_object('held', false, 'why', 'job_stale', 'due_waiting', v_due);
  end if;

  v_release := public.golf_class_hold_until(p_user_id, now());
  if v_release is null then
    return jsonb_build_object('held', false, 'why', 'not_in_class', 'due_waiting', v_due);
  end if;

  if p_conversation_id is not null then
    select c.team_id, true into v_conv_team, v_conv_seen
    from public.golf_conversations c where c.id = p_conversation_id;
    if v_conv_seen is distinct from true then
      return jsonb_build_object('held', false, 'why', 'no_conversation', 'due_waiting', v_due);
    end if;
    if v_conv_team is null then
      return jsonb_build_object('held', false, 'why', 'no_team', 'due_waiting', v_due);
    end if;
    select gp.id into v_player from public.golf_players gp where gp.user_id = p_user_id limit 1;
    if public.golf_class_player_team(v_player) is distinct from v_conv_team then
      return jsonb_build_object('held', false, 'why', 'other_team', 'due_waiting', v_due);
    end if;
  end if;

  if p_expires_at is not null and p_expires_at <= v_release then
    return jsonb_build_object('held', false, 'why', 'expires_first', 'due_waiting', v_due);
  end if;

  insert into public.golf_push_holds (
    id, user_id, reason, notification_type, group_key, dedupe_key, title, body, data,
    conversation_id, message_id, expires_at, release_at)
  values (
    v_id, p_user_id, 'class', p_notification_type, p_group_key, p_dedupe_key,
    left(p_title, 200), left(p_body, 1000), coalesce(p_data, '{}'::jsonb),
    p_conversation_id, p_message_id, p_expires_at, v_release)
  on conflict do nothing;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    select h.outcome into v_outcome from public.golf_push_holds h where h.id = v_id;
    if v_outcome = 'cancelled' then
      return jsonb_build_object('held', false, 'why', 'cancelled', 'due_waiting', v_due);
    end if;
    -- Otherwise the open dedupe row for this key already holds the push: same hold.
  end if;
  return jsonb_build_object('held', true, 'release_at', v_release, 'due_waiting', v_due);
end $$;

-- Tombstone for a put that timed out. If the row already landed and nobody has
-- claimed it, it is cancelled so the caller's direct send is the only delivery;
-- if it has not landed, a cancelled row takes its id and the late put inserts
-- nothing. Returns true when this call tombstoned or cancelled the id.
create or replace function public.golf_push_holds_cancel(p_hold_id uuid, p_user_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  insert into public.golf_push_holds as h (
    id, user_id, reason, notification_type, group_key, title, body,
    held_at, release_at, released_at, outcome)
  values (
    p_hold_id, p_user_id, 'class', 'cancelled', 'other', '', '',
    now(), now() + interval '1 second', now(), 'cancelled')
  on conflict (id) do update
    set released_at = now(), outcome = 'cancelled'
    where h.released_at is null and h.claim_token is null and h.user_id = excluded.user_id;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

-- 6. Release job -------------------------------------------------------------

-- Picks users with due rows, then every due row of those users (Should 2), so one
-- user gets one summary. Reason-scoped: D-89 claims its own 'playing' rows.
create or replace function public.golf_push_holds_claim(
    p_token uuid,
    p_max_users integer default 200,
    p_now timestamptz default now(),
    p_reason text default 'class'
)
returns setof public.golf_push_holds
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  with due_users as (
    select h.user_id
    from public.golf_push_holds h
    where h.released_at is null
      and h.reason = p_reason
      and h.release_at <= p_now
      and h.attempts < 3
      and (h.claimed_at is null or h.claimed_at < p_now - interval '5 minutes')
    group by h.user_id
    order by min(h.release_at)
    limit greatest(1, least(p_max_users, 1000))
  ),
  picked as (
    select h.id
    from public.golf_push_holds h
    join due_users u on u.user_id = h.user_id
    where h.released_at is null
      and h.reason = p_reason
      and h.release_at <= p_now + interval '1 minute'
      and h.attempts < 3
      and (h.claimed_at is null or h.claimed_at < p_now - interval '5 minutes')
    order by h.user_id, h.release_at
    for update of h skip locked
  )
  update public.golf_push_holds h
     set claimed_at = p_now, claim_token = p_token, attempts = h.attempts + 1
    from picked
   where h.id = picked.id
  returning h.*;
$$;

-- The safety net's own claim (Should 3): rows that failed three claims, taken with
-- a fresh token under SKIP LOCKED. The app sends each one alone and marks it.
create or replace function public.golf_push_holds_claim_failed(
    p_token uuid,
    p_limit integer default 100,
    p_now timestamptz default now()
)
returns setof public.golf_push_holds
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  with picked as (
    select h.id
    from public.golf_push_holds h
    where h.released_at is null
      and h.attempts >= 3
      and (h.claimed_at is null or h.claimed_at < p_now - interval '5 minutes')
    order by h.release_at
    limit greatest(1, least(p_limit, 500))
    for update of h skip locked
  )
  update public.golf_push_holds h
     set claimed_at = p_now, claim_token = p_token
    from picked
   where h.id = picked.id
  returning h.*;
$$;

-- One user's open rows of one reason: Deliver now (all open rows, after
-- release_mine made them due), and the gate's inline release (due rows only).
create or replace function public.golf_push_holds_claim_user(
    p_user_id uuid,
    p_token uuid,
    p_reason text default 'class',
    p_due_only boolean default false
)
returns setof public.golf_push_holds
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  with picked as (
    select h.id from public.golf_push_holds h
    where h.user_id = p_user_id
      and h.reason = p_reason
      and h.released_at is null
      and (not p_due_only or h.release_at <= now())
      and (h.claimed_at is null or h.claimed_at < now() - interval '5 minutes')
    for update of h skip locked
  )
  update public.golf_push_holds h
     set claimed_at = now(), claim_token = p_token, attempts = h.attempts + 1
    from picked
   where h.id = picked.id
  returning h.*;
$$;

create or replace function public.golf_push_holds_mark(
    p_token uuid,
    p_ids uuid[],
    p_outcome text
)
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  if p_outcome not in ('summarized', 'sent_alone', 'read_in_app', 'expired', 'failed', 'cancelled', 'no_device') then
    raise exception 'unknown outcome %', p_outcome using errcode = '22023';
  end if;
  update public.golf_push_holds
     set released_at = now(), outcome = p_outcome
   where claim_token = p_token and id = any(p_ids) and released_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.golf_push_holds_unclaim(p_token uuid, p_ids uuid[])
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  update public.golf_push_holds
     set claimed_at = null, claim_token = null
   where claim_token = p_token and id = any(p_ids) and released_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Moves releases earlier when a class ends sooner, and expires rows past their
-- expiry. It re-checks only users on dirty teams (changed within the last 3
-- minutes: one tick plus a 2 minute overlap), and every user when p_full is true;
-- the job passes p_full every 15 minutes (Should 5). Never moves a release later.
create or replace function public.golf_push_holds_reconcile(
    p_now timestamptz default now(),
    p_full boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  r          record;
  v_until    timestamptz;
  v_n        integer;
  v_moved    integer := 0;
  v_expired  integer := 0;
  v_overdue  integer := 0;
  v_checked  integer := 0;
  v_teams    uuid[];
begin
  update public.golf_push_holds
     set released_at = p_now, outcome = 'expired'
   where released_at is null and expires_at is not null and expires_at <= p_now
     and (claimed_at is null or claimed_at < p_now - interval '5 minutes');
  get diagnostics v_expired = row_count;

  select coalesce(array_agg(d.team_id), '{}'::uuid[]) into v_teams
  from public.golf_class_hold_dirty d
  where d.marked_at >= p_now - interval '3 minutes';

  for r in
    select distinct h.user_id
    from public.golf_push_holds h
    where h.released_at is null and h.reason = 'class' and h.release_at > p_now
  loop
    if not p_full then
      continue when not (
        public.golf_class_player_team(
          (select gp.id from public.golf_players gp where gp.user_id = r.user_id limit 1)
        ) = any(v_teams));
    end if;
    v_checked := v_checked + 1;
    v_until := public.golf_class_hold_until(r.user_id, p_now);
    update public.golf_push_holds h
       set release_at = greatest(coalesce(v_until, p_now), h.held_at + interval '1 second')
     where h.user_id = r.user_id and h.reason = 'class' and h.released_at is null
       and h.release_at > coalesce(v_until, p_now);              -- earlier only, never later
    get diagnostics v_n = row_count;
    v_moved := v_moved + v_n;
  end loop;

  select count(*) into v_overdue from public.golf_push_holds
  where released_at is null and release_at < p_now - interval '10 minutes';

  return jsonb_build_object('moved', v_moved, 'expired', v_expired, 'overdue', v_overdue,
                            'checked', v_checked, 'full', p_full);
end $$;

create or replace function public.golf_push_holds_cleanup(p_keep interval default interval '14 days')
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  delete from public.golf_push_holds
  where released_at is not null and released_at < now() - greatest(p_keep, interval '1 day');
  get diagnostics v_n = row_count;
  delete from public.golf_class_hold_dirty where marked_at < now() - interval '1 day';
  return v_n;
end $$;

-- Deliver now (player): makes the caller's open class holds due immediately.
-- The server action then runs the release for this user at once (claim_user).
create or replace function public.golf_push_holds_release_mine()
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  update public.golf_push_holds h
     set release_at = greatest(now(), h.held_at + interval '1 second')
   where h.user_id = auth.uid() and h.reason = 'class' and h.released_at is null
     and h.release_at > now();
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.golf_push_holds_beat(text) from public, anon, authenticated;
revoke all on function public.golf_push_hold_put(uuid, uuid, text, text, text, text, text, jsonb, uuid, uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.golf_push_holds_cancel(uuid, uuid) from public, anon, authenticated;
revoke all on function public.golf_push_holds_claim(uuid, integer, timestamptz, text) from public, anon, authenticated;
revoke all on function public.golf_push_holds_claim_failed(uuid, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.golf_push_holds_claim_user(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.golf_push_holds_mark(uuid, uuid[], text) from public, anon, authenticated;
revoke all on function public.golf_push_holds_unclaim(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.golf_push_holds_reconcile(timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.golf_push_holds_cleanup(interval) from public, anon, authenticated;
revoke all on function public.golf_push_holds_release_mine() from public, anon;

grant execute on function public.golf_push_holds_beat(text) to service_role;
grant execute on function public.golf_push_hold_put(uuid, uuid, text, text, text, text, text, jsonb, uuid, uuid, timestamptz, text) to service_role;
grant execute on function public.golf_push_holds_cancel(uuid, uuid) to service_role;
grant execute on function public.golf_push_holds_claim(uuid, integer, timestamptz, text) to service_role;
grant execute on function public.golf_push_holds_claim_failed(uuid, integer, timestamptz) to service_role;
grant execute on function public.golf_push_holds_claim_user(uuid, uuid, text, boolean) to service_role;
grant execute on function public.golf_push_holds_mark(uuid, uuid[], text) to service_role;
grant execute on function public.golf_push_holds_unclaim(uuid, uuid[]) to service_role;
grant execute on function public.golf_push_holds_reconcile(timestamptz, boolean) to service_role;
grant execute on function public.golf_push_holds_cleanup(interval) to service_role;
grant execute on function public.golf_push_holds_release_mine() to authenticated, service_role;

-- 7. golf_my_class_day, re-created with the held count ------------------------
-- The 070100 body, in full. The only difference is the last key: 'held' counts the
-- caller's open class holds that would still arrive in a summary, leaving out
-- messages already read or deleted (Should 10), and the earliest release.

create or replace function public.golf_my_class_day(p_on date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_player  uuid := public.get_current_golf_player_id();
  v_team    uuid;
  v_team_tz text;
  v_now     public.golf_team_terms;
  v_zone    text;
  v_today   date;
  v_on      date;
  v_term    public.golf_team_terms;
  v_share   boolean;
  v_hold    boolean;
begin
  if v_player is null then
    return jsonb_build_object('player', null);
  end if;

  v_team := public.golf_class_player_team(v_player);
  if v_team is null then
    return jsonb_build_object('player', null);
  end if;

  select public.golf_safe_time_zone(s.timezone) into v_team_tz
  from public.golf_team_settings s where s.team_id = v_team limit 1;
  v_team_tz := coalesce(v_team_tz, 'America/New_York');

  v_now := public.golf_class_term_at(v_team, now());
  v_zone := coalesce(v_now.time_zone, v_team_tz);
  v_today := (now() at time zone v_zone)::date;
  v_on := coalesce(p_on, v_today);
  if v_on < v_today - 7 or v_on > v_today + 14 then
    raise exception 'date out of range' using errcode = '22023';
  end if;

  select * into v_term from public.golf_team_terms t
  where t.team_id = v_team and v_on between t.classes_start and t.exams_end
  order by t.classes_start desc limit 1;

  select coalesce(s.share_status, true), coalesce(s.hold_pushes, true)
  into v_share, v_hold
  from (select 1) one
  left join public.golf_player_class_settings s on s.player_id = v_player;

  return jsonb_build_object(
    'on', v_on,
    'team_id', v_team,
    'team_time_zone', v_team_tz,
    'class_time_zone', v_zone,
    'term', case when v_term.id is null then null else jsonb_build_object(
      'id', v_term.id, 'label', v_term.label,
      'classes_start', v_term.classes_start, 'classes_end', v_term.classes_end,
      'exams_end', v_term.exams_end, 'time_zone', v_term.time_zone,
      'phase', case when v_on <= v_term.classes_end then 'classes' else 'exams' end) end,
    'settings', jsonb_build_object('share_status', v_share, 'hold_pushes', v_hold),
    'player', (public.golf_class_day_players_internal(v_team, v_on, v_player, now())) -> 0,
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
          'class_id', bl.class_id, 'label', bl.label, 'kind', bl.kind,
          'source', bl.source, 'starts_at', bl.starts_at, 'ends_at', bl.ends_at)
        order by bl.starts_at)
      from public.golf_class_blocks_internal(v_team, v_on, v_player) bl), '[]'::jsonb),
    'untagged_classes', (
      select count(*) from public.golf_player_classes c
      where v_term.id is not null and c.player_id = v_player
        and nullif(btrim(c.semester), '') is null
        and not public.golf_class_in_term(c.semester, c.created_at, v_term)),
    'unusable_classes', coalesce((
      select jsonb_agg(u.item order by u.sort_name) from (
        -- Should 11: why a class that is switched on and in this term does not count.
        select jsonb_build_object('class_id', c.id, 'reason',
                 case when c.start_time is null or c.end_time is null
                           or c.end_time - c.start_time not between interval '10 minutes' and interval '4 hours'
                      then 'times' else 'days' end) as item,
               c.class_name as sort_name
        from public.golf_player_classes c
        where v_term.id is not null and c.player_id = v_player and c.status_enabled
          and public.golf_class_in_term(c.semester, c.created_at, v_term)
          and not public.golf_class_usable(c, v_term)
        union all
        -- Usable on paper, but the synced calendar rows never match its times.
        select jsonb_build_object('class_id', c.id, 'reason', 'calendar_mismatch'), c.class_name
        from public.golf_player_classes c
        where v_term.id is not null and c.player_id = v_player
          and public.golf_class_usable(c, v_term)
          and exists (
            select 1 from public.golf_events e
            where e.team_id = v_team and e.event_type = 'class'
              and e.start_time >= (v_term.classes_start::timestamp at time zone v_term.time_zone)
              and e.start_time <  ((v_term.classes_end + 1)::timestamp at time zone v_term.time_zone)
              and e.description ilike '%[class:' || c.id::text || ']%')
          and not exists (
            select 1 from public.golf_events e
            where e.team_id = v_team and e.event_type = 'class'
              and e.start_time >= (v_term.classes_start::timestamp at time zone v_term.time_zone)
              and e.start_time <  ((v_term.classes_end + 1)::timestamp at time zone v_term.time_zone)
              and e.description ilike '%[class:' || c.id::text || ']%'
              and coalesce(e.status, 'scheduled') <> 'cancelled' and e.cancelled_at is null
              and abs(extract(epoch from ((e.start_time at time zone v_term.time_zone)::time - c.start_time))) <= 60
              and abs(extract(epoch from ((coalesce(e.end_time, e.start_time) at time zone v_term.time_zone)::time - c.end_time))) <= 60)
      ) u), '[]'::jsonb),
    'held', (
      select jsonb_build_object('count', count(*), 'release_at', min(h.release_at))
      from public.golf_push_holds h
      left join public.golf_messages gm on gm.id = h.message_id
      left join public.golf_conversation_participants cp
        on cp.conversation_id = gm.conversation_id and cp.user_id = h.user_id
      where h.user_id = auth.uid() and h.reason = 'class' and h.released_at is null
        and (
          h.message_id is null
          or (gm.id is not null and coalesce(gm.is_deleted, false) = false
              and (cp.last_read_at is null or cp.last_read_at < gm.created_at))
        ))
  );
end $$;


revoke all on function public.golf_my_class_day(date) from public, anon;
grant execute on function public.golf_my_class_day(date) to authenticated, service_role;
