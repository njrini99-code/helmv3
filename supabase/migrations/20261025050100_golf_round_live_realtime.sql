-- STATUS: WRITTEN — HOLD — NOT APPLIED
-- 20261025050100_golf_round_live_realtime.sql
-- Held for the owner (supabase/migrations/HELD.md; plan
-- docs/clubhouse/held/data/live-rounds-realtime.md). Owner applies. Written
-- 2026-10-25 for Clubhouse P-6 (handoff 4.34.6).
-- Apply: npm run db:apply --
-- supabase/migrations/20261025050100_golf_round_live_realtime.sql
-- Purpose: P-6 live rounds, push. Swaps the no-op broadcaster for realtime.send
-- on private topics golf-live:coach:<team> and golf-live:team:<team>, and adds
-- the realtime.messages policy that lets coaches and (not-on-course) teammates
-- join them.
-- PRECONDITION: before this goes to production, check that a PUBLIC
-- (non-private) subscriber on the same topic receives nothing: join
-- golf-live:coach:<team> without config.private from a second client and
-- confirm no lane arrives. The project cannot switch to private-only channels
-- (main has 18 public .channel( uses), so this check is what keeps the topics
-- closed.
-- Risk: LOW. One function body and one policy on realtime.messages. Policies
-- are OR'ed, so 4.33's tour: policies are unaffected either way.
-- Desired schema: the broadcaster body and golf_live_topic_allowed are mirrored
-- in supabase/schemas/functions. The realtime.messages policy is NOT mirrored
-- (there is no realtime schema in schema_paths); check it by hand.
-- ORDER: after 20261025050000. Independent of 4.33's 20261024100500 (either may
-- go first).
-- VERIFY: select 1 where
-- VERIFY: pg_get_functiondef(
-- VERIFY: 'helm_private.golf_live_broadcast(text,text,jsonb)'::regprocedure)
-- VERIFY: like '%realtime.send%';
-- VERIFY: select 1 where (select count(*) from pg_policies where schemaname =
-- VERIFY: 'realtime' and tablename = 'messages' and policyname =
-- VERIFY: 'golf_live_receive') = 1;
-- VERIFY: select 1 where
-- VERIFY: public.golf_live_topic_allowed('golf-live:coach:not-a-uuid') = false;
-- ROLLBACK: drop policy if exists golf_live_receive on realtime.messages;
-- ROLLBACK: restore the no-op body of helm_private.golf_live_broadcast from
-- 20261025050000 (create or replace function
-- helm_private.golf_live_broadcast(p_topic text, p_event text, p_payload jsonb)
-- returns void language plpgsql security definer set search_path = public,
-- pg_temp as 'begin return; end';);
-- ROLLBACK: drop function if exists public.golf_live_topic_allowed(text);

SET lock_timeout = '3s';

DO $$
BEGIN
  IF to_regprocedure('helm_private.golf_live_broadcast(text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'apply 20261025050000 first';
  END IF;
  IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN
    RAISE EXCEPTION 'realtime.send(jsonb,text,text,boolean) is missing: this database has no Supabase Realtime broadcast-from-database support';
  END IF;
  IF to_regprocedure('realtime.topic()') IS NULL OR to_regclass('realtime.messages') IS NULL THEN
    RAISE EXCEPTION 'realtime.topic() and realtime.messages must exist';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION helm_private.golf_live_broadcast(
    p_topic text, p_event text, p_payload jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,
pg_temp AS $$
BEGIN
  PERFORM realtime.send(p_payload, p_event, p_topic, true);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'golf live broadcast failed on %: % (%)', p_topic, SQLERRM, SQLSTATE;
END $$;

CREATE OR REPLACE FUNCTION public.golf_live_topic_allowed(p_topic text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path
= public,
pg_temp AS $$
DECLARE
  m text[];
  v_team uuid;
BEGIN
  IF p_topic IS NULL THEN
    RETURN false;
  END IF;
  m := regexp_match(p_topic,
    '^golf-live:(coach|team):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$');
  IF m IS NULL THEN
    RETURN false;
  END IF;
  v_team := m[2]::uuid;
  IF m[1] = 'coach' THEN
    RETURN public.is_golf_team_coach(v_team);
  END IF;
  RETURN public.is_golf_team_player(v_team) AND NOT public.golf_live_viewer_on_course(v_team);
END $$;

REVOKE ALL ON FUNCTION public.golf_live_topic_allowed(text) FROM public,
anon,
authenticated;
GRANT EXECUTE ON FUNCTION public.golf_live_topic_allowed(text) TO authenticated,
service_role;

DROP POLICY IF EXISTS golf_live_receive ON realtime.messages;
CREATE POLICY golf_live_receive ON realtime.messages
FOR SELECT TO authenticated
USING (
    realtime.messages.extension = 'broadcast'
    AND public.golf_live_topic_allowed((SELECT realtime.topic()))
);
-- No INSERT policy: clients never send on golf-live topics; only the database
-- does (realtime.send runs as owner).
