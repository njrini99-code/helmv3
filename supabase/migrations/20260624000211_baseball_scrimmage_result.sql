-- ============================================================================
-- Migration: 20260624000211_baseball_scrimmage_result.sql
-- Packet: qa-screens (BaseballHelm — Practice Recap / block-completion flow)
--
-- DEEPENS the Practice Recap flow (v7 §Practice Recap, retained by v10 as the
-- human-entered completion + effectiveness flow). The recap producer already
-- captures per-objective completion / reps / notes / video; this migration adds
-- the ONE missing recap capture the v7 spec calls out and v10 keeps: the
-- post-practice "score the controlled scrimmage" entry point.
--
-- v7 §Practice Recap requires "score scrimmage". The scrimmage table created in
-- 20260624000200 carries a 'completed' status but had NO place to record a
-- result, so a coach could build/publish a scrimmage but never close it out with
-- a score. These additive columns make the human-entered scrimmage result a real
-- producer (source -> signal -> review): a completed scrimmage with a score is a
-- concrete, dated development outing the effectiveness engine and Stats Lab can
-- later read as SCRIMMAGE-scoped (never official-game) data.
--
-- SAFETY CONTRACT (CLAUDE.md hard rules + zip binding guardrails):
--   * ADDITIVE ONLY. ALTER ... ADD COLUMN IF NOT EXISTS. No DROP, no destructive
--     DML. EXTENDS baseball_practice_scrimmages created in 20260624000200.
--   * Scrimmage result stays DEVELOPMENT-SIDE — these columns live on the
--     scrimmage container, never on baseball_games / official rows (V7 §Scrimmage
--     Stats: scrimmage data is separate from the official record).
--   * RLS is UNCHANGED — the existing baseball_practice_scrimmages policy set
--     (staff manage via can_manage_practice OR can_manage_lineups; players read
--     PUBLISHED rows of their team) already governs these new columns. No new
--     GRANTs; anon is never granted.
--   * No new table, so no anon-exposure surface to REVOKE.
--
-- This file is WRITTEN, NOT APPLIED. Production GolfHelm shares this database;
-- migrations are applied out-of-band by a human, never by an agent.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.baseball_practice_scrimmages') IS NOT NULL THEN
    -- Runs scored per side. For an intrasquad scrimmage these are Blue / White;
    -- for situational / live-AB modes a coach may use them as a simple
    -- "offense / defense outcome" tally or leave them NULL and use result_note.
    ALTER TABLE public.baseball_practice_scrimmages
      ADD COLUMN IF NOT EXISTS blue_score integer
      CHECK (blue_score IS NULL OR blue_score >= 0);
    ALTER TABLE public.baseball_practice_scrimmages
      ADD COLUMN IF NOT EXISTS white_score integer
      CHECK (white_score IS NULL OR white_score >= 0);

    -- Innings actually played (development context for the result; nullable).
    ALTER TABLE public.baseball_practice_scrimmages
      ADD COLUMN IF NOT EXISTS innings_played integer
      CHECK (innings_played IS NULL OR innings_played >= 0);

    -- Free-text coach note on the outing — what the scrimmage actually showed
    -- (the human-entered completion note v10 keeps; NOT a generated summary).
    ALTER TABLE public.baseball_practice_scrimmages
      ADD COLUMN IF NOT EXISTS result_note text;

    -- When the scrimmage was scored / closed out. Set alongside status =
    -- 'completed' so the engine + Stats Lab can date the outing.
    ALTER TABLE public.baseball_practice_scrimmages
      ADD COLUMN IF NOT EXISTS completed_at timestamptz;

    -- Index the completed outings for the effectiveness / stats read paths.
    CREATE INDEX IF NOT EXISTS idx_bps_completed
      ON public.baseball_practice_scrimmages(team_id, completed_at)
      WHERE completed_at IS NOT NULL;
  END IF;
END $$;
