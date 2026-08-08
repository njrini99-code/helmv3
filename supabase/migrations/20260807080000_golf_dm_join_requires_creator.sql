-- A private DM must not be joinable by anyone who happens to share its team_id.
--
-- Found by testing dual-squad visibility on Shenandoah, which runs a Men's and
-- a Women's team under one organization with one coach staffing both.
--
-- createConversation stamps team_id from the CREATOR's resolved active team,
-- not from the participants. On a two-squad program that is frequently the
-- OTHER squad — in production, a 1:1 DM between two Women's players carries the
-- MEN'S team_id. golf_participants_insert_v2 then granted self-join to anyone
-- on "the conversation's team", so a MEN'S player could insert himself into two
-- Women's players' private DM and read it. Reproduced on production in a
-- rolled-back transaction; it returned 0 messages only because that particular
-- DM is empty, so the mechanism, not the payload, is the finding.
--
-- That gate exists for the TEAM CHAT bootstrap — letting a team member join
-- their squad's group chat. It was never meant to cover private DMs, where the
-- only person who should add participants is the creator.
--
-- Self-add now requires EITHER:
--   * you created this conversation (a definer check, because the
--     golf_conversations SELECT policy denies a brand-new row — this is the
--     bootstrap DM creation depends on, see src/app/actions/messages.ts), or
--   * it is a TEAM CHAT on a team you belong to.
-- The creator-adds-anyone disjunct is unchanged.
--
-- VERIFIED on production in rolled-back transactions:
--   ATTACK  men's player self-joins the women's DM ..... BLOCKED 42501
--   CONTROL coach creates a DM, self+other, posts ...... PASSES (bootstrap intact)
--   CONTROL player creates a DM to their coach ......... PASSES
--   CONTROL coach still sees the women's roster (6) .... PASSES
--
-- NOTE (not fixed here, deliberately): the misfiled team_id on that DM is left
-- alone. With this policy a DM's team_id no longer grants anyone access, so it
-- is cosmetic rather than a boundary. Re-stamping historical rows would be a
-- guess about which squad a two-squad conversation "belongs" to.

CREATE OR REPLACE FUNCTION public.golf_conversation_created_by_me(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.golf_conversations c
    WHERE c.id = p_conversation_id AND c.created_by = auth.uid()
  );
$fn$;

COMMENT ON FUNCTION public.golf_conversation_created_by_me(uuid) IS
  'Did the CALLER create this conversation? Runs with definer rights because '
  'golf_conversations SELECT denies a brand-new row, which is exactly the '
  'moment DM creation needs this answer.';

REVOKE EXECUTE ON FUNCTION public.golf_conversation_created_by_me(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.golf_conversation_created_by_me(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.golf_conversation_created_by_me(uuid) TO authenticated;

DROP POLICY IF EXISTS golf_participants_insert_v2 ON public.golf_conversation_participants;

CREATE POLICY golf_participants_insert_v2 ON public.golf_conversation_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = (SELECT auth.uid())
      AND (
        public.golf_conversation_created_by_me(conversation_id)
        OR EXISTS (
          SELECT 1 FROM public.golf_conversations c
          WHERE c.id = conversation_id
            AND c.is_team_chat = true
            AND c.team_id IS NOT NULL
            AND public.golf_conversation_on_my_team(conversation_id)
        )
      ))
    OR EXISTS (
      SELECT 1 FROM public.golf_conversations gc
      WHERE gc.id = conversation_id AND gc.created_by = (SELECT auth.uid())
    )
  );
