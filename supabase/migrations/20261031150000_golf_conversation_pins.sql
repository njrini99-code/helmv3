-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- STATUS: DRAFT — WRITTEN, NOT APPLIED. For the owner's apply after the first
-- deploy, one held migration at a time (supabase/migrations/HELD.md). Prepared
-- 2026-10-31 for Clubhouse Messages pins on every device (Nick, 31 Oct: "pins
-- sync is a go"). Plan: design-refresh/messages/pin-sync/PIN-SYNC.md.
-- Apply: npm run db:apply --
-- supabase/migrations/20261031150000_golf_conversation_pins.sql
-- Risk: LOW. Additive only: one new table with own-row read RLS and no write
-- grants, three functions that do every write, two AFTER triggers on
-- golf_conversation_participants (leave and hide unpin), one policy on
-- realtime.messages for a private per-user topic. No existing object changes
-- shape. Nothing reads the table before it exists: the app probes for it and
-- keeps device-local pins (pinned.ts) until it answers.
--
-- Why a table and not a column on golf_conversation_participants: other
-- members can read your participant rows (golf_participants_select_v2), so a
-- pin there would show teammates what you pinned. Pins are private: only you
-- read yours, and nobody writes them except through the functions below.
--
-- Scope: per person per team (the conversation's team_id, copied at pin time;
-- a conversation with no team counts as its own scope). Limit 3 per scope
-- (helm_private.golf_pin_limit). New pins go to the end.
--
-- Realtime: every change sends a private broadcast, event 'pins', on topic
-- golf-pins:<user id>, whose payload is only the team id. The app refetches
-- on it, so even a wrongly joined listener would learn nothing but "changed".
-- PRECONDITION (as 20261025050100): before production, join golf-pins:<id>
-- from a second client WITHOUT config.private and confirm nothing arrives.
--
-- ORDER: after 20261008160000 (hidden_at) and 20261025050100 (realtime.send in
-- use). Independent of every other held migration.
--
-- VERIFY: select 1 from pg_class where oid =
-- VERIFY:   'public.golf_conversation_pins'::regclass and relrowsecurity;
-- VERIFY: select 1 where (select count(*) from pg_policies where schemaname =
-- VERIFY:   'public' and tablename = 'golf_conversation_pins') = 1;
-- VERIFY: select 1 where not has_table_privilege('authenticated',
-- VERIFY:   'public.golf_conversation_pins', 'INSERT');
-- VERIFY: select 1 where to_regprocedure(
-- VERIFY:   'public.golf_pin_conversation(uuid,boolean)') is not null;
-- VERIFY: select 1 where to_regprocedure(
-- VERIFY:   'public.golf_reorder_conversation_pins(uuid,uuid[])') is not null;
-- VERIFY: select 1 where (select count(*) from pg_policies where schemaname =
-- VERIFY:   'realtime' and tablename = 'messages' and policyname =
-- VERIFY:   'golf_pins_receive') = 1;
--
-- ROLLBACK (one transaction):
--   drop policy if exists golf_pins_receive on realtime.messages;
--   drop trigger if exists golf_participants_unpin_on_leave
--     on public.golf_conversation_participants;
--   drop trigger if exists golf_participants_unpin_on_hide
--     on public.golf_conversation_participants;
--   drop function if exists public.golf_pin_conversation(uuid, boolean);
-- drop function if exists public.golf_reorder_conversation_pins(uuid,
--   uuid[]);
--   drop function if exists helm_private.golf_unpin_on_participant_change();
--   drop function if exists helm_private.golf_pins_compact(uuid, uuid);
--   drop function if exists helm_private.golf_pins_broadcast(uuid, uuid);
--   drop function if exists helm_private.golf_pins_lock(uuid, uuid);
--   drop function if exists helm_private.golf_pin_limit();
--   drop table if exists public.golf_conversation_pins;
-- The app falls back to device pins by itself once the table is gone.

SET lock_timeout = '3s';

DO $$
BEGIN
  IF to_regnamespace('helm_private') IS NULL THEN
    RAISE EXCEPTION 'schema helm_private is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
        AND table_name = 'golf_conversation_participants'
      AND column_name = 'hidden_at'
  ) THEN
    RAISE EXCEPTION 'apply 20261008160000 (hidden_at) first';
  END IF;
  IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL
     OR to_regprocedure('realtime.topic()') IS NULL THEN
    RAISE EXCEPTION 'realtime.send and realtime.topic() must exist';
  END IF;
END $$;

-- 1. The table ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.golf_conversation_pins (
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL
    REFERENCES public.golf_conversations (id) ON DELETE CASCADE,
    team_id uuid,
    -- squawk-ignore prefer-bigint-over-smallint
    position smallint NOT NULL CHECK (position BETWEEN 0 AND 8),
    pinned_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, conversation_id)
);

COMMENT ON TABLE public.golf_conversation_pins IS
'Clubhouse Messages pins, per person per team, in order (position 0 first). '
'Private: only the owner reads them; every write goes through '
'golf_pin_conversation and golf_reorder_conversation_pins.';

CREATE INDEX IF NOT EXISTS golf_conversation_pins_scope_idx
ON public.golf_conversation_pins (user_id, team_id, position);
CREATE INDEX IF NOT EXISTS golf_conversation_pins_conversation_idx
ON public.golf_conversation_pins (conversation_id);

ALTER TABLE public.golf_conversation_pins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS golf_conversation_pins_select_own
ON public.golf_conversation_pins;
CREATE POLICY golf_conversation_pins_select_own
ON public.golf_conversation_pins
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.golf_conversation_pins FROM public, anon, authenticated;
GRANT SELECT ON public.golf_conversation_pins TO authenticated;
GRANT ALL ON public.golf_conversation_pins TO service_role;

-- 2. Helpers -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION helm_private.golf_pin_limit()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 3 $$;

-- Serialises every pin write for one person and scope, so two devices can't
-- both take the last slot.
CREATE OR REPLACE FUNCTION helm_private.golf_pins_lock(p_user uuid, p_team uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT pg_advisory_xact_lock(
    hashtextextended('golf-pins:' || p_user::text || ':'
        || coalesce(p_team::text, 'none'), 0)
  );
$$;

CREATE OR REPLACE FUNCTION helm_private.golf_pins_compact(
    p_user uuid, p_team uuid
)
RETURNS void LANGUAGE sql
SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE public.golf_conversation_pins p
  SET position = r.rn - 1
  FROM (
    SELECT conversation_id,
           row_number() OVER (ORDER BY position, pinned_at,
               conversation_id) AS rn
    FROM public.golf_conversation_pins
    WHERE user_id = p_user AND team_id IS NOT DISTINCT FROM p_team
  ) r
  WHERE p.user_id = p_user
    AND p.conversation_id = r.conversation_id
    AND p.position <> r.rn - 1;
$$;

CREATE OR REPLACE FUNCTION helm_private.golf_pins_broadcast(
    p_user uuid, p_team uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,
pg_temp AS $$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object('team_id', p_team), 'pins', 'golf-pins:'
        || p_user::text, true
  );
EXCEPTION WHEN OTHERS THEN
  -- A failed nudge must never undo the pin; the app also refetches on focus.
  RAISE WARNING 'golf pins broadcast failed for %: % (%)', p_user, SQLERRM,
      SQLSTATE;
END $$;

-- The current pins of one scope, in order, as the functions answer them.
CREATE OR REPLACE FUNCTION helm_private.golf_pins_list(p_user uuid, p_team uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public,
pg_temp AS $$
  SELECT coalesce(array_agg(conversation_id ORDER BY position), '{}')
  FROM public.golf_conversation_pins
  WHERE user_id = p_user AND team_id IS NOT DISTINCT FROM p_team;
$$;

REVOKE ALL ON FUNCTION helm_private.golf_pin_limit() FROM public,
anon,
authenticated;
REVOKE ALL ON FUNCTION helm_private.golf_pins_lock(uuid, uuid) FROM public,
anon,
authenticated;
REVOKE ALL ON FUNCTION helm_private.golf_pins_compact(uuid, uuid) FROM public,
anon,
authenticated;
REVOKE ALL ON FUNCTION helm_private.golf_pins_broadcast(uuid, uuid) FROM public,
anon,
authenticated;
REVOKE ALL ON FUNCTION helm_private.golf_pins_list(uuid, uuid) FROM public,
anon,
authenticated;

-- 3. Pin and unpin -----------------------------------------------------------
-- Idempotent: pinning a pinned conversation, or unpinning one that isn't,
-- changes nothing and answers the current list. Errors (message text):
--   not_signed_in, not_a_member (not a participant, or hidden), pin_limit.

CREATE OR REPLACE FUNCTION public.golf_pin_conversation(
    p_conversation_id uuid, p_pinned boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,
pg_temp AS $$
DECLARE
  v_user uuid := auth.uid();
  v_team uuid;
  v_count integer;
  v_changed boolean := false;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = 'P0001';
  END IF;
  IF p_conversation_id IS NULL OR p_pinned IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = '22023';
  END IF;

  SELECT c.team_id INTO v_team
  FROM public.golf_conversations c
  JOIN public.golf_conversation_participants p
    ON p.conversation_id = c.id AND p.user_id = v_user
  WHERE c.id = p_conversation_id AND p.hidden_at IS NULL;
  IF NOT FOUND THEN
    -- Unpinning something you can no longer see still clears it.
    IF NOT p_pinned THEN
      DELETE FROM public.golf_conversation_pins
      WHERE user_id = v_user AND conversation_id = p_conversation_id
      RETURNING team_id INTO v_team;
      IF FOUND THEN
        PERFORM helm_private.golf_pins_lock(v_user, v_team);
        PERFORM helm_private.golf_pins_compact(v_user, v_team);
        PERFORM helm_private.golf_pins_broadcast(v_user, v_team);
      END IF;
      RETURN jsonb_build_object('team_id', v_team, 'pins',
          to_jsonb(helm_private.golf_pins_list(v_user, v_team)));
    END IF;
    RAISE EXCEPTION 'not_a_member' USING ERRCODE = 'P0001';
  END IF;

  PERFORM helm_private.golf_pins_lock(v_user, v_team);

  IF p_pinned THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.golf_conversation_pins
      WHERE user_id = v_user AND conversation_id = p_conversation_id
    ) THEN
      SELECT count(*) INTO v_count FROM public.golf_conversation_pins
      WHERE user_id = v_user AND team_id IS NOT DISTINCT FROM v_team;
      IF v_count >= helm_private.golf_pin_limit() THEN
        RAISE EXCEPTION 'pin_limit' USING ERRCODE = 'P0001',
          DETAIL = to_jsonb(helm_private.golf_pins_list(v_user, v_team))::text;
      END IF;
      INSERT INTO public.golf_conversation_pins (user_id, conversation_id,
          team_id, position)
      VALUES (v_user, p_conversation_id, v_team, v_count);
      v_changed := true;
    END IF;
  ELSE
    DELETE FROM public.golf_conversation_pins
    WHERE user_id = v_user AND conversation_id = p_conversation_id;
    IF FOUND THEN
      PERFORM helm_private.golf_pins_compact(v_user, v_team);
      v_changed := true;
    END IF;
  END IF;

  IF v_changed THEN
    PERFORM helm_private.golf_pins_broadcast(v_user, v_team);
  END IF;
  RETURN jsonb_build_object('team_id', v_team, 'pins',
      to_jsonb(helm_private.golf_pins_list(v_user, v_team)));
END $$;

-- 4. Reorder -----------------------------------------------------------------
-- p_order must hold exactly the scope's current pins, each once. If another
-- device changed them first, it raises pins_changed with the current list in
-- DETAIL, and the app re-applies the move to that list once.

CREATE OR REPLACE FUNCTION public.golf_reorder_conversation_pins(
    p_team_id uuid, p_order uuid[]
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,
pg_temp AS $$
DECLARE
  v_user uuid := auth.uid();
  v_current uuid[];
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = 'P0001';
  END IF;
  IF p_order IS NULL
      OR cardinality(p_order) <> (SELECT count(DISTINCT x)
          FROM unnest(p_order) x) THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = '22023';
  END IF;

  PERFORM helm_private.golf_pins_lock(v_user, p_team_id);
  v_current := helm_private.golf_pins_list(v_user, p_team_id);

  IF cardinality(v_current) <> cardinality(p_order)
     OR EXISTS (SELECT 1 FROM unnest(p_order) x
         WHERE NOT x = ANY (v_current)) THEN
    RAISE EXCEPTION 'pins_changed'
        USING ERRCODE = 'P0001', DETAIL = to_jsonb(v_current)::text;
  END IF;

  IF v_current IS DISTINCT FROM p_order THEN
    UPDATE public.golf_conversation_pins p
    SET position = o.ord - 1
    FROM unnest(p_order) WITH ORDINALITY AS o(conversation_id, ord)
    WHERE p.user_id = v_user AND p.conversation_id = o.conversation_id;
    PERFORM helm_private.golf_pins_broadcast(v_user, p_team_id);
  END IF;
  RETURN jsonb_build_object('team_id', p_team_id, 'pins',
      to_jsonb(helm_private.golf_pins_list(v_user, p_team_id)));
END $$;

REVOKE ALL ON FUNCTION public.golf_pin_conversation(uuid, boolean) FROM public,
anon;
REVOKE ALL ON FUNCTION public.golf_reorder_conversation_pins(
    uuid, uuid[]
) FROM public,
anon;
GRANT EXECUTE ON FUNCTION public.golf_pin_conversation(
    uuid, boolean
) TO authenticated,
service_role;
GRANT EXECUTE ON FUNCTION public.golf_reorder_conversation_pins(
    uuid, uuid[]
) TO authenticated,
service_role;

-- 5. Leaving or hiding a conversation unpins it ------------------------------

CREATE OR REPLACE FUNCTION helm_private.golf_unpin_on_participant_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,
pg_temp AS $$
DECLARE
  v_team uuid;
BEGIN
  DELETE FROM public.golf_conversation_pins
  WHERE user_id = old.user_id AND conversation_id = old.conversation_id
  RETURNING team_id INTO v_team;
  IF FOUND THEN
    PERFORM helm_private.golf_pins_lock(old.user_id, v_team);
    PERFORM helm_private.golf_pins_compact(old.user_id, v_team);
    PERFORM helm_private.golf_pins_broadcast(old.user_id, v_team);
  END IF;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION helm_private.golf_unpin_on_participant_change()
FROM public,
anon,
authenticated;

DROP TRIGGER IF EXISTS golf_participants_unpin_on_leave
ON public.golf_conversation_participants;
CREATE TRIGGER golf_participants_unpin_on_leave
AFTER DELETE ON public.golf_conversation_participants
FOR EACH ROW EXECUTE FUNCTION helm_private.golf_unpin_on_participant_change();

DROP TRIGGER IF EXISTS golf_participants_unpin_on_hide
ON public.golf_conversation_participants;
CREATE TRIGGER golf_participants_unpin_on_hide
AFTER UPDATE OF hidden_at ON public.golf_conversation_participants
FOR EACH ROW
WHEN (new.hidden_at IS NOT NULL AND old.hidden_at IS NULL)
EXECUTE FUNCTION helm_private.golf_unpin_on_participant_change();

-- 6. Private realtime topic: golf-pins:<your id>, receive only
--   -----------------

DROP POLICY IF EXISTS golf_pins_receive ON realtime.messages;
CREATE POLICY golf_pins_receive ON realtime.messages
FOR SELECT TO authenticated
USING (
    realtime.messages.extension = 'broadcast'
    AND (SELECT realtime.topic()) = 'golf-pins:' || (SELECT auth.uid())::text
);
-- No INSERT policy: clients never send on golf-pins topics; only the database
-- does (realtime.send runs as owner).
