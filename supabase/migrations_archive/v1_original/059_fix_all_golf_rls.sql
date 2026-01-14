-- =====================================================
-- FIX ALL GOLF TABLE RLS POLICIES
-- Fixes 500 errors and 42P17 across all golf tables
-- =====================================================

-- ============================================
-- GOLF_PLAYER_CLASSES
-- ============================================
ALTER TABLE golf_player_classes DISABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'golf_player_classes' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON golf_player_classes', r.policyname);
  END LOOP;
END $$;

ALTER TABLE golf_player_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "golf_player_classes_select" ON golf_player_classes FOR SELECT TO authenticated
USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

CREATE POLICY "golf_player_classes_insert" ON golf_player_classes FOR INSERT TO authenticated
WITH CHECK (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

CREATE POLICY "golf_player_classes_update" ON golf_player_classes FOR UPDATE TO authenticated
USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()))
WITH CHECK (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

CREATE POLICY "golf_player_classes_delete" ON golf_player_classes FOR DELETE TO authenticated
USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

-- ============================================
-- GOLF_COACHES
-- ============================================
ALTER TABLE golf_coaches DISABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'golf_coaches' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON golf_coaches', r.policyname);
  END LOOP;
END $$;

ALTER TABLE golf_coaches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "golf_coaches_select" ON golf_coaches FOR SELECT TO authenticated USING (true);
CREATE POLICY "golf_coaches_insert" ON golf_coaches FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "golf_coaches_update" ON golf_coaches FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "golf_coaches_delete" ON golf_coaches FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============================================
-- GOLF_TEAMS
-- ============================================
ALTER TABLE golf_teams DISABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'golf_teams' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON golf_teams', r.policyname);
  END LOOP;
END $$;

ALTER TABLE golf_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "golf_teams_select" ON golf_teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "golf_teams_insert" ON golf_teams FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "golf_teams_update" ON golf_teams FOR UPDATE TO authenticated
USING (
  id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
  OR id IN (SELECT team_id FROM golf_players WHERE user_id = auth.uid())
)
WITH CHECK (
  id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
  OR id IN (SELECT team_id FROM golf_players WHERE user_id = auth.uid())
);

-- ============================================
-- GOLF_ROUNDS
-- ============================================
ALTER TABLE golf_rounds DISABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'golf_rounds' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON golf_rounds', r.policyname);
  END LOOP;
END $$;

ALTER TABLE golf_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "golf_rounds_select" ON golf_rounds FOR SELECT TO authenticated
USING (
  player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid())
  OR player_id IN (
    SELECT gp.id FROM golf_players gp
    INNER JOIN golf_coaches gc ON gp.team_id = gc.team_id
    WHERE gc.user_id = auth.uid()
  )
);

CREATE POLICY "golf_rounds_insert" ON golf_rounds FOR INSERT TO authenticated
WITH CHECK (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

CREATE POLICY "golf_rounds_update" ON golf_rounds FOR UPDATE TO authenticated
USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()))
WITH CHECK (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

CREATE POLICY "golf_rounds_delete" ON golf_rounds FOR DELETE TO authenticated
USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

-- ============================================
-- GOLF_PLAYERS (also getting 500 errors)
-- ============================================
ALTER TABLE golf_players DISABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'golf_players' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON golf_players', r.policyname);
  END LOOP;
END $$;

ALTER TABLE golf_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "golf_players_select" ON golf_players FOR SELECT TO authenticated USING (true);
CREATE POLICY "golf_players_insert" ON golf_players FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "golf_players_update" ON golf_players FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "golf_players_delete" ON golf_players FOR DELETE TO authenticated USING (user_id = auth.uid());
