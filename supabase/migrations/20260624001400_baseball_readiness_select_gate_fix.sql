-- ============================================================================
-- 20260624001400_baseball_readiness_select_gate_fix.sql
--
-- BUGFIX (V11 RLS) — restore the correct staff-read gate on the readiness parent.
--
-- The readiness check-in is the strength coach's PRIMARY surface (the performance
-- command center / readiness board). Per the V11 spec and the role taxonomy:
--
--   * strength_coach holds  can_view_readiness  (NON-sensitive performance data)
--                           but NOT  can_view_medical
--   * athletic_trainer holds can_view_medical   (sensitive wellness/medical)
--
-- (see src/lib/types/baseball-staff-roles.ts:235-249 and the capability-group
--  split in src/lib/baseball/capability-groups.ts — 'performance' vs 'medical').
--
-- Migration ...050 originally gated baseball_readiness_checkins SELECT for staff
-- on can_view_readiness (correct). Migration ...061 then DROPped and re-created
-- that SELECT policy gated on can_view_medical instead — so the strength coach
-- (who lacks can_view_medical) fails the RLS gate and the readiness board returns
-- EMPTY for the very role that owns it. The app layer was already corrected to
-- gate on can_view_readiness (performance/page.tsx:60-67) but the RLS layer was
-- left enforcing can_view_medical, leaving the two inconsistent.
--
-- It is also internally inconsistent with its OWN V11 child tables: the readiness
-- "extras" — baseball_soreness_maps, baseball_bodyweight_entries, and
-- baseball_availability_statuses (migration ...063 §9.9-9.11) — all gate staff
-- reads on can_view_readiness. So today a strength coach can read a player's
-- soreness map (which FK-references a check-in) but not the check-in row itself.
-- Migration ...063 even documents the intended gate in its header (lines 32-33):
-- "can_view_readiness gates staff reads of readiness, soreness, bodyweight, and
-- availability (NOT can_view_medical — the strength [coach])".
--
-- This forward migration re-creates ONLY the SELECT policy, restoring the ...050
-- intent and aligning the parent table with its V11 children. Writes are left
-- untouched: INSERT/UPDATE/DELETE remain strictly player-owned (a coach never
-- authors a player's check-in), so this widens NOTHING beyond authenticated staff
-- READS that already hold the performance-tier capability and may view the player.
-- It fails closed for everyone else (no cross-player or cross-team path).
--
-- Idempotent + guarded: DROP POLICY IF EXISTS + CREATE; wrapped in a to_regclass
-- existence check so it is a no-op on a schema where the table is absent. No
-- DROP TABLE/COLUMN, no rename, no destructive change. Re-runnable.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.baseball_readiness_checkins') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_readiness_checkins ENABLE ROW LEVEL SECURITY';

    -- Re-create the SELECT policy with the CORRECT performance-tier gate.
    -- (the owning player, OR staff WITH can_view_readiness who may view that
    --  player; no other path matches → other players & non-readiness staff
    --  read nothing).
    EXECUTE 'DROP POLICY IF EXISTS "baseball_readiness_checkins_select" ON public.baseball_readiness_checkins';
    EXECUTE $p$CREATE POLICY "baseball_readiness_checkins_select" ON public.baseball_readiness_checkins
      FOR SELECT TO authenticated
      USING (
        player_id = public.get_my_baseball_player_id()
        OR (
          public.has_baseball_staff_capability(team_id, 'can_view_readiness')
          AND public.can_view_baseball_player(team_id, player_id)
        )
      )$p$;
  END IF;
END $$;
