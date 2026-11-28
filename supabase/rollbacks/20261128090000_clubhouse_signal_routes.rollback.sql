-- ROLLBACK CAPTURE for supabase/migrations/20261128090000_clubhouse_signal_routes.sql
--
-- Forward change (held; not applied anywhere when this file was written):
-- public.clubhouse_signal_hourly gains a `route` column (the screen a signal
-- fired on, '' when not told) and its primary key gains `route` after
-- page_id; clubhouse_ingest_signals_v2(jsonb) writes it; the first function,
-- clubhouse_ingest_signals(jsonb), becomes a wrapper that hands its batch to
-- v2, so a deploy that predates the column (it sends no route) keeps counting,
-- under route ''.
--
-- Prior state below was captured from the live production catalog
-- (read-only, 2026-11-28, PostgreSQL 17.11):
--   public.clubhouse_ingest_signals(jsonb)
--     prosrc md5                 9650398400c7e64a1343c45566a4fe65
--     pg_get_functiondef md5     d15c9eaa7cfeb5bb7888e1dc777a290b
--     grants                     {postgres=X/postgres,service_role=X/postgres}
--                                (CREATE OR REPLACE keeps them, so the revert needs no GRANT)
--   public.clubhouse_signal_hourly
--     clubhouse_signal_hourly_pkey  PRIMARY KEY (bucket_hour, code, kind, outcome, act, page_id, role, platform, release)
--     no `route` column; 19 rows
--   public.clubhouse_ingest_signals_v2(jsonb)  did not exist
-- The definition below is the one pg_get_functiondef returned: the same two
-- md5s were reproduced from it on a scratch database before this file was
-- committed.
--
-- WHAT THIS ROLLBACK COSTS: every hour's rows for each screen are folded back
-- into their page's row, so the Bridge loses which screen of a page a count,
-- a failure or a slow load came from, for every hour since the forward apply.
-- No count is lost: signal_count, people (capped at 500 per row, as ever),
-- histograms and first and last seen are merged. The Pages view goes back to
-- crediting a screen only where page and role leave one screen. An app
-- deployed with the route code keeps working: it reads v2 as missing
-- (PGRST202, or 42883 until PostgREST reloads its schema cache), sends the
-- same batch to the first function without screens, and tries v2 again every
-- ten minutes per server instance, each try one failed call and no lost data.
--
-- Run as postgres, in one transaction, outside 04:10-04:30 UTC (the prune
-- job). Take the before figure first:
--   select count(*), sum(signal_count) from public.clubhouse_signal_hourly;
--
-- Metadata (fill on apply):
--   forward commit:          (the commit carrying the forward migration on main)
--   forward applied to prod: ____________________ (timestamp, by owner)
--   rollback applied:        ____________________ (timestamp, by owner)
--   approval:                owner (Nick); record the apply in supabase/migrations/HELD.md
--   Sentry window:           24 hours after apply: no new issue tagged
--                            component:ch-signal-route step:ingest, and the
--                            Reliability page still hears signals within an hour
--
-- VERIFY (after): select count(*) = 0 from information_schema.columns where table_schema = 'public' and table_name = 'clubhouse_signal_hourly' and column_name = 'route';
-- VERIFY (after): select pg_get_constraintdef(oid) = 'PRIMARY KEY (bucket_hour, code, kind, outcome, act, page_id, role, platform, release)' from pg_constraint where conrelid = 'public.clubhouse_signal_hourly'::regclass and conname = 'clubhouse_signal_hourly_pkey';
-- VERIFY (after): select to_regprocedure('public.clubhouse_ingest_signals_v2(jsonb)') is null;
-- VERIFY (after): select md5(prosrc) = '9650398400c7e64a1343c45566a4fe65' and proacl::text = '{postgres=X/postgres,service_role=X/postgres}' from pg_proc where oid = 'public.clubhouse_ingest_signals(jsonb)'::regprocedure;
-- VERIFY (after): select count(*), sum(signal_count) from public.clubhouse_signal_hourly;  -- sum equals the before figure; count is at most the before count

-- -- Revert SQL ------------------------------------------------------------------

set local lock_timeout = '3s';

-- 1. Fold every screen's rows into their page's row (route ''), merging the
--    way the first function merges a repeat.
create temporary table clubhouse_route_fold on commit drop as
with moved as (
    delete from public.clubhouse_signal_hourly
    where route <> ''
    returning *
)
select * from moved;

with
sums as (
    select
        bucket_hour, code, kind, outcome, act, page_id, role, platform, release,
        max(bridge_id) as bridge_id,
        sum(signal_count)::bigint as signal_count,
        min(first_at) as first_at,
        max(last_at) as last_at
    from clubhouse_route_fold
    group by bucket_hour, code, kind, outcome, act, page_id, role, platform, release
),
people as (
    select
        bucket_hour, code, kind, outcome, act, page_id, role, platform, release,
        array_agg(u order by u) as user_ids
    from (
        select
            f.bucket_hour, f.code, f.kind, f.outcome, f.act, f.page_id, f.role, f.platform, f.release, u,
            row_number() over (
                partition by f.bucket_hour, f.code, f.kind, f.outcome, f.act, f.page_id, f.role, f.platform, f.release
                order by u
            ) as n
        from (
            select distinct
                bucket_hour, code, kind, outcome, act, page_id, role, platform, release, u
            from clubhouse_route_fold, unnest(user_ids) as u
        ) as f
    ) as ranked
    where n <= 500
    group by bucket_hour, code, kind, outcome, act, page_id, role, platform, release
),
hist as (
    select
        bucket_hour, code, kind, outcome, act, page_id, role, platform, release,
        array_agg(total order by i) as duration_buckets
    from (
        select
            bucket_hour, code, kind, outcome, act, page_id, role, platform, release, z.i,
            sum(z.n)::integer as total
        from clubhouse_route_fold, unnest(duration_buckets) with ordinality as z (n, i)
        group by bucket_hour, code, kind, outcome, act, page_id, role, platform, release, z.i
    ) as per_bucket
    group by bucket_hour, code, kind, outcome, act, page_id, role, platform, release
)
insert into public.clubhouse_signal_hourly as h (
    bucket_hour, code, kind, outcome, act, page_id, route, role, platform, release,
    bridge_id, signal_count, user_ids, duration_buckets, first_at, last_at
)
select
    s.bucket_hour, s.code, s.kind, s.outcome, s.act, s.page_id, '', s.role, s.platform, s.release,
    s.bridge_id,
    s.signal_count,
    coalesce(p.user_ids, '{}'),
    coalesce(d.duration_buckets, '{}'),
    s.first_at,
    s.last_at
from sums as s
left join people as p using (bucket_hour, code, kind, outcome, act, page_id, role, platform, release)
left join hist as d using (bucket_hour, code, kind, outcome, act, page_id, role, platform, release)
on conflict (
    bucket_hour, code, kind, outcome, act, page_id, route, role, platform, release
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

-- 2. Percentiles follow the merged histogram of every row the fold touched.
update public.clubhouse_signal_hourly as h
set
    p50_ms = public.clubhouse_bucket_quantile(h.duration_buckets, 0.50),
    p95_ms = public.clubhouse_bucket_quantile(h.duration_buckets, 0.95),
    p99_ms = public.clubhouse_bucket_quantile(h.duration_buckets, 0.99)
from (
    select distinct bucket_hour, code, kind, outcome, act, page_id, role, platform, release
    from clubhouse_route_fold
) as f
where
    h.route = ''
    and h.bucket_hour = f.bucket_hour
    and h.code = f.code
    and h.kind = f.kind
    and h.outcome = f.outcome
    and h.act = f.act
    and h.page_id = f.page_id
    and h.role = f.role
    and h.platform = f.platform
    and h.release = f.release
    and cardinality(h.duration_buckets) > 0;

-- 3. The first function, exactly as production had it (captured verbatim).
CREATE OR REPLACE FUNCTION public.clubhouse_ingest_signals(p_batch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

-- 4. v2 goes.
drop function if exists public.clubhouse_ingest_signals_v2(jsonb);

-- 5. The key without route, then the column. Every row has route '' now, so
--    the old key is unique.
create unique index clubhouse_signal_hourly_pre_route_key
    on public.clubhouse_signal_hourly (
        bucket_hour, code, kind, outcome, act, page_id, role, platform, release
    );
alter table public.clubhouse_signal_hourly
    drop constraint clubhouse_signal_hourly_pkey;
alter table public.clubhouse_signal_hourly
    add constraint clubhouse_signal_hourly_pkey
    primary key using index clubhouse_signal_hourly_pre_route_key;
alter table public.clubhouse_signal_hourly drop column route;

-- 6. PostgREST forgets v2 now rather than at its next reload.
notify pgrst, 'reload schema';
