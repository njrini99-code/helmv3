-- ============================================================================
-- Migration: 20260624000060_baseball_practices.sql
-- Packet: practice-planner (BaseballHelm Wave 8)
-- Source: WAVE_BUILD_PLAN.json migrations[] sql_sketch
--         "20260623T0005_baseball_practices"
--
-- Purpose: Practice header + timed blocks + per-player attendance, optionally
--          linked to a baseball_events row. Drives the Practice Planner Lite:
--          time-slot blocks, stations, staff assignment; draft-vs-published
--          publishing so players only ever see published schedules.
--
-- SAFETY CONTRACT (CLAUDE.md hard rules):
--   * ADDITIVE ONLY. CREATE TABLE IF NOT EXISTS. No DROP, no destructive DML.
--   * RLS is ENABLED here on every new table so the table is never readable
--     before the policy migration (20260624000050) attaches its policies. The
--     0050 policy blocks are guarded with to_regclass() and will activate for
--     these tables once this migration has landed; that file may be (re)run
--     after this one to (re)assert the policies.
--   * No GRANTs to anon. RLS + the 0050 policies (authenticated-only) govern
--     all access; service_role bypasses RLS for cron / AI writes.
--
-- This file is WRITTEN, NOT APPLIED. Production GolfHelm shares this database;
-- migrations are applied out-of-band by a human, never by an agent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- baseball_practices — one row per planned practice session.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.baseball_practices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid NOT NULL REFERENCES public.baseball_teams(id),
  event_id     uuid REFERENCES public.baseball_events(id),
  title        text NOT NULL,
  focus        text,
  status       text NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'published', 'completed')),
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- baseball_practice_blocks — timed activity blocks (stations) within a practice.
-- start_offset_min is minutes from the practice start; duration_min its length.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.baseball_practice_blocks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id          uuid NOT NULL REFERENCES public.baseball_teams(id),
  practice_id      uuid NOT NULL REFERENCES public.baseball_practices(id) ON DELETE CASCADE,
  start_offset_min integer NOT NULL,
  duration_min     integer NOT NULL,
  activity         text NOT NULL,
  location         text,
  coach_owner_id   uuid REFERENCES public.baseball_coaches(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- baseball_practice_attendance — per-player attendance status for a practice.
-- UNIQUE(practice_id, player_id) supports idempotent upsert (no delete/reinsert).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.baseball_practice_attendance (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES public.baseball_teams(id),
  practice_id uuid NOT NULL REFERENCES public.baseball_practices(id) ON DELETE CASCADE,
  player_id   uuid NOT NULL REFERENCES public.baseball_players(id),
  status      text NOT NULL
              CHECK (status IN ('present', 'limited', 'absent', 'excused')),
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  CONSTRAINT uq_bpa UNIQUE (practice_id, player_id)
);

-- ----------------------------------------------------------------------------
-- Indexes for the planner read paths.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bp_team           ON public.baseball_practices(team_id);
CREATE INDEX IF NOT EXISTS idx_bp_event          ON public.baseball_practices(event_id);
CREATE INDEX IF NOT EXISTS idx_bpb_practice      ON public.baseball_practice_blocks(practice_id);
CREATE INDEX IF NOT EXISTS idx_bpb_team          ON public.baseball_practice_blocks(team_id);
CREATE INDEX IF NOT EXISTS idx_bpa_practice      ON public.baseball_practice_attendance(practice_id);
CREATE INDEX IF NOT EXISTS idx_bpa_player        ON public.baseball_practice_attendance(player_id);
CREATE INDEX IF NOT EXISTS idx_bpa_team          ON public.baseball_practice_attendance(team_id);

-- ----------------------------------------------------------------------------
-- RLS ENABLED (deny-by-default). The helper migration also contains
-- to_regclass-guarded copies of these policies for reruns, but this migration
-- attaches the initial policies immediately after creating the practice tables:
--   * baseball_practices            : staff read/write via can_manage_practice;
--                                     players read status='published' only.
--   * baseball_practice_blocks      : inherits practice visibility.
--   * baseball_practice_attendance  : staff manage; player reads own row.
-- That keeps replay order deterministic and prevents policy drift.
-- ----------------------------------------------------------------------------
ALTER TABLE public.baseball_practices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.baseball_practice_blocks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.baseball_practice_attendance  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_practices_select" ON public.baseball_practices;
DROP POLICY IF EXISTS "baseball_practices_insert" ON public.baseball_practices;
DROP POLICY IF EXISTS "baseball_practices_update" ON public.baseball_practices;
DROP POLICY IF EXISTS "baseball_practices_delete" ON public.baseball_practices;

CREATE POLICY "baseball_practices_select" ON public.baseball_practices
  FOR SELECT TO authenticated
  USING (
    public.is_baseball_team_staff(team_id)
    OR (status = 'published' AND public.is_baseball_team_member(team_id))
  );
CREATE POLICY "baseball_practices_insert" ON public.baseball_practices
  FOR INSERT TO authenticated
  WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_practice'));
CREATE POLICY "baseball_practices_update" ON public.baseball_practices
  FOR UPDATE TO authenticated
  USING (public.has_baseball_staff_capability(team_id, 'can_manage_practice'))
  WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_practice'));
CREATE POLICY "baseball_practices_delete" ON public.baseball_practices
  FOR DELETE TO authenticated
  USING (public.has_baseball_staff_capability(team_id, 'can_manage_practice'));

DROP POLICY IF EXISTS "baseball_practice_blocks_select" ON public.baseball_practice_blocks;
DROP POLICY IF EXISTS "baseball_practice_blocks_insert" ON public.baseball_practice_blocks;
DROP POLICY IF EXISTS "baseball_practice_blocks_update" ON public.baseball_practice_blocks;
DROP POLICY IF EXISTS "baseball_practice_blocks_delete" ON public.baseball_practice_blocks;

CREATE POLICY "baseball_practice_blocks_select" ON public.baseball_practice_blocks
  FOR SELECT TO authenticated
  USING (
    public.is_baseball_team_staff(team_id)
    OR (
      public.is_baseball_team_member(team_id)
      AND EXISTS (
        SELECT 1
        FROM public.baseball_practices p
        WHERE p.id = baseball_practice_blocks.practice_id
          AND p.status = 'published'
      )
    )
  );
CREATE POLICY "baseball_practice_blocks_insert" ON public.baseball_practice_blocks
  FOR INSERT TO authenticated
  WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_practice'));
CREATE POLICY "baseball_practice_blocks_update" ON public.baseball_practice_blocks
  FOR UPDATE TO authenticated
  USING (public.has_baseball_staff_capability(team_id, 'can_manage_practice'))
  WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_practice'));
CREATE POLICY "baseball_practice_blocks_delete" ON public.baseball_practice_blocks
  FOR DELETE TO authenticated
  USING (public.has_baseball_staff_capability(team_id, 'can_manage_practice'));

DROP POLICY IF EXISTS "baseball_practice_attendance_select" ON public.baseball_practice_attendance;
DROP POLICY IF EXISTS "baseball_practice_attendance_insert" ON public.baseball_practice_attendance;
DROP POLICY IF EXISTS "baseball_practice_attendance_update" ON public.baseball_practice_attendance;
DROP POLICY IF EXISTS "baseball_practice_attendance_delete" ON public.baseball_practice_attendance;

CREATE POLICY "baseball_practice_attendance_select" ON public.baseball_practice_attendance
  FOR SELECT TO authenticated
  USING (
    public.has_baseball_staff_capability(team_id, 'can_manage_practice')
    OR player_id = public.get_my_baseball_player_id()
  );
CREATE POLICY "baseball_practice_attendance_insert" ON public.baseball_practice_attendance
  FOR INSERT TO authenticated
  WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_practice'));
CREATE POLICY "baseball_practice_attendance_update" ON public.baseball_practice_attendance
  FOR UPDATE TO authenticated
  USING (public.has_baseball_staff_capability(team_id, 'can_manage_practice'))
  WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_practice'));
CREATE POLICY "baseball_practice_attendance_delete" ON public.baseball_practice_attendance
  FOR DELETE TO authenticated
  USING (public.has_baseball_staff_capability(team_id, 'can_manage_practice'));

-- ============================================================================
-- END — baseball practice tables. ADDITIVE. NOT applied to any DB.
-- ============================================================================
