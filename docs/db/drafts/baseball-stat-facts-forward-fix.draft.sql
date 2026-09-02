-- DRAFT — NOT APPLIED. For commander/owner review only.
-- Forward-fix: create baseball_stat_facts and baseball_import_field_mappings,
-- the two tables from 20260624000080_baseball_elite_stat_event_model.sql that
-- never actually got created live (11 of that migration's 13 tables did exist
-- live already, under a repair-migration stamp with a different DDL shape;
-- these two are the genuine gap, independently reconfirmed 2026-08-19 by
-- searching live information_schema.tables for ANY table matching
-- %stat_fact%, %field_mapping%, %import_mapping% -- zero hits, so this is not
-- a rename, it is a real absence).
--
-- Scoped DELIBERATELY narrow: the source file also defines RLS policies for
-- baseball_stat_facts via a SHARED loop that iterates 10 tables, 8 of which
-- ALREADY EXIST live (created under a different migration with only 23% body
-- match to this file) -- re-running that shared loop would DROP POLICY /
-- CREATE POLICY on those 8 live tables too, and I do not know whether their
-- current live policies match this loop's output. That is out of scope for
-- "just these three things," so this draft extracts ONLY the one VALUES row
-- for baseball_stat_facts out of that loop, and does not touch the other 8
-- tables at all.
--
-- All FK dependencies verified live 2026-08-19: baseball_teams, baseball_players,
-- baseball_games, baseball_import_runs, baseball_stat_sources all exist.
-- All referenced helper functions verified live: get_my_coach_id,
-- can_view_baseball_player, get_my_baseball_player_id,
-- has_baseball_staff_capability.

begin;

-- --- baseball_import_field_mappings -----------------------------------------
CREATE TABLE IF NOT EXISTS public.baseball_import_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.baseball_stat_sources(id) ON DELETE CASCADE,
  mapping_name TEXT NOT NULL,
  import_type TEXT NOT NULL,
  csv_header TEXT NOT NULL,
  canonical_field TEXT NOT NULL,
  transform_rule TEXT,
  unit TEXT,
  is_required BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_baseball_import_field_mappings_row
    UNIQUE (team_id, source_id, mapping_name, csv_header)
);
CREATE INDEX IF NOT EXISTS idx_baseball_import_field_mappings_team
  ON public.baseball_import_field_mappings(team_id);

ALTER TABLE public.baseball_import_field_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_import_field_mappings_select" ON public.baseball_import_field_mappings;
DROP POLICY IF EXISTS "baseball_import_field_mappings_insert" ON public.baseball_import_field_mappings;
DROP POLICY IF EXISTS "baseball_import_field_mappings_update" ON public.baseball_import_field_mappings;
DROP POLICY IF EXISTS "baseball_import_field_mappings_delete" ON public.baseball_import_field_mappings;

CREATE POLICY "baseball_import_field_mappings_select" ON public.baseball_import_field_mappings
  FOR SELECT TO authenticated
  USING (public.has_baseball_staff_capability(team_id, 'can_manage_imports'));
CREATE POLICY "baseball_import_field_mappings_insert" ON public.baseball_import_field_mappings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_imports'));
CREATE POLICY "baseball_import_field_mappings_update" ON public.baseball_import_field_mappings
  FOR UPDATE TO authenticated
  USING (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))
  WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_imports'));
CREATE POLICY "baseball_import_field_mappings_delete" ON public.baseball_import_field_mappings
  FOR DELETE TO authenticated
  USING (public.has_baseball_staff_capability(team_id, 'can_manage_imports'));

REVOKE ALL ON public.baseball_import_field_mappings FROM anon;

-- --- baseball_stat_facts ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.baseball_stat_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  player_id UUID REFERENCES public.baseball_players(id) ON DELETE SET NULL,
  game_id UUID REFERENCES public.baseball_games(id) ON DELETE SET NULL,
  event_id UUID,
  practice_id UUID,
  video_id UUID,
  import_run_id UUID REFERENCES public.baseball_import_runs(id) ON DELETE SET NULL,
  source_id UUID REFERENCES public.baseball_stat_sources(id) ON DELETE SET NULL,
  data_context TEXT NOT NULL DEFAULT 'manual' CHECK (data_context IN (
    'official_game', 'scrimmage', 'practice', 'bullpen', 'cage',
    'showcase', 'sensor', 'video', 'lift', 'readiness', 'manual'
  )),
  metric_key TEXT NOT NULL,
  metric_value_numeric NUMERIC,
  metric_value_text TEXT,
  metric_value_json JSONB,
  unit TEXT,
  context JSONB,
  measured_at TIMESTAMPTZ,
  trust_tier TEXT NOT NULL DEFAULT 'unverified',
  visibility TEXT NOT NULL DEFAULT 'staff_only' CHECK (visibility IN (
    'staff_only', 'player_visible', 'restricted'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_baseball_facts_team_player_metric
  ON public.baseball_stat_facts(team_id, player_id, metric_key);
CREATE INDEX IF NOT EXISTS idx_baseball_facts_import
  ON public.baseball_stat_facts(import_run_id);

ALTER TABLE public.baseball_stat_facts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_stat_facts_select" ON public.baseball_stat_facts;
DROP POLICY IF EXISTS "baseball_stat_facts_insert" ON public.baseball_stat_facts;
DROP POLICY IF EXISTS "baseball_stat_facts_update" ON public.baseball_stat_facts;
DROP POLICY IF EXISTS "baseball_stat_facts_delete" ON public.baseball_stat_facts;

-- Same pattern as the source file's shared per-event-table policy loop,
-- extracted for this ONE table only ('player_id' is this table's primary
-- player column, per the source migration's VALUES list).
CREATE POLICY "baseball_stat_facts_select" ON public.baseball_stat_facts
  FOR SELECT TO authenticated
  USING (
    (public.get_my_coach_id() IS NOT NULL
      AND public.can_view_baseball_player(team_id, player_id))
    OR (player_id = public.get_my_baseball_player_id()
      AND visibility <> 'staff_only')
  );
CREATE POLICY "baseball_stat_facts_insert" ON public.baseball_stat_facts
  FOR INSERT TO authenticated
  WITH CHECK (public.get_my_coach_id() IS NOT NULL
    AND public.can_view_baseball_player(team_id, player_id));
CREATE POLICY "baseball_stat_facts_update" ON public.baseball_stat_facts
  FOR UPDATE TO authenticated
  USING (public.get_my_coach_id() IS NOT NULL
    AND public.can_view_baseball_player(team_id, player_id))
  WITH CHECK (public.get_my_coach_id() IS NOT NULL
    AND public.can_view_baseball_player(team_id, player_id));
CREATE POLICY "baseball_stat_facts_delete" ON public.baseball_stat_facts
  FOR DELETE TO authenticated
  USING (public.get_my_coach_id() IS NOT NULL
    AND public.can_view_baseball_player(team_id, player_id));

REVOKE ALL ON public.baseball_stat_facts FROM anon;

commit;

-- --- baseball_seasons_one_current_per_team: DELIBERATELY NOT INCLUDED -------
-- See commander message 2026-08-19: the live `baseball_seasons` table (created
-- by 20260527000000_prod_public_baseline.sql, NOT by this era's migrations)
-- has NO `is_current` column. It uses season_year + UNIQUE(team_id,
-- season_year) as its uniqueness key instead. The index as specified in
-- 20260624000095_baseball_team_and_season_settings.sql cannot be created
-- against this schema -- CREATE UNIQUE INDEX ... WHERE is_current = true
-- would fail with "column is_current does not exist". Needs a decision, not
-- a blind lift. See OBSERVATIONS_LANE_A.md for the full writeup and options.
