-- ============================================================================
-- Converge: create the three event-table source columns that exist in prod
-- but were never created by any migration in the chain.
--
-- Why: 20260708142000_baseball_source_trust_visibility_check.sql adds CHECK
-- constraints on baseball_pitch_events.source_trust_level and
-- baseball_plate_appearances.source_trust_level/source_visibility. Those
-- columns exist in prod (added out-of-band; 20260701013000's own comment
-- notes they were "left untouched"), so 142000 applied cleanly there — but a
-- FRESH replay of the chain (CI `supabase db reset`) fails with
-- `ERROR: column "source_trust_level" does not exist (42703)` because no
-- migration ever creates them. This file heals that drift.
--
-- Definitions mirror prod exactly (information_schema.columns, 2026-07-09):
-- all three are `text`, nullable, no default. Semantics match the same
-- columns on baseball_player_stats (20260624000460): trust tier / visibility
-- stamped from the registered import source at commit; NULL = legacy/manual
-- rows (read paths treat NULL as 'unreviewed' / 'staff_only').
--
-- Timestamped 141900 so it sorts BEFORE 142000 in a fresh replay. Idempotent
-- (ADD COLUMN IF NOT EXISTS) — a no-op against prod, where the columns
-- already exist. Value validation is intentionally left to 142000's CHECK
-- constraints; no duplicate CHECKs here.
-- ============================================================================

ALTER TABLE public.baseball_pitch_events
  ADD COLUMN IF NOT EXISTS source_trust_level text;

ALTER TABLE public.baseball_plate_appearances
  ADD COLUMN IF NOT EXISTS source_trust_level text;

ALTER TABLE public.baseball_plate_appearances
  ADD COLUMN IF NOT EXISTS source_visibility text;

COMMENT ON COLUMN public.baseball_pitch_events.source_trust_level IS
  'Trust tier stamped from the registered import source at commit. NULL = legacy/manual row (treated as unreviewed by read paths).';
COMMENT ON COLUMN public.baseball_plate_appearances.source_trust_level IS
  'Trust tier stamped from the registered import source at commit. NULL = legacy/manual row (treated as unreviewed by read paths).';
COMMENT ON COLUMN public.baseball_plate_appearances.source_visibility IS
  'Default visibility stamped from the registered import source at commit. NULL = legacy/manual row (treated as staff_only).';
