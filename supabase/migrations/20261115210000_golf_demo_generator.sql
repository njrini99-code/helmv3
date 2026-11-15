-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- Written 15 Nov 2026 for the demo team generator (launch readiness DD-01,
--   DD-03, DD-06 to DD-11, DD-16 to DD-18). Not applied anywhere, not run
--   against any database.
--
-- Apply: npm run db:apply --
--   supabase/migrations/20261115210000_golf_demo_generator.sql
--   after npm run test:rls passes (the pgTAP file is
--   supabase/tests/rls/golf_demo_generator.sql). Applying it writes no team
--   data: the generator writes only when its cron or script runs with
--   --apply, which is a separate owner step.
--
-- Risk: LOW. One new private table and six new functions; no existing
--   table, column, policy, trigger or function changes. The functions run as
--   the owner, are callable by service_role only, and refuse every team but
--   the demo team (6ecdd1a6-63fe-4beb-b094-00118f334163) and every table
--   outside the generator's list of 26.
--
-- What:
--   helm_private.golf_demo_ledger  one row per row the generator wrote: team,
--                                  table, primary key as text, a hash of what
--                                  was written, generator version. It is how
--                                  the generator knows which rows are its own.
--   public.golf_demo_begin(team, prune)
--                                  with prune (the default), drops ledger rows
--                                  whose table row no longer exists (a cascade,
--                                  a hand delete); then returns the ledger as
--                                  {table: {key: hash}}. A dry run passes
--                                  prune = false and writes nothing.
--   public.golf_demo_apply(team, table, items, version)
--                                  upserts up to 2000 rows of one table, each
--                                  item {hash, row}. Refuses a row of another
--                                  team, a row whose parent (round, event,
--                                  qualifier, task, conversation) is on
--                                  another team, and columns the table does
--                                  not have. A row whose key already exists
--                                  but is not in the ledger is SKIPPED and
--                                  returned: the generator never overwrites a
--                                  row it did not write.
--   public.golf_demo_remove(team, table, keys)
--                                  deletes up to 5000 rows by primary key,
--                                  only those the ledger says the generator
--                                  wrote for the demo team.
--   public.golf_demo_finish_rounds(team, rounds, version)
--                                  for up to 50 generator rounds ({id, hash}):
--                                  recompute the totals from the holes, refire
--                                  the round stats cache, strokes gained; then
--                                  each player's season figures. Records each
--                                  round as finished in the ledger (table
--                                  'golf_rounds#finished', the hash of the
--                                  round with its holes and shots), so a run
--                                  that stops between writing and finishing is
--                                  finished by the next one.
--   Writes run with the transaction-local marks the round and tournament
--   guards already honour for owner writes (helm.golf_lifecycle_write =
--   'atomic', helm.tournament_write = 'rounds' or 'substitute'), with live
--   round broadcast and per-hole total recomputes off (finish recomputes
--   once per round), and with helm.golf_demo_writer = 'generator', which the
--   demo write guard (20261115210100) lets through.
--
-- RLS: the ledger has RLS on, a deny-all policy, and no grants to anon or
--   authenticated. Every function: REVOKE ALL FROM PUBLIC, anon,
--   authenticated; GRANT EXECUTE TO service_role (public ones only).
--
-- Code: src/lib/golf/demo/writer.ts (the only caller), run by
--   src/app/api/cron/golf-demo-refresh/route.ts and
--   scripts/golf-demo-refresh.ts. Without this migration the writer stops at
--   golf_demo_begin with "plumbing missing" and writes nothing.
--
-- ORDER: before 20261115210100 (the write guard reads helm.golf_demo_writer
--   and helm_private.golf_demo_team_id from here). Independent of every other
--   held migration.
--
-- VERIFY: select 1 where exists (select 1 from pg_catalog.pg_class c
-- VERIFY:   where c.oid = pg_catalog.to_regclass('helm_private.golf_demo_ledger')
-- VERIFY:   and c.relrowsecurity);
-- VERIFY: select 1 where helm_private.golf_demo_team_id()
-- VERIFY:   = '6ecdd1a6-63fe-4beb-b094-00118f334163'::uuid
-- VERIFY:   and cardinality(helm_private.golf_demo_tables()) = 26;
-- VERIFY: select 1 where has_function_privilege('service_role',
-- VERIFY:   'public.golf_demo_apply(uuid,text,jsonb,integer)', 'execute')
-- VERIFY:   and not has_function_privilege('anon',
-- VERIFY:   'public.golf_demo_apply(uuid,text,jsonb,integer)', 'execute')
-- VERIFY:   and not has_function_privilege('authenticated',
-- VERIFY:   'public.golf_demo_apply(uuid,text,jsonb,integer)', 'execute');
-- VERIFY: select 1 where has_function_privilege('service_role',
-- VERIFY:   'public.golf_demo_remove(uuid,text,jsonb)', 'execute')
-- VERIFY:   and not has_function_privilege('authenticated',
-- VERIFY:   'public.golf_demo_remove(uuid,text,jsonb)', 'execute')
-- VERIFY:   and has_function_privilege('service_role',
-- VERIFY:   'public.golf_demo_begin(uuid,boolean)', 'execute')
-- VERIFY:   and not has_function_privilege('authenticated',
-- VERIFY:   'public.golf_demo_begin(uuid,boolean)', 'execute')
-- VERIFY:   and has_function_privilege('service_role',
-- VERIFY:   'public.golf_demo_finish_rounds(uuid,jsonb,integer)', 'execute')
-- VERIFY:   and not has_function_privilege('authenticated',
-- VERIFY:   'public.golf_demo_finish_rounds(uuid,jsonb,integer)', 'execute');
--
-- ROLLBACK (one transaction; supabase/rollbacks/
--   20261115210000_golf_demo_generator.rollback.sql):
-- ROLLBACK: drop function public.golf_demo_finish_rounds(uuid, jsonb, integer),
--   public.golf_demo_remove(uuid, text, jsonb),
--   public.golf_demo_apply(uuid, text, jsonb, integer),
--   public.golf_demo_begin(uuid, boolean); drop the helm_private helpers
--   (golf_demo_check, golf_demo_key_sql, golf_demo_pk, golf_demo_parent,
--   golf_demo_tables) and table helm_private.golf_demo_ledger.
--   Keep helm_private.golf_demo_team_id() if 20261115210100 is applied (its
--   guard calls it); drop it otherwise.
--   Cost of rolling back: the generator can no longer write (the cron and
--   script stop at begin). Rows it already wrote stay on the demo team; the
--   ledger that marks them as generated is gone, so a later re-apply treats
--   them as not its own and skips them until they are removed by hand (the
--   rollback file prints the query that lists them first).

-- No BEGIN or COMMIT in this file: db:apply runs the whole file and its ledger
-- row in one transaction, and a COMMIT here would close that transaction
-- before the ledger row is written.
SET lock_timeout = '3s';

-- ------------------------------------------------------------------ the team and its tables

CREATE OR REPLACE FUNCTION helm_private.golf_demo_team_id()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT '6ecdd1a6-63fe-4beb-b094-00118f334163'::uuid
$$;

COMMENT ON FUNCTION helm_private.golf_demo_team_id() IS
  'The one team the demo generator writes (src/lib/demo/config.ts DEMO_TEAM_ID).';

-- The same list, in the same order, as DEMO_TABLES in src/lib/golf/demo/generate.ts
-- (a test reads this file and compares).
CREATE OR REPLACE FUNCTION helm_private.golf_demo_tables()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY[
    'golf_players',
    'golf_team_members',
    'golf_team_seasons',
    'golf_events',
    'golf_event_attendance',
    'golf_tournaments',
    'golf_tournament_rounds',
    'golf_tournament_entries',
    'golf_tournament_round_lineups',
    'golf_tournament_field_teams',
    'golf_tournament_field_scores',
    'golf_qualifiers',
    'golf_qualifier_round_courses',
    'golf_rounds',
    'golf_holes',
    'golf_shots',
    'golf_qualifier_entries',
    'golf_qualifier_selections',
    'golf_tournament_player_rounds',
    'golf_practice_plans',
    'golf_practice_plan_versions',
    'golf_tasks',
    'golf_task_assignments',
    'golf_announcements',
    'golf_travel_itineraries',
    'golf_messages'
  ]::text[]
$$;

-- Tables without a team_id column hang off a parent that has one.
CREATE OR REPLACE FUNCTION helm_private.golf_demo_parent(p_table text, OUT parent_table text, OUT fk_column text)
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT m.parent_table, m.fk_column
  FROM (VALUES
    ('golf_event_attendance', 'golf_events', 'event_id'),
    ('golf_qualifier_round_courses', 'golf_qualifiers', 'qualifier_id'),
    ('golf_holes', 'golf_rounds', 'round_id'),
    ('golf_shots', 'golf_rounds', 'round_id'),
    ('golf_qualifier_entries', 'golf_qualifiers', 'qualifier_id'),
    ('golf_qualifier_selections', 'golf_qualifiers', 'qualifier_id'),
    ('golf_task_assignments', 'golf_tasks', 'task_id'),
    ('golf_messages', 'golf_conversations', 'conversation_id')
  ) AS m (child, parent_table, fk_column)
  WHERE m.child = p_table
$$;

CREATE OR REPLACE FUNCTION helm_private.golf_demo_pk(p_table text)
RETURNS TABLE (col text, typ text, ord integer)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT a.attname::text, pg_catalog.format_type(a.atttypid, a.atttypmod), k.ord::integer
  FROM pg_catalog.pg_index AS i
  CROSS JOIN LATERAL pg_catalog.unnest(i.indkey::smallint[]) WITH ORDINALITY AS k (attnum, ord)
  JOIN pg_catalog.pg_attribute AS a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
  WHERE i.indrelid = pg_catalog.to_regclass('public.' || pg_catalog.quote_ident(p_table))
    AND i.indisprimary
  ORDER BY k.ord
$$;

-- The text form of a row's primary key, as the writer spells it: the key
-- columns' values joined with '|'. p_source is a format() pattern for one
-- column, e.g. '(e->>%L)' over JSON or 't.%I::text' over a table row.
CREATE OR REPLACE FUNCTION helm_private.golf_demo_key_sql(p_table text, p_source text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT 'pg_catalog.concat_ws(''|'', '
    || pg_catalog.string_agg(pg_catalog.format(p_source, pk.col), ', ' ORDER BY pk.ord)
    || ')'
  FROM helm_private.golf_demo_pk(p_table) AS pk
$$;

CREATE OR REPLACE FUNCTION helm_private.golf_demo_check(p_team uuid, p_table text)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF p_team IS DISTINCT FROM helm_private.golf_demo_team_id() THEN
    RAISE EXCEPTION 'golf_demo: refusing team %, the generator writes the demo team only', p_team
      USING ERRCODE = '42501';
  END IF;
  IF p_table IS NOT NULL AND NOT (p_table = ANY (helm_private.golf_demo_tables())) THEN
    RAISE EXCEPTION 'golf_demo: % is not one of the generator''s tables', p_table
      USING ERRCODE = '42501';
  END IF;
END
$$;

-- Marks the round and tournament guards already honour for owner writes,
-- transaction-local, so they end with the call.
CREATE OR REPLACE FUNCTION helm_private.golf_demo_marks(p_table text)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_catalog.set_config('helm.golf_demo_writer', 'generator', true);
  PERFORM pg_catalog.set_config('helm.golf_lifecycle_write', 'atomic', true);
  PERFORM pg_catalog.set_config('helm.round_live_off', 'on', true);
  PERFORM pg_catalog.set_config('helm.defer_round_totals', 'on', true);
  PERFORM pg_catalog.set_config(
    'helm.tournament_write',
    CASE
      WHEN p_table = 'golf_events' THEN 'rounds'
      WHEN p_table IN ('golf_tournament_entries', 'golf_tournament_round_lineups') THEN 'substitute'
      ELSE ''
    END,
    true);
END
$$;

-- ------------------------------------------------------------------ the ledger

CREATE TABLE IF NOT EXISTS helm_private.golf_demo_ledger (
  team_id uuid NOT NULL,
  table_name text NOT NULL,
  row_key text NOT NULL,
  row_hash text NOT NULL,
  generator_version integer NOT NULL,
  written_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT golf_demo_ledger_pkey PRIMARY KEY (team_id, table_name, row_key)
);

COMMENT ON TABLE helm_private.golf_demo_ledger IS
  'Rows the demo generator wrote (src/lib/golf/demo/writer.ts): which are its own, and a hash of what it wrote. Written only by the golf_demo_* functions.';

ALTER TABLE helm_private.golf_demo_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON helm_private.golf_demo_ledger FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS golf_demo_ledger_no_direct_access ON helm_private.golf_demo_ledger;
CREATE POLICY golf_demo_ledger_no_direct_access ON helm_private.golf_demo_ledger
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- ------------------------------------------------------------------ begin

CREATE OR REPLACE FUNCTION public.golf_demo_begin(p_team uuid, p_prune boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_table text;
  v_match text;
  v_n integer;
  v_pruned integer := 0;
  v_tables jsonb;
BEGIN
  PERFORM helm_private.golf_demo_check(p_team, NULL);

  FOREACH v_table IN ARRAY CASE WHEN p_prune THEN helm_private.golf_demo_tables() ELSE '{}'::text[] END LOOP
    SELECT pg_catalog.string_agg(
             pg_catalog.format('t.%I = pg_catalog.split_part(l.row_key, ''|'', %s)::%s', pk.col, pk.ord, pk.typ),
             ' AND ' ORDER BY pk.ord)
      INTO v_match
      FROM helm_private.golf_demo_pk(v_table) AS pk;
    EXECUTE pg_catalog.format(
      'DELETE FROM helm_private.golf_demo_ledger AS l
        WHERE l.team_id = $1 AND l.table_name = $2
          AND NOT EXISTS (SELECT 1 FROM public.%I AS t WHERE %s)',
      v_table, v_match)
      USING p_team, v_table;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_pruned := v_pruned + v_n;
  END LOOP;

  IF p_prune THEN
    DELETE FROM helm_private.golf_demo_ledger AS l
     WHERE l.team_id = p_team AND l.table_name = 'golf_rounds#finished'
       AND NOT EXISTS (SELECT 1 FROM public.golf_rounds AS r WHERE r.id = l.row_key::uuid);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_pruned := v_pruned + v_n;
  END IF;

  SELECT coalesce(pg_catalog.jsonb_object_agg(s.table_name, s.keys), '{}'::jsonb)
    INTO v_tables
    FROM (
      SELECT l.table_name, pg_catalog.jsonb_object_agg(l.row_key, l.row_hash) AS keys
        FROM helm_private.golf_demo_ledger AS l
       WHERE l.team_id = p_team
       GROUP BY l.table_name
    ) AS s;

  RETURN pg_catalog.jsonb_build_object('pruned', v_pruned, 'tables', v_tables);
END
$$;

-- ------------------------------------------------------------------ apply

CREATE OR REPLACE FUNCTION public.golf_demo_apply(p_team uuid, p_table text, p_items jsonb, p_version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rel regclass;
  v_cols text[];
  v_pk text[];
  v_keyed jsonb;
  v_parent record;
  v_bad bigint;
  v_skipped text[];
  v_written text[];
  v_rows jsonb;
  v_update text;
  v_join text;
BEGIN
  PERFORM helm_private.golf_demo_check(p_team, p_table);
  IF p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'golf_demo_apply: a generator version is required';
  END IF;
  IF pg_catalog.jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'golf_demo_apply: items must be a JSON array';
  END IF;
  IF pg_catalog.jsonb_array_length(p_items) = 0 THEN
    RETURN pg_catalog.jsonb_build_object('written', 0, 'skipped', '[]'::jsonb);
  END IF;
  IF pg_catalog.jsonb_array_length(p_items) > 2000 THEN
    RAISE EXCEPTION 'golf_demo_apply: at most 2000 rows per call';
  END IF;
  v_rel := pg_catalog.to_regclass('public.' || pg_catalog.quote_ident(p_table));

  -- Every item is {hash, row}; every row in one call carries the same columns,
  -- and each is a real, writable column of the table.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_items) AS e
     WHERE pg_catalog.jsonb_typeof(e->'row') IS DISTINCT FROM 'object'
        OR coalesce(e->>'hash', '') = ''
  ) THEN
    RAISE EXCEPTION 'golf_demo_apply: every item needs a hash and a row object';
  END IF;
  SELECT pg_catalog.array_agg(k ORDER BY k) INTO v_cols
    FROM pg_catalog.jsonb_object_keys(p_items->0->'row') AS k;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_items) AS e
     WHERE (SELECT pg_catalog.array_agg(k ORDER BY k) FROM pg_catalog.jsonb_object_keys(e->'row') AS k)
           IS DISTINCT FROM v_cols
  ) THEN
    RAISE EXCEPTION 'golf_demo_apply: every row in one call must carry the same columns';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(v_cols) AS c
     WHERE NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_attribute AS a
        WHERE a.attrelid = v_rel AND a.attname = c AND a.attnum > 0
          AND NOT a.attisdropped AND a.attgenerated = '')
  ) THEN
    RAISE EXCEPTION 'golf_demo_apply: a row names a column % does not have', p_table;
  END IF;
  SELECT pg_catalog.array_agg(pk.col ORDER BY pk.ord) INTO v_pk FROM helm_private.golf_demo_pk(p_table) AS pk;
  IF v_pk IS NULL OR NOT (v_pk <@ v_cols) THEN
    RAISE EXCEPTION 'golf_demo_apply: every % row must carry its primary key', p_table;
  END IF;

  -- The demo team only: by the row's own team_id, or through its parent.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute AS a
     WHERE a.attrelid = v_rel AND a.attname = 'team_id' AND a.attnum > 0 AND NOT a.attisdropped
  ) THEN
    IF NOT ('team_id' = ANY (v_cols)) OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(p_items) AS e
       WHERE e->'row'->>'team_id' IS DISTINCT FROM p_team::text
    ) THEN
      RAISE EXCEPTION 'golf_demo_apply: every % row must belong to the demo team', p_table
        USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT * INTO v_parent FROM helm_private.golf_demo_parent(p_table);
    IF v_parent.parent_table IS NOT NULL THEN
      IF NOT (v_parent.fk_column = ANY (v_cols)) THEN
        RAISE EXCEPTION 'golf_demo_apply: every % row must carry %', p_table, v_parent.fk_column;
      END IF;
      EXECUTE pg_catalog.format(
        'SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_array_elements($1) AS e
          WHERE NOT EXISTS (
            SELECT 1 FROM public.%I AS p
             WHERE p.id = (e->''row''->>%L)::uuid AND p.team_id = $2)',
        v_parent.parent_table, v_parent.fk_column)
        INTO v_bad USING p_items, p_team;
      IF v_bad > 0 THEN
        RAISE EXCEPTION 'golf_demo_apply: % % rows hang off a % row that is not the demo team''s',
          v_bad, p_table, v_parent.parent_table
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- Key every item once.
  EXECUTE pg_catalog.format(
    'SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(''k'', %s, ''h'', e->>''hash'', ''row'', e->''row''))
       FROM pg_catalog.jsonb_array_elements($1) AS e',
    helm_private.golf_demo_key_sql(p_table, '(e->''row''->>%L)'))
    INTO v_keyed USING p_items;
  IF (SELECT pg_catalog.count(DISTINCT x->>'k') FROM pg_catalog.jsonb_array_elements(v_keyed) AS x)
     <> pg_catalog.jsonb_array_length(v_keyed) THEN
    RAISE EXCEPTION 'golf_demo_apply: the same % key appears twice in one call', p_table;
  END IF;

  -- A key that exists but is not in the ledger is someone else's row: skip it.
  SELECT pg_catalog.string_agg(pg_catalog.format('t.%1$I = r.%1$I', c), ' AND ') INTO v_join
    FROM pg_catalog.unnest(v_pk) AS c;
  EXECUTE pg_catalog.format(
    'SELECT coalesce(pg_catalog.array_agg(x->>''k''), ''{}''::text[])
       FROM pg_catalog.jsonb_array_elements($1) AS x
      WHERE EXISTS (
              SELECT 1 FROM pg_catalog.jsonb_populate_record(NULL::public.%1$I, x->''row'') AS r
              JOIN public.%1$I AS t ON %2$s)
        AND NOT EXISTS (
              SELECT 1 FROM helm_private.golf_demo_ledger AS l
               WHERE l.team_id = $2 AND l.table_name = $3 AND l.row_key = x->>''k'')',
    p_table, v_join)
    INTO v_skipped USING v_keyed, p_team, p_table;

  SELECT coalesce(pg_catalog.jsonb_agg(x->'row'), '[]'::jsonb) INTO v_rows
    FROM pg_catalog.jsonb_array_elements(v_keyed) AS x
   WHERE NOT ((x->>'k') = ANY (v_skipped));
  IF pg_catalog.jsonb_array_length(v_rows) = 0 THEN
    RETURN pg_catalog.jsonb_build_object('written', 0, 'skipped', pg_catalog.to_jsonb(v_skipped));
  END IF;

  PERFORM helm_private.golf_demo_marks(p_table);

  SELECT pg_catalog.string_agg(pg_catalog.format('%1$I = EXCLUDED.%1$I', c), ', ') INTO v_update
    FROM pg_catalog.unnest(v_cols) AS c
   WHERE NOT (c = ANY (v_pk));
  EXECUTE pg_catalog.format(
    'WITH w AS (
       INSERT INTO public.%1$I AS t (%2$s)
       SELECT %2$s FROM pg_catalog.jsonb_populate_recordset(NULL::public.%1$I, $1)
       ON CONFLICT (%3$s) DO %4$s
       RETURNING %5$s AS k
     )
     SELECT coalesce(pg_catalog.array_agg(w.k), ''{}''::text[]) FROM w',
    p_table,
    (SELECT pg_catalog.string_agg(pg_catalog.quote_ident(c), ', ') FROM pg_catalog.unnest(v_cols) AS c),
    (SELECT pg_catalog.string_agg(pg_catalog.quote_ident(c), ', ') FROM pg_catalog.unnest(v_pk) AS c),
    CASE WHEN v_update IS NULL THEN 'NOTHING' ELSE 'UPDATE SET ' || v_update END,
    helm_private.golf_demo_key_sql(p_table, 't.%I::text'))
    INTO v_written USING v_rows;

  INSERT INTO helm_private.golf_demo_ledger AS l (team_id, table_name, row_key, row_hash, generator_version, written_at)
  SELECT p_team, p_table, x->>'k', x->>'h', p_version, pg_catalog.now()
    FROM pg_catalog.jsonb_array_elements(v_keyed) AS x
   WHERE (x->>'k') = ANY (v_written)
  ON CONFLICT (team_id, table_name, row_key) DO UPDATE
    SET row_hash = EXCLUDED.row_hash,
        generator_version = EXCLUDED.generator_version,
        written_at = EXCLUDED.written_at;

  RETURN pg_catalog.jsonb_build_object(
    'written', pg_catalog.cardinality(v_written),
    'skipped', pg_catalog.to_jsonb(v_skipped));
END
$$;

-- ------------------------------------------------------------------ remove

CREATE OR REPLACE FUNCTION public.golf_demo_remove(p_team uuid, p_table text, p_keys jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owned jsonb;
  v_join text;
  v_team text := '';
  v_removed integer;
  v_match text;
  v_players uuid[] := '{}';
  v_player uuid;
BEGIN
  PERFORM helm_private.golf_demo_check(p_team, p_table);
  IF pg_catalog.jsonb_typeof(p_keys) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'golf_demo_remove: keys must be a JSON array of primary-key objects';
  END IF;
  IF pg_catalog.jsonb_array_length(p_keys) = 0 THEN
    RETURN 0;
  END IF;
  IF pg_catalog.jsonb_array_length(p_keys) > 5000 THEN
    RAISE EXCEPTION 'golf_demo_remove: at most 5000 keys per call';
  END IF;

  -- Only rows the generator wrote for the demo team.
  EXECUTE pg_catalog.format(
    'SELECT coalesce(pg_catalog.jsonb_agg(e), ''[]''::jsonb)
       FROM pg_catalog.jsonb_array_elements($1) AS e
      WHERE EXISTS (
        SELECT 1 FROM helm_private.golf_demo_ledger AS l
         WHERE l.team_id = $2 AND l.table_name = $3 AND l.row_key = %s)',
    helm_private.golf_demo_key_sql(p_table, '(e->>%L)'))
    INTO v_owned USING p_keys, p_team, p_table;
  IF pg_catalog.jsonb_array_length(v_owned) = 0 THEN
    RETURN 0;
  END IF;

  SELECT pg_catalog.string_agg(pg_catalog.format('t.%1$I = r.%1$I', pk.col), ' AND ' ORDER BY pk.ord) INTO v_join
    FROM helm_private.golf_demo_pk(p_table) AS pk;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute AS a
     WHERE a.attrelid = pg_catalog.to_regclass('public.' || pg_catalog.quote_ident(p_table))
       AND a.attname = 'team_id' AND a.attnum > 0 AND NOT a.attisdropped
  ) THEN
    v_team := ' AND t.team_id = $2';
  END IF;

  PERFORM helm_private.golf_demo_marks(p_table);
  IF p_table = 'golf_rounds' THEN
    -- The round lifecycle guard keeps completed rounds as permanent history,
    -- and under the owner-write mark it skips a DELETE without an error (it
    -- returns NEW, which a delete does not have). So a generator round is set
    -- aside first (status 'abandoned', which the mark allows), then deleted
    -- without the mark: the guard lets a round that is neither completed nor
    -- in progress go, and no discard tombstone or live broadcast fires.
    WITH gone AS (
      UPDATE public.golf_rounds AS t
         SET status = 'abandoned'
        FROM pg_catalog.jsonb_populate_recordset(NULL::public.golf_rounds, v_owned) AS r
       WHERE t.id = r.id AND t.team_id = p_team
      RETURNING t.player_id
    )
    SELECT coalesce(pg_catalog.array_agg(DISTINCT gone.player_id), '{}') INTO v_players FROM gone;
    PERFORM pg_catalog.set_config('helm.golf_lifecycle_write', '', true);
  END IF;
  EXECUTE pg_catalog.format(
    'DELETE FROM public.%1$I AS t
      USING pg_catalog.jsonb_populate_recordset(NULL::public.%1$I, $1) AS r
      WHERE %2$s%3$s',
    p_table, v_join, v_team)
    USING v_owned, p_team;
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  -- Forget only the rows that are gone: a row a trigger kept stays in the
  -- ledger, so the next run tries again instead of losing track of it.
  SELECT pg_catalog.string_agg(
           pg_catalog.format('t.%I = pg_catalog.split_part(l.row_key, ''|'', %s)::%s', pk.col, pk.ord, pk.typ),
           ' AND ' ORDER BY pk.ord)
    INTO v_match
    FROM helm_private.golf_demo_pk(p_table) AS pk;
  EXECUTE pg_catalog.format(
    'DELETE FROM helm_private.golf_demo_ledger AS l
      USING pg_catalog.jsonb_array_elements($1) AS e
      WHERE l.team_id = $2 AND l.table_name = $3 AND l.row_key = %s
        AND NOT EXISTS (SELECT 1 FROM public.%I AS t WHERE %s)',
    helm_private.golf_demo_key_sql(p_table, '(e->>%L)'), p_table, v_match)
    USING v_owned, p_team, p_table;

  IF p_table = 'golf_rounds' THEN
    DELETE FROM helm_private.golf_demo_ledger AS l
     WHERE l.team_id = p_team AND l.table_name = 'golf_rounds#finished'
       AND NOT EXISTS (SELECT 1 FROM public.golf_rounds AS r WHERE r.id = l.row_key::uuid);
    -- The season figures of the players whose rounds went.
    FOREACH v_player IN ARRAY v_players LOOP
      PERFORM helm_private.golf_demo_marks('golf_rounds');
      PERFORM public.update_player_stats_strokes_gained(v_player);
      PERFORM helm_private.golf_demo_marks('golf_rounds');
      PERFORM public.refresh_player_stats_cache(v_player);
    END LOOP;
  END IF;

  RETURN v_removed;
END
$$;

-- ------------------------------------------------------------------ finish rounds

CREATE OR REPLACE FUNCTION public.golf_demo_finish_rounds(p_team uuid, p_rounds jsonb, p_version integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_round record;
  v_player uuid;
  v_players uuid[] := '{}';
  v_done integer := 0;
BEGIN
  PERFORM helm_private.golf_demo_check(p_team, NULL);
  IF pg_catalog.jsonb_typeof(p_rounds) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'golf_demo_finish_rounds: rounds must be a JSON array of {id, hash}';
  END IF;
  IF pg_catalog.jsonb_array_length(p_rounds) > 50 THEN
    RAISE EXCEPTION 'golf_demo_finish_rounds: at most 50 rounds per call';
  END IF;

  FOR v_round IN
    SELECT r.id, r.player_id, x->>'hash' AS hash
      FROM pg_catalog.jsonb_array_elements(p_rounds) AS x
      JOIN public.golf_rounds AS r ON r.id = (x->>'id')::uuid
     WHERE r.team_id = p_team
       AND coalesce(x->>'hash', '') <> ''
       AND EXISTS (
         SELECT 1 FROM helm_private.golf_demo_ledger AS l
          WHERE l.team_id = p_team AND l.table_name = 'golf_rounds' AND l.row_key = r.id::text)
     ORDER BY r.round_date, r.id
  LOOP
    -- Each stats function may set its own mark; set ours again before each.
    PERFORM helm_private.golf_demo_marks('golf_rounds');
    PERFORM public.recompute_golf_round_totals(v_round.id);
    UPDATE public.golf_rounds SET status = status WHERE id = v_round.id AND status = 'completed';
    PERFORM helm_private.golf_demo_marks('golf_rounds');
    PERFORM public.recalculate_round_strokes_gained(v_round.id);
    INSERT INTO helm_private.golf_demo_ledger AS l (team_id, table_name, row_key, row_hash, generator_version, written_at)
    VALUES (p_team, 'golf_rounds#finished', v_round.id::text, v_round.hash, p_version, pg_catalog.now())
    ON CONFLICT (team_id, table_name, row_key) DO UPDATE
      SET row_hash = EXCLUDED.row_hash,
          generator_version = EXCLUDED.generator_version,
          written_at = EXCLUDED.written_at;
    v_players := pg_catalog.array_append(v_players, v_round.player_id);
    v_done := v_done + 1;
  END LOOP;

  FOR v_player IN SELECT DISTINCT p FROM pg_catalog.unnest(v_players) AS p LOOP
    PERFORM helm_private.golf_demo_marks('golf_rounds');
    PERFORM public.update_player_stats_strokes_gained(v_player);
    PERFORM helm_private.golf_demo_marks('golf_rounds');
    PERFORM public.refresh_player_stats_cache(v_player);
  END LOOP;

  RETURN v_done;
END
$$;

-- ------------------------------------------------------------------ grants

REVOKE ALL ON FUNCTION helm_private.golf_demo_team_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION helm_private.golf_demo_tables() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION helm_private.golf_demo_parent(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION helm_private.golf_demo_pk(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION helm_private.golf_demo_key_sql(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION helm_private.golf_demo_check(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION helm_private.golf_demo_marks(text) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.golf_demo_begin(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.golf_demo_apply(uuid, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.golf_demo_remove(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.golf_demo_finish_rounds(uuid, jsonb, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.golf_demo_begin(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.golf_demo_apply(uuid, text, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.golf_demo_remove(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.golf_demo_finish_rounds(uuid, jsonb, integer) TO service_role;

COMMENT ON FUNCTION public.golf_demo_apply(uuid, text, jsonb, integer) IS
  'Demo generator only (service_role): upsert rows of one generator table for the demo team, never overwriting a row the generator did not write. See src/lib/golf/demo/writer.ts.';
COMMENT ON FUNCTION public.golf_demo_remove(uuid, text, jsonb) IS
  'Demo generator only (service_role): delete rows the generator wrote for the demo team.';
COMMENT ON FUNCTION public.golf_demo_begin(uuid, boolean) IS
  'Demo generator only (service_role): drop ledger rows whose table row is gone (unless p_prune is false), then return the ledger.';
COMMENT ON FUNCTION public.golf_demo_finish_rounds(uuid, jsonb, integer) IS
  'Demo generator only (service_role): recompute totals, stats cache and strokes gained for generator rounds.';
