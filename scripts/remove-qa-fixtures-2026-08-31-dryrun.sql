-- ============================================================================
-- DRY RUN companion to remove-qa-fixtures-2026-08-31.sql.  READ-ONLY.
--
-- OWNER-ONLY.  Run against project qmnssrrolpinvwjjnufo as the `postgres`
-- role (the role that owns public.golf_rounds).  Nothing here writes.  Its
-- OUTPUT IS THE EXPORT: it is the only copy of the rows the removal script
-- and its ON DELETE CASCADE / SET NULL side effects will destroy or alter.
-- Save it before running the removal.
--
-- RUN ORDER (all three from the repo root):
--
--   1. This dry run, saved to a file.  --csv keeps the jsonb rows intact.
--        psql "$HELM_PROD_DB_URL_DIRECT" -X -v ON_ERROR_STOP=1 --csv \
--          -f scripts/remove-qa-fixtures-2026-08-31-dryrun.sql \
--          > "qa-fixtures-export-$(date -u +%Y%m%dT%H%M%SZ).csv"
--        echo "exit=$?"          # must be 0
--      Read every row whose kind is 'assert' — each one names the value it
--      must have.  If any assert row disagrees, STOP: the removal script
--      refuses on the same conditions, and the cause needs a human first.
--
--   2. scripts/remove-qa-fixtures-2026-08-31.sql — header there.
--
--   3. Only then apply supabase/migrations/20260901120000_* (per its row in
--      supabase/migrations/HELD.md).  Applied first, its check 6 reports
--      fail/4 until this data is gone.
--
-- WHY THESE ARE FIXTURES, NOT DATA.  The qualifier names itself ("QA — Round
-- Type Verification 2026-08-31"); the five round ids are sequential literals
-- (0b000000-0000-4000-b000-00000000000{1..5}); three share created_at to the
-- microsecond; every updated_at equals its created_at; none carries a
-- course_id; current_hole=1 sits against holes_played=18.  No application
-- path emits a patterned sequential uuid.  They arrived through a direct
-- service-role insert on demo team 6ecdd1a6-63fe-4beb-b094-00118f334163.
-- Blast radius measured 2026-09-01: every other team has ZERO fixture-shaped
-- rows.
--
-- WHAT THE EXPORT CONTAINS.  One statement, one result set, four columns:
--   section  kind                              what
--   0        catalog_fk / catalog_trigger      what the LIVE catalog says a
--                                              delete will do.  If a child
--                                              table appears here that has no
--                                              row kind below, the export is
--                                              incomplete: extend it, do not
--                                              proceed.
--   1        round                             the five rounds, full rows,
--                                              plus hole/shot counts
--   2        cascade:*                         rows ON DELETE CASCADE removes:
--                                              golf_holes, golf_shots,
--                                              golf_round_stats_cache,
--                                              golf_round_reviews, and the
--                                              second-order golf_review_events
--   3        set_null:*                        rows ON DELETE SET NULL edits:
--                                              golf_predictions
--                                              .related_round_id,
--                                              golf_qualifier_entries
--                                              .round_id,
--                                              golf_player_focus_areas
--                                              .from_review_id
--   4        qualifier / qualifier_cascade:*   the QA qualifier and what
--                                              cascades from it (entries,
--                                              round courses, selections); and
--                                              rounds OUTSIDE the set that
--                                              point at it — must be empty
--   5        recomputed:golf_player_stats_cache
--                                              the per-player cache rows that
--                                              trg_update_player_stats_complete
--                                              rewrites when the cascaded
--                                              golf_round_stats_cache rows go
--                                              (before-image; the trigger
--                                              recomputes from the rounds that
--                                              remain, and DELETES the row if
--                                              no cached round remains)
--   6        count                             the count block the removal
--                                              script prints BEFORE and AFTER,
--                                              same keys
--   7        assert                            preconditions; the id says the
--                                              required value
--   8        info                              context: integrity check 6
--                                              globally and outside the set,
--                                              the guard function fingerprint
--                                              (compare with HELD.md), server
--                                              version, timestamp
--
-- SCOPE.  Explicit id lists via the two CTEs at the top — never a LIKE
-- pattern.  Every branch below filters on those CTEs.
-- ============================================================================

WITH
fixture_rounds (id) AS (
    VALUES
    ('0b000000-0000-4000-b000-000000000001'::uuid),
    ('0b000000-0000-4000-b000-000000000002'::uuid),
    ('0b000000-0000-4000-b000-000000000003'::uuid),
    ('0b000000-0000-4000-b000-000000000004'::uuid),
    ('0b000000-0000-4000-b000-000000000005'::uuid)
),

fixture_qualifier (id) AS (
    VALUES ('0a000000-0000-4000-a000-000000000001'::uuid)
),

demo_team (id) AS (
    VALUES ('6ecdd1a6-63fe-4beb-b094-00118f334163'::uuid)
),

fixture_reviews AS (
    SELECT v.id
    FROM public.golf_round_reviews AS v
    WHERE v.round_id IN (SELECT fr.id FROM fixture_rounds AS fr)
),

affected_players AS (
    SELECT DISTINCT r.player_id
    FROM public.golf_rounds AS r
    WHERE r.id IN (SELECT fr.id FROM fixture_rounds AS fr)
),

-- The count block.  Keep the keys identical to the removal script's
-- BEFORE/AFTER notices so the three reports line up.
counts AS (
    SELECT
        (
            SELECT count(*) FROM public.golf_rounds AS r
            WHERE r.id IN (SELECT fr.id FROM fixture_rounds AS fr)
        ) AS rounds_in_set,
        (
            SELECT count(*) FROM public.golf_holes AS h
            WHERE h.round_id IN (SELECT fr.id FROM fixture_rounds AS fr)
        ) AS holes_in_set,
        (
            SELECT count(*) FROM public.golf_holes AS h
            WHERE h.round_id IN (SELECT fr.id FROM fixture_rounds AS fr)
                AND h.score IS NOT NULL
        ) AS scored_holes_in_set,
        (
            SELECT count(*) FROM public.golf_shots AS s
            WHERE s.round_id IN (SELECT fr.id FROM fixture_rounds AS fr)
        ) AS shots_in_set,
        (
            SELECT count(*) FROM public.golf_round_stats_cache AS c
            WHERE c.round_id IN (SELECT fr.id FROM fixture_rounds AS fr)
        ) AS stats_cache_in_set,
        (
            SELECT count(*) FROM public.golf_round_reviews AS v
            WHERE v.round_id IN (SELECT fr.id FROM fixture_rounds AS fr)
        ) AS reviews_in_set,
        (
            SELECT count(*) FROM public.golf_review_events AS e
            WHERE e.review_id IN (SELECT fv.id FROM fixture_reviews AS fv)
        ) AS review_events_in_set,
        (
            SELECT count(*) FROM public.golf_predictions AS p
            WHERE p.related_round_id IN (SELECT fr.id FROM fixture_rounds AS fr)
        ) AS predictions_related_round_in_set,
        (
            SELECT count(*) FROM public.golf_qualifier_entries AS e
            WHERE e.round_id IN (SELECT fr.id FROM fixture_rounds AS fr)
        ) AS entries_round_id_in_set,
        (
            SELECT count(*) FROM public.golf_player_focus_areas AS f
            WHERE f.from_review_id IN (SELECT fv.id FROM fixture_reviews AS fv)
        ) AS focus_areas_from_review_in_set,
        (
            SELECT count(*) FROM public.golf_qualifiers AS q
            WHERE q.id IN (SELECT fq.id FROM fixture_qualifier AS fq)
        ) AS qualifier_rows,
        (
            SELECT count(*) FROM public.golf_qualifier_entries AS e
            WHERE e.qualifier_id IN (SELECT fq.id FROM fixture_qualifier AS fq)
        ) AS qualifier_entries,
        (
            SELECT count(*) FROM public.golf_qualifier_round_courses AS c
            WHERE c.qualifier_id IN (SELECT fq.id FROM fixture_qualifier AS fq)
        ) AS qualifier_round_courses,
        (
            SELECT count(*) FROM public.golf_qualifier_selections AS s
            WHERE s.qualifier_id IN (SELECT fq.id FROM fixture_qualifier AS fq)
        ) AS qualifier_selections,
        (
            SELECT count(*) FROM public.golf_rounds AS r
            WHERE r.qualifier_id IN (SELECT fq.id FROM fixture_qualifier AS fq)
                AND r.id NOT IN (SELECT fr.id FROM fixture_rounds AS fr)
        ) AS rounds_outside_set_on_qualifier,
        (
            SELECT count(*) FROM public.golf_player_stats_cache AS c
            WHERE c.player_id IN (SELECT ap.player_id FROM affected_players AS ap)
        ) AS player_stats_cache_rows_for_affected_players
),

export AS (
    -- 0) What the live catalog says a delete will do.
    SELECT
        0 AS section,
        'catalog_fk' AS kind,
        con.conrelid::regclass::text || '.' || con.conname AS id,
        jsonb_build_object(
            'parent', con.confrelid::regclass::text,
            'on_delete', CASE con.confdeltype
                WHEN 'c' THEN 'CASCADE'
                WHEN 'n' THEN 'SET NULL'
                WHEN 'd' THEN 'SET DEFAULT'
                WHEN 'r' THEN 'RESTRICT'
                WHEN 'a' THEN 'NO ACTION'
            END,
            'definition', pg_get_constraintdef(con.oid)
        ) AS detail
    FROM pg_catalog.pg_constraint AS con
    WHERE con.contype = 'f'
        AND con.confrelid IN (
            'public.golf_rounds'::regclass,
            'public.golf_round_reviews'::regclass,
            'public.golf_qualifiers'::regclass,
            'public.golf_qualifier_entries'::regclass
        )

    UNION ALL

    SELECT
        0,
        'catalog_trigger',
        tg.tgrelid::regclass::text || '.' || tg.tgname,
        jsonb_build_object(
            'tgenabled', tg.tgenabled,
            'definition', pg_get_triggerdef(tg.oid)
        )
    FROM pg_catalog.pg_trigger AS tg
    WHERE NOT tg.tgisinternal
        AND tg.tgrelid IN (
            'public.golf_rounds'::regclass,
            'public.golf_holes'::regclass,
            'public.golf_shots'::regclass,
            'public.golf_round_stats_cache'::regclass,
            'public.golf_round_reviews'::regclass,
            'public.golf_qualifier_entries'::regclass,
            'public.golf_qualifiers'::regclass
        )

    UNION ALL

    -- 1) The rounds, full rows, with proof they carry nothing real.
    SELECT
        1,
        'round',
        r.id::text,
        to_jsonb(r) || jsonb_build_object(
            'hole_rows', (
                SELECT count(*) FROM public.golf_holes AS h
                WHERE h.round_id = r.id
            ),
            'scored_holes', (
                SELECT count(*) FROM public.golf_holes AS h
                WHERE h.round_id = r.id AND h.score IS NOT NULL
            ),
            'shot_rows', (
                SELECT count(*) FROM public.golf_shots AS s
                WHERE s.round_id = r.id
            )
        )
    FROM public.golf_rounds AS r
    WHERE r.id IN (SELECT fr.id FROM fixture_rounds AS fr)

    UNION ALL

    -- 2) ON DELETE CASCADE from golf_rounds: destroyed with the rounds.
    SELECT 2, 'cascade:golf_holes', h.id::text, to_jsonb(h)
    FROM public.golf_holes AS h
    WHERE h.round_id IN (SELECT fr.id FROM fixture_rounds AS fr)

    UNION ALL

    SELECT 2, 'cascade:golf_shots', s.id::text, to_jsonb(s)
    FROM public.golf_shots AS s
    WHERE s.round_id IN (SELECT fr.id FROM fixture_rounds AS fr)

    UNION ALL

    SELECT 2, 'cascade:golf_round_stats_cache', c.id::text, to_jsonb(c)
    FROM public.golf_round_stats_cache AS c
    WHERE c.round_id IN (SELECT fr.id FROM fixture_rounds AS fr)

    UNION ALL

    SELECT 2, 'cascade:golf_round_reviews', v.id::text, to_jsonb(v)
    FROM public.golf_round_reviews AS v
    WHERE v.round_id IN (SELECT fr.id FROM fixture_rounds AS fr)

    UNION ALL

    -- second order: CASCADE from golf_round_reviews
    SELECT 2, 'cascade:golf_review_events', e.id::text, to_jsonb(e)
    FROM public.golf_review_events AS e
    WHERE e.review_id IN (SELECT fv.id FROM fixture_reviews AS fv)

    UNION ALL

    -- 3) ON DELETE SET NULL: these rows SURVIVE with the column nulled.
    SELECT
        3, 'set_null:golf_predictions.related_round_id', p.id::text, to_jsonb(p)
    FROM public.golf_predictions AS p
    WHERE p.related_round_id IN (SELECT fr.id FROM fixture_rounds AS fr)

    UNION ALL

    SELECT
        3, 'set_null:golf_qualifier_entries.round_id', e.id::text, to_jsonb(e)
    FROM public.golf_qualifier_entries AS e
    WHERE e.round_id IN (SELECT fr.id FROM fixture_rounds AS fr)

    UNION ALL

    -- second order: SET NULL from golf_round_reviews
    SELECT
        3,
        'set_null:golf_player_focus_areas.from_review_id',
        f.id::text,
        to_jsonb(f)
    FROM public.golf_player_focus_areas AS f
    WHERE f.from_review_id IN (SELECT fv.id FROM fixture_reviews AS fv)

    UNION ALL

    -- 4) The QA qualifier and everything that cascades from it.
    SELECT 4, 'qualifier', q.id::text, to_jsonb(q)
    FROM public.golf_qualifiers AS q
    WHERE q.id IN (SELECT fq.id FROM fixture_qualifier AS fq)

    UNION ALL

    SELECT 4, 'qualifier_cascade:golf_qualifier_entries', e.id::text, to_jsonb(e)
    FROM public.golf_qualifier_entries AS e
    WHERE e.qualifier_id IN (SELECT fq.id FROM fixture_qualifier AS fq)

    UNION ALL

    SELECT
        4, 'qualifier_cascade:golf_qualifier_round_courses', c.id::text, to_jsonb(c)
    FROM public.golf_qualifier_round_courses AS c
    WHERE c.qualifier_id IN (SELECT fq.id FROM fixture_qualifier AS fq)

    UNION ALL

    SELECT
        4,
        'qualifier_cascade:golf_qualifier_selections',
        s.qualifier_id::text || ':' || s.player_id::text,
        to_jsonb(s)
    FROM public.golf_qualifier_selections AS s
    WHERE s.qualifier_id IN (SELECT fq.id FROM fixture_qualifier AS fq)

    UNION ALL

    -- Rounds NOT in the set that point at the QA qualifier.  Deleting the
    -- qualifier would SET NULL their qualifier_id: real data edited.  Must be
    -- empty; the removal script refuses otherwise.
    SELECT
        4,
        'qualifier_set_null:golf_rounds_OUTSIDE_set_MUST_BE_EMPTY',
        r.id::text,
        to_jsonb(r)
    FROM public.golf_rounds AS r
    WHERE r.qualifier_id IN (SELECT fq.id FROM fixture_qualifier AS fq)
        AND r.id NOT IN (SELECT fr.id FROM fixture_rounds AS fr)

    UNION ALL

    -- 5) Before-image of the per-player cache rows the cascade recomputes.
    SELECT 5, 'recomputed:golf_player_stats_cache', c.player_id::text, to_jsonb(c)
    FROM public.golf_player_stats_cache AS c
    WHERE c.player_id IN (SELECT ap.player_id FROM affected_players AS ap)

    UNION ALL

    -- 6) The count block, one row per key.
    SELECT 6, 'count', kv.key, kv.value
    FROM counts AS c, jsonb_each(to_jsonb(c)) AS kv

    UNION ALL

    -- 7) Preconditions.  The id names the value each must have.
    SELECT
        7,
        'assert',
        'rounds_with_real_data_MUST_BE_ZERO',
        to_jsonb(count(*))
    FROM public.golf_rounds AS r
    WHERE r.id IN (SELECT fr.id FROM fixture_rounds AS fr)
        AND (
            EXISTS (
                SELECT 1 FROM public.golf_holes AS h
                WHERE h.round_id = r.id AND h.score IS NOT NULL
            )
            OR EXISTS (
                SELECT 1 FROM public.golf_shots AS s
                WHERE s.round_id = r.id
            )
        )

    UNION ALL

    SELECT
        7,
        'assert',
        'rounds_in_set_on_a_team_other_than_demo_MUST_BE_ZERO',
        to_jsonb(count(*))
    FROM public.golf_rounds AS r
    WHERE r.id IN (SELECT fr.id FROM fixture_rounds AS fr)
        AND r.team_id IS NOT NULL
        AND r.team_id NOT IN (SELECT dt.id FROM demo_team AS dt)

    UNION ALL

    SELECT
        7,
        'assert',
        'qualifier_on_a_team_other_than_demo_MUST_BE_ZERO',
        to_jsonb(count(*))
    FROM public.golf_qualifiers AS q
    WHERE q.id IN (SELECT fq.id FROM fixture_qualifier AS fq)
        AND q.team_id NOT IN (SELECT dt.id FROM demo_team AS dt)

    UNION ALL

    SELECT
        7,
        'assert',
        'rounds_outside_set_on_fixture_qualifier_MUST_BE_ZERO',
        to_jsonb(c.rounds_outside_set_on_qualifier)
    FROM counts AS c

    UNION ALL

    SELECT
        7,
        'assert',
        'guard_trigger_tgenabled_MUST_BE_O',
        to_jsonb(tg.tgenabled::text)
    FROM pg_catalog.pg_trigger AS tg
    WHERE tg.tgrelid = 'public.golf_rounds'::regclass
        AND tg.tgname = 'golf_rounds_guard_lifecycle'
        AND NOT tg.tgisinternal

    UNION ALL

    SELECT
        7,
        'assert',
        'guard_trigger_rows_found_MUST_BE_ONE',
        to_jsonb(count(*))
    FROM pg_catalog.pg_trigger AS tg
    WHERE tg.tgrelid = 'public.golf_rounds'::regclass
        AND tg.tgname = 'golf_rounds_guard_lifecycle'
        AND NOT tg.tgisinternal

    UNION ALL

    SELECT
        7,
        'assert',
        'current_user_MUST_BE_postgres',
        to_jsonb(current_user::text)

    UNION ALL

    -- DISABLE TRIGGER needs the table owner (or a member of the owning role)
    -- or a superuser.  This is exactly the check the removal script makes.
    SELECT
        7,
        'assert',
        'can_alter_golf_rounds_MUST_BE_true',
        to_jsonb(
            pg_has_role(current_user, cl.relowner, 'USAGE')
            OR (SELECT ro.rolsuper FROM pg_catalog.pg_roles AS ro WHERE ro.rolname = current_user)
        )
    FROM pg_catalog.pg_class AS cl
    WHERE cl.oid = 'public.golf_rounds'::regclass

    UNION ALL

    -- 8) Context.  Not gates.
    SELECT
        8,
        'info',
        'integrity6_global_count',
        to_jsonb(count(*))
    FROM public.golf_rounds AS r
    WHERE r.status = 'completed'
        AND NOT EXISTS (
            SELECT 1 FROM public.golf_holes AS h
            WHERE h.round_id = r.id AND h.score IS NOT NULL
        )

    UNION ALL

    SELECT
        8,
        'info',
        'integrity6_count_outside_fixture_set',
        to_jsonb(count(*))
    FROM public.golf_rounds AS r
    WHERE r.status = 'completed'
        AND r.id NOT IN (SELECT fr.id FROM fixture_rounds AS fr)
        AND NOT EXISTS (
            SELECT 1 FROM public.golf_holes AS h
            WHERE h.round_id = r.id AND h.score IS NOT NULL
        )

    UNION ALL

    SELECT
        8,
        'info',
        'golf_rounds_owner',
        to_jsonb(pg_get_userbyid(cl.relowner)::text)
    FROM pg_catalog.pg_class AS cl
    WHERE cl.oid = 'public.golf_rounds'::regclass

    UNION ALL

    SELECT
        8,
        'info',
        'guard_function_fingerprint',
        jsonb_build_object(
            'md5', md5(pg_get_functiondef(
                'helm_private.guard_golf_round_lifecycle()'::regprocedure
            )),
            'length', length(pg_get_functiondef(
                'helm_private.guard_golf_round_lifecycle()'::regprocedure
            ))
        )

    UNION ALL

    SELECT
        8,
        'info',
        'run_context',
        jsonb_build_object(
            'server_version', current_setting('server_version'),
            'database', current_database(),
            'captured_at', now()
        )
)

SELECT
    section,
    kind,
    id,
    detail
FROM export
ORDER BY section, kind, id;
