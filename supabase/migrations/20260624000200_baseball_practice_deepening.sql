-- ============================================================================
-- Migration: 20260624000200_baseball_practice_deepening.sql
-- Packet: practice-intel (BaseballHelm — Practice Generator + Scrimmage +
--         Intelligence Board)
--
-- Implements:
--   * v7_practice_plan_generator_and_scrimmage_lineup_builder.md
--       - Main row content (description, station_type, group_label, equipment,
--         measurement target, measured/unmeasured)
--       - Scrimmage lineup builder (defensive positions, batting order,
--         availability/conflict flags)
--   * v5_practice_development_operating_engine.md
--       - Practice outline rows: source reason, visibility, group
--       - Intelligence rail: signal -> block conversion (link table)
--   * v2_data_contracts_expanded.md  (Practice Lite tables — EXTEND, not clone)
--   * v2_role_permission_matrix.md   (player sees assigned blocks, not staff-only)
--
-- SAFETY CONTRACT (CLAUDE.md hard rules + zip binding guardrails):
--   * ADDITIVE ONLY. ALTER ... ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT
--     EXISTS. No DROP, no destructive DML. EXTENDS the existing baseball_practice
--     tables created in 20260624000060 (never clones them).
--   * RLS ENABLED on every NEW table here (deny-by-default). Policies are
--     attached in the same file below (to_regclass-guarded) so the tables are
--     never world-readable. No GRANTs to anon.
--   * Player-visible gating: a block carries `visibility`; players only ever see
--     blocks of PUBLISHED practices whose visibility <> 'staff_only' AND that are
--     assigned to no group OR to a group the player belongs to is enforced in the
--     read layer; the SQL floor is "published practice, not staff_only".
--   * NO direct vendor integrations. Signal links reference an in-DB
--     baseball_coach_insights row (source -> signal -> action -> timeline).
--
-- This file is WRITTEN, NOT APPLIED. Production GolfHelm shares this database;
-- migrations are applied out-of-band by a human, never by an agent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTEND baseball_practice_blocks with the V7/V5 row-content fields.
--    Every column is additive + nullable (or defaulted) so existing rows and
--    the existing planner keep working unchanged.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_practice_blocks') IS NOT NULL THEN
    -- Optional description that expands under the headline (V7 "Main row content").
    ALTER TABLE public.baseball_practice_blocks
      ADD COLUMN IF NOT EXISTS description text;

    -- Station type — a controlled label, NOT free golf vocabulary. Recalibrated
    -- for baseball stations (V7 example table).
    ALTER TABLE public.baseball_practice_blocks
      ADD COLUMN IF NOT EXISTS station_type text;

    -- Player group / squad label the block is assigned to (V5 outline "group").
    ALTER TABLE public.baseball_practice_blocks
      ADD COLUMN IF NOT EXISTS group_label text;

    -- Equipment needed (V7 "equipment").
    ALTER TABLE public.baseball_practice_blocks
      ADD COLUMN IF NOT EXISTS equipment text;

    -- Measurement target + measured/unmeasured (V7 "measurement target",
    -- "Mark station as measured/unmeasured").
    ALTER TABLE public.baseball_practice_blocks
      ADD COLUMN IF NOT EXISTS measurement_target text;
    ALTER TABLE public.baseball_practice_blocks
      ADD COLUMN IF NOT EXISTS is_measured boolean NOT NULL DEFAULT false;

    -- Source reason — the human-readable WHY behind the block (V5 outline
    -- "source reason"). Populated when a block is generated from a signal.
    ALTER TABLE public.baseball_practice_blocks
      ADD COLUMN IF NOT EXISTS source_reason text;

    -- The insight/signal this block was converted from (V5 "convert signal to
    -- block"). Nullable; SET NULL on delete so the block survives if the insight
    -- is archived. source -> signal -> action -> timeline.
    ALTER TABLE public.baseball_practice_blocks
      ADD COLUMN IF NOT EXISTS source_insight_id uuid
      REFERENCES public.baseball_coach_insights(id) ON DELETE SET NULL;

    -- Block visibility (V2 role-permission matrix: practice plan — player sees
    -- relevant groups/stations, not staff-only notes). Defaults player_visible
    -- so existing blocks stay visible; staff_only hides a block from players.
    ALTER TABLE public.baseball_practice_blocks
      ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'player_visible';

    -- Constrain visibility to the V2 vocabulary (NOT VALID so it never fails on
    -- pre-existing rows; new writes are validated).
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'baseball_practice_blocks_visibility_check'
    ) THEN
      ALTER TABLE public.baseball_practice_blocks
        ADD CONSTRAINT baseball_practice_blocks_visibility_check
        CHECK (visibility IN ('staff_only', 'player_visible', 'restricted')) NOT VALID;
    END IF;

    -- start_offset_min must land on the 5-minute time rail (V7 "5-min time-rail
    -- builder"). NOT VALID so legacy rows are untouched.
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'baseball_practice_blocks_rail_5min_check'
    ) THEN
      ALTER TABLE public.baseball_practice_blocks
        ADD CONSTRAINT baseball_practice_blocks_rail_5min_check
        CHECK (start_offset_min >= 0 AND duration_min > 0) NOT VALID;
    END IF;

    CREATE INDEX IF NOT EXISTS idx_bpb_source_insight
      ON public.baseball_practice_blocks(source_insight_id);
    CREATE INDEX IF NOT EXISTS idx_bpb_visibility
      ON public.baseball_practice_blocks(practice_id, visibility);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. baseball_practice_scrimmages — a scrimmage attached to a practice
--    (V7 "Scrimmage Lineup Builder" + "Scrimmage Modes"). Scrimmage stats are
--    SEPARATE from official game stats (V7 §Scrimmage Stats) — this table is the
--    development-side container, never the official record.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.baseball_practice_scrimmages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid NOT NULL REFERENCES public.baseball_teams(id),
  practice_id  uuid REFERENCES public.baseball_practices(id) ON DELETE CASCADE,
  -- The practice block this scrimmage realizes (V7 "Controlled scrimmage" row).
  block_id     uuid REFERENCES public.baseball_practice_blocks(id) ON DELETE SET NULL,
  title        text NOT NULL,
  -- V7 Scrimmage Modes.
  mode         text NOT NULL DEFAULT 'intrasquad'
               CHECK (mode IN (
                 'intrasquad', 'situational', 'pitcher_live_ab',
                 'defense_only', 'bullpen_live'
               )),
  status       text NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'published', 'completed')),
  notes        text,
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3. baseball_practice_lineup_slots — one row per assigned slot in a scrimmage.
--    Carries defensive position label + batting order + side (intrasquad teams)
--    + planned innings + note (V7 "Lineup Table"). A slot can be a fielding
--    assignment (defensive_position set), a batting-order assignment
--    (batting_order set), or both. Bench/bullpen are represented as
--    defensive_position values.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.baseball_practice_lineup_slots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id            uuid NOT NULL REFERENCES public.baseball_teams(id),
  scrimmage_id       uuid NOT NULL REFERENCES public.baseball_practice_scrimmages(id) ON DELETE CASCADE,
  player_id          uuid NOT NULL REFERENCES public.baseball_players(id),
  -- Intrasquad team split (V7 "Team Blue vs Team White"). NULL for non-intrasquad.
  side               text CHECK (side IN ('blue', 'white')),
  -- V7 labeled defensive positions: P,C,1B,2B,3B,SS,LF,CF,RF,DH,bench,bullpen.
  defensive_position text CHECK (defensive_position IN (
                       'P','C','1B','2B','3B','SS','LF','CF','RF','DH','bench','bullpen'
                     )),
  -- 1..9 batting order; NULL = not in the batting order (defense-only / bench).
  batting_order      integer CHECK (batting_order IS NULL OR (batting_order BETWEEN 1 AND 9)),
  inning_start       integer,
  inning_end         integer,
  note               text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),
  -- A player can hold at most one slot per (scrimmage, side) — prevents the same
  -- player being placed in two positions on the same squad. Supports safe upsert.
  CONSTRAINT uq_bpls UNIQUE (scrimmage_id, side, player_id)
);

-- ----------------------------------------------------------------------------
-- Indexes for the scrimmage read paths.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bps_team       ON public.baseball_practice_scrimmages(team_id);
CREATE INDEX IF NOT EXISTS idx_bps_practice   ON public.baseball_practice_scrimmages(practice_id);
CREATE INDEX IF NOT EXISTS idx_bps_block      ON public.baseball_practice_scrimmages(block_id);
CREATE INDEX IF NOT EXISTS idx_bpls_scrimmage ON public.baseball_practice_lineup_slots(scrimmage_id);
CREATE INDEX IF NOT EXISTS idx_bpls_player    ON public.baseball_practice_lineup_slots(player_id);
CREATE INDEX IF NOT EXISTS idx_bpls_team      ON public.baseball_practice_lineup_slots(team_id);

-- ----------------------------------------------------------------------------
-- 4. RLS — ENABLE deny-by-default + attach policies (to_regclass-guarded so the
--    file is safe to (re)run). Scrimmages inherit the practice visibility model:
--    staff manage via can_manage_practice OR can_manage_lineups; players read
--    PUBLISHED scrimmages of their team only. Writes are staff-capped.
-- ----------------------------------------------------------------------------

-- baseball_practice_scrimmages
DO $$
BEGIN
  IF to_regclass('public.baseball_practice_scrimmages') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_practice_scrimmages ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "baseball_practice_scrimmages_select" ON public.baseball_practice_scrimmages';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_practice_scrimmages_insert" ON public.baseball_practice_scrimmages';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_practice_scrimmages_update" ON public.baseball_practice_scrimmages';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_practice_scrimmages_delete" ON public.baseball_practice_scrimmages';

    EXECUTE $p$CREATE POLICY "baseball_practice_scrimmages_select" ON public.baseball_practice_scrimmages
      FOR SELECT TO authenticated
      USING (
        public.is_baseball_team_staff(team_id)
        OR (status = 'published' AND public.is_baseball_team_member(team_id))
      )$p$;
    EXECUTE $p$CREATE POLICY "baseball_practice_scrimmages_insert" ON public.baseball_practice_scrimmages
      FOR INSERT TO authenticated
      WITH CHECK (
        public.has_baseball_staff_capability(team_id, 'can_manage_practice')
        OR public.has_baseball_staff_capability(team_id, 'can_manage_lineups')
      )$p$;
    EXECUTE $p$CREATE POLICY "baseball_practice_scrimmages_update" ON public.baseball_practice_scrimmages
      FOR UPDATE TO authenticated
      USING (
        public.has_baseball_staff_capability(team_id, 'can_manage_practice')
        OR public.has_baseball_staff_capability(team_id, 'can_manage_lineups')
      )
      WITH CHECK (
        public.has_baseball_staff_capability(team_id, 'can_manage_practice')
        OR public.has_baseball_staff_capability(team_id, 'can_manage_lineups')
      )$p$;
    EXECUTE $p$CREATE POLICY "baseball_practice_scrimmages_delete" ON public.baseball_practice_scrimmages
      FOR DELETE TO authenticated
      USING (
        public.has_baseball_staff_capability(team_id, 'can_manage_practice')
        OR public.has_baseball_staff_capability(team_id, 'can_manage_lineups')
      )$p$;
  END IF;
END $$;

-- baseball_practice_lineup_slots (inherits scrimmage published visibility)
DO $$
BEGIN
  IF to_regclass('public.baseball_practice_lineup_slots') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_practice_lineup_slots ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "baseball_practice_lineup_slots_select" ON public.baseball_practice_lineup_slots';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_practice_lineup_slots_insert" ON public.baseball_practice_lineup_slots';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_practice_lineup_slots_update" ON public.baseball_practice_lineup_slots';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_practice_lineup_slots_delete" ON public.baseball_practice_lineup_slots';

    EXECUTE $p$CREATE POLICY "baseball_practice_lineup_slots_select" ON public.baseball_practice_lineup_slots
      FOR SELECT TO authenticated
      USING (
        public.has_baseball_staff_capability(team_id, 'can_manage_practice')
        OR public.has_baseball_staff_capability(team_id, 'can_manage_lineups')
        OR (
          public.is_baseball_team_member(team_id)
          AND EXISTS (
            SELECT 1 FROM public.baseball_practice_scrimmages s
            WHERE s.id = baseball_practice_lineup_slots.scrimmage_id
              AND s.status = 'published'
          )
        )
      )$p$;
    EXECUTE $p$CREATE POLICY "baseball_practice_lineup_slots_insert" ON public.baseball_practice_lineup_slots
      FOR INSERT TO authenticated
      WITH CHECK (
        public.has_baseball_staff_capability(team_id, 'can_manage_practice')
        OR public.has_baseball_staff_capability(team_id, 'can_manage_lineups')
      )$p$;
    EXECUTE $p$CREATE POLICY "baseball_practice_lineup_slots_update" ON public.baseball_practice_lineup_slots
      FOR UPDATE TO authenticated
      USING (
        public.has_baseball_staff_capability(team_id, 'can_manage_practice')
        OR public.has_baseball_staff_capability(team_id, 'can_manage_lineups')
      )
      WITH CHECK (
        public.has_baseball_staff_capability(team_id, 'can_manage_practice')
        OR public.has_baseball_staff_capability(team_id, 'can_manage_lineups')
      )$p$;
    EXECUTE $p$CREATE POLICY "baseball_practice_lineup_slots_delete" ON public.baseball_practice_lineup_slots
      FOR DELETE TO authenticated
      USING (
        public.has_baseball_staff_capability(team_id, 'can_manage_practice')
        OR public.has_baseball_staff_capability(team_id, 'can_manage_lineups')
      )$p$;
  END IF;
END $$;

-- ============================================================================
-- END — practice deepening. ADDITIVE. NOT applied to any DB.
-- ============================================================================
