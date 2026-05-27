-- ============================================================================
-- Migration: Wave 7A — drop 12 verified-unused indexes + pattern auto-promote
-- ============================================================================
-- All 12 indexes verified via pg_stat_user_indexes.idx_scan = 0 across two
-- audit snapshots (2026-05-23 and 2026-05-24). Each is also small (8kB-32kB)
-- meaning no significant query plan ever depended on them. Dropping
-- reduces write amplification on every INSERT/UPDATE to the parent table.
--
-- Auto-promotion sweeper for golf_patterns_v2 added because 7,397 of 7,400
-- patterns (99.96%) are stuck in `detected` because the coach-validation UI
-- flow is rarely used. A pattern with sufficient corroboration + age is
-- auto-promoted to `confirmed` (the DB-valid maturation state for patterns —
-- the engine code uses `matured` for *insights* but patterns use `confirmed`)
-- so the UI's confirmed filter is non-empty and downstream cron has rows to
-- act on. Coaches can still confirm / dismiss / address / resolve manually;
-- this only handles the "no coach action ever" default.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Drop 12 unused indexes (all idx_scan=0, size ≤ 32kB)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_golf_coach_philosophy_coach_id;
DROP INDEX IF EXISTS public.idx_golf_coachhelm_settings_team_id;
DROP INDEX IF EXISTS public.idx_golf_round_reviews_player;
DROP INDEX IF EXISTS public.idx_golf_round_reviews_status;
DROP INDEX IF EXISTS public.idx_golf_round_reviews_published_by;
DROP INDEX IF EXISTS public.idx_golf_round_reviews_published_created;
DROP INDEX IF EXISTS public.idx_golf_player_focus_areas_from_insight_id;
DROP INDEX IF EXISTS public.idx_coach_behavior_coach;
DROP INDEX IF EXISTS public.idx_coach_behavior_date;
DROP INDEX IF EXISTS public.idx_golf_insight_log_team;
DROP INDEX IF EXISTS public.idx_golf_insight_generation_log_player_created;
DROP INDEX IF EXISTS public.idx_golf_insight_player_feedback_player;

-- ---------------------------------------------------------------------------
-- golf_patterns_v2 auto-promote: detected → confirmed when corroborated
-- ---------------------------------------------------------------------------
-- Rule: if `occurrence_count >= 5` AND first_detected was >14 days ago
-- AND lifecycle is 'detected', promote to 'confirmed' (the DB-valid
-- corroborated state — see CHECK constraint:
-- 'detected'|'confirmed'|'addressed'|'resolved'|'dismissed'). Coaches can
-- still validate / dismiss / address / resolve from the UI — this only
-- handles the "no coach action ever" case so the engine has a steady
-- stream of confirmed patterns to consume.
UPDATE public.golf_patterns_v2
SET lifecycle_state = 'confirmed',
    updated_at = NOW()
WHERE lifecycle_state = 'detected'
  AND occurrence_count >= 5
  AND first_detected < NOW() - INTERVAL '14 days';

-- Ongoing auto-promote should land in the pattern miner code (next
-- `upsert` from src/lib/coachhelm/v2/mining/pattern-miner.ts) rather
-- than a DB trigger, since patterns get rewritten on every analysis.
-- This migration does the one-time backfill.
