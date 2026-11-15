-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md). OPTIONAL: Messages v2
-- search. The app works without it.
-- Apply:
--   npm run db:apply -- \
--     supabase/migrations/20261107090500_golf_search_messages.sql
-- Risk: LOW. One new SECURITY INVOKER function; no table, policy or grant on
-- an existing object changes.
--
-- Purpose: today's search (searchGolfMessages,
-- src/app/actions/messages.ts:1483) filters ilike '%q%' over a client-built
-- `.in('conversation_id', ids)` list, takes a global top 50 and the
-- in-conversation search then filters that 50 on the client, so an old hit
-- can be pushed out by 50 newer hits elsewhere; the id list also grows with
-- the number of conversations (URL length). This moves the scope into SQL.
--
-- golf_search_messages(p_query, p_conversation_id default null,
--                      p_limit default 50)
--   returns (message_id, conversation_id, sender_id, content, created_at),
--   newest first.
--   * SECURITY INVOKER: RLS on golf_messages (golf_messages_select_v2: the
--     caller's conversations) is the scope. The join to the caller's own
--     participant row is the second, explicit guard and carries the
--     hidden-conversation rule: a conversation the caller hid is searchable
--     again only once a newer message arrived (as the inbox and the badge
--     do).
--   * Deleted messages never match. Poll messages match through their
--     `content` fallback text.
--   * Fewer than 2 characters after trimming returns nothing. %, _ and \ in
--     the query are matched literally.
--   * p_limit is clamped to 1..100.
--   * EXECUTE: authenticated and service_role only.
--   No trigram index (measured nothing: staging has 83 messages, production
--   622). Add `CREATE INDEX CONCURRENTLY ... USING gin (content
--   gin_trgm_ops) WHERE NOT is_deleted` separately (it cannot run inside the
--   apply transaction) once a search is measured slow; pg_trgm is installed
--   on production. The reaction-kind CHECK floated in DATA.md is deliberately
--   NOT here (production holds only five of the six kinds, all valid, but a
--   CHECK would make a seventh kind a deploy-order hazard for Fairway).
--
-- App change needed (package A, optional): replace the `.in()` + top-50
-- filter in searchGolfMessagesImpl and MessageHits with one
-- rpc('golf_search_messages', { p_query, p_conversation_id }) call.
--
-- ORDER: after M1/M2 (column grants) so the participant rows it joins are the
-- hardened ones; otherwise independent.
--
-- VERIFY: select 1 where to_regprocedure('public.golf_search_messages(text,uuid,integer)') is not null and has_function_privilege('authenticated', 'public.golf_search_messages(text,uuid,integer)', 'execute') and not has_function_privilege('anon', 'public.golf_search_messages(text,uuid,integer)', 'execute'); -- noqa: LT05
-- VERIFY: select 1 from pg_proc where oid = 'public.golf_search_messages(text,uuid,integer)'::regprocedure and not prosecdef; -- noqa: LT05
--
-- ROLLBACK (one statement; nothing depends on the function until the app
-- switches):
--   drop function if exists
--     public.golf_search_messages(text, uuid, integer);
-- pgTAP: supabase/tests/rls/golf_search_messages.sql

SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.golf_search_messages(
    p_query text,
    p_conversation_id uuid DEFAULT NULL,
    p_limit integer DEFAULT 50
)
RETURNS TABLE (
    message_id uuid,
    conversation_id uuid,
    sender_id uuid,
    content text,
    created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_q       text := btrim(coalesce(p_query, ''));
  v_pattern text;
  v_limit   integer := least(greatest(coalesce(p_limit, 50), 1), 100);
BEGIN
  IF char_length(v_q) < 2 THEN
    RETURN;
  END IF;
  v_pattern := '%'
    || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_')
    || '%';

  RETURN QUERY
  SELECT m.id, m.conversation_id, m.sender_id, m.content, m.created_at
  FROM public.golf_messages m
  JOIN public.golf_conversation_participants cp
    ON cp.conversation_id = m.conversation_id
   AND cp.user_id = (SELECT auth.uid())
  WHERE NOT COALESCE(m.is_deleted, FALSE)
    AND (p_conversation_id IS NULL OR m.conversation_id = p_conversation_id)
    AND m.content ILIKE v_pattern ESCAPE '\'
    AND (
      cp.hidden_at IS NULL
      OR EXISTS (
        SELECT 1 FROM public.golf_messages hm
        WHERE hm.conversation_id = m.conversation_id
          AND NOT COALESCE(hm.is_deleted, FALSE)
          AND hm.created_at > cp.hidden_at
      )
    )
  ORDER BY m.created_at DESC
  LIMIT v_limit;
END $$;

REVOKE ALL ON FUNCTION public.golf_search_messages(text, uuid, integer)
FROM public, anon;
GRANT EXECUTE ON FUNCTION public.golf_search_messages(text, uuid, integer)
TO authenticated, service_role;
