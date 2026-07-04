'use server';

// =============================================================================
// src/app/baseball/actions/lift-onboarding.ts
//
// Server action(s) for the Lift Lab first-run onboarding tour (Task C —
// front-door entry + onboarding). SELF-ONLY: the caller can only mark their
// OWN Lift Lab athlete row onboarded.
//
// markLiftOnboardingComplete is a best-effort durable write. The
// onboarded_at column + the helm_lifting_mark_athlete_onboarded() RPC it
// calls both ship in a db_gated migration (supabase/migrations/
// 20260702120000_baseball_helm_lifting_athletes_onboarded_at.sql, NOT
// applied) — until that migration lands, the RPC call resolves to a
// PostgREST "function does not exist" error rather than throwing, and this
// action degrades to { success: true, persisted: false } instead of
// surfacing a failure. The client (LiftOnboardingGate) always writes
// localStorage regardless of `persisted`, so the tour is never re-shown
// either way — `persisted` only signals whether the "seen the tour" state
// is durable across devices yet.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { resolveBaseballLiftingOrg, resolveMyBaseballAthleteId } from '@/lib/lifting/resolve-baseball-context';

// helm_lifting_mark_athlete_onboarded is a new SECURITY DEFINER RPC (see the
// db_gated migration referenced above) that hasn't shipped to the generated
// Database types yet — cast through SupabaseAny until the migration is
// applied and types are regenerated, matching the existing untyped-RPC
// pattern (e.g. src/app/baseball/actions/recruiting-philosophy.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export interface MarkLiftOnboardingCompleteResult {
  success: boolean;
  /**
   * True once the durable onboarded_at write actually lands (requires the
   * db_gated migration above to be applied first). False means localStorage
   * is carrying this athlete's "seen the tour" state instead — an expected,
   * honest degrade, not an error.
   */
  persisted: boolean;
}

/**
 * SELF-ONLY. Best-effort marks the caller's own Lift Lab athlete row as
 * onboarded. Never throws for a missing column/RPC — degrades to
 * { persisted: false } so the caller can rely on localStorage without
 * surfacing an error to the player.
 *
 * Demo sessions: left at the wrapper's fail-closed default (demoSafe is NOT
 * set, so it stays false) — the shared Baseball demo coach session is a
 * single account every visitor uses at once, and persisting onboarded_at
 * against it would mean the NEXT demo visitor lands on the Lift home never
 * seeing the tour, which is exactly the kind of cross-visitor state bleed
 * Issue #392's guard exists to prevent. The client-side gate still dismisses
 * the tour locally (localStorage) for a demo visitor even when this call
 * rejects with BaseballDemoReadOnlyError.
 */
export const markLiftOnboardingComplete = withBaseballAction(
  'markLiftOnboardingComplete',
  { featureArea: 'baseball-lift-onboarding' },
  async (ctx): Promise<MarkLiftOnboardingCompleteResult> => {
    const supabase = await createClient();

    const liftCtx = await resolveBaseballLiftingOrg(ctx.activeTeamId);
    if (!liftCtx) return { success: true, persisted: false };

    const athleteId = await resolveMyBaseballAthleteId(liftCtx.organizationId);
    if (!athleteId) return { success: true, persisted: false };

    const { data, error } = await (supabase as SupabaseAny).rpc('helm_lifting_mark_athlete_onboarded', {
      p_athlete_id: athleteId,
    });

    return { success: true, persisted: !error && Boolean(data) };
  },
);
