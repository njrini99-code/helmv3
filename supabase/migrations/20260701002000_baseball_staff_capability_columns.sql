-- ============================================================================
-- Migration: 20260701002000_baseball_staff_capability_columns.sql
-- NN-1 (docs/CLEANSLATE_JOB_LIST.md) — add the missing can_* capability
-- columns on baseball_team_coach_staff.
--
-- FINDING: public.has_baseball_staff_capability(team_id, capability)'s
-- RETURN CASE references 17 v_row.can_* / is_head_coach fields, but
-- baseball_team_coach_staff only has 11 of the corresponding boolean
-- columns. Reconciled live against pg_policies / information_schema /
-- pg_get_functiondef on 2026-07-01:
--
--   existing columns (11): can_invite_staff, can_manage_calendar,
--     can_manage_imports, can_manage_lifting, can_manage_practice,
--     can_manage_roster, can_manage_settings, can_manage_stats,
--     can_message_team, can_view_academics, can_view_medical
--
--   MISSING (6, added below): can_manage_lineups, can_view_readiness,
--     can_modify_availability, can_view_private_notes, can_message_players,
--     can_export_reports
--
-- Confirmed live that referencing any of the 6 missing columns errors
-- immediately (SQLSTATE 42703, "column ... does not exist") rather than
-- resolving false:
--
--   SELECT CASE 'can_manage_lineups'::text
--     WHEN 'can_manage_lineups' THEN t.can_manage_lineups
--     ELSE false
--   END FROM public.baseball_team_coach_staff t LIMIT 1;
--   -- ERROR: 42703: column t.can_manage_lineups does not exist
--
-- PL/pgSQL type-checks the whole `RETURN CASE ... END` expression as one
-- unit the first time that statement executes, so ANY call to
-- has_baseball_staff_capability() that reaches the CASE (an active,
-- non-head-coach staff row is found) risks hitting this the moment that
-- one RETURN statement is first planned. This is also a live, user-facing
-- bug today: src/components/baseball/staff/StaffSettingsClient.tsx already
-- renders toggles for all 6 of these capabilities (backed by
-- src/lib/baseball/capability-groups.ts), so any coach who tries to grant a
-- teammate "Manage lineups", "View readiness", "Modify availability",
-- "View private notes", "Message players", or "Export reports" today is
-- writing to a column that doesn't exist.
--
-- This migration is a prerequisite for
-- 20260701003000_baseball_lineups_rls_capability.sql (NN-2), which gates
-- baseball_team_lineups / baseball_lineup_positions on can_manage_lineups —
-- it MUST apply first (enforced by filename ordering; both ship in the same
-- PR).
--
-- ZIP NON-NEGOTIABLES honored:
--   * ADDITIVE — ADD COLUMN IF NOT EXISTS, NOT NULL DEFAULT false. No
--     destructive rename/drop of the 11 existing columns.
--   * Backfill mirrors the exact precedent set by can_manage_documents
--     (20260630180100_baseball_documents_capability.sql): true for
--     is_head_coach OR is_primary. This isn't cosmetic — verified live that
--     has_baseball_staff_capability() only short-circuits to true for
--     is_head_coach, NOT is_primary, so a primary-but-not-head coach needs
--     the concrete column value to actually pass the RLS check these new
--     columns will gate. Verified live: 5/5 current baseball_team_coach_staff
--     rows have is_primary = true (3/5 also is_head_coach), and none use the
--     `capabilities` jsonb bag — so this backfill preserves 100% of current
--     staff access, it grants nothing new to anyone who didn't already have
--     it via is_head_coach/is_primary.
--   * This file is WRITTEN, NOT APPLIED. No apply_migration call was made.
-- ============================================================================

ALTER TABLE public.baseball_team_coach_staff
  ADD COLUMN IF NOT EXISTS can_manage_lineups      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_readiness       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_modify_availability  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_private_notes   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_message_players      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_export_reports       boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.baseball_team_coach_staff.can_manage_lineups IS
  'Build and publish batting orders and lineups. Backs has_baseball_staff_capability(team_id, ''can_manage_lineups'').';
COMMENT ON COLUMN public.baseball_team_coach_staff.can_view_readiness IS
  'See player wellness and soreness summaries. Backs has_baseball_staff_capability(team_id, ''can_view_readiness'').';
COMMENT ON COLUMN public.baseball_team_coach_staff.can_modify_availability IS
  'Set player availability status and return-to-play. Backs has_baseball_staff_capability(team_id, ''can_modify_availability'').';
COMMENT ON COLUMN public.baseball_team_coach_staff.can_view_private_notes IS
  'Read staff-only private notes. Backs has_baseball_staff_capability(team_id, ''can_view_private_notes'').';
COMMENT ON COLUMN public.baseball_team_coach_staff.can_message_players IS
  'Send messages to players. Backs has_baseball_staff_capability(team_id, ''can_message_players''). can_message_team is a deprecated alias resolved at the app layer only (src/lib/baseball/capabilities.ts); not mirrored here.';
COMMENT ON COLUMN public.baseball_team_coach_staff.can_export_reports IS
  'Export performance and team reports. Backs has_baseball_staff_capability(team_id, ''can_export_reports'').';

-- Backfill: preserve current access exactly. Every existing full-authority
-- staff row (head coach or primary coach) gets all 6 new capabilities set,
-- matching how has_baseball_staff_capability()/the app-layer resolver treat
-- full authority for every other capability.
UPDATE public.baseball_team_coach_staff
SET can_manage_lineups = true,
    can_view_readiness = true,
    can_modify_availability = true,
    can_view_private_notes = true,
    can_message_players = true,
    can_export_reports = true
WHERE is_head_coach = true
   OR is_primary = true;
-- ============================================================================
