-- ============================================================================
-- CRITICAL AUDIT FIXES - Migration 052
-- Generated from COMPREHENSIVE_DATABASE_AUDIT.md
-- Date: 2026-01-02
--
-- This migration fixes 5 CRITICAL issues identified in the audit:
-- 1. golf_player_stats - Missing RLS policies
-- 2. golf_course_tees - Missing RLS policies
-- 3. golf_shots - Security vulnerability (USING(true))
-- 4. Schema-code mismatch - Missing columns in golf_rounds
-- 5. Schema-code mismatch - Missing columns in golf_holes
-- ============================================================================

-- ============================================================================
-- CRITICAL FIX #1: golf_player_stats RLS policies
-- Impact: Stats caching system is broken, data inaccessible
-- ============================================================================

CREATE POLICY "Players can view own stats"
ON public.golf_player_stats FOR SELECT TO authenticated
USING (
  player_id IN (
    SELECT id FROM public.golf_players WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Coaches can view team player stats"
ON public.golf_player_stats FOR SELECT TO authenticated
USING (
  player_id IN (
    SELECT gp.id FROM public.golf_players gp
    WHERE gp.team_id IN (
      SELECT team_id FROM public.golf_coaches WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Service role can manage stats"
ON public.golf_player_stats FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- ============================================================================
-- CRITICAL FIX #2: golf_course_tees RLS policies
-- Impact: Course tee information inaccessible
-- ============================================================================

CREATE POLICY "Users can view course tees"
ON public.golf_course_tees FOR SELECT TO authenticated
USING (
  course_id IN (
    SELECT id FROM public.golf_courses
    WHERE created_by = auth.uid() OR is_public = true
  )
);

CREATE POLICY "Course creators can manage tees"
ON public.golf_course_tees FOR ALL TO authenticated
USING (
  course_id IN (
    SELECT id FROM public.golf_courses WHERE created_by = auth.uid()
  )
)
WITH CHECK (
  course_id IN (
    SELECT id FROM public.golf_courses WHERE created_by = auth.uid()
  )
);

-- ============================================================================
-- CRITICAL FIX #3: golf_shots security vulnerability
-- Impact: ANY authenticated user can read/modify/delete ANY user's shots
-- ============================================================================

-- Drop the dangerous policy
DROP POLICY IF EXISTS "Authenticated users can access golf_shots" ON public.golf_shots;

-- Add proper security policies
CREATE POLICY "Players can manage own shots"
ON public.golf_shots FOR ALL TO authenticated
USING (
  round_id IN (
    SELECT id FROM public.golf_rounds
    WHERE player_id IN (
      SELECT id FROM public.golf_players WHERE user_id = auth.uid()
    )
  )
)
WITH CHECK (
  round_id IN (
    SELECT id FROM public.golf_rounds
    WHERE player_id IN (
      SELECT id FROM public.golf_players WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Coaches can view team shots"
ON public.golf_shots FOR SELECT TO authenticated
USING (
  round_id IN (
    SELECT gr.id FROM public.golf_rounds gr
    JOIN public.golf_players gp ON gr.player_id = gp.id
    WHERE gp.team_id IN (
      SELECT team_id FROM public.golf_coaches WHERE user_id = auth.uid()
    )
  )
);

-- ============================================================================
-- CRITICAL FIX #4: Add missing columns to golf_rounds
-- Impact: submitGolfRoundComprehensive() fails to save stats
-- ============================================================================

ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS driving_distance_avg numeric;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS driving_accuracy numeric;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS putts_per_gir numeric;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS scrambling_attempts integer DEFAULT 0;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS scrambles_made integer DEFAULT 0;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS sand_save_attempts integer DEFAULT 0;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS sand_saves_made integer DEFAULT 0;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS penalty_strokes integer DEFAULT 0;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS three_putts integer DEFAULT 0;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS birdies integer DEFAULT 0;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS pars integer DEFAULT 0;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS bogeys integer DEFAULT 0;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS double_bogeys_plus integer DEFAULT 0;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS eagles integer DEFAULT 0;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS longest_drive integer;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS longest_putt_made integer;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS longest_hole_out integer;

-- ============================================================================
-- CRITICAL FIX #5: Add missing columns to golf_holes
-- Impact: Comprehensive hole stats not being saved
-- ============================================================================

ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS driving_distance integer;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS used_driver boolean;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS drive_miss_direction text;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS approach_distance integer;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS approach_lie text;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS approach_result text;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS approach_miss_direction text;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS approach_proximity integer;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS scramble_attempt boolean;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS scramble_made boolean;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS sand_save_attempt boolean;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS sand_save_made boolean;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS up_and_down_attempt boolean;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS up_and_down_made boolean;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS penalty_strokes integer DEFAULT 0;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS first_putt_distance integer;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS first_putt_leave text;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS first_putt_break text;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS first_putt_slope text;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS first_putt_miss_direction text;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS holed_out_distance integer;
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS holed_out_type text;

-- ============================================================================
-- ADDITIONAL FIX: cleanup_old_login_attempts function security
-- Impact: Missing SET search_path on SECURITY DEFINER function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_old_login_attempts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  DELETE FROM public.login_attempts
  WHERE last_attempt < NOW() - INTERVAL '7 days'
  AND (locked_until IS NULL OR locked_until < NOW());
END;
$$;

-- ============================================================================
-- SUMMARY OF FIXES
-- ============================================================================
-- Critical fixes from comprehensive database audit:
-- - Added RLS policies to golf_player_stats (3 policies)
-- - Added RLS policies to golf_course_tees (2 policies)
-- - Fixed golf_shots security vulnerability (replaced USING(true) with proper policies)
-- - Added 17 missing columns to golf_rounds for comprehensive stats
-- - Added 22 missing columns to golf_holes for detailed hole tracking
-- - Fixed cleanup_old_login_attempts function security
