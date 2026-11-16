-- Rollback for 20261116150000_golf_demo_owner_editors.sql: the guard body of
-- 20261115211100 (no editors), then the table. Run in one transaction.
SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION helm_private.golf_demo_write_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows jsonb[];
  v_row jsonb;
  v_ref uuid;
  v_team uuid;
BEGIN
  IF pg_catalog.current_setting('helm.golf_demo_writer', true) = 'generator' OR auth.uid() IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  v_rows := CASE TG_OP
    WHEN 'INSERT' THEN ARRAY[pg_catalog.to_jsonb(NEW)]
    WHEN 'DELETE' THEN ARRAY[pg_catalog.to_jsonb(OLD)]
    ELSE ARRAY[pg_catalog.to_jsonb(OLD), pg_catalog.to_jsonb(NEW)]
  END;

  FOREACH v_row IN ARRAY v_rows LOOP
    v_team := NULL;
    IF TG_NARGS = 0 THEN
      v_team := (v_row->>'team_id')::uuid;
    ELSE
      v_ref := (v_row->>TG_ARGV[0])::uuid;
      IF v_ref IS NOT NULL THEN
        CASE TG_ARGV[1]
          WHEN 'golf_rounds' THEN
            SELECT r.team_id INTO v_team FROM public.golf_rounds AS r WHERE r.id = v_ref;
          WHEN 'golf_events' THEN
            SELECT e.team_id INTO v_team FROM public.golf_events AS e WHERE e.id = v_ref;
          WHEN 'golf_conversations' THEN
            SELECT c.team_id INTO v_team FROM public.golf_conversations AS c WHERE c.id = v_ref;
          WHEN 'golf_messages' THEN
            SELECT c.team_id INTO v_team
              FROM public.golf_messages AS m
              JOIN public.golf_conversations AS c ON c.id = m.conversation_id
             WHERE m.id = v_ref;
          WHEN 'golf_tasks' THEN
            SELECT t.team_id INTO v_team FROM public.golf_tasks AS t WHERE t.id = v_ref;
          WHEN 'golf_qualifiers' THEN
            SELECT q.team_id INTO v_team FROM public.golf_qualifiers AS q WHERE q.id = v_ref;
          ELSE
            RAISE EXCEPTION 'golf_demo_write_guard: no lookup for %', TG_ARGV[1];
        END CASE;
      END IF;
    END IF;

    IF v_team = helm_private.golf_demo_team_id() THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'This is a shared demo team: changes are not saved.',
        DETAIL = 'golf_demo_read_only',
        HINT = 'The demo team is rewritten each day by its generator (src/lib/golf/demo).';
    END IF;
  END LOOP;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;

COMMENT ON FUNCTION helm_private.golf_demo_write_guard() IS
'DD-13: refuses a signed-in account''s writes to demo-team rows. '
'The generator (helm.golf_demo_writer = generator) and writes with no '
'signed-in user pass.';

DROP TABLE IF EXISTS helm_private.golf_demo_editors;
