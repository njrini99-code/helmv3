-- Issue #448: players cannot complete their development-plan goals.
--
-- public.baseball_developmental_plans (20260527000000_prod_public_baseline.sql)
-- already grants the `authenticated` role table-level UPDATE, and already has
-- a SELECT policy that lets the owning player read their own plan. But the
-- only UPDATE policy defined is "baseball_dev_plans_update_coach" (scoped to
-- coach_id ownership) — there is no row-level policy allowing the owning
-- player to update their own plan. RLS defaults to deny, so even a
-- correctly-authored, ownership-checked server action editing `goals` for a
-- player's own plan is silently blocked at the database layer.
--
-- This adds a symmetric, additive UPDATE policy scoped to player ownership
-- (mirrors the shape of "baseball_dev_plans_update_coach"), so the player-side
-- "complete/uncomplete goal" actions in src/app/baseball/actions/dev-plans.ts
-- can actually persist. Non-destructive: no existing policy, grant, or data
-- is touched.

DO $$
BEGIN
  IF to_regclass('public.baseball_developmental_plans') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "baseball_dev_plans_update_player" ON public.baseball_developmental_plans';
    EXECUTE $p$CREATE POLICY "baseball_dev_plans_update_player" ON public.baseball_developmental_plans
      FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.baseball_players
          WHERE baseball_players.id = baseball_developmental_plans.player_id
            AND baseball_players.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.baseball_players
          WHERE baseball_players.id = baseball_developmental_plans.player_id
            AND baseball_players.user_id = auth.uid()
        )
      )$p$;
  END IF;
END $$;
