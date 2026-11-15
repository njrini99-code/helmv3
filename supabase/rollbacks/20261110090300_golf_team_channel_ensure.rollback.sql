-- Rollback for 20261110090300_golf_team_channel_ensure.sql.
-- Run as one transaction (psql -1 -v ON_ERROR_STOP=1 -f <this file>).
--
-- Puts back the two trigger function bodies of 20261110090200 (a new member
-- joins the channel only if the team has one), then drops the ensure function
-- and the unique index.
-- ORDER: roll back 20261110090500 first (drop
-- helm_private.golf_team_channel_backfill(): it calls the ensure function),
-- then this file, then 20261110090200, and only after those the files they
-- trust (20261110090050, 20261107090100, 20261110090700). 20261110090400 and
-- 20261110090600 do not depend on this file and can stay.
--
-- Not undone: channels created while the file was applied stay, with the
-- people in them. Nothing marks them as created by a trigger except a title
-- ending in ' — Team Channel' and a created_at after the apply.

SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION helm_private.golf_team_channel_join_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Active now, and not active before this statement.
  IF NEW.status IS DISTINCT FROM 'active'::public.team_member_status THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NULL;
  END IF;
  -- Never fail the roster write: joining the team matters more than the channel row.
  BEGIN
    INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    SELECT c.id, gp.user_id
    FROM public.golf_players AS gp
    INNER JOIN public.golf_conversations AS c
      ON c.team_id = NEW.team_id AND c.is_team_channel = true
    WHERE gp.id = NEW.player_id
      AND gp.user_id IS NOT NULL
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING
      'golf team channel auto-join failed for team % player %: % (%)',
      NEW.team_id, NEW.player_id, SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION helm_private.golf_team_channel_join_member()
FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION helm_private.golf_team_channel_join_staff()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Never fail the staff write.
  BEGIN
    INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    SELECT c.id, gc.user_id
    FROM public.golf_coaches AS gc
    INNER JOIN public.golf_conversations AS c
      ON c.team_id = NEW.team_id AND c.is_team_channel = true
    WHERE gc.id = NEW.coach_id
      AND gc.user_id IS NOT NULL
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING
      'golf team channel auto-join failed for team % coach %: % (%)',
      NEW.team_id, NEW.coach_id, SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION helm_private.golf_team_channel_join_staff()
FROM public, anon, authenticated;

DROP FUNCTION IF EXISTS helm_private.golf_ensure_team_channel(uuid);

DROP INDEX IF EXISTS public.golf_conversations_one_team_channel_uq;
