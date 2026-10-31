-- STATUS: WRITTEN, NOT APPLIED. Replay capture: production already has exactly
-- these privileges (verified read-only 2026-10-28). See HELD.md (row
-- 20261028140400) and docs/operations/2026-10-28-prod-drift-capture.md.
-- Risk: LOW on production (no change). On a replayed database it narrows
-- authenticated's UPDATE on golf_coach_insights to the seven columns
-- production allows.
--
-- Why: in production, authenticated has no table-wide UPDATE on
-- golf_coach_insights, only column UPDATE on status, acknowledged_at,
-- dismissed, dismissed_at, resolved_at, metadata and lifecycle_state. A
-- replay gets this wrong in one of two ways. The staging project, built
-- without the OBSOLETE files, has table-wide UPDATE for authenticated (read
-- 2026-10-28), so it accepts writes production refuses with 42501. A strict
-- replay that also runs 20260528011000_harden_coach_insights_update_grants.sql
-- (OBSOLETE in HELD.md) is left with only acknowledged_at and dismissed_at,
-- so dismissInsight fails there. This file ends both at production's seven
-- column grants.
--
-- ROLLBACK: none on production (it already has exactly these grants). On a
-- ROLLBACK: replayed database the earlier state was wrong either way; restore
-- ROLLBACK: it only to reproduce a bug.
--
-- VERIFY: select 1 where not has_table_privilege('authenticated',
-- VERIFY: 'public.golf_coach_insights', 'UPDATE');
-- VERIFY: select 1 where has_column_privilege('authenticated',
-- VERIFY: 'public.golf_coach_insights', 'lifecycle_state', 'UPDATE');
-- VERIFY: select 1 where has_column_privilege('authenticated',
-- VERIFY: 'public.golf_coach_insights', 'dismissed', 'UPDATE');

SET LOCAL lock_timeout = '5s';

REVOKE UPDATE ON TABLE public.golf_coach_insights FROM authenticated;

GRANT UPDATE (
    status,
    acknowledged_at,
    dismissed,
    dismissed_at,
    resolved_at,
    metadata,
    lifecycle_state
) ON TABLE public.golf_coach_insights TO authenticated;
