-- Demo team: the owner's own logins can edit it again; every other signed-in
-- account stays refused (DD-13 follow-up).
-- STATUS: APPLIED to production 16 Nov 2026 (owner's go, see below).
--
-- WHY. 20261115211100 made the demo team read-only for every signed-in
--   account, the owner's own coach and player logins included. The owner,
--   16 Nov 2026: "Not read only just apply". Test data landing on the demo
--   team (DD-13) came from QA, audit and shared demo logins; those stay
--   refused.
--
-- WHAT. (1) helm_private.golf_demo_editors: the user ids allowed to write
--   to the demo team. Private schema, RLS on, no grants to any client role;
--   only the guard (SECURITY DEFINER) reads it. (2) The guard returns early
--   for a signed-in user listed there. Nothing else in the body changes: the
--   generator's mark and writes with no signed-in user still pass, every
--   other account still gets 42501 / golf_demo_read_only, and other teams are
--   untouched. Cost: one primary-key lookup per write by a signed-in user.
--
-- DATA STEP (owner, per environment, not in git because the repo is public):
--   insert into helm_private.golf_demo_editors (user_id, note)
--   select id, 'owner login' from auth.users where lower(email) in (...);
--   Production carries the owner's coach login and player login.
--
-- ORDER: after 20261115211100.
--
-- VERIFY: select 1 where to_regclass('helm_private.golf_demo_editors')
-- VERIFY: is not null and not has_table_privilege('authenticated',
-- VERIFY: 'helm_private.golf_demo_editors', 'select') and not
-- VERIFY: has_table_privilege('anon', 'helm_private.golf_demo_editors',
-- VERIFY: 'select');
-- VERIFY: select 1 from pg_catalog.pg_proc p
-- VERIFY: join pg_catalog.pg_namespace n on n.oid = p.pronamespace
-- VERIFY: where n.nspname = 'helm_private'
-- VERIFY: and p.proname = 'golf_demo_write_guard' and p.prosecdef
-- VERIFY: and p.prosrc like '%helm_private.golf_demo_editors%';
--
-- ROLLBACK: supabase/rollbacks/
--   20261116150000_golf_demo_owner_editors.rollback.sql
--   (the 20261115211100 guard body, then drop the table): the demo team is
--   read-only for every signed-in account again.

-- No BEGIN or COMMIT: db:apply runs the file and its ledger row in one
-- transaction.
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS helm_private.golf_demo_editors (
    user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    note text NOT NULL,
    added_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE helm_private.golf_demo_editors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE helm_private.golf_demo_editors
FROM public, anon, authenticated;
COMMENT ON TABLE helm_private.golf_demo_editors IS
'Signed-in accounts the demo write guard lets edit the demo team: '
'the owner''s own logins. Read only by '
'helm_private.golf_demo_write_guard().';

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

  -- The owner's own logins edit the demo team (owner, 16 Nov 2026: "Not read
  -- only"). Test, QA and shared demo logins are not listed and stay refused.
  IF EXISTS (SELECT 1 FROM helm_private.golf_demo_editors AS d WHERE d.user_id = auth.uid()) THEN
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

REVOKE ALL ON FUNCTION helm_private.golf_demo_write_guard()
FROM public, anon, authenticated;

COMMENT ON FUNCTION helm_private.golf_demo_write_guard() IS
'DD-13: refuses a signed-in account''s writes to demo-team rows. '
'The generator (helm.golf_demo_writer = generator), writes with no '
'signed-in user and the owner''s logins (helm_private.golf_demo_editors) pass.';
