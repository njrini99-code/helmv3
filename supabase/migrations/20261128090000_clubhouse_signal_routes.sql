-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- Written 28 Nov 2026 for the Bridge's screen coverage (branch
--   agent/bridge-reliability-issues). Not applied anywhere, not run against
--   any shared database. Rehearsed on a scratch Postgres 16 with stub
--   tables, after 20261124090000 (see the HELD.md row). Applied only on the
--   owner's own yes for this file.
--
-- Apply: npm run db:apply --
--   supabase/migrations/20261128090000_clubhouse_signal_routes.sql
--   after npm run test:rls passes on a local stack (pgTAP:
--   supabase/tests/rls/clubhouse_signal_routes.sql). Apply OUTSIDE
--   04:10-04:30 UTC (clubhouse-signals-prune runs at 04:25). Either order
--   with the app deploy works: the app sends to clubhouse_ingest_signals_v2
--   and falls back to the first function while v2 is missing, and an app
--   still on the first function keeps working here, because the first
--   function now hands its batch to v2.
--
-- Risk: LOW. One table, 19 rows in production on 28 Nov 2026 (read-only).
--   Locks: the whole file runs in db:apply's one transaction under
--   set local lock_timeout = '3s'. The ALTERs take ACCESS EXCLUSIVE on
--   clubhouse_signal_hourly until commit, so the signal route's counts wait
--   (they are best-effort; failures still reach admin_events). Nothing else
--   reads or writes this table but the Bridge.
--
-- What: the hourly counts learn which screen each signal fired on.
--   clubhouse_signal_hourly gains route (text, not null, default ''): a route
--   key the graph lists on the row's page (src/lib/admin/clubhouse/
--   route-key.ts), such as /golf/dashboard/rounds/[id] or
--   /golf/dashboard/coachhelm?view=ask. A key never carries an id. Existing
--   rows read '' (screen not told). The primary key gains route, so the
--   screens of one page count apart.
--   clubhouse_ingest_signals_v2(jsonb) is the first function with route in
--   its insert, its conflict key and its percentile update.
--   clubhouse_ingest_signals(jsonb) now calls v2. Its old conflict key no
--   longer matches the primary key, so left as it was it would fail every
--   batch an older deploy sends; through v2, a row with no route counts
--   under route ''.
--
-- Access: unchanged. v2 is service_role only, as the first function is.
--
-- ROLLBACK: the full rollback, with the first function's definition as
-- ROLLBACK: captured from production on 28 Nov 2026, is
-- ROLLBACK: supabase/rollbacks/
-- ROLLBACK: 20261128090000_clubhouse_signal_routes.rollback.sql.
-- ROLLBACK: In order: fold every row with a route into its page's row
-- ROLLBACK: (counts and histograms summed, senders merged), restore the
-- ROLLBACK: first function's body, drop clubhouse_ingest_signals_v2(jsonb),
-- ROLLBACK: put back the primary key without route, then
-- ROLLBACK: alter table public.clubhouse_signal_hourly drop column route.
-- ROLLBACK: Rolling back loses which screen each count came from, nothing
-- ROLLBACK: else.
--
-- VERIFY: select 1 from information_schema.columns where table_schema =
-- VERIFY: 'public' and table_name = 'clubhouse_signal_hourly' and
-- VERIFY: column_name = 'route' and is_nullable = 'NO';
-- VERIFY: select 1 from pg_constraint where conrelid =
-- VERIFY: 'public.clubhouse_signal_hourly'::regclass and contype = 'p' and
-- VERIFY: pg_get_constraintdef(oid) like '%page_id, route, role%';
-- VERIFY: select 1 where to_regprocedure(
-- VERIFY: 'public.clubhouse_ingest_signals_v2(jsonb)') is not null;
-- VERIFY: select 1 where pg_get_functiondef(
-- VERIFY: 'public.clubhouse_ingest_signals(jsonb)'::regprocedure) like
-- VERIFY: '%clubhouse_ingest_signals_v2%';
-- VERIFY: select 1 where not has_function_privilege('anon',
-- VERIFY: 'public.clubhouse_ingest_signals_v2(jsonb)', 'EXECUTE');
-- VERIFY: select 1 where not has_function_privilege('authenticated',
-- VERIFY: 'public.clubhouse_ingest_signals_v2(jsonb)', 'EXECUTE');
-- VERIFY: select 1 where has_function_privilege('service_role',
-- VERIFY: 'public.clubhouse_ingest_signals_v2(jsonb)', 'EXECUTE');

set local lock_timeout = '3s';

-- 1. The screen column ------------------------------------------------------

-- A constant default: a catalog change, no rewrite.
alter table public.clubhouse_signal_hourly
add column if not exists route text not null default '';

comment on column public.clubhouse_signal_hourly.route is
'The screen it fired on: a route key the graph lists on page_id '
'(src/lib/admin/clubhouse/route-key.ts), never an id. '
'Empty when the client did not say.';

-- 2. The primary key gains the screen ---------------------------------------

-- Guarded, so a second apply changes nothing. The new key is built as a
-- unique index first, then swapped in, in this one transaction.
do $$
begin
    if exists (
        select 1
        from pg_index as i
        inner join pg_attribute as a
            on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
        where
            i.indrelid = 'public.clubhouse_signal_hourly'::regclass
            and i.indisprimary
            and a.attname = 'route'
    ) then
        return;
    end if;
    create unique index clubhouse_signal_hourly_route_key
    on public.clubhouse_signal_hourly (
        bucket_hour, code, kind, outcome, act, page_id, route, role, platform,
        release
    );
    alter table public.clubhouse_signal_hourly
    drop constraint clubhouse_signal_hourly_pkey;
    alter table public.clubhouse_signal_hourly
    add constraint clubhouse_signal_hourly_pkey
    primary key using index clubhouse_signal_hourly_route_key;
end $$;

-- 3. The ingest function that keeps the screen ------------------------------

-- The first function's body (20261124090000), with route in the hourly
-- insert, its conflict key and the percentile update. Everything else, the
-- session owner and team rules included, is unchanged.
create or replace function public.clubhouse_ingest_signals_v2(p_batch jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_uuid constant text :=
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-'
        '[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
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
        where s.user_id is null
            or s.user_id is not distinct from excluded.user_id
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
        bridge_id, page_id, route, signal_count, user_ids, duration_buckets,
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
        -- The screen, as the route kept it: '' when the client sent none or
        -- one the graph does not list on its page.
        left(coalesce(r ->> 'route', ''), 160),
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
        bucket_hour, code, kind, outcome, act, page_id, route, role, platform,
        release
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
        and h.route = left(coalesce(r ->> 'route', ''), 160)
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

revoke all on function public.clubhouse_ingest_signals_v2(jsonb)
from public, anon, authenticated;
grant execute on function public.clubhouse_ingest_signals_v2(jsonb)
to service_role;

-- 4. The first function hands its batch to v2 -------------------------------

-- A deploy that still calls the first function sends no route: v2 counts
-- its rows under route ''. Its grants are kept (create or replace).
create or replace function public.clubhouse_ingest_signals(p_batch jsonb)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
    select public.clubhouse_ingest_signals_v2(p_batch);
$$;
