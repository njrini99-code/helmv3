-- ============================================================================
-- Remove the QA fixtures seeded directly into production on 2026-08-31.
--
-- OWNER-ONLY.  Run against project qmnssrrolpinvwjjnufo as the `postgres`
-- role.  Two things make this owner-only, and the script checks both before
-- touching a row:
--   * `ALTER TABLE ... DISABLE TRIGGER` needs the table OWNER (postgres owns
--     public.golf_rounds) or a superuser.  Nothing below that can run it.
--   * every bypass in the lifecycle guards is keyed on current_user being
--     exactly `postgres`.
--
-- RUN ORDER (from the repo root):
--
--   1. scripts/remove-qa-fixtures-2026-08-31-dryrun.sql FIRST.  Read-only.
--      Its output is the export; keep the file.  Every 'assert' row must
--      carry the value its id names, or this script refuses on the same
--      condition.
--
--   2. Optional rehearsal — everything below runs, nothing commits:
--        sed 's/^COMMIT;$/ROLLBACK;/' scripts/remove-qa-fixtures-2026-08-31.sql \
--          | psql "$HELM_PROD_DB_URL_DIRECT" -X -v ON_ERROR_STOP=1 -f -
--      The trailing SELECT then shows the rows still present, as expected.
--
--   3. The removal:
--        psql "$HELM_PROD_DB_URL_DIRECT" -X -v ON_ERROR_STOP=1 \
--          -f scripts/remove-qa-fixtures-2026-08-31.sql \
--          > "qa-fixtures-removal-$(date -u +%Y%m%dT%H%M%SZ).log" 2>&1
--        echo "exit=$?"
--      exit 0 and a COMMIT line in the log = done.  exit 3 = psql stopped on
--      the first error and NEVER reached COMMIT; the server rolled the open
--      transaction back when the connection closed.  Nothing partial can
--      survive: every statement sits inside the one BEGIN ... COMMIT.
--
--   4. Only then apply supabase/migrations/20260901120000_* per its row in
--      supabase/migrations/HELD.md.  Its check 6 goes fail/4 -> pass/0.
--
-- Use psql, not the dashboard SQL editor: the editor shows only the last
-- result set and drops the NOTICE lines that carry the BEFORE/AFTER report.
--
-- EXPLICIT ROLLBACK PATH.  Any RAISE below aborts the transaction; with
-- -v ON_ERROR_STOP=1 psql exits and the server rolls back on disconnect.  In
-- an interactive session (\i), type ROLLBACK; yourself.  There is no state
-- in which the guard trigger is left disabled: the DISABLE and the ENABLE are
-- in the same transaction, so a failure between them rolls the DISABLE back
-- with everything else, and the post-check refuses to COMMIT unless the
-- trigger reads enabled again.
--
-- WHY THE TRIGGER TOGGLE.  `golf_rounds_guard_lifecycle` (BEFORE DELETE,
-- helm_private.guard_golf_round_lifecycle) raises 55000 on deleting a
-- completed round, and four of the five fixtures are completed.  The
-- `helm.golf_lifecycle_write = 'atomic'` marker does NOT get past it: in the
-- guard text applied to production (20260825090000) that branch is UPDATE-
-- only, so the DELETE still raises; in the HELD rewrite (20260830120000) it
-- returns bare NEW, which is NULL in a BEFORE DELETE row trigger, so the
-- delete silently becomes a no-op.  Either way the round survives.  The only
-- clean route is to disable that one trigger, for this one statement, inside
-- this one transaction.  `session_replication_role = replica` is NOT used —
-- it would also silence the FK cascade triggers, and the cascades are wanted.
--
-- LOCKING.  ALTER TABLE ... DISABLE/ENABLE TRIGGER takes SHARE ROW EXCLUSIVE
-- on public.golf_rounds until COMMIT, so live round writes queue for the
-- (sub-second) life of this transaction.  lock_timeout is set so this script
-- fails fast instead of queueing behind a long transaction and holding every
-- later writer behind it.  Run it at a quiet moment; re-run if it times out.
--
-- WHAT ELSE MOVES.  Deleting the rounds cascades to golf_holes, golf_shots,
-- golf_round_stats_cache, golf_round_reviews (and golf_review_events from
-- there); SET NULLs golf_predictions.related_round_id,
-- golf_qualifier_entries.round_id and golf_player_focus_areas.from_review_id;
-- and the cascaded stats-cache delete fires trg_update_player_stats_complete,
-- which rewrites the affected players' golf_player_stats_cache rows from the
-- rounds that remain.  The dry run exports all of it.  The BEFORE/AFTER
-- notices here carry the same count keys.
--
-- SCOPE.  Explicit id lists, never a LIKE pattern.  Every DELETE names its
-- ids.  The post-check gates ONLY on the fixture set; integrity check 6's
-- global count is reported as information, never as a reason to abort, so an
-- unrelated broken round appearing elsewhere cannot block this cleanup.
--
-- IDEMPOTENT.  A second run finds nothing, deletes nothing, and commits.
--
-- WHY THESE ARE FIXTURES.  See the dry run's header — the forensics live in
-- one place.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

-- 0) Who is running this, and can they.  Refuse before reading a data row.
DO $$
DECLARE
    v_owner oid;
    v_state text;
BEGIN
    IF current_user <> 'postgres' THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = format(
                'REFUSING: run as postgres, not %s. Every lifecycle-guard bypass is keyed on that exact role.',
                current_user
            );
    END IF;

    SELECT c.relowner INTO v_owner
    FROM pg_catalog.pg_class AS c
    WHERE c.oid = 'public.golf_rounds'::regclass;

    IF NOT (
        pg_has_role(current_user, v_owner, 'USAGE')
        OR (
            SELECT r.rolsuper FROM pg_catalog.pg_roles AS r
            WHERE r.rolname = current_user
        )
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = format(
                'REFUSING: %s cannot ALTER TABLE public.golf_rounds (owner is %s). DISABLE TRIGGER needs the table owner or a superuser.',
                current_user, pg_get_userbyid(v_owner)
            );
    END IF;

    SELECT t.tgenabled::text INTO v_state
    FROM pg_catalog.pg_trigger AS t
    WHERE t.tgrelid = 'public.golf_rounds'::regclass
        AND t.tgname = 'golf_rounds_guard_lifecycle'
        AND NOT t.tgisinternal;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'REFUSING: trigger golf_rounds_guard_lifecycle is not on public.golf_rounds. The schema has moved; re-derive this script before running it.';
    END IF;

    IF v_state <> 'O' THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = format(
                'REFUSING: golf_rounds_guard_lifecycle is in state %s, expected O (enabled). Something else has touched it; investigate first.',
                v_state
            );
    END IF;
END $$;

-- 1) Refuse to run if anything in the delete set looks like real data.
DO $$
DECLARE
    v_round_ids constant uuid[] := ARRAY[
        '0b000000-0000-4000-b000-000000000001',
        '0b000000-0000-4000-b000-000000000002',
        '0b000000-0000-4000-b000-000000000003',
        '0b000000-0000-4000-b000-000000000004',
        '0b000000-0000-4000-b000-000000000005'
    ]::uuid[];
    v_qualifier_id constant uuid := '0a000000-0000-4000-a000-000000000001';
    v_demo_team constant uuid := '6ecdd1a6-63fe-4beb-b094-00118f334163';
    v_n integer;
BEGIN
    -- A scored hole or a shot means a real round acquired one of these ids.
    SELECT count(*) INTO v_n
    FROM public.golf_rounds AS r
    WHERE r.id = ANY (v_round_ids)
        AND (
            EXISTS (
                SELECT 1 FROM public.golf_holes AS h
                WHERE h.round_id = r.id AND h.score IS NOT NULL
            )
            OR EXISTS (
                SELECT 1 FROM public.golf_shots AS s
                WHERE s.round_id = r.id
            )
        );
    IF v_n > 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = format(
                'REFUSING: %s round(s) in the fixture id set carry scored holes or shots. These are not fixtures. Nothing deleted.',
                v_n
            );
    END IF;

    -- A fixture id on a real team is not a fixture.
    SELECT count(*) INTO v_n
    FROM public.golf_rounds AS r
    WHERE r.id = ANY (v_round_ids)
        AND r.team_id IS NOT NULL
        AND r.team_id <> v_demo_team;
    IF v_n > 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = format(
                'REFUSING: %s round(s) in the fixture id set belong to a team other than the demo team. Nothing deleted.',
                v_n
            );
    END IF;

    SELECT count(*) INTO v_n
    FROM public.golf_qualifiers AS q
    WHERE q.id = v_qualifier_id
        AND q.team_id <> v_demo_team;
    IF v_n > 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'REFUSING: the QA qualifier id belongs to a team other than the demo team. Nothing deleted.';
    END IF;

    -- Deleting the qualifier SET NULLs qualifier_id on every round that
    -- points at it.  Only the five fixtures may.
    SELECT count(*) INTO v_n
    FROM public.golf_rounds AS r
    WHERE r.qualifier_id = v_qualifier_id
        AND NOT (r.id = ANY (v_round_ids));
    IF v_n > 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = format(
                'REFUSING: %s round(s) outside the fixture set reference the QA qualifier; deleting it would edit real rows. Nothing deleted.',
                v_n
            );
    END IF;
END $$;

-- 2) BEFORE counts.  Same keys as the dry run's section 6 and the AFTER
--    notice below.  The affected player ids are stashed in a transaction-
--    local setting so the AFTER block can still name them once the rounds
--    are gone.
DO $$
DECLARE
    v_round_ids constant uuid[] := ARRAY[
        '0b000000-0000-4000-b000-000000000001',
        '0b000000-0000-4000-b000-000000000002',
        '0b000000-0000-4000-b000-000000000003',
        '0b000000-0000-4000-b000-000000000004',
        '0b000000-0000-4000-b000-000000000005'
    ]::uuid[];
    v_qualifier_id constant uuid := '0a000000-0000-4000-a000-000000000001';
    v_players text;
    v_counts jsonb;
BEGIN
    SELECT coalesce(string_agg(DISTINCT r.player_id::text, ','), '') INTO v_players
    FROM public.golf_rounds AS r
    WHERE r.id = ANY (v_round_ids);
    PERFORM set_config('helm.qa_fixture_affected_players', v_players, true);

    SELECT jsonb_build_object(
        'rounds_in_set', (SELECT count(*) FROM public.golf_rounds AS r WHERE r.id = ANY (v_round_ids)),
        'holes_in_set', (SELECT count(*) FROM public.golf_holes AS h WHERE h.round_id = ANY (v_round_ids)),
        'scored_holes_in_set', (SELECT count(*) FROM public.golf_holes AS h WHERE h.round_id = ANY (v_round_ids) AND h.score IS NOT NULL),
        'shots_in_set', (SELECT count(*) FROM public.golf_shots AS s WHERE s.round_id = ANY (v_round_ids)),
        'stats_cache_in_set', (SELECT count(*) FROM public.golf_round_stats_cache AS c WHERE c.round_id = ANY (v_round_ids)),
        'reviews_in_set', (SELECT count(*) FROM public.golf_round_reviews AS v WHERE v.round_id = ANY (v_round_ids)),
        'review_events_in_set', (SELECT count(*) FROM public.golf_review_events AS e WHERE e.review_id IN (SELECT v.id FROM public.golf_round_reviews AS v WHERE v.round_id = ANY (v_round_ids))),
        'predictions_related_round_in_set', (SELECT count(*) FROM public.golf_predictions AS p WHERE p.related_round_id = ANY (v_round_ids)),
        'entries_round_id_in_set', (SELECT count(*) FROM public.golf_qualifier_entries AS e WHERE e.round_id = ANY (v_round_ids)),
        'focus_areas_from_review_in_set', (SELECT count(*) FROM public.golf_player_focus_areas AS f WHERE f.from_review_id IN (SELECT v.id FROM public.golf_round_reviews AS v WHERE v.round_id = ANY (v_round_ids))),
        'qualifier_rows', (SELECT count(*) FROM public.golf_qualifiers AS q WHERE q.id = v_qualifier_id),
        'qualifier_entries', (SELECT count(*) FROM public.golf_qualifier_entries AS e WHERE e.qualifier_id = v_qualifier_id),
        'qualifier_round_courses', (SELECT count(*) FROM public.golf_qualifier_round_courses AS c WHERE c.qualifier_id = v_qualifier_id),
        'qualifier_selections', (SELECT count(*) FROM public.golf_qualifier_selections AS s WHERE s.qualifier_id = v_qualifier_id),
        'rounds_outside_set_on_qualifier', (SELECT count(*) FROM public.golf_rounds AS r WHERE r.qualifier_id = v_qualifier_id AND NOT (r.id = ANY (v_round_ids))),
        'player_stats_cache_rows_for_affected_players', (SELECT count(*) FROM public.golf_player_stats_cache AS c WHERE c.player_id = ANY (string_to_array(v_players, ',')::uuid[]))
    ) INTO v_counts;

    RAISE NOTICE E'BEFORE (fixture set, affected players: %):\n%',
        coalesce(nullif(v_players, ''), 'none'), jsonb_pretty(v_counts);

    IF (v_counts ->> 'rounds_in_set')::integer = 0
        AND (v_counts ->> 'qualifier_rows')::integer = 0 THEN
        RAISE NOTICE 'NO-OP: the fixture set is already absent. The statements below delete nothing and the transaction commits clean.';
    END IF;
END $$;

-- 3) Transaction-scoped marker.  helm_private.reject_completed_round_child_
--    mutation (BEFORE DELETE on golf_holes / golf_shots) and the totals
--    recompute that a hole delete triggers both honour it for postgres.  It
--    lets an UNSCORED hole row on a completed fixture go; the scored case
--    was refused in step 1.  SET LOCAL reverts at COMMIT or ROLLBACK, and
--    step 6 blanks it before the qualifier is touched.
SET LOCAL helm.golf_lifecycle_write = 'atomic';

-- 4) Shots and holes first (expected 0 rows each — belt and braces; step 1
--    has already proven none carries a score).
DELETE FROM public.golf_shots
WHERE round_id IN (
    '0b000000-0000-4000-b000-000000000001',
    '0b000000-0000-4000-b000-000000000002',
    '0b000000-0000-4000-b000-000000000003',
    '0b000000-0000-4000-b000-000000000004',
    '0b000000-0000-4000-b000-000000000005'
);

DELETE FROM public.golf_holes
WHERE round_id IN (
    '0b000000-0000-4000-b000-000000000001',
    '0b000000-0000-4000-b000-000000000002',
    '0b000000-0000-4000-b000-000000000003',
    '0b000000-0000-4000-b000-000000000004',
    '0b000000-0000-4000-b000-000000000005'
);

-- 5) The rounds.  The lifecycle guard is off for exactly this statement.
--    Cascades (stats cache, reviews) and SET NULLs (predictions, entries)
--    happen here; the stats-cache cascade recomputes the players' caches.
ALTER TABLE public.golf_rounds DISABLE TRIGGER golf_rounds_guard_lifecycle;

DELETE FROM public.golf_rounds
WHERE id IN (
    '0b000000-0000-4000-b000-000000000001',
    '0b000000-0000-4000-b000-000000000002',
    '0b000000-0000-4000-b000-000000000003',
    '0b000000-0000-4000-b000-000000000004',
    '0b000000-0000-4000-b000-000000000005'
);

ALTER TABLE public.golf_rounds ENABLE TRIGGER golf_rounds_guard_lifecycle;

-- 6) Guard fully re-armed before the qualifier goes.  If any round outside
--    the set still pointed at it, the FK's SET NULL would now hit the guard
--    and raise 55000 — a second line behind the step-1 refusal.
SET LOCAL helm.golf_lifecycle_write = '';

DELETE FROM public.golf_qualifier_entries
WHERE qualifier_id = '0a000000-0000-4000-a000-000000000001';

DELETE FROM public.golf_qualifiers
WHERE id = '0a000000-0000-4000-a000-000000000001';

-- 7) Post-check, inside the transaction.  Gated on the FIXTURE SET ONLY.
DO $$
DECLARE
    v_round_ids constant uuid[] := ARRAY[
        '0b000000-0000-4000-b000-000000000001',
        '0b000000-0000-4000-b000-000000000002',
        '0b000000-0000-4000-b000-000000000003',
        '0b000000-0000-4000-b000-000000000004',
        '0b000000-0000-4000-b000-000000000005'
    ]::uuid[];
    v_qualifier_id constant uuid := '0a000000-0000-4000-a000-000000000001';
    v_players text;
    v_counts jsonb;
    v_key text;
    v_state text;
    v_global integer;
BEGIN
    v_players := coalesce(current_setting('helm.qa_fixture_affected_players', true), '');

    SELECT jsonb_build_object(
        'rounds_in_set', (SELECT count(*) FROM public.golf_rounds AS r WHERE r.id = ANY (v_round_ids)),
        'holes_in_set', (SELECT count(*) FROM public.golf_holes AS h WHERE h.round_id = ANY (v_round_ids)),
        'scored_holes_in_set', (SELECT count(*) FROM public.golf_holes AS h WHERE h.round_id = ANY (v_round_ids) AND h.score IS NOT NULL),
        'shots_in_set', (SELECT count(*) FROM public.golf_shots AS s WHERE s.round_id = ANY (v_round_ids)),
        'stats_cache_in_set', (SELECT count(*) FROM public.golf_round_stats_cache AS c WHERE c.round_id = ANY (v_round_ids)),
        'reviews_in_set', (SELECT count(*) FROM public.golf_round_reviews AS v WHERE v.round_id = ANY (v_round_ids)),
        'review_events_in_set', (SELECT count(*) FROM public.golf_review_events AS e WHERE e.review_id IN (SELECT v.id FROM public.golf_round_reviews AS v WHERE v.round_id = ANY (v_round_ids))),
        'predictions_related_round_in_set', (SELECT count(*) FROM public.golf_predictions AS p WHERE p.related_round_id = ANY (v_round_ids)),
        'entries_round_id_in_set', (SELECT count(*) FROM public.golf_qualifier_entries AS e WHERE e.round_id = ANY (v_round_ids)),
        'focus_areas_from_review_in_set', (SELECT count(*) FROM public.golf_player_focus_areas AS f WHERE f.from_review_id IN (SELECT v.id FROM public.golf_round_reviews AS v WHERE v.round_id = ANY (v_round_ids))),
        'qualifier_rows', (SELECT count(*) FROM public.golf_qualifiers AS q WHERE q.id = v_qualifier_id),
        'qualifier_entries', (SELECT count(*) FROM public.golf_qualifier_entries AS e WHERE e.qualifier_id = v_qualifier_id),
        'qualifier_round_courses', (SELECT count(*) FROM public.golf_qualifier_round_courses AS c WHERE c.qualifier_id = v_qualifier_id),
        'qualifier_selections', (SELECT count(*) FROM public.golf_qualifier_selections AS s WHERE s.qualifier_id = v_qualifier_id),
        'rounds_outside_set_on_qualifier', (SELECT count(*) FROM public.golf_rounds AS r WHERE r.qualifier_id = v_qualifier_id AND NOT (r.id = ANY (v_round_ids))),
        'player_stats_cache_rows_for_affected_players', (SELECT count(*) FROM public.golf_player_stats_cache AS c WHERE c.player_id = ANY (string_to_array(v_players, ',')::uuid[]))
    ) INTO v_counts;

    RAISE NOTICE E'AFTER (fixture set, affected players: %):\n%',
        coalesce(nullif(v_players, ''), 'none'), jsonb_pretty(v_counts);

    -- Everything scoped to the set must be gone.  The one key not in this
    -- list is player_stats_cache_rows_for_affected_players: those rows are
    -- recomputed, not deleted, and legitimately survive when the player has
    -- other cached rounds.
    FOREACH v_key IN ARRAY ARRAY[
        'rounds_in_set', 'holes_in_set', 'scored_holes_in_set', 'shots_in_set',
        'stats_cache_in_set', 'reviews_in_set', 'review_events_in_set',
        'predictions_related_round_in_set', 'entries_round_id_in_set',
        'focus_areas_from_review_in_set',
        'qualifier_rows', 'qualifier_entries', 'qualifier_round_courses',
        'qualifier_selections', 'rounds_outside_set_on_qualifier'
    ] LOOP
        IF (v_counts ->> v_key)::integer <> 0 THEN
            RAISE EXCEPTION USING
                ERRCODE = '55000',
                MESSAGE = format(
                    'POST-CHECK: %s = %s after the deletes, expected 0. Rolling back so the cause can be investigated before any deletion stands.',
                    v_key, v_counts ->> v_key
                );
        END IF;
    END LOOP;

    -- The guard must be back exactly as found.
    SELECT t.tgenabled::text INTO v_state
    FROM pg_catalog.pg_trigger AS t
    WHERE t.tgrelid = 'public.golf_rounds'::regclass
        AND t.tgname = 'golf_rounds_guard_lifecycle'
        AND NOT t.tgisinternal;
    IF NOT FOUND OR v_state <> 'O' THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = format(
                'POST-CHECK: golf_rounds_guard_lifecycle reads %s, expected O (enabled). Rolling back rather than commit with the guard off.',
                coalesce(v_state, 'missing')
            );
    END IF;

    IF coalesce(current_setting('helm.golf_lifecycle_write', true), '') <> '' THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'POST-CHECK: the helm.golf_lifecycle_write marker is still set. Rolling back.';
    END IF;

    -- Information only.  Integrity check 6 across the whole table: rounds
    -- with status=completed and no scored hole.  This number is NOT a gate
    -- — a broken round anywhere else is its own investigation, not a reason
    -- to keep the fixtures.
    SELECT count(*) INTO v_global
    FROM public.golf_rounds AS r
    WHERE r.status = 'completed'
        AND NOT EXISTS (
            SELECT 1 FROM public.golf_holes AS h
            WHERE h.round_id = r.id AND h.score IS NOT NULL
        );
    RAISE NOTICE 'INFO: integrity check 6 (completed rounds with zero scored holes), whole table, after: % (was 4 fixtures + whatever else exists; 0 means the migration''s check 6 will report pass).', v_global;
END $$;

COMMIT;

-- 8) Read-only, OUTSIDE the transaction: what the committed state says.
--    After the real run every _EXPECT_0 value is 0 and the trigger reads O.
--    After a rehearsal (COMMIT swapped for ROLLBACK) the rows are still here.
SELECT
    kv.key AS "check",
    kv.value
FROM jsonb_each(jsonb_build_object(
    'rounds_in_set_EXPECT_0', (
        SELECT count(*) FROM public.golf_rounds AS r
        WHERE r.id IN (
            '0b000000-0000-4000-b000-000000000001',
            '0b000000-0000-4000-b000-000000000002',
            '0b000000-0000-4000-b000-000000000003',
            '0b000000-0000-4000-b000-000000000004',
            '0b000000-0000-4000-b000-000000000005'
        )
    ),
    'qualifier_rows_EXPECT_0', (
        SELECT count(*) FROM public.golf_qualifiers AS q
        WHERE q.id = '0a000000-0000-4000-a000-000000000001'
    ),
    'guard_trigger_tgenabled_EXPECT_O', (
        SELECT t.tgenabled::text FROM pg_catalog.pg_trigger AS t
        WHERE t.tgrelid = 'public.golf_rounds'::regclass
            AND t.tgname = 'golf_rounds_guard_lifecycle'
            AND NOT t.tgisinternal
    ),
    'integrity6_global_count_INFO', (
        SELECT count(*) FROM public.golf_rounds AS r
        WHERE r.status = 'completed'
            AND NOT EXISTS (
                SELECT 1 FROM public.golf_holes AS h
                WHERE h.round_id = r.id AND h.score IS NOT NULL
            )
    )
)) AS kv
ORDER BY kv.key;
