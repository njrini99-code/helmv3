-- STATUS: WRITTEN — HOLD — NOT APPLIED. Awaits Production rollout
-- (supabase/migrations/HELD.md). Apply: npm run db:apply -- <this file>
--
-- Clubhouse P012 Classes, audit doc-61 (two imports in flight at once).
-- Rollback SQL: supabase/rollbacks/, same name with a .rollback.sql suffix.
--
-- Today the Clubhouse import reads the player's classes, filters the reviewed
-- rows against them in the browser, then inserts what is left.
-- golf_player_classes has no uniqueness beyond its id, so two imports that
-- overlap (two tabs, two devices, a double tap that outruns the disabled
-- button) both read before
-- either inserts and both insert: every class twice, and calendar-sync then
-- reconciles per class id, so the calendar doubles.
--
-- Not a unique index on purpose: Fairway's Add class and Clubhouse's save let a
-- player keep two classes with the same name in a term (a lecture and its lab),
-- and a constraint would refuse the second. Production holds 0 such groups
-- today (read 2026-10-21, 56 rows), but the table has never forbidden them.
--
-- Now: golf_import_player_classes(player, team, term, rows) takes one advisory
-- lock per player for the transaction, reads the player's classes inside it,
-- inserts the rows whose (class_name, term) is not there yet, and answers with
-- what it saved, what it skipped, and the stored rows the skipped ones matched.
-- A second import for the same player waits for the first to commit, then sees
-- its rows and skips them. The match is the app's own (importKey): class_name
-- exactly, and the term with a blank or missing semester read as p_term.
-- A schedule that lists a class twice saves it once, the first listing.
--
-- SECURITY INVOKER: the caller's RLS applies, so
-- golf_player_classes_insert_player still decides who may add to a player's
-- schedule (a call for someone else's player_id fails with 42501, as the
-- direct insert does). EXECUTE goes to
-- authenticated only. The app falls back to its read-then-insert path while
-- this function is absent (PGRST202), so shipping the app first is safe.
--
-- Forward-only and idempotent (create or replace). Risk: LOW; a new function,
-- no table or policy changes. pgTAP:
-- supabase/tests/rls/golf_import_player_classes.sql.
--
-- VERIFY:
--   select 1 where (select count(*) from pg_proc p join pg_namespace n
--   on n.oid = p.pronamespace where n.nspname = 'public'
--   and p.proname = 'golf_import_player_classes' and not p.prosecdef) = 1
--   and not has_function_privilege('anon',
--   'public.golf_import_player_classes(uuid, uuid, text, jsonb)', 'execute')
--   and has_function_privilege('authenticated',
--   'public.golf_import_player_classes(uuid, uuid, text, jsonb)', 'execute');

-- The migration tool runs this file in one transaction.

create or replace function public.golf_import_player_classes(
    p_player_id uuid,
    p_team_id uuid,
    p_term text,
    p_rows jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_result jsonb;
begin
    if (select auth.uid()) is null then
        raise exception 'not signed in' using errcode = '28000';
    end if;
    if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
        raise exception 'p_rows must be a json array' using errcode = '22023';
    end if;

    -- One import per player at a time. Released at commit, so the waiting
    -- import's next statement reads the first one's rows.
    perform pg_advisory_xact_lock(
        hashtextextended('golf_import_player_classes:' || p_player_id::text, 0)
    );

    with incoming as (
        select
            o.n,
            rec.class_name,
            rec.instructor,
            rec.days,
            rec.start_time,
            rec.end_time,
            rec.building,
            rec.room,
            rec.credits,
            rec.color,
            rec.notes,
            coalesce(nullif(btrim(rec.semester), ''), p_term) as term
        from jsonb_array_elements(p_rows) with ordinality as o(elem, n)
        cross join lateral jsonb_populate_record(
            null::public.golf_player_classes, o.elem
        ) as rec
    ),

    keyed as (
        select
            i.*,
            row_number() over (
                partition by i.class_name, i.term order by i.n
            ) as rn
        from incoming as i
    ),

    stored as (
        select
            c.*,
            coalesce(nullif(btrim(c.semester), ''), p_term) as term
        from public.golf_player_classes as c
        where c.player_id = p_player_id
    ),

    fresh as (
        select k.*
        from keyed as k
        where
            k.rn = 1
            and not exists (
                select 1 from stored as s
                where s.class_name = k.class_name and s.term = k.term
            )
    ),

    ins as (
        insert into public.golf_player_classes (
            player_id, team_id, class_name, instructor, days, start_time,
            end_time, building, room, credits, color, notes, semester
        )
        select
            p_player_id, p_team_id, f.class_name, f.instructor, f.days,
            f.start_time, f.end_time, f.building, f.room, f.credits, f.color,
            f.notes, f.term
        from fresh as f
        order by f.n
        returning *
    )

    select jsonb_build_object(
        'inserted', coalesce((select jsonb_agg(to_jsonb(ins) order by ins.created_at, ins.id) from ins), '[]'::jsonb),
        'skipped', coalesce((
            select jsonb_agg(k.class_name order by k.n)
            from keyed as k
            where not exists (select 1 from fresh as f where f.n = k.n)
        ), '[]'::jsonb),
        'known', coalesce((
            select jsonb_agg(to_jsonb(s) - 'term' order by s.created_at, s.id)
            from stored as s
            where exists (
                select 1 from keyed as k
                where k.class_name = s.class_name and k.term = s.term
            )
        ), '[]'::jsonb)
    )
    into v_result;

    return v_result;
end;
$$;

revoke all on function
public.golf_import_player_classes(uuid, uuid, text, jsonb)
from public, anon;
grant execute on function
public.golf_import_player_classes(uuid, uuid, text, jsonb)
to authenticated;
