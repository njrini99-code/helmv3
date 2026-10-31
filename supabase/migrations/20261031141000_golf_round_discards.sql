-- A discarded round stays discarded on every device, and what was discarded is kept.
--
-- Owner approved 2026-10-31 ("discard tombstone"; "archive so no data is lost"). Discard hard-deletes the in-progress
-- golf_rounds row (deleteInProgressRound), and its holes and shots cascade. The "this round was discarded" mark lived
-- only in the discarding device's storage, so another phone or the iPad still holding a local copy (IndexedDB
-- snapshot, emergency save) offered it back as "Restore your round", and restoring started it again.
--
-- golf_round_discards: one row per in-progress round deleted, written by a BEFORE DELETE trigger in the same
-- statement (so a delete that rolls back leaves no tombstone), with the round, its holes and its shots as they were.
-- The player reads their own rows (the recovery paths ask "were any of these discarded?"); nobody writes them except
-- the trigger. Completed rounds cannot be deleted (guard_golf_round_lifecycle), so only in-progress deletes reach it.
--
-- ROLLBACK: drop trigger golf_rounds_discard_tombstone on golf_rounds; drop function
--   helm_private.golf_rounds_discard_tombstone(); the table may be kept (it is the archive) or dropped by hand.
--
-- VERIFY: select 1 from pg_trigger where tgname = 'golf_rounds_discard_tombstone' and tgrelid = 'public.golf_rounds'::regclass;
-- VERIFY: select 1 from pg_class where relname = 'golf_round_discards' and relrowsecurity;

CREATE TABLE IF NOT EXISTS public.golf_round_discards (
  round_id uuid PRIMARY KEY,
  player_id uuid NOT NULL,
  discarded_at timestamptz NOT NULL DEFAULT now(),
  discarded_by uuid,
  round_before jsonb NOT NULL,
  holes_before jsonb NOT NULL DEFAULT '[]'::jsonb,
  shots_before jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS golf_round_discards_player_idx ON public.golf_round_discards (player_id, discarded_at DESC);

ALTER TABLE public.golf_round_discards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.golf_round_discards FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.golf_round_discards FROM authenticated;
GRANT SELECT ON public.golf_round_discards TO authenticated;

DROP POLICY IF EXISTS golf_round_discards_select_own ON public.golf_round_discards;
CREATE POLICY golf_round_discards_select_own ON public.golf_round_discards
  FOR SELECT TO authenticated
  USING (player_id IN (SELECT p.id FROM public.golf_players p WHERE p.user_id = (SELECT auth.uid())));

CREATE OR REPLACE FUNCTION helm_private.golf_rounds_discard_tombstone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.golf_round_discards (round_id, player_id, discarded_by, round_before, holes_before, shots_before)
  VALUES (
    OLD.id,
    OLD.player_id,
    auth.uid(),
    to_jsonb(OLD),
    coalesce((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.hole_number) FROM public.golf_holes h WHERE h.round_id = OLD.id), '[]'::jsonb),
    coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM public.golf_shots s WHERE s.round_id = OLD.id), '[]'::jsonb)
  )
  ON CONFLICT (round_id) DO NOTHING;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION helm_private.golf_rounds_discard_tombstone() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS golf_rounds_discard_tombstone ON public.golf_rounds;
CREATE TRIGGER golf_rounds_discard_tombstone
  BEFORE DELETE ON public.golf_rounds
  FOR EACH ROW
  WHEN (OLD.status = 'in_progress')
  EXECUTE FUNCTION helm_private.golf_rounds_discard_tombstone();
