-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- Written 15 Nov 2026 for launch readiness DD-13 (test data keeps landing on
--   the demo team). Not applied anywhere, not run against any database.
--
-- Apply: npm run db:apply --
--   supabase/migrations/20261115210100_golf_demo_write_guard.sql
--   after 20261115210000 (it calls helm_private.golf_demo_team_id) and after
--   npm run test:rls passes (supabase/tests/rls/golf_demo_write_guard.sql).
--
-- Risk: MEDIUM, by design. After this, NO signed-in account can add, change
--   or delete the demo team's rounds, holes, shots, events, attendance,
--   messages, attachments, announcements, tasks, qualifiers, tournaments,
--   practice plans, documents, travel or roster rows. That includes the
--   owner's own logins that sit on the demo team, which is what DD-13 asks
--   for ("the demo guard blocks writes from every account on the demo team
--   except the generator"). The app shows the refusal as "This is a shared
--   demo team: changes are not saved." Every other team is untouched: the
--   guard looks the row's team up and returns at once when it is not the
--   demo team.
--   Not refused: writes with no signed-in user (service role, crons, the
--   SQL editor), so the generator, the owner's cleanup SQL and the nightly
--   jobs keep working; and writes marked helm.golf_demo_writer = 'generator'
--   (the generator's own functions, 20261115210000).
--   Cost on every write to these tables, any team: one trigger call; for a
--   signed-in user, one primary-key lookup of the row's parent (round,
--   event, conversation, task, qualifier, tournament or message). A round
--   save writes about 90 hole and shot rows: about 90 index lookups.
--
-- What: helm_private.golf_demo_write_guard(), a BEFORE INSERT OR UPDATE OR
--   DELETE row trigger named golf_demo_write_guard on 18 tables. With no
--   argument it reads the row's own team_id; with (column, parent table) it
--   looks the team up through the parent. On UPDATE it checks the old row and
--   the new one, so a row can be moved neither into nor out of the demo team.
--   Refusal: SQLSTATE 42501, message as above, DETAIL 'golf_demo_read_only'
--   (src/lib/demo/golf-read-only.ts recognises it).
--
-- RLS: unchanged. The function is SECURITY DEFINER only so the parent lookup
--   sees the parent row whatever the caller's own policies allow; it reads
--   one team_id and writes nothing. REVOKE ALL FROM PUBLIC, anon,
--   authenticated (a trigger function needs no EXECUTE grant to fire).
--
-- ORDER: after 20261115210000. Independent of every other held migration.
--
-- VERIFY: select 1 where (select count(*) from pg_catalog.pg_trigger t
-- VERIFY:   where t.tgname = 'golf_demo_write_guard' and not t.tgisinternal
-- VERIFY:   and t.tgenabled = 'O') = 18;
-- VERIFY: select 1 where exists (select 1 from pg_catalog.pg_proc p
-- VERIFY:   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
-- VERIFY:   where n.nspname = 'helm_private'
-- VERIFY:   and p.proname = 'golf_demo_write_guard'
-- VERIFY:   and p.prosecdef
-- VERIFY:   and p.proconfig @> array['search_path=""']);
--
-- ROLLBACK (one transaction; supabase/rollbacks/
--   20261115210100_golf_demo_write_guard.rollback.sql):
-- ROLLBACK: drop trigger golf_demo_write_guard on each of the 18 tables;
--   drop function helm_private.golf_demo_write_guard().
--   Cost of rolling back: none beyond the guard itself; signed-in accounts
--   on the demo team can write there again (the app's shared-demo-login
--   guard, demoSafe, still covers the shared demo login).

-- No BEGIN or COMMIT in this file: db:apply runs the whole file and its ledger
-- row in one transaction, and a COMMIT here would close that transaction
-- before the ledger row is written.
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

REVOKE ALL ON FUNCTION helm_private.golf_demo_write_guard()
FROM public, anon, authenticated;

COMMENT ON FUNCTION helm_private.golf_demo_write_guard() IS
'DD-13: refuses a signed-in account''s writes to demo-team rows. '
'The generator (helm.golf_demo_writer = generator) and writes with no '
'signed-in user pass.';

-- Tables with their own team_id.
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_rounds;
CREATE TRIGGER golf_demo_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.golf_rounds
FOR EACH ROW
EXECUTE FUNCTION helm_private.golf_demo_write_guard();
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_events;
CREATE TRIGGER golf_demo_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.golf_events
FOR EACH ROW
EXECUTE FUNCTION helm_private.golf_demo_write_guard();
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_announcements;
CREATE TRIGGER golf_demo_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.golf_announcements
FOR EACH ROW
EXECUTE FUNCTION helm_private.golf_demo_write_guard();
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_tasks;
CREATE TRIGGER golf_demo_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.golf_tasks
FOR EACH ROW
EXECUTE FUNCTION helm_private.golf_demo_write_guard();
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_qualifiers;
CREATE TRIGGER golf_demo_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.golf_qualifiers
FOR EACH ROW
EXECUTE FUNCTION helm_private.golf_demo_write_guard();
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_practice_plans;
CREATE TRIGGER golf_demo_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.golf_practice_plans
FOR EACH ROW
EXECUTE FUNCTION helm_private.golf_demo_write_guard();
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_team_members;
CREATE TRIGGER golf_demo_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.golf_team_members
FOR EACH ROW
EXECUTE FUNCTION helm_private.golf_demo_write_guard();
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_documents;
CREATE TRIGGER golf_demo_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.golf_documents
FOR EACH ROW
EXECUTE FUNCTION helm_private.golf_demo_write_guard();
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_travel_itineraries;
CREATE TRIGGER golf_demo_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.golf_travel_itineraries
FOR EACH ROW
EXECUTE FUNCTION helm_private.golf_demo_write_guard();
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_tournaments;
CREATE TRIGGER golf_demo_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.golf_tournaments
FOR EACH ROW
EXECUTE FUNCTION helm_private.golf_demo_write_guard();
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_tournament_entries;
CREATE TRIGGER golf_demo_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.golf_tournament_entries
FOR EACH ROW
EXECUTE FUNCTION helm_private.golf_demo_write_guard();

-- Tables that reach their team through a parent.
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_holes;
CREATE TRIGGER golf_demo_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.golf_holes
FOR EACH ROW
EXECUTE FUNCTION helm_private.golf_demo_write_guard(
    'round_id', 'golf_rounds'
);
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_shots;
CREATE TRIGGER golf_demo_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.golf_shots
FOR EACH ROW
EXECUTE FUNCTION helm_private.golf_demo_write_guard(
    'round_id', 'golf_rounds'
);
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_event_attendance;
CREATE TRIGGER golf_demo_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.golf_event_attendance
FOR EACH ROW
EXECUTE FUNCTION helm_private.golf_demo_write_guard(
    'event_id', 'golf_events'
);
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_messages;
CREATE TRIGGER golf_demo_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.golf_messages
FOR EACH ROW
EXECUTE FUNCTION helm_private.golf_demo_write_guard(
    'conversation_id', 'golf_conversations'
);
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_message_attachments;
CREATE TRIGGER golf_demo_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.golf_message_attachments
FOR EACH ROW
EXECUTE FUNCTION helm_private.golf_demo_write_guard(
    'message_id', 'golf_messages'
);
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_task_assignments;
CREATE TRIGGER golf_demo_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.golf_task_assignments
FOR EACH ROW
EXECUTE FUNCTION helm_private.golf_demo_write_guard(
    'task_id', 'golf_tasks'
);
DROP TRIGGER IF EXISTS golf_demo_write_guard ON public.golf_qualifier_entries;
CREATE TRIGGER golf_demo_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.golf_qualifier_entries
FOR EACH ROW
EXECUTE FUNCTION helm_private.golf_demo_write_guard(
    'qualifier_id', 'golf_qualifiers'
);
