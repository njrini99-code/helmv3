-- Active-round protection must be table-specific.
--
-- The old one-size-fits-all trigger function referenced OLD.qualifier_id,
-- OLD.team_id, OLD.player_id, and OLD.id in branches selected by
-- TG_TABLE_NAME. PostgreSQL validates record fields against the trigger row
-- type before the inactive branches can protect us, so deleting a
-- golf_team_members row failed with:
--   record "old" has no field "qualifier_id"
--
-- Keep the protection and its exact coach-facing messages, but bind each
-- trigger to a function whose OLD record has exactly the fields it reads.
-- This is schema-only: no row data, RLS policy, or authorization boundary is
-- widened. The functions remain invoker-context trigger functions.
--
-- Rollback: recreate helm_private.prevent_active_round_stranding() from the
-- prior definition and repoint these four trigger names to it. Do not drop the
-- triggers: they prevent an admin from stranding recoverable rounds.

BEGIN;

-- Older baseline histories do not guarantee this private implementation
-- schema exists yet. Make a fresh schema replay equivalent to production
-- before creating the replacement trigger functions below.
CREATE SCHEMA IF NOT EXISTS helm_private;

CREATE OR REPLACE FUNCTION helm_private.prevent_qualifier_entry_active_round_stranding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.golf_rounds
    WHERE player_id = OLD.player_id
      AND qualifier_id = OLD.qualifier_id
      AND status = 'in_progress'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'This player has a saved qualifier round. Have them finish or explicitly discard it before removing their qualifier entry.';
  END IF;

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION helm_private.prevent_qualifier_active_round_stranding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.golf_rounds
    WHERE qualifier_id = OLD.id
      AND status = 'in_progress'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'This qualifier has saved rounds. Have players finish or explicitly discard them before deleting the qualifier.';
  END IF;

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION helm_private.prevent_team_member_active_round_stranding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.golf_rounds
    WHERE team_id = OLD.team_id
      AND player_id = OLD.player_id
      AND status = 'in_progress'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'This player has a saved round. Have them finish or explicitly discard it before removing them from the team.';
  END IF;

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION helm_private.prevent_team_active_round_stranding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.golf_rounds
    WHERE team_id = OLD.id
      AND status = 'in_progress'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'This team has saved rounds. Have players finish or explicitly discard them before deleting the team.';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS golf_qualifier_entries_prevent_active_round_stranding ON public.golf_qualifier_entries;
DROP TRIGGER IF EXISTS golf_qualifiers_prevent_active_round_stranding ON public.golf_qualifiers;
DROP TRIGGER IF EXISTS golf_team_members_prevent_active_round_stranding ON public.golf_team_members;
DROP TRIGGER IF EXISTS golf_teams_prevent_active_round_stranding ON public.golf_teams;

CREATE TRIGGER golf_qualifier_entries_prevent_active_round_stranding
BEFORE DELETE ON public.golf_qualifier_entries
FOR EACH ROW
EXECUTE FUNCTION helm_private.prevent_qualifier_entry_active_round_stranding();

CREATE TRIGGER golf_qualifiers_prevent_active_round_stranding
BEFORE DELETE ON public.golf_qualifiers
FOR EACH ROW
EXECUTE FUNCTION helm_private.prevent_qualifier_active_round_stranding();

CREATE TRIGGER golf_team_members_prevent_active_round_stranding
BEFORE DELETE ON public.golf_team_members
FOR EACH ROW
EXECUTE FUNCTION helm_private.prevent_team_member_active_round_stranding();

CREATE TRIGGER golf_teams_prevent_active_round_stranding
BEFORE DELETE ON public.golf_teams
FOR EACH ROW
EXECUTE FUNCTION helm_private.prevent_team_active_round_stranding();

DROP FUNCTION IF EXISTS helm_private.prevent_active_round_stranding();

COMMIT;
