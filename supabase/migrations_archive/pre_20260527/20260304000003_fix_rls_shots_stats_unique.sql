-- ============================================================================
-- Migration: 20260304000003_fix_rls_shots_stats_unique.sql
-- Purpose: Fix 3 database security/integrity bugs:
--   P0 #7:  Coach-access RLS policies on stats cache tables reference
--           non-existent gc.team_id / p.team_id columns.
--   P0 #8:  RLS on golf_shots filters only through nullable hole_id,
--           making shots with NULL hole_id invisible.
--   P1 #30: No unique constraint on (round_id, hole_number, shot_number)
--           in golf_shots — only a regular index exists.
--
-- Approach:
--   - Drop broken policies, create correct replacements using
--     golf_coaches.organization_id -> golf_teams.organization_id ->
--     golf_team_members.player_id (the correct join path), wrapped in the
--     existing is_golf_team_coach(team_uuid) SECURITY DEFINER helper.
--   - Add OR round_id fallback to all golf_shots policies so shots with
--     NULL hole_id are still visible.
--   - Add a UNIQUE constraint on golf_shots(round_id, hole_number, shot_number).
-- ============================================================================

-- ============================================================================
-- PART 1: Fix golf_shots RLS — add round_id fallback (Bug #8)
--
-- The existing golf_shots policies (most recently set by migration
-- 20260213000000_fix_broken_coach_select_rls.sql) route exclusively
-- through hole_id. Since hole_id is nullable, shots with NULL hole_id
-- are invisible to ALL users. We replace every policy to also check
-- round_id as a fallback.
-- ============================================================================

-- ----- SELECT own -----
DROP POLICY IF EXISTS "golf_shots_select_own" ON golf_shots;

CREATE POLICY "golf_shots_select_own"
ON golf_shots FOR SELECT TO authenticated
USING (
  -- Path 1: via hole_id (when populated)
  hole_id IN (
    SELECT gh.id FROM golf_holes gh
    JOIN golf_rounds gr ON gr.id = gh.round_id
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
  -- Path 2: via round_id directly (covers NULL hole_id)
  OR round_id IN (
    SELECT gr.id FROM golf_rounds gr
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
);

-- ----- SELECT team (coach) -----
DROP POLICY IF EXISTS "golf_shots_select_team" ON golf_shots;

CREATE POLICY "golf_shots_select_team"
ON golf_shots FOR SELECT TO authenticated
USING (
  -- Path 1: via hole_id -> round -> team
  hole_id IN (
    SELECT gh.id FROM golf_holes gh
    JOIN golf_rounds gr ON gr.id = gh.round_id
    WHERE gr.team_id IS NOT NULL
      AND is_golf_team_coach(gr.team_id)
  )
  -- Path 2: via round_id -> team directly
  OR round_id IN (
    SELECT gr.id FROM golf_rounds gr
    WHERE gr.team_id IS NOT NULL
      AND is_golf_team_coach(gr.team_id)
  )
);

-- ----- INSERT own -----
DROP POLICY IF EXISTS "golf_shots_insert_own" ON golf_shots;

CREATE POLICY "golf_shots_insert_own"
ON golf_shots FOR INSERT TO authenticated
WITH CHECK (
  -- Path 1: via hole_id
  hole_id IN (
    SELECT gh.id FROM golf_holes gh
    JOIN golf_rounds gr ON gr.id = gh.round_id
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
  -- Path 2: via round_id (allows inserting shots before hole record exists)
  OR round_id IN (
    SELECT gr.id FROM golf_rounds gr
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
);

-- ----- UPDATE own -----
DROP POLICY IF EXISTS "golf_shots_update_own" ON golf_shots;

CREATE POLICY "golf_shots_update_own"
ON golf_shots FOR UPDATE TO authenticated
USING (
  hole_id IN (
    SELECT gh.id FROM golf_holes gh
    JOIN golf_rounds gr ON gr.id = gh.round_id
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
  OR round_id IN (
    SELECT gr.id FROM golf_rounds gr
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
)
WITH CHECK (
  hole_id IN (
    SELECT gh.id FROM golf_holes gh
    JOIN golf_rounds gr ON gr.id = gh.round_id
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
  OR round_id IN (
    SELECT gr.id FROM golf_rounds gr
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
);

-- ----- DELETE own -----
DROP POLICY IF EXISTS "golf_shots_delete_own" ON golf_shots;

CREATE POLICY "golf_shots_delete_own"
ON golf_shots FOR DELETE TO authenticated
USING (
  hole_id IN (
    SELECT gh.id FROM golf_holes gh
    JOIN golf_rounds gr ON gr.id = gh.round_id
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
  OR round_id IN (
    SELECT gr.id FROM golf_rounds gr
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
);


-- ============================================================================
-- PART 2: Fix stats cache RLS policies (Bug #7)
--
-- The policies in 040_golf_shot_system.sql JOIN
--   golf_coaches c ON c.team_id = p.team_id
-- but neither golf_coaches nor golf_players has a team_id column.
--
-- Correct path: player_id -> golf_team_members.player_id ->
--   golf_team_members.team_id -> is_golf_team_coach(team_id)
-- ============================================================================

-- ---- golf_player_stats_cache ----

DROP POLICY IF EXISTS "Coaches can view team player stats" ON golf_player_stats_cache;

CREATE POLICY "Coaches can view team player stats" ON golf_player_stats_cache
  FOR SELECT TO authenticated
  USING (
    player_id IN (
      SELECT gtm.player_id FROM golf_team_members gtm
      WHERE gtm.status = 'active'
        AND is_golf_team_coach(gtm.team_id)
    )
  );

DROP POLICY IF EXISTS "Coaches can manage team stats cache" ON golf_player_stats_cache;

CREATE POLICY "Coaches can manage team stats cache" ON golf_player_stats_cache
  FOR ALL TO authenticated
  USING (
    player_id IN (
      SELECT gtm.player_id FROM golf_team_members gtm
      WHERE gtm.status = 'active'
        AND is_golf_team_coach(gtm.team_id)
    )
  );

-- ---- golf_round_stats_cache ----

DROP POLICY IF EXISTS "Coaches can view team round stats" ON golf_round_stats_cache;

CREATE POLICY "Coaches can view team round stats" ON golf_round_stats_cache
  FOR SELECT TO authenticated
  USING (
    player_id IN (
      SELECT gtm.player_id FROM golf_team_members gtm
      WHERE gtm.status = 'active'
        AND is_golf_team_coach(gtm.team_id)
    )
  );

DROP POLICY IF EXISTS "Coaches can manage round stats cache" ON golf_round_stats_cache;

CREATE POLICY "Coaches can manage round stats cache" ON golf_round_stats_cache
  FOR ALL TO authenticated
  USING (
    player_id IN (
      SELECT gtm.player_id FROM golf_team_members gtm
      WHERE gtm.status = 'active'
        AND is_golf_team_coach(gtm.team_id)
    )
  );

-- ---- golf_putting_tendencies ----

DROP POLICY IF EXISTS "Coaches can view team putting tendencies" ON golf_putting_tendencies;

CREATE POLICY "Coaches can view team putting tendencies" ON golf_putting_tendencies
  FOR SELECT TO authenticated
  USING (
    player_id IN (
      SELECT gtm.player_id FROM golf_team_members gtm
      WHERE gtm.status = 'active'
        AND is_golf_team_coach(gtm.team_id)
    )
  );

DROP POLICY IF EXISTS "Coaches can manage putting tendencies" ON golf_putting_tendencies;

CREATE POLICY "Coaches can manage putting tendencies" ON golf_putting_tendencies
  FOR ALL TO authenticated
  USING (
    player_id IN (
      SELECT gtm.player_id FROM golf_team_members gtm
      WHERE gtm.status = 'active'
        AND is_golf_team_coach(gtm.team_id)
    )
  );


-- ============================================================================
-- PART 3: Add UNIQUE constraint on golf_shots (Bug #30)
--
-- The existing index idx_golf_shots_round_hole_shot is a regular B-tree
-- index on (round_id, hole_number, shot_number). We drop it and replace
-- it with a UNIQUE index to enforce data integrity.
-- ============================================================================

DROP INDEX IF EXISTS idx_golf_shots_round_hole_shot;

-- Deduplicate any existing rows before adding UNIQUE constraint
-- Keeps the row with the earliest created_at for each (round_id, hole_number, shot_number)
DELETE FROM golf_shots
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY round_id, hole_number, shot_number
             ORDER BY created_at ASC
           ) AS rn
    FROM golf_shots
  ) ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX idx_golf_shots_round_hole_shot
  ON golf_shots (round_id, hole_number, shot_number);

COMMENT ON INDEX idx_golf_shots_round_hole_shot IS
  'UNIQUE constraint: prevents duplicate shot numbers per hole per round. Replaces prior non-unique index.';
