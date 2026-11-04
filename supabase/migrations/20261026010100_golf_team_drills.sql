-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- N-00 v2 Practice, slice 0.
-- WHY: The team's own drill bank. A drill made inside a plan saves here; a GolfHelm library drill (public.golf_drills) can be copied here to edit. diagram names the set-up diagram preset drawn in the printed drills appendix (no uploads).
-- WHO: Coaches of the team (public.is_golf_team_coach) select, insert and update. No DELETE grant: drills are archived (archived_at) so drafts that use them keep saving. Players have no access; they see drills only as frozen into published versions.
-- ORDER: After 20261026010000 (independent of it; listed second so 010500 can check references).
-- RISK: New table only. No triggers.
-- ROLLBACK: (roll back 010600 and 010500 first) DROP TABLE IF EXISTS public.golf_team_drills CASCADE;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace = 'public'::regnamespace AND relname = 'golf_team_drills' AND relrowsecurity;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'golf_team_drills' HAVING count(*) = 3;
-- VERIFY: SELECT 1 WHERE NOT has_table_privilege('authenticated', 'public.golf_team_drills', 'DELETE') AND NOT has_table_privilege('authenticated', 'public.golf_team_drills', 'TRUNCATE') AND NOT has_table_privilege('anon', 'public.golf_team_drills', 'SELECT');

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.golf_team_drills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.golf_teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  area text NOT NULL,
  kind text NOT NULL DEFAULT 'skill',
  minutes integer NOT NULL,
  players text NOT NULL DEFAULT 'solo',
  equipment jsonb NOT NULL DEFAULT '[]'::jsonb,
  setup text NOT NULL DEFAULT '',
  goal text NOT NULL DEFAULT '',
  scoring jsonb NOT NULL DEFAULT '[]'::jsonb,
  levels jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  media_url text,
  diagram text NOT NULL DEFAULT 'auto',
  copied_from_drill_id uuid REFERENCES public.golf_drills(id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_by uuid NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT golf_team_drills_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT golf_team_drills_area_check CHECK (area IN ('putting', 'short_game', 'bunker', 'approach', 'tee', 'course', 'fitness', 'mental')),
  CONSTRAINT golf_team_drills_kind_check CHECK (kind IN ('skill', 'random', 'pressure')),
  CONSTRAINT golf_team_drills_minutes_range CHECK (minutes BETWEEN 1 AND 180),
  CONSTRAINT golf_team_drills_players_check CHECK (players IN ('solo', 'pairs', 'group')),
  -- Lengths are read only once the type is known (CASE): a CHECK's AND is not evaluated in a promised order.
  CONSTRAINT golf_team_drills_equipment_shape CHECK (
    CASE WHEN jsonb_typeof(equipment) = 'array'
         THEN jsonb_array_length(equipment) <= 20
              AND NOT jsonb_path_exists(equipment, 'lax $[*] ? (@.item.type() != "string" || @.qty.type() != "number")')
         ELSE false END
  ),
  CONSTRAINT golf_team_drills_text_lengths CHECK (char_length(setup) <= 1000 AND char_length(goal) <= 200),
  CONSTRAINT golf_team_drills_scoring_shape CHECK (
    CASE WHEN jsonb_typeof(scoring) = 'array'
         THEN jsonb_array_length(scoring) <= 10
              AND NOT jsonb_path_exists(scoring, 'lax $[*] ? (@.label.type() != "string" || @.points.type() != "number")')
         ELSE false END
  ),
  CONSTRAINT golf_team_drills_levels_shape CHECK (
    CASE WHEN jsonb_typeof(levels) = 'object'
         THEN (levels - 'par' - 'birdie' - 'eagle') = '{}'::jsonb
              AND NOT jsonb_path_exists(levels, 'lax $.* ? (@.type() != "string")')
         ELSE false END
  ),
  CONSTRAINT golf_team_drills_tags_count CHECK (cardinality(tags) <= 10),
  CONSTRAINT golf_team_drills_media_url CHECK (media_url IS NULL OR (media_url ~ '^https://[^\s]+$' AND char_length(media_url) <= 500)),
  CONSTRAINT golf_team_drills_diagram_check CHECK (diagram IN ('auto', 'none', 'rings', 'gate', 'ladder', 'landing', 'targets'))
);

CREATE UNIQUE INDEX IF NOT EXISTS golf_team_drills_team_name_uniq
  ON public.golf_team_drills (team_id, lower(btrim(name))) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS golf_team_drills_team_area_idx
  ON public.golf_team_drills (team_id, area) WHERE archived_at IS NULL;

ALTER TABLE public.golf_team_drills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS golf_team_drills_select ON public.golf_team_drills;
CREATE POLICY golf_team_drills_select ON public.golf_team_drills
  FOR SELECT TO authenticated USING (public.is_golf_team_coach(team_id));

DROP POLICY IF EXISTS golf_team_drills_insert ON public.golf_team_drills;
CREATE POLICY golf_team_drills_insert ON public.golf_team_drills
  FOR INSERT TO authenticated
  WITH CHECK (public.is_golf_team_coach(team_id) AND created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS golf_team_drills_update ON public.golf_team_drills;
CREATE POLICY golf_team_drills_update ON public.golf_team_drills
  FOR UPDATE TO authenticated
  USING (public.is_golf_team_coach(team_id))
  WITH CHECK (public.is_golf_team_coach(team_id));

REVOKE ALL ON public.golf_team_drills FROM anon;
REVOKE ALL ON public.golf_team_drills FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.golf_team_drills TO authenticated;
GRANT ALL ON public.golf_team_drills TO service_role;
