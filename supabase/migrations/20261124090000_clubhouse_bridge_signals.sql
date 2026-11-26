-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- Written 24 Nov 2026 for the Clubhouse Bridge, plan PR 1 (branch
--   bridge/pr1-spine, docs/superpowers/specs/helm-bridge/
--   2026-11-18-clubhouse-bridge-redesign.md section 4.5). Not applied
--   anywhere, not run against any shared database. Applied only on the
--   owner's own yes for this file. Revised 25 Nov 2026 after the
--   db-migration review (see the HELD.md row).
--
-- Apply: npm run db:apply --
--   supabase/migrations/20261124090000_clubhouse_bridge_signals.sql
--   after npm run test:rls passes on a local stack (pgTAP:
--   supabase/tests/rls/clubhouse_bridge_signals.sql).
--   Apply OUTSIDE 04:10-04:30 UTC: purge-admin-event-telemetry runs at
--   04:10 and deletes from admin_events, and this file's own prune
--   (clubhouse-signals-prune) is scheduled for 04:25.
--
-- Risk: LOW to MEDIUM. Additive only: nine nullable columns and three
--   partial indexes on admin_events, five new tables, four functions
--   (ingest, histogram quantile, retention, forget-a-user) and a daily
--   pg_cron job. Nothing existing is rewritten or dropped.
--   Locks: the whole file runs in db:apply's one transaction under
--   set local lock_timeout = '3s'. The new tables' foreign keys take SHARE
--   ROW EXCLUSIVE on public.users and public.golf_teams until commit (their
--   writes wait, reads do not). admin_events is altered LAST: the ALTER
--   takes ACCESS EXCLUSIVE and holds it to commit, and each of the three
--   partial indexes still scans the whole of admin_events while it is held
--   (the rows are all NULL in the new columns, but the build reads them),
--   so admin_events reads and writes wait for those three scans.
--   The app writes here only while the flag clubhouse_signals is on
--   (default off everywhere).
--
-- What:
--   admin_events: ch_code, bridge_id, page_id, action_id, control_id,
--     release, platform, session_id, server_code. A Clubhouse failure keeps
--     its code and Bridge ID in columns, so incidents and the digest can
--     read them without opening metadata. Indexed: ch_code, bridge_id,
--     session_id only.
--   clubhouse_signal_hourly: one row per hour x code x kind x outcome x
--     action x page x role x platform x release, with the count, the users who
--     sent it and a duration histogram (p50, p95 and p99 are read from it).
--     Kept 180 days. user_ids has no foreign key: the account-delete path
--     (src/app/api/account/delete) must call
--     public.clubhouse_forget_user(p_user uuid) to scrub a deleted user.
--   clubhouse_sessions: one row per Clubhouse session. User id only, never
--     a name or email (plan D7). The first verified user owns a session; a
--     batch from another user for the same session id changes nothing.
--     team_id is kept only when that user coaches the team or is an active
--     player on it. Kept 30 days.
--   clubhouse_session_events: the envelopes of a session that had a
--     failure, with the 50 before it. Kept 14 days.
--   clubhouse_drift: drift kind x code x release (plan 4.3). 180 days.
--   bridge_notes: the owner's own notes on a code. Kept.
--
-- Access: anon and authenticated hold nothing but SELECT for a super admin
--   (public.is_super_admin(), the Bridge's gate). Every write is the
--   service role's, from POST /api/ch/signal and the Bridge's server code.
--   The four functions are service_role only.
--
-- ROLLBACK: set local lock_timeout = '3s';
-- ROLLBACK: do $$ begin if exists (select 1 from pg_extension where extname
-- ROLLBACK:     = 'pg_cron') then if exists (select 1 from cron.job where
-- ROLLBACK:     jobname = 'clubhouse-signals-prune') then perform
-- ROLLBACK:     cron.unschedule('clubhouse-signals-prune'); end if; end if;
-- ROLLBACK:     end $$;
-- ROLLBACK: drop function if exists public.clubhouse_forget_user(uuid);
-- ROLLBACK: drop function if exists public.clubhouse_signals_prune();
-- ROLLBACK: drop function if exists public.clubhouse_ingest_signals(jsonb);
-- ROLLBACK: drop function if exists public.clubhouse_bucket_quantile(
-- ROLLBACK:     integer[], numeric);
-- ROLLBACK: drop table if exists public.bridge_notes;
-- ROLLBACK: drop table if exists public.clubhouse_drift;
-- ROLLBACK: drop table if exists public.clubhouse_session_events;
-- ROLLBACK: drop table if exists public.clubhouse_sessions;
-- ROLLBACK: drop table if exists public.clubhouse_signal_hourly;
-- ROLLBACK: alter table public.admin_events drop column if exists ch_code,
-- ROLLBACK:     drop column if exists bridge_id, drop column if exists
-- ROLLBACK:     page_id, drop column if exists action_id, drop column if
-- ROLLBACK:     exists control_id, drop column if exists release, drop
-- ROLLBACK:     column if exists platform, drop column if exists
-- ROLLBACK:     session_id, drop column if exists server_code;
-- ROLLBACK: (dropping the columns drops their three indexes with them; run
-- ROLLBACK: the admin_events drop last, in the same transaction as the
-- ROLLBACK: lock_timeout, outside 04:10-04:30 UTC.)
--
-- VERIFY: select 1 where to_regclass('public.clubhouse_signal_hourly') is
-- VERIFY: not null;
-- VERIFY: select 1 where to_regclass('public.clubhouse_sessions') is not
-- VERIFY: null;
-- VERIFY: select 1 where to_regclass('public.clubhouse_session_events') is
-- VERIFY: not null;
-- VERIFY: select 1 where to_regclass('public.clubhouse_drift') is not null;
-- VERIFY: select 1 where to_regclass('public.bridge_notes') is not null;
-- VERIFY: select 1 from information_schema.columns where table_schema =
-- VERIFY: 'public' and table_name = 'admin_events' and column_name in
-- VERIFY: ('ch_code', 'bridge_id', 'page_id', 'action_id', 'control_id',
-- VERIFY: 'release', 'platform', 'session_id', 'server_code') having
-- VERIFY: count(*) = 9;
-- VERIFY: select 1 from pg_indexes where schemaname = 'public' and
-- VERIFY: indexname in ('idx_admin_events_ch_code',
-- VERIFY: 'idx_admin_events_bridge_id', 'idx_admin_events_session_id',
-- VERIFY: 'clubhouse_sessions_team_idx', 'bridge_notes_created_by_idx')
-- VERIFY: having count(*) = 5;
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and
-- VERIFY: tablename in ('clubhouse_signal_hourly', 'clubhouse_sessions',
-- VERIFY: 'clubhouse_session_events', 'clubhouse_drift', 'bridge_notes')
-- VERIFY: having count(*) = 5;
-- VERIFY: select 1 where not has_table_privilege('anon',
-- VERIFY: 'public.clubhouse_sessions', 'SELECT');
-- VERIFY: select 1 where not has_table_privilege('authenticated',
-- VERIFY: 'public.clubhouse_sessions', 'INSERT');
-- VERIFY: select 1 where not has_function_privilege('authenticated',
-- VERIFY: 'public.clubhouse_ingest_signals(jsonb)', 'EXECUTE');
-- VERIFY: select 1 where not has_function_privilege('anon',
-- VERIFY: 'public.clubhouse_ingest_signals(jsonb)', 'EXECUTE');
-- VERIFY: select 1 where not has_function_privilege('anon',
-- VERIFY: 'public.clubhouse_signals_prune()', 'EXECUTE');
-- VERIFY: select 1 where not has_function_privilege('anon',
-- VERIFY: 'public.clubhouse_bucket_quantile(integer[], numeric)', 'EXECUTE');
-- VERIFY: select 1 where not has_function_privilege('anon',
-- VERIFY: 'public.clubhouse_forget_user(uuid)', 'EXECUTE');
-- VERIFY: select 1 where not has_function_privilege('authenticated',
-- VERIFY: 'public.clubhouse_forget_user(uuid)', 'EXECUTE');
-- VERIFY: select 1 where has_function_privilege('service_role',
-- VERIFY: 'public.clubhouse_ingest_signals(jsonb)', 'EXECUTE');
-- VERIFY: select 1 where has_function_privilege('service_role',
-- VERIFY: 'public.clubhouse_forget_user(uuid)', 'EXECUTE');
-- VERIFY: select 1 from cron.job where jobname = 'clubhouse-signals-prune'
-- VERIFY: and schedule = '25 4 * * *';

-- One transaction (db:apply's): bounds every lock wait in this file, the
-- foreign keys' locks on users and golf_teams included.
set local lock_timeout = '3s';

-- 1. Hourly counts ----------------------------------------------------------

create table if not exists public.clubhouse_signal_hourly (
    bucket_hour timestamptz not null,
    -- '' for an action's start, which has no code yet.
    code text not null,
    kind text not null check (
        kind in (
            'state', 'toast', 'action', 'crash', 'view', 'vital',
            'frustration', 'tap'
        )
    ),
    -- '' when the envelope has no outcome.
    outcome text not null default '',
    -- The useAction name ('' when none).
    act text not null default '',
    role text not null check (role in ('coach', 'player', 'signed-out')),
    platform text not null check (
        platform in ('ios-app', 'ios-safari', 'desktop', 'other')
    ),
    release text not null,
    -- A Bridge ID is a five-digit catalog number.
    -- squawk-ignore prefer-bigint-over-int
    bridge_id integer,
    -- The page it fired on ('' when none): the shell's codes fire on every
    -- page, so the page splits the row as the plan's per-page counts need.
    page_id text not null default '',
    signal_count bigint not null default 0 check (signal_count >= 0),
    -- Distinct senders, at most 500 kept per row. No foreign key: account
    -- deletion scrubs an id with public.clubhouse_forget_user(uuid).
    user_ids uuid[] not null default '{}',
    -- Duration histogram: 17 buckets, edges in clubhouse_bucket_quantile.
    -- Per-bucket counts within one hour x key; a percentile is at most 600000 ms.
    -- squawk-ignore prefer-bigint-over-int
    duration_buckets integer[] not null default '{}',
    -- squawk-ignore prefer-bigint-over-int
    p50_ms integer,
    -- squawk-ignore prefer-bigint-over-int
    p95_ms integer,
    -- squawk-ignore prefer-bigint-over-int
    p99_ms integer,
    first_at timestamptz not null default now(),
    last_at timestamptz not null default now(),
    primary key (
        bucket_hour, code, kind, outcome, act, page_id, role, platform, release
    )
);

create index if not exists clubhouse_signal_hourly_code_idx
on public.clubhouse_signal_hourly (code, bucket_hour desc);
create index if not exists clubhouse_signal_hourly_bridge_idx
on public.clubhouse_signal_hourly (bridge_id, bucket_hour desc)
where bridge_id is not null;
create index if not exists clubhouse_signal_hourly_page_idx
on public.clubhouse_signal_hourly (page_id, bucket_hour desc)
where page_id <> '';

-- 2. Sessions ---------------------------------------------------------------

create table if not exists public.clubhouse_sessions (
    session_id text primary key check (session_id ~ '^[A-Za-z0-9_-]{8,64}$'),
    -- User id only: the Bridge reads a name live from profiles (plan D7).
    user_id uuid references public.users (id) on delete cascade,
    role text not null check (role in ('coach', 'player', 'signed-out')),
    team_id uuid references public.golf_teams (id) on delete set null,
    platform text not null check (
        platform in ('ios-app', 'ios-safari', 'desktop', 'other')
    ),
    release text not null,
    started_at timestamptz not null,
    last_at timestamptz not null,
    -- Set when the page was hidden or closed (a pagehide flush).
    ended_at timestamptz,
    pages text[] not null default '{}',
    -- One session's counts, bounded by the route's per-session batch limits.
    -- squawk-ignore prefer-bigint-over-int
    signal_count integer not null default 0,
    -- squawk-ignore prefer-bigint-over-int
    failure_count integer not null default 0,
    replay_id text check (replay_id is null or replay_id ~ '^[0-9a-f]{32}$')
);

create index if not exists clubhouse_sessions_last_idx
on public.clubhouse_sessions (last_at desc);
create index if not exists clubhouse_sessions_user_idx
on public.clubhouse_sessions (user_id, last_at desc)
where user_id is not null;
create index if not exists clubhouse_sessions_failed_idx
on public.clubhouse_sessions (last_at desc)
where failure_count > 0;
-- Foreign key index: a golf_teams delete sets team_id null here.
create index if not exists clubhouse_sessions_team_idx
on public.clubhouse_sessions (team_id)
where team_id is not null;

-- 3. The envelopes of a session that had a failure ---------------------------

create table if not exists public.clubhouse_session_events (
    session_id text not null references public.clubhouse_sessions (
        session_id
    ) on delete cascade,
    -- The envelope's per-session sequence number.
    -- squawk-ignore prefer-bigint-over-int
    seq integer not null check (seq >= 0),
    sent_at timestamptz not null,
    kind text not null,
    outcome text,
    code text,
    -- squawk-ignore prefer-bigint-over-int
    bridge_id integer,
    page_id text,
    act text,
    action_id text,
    control_id text,
    -- At most 600000 ms (the envelope's ceiling).
    -- squawk-ignore prefer-bigint-over-int
    duration_ms integer,
    server_code text,
    -- Failures only, redacted by the route as /api/log-error redacts.
    message text check (message is null or char_length(message) <= 2000),
    trail text[],
    drift text[] not null default '{}',
    received_at timestamptz not null default now(),
    primary key (session_id, seq)
);

create index if not exists clubhouse_session_events_at_idx
on public.clubhouse_session_events (received_at);

-- 4. Drift (plan 4.3) -------------------------------------------------------

create table if not exists public.clubhouse_drift (
    kind text not null check (
        kind in (
            'unknown-code', 'deprecated-fired', 'reserved-fired',
            'wrong-page', 'wrong-outcome', 'silent-action'
        )
    ),
    code text not null,
    release text not null,
    drift_count bigint not null default 0 check (drift_count >= 0),
    first_seen timestamptz not null,
    last_seen timestamptz not null,
    primary key (kind, code, release)
);

create index if not exists clubhouse_drift_last_idx
on public.clubhouse_drift (last_seen desc);

-- 5. The owner's notes ------------------------------------------------------

create table if not exists public.bridge_notes (
    id uuid primary key default gen_random_uuid(),
    kind text not null check (kind in ('expected', 'watch', 'pack', 'note')),
    code text,
    -- squawk-ignore prefer-bigint-over-int
    bridge_id integer,
    page_id text,
    body text not null default '' check (char_length(body) <= 4000),
    created_by uuid references public.users (id) on delete set null,
    created_at timestamptz not null default now(),
    resolved_at timestamptz
);

create index if not exists bridge_notes_code_idx
on public.bridge_notes (code)
where code is not null;
create index if not exists bridge_notes_bridge_idx
on public.bridge_notes (bridge_id)
where bridge_id is not null;
-- Foreign key index: a users delete sets created_by null here.
create index if not exists bridge_notes_created_by_idx
on public.bridge_notes (created_by)
where created_by is not null;

-- 6. Access: a super admin reads, the service role writes ------------------

alter table public.clubhouse_signal_hourly enable row level security;
alter table public.clubhouse_sessions enable row level security;
alter table public.clubhouse_session_events enable row level security;
alter table public.clubhouse_drift enable row level security;
alter table public.bridge_notes enable row level security;

revoke all on table public.clubhouse_signal_hourly from anon, authenticated;
revoke all on table public.clubhouse_sessions from anon, authenticated;
revoke all on table public.clubhouse_session_events from anon, authenticated;
revoke all on table public.clubhouse_drift from anon, authenticated;
revoke all on table public.bridge_notes from anon, authenticated;

grant select on table public.clubhouse_signal_hourly to authenticated;
grant select on table public.clubhouse_sessions to authenticated;
grant select on table public.clubhouse_session_events to authenticated;
grant select on table public.clubhouse_drift to authenticated;
grant select on table public.bridge_notes to authenticated;

grant all on table public.clubhouse_signal_hourly to service_role;
grant all on table public.clubhouse_sessions to service_role;
grant all on table public.clubhouse_session_events to service_role;
grant all on table public.clubhouse_drift to service_role;
grant all on table public.bridge_notes to service_role;

drop policy if exists clubhouse_signal_hourly_super_admin_read
on public.clubhouse_signal_hourly;
create policy clubhouse_signal_hourly_super_admin_read
on public.clubhouse_signal_hourly
for select to authenticated
using ((select public.is_super_admin()));

drop policy if exists clubhouse_sessions_super_admin_read
on public.clubhouse_sessions;
create policy clubhouse_sessions_super_admin_read
on public.clubhouse_sessions
for select to authenticated
using ((select public.is_super_admin()));

drop policy if exists clubhouse_session_events_super_admin_read
on public.clubhouse_session_events;
create policy clubhouse_session_events_super_admin_read
on public.clubhouse_session_events
for select to authenticated
using ((select public.is_super_admin()));

drop policy if exists clubhouse_drift_super_admin_read
on public.clubhouse_drift;
create policy clubhouse_drift_super_admin_read
on public.clubhouse_drift
for select to authenticated
using ((select public.is_super_admin()));

drop policy if exists bridge_notes_super_admin_read
on public.bridge_notes;
create policy bridge_notes_super_admin_read
on public.bridge_notes
for select to authenticated
using ((select public.is_super_admin()));

-- 7. Reading a percentile from the histogram --------------------------------

-- The upper edge (ms) of the bucket that holds quantile q; null when empty.
-- Edges: 50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500,
-- 10000, 20000, 30000, 60000, then everything over 60000 (read as 600000,
-- the envelope's own ceiling). The route buckets with the same edges
-- (src/lib/admin/clubhouse/ingest.ts, DURATION_EDGES_MS).
create or replace function public.clubhouse_bucket_quantile(
    p_buckets integer[], p_q numeric
) returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
    with b as (
        select
            t.n,
            t.i,
            sum(t.n) over (order by t.i) as cum,
            sum(t.n) over () as total
        from unnest(p_buckets) with ordinality as t (n, i)
    )
    select (array[
        50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500,
        10000, 20000, 30000, 60000, 600000
    ])[b.i]
    from b
    where b.total > 0 and b.cum >= ceil(b.total * p_q)
    order by b.i
    limit 1;
$$;

revoke all on function public.clubhouse_bucket_quantile(integer[], numeric)
from public, anon, authenticated;
grant execute on function public.clubhouse_bucket_quantile(
    integer[], numeric
) to service_role;

-- 8. Ingest: one call per session per batch ---------------------------------

-- p_batch, built by POST /api/ch/signal (src/lib/admin/clubhouse/ingest.ts):
--   hourly:  [{hour, code, kind, outcome, act, role, platform, release,
--             bridge_id, page_id, count, user_ids, buckets, first_at,
--             last_at}]
--   session: {session_id, user_id, role, team_id, platform, release,
--             first_at, last_at, ended, pages, count, failures, replay_id}
--   events:  [{seq, at, kind, outcome, code, bridge_id, page_id, act,
--             action_id, control_id, duration_ms, server_code, message,
--             trail, drift}]  (kept only once the session has a failure)
--   drift:   [{kind, code, release, count, first_seen, last_seen}]
--
-- session.user_id is the route's verified user (null when signed out);
-- session.team_id is the client's claim and is kept only when that user
-- coaches the team or is an active player on it.
--
-- A session belongs to the first verified user that writes it. A batch for
-- the same session_id from a different user (or from nobody, once a user
-- owns it) updates nothing: its events are not stored, its user is not
-- added to the hourly rows, and the result says session_refused. Its hourly
-- counts and drift still count, since they carry no session.
create or replace function public.clubhouse_ingest_signals(p_batch jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_uuid constant text :=
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
    v_session jsonb := p_batch -> 'session';
    v_session_id text := v_session ->> 'session_id';
    v_user_id uuid;
    v_team_id uuid;
    v_session_ok boolean := true;
    v_failures integer := 0;
    v_hourly integer := 0;
    v_events integer := 0;
    v_drift integer := 0;
begin
    if v_session_id is not null then
        -- A user or team that is gone (or an id the client made up, or one
        -- that is not a uuid) is dropped, not raised: one bad id must not
        -- lose the batch.
        select u.id into v_user_id
        from public.users as u
        where
            (v_session ->> 'user_id') ~ v_uuid
            and u.id = (v_session ->> 'user_id')::uuid;

        -- is_golf_team_coach / is_golf_team_player read auth.uid(), which is
        -- null for the service role, so the same membership test is written
        -- out here against the verified user.
        select t.id into v_team_id
        from public.golf_teams as t
        where
            v_user_id is not null
            and (v_session ->> 'team_id') ~ v_uuid
            and t.id = (v_session ->> 'team_id')::uuid
            and (
                exists (
                    select 1
                    from public.golf_team_coach_staff as gtcs
                    inner join public.golf_coaches as gc
                        on gtcs.coach_id = gc.id
                    where gtcs.team_id = t.id and gc.user_id = v_user_id
                )
                or exists (
                    select 1
                    from public.golf_team_members as gtm
                    inner join public.golf_players as gp
                        on gtm.player_id = gp.id
                    where
                        gtm.team_id = t.id
                        and gp.user_id = v_user_id
                        and gtm.status = 'active'
                )
            );

        insert into public.clubhouse_sessions as s (
            session_id, user_id, role, team_id, platform, release,
            started_at, last_at, ended_at, pages, signal_count,
            failure_count, replay_id
        )
        values (
            v_session_id,
            v_user_id,
            v_session ->> 'role',
            v_team_id,
            v_session ->> 'platform',
            v_session ->> 'release',
            (v_session ->> 'first_at')::timestamptz,
            (v_session ->> 'last_at')::timestamptz,
            case
                when (v_session ->> 'ended')::boolean
                    then (v_session ->> 'last_at')::timestamptz
            end,
            coalesce(
                array(
                    select jsonb_array_elements_text(v_session -> 'pages')
                ),
                '{}'
            ),
            (v_session ->> 'count')::integer,
            (v_session ->> 'failures')::integer,
            v_session ->> 'replay_id'
        )
        on conflict (session_id) do update set
            user_id = coalesce(s.user_id, excluded.user_id),
            team_id = coalesce(excluded.team_id, s.team_id),
            role = excluded.role,
            release = excluded.release,
            started_at = least(s.started_at, excluded.started_at),
            last_at = greatest(s.last_at, excluded.last_at),
            ended_at = coalesce(excluded.ended_at, s.ended_at),
            pages = (
                select coalesce(array_agg(distinct p order by p), '{}')
                from unnest(s.pages || excluded.pages) as p
            ),
            signal_count = s.signal_count + excluded.signal_count,
            failure_count = s.failure_count + excluded.failure_count,
            replay_id = coalesce(excluded.replay_id, s.replay_id)
        -- A session already owned by another user is left as it is.
        where s.user_id is null or s.user_id is not distinct from excluded.user_id
        returning s.failure_count into v_failures;

        -- No row back: the WHERE above refused the update. v_failures is
        -- left null by RETURNING INTO, so it is reset here.
        v_session_ok := found;
        v_failures := coalesce(v_failures, 0);

        -- The timeline is kept only where something went wrong.
        if v_session_ok and v_failures > 0 then
            insert into public.clubhouse_session_events (
                session_id, seq, sent_at, kind, outcome, code, bridge_id,
                page_id, act, action_id, control_id, duration_ms,
                server_code, message, trail, drift
            )
            select
                v_session_id,
                (e ->> 'seq')::integer,
                (e ->> 'at')::timestamptz,
                e ->> 'kind',
                e ->> 'outcome',
                e ->> 'code',
                (e ->> 'bridge_id')::integer,
                e ->> 'page_id',
                e ->> 'act',
                e ->> 'action_id',
                e ->> 'control_id',
                (e ->> 'duration_ms')::integer,
                e ->> 'server_code',
                left(e ->> 'message', 2000),
                -- The route sends trail: null for an envelope without one,
                -- and `?` is true for a key whose value is JSON null.
                case
                    when jsonb_typeof(e -> 'trail') = 'array'
                        then array(
                            select jsonb_array_elements_text(e -> 'trail')
                        )
                end,
                coalesce(
                    array(select jsonb_array_elements_text(e -> 'drift')),
                    '{}'
                )
            from jsonb_array_elements(coalesce(p_batch -> 'events', '[]')) as e
            on conflict (session_id, seq) do nothing;
            get diagnostics v_events = row_count;
        end if;
    end if;

    insert into public.clubhouse_signal_hourly as h (
        bucket_hour, code, kind, outcome, act, role, platform, release,
        bridge_id, page_id, signal_count, user_ids, duration_buckets,
        p50_ms, p95_ms, p99_ms, first_at, last_at
    )
    select
        (r ->> 'hour')::timestamptz,
        coalesce(r ->> 'code', ''),
        r ->> 'kind',
        coalesce(r ->> 'outcome', ''),
        coalesce(r ->> 'act', ''),
        r ->> 'role',
        r ->> 'platform',
        r ->> 'release',
        (r ->> 'bridge_id')::integer,
        coalesce(r ->> 'page_id', ''),
        (r ->> 'count')::bigint,
        -- A refused session's sender is not attributed.
        case
            when v_session_ok then coalesce(
                array(
                    select distinct u::uuid
                    from jsonb_array_elements_text(r -> 'user_ids') as u
                    limit 500
                ),
                '{}'
            )
            else '{}'::uuid[]
        end,
        coalesce(
            array(
                select n::integer
                from jsonb_array_elements_text(r -> 'buckets')
                    with ordinality as x (n, i)
                order by x.i
            ),
            '{}'
        ),
        null,
        null,
        null,
        (r ->> 'first_at')::timestamptz,
        (r ->> 'last_at')::timestamptz
    from jsonb_array_elements(coalesce(p_batch -> 'hourly', '[]')) as r
    on conflict (
        bucket_hour, code, kind, outcome, act, page_id, role, platform, release
    )
    do update set
        signal_count = h.signal_count + excluded.signal_count,
        bridge_id = coalesce(excluded.bridge_id, h.bridge_id),
        user_ids = (
            select coalesce(array_agg(distinct u), '{}')
            from (
                select u
                from unnest(h.user_ids || excluded.user_ids) as u
                limit 500
            ) as capped
        ),
        duration_buckets = case
            when cardinality(h.duration_buckets) = 0
                then excluded.duration_buckets
            when cardinality(excluded.duration_buckets) = 0
                then h.duration_buckets
            else (
                select array_agg(
                    coalesce(z.a, 0) + coalesce(z.b, 0) order by z.i
                )
                from unnest(h.duration_buckets, excluded.duration_buckets)
                    with ordinality as z (a, b, i)
            )
        end,
        first_at = least(h.first_at, excluded.first_at),
        last_at = greatest(h.last_at, excluded.last_at);
    get diagnostics v_hourly = row_count;

    -- Percentiles follow the merged histogram of every row this batch touched.
    update public.clubhouse_signal_hourly as h
    set
        p50_ms = public.clubhouse_bucket_quantile(h.duration_buckets, 0.50),
        p95_ms = public.clubhouse_bucket_quantile(h.duration_buckets, 0.95),
        p99_ms = public.clubhouse_bucket_quantile(h.duration_buckets, 0.99)
    from jsonb_array_elements(coalesce(p_batch -> 'hourly', '[]')) as r
    where
        h.bucket_hour = (r ->> 'hour')::timestamptz
        and h.code = coalesce(r ->> 'code', '')
        and h.kind = r ->> 'kind'
        and h.outcome = coalesce(r ->> 'outcome', '')
        and h.act = coalesce(r ->> 'act', '')
        and h.page_id = coalesce(r ->> 'page_id', '')
        and h.role = r ->> 'role'
        and h.platform = r ->> 'platform'
        and h.release = r ->> 'release'
        and cardinality(h.duration_buckets) > 0;

    insert into public.clubhouse_drift as d (
        kind, code, release, drift_count, first_seen, last_seen
    )
    select
        r ->> 'kind',
        r ->> 'code',
        r ->> 'release',
        (r ->> 'count')::bigint,
        (r ->> 'first_seen')::timestamptz,
        (r ->> 'last_seen')::timestamptz
    from jsonb_array_elements(coalesce(p_batch -> 'drift', '[]')) as r
    on conflict (kind, code, release) do update set
        drift_count = d.drift_count + excluded.drift_count,
        first_seen = least(d.first_seen, excluded.first_seen),
        last_seen = greatest(d.last_seen, excluded.last_seen);
    get diagnostics v_drift = row_count;

    return jsonb_build_object(
        'hourly', v_hourly,
        'events', v_events,
        'drift', v_drift,
        'failures', v_failures,
        'session_refused', not v_session_ok
    );
end;
$$;

revoke all on function public.clubhouse_ingest_signals(jsonb)
from public, anon, authenticated;
grant execute on function public.clubhouse_ingest_signals(jsonb)
to service_role;

-- 9. Retention (plan 4.5) ---------------------------------------------------

create or replace function public.clubhouse_signals_prune()
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
    delete from public.clubhouse_signal_hourly
    where bucket_hour < now() - interval '180 days';
    delete from public.clubhouse_drift
    where last_seen < now() - interval '180 days';
    delete from public.clubhouse_session_events
    where received_at < now() - interval '14 days';
    delete from public.clubhouse_sessions
    where last_at < now() - interval '30 days';
$$;

revoke all on function public.clubhouse_signals_prune()
from public, anon, authenticated;
grant execute on function public.clubhouse_signals_prune() to service_role;

do $$
begin
    if not exists (select 1 from pg_extension where extname = 'pg_cron') then
        raise notice 'pg_cron is not installed here; prune not scheduled';
        return;
    end if;
    -- cron.schedule upserts by job name, so a re-apply replaces the job.
    perform cron.schedule(
        'clubhouse-signals-prune',
        '25 4 * * *',
        $job$select public.clubhouse_signals_prune()$job$
    );
end $$;

-- 10. Forgetting a deleted account ------------------------------------------

-- clubhouse_signal_hourly.user_ids has no foreign key to cascade, so the
-- account-delete path (src/app/api/account/delete, service role) calls this
-- before the auth user is deleted. Returns the number of rows changed.
-- (clubhouse_sessions cascades from users; bridge_notes.created_by is set
-- null.) A sequential scan of the hourly rows: account deletion is rare.
create or replace function public.clubhouse_forget_user(p_user uuid)
returns integer
language sql
security invoker
set search_path = public, pg_temp
as $$
    with changed as (
        update public.clubhouse_signal_hourly
        set user_ids = array_remove(user_ids, p_user)
        where p_user = any(user_ids)
        returning 1
    )
    select count(*)::integer from changed;
$$;

revoke all on function public.clubhouse_forget_user(uuid)
from public, anon, authenticated;
grant execute on function public.clubhouse_forget_user(uuid) to service_role;

-- 11. admin_events keeps the Bridge's fields in columns ---------------------

-- Last on purpose: the ALTER takes ACCESS EXCLUSIVE on admin_events and holds
-- it until commit, so nothing else in this file runs while it is held. The
-- columns are nullable with no default (a catalog change); each index still
-- scans the table once.

alter table public.admin_events
add column if not exists ch_code text,
-- A Bridge ID is a five-digit catalog number.
-- squawk-ignore prefer-bigint-over-int
add column if not exists bridge_id integer,
add column if not exists page_id text,
add column if not exists action_id text,
add column if not exists control_id text,
add column if not exists release text,
add column if not exists platform text,
add column if not exists session_id text,
add column if not exists server_code text;

-- CONCURRENTLY cannot run inside db:apply's transaction; ACCESS EXCLUSIVE is
-- already held from the ALTER above, and the file ends right after these.
-- squawk-ignore require-concurrent-index-creation
create index if not exists idx_admin_events_ch_code
on public.admin_events (ch_code, created_at desc)
where ch_code is not null;
-- CONCURRENTLY cannot run inside db:apply's transaction (see above).
-- squawk-ignore require-concurrent-index-creation
create index if not exists idx_admin_events_bridge_id
on public.admin_events (bridge_id, created_at desc)
where bridge_id is not null;
-- CONCURRENTLY cannot run inside db:apply's transaction (see above).
-- squawk-ignore require-concurrent-index-creation
create index if not exists idx_admin_events_session_id
on public.admin_events (session_id, created_at desc)
where session_id is not null;
